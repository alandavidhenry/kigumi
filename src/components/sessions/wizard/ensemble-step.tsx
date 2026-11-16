'use client'

import { Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { UpgradeNotice } from '@/components/upgrade-notice'
import { Feature, PLAN_LABELS, minimumTierFor } from '@/lib/plans'
import { KIND_OPTIONS, techniqueLabel } from '@/lib/recommendations/labels'
import { MAX_SOURCES } from '@/lib/recommendations/schemas'
import { techniqueAllowed } from '@/lib/recommendations/techniques'
import { TECHNIQUES, type Technique } from '@/lib/recommendations/types'
import {
  ENSEMBLE_PRESETS,
  type EnsembleCategory,
  type EnsemblePreset
} from '@/lib/sessions/ensembles'
import type { WizardSource } from '@/lib/sessions/wizard-schemas'
import { cn } from '@/lib/utils'

import { newSourceId, type SessionTemplateChoice } from './types'

const CATEGORY_LABELS: Record<EnsembleCategory, string> = {
  band: 'Bands',
  acoustic: 'Acoustic',
  jazz: 'Jazz',
  classical: 'Classical and choral',
  vocal: 'Vocals',
  spoken: 'Spoken word',
  drums: 'Drums'
}

function Choice({
  selected,
  onSelect,
  title,
  description
}: {
  readonly selected: boolean
  readonly onSelect: () => void
  readonly title: string
  readonly description: string
}) {
  return (
    <button
      type='button'
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'min-h-16 rounded-lg border p-3 text-left text-sm transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
        selected
          ? 'border-transparent bg-primary text-primary-foreground'
          : 'border-input bg-card hover:border-border-strong'
      )}
    >
      <span className='block font-medium'>{title}</span>
      <span
        className={cn(
          'block text-xs',
          selected ? 'text-primary-foreground/80' : 'text-muted-foreground'
        )}
      >
        {description}
      </span>
    </button>
  )
}

export function EnsembleStep({
  presetId,
  scratch,
  templateId,
  sources,
  sessionTemplates,
  canTemplates,
  onPreset,
  onTemplate,
  onScratch,
  onSources
}: {
  readonly presetId: string | null
  readonly scratch: boolean
  readonly templateId: string | null
  readonly sources: readonly WizardSource[]
  readonly sessionTemplates: readonly SessionTemplateChoice[]
  readonly canTemplates: boolean
  readonly onPreset: (preset: EnsemblePreset) => void
  readonly onTemplate: (id: string) => void
  readonly onScratch: () => void
  readonly onSources: (sources: WizardSource[]) => void
}) {
  const categories = Object.keys(CATEGORY_LABELS) as EnsembleCategory[]
  const update = (index: number, patch: Partial<WizardSource>) =>
    onSources(sources.map((s, i) => (i === index ? { ...s, ...patch } : s)))

  return (
    <div className='space-y-6'>
      {categories.map((category) => {
        const presets = ENSEMBLE_PRESETS.filter((p) => p.category === category)
        if (presets.length === 0) return null
        return (
          <section key={category} className='space-y-2'>
            <h3 className='text-sm font-medium'>{CATEGORY_LABELS[category]}</h3>
            <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-3'>
              {presets.map((preset) => (
                <Choice
                  key={preset.id}
                  selected={presetId === preset.id && !templateId}
                  onSelect={() => onPreset(preset)}
                  title={preset.name}
                  description={`${preset.description} ${preset.sources.reduce((n, s) => n + (s.count ?? 1), 0)} sources.`}
                />
              ))}
            </div>
          </section>
        )
      })}

      <section className='space-y-2'>
        <h3 className='text-sm font-medium'>Your templates</h3>
        {!canTemplates ? (
          <UpgradeNotice
            title='Reuse your own session setups with templates.'
            description='Save a session as a template at the end of this wizard and start from it next time.'
            planLabel={PLAN_LABELS[minimumTierFor(Feature.TEMPLATES)]}
          />
        ) : sessionTemplates.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            No templates yet. Tick &ldquo;Save as a session template&rdquo; on
            the last step to make one.
          </p>
        ) : (
          <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-3'>
            {sessionTemplates.map((t) => (
              <Choice
                key={t.id}
                selected={templateId === t.id}
                onSelect={() => onTemplate(t.id)}
                title={t.name}
                description={`${t.description ? `${t.description} ` : ''}${t.sources.length} sources.`}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <Choice
          selected={scratch}
          onSelect={onScratch}
          title='Start from scratch'
          description='Add your own sources one by one.'
        />
      </section>

      <section className='space-y-3' aria-labelledby='w-sources'>
        <h3 id='w-sources' className='text-sm font-medium'>
          Sources ({sources.length})
        </h3>
        <ul className='space-y-2'>
          {sources.map((source, index) => {
            const stereo = techniqueAllowed(source.kind, 'xy')
            return (
              <li
                key={source.id}
                className='grid gap-2 sm:grid-cols-[1fr_12rem_11rem_auto]'
              >
                <div>
                  <Label htmlFor={`src-${source.id}`} className='sr-only'>
                    Name of source {index + 1}
                  </Label>
                  <Input
                    id={`src-${source.id}`}
                    className='h-9'
                    maxLength={60}
                    value={source.label}
                    placeholder='e.g. Snare top'
                    onChange={(e) => update(index, { label: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor={`kind-${source.id}`} className='sr-only'>
                    Type of source {index + 1}
                  </Label>
                  <NativeSelect
                    id={`kind-${source.id}`}
                    className='h-9'
                    value={source.kind}
                    onChange={(e) => {
                      const kind = e.target.value as WizardSource['kind']
                      update(index, {
                        kind,
                        technique: techniqueAllowed(kind, source.technique)
                          ? source.technique
                          : 'mono'
                      })
                    }}
                  >
                    {KIND_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div>
                  <Label htmlFor={`tech-${source.id}`} className='sr-only'>
                    Technique for source {index + 1}
                  </Label>
                  {stereo ? (
                    <NativeSelect
                      id={`tech-${source.id}`}
                      className='h-9'
                      value={source.technique}
                      onChange={(e) =>
                        update(index, {
                          technique: e.target.value as Technique
                        })
                      }
                    >
                      {TECHNIQUES.filter((t) =>
                        techniqueAllowed(source.kind, t)
                      ).map((t) => (
                        <option key={t} value={t}>
                          {techniqueLabel(t)}
                        </option>
                      ))}
                    </NativeSelect>
                  ) : (
                    <p className='flex h-9 items-center text-sm text-muted-foreground'>
                      {techniqueLabel('mono')}
                    </p>
                  )}
                </div>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='h-9 w-9'
                  aria-label={`Remove source ${index + 1}`}
                  disabled={sources.length === 1}
                  onClick={() =>
                    onSources(sources.filter((_, i) => i !== index))
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
          variant='outline'
          size='lg'
          disabled={sources.length >= MAX_SOURCES}
          onClick={() =>
            onSources([
              ...sources,
              {
                id: newSourceId(),
                label: '',
                kind: 'general',
                technique: 'mono'
              }
            ])
          }
        >
          <Plus />
          Add a source
        </Button>
      </section>
    </div>
  )
}
