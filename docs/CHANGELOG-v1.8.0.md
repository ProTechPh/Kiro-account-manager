# Changelog v1.8.0

## 🚀 New Features

### Public Access — Cloudflare Tunnel
- One-click public URL via Cloudflare Quick Tunnel (no account needed)
- Auto-downloads `cloudflared` binary from GitHub releases (~30MB, cached)
- Generates free `https://*.trycloudflare.com` URL with valid HTTPS
- Real-time status updates, download progress, and auto-reconnect
- Share your proxy endpoint with anyone on the internet

### Proxy Pools — Outbound Proxy & Vercel Relay
- Manage reusable outbound proxy pools (HTTP/SOCKS)
- **Vercel Relay**: One-click deploy edge relay to Vercel — masks your IP behind Vercel's edge network (hundreds of IPs across 20+ regions)
- **Batch Import**: Paste proxy lists in `http://user:pass@host:port` or `host:port:user:pass` format
- Per-pool test connectivity with status tracking (active/error/unknown)
- Strict proxy mode: fail request if proxy unreachable (no fallback to direct)
- `proxyPoolFetch()` utility for proxy-aware HTTP requests

### Real-Time Quota
- Live token tracking (input/output tokens with K formatting)
- Cost estimation based on Claude model pricing (Sonnet $3/$15, Opus $5/$25, Haiku $0.50/$2.50 per 1M tokens)
- Tokens/minute throughput rate
- Per-account quota progress bars with color-coded status (🟢 >70%, 🟡 30-70%, 🔴 <30%)
- Reset countdown timer (e.g., "Reset in 4h 30m")
- Auto-refresh every 60 seconds with countdown indicator

### MITM Bridge
- Intercept Kiro IDE HTTPS traffic on port 443
- Root CA certificate generation, system trust store installation, and export
- Dynamic SNI-based leaf certificate generation per domain
- Windows hosts file modification to redirect IDE traffic to localhost
- Forwards intercepted chat requests (`/generateAssistantResponse`) to local proxy server
- Passes through non-chat requests to real upstream
- Real-time intercepted request feed in UI
- Supports: Kiro IDE, Cursor, GitHub Copilot, Antigravity

## 🔧 Technical Changes

### New Files
- `src/main/proxy/tunnel.ts` — Cloudflare Tunnel management
- `src/main/proxy/proxyPool.ts` — Proxy pool CRUD, test, Vercel deploy, batch import
- `src/main/proxy/mitmCert.ts` — Root CA generation and system trust store management
- `src/main/proxy/mitmServer.ts` — HTTPS MITM server with SNI and request forwarding
- `src/renderer/src/components/proxy/PublicAccessPanel.tsx` — Tunnel UI
- `src/renderer/src/components/proxy/ProxyPoolsPanel.tsx` — Proxy pools management UI
- `src/renderer/src/components/proxy/QuotaPanel.tsx` — Real-time quota dashboard
- `src/renderer/src/components/proxy/MitmBridgePanel.tsx` — MITM Bridge UI

### Removed
- `publicAccess.ts` (traefik.me/nip.io/sslip.io) — replaced by Cloudflare Tunnel

### IPC Handlers Added
- `proxy-tunnel-start`, `proxy-tunnel-stop`, `proxy-tunnel-status`
- `proxy-pools-list`, `proxy-pools-create`, `proxy-pools-update`, `proxy-pools-delete`, `proxy-pools-test`
- `proxy-pools-vercel-deploy`, `proxy-pools-batch-import`
- `kproxy-get-status`, `kproxy-install-ca-cert`, `kproxy-uninstall-ca-cert`
- `kproxy-check-ca-cert-installed`, `kproxy-get-ca-cert`, `kproxy-export-ca-cert`
- `kproxy-update-config`

## ⚠️ Notes

- **MITM Bridge requires Administrator privileges** on Windows (port 443 + hosts file modification)
- **Cloudflare Tunnel** requires internet access to download `cloudflared` on first use
- **Vercel Relay** requires a Vercel API token (free tier: 100GB bandwidth/month)
- Cost estimation is for tracking purposes only — not actual billing
