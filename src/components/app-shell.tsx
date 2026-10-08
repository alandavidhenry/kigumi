'use client'

import { Menu, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

import { SidebarNav } from '@/components/app-sidebar'
import { BrandMark } from '@/components/brand-mark'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { CommandPalette } from '@/components/command-palette'
import { useTenant } from '@/components/providers/tenant-provider'
import {
  isSidebarMode,
  SIDEBAR_MODE_STORAGE_KEY,
  SidebarControl,
  SidebarMode
} from '@/components/sidebar-control'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { UserMenu } from '@/components/user-menu'
import { cn } from '@/lib/utils'

function OrganisationName({ visible }: { readonly visible: boolean }) {
  const { organisationName } = useTenant()
  return (
    <span
      aria-hidden={!visible}
      className={cn(
        'min-w-0 truncate whitespace-nowrap font-semibold transition-opacity duration-150',
        visible ? 'opacity-100' : 'opacity-0'
      )}
    >
      {organisationName}
    </span>
  )
}

// Signed-in chrome: hover/expanded/collapsed sidebar plus a top bar, mirroring
// Minato's shell. Only rendered by the (app) layout, which has already
// resolved the tenant server-side.
export function AppShell({ children }: { readonly children: React.ReactNode }) {
  const pathname = usePathname() ?? ''
  const [mode, setMode] = useState<SidebarMode>('hover')
  const [hovering, setHovering] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Restore the persisted sidebar behaviour.
  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_MODE_STORAGE_KEY)
    if (isSidebarMode(stored)) setMode(stored)
  }, [])

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  const onModeChange = (next: SidebarMode) => {
    setMode(next)
    localStorage.setItem(SIDEBAR_MODE_STORAGE_KEY, next)
  }

  const expanded =
    mode === 'expanded' || (mode === 'hover' && (hovering || menuOpen))
  // Only the hover panel floats over the content; a pinned-open sidebar takes
  // up layout space so it never covers what you are reading.
  const overlaying = expanded && mode !== 'expanded'

  return (
    <TooltipProvider delayDuration={0}>
      <div className='flex h-screen overflow-hidden bg-background'>
        <div
          className={cn(
            'relative hidden shrink-0 transition-[width] duration-150 md:block',
            mode === 'expanded' ? 'w-56' : 'w-14'
          )}
        >
          <aside
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            onFocus={() => setHovering(true)}
            onBlur={(event) => {
              if (event.currentTarget.contains(event.relatedTarget)) return
              setHovering(false)
            }}
            className={cn(
              'absolute inset-y-0 left-0 z-40 flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-150',
              expanded ? 'w-56' : 'w-14',
              overlaying && 'shadow-lg'
            )}
          >
            <div className='flex h-12 shrink-0 items-center gap-2 overflow-hidden px-[14px]'>
              <Link href='/dashboard' aria-label='Kigumi home'>
                <BrandMark />
              </Link>
              <OrganisationName visible={expanded} />
            </div>

            <div className='flex-1 overflow-y-auto overflow-x-hidden'>
              <SidebarNav expanded={expanded} />
            </div>

            <div className='shrink-0 px-3 py-2'>
              <SidebarControl
                mode={mode}
                onModeChange={onModeChange}
                onOpenChange={setMenuOpen}
              />
            </div>
          </aside>
        </div>

        {/* Mobile/tablet-portrait drawer — always labelled, no hover on touch */}
        {mobileOpen && (
          <div className='fixed inset-0 z-40 md:hidden'>
            <button
              type='button'
              className='absolute inset-0 bg-scrim'
              onClick={() => setMobileOpen(false)}
              aria-label='Close menu'
            />
            <div className='animate-in slide-in-from-left absolute inset-y-0 left-0 flex w-64 flex-col bg-sidebar shadow-lg'>
              <div className='flex h-12 items-center justify-between gap-2 border-b border-sidebar-border px-3'>
                <span className='flex min-w-0 items-center gap-2'>
                  <BrandMark />
                  <OrganisationName visible />
                </span>
                <Button
                  variant='ghost'
                  size='icon'
                  onClick={() => setMobileOpen(false)}
                  aria-label='Close menu'
                >
                  <X className='h-4 w-4' />
                </Button>
              </div>
              <div className='flex-1 overflow-y-auto'>
                <SidebarNav expanded onNavigate={() => setMobileOpen(false)} />
              </div>
            </div>
          </div>
        )}

        <div className='flex min-w-0 flex-1 flex-col'>
          <header className='flex h-12 shrink-0 items-center gap-2 border-b px-4'>
            <Button
              variant='ghost'
              size='icon'
              className='md:hidden'
              onClick={() => setMobileOpen(true)}
              aria-label='Open menu'
            >
              <Menu className='h-4 w-4' />
            </Button>
            <Breadcrumbs />
            <div className='ml-auto flex items-center gap-2'>
              <CommandPalette />
              <ThemeToggle />
              <UserMenu />
            </div>
          </header>

          <main className='min-w-0 flex-1 overflow-y-auto'>
            <div className='mx-auto max-w-6xl p-4 md:p-6'>{children}</div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  )
}
