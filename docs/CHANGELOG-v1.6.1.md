# Kiro 账户管理器 v1.6.1 更新说明

发布日期：2026-03-23

## 🌐 全面 i18n 重构

### 翻译系统统一
将所有渲染层组件中的硬编码中英文三元表达式（`isEn ? 'English' : '中文'`）全部替换为统一的 `t()` 翻译函数调用，彻底消除双语硬编码。

### 涉及组件
- **账号管理**：AccountCard、AccountDetailDialog、AccountFilter、AccountGrid、AccountManager、AccountToolbar、AddAccountDialog、EditAccountDialog、ExportDialog、GroupManageDialog、TagManageDialog
- **代理服务**：ProxyPanel、ProxyLogsDialog、ApiKeyManager、ApiKeyUsageDialog、AccountSelectDialog、ModelsDialog、ModelMappingDialog
- **页面**：HomePage、SettingsPage、ProxyPage、AboutPage、ChatPage、LogsPage、ApiExamplesPage
- **通用组件**：CloseConfirmDialog、UpdateDialog

### 新增翻译键
在 `en.ts` 和 `zh.ts` 中新增以下翻译节：
- `home.*` — 主页所有文本
- `settings.*` — 设置页完整重构
- `proxy.*` / `proxyPanel.*` — 代理服务面板
- `proxyLogs.*` — 请求日志对话框
- `modelsDialog.*` — 模型列表对话框
- `modelMapping.*` — 模型映射对话框
- `apiKeyManager.*` / `apiKeyUsage.*` — API Key 管理
- `accountSelect.*` — 账号选择对话框
- `addAccount.*` — 添加账号对话框
- `chat.*` — 聊天页面
- `logs.*` — 系统日志页面
- `apiExamples.*` — API 示例页面
- `about.*` — 关于页面（扩展）
- `closeConfirm.*` — 关闭确认对话框

---

**完整更新列表**:
- 🌐 全面 i18n 重构，消除所有硬编码双语文本
- 📝 新增 500+ 翻译键（中英双语）
- 🔧 统一使用 `t()` 函数，支持参数插值
