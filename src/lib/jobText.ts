import type { Job } from './api.ts'

// Turns a provider error into something a person can act on. The raw error stays in the card's title.
export function friendlyError(error: string | null) {
  if (!error) return 'Something went wrong while generating this.'
  if (error.includes('flagged')) return 'The safety filter blocked this result. Try a different photo or effect.'
  if (error.includes('No sample clips')) return "Video demo clips aren't set up yet."
  if (error.includes('timed out')) return 'This took too long, so we stopped it.'
  if (error.includes('input image')) return "We couldn't read the photo."
  return 'Something went wrong while generating this.'
}

// Library filter groups. Preset effects are "effects"; a Create image with a reference image is still an image.
export type JobKind = 'image' | 'effect' | 'video'
export function jobKind(job: Job): JobKind {
  if (job.type === 'video') return 'video'
  return job.preset_id ? 'effect' : 'image'
}

export function jobTitle(job: Job, presetName?: string) {
  if (job.preset_id) return presetName ?? 'Effect'
  if (job.prompt) return job.prompt
  return job.type === 'video' ? 'Video' : 'Untitled'
}

const MODEL_NAMES: Record<string, string> = {
  '@cf/black-forest-labs/flux-1-schnell': 'FLUX.1 schnell',
  '@cf/black-forest-labs/flux-2-klein-4b': 'FLUX.2 klein 4B',
  'mock-video': 'Mock video provider (demo)',
}
export const modelName = (model: string) => MODEL_NAMES[model] ?? model

export function generationSeconds(job: Job) {
  if (!job.completed_at) return null
  return Math.max(0, (new Date(job.completed_at).getTime() - new Date(job.created_at).getTime()) / 1000)
}
