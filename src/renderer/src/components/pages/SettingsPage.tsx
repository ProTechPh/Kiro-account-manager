import { useAccountsStore } from '@/store/accounts'
import { Card, CardContent, CardHeader, CardTitle, Button } from '../ui'
import { Eye, EyeOff, RefreshCw, Clock, Trash2, Download, Upload, Globe, Repeat, Palette, Moon, Sun, Settings, Database, Layers, UserX, Monitor, Power } from 'lucide-react'
import { useState, useEffect } from 'react'
import { ExportDialog } from '../accounts/ExportDialog'
import { useTranslation } from '@/hooks/useTranslation'

export function SettingsPage() {
  const { 
    privacyMode, 
    setPrivacyMode,
    usagePrecision,
    setUsagePrecision,
    autoRefreshEnabled,
    autoRefreshInterval,
    autoRefreshConcurrency,
    autoRefreshSyncInfo,
    setAutoRefresh,
    setAutoRefreshConcurrency,
    setAutoRefreshSyncInfo,
    checkAndRefreshExpiringTokens,
    proxyEnabled,
    proxyUrl,
    setProxy,
    autoSwitchEnabled,
    autoSwitchThreshold,
    autoSwitchInterval,
    setAutoSwitch,
    batchImportConcurrency,
    setBatchImportConcurrency,
    loginPrivateMode,
    setLoginPrivateMode,
    darkMode,
    setDarkMode,
    language,
    setLanguage,
    accounts,
    importFromExportData
  } = useAccountsStore()

  const { t } = useTranslation()
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [tempProxyUrl, setTempProxyUrl] = useState(proxyUrl)
  const [isManualRefreshing, setIsManualRefreshing] = useState(false)
  
  // 托盘设置状态
  const [traySettings, setTraySettings] = useState({
    enabled: true,
    closeAction: 'ask' as 'ask' | 'minimize' | 'quit',
    showNotifications: true,
    minimizeOnStart: false
  })
  const [trayLoading, setTrayLoading] = useState(true)

  // 快捷键设置状态
  const [showWindowShortcut, setShowWindowShortcut] = useState('')
  const [shortcutLoading, setShortcutLoading] = useState(true)
  const [shortcutError, setShortcutError] = useState('')
  const [isRecordingShortcut, setIsRecordingShortcut] = useState(false)

  // 启动设置状态
  const [autoLaunchEnabled, setAutoLaunchEnabled] = useState(false)
  const [autoStartServerEnabled, setAutoStartServerEnabled] = useState(false)
  const [autoRepairEnabled, setAutoRepairEnabled] = useState(true)
  const [startupLoading, setStartupLoading] = useState(true)

  // 加载快捷键设置
  useEffect(() => {
    const loadShortcut = async () => {
      try {
        const shortcut = await window.api.getShowWindowShortcut()
        setShowWindowShortcut(shortcut)
      } catch (error) {
        console.error('Failed to load shortcut:', error)
      } finally {
        setShortcutLoading(false)
      }
    }
    loadShortcut()
  }, [])

  // 保存快捷键设置
  const handleShortcutChange = async (shortcut: string) => {
    setShowWindowShortcut(shortcut)
    setShortcutError('')
    try {
      const result = await window.api.setShowWindowShortcut(shortcut)
      if (!result.success) {
        setShortcutError(result.error || 'Failed to set shortcut')
      }
    } catch (error) {
      setShortcutError(String(error))
    }
  }

  // 加载启动设置
  useEffect(() => {
    const loadStartupSettings = async () => {
      try {
        const [autoLaunch, autoStartServer, autoRepair] = await Promise.all([
          window.api.getAutoLaunch(),
          window.api.getAutoStartServer(),
          window.api.getAutoRepair()
        ])
        setAutoLaunchEnabled(autoLaunch)
        setAutoStartServerEnabled(autoStartServer)
        setAutoRepairEnabled(autoRepair)
      } catch (error) {
        console.error('Failed to load startup settings:', error)
      } finally {
        setStartupLoading(false)
      }
    }
    loadStartupSettings()
  }, [])

  // 切换开机自启动
  const handleAutoLaunchChange = async () => {
    const newValue = !autoLaunchEnabled
    setAutoLaunchEnabled(newValue)
    try {
      const result = await window.api.setAutoLaunch(newValue)
      if (!result.success) {
        setAutoLaunchEnabled(!newValue) // revert
        console.error('Failed to set auto launch:', result.error)
      }
    } catch (error) {
      setAutoLaunchEnabled(!newValue) // revert
      console.error('Failed to set auto launch:', error)
    }
  }

  // 切换自动启动服务器
  const handleAutoStartServerChange = async () => {
    const newValue = !autoStartServerEnabled
    setAutoStartServerEnabled(newValue)
    try {
      const result = await window.api.setAutoStartServer(newValue)
      if (!result.success) {
        setAutoStartServerEnabled(!newValue) // revert
        console.error('Failed to set auto start server:', result.error)
      }
    } catch (error) {
      setAutoStartServerEnabled(!newValue) // revert
      console.error('Failed to set auto start server:', error)
    }
  }

  // 切换自动修复
  const handleAutoRepairChange = async () => {
    const newValue = !autoRepairEnabled
    setAutoRepairEnabled(newValue)
    try {
      const result = await window.api.setAutoRepair(newValue)
      if (!result.success) {
        setAutoRepairEnabled(!newValue) // revert
        console.error('Failed to set auto repair:', result.error)
      }
    } catch (error) {
      setAutoRepairEnabled(!newValue) // revert
      console.error('Failed to set auto repair:', error)
    }
  }

  // 按键录制处理
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isRecordingShortcut) return
    e.preventDefault()
    
    const parts: string[] = []
    if (e.ctrlKey) parts.push('Ctrl')
    if (e.metaKey) parts.push('Command')
    if (e.altKey) parts.push('Alt')
    if (e.shiftKey) parts.push('Shift')
    
    // 忽略单独的修饰键
    const key = e.key
    if (!['Control', 'Meta', 'Alt', 'Shift'].includes(key)) {
      // 转换特殊键名
      const keyName = key.length === 1 ? key.toUpperCase() : key
      parts.push(keyName)
      
      const shortcut = parts.join('+')
      handleShortcutChange(shortcut)
      setIsRecordingShortcut(false)
    }
  }

  // Usage API 类型状态
  const [usageApiType, setUsageApiType] = useState<'rest' | 'cbor'>('rest')
  const [usageApiLoading, setUsageApiLoading] = useState(true)

  // 加载 Usage API 类型设置
  useEffect(() => {
    const loadUsageApiType = async () => {
      try {
        const type = await window.api.getUsageApiType()
        setUsageApiType(type)
      } catch (error) {
        console.error('Failed to load usage API type:', error)
      } finally {
        setUsageApiLoading(false)
      }
    }
    loadUsageApiType()
  }, [])

  // 保存 Usage API 类型
  const handleUsageApiTypeChange = async (type: 'rest' | 'cbor') => {
    setUsageApiType(type)
    try {
      await window.api.setUsageApiType(type)
    } catch (error) {
      console.error('Failed to save usage API type:', error)
    }
  }

  // 加载托盘设置
  useEffect(() => {
    const loadTraySettings = async () => {
      try {
        const settings = await window.api.getTraySettings()
        setTraySettings(settings)
      } catch (error) {
        console.error('Failed to load tray settings:', error)
      } finally {
        setTrayLoading(false)
      }
    }
    loadTraySettings()
  }, [])

  // 保存托盘设置
  const handleTraySettingChange = async (key: keyof typeof traySettings, value: boolean | string) => {
    const newSettings = { ...traySettings, [key]: value }
    setTraySettings(newSettings)
    try {
      await window.api.saveTraySettings({ [key]: value })
    } catch (error) {
      console.error('Failed to save tray settings:', error)
    }
  }

  const handleManualRefresh = async () => {
    setIsManualRefreshing(true)
    try {
      await checkAndRefreshExpiringTokens()
    } finally {
      setIsManualRefreshing(false)
    }
  }

  const handleExport = () => {
    setShowExportDialog(true)
  }

  const handleImport = async () => {
    setIsImporting(true)
    try {
      const fileData = await window.api.importFromFile()
      if (fileData && fileData.format === 'json') {
        const data = JSON.parse(fileData.content)
        const importResult = importFromExportData(data)
        alert(t('settings.data.importResult', { success: importResult.success, failed: importResult.failed }))
      } else if (fileData) {
        alert(t('settings.data.importJsonOnly'))
      }
    } catch (e) {
      alert(t('settings.data.importFailed', { error: e instanceof Error ? e.message : String(e) }))
    } finally {
      setIsImporting(false)
    }
  }

  const handleClearData = () => {
    if (confirm(t('settings.dangerZone.clearDataConfirm'))) {
      if (confirm(t('settings.dangerZone.clearDataConfirm2'))) {
        Array.from(accounts.keys()).forEach(id => {
          useAccountsStore.getState().removeAccount(id)
        })
        alert(t('settings.dangerZone.clearDataDone'))
      }
    }
  }

  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto">
      {/* 页面头部 */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 p-6 border border-primary/20">
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/20 to-transparent rounded-full blur-2xl" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-primary/20 to-transparent rounded-full blur-2xl" />
        <div className="relative flex items-center gap-4">
          <div className="p-3 rounded-xl bg-primary shadow-lg shadow-primary/25">
            <Settings className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-primary">{t('settings.title')}</h1>
            <p className="text-muted-foreground">{t('settings.description')}</p>
          </div>
        </div>
      </div>

      {/* 语言设置 */}
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Globe className="h-4 w-4 text-primary" />
            </div>
            语言 / Language
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">显示语言 / Display Language</p>
              <p className="text-sm text-muted-foreground">选择界面显示语言 / Select interface language</p>
            </div>
            <select
              className="w-[160px] h-9 px-3 rounded-lg border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'auto' | 'en' | 'zh')}
            >
              <option value="auto">🌐 自动 (Auto)</option>
              <option value="zh">🇨🇳 简体中文</option>
              <option value="en">🇺🇸 English</option>
            </select>
          </div>
          <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-1">
            <p>• {t('settings.language.autoHint')}</p>
            <p>• {t('settings.language.customHint2')}</p>
          </div>
        </CardContent>
      </Card>

      {/* 主题设置 */}
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Palette className="h-4 w-4 text-primary" />
            </div>
            {t('settings.theme.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 深色模式 */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{t('settings.theme.darkMode')}</p>
              <p className="text-sm text-muted-foreground">{t('settings.theme.darkModeDesc')}</p>
            </div>
            <Button
              variant={darkMode ? "default" : "outline"}
              size="sm"
              onClick={() => setDarkMode(!darkMode)}
            >
              {darkMode ? <Moon className="h-4 w-4 mr-2" /> : <Sun className="h-4 w-4 mr-2" />}
              {darkMode ? t('settings.theme.dark') : t('settings.theme.light')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 隐私设置 */}
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              {privacyMode ? <EyeOff className="h-4 w-4 text-primary" /> : <Eye className="h-4 w-4 text-primary" />}
            </div>
            {t('settings.privacy.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{t('settings.privacy.privacyMode')}</p>
              <p className="text-sm text-muted-foreground">{t('settings.privacy.privacyModeDesc')}</p>
            </div>
            <Button
              variant={privacyMode ? "default" : "outline"}
              size="sm"
              onClick={() => setPrivacyMode(!privacyMode)}
            >
              {privacyMode ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
              {privacyMode ? t('common.on') : t('common.off')}
            </Button>
          </div>
          <div className="flex items-center justify-between pt-2 border-t">
            <div>
              <p className="font-medium">{t('settings.privacy.usagePrecision')}</p>
              <p className="text-sm text-muted-foreground">{t('settings.privacy.usagePrecisionDesc')}</p>
            </div>
            <Button
              variant={usagePrecision ? "default" : "outline"}
              size="sm"
              onClick={() => setUsagePrecision(!usagePrecision)}
            >
              {usagePrecision ? t('settings.privacy.decimal') : t('settings.privacy.integer')}
            </Button>
          </div>
          <div className="flex items-center justify-between pt-2 border-t">
            <div>
              <p className="font-medium">{t('settings.privacy.loginPrivateMode')}</p>
              <p className="text-sm text-muted-foreground">{t('settings.privacy.loginPrivateModeDesc')}</p>
            </div>
            <Button
              variant={loginPrivateMode ? "default" : "outline"}
              size="sm"
              onClick={() => setLoginPrivateMode(!loginPrivateMode)}
            >
              <UserX className="h-4 w-4 mr-2" />
              {loginPrivateMode ? t('common.on') : t('common.off')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Token 刷新设置 */}
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <RefreshCw className="h-4 w-4 text-primary" />
            </div>
            {t('settings.autoRefresh.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{t('settings.autoRefresh.enabled')}</p>
              <p className="text-sm text-muted-foreground">{t('settings.autoRefresh.enabledDesc')}</p>
            </div>
            <Button
              variant={autoRefreshEnabled ? "default" : "outline"}
              size="sm"
              onClick={() => setAutoRefresh(!autoRefreshEnabled)}
            >
              {autoRefreshEnabled ? t('common.on') : t('common.off')}
            </Button>
          </div>

          {autoRefreshEnabled && (
            <>
              <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-1">
                <p>• {t('settings.autoRefresh.hint1')}</p>
                <p>• {t('settings.autoRefresh.hint2')}</p>
                <p>• {t('settings.autoRefresh.hint3')}</p>
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <div>
                  <p className="font-medium">{t('settings.autoRefresh.interval')}</p>
                  <p className="text-sm text-muted-foreground">{t('settings.autoRefresh.intervalDesc')}</p>
                </div>
                <select
                  className="w-[120px] h-9 px-3 rounded-lg border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  value={autoRefreshInterval}
                  onChange={(e) => setAutoRefresh(true, parseInt(e.target.value))}
                >
                  {[1, 3, 5, 10, 15, 20, 30, 45, 60].map(n => (
                    <option key={n} value={n}>{t('settings.autoRefresh.minutes', { n })}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <div>
                  <p className="font-medium">{t('settings.autoRefresh.concurrency')}</p>
                  <p className="text-sm text-muted-foreground">{t('settings.autoRefresh.concurrencyDesc')}</p>
                </div>
                <input
                  type="number"
                  className="w-24 h-9 px-3 rounded-lg border bg-background text-sm text-center focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  value={autoRefreshConcurrency}
                  min={1}
                  max={500}
                  onChange={(e) => setAutoRefreshConcurrency(parseInt(e.target.value) || 50)}
                />
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <div>
                  <p className="font-medium">{t('settings.autoRefresh.syncInfo')}</p>
                  <p className="text-sm text-muted-foreground">{t('settings.autoRefresh.syncInfoDesc')}</p>
                </div>
                <Button
                  variant={autoRefreshSyncInfo ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAutoRefreshSyncInfo(!autoRefreshSyncInfo)}
                >
                  {autoRefreshSyncInfo ? t('common.on') : t('common.off')}
                </Button>
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <div>
                  <p className="font-medium">{t('settings.autoRefresh.manualTrigger')}</p>
                  <p className="text-sm text-muted-foreground">{t('settings.autoRefresh.manualTriggerDesc')}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleManualRefresh}
                  disabled={isManualRefreshing}
                >
                  {isManualRefreshing ? t('settings.autoRefresh.refreshing') : t('settings.autoRefresh.triggerNow')}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* API 类型设置 */}
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Database className="h-4 w-4 text-primary" />
            </div>
            {t('settings.api.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{t('settings.api.usageApiType')}</p>
              <p className="text-sm text-muted-foreground">{t('settings.api.usageApiTypeDesc')}</p>
            </div>
            <select
              className="w-[180px] h-9 px-3 rounded-lg border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
              value={usageApiType}
              onChange={(e) => handleUsageApiTypeChange(e.target.value as 'rest' | 'cbor')}
              disabled={usageApiLoading}
            >
              <option value="rest">REST (GetUsageLimits)</option>
              <option value="cbor">CBOR (GetUserUsageAndLimits)</option>
            </select>
          </div>
          <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-1">
            <p>• <strong>REST</strong>: {t('settings.api.restDesc')}</p>
            <p>• <strong>CBOR</strong>: {t('settings.api.cborDesc')}</p>
          </div>
        </CardContent>
      </Card>

      {/* 代理设置 */}
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Globe className="h-4 w-4 text-primary" />
            </div>
            {t('settings.proxy.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{t('settings.proxy.enabled')}</p>
              <p className="text-sm text-muted-foreground">{t('settings.proxy.enabledDesc')}</p>
            </div>
            <Button
              variant={proxyEnabled ? "default" : "outline"}
              size="sm"
              onClick={() => setProxy(!proxyEnabled, tempProxyUrl)}
            >
              {proxyEnabled ? t('common.on') : t('common.off')}
            </Button>
          </div>

          <div className="space-y-2 pt-2 border-t">
            <label className="text-sm font-medium">{t('settings.proxy.url')}</label>
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 h-9 px-3 rounded-lg border bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                placeholder={t('settings.proxy.urlPlaceholder')}
                value={tempProxyUrl}
                onChange={(e) => setTempProxyUrl(e.target.value)}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setProxy(proxyEnabled, tempProxyUrl)}
                disabled={tempProxyUrl === proxyUrl}
              >
                {t('common.save')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('settings.proxy.urlHint')}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 自动换号设置 */}
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Repeat className="h-4 w-4 text-primary" />
            </div>
            {t('settings.autoSwitch.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{t('settings.autoSwitch.enabled')}</p>
              <p className="text-sm text-muted-foreground">{t('settings.autoSwitch.enabledDesc')}</p>
            </div>
            <Button
              variant={autoSwitchEnabled ? "default" : "outline"}
              size="sm"
              onClick={() => setAutoSwitch(!autoSwitchEnabled)}
            >
              {autoSwitchEnabled ? t('common.on') : t('common.off')}
            </Button>
          </div>

          {autoSwitchEnabled && (
            <>
              <div className="flex items-center justify-between pt-2 border-t">
                <div>
                  <p className="font-medium">{t('settings.autoSwitch.threshold')}</p>
                  <p className="text-sm text-muted-foreground">{t('settings.autoSwitch.thresholdDesc')}</p>
                </div>
                <input
                  type="number"
                  className="w-20 h-9 px-3 rounded-lg border bg-background text-sm text-center focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  value={autoSwitchThreshold}
                  min={0}
                  onChange={(e) => setAutoSwitch(true, parseInt(e.target.value) || 0)}
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t">
                <div>
                  <p className="font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    {t('settings.autoSwitch.interval')}
                  </p>
                  <p className="text-sm text-muted-foreground">{t('settings.autoSwitch.intervalDesc')}</p>
                </div>
                <select
                  className="h-9 px-3 rounded-lg border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  value={autoSwitchInterval}
                  onChange={(e) => setAutoSwitch(true, undefined, parseInt(e.target.value))}
                >
                  {[1, 3, 5, 10, 15, 30].map(n => (
                    <option key={n} value={n}>{t('settings.autoRefresh.minutes', { n })}</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 批量导入设置 */}
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Layers className="h-4 w-4 text-primary" />
            </div>
            {t('settings.batchImport.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{t('settings.batchImport.concurrency')}</p>
              <p className="text-sm text-muted-foreground">{t('settings.batchImport.concurrencyDesc')}</p>
            </div>
            <input
              type="number"
              className="w-24 h-9 px-3 rounded-lg border bg-background text-sm text-center focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
              value={batchImportConcurrency}
              min={1}
              max={500}
              onChange={(e) => setBatchImportConcurrency(parseInt(e.target.value) || 100)}
            />
          </div>
          <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">
            {t('settings.batchImport.hint')}
          </p>
        </CardContent>
      </Card>

      {/* 系统托盘设置 */}
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Monitor className="h-4 w-4 text-primary" />
            </div>
            {t('settings.tray.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {trayLoading ? (
            <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{t('settings.tray.enabled')}</p>
                  <p className="text-sm text-muted-foreground">{t('settings.tray.enabledDesc')}</p>
                </div>
                <Button
                  variant={traySettings.enabled ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleTraySettingChange('enabled', !traySettings.enabled)}
                >
                  {traySettings.enabled ? t('common.on') : t('common.off')}
                </Button>
              </div>

              {traySettings.enabled && (
                <>
                  <div className="flex items-center justify-between pt-2 border-t">
                    <div>
                      <p className="font-medium">{t('settings.tray.closeAction')}</p>
                      <p className="text-sm text-muted-foreground">{t('settings.tray.closeActionDesc')}</p>
                    </div>
                    <select
                      className="w-[140px] h-9 px-3 rounded-lg border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                      value={traySettings.closeAction}
                      onChange={(e) => handleTraySettingChange('closeAction', e.target.value)}
                    >
                      <option value="ask">{t('settings.tray.ask')}</option>
                      <option value="minimize">{t('settings.tray.minimize')}</option>
                      <option value="quit">{t('settings.tray.quit')}</option>
                    </select>
                  </div>
                </>
              )}

              <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-1">
                <p>• {t('settings.tray.hint1')}</p>
                <p>• {t('settings.tray.hint2')}</p>
                <p>• {t('settings.tray.hint3')}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 启动设置 */}
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Power className="h-4 w-4 text-primary" />
            </div>
            {t('settings.startup.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {startupLoading ? (
            <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{t('settings.startup.autoLaunch')}</p>
                  <p className="text-sm text-muted-foreground">{t('settings.startup.autoLaunchDesc')}</p>
                </div>
                <Button
                  variant={autoLaunchEnabled ? 'default' : 'outline'}
                  size="sm"
                  onClick={handleAutoLaunchChange}
                >
                  {autoLaunchEnabled ? t('common.on') : t('common.off')}
                </Button>
              </div>

              <div className="flex items-center justify-between pt-2 border-t">
                <div>
                  <p className="font-medium">{t('settings.startup.autoStartServer')}</p>
                  <p className="text-sm text-muted-foreground">{t('settings.startup.autoStartServerDesc')}</p>
                </div>
                <Button
                  variant={autoStartServerEnabled ? 'default' : 'outline'}
                  size="sm"
                  onClick={handleAutoStartServerChange}
                >
                  {autoStartServerEnabled ? t('common.on') : t('common.off')}
                </Button>
              </div>

              <div className="flex items-center justify-between pt-2 border-t">
                <div>
                  <p className="font-medium">{t('settings.startup.autoRepair')}</p>
                  <p className="text-sm text-muted-foreground">{t('settings.startup.autoRepairDesc')}</p>
                </div>
                <Button
                  variant={autoRepairEnabled ? 'default' : 'outline'}
                  size="sm"
                  onClick={handleAutoRepairChange}
                >
                  {autoRepairEnabled ? t('common.on') : t('common.off')}
                </Button>
              </div>

              <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-1">
                <p>• {t('settings.startup.hint1')}</p>
                <p>• {t('settings.startup.hint2')}</p>
                <p>• {t('settings.startup.hint3')}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 快捷键设置 */}
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Settings className="h-4 w-4 text-primary" />
            </div>
            {t('settings.shortcuts.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {shortcutLoading ? (
            <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{t('settings.shortcuts.showWindow')}</p>
                  <p className="text-sm text-muted-foreground">{t('settings.shortcuts.showWindowDesc')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    className={`w-[160px] h-9 px-3 rounded-lg border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-center ${isRecordingShortcut ? 'border-primary ring-1 ring-primary animate-pulse' : ''}`}
                    value={isRecordingShortcut ? t('settings.shortcuts.pressKeys') : showWindowShortcut}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setIsRecordingShortcut(true)}
                    onBlur={() => setIsRecordingShortcut(false)}
                    readOnly
                    placeholder={t('settings.shortcuts.clickToRecord')}
                  />
                  {showWindowShortcut && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 px-2"
                      onClick={() => handleShortcutChange('')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              {shortcutError && (
                <p className="text-sm text-destructive">{shortcutError}</p>
              )}
              <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-1">
                <p>• {t('settings.shortcuts.hint1')}</p>
                <p>• {t('settings.shortcuts.hint2')}</p>
                <p>• {t('settings.shortcuts.hint3')}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 机器码管理提示 */}
      {/* 数据管理 */}
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Database className="h-4 w-4 text-primary" />
            </div>
            {t('settings.data.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{t('settings.data.export')}</p>
              <p className="text-sm text-muted-foreground">{t('settings.data.exportDesc')}</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              {t('common.export')}
            </Button>
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <div>
              <p className="font-medium">{t('settings.data.import')}</p>
              <p className="text-sm text-muted-foreground">{t('settings.data.importDesc')}</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleImport} disabled={isImporting}>
              <Upload className="h-4 w-4 mr-2" />
              {isImporting ? t('settings.data.importing') : t('common.import')}
            </Button>
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <div>
              <p className="font-medium text-destructive">{t('settings.dangerZone.clearData')}</p>
              <p className="text-sm text-muted-foreground">{t('settings.dangerZone.clearDataDesc')}</p>
            </div>
            <Button variant="destructive" size="sm" onClick={handleClearData}>
              <Trash2 className="h-4 w-4 mr-2" />
              {t('settings.dangerZone.clearDataButton')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 导出对话框 */}
      <ExportDialog
        open={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        accounts={Array.from(accounts.values())}
        selectedCount={0}
      />
    </div>
  )
}
