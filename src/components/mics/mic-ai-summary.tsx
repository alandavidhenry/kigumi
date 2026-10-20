'use client'

import { Sparkles } from 'lucide-react'
import { useState } from 'react'

import {
  AiGeneratedBadge,
  AiProvenance,
  AiRequestError,
  allowanceText
} from '@/components/ai/ai-generated'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { apiFetch } from '@/lib/client-api'
import type { MicSummaryResult } from '@/lib/mics/ai'

// The AI summary card on a mic's page. Shows the cached summary for the mic's
// current specs; people who may spend AI allowance can generate one.
export function MicAiSummary({
  slug,
  initial,
  canGenerate,
  allowance
}: {
  readonly slug: string
  readonly initial: MicSummaryResult | null
  readonly canGenerate: boolean
  readonly allowance: { remaining: number; limit: number } | null
}) {
  const [summary, setSummary] = useState(initial)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const generate = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch<{ summary: MicSummaryResult }>(
        `/api/mics/${slug}/summary`,
        { method: 'POST' }
      )
      setSummary(data.summary)
    } catch (caught) {
      setError(caught)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader className='flex-row flex-wrap items-center justify-between gap-2 space-y-0'>
        <CardTitle className='text-base'>Summary</CardTitle>
        <AiGeneratedBadge />
      </CardHeader>
      <CardContent className='space-y-4 text-sm'>
        {summary ? (
          <>
            <div className='space-y-2'>
              <p className='font-medium'>{summary.content.headline}</p>
              <p>{summary.content.overview}</p>
            </div>
            <div className='grid gap-4 sm:grid-cols-3'>
              <Section title='Strengths' items={summary.content.strengths} />
              <Section
                title='Limitations'
                items={summary.content.limitations}
              />
              <Section title='Best for' items={summary.content.bestFor} />
            </div>
            <AiProvenance model={summary.model} createdAt={summary.createdAt} />
          </>
        ) : (
          <div className='space-y-3'>
            <p className='text-muted-foreground'>
              No AI summary has been generated for this microphone&rsquo;s
              current specifications yet.
            </p>
            {canGenerate ? (
              <div className='space-y-2'>
                <Button
                  type='button'
                  variant='surface'
                  size='sm'
                  onClick={generate}
                  disabled={loading}
                >
                  <Sparkles />
                  {loading ? 'Writing summary…' : 'Generate AI summary'}
                </Button>
                {allowance && (
                  <p className='text-xs text-muted-foreground'>
                    {allowanceText(allowance)} Once written, it is shared with
                    everyone until the specifications change.
                  </p>
                )}
              </div>
            ) : (
              <p className='text-xs text-muted-foreground'>
                An engineer, manager or owner can generate one.
              </p>
            )}
          </div>
        )}
        {error !== null && <AiRequestError error={error} />}
      </CardContent>
    </Card>
  )
}

function Section({
  title,
  items
}: {
  readonly title: string
  readonly items: readonly string[]
}) {
  return (
    <div className='space-y-1'>
      <h3 className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
        {title}
      </h3>
      {items.length === 0 ? (
        <p className='text-muted-foreground'>None noted.</p>
      ) : (
        <ul className='list-disc space-y-1 pl-4'>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
