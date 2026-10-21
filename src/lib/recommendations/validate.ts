import { groundingProblems, numbersIn } from '@/lib/ai/grounding'

import type { RecommendationInput } from './llm-input'
import type { RecommendationContent, ReplyPlacement } from './reply'

// Checks a model reply against the request it answered (PLAN §4.4: "output is
// validated against the candidate list and anything not owned is dropped").
// Every problem here is fatal: the service feeds the list back for one retry
// and then fails closed, showing only the rules-based result. Allocation
// clashes between sources are not fatal and are repaired in finalise().

// ---------------------------------------------------------------------------
// Text helpers

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// True when `text` names `name`, however it is spaced ("U 87" / "U87").
export function mentionsName(text: string, name: string): boolean {
  const spaced = normalise(name)
  const joined = spaced.replaceAll(' ', '')
  if (joined.length < 3) return false
  const haystack = ` ${normalise(text)} `
  return haystack.includes(` ${spaced} `) || haystack.includes(` ${joined} `)
}

// A sentence that talks about phantom power without saying to avoid it, or to
// check first. Deliberately a heuristic: it catches "use phantom power for a
// bit more gain" on a ribbon, not every clever wording.
const SAFE_PHANTOM_WORDING =
  /\b(no|not|never|without|off|avoid|avoiding|disable|disabled|disconnect|isn'?t|aren'?t|don'?t|doesn'?t|unsafe|damage|damaged|risk|check|guidance|manufacturer|confirm|before)\b/i

export function unsafePhantomClaims(text: string): boolean {
  return text
    .split(/[.;!?\n]+/)
    .some(
      (sentence) =>
        /phantom|\b48\s*v\b/i.test(sentence) &&
        !SAFE_PHANTOM_WORDING.test(sentence)
    )
}

// The values a placement may legitimately be quoted as in text: as given, in
// centimetres or in metres.
export function placementNumbers(placement: ReplyPlacement): number[] {
  const values = [
    placement.distanceMm,
    placement.angleDeg,
    placement.spacingMm,
    placement.includedAngleDeg
  ].filter((value): value is number => value !== null)
  return values.flatMap((v) => [v, v / 10, v / 1000])
}

function allTexts(entry: RecommendationContent['sources'][number]): string[] {
  return [
    entry.primary.reasoning,
    entry.primary.placement.position,
    ...entry.alternatives.map((a) => a.reason)
  ]
}

// ---------------------------------------------------------------------------

export function validateRecommendation(
  output: RecommendationContent,
  input: RecommendationInput
): string[] {
  const { data, guard } = input
  const problems: string[] = []
  const sources = new Map(data.sources.map((s) => [s.id, s]))

  // Whether the reply is allowed to say "not a microphone question".
  if (!output.answerable) {
    if (data.mode !== 'question') {
      problems.push('answerable can only be false for a question request.')
    } else if (output.sources.length > 0) {
      problems.push('When answerable is false, sources must be empty.')
    }
    return problems
  }

  // Coverage: every sent source exactly once, nothing else.
  const seen = new Map<string, number>()
  for (const entry of output.sources) {
    if (!sources.has(entry.sourceId)) {
      problems.push(
        `sources contains "${entry.sourceId}", which was not supplied.`
      )
    }
    seen.set(entry.sourceId, (seen.get(entry.sourceId) ?? 0) + 1)
  }
  for (const id of sources.keys()) {
    if (seen.get(id) !== 1) {
      problems.push(`sources must contain "${id}" exactly once.`)
    }
  }

  // Figures that are legitimate in text beyond the data itself: the numbers in
  // the names of mics the studio owns (even ones that are not candidates here).
  const ownedNameNumbers = numbersIn(guard.ownedNames.join(' '))
  const allPlacementNumbers = [
    ...output.sources.flatMap((e) => placementNumbers(e.primary.placement)),
    ...ownedNameNumbers
  ]

  for (const entry of output.sources) {
    const source = sources.get(entry.sourceId)
    if (!source) continue
    const options = new Map(source.options.map((o) => [o.id, o]))
    const where = `Source ${source.id}`

    // Candidate membership: only this source's own options.
    const picked = [
      entry.primary.option,
      ...entry.alternatives.map((a) => a.option)
    ]
    for (const id of picked) {
      if (!options.has(id)) {
        problems.push(
          `${where}: "${id}" is not one of its options (${[...options.keys()].join(', ')}).`
        )
      }
    }
    const alternatives = entry.alternatives.map((a) => a.option)
    if (alternatives.includes(entry.primary.option)) {
      problems.push(`${where}: an alternative repeats the primary option.`)
    }
    if (new Set(alternatives).size !== alternatives.length) {
      problems.push(`${where}: alternatives must be different options.`)
    }

    // Placement: present where the source needs it, inside the supplied range.
    const { placement } = entry.primary
    const check = (
      label: string,
      value: number | null,
      range: readonly [number, number] | null,
      required: boolean
    ) => {
      if (value === null) {
        if (required) problems.push(`${where}: ${label} is required.`)
        return
      }
      if (!range) {
        problems.push(`${where}: ${label} must be null for this technique.`)
      } else if (value < range[0] || value > range[1]) {
        problems.push(
          `${where}: ${label} ${value} is outside the allowed range ${range[0]} to ${range[1]}.`
        )
      }
    }
    check('distanceMm', placement.distanceMm, source.placement.distanceMm, true)
    check('angleDeg', placement.angleDeg, source.placement.angleDeg, true)
    check(
      'spacingMm',
      placement.spacingMm,
      source.technique.spacingMm,
      source.technique.spacingMm !== null
    )
    check(
      'includedAngleDeg',
      placement.includedAngleDeg,
      source.technique.includedAngleDeg,
      source.technique.includedAngleDeg !== null
    )
    if (data.room && placement.distanceMm !== null) {
      const longest = Math.max(data.room.widthMm, data.room.lengthMm)
      if (placement.distanceMm > longest) {
        problems.push(
          `${where}: distanceMm ${placement.distanceMm} is further than the longest side of the room (${longest}).`
        )
      }
    }

    // Numbers in the text must come from the data or this pick's placement.
    problems.push(
      ...groundingProblems(allTexts(entry), data, [
        ...placementNumbers(placement),
        ...ownedNameNumbers
      ])
    )

    // A ribbon that must not have phantom must not be told to use it.
    for (const id of picked) {
      const option = options.get(id)
      if (!option?.warnings.includes('phantom_off')) continue
      const texts =
        id === entry.primary.option
          ? [entry.primary.reasoning, entry.primary.placement.position]
          : entry.alternatives
              .filter((a) => a.option === id)
              .map((a) => a.reason)
      if (texts.some(unsafePhantomClaims)) {
        problems.push(
          `${where}: option ${id} is a ribbon that must not have phantom power; do not suggest it.`
        )
      }
    }

    // Never name a catalogue model the studio does not own.
    for (const text of allTexts(entry)) {
      for (const name of guard.unownedNames) {
        if (mentionsName(text, name)) {
          problems.push(
            `${where}: the text names "${name}", which the studio does not own. Refer only to the candidate options.`
          )
        }
      }
    }
  }

  if (output.summary) {
    problems.push(
      ...groundingProblems(output.summary, data, allPlacementNumbers)
    )
    for (const name of guard.unownedNames) {
      if (mentionsName(output.summary, name)) {
        problems.push(
          `The summary names "${name}", which the studio does not own.`
        )
      }
    }
  }

  return [...new Set(problems)]
}
