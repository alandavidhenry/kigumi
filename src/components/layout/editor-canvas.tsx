'use client'

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react'
import { Group, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva'

import {
  displaySize,
  fitScale,
  isInsideRoom,
  normaliseRotation,
  snapRotation,
  snapValue
} from '@/lib/layout/geometry'
import { patternOutline } from '@/lib/layout/pattern'
import { itemShape } from '@/lib/layout/shapes'
import type { ShapeTone } from '@/lib/layout/shapes'
import { MIN_ITEM_SIZE_MM } from '@/lib/layout/types'
import type { LayoutItemDoc } from '@/lib/layout/types'

import type Konva from 'konva'

// The Konva half of the layout editor (ADR 0005, ADR 0016). Everything is
// drawn in millimetres: the Stage carries the scale, so positions read and
// write the stored values directly with no screen-space conversion. Loaded only
// on the client.

export interface EditorColors {
  foreground: string
  border: string
  brand: string
  card: string
  secondary: string
  destructive: string
  muted: string
}

export interface CanvasHandle {
  exportPng: () => string | null
  fit: () => void
  zoomBy: (factor: number) => void
}

interface Props {
  readonly items: LayoutItemDoc[]
  readonly widthMm: number
  readonly lengthMm: number
  readonly gridMm: number
  readonly snapMm: number
  readonly selectedId: string | null
  readonly canEdit: boolean
  readonly colors: EditorColors
  readonly onSelect: (id: string | null) => void
  readonly onChange: (id: string, patch: Partial<LayoutItemDoc>) => void
  readonly onDropNew: (type: string, at: { x: number; y: number }) => void
}

function partFill(tone: ShapeTone, colors: EditorColors): string {
  if (tone === 'accent' || tone === 'beam') return colors.brand
  return tone === 'detail' ? colors.card : colors.secondary
}

const ROTATION_SNAPS = Array.from({ length: 24 }, (_, i) => i * 15)

export const EditorCanvas = forwardRef<CanvasHandle, Props>(
  function EditorCanvas(
    {
      items,
      widthMm,
      lengthMm,
      gridMm,
      snapMm,
      selectedId,
      canEdit,
      colors,
      onSelect,
      onChange,
      onDropNew
    },
    ref
  ) {
    const wrapRef = useRef<HTMLDivElement>(null)
    const stageRef = useRef<Konva.Stage>(null)
    const trRef = useRef<Konva.Transformer>(null)
    const nodes = useRef(new Map<string, Konva.Group>())
    const [size, setSize] = useState({ width: 800, height: 520 })
    const [view, setView] = useState({ zoom: 1, x: 0, y: 0 })
    const pinch = useRef<{ dist: number } | null>(null)

    const basePx = useMemo(
      () => fitScale({ widthMm, lengthMm }, size, 24),
      [widthMm, lengthMm, size]
    )
    const scale = basePx * view.zoom

    // Centre the room whenever the base fit changes.
    const centre = useMemo(
      () => ({
        x: (size.width - widthMm * basePx) / 2,
        y: (size.height - lengthMm * basePx) / 2
      }),
      [size, widthMm, lengthMm, basePx]
    )
    useEffect(() => {
      setView({ zoom: 1, x: centre.x, y: centre.y })
    }, [centre.x, centre.y])

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

    // Attach the transformer to the selected node.
    useEffect(() => {
      const tr = trRef.current
      if (!tr) return
      const node = selectedId && canEdit ? nodes.current.get(selectedId) : null
      tr.nodes(node ? [node] : [])
      tr.getLayer()?.batchDraw()
    }, [selectedId, items, canEdit])

    useImperativeHandle(
      ref,
      () => ({
        exportPng: () => {
          const stage = stageRef.current
          const tr = trRef.current
          if (!stage) return null
          tr?.visible(false)
          const url = stage.toDataURL({
            x: view.x,
            y: view.y,
            width: widthMm * scale,
            height: lengthMm * scale,
            pixelRatio: 2
          })
          tr?.visible(true)
          return url
        },
        fit: () => setView({ zoom: 1, x: centre.x, y: centre.y }),
        zoomBy: (factor: number) =>
          setView((v) => {
            const zoom = Math.min(8, Math.max(0.3, v.zoom * factor))
            // Zoom about the middle of the viewport.
            const cx = size.width / 2
            const cy = size.height / 2
            const k = zoom / v.zoom
            return { zoom, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }
          })
      }),
      [view, widthMm, lengthMm, scale, centre, size]
    )

    const zoomAt = (px: number, py: number, factor: number) =>
      setView((v) => {
        const zoom = Math.min(8, Math.max(0.3, v.zoom * factor))
        const k = zoom / v.zoom
        return { zoom, x: px - (px - v.x) * k, y: py - (py - v.y) * k }
      })

    const onWheel = (event: Konva.KonvaEventObject<WheelEvent>) => {
      event.evt.preventDefault()
      const pos = stageRef.current?.getPointerPosition()
      if (!pos) return
      zoomAt(pos.x, pos.y, event.evt.deltaY < 0 ? 1.1 : 1 / 1.1)
    }

    // Two-finger pinch. One finger drags (items, or the view when empty).
    const touchDist = (event: TouchEvent) => {
      const [a, b] = [event.touches[0], event.touches[1]]
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
    }
    const onTouchMove = (event: Konva.KonvaEventObject<TouchEvent>) => {
      if (event.evt.touches.length !== 2) return
      event.evt.preventDefault()
      stageRef.current?.stopDrag()
      const dist = touchDist(event.evt)
      const rect = wrapRef.current?.getBoundingClientRect()
      const mid = {
        x:
          (event.evt.touches[0].clientX + event.evt.touches[1].clientX) / 2 -
          (rect?.left ?? 0),
        y:
          (event.evt.touches[0].clientY + event.evt.touches[1].clientY) / 2 -
          (rect?.top ?? 0)
      }
      if (pinch.current) zoomAt(mid.x, mid.y, dist / pinch.current.dist)
      pinch.current = { dist }
    }
    const onTouchEnd = () => {
      pinch.current = null
    }

    const room = { widthMm, lengthMm }

    return (
      <div
        ref={wrapRef}
        className='relative h-[min(65vh,640px)] min-h-[320px] w-full touch-none overflow-hidden rounded-xl border border-card-border bg-card shadow-card'
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          const type = event.dataTransfer.getData('application/x-kigumi-item')
          const rect = wrapRef.current?.getBoundingClientRect()
          if (!type || !rect) return
          onDropNew(type, {
            x: (event.clientX - rect.left - view.x) / scale,
            y: (event.clientY - rect.top - view.y) / scale
          })
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
              setView((v) => ({
                ...v,
                x: event.target.x(),
                y: event.target.y()
              }))
            }
          }}
          onWheel={onWheel}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onMouseDown={(event) => {
            if (event.target === stageRef.current) onSelect(null)
          }}
          onTouchStart={(event) => {
            if (event.target === stageRef.current) onSelect(null)
          }}
        >
          <Layer>
            <Rect
              width={widthMm}
              height={lengthMm}
              fill={colors.card}
              stroke={colors.foreground}
              strokeWidth={2}
              strokeScaleEnabled={false}
              onMouseDown={() => onSelect(null)}
              onTouchStart={() => onSelect(null)}
            />
            {gridMm > 0 &&
              Array.from({ length: Math.floor((widthMm - 1) / gridMm) }).map(
                (_, i) => (
                  <Line
                    key={`v${i}`}
                    points={[(i + 1) * gridMm, 0, (i + 1) * gridMm, lengthMm]}
                    stroke={colors.border}
                    strokeWidth={1}
                    strokeScaleEnabled={false}
                    listening={false}
                  />
                )
              )}
            {gridMm > 0 &&
              Array.from({ length: Math.floor((lengthMm - 1) / gridMm) }).map(
                (_, i) => (
                  <Line
                    key={`h${i}`}
                    points={[0, (i + 1) * gridMm, widthMm, (i + 1) * gridMm]}
                    stroke={colors.border}
                    strokeWidth={1}
                    strokeScaleEnabled={false}
                    listening={false}
                  />
                )
              )}
            <Text
              x={0}
              y={-Math.max(160, widthMm / 40) * 1.4}
              width={widthMm}
              align='center'
              text='front of room'
              fontSize={Math.max(160, widthMm / 40)}
              fill={colors.muted}
              listening={false}
            />

            {items.map((item) => {
              const mic = item.type === 'mic'
              const shown = displaySize(item)
              const shape = itemShape({ ...item, ...shown })
              const outside = !isInsideRoom(item, room)
              const fontSize = Math.max(110, Math.round(widthMm / 55))
              return (
                <Group
                  key={item.id}
                  ref={(node) => {
                    if (node) nodes.current.set(item.id, node)
                    else nodes.current.delete(item.id)
                  }}
                  id={item.id}
                  x={item.xMm}
                  y={item.yMm}
                  rotation={item.rotationDeg}
                  draggable={canEdit && !item.locked}
                  onMouseDown={() => onSelect(item.id)}
                  onTouchStart={() => onSelect(item.id)}
                  onDragMove={(event) => {
                    const node = event.target
                    node.x(snapValue(node.x(), snapMm))
                    node.y(snapValue(node.y(), snapMm))
                  }}
                  onDragEnd={(event) => {
                    onChange(item.id, {
                      xMm: Math.round(event.target.x()),
                      yMm: Math.round(event.target.y())
                    })
                  }}
                  onTransformEnd={(event) => {
                    const node = event.target
                    const sx = node.scaleX()
                    const sy = node.scaleY()
                    node.scaleX(1)
                    node.scaleY(1)
                    const rotation = normaliseRotation(node.rotation())
                    onChange(item.id, {
                      xMm: Math.round(node.x()),
                      yMm: Math.round(node.y()),
                      rotationDeg:
                        Math.abs(rotation - snapRotation(rotation)) < 4
                          ? snapRotation(rotation)
                          : rotation,
                      widthMm: Math.max(
                        MIN_ITEM_SIZE_MM,
                        Math.round(shown.widthMm * sx)
                      ),
                      depthMm: Math.max(
                        MIN_ITEM_SIZE_MM,
                        Math.round(shown.depthMm * sy)
                      )
                    })
                  }}
                >
                  {mic && item.showPattern && item.patternSetting && (
                    <Line
                      points={patternOutline(
                        { x: 0, y: 0 },
                        0,
                        item.patternSetting,
                        600
                      ).flatMap((p) => [p.x, p.y])}
                      closed
                      fill={colors.brand}
                      opacity={0.18}
                      stroke={colors.brand}
                      strokeWidth={1}
                      strokeScaleEnabled={false}
                      listening={false}
                    />
                  )}
                  {/* Footprint: the whole shape when there is no symbol, else a
                      transparent hit area that outlines on select / outside. */}
                  <Rect
                    x={-shown.widthMm / 2}
                    y={-shown.depthMm / 2}
                    width={shown.widthMm}
                    height={shown.depthMm}
                    fill={shape ? 'transparent' : colors.secondary}
                    stroke={
                      outside
                        ? colors.destructive
                        : item.id === selectedId
                          ? colors.brand
                          : shape
                            ? undefined
                            : colors.foreground
                    }
                    strokeWidth={item.id === selectedId || outside ? 2.5 : 1.2}
                    strokeScaleEnabled={false}
                    dash={shape && !outside ? [6, 4] : undefined}
                  />
                  {shape?.map((part, i) => (
                    <Line
                      key={i}
                      points={part.points.flatMap((p) => [p.x, p.y])}
                      closed
                      fill={partFill(part.tone, colors)}
                      opacity={part.tone === 'beam' ? 0.35 : 1}
                      stroke={
                        part.tone === 'beam' ? colors.brand : colors.foreground
                      }
                      strokeWidth={1.2}
                      strokeScaleEnabled={false}
                      lineJoin='round'
                      listening={false}
                    />
                  ))}
                  {item.label && (
                    <Text
                      x={shown.widthMm / 2 + fontSize * 0.3}
                      y={-fontSize / 2}
                      text={item.label}
                      fontSize={fontSize}
                      fill={colors.foreground}
                      listening={false}
                      // Keep labels upright whatever the item's rotation.
                      rotation={-item.rotationDeg}
                    />
                  )}
                </Group>
              )
            })}

            {canEdit && (
              <Transformer
                ref={trRef}
                rotationSnaps={ROTATION_SNAPS}
                rotationSnapTolerance={4}
                keepRatio={false}
                ignoreStroke
                anchorSize={9}
                borderStroke={colors.brand}
                anchorStroke={colors.brand}
                boundBoxFunc={(oldBox, newBox) =>
                  Math.abs(newBox.width) < 4 || Math.abs(newBox.height) < 4
                    ? oldBox
                    : newBox
                }
              />
            )}
          </Layer>
        </Stage>
      </div>
    )
  }
)
