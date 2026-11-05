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

// Kept items whose stored values differ from the payload. Autosave sends the
// whole layout every time, so writing only these keeps a save to the one or
// two items that moved instead of one UPDATE per item (up to 300).
export function changedItems(
  stored: readonly Record<string, unknown>[],
  kept: readonly SaveLayoutItem[]
): SaveLayoutItem[] {
  const storedById = new Map(stored.map((row) => [row.id, row]))
  return kept.filter((item) => {
    const row = storedById.get(item.id)
    if (!row) return true
    return (Object.keys(item) as (keyof SaveLayoutItem)[]).some(
      (key) => key !== 'id' && (row[key] ?? null) !== (item[key] ?? null)
    )
  })
}
