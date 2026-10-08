import { describe, expect, it } from 'vitest'

import {
  MEMBER_ROLES,
  MemberRole,
  Permission,
  ROLE_PERMISSIONS,
  assignableRoles,
  hasPermission,
  isMemberRole
} from '@/types/rbac'

describe('ROLE_PERMISSIONS', () => {
  it('gives owners every permission', () => {
    expect([...ROLE_PERMISSIONS[MemberRole.OWNER]].sort()).toEqual(
      Object.values(Permission).sort()
    )
  })

  it('lets managers manage studios and members but not delete the organisation', () => {
    expect(hasPermission(MemberRole.MANAGER, Permission.MANAGE_STUDIOS)).toBe(
      true
    )
    expect(hasPermission(MemberRole.MANAGER, Permission.MANAGE_MEMBERS)).toBe(
      true
    )
    expect(
      hasPermission(MemberRole.MANAGER, Permission.DELETE_ORGANISATION)
    ).toBe(false)
  })

  it.each([MemberRole.ENGINEER, MemberRole.VIEWER])(
    '%s can view but not manage studios or members',
    (role) => {
      expect(hasPermission(role, Permission.VIEW_STUDIOS)).toBe(true)
      expect(hasPermission(role, Permission.MANAGE_STUDIOS)).toBe(false)
      expect(hasPermission(role, Permission.MANAGE_MEMBERS)).toBe(false)
      expect(hasPermission(role, Permission.VIEW_AUDIT_LOG)).toBe(false)
    }
  )

  it('defines permissions for every role', () => {
    for (const role of MEMBER_ROLES) {
      expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0)
    }
  })
})

describe('hasPermission', () => {
  it('is false without a role', () => {
    expect(hasPermission(null, Permission.VIEW_STUDIOS)).toBe(false)
    expect(hasPermission(undefined, Permission.VIEW_STUDIOS)).toBe(false)
  })

  it('is false for an unknown role', () => {
    expect(
      hasPermission('janitor' as MemberRole, Permission.VIEW_STUDIOS)
    ).toBe(false)
  })
})

describe('isMemberRole', () => {
  it('accepts known roles only', () => {
    expect(isMemberRole('owner')).toBe(true)
    expect(isMemberRole('viewer')).toBe(true)
    expect(isMemberRole('admin')).toBe(false)
    expect(isMemberRole(undefined)).toBe(false)
    expect(isMemberRole(3)).toBe(false)
  })
})

describe('assignableRoles', () => {
  it('lets owners assign any role', () => {
    expect(assignableRoles(MemberRole.OWNER)).toEqual(MEMBER_ROLES)
  })

  it('stops managers creating owners', () => {
    expect(assignableRoles(MemberRole.MANAGER)).toEqual([
      MemberRole.MANAGER,
      MemberRole.ENGINEER,
      MemberRole.VIEWER
    ])
  })

  it('gives engineers, viewers and nobody nothing', () => {
    expect(assignableRoles(MemberRole.ENGINEER)).toEqual([])
    expect(assignableRoles(MemberRole.VIEWER)).toEqual([])
    expect(assignableRoles(null)).toEqual([])
  })
})
