/**
 * Auto Repair Service for Kiro Proxy Server
 * 
 * Automatically detects and recovers the proxy service on start/restart:
 * - Probes /v1/models endpoint for connectivity self-check
 * - If 401 is detected, rotates Proxy API Key automatically
 * - If service is unresponsive (0/5xx), restarts the server
 * - If 403 (credential issue), logs and gives up
 */

import type { ProxyConfig } from './types'

export interface AutoRepairCallbacks {
  getProxyConfig: () => ProxyConfig
  updateProxyConfig: (config: Partial<ProxyConfig>) => void
  saveProxyConfig: (config: ProxyConfig) => void
  startServer: () => Promise<void>
  stopServer: () => Promise<void>
  isServerRunning: () => boolean
  onRepairLog: (message: string, level: 'info' | 'warn' | 'error') => void
  onRepairComplete: (result: AutoRepairResult) => void
}

export interface AutoRepairResult {
  success: boolean
  action: 'none' | 'key_rotated' | 'restarted' | 'failed'
  message: string
  newApiKey?: string
}

/**
 * Generate a new API key value in sk-xxx format
 */
function generateApiKeyValue(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const key = Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `sk-${key}`
}

/**
 * Probe the /v1/models endpoint to check service health
 * Returns HTTP status code (0 on network error)
 */
async function probeModelsStatus(host: string, port: number, apiKey: string): Promise<number> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    
    const response = await fetch(`http://${host}:${port}/v1/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal
    })
    
    clearTimeout(timeout)
    return response.status
  } catch {
    return 0
  }
}

/**
 * Probe with retry (multiple attempts for transient failures)
 */
async function probeWithRetry(host: string, port: number, apiKey: string, attempts = 3): Promise<number> {
  let last = 0
  for (let i = 0; i < attempts; i++) {
    last = await probeModelsStatus(host, port, apiKey)
    if (last !== 0) return last
    await sleep(500)
  }
  return last
}

/**
 * Wait for the /health endpoint to respond OK
 */
async function waitForHealth(host: string, port: number, timeoutMs = 15000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 3000)
      
      const response = await fetch(`http://${host}:${port}/health`, {
        signal: controller.signal
      })
      
      clearTimeout(timeout)
      if (response.ok) return true
    } catch {
      // keep polling
    }
    await sleep(500)
  }
  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Get the effective API key for probing
 */
function getEffectiveApiKey(config: ProxyConfig): string {
  // Check multi-key first
  if (config.apiKeys && config.apiKeys.length > 0) {
    const enabledKey = config.apiKeys.find(k => k.enabled)
    if (enabledKey) return enabledKey.key
  }
  // Fall back to legacy single key
  return config.apiKey || ''
}

/**
 * Run the auto-repair process after server start
 * 
 * Logic:
 * - 200: healthy, do nothing
 * - 401: key mismatch, rotate proxy API key and restart
 * - 0/5xx: service unresponsive, restart once
 * - 403: credential problem, cannot auto-fix
 */
export async function runAutoRepair(callbacks: AutoRepairCallbacks): Promise<AutoRepairResult> {
  const config = callbacks.getProxyConfig()
  
  if (!config.autoRepair) {
    return { success: true, action: 'none', message: 'Auto repair disabled' }
  }

  const host = config.host === '0.0.0.0' ? '127.0.0.1' : config.host
  const port = config.port
  const apiKey = getEffectiveApiKey(config)

  callbacks.onRepairLog(`[AutoRepair] Starting connectivity self-check on ${host}:${port}`, 'info')

  // If no API key configured, skip the models probe (only check health)
  if (!apiKey) {
    callbacks.onRepairLog('[AutoRepair] No API key configured, checking health only', 'info')
    const healthy = await waitForHealth(host, port, 10000)
    if (healthy) {
      callbacks.onRepairLog('[AutoRepair] Health check passed', 'info')
      const result: AutoRepairResult = { success: true, action: 'none', message: 'Service healthy (no API key check)' }
      callbacks.onRepairComplete(result)
      return result
    }
    // Try restart
    callbacks.onRepairLog('[AutoRepair] Health check failed, attempting restart', 'warn')
    try {
      await callbacks.stopServer()
      await sleep(500)
      await callbacks.startServer()
      await waitForHealth(host, port, 15000)
      const result: AutoRepairResult = { success: true, action: 'restarted', message: 'Service restarted successfully' }
      callbacks.onRepairComplete(result)
      return result
    } catch (err) {
      const result: AutoRepairResult = { success: false, action: 'failed', message: `Restart failed: ${err}` }
      callbacks.onRepairComplete(result)
      return result
    }
  }

  // Probe /v1/models with the current API key
  let status = await probeWithRetry(host, port, apiKey)
  callbacks.onRepairLog(`[AutoRepair] Initial probe status: ${status}`, 'info')

  // 200: healthy
  if (status === 200) {
    const result: AutoRepairResult = { success: true, action: 'none', message: 'Service healthy' }
    callbacks.onRepairComplete(result)
    return result
  }

  // 403: credential issue, cannot auto-fix
  if (status === 403) {
    callbacks.onRepairLog('[AutoRepair] Credential issue (403), cannot auto-fix', 'warn')
    const result: AutoRepairResult = { success: false, action: 'failed', message: 'Credential issue (403), cannot auto-fix' }
    callbacks.onRepairComplete(result)
    return result
  }

  // 401: key mismatch, rotate API key and restart
  if (status === 401) {
    callbacks.onRepairLog('[AutoRepair] API key mismatch (401), rotating key...', 'warn')
    
    const newKey = generateApiKeyValue()
    const updatedConfig = { ...config }
    
    // Update the API key(s)
    if (updatedConfig.apiKeys && updatedConfig.apiKeys.length > 0) {
      // Update the first enabled key
      const keyIndex = updatedConfig.apiKeys.findIndex(k => k.enabled)
      if (keyIndex >= 0) {
        updatedConfig.apiKeys[keyIndex] = { ...updatedConfig.apiKeys[keyIndex], key: newKey }
      }
    } else {
      // Legacy single key
      updatedConfig.apiKey = newKey
    }
    
    // Save and apply new config
    callbacks.saveProxyConfig(updatedConfig)
    callbacks.updateProxyConfig(updatedConfig)
    
    // Restart server with new key
    try {
      await callbacks.stopServer()
      await sleep(500)
      await callbacks.startServer()
      await waitForHealth(host, port, 15000)
      
      // Re-probe with new key
      status = await probeWithRetry(host, port, newKey)
      callbacks.onRepairLog(`[AutoRepair] After key rotation, probe status: ${status}`, 'info')
      
      if (status === 200) {
        const result: AutoRepairResult = { success: true, action: 'key_rotated', message: 'API key rotated and service recovered', newApiKey: newKey }
        callbacks.onRepairComplete(result)
        return result
      }
    } catch (err) {
      callbacks.onRepairLog(`[AutoRepair] Restart after key rotation failed: ${err}`, 'error')
    }
    
    const result: AutoRepairResult = { success: false, action: 'failed', message: `Key rotation did not resolve the issue (status: ${status})` }
    callbacks.onRepairComplete(result)
    return result
  }

  // 0/5xx: service unresponsive, restart
  callbacks.onRepairLog(`[AutoRepair] Service unresponsive (status: ${status}), attempting restart...`, 'warn')
  try {
    await callbacks.stopServer()
    await sleep(500)
    await callbacks.startServer()
    const healthy = await waitForHealth(host, port, 15000)
    
    if (healthy) {
      status = await probeWithRetry(host, port, apiKey)
      callbacks.onRepairLog(`[AutoRepair] After restart, probe status: ${status}`, 'info')
      
      if (status === 200) {
        const result: AutoRepairResult = { success: true, action: 'restarted', message: 'Service restarted and recovered' }
        callbacks.onRepairComplete(result)
        return result
      }
    }
  } catch (err) {
    callbacks.onRepairLog(`[AutoRepair] Restart failed: ${err}`, 'error')
  }

  const result: AutoRepairResult = { success: false, action: 'failed', message: `Unable to recover automatically (final status: ${status})` }
  callbacks.onRepairComplete(result)
  return result
}
