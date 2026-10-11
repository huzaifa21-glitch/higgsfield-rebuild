import { cloudflareEdit } from './cloudflare-edit.js'
import { cloudflareImage } from './cloudflare-image.js'
import { mockVideo } from './mock-video.js'
import type { JobType, Provider } from './types.js'

export type { JobParams, JobType, Provider, ProviderJob, ProviderResult } from './types.js'

export const COSTS: Record<JobType, number> = { image: 1, effect: 2, video: 5 }

// IMAGE_PROVIDER covers text->image and effects (image edit); VIDEO_PROVIDER covers image->video.
const imageProviders: Record<string, { image: Provider; effect: Provider }> = {
  cloudflare: { image: cloudflareImage, effect: cloudflareEdit },
}
const videoProviders: Record<string, Provider> = {
  mock: mockVideo,
}

export function providerFor(type: JobType): Provider {
  if (type === 'video') {
    const name = process.env.VIDEO_PROVIDER ?? 'mock'
    const provider = videoProviders[name]
    if (!provider) throw new Error(`Unknown VIDEO_PROVIDER "${name}"`)
    return provider
  }
  const name = process.env.IMAGE_PROVIDER ?? 'cloudflare'
  const providers = imageProviders[name]
  if (!providers) throw new Error(`Unknown IMAGE_PROVIDER "${name}"`)
  return providers[type]
}
