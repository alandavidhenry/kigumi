import Link from 'next/link'
import { ComponentType, ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface StatTileProps {
  readonly label: string
  readonly value: ReactNode
  readonly hint?: ReactNode
  readonly icon?: ComponentType<{ className?: string }>
  readonly href?: string
  readonly tone?: 'default' | 'highlight'
  readonly className?: string
}

// A key figure: label, large value and an optional hint. `highlight` is the
// solid amber tile, used for at most one figure per screen.
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  href,
  tone = 'default',
  className
}: StatTileProps) {
  const highlight = tone === 'highlight'
  const classes = cn(
    'block space-y-2 rounded-xl p-5 transition-colors',
    highlight
      ? 'bg-highlight text-highlight-foreground'
      : 'border border-card-border bg-card shadow-card',
    href &&
      (highlight ? 'hover:bg-highlight/90' : 'hover:border-border-strong'),
    href &&
      'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
    className
  )
  const muted = highlight
    ? 'text-highlight-foreground/80'
    : 'text-muted-foreground'

  const content = (
    <>
      <div
        className={cn('flex items-center justify-between gap-2 text-sm', muted)}
      >
        <span>{label}</span>
        {Icon && <Icon className='size-4 shrink-0' />}
      </div>
      <div className='text-display font-semibold tabular-nums'>{value}</div>
      {hint && <div className={cn('text-xs', muted)}>{hint}</div>}
    </>
  )

  if (href) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    )
  }
  return <div className={classes}>{content}</div>
}
