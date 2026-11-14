import { ComponentType, ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface EmptyStateProps {
  readonly icon?: ComponentType<{ className?: string }>
  readonly title: string
  readonly description?: string
  // Optional call to action, e.g. a "Add your first company" button.
  readonly action?: ReactNode
  readonly className?: string
}

// The one empty-state treatment, replacing the three that had grown up
// independently (colspan table rows, centred paragraphs, bordered boxes).
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 px-6 py-16 text-center',
        className
      )}
    >
      {Icon && (
        <span className='flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground'>
          <Icon className='h-5 w-5' />
        </span>
      )}
      <div className='space-y-1'>
        <p className='text-base font-semibold'>{title}</p>
        {description && (
          <p className='max-w-sm text-sm text-muted-foreground'>
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}
