// Cloudflare Tunnel Module - Public access via cloudflared quick tunnels
// No Cloudflare account needed - uses trycloudflare.com free quick tunnels

import fs from 'fs'
import path from 'path'
import os from 'os'
import https from 'https'
import { execSync, spawn, ChildProcess } from 'child_process'
import { app } from 'electron'

const IS_WINDOWS = os.platform() === 'win32'
const BIN_DIR = path.join(app.getPath('userData'), 'bin')
const BIN_NAME = IS_WINDOWS ? 'cloudflared.exe' : 'cloudflared'
const BIN_PATH = path.join(BIN_DIR, BIN_NAME)

const GITHUB_BASE_URL = 'https://github.com/cloudflare/cloudflared/releases/latest/download'

const PLATFORM_MAPPINGS: Record<string, Record<string, string>> = {
  darwin: {
    x64: 'cloudflared-darwin-amd64.tgz',
    arm64: 'cloudflared-darwin-arm64.tgz'
  },
  win32: {
    x64: 'cloudflared-windows-amd64.exe',
    ia32: 'cloudflared-windows-386.exe',
    arm64: 'cloudflared-windows-amd64.exe'
  },
  linux: {
    x64: 'cloudflared-linux-amd64',
    arm64: 'cloudflared-linux-arm64'
  }
}

export interface TunnelStatus {
  enabled: boolean
  running: boolean
  tunnelUrl: string | null
  downloading: boolean
  downloadProgress: number
  error: string | null
}

// Module state
let cloudflaredProcess: ChildProcess | null = null
let currentTunnelUrl: string | null = null
let isDownloading = false
let downloadProgress = 0
let tunnelError: string | null = null
let statusChangeCallback: ((status: TunnelStatus) => void) | null = null

export function setTunnelStatusCallback(cb: ((status: TunnelStatus) => void) | null): void {
  statusChangeCallback = cb
}

function notifyStatusChange(): void {
  if (statusChangeCallback) {
    statusChangeCallback(getTunnelStatus())
  }
}

function getDownloadUrl(): string {
  const platform = os.platform()
  const arch = os.arch()
  const platformMapping = PLATFORM_MAPPINGS[platform]
  if (!platformMapping) {
    throw new Error(`Unsupported platform: ${platform}`)
  }
  const binaryName = platformMapping[arch] || platformMapping['x64']
  return `${GITHUB_BASE_URL}/${binaryName}`
}

/**
 * Download cloudflared binary from GitHub releases
 */
function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    const request = https.get(url, (response) => {
      // Follow redirects
      if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307) {
        file.close()
        if (fs.existsSync(dest)) fs.unlinkSync(dest)
        const redirectUrl = response.headers.location
        if (redirectUrl) {
          downloadFile(redirectUrl, dest).then(resolve).catch(reject)
          return
        }
        reject(new Error('Redirect without location'))
        return
      }

      if (response.statusCode !== 200) {
        file.close()
        if (fs.existsSync(dest)) fs.unlinkSync(dest)
        reject(new Error(`HTTP ${response.statusCode}`))
        return
      }

      const totalBytes = parseInt(response.headers['content-length'] || '0', 10)
      let receivedBytes = 0

      response.on('data', (chunk: Buffer) => {
        receivedBytes += chunk.length
        if (totalBytes > 0) {
          downloadProgress = Math.round((receivedBytes / totalBytes) * 100)
          notifyStatusChange()
        }
      })

      response.pipe(file)
      file.on('finish', () => {
        file.close()
        resolve()
      })
    })

    request.on('error', (err) => {
      file.close()
      if (fs.existsSync(dest)) fs.unlinkSync(dest)
      reject(err)
    })

    file.on('error', (err) => {
      file.close()
      if (fs.existsSync(dest)) fs.unlinkSync(dest)
      reject(err)
    })
  })
}

/**
 * Ensure cloudflared binary is available
 */
export async function ensureCloudflared(): Promise<string> {
  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true })
  }

  // Check if binary already exists and is valid
  if (fs.existsSync(BIN_PATH)) {
    const stat = fs.statSync(BIN_PATH)
    if (stat.size > 1024 * 1024) { // > 1MB = likely valid
      if (!IS_WINDOWS) {
        try { fs.chmodSync(BIN_PATH, '755') } catch { /* ignore */ }
      }
      return BIN_PATH
    }
    // Invalid/truncated, remove
    fs.unlinkSync(BIN_PATH)
  }

  // Download
  isDownloading = true
  downloadProgress = 0
  tunnelError = null
  notifyStatusChange()

  try {
    const url = getDownloadUrl()
    const isArchive = url.endsWith('.tgz')
    const downloadDest = isArchive ? path.join(BIN_DIR, 'cloudflared.tgz') : BIN_PATH + '.tmp'

    console.log(`[Tunnel] Downloading cloudflared from ${url}`)
    await downloadFile(url, downloadDest)

    if (isArchive) {
      // Extract .tgz (macOS)
      execSync(`tar -xzf "${downloadDest}" -C "${BIN_DIR}"`, { stdio: 'pipe', windowsHide: true })
      fs.unlinkSync(downloadDest)
    } else {
      fs.renameSync(downloadDest, BIN_PATH)
    }

    if (!IS_WINDOWS) {
      fs.chmodSync(BIN_PATH, '755')
    }

    console.log('[Tunnel] cloudflared downloaded successfully')
    return BIN_PATH
  } catch (error) {
    tunnelError = `Failed to download cloudflared: ${(error as Error).message}`
    throw error
  } finally {
    isDownloading = false
    notifyStatusChange()
  }
}

/**
 * Start a cloudflared quick tunnel (no account needed)
 * Returns the generated trycloudflare.com URL
 */
export async function startTunnel(localPort: number): Promise<{ success: boolean; tunnelUrl?: string; error?: string }> {
  if (cloudflaredProcess) {
    // Already running
    if (currentTunnelUrl) {
      return { success: true, tunnelUrl: currentTunnelUrl }
    }
    // Kill stale process
    stopTunnel()
  }

  tunnelError = null
  notifyStatusChange()

  try {
    const binaryPath = await ensureCloudflared()

    return new Promise((resolve) => {
      const child = spawn(binaryPath, [
        'tunnel', '--url', `http://127.0.0.1:${localPort}`, '--no-autoupdate'
      ], {
        detached: false,
        windowsHide: true,
        cwd: os.tmpdir(),
        stdio: ['ignore', 'pipe', 'pipe']
      })

      cloudflaredProcess = child
      let resolved = false

      const timeout = setTimeout(() => {
        if (resolved) return
        resolved = true
        tunnelError = 'Tunnel connection timed out (90s)'
        notifyStatusChange()
        resolve({ success: false, error: tunnelError })
      }, 90000)

      const handleLog = (data: Buffer): void => {
        const msg = data.toString()
        // Extract the trycloudflare.com URL
        const regex = /https:\/\/([a-z0-9-]+)\.trycloudflare\.com/gi
        for (const match of msg.matchAll(regex)) {
          const host = match[1]
          if (host === 'api') continue
          const url = `https://${host}.trycloudflare.com`
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            currentTunnelUrl = url
            tunnelError = null
            console.log(`[Tunnel] Connected: ${url}`)
            notifyStatusChange()
            resolve({ success: true, tunnelUrl: url })
          } else if (url !== currentTunnelUrl) {
            // URL changed (reconnect)
            currentTunnelUrl = url
            console.log(`[Tunnel] URL changed: ${url}`)
            notifyStatusChange()
          }
        }
      }

      child.stdout?.on('data', handleLog)
      child.stderr?.on('data', handleLog)

      child.on('error', (err) => {
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          tunnelError = err.message
          notifyStatusChange()
          resolve({ success: false, error: err.message })
        }
      })

      child.on('exit', (code) => {
        cloudflaredProcess = null
        currentTunnelUrl = null
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          tunnelError = `cloudflared exited with code ${code}`
          notifyStatusChange()
          resolve({ success: false, error: tunnelError })
        } else {
          // Unexpected exit after connection
          tunnelError = `Tunnel disconnected (exit code ${code})`
          notifyStatusChange()
        }
      })
    })
  } catch (error) {
    tunnelError = (error as Error).message
    notifyStatusChange()
    return { success: false, error: tunnelError }
  }
}

/**
 * Stop the cloudflared tunnel
 */
export function stopTunnel(): void {
  if (cloudflaredProcess) {
    try {
      cloudflaredProcess.kill()
    } catch { /* ignore */ }
    cloudflaredProcess = null
  }
  currentTunnelUrl = null
  tunnelError = null
  notifyStatusChange()
}

/**
 * Get current tunnel status
 */
export function getTunnelStatus(): TunnelStatus {
  return {
    enabled: cloudflaredProcess !== null,
    running: cloudflaredProcess !== null && currentTunnelUrl !== null,
    tunnelUrl: currentTunnelUrl,
    downloading: isDownloading,
    downloadProgress,
    error: tunnelError
  }
}

/**
 * Check if cloudflared binary is already downloaded
 */
export function isCloudflaredInstalled(): boolean {
  if (!fs.existsSync(BIN_PATH)) return false
  const stat = fs.statSync(BIN_PATH)
  return stat.size > 1024 * 1024
}
