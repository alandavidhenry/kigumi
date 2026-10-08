// src/components/ui/breadcrumb.tsx
import { ChevronRight } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/utils'

// Simplify interface definitions to avoid TypeScript errors
export type BreadcrumbProps = React.HTMLAttributes<HTMLDivElement>

export type BreadcrumbItemProps = React.HTMLAttributes<HTMLLIElement>

export type BreadcrumbLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement>

export type BreadcrumbSeparatorProps = React.HTMLAttributes<HTMLSpanElement>

// Simplified Breadcrumb component
export const Breadcrumb = React.forwardRef<HTMLDivElement, BreadcrumbProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <nav
        ref={ref}
        className={cn('flex', className)}
        aria-label='breadcrumb'
        {...props}
      >
        {children}
      </nav>
    )
  }
)
Breadcrumb.displayName = 'Breadcrumb'

// Simplified BreadcrumbList component
export const BreadcrumbList = React.forwardRef<
  HTMLOListElement,
  React.HTMLAttributes<HTMLOListElement>
>(({ className, ...props }, ref) => {
  return (
    <ol
      ref={ref}
      className={cn(
        'flex flex-wrap items-center gap-1 text-sm text-muted-foreground',
        className
      )}
      {...props}
    />
  )
})
BreadcrumbList.displayName = 'BreadcrumbList'

// Simplified BreadcrumbItem component
export const BreadcrumbItem = React.forwardRef<
  HTMLLIElement,
  BreadcrumbItemProps
>(({ className, ...props }, ref) => {
  return (
    <li
      ref={ref}
      className={cn('inline-flex items-center gap-1', className)}
      {...props}
    />
  )
})
BreadcrumbItem.displayName = 'BreadcrumbItem'

// Simplified BreadcrumbLink component
export const BreadcrumbLink = React.forwardRef<
  HTMLAnchorElement,
  BreadcrumbLinkProps
>(({ children, className, ...props }, ref) => {
  return (
    <a
      ref={ref}
      className={cn('transition-colors hover:text-foreground', className)}
      {...props}
    >
      {children || <span className='sr-only'>Breadcrumb link</span>}
    </a>
  )
})
BreadcrumbLink.displayName = 'BreadcrumbLink'

// Simplified BreadcrumbSeparator component
export const BreadcrumbSeparator = ({
  children,
  className,
  ...props
}: BreadcrumbSeparatorProps) => (
  <span aria-hidden='true' className={cn('mx-1', className)} {...props}>
    {children || <ChevronRight className='h-4 w-4' />}
  </span>
)
BreadcrumbSeparator.displayName = 'BreadcrumbSeparator'
