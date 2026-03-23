import { useState, useEffect } from 'react'
import { Card } from '../ui'
import { Code, Copy, Check, ExternalLink, Eye, EyeOff } from 'lucide-react'
import { Button } from '../ui'
import { useTranslation } from '@/hooks/useTranslation'

export function ApiExamplesPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<'curl' | 'python' | 'javascript'>('curl')
  const [activeApi, setActiveApi] = useState<'openai' | 'anthropic'>('openai')
  const [copied, setCopied] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [proxyConfig, setProxyConfig] = useState<{ port: number; apiKey?: string }>({ port: 5580 })

  const endpoint = `http://127.0.0.1:${proxyConfig.port}`
  const apiKey = proxyConfig.apiKey || ''
  const hasApiKey = apiKey.length > 0

  // Load proxy configuration
  const loadProxyConfig = async () => {
    try {
      const status = await window.api.proxyGetStatus()
      if (status && status.config) {
        setProxyConfig({
          port: status.config.port || 5580,
          apiKey: status.config.apiKey as string | undefined
        })
      }
    } catch (error) {
      console.error('Failed to load proxy config:', error)
    }
  }

  // Load config on mount
  useEffect(() => {
    loadProxyConfig()
  }, [])

  const examples = {
    openai: {
      curl: hasApiKey 
        ? `curl ${endpoint}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -d '{
    "model": "claude-sonnet-4.5",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'`
        : `curl ${endpoint}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-sonnet-4.5",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'`,
      python: hasApiKey
        ? `import requests

response = requests.post(
    "${endpoint}/v1/chat/completions",
    headers={
        "Content-Type": "application/json",
        "Authorization": "Bearer ${apiKey}"
    },
    json={
        "model": "claude-sonnet-4.5",
        "messages": [
            {"role": "user", "content": "Hello!"}
        ]
    }
)

print(response.json())`
        : `import requests

response = requests.post(
    "${endpoint}/v1/chat/completions",
    headers={
        "Content-Type": "application/json"
    },
    json={
        "model": "claude-sonnet-4.5",
        "messages": [
            {"role": "user", "content": "Hello!"}
        ]
    }
)

print(response.json())`,
      javascript: hasApiKey
        ? `fetch("${endpoint}/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer ${apiKey}"
  },
  body: JSON.stringify({
    model: "claude-sonnet-4.5",
    messages: [
      { role: "user", content: "Hello!" }
    ]
  })
})
  .then(res => res.json())
  .then(data => console.log(data));`
        : `fetch("${endpoint}/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model: "claude-sonnet-4.5",
    messages: [
      { role: "user", content: "Hello!" }
    ]
  })
})
  .then(res => res.json())
  .then(data => console.log(data));`
    },
    anthropic: {
      curl: hasApiKey
        ? `curl ${endpoint}/v1/messages \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${apiKey}" \\
  -H "anthropic-version: 2023-06-01" \\
  -d '{
    "model": "claude-sonnet-4.5",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'`
        : `curl ${endpoint}/v1/messages \\
  -H "Content-Type: application/json" \\
  -H "anthropic-version: 2023-06-01" \\
  -d '{
    "model": "claude-sonnet-4.5",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'`,
      python: hasApiKey
        ? `import anthropic

client = anthropic.Anthropic(
    api_key="${apiKey}",
    base_url="${endpoint}"
)

message = client.messages.create(
    model="claude-sonnet-4.5",
    max_tokens=1024,
    messages=[
        {"role": "user", "content": "Hello!"}
    ]
)

print(message.content)`
        : `import anthropic

client = anthropic.Anthropic(
    api_key="",  # No API key required
    base_url="${endpoint}"
)

message = client.messages.create(
    model="claude-sonnet-4.5",
    max_tokens=1024,
    messages=[
        {"role": "user", "content": "Hello!"}
    ]
)

print(message.content)`,
      javascript: hasApiKey
        ? `import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: "${apiKey}",
  baseURL: "${endpoint}"
});

const message = await client.messages.create({
  model: "claude-sonnet-4.5",
  max_tokens: 1024,
  messages: [
    { role: "user", content: "Hello!" }
  ]
});

console.log(message.content);`
        : `import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: "",  // No API key required
  baseURL: "${endpoint}"
});

const message = await client.messages.create({
  model: "claude-sonnet-4.5",
  max_tokens: 1024,
  messages: [
    { role: "user", content: "Hello!" }
  ]
});

console.log(message.content);`
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const importToCCSwitch = () => {
    if (!hasApiKey) {
      return
    }

    // Build the ccswitch:// deep link URL (matching KiroaaS format)
    const params = new URLSearchParams({
      resource: 'provider',
      app: 'claude',
      name: 'Kiro',
      endpoint: endpoint,
      apiKey: apiKey
    })

    const deepLinkUrl = `ccswitch://v1/import?${params.toString()}`
    window.open(deepLinkUrl, '_blank')
  }

  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 p-6 border border-primary/20">
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/20 to-transparent rounded-full blur-2xl" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-primary/20 to-transparent rounded-full blur-2xl" />
        <div className="relative flex items-center gap-4">
          <div className="p-3 rounded-xl bg-primary shadow-lg shadow-primary/25">
            <Code className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-primary">{t('apiExamples.title')}</h1>
            <p className="text-muted-foreground">{t('apiExamples.description')}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* API Examples Card */}
        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200 rounded-[32px] p-6">
          <h2 className="text-lg font-semibold mb-4">{t('apiExamples.title')}</h2>

          {/* API Type Tabs */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setActiveApi('openai')}
              className={`px-4 py-2 rounded-xl transition-colors ${
                activeApi === 'openai'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80'
              }`}
            >
              OpenAI
            </button>
            <button
              onClick={() => setActiveApi('anthropic')}
              className={`px-4 py-2 rounded-xl transition-colors ${
                activeApi === 'anthropic'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80'
              }`}
            >
              Anthropic
            </button>
          </div>

          {/* Language Tabs */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setActiveTab('curl')}
              className={`px-4 py-2 rounded-xl transition-colors ${
                activeTab === 'curl'
                  ? 'bg-primary/10 text-primary border border-primary/20'
                  : 'bg-muted hover:bg-muted/80'
              }`}
            >
              cURL
            </button>
            <button
              onClick={() => setActiveTab('python')}
              className={`px-4 py-2 rounded-xl transition-colors ${
                activeTab === 'python'
                  ? 'bg-primary/10 text-primary border border-primary/20'
                  : 'bg-muted hover:bg-muted/80'
              }`}
            >
              Python
            </button>
            <button
              onClick={() => setActiveTab('javascript')}
              className={`px-4 py-2 rounded-xl transition-colors ${
                activeTab === 'javascript'
                  ? 'bg-primary/10 text-primary border border-primary/20'
                  : 'bg-muted hover:bg-muted/80'
              }`}
            >
              JavaScript
            </button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(examples[activeApi][activeTab])}
              className="ml-auto"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  {t('apiExamples.copied')}
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  {t('apiExamples.copy')}
                </>
              )}
            </Button>
          </div>

          {/* Code Block */}
          <div className="relative">
            <pre className="bg-[#1e1e1e] text-[#d4d4d4] p-4 rounded-xl overflow-x-auto text-sm font-mono">
              <code>{examples[activeApi][activeTab]}</code>
            </pre>
          </div>
        </Card>

        {/* Import to CC Switch Card */}
        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200 rounded-[32px] p-6">
          <h2 className="text-lg font-semibold mb-4">{t('apiExamples.importCCSwitch')}</h2>

          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-xl">
              <div className="p-2 bg-background rounded-lg">
                <Code className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium">CC Switch</h3>
                  <a
                    href="https://github.com/farion1231/cc-switch"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:text-primary/80 transition-colors"
                    title="View on GitHub"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('apiExamples.ccSwitchDesc')}
                </p>
              </div>
            </div>

            <div className="p-4 bg-muted/30 rounded-xl space-y-3">
              <p className="text-sm text-muted-foreground">
                {t('apiExamples.ccSwitchImportDesc')}
              </p>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{t('apiExamples.provider')}</span>
                  <span className="text-sm font-medium">Kiro</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{t('apiExamples.endpoint')}</span>
                  <span className="text-sm font-mono">{endpoint}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{t('apiExamples.apiKey')}</span>
                  <div className="flex items-center gap-2">
                    {hasApiKey ? (
                      <>
                        <span className="text-sm font-mono">{showApiKey ? apiKey : '••••••••'}</span>
                        <button
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="p-1 hover:bg-muted rounded transition-colors"
                          title={showApiKey ? t('apiExamples.hideApiKey') : t('apiExamples.showApiKey')}
                        >
                          {showApiKey ? (
                            <EyeOff className="h-3 w-3" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                        </button>
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground italic">
                        {t('apiExamples.notConfigured')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <Button
              onClick={importToCCSwitch}
              disabled={!hasApiKey}
              className="w-full gap-2 rounded-xl"
            >
              <ExternalLink className="h-4 w-4" />
              {t('apiExamples.importButton')}
            </Button>

            {!hasApiKey && (
              <p className="text-xs text-amber-600 mt-2 text-center">
                {t('apiExamples.configureApiKey')}
              </p>
            )}

            <p className="text-xs text-muted-foreground text-center mt-2">
              {t('apiExamples.ccSwitchInstallHint')}
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}
