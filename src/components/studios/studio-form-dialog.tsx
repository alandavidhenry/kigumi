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

export interface StudioFormValues {
  id?: string
  name: string
  address: string | null
  timezone: string
  notes?: string | null
}

const EMPTY: StudioFormValues = {
  name: '',
  address: null,
  timezone: 'Europe/London',
  notes: null
}

export function StudioFormDialog({
  studio,
  trigger
}: {
  readonly studio?: StudioFormValues
  readonly trigger: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<StudioFormValues>(studio ?? EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editing = Boolean(studio?.id)

  const set = (field: keyof StudioFormValues) => (value: string) =>
    setValues((current) => ({ ...current, [field]: value }))

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      setValues(studio ?? EMPTY)
      setError(null)
    }
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    const body = {
      name: values.name,
      address: values.address,
      timezone: values.timezone,
      notes: values.notes
    }
    try {
      if (editing) {
        await apiFetch(`/api/studios/${studio!.id}`, { method: 'PATCH', body })
      } else {
        const { studio: created } = await apiFetch<{ studio: { id: string } }>(
          '/api/studios',
          { method: 'POST', body }
        )
        router.push(`/studios/${created.id}`)
      }
      setOpen(false)
      toast({ title: editing ? 'Studio updated' : 'Studio created' })
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className='space-y-4'>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit studio' : 'New studio'}</DialogTitle>
            <DialogDescription>
              A studio is a building or site. Rooms belong to a studio.
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-2'>
            <Label htmlFor='studio-name'>Name</Label>
            <Input
              id='studio-name'
              value={values.name}
              onChange={(event) => set('name')(event.target.value)}
              maxLength={100}
              required
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='studio-address'>Address</Label>
            <Input
              id='studio-address'
              value={values.address ?? ''}
              onChange={(event) => set('address')(event.target.value)}
              maxLength={300}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='studio-timezone'>Time zone</Label>
            <Input
              id='studio-timezone'
              value={values.timezone}
              onChange={(event) => set('timezone')(event.target.value)}
              placeholder='Europe/London'
              required
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='studio-notes'>Notes</Label>
            <Textarea
              id='studio-notes'
              value={values.notes ?? ''}
              onChange={(event) => set('notes')(event.target.value)}
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
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create studio'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
