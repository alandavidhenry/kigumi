import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  EXCLUSION_LABELS,
  UNFILLABLE_LABELS,
  kindLabel,
  techniqueLabel
} from '@/lib/recommendations/labels'
import type { PreviewResult } from '@/lib/recommendations/service'
import type { RuleOption } from '@/lib/recommendations/types'

import { WarningList } from './warning-list'

// The rules-based recommendation (PLAN §4.4 steps 1 and 2): free, instant and
// computed from your own locker. It is a complete answer on its own; the AI step
// only re-ranks these candidates and explains the choice.
export function RulesResult({ preview }: { readonly preview: PreviewResult }) {
  const { rules, unitNames, request } = preview
  const nameOf = (unitId: string) => unitNames[unitId] ?? 'Unknown microphone'
  const describe = (option: RuleOption) =>
    option.unitIds
      .map((id, index) => {
        const pattern = option.patternSettings[index]
        return `${nameOf(id)}${pattern ? ` (${pattern})` : ''}`
      })
      .join(' + ')

  const excludedByUnit = new Map<string, string[]>()
  for (const entry of rules.excluded) {
    const reasons = excludedByUnit.get(entry.unitId) ?? []
    const text = entry.sourceId
      ? `${EXCLUSION_LABELS[entry.reason]} (${request.sources.find((s) => s.id === entry.sourceId)?.label ?? entry.sourceId})`
      : EXCLUSION_LABELS[entry.reason]
    excludedByUnit.set(entry.unitId, [...reasons, text])
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <Badge variant='secondary'>Rules-based</Badge>
        <span className='text-sm text-muted-foreground'>
          From the microphones in your locker and their catalogue records. No AI
          was used.
        </span>
      </div>

      <p className='text-sm'>
        {rules.channels.required}{' '}
        {rules.channels.required === 1 ? 'input' : 'inputs'} needed
        {rules.channels.available !== null &&
          `, ${rules.channels.available} available`}
        .
      </p>
      <WarningList warnings={rules.warnings} />

      {rules.sources.map((source) => {
        const plan = source.candidates.find((c) => c.id === source.planOptionId)
        const others = source.candidates.filter(
          (c) => c.id !== source.planOptionId
        )
        return (
          <Card key={source.id}>
            <CardHeader className='space-y-1'>
              <CardTitle className='text-base'>{source.label}</CardTitle>
              <p className='text-xs text-muted-foreground'>
                {kindLabel(source.kind)}
                {source.micCount > 1 &&
                  ` · ${techniqueLabel(source.technique)}`}
              </p>
            </CardHeader>
            <CardContent className='space-y-3 text-sm'>
              {source.line ? (
                <p className='text-muted-foreground'>
                  Goes straight to a line input. No microphone needed.
                </p>
              ) : plan ? (
                <div className='space-y-2'>
                  <p className='font-medium'>{describe(plan)}</p>
                  {plan.matchedGroup && (
                    <p className='text-xs text-muted-foreground'>
                      Matched group: {plan.matchedGroup}
                    </p>
                  )}
                  <WarningList warnings={plan.warnings} />
                </div>
              ) : (
                <p role='status' className='text-muted-foreground'>
                  {source.unfillable && UNFILLABLE_LABELS[source.unfillable]}
                </p>
              )}

              {others.length > 0 && (
                <details>
                  <summary className='cursor-pointer text-xs font-medium uppercase tracking-wide text-muted-foreground'>
                    {others.length} other{' '}
                    {others.length === 1 ? 'option' : 'options'}
                  </summary>
                  <ul className='mt-2 list-disc space-y-1 pl-4'>
                    {others.map((option) => (
                      <li key={option.id}>
                        {describe(option)}
                        {option.warnings.some((w) => w.severity !== 'info') && (
                          <span className='text-muted-foreground'>
                            {' '}
                            &mdash; has warnings
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </CardContent>
          </Card>
        )
      })}

      {excludedByUnit.size > 0 && (
        <details className='rounded-lg border px-4 py-3 text-sm'>
          <summary className='cursor-pointer font-medium'>
            Microphones left out ({excludedByUnit.size})
          </summary>
          <ul className='mt-3 space-y-1'>
            {[...excludedByUnit.entries()].map(([unitId, reasons]) => (
              <li key={unitId}>
                <span className='font-medium'>{nameOf(unitId)}</span>
                <span className='text-muted-foreground'>
                  {' '}
                  &mdash; {reasons.join('; ')}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
