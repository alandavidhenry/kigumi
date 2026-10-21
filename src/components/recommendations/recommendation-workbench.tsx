'use client'

import { Plus, Sparkles, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { AiRequestError, allowanceText } from '@/components/ai/ai-generated'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { apiFetch } from '@/lib/client-api'
import {
  KIND_OPTIONS,
  PRESETS,
  kindLabel,
  techniqueLabel
} from '@/lib/recommendations/labels'
import type { PreviewResult } from '@/lib/recommendations/service'
import { techniqueAllowed } from '@/lib/recommendations/techniques'
import {
  MAX_AI_SOURCES,
  TECHNIQUES,
  type PhantomMode,
  type SourceKind,
  type Technique
} from '@/lib/recommendations/types'

import { RulesResult } from './rules-result'

interface Row {
  label: string
  // '' means "work it out from the label".
  kind: SourceKind | ''
  technique: Technique
}

const blank = (): Row => ({ label: '', kind: '', technique: 'mono' })

export function RecommendationWorkbench({
  rooms,
  canGenerate,
  allowance,
  lockerSize
}: {
  readonly rooms: ReadonlyArray<{
    id: string
    name: string
    studioName: string
  }>
  readonly canGenerate: boolean
  readonly allowance: { remaining: number; limit: number } | null
  readonly lockerSize: number
}) {
  const router = useRouter()
  const [mode, setMode] = useState<'sources' | 'question'>('sources')
  const [rows, setRows] = useState<Row[]>([blank()])
  const [question, setQuestion] = useState('')
  const [intent, setIntent] = useState('')
  const [roomId, setRoomId] = useState('')
  const [forDate, setForDate] = useState('')
  const [channels, setChannels] = useState('')
  const [phantomMode, setPhantomMode] = useState<PhantomMode>('per_channel')

  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [ranking, setRanking] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const filled = rows.filter((row) => row.label.trim() !== '')
  const ready = mode === 'question' ? question.trim() !== '' : filled.length > 0

  const body = () => ({
    ...(mode === 'question'
      ? { question }
      : {
          sources: filled.map((row) => ({
            label: row.label,
            kind: row.kind || undefined,
            technique: row.technique
          }))
        }),
    intent: intent.trim() || undefined,
    roomId: roomId || undefined,
    forDate: forDate || undefined,
    channels: channels ? Number(channels) : undefined,
    phantomMode
  })

  // The kind a row will be treated as: the one picked, else what the last check
  // worked out from its label.
  const kindOf = (row: Row): SourceKind | null => {
    if (row.kind) return row.kind
    const position = filled.indexOf(row)
    return position >= 0
      ? (preview?.request.sources[position]?.kind ?? null)
      : null
  }

  const update = (index: number, patch: Partial<Row>) =>
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row))
    )

  const check = async () => {
    setChecking(true)
    setError(null)
    setNotice(null)
    try {
      const data = await apiFetch<{ preview: PreviewResult }>(
        '/api/recommendations/preview',
        { method: 'POST', body: body() }
      )
      setPreview(data.preview)
    } catch (caught) {
      setError(caught)
    } finally {
      setChecking(false)
    }
  }

  const rank = async () => {
    setRanking(true)
    setError(null)
    setNotice(null)
    try {
      const data = await apiFetch<{
        recommendation: { id: string } | null
        preview: PreviewResult
      }>('/api/recommendations', { method: 'POST', body: body() })
      setPreview(data.preview)
      if (data.recommendation) {
        router.push(`/recommendations/${data.recommendation.id}`)
      } else {
        setNotice(
          'There was nothing for the AI to choose between, so no request was used. The rules-based result below says why.'
        )
      }
    } catch (caught) {
      setError(caught)
    } finally {
      setRanking(false)
    }
  }

  const tooMany = mode === 'sources' && filled.length > MAX_AI_SOURCES

  return (
    <div className='space-y-6'>
      <Card>
        <CardHeader className='space-y-3'>
          <CardTitle className='text-base'>What are you recording?</CardTitle>
          <div className='flex gap-1' role='tablist' aria-label='Request type'>
            {(
              [
                ['sources', 'A list of sources'],
                ['question', 'Ask a question']
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                type='button'
                role='tab'
                aria-selected={mode === value}
                size='sm'
                variant={mode === value ? 'surface' : 'ghost'}
                onClick={() => {
                  setMode(value)
                  setPreview(null)
                }}
              >
                {label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className='space-y-5'>
          {mode === 'sources' ? (
            <div className='space-y-3'>
              <div className='flex flex-wrap items-center gap-2'>
                <span className='text-xs text-muted-foreground'>
                  Start from:
                </span>
                {PRESETS.map((preset) => (
                  <Button
                    key={preset.name}
                    type='button'
                    size='sm'
                    variant='outline'
                    onClick={() => {
                      setRows(
                        preset.sources.map((source) => ({
                          label: source.label,
                          kind: source.kind ?? '',
                          technique: source.technique ?? 'mono'
                        }))
                      )
                      setPreview(null)
                    }}
                  >
                    {preset.name}
                  </Button>
                ))}
              </div>

              <ul className='space-y-2'>
                {rows.map((row, index) => {
                  const kind = kindOf(row)
                  const stereo = kind !== null && techniqueAllowed(kind, 'xy')
                  return (
                    <li
                      key={index}
                      className='grid gap-2 sm:grid-cols-[1fr_12rem_11rem_auto]'
                    >
                      <div>
                        <Label htmlFor={`source-${index}`} className='sr-only'>
                          Source {index + 1}
                        </Label>
                        <Input
                          id={`source-${index}`}
                          value={row.label}
                          placeholder='e.g. Snare top, Lead vocal, Bass DI'
                          maxLength={80}
                          onChange={(event) =>
                            update(index, { label: event.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor={`kind-${index}`} className='sr-only'>
                          Type of source {index + 1}
                        </Label>
                        <NativeSelect
                          id={`kind-${index}`}
                          value={row.kind}
                          onChange={(event) =>
                            update(index, {
                              kind: event.target.value as SourceKind | '',
                              technique: 'mono'
                            })
                          }
                        >
                          <option value=''>
                            {kind && !row.kind
                              ? `Auto: ${kindLabel(kind)}`
                              : 'Work it out'}
                          </option>
                          {KIND_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </NativeSelect>
                      </div>
                      <div>
                        <Label htmlFor={`tech-${index}`} className='sr-only'>
                          Technique for source {index + 1}
                        </Label>
                        {stereo ? (
                          <NativeSelect
                            id={`tech-${index}`}
                            value={row.technique}
                            onChange={(event) =>
                              update(index, {
                                technique: event.target.value as Technique
                              })
                            }
                          >
                            {TECHNIQUES.map((technique) => (
                              <option key={technique} value={technique}>
                                {techniqueLabel(technique)}
                              </option>
                            ))}
                          </NativeSelect>
                        ) : (
                          <p className='flex h-8 items-center text-sm text-muted-foreground'>
                            {techniqueLabel('mono')}
                          </p>
                        )}
                      </div>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        aria-label={`Remove source ${index + 1}`}
                        disabled={rows.length === 1}
                        onClick={() =>
                          setRows((current) =>
                            current.filter((_, i) => i !== index)
                          )
                        }
                      >
                        <Trash2 />
                      </Button>
                    </li>
                  )
                })}
              </ul>
              <Button
                type='button'
                size='sm'
                variant='outline'
                disabled={rows.length >= 48}
                onClick={() => setRows((current) => [...current, blank()])}
              >
                <Plus />
                Add a source
              </Button>
            </div>
          ) : (
            <div className='space-y-2'>
              <Label htmlFor='question'>Your question</Label>
              <Textarea
                id='question'
                value={question}
                maxLength={500}
                rows={3}
                placeholder='Which of my mics would suit a breathy female vocal?'
                onChange={(event) => setQuestion(event.target.value)}
              />
              <p className='text-xs text-muted-foreground'>
                The answer only ever chooses from microphones you own.
              </p>
            </div>
          )}

          <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
            <div className='space-y-1.5'>
              <Label htmlFor='room'>Room</Label>
              <NativeSelect
                id='room'
                value={roomId}
                onChange={(event) => setRoomId(event.target.value)}
              >
                <option value=''>Not specified</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.studioName} · {room.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='for-date'>Session date</Label>
              <Input
                id='for-date'
                type='date'
                value={forDate}
                onChange={(event) => setForDate(event.target.value)}
              />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='channels'>Inputs available</Label>
              <Input
                id='channels'
                inputMode='numeric'
                value={channels}
                placeholder='e.g. 16'
                onChange={(event) =>
                  setChannels(event.target.value.replace(/\D/g, ''))
                }
              />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='phantom'>Phantom power</Label>
              <NativeSelect
                id='phantom'
                value={phantomMode}
                onChange={(event) =>
                  setPhantomMode(event.target.value as PhantomMode)
                }
              >
                <option value='per_channel'>Switchable per channel</option>
                <option value='global'>On or off for everything</option>
              </NativeSelect>
            </div>
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='intent'>Anything else we should know?</Label>
            <Textarea
              id='intent'
              value={intent}
              maxLength={500}
              rows={2}
              placeholder='e.g. Warm, intimate folk record in a small room'
              onChange={(event) => setIntent(event.target.value)}
            />
          </div>

          <div className='flex flex-wrap items-center gap-3'>
            <Button
              type='button'
              onClick={check}
              disabled={!ready || checking || ranking}
            >
              {checking ? 'Checking…' : 'Check my locker'}
            </Button>
            {canGenerate && (
              <Button
                type='button'
                variant='surface'
                onClick={rank}
                disabled={!ready || checking || ranking || tooMany}
              >
                <Sparkles />
                {ranking ? 'Asking the AI…' : 'Rank and explain with AI'}
              </Button>
            )}
          </div>
          {canGenerate && allowance && (
            <p className='text-xs text-muted-foreground'>
              Checking is free. {allowanceText(allowance)} The AI only chooses
              from the microphones you own, and its answer is saved.
            </p>
          )}
          {!canGenerate && (
            <p className='text-xs text-muted-foreground'>
              An engineer, manager or owner can ask the AI to rank and explain.
            </p>
          )}
          {tooMany && (
            <p role='alert' className='text-sm text-destructive'>
              The AI can rank up to {MAX_AI_SOURCES} sources at a time. Remove
              some, or use the rules-based check.
            </p>
          )}
          {lockerSize === 0 && (
            <p role='status' className='text-sm text-muted-foreground'>
              Your mic locker is empty, so nothing can be recommended yet. Add
              the microphones you own to the locker first.
            </p>
          )}
          {error !== null && <AiRequestError error={error} />}
          {notice && (
            <p role='status' className='text-sm text-muted-foreground'>
              {notice}
            </p>
          )}
        </CardContent>
      </Card>

      {preview && <RulesResult preview={preview} />}
    </div>
  )
}
