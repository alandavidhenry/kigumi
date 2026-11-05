'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { FormError } from '@/components/auth/auth-card'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { toast } from '@/components/ui/use-toast'
import { apiFetch } from '@/lib/client-api'
import type { RecallSource } from '@/lib/recall/service'

export interface ConsoleChoice {
  id: string
  name: string
  channelCount: number
}

// Starts a session's recall sheet: from its input list on one of your consoles,
// or by copying the recall of an earlier session.
export function CreateRecall({
  sessionId,
  consoles,
  sources
}: {
  readonly sessionId: string
  readonly consoles: ConsoleChoice[]
  readonly sources: RecallSource[]
}) {
  const router = useRouter()
  const [consoleId, setConsoleId] = useState(consoles[0]?.id ?? '')
  const [fromId, setFromId] = useState(sources[0]?.sessionId ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async (body: Record<string, string>) => {
    setBusy(true)
    setError(null)
    try {
      const { recall } = await apiFetch<{
        recall: { id: string; skipped: number }
      }>(`/api/sessions/${sessionId}/recall`, { method: 'POST', body })
      toast({
        title: 'Recall sheet created',
        description:
          recall.skipped > 0
            ? `${recall.skipped} input${recall.skipped === 1 ? ' is' : 's are'} numbered past the desk channels and left off.`
            : undefined
      })
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className='grid gap-6 md:grid-cols-2'>
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Fill from the input list</CardTitle>
        </CardHeader>
        <CardContent className='space-y-3'>
          {consoles.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              Add your console first.{' '}
              <Link href='/consoles' className='underline'>
                Consoles &amp; recall
              </Link>
            </p>
          ) : (
            <>
              <p className='text-sm text-muted-foreground'>
                Each input becomes a strip with its source, microphone, 48V and
                pad already filled in. Everything else stays blank for you to
                record.
              </p>
              <div className='space-y-1'>
                <Label htmlFor='recall-console'>Console</Label>
                <NativeSelect
                  id='recall-console'
                  value={consoleId}
                  onChange={(e) => setConsoleId(e.target.value)}
                >
                  {consoles.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.channelCount} channels)
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <Button
                disabled={busy || !consoleId}
                onClick={() => create({ consoleId })}
              >
                {busy ? 'Creating…' : 'Create recall sheet'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Copy an earlier session</CardTitle>
        </CardHeader>
        <CardContent className='space-y-3'>
          {sources.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              No other session has a recall sheet yet.
            </p>
          ) : (
            <>
              <p className='text-sm text-muted-foreground'>
                Copies the desk, the values on every strip and the outboard
                settings exactly as recorded. Desk photos are not copied.
              </p>
              <div className='space-y-1'>
                <Label htmlFor='recall-source'>Session</Label>
                <NativeSelect
                  id='recall-source'
                  value={fromId}
                  onChange={(e) => setFromId(e.target.value)}
                >
                  {sources.map((s) => (
                    <option key={s.sessionId} value={s.sessionId}>
                      {s.name} ({s.date})
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <Button
                variant='surface'
                disabled={busy || !fromId}
                onClick={() => create({ fromSessionId: fromId })}
              >
                {busy ? 'Copying…' : 'Copy this recall'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
      <div className='md:col-span-2'>
        <FormError message={error} />
      </div>
    </div>
  )
}
