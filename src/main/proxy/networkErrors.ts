/**
 * Network error classification and user-friendly message formatting.
 * Ported from kiro-gateway/kiro/network_errors.py
 */

export enum ErrorCategory {
  DNS_RESOLUTION = 'dns_resolution',
  CONNECTION_REFUSED = 'connection_refused',
  CONNECTION_RESET = 'connection_reset',
  NETWORK_UNREACHABLE = 'network_unreachable',
  TIMEOUT_CONNECT = 'timeout_connect',
  TIMEOUT_READ = 'timeout_read',
  SSL_ERROR = 'ssl_error',
  PROXY_ERROR = 'proxy_error',
  TOO_MANY_REDIRECTS = 'too_many_redirects',
  UNKNOWN = 'unknown',
}

export interface NetworkErrorInfo {
  category: ErrorCategory
  userMessage: string
  troubleshootingSteps: string[]
  technicalDetails: string
  isRetryable: boolean
  suggestedHttpCode: number
}

export function classifyNetworkError(error: unknown): NetworkErrorInfo {
  const err = error as Error & { code?: string; syscall?: string }
  const msg = err?.message?.toLowerCase() ?? ''
  const code = err?.code ?? ''

  // DNS resolution failure
  if (
    code === 'ENOTFOUND' ||
    msg.includes('getaddrinfo') ||
    msg.includes('dns') ||
    msg.includes('name or service not known')
  ) {
    return {
      category: ErrorCategory.DNS_RESOLUTION,
      userMessage: 'Cannot resolve Kiro API hostname. DNS lookup failed.',
      troubleshootingSteps: [
        'Check your internet connection',
        'Verify DNS settings (try 8.8.8.8 or 1.1.1.1)',
        'If in a restricted network, configure VPN_PROXY_URL',
        'Check if q.us-east-1.amazonaws.com is accessible',
      ],
      technicalDetails: err?.message ?? String(error),
      isRetryable: false,
      suggestedHttpCode: 502,
    }
  }

  // Connection refused
  if (code === 'ECONNREFUSED' || msg.includes('connection refused')) {
    return {
      category: ErrorCategory.CONNECTION_REFUSED,
      userMessage: 'Connection to Kiro API was refused.',
      troubleshootingSteps: [
        'Check if the proxy URL is correct',
        'Verify the Kiro API endpoint is reachable',
        'Check firewall or network policies',
      ],
      technicalDetails: err?.message ?? String(error),
      isRetryable: true,
      suggestedHttpCode: 502,
    }
  }

  // Connection reset
  if (
    code === 'ECONNRESET' ||
    msg.includes('connection reset') ||
    msg.includes('socket hang up')
  ) {
    return {
      category: ErrorCategory.CONNECTION_RESET,
      userMessage: 'Connection to Kiro API was reset unexpectedly.',
      troubleshootingSteps: [
        'This may be a temporary network issue — retry the request',
        'Check for unstable network or VPN disconnects',
      ],
      technicalDetails: err?.message ?? String(error),
      isRetryable: true,
      suggestedHttpCode: 502,
    }
  }

  // Network unreachable
  if (
    code === 'ENETUNREACH' ||
    code === 'EHOSTUNREACH' ||
    msg.includes('network unreachable') ||
    msg.includes('host unreachable')
  ) {
    return {
      category: ErrorCategory.NETWORK_UNREACHABLE,
      userMessage: 'Kiro API is unreachable from this network.',
      troubleshootingSteps: [
        'Check your internet connection',
        'If behind a firewall or in China, configure VPN_PROXY_URL',
        'Try a different network',
      ],
      technicalDetails: err?.message ?? String(error),
      isRetryable: false,
      suggestedHttpCode: 502,
    }
  }

  // Connect timeout
  if (
    code === 'ETIMEDOUT' ||
    msg.includes('connect timeout') ||
    msg.includes('connection timed out')
  ) {
    return {
      category: ErrorCategory.TIMEOUT_CONNECT,
      userMessage: 'Connection to Kiro API timed out.',
      troubleshootingSteps: [
        'Check your network latency',
        'If in a high-latency region, configure VPN_PROXY_URL',
        'Retry the request',
      ],
      technicalDetails: err?.message ?? String(error),
      isRetryable: true,
      suggestedHttpCode: 504,
    }
  }

  // Read/response timeout
  if (msg.includes('read timeout') || msg.includes('response timeout') || msg.includes('socket timeout')) {
    return {
      category: ErrorCategory.TIMEOUT_READ,
      userMessage: 'Kiro API did not respond in time.',
      troubleshootingSteps: [
        'The request may be too large — try reducing message length',
        'Retry the request',
      ],
      technicalDetails: err?.message ?? String(error),
      isRetryable: true,
      suggestedHttpCode: 504,
    }
  }

  // SSL/TLS errors
  if (
    code?.startsWith('ERR_TLS') ||
    code?.startsWith('CERT_') ||
    msg.includes('ssl') ||
    msg.includes('certificate') ||
    msg.includes('tls')
  ) {
    return {
      category: ErrorCategory.SSL_ERROR,
      userMessage: 'SSL/TLS error when connecting to Kiro API.',
      troubleshootingSteps: [
        'Check system date/time (certificate validation depends on it)',
        'If using a proxy, ensure it supports HTTPS tunneling',
      ],
      technicalDetails: err?.message ?? String(error),
      isRetryable: false,
      suggestedHttpCode: 502,
    }
  }

  // Proxy errors
  if (msg.includes('proxy') || code === 'ERR_PROXY_CONNECTION_FAILED') {
    return {
      category: ErrorCategory.PROXY_ERROR,
      userMessage: 'Failed to connect through the configured proxy.',
      troubleshootingSteps: [
        'Verify VPN_PROXY_URL is correct',
        'Check proxy credentials if authentication is required',
        'Ensure the proxy server is running',
      ],
      technicalDetails: err?.message ?? String(error),
      isRetryable: false,
      suggestedHttpCode: 502,
    }
  }

  // Unknown
  return {
    category: ErrorCategory.UNKNOWN,
    userMessage: 'An unexpected network error occurred.',
    troubleshootingSteps: [
      'Check your internet connection',
      'Retry the request',
    ],
    technicalDetails: err?.message ?? String(error),
    isRetryable: true,
    suggestedHttpCode: 502,
  }
}

/** Short single-line error message for logging. */
export function getShortErrorMessage(info: NetworkErrorInfo): string {
  return info.userMessage
}
export function formatNetworkErrorResponse(
  info: NetworkErrorInfo,
  format: 'openai' | 'anthropic' = 'openai'
): object {
  const detail = `${info.userMessage} Troubleshooting: ${info.troubleshootingSteps.join(' | ')}`

  if (format === 'anthropic') {
    return {
      type: 'error',
      error: { type: 'api_error', message: detail },
    }
  }

  return {
    error: {
      message: detail,
      type: 'network_error',
      code: info.category,
    },
  }
}
