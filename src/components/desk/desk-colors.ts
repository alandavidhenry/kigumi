'use client'

import { useEffect, useState } from 'react'

import type { DeskTone } from '@/lib/recall/desk-types'

// Canvas colours come from the theme tokens (globals.css), re-read when the
// theme changes, so the desk follows light and dark mode with no palette of
// its own.
export interface DeskColors {
  surface: string
  strip: string
  card: string
  border: string
  borderStrong: string
  foreground: string
  muted: string
  brand: string
  secondary: string
  font: string
  tones: Record<DeskTone, string>
}

function read(): DeskColors {
  const css = getComputedStyle(document.documentElement)
  const get = (name: string, fallback: string) =>
    css.getPropertyValue(name).trim() || fallback
  return {
    surface: get('--muted', '#f5f5f4'),
    strip: get('--background', '#fafaf9'),
    card: get('--card', '#ffffff'),
    border: get('--border', '#d6d3d1'),
    borderStrong: get('--border-strong', '#a8a29e'),
    foreground: get('--foreground', '#1c1917'),
    muted: get('--muted-foreground', '#78716c'),
    brand: get('--brand', '#ca8a04'),
    secondary: get('--secondary', '#e7e5e4'),
    font:
      getComputedStyle(document.body).fontFamily ||
      'ui-sans-serif, system-ui, sans-serif',
    tones: {
      'chart-1': get('--chart-1', '#2563eb'),
      'chart-2': get('--chart-2', '#16a34a'),
      'chart-3': get('--chart-3', '#dc2626'),
      'chart-4': get('--chart-4', '#ea580c'),
      'chart-5': get('--chart-5', '#9333ea')
    }
  }
}

export function useDeskColors(): DeskColors | null {
  const [colors, setColors] = useState<DeskColors | null>(null)
  useEffect(() => {
    setColors(read())
    const observer = new MutationObserver(() => setColors(read()))
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'style']
    })
    return () => observer.disconnect()
  }, [])
  return colors
}
