import { Permission } from '@/types/rbac'

// Sidebar/command-palette model. Icons are named rather than imported so this
// stays a plain, unit-testable module; app-sidebar.tsx maps names to icons.
// Future modules (Inventory, Mic locker, Sessions, Maintenance) are added here
// as their phases land.

export type NavIconName =
  | 'dashboard'
  | 'studios'
  | 'inventory'
  | 'mics'
  | 'locker'
  | 'admin'
  | 'members'
  | 'activity'
  | 'settings'

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
  const studioItems: NavItem[] = [
    { name: 'Studios & rooms', href: '/studios', icon: 'studios' }
  ]
  if (can(Permission.VIEW_INVENTORY)) {
    studioItems.push({
      name: 'Inventory',
      href: '/inventory',
      icon: 'inventory'
    })
  }

  if (can(Permission.VIEW_MIC_CATALOGUE)) {
    studioItems.push({ name: 'Mic catalogue', href: '/mics', icon: 'mics' })
  }
  if (can(Permission.VIEW_INVENTORY)) {
    studioItems.push({ name: 'Mic locker', href: '/locker', icon: 'locker' })
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

  return [
    {
      id: 'overview',
      label: '',
      items: [{ name: 'Dashboard', href: '/dashboard', icon: 'dashboard' }]
    },
    {
      id: 'studio',
      label: 'Studio',
      items: studioItems
    },
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
}
