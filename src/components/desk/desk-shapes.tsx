'use client'

import { memo, useEffect, useRef, useState } from 'react'
import { Arc, Circle, Group, Line, Rect, Text } from 'react-konva'

import {
  KNOB_START_DEG,
  KNOB_SWEEP_DEG,
  clamp,
  componentSize,
  dragValue,
  formatValue,
  restNorm,
  selectorButtons,
  snap,
  toNorm
} from '@/lib/recall/desk-geometry'
import { collidesAt } from '@/lib/recall/desk-layout'
import { DESK_GRID_MM } from '@/lib/recall/desk-types'
import type { DeskArea, DeskComponent } from '@/lib/recall/desk-types'
import type { RecallValue } from '@/lib/recall/types'

import type { DeskColors } from './desk-colors'
import type Konva from 'konva'

// One component of the desk, drawn in millimetres (the Stage carries the
// scale). Only an invisible hit box listens for the pointer; everything else
// is drawn with listening off, which keeps Konva's hit canvas small on a big
// desk. While a value is dragged only this component re-renders (ADR 0023).

export interface DeskSelection {
  area: DeskArea
  id: string
  // Strip number (1-based) for a channel control; null on the master area.
  channel: number | null
}

export type ShapeMode = 'layout' | 'values' | 'static'

const LABEL_MM = 3.6
const VALUE_MM = 3
const HIT_FILL = 'rgba(0,0,0,0)'

const stop = (event: Konva.KonvaEventObject<Event>) => {
  // Keep a press on a control from also panning the stage.
  event.cancelBubble = true
}

function Caption({
  text,
  y,
  width,
  size,
  fill,
  font,
  bold
}: {
  readonly text: string
  readonly y: number
  readonly width: number
  readonly size: number
  readonly fill: string
  readonly font: string
  readonly bold?: boolean
}) {
  return (
    <Text
      text={text}
      y={y}
      width={width}
      align='center'
      fontSize={size}
      fontFamily={font}
      fontStyle={bold ? 'bold' : 'normal'}
      fill={fill}
      wrap='none'
      ellipsis
      listening={false}
      perfectDrawEnabled={false}
    />
  )
}

// The drawing of a component for a value (undefined = not recorded).
export function ComponentVisual({
  c,
  value,
  colors,
  showValue
}: {
  readonly c: DeskComponent
  readonly value: RecallValue | undefined
  readonly colors: DeskColors
  readonly showValue: boolean
}) {
  const { w, h } = componentSize(c)
  const accent = c.tone ? colors.tones[c.tone] : colors.brand
  const unset = value === undefined
  const valueText =
    showValue && !unset ? formatValue(c, value) : showValue ? '–' : ''

  switch (c.kind) {
    case 'knob': {
      const cx = w / 2
      const cy = 8.5
      const norm = typeof value === 'number' ? toNorm(c, value) : restNorm(c)
      const rest = restNorm(c)
      const angle = KNOB_START_DEG + KNOB_SWEEP_DEG * norm
      const rad = (angle * Math.PI) / 180
      // Canvas angles run clockwise from 3 o'clock; the sweep starts at 7:30.
      const arcStart = 135 + KNOB_SWEEP_DEG * Math.min(rest, norm)
      return (
        <>
          <Arc
            x={cx}
            y={cy}
            innerRadius={7.4}
            outerRadius={8.3}
            angle={KNOB_SWEEP_DEG}
            rotation={135}
            fill={colors.border}
            listening={false}
            perfectDrawEnabled={false}
          />
          {!unset && Math.abs(norm - rest) > 0.001 && (
            <Arc
              x={cx}
              y={cy}
              innerRadius={7.2}
              outerRadius={8.5}
              angle={KNOB_SWEEP_DEG * Math.abs(norm - rest)}
              rotation={arcStart}
              fill={accent}
              listening={false}
              perfectDrawEnabled={false}
            />
          )}
          <Circle
            x={cx}
            y={cy}
            radius={6.2}
            fill={unset ? colors.card : colors.foreground}
            stroke={unset ? colors.borderStrong : colors.foreground}
            strokeWidth={0.5}
            dash={unset ? [1.2, 1] : undefined}
            listening={false}
            perfectDrawEnabled={false}
          />
          <Line
            points={[
              cx + Math.sin(rad) * 1.5,
              cy - Math.cos(rad) * 1.5,
              cx + Math.sin(rad) * 5.6,
              cy - Math.cos(rad) * 5.6
            ]}
            stroke={unset ? colors.borderStrong : colors.card}
            strokeWidth={1}
            lineCap='round'
            listening={false}
            perfectDrawEnabled={false}
          />
          <Caption
            text={c.label}
            y={17.4}
            width={w}
            size={LABEL_MM}
            fill={colors.foreground}
            font={colors.font}
          />
          {valueText && (
            <Caption
              text={valueText}
              y={21.4}
              width={w}
              size={VALUE_MM}
              fill={colors.muted}
              font={colors.font}
            />
          )}
        </>
      )
    }
    case 'fader': {
      const top = 4
      const bottom = h - 11
      const travel = bottom - top
      const norm = typeof value === 'number' ? toNorm(c, value) : restNorm(c)
      const capY = top + (1 - norm) * travel
      const ticks = [0, 0.25, 0.5, 0.75, 1]
      return (
        <>
          <Rect
            x={w / 2 - 0.9}
            y={top}
            width={1.8}
            height={travel}
            cornerRadius={0.9}
            fill={colors.border}
            listening={false}
            perfectDrawEnabled={false}
          />
          {ticks.map((t) => (
            <Line
              key={t}
              points={[
                w / 2 - 6.5,
                top + t * travel,
                w / 2 - 3.5,
                top + t * travel
              ]}
              stroke={colors.borderStrong}
              strokeWidth={0.4}
              listening={false}
              perfectDrawEnabled={false}
            />
          ))}
          <Rect
            x={w / 2 - 6}
            y={capY - 3.5}
            width={12}
            height={7}
            cornerRadius={1.2}
            fill={unset ? colors.card : colors.foreground}
            stroke={unset ? colors.borderStrong : colors.foreground}
            strokeWidth={0.5}
            dash={unset ? [1.2, 1] : undefined}
            listening={false}
            perfectDrawEnabled={false}
          />
          <Line
            points={[w / 2 - 5, capY, w / 2 + 5, capY]}
            stroke={unset ? colors.borderStrong : accent}
            strokeWidth={0.8}
            listening={false}
            perfectDrawEnabled={false}
          />
          <Caption
            text={c.label}
            y={h - 7.6}
            width={w}
            size={LABEL_MM}
            fill={colors.foreground}
            font={colors.font}
          />
          {valueText && (
            <Caption
              text={valueText}
              y={h - 3.4}
              width={w}
              size={VALUE_MM}
              fill={colors.muted}
              font={colors.font}
            />
          )}
        </>
      )
    }
    case 'switch': {
      const on = value === true
      return (
        <>
          <Rect
            x={w / 2 - 5}
            y={1}
            width={10}
            height={7}
            cornerRadius={1.2}
            fill={on ? accent : unset ? colors.card : colors.secondary}
            stroke={on ? accent : colors.borderStrong}
            strokeWidth={0.5}
            dash={unset ? [1.2, 1] : undefined}
            listening={false}
            perfectDrawEnabled={false}
          />
          <Caption
            text={c.label}
            y={9.6}
            width={w}
            size={LABEL_MM}
            fill={colors.foreground}
            font={colors.font}
          />
        </>
      )
    }
    case 'selector': {
      const chosen = Array.isArray(value)
        ? value
        : typeof value === 'string'
          ? [value]
          : []
      const buttons = selectorButtons(c)
      const bottom = buttons.reduce((m, b) => Math.max(m, b.y + b.h), 0)
      return (
        <>
          {buttons.map((b) => {
            const lit = chosen.includes(b.option)
            return (
              <Group key={b.option} listening={false}>
                <Rect
                  x={b.x}
                  y={b.y}
                  width={b.w}
                  height={b.h}
                  cornerRadius={1}
                  fill={lit ? accent : unset ? colors.card : colors.secondary}
                  stroke={lit ? accent : colors.borderStrong}
                  strokeWidth={0.4}
                  dash={unset ? [1.2, 1] : undefined}
                  perfectDrawEnabled={false}
                />
                <Text
                  x={b.x}
                  y={b.y + b.h / 2 - 1.4}
                  width={b.w}
                  align='center'
                  text={b.option}
                  fontSize={2.8}
                  fontFamily={colors.font}
                  fill={lit ? colors.card : colors.foreground}
                  wrap='none'
                  ellipsis
                  perfectDrawEnabled={false}
                />
              </Group>
            )
          })}
          <Caption
            text={c.label}
            y={bottom + 1.4}
            width={w}
            size={LABEL_MM}
            fill={colors.foreground}
            font={colors.font}
          />
        </>
      )
    }
    case 'text': {
      return (
        <>
          <Rect
            x={0.5}
            y={0.5}
            width={w - 1}
            height={7}
            cornerRadius={1}
            fill={colors.card}
            stroke={colors.borderStrong}
            strokeWidth={0.4}
            dash={unset ? [1.2, 1] : undefined}
            listening={false}
            perfectDrawEnabled={false}
          />
          <Caption
            text={typeof value === 'string' ? value : ''}
            y={2.4}
            width={w}
            size={VALUE_MM}
            fill={colors.foreground}
            font={colors.font}
          />
          <Caption
            text={c.label}
            y={9.4}
            width={w}
            size={LABEL_MM}
            fill={colors.foreground}
            font={colors.font}
          />
        </>
      )
    }
    case 'label':
      return (
        <Text
          text={c.label}
          width={w}
          height={h}
          align='center'
          verticalAlign='middle'
          fontSize={4}
          fontStyle='bold'
          fontFamily={colors.font}
          fill={c.tone ? accent : colors.foreground}
          wrap='none'
          ellipsis
          listening={false}
          perfectDrawEnabled={false}
        />
      )
    case 'panel':
      return (
        <>
          <Rect
            width={w}
            height={h}
            cornerRadius={2}
            fill={colors.card}
            opacity={0.55}
            listening={false}
            perfectDrawEnabled={false}
          />
          <Rect
            width={w}
            height={h}
            cornerRadius={2}
            stroke={c.tone ? accent : colors.border}
            strokeWidth={0.5}
            listening={false}
            perfectDrawEnabled={false}
          />
          {c.label && (
            <Text
              x={2}
              y={1.4}
              width={w - 4}
              text={c.label.toUpperCase()}
              fontSize={2.8}
              letterSpacing={0.3}
              fontFamily={colors.font}
              fill={colors.muted}
              wrap='none'
              ellipsis
              listening={false}
              perfectDrawEnabled={false}
            />
          )}
        </>
      )
  }
}

interface ShapeProps {
  readonly component: DeskComponent
  readonly area: DeskArea
  readonly channel: number | null
  readonly value: RecallValue | undefined
  readonly colors: DeskColors
  readonly selected: boolean
  readonly mode: ShapeMode
  readonly showValue: boolean
  readonly canEdit: boolean
  readonly bounds: { w: number; h: number }
  // The area's components, so a drag can refuse to overlap one.
  readonly siblings?: readonly DeskComponent[]
  readonly onSelect?: (selection: DeskSelection) => void
  readonly onValue?: (
    selection: DeskSelection,
    value: RecallValue | undefined
  ) => void
  readonly onMove?: (area: DeskArea, id: string, x: number, y: number) => void
  readonly register?: (key: string, node: Konva.Group | null) => void
}

const DRAG_THRESHOLD_PX = 3

export const DeskShape = memo(function DeskShape({
  component: c,
  area,
  channel,
  value,
  colors,
  selected,
  mode,
  showValue,
  canEdit,
  bounds,
  siblings,
  onSelect,
  onValue,
  onMove,
  register
}: ShapeProps) {
  const { w, h } = componentSize(c)
  // The value while a drag is in progress; committed on release.
  const [live, setLive] = useState<number | null>(null)
  const cleanup = useRef<(() => void) | null>(null)
  const lastValid = useRef({ x: c.x, y: c.y })
  useEffect(() => () => cleanup.current?.(), [])

  const selection: DeskSelection = { area, id: c.id, channel }
  const interactive = mode !== 'static'
  const shown = live ?? value

  const press = (event: Konva.KonvaEventObject<PointerEvent>) => {
    stop(event)
    onSelect?.(selection)
    if (mode !== 'values' || !canEdit || !onValue) return
    const startY = event.evt.clientY
    const start = typeof value === 'number' ? value : undefined
    const group = event.currentTarget as Konva.Group
    const at = group.getRelativePointerPosition()

    if (c.kind === 'switch') {
      onValue(selection, value !== true)
      return
    }
    if (c.kind === 'selector') {
      const hit = selectorButtons(c).find(
        (b) =>
          at &&
          at.x >= b.x &&
          at.x <= b.x + b.w &&
          at.y >= b.y &&
          at.y <= b.y + b.h
      )
      if (!hit) return
      if (c.multi) {
        const current = Array.isArray(value) ? value : []
        const next = current.includes(hit.option)
          ? current.filter((o) => o !== hit.option)
          : [...current, hit.option]
        onValue(
          selection,
          (c.options ?? []).filter((o) => next.includes(o))
        )
      } else {
        onValue(selection, hit.option)
      }
      return
    }
    if (c.kind !== 'knob' && c.kind !== 'fader') return

    let moved = false
    let latest: number | null = null
    const move = (e: PointerEvent) => {
      const dy = startY - e.clientY
      if (!moved && Math.abs(dy) < DRAG_THRESHOLD_PX) return
      moved = true
      latest = dragValue(c, start, dy, e.shiftKey)
      setLive(latest)
    }
    const up = () => {
      cleanup.current?.()
      setLive(null)
      if (moved && latest !== null) onValue(selection, latest)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    cleanup.current = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      cleanup.current = null
    }
  }

  const draggable = mode === 'layout' && canEdit

  return (
    <Group
      ref={(node) => register?.(`${area}:${c.id}`, node)}
      x={c.x}
      y={c.y}
      listening={interactive}
      draggable={draggable}
      onPointerDown={interactive ? press : undefined}
      onMouseDown={interactive && !draggable ? stop : undefined}
      onTouchStart={interactive && !draggable ? stop : undefined}
      onDblClick={() => {
        if (mode === 'values' && canEdit && onValue)
          onValue(selection, undefined)
      }}
      onDblTap={() => {
        if (mode === 'values' && canEdit && onValue)
          onValue(selection, undefined)
      }}
      onDragStart={() => {
        lastValid.current = { x: c.x, y: c.y }
      }}
      onDragMove={(event) => {
        const node = event.target
        const nx = clamp(
          snap(node.x(), DESK_GRID_MM),
          0,
          Math.max(0, bounds.w - w)
        )
        const ny = clamp(
          snap(node.y(), DESK_GRID_MM),
          0,
          Math.max(0, bounds.h - h)
        )
        const last = lastValid.current
        const blocked = (x: number, y: number) =>
          collidesAt(siblings ?? [], c, x, y)
        // Stop at a neighbour, but slide along it when one axis is still free.
        const next = !blocked(nx, ny)
          ? { x: nx, y: ny }
          : !blocked(nx, last.y)
            ? { x: nx, y: last.y }
            : !blocked(last.x, ny)
              ? { x: last.x, y: ny }
              : last
        lastValid.current = next
        node.x(next.x)
        node.y(next.y)
      }}
      onDragEnd={(event) => {
        onMove?.(area, c.id, event.target.x(), event.target.y())
      }}
    >
      <ComponentVisual
        c={c}
        value={shown}
        colors={colors}
        showValue={showValue || live !== null}
      />
      {interactive && (
        <Rect width={w} height={h} fill={HIT_FILL} perfectDrawEnabled={false} />
      )}
      {selected && (
        <Rect
          x={-0.8}
          y={-0.8}
          width={w + 1.6}
          height={h + 1.6}
          cornerRadius={1.5}
          stroke={colors.brand}
          strokeWidth={0.6}
          dash={[2, 1.2]}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
    </Group>
  )
})
