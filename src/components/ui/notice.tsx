import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '@/lib/utils'

const noticeVariants = cva(
  'flex gap-3 rounded-xl border px-4 py-3 text-sm text-foreground',
  {
    variants: {
      variant: {
        warning: 'border-warning/25 bg-warning/10',
        info: 'border-info/25 bg-info/10',
        destructive: 'border-destructive/25 bg-destructive/10',
        success: 'border-success/25 bg-success/10',
        neutral: 'border-border bg-muted'
      }
    },
    defaultVariants: {
      variant: 'neutral'
    }
  }
)

const iconVariants = cva('mt-0.5 h-4 w-4 shrink-0', {
  variants: {
    variant: {
      warning: 'text-warning',
      info: 'text-info',
      destructive: 'text-destructive',
      success: 'text-success',
      neutral: 'text-muted-foreground'
    }
  },
  defaultVariants: {
    variant: 'neutral'
  }
})

export interface NoticeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof noticeVariants> {
  readonly icon?: React.ComponentType<{ className?: string }>
}

function Notice({
  className,
  variant,
  icon: Icon,
  children,
  ...props
}: NoticeProps) {
  return (
    <div className={cn(noticeVariants({ variant }), className)} {...props}>
      {Icon && <Icon className={iconVariants({ variant })} />}
      <div className='min-w-0 flex-1'>{children}</div>
    </div>
  )
}

export { Notice, noticeVariants }
