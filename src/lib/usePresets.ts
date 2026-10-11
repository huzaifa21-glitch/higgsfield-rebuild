import { useCallback, useEffect, useState } from 'react'
import { fetchPresets, type Preset } from './api.ts'

// Effect presets, fetched once per page load and shared by every caller.
// reload() retries after a failure (fetchPresets drops a failed request from its cache).
export function usePresets() {
  const [presets, setPresets] = useState<Preset[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchPresets()
      .then((p) => {
        if (cancelled) return
        setPresets(p)
        setError(null)
      })
      .catch(() => !cancelled && setError("We couldn't load the effects. Check your connection and try again."))
    return () => {
      cancelled = true
    }
  }, [attempt])

  const reload = useCallback(() => {
    setError(null)
    setAttempt((a) => a + 1)
  }, [])

  return { presets, error, reload }
}
