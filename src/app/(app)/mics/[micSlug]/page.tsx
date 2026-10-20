import { notFound } from 'next/navigation'

import { MicDetailView } from '@/components/mics/mic-detail-view'
import { getAiUsage } from '@/lib/ai/usage'
import { listRoomOptions } from '@/lib/equipment'
import { isAppError } from '@/lib/errors'
import { getMicSummary } from '@/lib/mics/ai'
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
    const { mic, summary } = await getMicSummary(ctx, micSlug)
    return { ctx, mic, summary }
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
  const { ctx, mic, summary } = await load(micSlug)
  const canGenerate = hasPermission(ctx.role, Permission.USE_AI)
  const canManage = hasPermission(ctx.role, Permission.MANAGE_MIC_LOCKER)
  const [units, unlinked, rooms, usage] = await Promise.all([
    listUnitsForModel(ctx, mic.id),
    canManage ? listUnlinkedMicrophones(ctx) : [],
    canManage ? listRoomOptions(ctx) : [],
    canGenerate && !summary ? getAiUsage(ctx) : null
  ])

  return (
    <MicDetailView
      mic={mic}
      units={units}
      canManageLocker={canManage}
      unlinked={unlinked}
      rooms={rooms}
      ai={{
        summary,
        canGenerate,
        allowance: usage
          ? { remaining: usage.remaining, limit: usage.limit }
          : null
      }}
    />
  )
}
