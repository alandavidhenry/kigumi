'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { FormError, FormNotice } from '@/components/auth/auth-card'
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
import { Notice } from '@/components/ui/notice'
import { PasswordInput } from '@/components/ui/password-input'
import { toast } from '@/components/ui/use-toast'
import { authClient } from '@/lib/auth-client'

const MIN_PASSWORD_LENGTH = 10

function ProfileCard({ name }: { readonly name: string }) {
  const router = useRouter()
  const [value, setValue] = useState(name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    const { error: updateError } = await authClient.updateUser({
      name: value.trim()
    })
    setSaving(false)
    if (updateError) {
      setError(updateError.message ?? 'Could not save')
      return
    }
    toast({ title: 'Name updated' })
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className='max-w-md space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='account-name'>Name</Label>
            <Input
              id='account-name'
              value={value}
              onChange={(event) => setValue(event.target.value)}
              maxLength={100}
              autoComplete='name'
              required
            />
          </div>
          <FormError message={error} />
          <Button
            type='submit'
            disabled={saving || !value.trim() || value.trim() === name}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function EmailCard({ email }: { readonly email: string }) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setSent(false)
    const { error: changeError } = await authClient.changeEmail({
      newEmail: value.trim(),
      callbackURL: '/settings/account'
    })
    setSaving(false)
    if (changeError) {
      setError(changeError.message ?? 'Could not change email')
      return
    }
    setSent(true)
    setValue('')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className='max-w-md space-y-4'>
          <p className='text-sm text-muted-foreground'>
            Your email is <span className='font-mono'>{email}</span>. We email a
            link to your current address to approve the change, then a link to
            the new one to verify it. Nothing changes until both are followed.
          </p>
          <div className='space-y-2'>
            <Label htmlFor='account-new-email'>New email</Label>
            <Input
              id='account-new-email'
              type='email'
              value={value}
              onChange={(event) => setValue(event.target.value)}
              autoComplete='email'
              required
            />
          </div>
          <FormError message={error} />
          {sent && (
            <FormNotice>
              Check your current inbox to approve the change.
            </FormNotice>
          )}
          <Button type='submit' disabled={saving || !value.trim()}>
            {saving ? 'Sending…' : 'Change email'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function PasswordCard() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (next !== confirm) {
      setError('The new passwords do not match')
      return
    }
    setSaving(true)
    const { error: changeError } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: true
    })
    setSaving(false)
    if (changeError) {
      setError(changeError.message ?? 'Could not change password')
      return
    }
    setCurrent('')
    setNext('')
    setConfirm('')
    toast({
      title: 'Password changed',
      description: 'You were signed out of your other devices.'
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className='max-w-md space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='current-password'>Current password</Label>
            <PasswordInput
              id='current-password'
              autoComplete='current-password'
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              required
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='new-password'>New password</Label>
            <PasswordInput
              id='new-password'
              autoComplete='new-password'
              minLength={MIN_PASSWORD_LENGTH}
              value={next}
              onChange={(event) => setNext(event.target.value)}
              required
            />
            <p className='text-xs text-muted-foreground'>
              At least {MIN_PASSWORD_LENGTH} characters.
            </p>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='confirm-new-password'>Confirm new password</Label>
            <PasswordInput
              id='confirm-new-password'
              autoComplete='new-password'
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              required
            />
          </div>
          <FormError message={error} />
          <Button type='submit' disabled={saving}>
            {saving ? 'Saving…' : 'Change password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function DeleteCard({
  blockedReason
}: {
  readonly blockedReason: string | null
}) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const { error: deleteError } = await authClient.deleteUser({
      password,
      callbackURL: '/auth/sign-in'
    })
    setBusy(false)
    if (deleteError) {
      setError(deleteError.message ?? 'Could not start deletion')
      return
    }
    setSent(true)
    setOpen(false)
    setPassword('')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Delete account</CardTitle>
      </CardHeader>
      <CardContent className='max-w-xl space-y-4'>
        <p className='text-sm text-muted-foreground'>
          Permanently removes your sign-in and takes you out of every
          organisation. Studio data stays with the organisations, and past
          activity shows as a removed user. This can’t be undone.
        </p>
        {blockedReason && (
          <Notice variant='warning' role='status'>
            {blockedReason}
          </Notice>
        )}
        {sent && (
          <FormNotice>
            Check your inbox and follow the link to finish deleting your
            account.
          </FormNotice>
        )}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant='destructive' disabled={Boolean(blockedReason)}>
              Delete my account
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={onSubmit} className='space-y-4'>
              <DialogHeader>
                <DialogTitle>Delete your account?</DialogTitle>
                <DialogDescription>
                  Enter your password. We then email you a link, and your
                  account is deleted only when you follow it.
                </DialogDescription>
              </DialogHeader>
              <div className='space-y-2'>
                <Label htmlFor='delete-password'>Password</Label>
                <PasswordInput
                  id='delete-password'
                  autoComplete='current-password'
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
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
                <Button type='submit' variant='destructive' disabled={busy}>
                  {busy ? 'Working…' : 'Email me the link'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}

export function AccountForms({
  name,
  email,
  deleteBlockedReason
}: {
  readonly name: string
  readonly email: string
  readonly deleteBlockedReason: string | null
}) {
  return (
    <div className='space-y-8'>
      <ProfileCard name={name} />
      <EmailCard email={email} />
      <PasswordCard />
      <DeleteCard blockedReason={deleteBlockedReason} />
    </div>
  )
}
