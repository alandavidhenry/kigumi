'use client'

import { Mail, UserPlus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { FormError } from '@/components/auth/auth-card'
import { ConfirmDeleteButton } from '@/components/confirm-delete-button'
import { useTenant } from '@/components/providers/tenant-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { toast } from '@/components/ui/use-toast'
import { UpgradeNotice } from '@/components/upgrade-notice'
import { authClient } from '@/lib/auth-client'
import type { InvitationRow, MemberRow } from '@/lib/members'
import { MEMBER_ROLE_LABELS, MemberRole, assignableRoles } from '@/types/rbac'

const ROLE_HELP: Record<MemberRole, string> = {
  [MemberRole.OWNER]:
    'Everything, including billing and deleting the organisation',
  [MemberRole.MANAGER]: 'Manage studios, rooms, gear and members',
  [MemberRole.ENGINEER]: 'View everything; run sessions (later phases)',
  [MemberRole.VIEWER]: 'Read-only access'
}

const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' })

function RoleSelect({
  value,
  roles,
  onChange,
  disabled,
  label
}: {
  readonly value: MemberRole
  readonly roles: MemberRole[]
  readonly onChange: (role: MemberRole) => void
  readonly disabled?: boolean
  readonly label: string
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as MemberRole)}
      disabled={disabled}
    >
      <SelectTrigger className='w-36' aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {roles.map((role) => (
          <SelectItem key={role} value={role}>
            {MEMBER_ROLE_LABELS[role]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function InviteDialog({ disabled }: { readonly disabled: boolean }) {
  const router = useRouter()
  const { role } = useTenant()
  const roles = assignableRoles(role)
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<MemberRole>(MemberRole.ENGINEER)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSending(true)
    setError(null)
    const { error: inviteError } = await authClient.organization.inviteMember({
      email: email.trim(),
      role: inviteRole
    })
    setSending(false)
    if (inviteError) {
      setError(inviteError.message ?? 'Could not send the invitation')
      return
    }
    toast({ title: 'Invitation sent', description: email })
    setOpen(false)
    setEmail('')
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>
          <UserPlus />
          Invite
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className='space-y-4'>
          <DialogHeader>
            <DialogTitle>Invite someone</DialogTitle>
            <DialogDescription>
              They’ll get an email with a link that expires in 7 days.
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-2'>
            <Label htmlFor='invite-email'>Email</Label>
            <Input
              id='invite-email'
              type='email'
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div className='space-y-2'>
            <Label>Role</Label>
            <RoleSelect
              value={inviteRole}
              roles={roles}
              onChange={setInviteRole}
              label='Invitation role'
            />
            <p className='text-xs text-muted-foreground'>
              {ROLE_HELP[inviteRole]}
            </p>
          </div>
          <FormError message={error} />
          <DialogFooter>
            <Button
              type='button'
              variant='surface'
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type='submit' disabled={sending}>
              {sending ? 'Sending…' : 'Send invitation'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function MembersManager({
  members,
  invitations,
  canManage,
  seatsAvailable,
  upgradePlanLabel
}: {
  readonly members: MemberRow[]
  readonly invitations: InvitationRow[]
  readonly canManage: boolean
  readonly seatsAvailable: boolean
  readonly upgradePlanLabel: string | null
}) {
  const router = useRouter()
  const { userId, role } = useTenant()
  const roles = assignableRoles(role)
  const [pending, setPending] = useState<string | null>(null)

  // Only owners may change or remove an owner (also enforced by Better Auth).
  const canEdit = (member: MemberRow) =>
    canManage &&
    member.userId !== userId &&
    (member.role !== MemberRole.OWNER || role === MemberRole.OWNER)

  const changeRole = async (member: MemberRow, next: MemberRole) => {
    setPending(member.id)
    const { error } = await authClient.organization.updateMemberRole({
      memberId: member.id,
      role: next
    })
    setPending(null)
    if (error) {
      toast({
        title: 'Could not change role',
        description: error.message,
        variant: 'destructive'
      })
      return
    }
    toast({ title: `${member.name} is now ${MEMBER_ROLE_LABELS[next]}` })
    router.refresh()
  }

  const removeMember = (member: MemberRow) => async () => {
    const { error } = await authClient.organization.removeMember({
      memberIdOrEmail: member.id
    })
    if (error) throw new Error(error.message ?? 'Could not remove member')
    toast({ title: `${member.name} removed` })
    router.refresh()
  }

  const cancelInvitation = (invitation: InvitationRow) => async () => {
    const { error } = await authClient.organization.cancelInvitation({
      invitationId: invitation.id
    })
    if (error) throw new Error(error.message ?? 'Could not cancel invitation')
    toast({ title: 'Invitation cancelled' })
    router.refresh()
  }

  return (
    <div className='space-y-6'>
      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0'>
          <CardTitle>People</CardTitle>
          {canManage && <InviteDialog disabled={!seatsAvailable} />}
        </CardHeader>
        <CardContent className='p-0'>
          {canManage && !seatsAvailable && (
            <UpgradeNotice
              compact
              className='mx-4 mb-3'
              title='All seats on your plan are in use'
              planLabel={upgradePlanLabel}
            />
          )}
          <ul className='divide-y border-t'>
            {members.map((member) => (
              <li
                key={member.id}
                className='flex min-h-14 flex-wrap items-center gap-3 px-4 py-3'
              >
                <div className='min-w-0 flex-1'>
                  <p className='truncate font-medium'>
                    {member.name}
                    {member.userId === userId && (
                      <span className='text-muted-foreground'> (you)</span>
                    )}
                  </p>
                  <p className='truncate text-xs text-muted-foreground'>
                    {member.email} · joined {dateFormat.format(member.joinedAt)}
                  </p>
                </div>
                {canEdit(member) ? (
                  <div className='flex items-center gap-1'>
                    <RoleSelect
                      value={member.role}
                      roles={
                        roles.includes(member.role)
                          ? roles
                          : [member.role, ...roles]
                      }
                      onChange={(next) => void changeRole(member, next)}
                      disabled={pending === member.id}
                      label={`Role for ${member.name}`}
                    />
                    <ConfirmDeleteButton
                      title={`Remove ${member.name}?`}
                      description='They will lose access to this organisation immediately.'
                      confirmLabel='Remove'
                      label={`Remove ${member.name}`}
                      size='icon'
                      onConfirm={removeMember(member)}
                    />
                  </div>
                ) : (
                  <Badge
                    variant={
                      member.role === MemberRole.OWNER ? 'default' : 'outline'
                    }
                  >
                    {MEMBER_ROLE_LABELS[member.role]}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {canManage && invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending invitations</CardTitle>
          </CardHeader>
          <CardContent className='p-0'>
            <ul className='divide-y border-t'>
              {invitations.map((invitation) => (
                <li
                  key={invitation.id}
                  className='flex min-h-14 items-center gap-3 px-4 py-3'
                >
                  <Mail className='h-4 w-4 shrink-0 text-muted-foreground' />
                  <div className='min-w-0 flex-1'>
                    <p className='truncate'>{invitation.email}</p>
                    <p className='truncate text-xs text-muted-foreground'>
                      {MEMBER_ROLE_LABELS[invitation.role]} · invited by{' '}
                      {invitation.inviterName} · expires{' '}
                      {dateFormat.format(invitation.expiresAt)}
                    </p>
                  </div>
                  <ConfirmDeleteButton
                    title='Cancel this invitation?'
                    description={`${invitation.email} won’t be able to use their link.`}
                    confirmLabel='Cancel invitation'
                    label={`Cancel invitation for ${invitation.email}`}
                    size='icon'
                    onConfirm={cancelInvitation(invitation)}
                  />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
