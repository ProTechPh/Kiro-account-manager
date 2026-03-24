# Kiro Account Manager v1.6.2 Release Notes

Release Date: 2026-03-24

## 🔄 Proxy Engine — Python Gateway Feature Parity

This release completes the full port of the Python `kiro-gateway` to the Electron proxy engine. All core gateway modules are now implemented in TypeScript with equivalent or improved behavior.

---

### ✅ `thinkingParser.ts` — Stream Finalization Fix

**Bug fixed:** When a Kiro API stream terminated inside a `<thinking>` block without a closing tag, all buffered thinking content was silently lost.

**Changes:**
- Added `finalize()` method ported from `kiro-gateway/kiro/thinking_parser.py`
- `finalize()` flushes any remaining `initialBuffer` or `thinkingBuffer` when the stream ends
- Emits `isLastThinkingChunk: true` so Claude stream events are properly closed
- Logs a warning when a stream ends mid-thinking-block (no closing tag received)
- Added `foundThinkingBlock` getter (matches Python property)
- Translated all internal comments to English
- Fixed: leading whitespace after closing tag is now stripped (matches Python behavior)
- Fixed: `proxyServer.ts` now calls `textParser.finalize()` instead of the incorrect `textParser.feed('')` at stream end

---

### ✅ `modelResolver.ts` — Dynamic Model Cache (4-Layer Pipeline)

**Before:** The `ModelResolver` was a 3-layer pipeline (alias → normalize → hidden → passthrough), missing the dynamic cache layer from the Python implementation.

**After:** Full 4-layer pipeline matching `kiro-gateway/kiro/model_resolver.py` and `kiro-gateway/kiro/cache.py`:

```
Layer 0: Alias resolution     (MODEL_ALIASES)
Layer 1: Name normalization   (dashes→dots, strip date suffixes)
Layer 2: Dynamic cache        (from /ListAvailableModels API) ← NEW
Layer 3: Hidden models        (HIDDEN_MODELS)
Layer 4: Pass-through         (send as-is to Kiro API)
```

**New additions:**
- `ModelInfoCache` class — in-memory cache with TTL, `isPopulated()`, `isExpired()` helpers
- `ModelResolver.updateCache()` — syncs live model data from Kiro API into the resolver
- `FALLBACK_MODELS` constant — used when `/ListAvailableModels` is unreachable
- `CachedModelInfo` interface
- `ModelResolution.isVerified` field — `true` if model was found in cache or hidden models

**`proxyServer.ts` wired:**
- `modelResolver.updateCache(kiroModels)` is now called every time models are fetched from Kiro API (both `handleModels` and `getAvailableModels` paths)
- Model validation in `resolve()` now benefits from real-time model availability data

---

### 📋 Feature Parity Summary

All Python `kiro-gateway` modules are now ported to the Electron proxy:

| Module | Status |
|---|---|
| `network_errors.py` → `networkErrors.ts` | ✅ Complete |
| `model_resolver.py` + `cache.py` → `modelResolver.ts` | ✅ Complete |
| `thinking_parser.py` → `thinkingParser.ts` | ✅ Complete |
| `truncation_state.py` → `truncationState.ts` | ✅ Complete |
| `truncation_recovery.py` → `truncationRecovery.ts` | ✅ Complete |
| `parsers.py` + `utils.py` → `gatewayUtils.ts` | ✅ Complete |
| `kiro_errors.py` → `kiroApi.ts` (enhanceKiroError) | ✅ Complete |
| `http_client.py` → `kiroApi.ts` (callKiroApiStream) | ✅ Complete |
| `tokenizer.py` → `proxyServer.ts` (handleCountTokens) | ✅ Complete |
| `converters_*.py` → `translator.ts` | ✅ Complete |

---

**Full change list:**
- 🐛 Fix: `ThinkingParser.finalize()` — no more lost thinking content when stream ends mid-block
- ✨ Feat: `ModelInfoCache` class — dynamic model cache layer in `ModelResolver`
- ✨ Feat: 4-layer model resolution pipeline matching Python gateway
- 🔧 Fix: `proxyServer.ts` now syncs `modelResolver` cache on every model fetch
- 🔧 Fix: `processClaudeText` flush now uses `finalize()` instead of `feed('')`
- 📝 Translated all Chinese comments in `thinkingParser.ts` to English
