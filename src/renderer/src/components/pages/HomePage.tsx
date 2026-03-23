import { useMemo, useEffect, useState } from 'react'
import { useAccountsStore } from '@/store/accounts'
import { Card, CardContent, CardHeader, CardTitle } from '../ui'
import { Users, CheckCircle, AlertTriangle, Clock, Zap, Shield, Download, FolderPlus, Tag, TrendingUp, Activity, BarChart3 } from 'lucide-react'
import kiroLogo from '@/assets/kiro-high-resolution-logo-transparent.png'
import { cn, getSubscriptionColor } from '@/lib/utils'
import { useTranslation } from '@/hooks/useTranslation'

export function HomePage() {
  const { accounts, getStats, usagePrecision } = useAccountsStore()
  const { t } = useTranslation()
  const stats = getStats()
  
  // API Gateway status
  const [gatewayStatus, setGatewayStatus] = useState<{
    running: boolean
    port?: number
    stats?: {
      totalRequests: number
      successRequests: number
      failedRequests: number
    }
  }>({ running: false })

  // Fetch gateway status
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const status = await window.api.proxyGetStatus()
        setGatewayStatus({
          running: status.running,
          port: status.config?.port
        })
      } catch (error) {
        console.error('Failed to fetch gateway status:', error)
      }
    }
    
    // Initial fetch
    fetchStatus()

    // Listen for status changes
    const unsubscribe = window.api.onProxyStatusChange?.((status) => {
      setGatewayStatus({
        running: status.running,
        port: status.port
      })
    })

    return () => {
      unsubscribe?.()
    }
  }, [])

  // 计算额度统计
  const usageStats = useMemo(() => {
    let totalLimit = 0
    let totalUsed = 0
    let validAccountCount = 0

    Array.from(accounts.values()).forEach(account => {
      // 只统计正常状态的账号
      if (account.status === 'active' && account.usage) {
        const limit = account.usage.limit ?? 0
        const used = account.usage.current ?? 0
        if (limit > 0) {
          totalLimit += limit
          totalUsed += used
          validAccountCount++
        }
      }
    })

    const remaining = totalLimit - totalUsed
    const percentUsed = totalLimit > 0 ? (totalUsed / totalLimit) * 100 : 0

    return {
      totalLimit,
      totalUsed,
      remaining,
      percentUsed,
      validAccountCount
    }
  }, [accounts])

  const statCards = [
    {
      label: t('home.totalAccounts'),
      value: stats.total,
      icon: Users,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10'
    },
    {
      label: t('home.activeAccounts'),
      value: stats.byStatus?.active || 0,
      icon: CheckCircle,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10'
    },
    {
      label: t('status.banned'),
      value: stats.byStatus?.error || 0,
      icon: AlertTriangle,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10'
    },
    {
      label: t('accounts.filters.expiring'),
      value: stats.expiringSoonCount,
      icon: Clock,
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10'
    },
  ]

  // 获取当前活跃账号
  const activeAccount = Array.from(accounts.values()).find(a => a.isActive)

  return (
    <div className="flex-1 p-8 lg:px-10 pt-6 space-y-6 overflow-auto">
      {/* Header with gradient background */}
      <div className="relative overflow-hidden rounded-[32px] bg-card p-8 border-0 shadow-sm">
        <div className="relative flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center p-2">
            <img 
              src={kiroLogo} 
              alt="Kiro" 
              className="h-full w-full object-contain" 
            />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground tracking-tight">
              {t('home.welcomeTitle')}
            </h1>
            <p className="text-muted-foreground font-medium">
              {t('home.welcomeDesc')}
            </p>
          </div>
        </div>
      </div>

      {/* API Gateway Status Card - Kiro Style */}
      {gatewayStatus.running ? (
        <div className="relative overflow-hidden rounded-[32px] bg-[#EBFD93] p-8 border-0 shadow-sm">
          {/* Decorative background heartbeat */}
          <div className="absolute right-0 bottom-0 opacity-10">
            <Activity className="h-64 w-64 -mb-16 -mr-16" />
          </div>
          
          <div className="relative">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Activity className="h-6 w-6 text-lime-900" />
                <span className="text-sm font-semibold text-lime-900 tracking-wide uppercase">
                  {t('home.gatewayStatus')}
                </span>
              </div>
              <div className="px-3 py-1 rounded-full bg-black text-[#EBFD93] text-xs font-bold uppercase tracking-wider">
                {t('home.gatewayActive')}
              </div>
            </div>

            <div>
              <h2 className="text-5xl lg:text-6xl font-bold tracking-tighter text-lime-950 mb-2">
                {t('home.gatewayOnline')}
              </h2>
              <p className="text-lime-800 font-medium text-sm font-mono">
                {t('home.gatewayPort', { port: gatewayStatus.port || 5580 })}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-[32px] bg-card p-8 border-0 shadow-sm">
          <div className="relative">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Activity className="h-6 w-6 text-muted-foreground" />
                <span className="text-sm font-semibold text-muted-foreground tracking-wide uppercase">
                  {t('home.gatewayStatus')}
                </span>
              </div>
              <div className="px-3 py-1 rounded-full bg-muted text-muted-foreground text-xs font-bold uppercase tracking-wider">
                {t('home.gatewayOffline')}
              </div>
            </div>

            <div>
              <h2 className="text-5xl lg:text-6xl font-bold tracking-tighter text-muted-foreground mb-2">
                {t('home.gatewayStopped')}
              </h2>
              <p className="text-muted-foreground font-medium text-sm">
                {t('home.gatewayReady')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.label} className="border-0 shadow-sm hover:shadow-md transition-all duration-200 rounded-[24px]">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                    <Icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-3xl font-bold tracking-tight text-foreground">{stat.value}</p>
                    <p className="text-xs text-muted-foreground font-medium">{stat.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Usage Stats */}
      {usageStats.validAccountCount > 0 && (
        <Card className="border-0 shadow-sm hover:shadow-md transition-all duration-200 rounded-[24px]">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-3 font-bold tracking-tight">
              <div className="p-2.5 rounded-xl bg-muted">
                <BarChart3 className="h-5 w-5 text-foreground" />
              </div>
              {t('home.usageStats')}
              <span className="text-xs font-normal text-muted-foreground">
                ({t('home.basedOnAccounts', { count: usageStats.validAccountCount })})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="p-4 bg-muted rounded-[20px]">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                  <span className="text-xs text-muted-foreground font-medium">{t('home.totalQuotaLabel')}</span>
                </div>
                <p className="text-2xl font-bold tracking-tight text-foreground">{usageStats.totalLimit.toLocaleString()}</p>
              </div>
              <div className="p-4 bg-muted rounded-[20px]">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="h-4 w-4 text-orange-500" />
                  <span className="text-xs text-muted-foreground font-medium">{t('home.usedQuota')}</span>
                </div>
                <p className="text-2xl font-bold tracking-tight text-foreground">{usageStats.totalUsed.toLocaleString()}</p>
              </div>
              <div className="p-4 bg-muted rounded-[20px]">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="h-4 w-4 text-green-500" />
                  <span className="text-xs text-muted-foreground font-medium">{t('home.remainingQuota')}</span>
                </div>
                <p className="text-2xl font-bold tracking-tight text-green-600">{usageStats.remaining.toLocaleString()}</p>
              </div>
              <div className="p-4 bg-muted rounded-[20px]">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="h-4 w-4 text-purple-500" />
                  <span className="text-xs text-muted-foreground font-medium">{t('home.usagePercent')}</span>
                </div>
                <p className="text-2xl font-bold tracking-tight text-foreground">{usageStats.percentUsed.toFixed(usagePrecision ? 2 : 1)}%</p>
              </div>
            </div>
            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground font-medium">
                <span>{t('home.overallProgress')}</span>
                <span>{usageStats.totalUsed.toLocaleString()} / {usageStats.totalLimit.toLocaleString()}</span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full rounded-full transition-all",
                    usageStats.percentUsed < 50 && "bg-green-500",
                    usageStats.percentUsed >= 50 && usageStats.percentUsed < 80 && "bg-yellow-500",
                    usageStats.percentUsed >= 80 && "bg-red-500"
                  )}
                  style={{ width: `${Math.min(usageStats.percentUsed, 100)}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Current Account */}
      {activeAccount && (
        <Card className="border-0 shadow-sm bg-muted rounded-[24px]">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2 font-bold tracking-tight">
              <Zap className="h-5 w-5 text-foreground" />
              {t('home.currentAccountTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 基本信息 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-foreground flex items-center justify-center text-background font-bold">
                  {(activeAccount.nickname || activeAccount.email || '?')[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-medium">{activeAccount.nickname || activeAccount.email}</p>
                  <p className="text-sm text-muted-foreground">{activeAccount.email}</p>
                </div>
              </div>
              <div className="text-right">
                <span className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white',
                  getSubscriptionColor(
                    activeAccount.subscription?.type || 'Free',
                    activeAccount.subscription?.title
                  )
                )}>
                  {activeAccount.subscription?.title || activeAccount.subscription?.type || 'Free'}
                </span>
              </div>
            </div>

            {/* 详细信息网格 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t">
              {/* 用量 */}
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{t('home.monthlyUsage')}</p>
                <p className="text-sm font-medium">
                  {activeAccount.usage?.current || 0} / {activeAccount.usage?.limit || 0}
                </p>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all ${
                      (activeAccount.usage?.percentUsed || 0) > 0.8 
                        ? 'bg-red-500' 
                        : (activeAccount.usage?.percentUsed || 0) > 0.5 
                          ? 'bg-amber-500' 
                          : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min((activeAccount.usage?.percentUsed || 0) * 100, 100)}%` }}
                  />
                </div>
              </div>

              {/* 订阅剩余 */}
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{t('home.subscriptionRemaining')}</p>
                <p className="text-sm font-medium">
                  {activeAccount.subscription?.daysRemaining != null
                    ? t('home.daysCount', { n: activeAccount.subscription.daysRemaining })
                    : t('home.permanent')}
                </p>
              </div>

              {/* Token 状态 */}
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{t('home.tokenStatus')}</p>
                {(() => {
                  const expiresAt = activeAccount.credentials?.expiresAt
                  if (!expiresAt) return <p className="text-sm font-medium text-muted-foreground">{t('common.unknown')}</p>
                  const now = Date.now()
                  const remaining = expiresAt - now
                  if (remaining <= 0) return <p className="text-sm font-medium text-red-500">{t('time.expired')}</p>
                  const minutes = Math.floor(remaining / 60000)
                  if (minutes < 60) return <p className="text-sm font-medium text-amber-500">{t('home.minutesLeft', { n: minutes })}</p>
                  const hours = Math.floor(minutes / 60)
                  return <p className="text-sm font-medium text-green-500">{t('home.hoursLeft', { n: hours })}</p>
                })()}
              </div>

              {/* 登录方式 */}
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{t('home.authMethod')}</p>
                <p className="text-sm font-medium">
                  {activeAccount.credentials?.authMethod === 'social' 
                    ? (activeAccount.credentials?.provider || 'Social')
                    : 'Builder ID'}
                </p>
              </div>
            </div>

            {/* 订阅详情 */}
            <div className="pt-3 border-t space-y-2">
              <p className="text-xs font-medium text-muted-foreground">{t('home.subscriptionDetails')}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{t('home.subscriptionType')}</span>
                  <span className="font-medium">{activeAccount.subscription?.title || activeAccount.subscription?.type || 'Free'}</span>
                </div>
                {activeAccount.subscription?.rawType && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{t('home.rawType')}</span>
                    <span className="font-mono text-[10px]">{activeAccount.subscription.rawType}</span>
                  </div>
                )}
                {activeAccount.subscription?.expiresAt && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{t('home.expires')}</span>
                    <span className="font-medium">{new Date(activeAccount.subscription.expiresAt).toLocaleDateString('zh-CN')}</span>
                  </div>
                )}
                {activeAccount.subscription?.upgradeCapability && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{t('home.upgradeable')}</span>
                    <span className="font-medium">{activeAccount.subscription.upgradeCapability}</span>
                  </div>
                )}
                {activeAccount.subscription?.overageCapability && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{t('home.overage')}</span>
                    <span className="font-medium">{activeAccount.subscription.overageCapability}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 额度明细 */}
            {(activeAccount.usage?.baseLimit || activeAccount.usage?.freeTrialLimit || activeAccount.usage?.bonuses?.length) && (
              <div className="pt-3 border-t space-y-2">
              <p className="text-xs font-medium text-muted-foreground">{t('home.quotaDetails')}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {activeAccount.usage?.baseLimit !== undefined && activeAccount.usage.baseLimit > 0 && (
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="text-muted-foreground">{t('home.baseQuota')}</span>
                    <span className="font-medium">
                      {activeAccount.usage.baseCurrent ?? 0} / {activeAccount.usage.baseLimit}
                    </span>
                  </div>
                )}
                {activeAccount.usage?.freeTrialLimit !== undefined && activeAccount.usage.freeTrialLimit > 0 && (
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                    <span className="text-muted-foreground">{t('home.trialQuota')}</span>
                    <span className="font-medium">
                      {activeAccount.usage.freeTrialCurrent ?? 0} / {activeAccount.usage.freeTrialLimit}
                    </span>
                    {activeAccount.usage.freeTrialExpiry && (
                      <span className="text-muted-foreground/70 text-[10px]">
                        (至 {(() => {
                          const d = activeAccount.usage.freeTrialExpiry as unknown
                          try { return (typeof d === 'string' ? d : new Date(d as Date).toISOString()).split('T')[0] } catch { return '' }
                        })()})
                      </span>
                    )}
                  </div>
                )}
                {activeAccount.usage?.bonuses?.map((bonus) => (
                  <div key={bonus.code} className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full bg-cyan-500" />
                    <span className="text-muted-foreground truncate">{bonus.name}:</span>
                    <span className="font-medium">{bonus.current} / {bonus.limit}</span>
                    {bonus.expiresAt && (
                      <span className="text-muted-foreground/70 text-[10px]">
                        (至 {(() => {
                          const d = bonus.expiresAt as unknown
                          try { return (typeof d === 'string' ? d : new Date(d as Date).toISOString()).split('T')[0] } catch { return '' }
                        })()})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
            )}

            {/* 账户信息 */}
            <div className="pt-3 border-t space-y-2">
              <p className="text-xs font-medium text-muted-foreground">{t('home.accountInfo')}</p>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-start gap-2">
                  <span className="text-muted-foreground shrink-0">User ID:</span>
                  <span className="font-mono text-[10px] break-all select-all">{activeAccount.userId}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">IDP:</span>
                  <span className="font-medium">{activeAccount.idp || 'BuilderId'}</span>
                </div>
                {activeAccount.usage?.nextResetDate && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{t('home.resetDate')}</span>
                    <span className="font-medium">
                      {(() => {
                        const d = activeAccount.usage.nextResetDate as unknown
                        try { return (typeof d === 'string' ? d : new Date(d as Date).toISOString()).split('T')[0] } catch { return t('common.unknown') }
                      })()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Tips */}
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200 rounded-[24px]">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-3 font-bold tracking-tight">
            <div className="p-2.5 rounded-xl bg-muted">
              <Shield className="h-5 w-5 text-foreground" />
            </div>
            {t('home.quickTips')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-foreground">•</span>
              {t('home.tip1')}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-foreground">•</span>
              {t('home.tip2')}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-foreground">•</span>
              {t('home.tip3')}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-foreground">•</span>
              {t('home.tip4')}
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* Feature Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200 rounded-[24px]">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-muted">
                <Download className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <p className="font-semibold text-sm text-foreground">{t('home.autoImport')}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('home.autoImportDesc')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200 rounded-[24px]">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-muted">
                <FolderPlus className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <p className="font-semibold text-sm text-foreground">{t('home.groups')}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('home.groupsDesc')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200 rounded-[24px]">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-muted">
                <Tag className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <p className="font-semibold text-sm text-foreground">{t('home.tags')}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('home.tagsDesc')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
