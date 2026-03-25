# Kiro Account Manager v1.6.4

## 🐛 Bug Fixes

- **Smart API Quota Handling and Retry Loop Fix**: Fixed a critical issue where the proxy logic would indefinitely get stuck in a wait-and-retry loop across the same set of endpoints when returning HTTP 429 quota exhaustion messages.
- **Failover Auto-Switching Behavior**: True account exhaustion (`Monthly request limit exceeded`) now immediately breaks the proxy attempt loop and dynamically surfaces the failure to `proxyServer.ts`, letting the `AccountPool` seamlessly cycle in a new healthy AWS account directly behind the scenes.
- **High-Volume Rate Limit Exponential Backoff**: Restored the proper exponential backoff (`1s`, `2s`, `4s` delays) to gracefully recover from transient `429` high-volume AWS rate limits without prematurely burning the current active account.

## 🛠️ Technical Details

- Updated `src/main/proxy/kiroApi.ts` `callKiroApiStream` with proper `retryCount` iteration avoiding infinite endpoint alternation.
- Isolated upstream API errors cleanly via error response parsing filtering (`enhanceKiroError`), tracking failed endpoints via an `exhaustedEndpoints` set boundary instance within the request scope.
