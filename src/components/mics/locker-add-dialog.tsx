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
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/use-toast'
import { apiFetch } from '@/lib/client-api'
import type { RoomOption } from '@/lib/equipment'
import type { MicSummary } from '@/lib/mics/catalogue'
import type { UnlinkedMicrophone } from '@/lib/mics/locker'
import { MIC_CONDITIONS, MIC_CONDITION_LABELS } from '@/lib/mics/types'

const NEW_ITEM = ''

// Adds a catalogue microphone to the studio's locker. Either links an existing
// microphone from the inventory or creates the inventory item from the model.
export function LockerAddDialog({
  micModelId,
  mics,
  unlinked,
  rooms,
  trigger
}: {
  // Fix the model (mic page), or pass `mics` to let the user pick (locker).
  readonly micModelId?: string
  readonly mics?: MicSummary[]
  readonly unlinked: UnlinkedMicrophone[]
  readonly rooms: RoomOption[]
  readonly trigger: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [model, setModel] = useState(micModelId ?? mics?.[0]?.id ?? '')
  const [item, setItem] = useState(NEW_ITEM)
  const [serial, setSerial] = useState('')
  const [condition, setCondition] = useState('good')
  const [pair, setPair] = useState('')
  const [roomId, setRoomId] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await apiFetch('/api/locker', {
        method: 'POST',
        body: {
          micModelId: model,
          equipmentItemId: item || null,
          serial,
          condition,
          matchedPairGroup: pair,
          roomId: item ? null : roomId || null,
          notes
        }
      })
      setOpen(false)
      toast({ title: 'Added to your mic locker' })
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-lg'>
        <form onSubmit={onSubmit} className='space-y-4'>
          <DialogHeader>
            <DialogTitle>Add to mic locker</DialogTitle>
            <DialogDescription>
              Link a microphone you own to its catalogue entry, so its specs and
              patterns are used for planning.
            </DialogDescription>
          </DialogHeader>

          {mics && (
            <div className='space-y-2'>
              <Label htmlFor='locker-model'>Microphone model</Label>
              <NativeSelect
                id='locker-model'
                value={model}
                onChange={(event) => setModel(event.target.value)}
              >
                {mics.map((mic) => (
                  <option key={mic.id} value={mic.id}>
                    {mic.manufacturer} {mic.model}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}

          <div className='space-y-2'>
            <Label htmlFor='locker-item'>Inventory item</Label>
            <NativeSelect
              id='locker-item'
              value={item}
              onChange={(event) => setItem(event.target.value)}
            >
              <option value={NEW_ITEM}>Create a new inventory item</option>
              {unlinked.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.make} {entry.model}
                  {entry.serial ? ` · S/N ${entry.serial}` : ''}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-2'>
              <Label htmlFor='locker-serial'>Serial number</Label>
              <Input
                id='locker-serial'
                value={serial}
                maxLength={100}
                onChange={(event) => setSerial(event.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='locker-condition'>Condition</Label>
              <NativeSelect
                id='locker-condition'
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
            <div className='space-y-2'>
              <Label htmlFor='locker-pair'>Matched pair group</Label>
              <Input
                id='locker-pair'
                value={pair}
                maxLength={60}
                placeholder='e.g. KM184 pair A'
                onChange={(event) => setPair(event.target.value)}
              />
            </div>
            {!item && (
              <div className='space-y-2'>
                <Label htmlFor='locker-room'>Location</Label>
                <NativeSelect
                  id='locker-room'
                  value={roomId}
                  onChange={(event) => setRoomId(event.target.value)}
                >
                  <option value=''>Unassigned</option>
                  {rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.studioName} · {room.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
          </div>

          <div className='space-y-2'>
            <Label htmlFor='locker-notes'>Notes</Label>
            <Textarea
              id='locker-notes'
              value={notes}
              maxLength={2000}
              rows={2}
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
            <Button type='submit' disabled={saving || !model}>
              {saving ? 'Adding…' : 'Add to locker'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
