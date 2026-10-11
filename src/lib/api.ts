export type JobType = 'image' | 'effect' | 'video'
export type JobStatus = 'queued' | 'running' | 'done' | 'failed'

export type Job = {
  id: string
  type: JobType
  status: JobStatus
  prompt: string
  enhanced_prompt: string | null
  input_url: string | null
  parent_job_id: string | null
  model: string
  params: { guidance?: number; seed?: number }
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
  assist?: boolean
  params?: { guidance?: number; seed?: number }
  input_image?: string
  parent_job_id?: string
}

export type CreateJobResult =
  | { ok: true; job: Job; credits: number }
  | { ok: false; status: number; error: string; credits?: number; cost?: number }

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

// Downscales a picked file so the upload stays well under Vercel's 4.5MB body limit.
export async function fileToDataUrl(file: File, maxSide = 1024) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.9)
}
