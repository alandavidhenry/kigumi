import { notFound } from 'next/navigation'

import { BreadcrumbLabel } from '@/components/mics/breadcrumb-label'
import { CreateRecall } from '@/components/recall/create-recall'
import { RecallSheetEditor } from '@/components/recall/recall-sheet-editor'
import { listEquipment } from '@/lib/equipment'
import { isAppError } from '@/lib/errors'
import { listConsoles } from '@/lib/recall/consoles'
import { getRecallSheet, listRecallSources } from '@/lib/recall/service'
import { getSession } from '@/lib/sessions/service'
import { getTenantContext } from '@/lib/tenant-context'
import { Permission, hasPermission } from '@/types/rbac'

export const metadata = { title: 'Recall sheet' }

interface PageProps {
  params: Promise<{ sessionId: string }>
}

export default async function RecallPage({ params }: PageProps) {
  const { sessionId } = await params
  const ctx = await getTenantContext()

  let session
  let sheet
  try {
    session = await getSession(ctx, sessionId)
    sheet = await getRecallSheet(ctx, sessionId)
  } catch (error) {
    if (isAppError(error) && error.status === 404) notFound()
    throw error
  }

  const canEdit = hasPermission(ctx.role, Permission.MANAGE_SESSIONS)
  const [consoles, sources, outboard] = await Promise.all([
    sheet ? [] : listConsoles(ctx),
    sheet ? [] : listRecallSources(ctx, sessionId),
    sheet && canEdit && hasPermission(ctx.role, Permission.VIEW_INVENTORY)
      ? listEquipment(ctx, { category: 'outboard' })
      : []
  ])

  return (
    <div className='space-y-6'>
      <BreadcrumbLabel href={`/sessions/${session.id}/recall`} label='Recall' />
      <div>
        <h2 className='text-base font-medium'>Recall sheet</h2>
        {sheet && (
          <p className='text-sm text-muted-foreground'>{sheet.consoleName}</p>
        )}
      </div>
      {sheet ? (
        <RecallSheetEditor
          sessionId={session.id}
          sheet={sheet}
          canEdit={canEdit}
          inventory={outboard.map((item) => ({
            id: item.id,
            label: `${item.make} ${item.model}`
          }))}
        />
      ) : canEdit ? (
        <CreateRecall
          sessionId={session.id}
          consoles={consoles.map((c) => ({
            id: c.id,
            name: c.name,
            channelCount: c.channelCount
          }))}
          sources={sources}
        />
      ) : (
        <p className='text-sm text-muted-foreground'>
          This session has no recall sheet yet.
        </p>
      )}
    </div>
  )
}
