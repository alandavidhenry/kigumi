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
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/use-toast'
import { apiFetch } from '@/lib/client-api'
import type { RoomRow } from '@/lib/studios'
import { metresToMm, mmToMetres } from '@/lib/validation'

interface RoomFormState {
  name: string
  width: string
  length: string
  height: string
  notes: string
}

function toState(room?: RoomRow): RoomFormState {
  return {
    name: room?.name ?? '',
    width: room ? String(mmToMetres(room.widthMm)) : '',
    length: room ? String(mmToMetres(room.lengthMm)) : '',
    height: room?.heightMm ? String(mmToMetres(room.heightMm)) : '',
    notes: room?.notes ?? ''
  }
}

// Collects metres (what engineers measure in) and stores millimetres.
export function RoomFormDialog({
  studioId,
  room,
  trigger
}: {
  readonly studioId: string
  readonly room?: RoomRow
  readonly trigger: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<RoomFormState>(toState(room))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editing = Boolean(room)

  const set = (field: keyof RoomFormState) => (value: string) =>
    setValues((current) => ({ ...current, [field]: value }))

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      setValues(toState(room))
      setError(null)
    }
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    const body = {
      name: values.name,
      widthMm: metresToMm(Number(values.width)),
      lengthMm: metresToMm(Number(values.length)),
      heightMm: values.height ? metresToMm(Number(values.height)) : null,
      notes: values.notes
    }
    try {
      await apiFetch(
        editing ? `/api/rooms/${room!.id}` : `/api/studios/${studioId}/rooms`,
        { method: editing ? 'PATCH' : 'POST', body }
      )
      setOpen(false)
      toast({ title: editing ? 'Room updated' : 'Room added' })
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const metresInput = (
    id: string,
    label: string,
    field: 'width' | 'length' | 'height',
    required: boolean
  ) => (
    <div className='space-y-2'>
      <Label htmlFor={id}>{label}</Label>
      <div className='relative'>
        <Input
          id={id}
          type='number'
          inputMode='decimal'
          step='0.01'
          min={field === 'height' ? 1 : 0.5}
          max={field === 'height' ? 30 : 100}
          value={values[field]}
          onChange={(event) => set(field)(event.target.value)}
          required={required}
          className='pr-8'
        />
        <span className='pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground'>
          m
        </span>
      </div>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className='space-y-4'>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit room' : 'New room'}</DialogTitle>
            <DialogDescription>
              Interior dimensions in metres. They set the scale for layouts.
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-2'>
            <Label htmlFor='room-name'>Name</Label>
            <Input
              id='room-name'
              value={values.name}
              onChange={(event) => set('name')(event.target.value)}
              placeholder='e.g. Live room A'
              maxLength={100}
              required
            />
          </div>
          <div className='grid grid-cols-3 gap-3'>
            {metresInput('room-width', 'Width', 'width', true)}
            {metresInput('room-length', 'Length', 'length', true)}
            {metresInput('room-height', 'Height', 'height', false)}
          </div>
          <div className='space-y-2'>
            <Label htmlFor='room-notes'>Notes</Label>
            <Textarea
              id='room-notes'
              value={values.notes}
              onChange={(event) => set('notes')(event.target.value)}
              placeholder='Treatment, tie lines, quirks…'
              maxLength={2000}
              rows={3}
            />
          </div>
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
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add room'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
