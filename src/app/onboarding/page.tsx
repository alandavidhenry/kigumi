import { redirect } from 'next/navigation'

import { OnboardingForm } from '@/app/onboarding/onboarding-form'
import { PublicChrome } from '@/components/public-chrome'
import { listMyOrganisations } from '@/lib/members'
import { getSession } from '@/lib/tenant-context'

export const metadata = { title: 'Set up your studio' }

export default async function OnboardingPage({
  searchParams
}: {
  searchParams: Promise<{ new?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/auth/sign-in?callbackUrl=/onboarding')

  // Existing members only come here deliberately ("New organisation").
  const { new: creatingAnother } = await searchParams
  const organisations = await listMyOrganisations(session.user.id)
  if (organisations.length > 0 && !creatingAnother) redirect('/dashboard')

  return (
    <PublicChrome>
      <OnboardingForm firstOrganisation={organisations.length === 0} />
    </PublicChrome>
  )
}
