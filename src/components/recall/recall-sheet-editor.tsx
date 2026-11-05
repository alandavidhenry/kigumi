'use client'

import { Download, Plus, RefreshCw, Trash2, Upload } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'

import { FormError } from '@/components/auth/auth-card'
import { ConfirmDeleteButton } from '@/components/confirm-delete-button'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/use-toast'
import { apiFetch } from '@/lib/client-api'
import { prepareImageForUpload } from '@/lib/client-image'
import { recallLines } from '@/lib/recall/format'
import type {
  OutboardView,
  RecallChannelView,
  RecallSheetView
} from '@/lib/recall/service'
import { MAX_RECALL_PHOTOS } from '@/lib/recall/types'
import type {
  ControlDef,
  RecallValue,
  RecallValues,
  StripDefinition
} from '@/lib/recall/types'

export interface InventoryChoice {
  id: string
  label: string
}

function useSaver() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const run = async (action: () => Promise<unknown>, done?: string) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      if (done) toast({ title: done })
      router.refresh()
      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save')
      return false
    } finally {
      setBusy(false)
    }
  }
  return { error, busy, run }
}

// One control's input. An empty box means "not recorded": it is left out of the
// saved values rather than stored as zero or off.
function ControlInput({
  control,
  channel,
  value,
  disabled,
  onChange
}: {
  readonly control: ControlDef
  readonly channel: number
  readonly value: RecallValue | undefined
  readonly disabled: boolean
  readonly onChange: (value: RecallValue | undefined) => void
}) {
  const label = `${control.label} for strip ${channel}`
  if (control.type === 'switch') {
    return (
      <NativeSelect
        aria-label={label}
        disabled={disabled}
        value={value === undefined ? '' : value ? 'on' : 'off'}
        onChange={(e) =>
          onChange(e.target.value === '' ? undefined : e.target.value === 'on')
        }
      >
        <option value=''>Not recorded</option>
        <option value='on'>On</option>
        <option value='off'>Off</option>
      </NativeSelect>
    )
  }
  if (control.type === 'select') {
    return (
      <NativeSelect
        aria-label={label}
        disabled={disabled}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        <option value=''>Not recorded</option>
        {control.options?.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </NativeSelect>
    )
  }
  if (control.type === 'knob') {
    return (
      <div className='flex items-center gap-1'>
        <Input
          aria-label={label}
          type='number'
          step='any'
          min={control.min}
          max={control.max}
          disabled={disabled}
          value={typeof value === 'number' ? value : ''}
          onChange={(e) =>
            onChange(e.target.value === '' ? undefined : Number(e.target.value))
          }
        />
        {control.unit && (
          <span className='text-xs text-muted-foreground'>{control.unit}</span>
        )}
      </div>
    )
  }
  return (
    <Input
      aria-label={label}
      maxLength={60}
      disabled={disabled}
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => onChange(e.target.value || undefined)}
    />
  )
}

function ChannelEditor({
  sessionId,
  channel,
  strip,
  canEdit
}: {
  readonly sessionId: string
  readonly channel: RecallChannelView
  readonly strip: StripDefinition
  readonly canEdit: boolean
}) {
  const { error, busy, run } = useSaver()
  const [label, setLabel] = useState(channel.label)
  const [values, setValues] = useState<RecallValues>(channel.values)
  const [notes, setNotes] = useState(channel.notes ?? '')
  const summary = recallLines(strip, channel.values)

  const set = (key: string, value: RecallValue | undefined) =>
    setValues((current) => {
      const next = { ...current }
      if (value === undefined) delete next[key]
      else next[key] = value
      return next
    })

  return (
    <details className='group rounded-md border'>
      <summary className='flex cursor-pointer flex-wrap items-baseline gap-x-3 px-3 py-2 text-sm'>
        <span className='w-8 font-medium tabular-nums'>
          {channel.stripNumber}
        </span>
        <span className='font-medium'>{channel.label}</span>
        {channel.micName && (
          <span className='text-muted-foreground'>{channel.micName}</span>
        )}
        <span className='text-xs text-muted-foreground'>
          {summary.length === 0
            ? 'Nothing recorded yet'
            : summary.map((l) => `${l.section}: ${l.text}`).join(' | ')}
        </span>
      </summary>
      <div className='space-y-4 border-t px-3 py-3'>
        <div className='space-y-1'>
          <Label htmlFor={`label-${channel.id}`}>Label</Label>
          <Input
            id={`label-${channel.id}`}
            className='max-w-sm'
            maxLength={80}
            disabled={!canEdit}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        {strip.sections.map((section) => (
          <fieldset key={section.label} className='space-y-2'>
            <legend className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
              {section.label}
            </legend>
            <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
              {section.controls.map((control) => (
                <div key={control.key} className='space-y-1'>
                  <Label className='text-xs'>{control.label}</Label>
                  <ControlInput
                    control={control}
                    channel={channel.stripNumber}
                    value={values[control.key]}
                    disabled={!canEdit}
                    onChange={(value) => set(control.key, value)}
                  />
                </div>
              ))}
            </div>
          </fieldset>
        ))}
        <div className='space-y-1'>
          <Label htmlFor={`notes-${channel.id}`}>Notes</Label>
          <Textarea
            id={`notes-${channel.id}`}
            rows={2}
            maxLength={500}
            disabled={!canEdit}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <FormError message={error} />
        {canEdit && (
          <Button
            disabled={busy}
            onClick={() =>
              run(
                () =>
                  apiFetch(
                    `/api/sessions/${sessionId}/recall/channels/${channel.id}`,
                    {
                      method: 'PATCH',
                      body: { label, values, notes }
                    }
                  ),
                `Saved strip ${channel.stripNumber}`
              )
            }
          >
            {busy ? 'Saving…' : `Save strip ${channel.stripNumber}`}
          </Button>
        )}
      </div>
    </details>
  )
}

function OutboardEditor({
  sessionId,
  unit,
  canEdit
}: {
  readonly sessionId: string
  readonly unit: OutboardView
  readonly canEdit: boolean
}) {
  const router = useRouter()
  const { error, busy, run } = useSaver()
  const [name, setName] = useState(unit.name)
  const [insertOn, setInsertOn] = useState(unit.insertOn ?? '')
  const [settings, setSettings] = useState(unit.settings)
  const [notes, setNotes] = useState(unit.notes ?? '')

  return (
    <div className='space-y-3 rounded-md border p-3'>
      <div className='grid gap-3 sm:grid-cols-2'>
        <div className='space-y-1'>
          <Label className='text-xs'>Unit</Label>
          <Input
            aria-label={`Outboard unit name for ${unit.name}`}
            maxLength={80}
            disabled={!canEdit}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className='space-y-1'>
          <Label className='text-xs'>Inserted on</Label>
          <Input
            aria-label={`Inserted on for ${unit.name}`}
            maxLength={80}
            disabled={!canEdit}
            placeholder='Vocal channel, mix bus…'
            value={insertOn}
            onChange={(e) => setInsertOn(e.target.value)}
          />
        </div>
      </div>
      <div className='space-y-2'>
        {settings.map((setting, i) => (
          <div key={i} className='flex items-center gap-2'>
            <Input
              aria-label={`Setting ${i + 1} name for ${unit.name}`}
              className='max-w-48'
              maxLength={40}
              placeholder='Setting'
              disabled={!canEdit}
              value={setting.label}
              onChange={(e) =>
                setSettings((all) =>
                  all.map((s, j) =>
                    j === i ? { ...s, label: e.target.value } : s
                  )
                )
              }
            />
            <Input
              aria-label={`Setting ${i + 1} value for ${unit.name}`}
              className='max-w-48'
              maxLength={60}
              placeholder='Value'
              disabled={!canEdit}
              value={setting.value}
              onChange={(e) =>
                setSettings((all) =>
                  all.map((s, j) =>
                    j === i ? { ...s, value: e.target.value } : s
                  )
                )
              }
            />
            {canEdit && (
              <Button
                variant='ghost'
                size='icon'
                aria-label={`Remove setting ${i + 1} of ${unit.name}`}
                onClick={() =>
                  setSettings((all) => all.filter((_, j) => j !== i))
                }
              >
                <Trash2 />
              </Button>
            )}
          </div>
        ))}
        {canEdit && (
          <Button
            variant='surface'
            size='sm'
            onClick={() =>
              setSettings((all) => [...all, { label: '', value: '' }])
            }
          >
            <Plus /> Add setting
          </Button>
        )}
      </div>
      <div className='space-y-1'>
        <Label className='text-xs'>Notes</Label>
        <Textarea
          aria-label={`Notes for ${unit.name}`}
          rows={2}
          maxLength={500}
          disabled={!canEdit}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <FormError message={error} />
      {canEdit && (
        <div className='flex gap-2'>
          <Button
            disabled={busy}
            onClick={() =>
              run(
                () =>
                  apiFetch(
                    `/api/sessions/${sessionId}/recall/outboard/${unit.id}`,
                    {
                      method: 'PATCH',
                      body: {
                        name,
                        insertOn,
                        notes,
                        settings: settings.filter((s) => s.label.trim())
                      }
                    }
                  ),
                `Saved ${name}`
              )
            }
          >
            {busy ? 'Saving…' : `Save ${unit.name}`}
          </Button>
          <ConfirmDeleteButton
            title={`Remove ${unit.name}?`}
            description='Its recorded settings are removed from this sheet.'
            label={`Remove ${unit.name}`}
            confirmLabel='Remove'
            onConfirm={async () => {
              await apiFetch(
                `/api/sessions/${sessionId}/recall/outboard/${unit.id}`,
                { method: 'DELETE' }
              )
              toast({ title: 'Outboard removed' })
              router.refresh()
            }}
          />
        </div>
      )}
    </div>
  )
}

function AddOutboard({
  sessionId,
  inventory
}: {
  readonly sessionId: string
  readonly inventory: InventoryChoice[]
}) {
  const { error, busy, run } = useSaver()
  const [name, setName] = useState('')
  const [itemId, setItemId] = useState('')

  return (
    <form
      className='flex flex-wrap items-end gap-2'
      onSubmit={async (event) => {
        event.preventDefault()
        const ok = await run(
          () =>
            apiFetch(`/api/sessions/${sessionId}/recall/outboard`, {
              method: 'POST',
              body: {
                name: name || inventory.find((i) => i.id === itemId)?.label,
                equipmentItemId: itemId || null
              }
            }),
          'Outboard added'
        )
        if (ok) {
          setName('')
          setItemId('')
        }
      }}
    >
      {inventory.length > 0 && (
        <div className='space-y-1'>
          <Label htmlFor='outboard-item' className='text-xs'>
            From your inventory
          </Label>
          <NativeSelect
            id='outboard-item'
            className='w-56'
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
          >
            <option value=''>Not from inventory</option>
            {inventory.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      <div className='space-y-1'>
        <Label htmlFor='outboard-name' className='text-xs'>
          Name
        </Label>
        <Input
          id='outboard-name'
          className='w-56'
          maxLength={80}
          required={!itemId}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <Button type='submit' variant='surface' disabled={busy}>
        <Plus /> Add outboard unit
      </Button>
      <FormError message={error} />
    </form>
  )
}

export function RecallSheetEditor({
  sessionId,
  sheet,
  inventory,
  canEdit
}: {
  readonly sessionId: string
  readonly sheet: RecallSheetView
  readonly inventory: InventoryChoice[]
  readonly canEdit: boolean
}) {
  const router = useRouter()
  const { error, busy, run } = useSaver()
  const [notes, setNotes] = useState(sheet.notes ?? '')
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const upload = async (file: File) => {
    setUploading(true)
    try {
      const body = new FormData()
      // Strips location and other metadata and downsizes large photos.
      body.append('file', await prepareImageForUpload(file))
      const response = await fetch(`/api/sessions/${sessionId}/recall/photos`, {
        method: 'POST',
        body
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error ?? 'Upload failed')
      }
      toast({ title: 'Photo added' })
      router.refresh()
    } catch (caught) {
      toast({
        title: caught instanceof Error ? caught.message : 'Upload failed',
        variant: 'destructive'
      })
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-center gap-2'>
        <Button asChild variant='surface'>
          <a href={`/api/sessions/${sessionId}/recall/pdf`}>
            <Download /> Print / PDF
          </a>
        </Button>
        {canEdit && (
          <>
            <Button
              variant='surface'
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const result = await apiFetch<{
                    added: number
                    skipped: number
                  }>(`/api/sessions/${sessionId}/recall/sync`, {
                    method: 'POST'
                  })
                  toast({
                    title:
                      result.added === 0
                        ? 'The input list has nothing new'
                        : `Added ${result.added} strip${result.added === 1 ? '' : 's'} from the input list`,
                    description:
                      result.skipped > 0
                        ? `${result.skipped} input${result.skipped === 1 ? ' is' : 's are'} numbered past this desk's ${sheet.channelCount} channels.`
                        : undefined
                  })
                })
              }
            >
              <RefreshCw /> Add new inputs
            </Button>
            <ConfirmDeleteButton
              title='Delete this recall sheet?'
              description='The values, outboard entries and desk photos are removed. You can start a new sheet afterwards.'
              label='Delete sheet'
              onConfirm={async () => {
                await apiFetch(`/api/sessions/${sessionId}/recall`, {
                  method: 'DELETE'
                })
                toast({ title: 'Recall sheet deleted' })
                router.refresh()
              }}
            />
          </>
        )}
      </div>
      <FormError message={error} />

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>
            Channels{' '}
            <span className='font-normal text-muted-foreground'>
              ({sheet.channels.length} on {sheet.consoleName},{' '}
              {sheet.channelCount} channels)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-2'>
          {sheet.channels.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              No channels yet. Add inputs to the session, then choose &quot;Add
              new inputs&quot;.
            </p>
          ) : (
            sheet.channels.map((channel) => (
              <ChannelEditor
                key={`${channel.id}:${JSON.stringify(channel.values)}:${channel.label}:${channel.notes}`}
                sessionId={sessionId}
                channel={channel}
                strip={sheet.strip}
                canEdit={canEdit}
              />
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Outboard</CardTitle>
        </CardHeader>
        <CardContent className='space-y-3'>
          {sheet.outboard.length === 0 && (
            <p className='text-sm text-muted-foreground'>
              No outboard recorded. Add compressors, EQs and effects with their
              settings.
            </p>
          )}
          {sheet.outboard.map((unit) => (
            <OutboardEditor
              key={`${unit.id}:${JSON.stringify(unit.settings)}:${unit.name}`}
              sessionId={sessionId}
              unit={unit}
              canEdit={canEdit}
            />
          ))}
          {canEdit && (
            <AddOutboard sessionId={sessionId} inventory={inventory} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0'>
          <CardTitle className='text-base'>Desk photos</CardTitle>
          {canEdit && sheet.photos.length < MAX_RECALL_PHOTOS && (
            <>
              <input
                ref={fileInput}
                type='file'
                accept='image/jpeg,image/png,image/webp'
                className='sr-only'
                aria-label='Desk photo file'
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void upload(file)
                }}
              />
              <Button
                variant='surface'
                disabled={uploading}
                onClick={() => fileInput.current?.click()}
              >
                <Upload />
                {uploading ? 'Uploading…' : 'Add photo'}
              </Button>
            </>
          )}
        </CardHeader>
        <CardContent>
          {sheet.photos.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              No photos yet. A photo of the desk is the best backup for a
              recall. JPEG, PNG or WebP up to 5 MB.
            </p>
          ) : (
            <ul className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
              {sheet.photos.map((photo) => (
                <li key={photo.id} className='relative'>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/attachments/${photo.id}`}
                    alt='Desk photo'
                    className='aspect-square w-full rounded-md border object-cover'
                  />
                  {canEdit && (
                    <div className='absolute right-1 top-1'>
                      <ConfirmDeleteButton
                        title='Remove this photo?'
                        description='The photo is permanently deleted.'
                        label='Remove photo'
                        size='icon'
                        onConfirm={async () => {
                          await apiFetch(`/api/attachments/${photo.id}`, {
                            method: 'DELETE'
                          })
                          toast({ title: 'Photo removed' })
                          router.refresh()
                        }}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Notes</CardTitle>
        </CardHeader>
        <CardContent className='space-y-2'>
          <Textarea
            aria-label='Recall sheet notes'
            rows={3}
            maxLength={2000}
            disabled={!canEdit}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          {canEdit && (
            <Button
              disabled={busy}
              onClick={() =>
                run(
                  () =>
                    apiFetch(`/api/sessions/${sessionId}/recall`, {
                      method: 'PATCH',
                      body: { notes }
                    }),
                  'Notes saved'
                )
              }
            >
              Save notes
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
