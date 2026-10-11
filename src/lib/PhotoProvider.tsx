import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { Reference } from '../components/create/ReferenceInput.tsx'
import { PhotoContext } from './photoContext.ts'

const KEY = 'effects.photo'

function load(): Reference | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as Reference | { dataUrl: string; name: string }
    // Entries saved before references had a kind were always uploads.
    return 'kind' in saved ? saved : { kind: 'upload', dataUrl: saved.dataUrl, name: saved.name }
  } catch {
    return null
  }
}

// sessionStorage keeps the photo across reloads in this tab; React state keeps it across pages.
// A 512px JPEG is ~50-100KB, well inside the storage quota.
export function PhotoProvider({ children }: { children: ReactNode }) {
  const [photo, setPhotoState] = useState<Reference | null>(load)

  const setPhoto = useCallback((next: Reference | null) => {
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
