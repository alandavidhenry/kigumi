import { Permission } from '@/types/rbac'

// Sidebar/command-palette model. Icons are named rather than imported so this
// stays a plain, unit-testable module; app-sidebar.tsx maps names to icons.
// Future modules (Inventory, Mic locker, Sessions, Maintenance) are added here
// as their phases land.

export type NavIconName =
  'dashboard' | 'studios' | 'members' | 'activity' | 'settings'

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

export function buildNavGroups(
  can: (permission: Permission) => boolean
): NavGroup[] {
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
      items: [{ name: 'Studios & rooms', href: '/studios', icon: 'studios' }]
    },
    { id: 'organisation', label: 'Organisation', items: organisationItems }
  ]
}
