'use client'

import { useCallback, useRef, useState } from 'react'

const LIMIT = 100
const COALESCE_MS = 800

interface History<T> {
  past: T[]
  present: T
  future: T[]
}

// Undo/redo over an immutable value. Edits sharing a key within a short
// window (typing in one field, nudging with the arrow keys) are one step.
export function useHistory<T>(initial: T) {
  const [history, setHistory] = useState<History<T>>({
    past: [],
    present: initial,
    future: []
  })
  const last = useRef<{ key: string; at: number } | null>(null)

  const set = useCallback((update: (current: T) => T, key?: string) => {
    const now = Date.now()
    const coalesce =
      key !== undefined &&
      last.current?.key === key &&
      now - last.current.at < COALESCE_MS
    last.current = key === undefined ? null : { key, at: now }
    setHistory((h) => {
      const next = update(h.present)
      if (next === h.present) return h
      return {
        past: coalesce ? h.past : [...h.past, h.present].slice(-LIMIT),
        present: next,
        future: []
      }
    })
  }, [])

  const undo = useCallback(() => {
    last.current = null
    setHistory((h) =>
      h.past.length === 0
        ? h
        : {
            past: h.past.slice(0, -1),
            present: h.past[h.past.length - 1],
            future: [h.present, ...h.future]
          }
    )
  }, [])

  const redo = useCallback(() => {
    last.current = null
    setHistory((h) =>
      h.future.length === 0
        ? h
        : {
            past: [...h.past, h.present],
            present: h.future[0],
            future: h.future.slice(1)
          }
    )
  }, [])

  const reset = useCallback((value: T) => {
    last.current = null
    setHistory({ past: [], present: value, future: [] })
  }, [])

  return {
    state: history.present,
    set,
    undo,
    redo,
    reset,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0
  }
}
