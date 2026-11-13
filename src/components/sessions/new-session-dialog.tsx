'use client'

import Link from 'next/link'
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
import { apiFetch } from '@/lib/client-api'
import { BUILT_IN_TEMPLATES } from '@/lib/layout/templates'

export interface RoomChoice {
  id: string
  name: string
  studioName: string
}

export interface StartChoice {
  id: string
  name: string
}

const pad = (n: number) => String(n).padStart(2, '0')
function defaultLocal(hoursFromNow: number) {
  const d = new Date(Date.now() + hoursFromNow * 3_600_000)
  d.setMinutes(0, 0, 0)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`
}

// Creates a session, optionally starting from a template or a past session.
export function NewSessionDialog({
  rooms,
  ownTemplates,
  ownTemplatesLocked,
  sessions,
  trigger
}: {
  readonly rooms: RoomChoice[]
  readonly ownTemplates: StartChoice[]
  // Free plans see the group but can't use it.
  readonly ownTemplatesLocked: boolean
  readonly sessions: StartChoice[]
  readonly trigger: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? '')
  const [client, setClient] = useState('')
  const [startsAt, setStartsAt] = useState(() => defaultLocal(24))
  const [endsAt, setEndsAt] = useState(() => defaultLocal(28))
  const [channels, setChannels] = useState('')
  const [startFrom, setStartFrom] = useState('blank')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startPayload = () => {
    const [kind, id] = startFrom.split(':')
    if (kind === 'builtin') return { kind, templateId: id }
    if (kind === 'template') return { kind, layoutId: id }
    if (kind === 'session') return { kind, sessionId: id }
    return { kind: 'blank' }
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const data = await apiFetch<{ session: { id: string } }>(
        '/api/sessions',
        {
          method: 'POST',
          body: {
            name,
            roomId: roomId || null,
            client: client || null,
            startsAt,
            endsAt,
            channelsAvailable: channels ? Number(channels) : null,
            startFrom: startPayload()
          }
        }
      )
      setOpen(false)
      toast({ title: 'Session created' })
      router.push(`/sessions/${data.session.id}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className='max-w-lg'>
        <form onSubmit={onSubmit} className='space-y-4'>
          <DialogHeader>
            <DialogTitle>New session</DialogTitle>
            <DialogDescription>
              Times are in the timezone of the room&apos;s studio.
            </DialogDescription>
          </DialogHeader>
          <p className='rounded-md border border-brand-border bg-brand-tint/40 px-3 py-2 text-sm'>
            Want mic picks, a generated layout and an input list too?{' '}
            <Link href='/sessions/new' className='font-medium underline'>
              Use the guided wizard
            </Link>
            .
          </p>
          <div className='space-y-1'>
            <Label htmlFor='s-name'>Name</Label>
            <Input
              id='s-name'
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='Drum tracking'
            />
          </div>
          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='space-y-1'>
              <Label htmlFor='s-room'>Room</Label>
              <NativeSelect
                id='s-room'
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
              >
                <option value=''>No room yet</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.studioName} · {room.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className='space-y-1'>
              <Label htmlFor='s-client'>Client or artist</Label>
              <Input
                id='s-client'
                maxLength={120}
                value={client}
                onChange={(e) => setClient(e.target.value)}
              />
            </div>
            <div className='space-y-1'>
              <Label htmlFor='s-start'>Starts</Label>
              <Input
                id='s-start'
                type='datetime-local'
                required
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div className='space-y-1'>
              <Label htmlFor='s-end'>Ends</Label>
              <Input
                id='s-end'
                type='datetime-local'
                required
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
            <div className='space-y-1'>
              <Label htmlFor='s-channels'>Channels available</Label>
              <Input
                id='s-channels'
                type='number'
                min={1}
                max={128}
                value={channels}
                onChange={(e) => setChannels(e.target.value)}
                placeholder='e.g. 16'
              />
            </div>
            <div className='space-y-1'>
              <Label htmlFor='s-start-from'>Start from</Label>
              <NativeSelect
                id='s-start-from'
                value={startFrom}
                onChange={(e) => setStartFrom(e.target.value)}
              >
                <option value='blank'>Blank layout</option>
                <optgroup label='Starter templates'>
                  {BUILT_IN_TEMPLATES.map((t) => (
                    <option key={t.id} value={`builtin:${t.id}`}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
                {ownTemplates.length > 0 && (
                  <optgroup label='Your templates'>
                    {ownTemplates.map((t) => (
                      <option key={t.id} value={`template:${t.id}`}>
                        {t.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {sessions.length > 0 && (
                  <optgroup label='A previous session'>
                    {sessions.map((s) => (
                      <option key={s.id} value={`session:${s.id}`}>
                        {s.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </NativeSelect>
            </div>
          </div>
          {ownTemplatesLocked && (
            <p className='text-xs text-muted-foreground'>
              Saving and reusing your own templates is a Pro feature. Starter
              templates and previous sessions are free.
            </p>
          )}
          <FormError message={error} />
          <DialogFooter>
            <Button type='submit' disabled={saving}>
              {saving ? 'Creating…' : 'Create session'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
