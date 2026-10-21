import { describe, expect, it } from 'vitest'

import { recommendationPrompt } from '@/lib/ai/prompts/mic-recommendation'
import { buildRecommendationInput } from '@/lib/recommendations/llm-input'
import type { RecommendationInput } from '@/lib/recommendations/llm-input'
import { recommendationSchema } from '@/lib/recommendations/reply'
import type { RecommendationContent } from '@/lib/recommendations/reply'
import { runRules } from '@/lib/recommendations/rules'
import type {
  LockerSnapshot,
  NormalisedRequest,
  RequestRoom
} from '@/lib/recommendations/types'
import {
  mentionsName,
  placementNumbers,
  unsafePhantomClaims,
  validateRecommendation
} from '@/lib/recommendations/validate'
import type { SourceSpec } from '@/test/recommendations'
import {
  lockerUnit,
  requestOf,
  ruleMic,
  snapshotOf
} from '@/test/recommendations'

const u87 = ruleMic('u87', {
  manufacturer: 'Neumann',
  model: 'U 87 Ai',
  transducerType: 'ldc',
  polarPatterns: ['omni', 'cardioid', 'figure8'],
  powering: 'phantom'
})
const sm57 = ruleMic('sm57', { manufacturer: 'Shure', model: 'SM57' })
const r121 = ruleMic('r121', {
  manufacturer: 'Royer',
  model: 'R-121',
  transducerType: 'ribbon',
  polarPatterns: ['figure8']
})

const basic = (): LockerSnapshot =>
  snapshotOf(
    [
      lockerUnit('ua', 'u87'),
      lockerUnit('ub', 'sm57'),
      lockerUnit('uc', 'sm57')
    ],
    [u87, sm57]
  )

function setup(
  sources: SourceSpec[] = ['vocal_lead', 'snare_top'],
  snapshot: LockerSnapshot = basic(),
  overrides: Partial<NormalisedRequest> = {},
  room: RequestRoom | null = null,
  unownedNames: string[] = ['Neumann U 47', 'U 47']
) {
  const request = requestOf(sources, overrides)
  const rules = runRules(request, snapshot)
  return buildRecommendationInput({
    request,
    rules,
    snapshot,
    room,
    unownedNames
  }).input
}

// A reply that follows every rule, built from the input itself.
function goodReply(input: RecommendationInput): RecommendationContent {
  return {
    answerable: true,
    sources: input.data.sources.map((source) => {
      const { distanceMm, angleDeg } = source.placement
      return {
        sourceId: source.id,
        primary: {
          option: source.rulesPick ?? source.options[0].id,
          reasoning: 'A sensible fit for this source.',
          placement: {
            position: 'Aimed at the centre of the source',
            distanceMm: distanceMm[0],
            angleDeg: angleDeg[0],
            spacingMm: source.technique.spacingMm?.[0] ?? null,
            includedAngleDeg: source.technique.includedAngleDeg?.[0] ?? null
          }
        },
        alternatives: []
      }
    }),
    summary: null
  }
}

const problemsFor = (
  input: RecommendationInput,
  edit: (reply: RecommendationContent) => void
) => {
  const reply = goodReply(input)
  edit(reply)
  return validateRecommendation(reply, input)
}

describe('validateRecommendation', () => {
  it('accepts a reply that follows the rules', () => {
    const input = setup()
    expect(validateRecommendation(goodReply(input), input)).toEqual([])
    // The prompt wires the same function in.
    expect(recommendationPrompt.validate!(goodReply(input), input)).toEqual([])
  })

  describe('coverage', () => {
    it('rejects an unknown source, a missing source and a duplicate', () => {
      const input = setup()
      expect(
        problemsFor(input, (r) => {
          r.sources[0].sourceId = 's9'
        }).join()
      ).toMatch(/"s9", which was not supplied/)
      expect(problemsFor(input, (r) => r.sources.pop()).join()).toMatch(
        /must contain "s2" exactly once/
      )
      expect(
        problemsFor(input, (r) =>
          r.sources.push(structuredClone(r.sources[0]))
        ).join()
      ).toMatch(/must contain "s1" exactly once/)
    })

    it('allows "not answerable" only for a question, with no sources', () => {
      const asked = setup(['vocal_lead'], basic(), {
        kind: 'question',
        question: 'What is the capital of France?'
      })
      const off = { answerable: false, sources: [], summary: null }
      expect(validateRecommendation(off, asked)).toEqual([])
      expect(
        validateRecommendation(
          { ...off, sources: goodReply(asked).sources },
          asked
        ).join()
      ).toMatch(/must be empty/)

      expect(validateRecommendation(off, setup()).join()).toMatch(
        /only be false for a question/
      )
    })
  })

  describe('candidate membership', () => {
    it("rejects an option from another source, or one that doesn't exist", () => {
      const input = setup()
      const otherSourceOption = input.data.sources[1].options[0].id
      expect(
        problemsFor(input, (r) => {
          r.sources[0].primary.option = otherSourceOption
        }).join()
      ).toMatch(/"c\d+" is not one of its options/)
      expect(
        problemsFor(input, (r) => {
          r.sources[0].primary.option = 'c99'
        }).join()
      ).toMatch(/"c99" is not one of its options/)
      expect(
        problemsFor(input, (r) => {
          r.sources[0].alternatives = [{ option: 'c42', reason: 'Another.' }]
        }).join()
      ).toMatch(/"c42"/)
    })

    it('rejects an alternative that repeats the primary or another alternative', () => {
      const input = setup(['snare_top', 'tom', 'hihat'])
      const [first, second] = input.data.sources[0].options
      expect(
        problemsFor(input, (r) => {
          r.sources[0].primary.option = first.id
          r.sources[0].alternatives = [{ option: first.id, reason: 'Same.' }]
        }).join()
      ).toMatch(/repeats the primary/)
      expect(
        problemsFor(input, (r) => {
          r.sources[0].primary.option = first.id
          r.sources[0].alternatives = [
            { option: second.id, reason: 'Other.' },
            { option: second.id, reason: 'Other again.' }
          ]
        }).join()
      ).toMatch(/must be different options/)
    })

    it('accepts a distinct alternative from the same source', () => {
      const input = setup()
      const [first, second] = input.data.sources[0].options
      expect(
        problemsFor(input, (r) => {
          r.sources[0].primary.option = first.id
          r.sources[0].alternatives = [
            { option: second.id, reason: 'A plainer take.' }
          ]
        })
      ).toEqual([])
    })
  })

  describe('placement', () => {
    // snare_top: distance 25 to 75 mm, angle 0 to 60 degrees, no spacing.
    const snareInput = () => setup(['snare_top'])

    it('rejects values outside the supplied range, or missing ones', () => {
      const input = snareInput()
      expect(
        problemsFor(input, (r) => {
          r.sources[0].primary.placement.distanceMm = 500
        }).join()
      ).toMatch(/distanceMm 500 is outside the allowed range 25 to 75/)
      expect(
        problemsFor(input, (r) => {
          r.sources[0].primary.placement.angleDeg = 90
        }).join()
      ).toMatch(/angleDeg 90 is outside/)
      expect(
        problemsFor(input, (r) => {
          r.sources[0].primary.placement.distanceMm = null
        }).join()
      ).toMatch(/distanceMm is required/)
    })

    it('accepts the ends of the range', () => {
      const input = snareInput()
      for (const [distanceMm, angleDeg] of [
        [25, 0],
        [75, 60]
      ]) {
        expect(
          problemsFor(input, (r) => {
            Object.assign(r.sources[0].primary.placement, {
              distanceMm,
              angleDeg
            })
          })
        ).toEqual([])
      }
    })

    it('needs spacing and angle for a spaced pair, and none for a single mic', () => {
      const pair = snapshotOf(
        [
          lockerUnit('p1', 'sm57', { matchedPairGroup: 'A' }),
          lockerUnit('p2', 'sm57', { matchedPairGroup: 'A' })
        ],
        [sm57]
      )
      const input = setup([{ kind: 'overheads', technique: 'ortf' }], pair)
      expect(validateRecommendation(goodReply(input), input)).toEqual([])
      expect(
        problemsFor(input, (r) => {
          r.sources[0].primary.placement.spacingMm = null
        }).join()
      ).toMatch(/spacingMm is required/)
      expect(
        problemsFor(input, (r) => {
          r.sources[0].primary.placement.spacingMm = 400
        }).join()
      ).toMatch(/spacingMm 400 is outside the allowed range 170 to 170/)

      expect(
        problemsFor(snareInput(), (r) => {
          r.sources[0].primary.placement.spacingMm = 170
        }).join()
      ).toMatch(/spacingMm must be null for this technique/)
    })

    it('keeps a microphone inside the room', () => {
      const pair = snapshotOf(
        [
          lockerUnit('p1', 'sm57', { matchedPairGroup: 'A' }),
          lockerUnit('p2', 'sm57', { matchedPairGroup: 'A' })
        ],
        [sm57]
      )
      const room: RequestRoom = {
        id: 'r',
        studioId: 's',
        name: 'Booth',
        widthMm: 1200,
        lengthMm: 1400,
        heightMm: null
      }
      const input = setup(
        [{ kind: 'overheads', technique: 'ortf' }],
        pair,
        {},
        room
      )
      expect(
        problemsFor(input, (r) => {
          r.sources[0].primary.placement.distanceMm = 1800
        }).join()
      ).toMatch(/further than the longest side of the room \(1400\)/)
    })
  })

  describe('numbers', () => {
    const input = () => setup(['snare_top'])

    it('rejects a number that is in neither the data nor the placement', () => {
      expect(
        problemsFor(input(), (r) => {
          r.sources[0].primary.reasoning = 'Gives about 48 V of drive.'
        }).join()
      ).toMatch(/number 48/)
    })

    it('allows the chosen placement restated in mm, cm or m', () => {
      expect(
        problemsFor(input(), (r) => {
          const pick = r.sources[0].primary
          pick.placement.distanceMm = 50
          pick.placement.position = 'About 5 cm above the rim'
          pick.reasoning = 'Place it 50 mm from the head, 0.05 m up.'
        })
      ).toEqual([])
    })

    it('does not allow a value that was not chosen', () => {
      expect(
        problemsFor(input(), (r) => {
          const pick = r.sources[0].primary
          pick.placement.distanceMm = 50
          pick.reasoning = 'Try 62 mm instead.'
        }).join()
      ).toMatch(/number 62/)
    })

    it('checks the summary too', () => {
      expect(
        problemsFor(setup(), (r) => {
          r.summary = 'Roughly 90 dB of headroom everywhere.'
        }).join()
      ).toMatch(/number 90/)
    })

    it('placementNumbers gives the value, centimetres and metres', () => {
      expect(
        placementNumbers({
          position: 'x',
          distanceMm: 1500,
          angleDeg: 30,
          spacingMm: null,
          includedAngleDeg: null
        })
      ).toEqual([1500, 150, 1.5, 30, 3, 0.03])
    })
  })

  describe('phantom power', () => {
    const ribbonInput = () =>
      setup(['acoustic_guitar'], snapshotOf([lockerUnit('rr', 'r121')], [r121]))

    it('rejects telling a passive ribbon to use phantom', () => {
      expect(
        problemsFor(ribbonInput(), (r) => {
          r.sources[0].primary.reasoning =
            'Switch phantom power on for extra gain.'
        }).join()
      ).toMatch(/must not have phantom power/)
    })

    it('accepts keeping phantom off, or checking the maker first', () => {
      for (const text of [
        'Keep phantom off for this ribbon.',
        'Check the manufacturer guidance before connecting phantom power.',
        'Phantom power can damage it.'
      ]) {
        expect(
          problemsFor(ribbonInput(), (r) => {
            r.sources[0].primary.reasoning = text
          }),
          text
        ).toEqual([])
      }
    })

    it('does not mind phantom talk for an ordinary condenser', () => {
      expect(
        problemsFor(setup(['vocal_lead']), (r) => {
          r.sources[0].primary.reasoning = 'It runs on phantom power.'
        })
      ).toEqual([])
    })

    it('unsafePhantomClaims judges a sentence at a time', () => {
      expect(unsafePhantomClaims('Use phantom power. Keep it back.')).toBe(true)
      expect(unsafePhantomClaims('Keep it back. Phantom must stay off.')).toBe(
        false
      )
      expect(unsafePhantomClaims('No electrical power needed.')).toBe(false)
    })
  })

  describe('microphones the studio does not own', () => {
    it('rejects naming one, however it is spaced', () => {
      for (const text of [
        'Closer to a Neumann U 47 sound.',
        'Think U47 territory.',
        'u 47 style warmth'
      ]) {
        expect(
          problemsFor(setup(['vocal_lead']), (r) => {
            r.sources[0].primary.reasoning = text
          }).join(),
          text
        ).toMatch(/does not own/)
      }
    })

    it('rejects it in the summary as well', () => {
      expect(
        problemsFor(setup(['vocal_lead']), (r) => {
          r.summary = 'A U 47 would be nicer.'
        }).join()
      ).toMatch(/summary names/)
    })

    it('allows naming a mic that is owned, even if it is not a candidate here', () => {
      expect(
        problemsFor(setup(['vocal_lead']), (r) => {
          r.sources[0].primary.reasoning =
            'Better than the SM57 for breathy detail.'
        })
      ).toEqual([])
    })

    it('allows naming an owned mic that is out for repair, numbers and all', () => {
      const sm58 = ruleMic('sm58', { manufacturer: 'Shure', model: 'SM58' })
      const snapshot = snapshotOf(
        [
          lockerUnit('ua', 'u87'),
          lockerUnit('ud', 'sm58', { equipmentStatus: 'repair' })
        ],
        [u87, sm58]
      )
      const input = setup(['vocal_lead'], snapshot)
      // The SM58 is owned but excluded, so it is not in the data the model saw.
      expect(JSON.stringify(input.data)).not.toContain('SM58')
      expect(input.guard.ownedNames).toContain('Shure SM58')
      expect(
        problemsFor(input, (r) => {
          r.sources[0].primary.reasoning = 'Not the SM58 here, it is in repair.'
        })
      ).toEqual([])
    })

    it('never lists an owned mic as one the studio does not own', () => {
      const input = setup(['vocal_lead'], basic(), {}, null, [
        'Shure SM57',
        'SM57',
        'Neumann U 47'
      ])
      expect(input.guard.unownedNames).toEqual(['Neumann U 47'])
    })

    it('mentionsName is whole-word and ignores very short names', () => {
      expect(mentionsName('the u47 vibe', 'U 47')).toBe(true)
      expect(mentionsName('a tu47x thing', 'U 47')).toBe(false)
      expect(mentionsName('anything', 'A')).toBe(false)
    })
  })
})

describe('recommendationSchema', () => {
  const valid: RecommendationContent = {
    answerable: true,
    sources: [
      {
        sourceId: 's1',
        primary: {
          option: 'c1',
          reasoning: 'Good.',
          placement: {
            position: 'Near',
            distanceMm: 50,
            angleDeg: 10,
            spacingMm: null,
            includedAngleDeg: null
          }
        },
        alternatives: []
      }
    ],
    summary: null
  }

  it('accepts a well-formed reply', () => {
    expect(recommendationSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects three alternatives, fractional placement and overlong text', () => {
    const alt = { option: 'c2', reason: 'Other.' }
    const withAlts = structuredClone(valid)
    withAlts.sources[0].alternatives = [alt, alt, alt]
    expect(recommendationSchema.safeParse(withAlts).success).toBe(false)

    const fractional = structuredClone(valid)
    fractional.sources[0].primary.placement.distanceMm = 50.5
    expect(recommendationSchema.safeParse(fractional).success).toBe(false)

    const long = structuredClone(valid)
    long.sources[0].primary.reasoning = 'x'.repeat(301)
    expect(recommendationSchema.safeParse(long).success).toBe(false)
  })
})

describe('recommendationPrompt', () => {
  it('is a tenant prompt, versioned, with no data in the system prompt', () => {
    expect(recommendationPrompt.tenant).toBe(true)
    expect(recommendationPrompt.version).toMatch(/^\d+$/)
    expect(recommendationPrompt.system).not.toMatch(/cuid|u87|sm57/i)
  })

  it('tells the model data is not instructions and to stay inside the list', () => {
    expect(recommendationPrompt.system).toMatch(/never instructions/)
    expect(recommendationPrompt.system).toMatch(/Choose only from the options/)
    expect(recommendationPrompt.system).toMatch(/never suggest buying/i)
    expect(recommendationPrompt.system).toMatch(/ribbon/)
  })

  it('wraps session data and user text in separate delimited blocks', () => {
    const message = recommendationPrompt.build(setup())
    expect(message).toContain('<session_data>')
    expect(message).toContain('</session_data>')
    expect(message).toContain('<user_text>')
    expect(message).toContain('</user_text>')
  })
})
