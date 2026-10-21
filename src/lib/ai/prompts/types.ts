import type { AiModelTier } from '../config'
import type { ZodType } from 'zod'

// A versioned prompt module (ADR 0007). Bump `version` whenever `system`,
// `build` or `schema` changes meaning: the version is part of the cache key, so
// old cached output is never served for a new prompt.

export type AiSummaryKind = 'mic' | 'comparison'

interface PromptBase<Input, Output> {
  id: string
  version: string
  tier: AiModelTier
  system: string
  schema: ZodType<Output>
  // The user message. Untrusted text is only ever placed inside delimited
  // data blocks here, never in `system`.
  build(input: Input): string
  // Extra checks the schema cannot express (numbers that are not in the
  // input, unknown ids). Returns human-readable problems; none means valid.
  validate?(output: Output, input: Input): string[]
}

// A prompt whose input is catalogue data only, so its output may be cached
// globally in AiSummary and shared by every organisation (ADR 0013).
export interface Prompt<Input, Output> extends PromptBase<Input, Output> {
  kind: AiSummaryKind
  tenant?: never
}

// A prompt whose input includes tenant data (a studio's locker, its requests).
// It can never use the global cache: generateCached and findCachedAi refuse it
// at runtime as well as in the types, and its results live in tenant-scoped
// tables behind generateForTenant (ADR 0015).
export interface TenantPrompt<Input, Output> extends PromptBase<Input, Output> {
  tenant: true
  kind?: never
}

export function isTenantPrompt(prompt: {
  tenant?: unknown
}): prompt is { tenant: true } {
  return prompt.tenant === true
}
