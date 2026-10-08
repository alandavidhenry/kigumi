'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

import { AuthCard, FormError, FormNotice } from '@/components/auth/auth-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import { authClient } from '@/lib/auth-client'
import { safeCallbackUrl } from '@/lib/safe-redirect'

function SignUpForm() {
  const searchParams = useSearchParams()
  // New users land on onboarding unless they arrived from an invitation.
  const callbackUrl = safeCallbackUrl(
    searchParams.get('callbackUrl'),
    '/onboarding'
  )
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError(null)

    const { error: signUpError } = await authClient.signUp.email({
      name,
      email,
      password,
      callbackURL: callbackUrl
    })
    setLoading(false)

    if (signUpError) {
      setError(signUpError.message ?? 'Could not create your account')
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <AuthCard title='Check your inbox'>
        <FormNotice>
          We sent a verification link to <strong>{email}</strong>. Follow it to
          finish setting up your account.
        </FormNotice>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title='Create your Kigumi account'
      description='You’ll set up your organisation and first studio next.'
    >
      <form onSubmit={onSubmit} className='space-y-4'>
        <div className='space-y-2'>
          <Label htmlFor='name'>Your name</Label>
          <Input
            id='name'
            autoComplete='name'
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </div>
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
        <div className='space-y-2'>
          <Label htmlFor='password'>Password</Label>
          <PasswordInput
            id='password'
            autoComplete='new-password'
            minLength={10}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <p className='text-xs text-muted-foreground'>
            At least 10 characters.
          </p>
        </div>
        <FormError message={error} />
        <Button type='submit' className='w-full' disabled={loading}>
          {loading ? 'Creating account…' : 'Create account'}
        </Button>
        <p className='text-center text-sm text-muted-foreground'>
          Already have an account?{' '}
          <Link
            href={`/auth/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            className='underline underline-offset-4'
          >
            Sign in
          </Link>
        </p>
      </form>
    </AuthCard>
  )
}

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpForm />
    </Suspense>
  )
}
