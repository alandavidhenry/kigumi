import { LayoutTemplate } from 'lucide-react'
import Link from 'next/link'

import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { SessionTemplatesList } from '@/components/sessions/session-templates-list'
import { TemplateRow } from '@/components/sessions/template-row'
import { Card } from '@/components/ui/card'
import { UpgradeNotice } from '@/components/upgrade-notice'
import { listTemplates } from '@/lib/layout/service'
import { BUILT_IN_TEMPLATES } from '@/lib/layout/templates'
import {
  FEATURE_LABELS,
  Feature,
  PLAN_LABELS,
  hasFeature,
  minimumTierFor
} from '@/lib/plans'
import { listSessionTemplates } from '@/lib/sessions/templates'
import { getTenantContext } from '@/lib/tenant-context'
import { Permission, hasPermission } from '@/types/rbac'

export const metadata = { title: 'Layout templates' }

export default async function TemplatesPage() {
  const ctx = await getTenantContext()
  const unlocked = hasFeature(ctx.planTier, Feature.TEMPLATES)
  const templates = unlocked ? await listTemplates(ctx) : []
  const sessionTemplates = unlocked ? await listSessionTemplates(ctx) : []
  const canManage = hasPermission(ctx.role, Permission.MANAGE_SESSIONS)

  return (
    <div className='space-y-8'>
      <PageHeader
        title='Layout templates'
        description='Start a session from a ready-made room layout. Starter templates are free; saving your own is a Pro feature.'
      />

      <section className='space-y-3'>
        <h2 className='text-base font-semibold'>Starter templates</h2>
        <Card className='divide-y overflow-hidden p-0'>
          {BUILT_IN_TEMPLATES.map((template) => (
            <div key={template.id} className='px-4 py-3'>
              <p className='font-medium'>{template.name}</p>
              <p className='text-xs text-muted-foreground'>
                {template.description} Choose it under &quot;Start from&quot;
                when you create a session.
              </p>
            </div>
          ))}
        </Card>
      </section>

      <section className='space-y-3'>
        <h2 className='text-base font-semibold'>Your templates</h2>
        {!unlocked ? (
          <UpgradeNotice
            title={`${FEATURE_LABELS[Feature.TEMPLATES]} is a paid feature.`}
            description='Save any session layout as a template and start new sessions from it.'
            planLabel={PLAN_LABELS[minimumTierFor(Feature.TEMPLATES)]}
          />
        ) : templates.length === 0 ? (
          <Card>
            <EmptyState
              icon={LayoutTemplate}
              title='No templates yet'
              description='Open a session and choose "Save layout as template".'
              action={
                <Link href='/sessions' className='text-sm underline'>
                  Go to sessions
                </Link>
              }
            />
          </Card>
        ) : (
          <Card className='divide-y overflow-hidden p-0'>
            {templates.map((template) => (
              <TemplateRow
                key={template.id}
                template={template}
                canManage={canManage}
              />
            ))}
          </Card>
        )}
      </section>

      <section className='space-y-3'>
        <h2 className='text-base font-semibold'>Session templates</h2>
        {!unlocked ? (
          <UpgradeNotice
            title={`${FEATURE_LABELS[Feature.TEMPLATES]} is a paid feature.`}
            description='Save a session setup (sources, layout and console) as a template from the session wizard.'
            planLabel={PLAN_LABELS[minimumTierFor(Feature.TEMPLATES)]}
          />
        ) : sessionTemplates.length === 0 ? (
          <Card>
            <EmptyState
              icon={LayoutTemplate}
              title='No session templates yet'
              description='Tick "Save as a template" at the end of the session wizard.'
              action={
                <Link href='/sessions/new' className='text-sm underline'>
                  Start the session wizard
                </Link>
              }
            />
          </Card>
        ) : (
          <Card className='divide-y overflow-hidden p-0'>
            <SessionTemplatesList
              templates={sessionTemplates}
              canManage={canManage}
            />
          </Card>
        )}
      </section>
    </div>
  )
}
