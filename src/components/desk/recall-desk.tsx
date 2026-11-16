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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/use-toast'
import { apiFetch } from '@/lib/client-api'
import { formatValue, stepValue } from '@/lib/recall/desk-geometry'
import { findComponent, isValueKind } from '@/lib/recall/desk-layout'
import type { DeskArea, DeskComponent } from '@/lib/recall/desk-types'
import type { RecallSheetView } from '@/lib/recall/service'
import type { RecallValue, RecallValues } from '@/lib/recall/types'

import { DeskCanvas } from './desk-canvas'
import { useDeskColors } from './desk-colors'
import { ComponentList, ValueInspector } from './desk-inspector'
import { useHistory } from './use-history'

import type { DeskCanvasHandle } from './desk-canvas'
import type { DeskSelection } from './desk-shapes'

interface StripState {
  label: string
  values: RecallValues
  notes: string
}

interface Draft {
  strips: Record<number, StripState>
  master: RecallValues
}

const EMPTY: RecallValues = {}

function fromSheet(sheet: RecallSheetView): Draft {
  return {
    strips: Object.fromEntries(
      sheet.channels.map((c) => [
        c.stripNumber,
        { label: c.label, values: c.values, notes: c.notes ?? '' }
      ])
    ),
    master: sheet.masterValues
  }
}

// The recall sheet as a desk (ADR 0023): every channel strip and the master
// area, in values mode, on the desk snapshot the sheet was made with. Changes
// are saved together in one request.
export function RecallDesk({
  sessionId,
  sheet,
  canEdit
}: {
  readonly sessionId: string
  readonly sheet: RecallSheetView
  readonly canEdit: boolean
}) {
  const router = useRouter()
  const colors = useDeskColors()
  const canvas = useRef<DeskCanvasHandle>(null)
  const initial = useMemo(() => fromSheet(sheet), [sheet])
  const {
    state: draft,
    set: setDraft,
    undo,
    redo,
    canUndo,
    canRedo
  } = useHistory<Draft>(initial)
  const [selection, setSelection] = useState<DeskSelection | null>(null)
  const [channel, setChannel] = useState<number | null>(null)
  const [showValues, setShowValues] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { layout } = sheet

  const changedStrips = useMemo(
    () =>
      Object.keys(draft.strips)
        .map(Number)
        .filter((n) => draft.strips[n] !== initial.strips[n]),
    [draft.strips, initial.strips]
  )
  const masterChanged = draft.master !== initial.master
  const dirty = changedStrips.length > 0 || masterChanged

  const stripState = useCallback(
    (n: number, strips: Record<number, StripState>): StripState =>
      strips[n] ?? { label: `Ch ${n}`, values: {}, notes: '' },
    []
  )

  const setStrip = useCallback(
    (n: number, patch: Partial<StripState>, key?: string) =>
      setDraft(
        (d) => ({
          ...d,
          strips: { ...d.strips, [n]: { ...stripState(n, d.strips), ...patch } }
        }),
        key
      ),
    [setDraft, stripState]
  )

  const onValue = useCallback(
    (s: DeskSelection, value: RecallValue | undefined, key?: string) => {
      setSelection(s)
      if (s.channel !== null) setChannel(s.channel)
      setDraft((d) => {
        if (s.area === 'master') {
          const master = { ...d.master }
          if (value === undefined) delete master[s.id]
          else master[s.id] = value
          return { ...d, master }
        }
        const n = s.channel ?? 1
        const strip = stripState(n, d.strips)
        const values = { ...strip.values }
        if (value === undefined) delete values[s.id]
        else values[s.id] = value
        return { ...d, strips: { ...d.strips, [n]: { ...strip, values } } }
      }, key)
    },
    [setDraft, stripState]
  )

  const valueOf = (s: DeskSelection) =>
    s.area === 'master'
      ? draft.master[s.id]
      : draft.strips[s.channel ?? 1]?.values[s.id]

  const selected = selection
    ? findComponent(layout, selection.area, selection.id)
    : undefined

  const step = useCallback(
    (direction: 1 | -1) => {
      if (!selection || !selected) return
      if (selected.kind !== 'knob' && selected.kind !== 'fader') return
      const current =
        selection.area === 'master'
          ? draft.master[selection.id]
          : draft.strips[selection.channel ?? 1]?.values[selection.id]
      onValue(
        selection,
        stepValue(
          selected,
          typeof current === 'number' ? current : undefined,
          direction
        ),
        `${selection.channel}:${selection.id}:step`
      )
    },
    [draft, onValue, selected, selection]
  )

  const save = useCallback(async () => {
    if (!canEdit || busy || !dirty) return
    setBusy(true)
    setError(null)
    try {
      await apiFetch(`/api/sessions/${sessionId}/recall`, {
        method: 'PATCH',
        body: {
          ...(masterChanged && { masterValues: draft.master }),
          ...(changedStrips.length > 0 && {
            channels: changedStrips.map((n) => {
              const strip = draft.strips[n]
              return {
                stripNumber: n,
                values: strip.values,
                ...(strip.label.trim() && { label: strip.label.trim() }),
                notes: strip.notes
              }
            })
          })
        }
      })
      toast({ title: 'Recall saved' })
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }, [
    busy,
    canEdit,
    changedStrips,
    dirty,
    draft,
    masterChanged,
    router,
    sessionId
  ])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

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
        void save()
      } else if (event.key === 'Escape') {
        setSelection(null)
      } else if (selection && canEdit) {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault()
          step(event.key === 'ArrowUp' ? 1 : -1)
        } else if (event.key === 'Delete' || event.key === 'Backspace') {
          event.preventDefault()
          onValue(selection, undefined)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canEdit, onValue, redo, save, selection, step, undo])

  const stripValues = useCallback(
    (n: number) => draft.strips[n]?.values ?? EMPTY,
    [draft.strips]
  )
  const channelLabel = useCallback(
    (n: number) => draft.strips[n]?.label ?? null,
    [draft.strips]
  )
  const onSelect = useCallback(
    (s: DeskSelection | null) => {
      if (s) {
        const c = findComponent(layout, s.area, s.id)
        if (!c || !isValueKind(c.kind)) {
          setSelection(null)
          return
        }
        if (s.channel !== null) setChannel(s.channel)
      }
      setSelection(s)
    },
    [layout]
  )
  const onSelectChannel = useCallback((n: number) => {
    setChannel(n)
    setSelection((s) => (s && s.area === 'strip' ? { ...s, channel: n } : s))
  }, [])

  const describe = useCallback(
    (area: DeskArea, c: DeskComponent) => {
      const value =
        area === 'master'
          ? draft.master[c.id]
          : channel
            ? draft.strips[channel]?.values[c.id]
            : undefined
      if (area === 'strip' && !channel) return null
      return value === undefined ? 'not recorded' : formatValue(c, value)
    },
    [channel, draft]
  )

  const current = channel ? stripState(channel, draft.strips) : null

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <Button
          variant='surface'
          size='icon'
          aria-label='Undo'
          disabled={!canUndo}
          onClick={undo}
        >
          <Undo2 />
        </Button>
        <Button
          variant='surface'
          size='icon'
          aria-label='Redo'
          disabled={!canRedo}
          onClick={redo}
        >
          <Redo2 />
        </Button>
        <Button
          variant='surface'
          size='icon'
          aria-label='Zoom out'
          onClick={() => canvas.current?.zoomBy(1 / 1.25)}
        >
          <ZoomOut />
        </Button>
        <Button
          variant='surface'
          size='icon'
          aria-label='Zoom in'
          onClick={() => canvas.current?.zoomBy(1.25)}
        >
          <ZoomIn />
        </Button>
        <Button
          variant='surface'
          size='icon'
          aria-label='Fit the desk'
          onClick={() => canvas.current?.fit()}
        >
          <Maximize />
        </Button>
        <Button
          variant='surface'
          size='sm'
          aria-pressed={showValues}
          onClick={() => setShowValues((v) => !v)}
        >
          {showValues ? <Eye /> : <EyeOff />} Values on desk
        </Button>
        <span className='ml-auto text-xs text-muted-foreground'>
          {dirty
            ? `Unsaved: ${changedStrips.length} strip${changedStrips.length === 1 ? '' : 's'}${masterChanged ? ' and the master' : ''}`
            : 'All changes saved'}
        </span>
        {canEdit && (
          <Button disabled={busy || !dirty} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save desk'}
          </Button>
        )}
      </div>
      <FormError message={error} />

      <div className='grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]'>
        <div className='min-w-0'>
          {colors ? (
            <DeskCanvas
              ref={canvas}
              layout={layout}
              mode='values'
              channels={sheet.channelCount}
              liveStrips='all'
              stripValues={stripValues}
              masterValues={draft.master}
              channelLabel={channelLabel}
              selection={selection}
              selectedChannel={channel}
              showValues={showValues}
              canEdit={canEdit}
              colors={colors}
              onSelect={onSelect}
              onSelectChannel={onSelectChannel}
              onValue={onValue}
            />
          ) : (
            <Skeleton className='h-[min(72vh,760px)] w-full' />
          )}
          <p className='mt-1.5 text-xs text-muted-foreground'>
            Drag knobs and faders up and down (Shift for fine), click switches
            and buttons, double-click to clear. Hollow controls are not
            recorded. Click a channel number to name the strip.
          </p>
        </div>

        <aside aria-label='Inspector' className='space-y-5'>
          {selected && selection ? (
            <ValueInspector
              component={selected}
              value={valueOf(selection)}
              context={
                selection.area === 'master'
                  ? 'Master area'
                  : `Strip ${selection.channel} · ${stripState(selection.channel ?? 1, draft.strips).label}`
              }
              canEdit={canEdit}
              onValue={(value) => onValue(selection, value)}
              onStep={step}
            />
          ) : (
            <p className='text-sm text-muted-foreground'>
              Select a control on the desk to see and type its value.
            </p>
          )}
          {current && channel && (
            <div className='space-y-2 rounded-xl border border-card-border bg-card p-4 shadow-card'>
              <h3 className='text-sm font-semibold'>Strip {channel}</h3>
              <div className='space-y-1'>
                <Label htmlFor='desk-strip-label' className='text-xs'>
                  Label
                </Label>
                <Input
                  id='desk-strip-label'
                  value={current.label}
                  maxLength={80}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setStrip(
                      channel,
                      { label: e.target.value },
                      `${channel}:label`
                    )
                  }
                />
              </div>
              <div className='space-y-1'>
                <Label htmlFor='desk-strip-notes' className='text-xs'>
                  Notes
                </Label>
                <Textarea
                  id='desk-strip-notes'
                  rows={2}
                  maxLength={500}
                  value={current.notes}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setStrip(
                      channel,
                      { notes: e.target.value },
                      `${channel}:notes`
                    )
                  }
                />
              </div>
            </div>
          )}
          <ComponentList
            layout={layout}
            selection={selection}
            valuesOnly
            describe={describe}
            onSelect={(area, id) => {
              if (area === 'strip' && !channel) setChannel(1)
              setSelection({
                area,
                id,
                channel: area === 'strip' ? (channel ?? 1) : null
              })
            }}
          />
        </aside>
      </div>
    </div>
  )
}
