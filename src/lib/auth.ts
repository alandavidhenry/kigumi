import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { nextCookies } from 'better-auth/next-js'
import { organization } from 'better-auth/plugins'

import {
  afterAcceptInvitation,
  afterCancelInvitation,
  afterCreateInvitation,
  afterCreateOrganization,
  afterRemoveMember,
  afterUpdateMemberRole,
  afterUpdateOrganization,
  appUrl,
  beforeCreateInvitation,
  beforeUpdateMemberRole,
  roleLabel,
  seatLimitFor,
  withDefaultActiveOrganisation
} from '@/lib/auth-hooks'
import { ac, roles } from '@/lib/auth-permissions'
import {
  sendInvitationEmail,
  sendPasswordResetEmail,
  sendVerificationEmail
} from '@/lib/email'
import prisma from '@/lib/prisma'

const INVITATION_EXPIRES_IN_SECONDS = 7 * 24 * 60 * 60

// Better Auth with the organization plugin (ADR 0002). Hook bodies live in
// src/lib/auth-hooks.ts so they can be unit tested.
export const auth = betterAuth({
  appName: 'Kigumi',
  baseURL: appUrl(),
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 10,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail(user.email, user.name, url)
    }
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail(user.email, user.name, url)
    }
  },
  // Better Auth rate-limits auth endpoints in production by default (e.g. 3
  // sign-ins per 10 s per IP). AUTH_RATE_LIMIT=off exists only for the E2E
  // job, where parallel workers all sign in from 127.0.0.1.
  rateLimit: {
    enabled:
      process.env.NODE_ENV === 'production' &&
      process.env.AUTH_RATE_LIMIT !== 'off'
  },
  session: {
    // Serve most session reads from a signed cookie instead of Postgres so
    // Neon can autosuspend (ADR 0002).
    cookieCache: { enabled: true, maxAge: 5 * 60 }
  },
  databaseHooks: {
    session: {
      create: { before: withDefaultActiveOrganisation }
    }
  },
  plugins: [
    organization({
      ac,
      roles,
      creatorRole: 'owner',
      invitationExpiresIn: INVITATION_EXPIRES_IN_SECONDS,
      cancelPendingInvitationsOnReInvite: true,
      requireEmailVerificationOnInvitation: true,
      membershipLimit: (_user, org) => seatLimitFor(org),
      schema: {
        organization: {
          additionalFields: {
            planTier: {
              type: 'string',
              required: false,
              defaultValue: 'free',
              input: false
            }
          }
        }
      },
      sendInvitationEmail: async ({
        id,
        email,
        role,
        organization,
        inviter
      }) => {
        await sendInvitationEmail(
          email,
          inviter.user.name,
          organization.name,
          roleLabel(role),
          appUrl(`/auth/accept-invite/${id}`)
        )
      },
      organizationHooks: {
        beforeCreateInvitation,
        beforeUpdateMemberRole,
        afterCreateOrganization,
        afterUpdateOrganization,
        afterCreateInvitation,
        afterCancelInvitation,
        afterAcceptInvitation,
        afterUpdateMemberRole,
        afterRemoveMember
      }
    }),
    // Must stay last so Set-Cookie headers from server actions reach Next.
    nextCookies()
  ]
})

export type Auth = typeof auth
