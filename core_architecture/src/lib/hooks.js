import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/** Run an async loader; re-runs when deps change. */
export function useAsync(loader, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null })
  const seq = useRef(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps)

  const reload = useCallback(async () => {
    const id = ++seq.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await run()
      if (id === seq.current) setState({ data, loading: false, error: null })
    } catch (error) {
      if (id === seq.current) setState({ data: null, loading: false, error })
    }
  }, [run])

  useEffect(() => {
    reload()
  }, [reload])

  return { ...state, reload }
}

/** Normalise list responses: accepts [] or { items: [] } / { data: [] }. */
export const asList = (x) => (Array.isArray(x) ? x : x?.items || x?.data || x?.results || [])

/** Build an id → row map for lookups. */
export function useIndex(rows, key) {
  return useMemo(() => {
    const m = new Map()
    asList(rows).forEach((r) => m.set(String(r[key]), r))
    return m
  }, [rows, key])
}

/** Simple case-insensitive text filter across selected fields. */
export function matches(row, q, fields) {
  if (!q) return true
  const needle = q.trim().toLowerCase()
  return fields.some((f) => String(typeof f === 'function' ? f(row) : row[f] ?? '').toLowerCase().includes(needle))
}
