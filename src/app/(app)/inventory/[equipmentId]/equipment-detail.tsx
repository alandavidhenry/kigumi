'use client'

import { Pencil, Printer, Upload } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useRef, useState } from 'react'

import { ConfirmDeleteButton } from '@/components/confirm-delete-button'
import { EquipmentFormDialog } from '@/components/inventory/equipment-form-dialog'
import { PageHeader } from '@/components/page-header'
import { useBreadcrumbLabel } from '@/components/providers/breadcrumb-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/components/ui/use-toast'
import { apiFetch } from '@/lib/client-api'
import type { EquipmentDetail, RoomOption } from '@/lib/equipment'
import {
  EQUIPMENT_CATEGORY_LABELS,
  EQUIPMENT_STATUS_LABELS,
  MAX_PHOTOS_PER_ITEM
} from '@/lib/equipment-types'
import { formatMoney } from '@/lib/validation'

function Field({
  label,
  children
}: {
  readonly label: string
  readonly children: React.ReactNode
}) {
  return (
    <div>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='text-sm'>{children || '—'}</dd>
    </div>
  )
}

export function EquipmentDetailView({
  item,
  rooms,
  canManage
}: {
  readonly item: EquipmentDetail
  readonly rooms: RoomOption[]
  readonly canManage: boolean
}) {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const title = `${item.make} ${item.model}`
  useBreadcrumbLabel(`/inventory/${item.id}`, title)

  const remove = async () => {
    await apiFetch(`/api/equipment/${item.id}`, { method: 'DELETE' })
    toast({ title: 'Item deleted' })
    router.push('/inventory')
    router.refresh()
  }

  const removePhoto = (id: string) => async () => {
    await apiFetch(`/api/attachments/${id}`, { method: 'DELETE' })
    toast({ title: 'Photo removed' })
    router.refresh()
  }

  const upload = async (file: File) => {
    setUploading(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const response = await fetch(`/api/equipment/${item.id}/photos`, {
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

  // The QR needs the absolute URL, known only in the browser; rendering it
  // after mount avoids a server/client hydration mismatch.
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])
  const itemUrl = `${origin}/inventory/${item.id}`

  return (
    <div className='space-y-6'>
      <PageHeader
        title={title}
        description={`${EQUIPMENT_CATEGORY_LABELS[item.category]}${item.serial ? ` · S/N ${item.serial}` : ''}`}
        backHref='/inventory'
        backLabel='Inventory'
        actions={
          canManage && (
            <div className='flex gap-2'>
              <EquipmentFormDialog
                item={item}
                rooms={rooms}
                trigger={
                  <Button variant='surface'>
                    <Pencil />
                    Edit
                  </Button>
                }
              />
              <ConfirmDeleteButton
                title={`Delete ${title}?`}
                description='This permanently deletes the item and its photos.'
                label='Delete'
                size='default'
                onConfirm={remove}
              />
            </div>
          )
        }
      />

      <div className='grid gap-6 lg:grid-cols-[1fr_16rem]'>
        <div className='space-y-6'>
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className='grid grid-cols-2 gap-4 sm:grid-cols-3'>
                <Field label='Status'>
                  <Badge
                    variant={
                      item.status === 'in_service'
                        ? 'success'
                        : item.status === 'repair'
                          ? 'warning'
                          : 'secondary'
                    }
                  >
                    {EQUIPMENT_STATUS_LABELS[item.status]}
                  </Badge>
                </Field>
                <Field label='Quantity'>{item.quantity}</Field>
                <Field label='Location'>{item.roomName}</Field>
                <Field label='Purchased'>{item.purchaseDate}</Field>
                <Field label='Price each'>
                  {item.purchasePriceMinor === null
                    ? null
                    : formatMoney(item.purchasePriceMinor)}
                </Field>
                <Field label='Supplier'>{item.supplier}</Field>
              </dl>
              {item.tags.length > 0 && (
                <div className='mt-4 flex flex-wrap gap-1'>
                  {item.tags.map((tag) => (
                    <Badge key={tag} variant='outline'>
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
              {item.customFields && (
                <dl className='mt-4 grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-3'>
                  {Object.entries(item.customFields).map(([key, value]) => (
                    <Field key={key} label={key}>
                      {value}
                    </Field>
                  ))}
                </dl>
              )}
              {item.notes && (
                <p className='mt-4 whitespace-pre-line border-t pt-4 text-sm text-muted-foreground'>
                  {item.notes}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0'>
              <CardTitle>Photos</CardTitle>
              {canManage && item.photos.length < MAX_PHOTOS_PER_ITEM && (
                <>
                  <input
                    ref={fileInput}
                    type='file'
                    accept='image/jpeg,image/png,image/webp'
                    className='sr-only'
                    aria-label='Photo file'
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
              {item.photos.length === 0 ? (
                <p className='text-sm text-muted-foreground'>
                  No photos yet. JPEG, PNG or WebP up to 5 MB.
                </p>
              ) : (
                <ul className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
                  {item.photos.map((photo) => (
                    <li key={photo.id} className='group relative'>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/attachments/${photo.id}`}
                        alt={`${title} photo`}
                        className='aspect-square w-full rounded-md border object-cover'
                      />
                      {canManage && (
                        <div className='absolute right-1 top-1'>
                          <ConfirmDeleteButton
                            title='Remove this photo?'
                            description='The photo is permanently deleted.'
                            label='Remove photo'
                            size='icon'
                            onConfirm={removePhoto(photo.id)}
                          />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className='h-fit print:border-0 print:shadow-none'>
          <CardHeader>
            <CardTitle>Asset label</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div className='print-area flex flex-col items-center gap-2 rounded-md bg-white p-4 text-black'>
              {origin ? (
                <QRCodeSVG value={itemUrl} size={144} marginSize={0} />
              ) : (
                <div className='h-36 w-36' />
              )}
              <p className='text-center text-xs font-medium'>{title}</p>
              {item.serial && (
                <p className='font-mono text-[10px]'>S/N {item.serial}</p>
              )}
            </div>
            <Button
              variant='surface'
              className='w-full print:hidden'
              onClick={() => window.print()}
            >
              <Printer />
              Print label
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
