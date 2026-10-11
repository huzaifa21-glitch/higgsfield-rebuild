export type JobType = 'image' | 'effect' | 'video'
export type JobStatus = 'queued' | 'running' | 'done' | 'failed'
export type Aspect = '1:1' | '3:4' | '16:9'

export const ASPECTS: Aspect[] = ['1:1', '3:4', '16:9']

export type JobParams = { aspect?: Aspect; guidance?: number; seed?: number }

export type Job = {
  id: string
  type: JobType
  status: JobStatus
  preset_id: string | null
  prompt: string
  enhanced_prompt: string | null
  input_url: string | null
  parent_job_id: string | null
  model: string
  params: JobParams
  cost: number
  output_url: string | null
  is_demo: boolean
  error: string | null
  created_at: string
  completed_at: string | null
}

export type SessionInfo = {
  credits: number
  realtimeKey: string
  costs: Record<JobType, number>
}

export type NewJob = {
  type: JobType
  prompt: string
  // The Prompt Assist rewrite the user chose with "Use"; prompt stays what they typed.
  enhanced_prompt?: string
  params?: JobParams
  input_image?: string
  parent_job_id?: string
  // Effect preset: the server supplies its prompt, settings and cost.
  preset_id?: string
}

export type CreateJobResult =
  | { ok: true; job: Job; credits: number }
  | { ok: false; status: number; error: string; credits?: number; cost?: number }

export type AssistResult = {
  prompt: string
  changed: boolean
  reason?: 'unchanged' | 'invented' | 'error'
  // What the camera-language rules changed, e.g. '"drone shot" → "aerial view from above"'.
  notes?: string[]
}

export type Preset = {
  id: string
  name: string
  description: string | null
  cost: number
  featured: boolean
  after_url: string | null
  before_url: string | null
}

let presetsPromise: Promise<Preset[]> | undefined
export function fetchPresets() {
  presetsPromise ??= fetch('/api/presets').then(async (res) => {
    if (!res.ok) {
      presetsPromise = undefined
      throw new Error(`GET /api/presets failed: HTTP ${res.status}`)
    }
    return ((await res.json()) as { presets: Preset[] }).presets
  })
  return presetsPromise
}

// One request for the whole page load: parallel first requests would each create a session.
let sessionPromise: Promise<SessionInfo> | undefined
export function fetchSession() {
  sessionPromise ??= fetch('/api/session').then(async (res) => {
    if (!res.ok) throw new Error(`GET /api/session failed: HTTP ${res.status}`)
    return (await res.json()) as SessionInfo
  })
  return sessionPromise
}

export async function fetchJobs() {
  const res = await fetch('/api/jobs')
  if (!res.ok) throw new Error(`GET /api/jobs failed: HTTP ${res.status}`)
  return ((await res.json()) as { jobs: Job[] }).jobs
}

export async function postJob(input: NewJob): Promise<CreateJobResult> {
  const res = await fetch('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
  if (res.status === 202) return { ok: true, job: body.job, credits: body.credits }
  return { ok: false, status: res.status, error: body.error ?? `HTTP ${res.status}`, credits: body.credits, cost: body.cost }
}

export async function requestAssist(prompt: string, mode: 'image' | 'video' = 'image'): Promise<AssistResult> {
  const res = await fetch('/api/assist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, mode }),
  })
  if (!res.ok) return { prompt, changed: false, reason: 'error' }
  return (await res.json()) as AssistResult
}

// Resizes a picked image in the browser (longest side <= maxSide), applying EXIF rotation.
// 512 matches what the edit model accepts, and keeps uploads far below Vercel's 4.5MB body limit.
export async function fileToDataUrl(file: File, maxSide = 512) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.9)
}

// Supabase public URLs accept ?download=<name> to send Content-Disposition: attachment,
// which works cross-origin where <a download> doesn't.
export function downloadUrl(job: Job) {
  if (!job.output_url) return undefined
  const ext = job.output_url.split('?')[0].split('.').pop() ?? 'bin'
  const url = new URL(job.output_url)
  url.searchParams.set('download', `${job.type}-${job.id.slice(0, 8)}.${ext}`)
  return url.toString()
}
