// Web Search Tool Auto-Injection (MCP Tool Emulation)
// Ported from kiro-gateway/kiro/websearch.py
//
// When enabled, automatically injects a web_search tool into requests.
// The model decides whether to use it or not.
// This is "Path B" (MCP emulation) — native Anthropic server-side tools (Path A) always work.

import type { KiroToolWrapper } from './types'

export const WEB_SEARCH_TOOL_NAME = 'web_search'

export const WEB_SEARCH_TOOL: KiroToolWrapper = {
  toolSpecification: {
    name: WEB_SEARCH_TOOL_NAME,
    description: 'Search the web for current information. Use this when you need up-to-date information that may not be in your training data, such as current events, recent developments, latest versions, or real-time data. Returns relevant search results with titles, URLs, and snippets.',
    inputSchema: {
      json: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to look up on the web. Be specific and concise for best results.'
          }
        },
        required: ['query']
      }
    }
  }
}

/**
 * Check if web_search tool is already present in the tools list.
 */
export function hasWebSearchTool(tools: KiroToolWrapper[]): boolean {
  return tools.some(t => t.toolSpecification.name === WEB_SEARCH_TOOL_NAME)
}

/**
 * Inject web_search tool into the tools list if not already present.
 * Returns a new array with the tool added, or the original array if already present.
 */
export function injectWebSearchTool(tools: KiroToolWrapper[]): KiroToolWrapper[] {
  if (hasWebSearchTool(tools)) {
    return tools
  }
  return [...tools, WEB_SEARCH_TOOL]
}
