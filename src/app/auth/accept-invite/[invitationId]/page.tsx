import Link from 'next/link'

import { AcceptInvitation } from '@/app/auth/accept-invite/[invitationId]/accept-invitation'
import { AuthCard } from '@/components/auth/auth-card'
import { Button } from '@/components/ui/button'
import { getSession } from '@/lib/tenant-context'

export const metadata = { title: 'Accept invitation' }

export default async function AcceptInvitePage({
  params
}: {
  params: Promise<{ invitationId: string }>
}) {
  const { invitationId } = await params
  const session = await getSession()
  const here = encodeURIComponent(`/auth/accept-invite/${invitationId}`)

  if (!session) {
    return (
      <AuthCard
        title='You’ve been invited to Kigumi'
        description='Sign in or create an account with the email address the invitation was sent to.'
      >
        <div className='flex flex-col gap-2'>
          <Button asChild>
            <Link href={`/auth/sign-up?callbackUrl=${here}`}>
              Create an account
            </Link>
          </Button>
          <Button asChild variant='surface'>
            <Link href={`/auth/sign-in?callbackUrl=${here}`}>Sign in</Link>
          </Button>
        </div>
      </AuthCard>
    )
  }

  return (
    <AcceptInvitation
      invitationId={invitationId}
      signedInEmail={session.user.email}
    />
  )
}
