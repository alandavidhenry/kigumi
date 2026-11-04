'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { FormError } from '@/components/auth/auth-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/use-toast'
import { apiFetch } from '@/lib/client-api'
import { SESSION_STATUSES, SESSION_STATUS_LABELS } from '@/lib/sessions/types'
import type { SessionStatus } from '@/lib/sessions/types'

import type { RoomChoice } from './new-session-dialog'

export interface SessionFormValues {
  name: string
  client: string | null
  roomId: string | null
  startsLocal: string
  endsLocal: string
  status: SessionStatus
  channelsAvailable: number | null
  phantomMode: 'per_channel' | 'global'
  notes: string | null
  timeZone: string
}

export function SessionDetailsForm({
  sessionId,
  values,
  rooms,
  canEdit
}: {
  readonly sessionId: string
  readonly values: SessionFormValues
  readonly rooms: RoomChoice[]
  readonly canEdit: boolean
}) {
  const router = useRouter()
  const [form, setForm] = useState({
    name: values.name,
    client: values.client ?? '',
    roomId: values.roomId ?? '',
    startsAt: values.startsLocal,
    endsAt: values.endsLocal,
    status: values.status,
    channelsAvailable: values.channelsAvailable?.toString() ?? '',
    phantomMode: values.phantomMode,
    notes: values.notes ?? ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await apiFetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        body: {
          name: form.name,
          client: form.client || null,
          roomId: form.roomId || null,
          startsAt: form.startsAt,
          endsAt: form.endsAt,
          status: form.status,
          channelsAvailable: form.channelsAvailable
            ? Number(form.channelsAvailable)
            : null,
          phantomMode: form.phantomMode,
          notes: form.notes || null
        }
      })
      toast({ title: 'Session saved' })
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className='space-y-3'>
      <div className='grid gap-3 sm:grid-cols-2'>
        <div className='space-y-1 sm:col-span-2'>
          <Label htmlFor='d-name'>Name</Label>
          <Input
            id='d-name'
            required
            maxLength={120}
            value={form.name}
            disabled={!canEdit}
            onChange={(e) => set('name', e.target.value)}
          />
        </div>
        <div className='space-y-1'>
          <Label htmlFor='d-room'>Room</Label>
          <NativeSelect
            id='d-room'
            value={form.roomId}
            disabled={!canEdit}
            onChange={(e) => set('roomId', e.target.value)}
          >
            <option value=''>No room</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.studioName} · {room.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className='space-y-1'>
          <Label htmlFor='d-client'>Client or artist</Label>
          <Input
            id='d-client'
            maxLength={120}
            value={form.client}
            disabled={!canEdit}
            onChange={(e) => set('client', e.target.value)}
          />
        </div>
        <div className='space-y-1'>
          <Label htmlFor='d-start'>Starts ({values.timeZone})</Label>
          <Input
            id='d-start'
            type='datetime-local'
            required
            value={form.startsAt}
            disabled={!canEdit}
            onChange={(e) => set('startsAt', e.target.value)}
          />
        </div>
        <div className='space-y-1'>
          <Label htmlFor='d-end'>Ends</Label>
          <Input
            id='d-end'
            type='datetime-local'
            required
            value={form.endsAt}
            disabled={!canEdit}
            onChange={(e) => set('endsAt', e.target.value)}
          />
        </div>
        <div className='space-y-1'>
          <Label htmlFor='d-status'>Status</Label>
          <NativeSelect
            id='d-status'
            value={form.status}
            disabled={!canEdit}
            onChange={(e) => set('status', e.target.value as SessionStatus)}
          >
            {SESSION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {SESSION_STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className='space-y-1'>
          <Label htmlFor='d-channels'>Channels available</Label>
          <Input
            id='d-channels'
            type='number'
            min={1}
            max={128}
            value={form.channelsAvailable}
            disabled={!canEdit}
            onChange={(e) => set('channelsAvailable', e.target.value)}
          />
        </div>
        <div className='space-y-1'>
          <Label htmlFor='d-phantom'>Phantom power switching</Label>
          <NativeSelect
            id='d-phantom'
            value={form.phantomMode}
            disabled={!canEdit}
            onChange={(e) =>
              set('phantomMode', e.target.value as 'per_channel' | 'global')
            }
          >
            <option value='per_channel'>Per channel</option>
            <option value='global'>One switch for every channel</option>
          </NativeSelect>
        </div>
        <div className='space-y-1 sm:col-span-2'>
          <Label htmlFor='d-notes'>Notes</Label>
          <Textarea
            id='d-notes'
            rows={3}
            maxLength={2000}
            value={form.notes}
            disabled={!canEdit}
            onChange={(e) => set('notes', e.target.value)}
          />
        </div>
      </div>
      <FormError message={error} />
      {canEdit && (
        <Button type='submit' disabled={saving}>
          {saving ? 'Saving…' : 'Save details'}
        </Button>
      )}
    </form>
  )
}
