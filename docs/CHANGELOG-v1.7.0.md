# Kiro Account Manager v1.7.0 更新说明

发布日期：2026-03-26

## 🔑 API Key Management System

### 全新 API Key 管理功能
- **多 API Key 支持**：完全独立的 API Key 管理系统，无需依赖主密钥
- **RESTful API 端点**：完整的 CRUD 操作支持
- **三种密钥格式**：支持 `sk-kiro-*`、`simple`、`token` 格式
- **用量统计**：详细的请求、Token、Credits 统计
- **额度限制**：可为每个 API Key 设置 Credits 上限

### API 端点列表
- `GET /api/v1/keys` - 列出所有 API Keys
- `POST /api/v1/keys` - 创建新 API Key
- `GET /api/v1/keys/{keyId}` - 获取特定 API Key 详情
- `PUT /api/v1/keys/{keyId}` - 更新 API Key
- `DELETE /api/v1/keys/{keyId}` - 删除 API Key
- `POST /api/v1/keys/{keyId}/regenerate` - 重新生成 API Key
- `GET /api/v1/keys/{keyId}/usage` - 获取使用统计
- `POST /api/v1/keys/bulk` - 批量操作（启用/禁用/删除）

### 安全特性
- **Bearer Token 认证**：支持 `Authorization: Bearer` 和 `X-API-Key` 头
- **密钥掩码**：列表显示时自动掩码敏感信息
- **额度检查**：自动检查并阻止超额使用
- **启用/禁用控制**：可随时启用或禁用特定 API Key

### 统计功能
- **实时用量跟踪**：请求数、输入/输出 Token、Credits 消耗
- **按日统计**：每日用量详细记录
- **按模型统计**：不同模型的使用情况分析
- **历史记录**：保留最近 100 条使用记录
- **时间范围查询**：支持 1d/7d/30d/90d/all 时间段查询

### 批量操作
- **批量启用/禁用**：一次操作多个 API Key
- **批量删除**：支持批量删除不需要的密钥
- **操作结果反馈**：详细的批量操作结果报告

## 📝 代码变更

### 新增文件
- `api-key-endpoints.md` - API 端点完整文档
- `docs/CHANGELOG-v1.7.0.md` - 本次更新说明

### 主要修改
- **ProxyServer** (`src/main/proxy/proxyServer.ts`)
  - 新增 `handleApiKeyManagement()` 方法
  - 新增 8 个 API Key 管理处理方法
  - 新增 `generateApiKey()` 和 `maskApiKey()` 工具方法
  - 更新路由处理逻辑支持 `/api/v1/keys` 端点

### 类型定义增强
- **ApiKey 接口**：完整的 API Key 数据结构
- **ApiKeyFormat 类型**：支持三种密钥格式
- **ApiKeyUsageRecord 接口**：用量记录数据结构
- **ProxyConfig 接口**：增强多 API Key 配置支持

## 🔧 技术实现

### 响应格式标准化
```json
{
  "success": true,
  "data": [...],
  "total": 0
}
```

### 错误处理
- **标准错误码**：401 (未授权)、404 (未找到)、429 (额度超限)
- **详细错误信息**：包含具体的错误原因和建议
- **批量操作错误**：单独报告每个操作的成功/失败状态

### 性能优化
- **内存高效**：使用 Map 数据结构优化查找性能
- **配置持久化**：自动保存配置变更到存储
- **事件通知**：配置变更时触发回调通知

---

**完整更新列表**:
- 🔑 独立 API Key 管理系统
- 🌐 RESTful API 端点
- 📊 详细用量统计
- 🔒 安全认证机制
- 📈 实时监控功能
- 🔧 批量操作支持
- 📝 完整 API 文档
- 🛡️ 额度限制保护