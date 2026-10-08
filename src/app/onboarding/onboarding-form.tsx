'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { AuthCard, FormError } from '@/components/auth/auth-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authClient } from '@/lib/auth-client'
import { apiFetch } from '@/lib/client-api'
import { uniqueSlug } from '@/lib/slug'

export function OnboardingForm({
  firstOrganisation
}: {
  readonly firstOrganisation: boolean
}) {
  const router = useRouter()
  const [organisationName, setOrganisationName] = useState('')
  const [studioName, setStudioName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError(null)

    const { data, error: createError } = await authClient.organization.create({
      name: organisationName.trim(),
      slug: uniqueSlug(organisationName)
    })
    if (createError || !data) {
      setLoading(false)
      setError(createError?.message ?? 'Could not create the organisation')
      return
    }

    await authClient.organization.setActive({ organizationId: data.id })

    // The first studio is optional; carry on to the dashboard either way.
    if (studioName.trim()) {
      try {
        await apiFetch('/api/studios', {
          method: 'POST',
          body: { name: studioName.trim() }
        })
      } catch {
        // Surfaced on the studios page instead.
      }
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <AuthCard
      title={firstOrganisation ? 'Set up your studio' : 'New organisation'}
      description='An organisation holds your studios, rooms, gear and team. You can rename it later.'
    >
      <form onSubmit={onSubmit} className='space-y-4'>
        <div className='space-y-2'>
          <Label htmlFor='organisation'>Organisation name</Label>
          <Input
            id='organisation'
            placeholder='e.g. Northern Lights Recording'
            value={organisationName}
            onChange={(event) => setOrganisationName(event.target.value)}
            maxLength={100}
            required
          />
        </div>
        <div className='space-y-2'>
          <Label htmlFor='studio'>First studio (optional)</Label>
          <Input
            id='studio'
            placeholder='e.g. Main studio'
            value={studioName}
            onChange={(event) => setStudioName(event.target.value)}
            maxLength={100}
          />
          <p className='text-xs text-muted-foreground'>
            A studio is a building or site. You’ll add rooms to it next.
          </p>
        </div>
        <FormError message={error} />
        <Button type='submit' className='w-full' disabled={loading}>
          {loading ? 'Setting up…' : 'Continue'}
        </Button>
      </form>
    </AuthCard>
  )
}
