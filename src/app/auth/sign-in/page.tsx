'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

import { AuthCard, FormError, FormNotice } from '@/components/auth/auth-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import { authClient } from '@/lib/auth-client'
import { safeCallbackUrl } from '@/lib/safe-redirect'

function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = safeCallbackUrl(searchParams.get('callbackUrl'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unverified, setUnverified] = useState(false)
  const [resent, setResent] = useState(false)

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setUnverified(false)

    const { error: signInError } = await authClient.signIn.email({
      email,
      password
    })
    setLoading(false)

    if (signInError) {
      if (signInError.status === 403) {
        setUnverified(true)
        return
      }
      setError(signInError.message ?? 'Invalid email or password')
      return
    }

    router.push(callbackUrl)
    router.refresh()
  }

  const resendVerification = async () => {
    await authClient.sendVerificationEmail({
      email,
      callbackURL: '/onboarding'
    })
    setResent(true)
  }

  return (
    <AuthCard
      title='Sign in to Kigumi'
      description='Use the email and password you signed up with.'
    >
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
        <div className='space-y-2'>
          <Label htmlFor='password'>Password</Label>
          <PasswordInput
            id='password'
            autoComplete='current-password'
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        <FormError message={error} />
        {unverified && (
          <FormNotice>
            Please verify your email first.{' '}
            {resent ? (
              'We sent you a new link.'
            ) : (
              <button
                type='button'
                onClick={() => void resendVerification()}
                className='underline underline-offset-4'
              >
                Resend the verification email
              </button>
            )}
          </FormNotice>
        )}
        <Button type='submit' className='w-full' disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
        <div className='flex justify-between text-sm text-muted-foreground'>
          <Link
            href='/auth/forgot-password'
            className='underline-offset-4 hover:underline'
          >
            Forgot your password?
          </Link>
          <Link
            href={`/auth/sign-up?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            className='underline-offset-4 hover:underline'
          >
            Create an account
          </Link>
        </div>
      </form>
    </AuthCard>
  )
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  )
}
