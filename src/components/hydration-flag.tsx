'use client'

import { useEffect, useState } from 'react'

// Browser tests must not type into a form before React owns it: hydration
// resets a field filled earlier, and a click before the handlers exist falls
// through to the browser's native form submit.

// Marks <html data-hydrated="true"> once React has taken over the page.
export function HydrationFlag() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = 'true'
  }, [])
  return null
}

// A <Suspense> boundary hydrates after the root. Render this inside one: it is
// in the server HTML as a hidden data-hydration-pending span and removes itself
// once that boundary is interactive.
export function HydrationMarker() {
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  return ready ? null : <span hidden data-hydration-pending='' />
}
