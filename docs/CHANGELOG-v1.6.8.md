# Kiro Account Manager v1.6.8

## 🐛 Bug Fixes

- **OpenAI-Compatible "Using tools." Leak**: Fixed a bug where the internal placeholder string `"Using tools."` was leaking into the actual AI response when using the OpenAI-compatible proxy endpoint. This placeholder is required by the Kiro API (which rejects empty `assistantResponseMessage.content` in history), but was being echoed back by the model in its next response. Replaced with `(tool_call)` — a parenthetical metadata marker that the model correctly treats as non-conversational context rather than text to repeat.

## 🛠️ Technical Details

- Changed `assistantContent` fallback in `translator.ts` `openaiToKiro()` from `'Using tools.'` → `'(tool_call)'` and `'I understand.'` → `'(empty)'`.
- Changed `content` fallback in `translator.ts` `extractClaudeAssistantContent()` from `'Using tools.'` → `'(tool_call)'`.
- Both the OpenAI path and the Claude path are fixed, covering all OpenAI-compatible and Anthropic-compatible proxy usage.
