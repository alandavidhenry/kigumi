import { ChevronDown } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/utils'

export type NativeSelectProps = React.SelectHTMLAttributes<HTMLSelectElement>

// Plain <select> styled like Input. `className` sizes the wrapper that holds
// the select and its chevron, so width and height overrides keep working.
// Used for form fields and filters where a
// native control is more robust (mobile pickers, form semantics) than Radix.
const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, children, ...props }, ref) => (
    <div className={cn('relative h-9 w-full', className)}>
      <select
        ref={ref}
        className='h-full w-full appearance-none rounded-md border border-input bg-field py-1 pl-3 pr-9 text-sm ring-offset-background transition-colors hover:border-border-strong focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
        {...props}
      >
        {children}
      </select>
      <ChevronDown className='pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
    </div>
  )
)
NativeSelect.displayName = 'NativeSelect'

export { NativeSelect }
