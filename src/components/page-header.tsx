import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface PageHeaderProps {
  readonly title: ReactNode
  readonly description?: ReactNode
  // Buttons or filters aligned to the right of the title on wide viewports.
  readonly actions?: ReactNode
  // Renders a small "← label" link above the title, for pages nested under
  // a list (e.g. a company or template detail page).
  readonly backHref?: string
  readonly backLabel?: string
  readonly className?: string
}

/*
  The single page-title treatment. Supabase sizes page titles modestly — the
  section nav already says where you are — so this is text-xl, not the
  text-3xl font-bold that each page used to re-implement.
*/
export function PageHeader({
  title,
  description,
  actions,
  backHref,
  backLabel,
  className
}: PageHeaderProps) {
  return (
    <div className={cn('space-y-2 pb-1', className)}>
      {backHref && (
        <Link
          href={backHref}
          className='inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground'
        >
          <ArrowLeft className='h-4 w-4' />
          {backLabel ?? 'Back'}
        </Link>
      )}
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='min-w-0 space-y-1'>
          <h1 className='truncate text-xl font-medium tracking-tight'>
            {title}
          </h1>
          {description && (
            <p className='text-sm text-muted-foreground'>{description}</p>
          )}
        </div>
        {actions && (
          <div className='flex shrink-0 items-center gap-2'>{actions}</div>
        )}
      </div>
    </div>
  )
}
