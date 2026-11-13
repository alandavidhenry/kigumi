'use client'

import { useMemo } from 'react'

import { SceneSvg } from '@/components/layout/scene-svg'
import { placeSources } from '@/lib/layout/auto-place'
import { buildLayoutScene } from '@/lib/layout/scene'
import {
  BUILT_IN_TEMPLATES,
  getBuiltInTemplate,
  placeTemplate,
  type PlacedItem
} from '@/lib/layout/templates'
import type { LayoutDoc } from '@/lib/layout/types'
import type { WizardLayout, WizardSource } from '@/lib/sessions/wizard-schemas'
import { cn } from '@/lib/utils'

import { DEFAULT_ROOM, type LayoutTemplateChoice } from './types'

function toDoc(
  items: readonly PlacedItem[],
  room: { widthMm: number; lengthMm: number }
): LayoutDoc {
  return {
    id: 'preview',
    name: 'Preview',
    widthMm: room.widthMm,
    lengthMm: room.lengthMm,
    heightMm: null,
    gridMm: 500,
    snapMm: 100,
    version: 1,
    items: items.map((item, index) => ({
      ...item,
      id: `p${index}`,
      variant: null,
      pitchDeg: 0,
      sortOrder: index,
      locked: false,
      groupId: null,
      micUnitId: null,
      equipmentItemId: null,
      patternSetting: null,
      recommendationRef: null,
      notes: null
    }))
  }
}

function Option({
  checked,
  onChange,
  name,
  title,
  description
}: {
  readonly checked: boolean
  readonly onChange: () => void
  readonly name: string
  readonly title: string
  readonly description: string
}) {
  return (
    <label
      className={cn(
        'flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border bg-card p-3 text-sm hover:border-border-strong has-focus-visible:ring-2 has-focus-visible:ring-ring',
        checked && 'border-brand bg-brand-tint/40'
      )}
    >
      <input
        type='radio'
        name='w-layout'
        value={name}
        checked={checked}
        onChange={onChange}
        className='mt-1'
      />
      <span>
        <span className='block font-medium'>{title}</span>
        <span className='block text-xs text-muted-foreground'>
          {description}
        </span>
      </span>
    </label>
  )
}

export function LayoutStep({
  layout,
  onLayout,
  sources,
  room,
  roomName,
  layoutTemplates,
  canTemplates
}: {
  readonly layout: WizardLayout
  readonly onLayout: (layout: WizardLayout) => void
  readonly sources: readonly WizardSource[]
  readonly room: { widthMm: number; lengthMm: number } | null
  readonly roomName: string | null
  readonly layoutTemplates: readonly LayoutTemplateChoice[]
  readonly canTemplates: boolean
}) {
  const dims = room ?? DEFAULT_ROOM
  const scene = useMemo(() => {
    let items: PlacedItem[] = []
    if (layout.kind === 'auto') {
      items = placeSources(sources, dims)
    } else if (layout.kind === 'builtin') {
      const template = getBuiltInTemplate(layout.templateId)
      items = template ? placeTemplate(template, dims) : []
    }
    return buildLayoutScene(toDoc(items, dims))
  }, [layout, sources, dims])
  const hasPreview = layout.kind !== 'template'

  return (
    <div className='grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'>
      <div className='space-y-2' role='radiogroup' aria-label='Room layout'>
        <Option
          name='auto'
          checked={layout.kind === 'auto'}
          onChange={() => onLayout({ kind: 'auto' })}
          title='Place the sources for me'
          description='Drums at the back, vocals at the front, amps at the sides. Mics are placed to match your picks.'
        />
        {BUILT_IN_TEMPLATES.map((t) => (
          <Option
            key={t.id}
            name={`builtin:${t.id}`}
            checked={layout.kind === 'builtin' && layout.templateId === t.id}
            onChange={() => onLayout({ kind: 'builtin', templateId: t.id })}
            title={t.name}
            description={t.description}
          />
        ))}
        {canTemplates &&
          layoutTemplates.map((t) => (
            <Option
              key={t.id}
              name={`template:${t.id}`}
              checked={layout.kind === 'template' && layout.layoutId === t.id}
              onChange={() => onLayout({ kind: 'template', layoutId: t.id })}
              title={t.name}
              description={`Your template, ${(t.widthMm / 1000).toFixed(1)} × ${(t.lengthMm / 1000).toFixed(1)} m.`}
            />
          ))}
        <Option
          name='blank'
          checked={layout.kind === 'blank'}
          onChange={() => onLayout({ kind: 'blank' })}
          title='Blank room'
          description='Draw it yourself in the layout editor.'
        />
      </div>
      <div className='space-y-2'>
        {hasPreview ? (
          <SceneSvg
            scene={scene}
            label='Preview of the room layout'
            className='lg:sticky lg:top-4'
          />
        ) : (
          <p className='text-sm text-muted-foreground'>
            Your template is shown in the layout editor once the session is
            created.
          </p>
        )}
        <p className='text-xs text-muted-foreground'>
          {roomName
            ? `Previewed in ${roomName}.`
            : 'No room chosen, so this previews a 6 × 5 m room.'}
        </p>
      </div>
    </div>
  )
}
