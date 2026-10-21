import { z } from 'zod'

import { micSlug } from '@/lib/mics/schemas'
import {
  MIC_CONDITIONS,
  MIC_POLAR_PATTERNS,
  MIC_POWERING,
  MIC_TRANSDUCER_TYPES
} from '@/lib/mics/types'

import { finalise } from './finalise'
import { buildRecommendationInput, namesForMic } from './llm-input'
import { recommendationSchema } from './reply'
import { runRules } from './rules'
import { normaliseRequest, recommendationRequestSchema } from './schemas'
import { SOURCE_KINDS } from './types'
import { validateRecommendation } from './validate'

import type { AliasMap, RecommendationInput } from './llm-input'
import type { RecommendationContent } from './reply'
import type {
  LockerSnapshot,
  NormalisedRequest,
  RequestRoom,
  RuleMic,
  RuleOption,
  RulesOutput,
  SnapshotUnit
} from './types'

// The evaluation harness (PLAN §4.4: "versioned golden scenarios, run in CI
// against the rules layer and manually against the LLM layer when prompts
// change"). Pure: nothing here reads files or calls a model. CI loads the
// scenarios through eval/recommendations/load.ts; the manual run
// (npm run recs:eval) adds a real provider on top.
//
// Rules for scenario data:
//  - Real models appear only with the structural facts actually seeded in
//    data/mics (type, patterns, powering). Anything that depends on a number
//    (max SPL, pads, stated applications) uses a clearly fictional fixture mic,
//    so no invented spec is ever attached to a real product.
//  - An expectation records intent ("a ribbon never goes on a kick"), not just
//    whatever the code printed.

// ---------------------------------------------------------------------------
// Catalogue

const optionalNumber = z.number().nullable().optional()

export const fixtureMicSchema = z.object({
  slug: z.string().min(1),
  manufacturer: z.string().min(1),
  model: z.string().min(1),
  transducerType: z.enum(MIC_TRANSDUCER_TYPES),
  polarPatterns: z.array(z.enum(MIC_POLAR_PATTERNS)).min(1),
  powering: z.enum(MIC_POWERING),
  phantomSafe: z.boolean().nullable().optional(),
  maxSplDb: optionalNumber,
  pads: z.array(z.number()).optional(),
  statedApplications: z.array(z.string()).optional()
})
export type FixtureMic = z.infer<typeof fixtureMicSchema>

// A seed entry carries more than the rules use; only the structural facts count.
export const seedMicSchema = z.looseObject({
  manufacturer: z.string(),
  model: z.string(),
  transducerType: z.enum(MIC_TRANSDUCER_TYPES),
  polarPatterns: z.array(z.enum(MIC_POLAR_PATTERNS)),
  powering: z.enum(MIC_POWERING),
  phantomSafe: z.boolean().nullable().optional(),
  maxSplDb: optionalNumber,
  pads: z.array(z.number()).optional(),
  statedApplications: z.array(z.string()).optional()
})

function toRuleMic(
  slug: string,
  source: Omit<z.infer<typeof fixtureMicSchema>, 'slug'>
): RuleMic {
  return {
    slug,
    manufacturer: source.manufacturer,
    model: source.model,
    transducerType: source.transducerType,
    polarPatterns: source.polarPatterns,
    powering: source.powering,
    phantomSafe: source.phantomSafe ?? null,
    discontinued: false,
    freqRangeMinHz: null,
    freqRangeMaxHz: null,
    sensitivityMvPa: null,
    selfNoiseDbA: null,
    maxSplDb: source.maxSplDb ?? null,
    impedanceOhm: null,
    pads: source.pads ?? [],
    filters: [],
    weightG: null,
    dimensions: null,
    connector: null,
    statedApplications: source.statedApplications ?? [],
    specConditions: {}
  }
}

// Keys are 'seed:<slug>' and 'fixture:<slug>'.
export type EvalCatalogue = Map<string, RuleMic>

export function buildCatalogue(
  seedEntries: unknown[],
  fixtures: unknown[]
): EvalCatalogue {
  const catalogue: EvalCatalogue = new Map()
  for (const raw of seedEntries) {
    const entry = seedMicSchema.parse(raw)
    const slug = micSlug(entry.manufacturer, entry.model)
    catalogue.set(`seed:${slug}`, toRuleMic(slug, entry))
  }
  for (const raw of fixtures) {
    const fixture = fixtureMicSchema.parse(raw)
    catalogue.set(`fixture:${fixture.slug}`, toRuleMic(fixture.slug, fixture))
  }
  return catalogue
}

// ---------------------------------------------------------------------------
// Scenarios

const unitIds = z.array(z.string().min(1))
const bySource = <T extends z.ZodType>(value: T) => z.record(z.string(), value)

export const scenarioSchema = z.object({
  id: z.string().regex(/^\d{3}-[a-z0-9-]+$/),
  title: z.string().min(1),
  tags: z.array(z.string()).default([]),
  locker: z.array(
    z.object({
      unit: z.string().min(1),
      mic: z.string().regex(/^(seed|fixture):[a-z0-9-]+$/),
      status: z.string().optional(),
      condition: z.enum(MIC_CONDITIONS).optional(),
      group: z.string().optional(),
      quantity: z.number().int().positive().optional(),
      studio: z.string().optional(),
      unpublished: z.boolean().optional()
    })
  ),
  request: recommendationRequestSchema,
  // Optional room for studio checks; its studio is 'st1'.
  room: z.boolean().optional(),
  booked: z.array(z.string()).optional(),
  expect: z.object({
    rules: z.object({
      kinds: bySource(z.enum(SOURCE_KINDS)).optional(),
      // Exact plan: source -> unit ids in order, or null for "no plan".
      plan: bySource(unitIds.nullable()).optional(),
      // The plan must be one of these.
      planOneOf: bySource(z.array(unitIds)).optional(),
      unfillable: bySource(
        z.enum(['no_suitable_mic', 'all_in_use'])
      ).optional(),
      // First unit of each candidate, in rank order (a prefix is enough).
      candidateOrder: bySource(unitIds).optional(),
      candidatesInclude: bySource(unitIds).optional(),
      candidatesExclude: bySource(unitIds).optional(),
      excluded: z
        .array(
          z.object({
            unit: z.string(),
            reason: z.string(),
            source: z.string().optional()
          })
        )
        .optional(),
      planWarnings: bySource(z.array(z.string())).optional(),
      planNoWarnings: bySource(z.array(z.string())).optional(),
      // source -> candidate's first unit -> warning codes that must be present.
      candidateWarnings: bySource(bySource(z.array(z.string()))).optional(),
      patternSettings: bySource(z.array(z.string().nullable())).optional(),
      roles: bySource(z.array(z.string())).optional(),
      sessionWarnings: z.array(z.string()).optional(),
      noSessionWarnings: z.array(z.string()).optional(),
      channels: z
        .object({
          required: z.number(),
          available: z.number().nullable().optional(),
          overflow: z.number()
        })
        .optional(),
      // Sources that would be sent to the model, in order.
      modelSources: z.array(z.string()).optional()
    }),
    // Judged only on a live model run (npm run recs:eval).
    ai: z
      .object({
        primaryOneOf: bySource(z.array(unitIds)).optional(),
        mustNotPick: bySource(unitIds).optional(),
        maxAdjustments: z.number().int().min(0).optional()
      })
      .optional()
  })
})
export type Scenario = z.infer<typeof scenarioSchema>

export interface BuiltScenario {
  request: NormalisedRequest
  snapshot: LockerSnapshot
  room: RequestRoom | null
  isBooked: (unitId: string) => boolean
  // Models in the catalogue that this scenario's studio does not own.
  unownedNames: string[]
}

const ROOM: RequestRoom = {
  id: 'room',
  studioId: 'st1',
  name: 'Live room',
  widthMm: 6000,
  lengthMm: 8000,
  heightMm: 3200
}

export function buildScenario(
  scenario: Scenario,
  catalogue: EvalCatalogue
): BuiltScenario {
  const mics: Record<string, RuleMic> = {}
  const units: SnapshotUnit[] = scenario.locker.map((entry) => {
    const mic = catalogue.get(entry.mic)
    if (!mic) throw new Error(`${scenario.id}: unknown mic ${entry.mic}`)
    const published = !entry.unpublished
    if (published) mics[mic.slug] = mic
    return {
      unitId: entry.unit,
      micSlug: mic.slug,
      equipmentStatus: entry.status ?? 'in_service',
      condition: entry.condition ?? 'good',
      matchedPairGroup: entry.group ?? null,
      quantity: entry.quantity ?? 1,
      roomId: null,
      studioId: entry.studio ?? null,
      published
    }
  })

  const request = normaliseRequest(scenario.request)
  const room = scenario.room ? ROOM : null
  if (room) request.roomId = room.id

  const ownedSlugs = new Set(units.map((u) => u.micSlug))
  const unownedNames = [
    ...new Set(
      [...catalogue.values()]
        .filter((mic) => !ownedSlugs.has(mic.slug))
        .flatMap(namesForMic)
        .concat(namesForMic({ manufacturer: 'Neumann', model: 'U 47' }))
    )
  ]
  const booked = new Set(scenario.booked ?? [])
  return {
    request,
    snapshot: { units, mics },
    room,
    isBooked: (id) => booked.has(id),
    unownedNames
  }
}

export function runScenarioRules(built: BuiltScenario): RulesOutput {
  return runRules(built.request, built.snapshot, {
    room: built.room,
    isBooked: built.isBooked
  })
}

// ---------------------------------------------------------------------------
// Checking rules output

const planOption = (
  out: RulesOutput,
  sourceId: string
): RuleOption | undefined => {
  const source = out.sources.find((s) => s.id === sourceId)
  return source?.candidates.find((c) => c.id === source.planOptionId)
}

const same = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i])

// Returns human-readable failures; none means the scenario's rules
// expectations hold.
export function checkRulesExpectations(
  scenario: Scenario,
  built: BuiltScenario,
  out: RulesOutput
): string[] {
  const want = scenario.expect.rules
  const failures: string[] = []
  const source = (id: string) => out.sources.find((s) => s.id === id)
  const fail = (message: string) => failures.push(message)

  for (const [id, kind] of Object.entries(want.kinds ?? {})) {
    if (source(id)?.kind !== kind) {
      fail(`${id}: expected kind ${kind}, got ${source(id)?.kind}`)
    }
  }
  for (const [id, expected] of Object.entries(want.plan ?? {})) {
    const actual = planOption(out, id)?.unitIds ?? null
    if (
      expected === null ? actual !== null : !actual || !same(actual, expected)
    ) {
      fail(
        `${id}: expected plan ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
      )
    }
  }
  for (const [id, options] of Object.entries(want.planOneOf ?? {})) {
    const actual = planOption(out, id)?.unitIds
    if (!actual || !options.some((o) => same(o, actual))) {
      fail(
        `${id}: plan ${JSON.stringify(actual)} is not one of ${JSON.stringify(options)}`
      )
    }
  }
  for (const [id, reason] of Object.entries(want.unfillable ?? {})) {
    if (source(id)?.unfillable !== reason) {
      fail(
        `${id}: expected unfillable ${reason}, got ${source(id)?.unfillable}`
      )
    }
  }
  for (const [id, order] of Object.entries(want.candidateOrder ?? {})) {
    const actual = (source(id)?.candidates ?? [])
      .slice(0, order.length)
      .map((c) => c.unitIds[0])
    if (!same(actual, order)) {
      fail(
        `${id}: expected candidate order ${JSON.stringify(order)}, got ${JSON.stringify(actual)}`
      )
    }
  }
  const allUnits = (id: string) =>
    new Set((source(id)?.candidates ?? []).flatMap((c) => c.unitIds))
  for (const [id, expected] of Object.entries(want.candidatesInclude ?? {})) {
    for (const unit of expected) {
      if (!allUnits(id).has(unit))
        fail(`${id}: candidates should include ${unit}`)
    }
  }
  for (const [id, expected] of Object.entries(want.candidatesExclude ?? {})) {
    for (const unit of expected) {
      if (allUnits(id).has(unit))
        fail(`${id}: candidates should not include ${unit}`)
    }
  }
  for (const e of want.excluded ?? []) {
    const found = out.excluded.some(
      (x) =>
        x.unitId === e.unit &&
        x.reason === e.reason &&
        (e.source === undefined || x.sourceId === e.source)
    )
    if (!found)
      fail(
        `expected ${e.unit} to be excluded (${e.reason}${e.source ? ` for ${e.source}` : ''})`
      )
  }
  for (const [id, codes] of Object.entries(want.planWarnings ?? {})) {
    const have = planOption(out, id)?.warnings.map((w) => w.code) ?? []
    for (const code of codes) {
      if (!have.includes(code as never))
        fail(`${id}: plan should warn ${code}, has [${have}]`)
    }
  }
  for (const [id, codes] of Object.entries(want.planNoWarnings ?? {})) {
    const have = planOption(out, id)?.warnings.map((w) => w.code) ?? []
    for (const code of codes) {
      if (have.includes(code as never))
        fail(`${id}: plan should not warn ${code}`)
    }
  }
  for (const [id, byUnit] of Object.entries(want.candidateWarnings ?? {})) {
    for (const [unit, codes] of Object.entries(byUnit)) {
      const candidate = source(id)?.candidates.find(
        (c) => c.unitIds[0] === unit
      )
      if (!candidate) {
        fail(`${id}: no candidate starting with ${unit}`)
        continue
      }
      const have = candidate.warnings.map((w) => w.code)
      for (const code of codes) {
        if (!have.includes(code as never))
          fail(`${id}/${unit}: should warn ${code}, has [${have}]`)
      }
    }
  }
  for (const [id, expected] of Object.entries(want.patternSettings ?? {})) {
    const actual = planOption(out, id)?.patternSettings
    if (!actual || !same(actual.map(String), expected.map(String))) {
      fail(
        `${id}: expected patterns ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
      )
    }
  }
  for (const [id, expected] of Object.entries(want.roles ?? {})) {
    const actual = planOption(out, id)?.roles
    if (!actual || !same(actual, expected)) {
      fail(
        `${id}: expected roles ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
      )
    }
  }
  const sessionCodes = out.warnings.map((w) => w.code)
  for (const code of want.sessionWarnings ?? []) {
    if (!sessionCodes.includes(code as never))
      fail(`session should warn ${code}, has [${sessionCodes}]`)
  }
  for (const code of want.noSessionWarnings ?? []) {
    if (sessionCodes.includes(code as never))
      fail(`session should not warn ${code}`)
  }
  if (want.channels) {
    const { required, overflow, available } = want.channels
    if (
      out.channels.required !== required ||
      out.channels.overflow !== overflow ||
      (available !== undefined && out.channels.available !== available)
    ) {
      fail(
        `expected channels ${JSON.stringify(want.channels)}, got ${JSON.stringify(out.channels)}`
      )
    }
  }
  if (want.modelSources) {
    const { input } = buildRecommendationInput({
      request: built.request,
      rules: out,
      snapshot: built.snapshot,
      room: built.room,
      unownedNames: built.unownedNames
    })
    const sent = input.data.sources.map((s) => s.id)
    if (!same(sent, want.modelSources)) {
      fail(
        `expected model sources ${JSON.stringify(want.modelSources)}, got ${JSON.stringify(sent)}`
      )
    }
  }
  return failures
}

// Properties that must hold for every scenario, whatever it expects.
export function checkInvariants(
  built: BuiltScenario,
  out: RulesOutput
): string[] {
  const failures: string[] = []
  const used = new Map<string, string>()
  for (const source of out.sources) {
    if (source.line) {
      if (source.candidates.length > 0 || source.planOptionId) {
        failures.push(`${source.id}: a line source has no microphone`)
      }
      continue
    }
    if (source.planOptionId) {
      const option = source.candidates.find((c) => c.id === source.planOptionId)
      if (!option) {
        failures.push(`${source.id}: plan pick is not among the candidates`)
        continue
      }
      if (source.unfillable)
        failures.push(`${source.id}: planned yet unfillable`)
      for (const unit of option.unitIds) {
        if (used.has(unit)) {
          failures.push(`${unit} is used by ${used.get(unit)} and ${source.id}`)
        }
        used.set(unit, source.id)
      }
    } else if (!source.unfillable) {
      failures.push(`${source.id}: no plan and no reason`)
    }
    for (const option of source.candidates) {
      if (option.unitIds.length !== source.micCount) {
        failures.push(`${source.id}/${option.id}: wrong number of units`)
      }
      for (const unit of option.unitIds) {
        const row = built.snapshot.units.find((u) => u.unitId === unit)
        if (!row) failures.push(`${option.id}: ${unit} is not in the locker`)
        else if (row.equipmentStatus !== 'in_service' || !row.published) {
          failures.push(`${option.id}: offers unavailable unit ${unit}`)
        }
        if (built.isBooked(unit))
          failures.push(`${option.id}: offers booked unit ${unit}`)
      }
    }
  }
  return failures
}

// ---------------------------------------------------------------------------
// Replays: recorded or hand-written model replies, checked without a model.

export const replaySchema = z.object({
  description: z.string().min(1),
  // Same shape as the model's reply, except that options may be written as the
  // rules layer's ids ('s1-2'); the harness turns them into aliases.
  reply: z.unknown(),
  expect: z.union([
    z.object({
      valid: z.literal(true),
      finalise: z
        .object({
          primary: bySource(unitIds).optional(),
          adjusted: z.array(z.string()).optional(),
          origin: bySource(z.string()).optional()
        })
        .optional()
    }),
    // Substrings that must each appear in some problem.
    z.object({ problems: z.array(z.string()).min(1) })
  ])
})
export type Replay = z.infer<typeof replaySchema>

export function translateReply(reply: unknown, aliases: AliasMap): unknown {
  const byRuleId = new Map(
    Object.entries(aliases.options).map(([alias, v]) => [v.optionId, alias])
  )
  const swap = (id: unknown) =>
    typeof id === 'string' ? (byRuleId.get(id) ?? id) : id
  const content = structuredClone(reply) as {
    sources?: Array<{
      primary?: { option?: unknown }
      alternatives?: Array<{ option?: unknown }>
    }>
  }
  for (const entry of content.sources ?? []) {
    if (entry.primary) entry.primary.option = swap(entry.primary.option)
    for (const alt of entry.alternatives ?? []) alt.option = swap(alt.option)
  }
  return content
}

export function checkReplay(
  replay: Replay,
  built: BuiltScenario,
  rules: RulesOutput
): string[] {
  const { input, aliases } = buildRecommendationInput({
    request: built.request,
    rules,
    snapshot: built.snapshot,
    room: built.room,
    unownedNames: built.unownedNames
  })
  const parsed = recommendationSchema.safeParse(
    translateReply(replay.reply, aliases)
  )
  const expected = replay.expect
  const problems: string[] = parsed.success
    ? validateRecommendation(parsed.data, input)
    : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)

  if ('problems' in expected) {
    const failures: string[] = []
    if (problems.length === 0)
      failures.push('expected the reply to be rejected')
    for (const needle of expected.problems) {
      if (!problems.some((p) => p.includes(needle))) {
        failures.push(
          `expected a problem containing "${needle}"; got ${JSON.stringify(problems)}`
        )
      }
    }
    return failures
  }

  if (problems.length > 0 || !parsed.success) {
    return [`expected the reply to be valid; got ${JSON.stringify(problems)}`]
  }
  const failures: string[] = []
  const wantFinal = expected.finalise
  if (wantFinal) {
    const { view, adjustments } = finalise({
      request: built.request,
      rules,
      snapshot: built.snapshot,
      aliases,
      content: parsed.data as RecommendationContent
    })
    for (const [id, units] of Object.entries(wantFinal.primary ?? {})) {
      const actual = view.sources
        .find((s) => s.sourceId === id)
        ?.primary?.units.map((u) => u.unitId)
      if (!actual || !same(actual, units)) {
        failures.push(
          `${id}: expected final pick ${JSON.stringify(units)}, got ${JSON.stringify(actual)}`
        )
      }
    }
    for (const [id, origin] of Object.entries(wantFinal.origin ?? {})) {
      const actual = view.sources.find((s) => s.sourceId === id)?.primary
        ?.origin
      if (actual !== origin)
        failures.push(`${id}: expected origin ${origin}, got ${actual}`)
    }
    if (wantFinal.adjusted) {
      const actual = adjustments.map((a) => a.sourceId)
      if (!same(actual, wantFinal.adjusted)) {
        failures.push(
          `expected adjustments for ${JSON.stringify(wantFinal.adjusted)}, got ${JSON.stringify(actual)}`
        )
      }
    }
  }
  return failures
}

// ---------------------------------------------------------------------------
// Live-model expectations (manual run only)

export function checkAiExpectations(
  scenario: Scenario,
  view: ReturnType<typeof finalise>['view'],
  adjustments: ReturnType<typeof finalise>['adjustments']
): string[] {
  const want = scenario.expect.ai
  if (!want) return []
  const failures: string[] = []
  const pick = (id: string) =>
    view.sources
      .find((s) => s.sourceId === id)
      ?.primary?.units.map((u) => u.unitId)
  for (const [id, options] of Object.entries(want.primaryOneOf ?? {})) {
    const actual = pick(id)
    if (!actual || !options.some((o) => same(o, actual))) {
      failures.push(
        `${id}: pick ${JSON.stringify(actual)} is not one of ${JSON.stringify(options)}`
      )
    }
  }
  for (const [id, units] of Object.entries(want.mustNotPick ?? {})) {
    const actual = pick(id) ?? []
    for (const unit of units) {
      if (actual.includes(unit)) failures.push(`${id}: must not pick ${unit}`)
    }
  }
  if (
    want.maxAdjustments !== undefined &&
    adjustments.length > want.maxAdjustments
  ) {
    failures.push(
      `${adjustments.length} adjustments; at most ${want.maxAdjustments} allowed`
    )
  }
  return failures
}

// For the manual run: the model input a scenario produces.
export function buildScenarioInput(
  built: BuiltScenario,
  rules: RulesOutput
): { input: RecommendationInput; aliases: AliasMap } {
  return buildRecommendationInput({
    request: built.request,
    rules,
    snapshot: built.snapshot,
    room: built.room,
    unownedNames: built.unownedNames
  })
}
