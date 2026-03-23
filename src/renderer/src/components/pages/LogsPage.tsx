import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Activity, Download, Trash2, RefreshCw, Search, X, Copy, ChevronDown, ChevronUp, ArrowDownToLine, Pause, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button, Badge, Input } from '../ui'
import { useTranslation } from '@/hooks/useTranslation'

interface LogEntry {
  timestamp: string
  level: string
  category: string
  message: string
  data?: unknown
}

interface DropdownOption {
  value: string
  label: string
  icon?: React.ReactNode
}

interface CustomDropdownProps {
  value: string
  options: DropdownOption[]
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

function CustomDropdown({ value, options, onChange, placeholder, className }: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const selectedOption = options.find(opt => opt.value === value)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={dropdownRef} className={`relative ${className || ''}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative h-8 px-2 pr-7 rounded-lg border border-border bg-background/50 text-xs cursor-pointer hover:border-primary/50 focus:border-primary focus:outline-none transition-all flex items-center gap-1.5"
      >
        {selectedOption?.icon}
        <span className="flex-1 text-left truncate">{selectedOption?.label || placeholder}</span>
        <ChevronDown className={`w-3.5 h-3.5 absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 min-w-full py-1 rounded-lg border border-border bg-popover shadow-lg z-50 animate-in fade-in-0 zoom-in-95">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => { onChange(option.value); setIsOpen(false) }}
              className={`w-full px-2.5 py-1.5 text-xs text-left flex items-center gap-1.5 hover:bg-accent transition-colors ${option.value === value ? 'bg-accent text-accent-foreground' : ''}`}
            >
              {option.icon}
              <span>{option.label}</span>
              {option.value === value && (
                <svg className="w-4 h-4 ml-auto text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function LogsPage() {
  const { t } = useTranslation()

  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [levelFilter, setLevelFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [autoScroll, setAutoScroll] = useState(true)
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set())
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(() => {
    const saved = localStorage.getItem('proxyLogs_pageSize')
    return saved ? parseInt(saved) : 1000
  })
  const [timeRange, setTimeRange] = useState<string>(() => {
    return localStorage.getItem('proxyLogs_timeRange') || 'all'
  })
  const [displayLimit, setDisplayLimit] = useState<string>(() => {
    return localStorage.getItem('proxyLogs_displayLimit') || 'all'
  })
  const scrollRef = useRef<HTMLDivElement>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const loadLogs = useCallback(async () => {
    try {
      const result = await window.api.proxyGetLogs()
      setLogs(result)
    } catch (error) {
      console.error('Failed to load logs:', error)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    loadLogs().finally(() => setLoading(false))
    pollIntervalRef.current = setInterval(loadLogs, 2000)
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [loadLogs])

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [logs, autoScroll])

  useEffect(() => { localStorage.setItem('proxyLogs_pageSize', pageSize.toString()) }, [pageSize])
  useEffect(() => { localStorage.setItem('proxyLogs_timeRange', timeRange) }, [timeRange])
  useEffect(() => { localStorage.setItem('proxyLogs_displayLimit', displayLimit) }, [displayLimit])

  const handleClearLogs = async () => {
    try {
      await window.api.proxyClearLogs()
      setLogs([])
    } catch (error) {
      console.error('Failed to clear logs:', error)
    }
  }

  const handleExportLogs = () => {
    const content = logs.map(log => {
      const dataStr = log.data ? ` | ${JSON.stringify(log.data)}` : ''
      return `[${log.timestamp}] [${log.level}] [${log.category}] ${log.message}${dataStr}`
    }).join('\n')
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `proxy-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.log`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleCopyLog = (log: LogEntry) => {
    const dataStr = log.data ? `\nData: ${JSON.stringify(log.data, null, 2)}` : ''
    navigator.clipboard.writeText(`[${log.timestamp}] [${log.level}] [${log.category}]\n${log.message}${dataStr}`)
  }

  const toggleExpand = (index: number) => {
    const newExpanded = new Set(expandedLogs)
    if (newExpanded.has(index)) newExpanded.delete(index)
    else newExpanded.add(index)
    setExpandedLogs(newExpanded)
  }

  const categories = useMemo(() => Array.from(new Set(logs.map(log => log.category))).sort(), [logs])

  const getTimeRangeMs = (range: string): number => {
    const hour = 60 * 60 * 1000
    const day = 24 * hour
    switch (range) {
      case '1h': return hour
      case '6h': return 6 * hour
      case '12h': return 12 * hour
      case '1d': return day
      case '3d': return 3 * day
      case '7d': return 7 * day
      case '30d': return 30 * day
      case '180d': return 180 * day
      case '1y': return 365 * day
      default: return 0
    }
  }

  const filteredLogs = useMemo(() => {
    const now = Date.now()
    const rangeMs = getTimeRangeMs(timeRange)
    const search = searchText.toLowerCase()
    let result = logs.filter(log => {
      if (rangeMs > 0 && now - new Date(log.timestamp).getTime() > rangeMs) return false
      if (levelFilter !== 'all' && log.level !== levelFilter) return false
      if (categoryFilter !== 'all' && log.category !== categoryFilter) return false
      if (search) {
        if (log.message.toLowerCase().includes(search) || log.category.toLowerCase().includes(search)) return true
        if (log.data) {
          try { return JSON.stringify(log.data).toLowerCase().includes(search) } catch { return false }
        }
        return false
      }
      return true
    })
    if (displayLimit !== 'all') {
      const limit = parseInt(displayLimit)
      if (limit > 0) result = result.slice(-limit)
    }
    return result.reverse()
  }, [logs, timeRange, levelFilter, categoryFilter, searchText, displayLimit])

  const totalPages = Math.ceil(filteredLogs.length / pageSize)
  const startIndex = (currentPage - 1) * pageSize
  const paginatedLogs = filteredLogs.slice(startIndex, Math.min(startIndex + pageSize, filteredLogs.length))

  useEffect(() => { setCurrentPage(1) }, [searchText, levelFilter, categoryFilter, timeRange, displayLimit])

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'ERROR': return 'bg-destructive/20 text-destructive border-destructive/30'
      case 'WARN': return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30'
      case 'INFO': return 'bg-primary/20 text-primary border-primary/30'
      default: return 'bg-muted text-muted-foreground border-muted'
    }
  }

  const getLevelRowBg = (level: string) => {
    switch (level) {
      case 'ERROR': return 'bg-destructive/5 hover:bg-destructive/10'
      case 'WARN': return 'bg-yellow-500/5 hover:bg-yellow-500/10'
      case 'INFO': return 'hover:bg-primary/5'
      default: return 'hover:bg-muted/50'
    }
  }

  const formatTime = (timestamp: string) => {
    try {
      if (!timestamp) return '-'
      const date = new Date(timestamp)
      if (isNaN(date.getTime())) return timestamp || '-'
      const pad = (n: number, len = 2) => n.toString().padStart(len, '0')
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
    } catch { return timestamp || '-' }
  }

  return (
    <div className="flex-1 p-6 space-y-4 overflow-auto flex flex-col h-full">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 p-6 border border-primary/20 flex-shrink-0">
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/20 to-transparent rounded-full blur-2xl" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-primary/20 to-transparent rounded-full blur-2xl" />
        <div className="relative flex items-center gap-4">
          <div className="p-3 rounded-xl bg-primary shadow-lg shadow-primary/25">
            <Activity className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-primary">{t('logs.title')}</h1>
            <p className="text-muted-foreground">{t('logs.description')}</p>
          </div>
        </div>
      </div>

      {/* Log Viewer */}
      <div className="flex-1 flex flex-col border border-border rounded-[24px] overflow-hidden min-h-0">
        {/* Toolbar row 1: time range, display limit, counts, actions */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CustomDropdown
              value={timeRange}
              onChange={setTimeRange}
              className="min-w-[80px]"
              options={[
                { value: 'all', label: t('common.all') },
                { value: '1h', label: t('logs.time1h') },
                { value: '6h', label: t('logs.time6h') },
                { value: '12h', label: t('logs.time12h') },
                { value: '1d', label: t('logs.time1d') },
                { value: '3d', label: t('logs.time3d') },
                { value: '7d', label: t('logs.time7d') },
                { value: '30d', label: t('logs.time30d') },
                { value: '180d', label: t('logs.time180d') },
                { value: '1y', label: t('logs.time1y') },
              ]}
            />
            <CustomDropdown
              value={displayLimit}
              onChange={setDisplayLimit}
              className="min-w-[70px]"
              options={[
                { value: 'all', label: t('common.all') },
                { value: '5000', label: '5000' },
                { value: '10000', label: t('logs.limit10k') },
                { value: '50000', label: t('logs.limit50k') },
                { value: '100000', label: t('logs.limit100k') },
                { value: '500000', label: t('logs.limit500k') },
                { value: '1000000', label: t('logs.limit1m') },
              ]}
            />
            <Badge variant="secondary" className="font-mono text-xs">
            {filteredLogs.length} / {logs.length} {t('logs.entries')}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={loadLogs} disabled={loading} className="h-7 px-2 text-xs">
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
              {t('common.refresh')}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportLogs} disabled={logs.length === 0} className="h-7 px-2 text-xs">
              <Download className="w-3.5 h-3.5 mr-1" />
              {t('common.export')}
            </Button>
            <Button variant="outline" size="sm" onClick={handleClearLogs} disabled={logs.length === 0} className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 hover:border-destructive/50">
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              {t('logs.clear')}
            </Button>
          </div>
        </div>

        {/* Toolbar row 2: search, filters, auto-scroll, pagination */}
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/20 flex-wrap">
          <div className="relative flex-1 min-w-[120px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder={t('logs.searchPlaceholder')}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-8 pr-8 h-8 text-xs bg-background/50 border-border focus:border-primary"
            />
            {searchText && (
              <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full" onClick={() => setSearchText('')}>
                <X className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>

          <CustomDropdown
            value={levelFilter}
            onChange={setLevelFilter}
            options={[
              { value: 'all', label: t('common.all'), icon: <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-red-500 via-yellow-500 to-blue-500" /> },
              { value: 'ERROR', label: 'ERR', icon: <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> },
              { value: 'WARN', label: 'WARN', icon: <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" /> },
              { value: 'INFO', label: 'INFO', icon: <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> },
              { value: 'DEBUG', label: 'DBG', icon: <span className="w-2.5 h-2.5 rounded-full bg-gray-400" /> },
            ]}
          />

          <CustomDropdown
            value={categoryFilter}
            onChange={setCategoryFilter}
            className="min-w-[100px]"
            options={[
              { value: 'all', label: t('common.all'), icon: <svg className="w-3 h-3 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg> },
              ...categories.map(cat => ({
                value: cat,
                label: cat,
                icon: <svg className="w-3 h-3 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" /></svg>
              }))
            ]}
          />

          <div className="h-5 w-px bg-border flex-shrink-0" />

          <Button variant={autoScroll ? 'default' : 'outline'} size="sm" onClick={() => setAutoScroll(!autoScroll)} className="h-7 px-2 text-xs flex-shrink-0">
            {autoScroll ? <><ArrowDownToLine className="w-3.5 h-3.5 mr-1" />{t('logs.autoScroll')}</> : <><Pause className="w-3.5 h-3.5 mr-1" />{t('logs.paused')}</>}
          </Button>

          <div className="h-5 w-px bg-border flex-shrink-0" />

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <CustomDropdown
              value={pageSize.toString()}
              onChange={(v) => { setPageSize(Number(v)); setCurrentPage(1) }}
              className="min-w-[60px]"
              options={[
                { value: '100', label: '100' },
                { value: '500', label: '500' },
                { value: '1000', label: '1000' },
                { value: '2000', label: '2000' },
                { value: '5000', label: '5000' },
              ]}
            />
            <div className="flex items-center gap-0.5">
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}>
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <div className="flex items-center text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                <input
                  type="text"
                  className="w-8 h-6 text-center text-xs bg-background border rounded px-0.5 focus:outline-none focus:ring-1 focus:ring-ring"
                  value={currentPage}
                  onChange={(e) => {
                    const val = e.target.value
                    if (val === '' || /^\d+$/.test(val)) {
                      const num = parseInt(val) || 1
                      if (num >= 1 && num <= totalPages) setCurrentPage(num)
                    }
                  }}
                  onBlur={(e) => setCurrentPage(Math.min(Math.max(1, parseInt(e.target.value) || 1), totalPages || 1))}
                  onKeyDown={(e) => { if (e.key === 'Enter') setCurrentPage(Math.min(Math.max(1, parseInt((e.target as HTMLInputElement).value) || 1), totalPages || 1)) }}
                />
                <span className="px-0.5">/</span>
                <span>{totalPages || 1}</span>
              </div>
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Log list */}
        <div className="flex-1 overflow-auto bg-muted/10" ref={scrollRef}>
          <div className="p-3 font-mono text-xs space-y-0.5">
            {filteredLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Activity className="w-12 h-12 mb-3 opacity-50" />
                <span className="text-sm">{logs.length === 0 ? t('logs.noLogs') : t('logs.noMatch')}</span>
                {logs.length === 0 && (
                  <span className="text-xs mt-1 opacity-70">{t('logs.startHint')}</span>
                )}
              </div>
            ) : (
              paginatedLogs.map((log, index) => {
                const globalIndex = startIndex + index
                const isExpanded = expandedLogs.has(globalIndex)
                const hasData = log.data !== undefined && log.data !== null
                return (
                  <div key={index} className={`group rounded-lg px-3 py-2 transition-colors ${getLevelRowBg(log.level)}`}>
                    <div className="flex items-start gap-3">
                      <span className="text-muted-foreground whitespace-nowrap flex-shrink-0 tabular-nums">{formatTime(log.timestamp)}</span>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0.5 flex-shrink-0 font-semibold ${getLevelColor(log.level)}`}>
                        {log.level}
                      </Badge>
                      <span className="text-primary/80 flex-shrink-0 font-medium">[{log.category}]</span>
                      <span className="flex-1 break-all text-foreground/90">{log.message}</span>
                      <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                        {hasData && (
                          <Button variant="ghost" size="icon" className="w-6 h-6 rounded-full hover:bg-primary/10" onClick={() => toggleExpand(globalIndex)}>
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="w-6 h-6 rounded-full hover:bg-primary/10" onClick={() => handleCopyLog(log)}>
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    {isExpanded && hasData && (
                      <pre className="mt-2 ml-24 p-3 rounded-lg bg-muted/50 border border-border text-primary overflow-x-auto text-[11px]">
                        {JSON.stringify(log.data, null, 2)}
                      </pre>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
