import { describe, expect, it } from 'vitest'

import { buildNavGroups } from '@/lib/navigation'
import { MemberRole, hasPermission } from '@/types/rbac'

const groupsFor = (role: MemberRole, platformAdmin = false) =>
  buildNavGroups((permission) => hasPermission(role, permission), {
    platformAdmin
  })

const hrefsFor = (role: MemberRole, platformAdmin = false) =>
  groupsFor(role, platformAdmin)
    .flatMap((group) => group.items)
    .map((item) => item.href)

const labelsFor = (role: MemberRole) =>
  groupsFor(role).map((group) => [group.label, group.items.map((i) => i.name)])

describe('buildNavGroups', () => {
  it('orders groups overview, plan, gear, studio, care, organisation', () => {
    expect(groupsFor(MemberRole.OWNER).map((group) => group.id)).toEqual([
      'overview',
      'plan',
      'gear',
      'studio',
      'care',
      'organisation'
    ])
  })

  it('places each item in its group for an owner', () => {
    expect(labelsFor(MemberRole.OWNER)).toEqual([
      ['', ['Dashboard']],
      ['Plan', ['Sessions', 'Recommendations', 'Layout templates']],
      [
        'Gear',
        ['Inventory', 'Mic locker', 'Mic catalogue', 'Consoles & recall']
      ],
      ['Studio', ['Studios & rooms']],
      ['Care', ['Maintenance', 'Warranties']],
      ['Organisation', ['Members', 'Activity', 'Settings']]
    ])
  })

  it('keeps the setup wizard out of the sidebar for every role', () => {
    for (const role of Object.values(MemberRole)) {
      expect(hrefsFor(role)).not.toContain('/setup')
    }
  })

  it('shows the activity log to owners and managers', () => {
    expect(hrefsFor(MemberRole.OWNER)).toContain('/activity')
    expect(hrefsFor(MemberRole.MANAGER)).toContain('/activity')
  })

  it('hides the activity log from engineers and viewers', () => {
    expect(hrefsFor(MemberRole.ENGINEER)).not.toContain('/activity')
    expect(hrefsFor(MemberRole.VIEWER)).toEqual([
      '/dashboard',
      '/sessions',
      '/recommendations',
      '/layouts/templates',
      '/inventory',
      '/locker',
      '/mics',
      '/consoles',
      '/studios',
      '/maintenance',
      '/warranties',
      '/settings/members',
      '/settings/organisation'
    ])
  })

  it('shows the mic catalogue, locker and recommendations to every role', () => {
    for (const role of Object.values(MemberRole)) {
      expect(hrefsFor(role)).toEqual(
        expect.arrayContaining(['/mics', '/locker', '/recommendations'])
      )
    }
  })

  it('shows sessions and layout templates to every role', () => {
    for (const role of Object.values(MemberRole)) {
      expect(hrefsFor(role)).toEqual(
        expect.arrayContaining(['/sessions', '/layouts/templates'])
      )
    }
  })

  it('shows the mic review queue only to platform admins', () => {
    expect(hrefsFor(MemberRole.OWNER)).not.toContain('/admin/mics')
    expect(hrefsFor(MemberRole.OWNER, true)).toContain('/admin/mics')
  })

  it('omits groups with no visible items', () => {
    const none = buildNavGroups(() => false)
    expect(none.map((group) => group.id)).toEqual([
      'overview',
      'studio',
      'organisation'
    ])
    expect(none.every((group) => group.items.length > 0)).toBe(true)
  })
})
