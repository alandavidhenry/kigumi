import { describe, expect, it } from 'vitest'

import {
  defaultPhantom,
  nextChannelNumber,
  reconcileInputList
} from '@/lib/sessions/input-list'
import type { ChannelItemRef, ChannelRow, UnitInfo } from '@/lib/sessions/types'

const unit = (overrides: Partial<UnitInfo> = {}): UnitInfo => ({
  unitId: 'u1',
  name: 'Neumann U 87 Ai',
  transducerType: 'ldc',
  powering: 'phantom',
  phantomSafe: null,
  equipmentStatus: 'in_service',
  ...overrides
})

const units = (...list: UnitInfo[]) => new Map(list.map((u) => [u.unitId, u]))

const mic = (overrides: Partial<ChannelItemRef> = {}): ChannelItemRef => ({
  id: 'i1',
  type: 'mic',
  label: 'Vocal',
  micUnitId: 'u1',
  ...overrides
})

const channel = (overrides: Partial<ChannelRow> = {}): ChannelRow => ({
  id: 'c1',
  number: 1,
  layoutItemId: 'i1',
  kind: 'mic',
  source: 'Vocal',
  micUnitId: 'u1',
  stand: null,
  preampInput: null,
  phantom: true,
  padDb: null,
  dawName: null,
  notes: null,
  ...overrides
})

describe('defaultPhantom', () => {
  it('is on for a phantom-powered mic and off for dynamics and unknown units', () => {
    expect(defaultPhantom(unit())).toBe(true)
    expect(
      defaultPhantom(unit({ transducerType: 'dynamic', powering: 'none' }))
    ).toBe(false)
    expect(defaultPhantom(undefined)).toBe(false)
  })

  it('is never on for a passive ribbon, even if the catalogue says phantom', () => {
    expect(
      defaultPhantom(
        unit({ transducerType: 'ribbon', powering: 'none', phantomSafe: null })
      )
    ).toBe(false)
    expect(
      defaultPhantom(
        unit({
          transducerType: 'ribbon',
          powering: 'none',
          phantomSafe: false
        })
      )
    ).toBe(false)
  })
})

describe('nextChannelNumber', () => {
  it('takes the lowest free number', () => {
    expect(nextChannelNumber([])).toBe(1)
    expect(nextChannelNumber([1, 2, 4])).toBe(3)
  })
})

describe('reconcileInputList', () => {
  it('creates a channel for each mic and DI item with sensible defaults', () => {
    const ops = reconcileInputList(
      [
        mic(),
        mic({ id: 'i2', type: 'di', label: 'Bass DI', micUnitId: null }),
        { id: 'i3', type: 'amp', label: 'Amp', micUnitId: null }
      ],
      [],
      units(unit())
    )
    expect(ops.create).toEqual([
      {
        layoutItemId: 'i1',
        number: 1,
        kind: 'mic',
        source: 'Vocal',
        micUnitId: 'u1',
        phantom: true
      },
      {
        layoutItemId: 'i2',
        number: 2,
        kind: 'di',
        source: 'Bass DI',
        micUnitId: null,
        phantom: false
      }
    ])
    expect(ops.update).toEqual([])
    expect(ops.remove).toEqual([])
  })

  it('names an unlabelled mic after its unit, then a generic name', () => {
    const ops = reconcileInputList(
      [mic({ label: null }), mic({ id: 'i2', label: ' ', micUnitId: null })],
      [],
      units(unit())
    )
    expect(ops.create.map((c) => c.source)).toEqual(['Neumann U 87 Ai', 'Mic'])
  })

  it('is idempotent: reconciling the result again changes nothing', () => {
    const items = [mic()]
    const first = reconcileInputList(items, [], units(unit()))
    const row = channel({
      number: first.create[0].number,
      phantom: first.create[0].phantom
    })
    expect(reconcileInputList(items, [row], units(unit()))).toEqual({
      create: [],
      update: [],
      remove: []
    })
  })

  it('never renumbers existing channels and reuses a gap for a new one', () => {
    const ops = reconcileInputList(
      [mic(), mic({ id: 'i2', micUnitId: null })],
      [
        channel({ number: 1 }),
        channel({ id: 'c3', number: 3, layoutItemId: 'gone' })
      ],
      units(unit())
    )
    expect(ops.remove).toEqual(['c3'])
    // 3 was freed by the removal in the same pass? No: it was in use when the
    // pass began, so the new channel takes the lowest free number, 2.
    expect(ops.create[0].number).toBe(2)
  })

  it('removes channels whose item is gone and leaves manual channels alone', () => {
    const ops = reconcileInputList(
      [],
      [
        channel({ id: 'c1', layoutItemId: 'deleted' }),
        channel({
          id: 'c2',
          layoutItemId: null,
          kind: 'line',
          source: 'Synth',
          number: 2
        })
      ],
      units()
    )
    expect(ops.remove).toEqual(['c1'])
    expect(ops.update).toEqual([])
  })

  it('treats a linked item that stopped being a mic as gone', () => {
    const ops = reconcileInputList(
      [{ id: 'i1', type: 'amp', label: 'Amp', micUnitId: null }],
      [channel()],
      units(unit())
    )
    expect(ops.remove).toEqual(['c1'])
  })

  it('mirrors a changed source but keeps the channel-owned fields', () => {
    const ops = reconcileInputList(
      [mic({ label: 'Lead vocal' })],
      [channel({ phantom: false, stand: 'Boom', dawName: 'LV' })],
      units(unit())
    )
    expect(ops.update).toEqual([
      { id: 'c1', kind: 'mic', source: 'Lead vocal', micUnitId: 'u1' }
    ])
    expect(ops.update[0]).not.toHaveProperty('phantom')
  })

  it('resets phantom to the new unit default when the unit changes', () => {
    const ribbon = unit({
      unitId: 'u2',
      name: 'Royer R-121',
      transducerType: 'ribbon',
      powering: 'none'
    })
    const ops = reconcileInputList(
      [mic({ micUnitId: 'u2' })],
      [channel({ phantom: true })],
      units(unit(), ribbon)
    )
    expect(ops.update).toEqual([
      {
        id: 'c1',
        kind: 'mic',
        source: 'Vocal',
        micUnitId: 'u2',
        phantom: false
      }
    ])
  })

  it('numbers new channels in item order after existing ones', () => {
    const ops = reconcileInputList(
      [mic({ id: 'a' }), mic({ id: 'b' }), mic({ id: 'c' })],
      [channel({ number: 5, layoutItemId: 'a' })],
      units(unit())
    )
    expect(ops.create.map((c) => [c.layoutItemId, c.number])).toEqual([
      ['b', 1],
      ['c', 2]
    ])
  })
})
