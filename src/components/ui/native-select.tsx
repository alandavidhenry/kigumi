import * as React from 'react'

import { cn } from '@/lib/utils'

export type NativeSelectProps = React.SelectHTMLAttributes<HTMLSelectElement>

// Plain <select> styled like Input. Used for form fields and filters where a
// native control is more robust (mobile pickers, form semantics) than Radix.
const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-8 w-full rounded-md border border-input bg-field px-3 py-1 text-sm ring-offset-background transition-colors hover:border-border-strong focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
)
NativeSelect.displayName = 'NativeSelect'

export { NativeSelect }
