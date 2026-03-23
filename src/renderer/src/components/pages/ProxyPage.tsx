import { ProxyPanel } from '../proxy'
import { useTranslation } from '@/hooks/useTranslation'
import { Server } from 'lucide-react'

export function ProxyPage() {
  const { t } = useTranslation()

  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto">
      {/* 页面标题 - 与设置页面样式一致 */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 p-6 border border-primary/20">
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/20 to-transparent rounded-full blur-2xl" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-primary/20 to-transparent rounded-full blur-2xl" />
        <div className="relative flex items-center gap-4">
          <div className="p-3 rounded-xl bg-primary shadow-lg shadow-primary/25">
            <Server className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-primary">{t('nav.proxy')}</h1>
            <p className="text-muted-foreground">{t('settings.proxy.proxyServiceDesc')}</p>
          </div>
        </div>
      </div>
      <ProxyPanel />
    </div>
  )
}
