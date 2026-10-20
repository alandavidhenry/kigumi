import { cache } from 'react'

import { notFound, unauthorized } from '@/lib/errors'
import { getSession } from '@/lib/tenant-context'

// Platform admins run the global microphone catalogue (ADR 0008). They are
// named by email in PLATFORM_ADMIN_EMAILS (comma separated), not by an
// organisation role: the catalogue belongs to Kigumi, not to any tenant.
// Better Auth's tables stay untouched.

export interface PlatformAdminContext {
  userId: string
  userName: string
  userEmail: string
}

export function platformAdminEmails(
  raw: string | undefined = process.env.PLATFORM_ADMIN_EMAILS
): string[] {
  return (raw ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

// Unverified addresses never count, so claiming an admin's email at sign-up
// grants nothing.
export function isPlatformAdmin(user: {
  email: string
  emailVerified: boolean
}): boolean {
  return (
    user.emailVerified &&
    platformAdminEmails().includes(user.email.trim().toLowerCase())
  )
}

export async function isCurrentUserPlatformAdmin(): Promise<boolean> {
  const session = await getSession()
  return session ? isPlatformAdmin(session.user) : false
}

// Non-admins get NOT_FOUND (404) rather than FORBIDDEN so the admin surface
// isn't discoverable.
export const getPlatformAdminContext = cache(
  async (): Promise<PlatformAdminContext> => {
    const session = await getSession()
    if (!session) throw unauthorized()
    if (!isPlatformAdmin(session.user)) throw notFound()
    return {
      userId: session.user.id,
      userName: session.user.name,
      userEmail: session.user.email
    }
  }
)
