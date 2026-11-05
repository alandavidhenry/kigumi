import { Plus } from 'lucide-react'
import Link from 'next/link'

import { MaintenanceTabs } from '@/components/maintenance/maintenance-tabs'
import { TaskList } from '@/components/maintenance/task-list'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { listTasks } from '@/lib/maintenance/service'
import { getTenantContext } from '@/lib/tenant-context'
import { Permission, hasPermission } from '@/types/rbac'

export const metadata = { title: 'Maintenance' }

interface PageProps {
  searchParams: Promise<{ scope?: string }>
}

export default async function MaintenancePage({ searchParams }: PageProps) {
  const { scope: rawScope } = await searchParams
  const scope = rawScope === 'all' ? 'all' : 'attention'
  const ctx = await getTenantContext()
  const canManage = hasPermission(ctx.role, Permission.MANAGE_INVENTORY)
  const tasks = await listTasks(ctx, { scope })

  return (
    <div className='space-y-4'>
      <PageHeader
        title='Maintenance'
        description='Recurring jobs by time or usage hours, what is due, and what has been done.'
        actions={
          canManage && (
            <Button asChild>
              <Link href='/maintenance/plans'>
                <Plus />
                New plan
              </Link>
            </Button>
          )
        }
      />
      <MaintenanceTabs current='/maintenance' />

      <div className='flex gap-2 text-sm'>
        <Link
          href='/maintenance'
          aria-current={scope === 'attention' ? 'page' : undefined}
          className={
            scope === 'attention' ? 'font-medium' : 'text-muted-foreground'
          }
        >
          Needs attention
        </Link>
        <span className='text-muted-foreground'>/</span>
        <Link
          href='/maintenance?scope=all'
          aria-current={scope === 'all' ? 'page' : undefined}
          className={scope === 'all' ? 'font-medium' : 'text-muted-foreground'}
        >
          All scheduled
        </Link>
      </div>

      <Card>
        <CardContent className='pt-6'>
          <TaskList
            tasks={tasks}
            canManage={canManage}
            emptyTitle={
              scope === 'attention'
                ? 'Nothing due or overdue'
                : 'Nothing scheduled yet'
            }
            emptyDescription={
              scope === 'attention'
                ? 'Tasks appear here once they are inside their reminder window.'
                : 'Create a plan to schedule recurring maintenance for an item or a whole category.'
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}
