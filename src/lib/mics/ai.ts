import {
  micComparisonPrompt,
  sortedBySlug
} from '@/lib/ai/prompts/mic-comparison'
import type { MicComparisonContent } from '@/lib/ai/prompts/mic-comparison'
import { micSummaryPrompt } from '@/lib/ai/prompts/mic-summary'
import type { MicSummaryContent } from '@/lib/ai/prompts/mic-summary'
import { findCachedAi, generateCached } from '@/lib/ai/service'
import type { AiResult } from '@/lib/ai/service'
import { badRequest } from '@/lib/errors'
import type { TenantContext } from '@/lib/tenant-context'

import { buildMicFacts } from './ai-facts'
import { getMic } from './catalogue'
import { MAX_COMPARE, MIN_COMPARE } from './compare'

import type { MicDetail } from './catalogue'

// AI features on the catalogue (PLAN §4.3): a summary per microphone and a
// "which to use when" comparison of 2 to 4. Both are grounded in catalogue
// data only, so results are cached globally by input hash and prompt version
// and regenerate when specs or the prompt change. Reading a cached result
// needs only catalogue access; generating a new one spends AI allowance
// (Permission.USE_AI).

export type MicSummaryResult = AiResult<MicSummaryContent>
export type MicComparisonResult = AiResult<MicComparisonContent>

export async function getMicSummary(
  ctx: TenantContext,
  idOrSlug: string
): Promise<{ mic: MicDetail; summary: MicSummaryResult | null }> {
  const mic = await getMic(ctx, idOrSlug)
  const summary = await findCachedAi(micSummaryPrompt, buildMicFacts(mic))
  return { mic, summary }
}

export async function generateMicSummary(
  ctx: TenantContext,
  idOrSlug: string
): Promise<{ mic: MicDetail; summary: MicSummaryResult }> {
  const mic = await getMic(ctx, idOrSlug)
  const summary = await generateCached(
    ctx,
    micSummaryPrompt,
    buildMicFacts(mic),
    mic.slug
  )
  return { mic, summary }
}

// Resolves 2 to 4 distinct published mics by slug or id, in the order given.
export async function resolveCompareMics(
  ctx: TenantContext,
  refs: readonly string[]
): Promise<MicDetail[]> {
  const unique = [...new Set(refs.map((ref) => ref.trim()).filter(Boolean))]
  if (unique.length < MIN_COMPARE || unique.length > MAX_COMPARE) {
    throw badRequest(
      `Choose between ${MIN_COMPARE} and ${MAX_COMPARE} different microphones to compare.`
    )
  }
  const mics = await Promise.all(unique.map((ref) => getMic(ctx, ref)))
  // Two refs can name the same mic (slug and id).
  const distinct = [...new Map(mics.map((mic) => [mic.id, mic])).values()]
  if (distinct.length < MIN_COMPARE) {
    throw badRequest(
      `Choose between ${MIN_COMPARE} and ${MAX_COMPARE} different microphones to compare.`
    )
  }
  return distinct
}

const comparisonInput = (mics: readonly MicDetail[]) => ({
  mics: sortedBySlug(mics.map(buildMicFacts))
})

const comparisonKey = (mics: readonly MicDetail[]) =>
  mics
    .map((mic) => mic.slug)
    .sort()
    .join('+')

export async function getMicComparison(
  ctx: TenantContext,
  refs: readonly string[]
): Promise<{ mics: MicDetail[]; comparison: MicComparisonResult | null }> {
  const mics = await resolveCompareMics(ctx, refs)
  const comparison = await findCachedAi(
    micComparisonPrompt,
    comparisonInput(mics)
  )
  return { mics, comparison }
}

export async function generateMicComparison(
  ctx: TenantContext,
  refs: readonly string[]
): Promise<{ mics: MicDetail[]; comparison: MicComparisonResult }> {
  const mics = await resolveCompareMics(ctx, refs)
  const comparison = await generateCached(
    ctx,
    micComparisonPrompt,
    comparisonInput(mics),
    comparisonKey(mics)
  )
  return { mics, comparison }
}
