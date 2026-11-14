'use client'

import { Check } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

import { FormError } from '@/components/auth/auth-card'
import { MicQuickAdd } from '@/components/mics/mic-quick-add'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/use-toast'
import { UpgradeNotice } from '@/components/upgrade-notice'
import { apiFetch } from '@/lib/client-api'
import type { SetupProgress } from '@/lib/setup'
import type { StudioDetail } from '@/lib/studios'
import { cn } from '@/lib/utils'
import { metresToMm } from '@/lib/validation'

const STEPS = [
  { id: 'studio', label: 'Studio' },
  { id: 'rooms', label: 'Rooms' },
  { id: 'mics', label: 'Microphones' },
  { id: 'desk', label: 'Desk' },
  { id: 'done', label: 'Done' }
] as const

type StepId = (typeof STEPS)[number]['id']

const ROOM_SUGGESTIONS = [
  'Live room',
  'Control room',
  'Vocal booth',
  'Iso booth'
]

const BUILTIN_PREFIX = 'builtin:'
const FIELD = 'h-9'
const BUTTON = 'min-h-9'

export interface SetupConsole {
  id: string
  name: string
  channelCount: number
  templateName: string
}

export interface SetupTemplateChoice {
  id: string
  name: string
  description?: string
}

interface Props {
  readonly progress: SetupProgress
  readonly studios: StudioDetail[]
  readonly builtIn: SetupTemplateChoice[]
  readonly templates: SetupTemplateChoice[]
  readonly consoles: SetupConsole[]
  readonly canAddRoom: boolean
  readonly upgradePlanLabel: string | null
  readonly canManageDesk: boolean
  readonly canManageLocker: boolean
  readonly organisationName: string
  // True while first-run setup is forced; false when re-running later.
  readonly firstRun: boolean
}

export function SetupWizard(props: Props) {
  return (
    <Suspense fallback={null}>
      <WizardInner {...props} />
    </Suspense>
  )
}

function WizardInner(props: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const requested = searchParams.get('step')
  const step: StepId =
    STEPS.find((s) => s.id === requested)?.id ??
    (props.progress.steps.studio ? 'rooms' : 'studio')
  const index = STEPS.findIndex((s) => s.id === step)
  const [studioId, setStudioId] = useState<string | null>(null)
  const activeStudio =
    props.studios.find((s) => s.id === studioId) ?? props.studios[0] ?? null

  const go = (target: StepId) =>
    window.history.replaceState(null, '', `/setup?step=${target}`)
  const next = () => go(STEPS[Math.min(index + 1, STEPS.length - 1)].id)
  const back = () => go(STEPS[Math.max(index - 1, 0)].id)
  const refresh = () => router.refresh()
  const [leaving, setLeaving] = useState(false)

  const leave = async (outcome: 'finished' | 'skipped', to: string) => {
    setLeaving(true)
    try {
      await apiFetch('/api/setup/resolve', {
        method: 'POST',
        body: { outcome }
      })
    } catch {
      // Not fatal: the gate simply shows again next time.
    }
    // A full load, so the layout re-reads that setup is resolved.
    window.location.assign(to)
  }

  const done: Record<StepId, boolean> = {
    studio: props.progress.steps.studio,
    rooms: props.progress.steps.rooms,
    mics: props.progress.steps.mics,
    desk: props.progress.steps.desk,
    done: props.progress.complete
  }

  const nav = (
    <div className='flex flex-wrap items-center justify-between gap-2 pt-2'>
      <Button
        type='button'
        variant='surface'
        className={BUTTON}
        onClick={back}
        disabled={index === 0}
      >
        Back
      </Button>
      <div className='flex gap-2'>
        <Button
          type='button'
          variant='surface'
          className={BUTTON}
          onClick={next}
        >
          Skip
        </Button>
        <Button type='button' className={BUTTON} onClick={next}>
          Continue
        </Button>
      </div>
    </div>
  )

  return (
    <div className='space-y-8'>
      {props.firstRun && (
        <div className='flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-border bg-brand-tint/50 px-4 py-3 text-sm'>
          <span>
            Welcome to Kigumi. These few steps take about a minute and you can
            change everything later.
          </span>
          <Button
            type='button'
            variant='surface'
            className={BUTTON}
            disabled={leaving}
            onClick={() => leave('skipped', '/dashboard')}
          >
            Skip setup for now
          </Button>
        </div>
      )}
      <ol className='flex flex-wrap gap-2' aria-label='Setup steps'>
        {STEPS.map((s, i) => (
          <li key={s.id}>
            <button
              type='button'
              onClick={() => go(s.id)}
              aria-current={s.id === step ? 'step' : undefined}
              className={cn(
                'flex min-h-9 items-center gap-2 rounded-full px-3 text-sm transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
                s.id === step
                  ? 'bg-highlight font-medium text-highlight-foreground'
                  : done[s.id]
                    ? 'text-foreground hover:bg-accent'
                    : 'text-muted-foreground hover:bg-accent'
              )}
            >
              <span
                className={cn(
                  'flex size-5 items-center justify-center rounded-full text-xs',
                  done[s.id]
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {done[s.id] ? <Check className='size-3' /> : i + 1}
              </span>
              {s.label}
              {done[s.id] && <span className='sr-only'>(complete)</span>}
            </button>
          </li>
        ))}
      </ol>

      {step === 'studio' && (
        <StudioStep
          studio={props.studios[0] ?? null}
          defaultName={props.organisationName}
          onSaved={refresh}
        >
          {nav}
        </StudioStep>
      )}
      {step === 'rooms' && (
        <RoomsStep
          studios={props.studios}
          studio={activeStudio}
          onPickStudio={setStudioId}
          canAddRoom={props.canAddRoom}
          upgradePlanLabel={props.upgradePlanLabel}
          onSaved={refresh}
        >
          {nav}
        </RoomsStep>
      )}
      {step === 'mics' && (
        <Card>
          <CardHeader>
            <CardTitle>Add the microphones you own</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <p className='text-sm text-muted-foreground'>
              Recommendations only ever suggest mics from your locker. You have{' '}
              <strong>{props.progress.micUnits}</strong> in it now.
            </p>
            {props.canManageLocker ? (
              <MicQuickAdd
                rooms={activeStudio?.rooms.map((r) => ({
                  id: r.id,
                  name: r.name
                }))}
                onAdded={refresh}
              />
            ) : (
              <p className='text-sm text-muted-foreground'>
                You don’t have permission to edit the mic locker.
              </p>
            )}
            {nav}
          </CardContent>
        </Card>
      )}
      {step === 'desk' && (
        <DeskStep
          builtIn={props.builtIn}
          templates={props.templates}
          consoles={props.consoles}
          canManage={props.canManageDesk}
          onSaved={refresh}
        >
          {nav}
        </DeskStep>
      )}
      {step === 'done' && (
        <DoneStep
          progress={props.progress}
          onBack={back}
          onFinish={(to) => leave('finished', to)}
          leaving={leaving}
        />
      )}
    </div>
  )
}

function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London'
  } catch {
    return 'Europe/London'
  }
}

function errorMessage(caught: unknown) {
  return caught instanceof Error ? caught.message : 'Could not save'
}

function StudioStep({
  studio,
  defaultName,
  onSaved,
  children
}: {
  readonly studio: StudioDetail | null
  readonly defaultName: string
  readonly onSaved: () => void
  readonly children: React.ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(studio?.name ?? defaultName)
  const [address, setAddress] = useState(studio?.address ?? '')
  const [timezone, setTimezone] = useState(
    studio?.timezone ?? browserTimeZone()
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    const body = { name, address: address || null, timezone }
    try {
      if (studio) {
        await apiFetch(`/api/studios/${studio.id}`, { method: 'PATCH', body })
      } else {
        await apiFetch('/api/studios', { method: 'POST', body })
      }
      toast({ title: studio ? 'Studio updated' : 'Studio created' })
      setEditing(false)
      onSaved()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your studio</CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        <p className='text-sm text-muted-foreground'>
          A studio is a building or site. Rooms belong to a studio.
        </p>
        {!studio || editing ? (
          <form onSubmit={save} className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='setup-studio-name'>Name</Label>
              <Input
                id='setup-studio-name'
                className={FIELD}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                required
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='setup-studio-address'>Address (optional)</Label>
              <Input
                id='setup-studio-address'
                className={FIELD}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                maxLength={300}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='setup-studio-timezone'>Time zone</Label>
              <Input
                id='setup-studio-timezone'
                className={FIELD}
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                required
              />
            </div>
            <FormError message={error} />
            <div className='flex gap-2'>
              <Button type='submit' className={BUTTON} disabled={saving}>
                {saving ? 'Saving…' : studio ? 'Save changes' : 'Create studio'}
              </Button>
              {studio && (
                <Button
                  type='button'
                  variant='surface'
                  className={BUTTON}
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>
        ) : (
          <div className='flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted p-3'>
            <div className='min-w-0'>
              <p className='font-medium'>{studio.name}</p>
              <p className='text-xs text-muted-foreground'>
                {[studio.address, studio.timezone].filter(Boolean).join(' · ')}
              </p>
            </div>
            <Button
              type='button'
              variant='surface'
              className={BUTTON}
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
          </div>
        )}
        {children}
      </CardContent>
    </Card>
  )
}

function MetresField({
  id,
  label,
  value,
  onChange,
  required,
  isHeight = false
}: {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly onChange: (value: string) => void
  readonly required: boolean
  readonly isHeight?: boolean
}) {
  return (
    <div className='space-y-2'>
      <Label htmlFor={id}>{label}</Label>
      <div className='relative'>
        <Input
          id={id}
          className={cn(FIELD, 'pr-8')}
          type='number'
          inputMode='decimal'
          step='0.01'
          min={isHeight ? 1 : 0.5}
          max={isHeight ? 30 : 100}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
        />
        <span className='pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground'>
          m
        </span>
      </div>
    </div>
  )
}

function RoomsStep({
  studios,
  studio,
  onPickStudio,
  canAddRoom,
  upgradePlanLabel,
  onSaved,
  children
}: {
  readonly studios: StudioDetail[]
  readonly studio: StudioDetail | null
  readonly onPickStudio: (id: string) => void
  readonly canAddRoom: boolean
  readonly upgradePlanLabel: string | null
  readonly onSaved: () => void
  readonly children: React.ReactNode
}) {
  const [name, setName] = useState('')
  const [width, setWidth] = useState('')
  const [length, setLength] = useState('')
  const [height, setHeight] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!studio) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Rooms</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <p className='text-sm text-muted-foreground'>
            Create a studio first, then add its rooms.
          </p>
          {children}
        </CardContent>
      </Card>
    )
  }

  const add = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await apiFetch(`/api/studios/${studio.id}/rooms`, {
        method: 'POST',
        body: {
          name,
          widthMm: metresToMm(Number(width)),
          lengthMm: metresToMm(Number(length)),
          heightMm: height ? metresToMm(Number(height)) : null,
          notes
        }
      })
      toast({ title: 'Room added' })
      setName('')
      setWidth('')
      setLength('')
      setHeight('')
      setNotes('')
      onSaved()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rooms in {studio.name}</CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        <p className='text-sm text-muted-foreground'>
          Room dimensions set the scale for session layouts.
        </p>
        {studios.length > 1 && (
          <div className='space-y-2'>
            <Label htmlFor='setup-studio-pick'>Studio</Label>
            <NativeSelect
              id='setup-studio-pick'
              className={FIELD}
              value={studio.id}
              onChange={(e) => onPickStudio(e.target.value)}
            >
              {studios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
        {studio.rooms.length > 0 && (
          <ul className='divide-y rounded-lg bg-muted'>
            {studio.rooms.map((room) => (
              <li key={room.id} className='px-3 py-2 text-sm'>
                <span className='font-medium'>{room.name}</span>
                <span className='text-muted-foreground'>
                  {' · '}
                  {(room.widthMm / 1000).toFixed(2)} ×{' '}
                  {(room.lengthMm / 1000).toFixed(2)}
                  {room.heightMm
                    ? ` × ${(room.heightMm / 1000).toFixed(2)}`
                    : ''}{' '}
                  m
                </span>
              </li>
            ))}
          </ul>
        )}
        {canAddRoom ? (
          <form onSubmit={add} className='space-y-4'>
            <div className='flex flex-wrap gap-2' aria-label='Common rooms'>
              {ROOM_SUGGESTIONS.map((suggestion) => (
                <Button
                  key={suggestion}
                  type='button'
                  variant='surface'
                  size='sm'
                  className={BUTTON}
                  onClick={() => setName(suggestion)}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
            <div className='space-y-2'>
              <Label htmlFor='setup-room-name'>Room name</Label>
              <Input
                id='setup-room-name'
                className={FIELD}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                required
              />
            </div>
            <div className='grid grid-cols-3 gap-3'>
              <MetresField
                id='setup-room-width'
                label='Width'
                value={width}
                onChange={setWidth}
                required
              />
              <MetresField
                id='setup-room-length'
                label='Length'
                value={length}
                onChange={setLength}
                required
              />
              <MetresField
                id='setup-room-height'
                label='Height'
                value={height}
                onChange={setHeight}
                required={false}
                isHeight
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='setup-room-notes'>Notes (optional)</Label>
              <Textarea
                id='setup-room-notes'
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={2000}
                rows={2}
              />
            </div>
            <FormError message={error} />
            <Button type='submit' className={BUTTON} disabled={saving}>
              {saving ? 'Adding…' : 'Add room'}
            </Button>
          </form>
        ) : (
          <UpgradeNotice
            compact
            title='You’ve reached your plan’s room limit.'
            planLabel={upgradePlanLabel}
          />
        )}
        {children}
      </CardContent>
    </Card>
  )
}

function DeskStep({
  builtIn,
  templates,
  consoles,
  canManage,
  onSaved,
  children
}: {
  readonly builtIn: SetupTemplateChoice[]
  readonly templates: SetupTemplateChoice[]
  readonly consoles: SetupConsole[]
  readonly canManage: boolean
  readonly onSaved: () => void
  readonly children: React.ReactNode
}) {
  const [template, setTemplate] = useState(
    builtIn[0] ? `${BUILTIN_PREFIX}${builtIn[0].id}` : (templates[0]?.id ?? '')
  )
  const [name, setName] = useState('')
  const [channels, setChannels] = useState('24')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const add = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await apiFetch('/api/consoles', {
        method: 'POST',
        body: {
          name,
          channelCount: Number(channels),
          ...(template.startsWith(BUILTIN_PREFIX)
            ? { builtinTemplateId: template.slice(BUILTIN_PREFIX.length) }
            : { templateId: template })
        }
      })
      toast({ title: 'Console added' })
      setName('')
      onSaved()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your desk</CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        <p className='text-sm text-muted-foreground'>
          Describe your console so recall sheets can record its settings. The
          generic analogue desk is a good start.
        </p>
        {consoles.length > 0 && (
          <ul className='divide-y rounded-lg bg-muted'>
            {consoles.map((c) => (
              <li key={c.id} className='px-3 py-2 text-sm'>
                <span className='font-medium'>{c.name}</span>
                <span className='text-muted-foreground'>
                  {' · '}
                  {c.channelCount} channels · strip: {c.templateName}
                </span>
              </li>
            ))}
          </ul>
        )}
        {canManage ? (
          <form onSubmit={add} className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='setup-desk-template'>Desk template</Label>
              <NativeSelect
                id='setup-desk-template'
                className={FIELD}
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
              >
                {builtIn.map((t) => (
                  <option key={t.id} value={`${BUILTIN_PREFIX}${t.id}`}>
                    {t.name}
                  </option>
                ))}
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} (yours)
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className='grid gap-3 sm:grid-cols-2'>
              <div className='space-y-2'>
                <Label htmlFor='setup-desk-name'>Console name</Label>
                <Input
                  id='setup-desk-name'
                  className={FIELD}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  required
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='setup-desk-channels'>Channels</Label>
                <Input
                  id='setup-desk-channels'
                  className={FIELD}
                  type='number'
                  inputMode='numeric'
                  min={1}
                  value={channels}
                  onChange={(e) => setChannels(e.target.value)}
                  required
                />
              </div>
            </div>
            <FormError message={error} />
            <div className='flex flex-wrap items-center gap-3'>
              <Button type='submit' className={BUTTON} disabled={saving}>
                {saving ? 'Adding…' : 'Add console'}
              </Button>
              <Link
                href='/consoles/templates/new'
                className='text-sm underline-offset-4 hover:underline'
              >
                Design a custom desk in the visual editor
              </Link>
            </div>
          </form>
        ) : (
          <p className='text-sm text-muted-foreground'>
            You don’t have permission to add consoles.
          </p>
        )}
        {children}
      </CardContent>
    </Card>
  )
}

function DoneStep({
  progress,
  onBack,
  onFinish,
  leaving
}: {
  readonly progress: SetupProgress
  readonly onBack: () => void
  readonly onFinish: (to: string) => void
  readonly leaving: boolean
}) {
  const rows: [string, number][] = [
    ['Studios', progress.studios],
    ['Rooms', progress.rooms],
    ['Microphones in your locker', progress.micUnits],
    ['Consoles', progress.consoles]
  ]
  // Reaching this step is finishing: later runs find it already resolved.
  useEffect(() => {
    apiFetch('/api/setup/resolve', {
      method: 'POST',
      body: { outcome: 'finished' }
    }).catch(() => undefined)
  }, [])
  const next = [
    {
      title: 'Plan your first session',
      description: 'A guided wizard: ensemble, mics, layout and recall sheet.',
      to: '/sessions/new'
    },
    {
      title: 'Add more microphones',
      description: 'Search the catalogue and add several at once.',
      to: '/locker'
    },
    {
      title: 'Save a layout template',
      description: 'Reuse a favourite room arrangement.',
      to: '/layouts/templates'
    }
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle>You’re set up</CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        <ul className='divide-y rounded-lg bg-muted text-sm'>
          {rows.map(([label, count]) => (
            <li key={label} className='flex justify-between px-3 py-2'>
              <span>{label}</span>
              <span className='font-medium'>{count}</span>
            </li>
          ))}
        </ul>
        <div className='space-y-2'>
          <h3 className='text-sm font-medium'>Suggested next</h3>
          <ul className='grid gap-2 sm:grid-cols-3'>
            {next.map((item) => (
              <li key={item.to}>
                <button
                  type='button'
                  disabled={leaving}
                  onClick={() => onFinish(item.to)}
                  className='h-full w-full rounded-lg bg-muted p-3 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring'
                >
                  <span className='block text-sm font-medium'>
                    {item.title}
                  </span>
                  <span className='block text-xs text-muted-foreground'>
                    {item.description}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <Button
            type='button'
            className={BUTTON}
            disabled={leaving}
            onClick={() => onFinish('/dashboard')}
          >
            Go to dashboard
          </Button>
          <Button
            type='button'
            variant='surface'
            className={BUTTON}
            onClick={onBack}
          >
            Back
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
