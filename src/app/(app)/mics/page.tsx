import { AudioLines, ChevronRight } from 'lucide-react'
import Link from 'next/link'

import { EmptyState } from '@/components/empty-state'
import { MicFilters } from '@/components/mics/mic-filters'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { listMics } from '@/lib/mics/catalogue'
import {
  MIC_PATTERN_LABELS,
  MIC_POWERING_LABELS,
  MIC_TRANSDUCER_LABELS
} from '@/lib/mics/types'
import { getTenantContext } from '@/lib/tenant-context'

export const metadata = { title: 'Mic catalogue' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value

export default async function MicCataloguePage({
  searchParams
}: {
  readonly searchParams: SearchParams
}) {
  const raw = await searchParams
  const filter: Record<string, string> = {}
  for (const key of ['q', 'transducerType', 'pattern', 'powering']) {
    const value = first(raw[key])
    if (value) filter[key] = value
  }
  const filtered = Object.keys(filter).length > 0

  const ctx = await getTenantContext()
  const mics = await listMics(ctx, filter)

  return (
    <div className='space-y-6'>
      <PageHeader
        title='Mic catalogue'
        description='Reviewed specifications for common studio microphones, with the source of every value.'
      />
      <MicFilters />
      {mics.length === 0 ? (
        <Card>
          <EmptyState
            icon={AudioLines}
            title={
              filtered
                ? 'Nothing matches those filters'
                : 'No microphones published yet'
            }
            description={
              filtered
                ? 'Try clearing the search or filters.'
                : 'Microphones appear here once they have passed review.'
            }
          />
        </Card>
      ) : (
        <Card className='divide-y overflow-hidden p-0'>
          {mics.map((mic) => (
            <Link
              key={mic.id}
              href={`/mics/${mic.slug}`}
              className='flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-accent'
            >
              <div className='min-w-0 flex-1'>
                <p className='truncate font-medium'>
                  {mic.manufacturer} {mic.model}
                </p>
                <p className='truncate text-xs text-muted-foreground'>
                  {MIC_TRANSDUCER_LABELS[mic.transducerType]} ·{' '}
                  {mic.polarPatterns
                    .map((p) => MIC_PATTERN_LABELS[p])
                    .join(', ')}{' '}
                  · {MIC_POWERING_LABELS[mic.powering]}
                </p>
              </div>
              {mic.transducerType === 'ribbon' && mic.phantomSafe !== true && (
                <Badge variant='warning'>Phantom risk</Badge>
              )}
              {mic.discontinued && (
                <Badge variant='secondary'>Discontinued</Badge>
              )}
              <ChevronRight className='h-4 w-4 text-muted-foreground' />
            </Link>
          ))}
        </Card>
      )}
    </div>
  )
}
