import type { AiModelTier } from '../config'
import type { ZodType } from 'zod'

// A versioned prompt module (ADR 0007). Bump `version` whenever `system`,
// `build` or `schema` changes meaning: the version is part of the cache key, so
// old cached output is never served for a new prompt.

export type AiSummaryKind = 'mic' | 'comparison'

export interface Prompt<Input, Output> {
  id: string
  kind: AiSummaryKind
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
