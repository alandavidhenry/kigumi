import { Mic, Plus } from 'lucide-react'
import Link from 'next/link'

import { EmptyState } from '@/components/empty-state'
import { LockerAddDialog } from '@/components/mics/locker-add-dialog'
import { LockerUnitActions } from '@/components/mics/locker-unit-actions'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { listRoomOptions } from '@/lib/equipment'
import { listMics } from '@/lib/mics/catalogue'
import { listLocker, listUnlinkedMicrophones } from '@/lib/mics/locker'
import type { LockerUnit } from '@/lib/mics/locker'
import { MIC_CONDITION_LABELS, MIC_TRANSDUCER_LABELS } from '@/lib/mics/types'
import { getTenantContext } from '@/lib/tenant-context'
import { Permission, hasPermission } from '@/types/rbac'

export const metadata = { title: 'Mic locker' }

// Matched pairs sit together under their group name; everything else follows.
function groupUnits(units: LockerUnit[]) {
  const groups = new Map<string, LockerUnit[]>()
  const singles: LockerUnit[] = []
  for (const unit of units) {
    if (!unit.matchedPairGroup) singles.push(unit)
    else {
      groups.set(unit.matchedPairGroup, [
        ...(groups.get(unit.matchedPairGroup) ?? []),
        unit
      ])
    }
  }
  return { groups: [...groups.entries()], singles }
}

export default async function LockerPage() {
  const ctx = await getTenantContext()
  const canManage = hasPermission(ctx.role, Permission.MANAGE_MIC_LOCKER)
  const [units, mics, unlinked, rooms] = await Promise.all([
    listLocker(ctx),
    canManage ? listMics(ctx) : [],
    canManage ? listUnlinkedMicrophones(ctx) : [],
    canManage ? listRoomOptions(ctx) : []
  ])
  const { groups, singles } = groupUnits(units)

  const addButton =
    canManage && mics.length > 0 ? (
      <LockerAddDialog
        mics={mics}
        unlinked={unlinked}
        rooms={rooms}
        trigger={
          <Button>
            <Plus />
            Add microphone
          </Button>
        }
      />
    ) : null

  const row = (unit: LockerUnit) => (
    <div
      key={unit.id}
      className='flex min-h-14 flex-wrap items-center gap-3 px-4 py-3'
    >
      <div className='min-w-0 flex-1'>
        <Link
          href={`/mics/${unit.micSlug}`}
          className='truncate font-medium hover:underline'
        >
          {unit.manufacturer} {unit.model}
        </Link>
        <p className='truncate text-xs text-muted-foreground'>
          {MIC_TRANSDUCER_LABELS[unit.transducerType]}
          {unit.serial && ` · S/N ${unit.serial}`}
          {unit.roomName && ` · ${unit.roomName}`}
        </p>
      </div>
      <Badge variant='secondary'>{MIC_CONDITION_LABELS[unit.condition]}</Badge>
      <Badge variant={unit.available ? 'success' : 'warning'}>
        {unit.available ? 'Available' : 'Unavailable'}
      </Badge>
      {canManage && <LockerUnitActions unit={unit} />}
    </div>
  )

  return (
    <div className='space-y-6'>
      <PageHeader
        title='Mic locker'
        description={`${units.length} microphone${units.length === 1 ? '' : 's'} linked to the catalogue. Available means in service; booking by session date arrives with sessions.`}
        actions={addButton}
      />

      {units.length === 0 ? (
        <Card>
          <EmptyState
            icon={Mic}
            title='Your locker is empty'
            description={
              canManage
                ? 'Link the microphones you own to the catalogue so planning uses their real specs.'
                : 'Nobody has added a microphone to the locker yet.'
            }
            action={addButton}
          />
        </Card>
      ) : (
        <div className='space-y-4'>
          {groups.map(([name, members]) => (
            <Card key={name} className='overflow-hidden p-0'>
              <div className='border-b bg-muted/30 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground'>
                Matched group · {name}
              </div>
              <div className='divide-y'>{members.map(row)}</div>
            </Card>
          ))}
          {singles.length > 0 && (
            <Card className='divide-y overflow-hidden p-0'>
              {singles.map(row)}
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
