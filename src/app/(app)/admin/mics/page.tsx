import { AudioLines, ChevronRight, Plus } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { EmptyState } from '@/components/empty-state'
import { MicFilters } from '@/components/mics/mic-filters'
import { MicFormDialog } from '@/components/mics/mic-form-dialog'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { isAppError } from '@/lib/errors'
import { countMicsByStatus, listMicsForReview } from '@/lib/mics/admin'
import {
  MIC_STATUSES,
  MIC_STATUS_LABELS,
  MIC_TRANSDUCER_LABELS
} from '@/lib/mics/types'
import { getPlatformAdminContext } from '@/lib/platform-admin'

export const metadata = { title: 'Mic review queue' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value

const STATUS_VARIANT = {
  draft: 'secondary',
  in_review: 'warning',
  published: 'success'
} as const

export default async function MicReviewQueuePage({
  searchParams
}: {
  readonly searchParams: SearchParams
}) {
  const raw = await searchParams
  const filter: Record<string, string> = {}
  for (const key of ['q', 'transducerType', 'pattern', 'powering', 'status']) {
    const value = first(raw[key])
    if (value) filter[key] = value
  }

  let admin
  try {
    admin = await getPlatformAdminContext()
  } catch (error) {
    if (isAppError(error) && error.status === 404) notFound()
    throw error
  }
  const [mics, counts] = await Promise.all([
    listMicsForReview(admin, filter),
    countMicsByStatus(admin)
  ])

  return (
    <div className='space-y-6'>
      <PageHeader
        title='Mic review queue'
        description={MIC_STATUSES.map(
          (status) =>
            `${counts[status]} ${MIC_STATUS_LABELS[status].toLowerCase()}`
        ).join(' · ')}
        actions={
          <MicFormDialog
            trigger={
              <Button>
                <Plus />
                Add microphone
              </Button>
            }
          />
        }
      />
      <MicFilters withStatus />
      {mics.length === 0 ? (
        <Card>
          <EmptyState
            icon={AudioLines}
            title='Nothing in the queue'
            description='Run npm run mics:ingest to load the seed files as drafts, or add a microphone by hand.'
          />
        </Card>
      ) : (
        <Card className='divide-y overflow-hidden p-0'>
          {mics.map((mic) => (
            <Link
              key={mic.id}
              href={`/admin/mics/${mic.id}`}
              className='flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-accent'
            >
              <div className='min-w-0 flex-1'>
                <p className='truncate font-medium'>
                  {mic.manufacturer} {mic.model}
                </p>
                <p className='truncate text-xs text-muted-foreground'>
                  {MIC_TRANSDUCER_LABELS[mic.transducerType]}
                  {mic.unverifiedFields > 0 &&
                    ` · ${mic.unverifiedFields} unverified fields`}
                </p>
              </div>
              <Badge variant={STATUS_VARIANT[mic.status]}>
                {MIC_STATUS_LABELS[mic.status]}
              </Badge>
              <ChevronRight className='h-4 w-4 text-muted-foreground' />
            </Link>
          ))}
        </Card>
      )}
    </div>
  )
}
