// Thinking Block Parser for Streaming Responses
// Parses <thinking>, <think>, <reasoning> tags from AI responses
// Ported from kiro-gateway/kiro/thinking_parser.py

export enum ParserState {
  PRE_CONTENT = 0,  // Initial state, buffering to detect opening tag
  IN_THINKING = 1,  // Inside thinking block, buffering until closing tag
  STREAMING = 2     // Regular streaming, no more thinking block detection
}

export interface ThinkingParseResult {
  thinkingContent: string | null    // Content to be sent as reasoning_content
  regularContent: string | null     // Regular content to be sent as delta.content
  isFirstThinkingChunk: boolean     // True if this is the first chunk of thinking
  isLastThinkingChunk: boolean      // True if thinking block just closed
  stateChanged: boolean             // True if parser state changed during this feed
}

export type ThinkingHandlingMode = 'as_reasoning_content' | 'remove' | 'pass' | 'strip_tags'

export class ThinkingParser {
  private handlingMode: ThinkingHandlingMode
  private openTags: string[]
  private initialBufferSize: number
  private maxTagLength: number

  private state: ParserState
  private initialBuffer: string
  private thinkingBuffer: string
  private openTag: string | null
  private closeTag: string | null
  private isFirstThinkingChunk: boolean
  private thinkingBlockFound: boolean

  constructor(
    handlingMode: ThinkingHandlingMode = 'as_reasoning_content',
    openTags: string[] = ['<thinking>', '<think>', '<reasoning>', '<thought>'],
    initialBufferSize: number = 100
  ) {
    this.handlingMode = handlingMode
    this.openTags = openTags
    this.initialBufferSize = initialBufferSize

    // Calculate max tag length for cautious buffering
    // We need to buffer enough to not split a closing tag across chunks
    this.maxTagLength = Math.max(...this.openTags.map(tag => tag.length)) * 2

    this.state = ParserState.PRE_CONTENT
    this.initialBuffer = ''
    this.thinkingBuffer = ''
    this.openTag = null
    this.closeTag = null
    this.isFirstThinkingChunk = true
    this.thinkingBlockFound = false
  }

  /**
   * Process a chunk of content through the parser.
   * Returns a ThinkingParseResult with processed content for this chunk.
   */
  feed(content: string): ThinkingParseResult {
    const empty: ThinkingParseResult = {
      thinkingContent: null,
      regularContent: null,
      isFirstThinkingChunk: false,
      isLastThinkingChunk: false,
      stateChanged: false
    }

    if (!content) return empty

    if (this.state === ParserState.PRE_CONTENT) {
      return this.handlePreContent(content)
    } else if (this.state === ParserState.IN_THINKING) {
      return this.handleInThinking(content)
    } else {
      // STREAMING state - pass through unchanged
      return { ...empty, regularContent: content }
    }
  }

  /**
   * Finalize parsing when the stream ends.
   * Flushes any remaining buffered content that hasn't been emitted yet.
   * Ported from kiro-gateway/kiro/thinking_parser.py ThinkingParser.finalize()
   *
   * IMPORTANT: Call this after the last chunk to ensure no content is lost,
   * especially when the stream ends inside a <thinking> block (no closing tag).
   */
  finalize(): ThinkingParseResult {
    const result: ThinkingParseResult = {
      thinkingContent: null,
      regularContent: null,
      isFirstThinkingChunk: false,
      isLastThinkingChunk: false,
      stateChanged: false
    }

    // Flush thinking buffer if stream ended while still in IN_THINKING state
    if (this.thinkingBuffer) {
      if (this.state === ParserState.IN_THINKING) {
        // Stream ended without receiving closing tag — flush remaining thinking content
        result.thinkingContent = this.processThinkingContent(this.thinkingBuffer)
        result.isFirstThinkingChunk = this.isFirstThinkingChunk
        result.isLastThinkingChunk = true
        console.warn('[ThinkingParser] Stream ended inside thinking block without closing tag. Flushing remaining content.')
      } else {
        result.regularContent = this.thinkingBuffer
      }
      this.thinkingBuffer = ''
    }

    // Flush initial buffer if we never found a thinking tag
    if (this.initialBuffer) {
      result.regularContent = (result.regularContent ?? '') + this.initialBuffer
      this.initialBuffer = ''
    }

    return result
  }

  /**
   * Handle PRE_CONTENT state — buffer and look for opening tag.
   */
  private handlePreContent(content: string): ThinkingParseResult {
    const result: ThinkingParseResult = {
      thinkingContent: null,
      regularContent: null,
      isFirstThinkingChunk: false,
      isLastThinkingChunk: false,
      stateChanged: false
    }

    this.initialBuffer += content

    // Check if any opening tag is present in the buffer
    for (const tag of this.openTags) {
      const tagIndex = this.initialBuffer.indexOf(tag)
      if (tagIndex !== -1) {
        // Found opening tag — transition to IN_THINKING
        this.openTag = tag
        this.closeTag = tag.replace('<', '</')
        this.thinkingBlockFound = true
        this.state = ParserState.IN_THINKING
        result.stateChanged = true

        // Any content before the tag is regular content
        if (tagIndex > 0) {
          result.regularContent = this.initialBuffer.substring(0, tagIndex)
        }

        // Content after the tag goes into the thinking buffer
        this.thinkingBuffer = this.initialBuffer.substring(tagIndex + tag.length)
        this.initialBuffer = ''

        // Cautious send: only emit if buffer is longer than max tag length
        if (this.thinkingBuffer.length > this.maxTagLength) {
          const sendPart = this.thinkingBuffer.substring(0, this.thinkingBuffer.length - this.maxTagLength)
          this.thinkingBuffer = this.thinkingBuffer.substring(this.thinkingBuffer.length - this.maxTagLength)
          result.thinkingContent = this.processThinkingContent(sendPart)
          result.isFirstThinkingChunk = this.isFirstThinkingChunk
          this.isFirstThinkingChunk = false
        }

        return result
      }
    }

    // No tag found — switch to STREAMING if buffer exceeds limit
    if (this.initialBuffer.length > this.initialBufferSize) {
      this.state = ParserState.STREAMING
      result.stateChanged = true
      result.regularContent = this.initialBuffer
      this.initialBuffer = ''
    }

    return result
  }

  /**
   * Handle IN_THINKING state — look for closing tag with cautious buffering.
   */
  private handleInThinking(content: string): ThinkingParseResult {
    const result: ThinkingParseResult = {
      thinkingContent: null,
      regularContent: null,
      isFirstThinkingChunk: false,
      isLastThinkingChunk: false,
      stateChanged: false
    }

    this.thinkingBuffer += content

    // Check for closing tag
    if (this.closeTag) {
      const closeIndex = this.thinkingBuffer.indexOf(this.closeTag)
      if (closeIndex !== -1) {
        // Found closing tag — emit remaining thinking content and transition to STREAMING
        const thinkingContent = this.thinkingBuffer.substring(0, closeIndex)
        const afterClose = this.thinkingBuffer.substring(closeIndex + this.closeTag.length)

        if (thinkingContent) {
          result.thinkingContent = this.processThinkingContent(thinkingContent)
          result.isFirstThinkingChunk = this.isFirstThinkingChunk
          this.isFirstThinkingChunk = false
        }

        result.isLastThinkingChunk = true
        this.state = ParserState.STREAMING
        result.stateChanged = true
        this.thinkingBuffer = ''

        // Content after closing tag is regular content
        // Strip leading whitespace/newlines that often follow the closing tag (matches Python behavior)
        if (afterClose) {
          const stripped = afterClose.replace(/^\s+/, '')
          if (stripped) result.regularContent = stripped
        }

        return result
      }
    }

    // No closing tag yet — use cautious sending to avoid splitting the tag
    if (this.thinkingBuffer.length > this.maxTagLength) {
      const sendPart = this.thinkingBuffer.substring(0, this.thinkingBuffer.length - this.maxTagLength)
      this.thinkingBuffer = this.thinkingBuffer.substring(this.thinkingBuffer.length - this.maxTagLength)
      result.thinkingContent = this.processThinkingContent(sendPart)
      result.isFirstThinkingChunk = this.isFirstThinkingChunk
      this.isFirstThinkingChunk = false
    }

    return result
  }

  /**
   * Process thinking content according to the configured handling mode.
   */
  private processThinkingContent(content: string): string | null {
    switch (this.handlingMode) {
      case 'as_reasoning_content':
        return content
      case 'remove':
        return null
      case 'pass':
        // Re-wrap with original tags
        return this.openTag + content + (this.state === ParserState.STREAMING ? this.closeTag : '')
      case 'strip_tags':
        return content
      default:
        return content
    }
  }

  /** Get the current FSM state. */
  getState(): ParserState {
    return this.state
  }

  /** True if a thinking block was detected in this response. */
  get foundThinkingBlock(): boolean {
    return this.thinkingBlockFound
  }

  /** Alternate method form for backward compatibility. */
  hasThinkingBlock(): boolean {
    return this.thinkingBlockFound
  }

  /** Reset parser to initial state (reuse for next response). */
  reset(): void {
    this.state = ParserState.PRE_CONTENT
    this.initialBuffer = ''
    this.thinkingBuffer = ''
    this.openTag = null
    this.closeTag = null
    this.isFirstThinkingChunk = true
    this.thinkingBlockFound = false
  }
}
