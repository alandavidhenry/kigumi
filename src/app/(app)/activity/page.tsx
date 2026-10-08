import { History } from 'lucide-react'
import { redirect } from 'next/navigation'

import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { UpgradeNotice } from '@/components/upgrade-notice'
import { listAuditLog } from '@/lib/audit'
import { Feature, PLAN_LABELS, hasFeature, minimumTierFor } from '@/lib/plans'
import { getTenantContext } from '@/lib/tenant-context'
import { Permission, hasPermission } from '@/types/rbac'

export const metadata = { title: 'Activity' }

const dateTime = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short'
})

export default async function ActivityPage() {
  const ctx = await getTenantContext()
  if (!hasPermission(ctx.role, Permission.VIEW_AUDIT_LOG))
    redirect('/dashboard')

  // Below Studio, history is still recorded but shown only after upgrading.
  if (!hasFeature(ctx.planTier, Feature.AUDIT_LOG)) {
    return (
      <div className='space-y-6'>
        <PageHeader
          title='Activity'
          description='Changes to studios, rooms, members and settings.'
        />
        <UpgradeNotice
          title='See who changed what, and when'
          description='The activity log is part of the Studio plan. Kigumi is already recording your history, so it will all be here when you upgrade.'
          planLabel={PLAN_LABELS[minimumTierFor(Feature.AUDIT_LOG)]}
        />
      </div>
    )
  }

  const entries = await listAuditLog(ctx, { limit: 200 })

  return (
    <div className='space-y-6'>
      <PageHeader
        title='Activity'
        description='Changes to studios, rooms, members and settings.'
      />
      <Card className='overflow-hidden p-0'>
        {entries.length === 0 ? (
          <EmptyState icon={History} title='No activity yet' />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>What</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className='whitespace-nowrap text-muted-foreground'>
                    {dateTime.format(entry.createdAt)}
                  </TableCell>
                  <TableCell className='whitespace-nowrap'>
                    {entry.actor?.name ?? 'System'}
                  </TableCell>
                  <TableCell>{entry.summary}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
