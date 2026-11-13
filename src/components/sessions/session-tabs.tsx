'use client'

import { Check } from 'lucide-react'
import Link from 'next/link'
import { useSelectedLayoutSegment } from 'next/navigation'

import type { SessionProgress } from '@/lib/sessions/progress'
import { cn } from '@/lib/utils'

const TABS = [
  { segment: null, label: 'Overview', done: null },
  { segment: 'layout', label: 'Layout', done: 'layout' },
  { segment: 'inputs', label: 'Inputs & mics', done: 'inputs' },
  { segment: 'recall', label: 'Recall', done: 'recall' }
] as const

// The session's planning steps as tabs. A tick means the step has what it
// needs; otherwise the step number shows.
export function SessionTabs({
  sessionId,
  progress
}: {
  readonly sessionId: string
  readonly progress: SessionProgress
}) {
  const current = useSelectedLayoutSegment()

  return (
    <nav aria-label='Session sections' className='border-b'>
      <ul className='-mb-px flex gap-1 overflow-x-auto'>
        {TABS.map((tab, index) => {
          const active = (current ?? null) === tab.segment
          const done = tab.done ? progress[tab.done] : false
          const href = tab.segment
            ? `/sessions/${sessionId}/${tab.segment}`
            : `/sessions/${sessionId}`
          return (
            <li key={tab.label} className='shrink-0'>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm whitespace-nowrap',
                  active
                    ? 'border-primary font-medium text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {tab.done && (
                  <span
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-full border text-xs',
                      done
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'text-muted-foreground'
                    )}
                  >
                    {done ? (
                      <>
                        <Check className='h-3 w-3' aria-hidden='true' />
                        <span className='sr-only'>Done:</span>
                      </>
                    ) : (
                      index
                    )}
                  </span>
                )}
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
