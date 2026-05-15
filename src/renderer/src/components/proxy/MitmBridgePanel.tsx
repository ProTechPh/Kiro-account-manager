import { useState, useEffect, useCallback } from 'react'
import { Shield, ShieldCheck, Play, Square, Download, Trash2, Loader2, AlertCircle, CheckCircle, Wifi } from 'lucide-react'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Badge, Label } from '../ui'
import { useTranslation } from '../../hooks/useTranslation'

interface MitmStatus {
  running: boolean
  config: any
  stats: any
  caInfo: any
}

export function MitmBridgePanel() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<MitmStatus | null>(null)
  const [certInstalled, setCertInstalled] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [installingCert, setInstallingCert] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recentRequests, setRecentRequests] = useState<Array<{ timestamp: number; host: string; path: string; isMitm: boolean }>>([])

  const fetchStatus = useCallback(async () => {
    try {
      // Check if kproxy APIs are available (they may not be implemented yet)
      if (typeof window.api.kproxyGetStatus !== 'function') {
        setLoading(false)
        return
      }
      const result = await window.api.kproxyGetStatus()
      setStatus(result)
      // Check cert
      if (typeof window.api.kproxyCheckCaCertInstalled === 'function') {
        const certResult = await window.api.kproxyCheckCaCertInstalled()
        if (certResult.success) {
          setCertInstalled(certResult.installed)
        }
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchStatus()
    // Listen for events (check if APIs exist)
    const unsubReq = typeof window.api.onKproxyRequest === 'function'
      ? window.api.onKproxyRequest((info) => { setRecentRequests(prev => [info, ...prev.slice(0, 9)]) })
      : () => {}
    const unsubStatus = typeof window.api.onKproxyStatusChange === 'function'
      ? window.api.onKproxyStatusChange(() => { fetchStatus() })
      : () => {}
    const unsubError = typeof window.api.onKproxyError === 'function'
      ? window.api.onKproxyError((err) => { setError(err) })
      : () => {}
    return () => { unsubReq(); unsubStatus(); unsubError() }
  }, [fetchStatus])

  const handleStart = async () => {
    if (typeof window.api.kproxyUpdateConfig !== 'function') return
    setStarting(true)
    setError(null)
    try {
      const result = await window.api.kproxyUpdateConfig({ autoStart: true })
      if (!result.success) {
        setError(result.error || 'Failed to start. Run the app as Administrator to use port 443.')
      }
      await fetchStatus()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setStarting(false)
    }
  }

  const handleStop = async () => {
    if (typeof window.api.kproxyUpdateConfig !== 'function') return
    setStopping(true)
    setError(null)
    try {
      await window.api.kproxyUpdateConfig({ autoStart: false })
      await fetchStatus()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setStopping(false)
    }
  }

  const handleInstallCert = async () => {
    if (typeof window.api.kproxyInstallCaCert !== 'function') return
    setInstallingCert(true)
    setError(null)
    try {
      const result = await window.api.kproxyInstallCaCert()
      if (result.success) {
        setCertInstalled(true)
      } else {
        setError(result.error || 'Failed to install certificate')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setInstallingCert(false)
    }
  }

  const handleUninstallCert = async () => {
    if (typeof window.api.kproxyUninstallCaCert !== 'function') return
    setError(null)
    try {
      const result = await window.api.kproxyUninstallCaCert()
      if (result.success) {
        setCertInstalled(false)
      } else {
        setError(result.error || 'Failed to uninstall certificate')
      }
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleExportCert = async () => {
    if (typeof window.api.kproxyExportCaCert !== 'function') return
    try {
      await window.api.kproxyExportCaCert()
    } catch { /* ignore */ }
  }

  const isRunning = status?.running || false

  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/10">
              <Shield className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <CardTitle className="text-lg text-red-600 dark:text-red-400">
                {t('mitmBridge.title')}
              </CardTitle>
              <CardDescription>{t('mitmBridge.description')}</CardDescription>
            </div>
          </div>
          <Badge
            variant={isRunning ? 'default' : 'secondary'}
            className={isRunning
              ? 'bg-green-500 text-white flex items-center gap-1.5'
              : 'bg-muted text-muted-foreground flex items-center gap-1.5'}
          >
            {isRunning && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
              </span>
            )}
            {isRunning ? t('mitmBridge.running') : t('mitmBridge.stopped')}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Certificate Status */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
              <div className="flex items-center gap-3">
                {certInstalled ? (
                  <ShieldCheck className="h-5 w-5 text-green-500" />
                ) : (
                  <Shield className="h-5 w-5 text-muted-foreground" />
                )}
                <div>
                  <Label className="text-sm font-medium">{t('mitmBridge.rootCa')}</Label>
                  <p className="text-xs text-muted-foreground">
                    {certInstalled ? t('mitmBridge.certInstalled') : t('mitmBridge.certNotInstalled')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!certInstalled ? (
                  <Button size="sm" onClick={handleInstallCert} disabled={installingCert} className="gap-1.5">
                    {installingCert ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    {t('mitmBridge.installCert')}
                  </Button>
                ) : (
                  <>
                    <Button size="sm" variant="outline" onClick={handleExportCert} className="gap-1.5">
                      <Download className="h-3.5 w-3.5" />
                      {t('mitmBridge.exportCert')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleUninstallCert} className="gap-1.5 text-red-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Control buttons */}
            <div className="flex items-center gap-3">
              {!isRunning ? (
                <Button onClick={handleStart} disabled={starting} className="gap-2">
                  {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {t('mitmBridge.start')}
                </Button>
              ) : (
                <Button onClick={handleStop} variant="destructive" disabled={stopping} className="gap-2">
                  {stopping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                  {t('mitmBridge.stop')}
                </Button>
              )}
              {!isRunning && (
                <span className="text-[10px] text-muted-foreground">{t('mitmBridge.adminRequired')}</span>
              )}
            </div>

            {/* How it works */}
            <div className="p-3 rounded-lg bg-muted/50 border border-border text-xs space-y-1.5">
              <p className="font-medium text-foreground">{t('mitmBridge.howTitle')}</p>
              <p className="text-muted-foreground">{t('mitmBridge.howDesc')}</p>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {['Kiro IDE', 'Cursor', 'GitHub Copilot', 'Antigravity'].map((tool) => (
                  <div key={tool} className="flex items-center gap-1.5">
                    <Wifi className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground">{tool}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent intercepted requests */}
            {isRunning && recentRequests.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">{t('mitmBridge.recentRequests')}</Label>
                <div className="max-h-[100px] overflow-y-auto space-y-0.5">
                  {recentRequests.slice(0, 5).map((req, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-[10px] font-mono px-2 py-1 rounded bg-muted/30">
                      {req.isMitm ? (
                        <CheckCircle className="h-3 w-3 text-green-500 flex-shrink-0" />
                      ) : (
                        <Wifi className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      )}
                      <span className="text-muted-foreground truncate">{req.host}{req.path}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-500">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Security warning */}
            <div className="p-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
              <p className="text-xs text-amber-700 dark:text-amber-300">
                ⚠️ {t('mitmBridge.warning')}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
