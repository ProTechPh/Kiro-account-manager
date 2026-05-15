import { useState, useEffect, useCallback } from 'react'
import { Globe, Copy, Check, Cloud, Play, Square, Loader2, AlertCircle } from 'lucide-react'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Label, Badge } from '../ui'
import { useTranslation } from '../../hooks/useTranslation'

interface TunnelStatus {
  enabled: boolean
  running: boolean
  tunnelUrl: string | null
  downloading: boolean
  downloadProgress: number
  error: string | null
}

interface PublicAccessPanelProps {
  isRunning: boolean
  port: number
}

export function PublicAccessPanel({ isRunning, port }: PublicAccessPanelProps) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<TunnelStatus>({
    enabled: false, running: false, tunnelUrl: null,
    downloading: false, downloadProgress: 0, error: null
  })
  const [isStarting, setIsStarting] = useState(false)
  const [copiedTunnel, setCopiedTunnel] = useState(false)

  // Fetch tunnel status
  const fetchStatus = useCallback(async () => {
    try {
      const result = await window.api.proxyTunnelStatus()
      setStatus(result)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetchStatus()
    // Poll status every 5s
    const interval = setInterval(fetchStatus, 5000)
    // Listen for status changes
    const unsub = window.api.onProxyTunnelStatusChange((newStatus) => {
      setStatus(newStatus)
    })
    return () => {
      clearInterval(interval)
      unsub()
    }
  }, [fetchStatus])

  const handleStart = async () => {
    setIsStarting(true)
    setStatus(prev => ({ ...prev, error: null }))
    try {
      const result = await window.api.proxyTunnelStart(port)
      if (result.success) {
        setStatus(prev => ({ ...prev, enabled: true, running: true, tunnelUrl: result.tunnelUrl || null, error: null }))
      } else {
        setStatus(prev => ({ ...prev, error: result.error || 'Failed to start' }))
      }
    } catch (err) {
      setStatus(prev => ({ ...prev, error: (err as Error).message }))
    } finally {
      setIsStarting(false)
    }
  }

  const handleStop = async () => {
    await window.api.proxyTunnelStop()
    setStatus({ enabled: false, running: false, tunnelUrl: null, downloading: false, downloadProgress: 0, error: null })
  }

  const copyTunnelUrl = () => {
    if (status.tunnelUrl) {
      navigator.clipboard.writeText(status.tunnelUrl)
      setCopiedTunnel(true)
      setTimeout(() => setCopiedTunnel(false), 2000)
    }
  }

  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-500/10">
              <Globe className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <CardTitle className="text-lg text-orange-600 dark:text-orange-400">
                {t('publicAccess.title')}
              </CardTitle>
              <CardDescription>
                {t('publicAccess.description')}
              </CardDescription>
            </div>
          </div>
          <Badge
            variant={status.running ? 'default' : 'secondary'}
            className={status.running
              ? 'bg-green-500 text-white flex items-center gap-1.5'
              : 'bg-muted text-muted-foreground flex items-center gap-1.5'}
          >
            {status.running && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
              </span>
            )}
            {status.running ? t('publicAccess.tunnelConnected') : t('publicAccess.disabled')}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Benefits */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { icon: '🌐', label: t('publicAccess.benefitAnywhere') },
            { icon: '👥', label: t('publicAccess.benefitShare') },
            { icon: '🔒', label: t('publicAccess.benefitEncrypted') },
            { icon: '⚡', label: t('publicAccess.benefitNoAccount') }
          ].map((b, i) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 text-xs">
              <span>{b.icon}</span>
              <span className="text-muted-foreground">{b.label}</span>
            </div>
          ))}
        </div>

        {/* Control buttons */}
        <div className="flex items-center gap-3">
          {!status.running ? (
            <Button
              onClick={handleStart}
              disabled={!isRunning || isStarting || status.downloading}
              className="gap-2"
            >
              {isStarting || status.downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {status.downloading
                ? `${t('publicAccess.tunnelDownloading')} ${status.downloadProgress}%`
                : isStarting
                  ? t('publicAccess.tunnelConnecting')
                  : t('publicAccess.tunnelStart')}
            </Button>
          ) : (
            <Button onClick={handleStop} variant="destructive" className="gap-2">
              <Square className="h-4 w-4" />
              {t('publicAccess.tunnelStop')}
            </Button>
          )}
          {!isRunning && !status.running && (
            <span className="text-xs text-muted-foreground">
              {t('publicAccess.tunnelNeedsProxy')}
            </span>
          )}
        </div>

        {/* Tunnel URL */}
        {status.tunnelUrl && (
          <div className="space-y-2 p-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20">
            <Label className="text-sm font-medium text-green-700 dark:text-green-300 flex items-center gap-2">
              <Cloud className="h-4 w-4" />
              {t('publicAccess.tunnelPublicUrl')}
            </Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-background rounded text-sm font-mono border border-border truncate">
                {status.tunnelUrl}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={copyTunnelUrl}
              >
                {copiedTunnel ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('publicAccess.tunnelUrlHint')}
            </p>
          </div>
        )}

        {/* Error */}
        {status.error && (
          <div className="flex items-center gap-2 text-sm text-red-500">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{status.error}</span>
          </div>
        )}

        {/* Info */}
        {!status.running && !isStarting && !status.downloading && (
          <p className="text-xs text-muted-foreground">
            {t('publicAccess.tunnelHint')}
          </p>
        )}

        {/* Security warning when running */}
        {status.running && (
          <div className="p-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            <p className="text-xs text-amber-700 dark:text-amber-300">
              ⚠️ {t('publicAccess.securityWarning')}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
