import { AiGeneratedBadge } from '@/components/ai/ai-generated'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { FinalOption, FinalPick } from '@/lib/recommendations/finalise'
import { kindLabel, techniqueLabel } from '@/lib/recommendations/labels'
import type {
  FeedbackView,
  RecommendationDetail,
  UnitState
} from '@/lib/recommendations/service'

import { FeedbackControls } from './feedback-controls'
import { WarningList } from './warning-list'

const date = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short'
})

function unitLine(option: FinalOption) {
  return option.units
    .map(
      (unit) =>
        `${unit.name}${unit.patternSetting ? ` (${unit.patternSetting})` : ''}`
    )
    .join(' + ')
}

function StateBadges({
  option,
  unitState
}: {
  readonly option: FinalOption
  readonly unitState: Record<string, UnitState>
}) {
  const states = new Set(option.units.map((u) => unitState[u.unitId]))
  return (
    <>
      {states.has('removed') && (
        <Badge variant='destructive'>No longer in your locker</Badge>
      )}
      {states.has('unavailable') && (
        <Badge variant='warning'>Not currently available</Badge>
      )}
    </>
  )
}

function Placement({ pick }: { readonly pick: FinalPick }) {
  const p = pick.placement
  if (!p) return null
  const figures = [
    p.distanceMm !== null && `${p.distanceMm} mm away`,
    p.angleDeg !== null && `${p.angleDeg}° off axis`,
    p.spacingMm !== null && `${p.spacingMm} mm apart`,
    p.includedAngleDeg !== null && `${p.includedAngleDeg}° between them`
  ].filter(Boolean)
  return (
    <div className='space-y-0.5'>
      <h4 className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
        Placement
      </h4>
      <p>{p.position}</p>
      {figures.length > 0 && (
        <p className='text-muted-foreground'>{figures.join(' · ')}</p>
      )}
    </div>
  )
}

// A stored recommendation. Everything factual here (which units, their names,
// patterns, warnings, availability) comes from your records and the rules. Only
// the ranking and the explanatory text are AI-generated, and they are labelled.
export function RecommendationView({
  detail,
  lockerOptions,
  canFeedback
}: {
  readonly detail: RecommendationDetail
  readonly lockerOptions: ReadonlyArray<{ id: string; label: string }>
  readonly canFeedback: boolean
}) {
  const { view, request, unitState } = detail
  const feedbackFor = (key: string): FeedbackView | undefined =>
    detail.feedback.find((f) => f.sourceKey === key)

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <AiGeneratedBadge />
        <span className='text-xs text-muted-foreground'>
          {date.format(new Date(detail.createdAt))}
        </span>
      </div>

      {request.question && (
        <blockquote className='border-l-2 pl-3 text-sm italic'>
          {request.question}
        </blockquote>
      )}

      {!view.answerable ? (
        <p role='status' className='text-sm'>
          That doesn&rsquo;t look like a question about choosing or placing
          microphones, so there is no recommendation.
        </p>
      ) : (
        <>
          {view.summary && <p className='text-sm'>{view.summary}</p>}
          <WarningList warnings={view.warnings} />

          {view.sources.map((source) => {
            const pick = source.primary
            const feedback = feedbackFor(source.sourceId)
            return (
              <Card key={source.sourceId}>
                <CardHeader className='space-y-1'>
                  <CardTitle className='text-base'>{source.label}</CardTitle>
                  <p className='text-xs text-muted-foreground'>
                    {kindLabel(source.kind)}
                    {source.micCount > 1 &&
                      ` · ${techniqueLabel(source.technique)}`}
                  </p>
                </CardHeader>
                <CardContent className='space-y-4 text-sm'>
                  {source.line ? (
                    <p className='text-muted-foreground'>
                      Goes straight to a line input. No microphone needed.
                    </p>
                  ) : pick ? (
                    <div className='space-y-3'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <p className='text-base font-medium'>
                          {unitLine(pick)}
                        </p>
                        {pick.origin !== 'ai' && (
                          <Badge variant='secondary'>Adjusted by rules</Badge>
                        )}
                        <StateBadges option={pick} unitState={unitState} />
                      </div>
                      {source.adjusted && (
                        <p className='text-xs text-muted-foreground'>
                          The AI chose a microphone that another source in this
                          plan was already using, so this one was chosen
                          instead.
                        </p>
                      )}
                      <WarningList warnings={pick.warnings} />
                      <p>{pick.reasoning}</p>
                      <Placement pick={pick} />
                    </div>
                  ) : (
                    <p role='status' className='text-muted-foreground'>
                      No microphone could be chosen for this source.
                    </p>
                  )}

                  {source.alternatives.length > 0 && (
                    <div className='space-y-1'>
                      <h4 className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
                        Alternatives
                      </h4>
                      <ul className='space-y-1.5'>
                        {source.alternatives.map((alt) => (
                          <li key={alt.optionId}>
                            <span className='font-medium'>{unitLine(alt)}</span>
                            {alt.inUseBy && (
                              <span className='text-muted-foreground'>
                                {' '}
                                (already used for{' '}
                                {view.sources.find(
                                  (s) => s.sourceId === alt.inUseBy
                                )?.label ?? alt.inUseBy}
                                )
                              </span>
                            )}
                            {': '}
                            {alt.reason}
                            <StateBadges option={alt} unitState={unitState} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {canFeedback && !source.line && (
                    <FeedbackControls
                      resultId={detail.id}
                      sourceKey={source.sourceId}
                      micCount={source.micCount}
                      lockerOptions={lockerOptions}
                      initial={feedback}
                    />
                  )}
                </CardContent>
              </Card>
            )
          })}
        </>
      )}

      {canFeedback && (
        <FeedbackControls
          resultId={detail.id}
          sourceKey='*'
          micCount={0}
          lockerOptions={lockerOptions}
          initial={feedbackFor('*')}
        />
      )}

      <p className='text-xs text-muted-foreground'>
        Written by {detail.model}. The microphones, their settings, the warnings
        and their availability come from your locker and the catalogue; the
        ranking and explanations are AI-generated and can still be wrong. Check
        anything that matters against the manufacturer&rsquo;s guidance.
      </p>
    </div>
  )
}
