# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start development server (Electron + Vite HMR)
npm run build        # Typecheck + build for production
npm run typecheck    # Type check main/preload (node) and renderer (web)
npm run lint         # ESLint with cache
npm run format       # Prettier formatting
npm run build:win    # Windows installer
npm run build:mac    # macOS DMG
npm run build:linux  # Linux AppImage
```

No test runner is configured — `test/` contains Python scripts and a manual HTML test page for proxy validation.

## Architecture

This is an Electron app with three processes:

**Main process** (`src/main/index.ts`) — handles all privileged operations: account storage, proxy server lifecycle, auto token refresh, AWS SSO credential import, tray menu, and auto-updater. IPC handlers are defined here.

**Renderer** (`src/renderer/src/`) — React 18 SPA with Zustand state. Pages: Home, Accounts, Proxy, Chat, Logs, API Examples, Settings, About. Communicates with main exclusively via `window.api.*`.

**Preload** (`src/preload/index.ts`) — the IPC bridge. Exposes 100+ typed methods as `window.api`. Any new main↔renderer communication must go through here.

### Proxy subsystem (`src/main/proxy/`)

The core feature. Runs an HTTP/HTTPS server that translates OpenAI-compatible API calls to Kiro's internal API format.

- `proxyServer.ts` — server setup, request routing, account selection
- `kiroApi.ts` — Kiro API client, token refresh, model fetching
- `translator.ts` — OpenAI ↔ Claude ↔ Kiro format conversion
- `accountPool.ts` — multi-account rotation and availability tracking
- `types.ts` — all shared type definitions for the proxy
- Reliability: `circuitBreaker.ts`, `retryStrategy.ts`, `deduplication.ts`, `healthMonitor.ts`, `metrics.ts`

### State management

Renderer uses Zustand (`src/renderer/src/store/accounts.ts`) with Map-based collections. Account data is persisted via `window.api.saveAccounts()` (electron-store under the hood).

### TypeScript config

Two separate configs: `tsconfig.node.json` (main + preload, Node.js types) and `tsconfig.web.json` (renderer, DOM types, `@` and `@renderer` path aliases). Both are referenced from root `tsconfig.json`.

### i18n

`src/renderer/src/hooks/useTranslation.ts` — translation hook with auto language detection. Locale files in `src/renderer/src/i18n/locales/` (English + Chinese).
