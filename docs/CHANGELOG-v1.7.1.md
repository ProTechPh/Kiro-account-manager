# Kiro Account Manager v1.7.1 更新说明

发布日期：2026-05-15

## 🛡️ Circuit Breaker with Exponential Backoff

### 智能熔断器升级
- **指数退避**：冷却时间 = `base × 2^(failures-1)`，不再是固定冷却
  - 1次失败: 60s, 2次: 2m, 3次: 4m, 4次: 8m, ..., 12+次: 1天（上限）
- **概率性重试**：即使账号处于冷却期，也有可配置概率（默认10%）尝试恢复
  - 防止账号永久卡死
- **可配置参数**：
  - `circuitBreakerBaseTimeout`: 基础超时（默认 60秒）
  - `circuitBreakerMaxMultiplier`: 最大退避倍数（默认 1440 = 最大1天）
  - `circuitBreakerRetryChance`: 概率性重试机会（默认 0.1 = 10%）

## ⏱️ Configurable Streaming Timeouts

### 首 Token 超时配置
- **`firstTokenTimeout`**：等待模型首个 token 的超时时间（默认 15秒）
  - 超时后自动重试，切换端点
- **`firstTokenMaxRetries`**：首 token 超时后最大重试次数（默认 3次）
  - 耗尽后返回 504 Gateway Timeout
- **`streamingReadTimeout`**：流式响应读取超时（默认 300秒 = 5分钟）
  - 用于整体请求超时，防止无限等待
  - 较长时间适应工具调用和复杂推理场景

## 🔍 Web Search Tool Auto-Injection

### MCP 工具模拟
- **自动注入 `web_search` 工具**：启用后自动添加到所有请求
- 模型自行决定是否使用搜索功能
- 支持 OpenAI 和 Claude 两种 API 路径
- 智能去重：不会重复注入已存在的工具
- 通过 UI 开关控制（默认关闭）

## 📦 Payload Size Guard (Enhanced)

### Payload 大小保护增强
- **可配置限制**：`payloadMaxBytes`（默认 600KB，匹配 Kiro API ~615KB 硬限制）
- **自动裁剪开关**：`autoTrimPayload`
  - 启用时：自动裁剪最早的历史消息直到满足限制
  - 禁用时：返回明确错误信息，不静默丢弃数据
- 从原来硬编码的 1MB 降低到更安全的 600KB 默认值

## 🧠 Fake Reasoning Budget Cap

### 思考模式预算控制
- **`thinkingBudgetTokens`**：默认思考 token 预算（默认 4000）
  - 客户端未指定时使用此值
- **`thinkingBudgetCap`**：最大预算上限（默认 10000，0=不限制）
  - 防止模型将所有输出 token 花在推理上
  - 客户端指定的 budget 也会被 cap 限制
- **动态 Thinking Prompt**：`buildThinkingModePrompt(budget)` 支持自定义预算
- **Claude `thinking` 字段支持**：识别 `request.thinking.budget_tokens`

## 🖥️ UI Settings

### 新增设置项（高级配置面板）
| 设置 | 说明 | 默认值 |
|------|------|--------|
| Thinking Budget (tokens) | 默认思考 token 预算 | 4000 |
| Thinking Budget Cap | 思考预算上限 | 10000 |
| Payload Size Limit | Payload 大小限制 | 600000 |
| Auto-Trim Payload | 自动裁剪开关 | 启用 |
| First Token Timeout | 首 token 超时 | 15s |
| First Token Max Retries | 首 token 重试次数 | 3 |
| Streaming Read Timeout | 流式读取超时 | 300s |
| Circuit Breaker Base | 熔断器基础超时 | 60s |
| Probabilistic Retry | 概率性重试机会 | 0.1 |
| Web Search Tool | 网络搜索工具注入 | 关闭 |

## 📝 代码变更

### 新增文件
- `src/main/proxy/webSearchTool.ts` — Web Search 工具定义和注入逻辑
- `docs/CHANGELOG-v1.7.1.md` — 本次更新说明

### 主要修改
- **`src/main/proxy/types.ts`**
  - `ProxyConfig` 新增 10 个配置字段
  - `ClaudeRequest` 新增 `thinking` 字段支持
- **`src/main/proxy/accountPool.ts`** — 完全重写
  - 指数退避冷却计算
  - 概率性重试逻辑
  - `updateConfig()` 运行时配置更新
- **`src/main/proxy/kiroApi.ts`**
  - `buildThinkingModePrompt(budget)` 动态生成
  - `updateStreamingTimeouts()` / `getStreamingTimeouts()` 运行时配置
  - Payload 限制从 1MB 降至可配置的 600KB
  - `buildKiroPayload` 新增 `payloadOptions` 参数
  - 总请求超时使用 `STREAMING_READ_TIMEOUT_MS`
- **`src/main/proxy/translator.ts`**
  - `openaiToKiro` / `claudeToKiro` 新增 `payloadOptions` 参数透传
- **`src/main/proxy/proxyServer.ts`**
  - 构造函数初始化 Circuit Breaker 和 Streaming Timeouts
  - `updateConfig()` 同步更新 AccountPool 和超时配置
  - OpenAI/Claude 处理器注入 web_search 工具
  - Thinking 模式使用动态 budget + cap
  - Payload options 透传到 translator
- **`src/renderer/src/components/proxy/ProxyPanel.tsx`**
  - 新增 7 个设置控件
- **`src/renderer/src/i18n/locales/en.ts`** — 新增 13 个翻译键
- **`src/renderer/src/i18n/locales/zh.ts`** — 新增 13 个翻译键

## 🔧 与 kiro-gateway 功能对齐

本次更新将以下 kiro-gateway (Python) 功能完整移植到 Electron 应用：

| kiro-gateway 功能 | 状态 |
|---|---|
| `ACCOUNT_RECOVERY_TIMEOUT` + exponential backoff | ✅ 已实现 |
| `ACCOUNT_MAX_BACKOFF_MULTIPLIER` | ✅ 已实现 |
| `ACCOUNT_PROBABILISTIC_RETRY_CHANCE` | ✅ 已实现 |
| `FIRST_TOKEN_TIMEOUT` | ✅ 已可配置 |
| `FIRST_TOKEN_MAX_RETRIES` | ✅ 已可配置 |
| `STREAMING_READ_TIMEOUT` | ✅ 已可配置 |
| `FAKE_REASONING_MAX_TOKENS` | ✅ 已实现 |
| `FAKE_REASONING_BUDGET_CAP` | ✅ 已实现 |
| `WEB_SEARCH_ENABLED` | ✅ 已实现 |
| `AUTO_TRIM_PAYLOAD` | ✅ 已可配置 |
| `KIRO_MAX_PAYLOAD_BYTES` | ✅ 已可配置 |

---

**完整更新列表**:
- 🛡️ Circuit Breaker 指数退避 + 概率性重试
- ⏱️ 可配置的首 Token 超时和流式读取超时
- 🔍 Web Search 工具自动注入
- 📦 Payload 大小保护增强（可配置限制 + 自动裁剪开关）
- 🧠 Fake Reasoning 预算控制（默认预算 + 上限 cap）
- 🖥️ 10 个新 UI 设置项
- 🌐 中英文翻译完整支持
