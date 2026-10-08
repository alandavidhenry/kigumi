'use client'

import { ChevronRight, Home } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Fragment } from 'react'

import { useBreadcrumbLabels } from '@/components/providers/breadcrumb-provider'

// Labels for known multi-segment routes, keyed by the full cumulative path.
// Segments not listed here are either dynamic ids (resolved via the
// breadcrumb label registry) or route-grouping prefixes with no page of
// their own, which are skipped entirely.
const ROUTE_LABELS: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/studios': 'Studios & rooms',
  '/activity': 'Activity',
  '/settings/members': 'Members',
  '/settings/organisation': 'Organisation'
}

// Route-grouping segments that never have a page of their own — always
// skipped regardless of position (e.g. `/settings`).
const SKIP_SEGMENTS = new Set(['settings'])

// Trailing action segments that are folded into the entity crumb before them
// rather than shown as their own crumb (e.g. `/completions/[id]/view`
// collapses to just the completion's title, not "... / View").
const FOLD_SEGMENTS = new Set<string>([])

// Routes that render their own in-page breadcrumb (e.g. the file browser's
// folder path) — skip the global breadcrumb entirely to avoid doubling up.
const EXCLUDED_PREFIXES: string[] = []

const ID_LIKE = /^[a-z0-9]{20,}$/i

function humanize(segment: string) {
  if (ID_LIKE.test(segment)) return 'Loading…'
  return segment.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

interface Crumb {
  href: string
  label: string
}

export function Breadcrumbs() {
  const pathname = usePathname() ?? ''
  const { labels } = useBreadcrumbLabels()

  if (EXCLUDED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return null
  }

  const segments = pathname.split('/').filter(Boolean)
  const crumbs: Crumb[] = []
  let cumulative = ''

  segments.forEach((segment, index) => {
    cumulative += `/${segment}`
    const isLastSegment = index === segments.length - 1

    if (ROUTE_LABELS[cumulative]) {
      crumbs.push({ href: cumulative, label: ROUTE_LABELS[cumulative] })
      return
    }
    if (SKIP_SEGMENTS.has(segment)) return
    if (isLastSegment && FOLD_SEGMENTS.has(segment)) return

    const label = labels[cumulative] ?? humanize(segment)
    crumbs.push({ href: cumulative, label })
  })

  // Top-level pages don't need a trail — the sidebar already shows the
  // current section.
  if (crumbs.length < 2) return null

  return (
    <nav
      aria-label='Breadcrumb'
      className='flex min-w-0 items-center gap-1 overflow-x-auto text-sm text-muted-foreground'
    >
      <Link
        href='/'
        className='flex shrink-0 items-center hover:text-foreground'
      >
        <Home className='h-4 w-4' />
        <span className='sr-only'>Home</span>
      </Link>
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1
        return (
          <Fragment key={crumb.href}>
            <ChevronRight className='h-4 w-4 shrink-0' />
            {isLast ? (
              <span className='truncate font-medium text-foreground'>
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className='shrink-0 whitespace-nowrap hover:text-foreground'
              >
                {crumb.label}
              </Link>
            )}
          </Fragment>
        )
      })}
    </nav>
  )
}
