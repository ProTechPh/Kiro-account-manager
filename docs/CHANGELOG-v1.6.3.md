# Kiro Account Manager v1.6.3

## 🐛 Bug Fixes

- **Multi-Agent Streaming Stability**: Disabled the 8-second request blockage after a stream ends. This fixes the issue preventing tools like Claude Code from properly establishing subsequent requests in multi-agent workflows, avoiding false "user stop" cancellations (HTTP 499).

## 🛠️ Technical Details

- Updated `proxyServer.ts` within the Electron main process.
- Disabled `markRecentClientCancel` setting `recentClientCancelUntil`.
- Eliminated early abort race conditions during client-side stream termination tracking.
