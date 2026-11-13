'use client'

import { Minus, Plus, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { FormError } from '@/components/auth/auth-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { toast } from '@/components/ui/use-toast'
import { apiFetch } from '@/lib/client-api'
import type { MicSummary } from '@/lib/mics/catalogue'

interface Row {
  micModelId: string
  name: string
  quantity: number
  matched: boolean
}

const MAX_ROWS = 24
const MAX_UNITS = 48
const MAX_QUANTITY = 12
const STEPPER = 'size-9 min-h-9 min-w-9 shrink-0 p-0'

// Search the catalogue and add several microphones to the locker at once.
// Embeddable in a wizard step or a dialog.
export function MicQuickAdd({
  roomId,
  rooms,
  onAdded,
  compact = false
}: {
  readonly roomId?: string
  readonly rooms?: { id: string; name: string }[]
  readonly onAdded?: (count: number) => void
  readonly compact?: boolean
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MicSummary[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [room, setRoom] = useState(roomId ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const data = await apiFetch<{ mics: MicSummary[] }>(
          `/api/mics?q=${encodeURIComponent(q)}`
        )
        if (!cancelled) setResults(data.mics.slice(0, compact ? 5 : 8))
      } catch {
        if (!cancelled) setResults([])
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, compact])

  const total = rows.reduce((sum, row) => sum + row.quantity, 0)

  const addRow = (mic: MicSummary) => {
    setRows((current) =>
      current.some((row) => row.micModelId === mic.id) ||
      current.length >= MAX_ROWS
        ? current
        : [
            ...current,
            {
              micModelId: mic.id,
              name: `${mic.manufacturer} ${mic.model}`,
              quantity: 1,
              matched: false
            }
          ]
    )
    setQuery('')
    setResults([])
  }

  const setQuantity = (id: string, value: number) =>
    setRows((current) =>
      current.map((row) => {
        if (row.micModelId !== id) return row
        const quantity = Math.min(MAX_QUANTITY, Math.max(1, value || 1))
        return {
          ...row,
          quantity,
          matched: row.matched && quantity >= 2 && quantity <= 3
        }
      })
    )

  const setMatched = (id: string, matched: boolean) =>
    setRows((current) =>
      current.map((row) => (row.micModelId === id ? { ...row, matched } : row))
    )

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      await apiFetch('/api/locker/bulk', {
        method: 'POST',
        body: {
          roomId: room || null,
          rows: rows.map(({ micModelId, quantity, matched }) => ({
            micModelId,
            quantity,
            matched
          }))
        }
      })
      toast({
        title: `Added ${total} microphone${total === 1 ? '' : 's'} to your locker`
      })
      setRows([])
      router.refresh()
      onAdded?.(total)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className='space-y-4'>
      <div className='space-y-2'>
        <Label htmlFor='quick-add-search'>Search the catalogue</Label>
        <Input
          id='quick-add-search'
          value={query}
          placeholder='e.g. SM57, U87, C414'
          autoComplete='off'
          className='min-h-9'
          onChange={(event) => setQuery(event.target.value)}
        />
        {results.length > 0 && (
          <ul className='divide-y overflow-hidden rounded-md border bg-card'>
            {results.map((mic) => {
              const added = rows.some((row) => row.micModelId === mic.id)
              return (
                <li key={mic.id}>
                  <button
                    type='button'
                    disabled={added}
                    onClick={() => addRow(mic)}
                    className='flex min-h-9 w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted disabled:cursor-default disabled:opacity-50'
                  >
                    <span className='truncate'>
                      {mic.manufacturer} {mic.model}
                    </span>
                    <span className='shrink-0 text-xs text-muted-foreground'>
                      {added ? 'Added' : 'Add'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {rows.length > 0 && (
        <ul className='divide-y rounded-md border'>
          {rows.map((row) => (
            <li
              key={row.micModelId}
              className='flex flex-wrap items-center gap-3 px-3 py-2'
            >
              <span className='min-w-0 flex-1 truncate text-sm font-medium'>
                {row.name}
              </span>
              <div className='flex items-center gap-1'>
                <Button
                  type='button'
                  variant='surface'
                  className={STEPPER}
                  aria-label={`Fewer ${row.name}`}
                  disabled={row.quantity <= 1}
                  onClick={() => setQuantity(row.micModelId, row.quantity - 1)}
                >
                  <Minus />
                </Button>
                <Input
                  type='number'
                  inputMode='numeric'
                  min={1}
                  max={MAX_QUANTITY}
                  value={row.quantity}
                  aria-label={`Quantity of ${row.name}`}
                  className='min-h-9 w-14 text-center'
                  onChange={(event) =>
                    setQuantity(row.micModelId, Number(event.target.value))
                  }
                />
                <Button
                  type='button'
                  variant='surface'
                  className={STEPPER}
                  aria-label={`More ${row.name}`}
                  disabled={row.quantity >= MAX_QUANTITY}
                  onClick={() => setQuantity(row.micModelId, row.quantity + 1)}
                >
                  <Plus />
                </Button>
              </div>
              <label className='flex min-h-9 cursor-pointer items-center gap-2 text-sm'>
                <input
                  type='checkbox'
                  className='size-4'
                  checked={row.matched}
                  disabled={row.quantity < 2 || row.quantity > 3}
                  onChange={(event) =>
                    setMatched(row.micModelId, event.target.checked)
                  }
                />
                Matched set
              </label>
              <Button
                type='button'
                variant='surface'
                className={STEPPER}
                aria-label={`Remove ${row.name}`}
                onClick={() =>
                  setRows((current) =>
                    current.filter(
                      (entry) => entry.micModelId !== row.micModelId
                    )
                  )
                }
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {rooms && rooms.length > 0 && (
        <div className='space-y-2'>
          <Label htmlFor='quick-add-room'>Location</Label>
          <NativeSelect
            id='quick-add-room'
            value={room}
            className='min-h-9'
            onChange={(event) => setRoom(event.target.value)}
          >
            <option value=''>Unassigned</option>
            {rooms.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}

      {total > MAX_UNITS && (
        <p className='text-sm text-destructive'>
          At most {MAX_UNITS} microphones at once.
        </p>
      )}
      <FormError message={error} />
      <Button
        type='button'
        className='min-h-9'
        disabled={saving || rows.length === 0 || total > MAX_UNITS}
        onClick={submit}
      >
        {saving
          ? 'Adding…'
          : `Add ${total} mic${total === 1 ? '' : 's'} to locker`}
      </Button>
    </div>
  )
}
