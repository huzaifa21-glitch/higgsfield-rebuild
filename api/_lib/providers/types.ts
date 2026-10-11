export type JobType = 'image' | 'effect' | 'video'

export type Aspect = '1:1' | '3:4' | '16:9'

// Output sizes per aspect. Each is at most 4 output tiles of 512x512, so effect cost stays ~110 neurons.
export const ASPECT_SIZES: Record<Aspect, { width: number; height: number }> = {
  '1:1': { width: 1024, height: 1024 },
  '3:4': { width: 768, height: 1024 },
  '16:9': { width: 1024, height: 576 },
}

export function isAspect(value: unknown): value is Aspect {
  return typeof value === 'string' && value in ASPECT_SIZES
}

export type JobParams = {
  aspect?: Aspect
  guidance?: number
  seed?: number
}

export type ProviderJob = {
  id: string
  type: JobType
  prompt: string
  params: JobParams
  inputUrl?: string
}

// Either bytes for the pipeline to upload, or a URL that is already hosted.
// isDemo marks output that wasn't really generated (e.g. the mock video provider).
export type ProviderResult =
  | { buffer: Buffer; contentType: string; isDemo?: boolean }
  | { url: string; isDemo?: boolean }

export interface Provider {
  model: string
  generate(job: ProviderJob): Promise<ProviderResult>
}
