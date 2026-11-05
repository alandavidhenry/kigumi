import { notFound } from 'next/navigation'

import { EquipmentDetailView } from '@/app/(app)/inventory/[equipmentId]/equipment-detail'
import { getEquipment, listRoomOptions } from '@/lib/equipment'
import { isAppError } from '@/lib/errors'
import { loadItemCare } from '@/lib/maintenance/overview'
import { Feature, hasFeature } from '@/lib/plans'
import { getTenantContext } from '@/lib/tenant-context'
import { Permission, hasPermission } from '@/types/rbac'

import type { Metadata } from 'next'

interface PageProps {
  params: Promise<{ equipmentId: string }>
}

async function load(equipmentId: string) {
  const ctx = await getTenantContext()
  try {
    return { ctx, item: await getEquipment(ctx, equipmentId) }
  } catch (error) {
    if (isAppError(error) && error.status === 404) notFound()
    throw error
  }
}

export async function generateMetadata({
  params
}: PageProps): Promise<Metadata> {
  const { equipmentId } = await params
  const { item } = await load(equipmentId)
  return { title: `${item.make} ${item.model}` }
}

export default async function EquipmentPage({ params }: PageProps) {
  const { equipmentId } = await params
  const { ctx, item } = await load(equipmentId)
  const [rooms, care] = await Promise.all([
    listRoomOptions(ctx),
    loadItemCare(ctx, equipmentId)
  ])

  return (
    <EquipmentDetailView
      item={item}
      rooms={rooms}
      canManage={hasPermission(ctx.role, Permission.MANAGE_INVENTORY)}
      care={care}
      hoursAllowed={hasFeature(ctx.planTier, Feature.USAGE_HOUR_MAINTENANCE)}
      patAllowed={hasFeature(ctx.planTier, Feature.PAT_TESTING)}
    />
  )
}
