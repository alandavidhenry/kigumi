import { AlertTriangle, ExternalLink, Plus } from 'lucide-react'
import Link from 'next/link'

import { BreadcrumbLabel } from '@/components/mics/breadcrumb-label'
import { FrequencyResponseChart } from '@/components/mics/frequency-response-chart'
import { LockerAddDialog } from '@/components/mics/locker-add-dialog'
import { PolarSection } from '@/components/mics/polar-section'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { RoomOption } from '@/lib/equipment'
import type { MicDetail } from '@/lib/mics/catalogue'
import { phantomWarning, specRows } from '@/lib/mics/format'
import type { LockerUnit, UnlinkedMicrophone } from '@/lib/mics/locker'
import {
  MIC_CONDITION_LABELS,
  MIC_EXTRACTION_LABELS,
  MIC_PATTERN_LABELS,
  MIC_TRANSDUCER_LABELS
} from '@/lib/mics/types'

function sourceLabel(mic: MicDetail, field: string) {
  const source = mic.provenance.find((p) => p.fields.includes(field as never))
  if (!source) return null
  return source
}

function curveLabel(pattern: string, filter: string | null) {
  const label = MIC_PATTERN_LABELS[pattern as keyof typeof MIC_PATTERN_LABELS]
  return filter ? `${label} + ${filter}` : label
}

// The catalogue page for one microphone. Server component: the charts and the
// locker dialog are client islands.
export function MicDetailView({
  mic,
  units,
  canManageLocker,
  unlinked,
  rooms,
  backHref = '/mics',
  backLabel = 'Mic catalogue'
}: {
  readonly mic: MicDetail
  readonly units: LockerUnit[]
  readonly canManageLocker: boolean
  readonly unlinked: UnlinkedMicrophone[]
  readonly rooms: RoomOption[]
  readonly backHref?: string
  readonly backLabel?: string
}) {
  const title = `${mic.manufacturer} ${mic.model}`
  const warning = phantomWarning(mic)
  const rows = specRows(mic)
  const unverified = mic.provenance.some((p) => !p.verified)

  const frCurves = mic.frequencyResponses.map((curve) => ({
    key: curve.id,
    label: curveLabel(curve.pattern, curve.filterSetting),
    points: curve.points,
    method: curve.method
  }))

  return (
    <div className='space-y-6'>
      <BreadcrumbLabel
        href={`${backHref}/${backHref === '/mics' ? mic.slug : mic.id}`}
        label={title}
      />
      <PageHeader
        title={title}
        backHref={backHref}
        backLabel={backLabel}
        description={`${MIC_TRANSDUCER_LABELS[mic.transducerType]} · ${mic.polarPatterns
          .map((p) => MIC_PATTERN_LABELS[p])
          .join(', ')}`}
        actions={
          <div className='flex flex-wrap items-center gap-2'>
            {mic.discontinued && (
              <Badge variant='secondary'>Discontinued</Badge>
            )}
            {mic.specSheetUrl && (
              <Button asChild variant='surface'>
                <a
                  href={mic.specSheetUrl}
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  <ExternalLink />
                  Official spec sheet
                </a>
              </Button>
            )}
          </div>
        }
      />

      {warning && (
        <div
          role='alert'
          className='flex gap-2 rounded-lg border border-warning/30 bg-warning/15 p-3 text-sm'
        >
          <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0 text-warning' />
          <p>{warning}</p>
        </div>
      )}

      {unverified && (
        <div className='rounded-lg border border-warning/30 bg-warning/15 p-3 text-sm'>
          Some of these values have not yet been checked against a manufacturer
          source. Check the manufacturer&rsquo;s spec sheet before relying on
          them.
        </div>
      )}

      <div className='grid gap-6 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Specifications</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className='divide-y text-sm'>
              {rows.map((row) => {
                const source = sourceLabel(mic, row.field)
                return (
                  <div
                    key={row.field}
                    className='grid grid-cols-[9rem_1fr] gap-x-3 py-2'
                  >
                    <dt className='text-muted-foreground'>{row.label}</dt>
                    <dd>
                      <span
                        className={
                          row.recorded ? undefined : 'text-muted-foreground'
                        }
                      >
                        {row.value}
                      </span>
                      {row.conditions && (
                        <span className='text-muted-foreground'>
                          {' '}
                          ({row.conditions})
                        </span>
                      )}
                      {row.recorded && (
                        <span className='block text-xs text-muted-foreground'>
                          {source
                            ? `${MIC_EXTRACTION_LABELS[source.extraction]}${source.verified ? '' : ', not yet verified'}`
                            : 'No source recorded'}
                        </span>
                      )}
                    </dd>
                  </div>
                )
              })}
            </dl>
          </CardContent>
        </Card>

        <div className='space-y-6'>
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Frequency response</CardTitle>
            </CardHeader>
            <CardContent>
              {frCurves.length > 0 ? (
                <FrequencyResponseChart curves={frCurves} />
              ) : (
                <p className='text-sm text-muted-foreground'>
                  No frequency-response data yet. Kigumi only plots curves from
                  measured or published manufacturer data, never estimates.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Polar pattern</CardTitle>
            </CardHeader>
            <CardContent>
              <PolarSection
                patterns={mic.polarPatterns}
                polarData={mic.polarData}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className='flex-row items-center justify-between space-y-0'>
          <CardTitle className='text-base'>In your locker</CardTitle>
          {canManageLocker && (
            <LockerAddDialog
              micModelId={mic.id}
              unlinked={unlinked}
              rooms={rooms}
              trigger={
                <Button variant='surface' size='sm'>
                  <Plus />
                  Add to locker
                </Button>
              }
            />
          )}
        </CardHeader>
        <CardContent>
          {units.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              You don&rsquo;t own this microphone yet.
            </p>
          ) : (
            <ul className='divide-y text-sm'>
              {units.map((unit) => (
                <li
                  key={unit.id}
                  className='flex flex-wrap items-center gap-2 py-2'
                >
                  <Link
                    href={`/inventory/${unit.equipmentItemId}`}
                    className='font-medium hover:underline'
                  >
                    {unit.serial ? `S/N ${unit.serial}` : 'No serial recorded'}
                  </Link>
                  <Badge variant='secondary'>
                    {MIC_CONDITION_LABELS[unit.condition]}
                  </Badge>
                  {unit.matchedPairGroup && (
                    <Badge variant='info'>Pair: {unit.matchedPairGroup}</Badge>
                  )}
                  <Badge variant={unit.available ? 'success' : 'warning'}>
                    {unit.available ? 'Available' : 'Unavailable'}
                  </Badge>
                  {unit.roomName && (
                    <span className='text-muted-foreground'>
                      {unit.roomName}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Sources</CardTitle>
        </CardHeader>
        <CardContent className='space-y-3 text-sm'>
          {mic.provenance.length === 0 ? (
            <p className='text-muted-foreground'>No sources recorded.</p>
          ) : (
            mic.provenance.map((source) => (
              <div key={source.id} className='space-y-0.5'>
                <p className='font-medium'>
                  {source.documentTitle ?? 'Untitled source'}
                  {source.documentPage && `, page ${source.documentPage}`}
                </p>
                <p className='text-muted-foreground'>
                  {MIC_EXTRACTION_LABELS[source.extraction]} · confidence{' '}
                  {source.confidence}
                  {source.retrievedAt && ` · retrieved ${source.retrievedAt}`}
                  {!source.verified && ' · not yet verified'}
                </p>
                {source.sourceUrl && (
                  <a
                    href={source.sourceUrl}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='break-all text-brand hover:underline'
                  >
                    {source.sourceUrl}
                  </a>
                )}
                {source.attribution && (
                  <p className='text-muted-foreground'>{source.attribution}</p>
                )}
                {source.licenceNotes && (
                  <p className='text-muted-foreground'>{source.licenceNotes}</p>
                )}
              </div>
            ))
          )}
          <p className='text-xs text-muted-foreground'>
            Kigumi records individual factual values and links to the
            manufacturer&rsquo;s own documents. It does not copy manufacturer
            images, graphs or PDFs.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
