'use client'

import { createContext, useContext, useMemo } from 'react'

import type { OrganisationOption } from '@/lib/members'
import { hasFeature } from '@/lib/plans'
import type { Feature, PlanTier } from '@/lib/plans'
import { hasPermission } from '@/types/rbac'
import type { MemberRole, Permission } from '@/types/rbac'

// Serializable slice of the server TenantContext, handed to client components
// by the (app) layout. Client checks are for UI affordances only — every API
// route re-checks permissions server-side.
export interface ClientTenant {
  userId: string
  userName: string
  userEmail: string
  organisationId: string
  organisationName: string
  role: MemberRole
  planTier: PlanTier
  organisations: OrganisationOption[]
}

interface TenantContextValue extends ClientTenant {
  can: (permission: Permission) => boolean
  has: (feature: Feature) => boolean
}

const TenantContext = createContext<TenantContextValue | null>(null)

export function TenantProvider({
  tenant,
  children
}: {
  readonly tenant: ClientTenant
  readonly children: React.ReactNode
}) {
  const value = useMemo(
    () => ({
      ...tenant,
      can: (permission: Permission) => hasPermission(tenant.role, permission),
      has: (feature: Feature) => hasFeature(tenant.planTier, feature)
    }),
    [tenant]
  )
  return (
    <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
  )
}

export function useTenant(): TenantContextValue {
  const value = useContext(TenantContext)
  if (!value) throw new Error('useTenant must be used within a TenantProvider')
  return value
}
