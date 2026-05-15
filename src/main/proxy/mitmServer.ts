// MITM Bridge Server - Intercepts IDE HTTPS traffic on port 443
// Requires admin privileges on Windows to bind port 443 and modify hosts file

import https from 'https'
import http from 'http'
import tls from 'tls'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { app } from 'electron'
import forge from 'node-forge'

const IS_WIN = process.platform === 'win32'
const MITM_DIR = path.join(app.getPath('userData'), 'mitm')
const ROOT_CA_CERT_PATH = path.join(MITM_DIR, 'rootCA.crt')
const ROOT_CA_KEY_PATH = path.join(MITM_DIR, 'rootCA.key')
const MITM_PORT = 443

// Hosts that we intercept (Kiro IDE traffic)
const INTERCEPT_HOSTS: Record<string, string> = {
  'q.us-east-1.amazonaws.com': 'kiro',
  'codewhisperer.us-east-1.amazonaws.com': 'kiro',
}

// URL patterns that indicate a chat/completion request
const CHAT_URL_PATTERNS = [
  '/generateAssistantResponse',
  '/chat/completions',
  '/v1/messages',
]

export interface MitmServerStatus {
  running: boolean
  port: number
  interceptedHosts: string[]
  hostsModified: boolean
  error: string | null
}

let mitmServer: https.Server | null = null
let mitmStatus: MitmServerStatus = {
  running: false,
  port: MITM_PORT,
  interceptedHosts: [],
  hostsModified: false,
  error: null
}
let statusCallback: ((status: MitmServerStatus) => void) | null = null
let requestCallback: ((info: { timestamp: number; host: string; path: string; method: string; isMitm: boolean }) => void) | null = null

export function setMitmStatusCallback(cb: ((status: MitmServerStatus) => void) | null): void {
  statusCallback = cb
}

export function setMitmRequestCallback(cb: ((info: { timestamp: number; host: string; path: string; method: string; isMitm: boolean }) => void) | null): void {
  requestCallback = cb
}

function notifyStatus(): void {
  statusCallback?.(mitmStatus)
}

// ─── Dynamic Cert Generation (per-domain, signed by Root CA) ──────────────────

const certCache = new Map<string, tls.SecureContext>()
let rootCACert: forge.pki.Certificate | null = null
let rootCAKey: forge.pki.rsa.PrivateKey | null = null

function loadRootCA(): boolean {
  try {
    if (!fs.existsSync(ROOT_CA_CERT_PATH) || !fs.existsSync(ROOT_CA_KEY_PATH)) return false
    const certPem = fs.readFileSync(ROOT_CA_CERT_PATH, 'utf8')
    const keyPem = fs.readFileSync(ROOT_CA_KEY_PATH, 'utf8')
    rootCACert = forge.pki.certificateFromPem(certPem)
    rootCAKey = forge.pki.privateKeyFromPem(keyPem)
    return true
  } catch {
    return false
  }
}

function generateLeafCert(domain: string): { key: string; cert: string } | null {
  if (!rootCACert || !rootCAKey) return null

  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = Date.now().toString(16)
  cert.validity.notBefore = new Date()
  cert.validity.notAfter = new Date()
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1)

  cert.setSubject([{ name: 'commonName', value: domain }])
  cert.setIssuer(rootCACert.subject.attributes)

  cert.setExtensions([
    { name: 'subjectAltName', altNames: [{ type: 2 as unknown as string, value: domain }] },
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
    { name: 'extKeyUsage', serverAuth: true }
  ])

  cert.sign(rootCAKey, forge.md.sha256.create())

  return {
    key: forge.pki.privateKeyToPem(keys.privateKey),
    cert: forge.pki.certificateToPem(cert)
  }
}

function sniCallback(servername: string, cb: (err: Error | null, ctx?: tls.SecureContext) => void): void {
  try {
    if (certCache.has(servername)) {
      cb(null, certCache.get(servername)!)
      return
    }
    const leafCert = generateLeafCert(servername)
    if (!leafCert) {
      cb(new Error(`Failed to generate cert for ${servername}`))
      return
    }
    const rootCertPem = fs.readFileSync(ROOT_CA_CERT_PATH, 'utf8')
    const ctx = tls.createSecureContext({
      key: leafCert.key,
      cert: `${leafCert.cert}\n${rootCertPem}`
    })
    certCache.set(servername, ctx)
    cb(null, ctx)
  } catch (e) {
    cb(e as Error)
  }
}

// ─── Hosts File Management ────────────────────────────────────────────────────

function getHostsFilePath(): string {
  if (IS_WIN) {
    return path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts')
  }
  return '/etc/hosts'
}

function addHostsEntries(): boolean {
  const hostsPath = getHostsFilePath()
  try {
    let content = fs.readFileSync(hostsPath, 'utf8')
    const hosts = Object.keys(INTERCEPT_HOSTS)
    let modified = false

    for (const host of hosts) {
      if (!content.includes(host)) {
        content += `\n127.0.0.1 ${host} # Kiro MITM Bridge`
        modified = true
      }
    }

    if (modified) {
      if (IS_WIN) {
        // On Windows, write directly (app should be running as admin for port 443)
        fs.writeFileSync(hostsPath, content, 'utf8')
        // Flush DNS cache
        try { execSync('ipconfig /flushdns', { windowsHide: true, stdio: 'pipe' }) } catch { /* ignore */ }
      } else {
        // On Unix, need sudo
        const lines = hosts.map(h => `127.0.0.1 ${h} # Kiro MITM Bridge`)
        execSync(`echo "${lines.join('\n')}" | sudo tee -a ${hostsPath}`, { stdio: 'pipe' })
      }
    }

    mitmStatus.hostsModified = true
    return true
  } catch (err) {
    console.error('[MITM] Failed to modify hosts file:', (err as Error).message)
    return false
  }
}

function removeHostsEntries(): boolean {
  const hostsPath = getHostsFilePath()
  try {
    let content = fs.readFileSync(hostsPath, 'utf8')
    const lines = content.split(/\r?\n/)
    const filtered = lines.filter(line => !line.includes('# Kiro MITM Bridge'))
    const newContent = filtered.join(IS_WIN ? '\r\n' : '\n')

    if (newContent !== content) {
      fs.writeFileSync(hostsPath, newContent, 'utf8')
      if (IS_WIN) {
        try { execSync('ipconfig /flushdns', { windowsHide: true, stdio: 'pipe' }) } catch { /* ignore */ }
      }
    }

    mitmStatus.hostsModified = false
    return true
  } catch (err) {
    console.error('[MITM] Failed to restore hosts file:', (err as Error).message)
    return false
  }
}

// ─── Request Forwarding ───────────────────────────────────────────────────────

function forwardToProxy(req: http.IncomingMessage, res: http.ServerResponse, body: Buffer): void {
  // Forward to the local proxy server
  const proxyPort = 5580 // Default proxy port
  const options: http.RequestOptions = {
    hostname: '127.0.0.1',
    port: proxyPort,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: req.headers.host || '' }
  }

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
    proxyRes.pipe(res)
  })

  proxyReq.on('error', (err) => {
    console.error('[MITM] Forward error:', err.message)
    if (!res.headersSent) res.writeHead(502)
    res.end('Bad Gateway - Proxy server not running')
  })

  if (body.length > 0) proxyReq.write(body)
  proxyReq.end()
}

async function passthrough(req: http.IncomingMessage, res: http.ServerResponse, body: Buffer): Promise<void> {
  // Forward to the real upstream server (non-intercepted requests)
  const host = (req.headers.host || '').split(':')[0]
  
  return new Promise((resolve) => {
    const options: https.RequestOptions = {
      hostname: host,
      port: 443,
      path: req.url,
      method: req.method,
      headers: { ...req.headers },
      rejectUnauthorized: false
    }

    const fwdReq = https.request(options, (fwdRes) => {
      res.writeHead(fwdRes.statusCode || 502, fwdRes.headers)
      fwdRes.pipe(res)
      fwdRes.on('end', resolve)
    })

    fwdReq.on('error', (_err) => {
      if (!res.headersSent) res.writeHead(502)
      res.end('Bad Gateway')
      resolve()
    })

    if (body.length > 0) fwdReq.write(body)
    fwdReq.end()
  })
}

// ─── Server Lifecycle ─────────────────────────────────────────────────────────

export async function startMitmServer(): Promise<{ success: boolean; error?: string }> {
  if (mitmServer) {
    return { success: true } // Already running
  }

  // Load Root CA
  if (!loadRootCA()) {
    return { success: false, error: 'Root CA not found. Install the certificate first.' }
  }

  // Modify hosts file
  const hostsOk = addHostsEntries()
  if (!hostsOk) {
    return { success: false, error: 'Failed to modify hosts file. Run as Administrator.' }
  }

  return new Promise((resolve) => {
    const rootKey = fs.readFileSync(ROOT_CA_KEY_PATH)
    const rootCert = fs.readFileSync(ROOT_CA_CERT_PATH)

    mitmServer = https.createServer({
      key: rootKey,
      cert: rootCert,
      SNICallback: sniCallback
    }, async (req, res) => {
      try {
        // Health check endpoint
        if (req.url === '/_mitm_health') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, pid: process.pid }))
          return
        }

        // Collect body
        const chunks: Buffer[] = []
        req.on('data', (chunk: Buffer) => chunks.push(chunk))
        req.on('end', async () => {
          const body = Buffer.concat(chunks)
          const host = (req.headers.host || '').split(':')[0]
          const isChatRequest = CHAT_URL_PATTERNS.some(p => (req.url || '').includes(p))
          const isIntercepted = host in INTERCEPT_HOSTS

          // Notify UI
          requestCallback?.({
            timestamp: Date.now(),
            host,
            path: req.url || '/',
            method: req.method || 'GET',
            isMitm: isIntercepted && isChatRequest
          })

          if (isIntercepted && isChatRequest) {
            // Forward to our proxy server for processing
            forwardToProxy(req, res, body)
          } else {
            // Pass through to real upstream
            await passthrough(req, res, body)
          }
        })
      } catch (err) {
        if (!res.headersSent) res.writeHead(500)
        res.end('Internal Server Error')
      }
    })

    mitmServer.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        mitmStatus.error = 'Port 443 is already in use. Close other HTTPS servers first.'
      } else if (err.code === 'EACCES') {
        mitmStatus.error = 'Permission denied for port 443. Run as Administrator.'
      } else {
        mitmStatus.error = err.message
      }
      mitmServer = null
      mitmStatus.running = false
      notifyStatus()
      resolve({ success: false, error: mitmStatus.error })
    })

    mitmServer.listen(MITM_PORT, '127.0.0.1', () => {
      console.log(`[MITM] Server listening on port ${MITM_PORT}`)
      mitmStatus.running = true
      mitmStatus.port = MITM_PORT
      mitmStatus.interceptedHosts = Object.keys(INTERCEPT_HOSTS)
      mitmStatus.error = null
      notifyStatus()
      resolve({ success: true })
    })
  })
}

export function stopMitmServer(): { success: boolean } {
  if (mitmServer) {
    mitmServer.close()
    mitmServer = null
  }

  // Restore hosts file
  removeHostsEntries()

  // Clear cert cache
  certCache.clear()

  mitmStatus.running = false
  mitmStatus.interceptedHosts = []
  mitmStatus.error = null
  notifyStatus()

  console.log('[MITM] Server stopped')
  return { success: true }
}

export function getMitmServerStatus(): MitmServerStatus {
  return { ...mitmStatus }
}
