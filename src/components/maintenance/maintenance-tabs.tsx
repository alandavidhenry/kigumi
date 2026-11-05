import Link from 'next/link'

import { cn } from '@/lib/utils'

const TABS = [
  { href: '/maintenance', label: 'Due' },
  { href: '/maintenance/plans', label: 'Plans' },
  { href: '/maintenance/log', label: 'Service log' },
  { href: '/maintenance/pat', label: 'PAT testing' }
] as const

// Section navigation for the maintenance pages. Server-rendered: the current
// tab is passed in rather than read from the URL.
export function MaintenanceTabs({
  current
}: {
  readonly current: (typeof TABS)[number]['href']
}) {
  return (
    <nav aria-label='Maintenance sections' className='flex gap-1 border-b'>
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.href === current ? 'page' : undefined}
          className={cn(
            '-mb-px border-b-2 px-3 py-2 text-sm transition-colors',
            tab.href === current
              ? 'border-brand font-medium text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
