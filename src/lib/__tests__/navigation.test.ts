import { describe, expect, it } from 'vitest'

import { buildNavGroups } from '@/lib/navigation'
import { MemberRole, hasPermission } from '@/types/rbac'

const hrefsFor = (role: MemberRole) =>
  buildNavGroups((permission) => hasPermission(role, permission))
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
      '/settings/members',
      '/settings/organisation'
    ])
  })
})
