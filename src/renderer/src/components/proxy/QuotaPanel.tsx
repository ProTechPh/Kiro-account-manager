import { useState, useEffect, useCallback, useMemo } from 'react'
import { Activity, Clock, Zap, TrendingUp, RefreshCw, Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Badge, Button } from '../ui'
import { useAccountsStore } from '../../store/accounts'
import { useTranslation } from '../../hooks/useTranslation'

// ─── Pricing ($/1M tokens) based on 9router's pricing.js ───
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-5': { input: 3.00, output: 15.00 },
  'claude-sonnet-4.5': { input: 3.00, output: 15.00 },
  'claude-haiku-4.5': { input: 0.50, output: 2.50 },
  'claude-opus-4.5': { input: 5.00, output: 25.00 },
  'claude-sonnet-4': { input: 3.00, output: 15.00 },
  'claude-opus-4': { input: 5.00, output: 25.00 },
  'claude-3-5-sonnet': { input: 3.00, output: 15.00 },
}

function getModelPricing(model: string): { input: number; output: number } {
  // Exact match
  if (MODEL_PRICING[model]) return MODEL_PRICING[model]
  // Pattern match
  const lower = model.toLowerCase()
  if (lower.includes('opus')) return { input: 5.00, output: 25.00 }
  if (lower.includes('sonnet')) return { input: 3.00, output: 15.00 }
  if (lower.includes('haiku')) return { input: 0.50, output: 2.50 }
  // Default (Kiro uses Claude models)
  return { input: 3.00, output: 15.00 }
}

function calculateCost(inputTokens: number, outputTokens: number, model?: string): number {
  const pricing = getModelPricing(model || 'claude-sonnet-4.5')
  return (inputTokens * pricing.input / 1_000_000) + (outputTokens * pricing.output / 1_000_000)
}

// ─── Reset countdown ───
function formatCountdown(resetDate: string | number | null | undefined): string {
  if (!resetDate) return '-'
  const resetMs = typeof resetDate === 'number' ? resetDate : new Date(resetDate).getTime()
  const diffMs = resetMs - Date.now()
  if (diffMs <= 0) return 'Now'
  const totalMinutes = Math.ceil(diffMs / 60000)
  if (totalMinutes < 60) return `${totalMinutes}m`
  const hours = Math.floor(totalMinutes / 60)
  const mins = totalMinutes % 60
  if (hours < 24) return `${hours}h ${mins}m`
  const days = Math.floor(hours / 24)
  const remHours = hours % 24
  return `${days}d ${remHours}h ${mins}m`
}

function getStatusColor(percentage: number): { text: string; bg: string; bgLight: string; emoji: string } {
  if (percentage > 70) return { text: 'text-green-500', bg: 'bg-green-500', bgLight: 'bg-green-500/10', emoji: '🟢' }
  if (percentage >= 30) return { text: 'text-yellow-500', bg: 'bg-yellow-500', bgLight: 'bg-yellow-500/10', emoji: '🟡' }
  return { text: 'text-red-500', bg: 'bg-red-500', bgLight: 'bg-red-500/10', emoji: '🔴' }
}

interface QuotaInfo {
  name: string
  used: number
  total: number
  resetAt: string | null
}

interface ProxyStats {
  totalRequests: number
  successRequests: number
  failedRequests: number
  totalTokens: number
  totalCredits: number
  inputTokens: number
  outputTokens: number
  startTime: number
}

interface QuotaPanelProps {
  isRunning: boolean
  stats: ProxyStats | null
}

export function QuotaPanel({ isRunning, stats }: QuotaPanelProps) {
  const { t } = useTranslation()
  const accounts = useAccountsStore(state => state.accounts)
  const [quotas, setQuotas] = useState<QuotaInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [, setLastRefreshed] = useState<number>(0)
  const [countdown, setCountdown] = useState(60)
  const [, setTick] = useState(0) // Force re-render for countdown

  // Fetch quota from active accounts
  const fetchQuota = useCallback(async () => {
    setLoading(true)
    try {
      const activeAccounts = Array.from(accounts.values()).filter(a => a.status === 'active')
      const newQuotas: QuotaInfo[] = []

      for (const acc of activeAccounts.slice(0, 5)) { // Limit to 5 accounts
        try {
          const result = await window.api.checkAccountStatus(acc)
          if (result.success && result.data?.usage) {
            const usage = result.data.usage
            newQuotas.push({
              name: acc.email || acc.id.substring(0, 12),
              used: usage.current || 0,
              total: usage.limit || 0,
              resetAt: usage.nextResetDate || null
            })
          }
        } catch { /* skip failed accounts */ }
      }

      setQuotas(newQuotas)
      setLastRefreshed(Date.now())
      setCountdown(60)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [accounts])

  // Auto-refresh countdown
  useEffect(() => {
    if (!isRunning) return
    const timer = setInterval(() => {
      setTick(t => t + 1)
      setCountdown(prev => {
        if (prev <= 1) {
          fetchQuota()
          return 60
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [isRunning, fetchQuota])

  // Initial fetch
  useEffect(() => {
    if (isRunning && accounts.size > 0 && quotas.length === 0) {
      fetchQuota()
    }
  }, [isRunning, accounts.size]) // eslint-disable-line

  // Cost estimation from proxy stats
  const estimatedCost = useMemo(() => {
    if (!stats) return 0
    return calculateCost(stats.inputTokens || 0, stats.outputTokens || 0)
  }, [stats])

  // Tokens per minute (from session)
  const tokensPerMinute = useMemo(() => {
    if (!stats || !stats.startTime) return 0
    const elapsedMinutes = (Date.now() - stats.startTime) / 60000
    if (elapsedMinutes < 1) return (stats.inputTokens || 0) + (stats.outputTokens || 0)
    return Math.round(((stats.inputTokens || 0) + (stats.outputTokens || 0)) / elapsedMinutes)
  }, [stats])

  if (!isRunning) return null

  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10">
              <Activity className="h-5 w-5 text-cyan-500" />
            </div>
            <div>
              <CardTitle className="text-lg text-cyan-600 dark:text-cyan-400">
                {t('quota.title')}
              </CardTitle>
              <CardDescription>{t('quota.description')}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground tabular-nums">{countdown}s</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchQuota} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overview cards */}
        <div className="grid grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Zap className="h-3 w-3" />
              <span>{t('quota.inputTokens')}</span>
            </div>
            <div className="text-lg font-bold text-foreground">{((stats?.inputTokens || 0) / 1000).toFixed(1)}K</div>
          </div>
          <div className="p-3 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Zap className="h-3 w-3" />
              <span>{t('quota.outputTokens')}</span>
            </div>
            <div className="text-lg font-bold text-foreground">{((stats?.outputTokens || 0) / 1000).toFixed(1)}K</div>
          </div>
          <div className="p-3 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <TrendingUp className="h-3 w-3" />
              <span>{t('quota.estCost')}</span>
            </div>
            <div className="text-lg font-bold text-amber-500">~${estimatedCost.toFixed(4)}</div>
            <div className="text-[10px] text-muted-foreground">{t('quota.estCostHint')}</div>
          </div>
          <div className="p-3 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Clock className="h-3 w-3" />
              <span>{t('quota.tokensPerMin')}</span>
            </div>
            <div className="text-lg font-bold text-foreground">{tokensPerMinute.toLocaleString()}</div>
          </div>
        </div>

        {/* Quota progress bars */}
        {quotas.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">{t('quota.accountQuotas')}</span>
              <Badge variant="secondary" className="text-[10px]">{quotas.length} {t('quota.accounts')}</Badge>
            </div>
            {quotas.map((quota, idx) => {
              const remaining = quota.total > 0 ? Math.round(((quota.total - quota.used) / quota.total) * 100) : 0
              const colors = getStatusColor(remaining)
              const resetCountdown = formatCountdown(quota.resetAt)

              return (
                <div key={idx} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[10px]">{colors.emoji}</span>
                      <span className="font-medium text-foreground truncate">{quota.name}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`font-medium text-xs ${colors.text}`}>{remaining}%</span>
                      {resetCountdown !== '-' && (
                        <span className="text-[10px] text-muted-foreground">
                          {t('quota.resetIn')} {resetCountdown}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={`h-2 rounded-full overflow-hidden ${colors.bgLight}`}>
                    <div
                      className={`h-full transition-all duration-500 ${colors.bg}`}
                      style={{ width: `${Math.min(remaining, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{quota.used.toFixed(2)} / {quota.total.toFixed(2)} credits</span>
                    {quota.resetAt && (
                      <span>{new Date(quota.resetAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Empty state */}
        {quotas.length === 0 && !loading && (
          <p className="text-xs text-muted-foreground text-center py-2">
            {t('quota.noAccounts')}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
