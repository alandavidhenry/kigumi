'use client'

import Link from 'next/link'

import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'

import type { ConsoleChoice } from './types'

export function RecallStep({
  consoles,
  consoleId,
  onConsole
}: {
  readonly consoles: readonly ConsoleChoice[]
  readonly consoleId: string
  readonly onConsole: (id: string) => void
}) {
  if (consoles.length === 0) {
    return (
      <p className='text-sm text-muted-foreground'>
        A recall sheet records the desk settings for each input. You have no
        console yet.{' '}
        <Link href='/setup?step=desk' className='underline'>
          Add your desk
        </Link>{' '}
        or skip this step and add one later.
      </p>
    )
  }
  return (
    <div className='max-w-md space-y-1.5'>
      <Label htmlFor='w-console'>Console</Label>
      <NativeSelect
        id='w-console'
        className='h-9'
        value={consoleId}
        onChange={(e) => onConsole(e.target.value)}
      >
        <option value=''>Skip the recall sheet</option>
        {consoles.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.detail ? ` (${c.detail})` : ''}
          </option>
        ))}
      </NativeSelect>
      <p className='text-xs text-muted-foreground'>
        A recall sheet is made from the input list so you can note the desk
        settings.
      </p>
    </div>
  )
}
