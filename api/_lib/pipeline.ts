import { providerFor, type ProviderJob } from './providers/index.js'
import { OUTPUTS_BUCKET, db } from './supabase.js'

// Columns safe to send to the browser (never session_id: it's the auth credential).
export const PUBLIC_JOB_COLUMNS =
  'id, type, status, prompt, enhanced_prompt, input_url, parent_job_id, model, params, cost, output_url, is_demo, error, created_at, completed_at'

// Must finish (and refund on failure) before the function's maxDuration (60s in vercel.json) kills it,
// otherwise the job would be stuck "running" with the credits spent.
const PROVIDER_TIMEOUT_MS = 45_000

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
}

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Provider timed out after ${ms / 1000}s`)), ms)),
  ])
}

// Runs after the 202 response (via waitUntil): provider -> upload -> done, or failed + refund.
export async function runJob(job: ProviderJob) {
  try {
    const { error: startError } = await db().from('jobs').update({ status: 'running' }).eq('id', job.id).eq('status', 'queued')
    if (startError) throw startError

    const result = await withTimeout(providerFor(job.type).generate(job), PROVIDER_TIMEOUT_MS)

    let outputUrl: string
    if ('buffer' in result) {
      const path = `jobs/${job.id}.${EXTENSIONS[result.contentType] ?? 'bin'}`
      const { error } = await db().storage
        .from(OUTPUTS_BUCKET)
        .upload(path, result.buffer, { contentType: result.contentType, upsert: false })
      if (error) throw error
      outputUrl = db().storage.from(OUTPUTS_BUCKET).getPublicUrl(path).data.publicUrl
    } else {
      outputUrl = result.url
    }

    const { error } = await db()
      .from('jobs')
      .update({ status: 'done', output_url: outputUrl, is_demo: result.isDemo ?? false, completed_at: new Date().toISOString() })
      .eq('id', job.id)
    if (error) throw error
  } catch (err) {
    console.error(`job ${job.id} failed`, err)
    await failJob(job.id, err instanceof Error ? err.message : String(err))
  }
}

// Marks a job failed and refunds its cost. The status guard makes this idempotent:
// only the call that actually moves the job out of queued/running issues the refund.
export async function failJob(jobId: string, message: string) {
  const { data, error } = await db()
    .from('jobs')
    .update({ status: 'failed', error: message.slice(0, 500), completed_at: new Date().toISOString() })
    .eq('id', jobId)
    .in('status', ['queued', 'running'])
    .select('session_id, cost')
    .maybeSingle()
  if (error) {
    console.error(`could not mark job ${jobId} failed`, error)
    return
  }
  if (data?.session_id && data.cost > 0) {
    const { error: refundError } = await db().rpc('refund_credits', { p_session_id: data.session_id, p_amount: data.cost })
    if (refundError) console.error(`refund for job ${jobId} failed`, refundError)
  }
}
