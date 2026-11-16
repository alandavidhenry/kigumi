import { Check } from 'lucide-react'
import Link from 'next/link'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import type { SetupProgress } from '@/lib/setup'

const ITEMS = [
  { key: 'studio', label: 'Add your studio', href: '/setup?step=studio' },
  { key: 'rooms', label: 'Add a room', href: '/setup?step=rooms' },
  { key: 'mics', label: 'Add your microphones', href: '/setup?step=mics' },
  { key: 'desk', label: 'Describe your desk', href: '/setup?step=desk' },
  { key: 'session', label: 'Plan a session', href: '/sessions/new' }
] as const

// Shown until every step has data. It can be hidden from the dashboard with
// "Customise dashboard", so it needs no dismiss state of its own.
export function GettingStartedCard({
  progress
}: {
  readonly progress: SetupProgress
}) {
  const doneCount = ITEMS.filter((i) => progress.steps[i.key]).length

  return (
    <Card aria-label='Getting started'>
      <CardHeader className='space-y-1'>
        <CardTitle>Getting started</CardTitle>
        <CardDescription>
          {doneCount} of {ITEMS.length} done
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div
          role='progressbar'
          aria-label='Setup progress'
          aria-valuemin={0}
          aria-valuemax={ITEMS.length}
          aria-valuenow={doneCount}
          className='h-2 overflow-hidden rounded-full bg-muted'
        >
          <div
            className='h-full rounded-full bg-primary transition-all'
            style={{ width: `${(doneCount / ITEMS.length) * 100}%` }}
          />
        </div>
        <ul className='divide-y'>
          {ITEMS.map((item) => {
            const done = progress.steps[item.key]
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className='flex min-h-9 items-center gap-3 py-2 text-sm hover:underline'
                >
                  <span
                    className={
                      done
                        ? 'flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground'
                        : 'size-5 rounded-full border border-input'
                    }
                  >
                    {done && <Check className='size-3' />}
                  </span>
                  <span className={done ? 'text-muted-foreground' : ''}>
                    {item.label}
                  </span>
                  {done && <span className='sr-only'>(done)</span>}
                </Link>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
