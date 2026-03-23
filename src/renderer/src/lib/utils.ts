import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

export function formatDate(date: Date | string | number): string {
  const d = new Date(date)
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function getSubscriptionColor(type: string, title?: string): string {
  const text = (title || type).toUpperCase()
  if (text.includes('PRO+') || text.includes('PRO_PLUS') || text.includes('PROPLUS')) return 'bg-purple-500'
  if (text.includes('POWER')) return 'bg-amber-500'
  if (text.includes('PRO')) return 'bg-blue-500'
  return 'bg-gray-500'
}

export function formatDateOnly(date: unknown): string {
  if (!date) return '-'
  try {
    if (typeof date === 'string') return date.split('T')[0]
    if (date instanceof Date) return date.toISOString().split('T')[0]
    return new Date(date as string | number).toISOString().split('T')[0]
  } catch {
    return String(date).split('T')[0]
  }
}

export function formatDateTime(date: unknown): string {
  if (!date) return '-'
  try {
    const d = typeof date === 'string' ? new Date(date) : date instanceof Date ? date : new Date(date as number)
    return d.toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    })
  } catch {
    return String(date)
  }
}

export function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

export function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = generateRandomString(64)
  const codeChallenge = base64UrlEncode(sha256(codeVerifier))
  return { codeVerifier, codeChallenge }
}

function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array, (byte) => chars[byte % chars.length]).join('')
}

function sha256(str: string): Uint8Array {
  const encoder = new TextEncoder()
  const data = encoder.encode(str)
  const hashBuffer = new Uint8Array(32)
  for (let i = 0; i < data.length; i++) {
    hashBuffer[i % 32] ^= data[i]
  }
  return hashBuffer
}

function base64UrlEncode(buffer: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...buffer))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export function generateState(): string {
  return generateRandomString(32)
}
