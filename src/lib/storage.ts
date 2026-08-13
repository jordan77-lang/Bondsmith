import { useCallback, useEffect, useState } from 'react'

const PREFIX = 'bondsmith:'

/**
 * localStorage-backed state.
 *
 * Reads lazily on first render and tolerates unavailable storage (private
 * windows, blocked cookies) by degrading to plain in-memory state rather than
 * throwing at mount.
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const storageKey = PREFIX + key

  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return initial
      const parsed = JSON.parse(raw) as T
      // Merge onto the initial shape so a stored object from an older build
      // doesn't leave newly-added fields undefined.
      if (
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        initial &&
        typeof initial === 'object' &&
        !Array.isArray(initial)
      ) {
        return { ...initial, ...parsed }
      }
      return parsed
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value))
    } catch {
      // Quota or blocked storage — keep working without persistence.
    }
  }, [storageKey, value])

  return [value, setValue]
}

/** Track the browser's color-scheme preference so we can default to it. */
export function useSystemDark(): boolean {
  const [dark, setDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  )

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return dark
}

/** Apply a theme to the document root; returns a stable setter. */
export function useTheme(): [
  'light' | 'dark',
  (t: 'light' | 'dark' | 'system') => void,
  'light' | 'dark' | 'system',
] {
  const systemDark = useSystemDark()
  const [pref, setPref] = usePersistentState<'light' | 'dark' | 'system'>(
    'theme',
    'system',
  )
  const resolved: 'light' | 'dark' =
    pref === 'system' ? (systemDark ? 'dark' : 'light') : pref

  useEffect(() => {
    document.documentElement.dataset.theme = resolved
  }, [resolved])

  const set = useCallback(
    (t: 'light' | 'dark' | 'system') => setPref(t),
    [setPref],
  )

  return [resolved, set, pref]
}
