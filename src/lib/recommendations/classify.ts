import { SOURCE_PROFILES } from './profiles'
import { SOURCE_KINDS, type SourceKind } from './types'

// Turns free text ("Snare BTM", "breathy female vocal") into a source kind.
// A keyword table, not a model: it runs for free in the preview and the user
// can always correct the result. The longest matching keyword wins, so
// "snare bottom" beats "snare" and "bass di" beats "bass".

export interface Classification {
  kind: SourceKind
  // The keyword that matched, or null when nothing did.
  matched: string | null
}

// Lower-case, punctuation to spaces, single spaces.
export function normaliseText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

interface Entry {
  kind: SourceKind
  keyword: string
}

// Longest first; ties keep SOURCE_KINDS order so the result is stable.
const ENTRIES: Entry[] = SOURCE_KINDS.flatMap((kind) =>
  SOURCE_PROFILES[kind].keywords.map((keyword) => ({
    kind,
    keyword: normaliseText(keyword)
  }))
).sort((a, b) => b.keyword.length - a.keyword.length)

export function classifySource(text: string): Classification {
  const haystack = ` ${normaliseText(text)} `
  for (const { kind, keyword } of ENTRIES) {
    if (haystack.includes(` ${keyword} `)) return { kind, matched: keyword }
  }
  return { kind: 'general', matched: null }
}
