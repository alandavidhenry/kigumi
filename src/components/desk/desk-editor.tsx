'use client'

import {
  Eye,
  EyeOff,
  Maximize,
  Redo2,
  Undo2,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { FormError } from '@/components/auth/auth-card'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/use-toast'
import { apiFetch } from '@/lib/client-api'
import {
  componentSize,
  formatValue,
  snap,
  stepValue
} from '@/lib/recall/desk-geometry'
import {
  cannotAdd,
  findComponent,
  findFreeSpot,
  finaliseIds,
  isValueKind,
  moveComponent,
  newComponent,
  removeComponent,
  tempId,
  updateComponent
} from '@/lib/recall/desk-layout'
import { reconcileValues } from '@/lib/recall/desk-reconcile'
import type { ReconcileResult } from '@/lib/recall/desk-reconcile'
import { DESK_GRID_MM, LIBRARY_KINDS } from '@/lib/recall/desk-types'
import type {
  DeskArea,
  DeskComponent,
  DeskDefaults,
  DeskLayout,
  LibraryKind
} from '@/lib/recall/desk-types'
import type { RecallValue } from '@/lib/recall/types'

import { DeskCanvas } from './desk-canvas'
import { useDeskColors } from './desk-colors'
import {
  AreaSettings,
  ComponentList,
  LayoutInspector,
  ValueInspector
} from './desk-inspector'
import { DeskLibrary } from './desk-library'
import { useHistory } from './use-history'

import type { DeskCanvasHandle } from './desk-canvas'
import type { DeskSelection } from './desk-shapes'

type Mode = 'layout' | 'values'

interface Draft {
  layout: DeskLayout
  defaults: DeskDefaults
}

export interface DeskTemplateInitial {
  name: string
  description: string | null
  layout: DeskLayout
  defaultValues: DeskDefaults
}

function setValue(
  defaults: DeskDefaults,
  area: DeskArea,
  id: string,
  value: RecallValue | undefined
): DeskDefaults {
  const next = { ...defaults[area] }
  if (value === undefined) delete next[id]
  else next[id] = value
  return { ...defaults, [area]: next }
}

// The visual console-template editor (ADR 0023). Layout mode places and
// configures components; values mode sets the template's home values, which
// every new recall sheet starts from.
export function DeskEditor({
  templateId,
  initial,
  canEdit
}: {
  readonly templateId: string | null
  readonly initial: DeskTemplateInitial
  readonly canEdit: boolean
}) {
  const router = useRouter()
  const colors = useDeskColors()
  const canvas = useRef<DeskCanvasHandle>(null)
  const history = useHistory<Draft>({
    layout: initial.layout,
    defaults: initial.defaultValues
  })
  const {
    set: setDraft,
    undo,
    redo,
    reset: resetDraft,
    canUndo,
    canRedo
  } = history
  const { layout, defaults } = history.state
  const saved = useRef<Draft>(history.state)
  const [name, setName] = useState(initial.name)
  const [description, setDescription] = useState(initial.description ?? '')
  const [savedMeta, setSavedMeta] = useState({
    name: initial.name,
    description: initial.description ?? ''
  })
  const [mode, setMode] = useState<Mode>(
    templateId && initial.layout.strip.components.length > 0
      ? 'values'
      : 'layout'
  )
  const [selection, setSelection] = useState<DeskSelection | null>(null)
  const [target, setTarget] = useState<DeskArea>('strip')
  const [preview, setPreview] = useState(8)
  const [showValues, setShowValues] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<{
    draft: Draft
    result: ReconcileResult
  } | null>(null)

  const editable = canEdit && mode === 'layout'
  const dirty =
    history.state !== saved.current ||
    name !== savedMeta.name ||
    description !== savedMeta.description

  const selected = selection
    ? findComponent(layout, selection.area, selection.id)
    : undefined

  // -- editing ---------------------------------------------------------------

  const add = useCallback(
    (kind: LibraryKind, area: DeskArea, at?: { x: number; y: number }) => {
      const problem = cannotAdd(layout, area, kind)
      if (problem) {
        toast({ title: problem, variant: 'destructive' })
        return
      }
      const component = newComponent(kind, { x: 0, y: 0 })
      const { w, h } = componentSize(component)
      let spot: { x: number; y: number } | null
      if (at) {
        spot = {
          x: Math.max(
            0,
            Math.min(snap(at.x - w / 2, DESK_GRID_MM), layout[area].widthMm - w)
          ),
          y: Math.max(
            0,
            Math.min(snap(at.y - h / 2, DESK_GRID_MM), layout.heightMm - h)
          )
        }
      } else {
        spot = findFreeSpot(layout[area], layout.heightMm, component)
        if (!spot) {
          toast({
            title: 'No free space there. It was placed top left; move it.'
          })
          spot = { x: 0, y: 0 }
        }
      }
      const placed = { ...component, ...spot }
      setDraft((d) => ({
        ...d,
        layout: {
          ...d.layout,
          [area]: {
            ...d.layout[area],
            components: [...d.layout[area].components, placed]
          }
        }
      }))
      setSelection({
        area,
        id: placed.id,
        channel: area === 'strip' ? 1 : null
      })
    },
    [layout, setDraft]
  )

  const onMove = useCallback(
    (area: DeskArea, id: string, x: number, y: number) =>
      setDraft((d) => ({
        ...d,
        layout: moveComponent(d.layout, area, id, x, y)
      })),
    [setDraft]
  )

  const onResize = useCallback(
    (
      area: DeskArea,
      id: string,
      box: { x: number; y: number; w?: number; h?: number }
    ) =>
      setDraft((d) => ({
        ...d,
        layout: updateComponent(d.layout, area, id, box)
      })),
    [setDraft]
  )

  const patch = (patchValue: Partial<DeskComponent>, field: string) => {
    if (!selection) return
    setDraft(
      (d) => ({
        ...d,
        layout: updateComponent(
          d.layout,
          selection.area,
          selection.id,
          patchValue
        )
      }),
      `${selection.id}:${field}`
    )
  }

  const removeSelected = useCallback(() => {
    if (!selection) return
    setDraft((d) => ({
      ...d,
      layout: removeComponent(d.layout, selection.area, selection.id)
    }))
    setSelection(null)
  }, [selection, setDraft])

  const duplicateSelected = useCallback(() => {
    if (!selection || !selected) return
    const problem = cannotAdd(layout, selection.area, selected.kind)
    if (problem) {
      toast({ title: problem, variant: 'destructive' })
      return
    }
    const copy: DeskComponent = {
      ...structuredClone(selected),
      id: tempId(),
      label: selected.label
    }
    const spot = findFreeSpot(layout[selection.area], layout.heightMm, copy)
    const placed = { ...copy, ...(spot ?? { x: copy.x + 5, y: copy.y + 5 }) }
    setDraft((d) => ({
      ...d,
      layout: {
        ...d.layout,
        [selection.area]: {
          ...d.layout[selection.area],
          components: [...d.layout[selection.area].components, placed]
        }
      }
    }))
    setSelection({ ...selection, id: placed.id })
  }, [layout, selected, selection, setDraft])

  const onValue = useCallback(
    (s: DeskSelection, value: RecallValue | undefined) => {
      setSelection(s)
      setDraft((d) => ({
        ...d,
        defaults: setValue(d.defaults, s.area, s.id, value)
      }))
    },
    [setDraft]
  )

  const step = useCallback(
    (direction: 1 | -1) => {
      if (!selection || !selected) return
      if (selected.kind !== 'knob' && selected.kind !== 'fader') return
      const current = defaults[selection.area][selection.id]
      const next = stepValue(
        selected,
        typeof current === 'number' ? current : undefined,
        direction
      )
      setDraft(
        (d) => ({
          ...d,
          defaults: setValue(d.defaults, selection.area, selection.id, next)
        }),
        `${selection.id}:step`
      )
    },
    [defaults, selected, selection, setDraft]
  )

  // -- saving ----------------------------------------------------------------

  const send = useCallback(
    async (draft: Draft) => {
      setBusy(true)
      setError(null)
      try {
        const body = {
          name,
          description,
          strip: draft.layout,
          defaultValues: draft.defaults
        }
        if (templateId) {
          await apiFetch(`/api/console-templates/${templateId}`, {
            method: 'PATCH',
            body
          })
          saved.current = draft
          resetDraft(draft)
          // Keep the selection on the same component if its id was finalised.
          setSelection(null)
          setSavedMeta({ name, description })
          toast({ title: 'Template saved' })
          router.refresh()
        } else {
          const result = await apiFetch<{ template: { id: string } }>(
            '/api/console-templates',
            { method: 'POST', body }
          )
          saved.current = draft
          setSavedMeta({ name, description })
          toast({ title: 'Template created' })
          router.push(`/consoles/templates/${result.template.id}`)
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not save')
      } finally {
        setBusy(false)
      }
    },
    [description, name, resetDraft, router, templateId]
  )

  const save = useCallback(() => {
    if (!canEdit || busy) return
    if (!name.trim()) {
      setError('Give the template a name')
      return
    }
    const final = finaliseIds(layout, defaults)
    const result = reconcileValues(
      saved.current.layout,
      final.layout,
      final.defaults
    )
    const draft = { layout: final.layout, defaults: result.values }
    if (result.lost.length || result.clamped.length) {
      setPending({ draft, result })
    } else {
      void send(draft)
    }
  }, [busy, canEdit, defaults, layout, name, send])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  // -- keyboard --------------------------------------------------------------

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const el = event.target as HTMLElement
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) || el.isContentEditable)
        return
      const mod = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      if (mod && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if (mod && key === 'y') {
        event.preventDefault()
        redo()
      } else if (mod && key === 's') {
        event.preventDefault()
        save()
      } else if (event.key === 'Escape') {
        setSelection(null)
      } else if (!selection || !canEdit) {
        return
      } else if (mode === 'layout') {
        if (mod && key === 'd') {
          event.preventDefault()
          duplicateSelected()
        } else if (event.key === 'Delete' || event.key === 'Backspace') {
          event.preventDefault()
          removeSelected()
        } else if (event.key.startsWith('Arrow') && selected) {
          event.preventDefault()
          const by = event.shiftKey ? 1 : DESK_GRID_MM
          const dx =
            event.key === 'ArrowRight'
              ? by
              : event.key === 'ArrowLeft'
                ? -by
                : 0
          const dy =
            event.key === 'ArrowDown' ? by : event.key === 'ArrowUp' ? -by : 0
          setDraft(
            (d) => ({
              ...d,
              layout: moveComponent(
                d.layout,
                selection.area,
                selection.id,
                selected.x + dx,
                selected.y + dy
              )
            }),
            `${selection.id}:nudge`
          )
        }
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault()
        step(event.key === 'ArrowUp' ? 1 : -1)
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        onValue(selection, undefined)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    canEdit,
    duplicateSelected,
    mode,
    onValue,
    removeSelected,
    save,
    selected,
    selection,
    setDraft,
    redo,
    undo,
    step
  ])

  // -- canvas inputs ---------------------------------------------------------

  // Every preview strip shows the same home values.
  const stripValues = useCallback(() => defaults.strip, [defaults.strip])

  const onSelect = useCallback(
    (s: DeskSelection | null) => {
      if (s && mode === 'values') {
        const c = findComponent(layout, s.area, s.id)
        if (!c || !isValueKind(c.kind)) {
          setSelection(null)
          return
        }
      }
      setSelection(s ? { ...s, channel: s.area === 'strip' ? 1 : null } : null)
    },
    [layout, mode]
  )

  const onDropNew = useCallback(
    (kind: string, area: DeskArea, at: { x: number; y: number }) => {
      if (!(LIBRARY_KINDS as readonly string[]).includes(kind)) return
      add(kind as LibraryKind, area, at)
    },
    [add]
  )

  const describeValue = useCallback(
    (area: DeskArea, c: DeskComponent) => {
      const value = defaults[area][c.id]
      return value === undefined ? 'not set' : formatValue(c, value)
    },
    [defaults]
  )

  const counts = useMemo(
    () => ({
      strip: layout.strip.components.filter((c) => isValueKind(c.kind)).length,
      master: layout.master.components.filter((c) => isValueKind(c.kind)).length
    }),
    [layout]
  )

  const switchMode = (next: Mode) => {
    setMode(next)
    if (next === 'values' && selected && !isValueKind(selected.kind)) {
      setSelection(null)
    }
  }

  return (
    <div className='space-y-4'>
      <Card>
        <CardContent className='grid gap-3 pt-6 sm:grid-cols-2'>
          <div className='space-y-1'>
            <Label htmlFor='template-name'>Name</Label>
            <Input
              id='template-name'
              value={name}
              maxLength={80}
              disabled={!canEdit}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className='space-y-1'>
            <Label htmlFor='template-description'>Description</Label>
            <Input
              id='template-description'
              value={description}
              maxLength={300}
              disabled={!canEdit}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className='flex flex-wrap items-center gap-2'>
        <div
          role='group'
          aria-label='Editing mode'
          className='inline-flex rounded-md border p-0.5'
        >
          {(['layout', 'values'] as const).map((m) => (
            <button
              key={m}
              type='button'
              aria-pressed={mode === m}
              onClick={() => switchMode(m)}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                mode === m
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              {m === 'layout' ? 'Layout' : 'Values'}
            </button>
          ))}
        </div>
        <Button
          variant='ghost'
          size='icon'
          aria-label='Undo'
          disabled={!canUndo}
          onClick={undo}
        >
          <Undo2 />
        </Button>
        <Button
          variant='ghost'
          size='icon'
          aria-label='Redo'
          disabled={!canRedo}
          onClick={redo}
        >
          <Redo2 />
        </Button>
        <Button
          variant='ghost'
          size='icon'
          aria-label='Zoom out'
          onClick={() => canvas.current?.zoomBy(1 / 1.25)}
        >
          <ZoomOut />
        </Button>
        <Button
          variant='ghost'
          size='icon'
          aria-label='Zoom in'
          onClick={() => canvas.current?.zoomBy(1.25)}
        >
          <ZoomIn />
        </Button>
        <Button
          variant='ghost'
          size='icon'
          aria-label='Fit the desk'
          onClick={() => canvas.current?.fit()}
        >
          <Maximize />
        </Button>
        <Button
          variant='ghost'
          size='sm'
          aria-pressed={showValues}
          onClick={() => setShowValues((v) => !v)}
        >
          {showValues ? <Eye /> : <EyeOff />} Values on desk
        </Button>
        <label className='flex items-center gap-1.5 text-sm text-muted-foreground'>
          Preview
          <Input
            type='number'
            min={1}
            max={48}
            value={preview}
            aria-label='Channels to preview'
            className='h-8 w-16'
            onChange={(e) =>
              setPreview(Math.max(1, Math.min(48, Number(e.target.value) || 1)))
            }
          />
          channels
        </label>
        <span className='ml-auto text-xs text-muted-foreground'>
          {counts.strip} on each channel, {counts.master} on the master
          {dirty ? ' · unsaved changes' : ''}
        </span>
        {canEdit && (
          <Button disabled={busy} onClick={save}>
            {busy
              ? 'Saving…'
              : templateId
                ? 'Save template'
                : 'Create template'}
          </Button>
        )}
      </div>
      <FormError message={error} />

      <div className='grid gap-4 lg:grid-cols-[11rem_minmax(0,1fr)_17rem]'>
        <aside aria-label='Component library'>
          {editable ? (
            <DeskLibrary
              target={target}
              onTarget={setTarget}
              onAdd={(kind) => add(kind, target)}
              hasMaster={layout.master.widthMm > 0}
            />
          ) : (
            <p className='text-sm text-muted-foreground'>
              {mode === 'values'
                ? 'Set the values this desk starts from. Every new recall sheet on a console with this template begins here, and the input list then fills in 48V, pad and source.'
                : 'You can view this template but not change it.'}
            </p>
          )}
        </aside>

        <div className='min-w-0'>
          {colors ? (
            <DeskCanvas
              ref={canvas}
              layout={layout}
              mode={mode}
              channels={preview}
              liveStrips='first'
              stripValues={stripValues}
              masterValues={defaults.master}
              selection={selection}
              selectedChannel={null}
              showValues={showValues}
              canEdit={canEdit}
              colors={colors}
              onSelect={onSelect}
              onValue={onValue}
              onMove={onMove}
              onResize={onResize}
              onDropNew={editable ? onDropNew : undefined}
            />
          ) : (
            <Skeleton className='h-[min(72vh,760px)] w-full' />
          )}
          <p className='mt-1.5 text-xs text-muted-foreground'>
            {mode === 'layout'
              ? 'Channel 1 is the strip you design; the faded ones repeat it. Scroll to pan, Ctrl/⌘ + scroll or pinch to zoom, arrow keys nudge.'
              : 'Drag knobs and faders up and down, click switches and buttons, double-click to clear. Shift drags finer; arrow keys step.'}
          </p>
        </div>

        <aside aria-label='Inspector' className='space-y-4'>
          {mode === 'layout' ? (
            selected && selection ? (
              <LayoutInspector
                key={`${selection.area}:${selection.id}`}
                component={selected}
                area={selection.area}
                canEdit={canEdit}
                onChange={patch}
                onRemove={removeSelected}
                onDuplicate={duplicateSelected}
              />
            ) : (
              <AreaSettings
                layout={layout}
                canEdit={canEdit}
                onChange={(p, field) =>
                  setDraft(
                    (d) => ({
                      ...d,
                      layout: {
                        ...d.layout,
                        heightMm: p.height ?? d.layout.heightMm,
                        strip: {
                          ...d.layout.strip,
                          widthMm: p.stripWidth ?? d.layout.strip.widthMm
                        },
                        master: {
                          ...d.layout.master,
                          widthMm: p.masterWidth ?? d.layout.master.widthMm
                        }
                      }
                    }),
                    `desk:${field}`
                  )
                }
              />
            )
          ) : selected && selection && isValueKind(selected.kind) ? (
            <ValueInspector
              component={selected}
              value={defaults[selection.area][selection.id]}
              context={
                selection.area === 'strip'
                  ? 'Home value on every channel'
                  : 'Home value on the master area'
              }
              canEdit={canEdit}
              onValue={(value) => onValue(selection, value)}
              onStep={step}
            />
          ) : (
            <p className='text-sm text-muted-foreground'>
              Select a control on the desk, or from the list below, to see and
              type its value.
            </p>
          )}
          <ComponentList
            layout={layout}
            selection={selection}
            valuesOnly={mode === 'values'}
            describe={mode === 'values' ? describeValue : undefined}
            onSelect={(area, id) =>
              setSelection({ area, id, channel: area === 'strip' ? 1 : null })
            }
          />
        </aside>
      </div>

      <Dialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Some saved values will change</DialogTitle>
            <DialogDescription>
              The layout no longer has room for these home values. Recall sheets
              already written are not affected: they keep the desk they were
              recorded on.
            </DialogDescription>
          </DialogHeader>
          {pending && (
            <div className='max-h-64 space-y-3 overflow-y-auto text-sm'>
              {pending.result.lost.length > 0 && (
                <div>
                  <p className='font-medium'>Removed</p>
                  <ul className='list-disc pl-5'>
                    {pending.result.lost.map((n) => (
                      <li key={`${n.area}:${n.id}`}>
                        {n.area === 'strip' ? 'Channel' : 'Master'} › {n.label}{' '}
                        ({n.before})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {pending.result.clamped.length > 0 && (
                <div>
                  <p className='font-medium'>Brought into range</p>
                  <ul className='list-disc pl-5'>
                    {pending.result.clamped.map((n) => (
                      <li key={`${n.area}:${n.id}`}>
                        {n.area === 'strip' ? 'Channel' : 'Master'} › {n.label}:{' '}
                        {n.before} → {n.after}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant='surface' onClick={() => setPending(null)}>
              Keep editing
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                const draft = pending?.draft
                setPending(null)
                if (draft) void send(draft)
              }}
            >
              Save anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
