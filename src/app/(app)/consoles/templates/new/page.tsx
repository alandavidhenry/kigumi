import { DeskEditorLoader } from '@/components/desk/desk-loader'
import { PageHeader } from '@/components/page-header'
import { emptyDefaults, emptyLayout } from '@/lib/recall/desk-layout'
import { getTenantContext } from '@/lib/tenant-context'
import { Permission, hasPermission } from '@/types/rbac'

export const metadata = { title: 'New desk template' }

export default async function NewTemplatePage() {
  const ctx = await getTenantContext()
  return (
    <div className='space-y-6'>
      <PageHeader
        title='New desk template'
        description='Drag faders, knobs, switches and buttons onto one channel strip and the master area. The strip repeats for every channel of the console.'
        backHref='/consoles'
        backLabel='Consoles & recall'
      />
      <DeskEditorLoader
        templateId={null}
        initial={{
          name: '',
          description: null,
          layout: emptyLayout(),
          defaultValues: emptyDefaults()
        }}
        canEdit={hasPermission(ctx.role, Permission.MANAGE_SESSIONS)}
      />
    </div>
  )
}
