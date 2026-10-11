import { useEffect, useState } from 'react'
import { fetchPresets, type Preset } from './api.ts'

// Effect presets, fetched once per page load and shared by every caller.
export function usePresets() {
  const [presets, setPresets] = useState<Preset[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchPresets()
      .then((p) => !cancelled && setPresets(p))
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
    return () => {
      cancelled = true
    }
  }, [])

  return { presets, error }
}
