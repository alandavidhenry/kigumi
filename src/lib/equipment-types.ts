// Equipment vocabulary shared by validation, CSV, forms and reports. Stored as
// plain strings in Postgres; this module is the source of truth.

export const EQUIPMENT_CATEGORIES = [
  'microphone',
  'preamp',
  'interface',
  'console',
  'outboard',
  'monitor',
  'headphones',
  'instrument',
  'amp',
  'stand',
  'cable',
  'di_box',
  'accessory'
] as const

export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number]

export const EQUIPMENT_CATEGORY_LABELS: Readonly<
  Record<EquipmentCategory, string>
> = {
  microphone: 'Microphones',
  preamp: 'Preamps',
  interface: 'Interfaces',
  console: 'Consoles',
  outboard: 'Outboard',
  monitor: 'Monitors',
  headphones: 'Headphones',
  instrument: 'Instruments',
  amp: 'Amps',
  stand: 'Stands',
  cable: 'Cables',
  di_box: 'DI boxes',
  accessory: 'Accessories'
}

export const EQUIPMENT_STATUSES = [
  'in_service',
  'repair',
  'retired',
  'on_loan'
] as const

export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number]

export const EQUIPMENT_STATUS_LABELS: Readonly<
  Record<EquipmentStatus, string>
> = {
  in_service: 'In service',
  repair: 'In repair',
  retired: 'Retired',
  on_loan: 'On loan'
}

export function isEquipmentCategory(
  value: unknown
): value is EquipmentCategory {
  return EQUIPMENT_CATEGORIES.includes(value as EquipmentCategory)
}

export function isEquipmentStatus(value: unknown): value is EquipmentStatus {
  return EQUIPMENT_STATUSES.includes(value as EquipmentStatus)
}

// Categories normally tracked as a quantity rather than one row per item.
export const QUANTITY_CATEGORIES: readonly EquipmentCategory[] = [
  'cable',
  'stand',
  'accessory'
]

export const ATTACHMENT_KINDS = [
  'photo',
  'receipt',
  'invoice',
  'manual',
  'other'
] as const

export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number]

// Photos only for Phase 1; documents arrive with Phase 7.
export const PHOTO_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp'
] as const
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024
export const MAX_PHOTOS_PER_ITEM = 8
