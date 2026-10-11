import sharp from 'sharp'
import { JobError, toJobError, type JobErrorCode } from './errors.js'
import { getDegraded, setDegraded } from './flags.js'
import { providerFor, type ProviderJob, type ProviderResult } from './providers/index.js'
import { mockImage } from './providers/mock-image.js'
import { OUTPUTS_BUCKET, db } from './supabase.js'

// Columns safe to send to the browser (never session_id: it's the auth credential).
export const PUBLIC_JOB_COLUMNS =
  'id, type, status, preset_id, character_id, prompt, enhanced_prompt, input_url, parent_job_id, model, params, cost, output_url, is_demo, refunded, error, created_at, completed_at'

// Must finish (and refund on failure) before the function's maxDuration (60s in vercel.json) kills it.
const PROVIDER_TIMEOUT_MS = 45_000
// Anything queued/running longer than this was lost (e.g. the function was killed) and gets refunded.
const STUCK_AFTER_MS = 2 * 60 * 1000

// Outputs are stored as WebP: ~5x smaller than the models' JPEGs (650KB -> ~125KB) with no visible loss,
// which is most of the wait between 'done' and the image appearing.
const WEBP_QUALITY = 86

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
}

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new JobError('timeout', `Provider timed out after ${ms / 1000}s`)), ms)),
  ])
}

// Runs the provider, or the demo fallback when Workers AI is out of free capacity.
// Video already uses the mock provider, so only image and effect jobs can fall back.
async function generate(job: ProviderJob): Promise<{ result: ProviderResult; fellBack: boolean }> {
  const canFallBack = job.type !== 'video'
  if (canFallBack && (await getDegraded())) return { result: await mockImage.generate(job), fellBack: true }
  try {
    return { result: await withTimeout(providerFor(job.type).generate(job), PROVIDER_TIMEOUT_MS), fellBack: false }
  } catch (err) {
    const e = toJobError(err)
    if (!canFallBack || (e.code !== 'quota' && e.code !== 'capacity')) throw e
    console.warn(`job ${job.id}: ${e.code} from provider, serving demo output`, e.message)
    await setDegraded(e.code)
    return { result: await mockImage.generate(job), fellBack: true }
  }
}

// Runs after the 202 response (via waitUntil): provider -> upload -> done, or failed + refund.
export async function runJob(job: ProviderJob) {
  try {
    const { error: startError } = await db().from('jobs').update({ status: 'running' }).eq('id', job.id).eq('status', 'queued')
    if (startError) throw startError

    const { result, fellBack } = await generate(job)

    let outputUrl: string
    if ('buffer' in result) {
      const isImage = result.contentType.startsWith('image/')
      const buffer = isImage ? await sharp(result.buffer).webp({ quality: WEBP_QUALITY }).toBuffer() : result.buffer
      const contentType = isImage ? 'image/webp' : result.contentType
      const path = `jobs/${job.id}.${EXTENSIONS[contentType] ?? 'bin'}`
      const { error } = await db().storage.from(OUTPUTS_BUCKET).upload(path, buffer, { contentType, upsert: false })
      if (error) throw error
      outputUrl = db().storage.from(OUTPUTS_BUCKET).getPublicUrl(path).data.publicUrl
    } else {
      outputUrl = result.url
    }

    // Status guard: if the stuck-job sweep already failed and refunded this job, leave it alone.
    // A demo fallback isn't what was paid for, so its cost is refunded too.
    const { data, error } = await db()
      .from('jobs')
      .update({
        status: 'done',
        output_url: outputUrl,
        is_demo: result.isDemo ?? false,
        refunded: fellBack,
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .in('status', ['queued', 'running'])
      .select('session_id, cost')
      .maybeSingle()
    if (error) throw error
    if (fellBack && data?.session_id && data.cost > 0) await refund(job.id, data.session_id, data.cost)
  } catch (err) {
    const e = toJobError(err)
    console.error(`job ${job.id} failed [${e.code}]`, err)
    await failJob(job.id, e.code)
  }
}

async function refund(jobId: string, sessionId: string, amount: number) {
  const { error } = await db().rpc('refund_credits', { p_session_id: sessionId, p_amount: amount })
  if (error) console.error(`refund for job ${jobId} failed`, error)
}

// Marks a job failed with an error code and refunds its cost. The status guard makes this idempotent:
// only the call that actually moves the job out of queued/running issues the refund.
export async function failJob(jobId: string, code: JobErrorCode) {
  const { data, error } = await db()
    .from('jobs')
    .update({ status: 'failed', error: code, refunded: true, completed_at: new Date().toISOString() })
    .eq('id', jobId)
    .in('status', ['queued', 'running'])
    .select('session_id, cost')
    .maybeSingle()
  if (error) {
    console.error(`could not mark job ${jobId} failed`, error)
    return
  }
  if (data?.session_id && data.cost > 0) await refund(jobId, data.session_id, data.cost)
}

// Lazy sweep, run on GET /api/jobs: fail and refund this session's jobs that never finished.
export async function sweepStuckJobs(sessionId: string) {
  const cutoff = new Date(Date.now() - STUCK_AFTER_MS).toISOString()
  const { data, error } = await db()
    .from('jobs')
    .select('id')
    .eq('session_id', sessionId)
    .in('status', ['queued', 'running'])
    .lt('created_at', cutoff)
  if (error) {
    console.error('stuck-job sweep failed', error)
    return
  }
  for (const { id } of data) {
    console.warn(`job ${id} stuck for over ${STUCK_AFTER_MS / 1000}s, failing and refunding`)
    await failJob(id, 'stuck')
  }
}
