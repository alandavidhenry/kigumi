import { PageHeader } from '@/components/page-header'
import { TemplateEditor } from '@/components/recall/template-editor'
import { getTenantContext } from '@/lib/tenant-context'
import { Permission, hasPermission } from '@/types/rbac'

export const metadata = { title: 'New channel-strip template' }

export default async function NewTemplatePage() {
  const ctx = await getTenantContext()
  return (
    <div className='space-y-6'>
      <PageHeader
        title='New channel-strip template'
        description='Group the controls on one channel of your desk. Each control is recorded per channel on a recall sheet.'
        backHref='/consoles'
        backLabel='Consoles & recall'
      />
      <TemplateEditor
        templateId={null}
        initial={{ name: '', description: null, strip: { sections: [] } }}
        canEdit={hasPermission(ctx.role, Permission.MANAGE_SESSIONS)}
      />
    </div>
  )
}
