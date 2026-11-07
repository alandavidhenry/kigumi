'use client'

import dynamic from 'next/dynamic'

import { Skeleton } from '@/components/ui/skeleton'

// Konva needs `window`, so the desk never renders on the server (ADR 0005).
const loading = () => <Skeleton className='h-[min(72vh,760px)] w-full' />

export const DeskEditorLoader = dynamic(
  () => import('./desk-editor').then((m) => m.DeskEditor),
  { ssr: false, loading }
)

export const RecallDeskLoader = dynamic(
  () => import('./recall-desk').then((m) => m.RecallDesk),
  { ssr: false, loading }
)
