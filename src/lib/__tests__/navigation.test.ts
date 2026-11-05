import { describe, expect, it } from 'vitest'

import { buildNavGroups } from '@/lib/navigation'
import { MemberRole, hasPermission } from '@/types/rbac'

const hrefsFor = (role: MemberRole, platformAdmin = false) =>
  buildNavGroups((permission) => hasPermission(role, permission), {
    platformAdmin
  })
    .flatMap((group) => group.items)
    .map((item) => item.href)

describe('buildNavGroups', () => {
  it('shows the activity log to owners and managers', () => {
    expect(hrefsFor(MemberRole.OWNER)).toContain('/activity')
    expect(hrefsFor(MemberRole.MANAGER)).toContain('/activity')
  })

  it('hides the activity log from engineers and viewers', () => {
    expect(hrefsFor(MemberRole.ENGINEER)).not.toContain('/activity')
    expect(hrefsFor(MemberRole.VIEWER)).toEqual([
      '/dashboard',
      '/studios',
      '/inventory',
      '/mics',
      '/locker',
      '/recommendations',
      '/sessions',
      '/layouts/templates',
      '/consoles',
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
})
