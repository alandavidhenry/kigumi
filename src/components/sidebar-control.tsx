'use client'

import { PanelLeft } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

export type SidebarMode = 'expanded' | 'collapsed' | 'hover'

export const SIDEBAR_MODE_STORAGE_KEY = 'sidebar-mode'

const MODES: SidebarMode[] = ['expanded', 'collapsed', 'hover']

export function isSidebarMode(value: unknown): value is SidebarMode {
  return typeof value === 'string' && MODES.includes(value as SidebarMode)
}

interface SidebarControlProps {
  readonly mode: SidebarMode
  readonly onModeChange: (mode: SidebarMode) => void
  // Lets the shell hold the panel open while the menu is on screen — the menu
  // is portalled outside the sidebar, so moving into it would otherwise read
  // as a mouse-leave and collapse the panel underneath it.
  readonly onOpenChange?: (open: boolean) => void
}

export function SidebarControl({
  mode,
  onModeChange,
  onOpenChange
}: SidebarControlProps) {
  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' size='icon' aria-label='Sidebar control'>
          <PanelLeft className='h-4 w-4' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side='top' align='start' className='w-48'>
        <DropdownMenuLabel>Sidebar control</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(value) => {
            if (isSidebarMode(value)) onModeChange(value)
          }}
        >
          <DropdownMenuRadioItem value='expanded'>
            Expanded
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value='collapsed'>
            Collapsed
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value='hover'>
            Expand on hover
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
