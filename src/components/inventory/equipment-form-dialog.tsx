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
import type { EquipmentRow, RoomOption } from '@/lib/equipment'
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_CATEGORY_LABELS,
  EQUIPMENT_STATUSES,
  EQUIPMENT_STATUS_LABELS
} from '@/lib/equipment-types'
import { majorToMinor, minorToMajor } from '@/lib/validation'

interface FormState {
  category: string
  make: string
  model: string
  serial: string
  quantity: string
  status: string
  roomId: string
  purchaseDate: string
  price: string
  supplier: string
  tags: string
  customFields: string
  notes: string
}

function toState(item?: EquipmentRow): FormState {
  return {
    category: item?.category ?? 'microphone',
    make: item?.make ?? '',
    model: item?.model ?? '',
    serial: item?.serial ?? '',
    quantity: String(item?.quantity ?? 1),
    status: item?.status ?? 'in_service',
    roomId: item?.roomId ?? '',
    purchaseDate: item?.purchaseDate ?? '',
    price:
      item?.purchasePriceMinor === null ||
      item?.purchasePriceMinor === undefined
        ? ''
        : minorToMajor(item.purchasePriceMinor).toFixed(2),
    supplier: item?.supplier ?? '',
    tags: item?.tags.join(', ') ?? '',
    customFields: Object.entries(item?.customFields ?? {})
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n'),
    notes: item?.notes ?? ''
  }
}

// "Key: value" per line -> record. Lines without a colon are ignored.
export function parseCustomFields(text: string): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const index = line.indexOf(':')
    if (index < 1) continue
    const key = line.slice(0, index).trim()
    if (key) fields[key] = line.slice(index + 1).trim()
  }
  return fields
}

export function EquipmentFormDialog({
  item,
  rooms,
  trigger
}: {
  readonly item?: EquipmentRow
  readonly rooms: RoomOption[]
  readonly trigger: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<FormState>(toState(item))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editing = Boolean(item)

  const set = (field: keyof FormState) => (value: string) =>
    setValues((current) => ({ ...current, [field]: value }))

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      setValues(toState(item))
      setError(null)
    }
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    const body = {
      category: values.category,
      make: values.make,
      model: values.model,
      serial: values.serial,
      quantity: Number(values.quantity),
      status: values.status,
      roomId: values.roomId || null,
      purchaseDate: values.purchaseDate || null,
      purchasePriceMinor: values.price
        ? majorToMinor(Number(values.price))
        : null,
      supplier: values.supplier,
      tags: values.tags
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
      customFields: parseCustomFields(values.customFields),
      notes: values.notes
    }
    try {
      await apiFetch(
        editing ? `/api/equipment/${item!.id}` : '/api/equipment',
        {
          method: editing ? 'PATCH' : 'POST',
          body
        }
      )
      setOpen(false)
      toast({ title: editing ? 'Item updated' : 'Item added' })
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save')
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
        value={values[field]}
        onChange={(event) => set(field)(event.target.value)}
        {...props}
      />
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-xl'>
        <form onSubmit={onSubmit} className='space-y-4'>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit item' : 'Add equipment'}</DialogTitle>
            <DialogDescription>
              Gear the studio owns. Use quantity for cables, stands and other
              accessories instead of one row each.
            </DialogDescription>
          </DialogHeader>

          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-2'>
              <Label htmlFor='eq-category'>Category</Label>
              <NativeSelect
                id='eq-category'
                value={values.category}
                onChange={(event) => set('category')(event.target.value)}
              >
                {EQUIPMENT_CATEGORIES.map((key) => (
                  <option key={key} value={key}>
                    {EQUIPMENT_CATEGORY_LABELS[key]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='eq-status'>Status</Label>
              <NativeSelect
                id='eq-status'
                value={values.status}
                onChange={(event) => set('status')(event.target.value)}
              >
                {EQUIPMENT_STATUSES.map((key) => (
                  <option key={key} value={key}>
                    {EQUIPMENT_STATUS_LABELS[key]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            {text('eq-make', 'Make', 'make', {
              required: true,
              maxLength: 100,
              placeholder: 'e.g. Neumann'
            })}
            {text('eq-model', 'Model', 'model', {
              required: true,
              maxLength: 100,
              placeholder: 'e.g. U 87 Ai'
            })}
            {text('eq-serial', 'Serial number', 'serial', { maxLength: 100 })}
            {text('eq-quantity', 'Quantity', 'quantity', {
              type: 'number',
              min: 1,
              max: 10000,
              step: 1,
              required: true
            })}
            <div className='space-y-2'>
              <Label htmlFor='eq-room'>Location</Label>
              <NativeSelect
                id='eq-room'
                value={values.roomId}
                onChange={(event) => set('roomId')(event.target.value)}
              >
                <option value=''>Unassigned</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.studioName} · {room.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            {text('eq-supplier', 'Supplier', 'supplier', { maxLength: 150 })}
            {text('eq-date', 'Purchase date', 'purchaseDate', { type: 'date' })}
            {text('eq-price', 'Price each (£)', 'price', {
              type: 'number',
              inputMode: 'decimal',
              min: 0,
              step: '0.01'
            })}
          </div>

          {text('eq-tags', 'Tags', 'tags', {
            placeholder: 'vocal, tube, vintage (comma separated)'
          })}
          <div className='space-y-2'>
            <Label htmlFor='eq-custom'>Custom fields</Label>
            <Textarea
              id='eq-custom'
              value={values.customFields}
              onChange={(event) => set('customFields')(event.target.value)}
              placeholder={'One per line, e.g.\nPower: Phantom\nColour: Nickel'}
              rows={3}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='eq-notes'>Notes</Label>
            <Textarea
              id='eq-notes'
              value={values.notes}
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
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
