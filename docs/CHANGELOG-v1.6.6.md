# Kiro Account Manager v1.6.6

## 🐛 Bug Fixes

- **Tool Call Execution Timeouts**: Fixed a critical bug where massive IDE agent tool use requests (like long file writes) would quietly trip the proxy's 15-second first-token timeout before full completion. We now proactively signal the proxy as soon as the initial data packet arrives to pause the timer.
- **Lost Stream AbortErrors**: Solved an infinite hang scenario where internal `parseEventStream` runtime token chunking errors were swallowed instead of correctly passing up to the core connection pool. The proxy now properly transitions logic directly to the retry handler for seamless endpoint recovery.

## 🛠️ Technical Details

- Updated `kiroApi.ts` `parseEventStream` structure to invoke empty `onChunk` early signaling stream health to upstream connections.
- Shifted `try/catch` logic within `parseEventStream` out of the silent `onError` callback trap and accurately bubble the abort states.
