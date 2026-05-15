// Proxy Pool Module - Outbound proxy management, Vercel relay, IP rotation
// Based on 9router's proxy pool architecture

import { ProxyAgent, fetch as undiciFetch } from 'undici'
import { v4 as uuidv4 } from 'uuid'

// ============ Types ============

export type ProxyPoolType = 'http' | 'vercel'

export interface ProxyPoolEntry {
  id: string
  name: string
  proxyUrl: string
  noProxy: string
  type: ProxyPoolType
  isActive: boolean
  strictProxy: boolean
  testStatus: 'unknown' | 'active' | 'error'
  lastTestedAt: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export interface ProxyPoolTestResult {
  ok: boolean
  status: number
  statusText?: string
  elapsedMs?: number
  error?: string
}

export interface ResolvedProxyConfig {
  source: 'pool' | 'vercel' | 'env' | 'none'
  proxyPoolId?: string
  connectionProxyEnabled: boolean
  connectionProxyUrl: string
  connectionNoProxy: string
  strictProxy: boolean
  vercelRelayUrl?: string
}

// ============ In-memory store (persisted via electron-store) ============

let proxyPools: ProxyPoolEntry[] = []
let storeRef: { get: (key: string) => unknown; set: (key: string, value: unknown) => void } | null = null

export function initProxyPoolStore(store: { get: (key: string) => unknown; set: (key: string, value: unknown) => void }): void {
  storeRef = store
  const saved = store.get('proxyPools') as ProxyPoolEntry[] | undefined
  if (Array.isArray(saved)) {
    proxyPools = saved
  }
}

function persist(): void {
  storeRef?.set('proxyPools', proxyPools)
}

// ============ CRUD ============

export function getProxyPools(filter?: { isActive?: boolean }): ProxyPoolEntry[] {
  let result = [...proxyPools]
  if (filter?.isActive !== undefined) {
    result = result.filter(p => p.isActive === filter.isActive)
  }
  return result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

export function getProxyPoolById(id: string): ProxyPoolEntry | null {
  return proxyPools.find(p => p.id === id) || null
}

export function createProxyPool(data: {
  name: string
  proxyUrl: string
  noProxy?: string
  type?: ProxyPoolType
  isActive?: boolean
  strictProxy?: boolean
}): ProxyPoolEntry {
  const now = new Date().toISOString()
  const pool: ProxyPoolEntry = {
    id: uuidv4(),
    name: data.name,
    proxyUrl: data.proxyUrl,
    noProxy: data.noProxy || '',
    type: data.type || 'http',
    isActive: data.isActive !== false,
    strictProxy: data.strictProxy === true,
    testStatus: 'unknown',
    lastTestedAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now
  }
  proxyPools.push(pool)
  persist()
  return pool
}

export function updateProxyPool(id: string, data: Partial<ProxyPoolEntry>): ProxyPoolEntry | null {
  const idx = proxyPools.findIndex(p => p.id === id)
  if (idx === -1) return null
  proxyPools[idx] = { ...proxyPools[idx], ...data, updatedAt: new Date().toISOString() }
  persist()
  return proxyPools[idx]
}

export function deleteProxyPool(id: string): boolean {
  const idx = proxyPools.findIndex(p => p.id === id)
  if (idx === -1) return false
  proxyPools.splice(idx, 1)
  persist()
  return true
}

// ============ Proxy Test ============

export async function testProxyPool(id: string): Promise<ProxyPoolTestResult> {
  const pool = getProxyPoolById(id)
  if (!pool) return { ok: false, status: 404, error: 'Pool not found' }

  const result = await testProxyUrl(pool.proxyUrl, pool.type)

  // Update test status
  updateProxyPool(id, {
    testStatus: result.ok ? 'active' : 'error',
    lastTestedAt: new Date().toISOString(),
    lastError: result.error || null
  })

  return result
}

export async function testProxyUrl(proxyUrl: string, type: ProxyPoolType = 'http'): Promise<ProxyPoolTestResult> {
  const startedAt = Date.now()

  if (type === 'vercel') {
    // Test Vercel relay by sending a request through it
    try {
      const res = await fetch(proxyUrl, {
        method: 'HEAD',
        headers: { 'x-relay-target': 'https://google.com', 'x-relay-path': '/' },
        signal: AbortSignal.timeout(10000)
      })
      return {
        ok: res.status < 400,
        status: res.status,
        statusText: res.statusText,
        elapsedMs: Date.now() - startedAt
      }
    } catch (err) {
      return { ok: false, status: 500, error: (err as Error).message }
    }
  }

  // HTTP/SOCKS proxy test
  let dispatcher: ProxyAgent | null = null
  try {
    dispatcher = new ProxyAgent({ uri: proxyUrl })
    const res = await undiciFetch('https://google.com/', {
      method: 'HEAD',
      dispatcher,
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'KiroAccountManager' }
    })
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      elapsedMs: Date.now() - startedAt
    }
  } catch (err) {
    const error = (err as Error).name === 'AbortError'
      ? 'Proxy test timed out'
      : (err as Error).message
    return { ok: false, status: 500, error }
  } finally {
    try { await dispatcher?.close() } catch { /* ignore */ }
  }
}

// ============ Proxy Resolution ============

function shouldBypassNoProxy(targetUrl: string, noProxy: string): boolean {
  if (!noProxy) return false
  let hostname: string
  try { hostname = new URL(targetUrl).hostname.toLowerCase() } catch { return false }
  const patterns = noProxy.split(',').map(p => p.trim().toLowerCase()).filter(Boolean)
  return patterns.some(pattern => {
    if (pattern === '*') return true
    if (pattern.startsWith('.')) return hostname.endsWith(pattern) || hostname === pattern.slice(1)
    return hostname === pattern || hostname.endsWith(`.${pattern}`)
  })
}

/**
 * Resolve which proxy to use for a given target URL.
 * Priority: specified pool → env vars → none
 */
export function resolveProxyConfig(targetUrl: string, proxyPoolId?: string): ResolvedProxyConfig {
  // 1. Proxy Pool
  if (proxyPoolId && proxyPoolId !== '__none__') {
    const pool = getProxyPoolById(proxyPoolId)
    if (pool && pool.isActive && pool.proxyUrl) {
      if (shouldBypassNoProxy(targetUrl, pool.noProxy)) {
        return { source: 'none', connectionProxyEnabled: false, connectionProxyUrl: '', connectionNoProxy: pool.noProxy, strictProxy: false }
      }
      if (pool.type === 'vercel') {
        return {
          source: 'vercel',
          proxyPoolId,
          connectionProxyEnabled: false,
          connectionProxyUrl: '',
          connectionNoProxy: pool.noProxy,
          strictProxy: pool.strictProxy,
          vercelRelayUrl: pool.proxyUrl
        }
      }
      return {
        source: 'pool',
        proxyPoolId,
        connectionProxyEnabled: true,
        connectionProxyUrl: pool.proxyUrl,
        connectionNoProxy: pool.noProxy,
        strictProxy: pool.strictProxy
      }
    }
  }

  // 2. Environment variables
  const envProxy = process.env.HTTPS_PROXY || process.env.https_proxy ||
    process.env.HTTP_PROXY || process.env.http_proxy ||
    process.env.ALL_PROXY || process.env.all_proxy
  if (envProxy) {
    const noProxy = process.env.NO_PROXY || process.env.no_proxy || ''
    if (shouldBypassNoProxy(targetUrl, noProxy)) {
      return { source: 'none', connectionProxyEnabled: false, connectionProxyUrl: '', connectionNoProxy: noProxy, strictProxy: false }
    }
    return {
      source: 'env',
      connectionProxyEnabled: true,
      connectionProxyUrl: envProxy,
      connectionNoProxy: noProxy,
      strictProxy: false
    }
  }

  // 3. No proxy
  return { source: 'none', connectionProxyEnabled: false, connectionProxyUrl: '', connectionNoProxy: '', strictProxy: false }
}

// ============ Proxy-Aware Fetch ============

const proxyDispatchers = new Map<string, ProxyAgent>()
const MAX_DISPATCHERS = 20

async function getDispatcher(proxyUrl: string): Promise<ProxyAgent> {
  if (!proxyDispatchers.has(proxyUrl)) {
    if (proxyDispatchers.size >= MAX_DISPATCHERS) {
      const oldest = proxyDispatchers.keys().next().value
      if (oldest) {
        try { await proxyDispatchers.get(oldest)?.close() } catch { /* ignore */ }
        proxyDispatchers.delete(oldest)
      }
    }
    proxyDispatchers.set(proxyUrl, new ProxyAgent({ uri: proxyUrl }))
  }
  return proxyDispatchers.get(proxyUrl)!
}

/**
 * Fetch with proxy pool support.
 * Handles both HTTP proxy (via undici ProxyAgent) and Vercel relay (via header rewriting).
 */
export async function proxyPoolFetch(
  url: string,
  options: RequestInit = {},
  proxyConfig?: ResolvedProxyConfig
): Promise<Response> {
  if (!proxyConfig || proxyConfig.source === 'none') {
    return fetch(url, options)
  }

  // Vercel relay mode
  if (proxyConfig.vercelRelayUrl) {
    const parsed = new URL(url)
    const relayHeaders: Record<string, string> = {
      ...(options.headers as Record<string, string> || {}),
      'x-relay-target': `${parsed.protocol}//${parsed.host}`,
      'x-relay-path': `${parsed.pathname}${parsed.search}`
    }
    return fetch(proxyConfig.vercelRelayUrl, { ...options, headers: relayHeaders })
  }

  // HTTP/SOCKS proxy mode
  if (proxyConfig.connectionProxyEnabled && proxyConfig.connectionProxyUrl) {
    try {
      const dispatcher = await getDispatcher(proxyConfig.connectionProxyUrl)
      const res = await undiciFetch(url, { ...options as any, dispatcher })
      return res as unknown as Response
    } catch (err) {
      if (proxyConfig.strictProxy) {
        throw new Error(`Proxy required but failed (strictProxy=true): ${(err as Error).message}`)
      }
      console.warn(`[ProxyPool] Proxy failed, falling back to direct: ${(err as Error).message}`)
      return fetch(url, options)
    }
  }

  return fetch(url, options)
}

// ============ Vercel Relay Deployment ============

const VERCEL_API = 'https://api.vercel.com'

const RELAY_FUNCTION_CODE = `
export const config = { runtime: "edge" };

export default async function handler(req) {
  const target = req.headers.get("x-relay-target");
  const relayPath = req.headers.get("x-relay-path") || "/";
  if (!target) {
    return new Response(JSON.stringify({ error: "Missing x-relay-target header" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const targetUrl = target.replace(/\\\\/$/, "") + relayPath;

  const headers = new Headers(req.headers);
  headers.delete("x-relay-target");
  headers.delete("x-relay-path");
  headers.delete("host");

  const response = await fetch(targetUrl, {
    method: req.method,
    headers,
    body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
    duplex: "half",
  });

  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
}
`

export async function deployVercelRelay(vercelToken: string, projectName?: string): Promise<{ success: boolean; deployUrl?: string; pool?: ProxyPoolEntry; error?: string }> {
  const name = projectName?.trim() || `relay-${Date.now().toString(36)}`

  try {
    // Deploy relay function
    const deployRes = await fetch(`${VERCEL_API}/v13/deployments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vercelToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        files: [
          { file: 'api/relay.js', data: RELAY_FUNCTION_CODE },
          { file: 'package.json', data: JSON.stringify({ name, version: '1.0.0' }) },
          { file: 'vercel.json', data: JSON.stringify({ rewrites: [{ source: '/(.*)', destination: '/api/relay' }] }) }
        ],
        projectSettings: { framework: null },
        target: 'production'
      })
    })

    if (!deployRes.ok) {
      const err = await deployRes.json().catch(() => ({})) as { error?: { message?: string } }
      return { success: false, error: err.error?.message || `Deploy failed (HTTP ${deployRes.status})` }
    }

    const deployment = await deployRes.json() as { id?: string; uid?: string; projectId?: string; url?: string }
    const deploymentId = deployment.id || deployment.uid

    // Disable deployment protection
    const projectId = deployment.projectId || name
    await fetch(`${VERCEL_API}/v9/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${vercelToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ssoProtection: null })
    }).catch(() => { /* non-fatal */ })

    // Poll until ready
    const start = Date.now()
    let deployUrl = ''
    while (Date.now() - start < 120000) {
      const statusRes = await fetch(`${VERCEL_API}/v13/deployments/${deploymentId}`, {
        headers: { 'Authorization': `Bearer ${vercelToken}` }
      })
      const data = await statusRes.json() as { readyState?: string; url?: string }
      if (data.readyState === 'READY') {
        deployUrl = `https://${data.url}`
        break
      }
      if (data.readyState === 'ERROR' || data.readyState === 'CANCELED') {
        return { success: false, error: `Deployment ${data.readyState}` }
      }
      await new Promise(r => setTimeout(r, 3000))
    }

    if (!deployUrl) {
      return { success: false, error: 'Deployment timed out' }
    }

    // Create proxy pool entry
    const pool = createProxyPool({
      name,
      proxyUrl: deployUrl,
      type: 'vercel',
      isActive: true,
      strictProxy: false
    })

    return { success: true, deployUrl, pool }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

// ============ Batch Import ============

export function batchImportProxies(lines: string[]): { created: number; skipped: number; failed: number } {
  const existingUrls = new Set(proxyPools.map(p => p.proxyUrl))
  let created = 0, skipped = 0, failed = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    try {
      let proxyUrl: string
      let name: string

      if (trimmed.includes('://')) {
        const parsed = new URL(trimmed)
        proxyUrl = parsed.toString()
        name = `Imported ${parsed.hostname}:${parsed.port || '80'}`
      } else {
        // host:port:user:pass format
        const parts = trimmed.split(':')
        if (parts.length === 4) {
          const [host, port, username, password] = parts
          proxyUrl = `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`
          name = `Imported ${host}:${port}`
        } else if (parts.length === 2) {
          proxyUrl = `http://${trimmed}`
          name = `Imported ${trimmed}`
        } else {
          failed++
          continue
        }
      }

      if (existingUrls.has(proxyUrl)) {
        skipped++
        continue
      }

      createProxyPool({ name, proxyUrl, type: 'http', isActive: true })
      existingUrls.add(proxyUrl)
      created++
    } catch {
      failed++
    }
  }

  return { created, skipped, failed }
}
