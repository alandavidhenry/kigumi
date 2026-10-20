import { notFound } from 'next/navigation'

import { MicComparePicker } from '@/components/mics/mic-compare-picker'
import { MicCompareView } from '@/components/mics/mic-compare-view'
import { PageHeader } from '@/components/page-header'
import { getAiUsage } from '@/lib/ai/usage'
import { isAppError } from '@/lib/errors'
import { getMicComparison } from '@/lib/mics/ai'
import { listMics } from '@/lib/mics/catalogue'
import { MAX_COMPARE, MIN_COMPARE } from '@/lib/mics/compare'
import { parseMicRefs } from '@/lib/mics/compare'
import { getTenantContext } from '@/lib/tenant-context'
import { Permission, hasPermission } from '@/types/rbac'

export const metadata = { title: 'Compare microphones' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function CompareMicsPage({
  searchParams
}: {
  readonly searchParams: SearchParams
}) {
  const refs = parseMicRefs((await searchParams).mics).slice(0, MAX_COMPARE)
  const ctx = await getTenantContext()
  const all = await listMics(ctx)
  const options = all.map((mic) => ({
    slug: mic.slug,
    label: `${mic.manufacturer} ${mic.model}`
  }))

  let content: React.ReactNode = null
  if (refs.length >= MIN_COMPARE) {
    try {
      const { mics, comparison } = await getMicComparison(ctx, refs)
      const canGenerate = hasPermission(ctx.role, Permission.USE_AI)
      const usage = canGenerate && !comparison ? await getAiUsage(ctx) : null
      content = (
        <MicCompareView
          mics={mics}
          comparison={comparison}
          canGenerate={canGenerate}
          allowance={
            usage ? { remaining: usage.remaining, limit: usage.limit } : null
          }
        />
      )
    } catch (error) {
      if (isAppError(error) && error.status === 404) notFound()
      throw error
    }
  }

  return (
    <div className='space-y-6'>
      <PageHeader
        title='Compare microphones'
        backHref='/mics'
        backLabel='Mic catalogue'
        description={`Put ${MIN_COMPARE} to ${MAX_COMPARE} microphones side by side.`}
      />
      <MicComparePicker options={options} selected={refs} />
      {content}
    </div>
  )
}
