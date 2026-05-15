# Changelog v1.8.1

## 🚀 New Features

### Launch at Startup
- Automatically start the app when your system boots
- Uses Electron's `app.setLoginItemSettings()` for native OS integration
- Toggle available in Settings → Startup section

### Auto-Start Server
- Automatically start the proxy server when the app opens
- Convenient toggle in Settings page (previously only available in Proxy Panel)
- Works with the existing proxy auto-start logic

### Auto Repair Service
- Automatically detect and recover the proxy service on start/restart
- Runs a connectivity self-check by probing `/v1/models` endpoint after server start
- **401 detection**: If API key mismatch is detected, rotates Proxy API Key automatically and restarts
- **Service unresponsive (0/5xx)**: Automatically restarts the server
- **403 (credential issue)**: Logs the error and gives up (cannot auto-fix)
- Manual trigger available via IPC (`run-auto-repair`)
- Enabled by default, configurable via Settings toggle

## 🔧 Technical Changes

### New Files
- `src/main/proxy/autoRepair.ts` — Auto-repair service module with probe, key rotation, and restart logic

### Modified Files
- `src/main/proxy/types.ts` — Added `autoRepair?: boolean` to `ProxyConfig`
- `src/main/proxy/index.ts` — Exported `autoRepair` module
- `src/main/index.ts` — Added IPC handlers for startup settings and auto-repair, integrated auto-repair into proxy auto-start flow
- `src/preload/index.ts` — Added `getAutoLaunch`, `setAutoLaunch`, `getAutoStartServer`, `setAutoStartServer`, `getAutoRepair`, `setAutoRepair`, `runAutoRepair` API methods
- `src/preload/index.d.ts` — Added TypeScript declarations for new APIs
- `src/renderer/src/components/pages/SettingsPage.tsx` — Added Startup settings card with Launch at Startup, Auto-Start Server, and Auto Repair toggles
- `src/renderer/src/i18n/locales/en.ts` — Added English translations for startup section
- `src/renderer/src/i18n/locales/zh.ts` — Added Chinese translations for startup section

### IPC Handlers Added
- `get-auto-launch`, `set-auto-launch` — System login item settings
- `get-auto-start-server`, `set-auto-start-server` — Proxy server auto-start config
- `get-auto-repair`, `set-auto-repair` — Auto-repair toggle
- `run-auto-repair` — Manual trigger for auto-repair process

## ⚠️ Notes

- **Launch at Startup** behavior varies by OS: Windows uses registry, macOS uses login items
- **Auto Repair** defaults to enabled — it will run automatically after every proxy server auto-start
- API key rotation generates a new `sk-xxx` format key and saves it to the proxy config
