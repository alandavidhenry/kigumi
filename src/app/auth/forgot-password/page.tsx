'use client'

import Link from 'next/link'
import { useState } from 'react'

import { AuthCard, FormNotice } from '@/components/auth/auth-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authClient } from '@/lib/auth-client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    // The response is the same whether or not the account exists, so the
    // form can't be used to discover registered emails.
    await authClient.requestPasswordReset({
      email,
      redirectTo: '/auth/reset-password'
    })
    setLoading(false)
    setSent(true)
  }

  return (
    <AuthCard
      title='Reset your password'
      description='We’ll email you a link to choose a new one.'
    >
      {sent ? (
        <FormNotice>
          If an account exists for <strong>{email}</strong>, a reset link is on
          its way.
        </FormNotice>
      ) : (
        <form onSubmit={onSubmit} className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='email'>Email</Label>
            <Input
              id='email'
              type='email'
              autoComplete='email'
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <Button type='submit' className='w-full' disabled={loading}>
            {loading ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}
      <p className='mt-4 text-center text-sm text-muted-foreground'>
        <Link href='/auth/sign-in' className='underline underline-offset-4'>
          Back to sign in
        </Link>
      </p>
    </AuthCard>
  )
}
