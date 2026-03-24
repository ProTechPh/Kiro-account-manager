/**
 * In-memory truncation state cache.
 * Ported from kiro-gateway/kiro/truncation_state.py
 *
 * When Kiro API truncates a tool call or content, we save the info here.
 * On the next request, the proxy injects a recovery notice so the model
 * understands what happened.
 */

import { createHash } from 'crypto'

export interface ToolTruncationInfo {
  toolCallId: string
  toolName: string
  truncationInfo: Record<string, unknown>
  timestamp: number
}

export interface ContentTruncationInfo {
  messageHash: string
  contentPreview: string
  timestamp: number
}

// In-memory caches — cleared on restart, no TTL
const toolTruncationCache = new Map<string, ToolTruncationInfo>()
const contentTruncationCache = new Map<string, ContentTruncationInfo>()

export function saveToolTruncation(
  toolCallId: string,
  toolName: string,
  truncationInfo: Record<string, unknown>
): void {
  toolTruncationCache.set(toolCallId, {
    toolCallId,
    toolName,
    truncationInfo,
    timestamp: Date.now()
  })
}

/** Returns and removes the truncation info for a tool call (one-time retrieval). */
export function getToolTruncation(toolCallId: string): ToolTruncationInfo | undefined {
  const info = toolTruncationCache.get(toolCallId)
  if (info) toolTruncationCache.delete(toolCallId)
  return info
}

export function saveContentTruncation(content: string): string {
  const hash = createHash('sha256').update(content.substring(0, 500)).digest('hex').substring(0, 16)
  contentTruncationCache.set(hash, {
    messageHash: hash,
    contentPreview: content.substring(0, 200),
    timestamp: Date.now()
  })
  return hash
}

/** Returns and removes the truncation info for content (one-time retrieval). */
export function getContentTruncation(content: string): ContentTruncationInfo | undefined {
  const hash = createHash('sha256').update(content.substring(0, 500)).digest('hex').substring(0, 16)
  const info = contentTruncationCache.get(hash)
  if (info) contentTruncationCache.delete(hash)
  return info
}

export function getCacheStats(): { toolTruncations: number; contentTruncations: number } {
  return {
    toolTruncations: toolTruncationCache.size,
    contentTruncations: contentTruncationCache.size
  }
}

/** User-friendly message to inject when a tool call was truncated. */
export function generateTruncationToolResult(_toolName: string, _toolCallId: string): string {
  return (
    `[API Limitation] Your tool call was truncated by the upstream API due to output size limits.\n\n` +
    `If the tool result below shows an error or unexpected behavior, this is likely a CONSEQUENCE of the truncation, ` +
    `not the root cause. The tool call itself was cut off before it could be fully transmitted.\n\n` +
    `Repeating the exact same operation will be truncated again. Consider adapting your approach.`
  )
}

/** User-friendly message to inject when content was truncated. */
export const TRUNCATION_USER_MESSAGE =
  '[System Notice] Your previous response was truncated by the API due to ' +
  'output size limitations. This is not an error on your part. ' +
  'If you need to continue, please adapt your approach rather than repeating the same output.'
