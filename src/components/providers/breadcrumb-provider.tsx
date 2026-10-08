'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react'

interface BreadcrumbContextType {
  labels: Record<string, string>
  setLabel: (path: string, label: string) => void
  clearLabel: (path: string) => void
}

const BreadcrumbContext = createContext<BreadcrumbContextType>({
  labels: {},
  setLabel: () => {},
  clearLabel: () => {}
})

// Registry of human-readable labels for dynamic route segments (e.g. a
// company or template name in place of its id), keyed by the cumulative path
// up to and including that segment. Pages populate it via useBreadcrumbLabel.
export function BreadcrumbProvider({
  children
}: {
  readonly children: React.ReactNode
}) {
  const [labels, setLabels] = useState<Record<string, string>>({})

  const setLabel = useCallback((path: string, label: string) => {
    setLabels((prev) =>
      prev[path] === label ? prev : { ...prev, [path]: label }
    )
  }, [])

  const clearLabel = useCallback((path: string) => {
    setLabels((prev) => {
      if (!(path in prev)) return prev
      const next = { ...prev }
      delete next[path]
      return next
    })
  }, [])

  const value = useMemo(
    () => ({ labels, setLabel, clearLabel }),
    [labels, setLabel, clearLabel]
  )

  return (
    <BreadcrumbContext.Provider value={value}>
      {children}
    </BreadcrumbContext.Provider>
  )
}

export function useBreadcrumbLabels() {
  return useContext(BreadcrumbContext)
}

// Registers a human-readable label for the given path for the lifetime of the
// calling page (e.g. a company name once fetched, in place of its raw id).
export function useBreadcrumbLabel(
  path: string | undefined,
  label: string | undefined
) {
  const { setLabel, clearLabel } = useBreadcrumbLabels()

  useEffect(() => {
    if (!path || !label) return
    setLabel(path, label)
    return () => clearLabel(path)
  }, [path, label, setLabel, clearLabel])
}
