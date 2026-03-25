// Kiro API 调用核心模块
import { v4 as uuidv4 } from 'uuid'
import { getKiroUserAgent, getKiroAmzUserAgent } from '../fingerprint'
import { getMachineFingerprint, parseBracketToolCalls, deduplicateToolCalls } from './gatewayUtils'
import { modelResolver } from './modelResolver'
import type {
  KiroPayload,
  KiroUserInputMessage,
  KiroHistoryMessage,
  KiroToolWrapper,
  KiroToolResult,
  KiroImage,
  KiroToolUse,
  ProxyAccount
} from './types'
import { proxyLogger } from './logger'
import { saveToolTruncation, saveContentTruncation } from './truncationState'

// Kiro API 端点配置
const KIRO_ENDPOINTS = [
  {
    url: 'https://codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse',
    origin: 'AI_EDITOR',
    amzTarget: 'AmazonCodeWhispererStreamingService.GenerateAssistantResponse',
    name: 'CodeWhisperer'
  },
  {
    url: 'https://q.us-east-1.amazonaws.com/generateAssistantResponse',
    origin: 'CLI',
    amzTarget: 'AmazonQDeveloperStreamingService.SendMessage',
    name: 'AmazonQ'
  }
]

// User-Agent 配置 - IDC 认证方式 (Amazon Q CLI 样式)
const KIRO_CLI_USER_AGENT = 'aws-sdk-rust/1.3.9 os/macos lang/rust/1.87.0'
const KIRO_CLI_AMZ_USER_AGENT = 'aws-sdk-rust/1.3.9 ua/2.1 api/ssooidc/1.88.0 os/macos lang/rust/1.87.0 m/E app/AmazonQ-For-CLI'

// Agent 模式
const AGENT_MODE_SPEC = 'spec' // IDE 模式
const AGENT_MODE_VIBE = 'vibe' // CLI 模式

// Agentic 模式系统提示 - 防止大文件写入超时
const AGENTIC_SYSTEM_PROMPT = `# CRITICAL: CHUNKED WRITE PROTOCOL (MANDATORY)

You MUST follow these rules for ALL file operations. Violation causes server timeouts and task failure.

## ABSOLUTE LIMITS
- **MAXIMUM 350 LINES** per single write/edit operation - NO EXCEPTIONS
- **RECOMMENDED 300 LINES** or less for optimal performance
- **NEVER** write entire files in one operation if >300 lines

## MANDATORY CHUNKED WRITE STRATEGY

### For NEW FILES (>300 lines total):
1. FIRST: Write initial chunk (first 250-300 lines) using write_to_file/fsWrite
2. THEN: Append remaining content in 250-300 line chunks using file append operations
3. REPEAT: Continue appending until complete

### For EDITING EXISTING FILES:
1. Use surgical edits (apply_diff/targeted edits) - change ONLY what's needed
2. NEVER rewrite entire files - use incremental modifications
3. Split large refactors into multiple small, focused edits

REMEMBER: When in doubt, write LESS per operation. Multiple small operations > one large operation.`

// Thinking 模式标签
export const THINKING_MODE_PROMPT = `<thinking_mode>enabled</thinking_mode>
<max_thinking_length>200000</max_thinking_length>
<thinking_instruction>Think in English for better reasoning quality.

Your thinking process should be thorough and systematic:
- First, make sure you fully understand what is being asked
- Consider multiple approaches or perspectives when relevant
- Think about edge cases, potential issues, and what could go wrong
- Challenge your initial assumptions
- Verify your reasoning before reaching a conclusion

After completing your thinking, respond in the same language the user is using in their messages, or in the language specified in their settings if available.

Take the time you need. Quality of thought matters more than speed.</thinking_instruction>`

// GPT alias → Claude model (kept for backward compatibility)
const GPT_ALIASES: Record<string, string> = {
  'gpt-4': 'claude-sonnet-4.5',
  'gpt-4o': 'claude-sonnet-4.5',
  'gpt-4-turbo': 'claude-sonnet-4.5',
  'gpt-3.5-turbo': 'claude-sonnet-4.5',
}

export function mapModelId(model: string): string {
  // 1. GPT aliases
  const lower = model.toLowerCase()
  for (const [key, value] of Object.entries(GPT_ALIASES)) {
    if (lower.includes(key)) return value
  }

  // 2. Resolve via modelResolver (aliases → normalize → hidden models → passthrough)
  const resolution = modelResolver.resolve(model)
  return resolution.internalId
}

// 检测是否为 Agentic 模式请求
export function isAgenticRequest(model: string, tools?: unknown[]): boolean {
  const lower = model.toLowerCase()
  // 模型名称包含 -agentic 或有工具调用
  return lower.includes('-agentic') || lower.includes('agentic') || Boolean(tools && tools.length > 0)
}

// 检测是否启用 Thinking 模式
export function isThinkingEnabled(headers?: Record<string, string>): boolean {
  if (!headers) return false
  // 检查 Anthropic-Beta 头是否包含 thinking
  const betaHeader = headers['anthropic-beta'] || headers['Anthropic-Beta'] || ''
  return betaHeader.toLowerCase().includes('thinking')
}

// 注入系统提示
export function injectSystemPrompts(
  content: string,
  isAgentic: boolean,
  thinkingEnabled: boolean
): string {
  let result = content
  
  // 注入时间戳
  const timestamp = new Date().toISOString()
  const timestampPrompt = `Current time: ${timestamp}`
  
  // 注入 Thinking 模式（必须在最前面）
  if (thinkingEnabled) {
    result = THINKING_MODE_PROMPT + '\n\n' + result
  }
  
  // 注入 Agentic 模式提示
  if (isAgentic) {
    result = result + '\n\n' + AGENTIC_SYSTEM_PROMPT
  }
  
  // 注入时间戳
  result = timestampPrompt + '\n\n' + result
  
  return result
}

// ============= 消息清理逻辑（参考 Kiro 官方实现）=============

// 占位消息
const HELLO_MESSAGE: KiroHistoryMessage = {
  userInputMessage: { content: 'Hello', modelId: 'auto', origin: 'AI_EDITOR' }
}

const CONTINUE_MESSAGE: KiroHistoryMessage = {
  userInputMessage: { content: 'Continue', modelId: 'auto', origin: 'AI_EDITOR' }
}

const UNDERSTOOD_MESSAGE: KiroHistoryMessage = {
  assistantResponseMessage: { content: 'understood' }
}

// 创建失败的工具结果消息
function createFailedToolUseMessage(toolUseIds: string[]): KiroHistoryMessage {
  return {
    userInputMessage: {
      content: '',
      modelId: 'auto',
      origin: 'AI_EDITOR',
      userInputMessageContext: {
        toolResults: toolUseIds.map(toolUseId => ({
          toolUseId,
          content: [{ text: 'Tool execution failed' }],
          status: 'error' as const
        }))
      }
    }
  }
}

// 类型检查函数
function isUserInputMessage(message: KiroHistoryMessage): boolean {
  return message != null && 'userInputMessage' in message && message.userInputMessage != null
}

function isAssistantResponseMessage(message: KiroHistoryMessage): boolean {
  return message != null && 'assistantResponseMessage' in message && message.assistantResponseMessage != null
}

function hasToolResults(message: KiroHistoryMessage): boolean {
  return !!(message.userInputMessage?.userInputMessageContext?.toolResults?.length)
}

function hasToolUses(message: KiroHistoryMessage): boolean {
  return !!(message.assistantResponseMessage?.toolUses?.length)
}

function hasMatchingToolResults(
  toolUses: KiroToolUse[] | undefined,
  toolResults: KiroToolResult[] | undefined
): boolean {
  if (!toolUses || !toolUses.length) return true
  if (!toolResults || !toolResults.length) return false
  
  const allToolUsesHaveResults = toolUses.every(
    toolUse => toolResults.some(result => result.toolUseId === toolUse.toolUseId)
  )
  const allToolResultsHaveUses = toolResults.every(
    result => toolUses.some(toolUse => result.toolUseId === toolUse.toolUseId)
  )
  return allToolUsesHaveResults && allToolResultsHaveUses
}

// 确保以 user 消息开始
function ensureStartsWithUserMessage(messages: KiroHistoryMessage[]): KiroHistoryMessage[] {
  if (messages.length === 0 || isUserInputMessage(messages[0])) {
    return messages
  }
  return [HELLO_MESSAGE, ...messages]
}

// 确保以 user 消息结束
function ensureEndsWithUserMessage(messages: KiroHistoryMessage[]): KiroHistoryMessage[] {
  if (messages.length === 0) return [HELLO_MESSAGE]
  if (isUserInputMessage(messages[messages.length - 1])) return messages
  return [...messages, CONTINUE_MESSAGE]
}

// 确保消息交替
function ensureAlternatingMessages(messages: KiroHistoryMessage[]): KiroHistoryMessage[] {
  if (messages.length <= 1) return messages
  
  const result: KiroHistoryMessage[] = [messages[0]]
  for (let i = 1; i < messages.length; i++) {
    const prevMessage = result[result.length - 1]
    const currentMessage = messages[i]
    
    if (isUserInputMessage(prevMessage) && isUserInputMessage(currentMessage)) {
      result.push(UNDERSTOOD_MESSAGE)
    } else if (isAssistantResponseMessage(prevMessage) && isAssistantResponseMessage(currentMessage)) {
      result.push(CONTINUE_MESSAGE)
    }
    result.push(currentMessage)
  }
  return result
}

// 确保工具调用有对应结果
function ensureValidToolUsesAndResults(messages: KiroHistoryMessage[]): KiroHistoryMessage[] {
  const result: KiroHistoryMessage[] = []
  
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]
    result.push(message)
    
    if (isAssistantResponseMessage(message) && hasToolUses(message)) {
      const nextMessage = i + 1 < messages.length ? messages[i + 1] : null
      
      if (!nextMessage || !isUserInputMessage(nextMessage) || !hasToolResults(nextMessage)) {
        // 没有对应的工具结果，添加失败消息
        const toolUses = message.assistantResponseMessage?.toolUses ?? []
        const toolUseIds = toolUses.map((tu, idx) => tu.toolUseId ?? `toolUse_${idx + 1}`)
        result.push(createFailedToolUseMessage(toolUseIds))
      } else if (!hasMatchingToolResults(
        message.assistantResponseMessage?.toolUses,
        nextMessage.userInputMessage?.userInputMessageContext?.toolResults
      )) {
        // 工具结果不匹配，添加失败消息
        const toolUses = message.assistantResponseMessage?.toolUses ?? []
        const toolUseIds = toolUses.map((tu, idx) => tu.toolUseId ?? `toolUse_${idx + 1}`)
        result.push(createFailedToolUseMessage(toolUseIds))
      }
    }
  }
  return result
}

// 移除空的 user 消息
function removeEmptyUserMessages(messages: KiroHistoryMessage[]): KiroHistoryMessage[] {
  if (messages.length <= 1) return messages
  
  const firstUserMessageIndex = messages.findIndex(isUserInputMessage)
  return messages.filter((message, index) => {
    if (isAssistantResponseMessage(message)) return true
    if (isUserInputMessage(message) && index === firstUserMessageIndex) return true
    if (isUserInputMessage(message)) {
      const hasContent = message.userInputMessage?.content?.trim() !== ''
      return hasContent || hasToolResults(message)
    }
    return true
  })
}

// 清理会话消息（参考 Kiro 官方实现）
function sanitizeConversation(messages: KiroHistoryMessage[]): KiroHistoryMessage[] {
  let sanitized = [...messages]
  sanitized = ensureStartsWithUserMessage(sanitized)
  sanitized = removeEmptyUserMessages(sanitized)
  sanitized = ensureValidToolUsesAndResults(sanitized)
  sanitized = ensureAlternatingMessages(sanitized)
  sanitized = ensureEndsWithUserMessage(sanitized)
  return sanitized
}

// ============= 构建 Kiro API 请求负载（参考 Kiro 官方实现）=============

export function buildKiroPayload(
  content: string,
  modelId: string,
  origin: string,
  history: KiroHistoryMessage[] = [],
  tools: KiroToolWrapper[] = [],
  toolResults: KiroToolResult[] = [],
  images: KiroImage[] = [],
  profileArn?: string,
  inferenceConfig?: { maxTokens?: number; temperature?: number; topP?: number }
): KiroPayload {
  // 构建当前消息
  const finalContent = content.trim() || (toolResults.length > 0 ? '' : 'Continue')
  
  const currentUserInputMessage: KiroUserInputMessage = {
    content: finalContent,
    modelId,
    origin
  }

  if (images.length > 0) {
    currentUserInputMessage.images = images
  }

  // 构建 userInputMessageContext（包含 tools 和 toolResults）
  // 注意：tools 只放在最后一条消息（currentMessage）的 userInputMessageContext 中
  if (tools.length > 0 || toolResults.length > 0) {
    currentUserInputMessage.userInputMessageContext = {}
    if (tools.length > 0) {
      currentUserInputMessage.userInputMessageContext.tools = tools
    }
    if (toolResults.length > 0) {
      currentUserInputMessage.userInputMessageContext.toolResults = toolResults
    }
  }

  // 构建 currentMessage
  const currentMessage: KiroHistoryMessage = {
    userInputMessage: currentUserInputMessage
  }


  // 清理并准备所有消息（history + currentMessage），并限制 payload 大小
  let allMessages = [...history, currentMessage]
  let sanitizedMessages = sanitizeConversation(allMessages)
  let sanitizedHistory = sanitizedMessages.slice(0, -1)
  let finalCurrentMessage = sanitizedMessages.at(-1)!

  // 确保 currentMessage 是 user 消息（sanitizeConversation 保证以 user 消息结束）
  if (!finalCurrentMessage.userInputMessage) {
    finalCurrentMessage = {
      userInputMessage: {
        content: finalContent || 'Continue',
        modelId,
        origin
      }
    }
  }
  if (finalCurrentMessage.userInputMessage) {
    finalCurrentMessage.userInputMessage.modelId = modelId
    finalCurrentMessage.userInputMessage.origin = origin
  }
  if (tools.length > 0) {
    finalCurrentMessage.userInputMessage!.userInputMessageContext = {
      ...finalCurrentMessage.userInputMessage!.userInputMessageContext,
      tools
    }
  }

  // 限制 payload 大小（最大 1MB）
  const MAX_PAYLOAD_SIZE = 1048576 // 1MB
  let payload: KiroPayload = {
    conversationState: {
      chatTriggerType: 'MANUAL',
      conversationId: uuidv4(),
      currentMessage: {
        userInputMessage: finalCurrentMessage.userInputMessage!
      },
      history: sanitizedHistory.length > 0 ? sanitizedHistory : undefined
    }
  }

  // 如果超出最大 payload 大小，循环移除最早的 history 直到满足要求
  let payloadStr = JSON.stringify(payload)
  while (payloadStr.length > MAX_PAYLOAD_SIZE && sanitizedHistory.length > 0) {
    sanitizedHistory.shift()
    payload.conversationState.history = sanitizedHistory.length > 0 ? sanitizedHistory : undefined
    payloadStr = JSON.stringify(payload)
  }
  if (payloadStr.length > MAX_PAYLOAD_SIZE) {
    // 仍然超出，清空 history 并只保留当前消息
    payload.conversationState.history = undefined
    payloadStr = JSON.stringify(payload)
  }
  if (payloadStr.length > MAX_PAYLOAD_SIZE) {
    // 仍然超出，截断 content
    if (payload.conversationState.currentMessage.userInputMessage?.content) {
      payload.conversationState.currentMessage.userInputMessage.content = payload.conversationState.currentMessage.userInputMessage.content.slice(0, 1000)
      payloadStr = JSON.stringify(payload)
    }
  }

  if (profileArn) {
    payload.profileArn = profileArn
  }

  if (inferenceConfig && (inferenceConfig.maxTokens || inferenceConfig.temperature !== undefined || inferenceConfig.topP !== undefined)) {
    payload.inferenceConfig = {}
    if (inferenceConfig.maxTokens) {
      payload.inferenceConfig.maxTokens = inferenceConfig.maxTokens
    }
    if (inferenceConfig.temperature !== undefined) {
      payload.inferenceConfig.temperature = inferenceConfig.temperature
    }
    if (inferenceConfig.topP !== undefined) {
      payload.inferenceConfig.topP = inferenceConfig.topP
    }
  }

  // 调试日志
  console.log(`[KiroPayload] Built payload (native history mode):`, {
    contentLength: finalContent.length,
    originalHistoryLength: history.length,
    sanitizedHistoryLength: sanitizedHistory.length,
    toolsCount: tools.length,
    toolResultsCount: toolResults.length,
    hasProfileArn: !!profileArn,
    finalPayloadSize: payloadStr.length
  })

  return payload
}

// 获取有效的指纹（账户指纹或机器指纹）
function getEffectiveFingerprint(accountFingerprint?: string): string {
  return accountFingerprint || getMachineFingerprint()
}

// 获取认证方式对应的请求头
function getAuthHeaders(account: ProxyAccount, endpoint: typeof KIRO_ENDPOINTS[0]): Record<string, string> {
  const isIDC = account.authMethod === 'idc'
  const effectiveFingerprint = getEffectiveFingerprint(account.fingerprint)
  
  return {
    'Content-Type': 'application/json',
    'Accept': '*/*',
    'X-Amz-Target': endpoint.amzTarget,
    'User-Agent': isIDC ? KIRO_CLI_USER_AGENT : getKiroUserAgent(effectiveFingerprint),
    'X-Amz-User-Agent': isIDC ? KIRO_CLI_AMZ_USER_AGENT : getKiroAmzUserAgent(effectiveFingerprint),
    'x-amzn-kiro-agent-mode': isIDC ? AGENT_MODE_VIBE : AGENT_MODE_SPEC,
    'x-amzn-codewhisperer-optout': 'true',
    'Amz-Sdk-Request': 'attempt=1; max=3',
    'Amz-Sdk-Invocation-Id': uuidv4(),
    'Authorization': `Bearer ${account.accessToken}`
  }
}

// 获取排序后的端点列表（根据首选端点配置）
function getSortedEndpoints(preferredEndpoint?: 'codewhisperer' | 'amazonq'): typeof KIRO_ENDPOINTS {
  if (!preferredEndpoint) return [...KIRO_ENDPOINTS]
  
  const sorted = [...KIRO_ENDPOINTS]
  const preferredName = preferredEndpoint === 'codewhisperer' ? 'CodeWhisperer' : 'AmazonQ'
  
  sorted.sort((a, b) => {
    if (a.name === preferredName) return -1
    if (b.name === preferredName) return 1
    return 0
  })
  
  return sorted
}

// First-token timeout: if model doesn't start responding within this time, retry
const FIRST_TOKEN_TIMEOUT_MS = 15000 // 15s (matches kiro-gateway default)
const FIRST_TOKEN_MAX_RETRIES = 3

/**
 * Enhances Kiro API error JSON with user-friendly messages.
 * Ported from kiro-gateway/kiro/kiro_errors.py
 */
function enhanceKiroError(errorJson: Record<string, unknown>, status: number): string {
  const original = (errorJson.message as string) || 'Unknown error'
  const reason = (errorJson.reason as string) || 'UNKNOWN'

  if (reason === 'CONTENT_LENGTH_EXCEEDS_THRESHOLD') {
    return 'Model context limit reached. Conversation size exceeds model capacity.'
  }
  if (reason === 'MONTHLY_REQUEST_COUNT') {
    return 'Monthly request limit exceeded. Account has reached its monthly quota.'
  }
  if (status === 429) {
    return `Rate limit exceeded: ${original}`
  }
  return reason !== 'UNKNOWN' ? `${original} (reason: ${reason})` : `API error ${status}: ${original}`
}

// 调用 Kiro API（流式）
export async function callKiroApiStream(
  account: ProxyAccount,
  payload: KiroPayload,
  onChunk: (text: string, toolUse?: KiroToolUse, isThinking?: boolean) => void,
  onComplete: (usage: { inputTokens: number; outputTokens: number; credits: number; cacheReadTokens?: number; cacheWriteTokens?: number; reasoningTokens?: number }) => void,
  onError: (error: Error) => void,
  signal?: AbortSignal,
  preferredEndpoint?: 'codewhisperer' | 'amazonq',
  maxInputTokens: number = 200000
): Promise<void> {
  const endpoints = getSortedEndpoints(preferredEndpoint)
  let lastError: Error | null = null

  // Build a flat list of attempts: each endpoint repeated up to FIRST_TOKEN_MAX_RETRIES times
  // We iterate until success, auth error, or all attempts exhausted
  const attempts: typeof endpoints = []
  for (let i = 0; i < FIRST_TOKEN_MAX_RETRIES; i++) {
    attempts.push(...endpoints)
  }

  let retryCount = 0

  for (const endpoint of attempts) {
    if (signal?.aborted) break

    try {
      if (payload.conversationState.currentMessage.userInputMessage) {
        payload.conversationState.currentMessage.userInputMessage.origin = endpoint.origin
      }

      const payloadStr = JSON.stringify(payload)
      console.log(`[KiroAPI] Request to ${endpoint.name}:`)
      console.log(`[KiroAPI]   - Content length: ${payload.conversationState.currentMessage.userInputMessage?.content?.length || 0}`)
      console.log(`[KiroAPI]   - Tools count: ${payload.conversationState.currentMessage.userInputMessage?.userInputMessageContext?.tools?.length || 0}`)
      console.log(`[KiroAPI]   - Payload size: ${payloadStr.length} bytes`)

      const headers = getAuthHeaders(account, endpoint)

      // Total request timeout (30s)
      const totalController = new AbortController()
      const totalTimeoutId = setTimeout(() => totalController.abort(), 30000)

      // First-token timeout (15s) — aborts if model doesn't start responding
      const firstTokenController = new AbortController()
      let firstTokenReceived = false
      const firstTokenTimeoutId = setTimeout(() => {
        if (!firstTokenReceived) {
          console.log(`[KiroAPI] First-token timeout on ${endpoint.name}, retrying...`)
          firstTokenController.abort()
        }
      }, FIRST_TOKEN_TIMEOUT_MS)

      const signals = [totalController.signal, firstTokenController.signal]
      if (signal) signals.push(signal)
      const combinedSignal = AbortSignal.any(signals)

      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers,
        body: payloadStr,
        signal: combinedSignal
      })

      clearTimeout(totalTimeoutId)

      // 429 means too many requests (transient high volume rate limit)
      if (response.status === 429) {
        clearTimeout(firstTokenTimeoutId)
        // Proper exponential backoff for rate limiting (1s, 2s, 4s...)
        const delay = Math.min(1000 * Math.pow(2, retryCount), 8000)
        console.log(`[KiroAPI] Endpoint ${endpoint.name} high volume rate limit (429), waiting ${delay}ms...`)
        await new Promise(r => setTimeout(r, delay))
        lastError = new Error(`Rate limit exceeded on ${endpoint.name} (429)`)
        retryCount++
        continue
      }

      if (response.status >= 500) {
        clearTimeout(firstTokenTimeoutId)
        const body = await response.text()
        const delay = Math.min(1000 * Math.pow(2, retryCount), 8000)
        console.log(`[KiroAPI] Server error ${response.status} on ${endpoint.name}, waiting ${delay}ms...`)
        await new Promise(r => setTimeout(r, delay))
        lastError = new Error(`Server error ${response.status}: ${body.substring(0, 200)}`)
        retryCount++
        continue
      }

      if (response.status === 401 || response.status === 403) {
        clearTimeout(firstTokenTimeoutId)
        const body = await response.text()
        throw new Error(`Auth error ${response.status}: ${body}`)
      }

      if (!response.ok) {
        clearTimeout(firstTokenTimeoutId)
        const body = await response.text()
        let errorMsg = `API error ${response.status}: ${body}`
        try {
          const errJson = JSON.parse(body)
          errorMsg = enhanceKiroError(errJson, response.status)
        } catch { /* not JSON, use raw body */ }
        throw new Error(errorMsg)
      }

      // Wrap onChunk to detect first token and clear the first-token timer
      const wrappedOnChunk = (text: string, toolUse?: KiroToolUse, isThinking?: boolean) => {
        if (!firstTokenReceived) {
          firstTokenReceived = true
          clearTimeout(firstTokenTimeoutId)
        }
        onChunk(text, toolUse, isThinking)
      }

      const inputChars = payloadStr.length
      await parseEventStream(response.body!, wrappedOnChunk, onComplete, onError, inputChars, maxInputTokens)
      clearTimeout(firstTokenTimeoutId)
      return
    } catch (error) {
      lastError = error as Error
      console.error(`[KiroAPI] Endpoint ${endpoint.name} failed:`, error)

      if ((error as Error).name === 'AbortError') {
        console.log(`[KiroAPI] Endpoint ${endpoint.name} timed out, trying next...`)
        lastError = new Error(`Request timeout on ${endpoint.name}`)
        retryCount++
        continue
      }

      // If it's a server error (5xx) or Rate Limit (429), we want to retry it
      const errMsg = (error as Error).message || ''
      if (errMsg.includes('Server error') || errMsg.includes('Rate limit exceeded')) {
        continue
      }

      // True monthly connection quota exhaustion (Hard Fail - not transient)
      if (errMsg.includes('Monthly request limit exceeded') || errMsg.includes('reached its monthly quota')) {
         console.log(`[KiroAPI] Account truly empty. Aborting retries and fast-switching...`)
         throw new Error(`Quota exhausted: ` + errMsg)
      }

      // Must abort the retry loop and throw the error to proxyServer.ts for other fatal issues (Auth, 400 Bad Request, context length limit)
      throw error
    }
  }

  if (lastError) {
    onError(lastError)
  }
}

// 从 headers 中提取 event type
function extractEventType(headers: Uint8Array): string {
  let offset = 0
  while (offset < headers.length) {
    if (offset >= headers.length) break
    const nameLen = headers[offset]
    offset++
    if (offset + nameLen > headers.length) break
    const name = new TextDecoder().decode(headers.slice(offset, offset + nameLen))
    offset += nameLen
    if (offset >= headers.length) break
    const valueType = headers[offset]
    offset++
    
    if (valueType === 7) { // String type
      if (offset + 2 > headers.length) break
      const valueLen = (headers[offset] << 8) | headers[offset + 1]
      offset += 2
      if (offset + valueLen > headers.length) break
      const value = new TextDecoder().decode(headers.slice(offset, offset + valueLen))
      offset += valueLen
      if (name === ':event-type') {
        return value
      }
      continue
    }
    
    // Skip other value types
    const skipSizes: Record<number, number> = { 0: 0, 1: 0, 2: 1, 3: 2, 4: 4, 5: 8, 8: 8, 9: 16 }
    if (valueType === 6) {
      if (offset + 2 > headers.length) break
      const len = (headers[offset] << 8) | headers[offset + 1]
      offset += 2 + len
    } else if (skipSizes[valueType] !== undefined) {
      offset += skipSizes[valueType]
    } else {
      break
    }
  }
  return ''
}

// Tool Use 状态跟踪
interface ToolUseState {
  toolUseId: string
  name: string
  inputBuffer: string
}

const MAX_TOOL_INPUT_BUFFER_CHARS = 2 * 1024 * 1024

function finalizeToolUseState(
  state: ToolUseState,
  onChunk: (text: string, toolUse?: KiroToolUse, isThinking?: boolean) => void
): void {
  let finalInput: Record<string, unknown> = {}
  let parseError = false

  try {
    if (state.inputBuffer) {
      proxyLogger.debug('Kiro', 'Tool input buffer: ' + state.inputBuffer.substring(0, 200))
      finalInput = JSON.parse(state.inputBuffer)
      proxyLogger.debug('Kiro', 'Parsed tool input: ' + JSON.stringify(finalInput).substring(0, 200))
    }
  } catch (e) {
    parseError = true
    console.error('[Kiro] Failed to parse tool input:', e, 'Buffer:', state.inputBuffer?.substring(0, 100))
    finalInput = {
      _error: 'Tool input truncated or malformed in Kiro stream',
      _partialInput: state.inputBuffer?.substring(0, 500) || ''
    }
    // Save truncation info for recovery on next request
    saveToolTruncation(state.toolUseId, state.name, {
      sizeBytes: state.inputBuffer?.length ?? 0,
      reason: String(e)
    })
  }

  onChunk('', {
    toolUseId: state.toolUseId,
    name: state.name,
    input: finalInput
  })

  if (parseError) {
    onChunk(`\n\n⚠️ Tool "${state.name}" input was truncated or malformed in Kiro stream.`)
  }
}

// 解析 AWS Event Stream 二进制格式
async function parseEventStream(
  body: ReadableStream<Uint8Array>,
  onChunk: (text: string, toolUse?: KiroToolUse, isThinking?: boolean) => void,
  onComplete: (usage: { inputTokens: number; outputTokens: number; credits: number; cacheReadTokens?: number; cacheWriteTokens?: number; reasoningTokens?: number }) => void,
  onError: (error: Error) => void,
  inputChars: number = 0,
  maxInputTokens: number = 200000  // Model's max input tokens for contextUsage calculation
): Promise<void> {
  const reader = body.getReader()
  let buffer = new Uint8Array(0)
  let usage = { 
    inputTokens: 0, 
    outputTokens: 0, 
    credits: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0
  }
  
  // 累积输出文本长度，用于估算 tokens
  let totalOutputChars = 0
  let accumulatedContent = ''  // For content truncation detection
  let receivedCompletionSignal = false  // True if usage/metering event received
  
  // Estimate input tokens from payload size using Claude correction factor (1.15x)
  if (inputChars > 0) {
    usage.inputTokens = Math.max(1, Math.round((inputChars / 4) * 1.15))
  }
  
  // Tool use 状态跟踪 - 按 toolUseId 处理，避免片段流/重复 stop 导致逻辑异常
  const toolUseStates = new Map<string, ToolUseState>()
  const processedIds = new Set<string>()

  try {
    while (true) {
      const { done, value } = await reader.read()
      
      if (done) {
        break
      }

      // 合并缓冲区
      const newBuffer = new Uint8Array(buffer.length + value.length)
      newBuffer.set(buffer)
      newBuffer.set(value, buffer.length)
      buffer = newBuffer

      // 尝试解析消息
      while (buffer.length >= 16) {
        // AWS Event Stream 格式：
        // - 4 bytes: total length
        // - 4 bytes: headers length
        // - 4 bytes: prelude CRC
        // - headers
        // - payload
        // - 4 bytes: message CRC

        const totalLength = new DataView(buffer.buffer, buffer.byteOffset).getUint32(0, false)
        
        if (buffer.length < totalLength) {
          break // 等待更多数据
        }

        const headersLength = new DataView(buffer.buffer, buffer.byteOffset).getUint32(4, false)
        
        // 从 headers 中提取 event type
        const headersStart = 12
        const headersEnd = 12 + headersLength
        const eventType = extractEventType(buffer.slice(headersStart, headersEnd))
        
        // 提取 payload
        const payloadStart = 12 + headersLength
        const payloadEnd = totalLength - 4 // 减去 message CRC
        
        if (payloadStart < payloadEnd) {
          const payloadBytes = buffer.slice(payloadStart, payloadEnd)
          
          try {
            const payloadText = new TextDecoder().decode(payloadBytes)
            const event = JSON.parse(payloadText)
            
            // 根据 event type 处理不同类型的事件
            if (eventType === 'assistantResponseEvent' || event.assistantResponseEvent) {
              const assistantResp = event.assistantResponseEvent || event
              const content = assistantResp.content
              if (content) {
                onChunk(content)
                totalOutputChars += content.length
                accumulatedContent += content
              }
            }
            
            if (eventType === 'toolUseEvent' || event.toolUseEvent) {
              const toolUseData = event.toolUseEvent || event
              const toolUseId = toolUseData.toolUseId
              const toolName = toolUseData.name
              const isStop = toolUseData.stop === true
              
              // 获取输入 - 可能是字符串片段或完整对象
              let inputFragment = ''
              let inputObj: Record<string, unknown> | null = null
              if (typeof toolUseData.input === 'string') {
                inputFragment = toolUseData.input
              } else if (typeof toolUseData.input === 'object' && toolUseData.input !== null) {
                inputObj = toolUseData.input
              }
              
              if (toolUseId && processedIds.has(toolUseId)) {
                // 已完成的 tool use 可能会收到重复片段/stop，直接忽略
              } else {
                let state: ToolUseState | undefined

                if (toolUseId) {
                  state = toolUseStates.get(toolUseId)
                  if (!state && toolName) {
                    state = {
                      toolUseId,
                      name: toolName,
                      inputBuffer: ''
                    }
                    toolUseStates.set(toolUseId, state)
                  }
                }

                if (state) {
                  if (inputFragment) {
                    if (state.inputBuffer.length + inputFragment.length <= MAX_TOOL_INPUT_BUFFER_CHARS) {
                      state.inputBuffer += inputFragment
                    } else {
                      state.inputBuffer = state.inputBuffer.substring(0, MAX_TOOL_INPUT_BUFFER_CHARS)
                    }
                  }

                  if (inputObj) {
                    const serialized = JSON.stringify(inputObj)
                    state.inputBuffer = serialized.length <= MAX_TOOL_INPUT_BUFFER_CHARS
                      ? serialized
                      : serialized.substring(0, MAX_TOOL_INPUT_BUFFER_CHARS)
                  }

                  if (isStop) {
                    finalizeToolUseState(state, onChunk)
                    processedIds.add(state.toolUseId)
                    toolUseStates.delete(state.toolUseId)
                  }
                }
              }
            }
            
            // 处理 messageMetadataEvent - 包含 token 使用量
            if (eventType === 'messageMetadataEvent' || eventType === 'metadataEvent' || event.messageMetadataEvent || event.metadataEvent) {
              const metadata = event.messageMetadataEvent || event.metadataEvent || event
              proxyLogger.info('Kiro', 'messageMetadataEvent', metadata)
              
              // 检查 tokenUsage 对象
              if (metadata.tokenUsage) {
                const tokenUsage = metadata.tokenUsage
                proxyLogger.info('Kiro', 'tokenUsage', tokenUsage)
                // 计算 inputTokens = uncachedInputTokens + cacheReadInputTokens + cacheWriteInputTokens
                const uncached = tokenUsage.uncachedInputTokens || 0
                const cacheRead = tokenUsage.cacheReadInputTokens || 0
                const cacheWrite = tokenUsage.cacheWriteInputTokens || 0
                const calculatedInput = uncached + cacheRead + cacheWrite
                
                if (calculatedInput > 0) usage.inputTokens = calculatedInput
                if (tokenUsage.outputTokens) usage.outputTokens = tokenUsage.outputTokens
                if (tokenUsage.totalTokens) {
                  // 如果有 totalTokens，用它来推算
                  if (usage.inputTokens === 0 && usage.outputTokens > 0) {
                    usage.inputTokens = tokenUsage.totalTokens - usage.outputTokens
                  }
                }
                
                // 保存 cache tokens
                usage.cacheReadTokens = cacheRead
                usage.cacheWriteTokens = cacheWrite
                
                // 记录上下文使用百分比
                if (tokenUsage.contextUsagePercentage !== undefined) {
                  proxyLogger.info('Kiro', 'Context usage: ' + tokenUsage.contextUsagePercentage.toFixed(2) + '%')
                }
                
                // 详细的 token 分解日志
                proxyLogger.info('Kiro', 'Token breakdown', {
                  uncached,
                  cacheRead,
                  cacheWrite,
                  inputTotal: calculatedInput,
                  output: tokenUsage.outputTokens || 0,
                  total: tokenUsage.totalTokens || 0,
                  contextUsage: tokenUsage.contextUsagePercentage ? `${tokenUsage.contextUsagePercentage.toFixed(2)}%` : 'N/A'
                })
              }
              
              // 直接在 metadata 中的 tokens
              if (metadata.inputTokens) usage.inputTokens = metadata.inputTokens
              if (metadata.outputTokens) usage.outputTokens = metadata.outputTokens
            }
            
            // 调试：避免 toolUseEvent 输入片段刷屏
            const isToolInputFragment = (
              (eventType === 'toolUseEvent' || event.toolUseEvent) &&
              typeof (event.toolUseEvent || event).input === 'string' &&
              !(event.toolUseEvent || event).stop
            )
            if (!isToolInputFragment) {
              proxyLogger.debug('Kiro', 'Event: ' + (eventType || 'unknown'), JSON.stringify(event).slice(0, 500))
            }
            
            // 处理 usageEvent
            if (eventType === 'usageEvent' || eventType === 'usage' || event.usageEvent || event.usage) {
              const usageData = event.usageEvent || event.usage || event
              if (usageData.inputTokens) usage.inputTokens = usageData.inputTokens
              if (usageData.outputTokens) usage.outputTokens = usageData.outputTokens
              receivedCompletionSignal = true
            }

            // 处理 meteringEvent - Kiro API 返回 credit 使用量
            if (eventType === 'meteringEvent' || event.meteringEvent) {
              const metering = event.meteringEvent || event
              if (metering.usage && typeof metering.usage === 'number') {
                usage.credits += metering.usage
                proxyLogger.info('Kiro', `meteringEvent - credit: ${metering.usage}, total: ${usage.credits}`)
                receivedCompletionSignal = true
              }
            }
            
            // 处理 supplementaryWebLinksEvent - 网页链接引用
            if (eventType === 'supplementaryWebLinksEvent' || event.supplementaryWebLinksEvent) {
              const webLinksEvent = event.supplementaryWebLinksEvent || event
              if (webLinksEvent.supplementaryWebLinks && Array.isArray(webLinksEvent.supplementaryWebLinks)) {
                // 格式化网页链接引用
                const links = webLinksEvent.supplementaryWebLinks
                  .filter((link: { url?: string; title?: string; snippet?: string }) => link.url)
                  .map((link: { url?: string; title?: string; snippet?: string }) => {
                    const title = link.title || link.url
                    return `- [${title}](${link.url})`
                  })
                if (links.length > 0) {
                  onChunk(`\n\n🔗 **Web References:**\n${links.join('\n')}`)
                }
              }
              proxyLogger.debug('Kiro', 'supplementaryWebLinksEvent', JSON.stringify(webLinksEvent).slice(0, 300))
            }
            
            // 处理 contextUsageEvent - 上下文使用百分比
            if (eventType === 'contextUsageEvent' || event.contextUsageEvent) {
              const contextEvent = event.contextUsageEvent || event
              if (contextEvent.contextUsagePercentage !== undefined) {
                const percentage = contextEvent.contextUsagePercentage
                proxyLogger.info('Kiro', 'contextUsageEvent - Context usage: ' + percentage.toFixed(2) + '%')
                if (percentage > 80) {
                  console.warn('[Kiro] Warning: Context usage is high:', percentage.toFixed(2) + '%')
                }
                // Use contextUsagePercentage to derive input tokens when direct counts aren't available.
                // Most Claude models have 200k max input tokens.
                // Formula (from kiro-gateway): total = (pct/100) * maxInput; input = total - output
                if (usage.inputTokens === 0 || usage.inputTokens === Math.max(1, Math.round(inputChars / 3))) {
                  const totalTokens = Math.round((percentage / 100) * maxInputTokens)
                  const derivedInput = Math.max(0, totalTokens - usage.outputTokens)
                  if (derivedInput > 0) {
                    usage.inputTokens = derivedInput
                    proxyLogger.info('Kiro', `Token count from contextUsage: input=${derivedInput}, total=${totalTokens}`)
                  }
                }
              }
            }
            
            // 处理 reasoningContentEvent - Thinking 模式的推理内容
            if (eventType === 'reasoningContentEvent' || event.reasoningContentEvent) {
              const reasoning = event.reasoningContentEvent || event
              // 推理内容可能包含 text 或 signature
              if (reasoning.text) {
                // 传递 isThinking=true 标记这是思考内容
                proxyLogger.info('Kiro', `Received reasoning content (isThinking=true): ${reasoning.text.slice(0, 50)}...`)
                onChunk(reasoning.text, undefined, true)
                totalOutputChars += reasoning.text.length
                // 累计 reasoning tokens（约 3 字符 = 1 token）
                usage.reasoningTokens += Math.max(1, Math.round(reasoning.text.length / 3))
              }
              proxyLogger.debug('Kiro', 'reasoningContentEvent', JSON.stringify(reasoning).slice(0, 200))
            }
            
            // 处理 codeReferenceEvent - 代码引用/许可证信息
            if (eventType === 'codeReferenceEvent' || event.codeReferenceEvent) {
              const codeRef = event.codeReferenceEvent || event
              if (codeRef.references && Array.isArray(codeRef.references)) {
                // 格式化代码引用信息
                const refTexts = codeRef.references
                  .filter((ref: { licenseName?: string; repository?: string; url?: string }) => ref.licenseName || ref.repository)
                  .map((ref: { licenseName?: string; repository?: string; url?: string }) => {
                    const parts: string[] = []
                    if (ref.licenseName) parts.push(`License: ${ref.licenseName}`)
                    if (ref.repository) parts.push(`Repo: ${ref.repository}`)
                    if (ref.url) parts.push(`URL: ${ref.url}`)
                    return parts.join(', ')
                  })
                if (refTexts.length > 0) {
                  onChunk(`\n\n📚 **Code References:**\n${refTexts.join('\n')}`)
                }
              }
              proxyLogger.debug('Kiro', 'codeReferenceEvent', JSON.stringify(codeRef).slice(0, 300))
            }
            
            // 处理 followupPromptEvent - 后续提示建议
            if (eventType === 'followupPromptEvent' || event.followupPromptEvent) {
              const followup = event.followupPromptEvent || event
              if (followup.followupPrompt) {
                const prompt = followup.followupPrompt
                if (prompt.content || prompt.userIntent) {
                  // 将后续提示作为建议输出
                  const suggestion = prompt.content || prompt.userIntent
                  onChunk(`\n\n💡 **Suggested follow-up:** ${suggestion}`)
                }
              }
              proxyLogger.debug('Kiro', 'followupPromptEvent', JSON.stringify(followup).slice(0, 200))
            }
            
            // 处理 intentsEvent - 意图事件（artifact、deeplinks 等）
            if (eventType === 'intentsEvent' || event.intentsEvent) {
              const intents = event.intentsEvent || event
              // 意图事件主要用于 UI 渲染，记录日志即可
              proxyLogger.debug('Kiro', 'intentsEvent', JSON.stringify(intents).slice(0, 300))
            }
            
            // 处理 interactionComponentsEvent - 交互组件事件
            if (eventType === 'interactionComponentsEvent' || event.interactionComponentsEvent) {
              const components = event.interactionComponentsEvent || event
              // 交互组件主要用于 UI 渲染，记录日志即可
              proxyLogger.debug('Kiro', 'interactionComponentsEvent', JSON.stringify(components).slice(0, 300))
            }
            
            // 处理 invalidStateEvent - 无效状态事件（错误处理）
            if (eventType === 'invalidStateEvent' || event.invalidStateEvent) {
              const invalid = event.invalidStateEvent || event
              const reason = invalid.reason || 'UNKNOWN'
              const message = invalid.message || 'Invalid state detected'
              console.error('[Kiro] invalidStateEvent:', reason, message)
              // 将无效状态作为错误消息输出
              onChunk(`\n\n⚠️ **Warning:** ${message} (reason: ${reason})`)
            }
            
            // 处理 citationEvent - 引用事件
            if (eventType === 'citationEvent' || event.citationEvent) {
              const citation = event.citationEvent || event
              if (citation.citations && Array.isArray(citation.citations)) {
                // 格式化引用信息
                const citationTexts = citation.citations
                  .filter((c: { title?: string; url?: string; content?: string }) => c.title || c.url)
                  .map((c: { title?: string; url?: string; content?: string }, i: number) => {
                    const parts = [`[${i + 1}]`]
                    if (c.title) parts.push(c.title)
                    if (c.url) parts.push(`(${c.url})`)
                    return parts.join(' ')
                  })
                if (citationTexts.length > 0) {
                  onChunk(`\n\n📖 **Citations:**\n${citationTexts.join('\n')}`)
                }
              }
              proxyLogger.debug('Kiro', 'citationEvent', JSON.stringify(citation).slice(0, 300))
            }
            
            // 检查错误
            if (event._type || event.error) {
              const errMsg = event.message || event.error?.message || 'Unknown stream error'
              throw new Error(errMsg)
            }
          } catch (parseError) {
            if (parseError instanceof SyntaxError) {
              // JSON 解析错误，忽略
              console.debug('[EventStream] JSON parse error:', parseError)
            } else {
              throw parseError
            }
          }
        }
        
        // 移动到下一条消息
        buffer = buffer.slice(totalLength)
      }
    }
    
    // 完成任何未完成的 tool use
    for (const [toolUseId, state] of toolUseStates) {
      if (!processedIds.has(toolUseId)) {
        finalizeToolUseState(state, onChunk)
      }
    }
    
    // If stream ended without a completion signal, content may have been truncated
    if (!receivedCompletionSignal && accumulatedContent.length > 0) {
      proxyLogger.info('Kiro', `Stream ended without completion signal — possible content truncation (${accumulatedContent.length} chars)`)
      saveContentTruncation(accumulatedContent)
    }

    // If API didn't return token info, estimate from output chars.
    // Use same Claude correction factor (1.15x) as input token counting.
    if (usage.outputTokens === 0 && totalOutputChars > 0) {
      usage.outputTokens = Math.max(1, Math.round((totalOutputChars / 4) * 1.15))
      proxyLogger.info('Kiro', `Estimated output tokens: ${totalOutputChars} chars -> ${usage.outputTokens} tokens`)
    }
    
    proxyLogger.info('Kiro', 'Stream complete, final usage', usage)
    onComplete(usage)
  } catch (error) {
    onError(error as Error)
  } finally {
    reader.releaseLock()
  }
}

// 非流式调用（等待完整响应）
export async function callKiroApi(
  account: ProxyAccount,
  payload: KiroPayload,
  signal?: AbortSignal
): Promise<{
  content: string
  toolUses: KiroToolUse[]
  usage: { inputTokens: number; outputTokens: number; credits: number }
}> {
  return new Promise((resolve, reject) => {
    let content = ''
    const toolUses: KiroToolUse[] = []
    let usage = { inputTokens: 0, outputTokens: 0, credits: 0 }

    callKiroApiStream(
      account,
      payload,
      (text, toolUse) => {
        content += text
        if (toolUse) toolUses.push(toolUse)
      },
      (u) => {
        usage = u
        // Detect bracket-style tool calls in accumulated content
        const bracketTools = parseBracketToolCalls(content)
        if (bracketTools.length > 0 && toolUses.length === 0) {
          for (const tc of bracketTools) {
            toolUses.push({
              toolUseId: tc.id,
              name: tc.function.name,
              input: (() => { try { return JSON.parse(tc.function.arguments) } catch { return {} } })()
            })
          }
        }
        // Deduplicate tool uses by id and name+args
        const deduped = deduplicateToolCalls(toolUses.map(tu => ({
          id: tu.toolUseId,
          function: { name: tu.name, arguments: JSON.stringify(tu.input) }
        })))
        const dedupedToolUses = deduped.map(tc => ({
          toolUseId: tc.id ?? '',
          name: tc.function?.name ?? '',
          input: (() => { try { return JSON.parse(tc.function?.arguments ?? '{}') } catch { return {} } })()
        }))
        resolve({ content, toolUses: dedupedToolUses, usage })
      },
      reject,
      signal
    )
  })
}

// Kiro 官方模型信息
export interface KiroModel {
  modelId: string
  modelName: string
  description: string
  rateMultiplier?: number
  rateUnit?: string
  supportedInputTypes?: string[]
  tokenLimits?: {
    maxInputTokens?: number | null
    maxOutputTokens?: number | null
  }
}

// 根据账号区域获取 Q Service 端点（官方插件使用 q.{region}.amazonaws.com）
function getQServiceEndpoint(region?: string): string {
  if (region?.startsWith('eu-')) return 'https://q.eu-central-1.amazonaws.com'
  return 'https://q.us-east-1.amazonaws.com'
}

// 获取 Kiro 官方模型列表（支持分页，与官方插件一致传递 profileArn）
export async function fetchKiroModels(account: ProxyAccount): Promise<KiroModel[]> {
  const baseUrl = getQServiceEndpoint(account.region)
  const effectiveFingerprint = getEffectiveFingerprint(account.fingerprint)
  
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${account.accessToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': getKiroUserAgent(effectiveFingerprint),
    'x-amz-user-agent': getKiroAmzUserAgent(effectiveFingerprint),
    'x-amzn-codewhisperer-optout': 'true'
  }

  const allModels: KiroModel[] = []
  let nextToken: string | undefined

  try {
    do {
      const params = new URLSearchParams({ origin: 'AI_EDITOR', maxResults: '50' })
      if (account.profileArn) params.set('profileArn', account.profileArn)
      if (nextToken) params.set('nextToken', nextToken)

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000) // 15秒超时
      
      const url = `${baseUrl}/ListAvailableModels?${params.toString()}`
      const response = await fetch(url, { 
        method: 'GET', 
        headers,
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        console.error('[KiroAPI] ListAvailableModels failed:', response.status)
        break
      }

      const data = await response.json()
      allModels.push(...(data.models || []))
      nextToken = data.nextToken
    } while (nextToken)

    return allModels
  } catch (error) {
    console.error('[KiroAPI] ListAvailableModels error:', error)
    return allModels.length > 0 ? allModels : []
  }
}

// 订阅计划信息
export interface SubscriptionPlan {
  name: string  // KIRO_FREE, KIRO_PRO, KIRO_PRO_PLUS, KIRO_POWER
  qSubscriptionType: string
  description: {
    title: string
    billingInterval: string
    featureHeader: string
    features: string[]
  }
  pricing: {
    amount: number
    currency: string
  }
}

// 订阅列表响应
export interface SubscriptionListResponse {
  disclaimer?: string[]
  subscriptionPlans?: SubscriptionPlan[]
}

// 获取可用订阅列表
export async function fetchAvailableSubscriptions(account: ProxyAccount): Promise<SubscriptionListResponse> {
  const baseUrl = getQServiceEndpoint(account.region)
  const url = `${baseUrl}/listAvailableSubscriptions`
  const effectiveFingerprint = getEffectiveFingerprint(account.fingerprint)
  
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${account.accessToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': getKiroUserAgent(effectiveFingerprint),
    'x-amz-user-agent': getKiroAmzUserAgent(effectiveFingerprint),
    'x-amzn-codewhisperer-optout-preference': 'OPTIN'
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15000) // 15秒超时
  
  try {
    const response = await fetch(url, { 
      method: 'POST', 
      headers, 
      body: '{}',
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      console.error('[KiroAPI] ListAvailableSubscriptions failed:', response.status)
      return {}
    }

    const data = await response.json()
    return data
  } catch (error) {
    console.error('[KiroAPI] ListAvailableSubscriptions error:', error)
    return {}
  }
}

// 订阅 Token 响应
export interface SubscriptionTokenResponse {
  encodedVerificationUrl?: string
  status?: string
  token?: string | null
  message?: string
}

// 获取订阅管理/支付链接
export async function fetchSubscriptionToken(
  account: ProxyAccount,
  subscriptionType?: string
): Promise<SubscriptionTokenResponse> {
  const baseUrl = getQServiceEndpoint(account.region)
  const url = `${baseUrl}/CreateSubscriptionToken`
  const effectiveFingerprint = getEffectiveFingerprint(account.fingerprint)
  
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${account.accessToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': getKiroUserAgent(effectiveFingerprint),
    'x-amz-user-agent': getKiroAmzUserAgent(effectiveFingerprint),
    'x-amzn-codewhisperer-optout-preference': 'OPTIN'
  }

  // clientToken 是必需参数，需要生成 UUID
  const payload: { provider: string; clientToken: string; subscriptionType?: string } = {
    provider: 'STRIPE',
    clientToken: uuidv4()
  }
  if (subscriptionType) {
    payload.subscriptionType = subscriptionType
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15000) // 15秒超时
  
  try {
    const response = await fetch(url, { 
      method: 'POST', 
      headers, 
      body: JSON.stringify(payload),
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('[KiroAPI] CreateSubscriptionToken failed:', response.status, errorData)
      return { message: errorData.message || `Request failed with status ${response.status}` }
    }

    const data = await response.json()
    return data
  } catch (error) {
    console.error('[KiroAPI] CreateSubscriptionToken error:', error)
    return { message: error instanceof Error ? error.message : 'Unknown error' }
  }
}
