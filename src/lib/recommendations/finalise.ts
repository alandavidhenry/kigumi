import type { MicPolarPattern } from '@/lib/mics/types'

import { micName } from './names'

import type { AliasMap } from './llm-input'
import type { RecommendationContent, ReplyPlacement } from './reply'
import type {
  LockerSnapshot,
  MicRole,
  NormalisedRequest,
  RuleOption,
  RuleSource,
  RuleWarning,
  RulesOutput,
  Technique,
  UnfillableReason
} from './types'
import type { SourceKind } from './types'

// Turns a validated model reply into what the user sees (ADR 0015). Always
// succeeds: the one thing validation cannot catch is two sources choosing the
// same physical unit, so that is repaired here by rule, and every repair is
// recorded. Names and warnings come from the catalogue and the rules layer,
// never from the model's text.

export interface FinalUnit {
  unitId: string
  micSlug: string
  name: string
  role: MicRole
  patternSetting: MicPolarPattern | null
}

export interface FinalOption {
  optionId: string
  units: FinalUnit[]
  matchedGroup: string | null
  warnings: RuleWarning[]
}

export type PickOrigin = 'ai' | 'ai_alternative' | 'rules'

export interface FinalPick extends FinalOption {
  origin: PickOrigin
  reasoning: string
  // Only kept when the model's own primary stands; a repaired pick has none.
  placement: ReplyPlacement | null
}

export interface FinalAlternative extends FinalOption {
  reason: string
  // The source whose pick already uses one of these units, if any.
  inUseBy: string | null
}

export interface FinalSource {
  sourceId: string
  label: string
  kind: SourceKind
  technique: Technique
  micCount: number
  line: boolean
  unfillable: UnfillableReason | null
  primary: FinalPick | null
  alternatives: FinalAlternative[]
  rulesPickOptionId: string | null
  adjusted: { reason: 'unit_in_use'; originalOptionId: string } | null
}

export interface FinalView {
  answerable: boolean
  summary: string | null
  sources: FinalSource[]
  // Session-level notes from the rules layer (channels, global phantom).
  warnings: RuleWarning[]
}

export interface Adjustment {
  sourceId: string
  from: string
  to: string | null
  reason: 'unit_in_use'
}

export interface FinaliseArgs {
  request: NormalisedRequest
  rules: RulesOutput
  snapshot: LockerSnapshot
  aliases: AliasMap
  content: RecommendationContent
}

function toOption(option: RuleOption, snapshot: LockerSnapshot): FinalOption {
  const units = option.unitIds.map((unitId, index) => {
    const unit = snapshot.units.find((u) => u.unitId === unitId)
    const mic = unit ? snapshot.mics[unit.micSlug] : undefined
    return {
      unitId,
      micSlug: unit?.micSlug ?? '',
      name: mic ? micName(mic) : 'Unknown microphone',
      role: option.roles[index],
      patternSetting: option.patternSettings[index]
    }
  })
  return {
    optionId: option.id,
    units,
    matchedGroup: option.matchedGroup,
    warnings: option.warnings
  }
}

export function finalise(args: FinaliseArgs): {
  view: FinalView
  adjustments: Adjustment[]
} {
  const { rules, snapshot, aliases, content } = args

  if (!content.answerable) {
    return {
      view: {
        answerable: false,
        summary: null,
        sources: [],
        warnings: rules.warnings
      },
      adjustments: []
    }
  }

  const resolve = (alias: string, source: RuleSource): RuleOption | null => {
    const target = aliases.options[alias]
    if (!target || target.sourceId !== source.id) return null
    return source.candidates.find((c) => c.id === target.optionId) ?? null
  }

  const replies = new Map(content.sources.map((s) => [s.sourceId, s]))
  const used = new Map<string, string>() // unitId -> sourceId
  const free = (option: RuleOption) =>
    option.unitIds.every((id) => !used.has(id))

  // Stereo and tree sources claim their units first, then input order.
  const order = rules.sources
    .map((source, index) => ({ source, index }))
    .filter(({ source }) => !source.line)
    .sort((a, b) => b.source.micCount - a.source.micCount || a.index - b.index)

  const chosen = new Map<
    string,
    {
      option: RuleOption
      origin: PickOrigin
      reasoning: string
      placement: ReplyPlacement | null
    }
  >()
  const adjusted = new Map<
    string,
    { reason: 'unit_in_use'; originalOptionId: string }
  >()
  const adjustments: Adjustment[] = []

  for (const { source } of order) {
    const planOption =
      source.candidates.find((c) => c.id === source.planOptionId) ?? null
    const entry = replies.get(source.id)
    const primary = entry ? resolve(entry.primary.option, source) : null

    const tries: Array<{
      option: RuleOption
      origin: PickOrigin
      reasoning: string
      placement: ReplyPlacement | null
    }> = []
    if (entry && primary) {
      tries.push({
        option: primary,
        origin: 'ai',
        reasoning: entry.primary.reasoning,
        placement: entry.primary.placement
      })
    }
    for (const alt of entry?.alternatives ?? []) {
      const option = resolve(alt.option, source)
      if (option) {
        tries.push({
          option,
          origin: 'ai_alternative',
          reasoning: alt.reason,
          placement: null
        })
      }
    }
    if (planOption) {
      tries.push({
        option: planOption,
        origin: 'rules',
        reasoning:
          'Chosen by the rules from what is owned and free; the AI pick was not available.',
        placement: null
      })
    }

    const pick = tries.find((t) => free(t.option))
    if (pick) {
      chosen.set(source.id, pick)
      for (const id of pick.option.unitIds) used.set(id, source.id)
    }

    // A repair is when the model asked for something else and we gave it
    // something different (or nothing). A source it never mentioned is not one.
    if (primary && pick?.option.id !== primary.id) {
      adjusted.set(source.id, {
        reason: 'unit_in_use',
        originalOptionId: primary.id
      })
      adjustments.push({
        sourceId: source.id,
        from: primary.id,
        to: pick?.option.id ?? null,
        reason: 'unit_in_use'
      })
    }
  }

  const sources: FinalSource[] = rules.sources.map((source) => {
    const pick = chosen.get(source.id)
    const entry = replies.get(source.id)

    const alternatives: FinalAlternative[] = []
    if (entry) {
      const offered = [
        {
          alias: entry.primary.option,
          reason: entry.primary.reasoning.slice(0, 200)
        },
        ...entry.alternatives.map((a) => ({
          alias: a.option,
          reason: a.reason
        }))
      ]
      for (const { alias, reason } of offered) {
        const option = resolve(alias, source)
        if (!option || option.id === pick?.option.id) continue
        const holder = option.unitIds
          .map((id) => used.get(id))
          .find((owner) => owner !== undefined && owner !== source.id)
        alternatives.push({
          ...toOption(option, snapshot),
          reason,
          inUseBy: holder ?? null
        })
      }
    }

    return {
      sourceId: source.id,
      label: source.label,
      kind: source.kind,
      technique: source.technique,
      micCount: source.micCount,
      line: source.line,
      unfillable: source.unfillable,
      primary: pick
        ? {
            ...toOption(pick.option, snapshot),
            origin: pick.origin,
            reasoning: pick.reasoning,
            placement: pick.placement
          }
        : null,
      alternatives,
      rulesPickOptionId: source.planOptionId,
      adjusted: adjusted.get(source.id) ?? null
    }
  })

  return {
    view: {
      answerable: true,
      summary: content.summary,
      sources,
      warnings: rules.warnings
    },
    adjustments
  }
}
