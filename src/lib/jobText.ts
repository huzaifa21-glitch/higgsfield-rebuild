import type { CreateJobResult, Job } from './api.ts'

// Human message for every job error code the server stores (api/_lib/errors.ts).
// Raw provider errors never reach the browser; older rows with free-text errors fall through
// the pattern checks at the end and still get a friendly message.
const JOB_ERRORS: Record<string, string> = {
  safety_filter: 'The safety filter blocked this result. Try a different photo, prompt or effect.',
  quota: "Today's free AI capacity is used up. Try again after it resets.",
  capacity: 'The AI service is busy right now. Try again in a few minutes.',
  timeout: 'This took too long, so we stopped it.',
  stuck: 'This got stuck, so we stopped it.',
  invalid_input: "We couldn't use that image or prompt. Try a different one.",
  no_samples: "Video demo clips aren't set up yet.",
  provider_error: 'Something went wrong while generating this.',
}

export function friendlyError(error: string | null) {
  if (error && JOB_ERRORS[error]) return JOB_ERRORS[error]
  if (error?.includes('flagged')) return JOB_ERRORS.safety_filter
  if (error?.includes('No sample clips')) return JOB_ERRORS.no_samples
  if (error?.includes('timed out')) return JOB_ERRORS.timeout
  if (error?.includes('input image')) return JOB_ERRORS.invalid_input
  return JOB_ERRORS.provider_error
}

const credits = (n: number) => `${n} ${n === 1 ? 'credit' : 'credits'}`

// Message for a job that couldn't be created (the POST itself failed).
export function describeCreateError(result: Extract<CreateJobResult, { ok: false }>) {
  if (result.status === 402) return `That needs ${credits(result.cost ?? 0)} and you have ${result.credits ?? 0}.`
  if (result.status === 429) return result.message ?? "You're going a bit fast. Give it a few seconds and try again."
  // 400 messages are written for people (e.g. "Images must be JPEG, PNG or WebP.").
  if (result.status === 400 || result.status === 409) return result.error
  if (result.status === 0) return "Couldn't reach the server. Check your connection and try again."
  return "Something went wrong starting that. Your credits weren't spent."
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
  'mock-image': 'Demo image (AI capacity reached)',
}
export const modelName = (model: string) => MODEL_NAMES[model] ?? model

export function generationSeconds(job: Job) {
  if (!job.completed_at) return null
  return Math.max(0, (new Date(job.completed_at).getTime() - new Date(job.created_at).getTime()) / 1000)
}
