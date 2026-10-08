'use client'

import { Boxes, Building2, Gauge, History, Settings, Users } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ComponentType } from 'react'

import { useTenant } from '@/components/providers/tenant-provider'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip'
import { buildNavGroups } from '@/lib/navigation'
import type { NavIconName, NavItem } from '@/lib/navigation'
import { cn } from '@/lib/utils'

const ICONS: Record<NavIconName, ComponentType<{ className?: string }>> = {
  dashboard: Gauge,
  studios: Building2,
  inventory: Boxes,
  members: Users,
  activity: History,
  settings: Settings
}

export function navIcon(name: NavIconName) {
  return ICONS[name]
}

export function useNavGroups() {
  const { can } = useTenant()
  return buildNavGroups(can)
}

interface SidebarNavProps {
  // Labels are present in the DOM either way; expanded fades them in and the
  // tooltips out, so nothing reflows vertically as the panel widens.
  readonly expanded: boolean
  readonly onNavigate?: () => void
}

export function SidebarNav({ expanded, onNavigate }: SidebarNavProps) {
  const pathname = usePathname() ?? ''
  const groups = useNavGroups()
  const activeHref = findActiveHref(groups, pathname)

  return (
    <nav className='flex flex-col gap-2 p-2' aria-label='Main'>
      {groups.map((group) => (
        <div key={group.id} className='flex flex-col gap-0.5'>
          {group.label && (
            <p
              aria-hidden={!expanded}
              className={cn(
                'flex h-5 items-center overflow-hidden whitespace-nowrap px-2 font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground transition-opacity duration-150',
                expanded ? 'opacity-100' : 'opacity-0'
              )}
            >
              {group.label}
            </p>
          )}

          {group.items.map((item) => (
            <SidebarLink
              key={item.href}
              item={item}
              active={item.href === activeHref}
              expanded={expanded}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ))}
    </nav>
  )
}

function SidebarLink({
  item,
  active,
  expanded,
  onNavigate
}: {
  readonly item: NavItem
  readonly active: boolean
  readonly expanded: boolean
  readonly onNavigate?: () => void
}) {
  const Icon = navIcon(item.icon)
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-9 items-center gap-3 rounded-md px-[11px] transition-colors md:h-8',
        active
          ? 'bg-sidebar-accent text-foreground'
          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground'
      )}
    >
      <Icon className='h-[18px] w-[18px] shrink-0' />
      <span
        className={cn(
          'truncate whitespace-nowrap text-sm transition-opacity duration-150',
          expanded ? 'opacity-100' : 'opacity-0'
        )}
      >
        {item.name}
      </span>
    </Link>
  )

  // Collapsed rows have no visible label, so they get a tooltip.
  if (expanded) return link

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side='right'>{item.name}</TooltipContent>
    </Tooltip>
  )
}

function findActiveHref(
  groups: ReturnType<typeof buildNavGroups>,
  pathname: string
) {
  return groups
    .flatMap((group) => group.items)
    .filter(
      (item) => pathname === item.href || pathname.startsWith(item.href + '/')
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href
}
