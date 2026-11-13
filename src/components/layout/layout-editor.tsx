'use client'

import {
  Copy,
  Download,
  FileText,
  Maximize,
  Redo2,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { toast } from '@/components/ui/use-toast'
import { ApiError, apiFetch } from '@/lib/client-api'
import { snapValue } from '@/lib/layout/geometry'
import type { SaveLayoutResult } from '@/lib/layout/service'
import { itemShape } from '@/lib/layout/shapes'
import type { ShapeTone } from '@/lib/layout/shapes'
import {
  GRID_CHOICES_MM,
  ITEM_TYPE_DEFAULTS,
  LAYOUT_ITEM_LABELS,
  LAYOUT_ITEM_TYPES,
  MAX_LAYOUT_ITEMS,
  SNAP_CHOICES_MM
} from '@/lib/layout/types'
import type {
  LayoutDoc,
  LayoutItemDoc,
  LayoutItemType
} from '@/lib/layout/types'
import { MIC_PATTERN_LABELS, type MicPolarPattern } from '@/lib/mics/types'
import type { EditorUnit } from '@/lib/sessions/editor-data'

import { EditorCanvas } from './editor-canvas'

import type { CanvasHandle, EditorColors } from './editor-canvas'

type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict'

const SAVE_DELAY_MS = 1500
const HISTORY_LIMIT = 100
const COALESCE_MS = 800

const mToMm = (m: number) => Math.round(m * 1000)
const mmToM = (mm: number) => Math.round(mm) / 1000

function newId() {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  return `new_${random}`
}

function readColors(): EditorColors {
  const css = getComputedStyle(document.documentElement)
  const get = (name: string, fallback: string) =>
    css.getPropertyValue(name).trim() || fallback
  return {
    foreground: get('--foreground', '#1c1917'),
    border: get('--border', '#d6d3d1'),
    brand: get('--brand', '#ca8a04'),
    card: get('--card', '#ffffff'),
    secondary: get('--secondary', '#e7e5e4'),
    destructive: get('--destructive', '#dc2626'),
    muted: get('--muted-foreground', '#78716c')
  }
}

// The 2D top-down layout editor (PLAN §4.5, ADR 0016). The Konva canvas is one
// way in; the item list and the property fields are the other, so everything
// can be done from the keyboard or a screen reader.
export function LayoutEditor({
  layout,
  units,
  canEdit,
  isTemplate,
  hasRoom,
  pdfHref,
  backHref
}: {
  readonly layout: LayoutDoc
  readonly units: EditorUnit[]
  readonly canEdit: boolean
  readonly isTemplate: boolean
  readonly hasRoom: boolean
  readonly pdfHref: string
  readonly backHref: string
}) {
  const router = useRouter()
  const canvas = useRef<CanvasHandle>(null)
  const [items, setItems] = useState<LayoutItemDoc[]>(layout.items)
  const [gridMm, setGridMm] = useState(layout.gridMm)
  const [snapMm, setSnapMm] = useState(layout.snapMm)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [colors, setColors] = useState<EditorColors | null>(null)
  const [past, setPast] = useState<LayoutItemDoc[][]>([])
  const [future, setFuture] = useState<LayoutItemDoc[][]>([])

  const itemsRef = useRef(items)
  const versionRef = useRef(layout.version)
  const savingRef = useRef(false)
  const refreshedTabs = useRef(false)
  const lastEdit = useRef<{ key: string; at: number } | null>(null)
  itemsRef.current = items

  useEffect(() => {
    setColors(readColors())
    const observer = new MutationObserver(() => setColors(readColors()))
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme']
    })
    return () => observer.disconnect()
  }, [])

  const selected = items.find((item) => item.id === selectedId) ?? null
  const usedUnits = useMemo(
    () =>
      new Map(items.filter((i) => i.micUnitId).map((i) => [i.micUnitId, i.id])),
    [items]
  )

  // -- editing ---------------------------------------------------------------

  const commit = useCallback((next: LayoutItemDoc[], coalesceKey?: string) => {
    const now = Date.now()
    const same =
      coalesceKey &&
      lastEdit.current?.key === coalesceKey &&
      now - lastEdit.current.at < COALESCE_MS
    lastEdit.current = coalesceKey ? { key: coalesceKey, at: now } : null
    if (!same) {
      setPast((p) => [...p.slice(-(HISTORY_LIMIT - 1)), itemsRef.current])
    }
    setFuture([])
    setItems(next)
    setSaveState('dirty')
  }, [])

  const patchItem = useCallback(
    (id: string, patch: Partial<LayoutItemDoc>, key?: string) => {
      commit(
        itemsRef.current.map((i) => (i.id === id ? { ...i, ...patch } : i)),
        key ? `${id}:${key}` : undefined
      )
    },
    [commit]
  )

  const addItem = useCallback(
    (type: LayoutItemType, at?: { x: number; y: number }) => {
      if (itemsRef.current.length >= MAX_LAYOUT_ITEMS) {
        toast({
          title: `A layout holds up to ${MAX_LAYOUT_ITEMS} items`,
          variant: 'destructive'
        })
        return
      }
      const defaults = ITEM_TYPE_DEFAULTS[type]
      const offset = (itemsRef.current.length % 8) * 200
      const item: LayoutItemDoc = {
        id: newId(),
        type,
        variant: null,
        label: null,
        xMm: snapValue(at?.x ?? layout.widthMm / 2 + offset, snapMm),
        yMm: snapValue(at?.y ?? layout.lengthMm / 2 + offset, snapMm),
        zMm: defaults.zMm,
        rotationDeg: 0,
        pitchDeg: 0,
        widthMm: defaults.widthMm,
        depthMm: defaults.depthMm,
        heightMm: defaults.heightMm,
        sortOrder: itemsRef.current.reduce(
          (max, i) => Math.max(max, i.sortOrder + 1),
          0
        ),
        locked: false,
        groupId: null,
        micUnitId: null,
        equipmentItemId: null,
        patternSetting: null,
        showPattern: false,
        recommendationRef: null,
        notes: null
      }
      commit([...itemsRef.current, item])
      setSelectedId(item.id)
    },
    [commit, layout.lengthMm, layout.widthMm, snapMm]
  )

  const removeSelected = useCallback(() => {
    if (!selectedId) return
    commit(itemsRef.current.filter((i) => i.id !== selectedId))
    setSelectedId(null)
  }, [commit, selectedId])

  const duplicateSelected = useCallback(() => {
    const source = itemsRef.current.find((i) => i.id === selectedId)
    if (!source || itemsRef.current.length >= MAX_LAYOUT_ITEMS) return
    const copy: LayoutItemDoc = {
      ...source,
      id: newId(),
      // One microphone can't be in two places.
      micUnitId: null,
      equipmentItemId: source.equipmentItemId,
      recommendationRef: null,
      groupId: null,
      label: source.label ? `${source.label} copy` : null,
      xMm: source.xMm + (gridMm || 250),
      yMm: source.yMm + (gridMm || 250),
      sortOrder: itemsRef.current.reduce(
        (max, i) => Math.max(max, i.sortOrder + 1),
        0
      )
    }
    commit([...itemsRef.current, copy])
    setSelectedId(copy.id)
  }, [commit, gridMm, selectedId])

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p
      const previous = p[p.length - 1]
      setFuture((f) => [itemsRef.current, ...f])
      setItems(previous)
      setSaveState('dirty')
      lastEdit.current = null
      return p.slice(0, -1)
    })
  }, [])

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f
      const [next, ...rest] = f
      setPast((p) => [...p, itemsRef.current])
      setItems(next)
      setSaveState('dirty')
      lastEdit.current = null
      return rest
    })
  }, [])

  // -- saving ----------------------------------------------------------------

  const save = useCallback(async () => {
    if (savingRef.current || !canEdit) return
    savingRef.current = true
    setSaveState('saving')
    const sent = itemsRef.current
    try {
      const result = await apiFetch<SaveLayoutResult>(
        `/api/layouts/${layout.id}`,
        {
          method: 'PUT',
          body: {
            version: versionRef.current,
            gridMm,
            snapMm,
            items: sent.map((item, index) => ({ ...item, sortOrder: index }))
          }
        }
      )
      versionRef.current = result.layout.version
      // New items got stored ids; point anything edited since at them.
      const idMap = result.idMap
      if (Object.keys(idMap).length > 0) {
        setItems((current) =>
          current.map((i) => (idMap[i.id] ? { ...i, id: idMap[i.id] } : i))
        )
        setSelectedId((id) => (id && idMap[id] ? idMap[id] : id))
        setPast([])
        setFuture([])
      }
      setSaveState(itemsRef.current === sent ? 'saved' : 'dirty')
      // Session tab ticks come from the server; refresh when the layout goes
      // from empty to having items (once per mount).
      if (!refreshedTabs.current && sent.length > 0 && !isTemplate) {
        refreshedTabs.current = true
        router.refresh()
      }
    } catch (error) {
      setSaveState(
        error instanceof ApiError && error.status === 409 ? 'conflict' : 'error'
      )
      if (!(error instanceof ApiError && error.status === 409)) {
        toast({
          title:
            error instanceof Error
              ? error.message
              : 'Could not save the layout',
          variant: 'destructive'
        })
      }
    } finally {
      savingRef.current = false
    }
  }, [canEdit, gridMm, isTemplate, layout.id, router, snapMm])

  useEffect(() => {
    if (saveState !== 'dirty' || !canEdit) return
    const timer = setTimeout(() => void save(), SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [saveState, items, gridMm, snapMm, canEdit, save])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (saveState === 'dirty' || saveState === 'saving') {
        event.preventDefault()
      }
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [saveState])

  // -- keyboard --------------------------------------------------------------

  useEffect(() => {
    if (!canEdit) return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return
      const mod = event.ctrlKey || event.metaKey
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo()
      } else if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void save()
      } else if (mod && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        duplicateSelected()
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedId) {
          event.preventDefault()
          removeSelected()
        }
      } else if (event.key.startsWith('Arrow') && selectedId) {
        event.preventDefault()
        const step = event.shiftKey ? gridMm || 500 : snapMm || 10
        const item = itemsRef.current.find((i) => i.id === selectedId)
        if (!item || item.locked) return
        patchItem(
          selectedId,
          {
            xMm:
              item.xMm +
              (event.key === 'ArrowRight'
                ? step
                : event.key === 'ArrowLeft'
                  ? -step
                  : 0),
            yMm:
              item.yMm +
              (event.key === 'ArrowDown'
                ? step
                : event.key === 'ArrowUp'
                  ? -step
                  : 0)
          },
          'nudge'
        )
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    canEdit,
    duplicateSelected,
    gridMm,
    patchItem,
    redo,
    removeSelected,
    save,
    selectedId,
    snapMm,
    undo
  ])

  // -- actions ---------------------------------------------------------------

  const exportPng = () => {
    const url = canvas.current?.exportPng()
    if (!url) return
    const link = document.createElement('a')
    link.href = url
    link.download = `${layout.name.replace(/[^A-Za-z0-9]+/g, '-') || 'layout'}.png`
    link.click()
  }

  const matchRoom = async () => {
    try {
      await apiFetch(`/api/layouts/${layout.id}/match-room`, { method: 'POST' })
      toast({ title: 'Layout now matches the room size' })
      router.refresh()
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : 'Could not update',
        variant: 'destructive'
      })
    }
  }

  const statusText: Record<SaveState, string> = {
    saved: 'All changes saved',
    dirty: 'Unsaved changes…',
    saving: 'Saving…',
    error: 'Could not save. Will retry on your next change.',
    conflict: 'Changed somewhere else.'
  }

  const unitFor = (id: string | null) => units.find((u) => u.id === id) ?? null

  return (
    <div className='space-y-3'>
      <div
        className='flex flex-wrap items-center gap-2'
        role='toolbar'
        aria-label='Layout tools'
      >
        <Button
          variant='outline'
          size='sm'
          onClick={undo}
          disabled={!canEdit || past.length === 0}
          aria-label='Undo'
        >
          <Undo2 />
        </Button>
        <Button
          variant='outline'
          size='sm'
          onClick={redo}
          disabled={!canEdit || future.length === 0}
          aria-label='Redo'
        >
          <Redo2 />
        </Button>
        <span className='mx-1 h-5 w-px bg-border' />
        <Button
          variant='outline'
          size='sm'
          onClick={() => canvas.current?.zoomBy(1 / 1.25)}
          aria-label='Zoom out'
        >
          <ZoomOut />
        </Button>
        <Button
          variant='outline'
          size='sm'
          onClick={() => canvas.current?.zoomBy(1.25)}
          aria-label='Zoom in'
        >
          <ZoomIn />
        </Button>
        <Button
          variant='outline'
          size='sm'
          onClick={() => canvas.current?.fit()}
          aria-label='Fit room to view'
        >
          <Maximize />
        </Button>
        <span className='mx-1 h-5 w-px bg-border' />
        <Label htmlFor='grid' className='text-xs text-muted-foreground'>
          Grid
        </Label>
        <NativeSelect
          id='grid'
          className='w-24'
          value={gridMm}
          disabled={!canEdit}
          onChange={(e) => {
            setGridMm(Number(e.target.value))
            setSaveState('dirty')
          }}
        >
          {GRID_CHOICES_MM.map((g) => (
            <option key={g} value={g}>
              {g >= 1000 ? `${g / 1000} m` : `${g} mm`}
            </option>
          ))}
        </NativeSelect>
        <Label htmlFor='snap' className='text-xs text-muted-foreground'>
          Snap
        </Label>
        <NativeSelect
          id='snap'
          className='w-24'
          value={snapMm}
          disabled={!canEdit}
          onChange={(e) => {
            setSnapMm(Number(e.target.value))
            setSaveState('dirty')
          }}
        >
          {SNAP_CHOICES_MM.map((s) => (
            <option key={s} value={s}>
              {s === 0 ? 'Off' : `${s} mm`}
            </option>
          ))}
        </NativeSelect>
        <div className='ml-auto flex items-center gap-2'>
          <span
            className='text-xs text-muted-foreground'
            role='status'
            aria-live='polite'
            data-testid='save-status'
          >
            {statusText[saveState]}
          </span>
          {saveState === 'conflict' && (
            <Button size='sm' onClick={() => router.refresh()}>
              Reload
            </Button>
          )}
          <Button variant='outline' size='sm' onClick={exportPng}>
            <Download />
            PNG
          </Button>
          <Button variant='outline' size='sm' asChild>
            <a href={pdfHref}>
              <FileText />
              PDF
            </a>
          </Button>
        </div>
      </div>

      <div className='grid gap-3 lg:grid-cols-[1fr_320px]'>
        <div className='space-y-3'>
          {colors && (
            <EditorCanvas
              ref={canvas}
              items={items}
              widthMm={layout.widthMm}
              lengthMm={layout.lengthMm}
              gridMm={gridMm}
              snapMm={snapMm}
              selectedId={selectedId}
              canEdit={canEdit}
              colors={colors}
              onSelect={setSelectedId}
              onChange={(id, patch) => patchItem(id, patch)}
              onDropNew={(type, at) => addItem(type as LayoutItemType, at)}
            />
          )}
          <p className='text-xs text-muted-foreground'>
            {(layout.widthMm / 1000).toFixed(1)} m ×{' '}
            {(layout.lengthMm / 1000).toFixed(1)} m{' · '}drag to move, use the
            handles to rotate and resize, scroll or pinch to zoom. Arrow keys
            nudge the selected item (Shift for a grid step).
          </p>
          {canEdit && hasRoom && (
            <Button
              variant='link'
              size='sm'
              className='px-0'
              onClick={matchRoom}
            >
              Match the room&apos;s current size
            </Button>
          )}
        </div>

        <div className='space-y-3'>
          {canEdit && (
            <Card className='space-y-2 p-3'>
              <h2 className='text-sm font-medium'>Add</h2>
              <div className='flex flex-wrap gap-1.5'>
                {LAYOUT_ITEM_TYPES.map((type) => (
                  <Button
                    key={type}
                    variant='outline'
                    size='sm'
                    draggable
                    onDragStart={(event) =>
                      event.dataTransfer.setData(
                        'application/x-kigumi-item',
                        type
                      )
                    }
                    onClick={() => addItem(type)}
                  >
                    <ShapeIcon type={type} />
                    {LAYOUT_ITEM_LABELS[type]}
                  </Button>
                ))}
              </div>
            </Card>
          )}

          <Card className='space-y-2 p-3'>
            <h2 className='text-sm font-medium'>
              Items{' '}
              <span className='text-muted-foreground'>({items.length})</span>
            </h2>
            <ul
              className='max-h-48 space-y-1 overflow-y-auto'
              aria-label='Layout items'
            >
              {items.length === 0 && (
                <li className='text-sm text-muted-foreground'>
                  Nothing on the layout yet.
                </li>
              )}
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type='button'
                    onClick={() => setSelectedId(item.id)}
                    aria-pressed={item.id === selectedId}
                    className={`flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-muted ${
                      item.id === selectedId ? 'bg-muted font-medium' : ''
                    }`}
                  >
                    <span className='truncate'>
                      {item.label || LAYOUT_ITEM_LABELS[item.type]}
                    </span>
                    {item.type === 'mic' && !item.micUnitId && (
                      <Badge variant='warning' className='ml-auto'>
                        No mic
                      </Badge>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          {selected && (
            <Card className='space-y-3 p-3' aria-label='Selected item'>
              <div className='flex items-center justify-between'>
                <h2 className='text-sm font-medium'>
                  {LAYOUT_ITEM_LABELS[selected.type]}
                </h2>
                {canEdit && (
                  <div className='flex gap-1'>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={duplicateSelected}
                      aria-label='Duplicate item'
                    >
                      <Copy />
                    </Button>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={removeSelected}
                      aria-label='Delete item'
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </div>

              <div className='space-y-1'>
                <Label htmlFor='item-label'>Label</Label>
                <Input
                  id='item-label'
                  value={selected.label ?? ''}
                  maxLength={80}
                  disabled={!canEdit}
                  onChange={(e) =>
                    patchItem(
                      selected.id,
                      { label: e.target.value || null },
                      'label'
                    )
                  }
                />
              </div>

              {selected.type === 'mic' && (
                <div className='space-y-2'>
                  <div className='space-y-1'>
                    <Label htmlFor='item-unit'>
                      Microphone from your locker
                    </Label>
                    <NativeSelect
                      id='item-unit'
                      value={selected.micUnitId ?? ''}
                      disabled={!canEdit}
                      onChange={(e) => {
                        const unit = unitFor(e.target.value || null)
                        patchItem(selected.id, {
                          micUnitId: unit?.id ?? null,
                          patternSetting:
                            unit &&
                            selected.patternSetting &&
                            unit.patterns.includes(selected.patternSetting)
                              ? selected.patternSetting
                              : (unit?.patterns[0] ?? null)
                        })
                      }}
                    >
                      <option value=''>None chosen</option>
                      {units.map((unit) => {
                        const holder = usedUnits.get(unit.id)
                        return (
                          <option
                            key={unit.id}
                            value={unit.id}
                            disabled={!!holder && holder !== selected.id}
                          >
                            {unit.name}
                            {holder && holder !== selected.id
                              ? ' (already used)'
                              : ''}
                          </option>
                        )
                      })}
                    </NativeSelect>
                  </div>
                  {(() => {
                    const unit = unitFor(selected.micUnitId)
                    if (!unit) return null
                    return (
                      <>
                        {unit.patterns.length > 1 && (
                          <div className='space-y-1'>
                            <Label htmlFor='item-pattern'>
                              Pattern setting
                            </Label>
                            <NativeSelect
                              id='item-pattern'
                              value={selected.patternSetting ?? ''}
                              disabled={!canEdit}
                              onChange={(e) =>
                                patchItem(selected.id, {
                                  patternSetting:
                                    (e.target.value as MicPolarPattern) || null
                                })
                              }
                            >
                              {unit.patterns.map((p) => (
                                <option key={p} value={p}>
                                  {MIC_PATTERN_LABELS[p]}
                                </option>
                              ))}
                            </NativeSelect>
                          </div>
                        )}
                        <label className='flex items-center gap-2 text-sm'>
                          <input
                            type='checkbox'
                            checked={selected.showPattern}
                            disabled={!canEdit || !selected.patternSetting}
                            onChange={(e) =>
                              patchItem(selected.id, {
                                showPattern: e.target.checked
                              })
                            }
                          />
                          Show pickup pattern
                        </label>
                        {selected.showPattern && (
                          <p className='text-xs text-muted-foreground'>
                            Idealised pattern (shape only, not reach).
                          </p>
                        )}
                      </>
                    )
                  })()}
                </div>
              )}

              <div className='grid grid-cols-3 gap-2'>
                {(
                  [
                    ['X (m)', 'xMm'],
                    ['Y (m)', 'yMm'],
                    ['Height (m)', 'zMm']
                  ] as const
                ).map(([label, key]) => (
                  <NumberField
                    key={key}
                    label={label}
                    value={mmToM(selected[key])}
                    step={0.05}
                    min={key === 'zMm' ? 0 : undefined}
                    disabled={!canEdit}
                    onChange={(v) =>
                      patchItem(selected.id, { [key]: mToMm(v) }, key)
                    }
                  />
                ))}
                <NumberField
                  label='Rotation °'
                  value={selected.rotationDeg}
                  step={15}
                  min={0}
                  max={359}
                  disabled={!canEdit}
                  onChange={(v) =>
                    patchItem(
                      selected.id,
                      { rotationDeg: ((Math.round(v) % 360) + 360) % 360 },
                      'rot'
                    )
                  }
                />
                {selected.type === 'mic' && (
                  <NumberField
                    label='Pitch °'
                    value={selected.pitchDeg}
                    step={5}
                    min={-90}
                    max={90}
                    disabled={!canEdit}
                    onChange={(v) =>
                      patchItem(
                        selected.id,
                        {
                          pitchDeg: Math.max(-90, Math.min(90, Math.round(v)))
                        },
                        'pitch'
                      )
                    }
                  />
                )}
                <NumberField
                  label='Width (m)'
                  value={mmToM(selected.widthMm)}
                  step={0.05}
                  min={0.01}
                  disabled={!canEdit}
                  onChange={(v) =>
                    patchItem(
                      selected.id,
                      { widthMm: Math.max(10, mToMm(v)) },
                      'w'
                    )
                  }
                />
                <NumberField
                  label='Depth (m)'
                  value={mmToM(selected.depthMm)}
                  step={0.05}
                  min={0.01}
                  disabled={!canEdit}
                  onChange={(v) =>
                    patchItem(
                      selected.id,
                      { depthMm: Math.max(10, mToMm(v)) },
                      'd'
                    )
                  }
                />
              </div>

              <label className='flex items-center gap-2 text-sm'>
                <input
                  type='checkbox'
                  checked={selected.locked}
                  disabled={!canEdit}
                  onChange={(e) =>
                    patchItem(selected.id, { locked: e.target.checked })
                  }
                />
                Lock position
              </label>
            </Card>
          )}

          {isTemplate && (
            <p className='text-xs text-muted-foreground'>
              Templates keep shapes, positions and labels. Microphones are
              chosen per session.
            </p>
          )}
          <Button variant='link' size='sm' className='px-0' asChild>
            <a href={backHref}>Back</a>
          </Button>
        </div>
      </div>
    </div>
  )
}

const ICON_CLASS: Record<ShapeTone, string> = {
  body: 'fill-secondary stroke-foreground',
  accent: 'fill-brand stroke-foreground',
  detail: 'fill-card stroke-foreground',
  beam: 'fill-brand/25 stroke-brand'
}

// A tiny drawing of the symbol the item will have on the plan.
function ShapeIcon({ type }: { readonly type: LayoutItemType }) {
  const defaults = ITEM_TYPE_DEFAULTS[type]
  const parts = itemShape({ type, ...defaults })
  if (!parts) return null
  const all = parts.flatMap((p) => p.points)
  const minX = Math.min(...all.map((p) => p.x))
  const maxX = Math.max(...all.map((p) => p.x))
  const minY = Math.min(...all.map((p) => p.y))
  const maxY = Math.max(...all.map((p) => p.y))
  const pad = Math.max(maxX - minX, maxY - minY) * 0.06
  return (
    <svg
      viewBox={`${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`}
      className='size-5'
      aria-hidden='true'
      strokeWidth={Math.max(maxX - minX, maxY - minY) / 30}
    >
      {parts.map((part, i) => (
        <polygon
          key={i}
          points={part.points.map((p) => `${p.x},${p.y}`).join(' ')}
          className={ICON_CLASS[part.tone]}
          strokeLinejoin='round'
        />
      ))}
    </svg>
  )
}

function NumberField({
  label,
  value,
  step,
  min,
  max,
  disabled,
  onChange
}: {
  readonly label: string
  readonly value: number
  readonly step: number
  readonly min?: number
  readonly max?: number
  readonly disabled: boolean
  readonly onChange: (value: number) => void
}) {
  const id = `f-${label.replace(/\W+/g, '-')}`
  return (
    <div className='space-y-1'>
      <Label htmlFor={id} className='text-xs'>
        {label}
      </Label>
      <Input
        id={id}
        type='number'
        inputMode='decimal'
        value={value}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => {
          const next = Number(e.target.value)
          if (e.target.value !== '' && Number.isFinite(next)) onChange(next)
        }}
      />
    </div>
  )
}
