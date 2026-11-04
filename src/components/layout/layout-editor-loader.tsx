'use client'

import dynamic from 'next/dynamic'

import { Skeleton } from '@/components/ui/skeleton'

// Konva needs `window`, so the editor never renders on the server (ADR 0005).
export const LayoutEditorLoader = dynamic(
  () => import('./layout-editor').then((m) => m.LayoutEditor),
  {
    ssr: false,
    loading: () => <Skeleton className='h-[480px] w-full' />
  }
)
