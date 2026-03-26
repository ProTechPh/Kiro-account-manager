# Kiro Account Manager v1.6.9

## 🐛 Bug Fixes

- **Placeholder Text Echo in AI Responses**: Fixed a persistent issue where ANY placeholder text set in assistant history messages (e.g. `"Using tools."`, `"(tool_call)"`) was being echoed verbatim by the AI model into actual responses. The fix removes all placeholder content from assistant messages that contain tool calls — the `toolUses` array alone is sufficient for the Kiro API. Only truly empty assistant messages without tool calls retain a minimal `'(empty)'` fallback.

## 🛠️ Technical Details

- Removed all placeholder assignment from assistant messages with `tool_uses` in `translator.ts`.
- OpenAI path (`openaiToKiro()`): content is now empty string `''` when tool calls exist; `'(empty)'` fallback only for assistant messages without any tool calls.
- Claude path (`claudeToKiro()` / `extractClaudeAssistantContent()`): same approach — no placeholder when `toolUses` are present.
- All three locations fixed: `openaiToKiro()` history push, `claudeToKiro()` history push, and `extractClaudeAssistantContent()` return value.
