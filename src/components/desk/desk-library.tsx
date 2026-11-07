'use client'

import { Button } from '@/components/ui/button'
import { DESK_KIND_LABELS, LIBRARY_KINDS } from '@/lib/recall/desk-types'
import type { DeskArea, LibraryKind } from '@/lib/recall/desk-types'
import { cn } from '@/lib/utils'

// Small line drawings of each component, in currentColor.
function KindIcon({ kind }: { readonly kind: LibraryKind }) {
  const common = {
    width: 28,
    height: 28,
    viewBox: '0 0 28 28',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    'aria-hidden': true
  } as const
  switch (kind) {
    case 'knob':
      return (
        <svg {...common}>
          <circle cx='14' cy='14' r='8' />
          <path d='M14 14 L18.5 9.5' strokeLinecap='round' />
        </svg>
      )
    case 'fader':
      return (
        <svg {...common}>
          <path d='M14 3 V25' strokeLinecap='round' />
          <rect
            x='8.5'
            y='12'
            width='11'
            height='6'
            rx='1.5'
            fill='currentColor'
          />
        </svg>
      )
    case 'switch':
      return (
        <svg {...common}>
          <rect x='7' y='9' width='14' height='10' rx='2' />
          <rect x='10' y='12' width='8' height='4' rx='1' fill='currentColor' />
        </svg>
      )
    case 'selector':
      return (
        <svg {...common}>
          <rect
            x='3'
            y='10'
            width='6.5'
            height='8'
            rx='1.5'
            fill='currentColor'
          />
          <rect x='10.75' y='10' width='6.5' height='8' rx='1.5' />
          <rect x='18.5' y='10' width='6.5' height='8' rx='1.5' />
        </svg>
      )
    case 'label':
      return (
        <svg {...common}>
          <path d='M7 8 H21 M14 8 V21' strokeLinecap='round' />
        </svg>
      )
    case 'panel':
      return (
        <svg {...common}>
          <rect x='5' y='4' width='18' height='20' rx='2.5' />
          <path d='M8 8 H15' strokeLinecap='round' />
        </svg>
      )
  }
}

// The component library. Drag a component onto the desk, or click it to add
// it to the chosen area at the first free spot (touch and keyboard).
export function DeskLibrary({
  target,
  onTarget,
  onAdd,
  hasMaster
}: {
  readonly target: DeskArea
  readonly onTarget: (area: DeskArea) => void
  readonly onAdd: (kind: LibraryKind) => void
  readonly hasMaster: boolean
}) {
  return (
    <div className='space-y-3'>
      <div>
        <p className='mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground'>
          Add to
        </p>
        <div
          className='grid grid-cols-2 gap-1 rounded-md border p-0.5'
          role='group'
          aria-label='Area to add components to'
        >
          {(['strip', 'master'] as const).map((area) => (
            <button
              key={area}
              type='button'
              aria-pressed={target === area}
              disabled={area === 'master' && !hasMaster}
              onClick={() => onTarget(area)}
              className={cn(
                'rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50',
                target === area
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent'
              )}
            >
              {area === 'strip' ? 'Channel strip' : 'Master'}
            </button>
          ))}
        </div>
      </div>
      <ul className='grid grid-cols-3 gap-1.5 lg:grid-cols-2'>
        {LIBRARY_KINDS.map((kind) => (
          <li key={kind}>
            <Button
              type='button'
              variant='surface'
              className='h-auto w-full cursor-grab flex-col gap-1 px-1 py-2 text-xs active:cursor-grabbing'
              draggable
              aria-label={`Add a ${DESK_KIND_LABELS[kind].toLowerCase()}`}
              onDragStart={(event) => {
                event.dataTransfer.setData('application/x-kigumi-desk', kind)
                event.dataTransfer.effectAllowed = 'copy'
              }}
              onClick={() => onAdd(kind)}
            >
              <KindIcon kind={kind} />
              {DESK_KIND_LABELS[kind]}
            </Button>
          </li>
        ))}
      </ul>
      <p className='text-xs text-muted-foreground'>
        Drag onto the desk, or click to add. Anything over the channel strips
        designs the one strip that every channel repeats.
      </p>
    </div>
  )
}
