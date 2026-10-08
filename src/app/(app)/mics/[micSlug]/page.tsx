import { notFound } from 'next/navigation'

import { MicDetailView } from '@/components/mics/mic-detail-view'
import { listRoomOptions } from '@/lib/equipment'
import { isAppError } from '@/lib/errors'
import { getMic } from '@/lib/mics/catalogue'
import { listUnitsForModel, listUnlinkedMicrophones } from '@/lib/mics/locker'
import { getTenantContext } from '@/lib/tenant-context'
import { Permission, hasPermission } from '@/types/rbac'

import type { Metadata } from 'next'

interface PageProps {
  params: Promise<{ micSlug: string }>
}

async function load(micSlug: string) {
  const ctx = await getTenantContext()
  try {
    return { ctx, mic: await getMic(ctx, micSlug) }
  } catch (error) {
    if (isAppError(error) && error.status === 404) notFound()
    throw error
  }
}

export async function generateMetadata({
  params
}: PageProps): Promise<Metadata> {
  const { micSlug } = await params
  const { mic } = await load(micSlug)
  return { title: `${mic.manufacturer} ${mic.model}` }
}

export default async function MicPage({ params }: PageProps) {
  const { micSlug } = await params
  const { ctx, mic } = await load(micSlug)
  const canManage = hasPermission(ctx.role, Permission.MANAGE_MIC_LOCKER)
  const [units, unlinked, rooms] = await Promise.all([
    listUnitsForModel(ctx, mic.id),
    canManage ? listUnlinkedMicrophones(ctx) : [],
    canManage ? listRoomOptions(ctx) : []
  ])

  return (
    <MicDetailView
      mic={mic}
      units={units}
      canManageLocker={canManage}
      unlinked={unlinked}
      rooms={rooms}
    />
  )
}
