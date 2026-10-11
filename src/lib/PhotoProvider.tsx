import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { PhotoContext, type SessionPhoto } from './photoContext.ts'

const KEY = 'effects.photo'

function load(): SessionPhoto | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as SessionPhoto) : null
  } catch {
    return null
  }
}

// sessionStorage keeps the photo across reloads in this tab; React state keeps it across pages.
// A 512px JPEG is ~50-100KB, well inside the storage quota.
export function PhotoProvider({ children }: { children: ReactNode }) {
  const [photo, setPhotoState] = useState<SessionPhoto | null>(load)

  const setPhoto = useCallback((next: SessionPhoto | null) => {
    setPhotoState(next)
    try {
      if (next) sessionStorage.setItem(KEY, JSON.stringify(next))
      else sessionStorage.removeItem(KEY)
    } catch {
      // Storage unavailable (private mode, quota): the photo still lasts until the tab reloads.
    }
  }, [])

  const value = useMemo(() => ({ photo, setPhoto }), [photo, setPhoto])
  return <PhotoContext.Provider value={value}>{children}</PhotoContext.Provider>
}
