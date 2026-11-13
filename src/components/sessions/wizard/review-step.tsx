'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { UpgradeNotice } from '@/components/upgrade-notice'
import { BUILT_IN_TEMPLATES } from '@/lib/layout/templates'
import { Feature, PLAN_LABELS, minimumTierFor } from '@/lib/plans'

import type {
  ConsoleChoice,
  LayoutTemplateChoice,
  Patch,
  RoomChoice,
  WizardState
} from './types'

function Row({
  label,
  children
}: {
  readonly label: string
  readonly children: React.ReactNode
}) {
  return (
    <div className='grid gap-1 py-2 sm:grid-cols-[10rem_1fr]'>
      <dt className='text-sm text-muted-foreground'>{label}</dt>
      <dd className='text-sm'>{children}</dd>
    </div>
  )
}

export function ReviewStep({
  state,
  patch,
  rooms,
  consoles,
  layoutTemplates,
  canTemplates
}: {
  readonly state: WizardState
  readonly patch: Patch
  readonly rooms: readonly RoomChoice[]
  readonly consoles: readonly ConsoleChoice[]
  readonly layoutTemplates: readonly LayoutTemplateChoice[]
  readonly canTemplates: boolean
}) {
  const room = rooms.find((r) => r.id === state.roomId)
  const desk = consoles.find((c) => c.id === state.consoleId)
  const layout = state.layout
  const layoutText =
    layout.kind === 'auto'
      ? 'Placed automatically'
      : layout.kind === 'blank'
        ? 'Blank room'
        : layout.kind === 'builtin'
          ? (BUILT_IN_TEMPLATES.find((t) => t.id === layout.templateId)?.name ??
            'Starter template')
          : (layoutTemplates.find((t) => t.id === layout.layoutId)?.name ??
            'Your template')
  const picks =
    state.pickMode === 'ai'
      ? 'AI-generated ranking'
      : state.pickMode === 'none'
        ? 'None, choose later'
        : 'Rules-based picks from your locker'

  return (
    <div className='space-y-5'>
      <dl className='divide-y rounded-lg border bg-card px-4'>
        <Row label='Session'>
          <strong>{state.name}</strong>
          {state.client && ` for ${state.client}`}
        </Row>
        <Row label='When'>
          {state.startsAt.replace('T', ' ')} to {state.endsAt.replace('T', ' ')}
        </Row>
        <Row label='Room'>
          {room ? `${room.studioName} · ${room.name}` : 'No room yet'}
        </Row>
        <Row label='Channels'>
          {state.channels ? `${state.channels} available` : 'Not specified'}
        </Row>
        <Row label='Sources'>
          {state.sources.length}: {state.sources.map((s) => s.label).join(', ')}
        </Row>
        <Row label='Mic picks'>{picks}</Row>
        <Row label='Layout'>{layoutText}</Row>
        <Row label='Recall sheet'>{desk ? desk.name : 'Skipped'}</Row>
      </dl>

      <section className='space-y-2'>
        {canTemplates ? (
          <>
            <label className='flex min-h-9 items-center gap-2 text-sm'>
              <input
                type='checkbox'
                checked={state.saveTemplate}
                onChange={(e) =>
                  patch({
                    saveTemplate: e.target.checked,
                    templateName: state.templateName || state.name
                  })
                }
              />
              Save as a session template
            </label>
            {state.saveTemplate && (
              <div className='max-w-md space-y-1.5'>
                <Label htmlFor='w-template-name'>Template name</Label>
                <Input
                  id='w-template-name'
                  className='h-9'
                  maxLength={80}
                  value={state.templateName}
                  onChange={(e) => patch({ templateName: e.target.value })}
                />
              </div>
            )}
          </>
        ) : (
          <UpgradeNotice
            title='Save this setup as a template'
            description='Reuse the sources, layout and console for future sessions.'
            planLabel={PLAN_LABELS[minimumTierFor(Feature.TEMPLATES)]}
          />
        )}
      </section>
    </div>
  )
}
