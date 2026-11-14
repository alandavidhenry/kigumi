import { NotificationsList } from '@/components/maintenance/notifications-list'
import { PageHeader } from '@/components/page-header'
import { UpgradeNotice } from '@/components/upgrade-notice'
import { listNotifications } from '@/lib/maintenance/notifications'
import { Feature, hasFeature } from '@/lib/plans'
import { getTenantContext } from '@/lib/tenant-context'

export const metadata = { title: 'Reminders' }

export default async function NotificationsPage() {
  const ctx = await getTenantContext()
  const notifications = await listNotifications(ctx)
  const emailAllowed = hasFeature(ctx.planTier, Feature.EMAIL_REMINDERS)

  return (
    <div className='space-y-8'>
      <PageHeader
        title='Reminders'
        description='Due maintenance, PAT tests and expiring warranties.'
      />
      {!emailAllowed && (
        <UpgradeNotice
          compact
          title='Reminders are in-app on Free. Email reminders are on the Pro plan.'
          planLabel='Pro'
        />
      )}
      <NotificationsList notifications={notifications} />
    </div>
  )
}
