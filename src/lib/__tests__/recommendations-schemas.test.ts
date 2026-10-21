import { describe, expect, it } from 'vitest'

import {
  feedbackInputSchema,
  normaliseRequest,
  recommendationRequestSchema
} from '@/lib/recommendations/schemas'

describe('recommendationRequestSchema', () => {
  const parse = (input: unknown) => recommendationRequestSchema.safeParse(input)

  it('needs exactly one of sources or question', () => {
    expect(parse({}).success).toBe(false)
    expect(
      parse({ sources: [{ label: 'Snare' }], question: 'Why?' }).success
    ).toBe(false)
    expect(parse({ sources: [{ label: 'Snare' }] }).success).toBe(true)
    expect(parse({ question: 'Which mic for a breathy vocal?' }).success).toBe(
      true
    )
  })

  it('bounds the lists and text', () => {
    expect(parse({ sources: [] }).success).toBe(false)
    const many = Array.from({ length: 49 }, () => ({ label: 'Tom' }))
    expect(parse({ sources: many }).success).toBe(false)
    expect(parse({ sources: [{ label: '' }] }).success).toBe(false)
    expect(parse({ sources: [{ label: 'x'.repeat(81) }] }).success).toBe(false)
    expect(parse({ question: 'x'.repeat(501) }).success).toBe(false)
    expect(
      parse({ sources: [{ label: 'Tom' }], intent: 'x'.repeat(501) }).success
    ).toBe(false)
    expect(parse({ sources: [{ label: 'Tom' }], channels: 0 }).success).toBe(
      false
    )
    expect(parse({ sources: [{ label: 'Tom' }], channels: 257 }).success).toBe(
      false
    )
  })

  it('rejects unknown kinds, techniques and phantom modes', () => {
    expect(
      parse({ sources: [{ label: 'x', kind: 'tuba_solo' }] }).success
    ).toBe(false)
    expect(
      parse({ sources: [{ label: 'x', technique: 'spaced_banana' }] }).success
    ).toBe(false)
    expect(
      parse({ sources: [{ label: 'x' }], phantomMode: 'sometimes' }).success
    ).toBe(false)
  })

  it('accepts real calendar dates only', () => {
    const ok = (forDate: string) =>
      parse({ sources: [{ label: 'x' }], forDate }).success
    expect(ok('2026-10-20')).toBe(true)
    expect(ok('2026-02-30')).toBe(false)
    expect(ok('20-10-2026')).toBe(false)
    expect(ok('2026-13-01')).toBe(false)
  })

  it('defaults phantom to per channel', () => {
    const parsed = parse({ sources: [{ label: 'x' }] })
    expect(parsed.success && parsed.data.phantomMode).toBe('per_channel')
  })
})

describe('normaliseRequest', () => {
  const run = (input: unknown) =>
    normaliseRequest(recommendationRequestSchema.parse(input))

  it('numbers sources, collapses whitespace and classifies the kind', () => {
    const request = run({
      sources: [
        { label: '  Snare   BTM ' },
        { label: 'Tom 2' },
        { label: 'x' }
      ],
      intent: '  warm   and tight  '
    })
    expect(request.kind).toBe('sources')
    expect(request.sources).toEqual([
      { id: 's1', label: 'Snare BTM', kind: 'snare_bottom', technique: 'mono' },
      { id: 's2', label: 'Tom 2', kind: 'tom', technique: 'mono' },
      { id: 's3', label: 'x', kind: 'general', technique: 'mono' }
    ])
    expect(request.intent).toBe('warm and tight')
  })

  it('lets the caller override the kind and technique', () => {
    const request = run({
      sources: [{ label: 'Kit', kind: 'overheads', technique: 'ortf' }]
    })
    expect(request.sources[0]).toMatchObject({
      kind: 'overheads',
      technique: 'ortf'
    })
  })

  it('uses a sensible technique for the kind when none is given', () => {
    expect(run({ sources: [{ label: 'OH' }] }).sources[0].technique).toBe('xy')
    expect(run({ sources: [{ label: 'vox' }] }).sources[0].technique).toBe(
      'mono'
    )
  })

  it('refuses a technique the source cannot use', () => {
    expect(() =>
      run({ sources: [{ label: 'Snare', technique: 'decca' }] })
    ).toThrow(/cannot use|Decca/i)
    expect(() =>
      run({ sources: [{ label: 'Keys', kind: 'di', technique: 'xy' }] })
    ).toThrow()
  })

  it('keeps repeated labels apart by position', () => {
    const request = run({
      sources: [{ label: 'Tom' }, { label: 'Tom' }, { label: 'Tom' }]
    })
    expect(request.sources.map((s) => s.id)).toEqual(['s1', 's2', 's3'])
  })

  it('turns a question into one source classified from its words', () => {
    const request = run({
      question: '  Which of my mics would suit a breathy   female vocal? '
    })
    expect(request.kind).toBe('question')
    expect(request.question).toBe(
      'Which of my mics would suit a breathy female vocal?'
    )
    expect(request.sources).toEqual([
      {
        id: 's1',
        label: 'Your question',
        kind: 'vocal_lead',
        technique: 'mono'
      }
    ])
  })

  it('carries room, date, channels and phantom mode through', () => {
    const request = run({
      sources: [{ label: 'x' }],
      roomId: 'room_1',
      forDate: '2026-10-20',
      channels: 8,
      phantomMode: 'global'
    })
    expect(request).toMatchObject({
      roomId: 'room_1',
      forDate: '2026-10-20',
      channels: 8,
      phantomMode: 'global',
      intent: null,
      question: null
    })
  })
})

describe('feedbackInputSchema', () => {
  const parse = (input: unknown) => feedbackInputSchema.safeParse(input)

  it('accepts accepted, rejected and swapped verdicts', () => {
    expect(parse({ sourceKey: 's1', verdict: 'accepted' }).success).toBe(true)
    expect(
      parse({
        sourceKey: '*',
        verdict: 'rejected',
        rating: 2,
        reasons: ['unsafe']
      }).success
    ).toBe(true)
    expect(
      parse({ sourceKey: 's2', verdict: 'swapped', swappedToUnitIds: ['u1'] })
        .success
    ).toBe(true)
  })

  it('needs units for a swap and none otherwise', () => {
    expect(parse({ sourceKey: 's2', verdict: 'swapped' }).success).toBe(false)
    expect(
      parse({ sourceKey: 's2', verdict: 'accepted', swappedToUnitIds: ['u1'] })
        .success
    ).toBe(false)
  })

  it('cannot swap the whole recommendation', () => {
    expect(
      parse({ sourceKey: '*', verdict: 'swapped', swappedToUnitIds: ['u1'] })
        .success
    ).toBe(false)
  })

  it('bounds rating, reasons, comment and the source key', () => {
    const base = { sourceKey: 's1', verdict: 'accepted' }
    expect(parse({ ...base, rating: 0 }).success).toBe(false)
    expect(parse({ ...base, rating: 6 }).success).toBe(false)
    expect(parse({ ...base, rating: 2.5 }).success).toBe(false)
    expect(parse({ ...base, reasons: ['because'] }).success).toBe(false)
    expect(parse({ ...base, comment: 'x'.repeat(1001) }).success).toBe(false)
    expect(parse({ ...base, sourceKey: 'x'.repeat(13) }).success).toBe(false)
    expect(parse({ ...base, verdict: 'loved' }).success).toBe(false)
  })

  it('trims the comment and treats an empty one as none', () => {
    const parsed = parse({
      sourceKey: 's1',
      verdict: 'accepted',
      comment: '   '
    })
    expect(parsed.success && parsed.data.comment).toBeUndefined()
  })
})
