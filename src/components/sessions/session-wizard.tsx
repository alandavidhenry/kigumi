'use client'

import { Check } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { FormError } from '@/components/auth/auth-card'
import { useTenant } from '@/components/providers/tenant-provider'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/use-toast'
import { apiFetch } from '@/lib/client-api'
import {
  expandPreset,
  getEnsemblePreset,
  type EnsemblePreset
} from '@/lib/sessions/ensembles'
import type {
  WizardInput,
  WizardResult,
  WizardSource
} from '@/lib/sessions/wizard-schemas'
import { cn } from '@/lib/utils'
import { Permission } from '@/types/rbac'

import { DetailsStep } from './wizard/details-step'
import { EnsembleStep } from './wizard/ensemble-step'
import { LayoutStep } from './wizard/layout-step'
import { MicsStep } from './wizard/mics-step'
import { RecallStep } from './wizard/recall-step'
import { ReviewStep } from './wizard/review-step'
import {
  STEPS,
  defaultLocal,
  detailsError,
  newSourceId,
  sourcesError,
  type ConsoleChoice,
  type LayoutTemplateChoice,
  type Patch,
  type PreviewCache,
  type RoomChoice,
  type SessionTemplateChoice,
  type StepId,
  type WizardState
} from './wizard/types'

const RESET_KEYS = [
  'sources',
  'roomId',
  'startsAt',
  'channels',
  'phantomMode'
] as const

function withIds(
  sources: ReadonlyArray<Omit<WizardSource, 'id'>>
): WizardSource[] {
  return sources.map((s) => ({
    id: newSourceId(),
    label: s.label,
    kind: s.kind,
    technique: s.technique ?? 'mono'
  }))
}

function initialState(
  rooms: readonly RoomChoice[],
  presetId: string | null,
  template: SessionTemplateChoice | null
): WizardState {
  const base: WizardState = {
    name: '',
    client: '',
    roomId: rooms[0]?.id ?? '',
    startsAt: defaultLocal(24),
    endsAt: defaultLocal(28),
    channels: '',
    phantomMode: 'per_channel',
    presetId: null,
    templateId: null,
    sources: [],
    pickMode: 'rules',
    overrides: {},
    aiResultId: null,
    layout: { kind: 'auto' },
    consoleId: '',
    saveTemplate: false,
    templateName: ''
  }
  if (template) {
    return {
      ...base,
      presetId: template.presetId,
      templateId: template.id,
      sources: withIds(template.sources),
      channels: template.channelsAvailable
        ? String(template.channelsAvailable)
        : '',
      phantomMode: template.phantomMode === 'global' ? 'global' : 'per_channel',
      layout: template.layoutId
        ? { kind: 'template', layoutId: template.layoutId }
        : { kind: 'auto' },
      consoleId: template.consoleId ?? ''
    }
  }
  const preset = presetId ? getEnsemblePreset(presetId) : undefined
  if (preset) {
    return {
      ...base,
      presetId: preset.id,
      sources: withIds(expandPreset(preset))
    }
  }
  return base
}

export function SessionWizard({
  rooms,
  consoles,
  layoutTemplates,
  sessionTemplates,
  canTemplates,
  canAi,
  allowance,
  lockerSize,
  initialStep,
  initialPresetId,
  initialTemplateId
}: {
  readonly rooms: RoomChoice[]
  readonly consoles: ConsoleChoice[]
  readonly layoutTemplates: LayoutTemplateChoice[]
  readonly sessionTemplates: SessionTemplateChoice[]
  readonly canTemplates: boolean
  readonly canAi: boolean
  readonly allowance: { remaining: number; limit: number } | null
  readonly lockerSize: number
  readonly initialStep: string | null
  readonly initialPresetId: string | null
  readonly initialTemplateId: string | null
}) {
  const router = useRouter()
  const tenant = useTenant()
  const aiAllowed = canAi && tenant.can(Permission.USE_AI)
  const [state, setState] = useState(() =>
    initialState(
      rooms,
      initialPresetId,
      sessionTemplates.find((t) => t.id === initialTemplateId) ?? null
    )
  )
  const [step, setStepState] = useState<StepId>(
    () => STEPS.find((s) => s.id === initialStep)?.id ?? 'details'
  )
  const [cache, setCache] = useState<PreviewCache | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const mounted = useRef(false)

  const index = STEPS.findIndex((s) => s.id === step)
  const room = rooms.find((r) => r.id === state.roomId) ?? null

  useEffect(() => {
    // Move focus to the step heading on change, not on first render.
    if (mounted.current) headingRef.current?.focus()
    mounted.current = true
  }, [step])

  const patch: Patch = (next) =>
    setState((current) => {
      const changed = RESET_KEYS.some(
        (k) => k in next && next[k] !== current[k]
      )
      return {
        ...current,
        ...next,
        ...(changed
          ? {
              overrides: {},
              aiResultId: null,
              pickMode: current.pickMode === 'ai' ? 'rules' : current.pickMode
            }
          : {})
      }
    })

  const goTo = (id: StepId) => {
    setError(null)
    setStepState(id)
    // Native history: keeps ?step= in the URL without re-rendering the page.
    window.history.replaceState(null, '', `/sessions/new?step=${id}`)
  }

  const stepError = (id: StepId): string | null => {
    if (id === 'details') return detailsError(state)
    if (id === 'ensemble') return sourcesError(state.sources)
    return null
  }

  const next = () => {
    const problem = stepError(step)
    if (problem) return setError(problem)
    goTo(STEPS[Math.min(index + 1, STEPS.length - 1)].id)
  }

  const chooseSources = (
    patchNext: Partial<WizardState>,
    sources: WizardSource[]
  ) => patch({ ...patchNext, sources })

  const onPreset = (preset: EnsemblePreset) =>
    chooseSources(
      { presetId: preset.id, templateId: null },
      withIds(expandPreset(preset))
    )

  const onTemplate = (id: string) => {
    const t = sessionTemplates.find((x) => x.id === id)
    if (t)
      setState((c) => ({
        ...initialState(rooms, null, t),
        name: c.name,
        client: c.client,
        roomId: c.roomId,
        startsAt: c.startsAt,
        endsAt: c.endsAt
      }))
  }

  const onScratch = () =>
    chooseSources({ presetId: null, templateId: null }, [
      { id: newSourceId(), label: '', kind: 'general', technique: 'mono' }
    ])

  const submit = async () => {
    for (const id of ['details', 'ensemble'] as const) {
      const problem = stepError(id)
      if (problem) {
        goTo(id)
        setError(problem)
        return
      }
    }
    if (state.saveTemplate && !state.templateName.trim()) {
      setError('Name the template, or untick save as a template.')
      return
    }
    const overrides = Object.fromEntries(
      Object.entries(state.overrides).filter(([id]) =>
        state.sources.some((s) => s.id === id)
      )
    )
    const input: WizardInput = {
      details: {
        name: state.name.trim(),
        client: state.client.trim() || undefined,
        roomId: state.roomId || null,
        startsAt: state.startsAt,
        endsAt: state.endsAt,
        channelsAvailable: state.channels ? Number(state.channels) : null,
        phantomMode: state.phantomMode
      },
      presetId: state.presetId ?? undefined,
      sources: state.sources.map((s) => ({
        id: s.id,
        label: s.label,
        kind: s.kind,
        technique: s.technique
      })),
      picks:
        state.pickMode === 'ai' && state.aiResultId
          ? { mode: 'ai', resultId: state.aiResultId }
          : state.pickMode === 'none'
            ? { mode: 'none' }
            : { mode: 'rules', overrides },
      layout: state.layout,
      recall: state.consoleId ? { consoleId: state.consoleId } : null,
      forDate: state.startsAt.slice(0, 10),
      saveAsTemplate:
        canTemplates && state.saveTemplate
          ? { name: state.templateName.trim() }
          : undefined
    }
    setSaving(true)
    setError(null)
    try {
      const data = await apiFetch<{ result: WizardResult }>(
        '/api/sessions/wizard',
        { method: 'POST', body: input }
      )
      const { result } = data
      const notes = [...result.warnings]
      if (result.recall === 'failed') {
        notes.push(
          'The recall sheet could not be created. You can add it from the Recall tab.'
        )
      }
      if (result.template === 'failed') {
        notes.push('The session template could not be saved.')
      }
      toast({
        title: 'Session created',
        description: notes.length > 0 ? notes.join(' ') : undefined
      })
      router.push(`/sessions/${result.id}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save')
      setSaving(false)
    }
  }

  const titles: Record<StepId, string> = {
    details: 'Session details',
    ensemble: 'What are you recording?',
    mics: 'Choose microphones',
    layout: 'Room layout',
    recall: 'Recall sheet',
    review: 'Review and create'
  }

  return (
    <div className='space-y-6'>
      <nav aria-label='Wizard steps'>
        <ol className='flex flex-wrap gap-1'>
          {STEPS.map((s, i) => {
            const done = i < index
            return (
              <li key={s.id}>
                <button
                  type='button'
                  disabled={i > index}
                  aria-current={s.id === step ? 'step' : undefined}
                  onClick={() => goTo(s.id)}
                  className={cn(
                    'flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default',
                    s.id === step
                      ? 'border-brand-border bg-brand-tint font-medium'
                      : 'border-transparent text-muted-foreground enabled:hover:bg-accent'
                  )}
                >
                  {done ? (
                    <Check className='h-4 w-4 text-brand' aria-hidden='true' />
                  ) : (
                    <span className='text-xs'>{i + 1}</span>
                  )}
                  {s.label}
                  {done && <span className='sr-only'> (done)</span>}
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      <section className='space-y-4' aria-labelledby='w-step-title'>
        <h2
          id='w-step-title'
          ref={headingRef}
          tabIndex={-1}
          className='text-lg font-medium outline-hidden'
        >
          {titles[step]}
        </h2>

        {step === 'details' && (
          <DetailsStep state={state} patch={patch} rooms={rooms} />
        )}
        {step === 'ensemble' && (
          <EnsembleStep
            presetId={state.presetId}
            templateId={state.templateId}
            scratch={
              state.presetId === null &&
              state.templateId === null &&
              state.sources.length > 0
            }
            sources={state.sources}
            sessionTemplates={sessionTemplates}
            canTemplates={canTemplates}
            onPreset={onPreset}
            onTemplate={onTemplate}
            onScratch={onScratch}
            onSources={(sources) => patch({ sources })}
          />
        )}
        {step === 'mics' && (
          <MicsStep
            state={state}
            patch={patch}
            cache={cache}
            onCache={setCache}
            canAi={aiAllowed && state.sources.length > 0}
            allowance={allowance}
            lockerSize={lockerSize}
          />
        )}
        {step === 'layout' && (
          <LayoutStep
            layout={state.layout}
            onLayout={(layout) => patch({ layout })}
            sources={state.sources}
            room={room}
            roomName={room ? `${room.studioName} · ${room.name}` : null}
            layoutTemplates={layoutTemplates}
            canTemplates={canTemplates}
          />
        )}
        {step === 'recall' && (
          <RecallStep
            consoles={consoles}
            consoleId={state.consoleId}
            onConsole={(consoleId) => patch({ consoleId })}
          />
        )}
        {step === 'review' && (
          <ReviewStep
            state={state}
            patch={patch}
            rooms={rooms}
            consoles={consoles}
            layoutTemplates={layoutTemplates}
            canTemplates={canTemplates}
          />
        )}
      </section>

      <FormError message={error} />

      <div className='flex flex-wrap items-center justify-between gap-2 border-t pt-4'>
        <Button
          type='button'
          size='lg'
          variant='surface'
          disabled={index === 0 || saving}
          onClick={() => goTo(STEPS[index - 1].id)}
        >
          Back
        </Button>
        <div className='flex gap-2'>
          {(step === 'mics' || step === 'recall') && (
            <Button
              type='button'
              size='lg'
              variant='ghost'
              onClick={() => {
                if (step === 'recall') patch({ consoleId: '' })
                else patch({ pickMode: 'none' })
                goTo(STEPS[index + 1].id)
              }}
            >
              Skip
            </Button>
          )}
          {step === 'review' ? (
            <Button type='button' size='lg' disabled={saving} onClick={submit}>
              {saving ? 'Creating…' : 'Create session'}
            </Button>
          ) : (
            <Button type='button' size='lg' onClick={next}>
              Next
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
