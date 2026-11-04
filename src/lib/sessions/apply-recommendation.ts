import { ITEM_TYPE_DEFAULTS } from '@/lib/layout/types'
import type { LayoutItemDoc } from '@/lib/layout/types'
import type { FinalSource, FinalUnit } from '@/lib/recommendations/finalise'
import type { FinalView } from '@/lib/recommendations/finalise'
import type { MicRole } from '@/lib/recommendations/types'

// Applying a stored recommendation to a session (PLAN §4.4, ADR 0016). This is
// the pure planner; the service writes the plan and reconciles the input list.
//
// Rules that keep it honest:
//  - A unit goes on an existing mic item when one matches, keeping its place.
//  - Otherwise a new item is created in a staging row along the front-of-room
//    bottom edge for the user to drag into position. Nothing the model said is
//    turned into coordinates; the AI's placement text goes into channel notes.
//  - Re-applying the same result changes nothing: items are found again by
//    their recommendationRef.

const ROLE_SUFFIX: Readonly<Record<MicRole, string>> = {
  single: '',
  left: 'L',
  right: 'R',
  mid: 'M',
  side: 'S',
  centre: 'C'
}

const STAGING_STEP_MM = 400
const STAGING_MARGIN_MM = 300

export function refFor(
  resultId: string,
  sourceId: string,
  unitIndex: number
): string {
  return `${resultId}:${sourceId}:${unitIndex}`
}

export function itemLabel(source: FinalSource, unit: FinalUnit): string {
  const suffix = ROLE_SUFFIX[unit.role]
  return suffix ? `${source.label} ${suffix}` : source.label
}

export interface ItemUpdate {
  id: string
  label: string
  micUnitId: string
  patternSetting: LayoutItemDoc['patternSetting']
  groupId: string | null
  recommendationRef: string
}

export interface ItemCreate {
  label: string
  micUnitId: string
  patternSetting: LayoutItemDoc['patternSetting']
  groupId: string | null
  recommendationRef: string
  xMm: number
  yMm: number
  zMm: number
  widthMm: number
  depthMm: number
  heightMm: number | null
}

export interface ApplyPlan {
  update: ItemUpdate[]
  create: ItemCreate[]
  // Channel notes keyed by the item's recommendationRef.
  notes: Record<string, string>
  lineChannels: string[]
  skipped: Array<{
    sourceId: string
    label: string
    reason: 'no_pick' | 'unit_in_use' | 'unit_removed'
  }>
}

export interface ApplyInput {
  resultId: string
  view: FinalView
  items: readonly LayoutItemDoc[]
  room: { widthMm: number; lengthMm: number }
}

function placementNote(source: FinalSource): string | null {
  const p = source.primary?.placement
  if (!p) return null
  const bits = [p.position]
  if (p.distanceMm !== null) bits.push(`${p.distanceMm} mm away`)
  if (p.angleDeg !== null) bits.push(`${p.angleDeg}° off axis`)
  if (p.spacingMm !== null) bits.push(`${p.spacingMm} mm spacing`)
  if (p.includedAngleDeg !== null) bits.push(`${p.includedAngleDeg}° included`)
  return `AI placement: ${bits.join(', ')}`
}

export function planApply(input: ApplyInput): ApplyPlan {
  const plan: ApplyPlan = {
    update: [],
    create: [],
    notes: {},
    lineChannels: [],
    skipped: []
  }
  const claimed = new Set<string>() // item ids already matched in this apply
  const unitsUsed = new Set<string>()
  let staged = 0
  const perRow = Math.max(
    1,
    Math.floor((input.room.widthMm - STAGING_MARGIN_MM * 2) / STAGING_STEP_MM) +
      1
  )

  const stagingSpot = () => {
    const col = staged % perRow
    const row = Math.floor(staged / perRow)
    staged++
    return {
      x: Math.min(
        input.room.widthMm,
        STAGING_MARGIN_MM + col * STAGING_STEP_MM
      ),
      y: Math.max(
        0,
        input.room.lengthMm - STAGING_MARGIN_MM - row * STAGING_STEP_MM
      )
    }
  }

  const mics = input.items.filter((i) => i.type === 'mic')

  for (const source of input.view.sources) {
    const pick = source.primary
    if (!pick) {
      if (source.line) plan.lineChannels.push(source.label)
      else
        plan.skipped.push({
          sourceId: source.sourceId,
          label: source.label,
          reason: 'no_pick'
        })
      continue
    }
    if (pick.units.some((u) => unitsUsed.has(u.unitId))) {
      plan.skipped.push({
        sourceId: source.sourceId,
        label: source.label,
        reason: 'unit_in_use'
      })
      continue
    }
    const groupId =
      pick.units.length > 1 ? `${input.resultId}:${source.sourceId}` : null
    const note = placementNote(source)

    pick.units.forEach((unit, index) => {
      unitsUsed.add(unit.unitId)
      const ref = refFor(input.resultId, source.sourceId, index)
      const label = itemLabel(source, unit)
      const match =
        mics.find((i) => !claimed.has(i.id) && i.recommendationRef === ref) ??
        mics.find(
          (i) =>
            !claimed.has(i.id) &&
            !i.recommendationRef &&
            (i.label ?? '').trim().toLowerCase() === label.toLowerCase()
        )
      if (note) plan.notes[ref] = note

      if (match) {
        claimed.add(match.id)
        plan.update.push({
          id: match.id,
          label,
          micUnitId: unit.unitId,
          patternSetting: unit.patternSetting,
          groupId,
          recommendationRef: ref
        })
        return
      }
      const spot = stagingSpot()
      const defaults = ITEM_TYPE_DEFAULTS.mic
      plan.create.push({
        label,
        micUnitId: unit.unitId,
        patternSetting: unit.patternSetting,
        groupId,
        recommendationRef: ref,
        xMm: spot.x,
        yMm: spot.y,
        zMm: defaults.zMm,
        widthMm: defaults.widthMm,
        depthMm: defaults.depthMm,
        heightMm: defaults.heightMm
      })
    })
  }
  return plan
}
