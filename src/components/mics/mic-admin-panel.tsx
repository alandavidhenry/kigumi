'use client'

import { AlertTriangle, CheckCircle2, Pencil } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { FormError } from '@/components/auth/auth-card'
import { MicFormDialog } from '@/components/mics/mic-form-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/use-toast'
import { ApiError, apiFetch } from '@/lib/client-api'
import type { PublishCheck } from '@/lib/mics/admin'
import type { MicDetail } from '@/lib/mics/catalogue'
import { MIC_STATUS_LABELS } from '@/lib/mics/types'
import type { MicStatus } from '@/lib/mics/types'

type Action = { status: MicStatus; label: string; needsNotes?: boolean }

const ACTIONS: Record<MicStatus, Action[]> = {
  draft: [{ status: 'in_review', label: 'Submit for review' }],
  in_review: [
    { status: 'published', label: 'Publish' },
    { status: 'draft', label: 'Send back to draft', needsNotes: true }
  ],
  published: [
    { status: 'in_review', label: 'Move to review' },
    { status: 'draft', label: 'Unpublish', needsNotes: true }
  ]
}

const STATUS_VARIANT = {
  draft: 'secondary',
  in_review: 'warning',
  published: 'success'
} as const

// Review controls for one catalogue entry (platform admins only). Publishing
// is blocked server-side until every value has a real source; LLM-drafted
// values also need the reviewer to attest they checked them.
export function MicAdminPanel({
  mic,
  publish
}: {
  readonly mic: MicDetail
  readonly publish: PublishCheck
}) {
  const router = useRouter()
  const [action, setAction] = useState<Action | null>(null)
  const [notes, setNotes] = useState('')
  const [confirmVerified, setConfirmVerified] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = (next: Action) => {
    setAction(next)
    setNotes(next.needsNotes ? '' : (mic.reviewNotes ?? ''))
    setConfirmVerified(false)
    setError(null)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!action) return
    setBusy(true)
    setError(null)
    try {
      await apiFetch(`/api/admin/mics/${mic.id}/status`, {
        method: 'POST',
        body: { status: action.status, notes, confirmVerified }
      })
      setAction(null)
      toast({ title: `Now ${MIC_STATUS_LABELS[action.status].toLowerCase()}` })
      router.refresh()
    } catch (caught) {
      const blockers =
        caught instanceof ApiError &&
        Array.isArray((caught.details as { blockers?: string[] })?.blockers)
          ? (caught.details as { blockers: string[] }).blockers.join('; ')
          : null
      setError(
        [
          caught instanceof Error ? caught.message : 'Could not update',
          blockers
        ]
          .filter(Boolean)
          .join(': ')
      )
    } finally {
      setBusy(false)
    }
  }

  const publishing = action?.status === 'published'

  return (
    <Card>
      <CardHeader className='flex-row flex-wrap items-center justify-between gap-2 space-y-0'>
        <div className='flex items-center gap-2'>
          <CardTitle className='text-base'>Review</CardTitle>
          <Badge variant={STATUS_VARIANT[mic.status]}>
            {MIC_STATUS_LABELS[mic.status]}
          </Badge>
        </div>
        <div className='flex flex-wrap gap-2'>
          <MicFormDialog
            mic={mic}
            trigger={
              <Button variant='surface' size='sm'>
                <Pencil />
                Edit
              </Button>
            }
          />
          {ACTIONS[mic.status].map((entry) => (
            <Button
              key={entry.status + entry.label}
              size='sm'
              variant={entry.status === 'published' ? 'default' : 'surface'}
              onClick={() => open(entry)}
            >
              {entry.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className='space-y-3 text-sm'>
        {mic.reviewNotes && (
          <p>
            <span className='text-muted-foreground'>Reviewer notes: </span>
            {mic.reviewNotes}
          </p>
        )}
        {publish.blockers.length > 0 ? (
          <div className='space-y-1'>
            <p className='flex items-center gap-2 font-medium text-warning'>
              <AlertTriangle className='h-4 w-4' />
              Not ready to publish
            </p>
            <ul className='list-disc pl-6 text-muted-foreground'>
              {publish.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className='flex items-center gap-2 text-success'>
            <CheckCircle2 className='h-4 w-4' />
            Every populated value has a source.
            {publish.needsVerification &&
              ' LLM-drafted values still need your verification.'}
          </p>
        )}
      </CardContent>

      <Dialog
        open={action !== null}
        onOpenChange={(o) => !o && setAction(null)}
      >
        <DialogContent className='sm:max-w-md'>
          <form onSubmit={submit} className='space-y-4'>
            <DialogHeader>
              <DialogTitle>{action?.label}</DialogTitle>
              <DialogDescription>
                {mic.manufacturer} {mic.model}
              </DialogDescription>
            </DialogHeader>
            {publishing && publish.needsVerification && (
              <label className='flex items-start gap-2 text-sm'>
                <input
                  type='checkbox'
                  className='mt-1'
                  checked={confirmVerified}
                  onChange={(event) => setConfirmVerified(event.target.checked)}
                />
                <span>
                  I checked each LLM-drafted value against its source document.
                </span>
              </label>
            )}
            <div className='space-y-2'>
              <Label htmlFor='review-notes'>
                Notes{action?.needsNotes ? ' (required)' : ''}
              </Label>
              <Textarea
                id='review-notes'
                value={notes}
                rows={3}
                maxLength={2000}
                required={action?.needsNotes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
            <FormError message={error} />
            <DialogFooter>
              <Button
                type='button'
                variant='surface'
                onClick={() => setAction(null)}
              >
                Cancel
              </Button>
              <Button
                type='submit'
                disabled={
                  busy ||
                  (publishing && publish.needsVerification && !confirmVerified)
                }
              >
                {busy ? 'Saving…' : action?.label}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
