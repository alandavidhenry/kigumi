// AI configuration read from the environment (CLAUDE.md "Environment
// Variables"). Model ids are config, never hard-coded at call sites.

export type AiModelTier = 'default' | 'fast'

const DEFAULT_MODELS: Readonly<Record<AiModelTier, string>> = {
  default: 'claude-sonnet-5-5',
  fast: 'claude-haiku-5-5'
}

export function modelFor(tier: AiModelTier): string {
  const fromEnv =
    tier === 'default'
      ? process.env.AI_MODEL_DEFAULT
      : process.env.AI_MODEL_FAST
  return fromEnv?.trim() || DEFAULT_MODELS[tier]
}

// Short-window burst protection per organisation, on top of the monthly
// allowance in PLAN_LIMITS. Only requests that reach the provider count;
// cached answers are free.
export const AI_RATE_LIMIT = { max: 10, windowMs: 60_000 } as const

export function aiEnabled(): boolean {
  const value = process.env.AI_ENABLED?.trim().toLowerCase()
  return value !== 'false' && value !== '0' && value !== 'off'
}

const isProduction = () => process.env.NODE_ENV === 'production'

// Platform-wide ceiling on paid model calls per UTC day, across every
// organisation (ADR 0014). The default is deliberately low outside production
// so testing can't run up a bill; raise it with AI_DAILY_REQUEST_CAP.
export function dailyRequestCap(): number {
  const raw = process.env.AI_DAILY_REQUEST_CAP?.trim()
  const parsed = raw ? Number(raw) : NaN
  if (Number.isInteger(parsed) && parsed >= 0) return parsed
  return isProduction() ? 1000 : 100
}

export type AiProviderName = 'anthropic' | 'local'

export function providerName(): AiProviderName {
  return process.env.AI_PROVIDER?.trim().toLowerCase() === 'local'
    ? 'local'
    : 'anthropic'
}

export const LOCAL_DEFAULT_BASE_URL = 'http://localhost:11434/v1'

export function localConfig(): { baseUrl: string; model: string | null } {
  return {
    baseUrl:
      process.env.AI_LOCAL_BASE_URL?.trim().replace(/\/+$/, '') ||
      LOCAL_DEFAULT_BASE_URL,
    model: process.env.AI_LOCAL_MODEL?.trim() || null
  }
}
