'use client'

import { Copy, Eraser, Trash2 } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { editableText, parseTypedValue } from '@/lib/recall/desk-geometry'
import { isValueKind } from '@/lib/recall/desk-layout'
import {
  DESK_KIND_LABELS,
  DESK_LIMITS,
  DESK_TONES,
  RESIZABLE
} from '@/lib/recall/desk-types'
import type {
  DeskArea,
  DeskComponent,
  DeskLayout,
  DeskTone
} from '@/lib/recall/desk-types'
import type { RecallValue } from '@/lib/recall/types'

import type { DeskSelection } from './desk-shapes'

// The inspector beside the canvas: a component's properties in layout mode,
// its value in a text box in values mode. With the component list it is also
// the keyboard and screen-reader way into the desk.

function NumberField({
  label,
  value,
  onCommit,
  disabled,
  min,
  placeholder
}: {
  readonly label: string
  readonly value: number | undefined
  readonly onCommit: (value: number | undefined) => void
  readonly disabled?: boolean
  readonly min?: number
  readonly placeholder?: string
}) {
  const id = useId()
  const [text, setText] = useState(value === undefined ? '' : String(value))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setText(value === undefined ? '' : String(value))
  }, [value])
  return (
    <div className='space-y-1'>
      <Label htmlFor={id} className='text-xs'>
        {label}
      </Label>
      <Input
        id={id}
        inputMode='decimal'
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={() => {
          focused.current = true
        }}
        onBlur={() => {
          focused.current = false
          setText(value === undefined ? '' : String(value))
        }}
        onChange={(event) => {
          setText(event.target.value)
          const raw = event.target.value.trim()
          if (raw === '') onCommit(undefined)
          else if (Number.isFinite(Number(raw))) {
            const n = Number(raw)
            if (min === undefined || n >= min) onCommit(n)
          }
        }}
      />
    </div>
  )
}

function TextField({
  label,
  value,
  onCommit,
  disabled,
  maxLength
}: {
  readonly label: string
  readonly value: string
  readonly onCommit: (value: string) => void
  readonly disabled?: boolean
  readonly maxLength: number
}) {
  const id = useId()
  return (
    <div className='space-y-1'>
      <Label htmlFor={id} className='text-xs'>
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        onChange={(event) => onCommit(event.target.value)}
      />
    </div>
  )
}

export function LayoutInspector({
  component: c,
  area,
  canEdit,
  onChange,
  onRemove,
  onDuplicate
}: {
  readonly component: DeskComponent
  readonly area: DeskArea
  readonly canEdit: boolean
  readonly onChange: (patch: Partial<DeskComponent>, field: string) => void
  readonly onRemove: () => void
  readonly onDuplicate: () => void
}) {
  const [options, setOptions] = useState((c.options ?? []).join(', '))
  useEffect(() => setOptions((c.options ?? []).join(', ')), [c.id, c.options])
  const numeric = c.kind === 'knob' || c.kind === 'fader'
  const resize = RESIZABLE[c.kind]
  const disabled = !canEdit

  return (
    <div className='space-y-3'>
      <div className='flex items-baseline justify-between gap-2'>
        <h3 className='text-sm font-semibold'>
          {DESK_KIND_LABELS[c.kind]}
          <span className='ml-1.5 font-normal text-muted-foreground'>
            {area === 'strip' ? 'on every channel' : 'master area'}
          </span>
        </h3>
      </div>
      <TextField
        label={c.kind === 'panel' ? 'Heading' : 'Label'}
        value={c.label}
        maxLength={40}
        disabled={disabled}
        onCommit={(label) => onChange({ label }, 'label')}
      />
      {numeric && (
        <>
          <div className='grid grid-cols-3 gap-2'>
            <NumberField
              label='Min'
              value={c.min}
              disabled={disabled}
              onCommit={(min) => onChange({ min }, 'min')}
            />
            <NumberField
              label='Max'
              value={c.max}
              disabled={disabled}
              onCommit={(max) => onChange({ max }, 'max')}
            />
            <TextField
              label='Unit'
              value={c.unit ?? ''}
              maxLength={10}
              disabled={disabled}
              onCommit={(unit) =>
                onChange({ unit: unit.trim() ? unit : undefined }, 'unit')
              }
            />
          </div>
          <div className='grid grid-cols-3 gap-2'>
            <NumberField
              label='Step'
              value={c.step}
              min={0}
              placeholder='auto'
              disabled={disabled}
              onCommit={(step) =>
                onChange({ step: step && step > 0 ? step : undefined }, 'step')
              }
            />
            <NumberField
              label='Centre'
              value={c.centre}
              placeholder='none'
              disabled={disabled}
              onCommit={(centre) => onChange({ centre }, 'centre')}
            />
            <div className='space-y-1'>
              <Label htmlFor={`${c.id}-taper`} className='text-xs'>
                Taper
              </Label>
              <NativeSelect
                id={`${c.id}-taper`}
                value={c.taper ?? 'linear'}
                disabled={disabled}
                onChange={(event) =>
                  onChange(
                    {
                      taper: event.target.value === 'log' ? 'log' : undefined
                    },
                    'taper'
                  )
                }
              >
                <option value='linear'>Linear</option>
                <option value='log'>Log</option>
              </NativeSelect>
            </div>
          </div>
          <p className='text-xs text-muted-foreground'>
            Unit &quot;L/R&quot; reads as pan (L30, C, R30). Log suits frequency
            and needs a minimum above zero.
          </p>
        </>
      )}
      {c.kind === 'selector' && (
        <>
          <div className='space-y-1'>
            <Label htmlFor={`${c.id}-options`} className='text-xs'>
              Buttons, comma separated
            </Label>
            <Input
              id={`${c.id}-options`}
              value={options}
              disabled={disabled}
              onChange={(event) => {
                setOptions(event.target.value)
                const list = [
                  ...new Set(
                    event.target.value
                      .split(',')
                      .map((o) => o.trim().slice(0, 30))
                      .filter(Boolean)
                  )
                ].slice(0, DESK_LIMITS.options)
                if (list.length > 0) onChange({ options: list }, 'options')
              }}
            />
          </div>
          <label className='flex items-center gap-2 text-sm'>
            <input
              type='checkbox'
              className='size-4 accent-[var(--brand)]'
              checked={Boolean(c.multi)}
              disabled={disabled}
              onChange={(event) =>
                onChange({ multi: event.target.checked || undefined }, 'multi')
              }
            />
            More than one can be on (routing)
          </label>
        </>
      )}
      {c.kind !== 'text' && (
        <div className='space-y-1'>
          <Label htmlFor={`${c.id}-tone`} className='text-xs'>
            Colour
          </Label>
          <NativeSelect
            id={`${c.id}-tone`}
            value={c.tone ?? ''}
            disabled={disabled}
            onChange={(event) =>
              onChange(
                {
                  tone: (event.target.value || undefined) as
                    DeskTone | undefined
                },
                'tone'
              )
            }
          >
            <option value=''>Default</option>
            {DESK_TONES.map((tone, i) => (
              <option key={tone} value={tone}>
                Colour {i + 1}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      <div className='grid grid-cols-2 gap-2'>
        <NumberField
          label='X (mm)'
          value={c.x}
          min={0}
          disabled={disabled}
          onCommit={(x) => onChange({ x: x ?? 0 }, 'x')}
        />
        <NumberField
          label='Y (mm)'
          value={c.y}
          min={0}
          disabled={disabled}
          onCommit={(y) => onChange({ y: y ?? 0 }, 'y')}
        />
        {resize?.w && (
          <NumberField
            label='Width (mm)'
            value={c.w}
            min={5}
            placeholder='auto'
            disabled={disabled}
            onCommit={(w) => onChange({ w }, 'w')}
          />
        )}
        {resize?.h && (
          <NumberField
            label='Height (mm)'
            value={c.h}
            min={5}
            placeholder='auto'
            disabled={disabled}
            onCommit={(h) => onChange({ h }, 'h')}
          />
        )}
      </div>
      {canEdit && (
        <div className='flex gap-2'>
          <Button variant='surface' size='sm' onClick={onDuplicate}>
            <Copy /> Duplicate
          </Button>
          <Button
            variant='ghost'
            size='sm'
            className='text-destructive hover:text-destructive'
            onClick={onRemove}
          >
            <Trash2 /> Remove
          </Button>
        </div>
      )}
    </div>
  )
}

export function AreaSettings({
  layout,
  canEdit,
  onChange
}: {
  readonly layout: DeskLayout
  readonly canEdit: boolean
  readonly onChange: (
    patch: { stripWidth?: number; masterWidth?: number; height?: number },
    field: string
  ) => void
}) {
  return (
    <div className='space-y-3'>
      <h3 className='text-sm font-semibold'>Desk</h3>
      <div className='grid grid-cols-2 gap-2'>
        <NumberField
          label='Strip width (mm)'
          value={layout.strip.widthMm}
          min={DESK_LIMITS.stripWidthMm.min}
          disabled={!canEdit}
          onCommit={(v) =>
            v !== undefined &&
            v <= DESK_LIMITS.stripWidthMm.max &&
            onChange({ stripWidth: v }, 'stripWidth')
          }
        />
        <NumberField
          label='Master width (mm)'
          value={layout.master.widthMm}
          min={0}
          disabled={!canEdit}
          onCommit={(v) =>
            v !== undefined &&
            v <= DESK_LIMITS.masterWidthMm.max &&
            onChange({ masterWidth: v }, 'masterWidth')
          }
        />
        <NumberField
          label='Height (mm)'
          value={layout.heightMm}
          min={DESK_LIMITS.heightMm.min}
          disabled={!canEdit}
          onCommit={(v) =>
            v !== undefined &&
            v <= DESK_LIMITS.heightMm.max &&
            onChange({ height: v }, 'height')
          }
        />
      </div>
      <p className='text-xs text-muted-foreground'>
        Select a component to change it. A master width of 0 removes the master
        area.
      </p>
    </div>
  )
}

// Every component, by area: select one with the keyboard or a screen reader.
export function ComponentList({
  layout,
  selection,
  onSelect,
  valuesOnly,
  describe
}: {
  readonly layout: DeskLayout
  readonly selection: DeskSelection | null
  readonly onSelect: (area: DeskArea, id: string) => void
  readonly valuesOnly: boolean
  readonly describe?: (area: DeskArea, c: DeskComponent) => string | null
}) {
  return (
    <details className='rounded-md border text-sm'>
      <summary className='cursor-pointer px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground'>
        All components
      </summary>
      <div className='max-h-72 space-y-3 overflow-y-auto border-t px-3 py-2'>
        {(['strip', 'master'] as const).map((area) => {
          const items = layout[area].components.filter(
            (c) => !valuesOnly || isValueKind(c.kind)
          )
          if (items.length === 0) return null
          return (
            <div key={area}>
              <p className='mb-1 text-xs text-muted-foreground'>
                {area === 'strip' ? 'Channel strip' : 'Master'}
              </p>
              <ul className='space-y-0.5'>
                {items.map((c) => {
                  const active =
                    selection?.area === area && selection.id === c.id
                  const detail = describe?.(area, c)
                  return (
                    <li key={c.id}>
                      <button
                        type='button'
                        aria-current={active ? 'true' : undefined}
                        onClick={() => onSelect(area, c.id)}
                        className={`flex w-full justify-between gap-2 rounded px-2 py-1 text-left hover:bg-accent ${active ? 'bg-accent font-medium' : ''}`}
                      >
                        <span className='truncate'>
                          {c.label || DESK_KIND_LABELS[c.kind]}
                        </span>
                        <span className='shrink-0 text-xs text-muted-foreground'>
                          {detail ?? DESK_KIND_LABELS[c.kind]}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
    </details>
  )
}

export function ValueInspector({
  component: c,
  value,
  context,
  canEdit,
  onValue,
  onStep
}: {
  readonly component: DeskComponent
  readonly value: RecallValue | undefined
  readonly context: string
  readonly canEdit: boolean
  readonly onValue: (value: RecallValue | undefined) => void
  readonly onStep?: (direction: 1 | -1) => void
}) {
  const id = useId()
  const [text, setText] = useState(editableText(c, value))
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setText(editableText(c, value))
    setError(null)
  }, [c, value])

  const apply = () => {
    const parsed = parseTypedValue(c, text)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setError(null)
    if (JSON.stringify(parsed.value) !== JSON.stringify(value)) {
      onValue(parsed.value)
    }
  }

  const hint =
    c.kind === 'switch'
      ? 'on or off'
      : c.kind === 'selector'
        ? c.multi
          ? `any of ${c.options?.join(', ')}, comma separated, or none`
          : `one of ${c.options?.join(', ')}`
        : c.kind === 'text'
          ? 'up to 60 characters'
          : [
              c.min !== undefined && c.max !== undefined
                ? `${c.min} to ${c.max}`
                : null,
              c.unit
            ]
              .filter(Boolean)
              .join(' ') || 'a number'

  return (
    <div className='space-y-3'>
      <div>
        <h3 className='text-sm font-semibold'>{c.label}</h3>
        <p className='text-xs text-muted-foreground'>{context}</p>
      </div>
      <div className='space-y-1'>
        <Label htmlFor={id} className='text-xs'>
          Value
        </Label>
        <div className='flex gap-2'>
          <Input
            id={id}
            value={text}
            disabled={!canEdit}
            placeholder='Not recorded'
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-hint`}
            onChange={(event) => setText(event.target.value)}
            onBlur={apply}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                apply()
              } else if (
                onStep &&
                (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
                (c.kind === 'knob' || c.kind === 'fader')
              ) {
                event.preventDefault()
                onStep(event.key === 'ArrowUp' ? 1 : -1)
              }
            }}
          />
          {canEdit && (
            <Button
              variant='surface'
              size='icon'
              aria-label={`Clear ${c.label}`}
              disabled={value === undefined}
              onClick={() => onValue(undefined)}
            >
              <Eraser />
            </Button>
          )}
        </div>
        <p id={`${id}-hint`} className='text-xs text-muted-foreground'>
          {hint}. Empty means not recorded.
        </p>
        {error && (
          <p role='alert' className='text-xs text-destructive'>
            {error}
          </p>
        )}
      </div>
      {canEdit && (
        <p className='text-xs text-muted-foreground'>
          On the desk: drag a knob or fader up and down (hold Shift for fine
          control), click a switch or button, double-click to clear.
        </p>
      )}
    </div>
  )
}
