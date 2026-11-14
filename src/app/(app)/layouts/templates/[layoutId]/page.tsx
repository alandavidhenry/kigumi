import { notFound } from 'next/navigation'

import { LayoutEditorLoader } from '@/components/layout/layout-editor-loader'
import { PageHeader } from '@/components/page-header'
import { UpgradeNotice } from '@/components/upgrade-notice'
import { isAppError } from '@/lib/errors'
import { getLayout } from '@/lib/layout/service'
import {
  FEATURE_LABELS,
  Feature,
  PLAN_LABELS,
  hasFeature,
  minimumTierFor
} from '@/lib/plans'
import { getTenantContext } from '@/lib/tenant-context'
import { Permission, hasPermission } from '@/types/rbac'

import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Template' }

interface PageProps {
  params: Promise<{ layoutId: string }>
}

export default async function TemplatePage({ params }: PageProps) {
  const { layoutId } = await params
  const ctx = await getTenantContext()

  if (!hasFeature(ctx.planTier, Feature.TEMPLATES)) {
    return (
      <div className='space-y-8'>
        <PageHeader
          title='Layout template'
          backHref='/layouts/templates'
          backLabel='Templates'
        />
        <UpgradeNotice
          title={`${FEATURE_LABELS[Feature.TEMPLATES]} is a paid feature.`}
          planLabel={PLAN_LABELS[minimumTierFor(Feature.TEMPLATES)]}
        />
      </div>
    )
  }

  let layout
  try {
    layout = await getLayout(ctx, layoutId)
    if (!layout.isTemplate) notFound()
  } catch (error) {
    if (isAppError(error) && error.status === 404) notFound()
    throw error
  }

  return (
    <div className='space-y-4'>
      <PageHeader
        title={layout.name}
        backHref='/layouts/templates'
        backLabel='Templates'
      />
      <LayoutEditorLoader
        key={`${layout.id}:${layout.version}`}
        layout={layout}
        units={[]}
        canEdit={hasPermission(ctx.role, Permission.MANAGE_SESSIONS)}
        isTemplate
        hasRoom={false}
        pdfHref={`/api/layouts/${layout.id}/pdf`}
        backHref='/layouts/templates'
      />
    </div>
  )
}
