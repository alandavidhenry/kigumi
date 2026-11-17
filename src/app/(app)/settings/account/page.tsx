import { AccountForms } from '@/app/(app)/settings/account/account-forms'
import { PageHeader } from '@/components/page-header'
import { listSoleOwnerOrganisations, soleOwnerMessage } from '@/lib/account'
import { getTenantContext } from '@/lib/tenant-context'

export const metadata = { title: 'Account' }

export default async function AccountSettingsPage() {
  const ctx = await getTenantContext()
  const blocking = await listSoleOwnerOrganisations(ctx.userId)

  return (
    <div className='space-y-8'>
      <PageHeader title='Account' description={ctx.userEmail} />
      <AccountForms
        name={ctx.userName}
        email={ctx.userEmail}
        deleteBlockedReason={
          blocking.length > 0 ? soleOwnerMessage(blocking) : null
        }
      />
    </div>
  )
}
