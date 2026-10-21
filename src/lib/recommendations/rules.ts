import { phantomWarning } from '@/lib/mics/format'
import { MIC_TRANSDUCER_LABELS } from '@/lib/mics/types'
import type {
  MicCondition,
  MicPolarPattern,
  MicTransducerType
} from '@/lib/mics/types'

import { micName } from './names'
import { PROFILES_VERSION, SPL_THRESHOLD_DB, profileFor } from './profiles'
import { TECHNIQUE_RULES } from './techniques'

import type { SourceProfile } from './profiles'
import type { TechniqueRole, TechniqueRule } from './techniques'
import type {
  Exclusion,
  ExclusionReason,
  LockerSnapshot,
  MicRole,
  NormalisedRequest,
  RequestRoom,
  RequestSource,
  RuleMic,
  RuleOption,
  RuleReason,
  RuleSource,
  RuleWarning,
  RulesOutput,
  SnapshotUnit,
  UnfillableReason,
  WarningCode,
  WarningSeverity
} from './types'

// The deterministic half of the recommendation pipeline (PLAN §4.4 step 1 and
// 2, ADR 0015). A pure function: a normalised request and a snapshot of the
// studio's locker in, ranked candidates and a conflict-free plan out. No
// database, no clock, no model. The same input always gives the same output,
// whatever order the locker or catalogue arrives in.
//
// Unknown is not a pass: a missing spec never excludes a microphone and never
// counts as a good result; where it matters it becomes a warning.

export const RULES_VERSION = '1'

// Candidates shown (and sent to the model) per source. The plan's own pick is
// always included, so a contested source can show one more.
export const CANDIDATES_PER_SOURCE = 5

// Mid-side builds mids x sides; both are cut to the best few first.
const MS_PER_ROLE = 3

// Integer weights, tuned against the golden scenarios in eval/recommendations.
// Change them only with a RULES_VERSION bump.
export const WEIGHTS = {
  affinity: 10,
  patternFirst: 8,
  patternStep: 2,
  patternFallback: -6,
  application: 6,
  matchedPair: 8,
  conditionNew: 1,
  conditionFair: -4,
  conditionNeedsService: -30,
  splHeadroom: 3,
  splExtraHeadroom: 2,
  splPad: -3,
  splUnrecorded: -2,
  airBlastRibbon: -15
} as const

const CONDITION_RANK: Readonly<Record<string, number>> = {
  new: 3,
  good: 2,
  fair: 1,
  needs_service: 0
}
const conditionRank = (condition: MicCondition | string) =>
  CONDITION_RANK[condition] ?? CONDITION_RANK.good

const STATUS_EXCLUSION: Readonly<Record<string, ExclusionReason>> = {
  repair: 'status_repair',
  on_loan: 'status_on_loan',
  retired: 'status_retired'
}

export interface RulesOptions {
  // The request's room, used for the "different studio" note.
  room?: RequestRoom | null
  // Phase 5 fills this from session bookings. Until then nothing is booked.
  isBooked?: (unitId: string) => boolean
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const isCondenser = (mic: RuleMic) =>
  mic.transducerType === 'ldc' || mic.transducerType === 'sdc'

function warning(
  code: WarningCode,
  severity: WarningSeverity,
  text: string,
  unitIds?: string[]
): RuleWarning {
  return unitIds ? { code, severity, text, unitIds } : { code, severity, text }
}

// ---------------------------------------------------------------------------
// Unit eligibility (the same for every source)

interface Eligible {
  unit: SnapshotUnit
  mic: RuleMic
  // Notes that follow the unit into every option it appears in.
  warnings: RuleWarning[]
}

function screenUnits(
  snapshot: LockerSnapshot,
  options: RulesOptions
): { eligible: Eligible[]; excluded: Exclusion[] } {
  const eligible: Eligible[] = []
  const excluded: Exclusion[] = []
  const units = [...snapshot.units].sort((a, b) => cmp(a.unitId, b.unitId))

  for (const unit of units) {
    const mic = snapshot.mics[unit.micSlug]
    const statusReason =
      unit.equipmentStatus === 'in_service'
        ? null
        : (STATUS_EXCLUSION[unit.equipmentStatus] ?? 'status_retired')
    const reason: ExclusionReason | null =
      statusReason ??
      (options.isBooked?.(unit.unitId) ? 'booked' : null) ??
      (!mic || !unit.published ? 'catalogue_unpublished' : null)
    if (reason || !mic) {
      excluded.push({
        unitId: unit.unitId,
        reason: reason ?? 'catalogue_unpublished'
      })
      continue
    }

    const warnings: RuleWarning[] = []
    const name = micName(mic)
    if (unit.condition === 'needs_service') {
      warnings.push(
        warning(
          'needs_service',
          'warning',
          `${name} is marked as needing service. Check it before relying on it.`,
          [unit.unitId]
        )
      )
    }
    if (unit.quantity > 1) {
      warnings.push(
        warning(
          'quantity_ambiguous',
          'info',
          `The inventory row for ${name} holds ${unit.quantity}; it is treated as one microphone here.`,
          [unit.unitId]
        )
      )
    }
    const roomStudio = options.room?.studioId
    if (roomStudio && unit.studioId && unit.studioId !== roomStudio) {
      warnings.push(
        warning(
          'other_studio',
          'info',
          `${name} is kept in a different studio from this room.`,
          [unit.unitId]
        )
      )
    }
    eligible.push({ unit, mic, warnings })
  }
  return { eligible, excluded }
}

// ---------------------------------------------------------------------------
// Per-source suitability and scoring

interface Fit {
  ok: true
  pattern: MicPolarPattern | null
  score: number
  reasons: RuleReason[]
  warnings: RuleWarning[]
}
interface Misfit {
  ok: false
  reason: ExclusionReason
}

function choosePattern(
  mic: RuleMic,
  role: TechniqueRole,
  profile: SourceProfile
): { pattern: MicPolarPattern | null; score: number } | null {
  const has = (pattern: MicPolarPattern) => mic.polarPatterns.includes(pattern)

  if (role.patterns) {
    const order = [
      ...role.preferred,
      ...role.patterns.filter((p) => !role.preferred.includes(p))
    ]
    const pattern = order.find(has)
    if (!pattern) return null
    const rank = role.preferred.indexOf(pattern)
    return {
      pattern,
      score: rank >= 0 ? WEIGHTS.patternFirst - WEIGHTS.patternStep * rank : 0
    }
  }

  const pattern = profile.preferredPatterns.find(has)
  if (pattern) {
    const rank = profile.preferredPatterns.indexOf(pattern)
    return {
      pattern,
      score: WEIGHTS.patternFirst - WEIGHTS.patternStep * rank
    }
  }
  // None of the preferred patterns: use what the mic has, at a penalty.
  return {
    pattern: mic.polarPatterns[0] ?? null,
    score: WEIGHTS.patternFallback
  }
}

function assess(
  entry: Eligible,
  profile: SourceProfile,
  role: TechniqueRole
): Fit | Misfit {
  const { unit, mic } = entry
  const name = micName(mic)
  const reasons: RuleReason[] = []
  const warnings: RuleWarning[] = []
  let score = 0

  if (profile.excludeTransducers.includes(mic.transducerType)) {
    return { ok: false, reason: 'transducer_unsuitable' }
  }

  const chosen = choosePattern(mic, role, profile)
  if (!chosen) return { ok: false, reason: 'pattern_unavailable' }
  score += chosen.score
  if (chosen.pattern && chosen.score === WEIGHTS.patternFirst) {
    reasons.push({
      code: 'pattern_fit',
      text: `Its ${chosen.pattern} setting suits this source.`
    })
  }

  // SPL: a stated figure below the band is a hard no (unless a pad covers the
  // gap); an unstated one is a warning for condensers on loud sources only.
  const threshold = SPL_THRESHOLD_DB[profile.splBand]
  if (threshold !== null) {
    if (mic.maxSplDb !== null) {
      if (mic.maxSplDb >= threshold) {
        score += WEIGHTS.splHeadroom
        if (mic.maxSplDb >= threshold + 10) score += WEIGHTS.splExtraHeadroom
        reasons.push({
          code: 'spl_headroom',
          text: 'Its stated maximum SPL covers this source.'
        })
      } else {
        const largestPad = Math.max(0, ...mic.pads)
        if (largestPad > 0 && mic.maxSplDb + largestPad >= threshold) {
          score += WEIGHTS.splPad
          warnings.push(
            warning(
              'use_pad',
              'info',
              `${name} needs its pad switched in for a source this loud.`,
              [unit.unitId]
            )
          )
        } else {
          return { ok: false, reason: 'spl_below' }
        }
      }
    } else if (
      isCondenser(mic) &&
      (profile.splBand === 'loud' || profile.splBand === 'very_loud')
    ) {
      score += WEIGHTS.splUnrecorded
      warnings.push(
        warning(
          'spl_not_recorded',
          'warning',
          `The maximum SPL for ${name} is not recorded, and this source is loud. Check the spec sheet before using it close up.`,
          [unit.unitId]
        )
      )
    }
  }

  const affinity = profile.transducerAffinity[mic.transducerType] ?? 0
  score += affinity * WEIGHTS.affinity
  if (affinity >= 2) {
    reasons.push({
      code: 'transducer_fit',
      text: `${MIC_TRANSDUCER_LABELS[mic.transducerType as MicTransducerType]} microphones suit ${profile.label.toLowerCase()}.`
    })
  }

  const applications = mic.statedApplications.map((a) => a.toLowerCase())
  if (
    profile.applicationTags.some((tag) =>
      applications.some((application) => application.includes(tag))
    )
  ) {
    score += WEIGHTS.application
    reasons.push({
      code: 'application_match',
      text: 'Its stated applications include this source.'
    })
  }

  if (unit.condition === 'new') score += WEIGHTS.conditionNew
  else if (unit.condition === 'fair') score += WEIGHTS.conditionFair
  else if (unit.condition === 'needs_service') {
    score += WEIGHTS.conditionNeedsService
  }

  if (mic.powering === 'phantom') {
    warnings.push(
      warning('phantom_required', 'info', `${name} needs phantom power.`, [
        unit.unitId
      ])
    )
  } else if (mic.powering === 'psu') {
    warnings.push(
      warning(
        'psu_required',
        'info',
        `${name} needs its external power supply.`,
        [unit.unitId]
      )
    )
  } else if (mic.powering === 'battery') {
    warnings.push(
      warning('battery', 'info', `${name} runs on a battery. Check it.`, [
        unit.unitId
      ])
    )
  }

  const phantomOff = phantomWarning(mic)
  if (phantomOff) {
    warnings.push(warning('phantom_off', 'warning', phantomOff, [unit.unitId]))
  }

  if (profile.airBlast && mic.transducerType === 'ribbon') {
    score += WEIGHTS.airBlastRibbon
    warnings.push(
      warning(
        'ribbon_air_blast',
        'warning',
        `${name} is a ribbon. Close to a speaker or drum port, air movement can damage the ribbon; keep it back and off-axis.`,
        [unit.unitId]
      )
    )
  }

  return { ok: true, pattern: chosen.pattern, score, reasons, warnings }
}

// ---------------------------------------------------------------------------
// Options

interface Member {
  entry: Eligible
  role: MicRole
  fit: Fit
}

interface OptionDraft {
  members: Member[]
  matchedGroup: string | null
  sortKey: string
  score: number
  option: Omit<RuleOption, 'id'>
}

function mergeWarnings(warnings: RuleWarning[]): RuleWarning[] {
  const merged = new Map<string, RuleWarning>()
  for (const w of warnings) {
    const key = `${w.code}|${w.text}`
    const existing = merged.get(key)
    if (!existing) merged.set(key, { ...w, unitIds: [...(w.unitIds ?? [])] })
    else {
      for (const id of w.unitIds ?? []) {
        if (!existing.unitIds!.includes(id)) existing.unitIds!.push(id)
      }
    }
  }
  return [...merged.values()]
}

function draftOption(
  members: Member[],
  matchedGroup: string | null,
  rule: TechniqueRule
): OptionDraft {
  const mean = members.reduce((sum, m) => sum + m.fit.score, 0) / members.length
  const score = Math.round(mean) + (matchedGroup ? WEIGHTS.matchedPair : 0)

  const reasons = new Map<string, RuleReason>()
  for (const m of members) {
    for (const reason of m.fit.reasons) reasons.set(reason.code, reason)
  }
  if (matchedGroup) {
    reasons.set('matched_pair', {
      code: 'matched_pair',
      text: `These are a matched group (${matchedGroup}), so they will behave alike.`
    })
  }

  const warnings = members.flatMap((m) => [
    ...m.entry.warnings,
    ...m.fit.warnings
  ])
  const unitIds = members.map((m) => m.entry.unit.unitId)
  if (rule.micCount > 1 && rule.sameModel && !matchedGroup) {
    const name = micName(members[0].entry.mic)
    warnings.push(
      warning(
        'not_matched',
        'info',
        `These ${name} units are not recorded as a matched pair. Check that they sound alike before relying on a stereo image.`,
        unitIds
      )
    )
  }

  return {
    members,
    matchedGroup,
    sortKey: `${members.map((m) => m.entry.mic.slug).join(',')}|${unitIds.join(',')}`,
    score,
    option: {
      unitIds,
      roles: members.map((m) => m.role),
      patternSettings: members.map((m) => m.fit.pattern),
      score,
      matchedGroup,
      reasons: [...reasons.values()],
      warnings: mergeWarnings(warnings)
    }
  }
}

// Best condition first, then unit id, so the choice never depends on input
// order.
const byCondition = (a: Member, b: Member) =>
  conditionRank(b.entry.unit.condition) -
    conditionRank(a.entry.unit.condition) ||
  cmp(a.entry.unit.unitId, b.entry.unit.unitId)

interface SourceWork {
  source: RequestSource
  profile: SourceProfile
  rule: TechniqueRule
  line: boolean
  options: OptionDraft[]
}

function buildOptions(
  source: RequestSource,
  eligible: Eligible[],
  exclusions: Exclusion[]
): OptionDraft[] {
  const profile = profileFor(source.kind)
  const rule = TECHNIQUE_RULES[source.technique]
  const drafts: OptionDraft[] = []

  // Assess each unit for the roles this technique needs.
  const fits = new Map<string, Map<MicRole, Fit>>()
  for (const entry of eligible) {
    const byRole = new Map<MicRole, Fit>()
    const failures: ExclusionReason[] = []
    for (const role of rule.roles) {
      if (byRole.has(role.role)) continue
      const result = assess(entry, profile, role)
      if (result.ok) byRole.set(role.role, result)
      else failures.push(result.reason)
    }
    if (byRole.size === 0) {
      const reason =
        failures.find((r) => r !== 'pattern_unavailable') ?? failures[0]
      exclusions.push({
        unitId: entry.unit.unitId,
        reason,
        sourceId: source.id
      })
      continue
    }
    fits.set(entry.unit.unitId, byRole)
  }

  const usable = eligible.filter((e) => fits.has(e.unit.unitId))
  const member = (entry: Eligible, role: MicRole): Member => ({
    entry,
    role,
    fit: fits.get(entry.unit.unitId)!.get(role)!
  })

  if (rule.micCount === 1) {
    for (const entry of usable) {
      drafts.push(draftOption([member(entry, 'single')], null, rule))
    }
    return drafts
  }

  if (!rule.sameModel) {
    // Mid-side: a mid and a side, which may be different models.
    const best = (role: MicRole) =>
      usable
        .filter((e) => fits.get(e.unit.unitId)!.has(role))
        .map((e) => member(e, role))
        .sort((a, b) => b.fit.score - a.fit.score || byCondition(a, b))
        .slice(0, MS_PER_ROLE)
    const sides = best('side')
    for (const mid of best('mid')) {
      for (const side of sides) {
        if (mid.entry.unit.unitId === side.entry.unit.unitId) continue
        const group = mid.entry.unit.matchedPairGroup
        const matched =
          group &&
          group === side.entry.unit.matchedPairGroup &&
          mid.entry.mic.slug === side.entry.mic.slug
            ? group
            : null
        drafts.push(draftOption([mid, side], matched, rule))
      }
    }
    return drafts
  }

  // Same-model pairs and trees. Roles share one rule set, so any unit that
  // fits the first role fits them all.
  const firstRole = rule.roles[0].role
  const consumed = new Set<string>()
  const groups = new Map<string, Member[]>()
  for (const entry of usable) {
    const group = entry.unit.matchedPairGroup
    if (!group) continue
    const key = `${group}\u0000${entry.mic.slug}`
    groups.set(key, [...(groups.get(key) ?? []), member(entry, firstRole)])
  }
  const assign = (picked: Member[]): Member[] =>
    picked.map((m, index) => member(m.entry, rule.roles[index].role))

  for (const [key, members] of [...groups.entries()].sort(([a], [b]) =>
    cmp(a, b)
  )) {
    if (members.length < rule.micCount) continue
    const picked = [...members].sort(byCondition).slice(0, rule.micCount)
    drafts.push(draftOption(assign(picked), key.split('\u0000')[0], rule))
    for (const m of members) consumed.add(m.entry.unit.unitId)
  }

  const pools = new Map<string, Member[]>()
  for (const entry of usable) {
    if (consumed.has(entry.unit.unitId)) continue
    pools.set(entry.mic.slug, [
      ...(pools.get(entry.mic.slug) ?? []),
      member(entry, firstRole)
    ])
  }
  for (const [, members] of [...pools.entries()].sort(([a], [b]) =>
    cmp(a, b)
  )) {
    if (members.length < rule.micCount) continue
    const picked = [...members].sort(byCondition).slice(0, rule.micCount)
    drafts.push(draftOption(assign(picked), null, rule))
  }
  return drafts
}

// ---------------------------------------------------------------------------
// Entry point

export function runRules(
  request: NormalisedRequest,
  snapshot: LockerSnapshot,
  options: RulesOptions = {}
): RulesOutput {
  const { eligible, excluded } = screenUnits(snapshot, options)
  const sourceExclusions: Exclusion[] = []

  const work: SourceWork[] = request.sources.map((source) => {
    const profile = profileFor(source.kind)
    const rule = TECHNIQUE_RULES[source.technique]
    const line = profile.line
    const drafts = line ? [] : buildOptions(source, eligible, sourceExclusions)
    drafts.sort((a, b) => b.score - a.score || cmp(a.sortKey, b.sortKey))
    return { source, profile, rule, line, options: drafts }
  })

  // Plan: stereo and tree sources first, then the source with fewest options,
  // then input order. Each takes its best option whose units are all free.
  const order = work
    .map((w, index) => ({ w, index }))
    .filter(({ w }) => !w.line)
    .sort(
      (a, b) =>
        b.w.rule.micCount - a.w.rule.micCount ||
        a.w.options.length - b.w.options.length ||
        a.index - b.index
    )
  const used = new Set<string>()
  const planned = new Map<number, number>() // work index -> option rank (0-based)
  for (const { w, index } of order) {
    const rank = w.options.findIndex((o) =>
      o.members.every((m) => !used.has(m.entry.unit.unitId))
    )
    if (rank < 0) continue
    planned.set(index, rank)
    for (const m of w.options[rank].members) used.add(m.entry.unit.unitId)
  }

  const sources: RuleSource[] = work.map((w, index) => {
    const rank = planned.get(index)
    const top = w.options.slice(0, CANDIDATES_PER_SOURCE)
    const chosen = rank === undefined ? null : w.options[rank]
    const shown =
      rank !== undefined && rank >= CANDIDATES_PER_SOURCE
        ? [...top, w.options[rank]]
        : top
    const candidates: RuleOption[] = shown.map((draft) => ({
      id: `${w.source.id}-${w.options.indexOf(draft) + 1}`,
      ...draft.option
    }))
    let unfillable: UnfillableReason | null = null
    if (!w.line && !chosen) {
      unfillable = w.options.length === 0 ? 'no_suitable_mic' : 'all_in_use'
    }
    return {
      id: w.source.id,
      label: w.source.label,
      kind: w.source.kind,
      technique: w.source.technique,
      micCount: w.line ? 0 : w.rule.micCount,
      line: w.line,
      candidates,
      planOptionId: chosen ? `${w.source.id}-${(rank ?? 0) + 1}` : null,
      unfillable
    }
  })

  const warnings: RuleWarning[] = []

  const required = work.reduce(
    (sum, w) => sum + (w.line ? 1 : w.rule.micCount),
    0
  )
  const available = request.channels
  const overflow = available === null ? 0 : Math.max(0, required - available)
  if (overflow > 0) {
    warnings.push(
      warning(
        'channel_overflow',
        'warning',
        `This needs ${required} inputs but only ${available} are available.`
      )
    )
  }

  if (request.phantomMode === 'global') {
    const plannedWarnings = sources.flatMap((s) => {
      const option = s.candidates.find((c) => c.id === s.planOptionId)
      return option ? option.warnings : []
    })
    const needsPhantom = plannedWarnings.filter(
      (w) => w.code === 'phantom_required'
    )
    const mustBeOff = plannedWarnings.filter((w) => w.code === 'phantom_off')
    if (needsPhantom.length > 0 && mustBeOff.length > 0) {
      const unitIds = [
        ...new Set(
          [...needsPhantom, ...mustBeOff].flatMap((w) => w.unitIds ?? [])
        )
      ].sort(cmp)
      warnings.push(
        warning(
          'global_phantom_conflict',
          'blocking',
          'Phantom power is switched globally here, but this plan has both microphones that need it and a ribbon that must not have it. Use per-channel phantom, or change the plan.',
          unitIds
        )
      )
    }
  }

  const allExclusions = [...excluded, ...sourceExclusions].sort(
    (a, b) => cmp(a.unitId, b.unitId) || cmp(a.sourceId ?? '', b.sourceId ?? '')
  )

  return {
    rulesVersion: RULES_VERSION,
    profilesVersion: PROFILES_VERSION,
    sources,
    excluded: allExclusions,
    warnings,
    channels: { required, available, overflow }
  }
}
