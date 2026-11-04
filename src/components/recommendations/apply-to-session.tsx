'use client'

import Link from 'next/link'
import { useState } from 'react'

import { FormError } from '@/components/auth/auth-card'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { apiFetch } from '@/lib/client-api'
import type { ApplyResult } from '@/lib/sessions/apply'

// Puts a stored recommendation onto a session's layout and input list.
export function ApplyToSession({
  resultId,
  defaultSessionId,
  sessions
}: {
  readonly resultId: string
  readonly defaultSessionId: string | null
  readonly sessions: Array<{ id: string; name: string }>
}) {
  const [sessionId, setSessionId] = useState(
    defaultSessionId && sessions.some((s) => s.id === defaultSessionId)
      ? defaultSessionId
      : (sessions[0]?.id ?? '')
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ id: string; result: ApplyResult } | null>(
    null
  )

  if (sessions.length === 0) {
    return (
      <Card className='p-4 text-sm text-muted-foreground'>
        Create a session to apply this recommendation to its layout and input
        list.{' '}
        <Link href='/sessions' className='underline'>
          Go to sessions
        </Link>
      </Card>
    )
  }

  const apply = async () => {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const { result } = await apiFetch<{ result: ApplyResult }>(
        `/api/sessions/${sessionId}/apply-recommendation`,
        { method: 'POST', body: { resultId } }
      )
      setDone({ id: sessionId, result })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not apply')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className='space-y-3 p-4'>
      <div className='flex flex-wrap items-end gap-3'>
        <div className='space-y-1'>
          <Label htmlFor='apply-session'>Apply to a session</Label>
          <NativeSelect
            id='apply-session'
            className='w-64'
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button onClick={() => void apply()} disabled={busy}>
          {busy ? 'Applying…' : 'Apply to session'}
        </Button>
      </div>
      <p className='text-xs text-muted-foreground'>
        Adds the recommended microphones to the layout and input list. Mics with
        a matching label keep their place; new ones go along the bottom of the
        room for you to position.
      </p>
      <FormError message={error} />
      {done && (
        <p role='status' className='text-sm'>
          Applied: {done.result.updated} updated, {done.result.created} added
          {done.result.skipped.length > 0 &&
            `, ${done.result.skipped.length} skipped (${done.result.skipped
              .map((s) => s.label)
              .join(', ')})`}
          .{' '}
          <Link href={`/sessions/${done.id}`} className='underline'>
            Open the session
          </Link>
        </p>
      )}
    </Card>
  )
}
