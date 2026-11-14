'use client'

import { Sparkles } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import {
  AiGeneratedBadge,
  AiRequestError,
  allowanceText
} from '@/components/ai/ai-generated'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { apiFetch } from '@/lib/client-api'
import { kindLabel } from '@/lib/recommendations/labels'
import type { PreviewResult } from '@/lib/recommendations/service'
import type { RuleOption } from '@/lib/recommendations/types'
import { MAX_AI_SOURCES } from '@/lib/recommendations/types'
import { toRequestSources } from '@/lib/sessions/wizard-schemas'

import type { Patch, PreviewCache, WizardState } from './types'

export function previewKey(state: WizardState): string {
  return JSON.stringify([
    state.sources.map((s) => [s.label, s.kind, s.technique]),
    state.roomId,
    state.startsAt.slice(0, 10),
    state.channels,
    state.phantomMode
  ])
}

function requestBody(state: WizardState) {
  return {
    sources: toRequestSources(state.sources),
    roomId: state.roomId || undefined,
    forDate: state.startsAt.slice(0, 10) || undefined,
    channels: state.channels ? Number(state.channels) : undefined,
    phantomMode: state.phantomMode
  }
}

export function MicsStep({
  state,
  patch,
  cache,
  onCache,
  canAi,
  allowance,
  lockerSize
}: {
  readonly state: WizardState
  readonly patch: Patch
  readonly cache: PreviewCache | null
  readonly onCache: (cache: PreviewCache) => void
  readonly canAi: boolean
  readonly allowance: { remaining: number; limit: number } | null
  readonly lockerSize: number
}) {
  const key = previewKey(state)
  const fresh = cache?.key === key
  const [loading, setLoading] = useState(false)
  const [ranking, setRanking] = useState(false)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    if (fresh) return
    let cancelled = false
    setLoading(true)
    setError(null)
    apiFetch<{ preview: PreviewResult }>('/api/recommendations/preview', {
      method: 'POST',
      body: requestBody(state)
    })
      .then((data) => {
        if (!cancelled) onCache({ key, preview: data.preview })
      })
      .catch((caught) => {
        if (!cancelled) setError(caught)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // The key captures every input of the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fresh])

  const rank = async () => {
    setRanking(true)
    setError(null)
    try {
      const data = await apiFetch<{ recommendation: { id: string } | null }>(
        '/api/recommendations',
        { method: 'POST', body: requestBody(state) }
      )
      if (data.recommendation) {
        patch({ pickMode: 'ai', aiResultId: data.recommendation.id })
      } else {
        setError(new Error('There was nothing for the AI to choose between.'))
      }
    } catch (caught) {
      setError(caught)
    } finally {
      setRanking(false)
    }
  }

  const preview = fresh ? cache.preview : null
  const nameOf = (unitId: string) =>
    preview?.unitNames[unitId] ?? 'Unknown microphone'
  const describe = (option: RuleOption) =>
    option.unitIds
      .map((id, i) => {
        const pattern = option.patternSettings[i]
        return `${nameOf(id)}${pattern ? ` (${pattern})` : ''}`
      })
      .join(' + ')

  const aiActive = state.pickMode === 'ai' && state.aiResultId
  const tooMany = state.sources.length > MAX_AI_SOURCES

  return (
    <div className='space-y-5'>
      <fieldset className='space-y-2'>
        <legend className='sr-only'>How to choose microphones</legend>
        <div className='flex flex-wrap gap-2'>
          <Button
            type='button'
            size='lg'
            variant={state.pickMode === 'rules' ? 'default' : 'surface'}
            aria-pressed={state.pickMode === 'rules'}
            onClick={() => patch({ pickMode: 'rules' })}
          >
            Use rules-based picks
          </Button>
          <Button
            type='button'
            size='lg'
            variant={state.pickMode === 'none' ? 'default' : 'surface'}
            aria-pressed={state.pickMode === 'none'}
            onClick={() => patch({ pickMode: 'none' })}
          >
            Skip mic picks
          </Button>
          {canAi && (
            <Button
              type='button'
              size='lg'
              variant='surface'
              disabled={ranking || loading || tooMany || lockerSize === 0}
              onClick={rank}
            >
              <Sparkles />
              {ranking ? 'Asking the AI…' : 'Rank with AI'}
            </Button>
          )}
        </div>
        {canAi && (
          <p className='text-xs text-muted-foreground'>
            {allowance ? allowanceText(allowance) : null} The AI only chooses
            from the mics you own.
            {tooMany &&
              ` It can rank up to ${MAX_AI_SOURCES} sources; you have ${state.sources.length}.`}
          </p>
        )}
      </fieldset>

      {error !== null && <AiRequestError error={error} />}

      {aiActive && (
        <div className='flex flex-wrap items-center gap-2 rounded-lg border border-brand-border bg-brand-tint/50 px-3 py-2 text-sm'>
          <AiGeneratedBadge />
          <span>
            The AI&apos;s ranking will be applied to the session.{' '}
            <Link
              href={`/recommendations/${state.aiResultId}`}
              target='_blank'
              className='underline'
            >
              Read its reasoning
            </Link>
            .
          </span>
          <Button
            type='button'
            size='sm'
            variant='ghost'
            onClick={() => patch({ pickMode: 'rules', aiResultId: null })}
          >
            Use rules-based picks instead
          </Button>
        </div>
      )}

      {state.pickMode === 'none' ? (
        <p className='text-sm text-muted-foreground'>
          No mics will be assigned. You can choose them later from the Inputs
          tab.
        </p>
      ) : loading || !preview ? (
        error === null && (
          <p role='status' className='text-sm text-muted-foreground'>
            Checking your locker…
          </p>
        )
      ) : (
        <ul className='space-y-3'>
          {preview.rules.sources.map((source, index) => {
            const wizardId = state.sources[index]?.id
            if (!wizardId) return null
            const selectedId =
              state.overrides[wizardId] ?? source.planOptionId ?? ''
            const selected = source.candidates.find((c) => c.id === selectedId)
            return (
              <li
                key={wizardId}
                className='space-y-1.5 rounded-lg bg-muted p-3'
              >
                <div className='flex flex-wrap items-baseline justify-between gap-2'>
                  <Label htmlFor={`pick-${wizardId}`} className='font-medium'>
                    {source.label}
                  </Label>
                  <span className='text-xs text-muted-foreground'>
                    {kindLabel(source.kind)}
                  </span>
                </div>
                {source.line ? (
                  <p className='text-sm text-muted-foreground'>
                    Goes straight to a line input. No microphone needed.
                  </p>
                ) : source.candidates.length === 0 ? (
                  <p className='text-sm text-warning-foreground'>
                    <span className='font-medium text-warning'>
                      No suitable mic in your locker.
                    </span>{' '}
                    <Link href='/locker' target='_blank' className='underline'>
                      Add mics to your locker
                    </Link>{' '}
                    and come back, or carry on and choose one later.
                  </p>
                ) : (
                  <>
                    <NativeSelect
                      id={`pick-${wizardId}`}
                      className='h-9'
                      disabled={Boolean(aiActive)}
                      value={selectedId}
                      onChange={(e) =>
                        patch({
                          overrides: {
                            ...state.overrides,
                            [wizardId]: e.target.value
                          }
                        })
                      }
                    >
                      {source.candidates.map((option) => (
                        <option key={option.id} value={option.id}>
                          {describe(option)}
                          {option.id === source.planOptionId
                            ? ' (suggested)'
                            : ''}
                        </option>
                      ))}
                    </NativeSelect>
                    {selected && selected.reasons.length > 0 && (
                      <p className='text-xs text-muted-foreground'>
                        {selected.reasons
                          .slice(0, 2)
                          .map((r) => r.text)
                          .join(' ')}
                      </p>
                    )}
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {preview && lockerSize === 0 && (
        <p className='text-sm text-muted-foreground'>
          Your mic locker is empty.{' '}
          <Link href='/locker' target='_blank' className='underline'>
            Quick-add mics
          </Link>{' '}
          to get picks.
        </p>
      )}
    </div>
  )
}
