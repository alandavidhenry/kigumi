import { notFound } from 'next/navigation'

import { LayoutEditorLoader } from '@/components/layout/layout-editor-loader'
import { isAppError } from '@/lib/errors'
import { getLayout } from '@/lib/layout/service'
import { listEditorUnits } from '@/lib/sessions/editor-data'
import { getSession } from '@/lib/sessions/service'
import { getTenantContext } from '@/lib/tenant-context'
import { Permission, hasPermission } from '@/types/rbac'

import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Layout' }

interface PageProps {
  params: Promise<{ sessionId: string }>
}

export default async function SessionLayoutPage({ params }: PageProps) {
  const { sessionId } = await params
  const ctx = await getTenantContext()

  let session
  let layout
  try {
    session = await getSession(ctx, sessionId)
    if (!session.layout) notFound()
    layout = await getLayout(ctx, session.layout.id)
  } catch (error) {
    if (isAppError(error) && error.status === 404) notFound()
    throw error
  }

  const units = await listEditorUnits(ctx)

  return (
    <div className='space-y-4'>
      <div>
        <h2 className='text-base font-medium'>Layout</h2>
        <p className='text-sm text-muted-foreground'>
          Place microphones and gear to scale. Each microphone you place gets a
          line on the input list.
        </p>
      </div>
      <LayoutEditorLoader
        key={`${layout.id}:${layout.version}`}
        layout={layout}
        units={units}
        canEdit={hasPermission(ctx.role, Permission.MANAGE_SESSIONS)}
        isTemplate={false}
        hasRoom={session.roomId !== null}
        pdfHref={`/api/layouts/${layout.id}/pdf`}
        backHref={`/sessions/${session.id}`}
      />
    </div>
  )
}
