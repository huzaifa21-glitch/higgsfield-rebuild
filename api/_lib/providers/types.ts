export type JobType = 'image' | 'effect' | 'video'

export type JobParams = {
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
