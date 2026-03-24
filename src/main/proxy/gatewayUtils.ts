/**
 * Gateway utility functions ported from kiro-gateway
 * 
 * Contains functions for fingerprint generation, ID generation,
 * and other common utilities used in proxy operations.
 */

import { createHash } from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import os from 'os'

/**
 * Generates a unique machine fingerprint based on hostname and username.
 * 
 * Used for User-Agent formation to identify a specific installation.
 * Format: SHA256 hash of "{hostname}-{username}-kiro-gateway"
 * 
 * @returns SHA256 hash of the machine identifier
 */
export function getMachineFingerprint(): string {
  try {
    const hostname = os.hostname()
    const username = os.userInfo().username
    const uniqueString = `${hostname}-${username}-kiro-gateway`

    return createHash('sha256').update(uniqueString).digest('hex')
  } catch (error) {
    console.warn(`Failed to get machine fingerprint: ${error}`)
    return createHash('sha256').update('default-kiro-gateway').digest('hex')
  }
}

/**
 * Builds headers for Kiro API requests.
 * 
 * Includes all necessary headers for authentication and identification:
 * - Authorization with Bearer token
 * - User-Agent with fingerprint
 * - AWS CodeWhisperer specific headers
 * 
 * @param fingerprint - Machine/device fingerprint
 * @param token - Access token for authorization
 * @returns Dictionary with headers for HTTP request
 */
export function getKiroHeaders(fingerprint: string, token: string): Record<string, string> {
  const version = '0.7.45'
  const nodeVersion = process.versions.node

  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': `aws-sdk-js/1.0.27 ua/2.1 os/win32#10.0.19044 lang/js md/nodejs#${nodeVersion} api/codewhispererstreaming#1.0.27 m/E KiroIDE-${version}-${fingerprint}`,
    'x-amz-user-agent': `aws-sdk-js/1.0.27 KiroIDE-${version}-${fingerprint}`,
    'x-amzn-codewhisperer-optout': 'true',
    'x-amzn-kiro-agent-mode': 'vibe',
    'amz-sdk-invocation-id': uuidv4(),
    'amz-sdk-request': 'attempt=1; max=3',
  }
}

/**
 * Generates a unique ID for chat completion.
 * 
 * @returns ID in format "chatcmpl-{uuid_hex}"
 */
export function generateCompletionId(): string {
  return `chatcmpl-${uuidv4().replace(/-/g, '')}`
}

/**
 * Generates a stable conversation ID based on message history.
 * 
 * For truncation recovery, we need a stable ID that persists across requests
 * in the same conversation. This is generated from a hash of key messages.
 * 
 * If no messages provided, falls back to random UUID (for backward compatibility).
 * 
 * @param messages - List of messages in the conversation (optional)
 * @returns Stable conversation ID (16-char hex) or random UUID
 * 
 * @example
 * const messages = [
 *   { role: 'user', content: 'Hello' },
 *   { role: 'assistant', content: 'Hi there!' }
 * ];
 * const convId = generateConversationId(messages);
 * // Same messages will always produce same ID
 */
export function generateConversationId(messages?: Array<Record<string, unknown>>): string {
  if (!messages || messages.length === 0) {
    // Fallback to random UUID for backward compatibility
    return uuidv4()
  }

  // Use first 3 messages + last message for stability
  // This ensures the ID stays the same as conversation grows,
  // but changes if the conversation history is different
  let keyMessages = messages
  if (messages.length > 3) {
    keyMessages = [...messages.slice(0, 3), messages[messages.length - 1]]
  }

  // Extract role and first 100 chars of content for hashing
  // This makes the hash stable even if content has minor formatting differences
  const simplifiedMessages = keyMessages.map((msg) => {
    const role = msg.role || 'unknown'
    let contentStr = ''

    const content = msg.content as string | object[] | object | undefined
    if (typeof content === 'string') {
      contentStr = content.substring(0, 100)
    } else if (Array.isArray(content)) {
      // For Anthropic-style content blocks
      contentStr = JSON.stringify(content).substring(0, 100)
    } else if (content) {
      contentStr = String(content).substring(0, 100)
    }

    return {
      role,
      content: contentStr,
    }
  })

  // Generate stable hash
  const contentJson = JSON.stringify(simplifiedMessages, Object.keys(simplifiedMessages[0]).sort())
  const hashDigest = createHash('sha256').update(contentJson).digest('hex')

  // Return first 16 chars for readability (still 64 bits of entropy)
  return hashDigest.substring(0, 16)
}

/**
 * Generates a unique ID for tool call.
 * 
 * @returns ID in format "call_{uuid_hex[:8]}"
 */
export function generateToolCallId(): string {
  const uuid = uuidv4().replace(/-/g, '')
  return `call_${uuid.substring(0, 8)}`
}

/**
 * Deduplicates tool calls by id (keeping the one with more arguments)
 * and by name+arguments (removing complete duplicates).
 * Ported from kiro-gateway/kiro/parsers.py
 */
export function deduplicateToolCalls<T extends { id?: string; function?: { name?: string; arguments?: string } }>(toolCalls: T[]): T[] {
  if (toolCalls.length === 0) return toolCalls

  // Deduplicate by id — keep the one with more arguments
  const byId = new Map<string, T>()
  const withoutId: T[] = []

  for (const tc of toolCalls) {
    const id = tc.id ?? ''
    if (!id) { withoutId.push(tc); continue }
    const existing = byId.get(id)
    if (!existing) { byId.set(id, tc); continue }
    const existingArgs = existing.function?.arguments ?? '{}'
    const currentArgs = tc.function?.arguments ?? '{}'
    if (currentArgs !== '{}' && (existingArgs === '{}' || currentArgs.length > existingArgs.length)) {
      byId.set(id, tc)
    }
  }

  // Deduplicate by name+args
  const seen = new Set<string>()
  const unique: T[] = []
  for (const tc of [...byId.values(), ...withoutId]) {
    const key = `${tc.function?.name ?? ''}-${tc.function?.arguments ?? '{}'}`
    if (!seen.has(key)) { seen.add(key); unique.push(tc) }
  }

  return unique
}


/**
 * Parses tool calls in [Called func_name with args: {...}] text format.
 * Some models return tool calls as text instead of structured events.
 * Ported from kiro-gateway/kiro/parsers.py
 */
export function parseBracketToolCalls(text: string): Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> {
  if (!text || !text.includes('[Called')) return []

  const results: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> = []
  const pattern = /\[Called\s+(\w+)\s+with\s+args:\s*/gi
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    const funcName = match[1]
    const argsStart = match.index + match[0].length
    const jsonStart = text.indexOf('{', argsStart)
    if (jsonStart === -1) continue

    // Find matching closing brace
    let depth = 0
    let jsonEnd = -1
    for (let i = jsonStart; i < text.length; i++) {
      if (text[i] === '{') depth++
      else if (text[i] === '}') {
        depth--
        if (depth === 0) { jsonEnd = i; break }
      }
    }
    if (jsonEnd === -1) continue

    const jsonStr = text.substring(jsonStart, jsonEnd + 1)
    try {
      JSON.parse(jsonStr) // validate
      results.push({
        id: generateToolCallId(),
        type: 'function',
        function: { name: funcName, arguments: jsonStr }
      })
    } catch { /* invalid JSON, skip */ }
  }

  return results
}
