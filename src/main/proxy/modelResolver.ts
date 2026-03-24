/**
 * Dynamic Model Resolution System
 * Ported from kiro-gateway/kiro/model_resolver.py
 *
 * 4-layer resolution pipeline:
 * 0. Resolve alias (custom name mappings)
 * 1. Normalize name (dashes→dots, strip dates)
 * 2. Check dynamic cache (from /ListAvailableModels API)
 * 3. Check hidden models (manual config for undocumented models)
 * 4. Pass-through (unknown models sent to Kiro as-is)
 *
 * Key principle: We are a gateway, not a gatekeeper.
 * Kiro API is the final arbiter of what models exist.
 */

// ==============================================================================
// Configuration
// ==============================================================================

/** Hidden models — not in Kiro's /ListAvailableModels but still functional. */
export const HIDDEN_MODELS: Record<string, string> = {
  'claude-3.7-sonnet': 'CLAUDE_3_7_SONNET_20250219_V1_0',
}

/**
 * Model aliases — custom names that map to real model IDs.
 * Useful to avoid IDE namespace conflicts (e.g. Cursor's "auto").
 */
export const MODEL_ALIASES: Record<string, string> = {
  'auto-kiro': 'auto',
}

/** Models to hide from /v1/models response (still work when requested directly). */
export const HIDDEN_FROM_LIST: string[] = ['auto']

// Fallback model list — used when /ListAvailableModels is unreachable
export const FALLBACK_MODELS: string[] = [
  'auto',
  'claude-sonnet-4',
  'claude-haiku-4.5',
  'claude-sonnet-4.5',
  'claude-opus-4.5',
]

// ==============================================================================
// Model Info Cache (ported from kiro-gateway/kiro/cache.py)
// ==============================================================================

export interface CachedModelInfo {
  modelId: string
  modelName?: string
  description?: string
}

/**
 * In-memory cache of models fetched from Kiro's /ListAvailableModels API.
 * Populated at startup and periodically refreshed.
 * Ported from kiro-gateway/kiro/cache.py ModelInfoCache
 */
export class ModelInfoCache {
  private models: Map<string, CachedModelInfo> = new Map()
  private hiddenModels: Map<string, CachedModelInfo> = new Map()
  private lastUpdated: number = 0
  readonly ttlMs: number

  constructor(ttlMs: number = 60 * 60 * 1000) {
    this.ttlMs = ttlMs
  }

  /** Update the cache with a fresh list of models from Kiro API. */
  update(modelList: Array<{ modelId: string; modelName?: string; description?: string }>): void {
    this.models.clear()
    for (const m of modelList) {
      this.models.set(m.modelId, { modelId: m.modelId, modelName: m.modelName, description: m.description })
    }
    this.lastUpdated = Date.now()
  }

  /** Add a hidden model (one not returned by /ListAvailableModels). */
  addHiddenModel(displayName: string, internalId: string): void {
    this.hiddenModels.set(displayName, { modelId: internalId, modelName: displayName })
    // Also register the internal ID as a valid model
    this.hiddenModels.set(internalId, { modelId: internalId })
  }

  /** Returns true if the model ID exists in the dynamic cache or hidden models. */
  isValidModel(modelId: string): boolean {
    return this.models.has(modelId) || this.hiddenModels.has(modelId)
  }

  /** Returns all known model IDs from the dynamic cache. */
  getAllModelIds(): string[] {
    return [...this.models.keys()]
  }

  /** Returns true if the cache has been populated (has at least one model). */
  isPopulated(): boolean {
    return this.models.size > 0
  }

  /** Returns true if the cache TTL has expired. */
  isExpired(): boolean {
    return this.lastUpdated === 0 || Date.now() - this.lastUpdated > this.ttlMs
  }
}

// ==============================================================================
// Normalization
// ==============================================================================

/**
 * Normalize client model name to Kiro format.
 *
 * Transformations:
 *   claude-haiku-4-5           → claude-haiku-4.5
 *   claude-haiku-4-5-20251001  → claude-haiku-4.5
 *   claude-haiku-4-5-latest    → claude-haiku-4.5
 *   claude-sonnet-4-20250514   → claude-sonnet-4
 *   claude-3-7-sonnet          → claude-3.7-sonnet
 *   claude-3-7-sonnet-20250219 → claude-3.7-sonnet
 *   claude-4.5-opus-high       → claude-opus-4.5
 */
export function normalizeModelName(name: string): string {
  if (!name) return name
  const n = name.toLowerCase()

  // Pattern 1: claude-{family}-{major}-{minor}(-{suffix})?
  // minor is 1-2 digits only (not 8-digit dates)
  const p1 = /^(claude-(?:haiku|sonnet|opus)-\d+)-(\d{1,2})(?:-(?:\d{8}|latest|\d+))?$/
  let m = n.match(p1)
  if (m) return `${m[1]}.${m[2]}`

  // Pattern 2: claude-{family}-{major}(-{date})?  (no minor version)
  const p2 = /^(claude-(?:haiku|sonnet|opus)-\d+)(?:-\d{8})?$/
  m = n.match(p2)
  if (m) return m[1]

  // Pattern 3: legacy claude-{major}-{minor}-{family}(-{suffix})?
  const p3 = /^(claude)-(\d+)-(\d+)-(haiku|sonnet|opus)(?:-(?:\d{8}|latest|\d+))?$/
  m = n.match(p3)
  if (m) return `${m[1]}-${m[2]}.${m[3]}-${m[4]}`

  // Pattern 4: already normalized with dot but has date suffix
  const p4 = /^(claude-(?:\d+\.\d+-)?(?:haiku|sonnet|opus)(?:-\d+\.\d+)?)-\d{8}$/
  m = n.match(p4)
  if (m) return m[1]

  // Pattern 5: inverted format with suffix — claude-{major}.{minor}-{family}-{suffix}
  const p5 = /^claude-(\d+)\.(\d+)-(haiku|sonnet|opus)-(.+)$/
  m = n.match(p5)
  if (m) return `claude-${m[3]}-${m[1]}.${m[2]}`

  return name
}

// ==============================================================================
// ModelResolution
// ==============================================================================

export interface ModelResolution {
  /** ID to send to Kiro API */
  internalId: string
  /** "cache" | "hidden" | "passthrough" */
  source: string
  originalRequest: string
  normalized: string
  /** True if found in cache or hidden models, false if passthrough */
  isVerified: boolean
}

// ==============================================================================
// ModelResolver
// ==============================================================================

export class ModelResolver {
  private hiddenModels: Record<string, string>
  private aliases: Record<string, string>
  private hiddenFromList: Set<string>
  private cache: ModelInfoCache

  constructor(
    hiddenModels: Record<string, string> = HIDDEN_MODELS,
    aliases: Record<string, string> = MODEL_ALIASES,
    hiddenFromList: string[] = HIDDEN_FROM_LIST,
    cache?: ModelInfoCache
  ) {
    this.hiddenModels = hiddenModels
    this.aliases = aliases
    this.hiddenFromList = new Set(hiddenFromList)
    this.cache = cache ?? new ModelInfoCache()

    // Register hidden models in the cache
    for (const [displayName, internalId] of Object.entries(this.hiddenModels)) {
      this.cache.addHiddenModel(displayName, internalId)
    }
  }

  /**
   * Update the dynamic model cache with fresh data from Kiro API.
   * Call this whenever new models are fetched.
   */
  updateCache(modelList: Array<{ modelId: string; modelName?: string; description?: string }>): void {
    this.cache.update(modelList)
    // Re-register hidden models (they may have been cleared)
    for (const [displayName, internalId] of Object.entries(this.hiddenModels)) {
      this.cache.addHiddenModel(displayName, internalId)
    }
  }

  /**
   * Resolve external model name to internal Kiro ID.
   *
   * 4-layer pipeline — never throws, always returns a resolution.
   * Layer 0: alias  → Layer 1: normalize → Layer 2: cache → Layer 3: hidden → Layer 4: passthrough
   */
  resolve(externalModel: string): ModelResolution {
    // Layer 0: alias
    const resolved = this.aliases[externalModel] ?? externalModel
    if (resolved !== externalModel) {
      console.debug(`[ModelResolver] Alias resolved: '${externalModel}' → '${resolved}'`)
    }

    // Layer 1: normalize name (dashes→dots, strip dates)
    const normalized = normalizeModelName(resolved)
    console.debug(`[ModelResolver] Model resolution: '${externalModel}' → normalized: '${normalized}'`)

    // Layer 2: check dynamic cache (from /ListAvailableModels)
    if (this.cache.isPopulated() && this.cache.isValidModel(normalized)) {
      console.debug(`[ModelResolver] Model '${normalized}' found in dynamic cache`)
      return {
        internalId: normalized,
        source: 'cache',
        originalRequest: externalModel,
        normalized,
        isVerified: true,
      }
    }

    // Layer 3: check hidden models
    if (normalized in this.hiddenModels) {
      const internalId = this.hiddenModels[normalized]
      console.debug(`[ModelResolver] Model '${normalized}' found in hidden models → '${internalId}'`)
      return {
        internalId,
        source: 'hidden',
        originalRequest: externalModel,
        normalized,
        isVerified: true,
      }
    }

    // Layer 4: pass-through — let Kiro decide
    console.debug(`[ModelResolver] Model '${externalModel}' (normalized: '${normalized}') not in cache, passing through`)
    return {
      internalId: normalized,
      source: 'passthrough',
      originalRequest: externalModel,
      normalized,
      isVerified: false,
    }
  }

  /**
   * Returns extra model entries to add to /v1/models response:
   * hidden model display names + alias keys, minus hiddenFromList entries.
   */
  getExtraModels(now: number): Array<{ id: string; object: string; created: number; owned_by: string }> {
    const ids = new Set<string>()

    // Hidden model display names
    for (const key of Object.keys(this.hiddenModels)) {
      if (!this.hiddenFromList.has(key)) ids.add(key)
    }

    // Alias keys
    for (const key of Object.keys(this.aliases)) {
      if (!this.hiddenFromList.has(key)) ids.add(key)
    }

    return [...ids].map(id => ({ id, object: 'model', created: now, owned_by: 'kiro-proxy' }))
  }

  /** Returns true if the model ID should be excluded from /v1/models listing. */
  isHiddenFromList(modelId: string): boolean {
    return this.hiddenFromList.has(modelId)
  }

  /** Returns true if the dynamic cache has been populated. */
  isCachePopulated(): boolean {
    return this.cache.isPopulated()
  }
}

export const modelResolver = new ModelResolver()
