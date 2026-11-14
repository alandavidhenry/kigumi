import { CalendarClock } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { SessionWizard } from '@/components/sessions/session-wizard'
import { Card } from '@/components/ui/card'
import { getAiUsage } from '@/lib/ai/usage'
import { listTemplates } from '@/lib/layout/service'
import { listLocker } from '@/lib/mics/locker'
import { Feature, hasFeature } from '@/lib/plans'
import { listConsoles } from '@/lib/recall/consoles'
import { listSessionTemplates } from '@/lib/sessions/templates'
import { getStudio, listStudios } from '@/lib/studios'
import { getTenantContext } from '@/lib/tenant-context'
import { Permission, hasPermission } from '@/types/rbac'

export const metadata = { title: 'Plan a session' }

interface PageProps {
  searchParams: Promise<{ step?: string; template?: string; preset?: string }>
}

export default async function NewSessionPage({ searchParams }: PageProps) {
  const { step, template, preset } = await searchParams
  const ctx = await getTenantContext()

  if (!hasPermission(ctx.role, Permission.MANAGE_SESSIONS)) {
    return (
      <div className='space-y-8'>
        <PageHeader title='Plan a session' />
        <Card>
          <EmptyState
            icon={CalendarClock}
            title='You can not plan sessions'
            description='Ask an owner, manager or engineer to plan a session, or to change your role.'
          />
        </Card>
      </div>
    )
  }

  const canTemplates = hasFeature(ctx.planTier, Feature.TEMPLATES)
  const canAi = hasPermission(ctx.role, Permission.USE_AI)

  const studios = await listStudios(ctx)
  const [details, consoles, layoutTemplates, sessionTemplates, locker, usage] =
    await Promise.all([
      Promise.all(studios.map((s) => getStudio(ctx, s.id))),
      listConsoles(ctx),
      canTemplates ? listTemplates(ctx) : [],
      canTemplates ? listSessionTemplates(ctx) : [],
      listLocker(ctx),
      canAi ? getAiUsage(ctx) : null
    ])

  const rooms = details.flatMap((studio) =>
    studio.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      studioName: studio.name,
      timezone: studio.timezone,
      widthMm: room.widthMm,
      lengthMm: room.lengthMm
    }))
  )

  return (
    <div className='space-y-8'>
      <PageHeader
        title='Plan a session'
        description='Set up the details, pick an ensemble, choose from the mics you own and get a layout and input list in one go.'
        backHref='/sessions'
        backLabel='Sessions'
      />
      <SessionWizard
        rooms={rooms}
        consoles={consoles.map((c) => ({
          id: c.id,
          name: c.name,
          detail: [c.make, c.model].filter(Boolean).join(' ')
        }))}
        layoutTemplates={layoutTemplates.map((t) => ({
          id: t.id,
          name: t.name,
          widthMm: t.widthMm,
          lengthMm: t.lengthMm
        }))}
        sessionTemplates={sessionTemplates.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          presetId: t.presetId,
          sources: t.sources,
          layoutId: t.layoutId,
          consoleId: t.consoleId,
          channelsAvailable: t.channelsAvailable,
          phantomMode: t.phantomMode
        }))}
        canTemplates={canTemplates}
        canAi={canAi}
        allowance={
          usage ? { remaining: usage.remaining, limit: usage.limit } : null
        }
        lockerSize={locker.length}
        initialStep={step ?? null}
        initialPresetId={preset ?? null}
        initialTemplateId={canTemplates ? (template ?? null) : null}
      />
    </div>
  )
}
