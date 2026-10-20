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
import type { MicComparisonResult } from '@/lib/mics/ai'

// The AI "which to use when" card on the comparison page. Mic names come from
// the catalogue rows passed in, looked up by slug, never from the model.
export function MicComparisonAi({
  mics,
  initial,
  canGenerate,
  allowance
}: {
  readonly mics: ReadonlyArray<{ slug: string; name: string }>
  readonly initial: MicComparisonResult | null
  readonly canGenerate: boolean
  readonly allowance: { remaining: number; limit: number } | null
}) {
  const [result, setResult] = useState(initial)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const nameOf = (slug: string) =>
    mics.find((mic) => mic.slug === slug)?.name ?? slug

  const generate = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch<{ comparison: MicComparisonResult }>(
        '/api/mics/compare',
        { method: 'POST', body: { mics: mics.map((mic) => mic.slug) } }
      )
      setResult(data.comparison)
    } catch (caught) {
      setError(caught)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader className='flex-row flex-wrap items-center justify-between gap-2 space-y-0'>
        <CardTitle className='text-base'>Which to use when</CardTitle>
        <AiGeneratedBadge />
      </CardHeader>
      <CardContent className='space-y-5 text-sm'>
        {result ? (
          <>
            <p>{result.content.overview}</p>

            <div className='space-y-1'>
              <h3 className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
                Key differences
              </h3>
              <ul className='list-disc space-y-1 pl-4'>
                {result.content.keyDifferences.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className='space-y-2'>
              <h3 className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
                Pick by situation
              </h3>
              <ul className='divide-y rounded-lg border'>
                {result.content.whichToUseWhen.map((row) => (
                  <li
                    key={row.scenario}
                    className='grid gap-1 px-3 py-2 sm:grid-cols-[12rem_1fr]'
                  >
                    <span className='font-medium'>{row.scenario}</span>
                    <span>
                      <span className='font-medium'>{nameOf(row.pick)}</span>
                      {': '}
                      {row.reason}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className='grid gap-4 sm:grid-cols-2'>
              {result.content.perMic.map((entry) => (
                <div key={entry.slug} className='space-y-1'>
                  <h3 className='font-medium'>{nameOf(entry.slug)}</h3>
                  <ul className='list-disc space-y-1 pl-4'>
                    {entry.strengths.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  {entry.limitations.length > 0 && (
                    <ul className='list-disc space-y-1 pl-4 text-muted-foreground'>
                      {entry.limitations.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>

            <AiProvenance model={result.model} createdAt={result.createdAt} />
          </>
        ) : (
          <div className='space-y-3'>
            <p className='text-muted-foreground'>
              No AI comparison has been generated for these microphones&rsquo;
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
                  {loading ? 'Comparing…' : 'Generate AI comparison'}
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
