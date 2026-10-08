'use client'

import { DoorOpen, Pencil, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { ConfirmDeleteButton } from '@/components/confirm-delete-button'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { useBreadcrumbLabel } from '@/components/providers/breadcrumb-provider'
import { RoomFormDialog } from '@/components/studios/room-form-dialog'
import { StudioFormDialog } from '@/components/studios/studio-form-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/components/ui/use-toast'
import { UpgradeNotice } from '@/components/upgrade-notice'
import { apiFetch } from '@/lib/client-api'
import type { StudioDetail as StudioDetailData } from '@/lib/studios'
import { formatDimensions } from '@/lib/validation'

export function StudioDetail({
  studio,
  canManage,
  canAddRoom,
  upgradePlanLabel
}: {
  readonly studio: StudioDetailData
  readonly canManage: boolean
  readonly canAddRoom: boolean
  readonly upgradePlanLabel: string | null
}) {
  const router = useRouter()
  useBreadcrumbLabel(`/studios/${studio.id}`, studio.name)

  const deleteStudio = async () => {
    await apiFetch(`/api/studios/${studio.id}`, { method: 'DELETE' })
    toast({ title: 'Studio deleted' })
    router.push('/studios')
    router.refresh()
  }

  const deleteRoom = (roomId: string) => async () => {
    await apiFetch(`/api/rooms/${roomId}`, { method: 'DELETE' })
    toast({ title: 'Room deleted' })
    router.refresh()
  }

  const addRoomButton = canManage ? (
    <RoomFormDialog
      studioId={studio.id}
      trigger={
        <Button disabled={!canAddRoom}>
          <Plus />
          Add room
        </Button>
      }
    />
  ) : null

  return (
    <div className='space-y-6'>
      <PageHeader
        title={studio.name}
        description={[studio.address, studio.timezone]
          .filter(Boolean)
          .join(' · ')}
        backHref='/studios'
        backLabel='Studios'
        actions={
          canManage && (
            <div className='flex gap-2'>
              <StudioFormDialog
                studio={studio}
                trigger={
                  <Button variant='surface'>
                    <Pencil />
                    Edit
                  </Button>
                }
              />
              <ConfirmDeleteButton
                title={`Delete ${studio.name}?`}
                description='This permanently deletes the studio and all of its rooms.'
                label='Delete'
                size='default'
                onConfirm={deleteStudio}
              />
            </div>
          )
        }
      />

      {studio.notes && (
        <p className='whitespace-pre-line text-muted-foreground'>
          {studio.notes}
        </p>
      )}

      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0'>
          <CardTitle>Rooms</CardTitle>
          {studio.rooms.length > 0 && addRoomButton}
        </CardHeader>
        <CardContent className='p-0'>
          {!canAddRoom && canManage && (
            <UpgradeNotice
              compact
              className='mx-4 mb-3'
              title='You’ve reached your plan’s room limit.'
              planLabel={upgradePlanLabel}
            />
          )}
          {studio.rooms.length === 0 ? (
            <EmptyState
              icon={DoorOpen}
              title='No rooms yet'
              description='Add the live room, control room and booths with their dimensions.'
              action={addRoomButton}
            />
          ) : (
            <ul className='divide-y border-t'>
              {studio.rooms.map((room) => (
                <li
                  key={room.id}
                  className='flex min-h-14 items-center gap-3 px-4 py-3'
                >
                  <DoorOpen className='h-4 w-4 shrink-0 text-muted-foreground' />
                  <div className='min-w-0 flex-1'>
                    <p className='truncate font-medium'>{room.name}</p>
                    <p className='font-mono text-xs text-muted-foreground'>
                      {formatDimensions(
                        room.widthMm,
                        room.lengthMm,
                        room.heightMm
                      )}
                    </p>
                    {room.notes && (
                      <p className='truncate text-xs text-muted-foreground'>
                        {room.notes}
                      </p>
                    )}
                  </div>
                  {canManage && (
                    <div className='flex gap-1'>
                      <RoomFormDialog
                        studioId={studio.id}
                        room={room}
                        trigger={
                          <Button
                            variant='ghost'
                            size='icon'
                            aria-label={`Edit ${room.name}`}
                          >
                            <Pencil />
                          </Button>
                        }
                      />
                      <ConfirmDeleteButton
                        title={`Delete ${room.name}?`}
                        description='This permanently deletes the room.'
                        label={`Delete ${room.name}`}
                        size='icon'
                        onConfirm={deleteRoom(room.id)}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
