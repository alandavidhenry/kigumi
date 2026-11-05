import { notFound } from 'next/navigation'

import { SceneSvg } from '@/components/layout/scene-svg'
import { WarningsPanel } from '@/components/sessions/warnings-panel'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { isAppError } from '@/lib/errors'
import { getSharedSession } from '@/lib/sessions/share'

import type { Metadata } from 'next'

// Public, read-only view of one session (ADR 0016 decision 7). The token in
// the URL is the only authorisation, so the page is never indexed, cached or
// sent on as a referrer.
export const metadata: Metadata = {
  title: 'Session plan',
  robots: { index: false, follow: false },
  referrer: 'no-referrer'
}
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ token: string }>
}

export default async function SharedSessionPage({ params }: PageProps) {
  const { token } = await params
  let view
  try {
    view = await getSharedSession(token)
  } catch (error) {
    if (isAppError(error) && error.status === 404) notFound()
    throw error
  }

  return (
    <main
      id='main'
      tabIndex={-1}
      className='outline-none mx-auto max-w-4xl space-y-6 px-4 py-8'
    >
      <header className='space-y-1'>
        <p className='text-xs uppercase tracking-wide text-muted-foreground'>
          {view.organisationName}
        </p>
        <h1 className='text-2xl font-medium tracking-tight'>{view.name}</h1>
        <p className='text-sm text-muted-foreground'>
          {view.when}
          {view.roomName ? ` · ${view.roomName}` : ''}
        </p>
        <div className='pt-2'>
          <Button asChild variant='outline' size='sm'>
            <a href={`/api/share/${token}/sheet`}>Download PDF</a>
          </Button>
        </div>
      </header>

      {view.warnings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>
              Check before the session
            </CardTitle>
          </CardHeader>
          <CardContent>
            <WarningsPanel warnings={view.warnings} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Input list</CardTitle>
        </CardHeader>
        <CardContent className='overflow-x-auto'>
          <table className='w-full min-w-[560px] text-sm'>
            <thead>
              <tr className='border-b text-left text-xs uppercase tracking-wide text-muted-foreground'>
                <th className='px-2 py-2 font-medium'>#</th>
                <th className='px-2 py-2 font-medium'>Source</th>
                <th className='px-2 py-2 font-medium'>Microphone</th>
                <th className='px-2 py-2 font-medium'>Stand</th>
                <th className='px-2 py-2 font-medium'>Preamp</th>
                <th className='px-2 py-2 font-medium'>48V</th>
                <th className='px-2 py-2 font-medium'>Pad</th>
              </tr>
            </thead>
            <tbody className='divide-y'>
              {view.channels.length === 0 && (
                <tr>
                  <td colSpan={7} className='px-2 py-4 text-muted-foreground'>
                    No inputs yet.
                  </td>
                </tr>
              )}
              {view.channels.map((channel) => (
                <tr key={channel.number}>
                  <td className='px-2 py-2 tabular-nums'>{channel.number}</td>
                  <td className='px-2 py-2'>{channel.source}</td>
                  <td className='px-2 py-2'>
                    {channel.mic ?? (channel.kind === 'line' ? 'Line' : '')}
                  </td>
                  <td className='px-2 py-2'>{channel.stand}</td>
                  <td className='px-2 py-2'>{channel.preampInput}</td>
                  <td className='px-2 py-2'>{channel.phantom ? '48V' : ''}</td>
                  <td className='px-2 py-2'>
                    {channel.padDb ? `-${channel.padDb} dB` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {view.scene && (
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Layout</CardTitle>
          </CardHeader>
          <CardContent>
            <SceneSvg scene={view.scene} />
          </CardContent>
        </Card>
      )}

      {view.branded && (
        <footer className='text-xs text-muted-foreground'>
          Planned with Kigumi
        </footer>
      )}
    </main>
  )
}
