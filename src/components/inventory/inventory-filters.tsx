'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import type { RoomOption } from '@/lib/equipment'
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_CATEGORY_LABELS,
  EQUIPMENT_STATUSES,
  EQUIPMENT_STATUS_LABELS
} from '@/lib/equipment-types'

// Filters live in the URL so a filtered view can be shared and the CSV export
// link can reuse them.
export function InventoryFilters({ rooms }: { readonly rooms: RoomOption[] }) {
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

  // Debounce typing so each keystroke doesn't trigger a server render.
  const current = searchParams.get('q') ?? ''
  useEffect(() => {
    if (query === current) return
    const timer = setTimeout(() => update('q', query.trim()), 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  return (
    <div className='grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]'>
      <Input
        type='search'
        aria-label='Search equipment'
        placeholder='Search make, model, serial, supplier or tag…'
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <NativeSelect
        aria-label='Filter by category'
        value={searchParams.get('category') ?? ''}
        onChange={(event) => update('category', event.target.value)}
        className='sm:w-40'
      >
        <option value=''>All categories</option>
        {EQUIPMENT_CATEGORIES.map((key) => (
          <option key={key} value={key}>
            {EQUIPMENT_CATEGORY_LABELS[key]}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label='Filter by status'
        value={searchParams.get('status') ?? ''}
        onChange={(event) => update('status', event.target.value)}
        className='sm:w-36'
      >
        <option value=''>Any status</option>
        {EQUIPMENT_STATUSES.map((key) => (
          <option key={key} value={key}>
            {EQUIPMENT_STATUS_LABELS[key]}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label='Filter by location'
        value={searchParams.get('roomId') ?? ''}
        onChange={(event) => update('roomId', event.target.value)}
        className='sm:w-44'
      >
        <option value=''>Any location</option>
        {rooms.map((room) => (
          <option key={room.id} value={room.id}>
            {room.studioName} · {room.name}
          </option>
        ))}
      </NativeSelect>
    </div>
  )
}
