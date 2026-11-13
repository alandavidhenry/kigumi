'use client'

import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/use-toast'
import { apiFetch } from '@/lib/client-api'
import {
  FULL_WIDTH_TILES,
  moveTile,
  resolveLayout,
  toSavedLayout,
  type ResolvedLayout,
  type SavedLayout,
  type TileId
} from '@/lib/dashboard/tiles'
import { cn } from '@/lib/utils'

export interface DashboardTile {
  id: TileId
  title: string
  // Rendered on the server so the client bundle stays small.
  node: React.ReactNode
}

interface Props {
  readonly tiles: DashboardTile[]
  readonly initial: SavedLayout | null
}

function errorMessage(caught: unknown) {
  return caught instanceof Error ? caught.message : undefined
}

export function DashboardGrid({ tiles, initial }: Props) {
  const available = tiles.map((tile) => tile.id)
  const byId = new Map(tiles.map((tile) => [tile.id, tile]))
  const [layout, setLayout] = useState<ResolvedLayout>(() =>
    resolveLayout(available, initial)
  )
  const [draft, setDraft] = useState<ResolvedLayout | null>(null)
  const [dragging, setDragging] = useState<TileId | null>(null)
  const [saving, setSaving] = useState(false)
  const editing = draft !== null
  const shown = draft ?? layout

  const move = (from: number, to: number) =>
    setDraft({ ...shown, visible: moveTile(shown.visible, from, to) })
  const hide = (id: TileId) =>
    setDraft({
      visible: shown.visible.filter((other) => other !== id),
      hidden: [...shown.hidden, id]
    })
  const show = (id: TileId) =>
    setDraft({
      visible: [...shown.visible, id],
      hidden: shown.hidden.filter((other) => other !== id)
    })

  const save = async () => {
    if (!draft) return
    setSaving(true)
    try {
      await apiFetch('/api/dashboard/layout', {
        method: 'PUT',
        body: toSavedLayout(draft)
      })
      setLayout(draft)
      setDraft(null)
      toast({ title: 'Dashboard saved' })
    } catch (caught) {
      toast({
        title: 'Could not save the dashboard',
        description: errorMessage(caught)
      })
    } finally {
      setSaving(false)
    }
  }

  const reset = async () => {
    setSaving(true)
    try {
      await apiFetch('/api/dashboard/layout', { method: 'DELETE' })
      setLayout(resolveLayout(available, null))
      setDraft(null)
      toast({ title: 'Dashboard reset to the default' })
    } catch (caught) {
      toast({
        title: 'Could not reset the dashboard',
        description: errorMessage(caught)
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center justify-end gap-2'>
        {editing ? (
          <>
            <p className='mr-auto text-sm text-muted-foreground'>
              Drag tiles, or use the arrows, to reorder. Hide the ones you don’t
              need.
            </p>
            <Button
              type='button'
              variant='surface'
              className='min-h-9'
              disabled={saving}
              onClick={reset}
            >
              Reset to default
            </Button>
            <Button
              type='button'
              variant='surface'
              className='min-h-9'
              disabled={saving}
              onClick={() => setDraft(null)}
            >
              Cancel
            </Button>
            <Button
              type='button'
              className='min-h-9'
              disabled={saving}
              onClick={save}
            >
              Save
            </Button>
          </>
        ) : (
          <Button
            type='button'
            variant='surface'
            className='min-h-9'
            onClick={() => setDraft(layout)}
          >
            Customise dashboard
          </Button>
        )}
      </div>

      <div className='grid gap-4 lg:grid-cols-2'>
        {shown.visible.map((id, index) => {
          const tile = byId.get(id)
          if (!tile) return null
          const span = FULL_WIDTH_TILES.has(id) ? 'lg:col-span-2' : ''
          if (!editing) {
            return (
              <section key={id} aria-label={tile.title} className={span}>
                {tile.node}
              </section>
            )
          }
          return (
            <section
              key={id}
              aria-label={tile.title}
              draggable
              onDragStart={() => setDragging(id)}
              onDragEnd={() => setDragging(null)}
              onDragOver={(event) => {
                event.preventDefault()
                if (dragging && dragging !== id) {
                  move(shown.visible.indexOf(dragging), index)
                }
              }}
              className={cn(
                'rounded-lg border border-dashed border-border-strong p-2',
                span,
                dragging === id && 'opacity-50'
              )}
            >
              <div className='flex items-center gap-1 pb-2'>
                <GripVertical
                  aria-hidden
                  className='size-4 cursor-grab text-muted-foreground'
                />
                <span className='mr-auto text-sm font-medium'>
                  {tile.title}
                </span>
                <Button
                  type='button'
                  variant='surface'
                  size='icon'
                  aria-label={`Move ${tile.title} up`}
                  disabled={index === 0}
                  onClick={() => move(index, index - 1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  type='button'
                  variant='surface'
                  size='icon'
                  aria-label={`Move ${tile.title} down`}
                  disabled={index === shown.visible.length - 1}
                  onClick={() => move(index, index + 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  type='button'
                  variant='surface'
                  size='sm'
                  onClick={() => hide(id)}
                >
                  <EyeOff /> Hide
                </Button>
              </div>
              <div
                inert
                className='pointer-events-none max-h-48 overflow-hidden opacity-60'
              >
                {tile.node}
              </div>
            </section>
          )
        })}
      </div>

      {editing && shown.hidden.length > 0 && (
        <div className='space-y-2 rounded-lg border p-3'>
          <h2 className='text-sm font-medium'>Hidden tiles</h2>
          <ul className='flex flex-wrap gap-2'>
            {shown.hidden.map((id) => (
              <li key={id}>
                <Button
                  type='button'
                  variant='surface'
                  size='sm'
                  onClick={() => show(id)}
                >
                  <Eye /> Show {byId.get(id)?.title}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
