import type { PreviewResult } from '@/lib/recommendations/service'
import type { PhantomMode } from '@/lib/recommendations/types'
import type { WizardLayout, WizardSource } from '@/lib/sessions/wizard-schemas'

export const STEPS = [
  { id: 'details', label: 'Details' },
  { id: 'ensemble', label: 'Ensemble' },
  { id: 'mics', label: 'Mics' },
  { id: 'layout', label: 'Layout' },
  { id: 'recall', label: 'Recall' },
  { id: 'review', label: 'Review' }
] as const
export type StepId = (typeof STEPS)[number]['id']

export interface RoomChoice {
  id: string
  name: string
  studioName: string
  timezone: string
  widthMm: number
  lengthMm: number
}
export interface ConsoleChoice {
  id: string
  name: string
  detail: string
}
export interface LayoutTemplateChoice {
  id: string
  name: string
  widthMm: number
  lengthMm: number
}
export interface SessionTemplateChoice {
  id: string
  name: string
  description: string | null
  presetId: string | null
  sources: WizardSource[]
  layoutId: string | null
  consoleId: string | null
  channelsAvailable: number | null
  phantomMode: string
}

export type PickMode = 'rules' | 'ai' | 'none'

export interface WizardState {
  name: string
  client: string
  roomId: string
  startsAt: string
  endsAt: string
  channels: string
  phantomMode: PhantomMode
  presetId: string | null
  templateId: string | null
  sources: WizardSource[]
  pickMode: PickMode
  overrides: Record<string, string>
  aiResultId: string | null
  layout: WizardLayout
  consoleId: string
  saveTemplate: boolean
  templateName: string
}
export type Patch = (patch: Partial<WizardState>) => void

export interface PreviewCache {
  key: string
  preview: PreviewResult
}

// Used when no room is chosen; matches the server's default room.
export const DEFAULT_ROOM = { widthMm: 6000, lengthMm: 5000 }

let sourceCounter = 0
export function newSourceId(): string {
  sourceCounter += 1
  return `w${sourceCounter}`
}

const pad = (n: number) => String(n).padStart(2, '0')
export function defaultLocal(hoursFromNow: number) {
  const d = new Date(Date.now() + hoursFromNow * 3_600_000)
  d.setMinutes(0, 0, 0)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`
}

export function detailsError(state: WizardState): string | null {
  if (!state.name.trim()) return 'Give the session a name.'
  if (!state.startsAt || !state.endsAt) return 'Choose a start and end time.'
  if (state.endsAt <= state.startsAt) return 'The end must be after the start.'
  return null
}

export function sourcesError(sources: readonly WizardSource[]): string | null {
  if (sources.length === 0) return 'Add at least one source.'
  const seen = new Set<string>()
  for (const source of sources) {
    const label = source.label.replace(/\s+/g, ' ').trim().toLowerCase()
    if (!label) return 'Every source needs a name.'
    if (seen.has(label)) {
      return 'Source names must be different from each other.'
    }
    seen.add(label)
  }
  return null
}
