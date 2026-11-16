import { Permission } from '@/types/rbac'

// Sidebar/command-palette model. Icons are named rather than imported so this
// stays a plain, unit-testable module; app-sidebar.tsx maps names to icons.
// Groups with no visible items are omitted.

export type NavIconName =
  | 'dashboard'
  | 'studios'
  | 'inventory'
  | 'mics'
  | 'locker'
  | 'recommendations'
  | 'sessions'
  | 'templates'
  | 'consoles'
  | 'maintenance'
  | 'warranty'
  | 'admin'
  | 'members'
  | 'activity'
  | 'settings'
  | 'setup'

export interface NavItem {
  name: string
  href: string
  icon: NavIconName
}

export interface NavGroup {
  id: string
  label: string
  items: NavItem[]
}

export interface NavOptions {
  // Platform admins also see the global catalogue's review queue.
  platformAdmin?: boolean
}

export function buildNavGroups(
  can: (permission: Permission) => boolean,
  { platformAdmin = false }: NavOptions = {}
): NavGroup[] {
  const planItems: NavItem[] = []
  if (can(Permission.VIEW_SESSIONS)) {
    planItems.push({ name: 'Sessions', href: '/sessions', icon: 'sessions' })
  }
  if (can(Permission.VIEW_INVENTORY)) {
    planItems.push({
      name: 'Recommendations',
      href: '/recommendations',
      icon: 'recommendations'
    })
  }
  if (can(Permission.VIEW_SESSIONS)) {
    planItems.push({
      name: 'Layout templates',
      href: '/layouts/templates',
      icon: 'templates'
    })
  }

  const gearItems: NavItem[] = []
  if (can(Permission.VIEW_INVENTORY)) {
    gearItems.push({ name: 'Inventory', href: '/inventory', icon: 'inventory' })
  }
  if (can(Permission.VIEW_INVENTORY)) {
    gearItems.push({ name: 'Mic locker', href: '/locker', icon: 'locker' })
  }
  if (can(Permission.VIEW_MIC_CATALOGUE)) {
    gearItems.push({ name: 'Mic catalogue', href: '/mics', icon: 'mics' })
  }
  if (can(Permission.VIEW_SESSIONS)) {
    gearItems.push({
      name: 'Consoles & recall',
      href: '/consoles',
      icon: 'consoles'
    })
  }

  // The setup wizard is not a main link (ADR 0025): it is forced on first run,
  // then reached from the dashboard and organisation settings.
  const studioItems: NavItem[] = [
    { name: 'Studios & rooms', href: '/studios', icon: 'studios' }
  ]

  const careItems: NavItem[] = []
  if (can(Permission.VIEW_INVENTORY)) {
    careItems.push({
      name: 'Maintenance',
      href: '/maintenance',
      icon: 'maintenance'
    })
    careItems.push({
      name: 'Warranties',
      href: '/warranties',
      icon: 'warranty'
    })
  }

  const organisationItems: NavItem[] = [
    { name: 'Members', href: '/settings/members', icon: 'members' }
  ]
  if (can(Permission.VIEW_AUDIT_LOG)) {
    organisationItems.push({
      name: 'Activity',
      href: '/activity',
      icon: 'activity'
    })
  }
  organisationItems.push({
    name: 'Settings',
    href: '/settings/organisation',
    icon: 'settings'
  })

  const groups: NavGroup[] = [
    {
      id: 'overview',
      label: '',
      items: [{ name: 'Dashboard', href: '/dashboard', icon: 'dashboard' }]
    },
    { id: 'plan', label: 'Plan', items: planItems },
    { id: 'gear', label: 'Gear', items: gearItems },
    { id: 'studio', label: 'Studio', items: studioItems },
    { id: 'care', label: 'Care', items: careItems },
    { id: 'organisation', label: 'Organisation', items: organisationItems },
    ...(platformAdmin
      ? [
          {
            id: 'platform',
            label: 'Platform',
            items: [
              {
                name: 'Mic review queue',
                href: '/admin/mics',
                icon: 'admin' as const
              }
            ]
          }
        ]
      : [])
  ]

  return groups.filter((group) => group.items.length > 0)
}
