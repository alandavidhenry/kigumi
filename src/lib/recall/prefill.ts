import { PREFILL_KEYS } from './types'

import type { RecallValues, StripDefinition } from './types'

// Pre-fills a recall sheet from the session's input list (PLAN §4.7). Pure:
// the service passes in plain rows and stores what comes back. A strip number
// is the input number, so input 7 lands on strip 7; inputs beyond the desk's
// channel count are returned as `skipped`, never silently dropped.

export interface PrefillInput {
  id: string
  number: number
  source: string
  micName: string | null
  phantom: boolean
  padDb: number | null
  preampInput: string | null
}

export interface PrefillChannel {
  stripNumber: number
  inputChannelId: string
  label: string
  micName: string | null
  values: RecallValues
  notes: string | null
}

export function prefillChannels(
  strip: StripDefinition,
  channelCount: number,
  inputs: PrefillInput[]
): { channels: PrefillChannel[]; skipped: PrefillInput[] } {
  const controls = new Map(
    strip.sections.flatMap((s) => s.controls).map((c) => [c.key, c])
  )
  const channels: PrefillChannel[] = []
  const skipped: PrefillInput[] = []

  for (const input of [...inputs].sort((a, b) => a.number - b.number)) {
    if (input.number > channelCount) {
      skipped.push(input)
      continue
    }
    const values: RecallValues = {}
    // Only what the input list actually says. Gain, EQ and the rest stay blank
    // for the engineer to record: nothing is guessed.
    if (controls.get(PREFILL_KEYS.phantom)?.type === 'switch') {
      values[PREFILL_KEYS.phantom] = input.phantom
    }
    if (controls.get(PREFILL_KEYS.pad)?.type === 'switch' && input.padDb) {
      values[PREFILL_KEYS.pad] = true
    }
    const source = controls.get(PREFILL_KEYS.input)
    if (
      source?.type === 'select' &&
      !source.multi &&
      source.options?.includes('Mic') &&
      input.micName
    ) {
      values[PREFILL_KEYS.input] = 'Mic'
    }
    channels.push({
      stripNumber: input.number,
      inputChannelId: input.id,
      label: input.source,
      micName: input.micName,
      values,
      // The patching the desk cannot know; carried as text.
      notes: input.preampInput ? `Preamp: ${input.preampInput}` : null
    })
  }
  return { channels, skipped }
}
