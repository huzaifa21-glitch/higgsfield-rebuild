import { createContext, useContext } from 'react'

// The photo the user uploaded for effects (a 512px JPEG data URL), kept for the whole session
// so several effects can be applied without re-uploading.
export type SessionPhoto = { dataUrl: string; name: string }

export type PhotoState = {
  photo: SessionPhoto | null
  setPhoto: (photo: SessionPhoto | null) => void
}

export const PhotoContext = createContext<PhotoState | null>(null)

export function usePhoto() {
  const state = useContext(PhotoContext)
  if (!state) throw new Error('usePhoto must be used inside <PhotoProvider>')
  return state
}
