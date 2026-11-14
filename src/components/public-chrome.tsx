import Link from 'next/link'

import { BrandMark } from '@/components/brand-mark'
import { ThemeToggle } from '@/components/theme-toggle'

// Minimal chrome for signed-out pages (landing, auth, onboarding).
export function PublicChrome({
  children,
  actions
}: {
  readonly children: React.ReactNode
  readonly actions?: React.ReactNode
}) {
  return (
    <div className='flex min-h-screen flex-col bg-background'>
      <header className='flex h-14 items-center justify-between px-4 md:px-6'>
        <Link href='/' className='flex items-center gap-2 font-semibold'>
          <BrandMark />
          Kigumi
        </Link>
        <div className='flex items-center gap-2'>
          {actions}
          <ThemeToggle />
        </div>
      </header>
      <main
        id='main'
        tabIndex={-1}
        className='outline-none flex flex-1 flex-col'
      >
        {children}
      </main>
    </div>
  )
}
