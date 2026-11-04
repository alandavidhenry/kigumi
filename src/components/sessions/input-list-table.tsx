'use client'

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { FormError } from '@/components/auth/auth-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { toast } from '@/components/ui/use-toast'
import { apiFetch } from '@/lib/client-api'
import type { EditorUnit } from '@/lib/sessions/editor-data'
import type { ChannelRow } from '@/lib/sessions/types'

const PADS = [0, 10, 20, 30]

// The session's input list. Rows that come from a microphone on the layout
// share their source and microphone with it, so changing them here moves the
// layout item too; the rest (stand, preamp, phantom, pad, DAW name, notes)
// belong to the list. Each field saves when you leave it.
export function InputListTable({
  sessionId,
  channels,
  units,
  canEdit,
  channelIdsWithWarnings
}: {
  readonly sessionId: string
  readonly channels: ChannelRow[]
  readonly units: EditorUnit[]
  readonly canEdit: boolean
  readonly channelIdsWithWarnings: ReadonlySet<string>
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState('')

  const run = async (action: () => Promise<unknown>) => {
    setError(null)
    try {
      await action()
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save')
    }
  }

  const patch = (id: string, body: Record<string, unknown>) =>
    run(() =>
      apiFetch(`/api/sessions/${sessionId}/channels/${id}`, {
        method: 'PATCH',
        body
      })
    )

  const move = (index: number, delta: number) => {
    const ids = channels.map((c) => c.id)
    const [item] = ids.splice(index, 1)
    ids.splice(index + delta, 0, item)
    return run(() =>
      apiFetch(`/api/sessions/${sessionId}/channels/order`, {
        method: 'PUT',
        body: { ids }
      })
    )
  }

  const renumber = () =>
    run(async () => {
      await apiFetch(`/api/sessions/${sessionId}/channels/order`, {
        method: 'PUT',
        body: {
          ids: [...channels]
            .sort((a, b) => a.number - b.number)
            .map((c) => c.id)
        }
      })
      toast({ title: 'Inputs renumbered from 1' })
    })

  const used = new Map(
    channels.filter((c) => c.micUnitId).map((c) => [c.micUnitId, c.id])
  )

  const text = (
    channel: ChannelRow,
    field: 'source' | 'stand' | 'preampInput' | 'dawName' | 'notes',
    label: string,
    width = 'w-28'
  ) => (
    <Input
      key={`${channel.id}:${field}:${channel[field] ?? ''}`}
      aria-label={`${label} for input ${channel.number}`}
      className={`h-8 ${width}`}
      defaultValue={channel[field] ?? ''}
      disabled={!canEdit}
      maxLength={field === 'notes' ? 500 : 80}
      onBlur={(e) => {
        const value = e.target.value.trim()
        if (value === (channel[field] ?? '')) return
        if (field === 'source' && !value) {
          e.target.value = channel.source
          return
        }
        void patch(channel.id, { [field]: value })
      }}
    />
  )

  return (
    <div className='space-y-3'>
      <FormError message={error} />
      <div className='overflow-x-auto'>
        <table className='w-full min-w-[820px] text-sm'>
          <thead>
            <tr className='border-b text-left text-xs uppercase tracking-wide text-muted-foreground'>
              <th className='px-2 py-2 font-medium'>#</th>
              <th className='px-2 py-2 font-medium'>Source</th>
              <th className='px-2 py-2 font-medium'>Microphone</th>
              <th className='px-2 py-2 font-medium'>Stand</th>
              <th className='px-2 py-2 font-medium'>Preamp</th>
              <th className='px-2 py-2 font-medium'>48V</th>
              <th className='px-2 py-2 font-medium'>Pad</th>
              <th className='px-2 py-2 font-medium'>DAW name</th>
              <th className='px-2 py-2 font-medium'>Notes</th>
              {canEdit && <th className='px-2 py-2' />}
            </tr>
          </thead>
          <tbody className='divide-y'>
            {channels.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  className='px-2 py-6 text-center text-muted-foreground'
                >
                  No inputs yet. Place a microphone on the layout and it appears
                  here, or add a line input below.
                </td>
              </tr>
            )}
            {channels.map((channel, index) => (
              <tr key={channel.id} className='min-h-11 align-middle'>
                <td className='px-2 py-1.5 font-medium tabular-nums'>
                  <span className='flex items-center gap-1'>
                    {channel.number}
                    {channelIdsWithWarnings.has(channel.id) && (
                      <Badge variant='warning' aria-label='Has a warning'>
                        !
                      </Badge>
                    )}
                  </span>
                </td>
                <td className='px-2 py-1.5'>
                  {text(channel, 'source', 'Source', 'w-36')}
                </td>
                <td className='px-2 py-1.5'>
                  {channel.kind === 'line' ? (
                    <span className='text-muted-foreground'>Line input</span>
                  ) : (
                    <NativeSelect
                      aria-label={`Microphone for input ${channel.number}`}
                      className='h-8 w-48'
                      value={channel.micUnitId ?? ''}
                      disabled={!canEdit || channel.kind === 'di'}
                      onChange={(e) =>
                        void patch(channel.id, {
                          micUnitId: e.target.value || null
                        })
                      }
                    >
                      <option value=''>
                        {channel.kind === 'di' ? 'DI box' : 'None chosen'}
                      </option>
                      {channel.kind !== 'di' &&
                        units.map((unit) => {
                          const holder = used.get(unit.id)
                          return (
                            <option
                              key={unit.id}
                              value={unit.id}
                              disabled={!!holder && holder !== channel.id}
                            >
                              {unit.name}
                              {holder && holder !== channel.id
                                ? ' (already used)'
                                : ''}
                            </option>
                          )
                        })}
                    </NativeSelect>
                  )}
                </td>
                <td className='px-2 py-1.5'>
                  {text(channel, 'stand', 'Stand')}
                </td>
                <td className='px-2 py-1.5'>
                  {text(channel, 'preampInput', 'Preamp input', 'w-24')}
                </td>
                <td className='px-2 py-1.5'>
                  <input
                    type='checkbox'
                    className='h-5 w-5'
                    aria-label={`Phantom power for input ${channel.number}`}
                    checked={channel.phantom}
                    disabled={!canEdit}
                    onChange={(e) =>
                      void patch(channel.id, { phantom: e.target.checked })
                    }
                  />
                </td>
                <td className='px-2 py-1.5'>
                  <NativeSelect
                    aria-label={`Pad for input ${channel.number}`}
                    className='h-8 w-20'
                    value={channel.padDb ?? 0}
                    disabled={!canEdit}
                    onChange={(e) =>
                      void patch(channel.id, {
                        padDb: Number(e.target.value) || null
                      })
                    }
                  >
                    {PADS.map((p) => (
                      <option key={p} value={p}>
                        {p === 0 ? 'Off' : `-${p} dB`}
                      </option>
                    ))}
                  </NativeSelect>
                </td>
                <td className='px-2 py-1.5'>
                  {text(channel, 'dawName', 'DAW name')}
                </td>
                <td className='px-2 py-1.5'>
                  {text(channel, 'notes', 'Notes', 'w-40')}
                </td>
                {canEdit && (
                  <td className='whitespace-nowrap px-2 py-1.5'>
                    <Button
                      variant='ghost'
                      size='icon'
                      aria-label={`Move input ${channel.number} up`}
                      disabled={index === 0}
                      onClick={() => void move(index, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      variant='ghost'
                      size='icon'
                      aria-label={`Move input ${channel.number} down`}
                      disabled={index === channels.length - 1}
                      onClick={() => void move(index, 1)}
                    >
                      <ArrowDown />
                    </Button>
                    {!channel.layoutItemId && (
                      <Button
                        variant='ghost'
                        size='icon'
                        aria-label={`Remove input ${channel.number}`}
                        onClick={() =>
                          void run(() =>
                            apiFetch(
                              `/api/sessions/${sessionId}/channels/${channel.id}`,
                              { method: 'DELETE' }
                            )
                          )
                        }
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className='flex flex-wrap items-center gap-2'>
          <form
            className='flex items-center gap-2'
            onSubmit={(event) => {
              event.preventDefault()
              if (!adding.trim()) return
              void run(async () => {
                await apiFetch(`/api/sessions/${sessionId}/channels`, {
                  method: 'POST',
                  body: { kind: 'line', source: adding.trim() }
                })
                setAdding('')
              })
            }}
          >
            <Input
              aria-label='New line input'
              className='h-8 w-48'
              placeholder='Add a line input, e.g. Synth'
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
            />
            <Button type='submit' variant='outline' size='sm'>
              <Plus />
              Add
            </Button>
          </form>
          {channels.length > 1 && (
            <Button variant='ghost' size='sm' onClick={() => void renumber()}>
              Renumber from 1
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
