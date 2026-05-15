// MITM Certificate Generation & Installation
// Generates a Root CA, installs it to system trust store, and generates leaf certs per domain

import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { app } from 'electron'
import forge from 'node-forge'

const MITM_DIR = path.join(app.getPath('userData'), 'mitm')
const ROOT_CA_CERT_PATH = path.join(MITM_DIR, 'rootCA.crt')
const ROOT_CA_KEY_PATH = path.join(MITM_DIR, 'rootCA.key')

const IS_WIN = process.platform === 'win32'
const IS_MAC = process.platform === 'darwin'

function ensureMitmDir(): void {
  if (!fs.existsSync(MITM_DIR)) {
    fs.mkdirSync(MITM_DIR, { recursive: true })
  }
}

// ─── Root CA Generation ───────────────────────────────────────────────────────

export function generateRootCA(): { certPath: string; keyPath: string } {
  ensureMitmDir()

  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()

  cert.publicKey = keys.publicKey
  cert.serialNumber = '01' + Date.now().toString(16)
  cert.validity.notBefore = new Date()
  cert.validity.notAfter = new Date()
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10)

  const attrs = [
    { name: 'commonName', value: 'Kiro Account Manager Root CA' },
    { name: 'organizationName', value: 'Kiro Account Manager' },
    { name: 'countryName', value: 'US' }
  ]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)

  cert.setExtensions([
    { name: 'basicConstraints', cA: true, critical: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
    { name: 'subjectKeyIdentifier' }
  ])

  cert.sign(keys.privateKey, forge.md.sha256.create())

  const certPem = forge.pki.certificateToPem(cert)
  const keyPem = forge.pki.privateKeyToPem(keys.privateKey)

  fs.writeFileSync(ROOT_CA_CERT_PATH, certPem)
  fs.writeFileSync(ROOT_CA_KEY_PATH, keyPem)

  console.log('[MITM] Root CA generated successfully')
  return { certPath: ROOT_CA_CERT_PATH, keyPath: ROOT_CA_KEY_PATH }
}

export function hasRootCA(): boolean {
  return fs.existsSync(ROOT_CA_CERT_PATH) && fs.existsSync(ROOT_CA_KEY_PATH)
}

export function getRootCACertPath(): string {
  return ROOT_CA_CERT_PATH
}

export function getRootCAFingerprint(): string | null {
  if (!fs.existsSync(ROOT_CA_CERT_PATH)) return null
  try {
    const certPem = fs.readFileSync(ROOT_CA_CERT_PATH, 'utf8')
    const cert = forge.pki.certificateFromPem(certPem)
    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()
    const md = forge.md.sha256.create()
    md.update(der)
    return md.digest().toHex().toUpperCase().match(/.{2}/g)?.join(':') || null
  } catch {
    return null
  }
}

// ─── System Trust Store Installation ──────────────────────────────────────────

export function installRootCA(): { success: boolean; message?: string; error?: string } {
  if (!fs.existsSync(ROOT_CA_CERT_PATH)) {
    // Generate if not exists
    generateRootCA()
  }

  try {
    if (IS_WIN) {
      // Windows: use certutil to add to Trusted Root store
      execSync(`certutil -addstore -user "Root" "${ROOT_CA_CERT_PATH}"`, {
        windowsHide: true,
        stdio: 'pipe'
      })
      console.log('[MITM] Root CA installed to Windows trust store')
      return { success: true, message: 'Certificate installed to Windows trust store' }
    } else if (IS_MAC) {
      // macOS: use security command
      execSync(`security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "${ROOT_CA_CERT_PATH}"`, {
        stdio: 'pipe'
      })
      console.log('[MITM] Root CA installed to macOS Keychain')
      return { success: true, message: 'Certificate installed to macOS Keychain' }
    } else {
      // Linux: copy to ca-certificates
      const destDir = '/usr/local/share/ca-certificates'
      const destPath = path.join(destDir, 'kiro-mitm-root-ca.crt')
      execSync(`cp "${ROOT_CA_CERT_PATH}" "${destPath}" && update-ca-certificates`, {
        stdio: 'pipe'
      })
      console.log('[MITM] Root CA installed to Linux trust store')
      return { success: true, message: 'Certificate installed to Linux trust store' }
    }
  } catch (err) {
    const msg = (err as Error).message || 'Unknown error'
    console.error('[MITM] Failed to install Root CA:', msg)
    return { success: false, error: `Failed to install certificate: ${msg}` }
  }
}

export function uninstallRootCA(): { success: boolean; message?: string; error?: string } {
  try {
    if (IS_WIN) {
      // Find and remove by subject name
      execSync(`certutil -delstore -user "Root" "Kiro Account Manager Root CA"`, {
        windowsHide: true,
        stdio: 'pipe'
      })
      return { success: true, message: 'Certificate removed from Windows trust store' }
    } else if (IS_MAC) {
      execSync(`security remove-trusted-cert -d "${ROOT_CA_CERT_PATH}"`, { stdio: 'pipe' })
      return { success: true, message: 'Certificate removed from macOS Keychain' }
    } else {
      const destPath = '/usr/local/share/ca-certificates/kiro-mitm-root-ca.crt'
      if (fs.existsSync(destPath)) {
        execSync(`rm "${destPath}" && update-ca-certificates`, { stdio: 'pipe' })
      }
      return { success: true, message: 'Certificate removed from Linux trust store' }
    }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

export function checkRootCAInstalled(): boolean {
  if (!fs.existsSync(ROOT_CA_CERT_PATH)) return false

  try {
    if (IS_WIN) {
      const result = execSync(`certutil -verifystore -user "Root" "Kiro Account Manager Root CA"`, {
        windowsHide: true,
        stdio: 'pipe',
        encoding: 'utf8'
      })
      return result.includes('Kiro Account Manager')
    } else if (IS_MAC) {
      const result = execSync(`security find-certificate -c "Kiro Account Manager Root CA" /Library/Keychains/System.keychain`, {
        stdio: 'pipe',
        encoding: 'utf8'
      })
      return result.includes('Kiro Account Manager')
    } else {
      return fs.existsSync('/usr/local/share/ca-certificates/kiro-mitm-root-ca.crt')
    }
  } catch {
    return false
  }
}

export function exportRootCA(exportPath?: string): { success: boolean; path?: string; error?: string } {
  if (!fs.existsSync(ROOT_CA_CERT_PATH)) {
    return { success: false, error: 'Root CA not found. Generate it first.' }
  }
  const dest = exportPath || path.join(app.getPath('desktop'), 'kiro-mitm-root-ca.crt')
  try {
    fs.copyFileSync(ROOT_CA_CERT_PATH, dest)
    return { success: true, path: dest }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}
