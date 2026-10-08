import {
  inferAdditionalFields,
  organizationClient
} from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

import type { Auth } from '@/lib/auth'
import { ac, roles } from '@/lib/auth-permissions'

export const authClient = createAuthClient({
  plugins: [organizationClient({ ac, roles }), inferAdditionalFields<Auth>()]
})

export const { signIn, signOut, signUp, useSession } = authClient
