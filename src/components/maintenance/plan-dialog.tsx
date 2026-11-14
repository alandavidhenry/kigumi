'use client'

import { useState } from 'react'

import { FormDialog, FormField } from '@/components/maintenance/form-dialog'
import { ItemSelect } from '@/components/maintenance/shared'
import type { ItemOption } from '@/components/maintenance/shared'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { UpgradeNotice } from '@/components/upgrade-notice'
import { apiFetch } from '@/lib/client-api'
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_CATEGORY_LABELS
} from '@/lib/equipment-types'
import type { PlanRow } from '@/lib/maintenance/service'

interface State {
  target: 'item' | 'category'
  equipmentItemId: string
  category: string
  title: string
  intervalDays: string
  intervalHours: string
  leadDays: string
  startsOn: string
  notes: string
  active: boolean
}

const blank = (itemId = ''): State => ({
  target: 'item',
  equipmentItemId: itemId,
  category: 'microphone',
  title: '',
  intervalDays: '90',
  intervalHours: '',
  leadDays: '14',
  startsOn: '',
  notes: '',
  active: true
})

function fromPlan(plan: PlanRow): State {
  return {
    target: plan.equipmentItemId ? 'item' : 'category',
    equipmentItemId: plan.equipmentItemId ?? '',
    category: plan.category ?? 'microphone',
    title: plan.title,
    intervalDays: plan.intervalDays?.toString() ?? '',
    intervalHours: plan.intervalHours?.toString() ?? '',
    leadDays: String(plan.leadDays),
    startsOn: plan.startsOn ?? '',
    notes: plan.notes ?? '',
    active: plan.active
  }
}

const intOrNull = (value: string) => (value.trim() ? Number(value) : null)

// Create or edit a maintenance plan. What a plan covers (one item or a whole
// category) is chosen at creation and cannot change afterwards.
export function PlanDialog({
  plan,
  items,
  fixedItemId,
  hoursAllowed,
  trigger
}: {
  readonly plan?: PlanRow
  readonly items: ItemOption[]
  readonly fixedItemId?: string
  readonly hoursAllowed: boolean
  readonly trigger: React.ReactNode
}) {
  const [values, setValues] = useState<State>(
    plan ? fromPlan(plan) : blank(fixedItemId)
  )
  const set = (field: keyof State) => (value: string | boolean) =>
    setValues((current) => ({ ...current, [field]: value }))

  const submit = async () => {
    const shared = {
      title: values.title,
      notes: values.notes,
      intervalDays: intOrNull(values.intervalDays),
      intervalHours: intOrNull(values.intervalHours),
      leadDays: Number(values.leadDays),
      startsOn: values.startsOn || null,
      active: values.active
    }
    if (plan) {
      await apiFetch(`/api/maintenance/plans/${plan.id}`, {
        method: 'PATCH',
        body: shared
      })
    } else {
      await apiFetch('/api/maintenance/plans', {
        method: 'POST',
        body: {
          ...shared,
          ...(values.target === 'item'
            ? { equipmentItemId: values.equipmentItemId }
            : { category: values.category })
        }
      })
    }
  }

  return (
    <FormDialog
      title={plan ? 'Edit maintenance plan' : 'New maintenance plan'}
      description='Repeats by time, by usage hours, or both. Whichever comes first makes the task due.'
      trigger={trigger}
      successMessage={plan ? 'Plan updated' : 'Plan created'}
      onOpen={() => setValues(plan ? fromPlan(plan) : blank(fixedItemId))}
      onSubmit={submit}
    >
      <FormField label='Title' htmlFor='plan-title'>
        <Input
          id='plan-title'
          required
          maxLength={120}
          placeholder='e.g. Clean capsule and check cable'
          value={values.title}
          onChange={(event) => set('title')(event.target.value)}
        />
      </FormField>

      {!plan && !fixedItemId && (
        <>
          <FormField label='Applies to' htmlFor='plan-target'>
            <NativeSelect
              id='plan-target'
              value={values.target}
              onChange={(event) => set('target')(event.target.value)}
            >
              <option value='item'>One item</option>
              <option value='category'>Every item in a category</option>
            </NativeSelect>
          </FormField>
          {values.target === 'item' ? (
            <FormField label='Item' htmlFor='plan-item'>
              <ItemSelect
                id='plan-item'
                value={values.equipmentItemId}
                onChange={set('equipmentItemId')}
                items={items}
              />
            </FormField>
          ) : (
            <FormField
              label='Category'
              htmlFor='plan-category'
              hint='Retired items are skipped. Items added later are picked up by the daily job or the next edit of this plan.'
            >
              <NativeSelect
                id='plan-category'
                value={values.category}
                onChange={(event) => set('category')(event.target.value)}
              >
                {EQUIPMENT_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {EQUIPMENT_CATEGORY_LABELS[category]}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          )}
        </>
      )}

      <div className='grid gap-5 sm:grid-cols-2'>
        <FormField label='Every (days)' htmlFor='plan-days'>
          <Input
            id='plan-days'
            type='number'
            min={1}
            max={3650}
            value={values.intervalDays}
            onChange={(event) => set('intervalDays')(event.target.value)}
          />
        </FormField>
        <FormField label='Every (usage hours)' htmlFor='plan-hours'>
          <Input
            id='plan-hours'
            type='number'
            min={1}
            disabled={!hoursAllowed}
            value={values.intervalHours}
            onChange={(event) => set('intervalHours')(event.target.value)}
          />
        </FormField>
      </div>
      {!hoursAllowed && (
        <UpgradeNotice
          compact
          title='Usage-hour maintenance is on the Studio plan'
          planLabel='Studio'
        />
      )}

      <div className='grid gap-5 sm:grid-cols-2'>
        <FormField
          label='Remind me (days before)'
          htmlFor='plan-lead'
          hint='Also the “due soon” window.'
        >
          <Input
            id='plan-lead'
            type='number'
            min={0}
            max={365}
            required
            value={values.leadDays}
            onChange={(event) => set('leadDays')(event.target.value)}
          />
        </FormField>
        <FormField
          label='Start counting from'
          htmlFor='plan-start'
          hint='Blank means today.'
        >
          <Input
            id='plan-start'
            type='date'
            value={values.startsOn}
            onChange={(event) => set('startsOn')(event.target.value)}
          />
        </FormField>
      </div>

      <FormField label='Notes' htmlFor='plan-notes'>
        <Textarea
          id='plan-notes'
          maxLength={1000}
          value={values.notes}
          onChange={(event) => set('notes')(event.target.value)}
        />
      </FormField>

      {plan && (
        <label className='flex items-center gap-2 text-sm'>
          <input
            type='checkbox'
            checked={values.active}
            onChange={(event) => set('active')(event.target.checked)}
          />
          Active (inactive plans raise no tasks or reminders)
        </label>
      )}
    </FormDialog>
  )
}
