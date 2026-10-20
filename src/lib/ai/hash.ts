import { createHash } from 'node:crypto'

// Deterministic JSON: object keys sorted recursively, so the same facts always
// hash the same regardless of how the object was built.
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, sortKeys(v)])
    )
  }
  return value
}

export function hashInput(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}
