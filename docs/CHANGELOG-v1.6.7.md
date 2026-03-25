# Kiro Account Manager v1.6.7

## 🐛 Bug Fixes

- **Max Thinking Length Optimization:** Fixed a token exhaustion bug where Claude was allowed to use up to 200,000 tokens for extended thinking (`<thinking>` blocks), completely draining the 8,192 API output limit and causing severe unexpected prompt truncations. The `max_thinking_length` is now capped efficiently at 4,000 tokens, reserving minimum bounds for robust IDE agent tool printing actions.

## 🛠️ Technical Details

- Reduced `<max_thinking_length>` value from `200000` to `4000` in `kiroApi.ts` `THINKING_MODE_PROMPT`.
