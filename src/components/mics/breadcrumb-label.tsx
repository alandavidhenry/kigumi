'use client'

import { useBreadcrumbLabel } from '@/components/providers/breadcrumb-provider'

// Lets a server-rendered page register a readable breadcrumb for its route.
export function BreadcrumbLabel({
  href,
  label
}: {
  readonly href: string
  readonly label: string
}) {
  useBreadcrumbLabel(href, label)
  return null
}
