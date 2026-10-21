'use client'

import { Check, Repeat, ThumbsDown } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/use-toast'
import { apiFetch } from '@/lib/client-api'
import { FEEDBACK_REASON_LABELS } from '@/lib/recommendations/labels'
import { FEEDBACK_REASONS } from '@/lib/recommendations/schemas'
import type { FeedbackView } from '@/lib/recommendations/service'

type Verdict = 'accepted' | 'swapped' | 'rejected'

const VERDICT_LABELS: Record<Verdict, string> = {
  accepted: 'I used this',
  swapped: 'I used something else',
  rejected: 'Not useful'
}

// Your verdict on one source (or on the whole recommendation, with `*`). It is
// stored with the full request, so it can be used to improve the rules later.
export function FeedbackControls({
  resultId,
  sourceKey,
  micCount,
  lockerOptions,
  initial
}: {
  readonly resultId: string
  readonly sourceKey: string
  readonly micCount: number
  readonly lockerOptions: ReadonlyArray<{ id: string; label: string }>
  readonly initial?: FeedbackView
}) {
  const [saved, setSaved] = useState<FeedbackView | undefined>(initial)
  const [verdict, setVerdict] = useState<Verdict | null>(
    (initial?.verdict as Verdict | undefined) ?? null
  )
  const [units, setUnits] = useState<string[]>(
    initial?.swappedToUnitIds ?? Array(micCount).fill('')
  )
  const [rating, setRating] = useState(String(initial?.rating ?? ''))
  const [reasons, setReasons] = useState<string[]>(initial?.reasons ?? [])
  const [comment, setComment] = useState(initial?.comment ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSwap = sourceKey !== '*'
  const swapReady = verdict !== 'swapped' || units.every(Boolean)

  const save = async () => {
    if (!verdict) return
    setSaving(true)
    setError(null)
    try {
      const data = await apiFetch<{ feedback: FeedbackView }>(
        `/api/recommendations/${resultId}/feedback`,
        {
          method: 'PUT',
          body: {
            sourceKey,
            verdict,
            swappedToUnitIds: verdict === 'swapped' ? units : [],
            rating: rating ? Number(rating) : undefined,
            reasons,
            comment: comment.trim() || undefined
          }
        }
      )
      setSaved(data.feedback)
      toast({ title: 'Thanks, feedback saved' })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const choices: Verdict[] = canSwap
    ? ['accepted', 'swapped', 'rejected']
    : ['accepted', 'rejected']

  return (
    <div className='space-y-3 rounded-lg border bg-muted/20 p-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <span className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
          {sourceKey === '*' ? 'Overall' : 'How did it go?'}
        </span>
        {choices.map((choice) => (
          <Button
            key={choice}
            type='button'
            size='sm'
            variant={verdict === choice ? 'surface' : 'outline'}
            aria-pressed={verdict === choice}
            onClick={() => setVerdict(choice)}
          >
            {choice === 'accepted' ? (
              <Check />
            ) : choice === 'swapped' ? (
              <Repeat />
            ) : (
              <ThumbsDown />
            )}
            {VERDICT_LABELS[choice]}
          </Button>
        ))}
        {saved && <span className='text-xs text-muted-foreground'>Saved</span>}
      </div>

      {verdict && (
        <div className='space-y-3'>
          {verdict === 'swapped' && (
            <div className='space-y-2'>
              {units.map((unit, index) => (
                <div key={index} className='space-y-1'>
                  <Label htmlFor={`swap-${sourceKey}-${index}`}>
                    {micCount > 1
                      ? `Microphone ${index + 1}`
                      : 'Microphone used'}
                  </Label>
                  <NativeSelect
                    id={`swap-${sourceKey}-${index}`}
                    value={unit}
                    onChange={(event) =>
                      setUnits((current) =>
                        current.map((value, i) =>
                          i === index ? event.target.value : value
                        )
                      )
                    }
                  >
                    <option value=''>Choose from your locker…</option>
                    {lockerOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              ))}
            </div>
          )}

          <fieldset className='space-y-1'>
            <legend className='text-xs text-muted-foreground'>
              What was off? (optional)
            </legend>
            <div className='flex flex-wrap gap-x-4 gap-y-1'>
              {FEEDBACK_REASONS.map((reason) => (
                <label
                  key={reason}
                  className='flex items-center gap-1.5 text-sm'
                >
                  <input
                    type='checkbox'
                    checked={reasons.includes(reason)}
                    onChange={(event) =>
                      setReasons((current) =>
                        event.target.checked
                          ? [...current, reason]
                          : current.filter((r) => r !== reason)
                      )
                    }
                  />
                  {FEEDBACK_REASON_LABELS[reason]}
                </label>
              ))}
            </div>
          </fieldset>

          <div className='grid gap-3 sm:grid-cols-[10rem_1fr]'>
            <div className='space-y-1'>
              <Label htmlFor={`rating-${sourceKey}`}>Rating (optional)</Label>
              <NativeSelect
                id={`rating-${sourceKey}`}
                value={rating}
                onChange={(event) => setRating(event.target.value)}
              >
                <option value=''>No rating</option>
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} out of 5
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className='space-y-1'>
              <Label htmlFor={`comment-${sourceKey}`}>Comment (optional)</Label>
              <Textarea
                id={`comment-${sourceKey}`}
                rows={2}
                maxLength={1000}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />
            </div>
          </div>

          <Button
            type='button'
            size='sm'
            onClick={save}
            disabled={saving || !swapReady}
          >
            {saving ? 'Saving…' : 'Save feedback'}
          </Button>
          {error && (
            <p role='alert' className='text-sm text-destructive'>
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
