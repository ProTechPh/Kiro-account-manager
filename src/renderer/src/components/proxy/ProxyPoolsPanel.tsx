import { useState, useEffect, useCallback } from 'react'
import { Globe, Plus, Trash2, Play, Upload, Cloud, Edit2, Loader2, ToggleLeft, ToggleRight } from 'lucide-react'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Switch, Badge } from '../ui'
import { useTranslation } from '../../hooks/useTranslation'
import { createPortal } from 'react-dom'

interface ProxyPool {
  id: string
  name: string
  proxyUrl: string
  noProxy: string
  type: string
  isActive: boolean
  strictProxy: boolean
  testStatus: string
  lastTestedAt: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export function ProxyPoolsPanel() {
  const { t } = useTranslation()
  const [pools, setPools] = useState<ProxyPool[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showVercelModal, setShowVercelModal] = useState(false)
  const [showBatchModal, setShowBatchModal] = useState(false)
  const [editingPool, setEditingPool] = useState<ProxyPool | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formUrl, setFormUrl] = useState('')
  const [formNoProxy, setFormNoProxy] = useState('')
  const [formActive, setFormActive] = useState(true)
  const [formStrict, setFormStrict] = useState(false)
  const [saving, setSaving] = useState(false)

  // Vercel form
  const [vercelToken, setVercelToken] = useState('')
  const [vercelProject, setVercelProject] = useState('vercel-relay')
  const [deploying, setDeploying] = useState(false)

  // Batch import
  const [batchText, setBatchText] = useState('')
  const [importing, setImporting] = useState(false)

  const fetchPools = useCallback(async () => {
    try {
      const result = await window.api.proxyPoolsList()
      if (result.success) {
        setPools(result.pools)
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchPools() }, [fetchPools])

  const resetForm = () => {
    setFormName('')
    setFormUrl('')
    setFormNoProxy('')
    setFormActive(true)
    setFormStrict(false)
    setEditingPool(null)
  }

  const openAdd = () => { resetForm(); setShowAddModal(true) }
  const openEdit = (pool: ProxyPool) => {
    setEditingPool(pool)
    setFormName(pool.name)
    setFormUrl(pool.proxyUrl)
    setFormNoProxy(pool.noProxy)
    setFormActive(pool.isActive)
    setFormStrict(pool.strictProxy)
    setShowAddModal(true)
  }

  const handleSave = async () => {
    if (!formName.trim() || !formUrl.trim()) return
    setSaving(true)
    try {
      if (editingPool) {
        await window.api.proxyPoolsUpdate(editingPool.id, {
          name: formName, proxyUrl: formUrl, noProxy: formNoProxy,
          isActive: formActive, strictProxy: formStrict
        })
      } else {
        await window.api.proxyPoolsCreate({
          name: formName, proxyUrl: formUrl, noProxy: formNoProxy,
          isActive: formActive, strictProxy: formStrict
        })
      }
      await fetchPools()
      setShowAddModal(false)
      resetForm()
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    await window.api.proxyPoolsDelete(id)
    setPools(prev => prev.filter(p => p.id !== id))
  }

  const handleTest = async (id: string) => {
    setTestingId(id)
    try {
      await window.api.proxyPoolsTest(id)
      await fetchPools()
    } catch { /* ignore */ }
    finally { setTestingId(null) }
  }

  const handleToggleActive = async (pool: ProxyPool) => {
    const next = !pool.isActive
    setPools(prev => prev.map(p => p.id === pool.id ? { ...p, isActive: next } : p))
    await window.api.proxyPoolsUpdate(pool.id, { isActive: next })
  }

  const handleVercelDeploy = async () => {
    if (!vercelToken.trim()) return
    setDeploying(true)
    try {
      const result = await window.api.proxyPoolsVercelDeploy(vercelToken, vercelProject)
      if (result.success) {
        await fetchPools()
        setShowVercelModal(false)
        setVercelToken('')
      }
    } catch { /* ignore */ }
    finally { setDeploying(false) }
  }

  const handleBatchImport = async () => {
    const lines = batchText.split('\n').filter(l => l.trim())
    if (lines.length === 0) return
    setImporting(true)
    try {
      await window.api.proxyPoolsBatchImport(lines)
      await fetchPools()
      setShowBatchModal(false)
      setBatchText('')
    } catch { /* ignore */ }
    finally { setImporting(false) }
  }

  const activeCount = pools.filter(p => p.isActive).length

  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <Globe className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <CardTitle className="text-lg text-purple-600 dark:text-purple-400">
                {t('proxyPools.title')}
              </CardTitle>
              <CardDescription>{t('proxyPools.description')}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">{activeCount}/{pools.length}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={openAdd} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> {t('proxyPools.add')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowVercelModal(true)} className="gap-1.5">
            <Cloud className="h-3.5 w-3.5" /> {t('proxyPools.vercelRelay')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowBatchModal(true)} className="gap-1.5">
            <Upload className="h-3.5 w-3.5" /> {t('proxyPools.batchImport')}
          </Button>
        </div>

        {/* Pool list */}
        {loading ? (
          <p className="text-sm text-muted-foreground">{t('proxyPools.loading')}</p>
        ) : pools.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">{t('proxyPools.empty')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pools.map(pool => (
              <div key={pool.id} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{pool.name}</span>
                    <Badge variant={pool.testStatus === 'active' ? 'default' : 'secondary'}
                      className={pool.testStatus === 'active' ? 'bg-green-500 text-white text-[10px]' : pool.testStatus === 'error' ? 'bg-red-500 text-white text-[10px]' : 'text-[10px]'}>
                      {pool.testStatus}
                    </Badge>
                    {pool.type === 'vercel' && (
                      <Badge variant="secondary" className="text-[10px]">vercel</Badge>
                    )}
                    {!pool.isActive && (
                      <Badge variant="secondary" className="text-[10px]">inactive</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{pool.proxyUrl}</p>
                  {pool.lastError && (
                    <p className="text-[10px] text-red-500 truncate mt-0.5">{pool.lastError}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => handleToggleActive(pool)}
                    title={pool.isActive ? 'Deactivate' : 'Activate'}>
                    {pool.isActive ? <ToggleRight className="h-4 w-4 text-green-500" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => handleTest(pool.id)}
                    disabled={testingId === pool.id}
                    title="Test">
                    {testingId === pool.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => openEdit(pool)} title="Edit">
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600"
                    onClick={() => handleDelete(pool.id)} title="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add/Edit Modal */}
        {showAddModal && createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setShowAddModal(false); resetForm() }} />
            <div className="relative bg-background rounded-lg shadow-lg w-[450px] p-5 space-y-4">
              <h3 className="text-lg font-semibold">{editingPool ? t('proxyPools.edit') : t('proxyPools.add')}</h3>
              <div className="space-y-3">
                <div><Label>{t('proxyPools.name')}</Label><Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="My Proxy" /></div>
                <div><Label>{t('proxyPools.url')}</Label><Input value={formUrl} onChange={e => setFormUrl(e.target.value)} placeholder="http://user:pass@host:port" /></div>
                <div><Label>{t('proxyPools.noProxy')}</Label><Input value={formNoProxy} onChange={e => setFormNoProxy(e.target.value)} placeholder="localhost,127.0.0.1" /></div>
                <div className="flex items-center justify-between">
                  <Label>{t('proxyPools.active')}</Label>
                  <Switch checked={formActive} onCheckedChange={setFormActive} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>{t('proxyPools.strict')}</Label>
                    <p className="text-[10px] text-muted-foreground">{t('proxyPools.strictHint')}</p>
                  </div>
                  <Switch checked={formStrict} onCheckedChange={setFormStrict} />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => { setShowAddModal(false); resetForm() }}>{t('proxyPools.cancel')}</Button>
                <Button onClick={handleSave} disabled={!formName.trim() || !formUrl.trim() || saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t('proxyPools.save')}
                </Button>
              </div>
            </div>
          </div>, document.body
        )}

        {/* Vercel Deploy Modal */}
        {showVercelModal && createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !deploying && setShowVercelModal(false)} />
            <div className="relative bg-background rounded-lg shadow-lg w-[450px] p-5 space-y-4">
              <h3 className="text-lg font-semibold">{t('proxyPools.vercelTitle')}</h3>
              <div className="p-3 rounded-lg bg-muted/50 border border-border text-xs space-y-1">
                <p className="font-medium text-foreground">{t('proxyPools.vercelWhat')}</p>
                <p className="text-muted-foreground">{t('proxyPools.vercelDesc')}</p>
              </div>
              <div className="space-y-3">
                <div><Label>Vercel API Token</Label><Input type="password" value={vercelToken} onChange={e => setVercelToken(e.target.value)} placeholder="your-vercel-token" /></div>
                <div><Label>Project Name</Label><Input value={vercelProject} onChange={e => setVercelProject(e.target.value)} placeholder="vercel-relay" /></div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowVercelModal(false)} disabled={deploying}>{t('proxyPools.cancel')}</Button>
                <Button onClick={handleVercelDeploy} disabled={!vercelToken.trim() || deploying}>
                  {deploying ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Deploying...</> : 'Deploy'}
                </Button>
              </div>
            </div>
          </div>, document.body
        )}

        {/* Batch Import Modal */}
        {showBatchModal && createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !importing && setShowBatchModal(false)} />
            <div className="relative bg-background rounded-lg shadow-lg w-[500px] p-5 space-y-4">
              <h3 className="text-lg font-semibold">{t('proxyPools.batchTitle')}</h3>
              <div>
                <Label>{t('proxyPools.batchLabel')}</Label>
                <textarea
                  value={batchText}
                  onChange={e => setBatchText(e.target.value)}
                  placeholder={"http://user:pass@host:port\nhost:port:user:pass"}
                  className="w-full min-h-[150px] mt-1 py-2 px-3 text-sm bg-muted/50 border border-border rounded-md focus:ring-1 focus:ring-primary/30 focus:outline-none font-mono"
                />
                <p className="text-[10px] text-muted-foreground mt-1">{t('proxyPools.batchHint')}</p>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowBatchModal(false)} disabled={importing}>{t('proxyPools.cancel')}</Button>
                <Button onClick={handleBatchImport} disabled={!batchText.trim() || importing}>
                  {importing ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Importing...</> : t('proxyPools.import')}
                </Button>
              </div>
            </div>
          </div>, document.body
        )}
      </CardContent>
    </Card>
  )
}
