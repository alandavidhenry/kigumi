'use client'

import { Pencil } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { FormError } from '@/components/auth/auth-card'
import { ConfirmDeleteButton } from '@/components/confirm-delete-button'
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
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/use-toast'
import { apiFetch } from '@/lib/client-api'
import type { LockerUnit } from '@/lib/mics/locker'
import { MIC_CONDITIONS, MIC_CONDITION_LABELS } from '@/lib/mics/types'

export function LockerUnitActions({ unit }: { readonly unit: LockerUnit }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [serial, setSerial] = useState(unit.serial ?? '')
  const [condition, setCondition] = useState<string>(unit.condition)
  const [pair, setPair] = useState(unit.matchedPairGroup ?? '')
  const [notes, setNotes] = useState(unit.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const name = `${unit.manufacturer} ${unit.model}`

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      setSerial(unit.serial ?? '')
      setCondition(unit.condition)
      setPair(unit.matchedPairGroup ?? '')
      setNotes(unit.notes ?? '')
      setError(null)
    }
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await apiFetch(`/api/locker/${unit.id}`, {
        method: 'PATCH',
        body: { serial, condition, matchedPairGroup: pair, notes }
      })
      setOpen(false)
      toast({ title: 'Unit updated' })
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    await apiFetch(`/api/locker/${unit.id}`, { method: 'DELETE' })
    toast({ title: 'Removed from mic locker' })
    router.refresh()
  }

  return (
    <div className='flex items-center gap-1'>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger asChild>
          <Button variant='ghost' size='icon' aria-label={`Edit ${name}`}>
            <Pencil />
          </Button>
        </DialogTrigger>
        <DialogContent className='sm:max-w-md'>
          <form onSubmit={onSubmit} className='space-y-4'>
            <DialogHeader>
              <DialogTitle>Edit {name}</DialogTitle>
              <DialogDescription>
                Matched pairs must be the same model. The inventory item keeps
                its own record.
              </DialogDescription>
            </DialogHeader>
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-2'>
                <Label htmlFor='unit-serial'>Serial number</Label>
                <Input
                  id='unit-serial'
                  value={serial}
                  maxLength={100}
                  onChange={(event) => setSerial(event.target.value)}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='unit-condition'>Condition</Label>
                <NativeSelect
                  id='unit-condition'
                  value={condition}
                  onChange={(event) => setCondition(event.target.value)}
                >
                  {MIC_CONDITIONS.map((key) => (
                    <option key={key} value={key}>
                      {MIC_CONDITION_LABELS[key]}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='unit-pair'>Matched pair group</Label>
              <Input
                id='unit-pair'
                value={pair}
                maxLength={60}
                onChange={(event) => setPair(event.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='unit-notes'>Notes</Label>
              <Textarea
                id='unit-notes'
                value={notes}
                maxLength={2000}
                rows={3}
                onChange={(event) => setNotes(event.target.value)}
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
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDeleteButton
        size='icon'
        label={`Remove ${name}`}
        title={`Remove ${name} from the locker?`}
        description='The inventory item stays; only its link to the catalogue is removed.'
        confirmLabel='Remove'
        onConfirm={remove}
      />
    </div>
  )
}
