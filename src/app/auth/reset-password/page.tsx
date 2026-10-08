'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

import { AuthCard, FormError, FormNotice } from '@/components/auth/auth-card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import { authClient } from '@/lib/auth-client'

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(
    searchParams.get('error')
      ? 'This reset link is invalid or has expired.'
      : null
  )
  const [done, setDone] = useState(false)

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (password !== confirm) {
      setError('Passwords don’t match')
      return
    }
    if (!token) {
      setError('This reset link is invalid or has expired.')
      return
    }
    setLoading(true)
    setError(null)
    const { error: resetError } = await authClient.resetPassword({
      newPassword: password,
      token
    })
    setLoading(false)
    if (resetError) {
      setError(resetError.message ?? 'Could not reset your password')
      return
    }
    setDone(true)
  }

  return (
    <AuthCard title='Choose a new password'>
      {done ? (
        <div className='space-y-4'>
          <FormNotice>Your password has been changed.</FormNotice>
          <Button asChild className='w-full'>
            <Link href='/auth/sign-in'>Sign in</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='password'>New password</Label>
            <PasswordInput
              id='password'
              autoComplete='new-password'
              minLength={10}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='confirm'>Confirm password</Label>
            <PasswordInput
              id='confirm'
              autoComplete='new-password'
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              required
            />
          </div>
          <FormError message={error} />
          <Button type='submit' className='w-full' disabled={loading}>
            {loading ? 'Saving…' : 'Change password'}
          </Button>
        </form>
      )}
    </AuthCard>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  )
}
