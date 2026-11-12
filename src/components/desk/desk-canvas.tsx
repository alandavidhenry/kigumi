'use client'

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react'
import { Group, Layer, Rect, Stage, Text, Transformer } from 'react-konva'

import { componentSize, snap } from '@/lib/recall/desk-geometry'
import { collidesAt, isValueKind } from '@/lib/recall/desk-layout'
import { DESK_GRID_MM, RESIZABLE } from '@/lib/recall/desk-types'
import type {
  DeskArea,
  DeskAreaLayout,
  DeskComponent,
  DeskLayout
} from '@/lib/recall/desk-types'
import type { RecallValue, RecallValues } from '@/lib/recall/types'

import { ComponentVisual, DeskShape } from './desk-shapes'

import type { DeskColors } from './desk-colors'
import type { DeskSelection, ShapeMode } from './desk-shapes'
import type Konva from 'konva'

// The Konva half of the desk editor (ADR 0023). Everything is drawn in
// millimetres; the Stage carries the scale. To stay quick on a 48-channel desk:
//  - strips outside the viewport are not rendered at all;
//  - panels, labels and ghost strips sit on a layer that never listens;
//  - each strip is memoised on its own values, and a value drag re-renders
//    only the control being dragged.

export const SCRIBBLE_MM = 12
const MIN_SCALE = 0.4
const MAX_SCALE = 12
// Readable text without zooming: start at least this many px per mm.
const START_SCALE = 2.4

export interface DeskCanvasHandle {
  fit: () => void
  zoomBy: (factor: number) => void
}

export interface DeskCanvasProps {
  readonly layout: DeskLayout
  readonly mode: 'layout' | 'values'
  // Strips drawn. In a template only strip 1 is live; the rest are ghosts.
  readonly channels: number
  readonly liveStrips: 'first' | 'all'
  readonly stripValues: (strip: number) => RecallValues
  readonly masterValues: RecallValues
  readonly channelLabel?: (strip: number) => string | null
  readonly selection: DeskSelection | null
  readonly selectedChannel: number | null
  readonly showValues: boolean
  readonly canEdit: boolean
  readonly colors: DeskColors
  readonly onSelect: (selection: DeskSelection | null) => void
  readonly onSelectChannel?: (strip: number) => void
  readonly onValue?: (
    selection: DeskSelection,
    value: RecallValue | undefined
  ) => void
  readonly onMove?: (area: DeskArea, id: string, x: number, y: number) => void
  readonly onResize?: (
    area: DeskArea,
    id: string,
    box: { x: number; y: number; w?: number; h?: number }
  ) => void
  readonly onDropNew?: (
    kind: string,
    area: DeskArea,
    at: { x: number; y: number }
  ) => void
}

interface AreaProps {
  readonly area: DeskArea
  readonly layout: DeskAreaLayout
  readonly heightMm: number
  readonly channel: number | null
  readonly values: RecallValues
  readonly mode: ShapeMode
  readonly decorMode: ShapeMode
  readonly part: 'decor' | 'controls' | 'all'
  readonly selectedId: string | null
  readonly showValues: boolean
  readonly canEdit: boolean
  readonly colors: DeskColors
  readonly onSelect?: (selection: DeskSelection) => void
  readonly onValue?: DeskCanvasProps['onValue']
  readonly onMove?: DeskCanvasProps['onMove']
  readonly register?: (key: string, node: Konva.Group | null) => void
}

// One area's components (a strip or the master area), or just its decor or
// just its controls when they are split across the two layers.
const AreaView = memo(function AreaView({
  area,
  layout,
  heightMm,
  channel,
  values,
  mode,
  decorMode,
  part,
  selectedId,
  showValues,
  canEdit,
  colors,
  onSelect,
  onValue,
  onMove,
  register
}: AreaProps) {
  const bounds = useMemo(
    () => ({ w: layout.widthMm, h: heightMm }),
    [layout.widthMm, heightMm]
  )
  // Panels first, then labels, then controls, so controls sit on top.
  const ordered = useMemo(() => {
    const rank = (c: DeskComponent) =>
      c.kind === 'panel' ? 0 : c.kind === 'label' ? 1 : 2
    return [...layout.components].sort((a, b) => rank(a) - rank(b))
  }, [layout.components])

  return (
    <>
      {ordered.map((c) => {
        const decor = !isValueKind(c.kind)
        if (part === 'decor' && !decor) return null
        if (part === 'controls' && decor) return null
        const shapeMode = decor ? decorMode : mode
        if (shapeMode === 'static') {
          return (
            <Group key={c.id} x={c.x} y={c.y} listening={false}>
              <ComponentVisual
                c={c}
                value={values[c.id]}
                colors={colors}
                showValue={showValues && !decor}
              />
            </Group>
          )
        }
        return (
          <DeskShape
            key={c.id}
            component={c}
            area={area}
            channel={channel}
            value={values[c.id]}
            colors={colors}
            selected={selectedId === c.id}
            mode={shapeMode}
            showValue={showValues && !decor}
            canEdit={canEdit}
            bounds={bounds}
            siblings={layout.components}
            onSelect={onSelect}
            onValue={onValue}
            onMove={onMove}
            register={register}
          />
        )
      })}
    </>
  )
})

const EMPTY: RecallValues = {}

export const DeskCanvas = forwardRef<DeskCanvasHandle, DeskCanvasProps>(
  function DeskCanvas(
    {
      layout,
      mode,
      channels,
      liveStrips,
      stripValues,
      masterValues,
      channelLabel,
      selection,
      selectedChannel,
      showValues,
      canEdit,
      colors,
      onSelect,
      onSelectChannel,
      onValue,
      onMove,
      onResize,
      onDropNew
    },
    ref
  ) {
    const wrapRef = useRef<HTMLDivElement>(null)
    const stageRef = useRef<Konva.Stage>(null)
    const trRef = useRef<Konva.Transformer>(null)
    const nodes = useRef(new Map<string, Konva.Group>())
    const [size, setSize] = useState({ width: 0, height: 0 })
    const [view, setView] = useState<{
      scale: number
      x: number
      y: number
    } | null>(null)

    const stripW = layout.strip.widthMm
    const masterX = channels * stripW
    const deskW = masterX + layout.master.widthMm
    const deskH = SCRIBBLE_MM + layout.heightMm

    const fitView = useCallback(
      (all: boolean) => {
        if (!size.width || !size.height) return null
        const pad = 16
        const fitAll = Math.min(
          (size.width - pad * 2) / deskW,
          (size.height - pad * 2) / deskH
        )
        const scale = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, all ? fitAll : Math.max(fitAll, START_SCALE))
        )
        return {
          scale,
          x: Math.max(pad, (size.width - deskW * scale) / 2),
          y: pad
        }
      },
      [size, deskW, deskH]
    )

    useEffect(() => {
      const el = wrapRef.current
      if (!el) return
      const observer = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) setSize({ width, height })
      })
      observer.observe(el)
      return () => observer.disconnect()
    }, [])

    // First fit once the viewport is known; afterwards the view is the user's.
    useEffect(() => {
      if (!view && size.width) setView(fitView(false))
    }, [view, size.width, fitView])

    const zoomAt = useCallback((px: number, py: number, factor: number) => {
      setView((v) => {
        if (!v) return v
        const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor))
        const k = scale / v.scale
        return { scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k }
      })
    }, [])

    useImperativeHandle(
      ref,
      () => ({
        fit: () => setView(fitView(true)),
        zoomBy: (factor: number) =>
          zoomAt(size.width / 2, size.height / 2, factor)
      }),
      [fitView, zoomAt, size]
    )

    // Attach the transformer to a selected component that can be resized.
    const selectedComponent =
      selection && mode === 'layout'
        ? layout[selection.area].components.find((c) => c.id === selection.id)
        : undefined
    const resizable = selectedComponent
      ? RESIZABLE[selectedComponent.kind]
      : undefined
    useEffect(() => {
      const tr = trRef.current
      if (!tr) return
      const node =
        selection && resizable && canEdit
          ? nodes.current.get(`${selection.area}:${selection.id}`)
          : null
      tr.nodes(node ? [node] : [])
      tr.getLayer()?.batchDraw()
    }, [selection, resizable, canEdit, layout])

    const register = useCallback((key: string, node: Konva.Group | null) => {
      if (node) nodes.current.set(key, node)
      else nodes.current.delete(key)
    }, [])

    const selectFromShape = useCallback(
      (s: DeskSelection) => onSelect(s),
      [onSelect]
    )

    if (!view) {
      return (
        <div
          ref={wrapRef}
          className='h-[min(72vh,760px)] min-h-[360px] w-full rounded-md border bg-muted/40'
        />
      )
    }

    const { scale } = view
    // Strips inside the viewport (plus one either side).
    const visibleFrom = Math.max(1, Math.floor(-view.x / scale / stripW))
    const visibleTo = Math.min(
      channels,
      Math.ceil((size.width - view.x) / scale / stripW) + 1
    )
    const masterVisible =
      layout.master.widthMm > 0 &&
      (size.width - view.x) / scale >= masterX &&
      -view.x / scale <= deskW

    const strips: number[] = []
    for (let n = visibleFrom; n <= visibleTo; n += 1) strips.push(n)

    const live = (n: number) => liveStrips === 'all' || n === 1
    const decorMode: ShapeMode =
      mode === 'layout' && canEdit ? 'layout' : 'static'
    const controlMode: ShapeMode = mode

    const toDesk = (clientX: number, clientY: number) => {
      const rect = wrapRef.current?.getBoundingClientRect()
      if (!rect) return null
      return {
        x: (clientX - rect.left - view.x) / scale,
        y: (clientY - rect.top - view.y) / scale - SCRIBBLE_MM
      }
    }

    const scribble = (n: number) => {
      const label = channelLabel?.(n) ?? null
      const active = selectedChannel === n
      return (
        <Group
          key={`s${n}`}
          x={(n - 1) * stripW}
          listening={Boolean(onSelectChannel)}
          onPointerDown={(event) => {
            event.cancelBubble = true
            onSelectChannel?.(n)
          }}
          onMouseDown={(event) => {
            event.cancelBubble = true
          }}
          onTouchStart={(event) => {
            event.cancelBubble = true
          }}
        >
          <Rect
            x={1}
            y={1}
            width={stripW - 2}
            height={SCRIBBLE_MM - 2}
            cornerRadius={1.5}
            fill={active ? colors.brand : colors.card}
            stroke={active ? colors.brand : colors.border}
            strokeWidth={0.4}
            perfectDrawEnabled={false}
          />
          <Text
            x={1}
            y={2}
            width={stripW - 2}
            align='center'
            text={String(n)}
            fontSize={3.4}
            fontStyle='bold'
            fontFamily={colors.font}
            fill={active ? colors.card : colors.foreground}
            listening={false}
            perfectDrawEnabled={false}
          />
          {label && (
            <Text
              x={1.5}
              y={6.2}
              width={stripW - 3}
              align='center'
              text={label}
              fontSize={2.8}
              fontFamily={colors.font}
              fill={active ? colors.card : colors.muted}
              wrap='none'
              ellipsis
              listening={false}
              perfectDrawEnabled={false}
            />
          )}
        </Group>
      )
    }

    return (
      <div
        ref={wrapRef}
        data-testid='desk-canvas'
        // The view transform, so a browser test can aim at a control.
        data-view={`${view.scale},${view.x},${view.y}`}
        className='relative h-[min(72vh,760px)] min-h-[360px] w-full touch-none overflow-hidden rounded-md border bg-muted/40'
        onDragOver={(event) => {
          if (onDropNew) event.preventDefault()
        }}
        onDrop={(event) => {
          event.preventDefault()
          const kind = event.dataTransfer.getData('application/x-kigumi-desk')
          const at = toDesk(event.clientX, event.clientY)
          if (!kind || !at || !onDropNew) return
          if (at.x >= masterX && layout.master.widthMm > 0) {
            onDropNew(kind, 'master', { x: at.x - masterX, y: at.y })
          } else {
            // Anywhere over the strips designs the one strip.
            const local = ((at.x % stripW) + stripW) % stripW
            onDropNew(kind, 'strip', { x: local, y: at.y })
          }
        }}
      >
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          scaleX={scale}
          scaleY={scale}
          x={view.x}
          y={view.y}
          draggable
          onDragEnd={(event) => {
            if (event.target === stageRef.current) {
              setView((v) =>
                v ? { ...v, x: event.target.x(), y: event.target.y() } : v
              )
            }
          }}
          onWheel={(event) => {
            event.evt.preventDefault()
            const e = event.evt
            if (e.ctrlKey || e.metaKey) {
              const pos = stageRef.current?.getPointerPosition()
              if (pos) zoomAt(pos.x, pos.y, e.deltaY < 0 ? 1.1 : 1 / 1.1)
              return
            }
            // Wheel pans (Shift for sideways); Ctrl/Cmd or a pinch zooms.
            const dx = e.shiftKey ? e.deltaY : e.deltaX
            const dy = e.shiftKey ? 0 : e.deltaY
            setView((v) => (v ? { ...v, x: v.x - dx, y: v.y - dy } : v))
          }}
          onMouseDown={(event) => {
            if (event.target === stageRef.current) onSelect(null)
          }}
          onTouchStart={(event) => {
            if (event.target === stageRef.current) onSelect(null)
          }}
        >
          {/* Desk surface, strips, decor and ghosts: never listens. */}
          <Layer listening={false}>
            <Rect
              x={-3}
              y={-3}
              width={deskW + 6}
              height={deskH + 6}
              cornerRadius={4}
              fill={colors.surface}
              stroke={colors.borderStrong}
              strokeWidth={0.6}
              perfectDrawEnabled={false}
            />
            {strips.map((n) => (
              <Group key={n} x={(n - 1) * stripW} y={SCRIBBLE_MM}>
                <Rect
                  x={0.4}
                  width={stripW - 0.8}
                  height={layout.heightMm}
                  fill={colors.strip}
                  cornerRadius={1}
                  perfectDrawEnabled={false}
                />
                {!(live(n) && decorMode === 'layout') && (
                  <Group opacity={live(n) ? 1 : 0.45}>
                    <AreaView
                      area='strip'
                      layout={layout.strip}
                      heightMm={layout.heightMm}
                      channel={n}
                      values={stripValues(n)}
                      mode='static'
                      decorMode='static'
                      part={live(n) ? 'decor' : 'all'}
                      selectedId={null}
                      showValues={showValues}
                      canEdit={false}
                      colors={colors}
                    />
                  </Group>
                )}
              </Group>
            ))}
            {layout.master.widthMm > 0 && (
              <Group x={masterX} y={SCRIBBLE_MM}>
                <Rect
                  x={0.4}
                  width={layout.master.widthMm - 0.8}
                  height={layout.heightMm}
                  fill={colors.strip}
                  cornerRadius={1}
                  perfectDrawEnabled={false}
                />
                {masterVisible && decorMode !== 'layout' && (
                  <AreaView
                    area='master'
                    layout={layout.master}
                    heightMm={layout.heightMm}
                    channel={null}
                    values={masterValues}
                    mode='static'
                    decorMode='static'
                    part='decor'
                    selectedId={null}
                    showValues={showValues}
                    canEdit={false}
                    colors={colors}
                  />
                )}
                <Text
                  y={-SCRIBBLE_MM + 3}
                  width={layout.master.widthMm}
                  align='center'
                  text='MASTER'
                  fontSize={3.4}
                  fontStyle='bold'
                  letterSpacing={0.4}
                  fontFamily={colors.font}
                  fill={colors.muted}
                  perfectDrawEnabled={false}
                />
              </Group>
            )}
          </Layer>

          {/* Scribble strips and live controls. */}
          <Layer>
            {strips.map((n) => scribble(n))}
            {strips.filter(live).map((n) => (
              <Group key={n} x={(n - 1) * stripW} y={SCRIBBLE_MM}>
                {decorMode === 'layout' && (
                  <AreaView
                    area='strip'
                    layout={layout.strip}
                    heightMm={layout.heightMm}
                    channel={n}
                    values={EMPTY}
                    mode={controlMode}
                    decorMode={decorMode}
                    part='decor'
                    selectedId={
                      selection?.area === 'strip' ? selection.id : null
                    }
                    showValues={false}
                    canEdit={canEdit}
                    colors={colors}
                    onSelect={selectFromShape}
                    onMove={onMove}
                    register={register}
                  />
                )}
                <AreaView
                  area='strip'
                  layout={layout.strip}
                  heightMm={layout.heightMm}
                  channel={n}
                  values={stripValues(n)}
                  mode={controlMode}
                  decorMode={decorMode}
                  part='controls'
                  selectedId={
                    selection?.area === 'strip' &&
                    (selection.channel === n || mode === 'layout')
                      ? selection.id
                      : null
                  }
                  showValues={showValues}
                  canEdit={canEdit}
                  colors={colors}
                  onSelect={selectFromShape}
                  onValue={onValue}
                  onMove={onMove}
                  register={n === 1 ? register : undefined}
                />
              </Group>
            ))}
            {masterVisible && (
              <Group x={masterX} y={SCRIBBLE_MM}>
                {decorMode === 'layout' && (
                  <AreaView
                    area='master'
                    layout={layout.master}
                    heightMm={layout.heightMm}
                    channel={null}
                    values={EMPTY}
                    mode={controlMode}
                    decorMode={decorMode}
                    part='decor'
                    selectedId={
                      selection?.area === 'master' ? selection.id : null
                    }
                    showValues={false}
                    canEdit={canEdit}
                    colors={colors}
                    onSelect={selectFromShape}
                    onMove={onMove}
                    register={register}
                  />
                )}
                <AreaView
                  area='master'
                  layout={layout.master}
                  heightMm={layout.heightMm}
                  channel={null}
                  values={masterValues}
                  mode={controlMode}
                  decorMode={decorMode}
                  part='controls'
                  selectedId={
                    selection?.area === 'master' ? selection.id : null
                  }
                  showValues={showValues}
                  canEdit={canEdit}
                  colors={colors}
                  onSelect={selectFromShape}
                  onValue={onValue}
                  onMove={onMove}
                  register={register}
                />
              </Group>
            )}

            {canEdit && mode === 'layout' && (
              <Transformer
                ref={trRef}
                rotateEnabled={false}
                keepRatio={false}
                ignoreStroke
                flipEnabled={false}
                anchorSize={8}
                borderStroke={colors.brand}
                anchorStroke={colors.brand}
                enabledAnchors={
                  resizable?.w && resizable?.h
                    ? [
                        'top-left',
                        'top-right',
                        'bottom-left',
                        'bottom-right',
                        'middle-left',
                        'middle-right',
                        'top-center',
                        'bottom-center'
                      ]
                    : resizable?.h
                      ? ['top-center', 'bottom-center']
                      : ['middle-left', 'middle-right']
                }
                boundBoxFunc={(oldBox, newBox) => {
                  if (
                    Math.abs(newBox.width) < 5 * scale ||
                    Math.abs(newBox.height) < 5 * scale
                  ) {
                    return oldBox
                  }
                  // Refuse a size that would overlap a neighbour. The box is
                  // in screen pixels; the area's origin is the node's parent.
                  const node = trRef.current?.nodes()[0]
                  const parent = node?.getParent()
                  if (!node || !parent || !selectedComponent || !selection) {
                    return newBox
                  }
                  const origin = parent.getAbsolutePosition()
                  const test = {
                    ...selectedComponent,
                    w: newBox.width / scale,
                    h: newBox.height / scale
                  }
                  return collidesAt(
                    layout[selection.area].components,
                    test,
                    (newBox.x - origin.x) / scale,
                    (newBox.y - origin.y) / scale
                  )
                    ? oldBox
                    : newBox
                }}
                onTransformEnd={() => {
                  const node = trRef.current?.nodes()[0]
                  if (!node || !selection || !selectedComponent) return
                  const { w, h } = componentSize(selectedComponent)
                  const sx = node.scaleX()
                  const sy = node.scaleY()
                  node.scaleX(1)
                  node.scaleY(1)
                  const box = {
                    x: Math.max(0, snap(node.x(), DESK_GRID_MM)),
                    y: Math.max(0, snap(node.y(), DESK_GRID_MM)),
                    ...(resizable?.w && {
                      w: Math.max(5, snap(w * sx, DESK_GRID_MM))
                    }),
                    ...(resizable?.h && {
                      h: Math.max(5, snap(h * sy, DESK_GRID_MM))
                    })
                  }
                  // Snapping can round into a neighbour: put it back instead.
                  if (
                    collidesAt(
                      layout[selection.area].components,
                      { ...selectedComponent, ...box },
                      box.x,
                      box.y
                    )
                  ) {
                    node.x(selectedComponent.x)
                    node.y(selectedComponent.y)
                    node.getLayer()?.batchDraw()
                    trRef.current?.forceUpdate()
                    return
                  }
                  onResize?.(selection.area, selection.id, box)
                }}
              />
            )}
          </Layer>
        </Stage>
      </div>
    )
  }
)
