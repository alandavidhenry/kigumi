'use client'

import { Plug, Plus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { ConfirmDeleteButton } from '@/components/confirm-delete-button'
import { EmptyState } from '@/components/empty-state'
import {
  FormDialog,
  FormField,
  today
} from '@/components/maintenance/form-dialog'
import { ItemSelect, StateBadge } from '@/components/maintenance/shared'
import type { ItemOption } from '@/components/maintenance/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { apiFetch } from '@/lib/client-api'
import {
  PAT_STATE_LABELS,
  describePat,
  formatDay
} from '@/lib/maintenance/format'
import type { PatItemStatus } from '@/lib/maintenance/pat'
import {
  DEFAULT_PAT_INTERVAL_MONTHS,
  PAT_INTERVAL_MONTHS,
  PAT_RESULT_LABELS,
  PAT_RESULTS,
  PAT_TEST_TYPES,
  PAT_TEST_TYPE_LABELS
} from '@/lib/maintenance/types'

export function PatTestDialog({
  items,
  fixedItemId,
  trigger
}: {
  readonly items: ItemOption[]
  readonly fixedItemId?: string
  readonly trigger: React.ReactNode
}) {
  const [itemId, setItemId] = useState(fixedItemId ?? '')
  const [testedAt, setTestedAt] = useState(today())
  const [testType, setTestType] = useState('combined')
  const [result, setResult] = useState('pass')
  const [months, setMonths] = useState(String(DEFAULT_PAT_INTERVAL_MONTHS))
  const [tester, setTester] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')

  return (
    <FormDialog
      title='Record a PAT test'
      description='A pass schedules the next test. A fail keeps the item flagged until it is retested and passes.'
      successMessage='Test recorded'
      trigger={trigger}
      onOpen={() => {
        setItemId(fixedItemId ?? '')
        setTestedAt(today())
        setTestType('combined')
        setResult('pass')
        setMonths(String(DEFAULT_PAT_INTERVAL_MONTHS))
        setTester('')
        setReference('')
        setNotes('')
      }}
      onSubmit={async () => {
        await apiFetch('/api/pat', {
          method: 'POST',
          body: {
            equipmentItemId: itemId,
            testedAt,
            testType,
            result,
            intervalMonths: Number(months),
            testerName: tester,
            reference,
            notes
          }
        })
      }}
    >
      {!fixedItemId && (
        <FormField label='Item' htmlFor='pat-item'>
          <ItemSelect
            id='pat-item'
            value={itemId}
            onChange={setItemId}
            items={items}
          />
        </FormField>
      )}
      <div className='grid gap-4 sm:grid-cols-2'>
        <FormField label='Tested on' htmlFor='pat-date'>
          <Input
            id='pat-date'
            type='date'
            required
            max={today()}
            value={testedAt}
            onChange={(event) => setTestedAt(event.target.value)}
          />
        </FormField>
        <FormField label='Result' htmlFor='pat-result'>
          <NativeSelect
            id='pat-result'
            value={result}
            onChange={(event) => setResult(event.target.value)}
          >
            {PAT_RESULTS.map((value) => (
              <option key={value} value={value}>
                {PAT_RESULT_LABELS[value]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label='Type of test' htmlFor='pat-type'>
          <NativeSelect
            id='pat-type'
            value={testType}
            onChange={(event) => setTestType(event.target.value)}
          >
            {PAT_TEST_TYPES.map((value) => (
              <option key={value} value={value}>
                {PAT_TEST_TYPE_LABELS[value]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField
          label='Retest after'
          htmlFor='pat-interval'
          hint='The law sets no fixed interval; it depends on the equipment and where it is used.'
        >
          <NativeSelect
            id='pat-interval'
            value={months}
            onChange={(event) => setMonths(event.target.value)}
          >
            {PAT_INTERVAL_MONTHS.map((value) => (
              <option key={value} value={value}>
                {value} months
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label='Tested by' htmlFor='pat-tester'>
          <Input
            id='pat-tester'
            maxLength={100}
            value={tester}
            onChange={(event) => setTester(event.target.value)}
          />
        </FormField>
        <FormField label='Certificate / label no.' htmlFor='pat-ref'>
          <Input
            id='pat-ref'
            maxLength={100}
            value={reference}
            onChange={(event) => setReference(event.target.value)}
          />
        </FormField>
      </div>
      <FormField label='Notes' htmlFor='pat-notes'>
        <Textarea
          id='pat-notes'
          maxLength={1000}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </FormField>
    </FormDialog>
  )
}

export function RecordPatButton({
  items,
  fixedItemId,
  label = 'Record test'
}: {
  readonly items: ItemOption[]
  readonly fixedItemId?: string
  readonly label?: string
}) {
  return (
    <PatTestDialog
      items={items}
      fixedItemId={fixedItemId}
      trigger={
        <Button variant='surface' size='sm'>
          <Plus />
          {label}
        </Button>
      }
    />
  )
}

export function PatTable({
  tests,
  items,
  canManage
}: {
  readonly tests: PatItemStatus[]
  readonly items: ItemOption[]
  readonly canManage: boolean
}) {
  const router = useRouter()
  if (tests.length === 0) {
    return (
      <EmptyState
        icon={Plug}
        title='No PAT tests recorded'
        description='Record a test for any mains-powered item to start tracking when the next one is due.'
      />
    )
  }
  const remove = (id: string) => async () => {
    await apiFetch(`/api/pat/${id}`, { method: 'DELETE' })
    router.refresh()
  }
  return (
    <ul className='divide-y'>
      {tests.map((test) => (
        <li
          key={test.id}
          className='flex flex-wrap items-center justify-between gap-3 py-3'
        >
          <div className='min-w-0 space-y-0.5'>
            <Link
              href={`/inventory/${test.equipmentItemId}`}
              className='font-medium hover:underline'
            >
              {test.itemName}
            </Link>
            <p className='text-xs text-muted-foreground'>
              {describePat(test)} · tested {formatDay(test.testedAt)}
              {test.testerName && ` by ${test.testerName}`}
              {test.reference && ` · ${test.reference}`}
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <StateBadge
              state={test.state}
              label={PAT_STATE_LABELS[test.state]}
            />
            {canManage && (
              <>
                <PatTestDialog
                  items={items}
                  fixedItemId={test.equipmentItemId}
                  trigger={
                    <Button variant='surface' size='sm'>
                      Retest
                    </Button>
                  }
                />
                <ConfirmDeleteButton
                  title='Delete this test record?'
                  description='Only this test is deleted. An earlier test, if any, becomes the latest.'
                  label='Delete test'
                  size='icon'
                  onConfirm={remove(test.id)}
                />
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
