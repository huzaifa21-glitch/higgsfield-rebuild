import type { Reference } from '../components/create/ReferenceInput.tsx'
import { fileToDataUrl, type Aspect } from './api.ts'

// Settings handed to /create through router state (Remix, Use as reference).
export type CreatePrefill = {
  mode: 'image' | 'video'
  prompt: string
  enhanced_prompt?: string | null
  aspect?: Aspect
  reference?: Reference | null
}

// Re-reads a stored image (public bucket, CORS-enabled) as a 512px data URL, the same shape as a fresh upload.
export async function urlToDataUrl(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Couldn't load the original photo (HTTP ${res.status})`)
  const blob = await res.blob()
  return fileToDataUrl(new File([blob], 'original', { type: blob.type || 'image/jpeg' }), 512)
}
