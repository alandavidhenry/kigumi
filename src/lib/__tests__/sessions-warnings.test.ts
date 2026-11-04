import { describe, expect, it } from 'vitest'

import type { UnitInfo } from '@/lib/sessions/types'
import { sessionWarnings } from '@/lib/sessions/warnings'
import type { WarningInput } from '@/lib/sessions/warnings'

const u87: UnitInfo = {
  unitId: 'u87',
  name: 'U 87 Ai',
  transducerType: 'ldc',
  powering: 'phantom',
  phantomSafe: null,
  equipmentStatus: 'in_service'
}
const sm57: UnitInfo = {
  unitId: 'sm57',
  name: 'SM57',
  transducerType: 'dynamic',
  powering: 'none',
  phantomSafe: null,
  equipmentStatus: 'in_service'
}
const ribbon: UnitInfo = {
  unitId: 'r121',
  name: 'R-121',
  transducerType: 'ribbon',
  powering: 'none',
  phantomSafe: null,
  equipmentStatus: 'in_service'
}

function input(overrides: Partial<WarningInput> = {}): WarningInput {
  return {
    phantomMode: 'per_channel',
    channelsAvailable: null,
    channels: [],
    units: new Map([u87, sm57, ribbon].map((u) => [u.unitId, u])),
    micItemsWithoutUnit: [],
    itemsOutsideRoom: [],
    bookings: new Map(),
    ...overrides
  }
}

const ch = (
  id: string,
  number: number,
  micUnitId: string | null,
  phantom: boolean
) => ({
  id,
  number,
  kind: 'mic' as const,
  source: `Src ${number}`,
  micUnitId,
  phantom
})

const codes = (w: ReturnType<typeof sessionWarnings>) => w.map((x) => x.code)

describe('sessionWarnings', () => {
  it('is quiet for a correct setup', () => {
    expect(
      sessionWarnings(
        input({
          channels: [ch('a', 1, 'u87', true), ch('b', 2, 'sm57', false)]
        })
      )
    ).toEqual([])
  })

  it('blocks phantom on a ribbon whose tolerance is unknown', () => {
    const w = sessionWarnings(input({ channels: [ch('a', 1, 'r121', true)] }))
    expect(w).toHaveLength(1)
    expect(w[0]).toMatchObject({
      code: 'ribbon_phantom',
      severity: 'blocking',
      channelIds: ['a']
    })
    expect(w[0].text).toContain('R-121')
  })

  it('does not warn about a ribbon with phantom off, or one known to be phantom-safe', () => {
    expect(
      sessionWarnings(input({ channels: [ch('a', 1, 'r121', false)] }))
    ).toEqual([])
    const safe = { ...ribbon, phantomSafe: true }
    expect(
      sessionWarnings(
        input({
          units: new Map([[safe.unitId, safe]]),
          channels: [ch('a', 1, 'r121', true)]
        })
      )
    ).toEqual([])
  })

  it('warns when a phantom mic has phantom off', () => {
    expect(
      codes(sessionWarnings(input({ channels: [ch('a', 1, 'u87', false)] })))
    ).toEqual(['phantom_off'])
  })

  it('blocks a global phantom conflict between a condenser and a ribbon', () => {
    const w = sessionWarnings(
      input({
        phantomMode: 'global',
        channels: [ch('a', 1, 'u87', true), ch('b', 2, 'r121', false)]
      })
    )
    expect(codes(w)).toContain('global_phantom_conflict')
    expect(
      sessionWarnings(
        input({
          phantomMode: 'per_channel',
          channels: [ch('a', 1, 'u87', true), ch('b', 2, 'r121', false)]
        })
      )
    ).toEqual([])
  })

  it('blocks one unit on two channels', () => {
    const w = sessionWarnings(
      input({
        channels: [ch('a', 1, 'sm57', false), ch('b', 2, 'sm57', false)]
      })
    )
    expect(w).toHaveLength(1)
    expect(w[0]).toMatchObject({ code: 'unit_twice', severity: 'blocking' })
    expect(w[0].channelIds).toEqual(['a', 'b'])
  })

  it('warns when there are more inputs than channels, and not when unknown or equal', () => {
    const channels = [ch('a', 1, 'sm57', false), ch('b', 2, null, false)]
    expect(
      codes(sessionWarnings(input({ channels, channelsAvailable: 1 })))
    ).toContain('too_many_inputs')
    expect(
      codes(sessionWarnings(input({ channels, channelsAvailable: 2 })))
    ).not.toContain('too_many_inputs')
    expect(
      codes(sessionWarnings(input({ channels, channelsAvailable: null })))
    ).not.toContain('too_many_inputs')
  })

  it('blocks a unit that is double-booked, naming the other session', () => {
    const w = sessionWarnings(
      input({
        channels: [ch('a', 1, 'sm57', false)],
        bookings: new Map([['sm57', [{ sessionId: 's2', name: 'Drum day' }]]])
      })
    )
    expect(w[0]).toMatchObject({ code: 'double_booked', severity: 'blocking' })
    expect(w[0].text).toContain('Drum day')
  })

  it('warns about a unit out of service', () => {
    const repair = { ...sm57, equipmentStatus: 'repair' }
    const w = sessionWarnings(
      input({
        units: new Map([[repair.unitId, repair]]),
        channels: [ch('a', 1, 'sm57', false)]
      })
    )
    expect(codes(w)).toEqual(['unit_unavailable'])
    expect(w[0].text).toContain('repair')
  })

  it('reports mics with no unit and items outside the room', () => {
    const w = sessionWarnings(
      input({
        micItemsWithoutUnit: [{ channelId: 'a', label: 'Snare' }],
        itemsOutsideRoom: [{ label: 'Gobo' }]
      })
    )
    expect(codes(w)).toEqual(['mic_no_unit', 'outside_room'])
  })

  it('ignores line channels for mic-only checks', () => {
    const w = sessionWarnings(
      input({
        channels: [
          { ...ch('a', 1, 'r121', true), kind: 'line' as const },
          { ...ch('b', 2, 'r121', true), kind: 'line' as const }
        ]
      })
    )
    expect(w).toEqual([])
  })
})
