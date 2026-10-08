'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { FormError } from '@/components/auth/auth-card'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/use-toast'
import { authClient } from '@/lib/auth-client'

export function OrganisationForm({
  name,
  canEdit
}: {
  readonly name: string
  readonly canEdit: boolean
}) {
  const router = useRouter()
  const [value, setValue] = useState(name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    const { error: updateError } = await authClient.organization.update({
      data: { name: value.trim() }
    })
    setSaving(false)
    if (updateError) {
      setError(updateError.message ?? 'Could not save')
      return
    }
    toast({ title: 'Organisation updated' })
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className='max-w-md space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='organisation-name'>Name</Label>
            <Input
              id='organisation-name'
              value={value}
              onChange={(event) => setValue(event.target.value)}
              maxLength={100}
              disabled={!canEdit}
              required
            />
          </div>
          <FormError message={error} />
          {canEdit && (
            <Button
              type='submit'
              disabled={saving || value.trim() === name || !value.trim()}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
