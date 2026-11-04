import type { SaveLayoutItem } from './schemas'

// Compares the stored items with a save payload (ADR 0016 decision 6). The
// editor gives new items client-side ids, so "added" is any id the database
// does not hold. Pure moves, rotations and resizes are not structural and are
// not audited; autosave would flood the log.

export interface StoredItemRef {
  id: string
  micUnitId: string | null
  type: string
}

export interface ItemDiff {
  added: SaveLayoutItem[]
  removed: StoredItemRef[]
  kept: SaveLayoutItem[]
  // Items whose linked mic unit changed.
  unitChanged: SaveLayoutItem[]
  structural: boolean
}

export function diffItems(
  stored: readonly StoredItemRef[],
  incoming: readonly SaveLayoutItem[]
): ItemDiff {
  const storedById = new Map(stored.map((s) => [s.id, s]))
  const incomingIds = new Set(incoming.map((i) => i.id))

  const added = incoming.filter((i) => !storedById.has(i.id))
  const kept = incoming.filter((i) => storedById.has(i.id))
  const removed = stored.filter((s) => !incomingIds.has(s.id))
  const unitChanged = kept.filter(
    (i) => (storedById.get(i.id)?.micUnitId ?? null) !== i.micUnitId
  )
  return {
    added,
    removed,
    kept,
    unitChanged,
    structural: added.length > 0 || removed.length > 0 || unitChanged.length > 0
  }
}
