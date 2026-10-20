'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { FormError } from '@/components/auth/auth-card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { toast } from '@/components/ui/use-toast'
import { ApiError, apiFetch } from '@/lib/client-api'
import type { MicDetail } from '@/lib/mics/catalogue'
import {
  MIC_CONFIDENCE,
  MIC_EXTRACTIONS,
  MIC_EXTRACTION_LABELS,
  MIC_PATTERN_LABELS,
  MIC_POLAR_PATTERNS,
  MIC_POWERING,
  MIC_POWERING_LABELS,
  MIC_SPEC_FIELDS,
  MIC_TRANSDUCER_LABELS,
  MIC_TRANSDUCER_TYPES
} from '@/lib/mics/types'
import type { MicPolarPattern, MicSpecField } from '@/lib/mics/types'

interface FormState {
  manufacturer: string
  model: string
  transducerType: string
  polarPatterns: MicPolarPattern[]
  powering: string
  phantomSafe: string // '' unknown | 'yes' | 'no'
  freqRangeMinHz: string
  freqRangeMaxHz: string
  sensitivityMvPa: string
  selfNoiseDbA: string
  maxSplDb: string
  impedanceOhm: string
  pads: string
  filters: string
  weightG: string
  dimensions: string
  connector: string
  discontinued: boolean
  statedApplications: string
  specSheetUrl: string
  sourceUrl: string
  documentTitle: string
  documentPage: string
  retrievedAt: string
  confidence: string
  extraction: string
  replaceSources: boolean
}

function toState(mic?: MicDetail): FormState {
  const num = (value: number | null | undefined) =>
    value === null || value === undefined ? '' : String(value)
  return {
    manufacturer: mic?.manufacturer ?? '',
    model: mic?.model ?? '',
    transducerType: mic?.transducerType ?? 'dynamic',
    polarPatterns: mic?.polarPatterns ?? ['cardioid'],
    powering: mic?.powering ?? 'none',
    phantomSafe:
      mic?.phantomSafe === null || mic?.phantomSafe === undefined
        ? ''
        : mic.phantomSafe
          ? 'yes'
          : 'no',
    freqRangeMinHz: num(mic?.freqRangeMinHz),
    freqRangeMaxHz: num(mic?.freqRangeMaxHz),
    sensitivityMvPa: num(mic?.sensitivityMvPa),
    selfNoiseDbA: num(mic?.selfNoiseDbA),
    maxSplDb: num(mic?.maxSplDb),
    impedanceOhm: num(mic?.impedanceOhm),
    pads: mic?.pads.join(', ') ?? '',
    filters: mic?.filters.join(', ') ?? '',
    weightG: num(mic?.weightG),
    dimensions: mic?.dimensions ?? '',
    connector: mic?.connector ?? '',
    discontinued: mic?.discontinued ?? false,
    statedApplications: mic?.statedApplications.join(', ') ?? '',
    specSheetUrl: mic?.specSheetUrl ?? '',
    sourceUrl: '',
    documentTitle: '',
    documentPage: '',
    retrievedAt: new Date().toISOString().slice(0, 10),
    confidence: 'medium',
    extraction: 'manual_transcription',
    replaceSources: !mic
  }
}

const numberOrNull = (value: string) => (value.trim() ? Number(value) : null)
const list = (value: string) =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

// Manual entry and edits for the catalogue (platform admins). The source block
// records where the typed values came from; new entries need one, and an edit
// can keep the existing sources or replace them.
export function MicFormDialog({
  mic,
  trigger
}: {
  readonly mic?: MicDetail
  readonly trigger: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<FormState>(toState(mic))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editing = Boolean(mic)

  const set = <K extends keyof FormState>(field: K, value: FormState[K]) =>
    setValues((current) => ({ ...current, [field]: value }))

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      setValues(toState(mic))
      setError(null)
    }
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)

    const body: Record<string, unknown> = {
      manufacturer: values.manufacturer,
      model: values.model,
      transducerType: values.transducerType,
      polarPatterns: values.polarPatterns,
      powering: values.powering,
      phantomSafe:
        values.phantomSafe === '' ? null : values.phantomSafe === 'yes',
      freqRangeMinHz: numberOrNull(values.freqRangeMinHz),
      freqRangeMaxHz: numberOrNull(values.freqRangeMaxHz),
      sensitivityMvPa: numberOrNull(values.sensitivityMvPa),
      selfNoiseDbA: numberOrNull(values.selfNoiseDbA),
      maxSplDb: numberOrNull(values.maxSplDb),
      impedanceOhm: numberOrNull(values.impedanceOhm),
      pads: list(values.pads).map(Number),
      filters: list(values.filters),
      weightG: numberOrNull(values.weightG),
      dimensions: values.dimensions,
      connector: values.connector,
      discontinued: values.discontinued,
      statedApplications: list(values.statedApplications),
      specSheetUrl: values.specSheetUrl || null
    }

    if (values.replaceSources) {
      // One source covering every populated spec field.
      const populated = MIC_SPEC_FIELDS.filter((field: MicSpecField) => {
        const value = body[field]
        if (field === 'discontinued') return value === true
        if (Array.isArray(value)) return value.length > 0
        return value !== null && value !== undefined && value !== ''
      })
      body.provenance = [
        {
          sourceUrl: values.sourceUrl || null,
          documentTitle: values.documentTitle,
          documentPage: values.documentPage,
          retrievedAt: values.retrievedAt || null,
          confidence: values.confidence,
          extraction: values.extraction,
          fields: populated
        }
      ]
    }

    try {
      const response = await apiFetch<{ mic: MicDetail }>(
        editing ? `/api/admin/mics/${mic!.id}` : '/api/admin/mics',
        { method: editing ? 'PATCH' : 'POST', body }
      )
      setOpen(false)
      toast({ title: editing ? 'Microphone updated' : 'Microphone added' })
      if (editing) router.refresh()
      else router.push(`/admin/mics/${response.mic.id}`)
    } catch (caught) {
      const details =
        caught instanceof ApiError && Array.isArray(caught.details)
          ? (caught.details as Array<{ path: string; message: string }>)
              .map((issue) => `${issue.path}: ${issue.message}`)
              .join('; ')
          : null
      setError(
        details ?? (caught instanceof Error ? caught.message : 'Could not save')
      )
    } finally {
      setSaving(false)
    }
  }

  const text = (
    id: string,
    label: string,
    field: keyof FormState,
    props: React.InputHTMLAttributes<HTMLInputElement> = {}
  ) => (
    <div className='space-y-2'>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={String(values[field])}
        onChange={(event) => set(field, event.target.value as never)}
        {...props}
      />
    </div>
  )

  const togglePattern = (pattern: MicPolarPattern) =>
    set(
      'polarPatterns',
      values.polarPatterns.includes(pattern)
        ? values.polarPatterns.filter((entry) => entry !== pattern)
        : [...values.polarPatterns, pattern]
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-2xl'>
        <form onSubmit={onSubmit} className='space-y-4'>
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Edit microphone' : 'Add microphone'}
            </DialogTitle>
            <DialogDescription>
              Type values exactly as the manufacturer states them. Leave a field
              empty if the source does not give it; never estimate.
            </DialogDescription>
          </DialogHeader>

          <div className='grid gap-3 sm:grid-cols-2'>
            {text('mic-maker', 'Manufacturer', 'manufacturer', {
              required: true,
              maxLength: 100
            })}
            {text('mic-model', 'Model', 'model', {
              required: true,
              maxLength: 100
            })}
            <div className='space-y-2'>
              <Label htmlFor='mic-type'>Transducer type</Label>
              <NativeSelect
                id='mic-type'
                value={values.transducerType}
                onChange={(event) => set('transducerType', event.target.value)}
              >
                {MIC_TRANSDUCER_TYPES.map((key) => (
                  <option key={key} value={key}>
                    {MIC_TRANSDUCER_LABELS[key]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='mic-powering'>Powering</Label>
              <NativeSelect
                id='mic-powering'
                value={values.powering}
                onChange={(event) => set('powering', event.target.value)}
              >
                {MIC_POWERING.map((key) => (
                  <option key={key} value={key}>
                    {MIC_POWERING_LABELS[key]}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <fieldset className='space-y-2'>
            <legend className='text-sm font-medium'>Polar patterns</legend>
            <div className='flex flex-wrap gap-x-4 gap-y-1 text-sm'>
              {MIC_POLAR_PATTERNS.map((pattern) => (
                <label key={pattern} className='flex items-center gap-1.5'>
                  <input
                    type='checkbox'
                    checked={values.polarPatterns.includes(pattern)}
                    onChange={() => togglePattern(pattern)}
                  />
                  {MIC_PATTERN_LABELS[pattern]}
                </label>
              ))}
            </div>
          </fieldset>

          <div className='grid gap-3 sm:grid-cols-3'>
            {text('mic-fmin', 'Low frequency (Hz)', 'freqRangeMinHz', {
              type: 'number',
              step: 'any',
              min: 1
            })}
            {text('mic-fmax', 'High frequency (Hz)', 'freqRangeMaxHz', {
              type: 'number',
              step: 'any',
              min: 1
            })}
            {text('mic-sens', 'Sensitivity (mV/Pa)', 'sensitivityMvPa', {
              type: 'number',
              step: 'any',
              min: 0
            })}
            {text('mic-noise', 'Self-noise (dB-A)', 'selfNoiseDbA', {
              type: 'number',
              step: 'any'
            })}
            {text('mic-spl', 'Max SPL (dB)', 'maxSplDb', {
              type: 'number',
              step: 'any'
            })}
            {text('mic-imp', 'Impedance (Ω)', 'impedanceOhm', {
              type: 'number',
              step: 'any',
              min: 0
            })}
            {text('mic-weight', 'Weight (g)', 'weightG', {
              type: 'number',
              step: 'any',
              min: 0
            })}
            {text('mic-pads', 'Pads (dB, comma separated)', 'pads')}
            {text('mic-filters', 'Filters (comma separated)', 'filters')}
            {text('mic-dims', 'Dimensions', 'dimensions')}
            {text('mic-connector', 'Connector', 'connector')}
            <div className='space-y-2'>
              <Label htmlFor='mic-phantom'>Phantom-power safe</Label>
              <NativeSelect
                id='mic-phantom'
                value={values.phantomSafe}
                onChange={(event) => set('phantomSafe', event.target.value)}
              >
                <option value=''>Not stated</option>
                <option value='yes'>Yes</option>
                <option value='no'>No (can be damaged)</option>
              </NativeSelect>
            </div>
          </div>

          {text(
            'mic-apps',
            'Stated applications (comma separated)',
            'statedApplications'
          )}
          {text('mic-sheet', 'Official spec sheet URL', 'specSheetUrl', {
            type: 'url'
          })}
          <label className='flex items-center gap-2 text-sm'>
            <input
              type='checkbox'
              checked={values.discontinued}
              onChange={(event) => set('discontinued', event.target.checked)}
            />
            Discontinued
          </label>

          <fieldset className='space-y-3 rounded-lg border p-3'>
            <legend className='px-1 text-sm font-medium'>Source</legend>
            {editing && (
              <label className='flex items-center gap-2 text-sm'>
                <input
                  type='checkbox'
                  checked={values.replaceSources}
                  onChange={(event) =>
                    set('replaceSources', event.target.checked)
                  }
                />
                Replace the existing sources with this one
              </label>
            )}
            {values.replaceSources && (
              <div className='grid gap-3 sm:grid-cols-2'>
                {text('src-url', 'Source URL', 'sourceUrl', { type: 'url' })}
                {text('src-title', 'Document title', 'documentTitle')}
                {text('src-page', 'Page', 'documentPage')}
                {text('src-date', 'Retrieved on', 'retrievedAt', {
                  type: 'date'
                })}
                <div className='space-y-2'>
                  <Label htmlFor='src-extraction'>How it was extracted</Label>
                  <NativeSelect
                    id='src-extraction'
                    value={values.extraction}
                    onChange={(event) => set('extraction', event.target.value)}
                  >
                    {MIC_EXTRACTIONS.map((key) => (
                      <option key={key} value={key}>
                        {MIC_EXTRACTION_LABELS[key]}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='src-confidence'>Confidence</Label>
                  <NativeSelect
                    id='src-confidence'
                    value={values.confidence}
                    onChange={(event) => set('confidence', event.target.value)}
                  >
                    {MIC_CONFIDENCE.map((key) => (
                      <option key={key} value={key}>
                        {key}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>
            )}
          </fieldset>

          <FormError message={error} />
          <DialogFooter>
            <Button
              type='button'
              variant='surface'
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type='submit' disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add microphone'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
