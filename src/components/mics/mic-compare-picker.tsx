'use client'

import { Plus, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { MAX_COMPARE, MIN_COMPARE } from '@/lib/mics/compare'

export interface MicOption {
  slug: string
  label: string
}

// Chooses the 2 to 4 microphones to compare. The choice lives in the URL
// (?mics=a,b) so a comparison can be shared and bookmarked.
export function MicComparePicker({
  options,
  selected
}: {
  readonly options: readonly MicOption[]
  readonly selected: readonly string[]
}) {
  const router = useRouter()
  const [pending, setPending] = useState('')

  const go = (slugs: readonly string[]) =>
    router.push(
      slugs.length > 0
        ? `/mics/compare?mics=${slugs.join(',')}`
        : '/mics/compare'
    )

  const labelOf = (slug: string) =>
    options.find((option) => option.slug === slug)?.label ?? slug
  const available = options.filter((option) => !selected.includes(option.slug))
  const full = selected.length >= MAX_COMPARE

  return (
    <div className='space-y-3'>
      {selected.length > 0 && (
        <ul className='flex flex-wrap gap-2' aria-label='Selected microphones'>
          {selected.map((slug) => (
            <li
              key={slug}
              className='flex items-center gap-1 rounded-md border bg-card py-1 pl-3 pr-1 text-sm'
            >
              {labelOf(slug)}
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='h-6 w-6'
                aria-label={`Remove ${labelOf(slug)}`}
                onClick={() => go(selected.filter((s) => s !== slug))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className='flex flex-wrap items-end gap-2'>
        <div className='min-w-56 flex-1 space-y-1 sm:max-w-sm'>
          <Label htmlFor='compare-add'>Add a microphone</Label>
          <NativeSelect
            id='compare-add'
            value={pending}
            disabled={full}
            onChange={(event) => setPending(event.target.value)}
          >
            <option value=''>
              {full ? 'Up to 4 microphones' : 'Choose a microphone…'}
            </option>
            {available.map((option) => (
              <option key={option.slug} value={option.slug}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button
          type='button'
          variant='surface'
          disabled={!pending || full}
          onClick={() => {
            go([...selected, pending])
            setPending('')
          }}
        >
          <Plus />
          Add
        </Button>
      </div>
      {selected.length < MIN_COMPARE && (
        <p className='text-sm text-muted-foreground'>
          Choose at least {MIN_COMPARE} microphones to compare.
        </p>
      )}
    </div>
  )
}
