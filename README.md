# Kiro Account Manager

<p align="center">
  <img src="resources/icon.png" width="128" height="128" alt="Kiro Logo">
</p>

<p align="center">
  <strong>A powerful multi-account management tool for Kiro IDE</strong>
</p>

<p align="center">
  Quick account switching, auto token refresh, group/tag management, machine ID management and more
</p>

<p align="center">
  <strong>English</strong> | <a href="README_CN.md">简体中文</a>
</p>

---

## ✨ Features

### 🔐 Multi-Account Management
- Add, edit, and delete multiple Kiro accounts
- One-click quick account switching
- Support Builder ID and Social (Google/GitHub) login methods
- Batch import/export account data

### 🔄 Auto Refresh
- Auto refresh tokens before expiration
- Auto update account usage and subscription info after refresh
- Periodically check all account balances when auto-switch is enabled

### 📁 Groups & Tags
- Flexibly organize accounts with groups and tags
- Batch set groups/tags for multiple accounts

### 🔑 Machine ID Management
- Modify device identifier to prevent account association bans
- Auto switch machine ID when switching accounts
- Assign unique bound machine ID to each account

### 🔄 Auto Account Switch
- Auto switch to available account when balance is low
- Configurable balance threshold and check interval

### ⚙️ Kiro IDE Settings Sync
- Sync Kiro IDE settings (Agent mode, Model, MCP servers, etc.)
- Edit MCP server configurations
- Manage user rules (Steering files)

### 🌐 Multi-Language Support
- Full English/Chinese bilingual interface
- Auto-detect system language or manual selection

### 🎨 Personalization
- 21 theme colors available
- Dark/Light mode toggle
- Privacy mode to hide sensitive information

### 🌐 Proxy Support
- Support HTTP/HTTPS/SOCKS5 proxy

### 🔑 API Key Management
- Independent multi-API key system
- RESTful API endpoints for CRUD operations
- Usage tracking with credits, tokens, and request statistics
- Credit limits and quota management
- Three key formats: sk-kiro-*, simple, token

### 🛡️ Advanced Proxy Engine
- **Circuit Breaker**: Exponential backoff with probabilistic retry for multi-account failover
- **Configurable Timeouts**: First token timeout, streaming read timeout, max retries
- **Payload Size Guard**: Configurable payload limit with auto-trim or error mode
- **Fake Reasoning Budget Cap**: Prevent model from spending all output tokens on thinking
- **Web Search Tool Injection**: Auto-inject web_search tool for MCP emulation
- **Truncation Recovery**: Automatic detection and recovery from truncated API responses

### 🌐 Public Access — Cloudflare Tunnel
- One-click public URL via Cloudflare Quick Tunnel (no account needed)
- Free `https://*.trycloudflare.com` URL with valid HTTPS
- Auto-downloads `cloudflared` binary, real-time status & progress
- Share your proxy endpoint with anyone on the internet

### 🔀 Proxy Pools — Outbound Proxy & Vercel Relay
- Manage reusable outbound proxy pools (HTTP/SOCKS)
- **Vercel Relay**: Deploy edge relay to mask your IP behind Vercel's edge network
- **Batch Import**: Paste proxy lists in multiple formats
- Per-pool connectivity test, strict mode, active/inactive toggle

### 📊 Real-Time Quota
- Live token tracking (input/output) with cost estimation
- Per-account quota progress bars with color-coded status
- Reset countdown timer (e.g., "Reset in 4h 30m")
- Auto-refresh every 60 seconds

### 🛡️ MITM Bridge
- Intercept Kiro IDE HTTPS traffic on port 443
- Root CA certificate generation & system trust store installation
- Dynamic SNI-based leaf certificate generation per domain
- Forwards intercepted requests to local proxy server
- Supports: Kiro IDE, Cursor, GitHub Copilot, Antigravity

### ⚡ Startup & Auto Repair
- **Launch at Startup**: Automatically start the app when your system boots
- **Auto-Start Server**: Automatically start the proxy server when the app opens
- **Auto Repair**: Connectivity self-check on start/restart — detects 401 and rotates Proxy API Key automatically, restarts on unresponsive service

---

## 📸 Screenshots

### Home
![Home](resources/主页.png)

### Account Management
![Account Management](resources/账户管理.png)

### Settings
![Settings](resources/设置.png)

### About
![About](resources/关于.png)

---

## 🛠️ Tech Stack

- **Frontend**: React 18 + TypeScript
- **Desktop**: Electron
- **State Management**: Zustand
- **UI Components**: Radix UI + Tailwind CSS
- **Icons**: Lucide React
- **Build Tool**: Vite

---

## 🚀 Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Type check
npm run typecheck
```

---

## 📋 Changelog

### v1.8.1

**New Features:**
- ⚡ **Launch at Startup**: Automatically start the app when your system boots (native OS login item)
- 🚀 **Auto-Start Server**: Automatically start the proxy server when the app opens (Settings toggle)
- 🛠️ **Auto Repair**: Connectivity self-check on start/restart — probes `/v1/models`, rotates API key on 401, restarts on unresponsive service

See full details: `docs/CHANGELOG-v1.8.1.md`

### v1.8.0

**New Features:**
- 🌐 **Public Access (Cloudflare Tunnel)**: One-click public URL via `cloudflared` quick tunnel — free HTTPS, no account needed
- 🔀 **Proxy Pools**: Outbound proxy management with HTTP/SOCKS support, Vercel Relay deployment, batch import
- 📊 **Real-Time Quota**: Live token tracking, cost estimation, per-account quota progress bars with reset countdown
- 🛡️ **MITM Bridge**: Intercept IDE HTTPS traffic on port 443 with Root CA generation, dynamic SNI certs, and request forwarding

See full details: `docs/CHANGELOG-v1.8.0.md`

### v1.7.1

**New Features:**
- 🛡️ **Circuit Breaker Exponential Backoff**: Smart cooldown with `base × 2^(failures-1)` formula + probabilistic retry (10% chance) to prevent permanent stuck accounts
- ⏱️ **Configurable Streaming Timeouts**: First token timeout (15s), max retries (3), streaming read timeout (5min) — all adjustable from UI
- 🔍 **Web Search Tool Auto-Injection**: MCP emulation — auto-inject `web_search` tool so models can search the web
- 📦 **Payload Size Guard**: Configurable limit (600KB default) with auto-trim toggle — no more silent data loss
- 🧠 **Fake Reasoning Budget Cap**: Default budget (4000 tokens) + max cap (10000) to prevent model spending all output on thinking
- 🖥️ **10 New UI Settings**: All features exposed in the Advanced Settings panel with full EN/ZH translations

See full details: `docs/CHANGELOG-v1.7.1.md`

### v1.7.0

**New Features:**
- 🔑 **API Key Management System**: Complete independent multi-API key management with RESTful endpoints
- 📊 **Usage Tracking**: Detailed statistics for requests, tokens, and credits per API key
- 🔒 **Credit Limits**: Set and enforce credit limits for individual API keys
- 🔧 **Three Key Formats**: Support for sk-kiro-*, simple, and token formats
- 🌐 **RESTful API**: Full CRUD operations via `/api/v1/keys` endpoints
- 📈 **Real-time Monitoring**: Live usage tracking with daily and model-based statistics
- 🔐 **Security Features**: Bearer token authentication, key masking, and enable/disable controls

See full details: `docs/CHANGELOG-v1.7.0.md`

### v1.6.9

**Bug Fixes:**
- 🐛 **Placeholder Text Echo in AI Responses**: Fixed a persistent issue where ANY placeholder text in assistant history messages (e.g. `"Using tools."`, `"(tool_call)"`) was being echoed by the AI model into actual responses. Removed all placeholder content from tool-call assistant messages entirely.

See full details: `docs/CHANGELOG-v1.6.9.md`

### v1.6.8

**Bug Fixes:**
- 🐛 **OpenAI-Compatible "Using tools." Leak**: Fixed a bug where the internal placeholder string `"Using tools."` was appearing in actual AI responses when using the OpenAI-compatible proxy. The string—required by the Kiro API to satisfy a non-empty history constraint—was being echoed back by the model. Replaced with `(tool_call)`, a parenthetical metadata marker the model correctly ignores.

See full details: `docs/CHANGELOG-v1.6.8.md`

### v1.6.7

**Bug Fixes:**
- 🐛 **Thinking Token Exhaustion**: Fixed a prompt truncation issue by capping the proxy's `max_thinking_length` to 4,000 tokens instead of 200,000, reserving adequate capacity for the actual file writes and tool calls without blowing past the 8,192 API limits limit.

See full details: `docs/CHANGELOG-v1.6.7.md`

### v1.6.6

**Bug Fixes:**
- 🐛 **Tool Call Execution Timeouts**: Fixed a critical bug where massive IDE agent tool use requests would trip the proxy's 15-second first-token timeout before full completion. We now proactively signal the proxy as soon as the initial data packet arrives.
- 🐛 **Lost Stream AbortErrors**: Solved an infinite hang scenario where internal runtime token chunking errors were swallowed instead of passing up to the core connection pool. The proxy now properly transitions to the retry handler for seamless endpoint recovery.

See full details: `docs/CHANGELOG-v1.6.6.md`

### v1.6.4

**Bug Fixes:**
- 🐛 **API Quota Exhaustion & Smart Retry**: Fixed an infinite API retry loop on generic rate limits (`429`). Now intelligently prioritizes fallback endpoints with exponential backoff (`1s`, `2s`, `4s` delays) for transient high volume, while fully enabling the `AccountPool` to auto-switch instances instantaneously upon hard limits (`Monthly limit exceeded`).

See full details: `docs/CHANGELOG-v1.6.4.md`

### v1.6.3

**Bug Fixes:**
- 🐛 **Multi-Agent Streaming Stability**: Disabled the 8-second request blockage after a stream ends. This fixes the issue preventing tools like Claude Code from properly establishing subsequent requests in multi-agent workflows, avoiding false "user stop" cancellations (HTTP 499).

### v1.6.2

**Proxy Engine Improvements:**
- 🔄 **Feature Parity**: Completed full port of the Python `kiro-gateway` to the Electron proxy engine.
- ✨ **Dynamic Model Cache**: Implemented full 4-layer resolution pipeline with live cache for `ListAvailableModels`.
- 🐛 **Stream Parsing**: Fixed lost thinking blocks by implementing stream finalization when Kiro API terminates early.

See full details: `docs/CHANGELOG-v1.6.2.md`

### v1.5.5

**Bug Fixes:**
- 🧬 **OAuth Fingerprint Auto-Generate**: Fixed missing fingerprint when adding accounts via social OAuth login
- 🔄 **Consistent Fingerprint Pipeline**: Unified fingerprint return in verify/import handlers for OAuth, SSO, and credential flows
- 🗂️ **Reliable Persistence**: Add-account paths now save fingerprint consistently for single and batch imports

See full details: `docs/CHANGELOG-v1.5.5.md`

### v1.5.2

**Improvements:**
- 🚀 **Better User Experience**: Removed intrusive popunder ads
- 🔗 **SmartLink Only**: Kept user-friendly SmartLink ads for sustainable development
- 🔒 **Enhanced Security**: Simplified Content Security Policy
- ⚡ **Better Performance**: Removed external ad scripts for faster loading

**Changes:**
- Removed popunder ad integration
- Simplified CSP rules for better security
- Cleaner interface without popup interruptions
- Maintained revenue stream through optional SmartLink clicks

### v1.5.1

**New Features:**
- 💰 **Ad Integration**: Popunder and SmartLink ads for sustainable development
- 🔧 **Better SQLite3 Support**: Fixed native module integration for auto-import features
- 🛡️ **Enhanced CSP**: Updated Content Security Policy for ad network compatibility

**Improvements:**
- Optimized ad loading with user interaction triggers
- Better error handling for blocked scripts
- Cleaner About page interface

**Bug Fixes:**
- Fixed better-sqlite3 module loading errors
- Resolved Content Security Policy blocking issues
- Improved ad script loading reliability

### v1.5.0

**New Features:**
- 🌐 **API Proxy Service**: OpenAI-compatible API gateway with automatic account rotation
- 💬 **Chat Interface**: Built-in chat with conversation management and AI-powered title generation
- 📊 **System Logs**: Real-time log streaming with color-coded severity levels
- 📝 **API Examples**: Code examples and CC Switch integration for quick setup
- 🎨 **Modern UI**: KiroaaS-inspired design with lime accent colors and improved dark mode

**Improvements:**
- Enhanced model selection with support for all Kiro native models
- Improved API key handling in chat and proxy services
- Better conversation persistence across app restarts
- Updated repository references to ProTechPh organization

**Bug Fixes:**
- Fixed API key authentication in chat completion
- Fixed model mapping to preserve native Kiro models
- Improved error handling in proxy service

---

## 👨‍💻 Author

- **GitHub**: [ProTechPh](https://github.com/ProTechPh)
- **Project Homepage**: [Kiro-account-manager](https://github.com/ProTechPh/Kiro-account-manager)

---

## 📄 License

This project is licensed under the AGPL-3.0 License - see the [LICENSE](LICENSE) file for details.

---

## ⭐ Star History

If this project helps you, please give it a star ⭐
