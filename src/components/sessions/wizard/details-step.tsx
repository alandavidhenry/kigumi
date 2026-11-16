'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'

import type { Patch, RoomChoice, WizardState } from './types'

export function DetailsStep({
  state,
  patch,
  rooms
}: {
  readonly state: WizardState
  readonly patch: Patch
  readonly rooms: readonly RoomChoice[]
}) {
  const room = rooms.find((r) => r.id === state.roomId)
  return (
    <div className='grid gap-4 sm:grid-cols-2'>
      <div className='space-y-1.5 sm:col-span-2'>
        <Label htmlFor='w-name'>Session name</Label>
        <Input
          id='w-name'
          className='h-9'
          required
          maxLength={120}
          value={state.name}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder='Drum tracking'
        />
      </div>
      <div className='space-y-1.5'>
        <Label htmlFor='w-client'>Client or artist</Label>
        <Input
          id='w-client'
          className='h-9'
          maxLength={120}
          value={state.client}
          onChange={(e) => patch({ client: e.target.value })}
        />
      </div>
      <div className='space-y-1.5'>
        <Label htmlFor='w-room'>Room</Label>
        <NativeSelect
          id='w-room'
          className='h-9'
          value={state.roomId}
          onChange={(e) => patch({ roomId: e.target.value })}
        >
          <option value=''>No room yet</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.studioName} · {r.name}
            </option>
          ))}
        </NativeSelect>
        {rooms.length === 0 && (
          <p className='text-xs text-muted-foreground'>
            Add rooms under Studios &amp; rooms to place the layout in a real
            space.
          </p>
        )}
      </div>
      <div className='space-y-1.5'>
        <Label htmlFor='w-start'>Starts</Label>
        <Input
          id='w-start'
          className='h-9'
          type='datetime-local'
          required
          value={state.startsAt}
          onChange={(e) => patch({ startsAt: e.target.value })}
        />
      </div>
      <div className='space-y-1.5'>
        <Label htmlFor='w-end'>Ends</Label>
        <Input
          id='w-end'
          className='h-9'
          type='datetime-local'
          required
          value={state.endsAt}
          onChange={(e) => patch({ endsAt: e.target.value })}
        />
      </div>
      <p className='text-xs text-muted-foreground sm:col-span-2'>
        Times are in the studio&apos;s timezone
        {room ? ` (${room.timezone})` : ''}.
      </p>
      <div className='space-y-1.5'>
        <Label htmlFor='w-channels'>Channels available</Label>
        <Input
          id='w-channels'
          className='h-9'
          inputMode='numeric'
          value={state.channels}
          placeholder='e.g. 16'
          onChange={(e) =>
            patch({ channels: e.target.value.replace(/\D/g, '').slice(0, 3) })
          }
        />
      </div>
      <div className='space-y-1.5'>
        <Label htmlFor='w-phantom'>Phantom power</Label>
        <NativeSelect
          id='w-phantom'
          className='h-9'
          value={state.phantomMode}
          onChange={(e) =>
            patch({ phantomMode: e.target.value as WizardState['phantomMode'] })
          }
        >
          <option value='per_channel'>Switchable per channel</option>
          <option value='global'>On or off for everything</option>
        </NativeSelect>
      </div>
    </div>
  )
}
