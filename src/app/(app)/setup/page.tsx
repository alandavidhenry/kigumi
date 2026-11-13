import { Building2 } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { SetupWizard } from '@/components/setup/setup-wizard'
import { Card } from '@/components/ui/card'
import { PLAN_LABELS, canAdd, upgradeTierFor } from '@/lib/plans'
import {
  listBuiltInTemplates,
  listConsoleTemplates,
  listConsoles
} from '@/lib/recall/consoles'
import { getSetupProgress, isSetupRequired } from '@/lib/setup'
import { getStudio, listStudios } from '@/lib/studios'
import { getTenantContext } from '@/lib/tenant-context'
import { Permission, hasPermission } from '@/types/rbac'

export const metadata = { title: 'Set up your studio' }

export default async function SetupPage() {
  const ctx = await getTenantContext()

  if (!hasPermission(ctx.role, Permission.MANAGE_STUDIOS)) {
    return (
      <div className='space-y-6'>
        <PageHeader title='Set up your studio' />
        <Card>
          <EmptyState
            icon={Building2}
            title='Ask an owner or manager to set this up'
            description='Creating studios and rooms needs the manager role. Once they have, you can plan sessions from the dashboard.'
          />
        </Card>
      </div>
    )
  }

  const [progress, firstRun, studioList, templates, consoles] =
    await Promise.all([
      getSetupProgress(ctx),
      isSetupRequired(ctx),
      listStudios(ctx),
      listConsoleTemplates(ctx),
      listConsoles(ctx)
    ])
  const studios = await Promise.all(studioList.map((s) => getStudio(ctx, s.id)))
  const upgradeTier = upgradeTierFor(ctx.planTier, 'rooms', progress.rooms)

  return (
    <div className='space-y-6'>
      <PageHeader
        title='Set up your studio'
        description='A few quick steps. Every step can be skipped and revisited later.'
      />
      <SetupWizard
        progress={progress}
        studios={studios}
        builtIn={listBuiltInTemplates().map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description
        }))}
        templates={templates.map((t) => ({ id: t.id, name: t.name }))}
        consoles={consoles.map((c) => ({
          id: c.id,
          name: c.name,
          channelCount: c.channelCount,
          templateName: c.templateName
        }))}
        canAddRoom={canAdd(ctx.planTier, 'rooms', progress.rooms)}
        upgradePlanLabel={upgradeTier ? PLAN_LABELS[upgradeTier] : null}
        canManageDesk={hasPermission(ctx.role, Permission.MANAGE_SESSIONS)}
        canManageLocker={hasPermission(ctx.role, Permission.MANAGE_MIC_LOCKER)}
        organisationName={ctx.organisationName}
        firstRun={firstRun}
      />
    </div>
  )
}
