import { hashInput } from '@/lib/ai/hash'
import { buildMicFacts } from '@/lib/mics/ai-facts'
import type { MicFacts } from '@/lib/mics/ai-facts'
import type { MicPolarPattern } from '@/lib/mics/types'

import { profileFor } from './profiles'
import { TECHNIQUE_RULES } from './techniques'
import { MAX_AI_SOURCES } from './types'

import type {
  LockerSnapshot,
  MicRole,
  NormalisedRequest,
  PhantomMode,
  Range,
  RequestRoom,
  RulesOutput,
  SplBand,
  Technique
} from './types'

// What the model is shown (PLAN §4.4 step 3, ADR 0015). Built from the rules
// output and the locker snapshot, then aliased: the model sees c1 / u2 / m1,
// never a database id, slug, serial or note. Its reply is resolved back
// through the alias map, so anything it invents simply fails to resolve.

export { MAX_AI_SOURCES }

export interface ModelOptionUnit {
  unit: string
  mic: string
  role: MicRole
  patternSetting: MicPolarPattern | null
  condition: string
}

export interface ModelOption {
  id: string
  units: ModelOptionUnit[]
  matchedPair: boolean
  // Codes only. The text the user reads is the rules layer's, not the model's.
  reasons: string[]
  warnings: string[]
}

export interface ModelSource {
  id: string
  kind: string
  technique: {
    id: Technique
    label: string
    micCount: number
    roles: MicRole[]
    spacingMm: Range | null
    includedAngleDeg: Range | null
  }
  splBand: SplBand
  placement: {
    distanceMm: Range
    angleDeg: Range
    hints: readonly string[]
  }
  // The option the rules layer would plan, or null.
  rulesPick: string | null
  // Best first.
  options: ModelOption[]
}

export type ModelMic = Omit<MicFacts, 'slug'> & { id: string }

export interface UserText {
  labels: Record<string, string>
  intent: string | null
  question: string | null
}

export interface RecommendationData {
  mode: 'sources' | 'question'
  phantomMode: PhantomMode
  room: {
    widthMm: number
    lengthMm: number
    heightMm: number | null
  } | null
  sources: ModelSource[]
  mics: ModelMic[]
  userText: UserText
}

export interface RecommendationInput {
  // Everything the model sees, and everything numbers are grounded against.
  data: RecommendationData
  // Used by validation only. Never sent and never hashed.
  guard: {
    // Names of catalogue models the studio does not own, so a reply naming one
    // is refused.
    unownedNames: string[]
    // Names of every model the studio does own, candidate or not. A reply may
    // mention one ("not the SM58 here"), so the numbers in these names count as
    // known when text is checked for invented figures.
    ownedNames: string[]
  }
}

export interface AliasMap {
  // option alias -> the rules layer's option
  options: Record<string, { sourceId: string; optionId: string }>
  // unit alias -> real MicrophoneUnit id
  units: Record<string, string>
  // model alias -> catalogue slug
  models: Record<string, string>
}

export interface BuildArgs {
  request: NormalisedRequest
  rules: RulesOutput
  snapshot: LockerSnapshot
  room: RequestRoom | null
  unownedNames: string[]
}

const nameKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '')

// Full name and bare model name, with any "(5th gen)" note dropped from the
// model so a reply that says "NT1" still matches.
export function namesForMic(mic: {
  manufacturer: string
  model: string
}): string[] {
  const model = mic.model.replace(/\(.*?\)/g, '').trim()
  return [`${mic.manufacturer} ${model}`, model]
}

export function buildRecommendationInput(args: BuildArgs): {
  input: RecommendationInput
  aliases: AliasMap
} {
  const { request, rules, snapshot } = args
  const unitsById = new Map(snapshot.units.map((u) => [u.unitId, u]))

  const aliases: AliasMap = { options: {}, units: {}, models: {} }
  const unitAlias = new Map<string, string>()
  const optionAlias = new Map<string, string>()

  const aliasUnit = (unitId: string) => {
    let alias = unitAlias.get(unitId)
    if (!alias) {
      alias = `u${unitAlias.size + 1}`
      unitAlias.set(unitId, alias)
      aliases.units[alias] = unitId
    }
    return alias
  }
  const aliasOption = (sourceId: string, optionId: string) => {
    let alias = optionAlias.get(optionId)
    if (!alias) {
      alias = `c${optionAlias.size + 1}`
      optionAlias.set(optionId, alias)
      aliases.options[alias] = { sourceId, optionId }
    }
    return alias
  }

  const ownedNames = [
    ...new Set(Object.values(snapshot.mics).flatMap(namesForMic))
  ]
  const ownedKeys = new Set(ownedNames.map(nameKey))

  const sent = rules.sources.filter((s) => !s.line && s.candidates.length > 0)

  // Models first, sorted by slug, so aliases don't depend on option order.
  const slugs = [
    ...new Set(
      sent.flatMap((s) =>
        s.candidates.flatMap((c) =>
          c.unitIds.map((id) => unitsById.get(id)?.micSlug ?? '')
        )
      )
    )
  ]
    .filter(Boolean)
    .sort()
  const modelAlias = new Map<string, string>()
  slugs.forEach((slug, index) => {
    modelAlias.set(slug, `m${index + 1}`)
    aliases.models[`m${index + 1}`] = slug
  })

  const sources: ModelSource[] = sent.map((source) => {
    const profile = profileFor(source.kind)
    const rule = TECHNIQUE_RULES[source.technique]
    const options: ModelOption[] = source.candidates.map((candidate) => ({
      id: aliasOption(source.id, candidate.id),
      units: candidate.unitIds.map((unitId, index) => {
        const unit = unitsById.get(unitId)!
        return {
          unit: aliasUnit(unitId),
          mic: modelAlias.get(unit.micSlug)!,
          role: candidate.roles[index],
          patternSetting: candidate.patternSettings[index],
          condition: unit.condition
        }
      }),
      matchedPair: candidate.matchedGroup !== null,
      reasons: candidate.reasons.map((r) => r.code),
      warnings: candidate.warnings.map((w) => w.code)
    }))
    return {
      id: source.id,
      kind: profile.label,
      technique: {
        id: rule.technique,
        label: rule.label,
        micCount: rule.micCount,
        roles: rule.roles.map((r) => r.role),
        spacingMm: rule.spacingMm,
        includedAngleDeg: rule.includedAngleDeg
      },
      splBand: profile.splBand,
      // Sent sources are never line sources, so a profile always has this.
      placement: profile.placement!,
      rulesPick: source.planOptionId
        ? (optionAlias.get(source.planOptionId) ?? null)
        : null,
      options
    }
  })

  // The same facts the catalogue AI sees, with the slug swapped for the alias.
  const mics: ModelMic[] = slugs.map((slug) => {
    const facts: Partial<MicFacts> = buildMicFacts(snapshot.mics[slug])
    delete facts.slug
    return { id: modelAlias.get(slug)!, ...(facts as Omit<MicFacts, 'slug'>) }
  })

  const labels: Record<string, string> = {}
  for (const source of sent) labels[source.id] = source.label

  return {
    input: {
      data: {
        mode: request.kind,
        phantomMode: request.phantomMode,
        room: args.room
          ? {
              widthMm: args.room.widthMm,
              lengthMm: args.room.lengthMm,
              heightMm: args.room.heightMm
            }
          : null,
        sources,
        mics,
        userText: {
          labels,
          intent: request.intent,
          question: request.question
        }
      },
      guard: {
        unownedNames: [
          ...new Set(
            args.unownedNames.filter((n) => !ownedKeys.has(nameKey(n)))
          )
        ].sort(),
        ownedNames: ownedNames.sort()
      }
    },
    aliases
  }
}

// The org-scoped cache key: what the model saw plus how its aliases resolve.
// The guard is deliberately left out so adding a mic to the catalogue does not
// invalidate every earlier answer.
export function hashRecommendationInput(
  input: RecommendationInput,
  aliases: AliasMap
): string {
  return hashInput({ data: input.data, aliases })
}
