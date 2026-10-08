'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { AuthCard, FormError } from '@/components/auth/auth-card'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import { MEMBER_ROLE_LABELS, isMemberRole } from '@/types/rbac'

interface InvitationDetails {
  organizationName: string
  inviterEmail: string
  role: string
  email: string
}

export function AcceptInvitation({
  invitationId,
  signedInEmail
}: {
  readonly invitationId: string
  readonly signedInEmail: string
}) {
  const router = useRouter()
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    authClient.organization
      .getInvitation({ query: { id: invitationId } })
      .then(({ data, error: fetchError }) => {
        if (fetchError || !data) {
          setError(
            fetchError?.message ??
              'This invitation is invalid, has expired or was sent to a different email.'
          )
          return
        }
        setInvitation(data as InvitationDetails)
      })
  }, [invitationId])

  const respond = async (accept: boolean) => {
    setBusy(true)
    setError(null)
    const result = accept
      ? await authClient.organization.acceptInvitation({ invitationId })
      : await authClient.organization.rejectInvitation({ invitationId })
    if (result.error) {
      setBusy(false)
      setError(result.error.message ?? 'Something went wrong')
      return
    }
    const member =
      accept && result.data && 'member' in result.data
        ? result.data.member
        : null
    if (member) {
      await authClient.organization.setActive({
        organizationId: member.organizationId
      })
    }
    router.push(accept ? '/dashboard' : '/')
    router.refresh()
  }

  if (!invitation) {
    return (
      <AuthCard title='Invitation'>
        {error ? (
          <div className='space-y-3'>
            <FormError message={error} />
            <p className='text-sm text-muted-foreground'>
              You’re signed in as {signedInEmail}.
            </p>
          </div>
        ) : (
          <p className='text-sm text-muted-foreground'>Loading invitation…</p>
        )}
      </AuthCard>
    )
  }

  const role = isMemberRole(invitation.role)
    ? MEMBER_ROLE_LABELS[invitation.role]
    : invitation.role

  return (
    <AuthCard
      title={`Join ${invitation.organizationName}`}
      description={`${invitation.inviterEmail} invited you to join as ${role}.`}
    >
      <div className='space-y-4'>
        <FormError message={error} />
        <div className='flex gap-2'>
          <Button
            className='flex-1'
            disabled={busy}
            onClick={() => void respond(true)}
          >
            Accept
          </Button>
          <Button
            className='flex-1'
            variant='surface'
            disabled={busy}
            onClick={() => void respond(false)}
          >
            Decline
          </Button>
        </div>
      </div>
    </AuthCard>
  )
}
