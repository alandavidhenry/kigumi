import { notFound } from 'next/navigation'

import { StudioDetail } from '@/app/(app)/studios/[studioId]/studio-detail'
import { isAppError } from '@/lib/errors'
import { PLAN_LABELS, canAdd, upgradeTierFor } from '@/lib/plans'
import { getOrganisationUsage, getStudio } from '@/lib/studios'
import { getTenantContext } from '@/lib/tenant-context'
import { Permission, hasPermission } from '@/types/rbac'

import type { Metadata } from 'next'

interface PageProps {
  params: Promise<{ studioId: string }>
}

async function loadStudio(studioId: string) {
  const ctx = await getTenantContext()
  try {
    return { ctx, studio: await getStudio(ctx, studioId) }
  } catch (error) {
    if (isAppError(error) && error.status === 404) notFound()
    throw error
  }
}

export async function generateMetadata({
  params
}: PageProps): Promise<Metadata> {
  const { studioId } = await params
  const { studio } = await loadStudio(studioId)
  return { title: studio.name }
}

export default async function StudioPage({ params }: PageProps) {
  const { studioId } = await params
  const { ctx, studio } = await loadStudio(studioId)
  const usage = await getOrganisationUsage(ctx)
  const upgradeTier = upgradeTierFor(ctx.planTier, 'rooms', usage.rooms)

  return (
    <StudioDetail
      studio={studio}
      canManage={hasPermission(ctx.role, Permission.MANAGE_STUDIOS)}
      canAddRoom={canAdd(ctx.planTier, 'rooms', usage.rooms)}
      upgradePlanLabel={upgradeTier ? PLAN_LABELS[upgradeTier] : null}
    />
  )
}
