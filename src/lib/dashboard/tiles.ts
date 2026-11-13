import { z } from 'zod'

// Dashboard tiles and how one person's arrangement is resolved (ADR 0025).
// Pure: the page decides which tiles a role and plan can see, this module
// orders them and applies hidden ones.

export const TILE_IDS = [
  'getting-started',
  'wizards',
  'reminders',
  'sessions',
  'maintenance',
  'pat',
  'warranties',
  'activity',
  'usage'
] as const
export type TileId = (typeof TILE_IDS)[number]

export const TILE_TITLES: Record<TileId, string> = {
  'getting-started': 'Getting started',
  wizards: 'Guided wizards',
  reminders: 'Unread reminders',
  sessions: 'Upcoming sessions',
  maintenance: 'Maintenance',
  pat: 'PAT testing',
  warranties: 'Expiring warranties',
  activity: 'Recent activity',
  usage: 'Studio and plan usage'
}

// Tiles that fill the whole row; the rest sit two to a row on wide screens.
export const FULL_WIDTH_TILES: ReadonlySet<TileId> = new Set([
  'getting-started',
  'wizards',
  'reminders',
  'activity',
  'usage'
])

export const savedLayoutSchema = z.object({
  order: z.array(z.enum(TILE_IDS)).max(TILE_IDS.length),
  hidden: z.array(z.enum(TILE_IDS)).max(TILE_IDS.length)
})
export type SavedLayout = z.infer<typeof savedLayoutSchema>

export interface ResolvedLayout {
  // Visible tiles in display order.
  visible: TileId[]
  // Tiles the person has hidden, still available to show again.
  hidden: TileId[]
}

// `available` is in default order. Saved ids that are no longer available are
// dropped; available ids the person has not placed yet keep their default slot
// relative to the tile before them, so a new tile appears rather than vanishing.
export function resolveLayout(
  available: readonly TileId[],
  saved: SavedLayout | null
): ResolvedLayout {
  if (!saved) return { visible: [...available], hidden: [] }
  const isAvailable = new Set<TileId>(available)
  const hidden = unique(saved.hidden).filter((id) => isAvailable.has(id))
  const hiddenSet = new Set(hidden)
  const ordered = unique(saved.order).filter((id) => isAvailable.has(id))
  const placed = new Set<TileId>([...ordered, ...hidden])

  for (const id of available) {
    if (placed.has(id)) continue
    const before = available.slice(0, available.indexOf(id)).reverse()
    const anchor = before.find((other) => ordered.includes(other))
    const at = anchor ? ordered.indexOf(anchor) + 1 : 0
    ordered.splice(at, 0, id)
    placed.add(id)
  }
  return { visible: ordered.filter((id) => !hiddenSet.has(id)), hidden }
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

export function toSavedLayout(layout: ResolvedLayout): SavedLayout {
  return {
    order: [...layout.visible, ...layout.hidden],
    hidden: [...layout.hidden]
  }
}

export function moveTile<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return [...list]
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item)
  return next
}
