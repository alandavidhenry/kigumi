import { createAccessControl } from 'better-auth/plugins/access'
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc
} from 'better-auth/plugins/organization/access'

// Better Auth access control for organisation-management endpoints (invite,
// remove, change role, update/delete organisation). App-level permissions for
// Kigumi's own data live in src/types/rbac.ts. Shared by the server config
// (src/lib/auth.ts) and the client (src/lib/auth-client.ts).
export const ac = createAccessControl(defaultStatements)

export const roles = {
  owner: ac.newRole(ownerAc.statements),
  manager: ac.newRole(adminAc.statements),
  engineer: ac.newRole(memberAc.statements),
  viewer: ac.newRole(memberAc.statements)
}
