// 多账号轮询管理器 - Circuit Breaker with Exponential Backoff
import type { ProxyAccount, AccountStats } from './types'

export interface AccountPoolConfig {
  cooldownMs: number // 基础恢复超时（毫秒）- 用于指数退避
  maxErrorCount: number // 最大连续错误次数（触发冷却）
  quotaResetMs: number // 配额重置时间
  // Circuit Breaker 增强配置
  maxBackoffMultiplier: number // 最大退避倍数上限（默认 1440 = 1天 with 60s base）
  probabilisticRetryChance: number // 概率性重试机会（0.0-1.0，默认 0.1）
}

const DEFAULT_CONFIG: AccountPoolConfig = {
  cooldownMs: 60000, // 1分钟基础冷却
  maxErrorCount: 3, // 3次错误后暂停
  quotaResetMs: 3600000, // 1小时配额重置
  maxBackoffMultiplier: 1440, // 最大 1440 倍 = 60s * 1440 = 86400s = 1天
  probabilisticRetryChance: 0.1 // 10% 概率重试
}

export class AccountPool {
  private accounts: Map<string, ProxyAccount> = new Map()
  private accountStats: Map<string, AccountStats> = new Map()
  private currentIndex: number = 0
  private config: AccountPoolConfig

  constructor(config: Partial<AccountPoolConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  // 更新配置（运行时）
  updateConfig(config: Partial<AccountPoolConfig>): void {
    this.config = { ...this.config, ...config }
  }

  // 添加账号
  addAccount(account: ProxyAccount): void {
    this.accounts.set(account.id, {
      ...account,
      isAvailable: true,
      requestCount: 0,
      errorCount: 0,
      lastUsed: 0
    })
    this.accountStats.set(account.id, {
      requests: 0,
      tokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      errors: 0,
      lastUsed: 0,
      avgResponseTime: 0,
      totalResponseTime: 0
    })
    console.log(`[AccountPool] Added account: ${account.email || account.id}`)
  }

  // 移除账号
  removeAccount(accountId: string): void {
    this.accounts.delete(accountId)
    this.accountStats.delete(accountId)
    console.log(`[AccountPool] Removed account: ${accountId}`)
  }

  // 更新账号
  updateAccount(accountId: string, updates: Partial<ProxyAccount>): void {
    const account = this.accounts.get(accountId)
    if (account) {
      this.accounts.set(accountId, { ...account, ...updates })
    }
  }

  // 获取下一个可用账号（轮询）
  getNextAccount(): ProxyAccount | null {
    const accountList = Array.from(this.accounts.values())
    if (accountList.length === 0) {
      return null
    }

    const now = Date.now()
    let attempts = 0
    const maxAttempts = accountList.length

    while (attempts < maxAttempts) {
      const account = accountList[this.currentIndex]
      this.currentIndex = (this.currentIndex + 1) % accountList.length

      // 检查账号是否可用
      if (this.isAccountAvailable(account, now)) {
        return account
      }

      attempts++
    }

    // 没有可用账号，尝试概率性重试
    const probabilisticAccount = this.tryProbabilisticRetry(accountList, now)
    if (probabilisticAccount) {
      console.log(`[AccountPool] Probabilistic retry: using account ${probabilisticAccount.email || probabilisticAccount.id} (${(this.config.probabilisticRetryChance * 100).toFixed(0)}% chance)`)
      return probabilisticAccount
    }

    // 返回冷却时间最短的
    return this.getAccountWithShortestCooldown(accountList, now)
  }

  // 获取特定账号
  getAccount(accountId: string): ProxyAccount | null {
    return this.accounts.get(accountId) || null
  }

  // 获取下一个可用账号（排除当前账号）
  getNextAvailableAccount(excludeAccountId: string): ProxyAccount | null {
    const accountList = Array.from(this.accounts.values())
    if (accountList.length <= 1) {
      return null
    }

    const now = Date.now()
    
    // 尝试找到一个可用的账号（排除当前账号）
    for (const account of accountList) {
      if (account.id !== excludeAccountId && this.isAccountAvailable(account, now)) {
        return account
      }
    }

    // 尝试概率性重试（排除当前账号）
    const otherAccounts = accountList.filter(a => a.id !== excludeAccountId)
    const probabilisticAccount = this.tryProbabilisticRetry(otherAccounts, now)
    if (probabilisticAccount) {
      return probabilisticAccount
    }

    // 没有立即可用的账号，返回冷却时间最短的（排除当前账号）
    return this.getAccountWithShortestCooldown(otherAccounts, now)
  }

  // 获取所有账号
  getAllAccounts(): ProxyAccount[] {
    return Array.from(this.accounts.values())
  }

  // 检查账号是否可用
  private isAccountAvailable(account: ProxyAccount, now: number): boolean {
    // 检查冷却时间
    if (account.cooldownUntil && account.cooldownUntil > now) {
      return false
    }

    // 检查错误计数（只有在没有冷却时间时才检查）
    if ((account.errorCount || 0) >= this.config.maxErrorCount && !account.cooldownUntil) {
      return false
    }

    // 检查 token 是否过期
    if (account.expiresAt && account.expiresAt < now) {
      return false
    }

    return account.isAvailable !== false
  }

  // 概率性重试：即使账号在冷却期，也有一定概率尝试
  private tryProbabilisticRetry(accounts: ProxyAccount[], now: number): ProxyAccount | null {
    if (this.config.probabilisticRetryChance <= 0) return null

    // 只对处于冷却期的账号尝试概率性重试
    const cooldownAccounts = accounts.filter(a => 
      a.cooldownUntil && a.cooldownUntil > now && 
      a.isAvailable !== false &&
      !(a.expiresAt && a.expiresAt < now)
    )

    if (cooldownAccounts.length === 0) return null

    // 对每个冷却中的账号掷骰子
    if (Math.random() < this.config.probabilisticRetryChance) {
      // 选择错误次数最少的账号
      cooldownAccounts.sort((a, b) => (a.errorCount || 0) - (b.errorCount || 0))
      return cooldownAccounts[0]
    }

    return null
  }

  // 计算指数退避冷却时间
  private calculateExponentialBackoff(errorCount: number): number {
    // timeout = base * 2^(failures - 1), capped at base * maxMultiplier
    const exponent = Math.min(errorCount - 1, 20) // 防止溢出
    const multiplier = Math.min(Math.pow(2, exponent), this.config.maxBackoffMultiplier)
    return Math.round(this.config.cooldownMs * multiplier)
  }

  // 获取冷却时间最短的账号
  private getAccountWithShortestCooldown(accounts: ProxyAccount[], now: number): ProxyAccount | null {
    let bestAccount: ProxyAccount | null = null
    let shortestWait = Infinity

    for (const account of accounts) {
      const cooldownUntil = account.cooldownUntil || 0
      const wait = Math.max(0, cooldownUntil - now)
      
      if (wait < shortestWait) {
        shortestWait = wait
        bestAccount = account
      }
    }

    return bestAccount
  }

  // 记录请求成功
  recordSuccess(accountId: string, tokens: number = 0): void {
    const account = this.accounts.get(accountId)
    if (account) {
      this.accounts.set(accountId, {
        ...account,
        requestCount: (account.requestCount || 0) + 1,
        errorCount: 0, // 重置错误计数
        lastUsed: Date.now(),
        isAvailable: true,
        cooldownUntil: undefined // 成功后清除冷却
      })
    }

    const stats = this.accountStats.get(accountId)
    if (stats) {
      this.accountStats.set(accountId, {
        ...stats,
        requests: stats.requests + 1,
        tokens: stats.tokens + tokens,
        lastUsed: Date.now()
      })
    }
  }

  // 记录请求失败（使用指数退避）
  recordError(accountId: string, isQuotaError: boolean = false): void {
    const account = this.accounts.get(accountId)
    if (!account) return

    const errorCount = (account.errorCount || 0) + 1
    const now = Date.now()

    let cooldownUntil: number | undefined
    let isAvailable = account.isAvailable !== false

    if (isQuotaError) {
      // 配额错误，长时间冷却
      cooldownUntil = now + this.config.quotaResetMs
      console.log(`[AccountPool] Account ${account.email || accountId} quota exhausted, cooldown until ${new Date(cooldownUntil).toISOString()}`)
    } else if (errorCount >= this.config.maxErrorCount) {
      // 连续错误过多，使用指数退避计算冷却时间
      const backoffMs = this.calculateExponentialBackoff(errorCount)
      cooldownUntil = now + backoffMs
      const backoffSec = Math.round(backoffMs / 1000)
      console.log(`[AccountPool] Account ${account.email || accountId} circuit breaker: ${errorCount} errors, backoff ${backoffSec}s (until ${new Date(cooldownUntil).toISOString()})`)
    }

    this.accounts.set(accountId, {
      ...account,
      errorCount,
      cooldownUntil,
      isAvailable,
      lastUsed: now
    })

    const stats = this.accountStats.get(accountId)
    if (stats) {
      this.accountStats.set(accountId, {
        ...stats,
        errors: stats.errors + 1,
        lastUsed: now
      })
    }
  }

  // 标记账号需要刷新 Token
  markNeedsRefresh(accountId: string): void {
    const account = this.accounts.get(accountId)
    if (account) {
      this.accounts.set(accountId, {
        ...account,
        isAvailable: false
      })
    }
  }

  // 获取统计信息
  getStats(): { accounts: Map<string, AccountStats>; total: { requests: number; tokens: number; errors: number } } {
    let totalRequests = 0
    let totalTokens = 0
    let totalErrors = 0

    for (const stats of this.accountStats.values()) {
      totalRequests += stats.requests
      totalTokens += stats.tokens
      totalErrors += stats.errors
    }

    return {
      accounts: new Map(this.accountStats),
      total: {
        requests: totalRequests,
        tokens: totalTokens,
        errors: totalErrors
      }
    }
  }

  // 重置所有账号状态
  reset(): void {
    for (const [id, account] of this.accounts) {
      this.accounts.set(id, {
        ...account,
        isAvailable: true,
        errorCount: 0,
        cooldownUntil: undefined
      })
    }
    this.currentIndex = 0
  }

  // 清空所有账号
  clear(): void {
    this.accounts.clear()
    this.accountStats.clear()
    this.currentIndex = 0
  }

  // 获取账号数量
  get size(): number {
    return this.accounts.size
  }

  // 获取可用账号数量
  get availableCount(): number {
    const now = Date.now()
    let count = 0
    for (const account of this.accounts.values()) {
      if (this.isAccountAvailable(account, now)) {
        count++
      }
    }
    return count
  }
}
