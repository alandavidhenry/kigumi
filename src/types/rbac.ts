// Organisation membership roles. Stored on Better Auth's Member.role column
// and registered with the organization plugin in src/lib/auth.ts.
export enum MemberRole {
  OWNER = 'owner',
  MANAGER = 'manager',
  ENGINEER = 'engineer',
  VIEWER = 'viewer'
}

export const MEMBER_ROLES: readonly MemberRole[] = [
  MemberRole.OWNER,
  MemberRole.MANAGER,
  MemberRole.ENGINEER,
  MemberRole.VIEWER
]

export const MEMBER_ROLE_LABELS: Readonly<Record<MemberRole, string>> = {
  [MemberRole.OWNER]: 'Owner',
  [MemberRole.MANAGER]: 'Manager',
  [MemberRole.ENGINEER]: 'Engineer',
  [MemberRole.VIEWER]: 'Viewer'
}

export enum Permission {
  // Organisation
  VIEW_ORGANISATION = 'view:organisation',
  EDIT_ORGANISATION = 'edit:organisation',
  DELETE_ORGANISATION = 'delete:organisation',

  // Members
  VIEW_MEMBERS = 'view:members',
  MANAGE_MEMBERS = 'manage:members',

  // Studios and rooms
  VIEW_STUDIOS = 'view:studios',
  MANAGE_STUDIOS = 'manage:studios',

  // Audit
  VIEW_AUDIT_LOG = 'view:audit-log'
}

export const ROLE_PERMISSIONS: Readonly<
  Record<MemberRole, readonly Permission[]>
> = {
  [MemberRole.OWNER]: Object.values(Permission),
  [MemberRole.MANAGER]: [
    Permission.VIEW_ORGANISATION,
    Permission.EDIT_ORGANISATION,
    Permission.VIEW_MEMBERS,
    Permission.MANAGE_MEMBERS,
    Permission.VIEW_STUDIOS,
    Permission.MANAGE_STUDIOS,
    Permission.VIEW_AUDIT_LOG
  ],
  [MemberRole.ENGINEER]: [
    Permission.VIEW_ORGANISATION,
    Permission.VIEW_MEMBERS,
    Permission.VIEW_STUDIOS
  ],
  [MemberRole.VIEWER]: [
    Permission.VIEW_ORGANISATION,
    Permission.VIEW_MEMBERS,
    Permission.VIEW_STUDIOS
  ]
}

export function isMemberRole(value: unknown): value is MemberRole {
  return typeof value === 'string' && MEMBER_ROLES.includes(value as MemberRole)
}

export function hasPermission(
  role: MemberRole | null | undefined,
  permission: Permission
): boolean {
  if (!role) return false
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

// Roles a member with `role` may assign when inviting or changing a member.
// Only owners can create other owners; managers can't promote anyone above
// themselves.
export function assignableRoles(
  role: MemberRole | null | undefined
): MemberRole[] {
  if (role === MemberRole.OWNER) return [...MEMBER_ROLES]
  if (role === MemberRole.MANAGER) {
    return [MemberRole.MANAGER, MemberRole.ENGINEER, MemberRole.VIEWER]
  }
  return []
}
