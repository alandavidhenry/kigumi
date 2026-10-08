import { notFound } from 'next/navigation'

import { MicAdminPanel } from '@/components/mics/mic-admin-panel'
import { MicDetailView } from '@/components/mics/mic-detail-view'
import { isAppError } from '@/lib/errors'
import { getMicForAdmin } from '@/lib/mics/admin'
import { getPlatformAdminContext } from '@/lib/platform-admin'

import type { Metadata } from 'next'

interface PageProps {
  params: Promise<{ micId: string }>
}

async function load(micId: string) {
  try {
    const admin = await getPlatformAdminContext()
    return await getMicForAdmin(admin, micId)
  } catch (error) {
    if (isAppError(error) && error.status === 404) notFound()
    throw error
  }
}

export async function generateMetadata({
  params
}: PageProps): Promise<Metadata> {
  const { micId } = await params
  const mic = await load(micId)
  return { title: `Review ${mic.manufacturer} ${mic.model}` }
}

export default async function MicReviewPage({ params }: PageProps) {
  const { micId } = await params
  const { publish, ...mic } = await load(micId)

  return (
    <div className='space-y-6'>
      <MicAdminPanel mic={mic} publish={publish} />
      <MicDetailView
        mic={mic}
        units={[]}
        canManageLocker={false}
        unlinked={[]}
        rooms={[]}
        backHref='/admin/mics'
        backLabel='Review queue'
      />
    </div>
  )
}
