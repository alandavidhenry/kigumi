'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'

// First-run setup is forced for owners and managers (ADR 0025): until the
// organisation finishes or skips it, every app page sends them to /setup. The
// wizard leaves with a full page load, so this never sees stale state.
export function SetupGate({ required }: { readonly required: boolean }) {
  const pathname = usePathname()
  const router = useRouter()
  const onSetup = pathname.startsWith('/setup')

  useEffect(() => {
    if (required && !onSetup) router.replace('/setup')
  }, [required, onSetup, router])

  return null
}
