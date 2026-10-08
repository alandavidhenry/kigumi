'use client'

import { Building2, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import { navIcon, useNavGroups } from '@/components/app-sidebar'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { apiFetch } from '@/lib/client-api'
import type { StudioSummary } from '@/lib/studios'

export function CommandPalette() {
  const router = useRouter()
  const groups = useNavGroups()
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [isMac, setIsMac] = useState(false)
  const [studios, setStudios] = useState<StudioSummary[]>([])

  // Resolved after mount so the server and client markup agree.
  useEffect(() => {
    setIsMac(navigator.platform.toUpperCase().includes('MAC'))
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'k' || !(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      setOpen((value) => !value)
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  // Fetched once on first open rather than on every mount.
  useEffect(() => {
    if (!open || loaded) return
    setLoaded(true)
    apiFetch<{ studios: StudioSummary[] }>('/api/studios')
      .then((data) => setStudios(data.studios))
      .catch(() => setStudios([]))
  }, [open, loaded])

  const go = useCallback(
    (href: string) => {
      setOpen(false)
      router.push(href)
    },
    [router]
  )

  return (
    <>
      <button
        type='button'
        onClick={() => setOpen(true)}
        aria-label='Search'
        className='flex h-8 items-center gap-2 rounded-md border border-input bg-field px-2 text-sm text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground'
      >
        <Search className='h-4 w-4 shrink-0' />
        <span className='hidden sm:inline'>Search…</span>
        <kbd className='hidden rounded border border-border px-1 font-mono text-[10px] sm:inline'>
          {isMac ? '⌘' : 'Ctrl '}K
        </kbd>
      </button>

      <CommandDialog label='Search' open={open} onOpenChange={setOpen}>
        <CommandInput placeholder='Search pages and studios…' />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          {groups.map((group) => (
            <CommandGroup key={group.id} heading={group.label || 'Pages'}>
              {group.items.map((item) => {
                const Icon = navIcon(item.icon)
                return (
                  <CommandItem
                    key={item.href}
                    value={`${group.label} ${item.name}`}
                    onSelect={() => go(item.href)}
                  >
                    <Icon />
                    {item.name}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          ))}

          {studios.length > 0 && (
            <CommandGroup heading='Studios'>
              {studios.map((studio) => (
                <CommandItem
                  key={studio.id}
                  value={`studio ${studio.name}`}
                  onSelect={() => go(`/studios/${studio.id}`)}
                >
                  <Building2 />
                  {studio.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  )
}
