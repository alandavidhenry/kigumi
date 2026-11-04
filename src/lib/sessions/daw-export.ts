import { toCsv } from '@/lib/csv'

import type { ChannelRow } from './types'

// DAW track names from the input list (PLAN §4.6). Track names end up in file
// names and project formats, so characters that most DAWs and file systems
// reject are stripped, and duplicates get a numeric suffix.

export const MAX_TRACK_NAME = 48

// Control characters, plus the Windows-reserved set that also breaks several
// DAWs' project formats.
// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[\u0000-\u001f\\/:*?"<>|]/g

export function cleanTrackName(raw: string): string {
  return raw.replace(FORBIDDEN, ' ').replace(/\s+/g, ' ').trim()
}

export interface TrackName {
  number: number
  name: string
}

export function trackNames(
  channels: readonly Pick<ChannelRow, 'number' | 'source' | 'dawName'>[]
): TrackName[] {
  const seen = new Map<string, number>()
  return [...channels]
    .sort((a, b) => a.number - b.number)
    .map((channel) => {
      let base =
        cleanTrackName(channel.dawName?.trim() || channel.source) ||
        `Input ${channel.number}`
      base = base.slice(0, MAX_TRACK_NAME).trim()
      const key = base.toLowerCase()
      const count = (seen.get(key) ?? 0) + 1
      seen.set(key, count)
      return {
        number: channel.number,
        name: count === 1 ? base : `${base} ${count}`.slice(0, MAX_TRACK_NAME)
      }
    })
}

export function dawCsv(
  channels: readonly Pick<ChannelRow, 'number' | 'source' | 'dawName'>[]
): string {
  const names = trackNames(channels)
  return toCsv(
    ['Track', 'Name'],
    names.map((t) => [t.number, t.name])
  )
}

export function dawText(
  channels: readonly Pick<ChannelRow, 'number' | 'source' | 'dawName'>[]
): string {
  return trackNames(channels)
    .map((t) => `${t.number}. ${t.name}`)
    .join('\n')
    .concat('\n')
}
