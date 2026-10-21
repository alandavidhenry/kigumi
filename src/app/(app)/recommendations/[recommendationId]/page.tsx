import { notFound } from 'next/navigation'

import { BreadcrumbLabel } from '@/components/mics/breadcrumb-label'
import { PageHeader } from '@/components/page-header'
import { RecommendationView } from '@/components/recommendations/recommendation-view'
import { isAppError } from '@/lib/errors'
import { listLocker } from '@/lib/mics/locker'
import { getRecommendation } from '@/lib/recommendations/service'
import { getTenantContext } from '@/lib/tenant-context'
import { Permission, hasPermission } from '@/types/rbac'

import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Recommendation' }

interface PageProps {
  params: Promise<{ recommendationId: string }>
}

export default async function RecommendationPage({ params }: PageProps) {
  const { recommendationId } = await params
  const ctx = await getTenantContext()

  let detail
  try {
    detail = await getRecommendation(ctx, recommendationId)
  } catch (error) {
    if (isAppError(error) && error.status === 404) notFound()
    throw error
  }

  const canFeedback = hasPermission(ctx.role, Permission.USE_AI)
  const locker = canFeedback ? await listLocker(ctx) : []
  const title =
    detail.request.kind === 'question'
      ? 'Your question'
      : detail.request.sources
          .map((s) => s.label)
          .slice(0, 3)
          .join(', ')

  return (
    <div className='space-y-6'>
      <BreadcrumbLabel
        href={`/recommendations/${detail.id}`}
        label={title.length > 40 ? `${title.slice(0, 37)}…` : title}
      />
      <PageHeader
        title={title}
        backHref='/recommendations'
        backLabel='Recommendations'
      />
      <RecommendationView
        detail={detail}
        canFeedback={canFeedback}
        lockerOptions={locker.map((unit) => ({
          id: unit.id,
          label: `${unit.manufacturer} ${unit.model}${unit.serial ? ` (S/N ${unit.serial})` : ''}`
        }))}
      />
    </div>
  )
}
