import { notFound } from 'next/navigation'

import { DeskEditorLoader } from '@/components/desk/desk-loader'
import { PageHeader } from '@/components/page-header'
import { isAppError } from '@/lib/errors'
import { getConsoleTemplate } from '@/lib/recall/consoles'
import { getTenantContext } from '@/lib/tenant-context'
import { Permission, hasPermission } from '@/types/rbac'

export const metadata = { title: 'Channel-strip template' }

interface PageProps {
  params: Promise<{ templateId: string }>
}

export default async function TemplatePage({ params }: PageProps) {
  const { templateId } = await params
  const ctx = await getTenantContext()
  let template
  try {
    template = await getConsoleTemplate(ctx, templateId)
  } catch (error) {
    if (isAppError(error) && error.status === 404) notFound()
    throw error
  }
  return (
    <div className='space-y-8'>
      <PageHeader
        title={template.name}
        description='Changing a template affects new recall sheets only. Sheets already written keep the desk they were recorded on.'
        backHref='/consoles'
        backLabel='Consoles & recall'
      />
      <DeskEditorLoader
        templateId={template.id}
        initial={{
          name: template.name,
          description: template.description,
          layout: template.layout,
          defaultValues: template.defaultValues
        }}
        canEdit={hasPermission(ctx.role, Permission.MANAGE_SESSIONS)}
      />
    </div>
  )
}
