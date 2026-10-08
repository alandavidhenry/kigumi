import { redirect } from 'next/navigation'

import { AppShell } from '@/components/app-shell'
import { TenantProvider } from '@/components/providers/tenant-provider'
import type { ClientTenant } from '@/components/providers/tenant-provider'
import { isAppError } from '@/lib/errors'
import { listMyOrganisations } from '@/lib/members'
import { getTenantContext } from '@/lib/tenant-context'
import type { TenantContext } from '@/lib/tenant-context'

async function resolveTenant(): Promise<TenantContext> {
  try {
    return await getTenantContext()
  } catch (error) {
    if (isAppError(error) && error.code === 'UNAUTHORIZED') {
      redirect('/auth/sign-in')
    }
    if (isAppError(error) && error.code === 'NO_ACTIVE_ORGANISATION') {
      redirect('/onboarding')
    }
    throw error
  }
}

// Every signed-in page sits under this layout, which resolves the session and
// active organisation server-side before anything renders.
export default async function AppLayout({
  children
}: {
  readonly children: React.ReactNode
}) {
  const ctx = await resolveTenant()
  const organisations = await listMyOrganisations(ctx.userId)

  const tenant: ClientTenant = {
    userId: ctx.userId,
    userName: ctx.userName,
    userEmail: ctx.userEmail,
    organisationId: ctx.organisationId,
    organisationName: ctx.organisationName,
    role: ctx.role,
    planTier: ctx.planTier,
    organisations
  }

  return (
    <TenantProvider tenant={tenant}>
      <AppShell>{children}</AppShell>
    </TenantProvider>
  )
}
