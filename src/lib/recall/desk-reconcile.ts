import { formatValue } from './desk-geometry'
import { findComponent, isValueKind } from './desk-layout'

import type { DeskArea, DeskDefaults, DeskLayout } from './desk-types'
import type { RecallValue, RecallValues } from './types'

// Fits saved values to a changed layout (ADR 0023). Values whose control is
// still there are kept; values whose control was removed, changed kind or lost
// the chosen option are dropped; numbers now outside a narrowed range are
// clamped. The editor shows the lists before saving and the server runs the
// same function, so stored values never point at nothing.

export interface ReconcileNote {
  area: DeskArea
  id: string
  label: string
  before: string
  after?: string
}

export interface ReconcileResult {
  values: DeskDefaults
  lost: ReconcileNote[]
  clamped: ReconcileNote[]
}

type Fit =
  | { kind: 'keep'; value: RecallValue }
  | { kind: 'clamp'; value: number }
  | { kind: 'lose' }

function fit(
  layout: DeskLayout,
  area: DeskArea,
  id: string,
  value: RecallValue
): Fit {
  const c = findComponent(layout, area, id)
  if (!c || !isValueKind(c.kind)) return { kind: 'lose' }
  switch (c.kind) {
    case 'knob':
    case 'fader': {
      if (typeof value !== 'number') return { kind: 'lose' }
      if (c.min !== undefined && value < c.min)
        return { kind: 'clamp', value: c.min }
      if (c.max !== undefined && value > c.max)
        return { kind: 'clamp', value: c.max }
      return { kind: 'keep', value }
    }
    case 'switch':
      return typeof value === 'boolean'
        ? { kind: 'keep', value }
        : { kind: 'lose' }
    case 'selector': {
      const options = c.options ?? []
      const chosen = Array.isArray(value)
        ? value
        : typeof value === 'string'
          ? [value]
          : null
      if (!chosen) return { kind: 'lose' }
      if (c.multi) {
        if (!chosen.every((v) => options.includes(v))) return { kind: 'lose' }
        return {
          kind: 'keep',
          value: options.filter((o) => chosen.includes(o))
        }
      }
      return chosen.length === 1 && options.includes(chosen[0])
        ? { kind: 'keep', value: chosen[0] }
        : { kind: 'lose' }
    }
    case 'text':
      return typeof value === 'string'
        ? { kind: 'keep', value }
        : { kind: 'lose' }
  }
}

function reconcileArea(
  previous: DeskLayout | null,
  next: DeskLayout,
  area: DeskArea,
  values: RecallValues,
  result: ReconcileResult
) {
  for (const [id, value] of Object.entries(values)) {
    const before = previous ? findComponent(previous, area, id) : undefined
    const now = findComponent(next, area, id)
    const describe = before ?? now
    const label = describe?.label ?? id
    const text = describe ? formatValue(describe, value) : String(value)
    const outcome = fit(next, area, id, value)
    if (outcome.kind === 'lose') {
      result.lost.push({ area, id, label, before: text })
    } else if (outcome.kind === 'clamp') {
      result.values[area][id] = outcome.value
      result.clamped.push({
        area,
        id,
        label,
        before: text,
        after: formatValue(now!, outcome.value)
      })
    } else {
      result.values[area][id] = outcome.value
    }
  }
}

export function reconcileValues(
  previous: DeskLayout | null,
  next: DeskLayout,
  values: DeskDefaults
): ReconcileResult {
  const result: ReconcileResult = {
    values: { strip: {}, master: {} },
    lost: [],
    clamped: []
  }
  reconcileArea(previous, next, 'strip', values.strip, result)
  reconcileArea(previous, next, 'master', values.master, result)
  return result
}
