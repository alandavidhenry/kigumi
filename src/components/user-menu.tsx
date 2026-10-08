'use client'

import { Check, LogOut, Plus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { useTenant } from '@/components/providers/tenant-provider'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { toast } from '@/components/ui/use-toast'
import { authClient } from '@/lib/auth-client'

function initials(name: string | null | undefined) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase() || '?'
}

// Avatar menu: account, organisation switcher and sign out.
export function UserMenu() {
  const router = useRouter()
  const { userName, userEmail, organisationId, organisations } = useTenant()
  const [switching, setSwitching] = useState(false)

  const switchTo = async (id: string) => {
    if (id === organisationId || switching) return
    setSwitching(true)
    const { error } = await authClient.organization.setActive({
      organizationId: id
    })
    setSwitching(false)
    if (error) {
      toast({
        title: 'Could not switch organisation',
        description: error.message,
        variant: 'destructive'
      })
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  const signOut = async () => {
    await authClient.signOut()
    router.push('/auth/sign-in')
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          className='rounded-full'
          aria-label='Account menu'
        >
          <span className='flex h-8 w-8 items-center justify-center rounded-full border border-brand-border bg-brand-tint text-sm font-medium text-foreground'>
            {initials(userName)}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-64'>
        <DropdownMenuLabel className='space-y-0.5'>
          <p className='truncate'>{userName}</p>
          <p className='truncate text-xs font-normal text-muted-foreground'>
            {userEmail}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className='text-xs font-normal text-muted-foreground'>
          Organisations
        </DropdownMenuLabel>
        {organisations.map((organisation) => (
          <DropdownMenuItem
            key={organisation.id}
            disabled={switching}
            onSelect={() => void switchTo(organisation.id)}
            className='flex items-center gap-2'
          >
            <Check
              className={
                organisation.id === organisationId
                  ? 'h-4 w-4'
                  : 'h-4 w-4 opacity-0'
              }
            />
            <span className='truncate'>{organisation.name}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem asChild>
          <Link href='/onboarding?new=1' className='flex items-center gap-2'>
            <Plus className='h-4 w-4' />
            New organisation
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => void signOut()}
          className='flex items-center gap-2 text-destructive focus:text-destructive'
        >
          <LogOut className='h-4 w-4' />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
