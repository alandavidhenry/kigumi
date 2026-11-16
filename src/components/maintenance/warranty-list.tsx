'use client'

import { FileCheck2, Pencil, Plus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { ConfirmDeleteButton } from '@/components/confirm-delete-button'
import { EmptyState } from '@/components/empty-state'
import { FormDialog, FormField } from '@/components/maintenance/form-dialog'
import {
  FileList,
  ItemSelect,
  StateBadge
} from '@/components/maintenance/shared'
import type { ItemOption } from '@/components/maintenance/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { apiFetch } from '@/lib/client-api'
import {
  WARRANTY_STATE_LABELS,
  describeWarranty
} from '@/lib/maintenance/format'
import { DEFAULT_WARRANTY_LEAD_DAYS } from '@/lib/maintenance/types'
import type { WarrantyRow } from '@/lib/maintenance/warranty'

interface State {
  itemId: string
  startsOn: string
  endsOn: string
  provider: string
  reference: string
  terms: string
  leadDays: string
}

const toState = (warranty?: WarrantyRow, itemId = ''): State => ({
  itemId: warranty?.equipmentItemId ?? itemId,
  startsOn: warranty?.startsOn ?? '',
  endsOn: warranty?.endsOn ?? '',
  provider: warranty?.provider ?? '',
  reference: warranty?.reference ?? '',
  terms: warranty?.terms ?? '',
  leadDays: String(warranty?.leadDays ?? DEFAULT_WARRANTY_LEAD_DAYS)
})

export function WarrantyDialog({
  warranty,
  items,
  fixedItemId,
  trigger
}: {
  readonly warranty?: WarrantyRow
  readonly items: ItemOption[]
  readonly fixedItemId?: string
  readonly trigger: React.ReactNode
}) {
  const [values, setValues] = useState<State>(toState(warranty, fixedItemId))
  const set = (field: keyof State) => (value: string) =>
    setValues((current) => ({ ...current, [field]: value }))

  return (
    <FormDialog
      title={warranty ? 'Edit warranty' : 'Add a warranty'}
      description='Attach the receipt after saving.'
      successMessage={warranty ? 'Warranty updated' : 'Warranty added'}
      trigger={trigger}
      onOpen={() => setValues(toState(warranty, fixedItemId))}
      onSubmit={async () => {
        const body = {
          startsOn: values.startsOn || null,
          endsOn: values.endsOn,
          provider: values.provider,
          reference: values.reference,
          terms: values.terms,
          leadDays: Number(values.leadDays)
        }
        if (warranty) {
          await apiFetch(`/api/warranties/${warranty.id}`, {
            method: 'PATCH',
            body
          })
        } else {
          await apiFetch('/api/warranties', {
            method: 'POST',
            body: { ...body, equipmentItemId: values.itemId }
          })
        }
      }}
    >
      {!warranty && !fixedItemId && (
        <FormField label='Item' htmlFor='warranty-item'>
          <ItemSelect
            id='warranty-item'
            value={values.itemId}
            onChange={set('itemId')}
            items={items}
          />
        </FormField>
      )}
      <div className='grid gap-5 sm:grid-cols-2'>
        <FormField label='Starts' htmlFor='warranty-start'>
          <Input
            id='warranty-start'
            type='date'
            value={values.startsOn}
            onChange={(event) => set('startsOn')(event.target.value)}
          />
        </FormField>
        <FormField label='Ends' htmlFor='warranty-end'>
          <Input
            id='warranty-end'
            type='date'
            required
            value={values.endsOn}
            onChange={(event) => set('endsOn')(event.target.value)}
          />
        </FormField>
        <FormField label='Provider' htmlFor='warranty-provider'>
          <Input
            id='warranty-provider'
            maxLength={150}
            value={values.provider}
            onChange={(event) => set('provider')(event.target.value)}
          />
        </FormField>
        <FormField label='Reference' htmlFor='warranty-ref'>
          <Input
            id='warranty-ref'
            maxLength={100}
            value={values.reference}
            onChange={(event) => set('reference')(event.target.value)}
          />
        </FormField>
      </div>
      <FormField
        label='Remind me (days before it ends)'
        htmlFor='warranty-lead'
      >
        <Input
          id='warranty-lead'
          type='number'
          min={0}
          max={365}
          required
          value={values.leadDays}
          onChange={(event) => set('leadDays')(event.target.value)}
        />
      </FormField>
      <FormField label='Terms' htmlFor='warranty-terms'>
        <Textarea
          id='warranty-terms'
          maxLength={2000}
          value={values.terms}
          onChange={(event) => set('terms')(event.target.value)}
        />
      </FormField>
    </FormDialog>
  )
}

export function AddWarrantyButton({
  items,
  fixedItemId
}: {
  readonly items: ItemOption[]
  readonly fixedItemId?: string
}) {
  return (
    <WarrantyDialog
      items={items}
      fixedItemId={fixedItemId}
      trigger={
        <Button variant='surface' size='sm'>
          <Plus />
          Add warranty
        </Button>
      }
    />
  )
}

export function WarrantyList({
  warranties,
  items,
  canManage,
  showItem = true
}: {
  readonly warranties: WarrantyRow[]
  readonly items: ItemOption[]
  readonly canManage: boolean
  readonly showItem?: boolean
}) {
  const router = useRouter()
  if (warranties.length === 0) {
    return (
      <EmptyState
        icon={FileCheck2}
        title='No warranties recorded'
        description='Add the cover dates, provider and receipt, and get a reminder before it ends.'
      />
    )
  }
  const remove = (id: string) => async () => {
    await apiFetch(`/api/warranties/${id}`, { method: 'DELETE' })
    router.refresh()
  }
  return (
    <ul className='divide-y'>
      {warranties.map((warranty) => (
        <li key={warranty.id} className='space-y-2 py-3'>
          <div className='flex flex-wrap items-start justify-between gap-2'>
            <div className='min-w-0 space-y-0.5'>
              <p className='font-medium'>
                {showItem ? (
                  <Link
                    href={`/inventory/${warranty.equipmentItemId}`}
                    className='hover:underline'
                  >
                    {warranty.itemName}
                  </Link>
                ) : (
                  (warranty.provider ?? 'Warranty')
                )}
              </p>
              <p className='text-xs text-muted-foreground'>
                {describeWarranty(warranty)}
                {showItem && warranty.provider && ` · ${warranty.provider}`}
                {warranty.reference && ` · ref ${warranty.reference}`}
              </p>
            </div>
            <div className='flex items-center gap-2'>
              <StateBadge
                state={warranty.state}
                label={WARRANTY_STATE_LABELS[warranty.state]}
              />
              {canManage && (
                <>
                  <WarrantyDialog
                    warranty={warranty}
                    items={items}
                    trigger={
                      <Button
                        variant='ghost'
                        size='icon'
                        aria-label='Edit warranty'
                      >
                        <Pencil />
                      </Button>
                    }
                  />
                  <ConfirmDeleteButton
                    title='Delete this warranty?'
                    description='The warranty record and its receipts are permanently deleted.'
                    label='Delete warranty'
                    size='icon'
                    onConfirm={remove(warranty.id)}
                  />
                </>
              )}
            </div>
          </div>
          {warranty.terms && (
            <p className='whitespace-pre-line text-sm text-muted-foreground'>
              {warranty.terms}
            </p>
          )}
          <FileList
            files={warranty.files}
            canManage={canManage}
            uploadUrl={`/api/warranties/${warranty.id}/files`}
            label='Attach receipt'
          />
        </li>
      ))}
    </ul>
  )
}
