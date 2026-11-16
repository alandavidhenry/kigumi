import { KIND_SIZE } from './desk-types'

import type { DeskComponent } from './desk-types'
import type { RecallValue } from './types'

// Pure maths for the visual desk (ADR 0023): sizes, snapping, the value a drag
// produces, and the text a value reads as. Shared by the canvas, the inspector
// and the tests.

// Vertical pointer travel (px) that sweeps a control's whole range.
export const DRAG_RANGE_PX = 200
export const FINE_FACTOR = 0.1
// Knob pointer sweep, clockwise from straight up.
export const KNOB_START_DEG = -135
export const KNOB_SWEEP_DEG = 270

const SELECTOR_BUTTON_MM = { w: 10, h: 6, gap: 1 }

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function snap(value: number, grid: number) {
  return grid > 0 ? Math.round(value / grid) * grid : value
}

export function componentSize(c: DeskComponent): { w: number; h: number } {
  const base = KIND_SIZE[c.kind]
  if (c.kind === 'selector') {
    const count = Math.max(1, c.options?.length ?? 1)
    const pitch = SELECTOR_BUTTON_MM.w + SELECTOR_BUTTON_MM.gap
    const w = c.w ?? Math.min(count, 3) * pitch + 4
    const perRow = Math.max(
      1,
      Math.floor((w - 4 + SELECTOR_BUTTON_MM.gap) / pitch)
    )
    const rows = Math.ceil(count / perRow)
    // Buttons, then room for the label underneath.
    return {
      w,
      h: c.h ?? rows * (SELECTOR_BUTTON_MM.h + SELECTOR_BUTTON_MM.gap) + 8
    }
  }
  return { w: c.w ?? base.w, h: c.h ?? base.h }
}

// Where each selector button sits inside the component, in its own mm.
export function selectorButtons(c: DeskComponent) {
  const { w } = componentSize(c)
  const options = c.options ?? []
  const pitch = SELECTOR_BUTTON_MM.w + SELECTOR_BUTTON_MM.gap
  const perRow = Math.max(
    1,
    Math.floor((w - 4 + SELECTOR_BUTTON_MM.gap) / pitch)
  )
  return options.map((option, i) => ({
    option,
    x: 2 + (i % perRow) * pitch,
    y:
      2 +
      Math.floor(i / perRow) * (SELECTOR_BUTTON_MM.h + SELECTOR_BUTTON_MM.gap),
    w: SELECTOR_BUTTON_MM.w,
    h: SELECTOR_BUTTON_MM.h
  }))
}

// The range a drag sweeps. A control with no stated range still needs one to
// drag through; typing a value is not limited by this fallback.
export function dragRange(c: DeskComponent): { min: number; max: number } {
  if (c.min !== undefined && c.max !== undefined && c.max > c.min) {
    return { min: c.min, max: c.max }
  }
  if (c.min !== undefined) return { min: c.min, max: c.min + 10 }
  if (c.max !== undefined) return { min: c.max - 10, max: c.max }
  return { min: 0, max: 10 }
}

const isLog = (c: DeskComponent, min: number) => c.taper === 'log' && min > 0

export function toNorm(c: DeskComponent, value: number): number {
  const { min, max } = dragRange(c)
  if (isLog(c, min)) {
    return clamp(Math.log(value / min) / Math.log(max / min), 0, 1)
  }
  return clamp((value - min) / (max - min), 0, 1)
}

// The step a value snaps to when dragged: the stated step, else about 1/100 of
// the range (two significant figures on a log taper).
export function autoStep(c: DeskComponent): number {
  if (c.step && c.step > 0) return c.step
  const { min, max } = dragRange(c)
  return 10 ** Math.floor(Math.log10((max - min) / 100))
}

function roundTo(value: number, step: number) {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1)
  return Number((Math.round(value / step) * step).toFixed(decimals))
}

function roundSignificant(value: number, figures: number) {
  if (value === 0) return 0
  const magnitude =
    10 ** (Math.floor(Math.log10(Math.abs(value))) - figures + 1)
  return Number((Math.round(value / magnitude) * magnitude).toPrecision(15))
}

export function fromNorm(c: DeskComponent, norm: number): number {
  const { min, max } = dragRange(c)
  const n = clamp(norm, 0, 1)
  if (isLog(c, min)) {
    const raw = min * (max / min) ** n
    return clamp(
      c.step ? roundTo(raw, c.step) : roundSignificant(raw, 2),
      min,
      max
    )
  }
  return clamp(roundTo(min + n * (max - min), autoStep(c)), min, max)
}

// Where a drag starts from when nothing is recorded yet: the centre detent if
// there is one, else the bottom of the range.
export function restNorm(c: DeskComponent): number {
  return c.centre !== undefined ? toNorm(c, c.centre) : 0
}

// The value a vertical drag of `dyPx` (up is positive) gives, from `start`.
export function dragValue(
  c: DeskComponent,
  start: number | undefined,
  dyPx: number,
  fine: boolean
): number {
  const from = start === undefined ? restNorm(c) : toNorm(c, start)
  return fromNorm(c, from + (dyPx / DRAG_RANGE_PX) * (fine ? FINE_FACTOR : 1))
}

// One keyboard step up (+1) or down (-1).
export function stepValue(
  c: DeskComponent,
  start: number | undefined,
  direction: 1 | -1
): number {
  if (start === undefined) return fromNorm(c, restNorm(c))
  if (c.taper === 'log' && !c.step) {
    return fromNorm(c, toNorm(c, start) + direction * 0.01)
  }
  const { min, max } = dragRange(c)
  return clamp(roundTo(start + direction * autoStep(c), autoStep(c)), min, max)
}

export function knobAngle(norm: number): number {
  return KNOB_START_DEG + KNOB_SWEEP_DEG * clamp(norm, 0, 1)
}

// Pan is any control whose unit is "L/R": -30 reads L30, 0 reads C.
export const isPan = (c: { unit?: string }) => c.unit?.toUpperCase() === 'L/R'

function trimNumber(value: number) {
  return Number(value.toFixed(3)).toString()
}

export function formatValue(
  c: Pick<DeskComponent, 'unit' | 'min'>,
  value: RecallValue
): string {
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'none'
  if (typeof value === 'boolean') return value ? 'on' : 'off'
  if (typeof value === 'number') {
    if (isPan(c)) {
      if (value === 0) return 'C'
      return `${value < 0 ? 'L' : 'R'}${trimNumber(Math.abs(value))}`
    }
    if (c.unit === 'Hz' && Math.abs(value) >= 1000) {
      return `${trimNumber(value / 1000)} kHz`
    }
    const text =
      // A bipolar control (EQ gain, fader) reads +3 dB; a gain of 32 reads 32.
      c.min !== undefined && c.min < 0 && value > 0
        ? `+${trimNumber(value)}`
        : trimNumber(value)
    return c.unit ? `${text} ${c.unit}` : text
  }
  return value
}

export type ParsedValue =
  { ok: true; value: RecallValue | undefined } | { ok: false; error: string }

const ON = new Set(['on', 'true', 'yes', '1', 'in'])
const OFF = new Set(['off', 'false', 'no', '0', 'out'])

// Reads what someone typed into the inspector. An empty box clears the value
// ("not recorded"); anything outside the stated range is refused, not clamped,
// so a typo never becomes a recorded value.
export function parseTypedValue(c: DeskComponent, text: string): ParsedValue {
  const raw = text.trim()
  if (raw === '') return { ok: true, value: undefined }
  switch (c.kind) {
    case 'knob':
    case 'fader': {
      let value: number
      const pan = /^([lrc])\s*(\d+(?:\.\d+)?)?$/i.exec(raw)
      if (isPan(c) && pan) {
        const side = pan[1].toLowerCase()
        const amount = Number(pan[2] ?? 0)
        value = side === 'c' ? 0 : side === 'l' ? -amount : amount
      } else {
        let cleaned = raw.replace(/\s+/g, '').replace(/^\+/, '')
        let factor = 1
        if (/khz$/i.test(cleaned)) {
          factor = 1000
          cleaned = cleaned.replace(/khz$/i, '')
        } else if (/k$/i.test(cleaned)) {
          factor = 1000
          cleaned = cleaned.replace(/k$/i, '')
        }
        if (c.unit) {
          cleaned = cleaned.replace(
            new RegExp(`${c.unit.replace(/[^a-z0-9]/gi, '')}$`, 'i'),
            ''
          )
        }
        if (/^-?inf/i.test(cleaned) || cleaned === '-∞') {
          value = c.min ?? Number.NaN
        } else {
          value = Number(cleaned) * factor
        }
      }
      if (!Number.isFinite(value)) {
        return { ok: false, error: `${c.label} is a number` }
      }
      if (c.min !== undefined && value < c.min) {
        return { ok: false, error: `${c.label} is at least ${c.min}` }
      }
      if (c.max !== undefined && value > c.max) {
        return { ok: false, error: `${c.label} is at most ${c.max}` }
      }
      return { ok: true, value }
    }
    case 'switch': {
      const word = raw.toLowerCase()
      if (ON.has(word)) return { ok: true, value: true }
      if (OFF.has(word)) return { ok: true, value: false }
      return { ok: false, error: `${c.label} is on or off` }
    }
    case 'selector': {
      const options = c.options ?? []
      const find = (part: string) =>
        options.find((o) => o.toLowerCase() === part.trim().toLowerCase())
      if (c.multi) {
        if (raw.toLowerCase() === 'none') return { ok: true, value: [] }
        const parts = raw.split(',').filter((p) => p.trim() !== '')
        const picked: string[] = []
        for (const part of parts) {
          const option = find(part)
          if (!option) {
            return {
              ok: false,
              error: `${c.label} options are ${options.join(', ')}`
            }
          }
          if (!picked.includes(option)) picked.push(option)
        }
        return { ok: true, value: options.filter((o) => picked.includes(o)) }
      }
      const option = find(raw)
      return option
        ? { ok: true, value: option }
        : { ok: false, error: `${c.label} is one of ${options.join(', ')}` }
    }
    case 'text':
      return raw.length > 60
        ? { ok: false, error: `${c.label} is at most 60 characters` }
        : { ok: true, value: raw }
    default:
      return { ok: false, error: `${c.label} has no value` }
  }
}

// The text that goes back into the inspector box for a value.
export function editableText(c: DeskComponent, value: RecallValue | undefined) {
  if (value === undefined) return ''
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'on' : 'off'
  if (typeof value === 'number') {
    if (isPan(c)) return formatValue(c, value)
    return trimNumber(value)
  }
  return value
}
