'use client'

import {
  Copy,
  Download,
  FileText,
  Link2,
  LayoutTemplate,
  Sparkles
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { FormError } from '@/components/auth/auth-card'
import { ConfirmDeleteButton } from '@/components/confirm-delete-button'
import { Button } from '@/components/ui/button'
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
import { NativeSelect } from '@/components/ui/native-select'
import { toast } from '@/components/ui/use-toast'
import { UpgradeNotice } from '@/components/upgrade-notice'
import { apiFetch } from '@/lib/client-api'
import type { ApplyResult } from '@/lib/sessions/apply'

export interface RecommendationChoice {
  id: string
  title: string
}

// Everything you can do with a session besides editing its fields.
export function SessionActions({
  sessionId,
  layoutId,
  canEdit,
  canUseTemplates,
  share,
  recommendations
}: {
  readonly sessionId: string
  readonly layoutId: string | null
  readonly canEdit: boolean
  readonly canUseTemplates: boolean
  readonly share: { token: string | null; expiresAt: string | null } | null
  readonly recommendations: RecommendationChoice[]
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])
  const shareUrl =
    share?.token && origin ? `${origin}/share/${share.token}` : null

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      router.refresh()
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Something went wrong'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap gap-2'>
        {layoutId && (
          <Button asChild>
            <Link href={`/sessions/${sessionId}/layout`}>
              {canEdit ? 'Edit layout' : 'View layout'}
            </Link>
          </Button>
        )}
        <Button variant='outline' asChild>
          <a href={`/api/sessions/${sessionId}/sheet`}>
            <FileText />
            Session sheet (PDF)
          </a>
        </Button>
        <Button variant='outline' asChild>
          <a href={`/api/sessions/${sessionId}/daw-export?format=csv`}>
            <Download />
            DAW tracks (CSV)
          </a>
        </Button>
        <Button variant='outline' asChild>
          <a href={`/api/sessions/${sessionId}/daw-export?format=txt`}>
            <Download />
            DAW tracks (text)
          </a>
        </Button>
        {canEdit && (
          <Button variant='outline' asChild>
            <Link href={`/recommendations?sessionId=${sessionId}`}>
              <Sparkles />
              Recommend mics
            </Link>
          </Button>
        )}
        {canEdit && recommendations.length > 0 && (
          <ApplyDialog
            sessionId={sessionId}
            recommendations={recommendations}
          />
        )}
        {canEdit && (
          <Button
            variant='outline'
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const data = await apiFetch<{ session: { id: string } }>(
                  `/api/sessions/${sessionId}/duplicate`,
                  { method: 'POST' }
                )
                toast({ title: 'Session duplicated' })
                router.push(`/sessions/${data.session.id}`)
              })
            }
          >
            <Copy />
            Duplicate
          </Button>
        )}
      </div>

      {canEdit && (
        <section className='space-y-2' aria-label='Share link'>
          <h3 className='text-sm font-medium'>Read-only share link</h3>
          {share ? (
            <div className='space-y-2'>
              <div className='flex flex-wrap items-center gap-2'>
                <Input
                  readOnly
                  aria-label='Share link'
                  className='max-w-md font-mono text-xs'
                  value={shareUrl ?? ''}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  variant='outline'
                  size='sm'
                  disabled={!shareUrl}
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(shareUrl ?? '')
                      .then(() => toast({ title: 'Link copied' }))
                  }}
                >
                  <Link2 />
                  Copy
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await apiFetch(`/api/sessions/${sessionId}/share`, {
                        method: 'POST',
                        body: {}
                      })
                      toast({
                        title: 'New link made; the old one stopped working'
                      })
                    })
                  }
                >
                  New link
                </Button>
                <ConfirmDeleteButton
                  title='Revoke this link?'
                  description='Anyone using it will get a not-found page.'
                  confirmLabel='Revoke'
                  label='Revoke'
                  onConfirm={async () => {
                    await apiFetch(`/api/sessions/${sessionId}/share`, {
                      method: 'DELETE'
                    })
                    router.refresh()
                  }}
                />
              </div>
              {!share.token && (
                <p className='text-xs text-muted-foreground'>
                  This link still works but can no longer be shown. Make a new
                  link to copy it (the old one will stop working).
                </p>
              )}
              <p className='text-xs text-muted-foreground'>
                Anyone with the link can see the layout and input list, but not
                your notes or serial numbers.
                {share.expiresAt
                  ? ` Expires ${new Date(share.expiresAt).toLocaleDateString('en-GB')}.`
                  : ' It does not expire.'}
              </p>
            </div>
          ) : (
            <Button
              variant='outline'
              size='sm'
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await apiFetch(`/api/sessions/${sessionId}/share`, {
                    method: 'POST',
                    body: {}
                  })
                })
              }
            >
              <Link2 />
              Create share link
            </Button>
          )}
        </section>
      )}

      {canEdit && (
        <section className='space-y-2' aria-label='Template'>
          <h3 className='text-sm font-medium'>Layout template</h3>
          {canUseTemplates ? (
            <SaveTemplateDialog sessionId={sessionId} />
          ) : (
            <UpgradeNotice
              compact
              title='Saving your own layout templates is a Pro feature.'
              planLabel='Pro'
            />
          )}
        </section>
      )}

      {canEdit && (
        <ConfirmDeleteButton
          title='Delete this session?'
          description='Its layout and input list are deleted too. This cannot be undone.'
          label='Delete session'
          onConfirm={async () => {
            await apiFetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
            router.push('/sessions')
            router.refresh()
          }}
        />
      )}
      <FormError message={error} />
    </div>
  )
}

function ApplyDialog({
  sessionId,
  recommendations
}: {
  readonly sessionId: string
  readonly recommendations: RecommendationChoice[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [resultId, setResultId] = useState(recommendations[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const apply = async () => {
    setBusy(true)
    setError(null)
    try {
      const { result } = await apiFetch<{ result: ApplyResult }>(
        `/api/sessions/${sessionId}/apply-recommendation`,
        { method: 'POST', body: { resultId } }
      )
      setOpen(false)
      toast({
        title: `Applied: ${result.updated} updated, ${result.created} added`,
        description:
          result.skipped.length > 0
            ? `${result.skipped.length} source(s) skipped.`
            : undefined
      })
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not apply')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant='outline'>Apply a recommendation</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apply a recommendation</DialogTitle>
          <DialogDescription>
            Puts the recommended microphones on this layout and input list. Mics
            that match an existing label keep their position; new ones appear
            along the bottom of the room for you to place.
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-1'>
          <Label htmlFor='apply-result'>Recommendation</Label>
          <NativeSelect
            id='apply-result'
            value={resultId}
            onChange={(e) => setResultId(e.target.value)}
          >
            {recommendations.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </NativeSelect>
        </div>
        <FormError message={error} />
        <DialogFooter>
          <Button onClick={() => void apply()} disabled={busy || !resultId}>
            {busy ? 'Applying…' : 'Apply'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SaveTemplateDialog({ sessionId }: { readonly sessionId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await apiFetch('/api/layouts/templates', {
        method: 'POST',
        body: { name, fromSessionId: sessionId }
      })
      setOpen(false)
      toast({ title: 'Saved as a template' })
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant='outline' size='sm'>
          <LayoutTemplate />
          Save layout as template
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={save} className='space-y-4'>
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
            <DialogDescription>
              Keeps shapes, positions and labels. Microphones are chosen for
              each session.
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-1'>
            <Label htmlFor='tpl-name'>Template name</Label>
            <Input
              id='tpl-name'
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <FormError message={error} />
          <DialogFooter>
            <Button type='submit' disabled={busy}>
              Save template
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
