'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import {
  MIC_PATTERN_LABELS,
  MIC_POLAR_PATTERNS,
  MIC_POWERING,
  MIC_POWERING_LABELS,
  MIC_STATUSES,
  MIC_STATUS_LABELS,
  MIC_TRANSDUCER_LABELS,
  MIC_TRANSDUCER_TYPES
} from '@/lib/mics/types'

// Catalogue filters live in the URL so a filtered view can be shared. The
// admin queue reuses this with `withStatus`.
export function MicFilters({
  withStatus = false
}: {
  readonly withStatus?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') ?? '')

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)
  }

  const current = searchParams.get('q') ?? ''
  useEffect(() => {
    if (query === current) return
    const timer = setTimeout(() => update('q', query.trim()), 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  return (
    <div className='grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto]'>
      <Input
        type='search'
        aria-label='Search microphones'
        placeholder='Search maker or model…'
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <NativeSelect
        aria-label='Filter by type'
        value={searchParams.get('transducerType') ?? ''}
        onChange={(event) => update('transducerType', event.target.value)}
        className='sm:w-44'
      >
        <option value=''>Any type</option>
        {MIC_TRANSDUCER_TYPES.map((key) => (
          <option key={key} value={key}>
            {MIC_TRANSDUCER_LABELS[key]}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label='Filter by pattern'
        value={searchParams.get('pattern') ?? ''}
        onChange={(event) => update('pattern', event.target.value)}
        className='sm:w-40'
      >
        <option value=''>Any pattern</option>
        {MIC_POLAR_PATTERNS.map((key) => (
          <option key={key} value={key}>
            {MIC_PATTERN_LABELS[key]}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label='Filter by powering'
        value={searchParams.get('powering') ?? ''}
        onChange={(event) => update('powering', event.target.value)}
        className='sm:w-40'
      >
        <option value=''>Any powering</option>
        {MIC_POWERING.map((key) => (
          <option key={key} value={key}>
            {MIC_POWERING_LABELS[key]}
          </option>
        ))}
      </NativeSelect>
      {withStatus && (
        <NativeSelect
          aria-label='Filter by status'
          value={searchParams.get('status') ?? ''}
          onChange={(event) => update('status', event.target.value)}
          className='sm:w-36'
        >
          <option value=''>Any status</option>
          {MIC_STATUSES.map((key) => (
            <option key={key} value={key}>
              {MIC_STATUS_LABELS[key]}
            </option>
          ))}
        </NativeSelect>
      )}
    </div>
  )
}
