import { Building2, ClipboardList, Mic, Wrench } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { PublicChrome } from '@/components/public-chrome'
import { Button } from '@/components/ui/button'
import { getSession } from '@/lib/tenant-context'

const FEATURES = [
  {
    icon: Building2,
    title: 'Your studio, to scale',
    body: 'Studios and rooms with real dimensions, ready for layouts.'
  },
  {
    icon: Mic,
    title: 'Grounded in your mic locker',
    body: 'Recommendations come only from the gear you actually own.'
  },
  {
    icon: ClipboardList,
    title: 'Sessions without the spreadsheet',
    body: 'Input lists and recall sheets that build themselves.'
  },
  {
    icon: Wrench,
    title: 'Kit that keeps working',
    body: 'Maintenance, PAT testing and warranties in one place.'
  }
]

export default async function Home() {
  if (await getSession()) redirect('/dashboard')

  return (
    <PublicChrome
      actions={
        <Button asChild variant='ghost'>
          <Link href='/auth/sign-in'>Sign in</Link>
        </Button>
      }
    >
      <section className='mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-14 px-4 py-20'>
        <div className='space-y-6'>
          <h1 className='max-w-3xl text-4xl font-semibold tracking-tight md:text-display lg:text-6xl lg:leading-[1.02]'>
            Plan sessions around the gear you actually own.
          </h1>
          <p className='max-w-2xl text-lg text-muted-foreground'>
            Kigumi brings your studio&apos;s rooms, equipment and microphone
            locker together, so every session plan starts from what&apos;s on
            your shelves.
          </p>
          <div className='flex flex-wrap gap-2'>
            <Button asChild size='lg'>
              <Link href='/auth/sign-up'>Create your studio</Link>
            </Button>
            <Button asChild size='lg' variant='surface'>
              <Link href='/auth/sign-in'>Sign in</Link>
            </Button>
          </div>
        </div>
        <ul className='grid gap-5 sm:grid-cols-2'>
          {FEATURES.map(({ icon: Icon, title, body }, index) => (
            <li
              key={title}
              className={
                index === 1
                  ? 'flex gap-3 rounded-xl bg-highlight p-5 text-highlight-foreground'
                  : 'flex gap-3 rounded-xl border border-card-border bg-card p-5 shadow-card'
              }
            >
              <Icon
                className={
                  index === 1
                    ? 'mt-0.5 h-5 w-5 shrink-0'
                    : 'mt-0.5 h-5 w-5 shrink-0 text-brand'
                }
              />
              <div className='space-y-1'>
                <p className='font-medium'>{title}</p>
                <p
                  className={
                    index === 1
                      ? 'text-highlight-foreground/80'
                      : 'text-muted-foreground'
                  }
                >
                  {body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </PublicChrome>
  )
}
