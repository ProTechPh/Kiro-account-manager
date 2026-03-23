import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, Button } from '../ui'
import { Github, Heart, Code, ExternalLink, User, MessageCircle, X, RefreshCw, Download, CheckCircle, AlertCircle, Info, Zap } from 'lucide-react'
import kiroLogo from '@/assets/kiro-high-resolution-logo-transparent.png'
import groupQR from '@/assets/交流群.png'
import authorAvatar from '@/assets/author-avatar.png'
import { useAccountsStore } from '@/store/accounts'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/hooks/useTranslation'
import { SmartLinkAd } from '../ads/SmartLinkAd'
import { adConfig } from '@/config/ads'

interface UpdateInfo {
  hasUpdate: boolean
  currentVersion?: string
  latestVersion?: string
  releaseNotes?: string
  releaseName?: string
  releaseUrl?: string
  publishedAt?: string
  assets?: Array<{
    name: string
    downloadUrl: string
    size: number
  }>
  error?: string
}

export function AboutPage() {
  const [version, setVersion] = useState('...')
  const [showGroupQR, setShowGroupQR] = useState(false)
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [showUpdateModal, setShowUpdateModal] = useState(false)
  const { darkMode } = useAccountsStore()
  const { t } = useTranslation()

  useEffect(() => {
    window.api.getAppVersion().then(setVersion)
    // 不自动检查更新，避免 GitHub API 速率限制
    // 用户可以手动点击"检查更新"按钮
  }, [])

  const checkForUpdates = async (showModal = true) => {
    setIsCheckingUpdate(true)
    try {
      const result = await window.api.checkForUpdatesManual()
      setUpdateInfo(result)
      if (showModal || result.hasUpdate) {
        setShowUpdateModal(true)
      }
    } catch (error) {
      console.error('Check update failed:', error)
    } finally {
      setIsCheckingUpdate(false)
    }
  }

  const openReleasePage = () => {
    if (updateInfo?.releaseUrl) {
      window.api.openExternal(updateInfo.releaseUrl)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 p-8 border border-primary/20">
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/20 to-transparent rounded-full blur-2xl" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-primary/20 to-transparent rounded-full blur-2xl" />
        <div className="relative text-center space-y-4">
          <img 
            src={kiroLogo} 
            alt="Kiro" 
            className={cn("h-20 w-auto mx-auto transition-all", darkMode && "invert brightness-0")} 
          />
          <div>
            <h1 className="text-2xl font-bold text-primary">{t('about.appName')}</h1>
            <p className="text-muted-foreground">{t('about.versionLabel', { version })}</p>
          </div>
        <div className="flex gap-2 justify-center flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => checkForUpdates(true)}
            disabled={isCheckingUpdate}
          >
            <RefreshCw className={cn("h-4 w-4", isCheckingUpdate && "animate-spin")} />
            {isCheckingUpdate ? t('about.checkingUpdate') : t('about.checkUpdates')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setShowGroupQR(true)}
          >
            <MessageCircle className="h-4 w-4" />
            {t('about.joinGroup')}
          </Button>
        </div>

        {/* SmartLink Support Button */}
        {adConfig.smartlink.enabled && (
          <div className="mt-4">
            <SmartLinkAd
              url={adConfig.smartlink.url}
              text={t('about.supportDev')}
              className="max-w-xs mx-auto"
            />
          </div>
        )}

        {/* 更新提示 */}
        {updateInfo?.hasUpdate && !showUpdateModal && (
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-sm cursor-pointer hover:bg-primary/20"
            onClick={() => setShowUpdateModal(true)}
          >
            <Download className="h-4 w-4" />
            {t('about.newVersionBadge', { version: updateInfo.latestVersion })}
          </div>
        )}
        </div>
      </div>

      {/* 更新弹窗 */}
      {showUpdateModal && updateInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowUpdateModal(false)} />
          <div className="relative bg-card rounded-xl p-6 shadow-xl z-10 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto">
            <button
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
              onClick={() => setShowUpdateModal(false)}
            >
              <X className="h-5 w-5" />
            </button>
            
            <div className="space-y-4">
              {updateInfo.hasUpdate ? (
                <>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-green-500/10">
                      <Download className="h-6 w-6 text-green-500" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">{t('about.newVersionAvailable')}</h3>
                      <p className="text-sm text-muted-foreground">
                        {updateInfo.currentVersion} → {updateInfo.latestVersion}
                      </p>
                    </div>
                  </div>

                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-sm font-medium mb-2">{updateInfo.releaseName}</p>
                    {updateInfo.publishedAt && (
                      <p className="text-xs text-muted-foreground">
                        {t('about.releasedOn', { date: new Date(updateInfo.publishedAt).toLocaleDateString() })}
                      </p>
                    )}
                  </div>

                  {updateInfo.releaseNotes && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">{t('about.releaseNotesLabel')}</p>
                      <div className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-3 max-h-32 overflow-y-auto whitespace-pre-wrap">
                        {updateInfo.releaseNotes}
                      </div>
                    </div>
                  )}

                  {updateInfo.assets && updateInfo.assets.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">{t('about.downloadFiles')}</p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {updateInfo.assets.slice(0, 6).map((asset, i) => (
                          <div key={i} className="flex items-center justify-between text-xs bg-muted/30 rounded px-2 py-1">
                            <span className="truncate flex-1">{asset.name}</span>
                            <span className="text-muted-foreground ml-2">{formatFileSize(asset.size)}</span>
                          </div>
                        ))}
                        {updateInfo.assets.length > 6 && (
                          <p className="text-xs text-muted-foreground text-center">
                            {t('about.moreFiles', { n: updateInfo.assets.length - 6 })}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <Button className="w-full gap-2" onClick={openReleasePage}>
                    <ExternalLink className="h-4 w-4" />
                    {t('about.goToDownload')}
                  </Button>
                </>
              ) : updateInfo.error ? (
                <>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-red-500/10">
                      <AlertCircle className="h-6 w-6 text-red-500" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">{t('about.checkFailed')}</h3>
                      <p className="text-sm text-muted-foreground">{updateInfo.error}</p>
                    </div>
                  </div>
                  <Button variant="outline" className="w-full" onClick={() => checkForUpdates(true)}>
                    {t('about.retry')}
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-green-500/10">
                      <CheckCircle className="h-6 w-6 text-green-500" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">{t('about.upToDateTitle')}</h3>
                      <p className="text-sm text-muted-foreground">
                        {t('about.upToDateDesc', { version: updateInfo.currentVersion })}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 交流群弹窗 */}
      {showGroupQR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowGroupQR(false)} />
          <div className="relative bg-card rounded-xl p-6 shadow-xl z-10">
            <button
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
              onClick={() => setShowGroupQR(false)}
            >
              <X className="h-5 w-5" />
            </button>
            <div className="text-center space-y-3">
              <h3 className="font-semibold text-lg">{t('about.joinGroupTitle')}</h3>
              <div className="bg-[#07C160]/5 rounded-xl p-3 border border-[#07C160]/20">
                <img src={groupQR} alt="Group" className="w-48 h-48 object-contain" />
              </div>
              <p className="text-sm text-muted-foreground">{t('about.scanQR')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Description */}
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Info className="h-4 w-4 text-primary" />
            </div>
            {t('about.aboutTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-3">
          <p>{t('about.aboutDesc1')}</p>
          <p>{t('about.aboutDesc2')}</p>
        </CardContent>
      </Card>

      {/* Features */}
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            {t('about.featuresTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">✓</span>
              <strong>{t('about.featureMultiAccount')}</strong>{t('about.featureMultiAccountDesc')}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">✓</span>
              <strong>{t('about.featureOneClick')}</strong>{t('about.featureOneClickDesc')}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">✓</span>
              <strong>{t('about.featureAutoRefresh')}</strong>{t('about.featureAutoRefreshDesc')}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">✓</span>
              <strong>{t('about.featureGroupsTags')}</strong>{t('about.featureGroupsTagsDesc')}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">✓</span>
              <strong>{t('about.featurePrivacy')}</strong>{t('about.featurePrivacyDesc')}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">✓</span>
              <strong>{t('about.featureBatchImport')}</strong>{t('about.featureBatchImportDesc')}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">✓</span>
              <strong>{t('about.featureAutoImport')}</strong>{t('about.featureAutoImportDesc')}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">✓</span>
              <strong>{t('about.featureAutoSwitch')}</strong>{t('about.featureAutoSwitchDesc')}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">✓</span>
              <strong>{t('about.featureApiProxy')}</strong>{t('about.featureApiProxyDesc')}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">✓</span>
              <strong>{t('about.featureChat')}</strong>{t('about.featureChatDesc')}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">✓</span>
              <strong>{t('about.featureLogs')}</strong>{t('about.featureLogsDesc')}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">✓</span>
              <strong>{t('about.featureApiExamples')}</strong>{t('about.featureApiExamplesDesc')}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">✓</span>
              <strong>{t('about.featureProxy')}</strong>{t('about.featureProxyDesc')}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">✓</span>
              <strong>{t('about.featureThemes')}</strong>{t('about.featureThemesDesc')}
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* Tech Stack */}
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Code className="h-4 w-4 text-primary" />
            </div>
            {t('about.techStackTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {['Electron', 'React', 'TypeScript', 'Tailwind CSS', 'Zustand', 'Vite'].map((tech) => (
              <span 
                key={tech}
                className="px-2.5 py-1 text-xs bg-muted rounded-full text-muted-foreground"
              >
                {tech}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Author */}
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <User className="h-4 w-4 text-primary" />
            </div>
            {t('about.authorTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img 
                src={authorAvatar}
                alt="ProTechPh"
                className="w-10 h-10 rounded-full"
              />
              <p className="font-medium">ProTechPh</p>
            </div>
            <a 
              href="https://github.com/ProTechPh/Kiro-account-manager" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-muted"
            >
              <Github className="h-4 w-4" />
              GitHub
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="text-center text-xs text-muted-foreground py-4">
        <p className="flex items-center justify-center gap-1">
          Made with <Heart className="h-3 w-3 text-primary" /> for Kiro users
        </p>
      </div>
    </div>
  )
}
