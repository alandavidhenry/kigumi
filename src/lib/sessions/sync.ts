import { reconcileInputList } from './input-list'
import { loadUnitInfos, toChannelRow } from './queries'
import { channelSelect } from './queries'

import type { ReconcileOps } from './input-list'
import type { Db } from './queries'

// Runs the input-list reconcile for a session inside the caller's transaction
// (ADR 0016 decision 3). Every layout write, template apply and recommendation
// apply ends with this, so the list cannot drift from the layout.
export async function syncInputList(
  tx: Db,
  organisationId: string,
  sessionId: string,
  layoutId: string
): Promise<ReconcileOps> {
  const items = await tx.layoutItem.findMany({
    where: { layoutId, type: { in: ['mic', 'di'] } },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    select: { id: true, type: true, label: true, micUnitId: true }
  })
  const channels = (
    await tx.inputChannel.findMany({
      where: { sessionId },
      orderBy: { number: 'asc' },
      select: channelSelect
    })
  ).map(toChannelRow)
  const units = await loadUnitInfos(tx, [
    ...items.map((i) => i.micUnitId),
    ...channels.map((c) => c.micUnitId)
  ])

  const ops = reconcileInputList(items, channels, units)

  if (ops.remove.length > 0) {
    await tx.inputChannel.deleteMany({
      where: { sessionId, id: { in: ops.remove } }
    })
  }
  for (const update of ops.update) {
    const { id, ...data } = update
    await tx.inputChannel.updateMany({ where: { id, sessionId }, data })
  }
  if (ops.create.length > 0) {
    await tx.inputChannel.createMany({
      data: ops.create.map((c) => ({ ...c, organisationId, sessionId }))
    })
  }
  return ops
}
