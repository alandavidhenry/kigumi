// src/components/theme-toggle.tsx
'use client'

import { Moon, Sun } from 'lucide-react'

import { useTheme } from '@/components/providers/theme-provider'
import { Button } from '@/components/ui/button'

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const dark = resolvedTheme === 'dark'

  return (
    <Button
      variant='ghost'
      size='icon'
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {/* Picked by the theme class, which is set before first paint, so the
          icon never flips after hydration. */}
      <Sun className='hidden h-4 w-4 dark:block' />
      <Moon className='h-4 w-4 dark:hidden' />
      <span className='sr-only'>Toggle theme</span>
    </Button>
  )
}
