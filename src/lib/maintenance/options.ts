import { describeItem, listEquipment } from '@/lib/equipment'
import type { TenantContext } from '@/lib/tenant-context'

export interface ItemOption {
  id: string
  name: string
}

// Items a maintenance, PAT or warranty record can be attached to. Retired
// items are left out; they have no schedule to keep.
export async function listItemOptions(
  ctx: TenantContext
): Promise<ItemOption[]> {
  const items = await listEquipment(ctx, {})
  return items
    .filter((item) => item.status !== 'retired')
    .map((item) => ({
      id: item.id,
      name: item.serial
        ? `${describeItem(item)} (${item.serial})`
        : describeItem(item)
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
