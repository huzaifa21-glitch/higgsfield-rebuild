import { createContext, useContext } from 'react'
import type { Reference } from '../components/create/ReferenceInput.tsx'

// The photo effects are applied to, kept for the whole session so several effects can be tried
// without re-uploading: a 512px upload, a saved character, or an earlier result.
export type PhotoState = {
  photo: Reference | null
  setPhoto: (photo: Reference | null) => void
}

export const PhotoContext = createContext<PhotoState | null>(null)

export function usePhoto() {
  const state = useContext(PhotoContext)
  if (!state) throw new Error('usePhoto must be used inside <PhotoProvider>')
  return state
}
