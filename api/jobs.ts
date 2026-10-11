import { randomUUID } from 'node:crypto'
import { waitUntil } from '@vercel/functions'
import { json, route, UUID_RE } from './_lib/http.js'
import { parseImageDataUrl } from './_lib/images.js'
import { PUBLIC_JOB_COLUMNS, runJob, sweepStuckJobs } from './_lib/pipeline.js'
import { COSTS, isAspect, providerFor, type JobParams, type JobType } from './_lib/providers/index.js'
import { rateLimit } from './_lib/ratelimit.js'
import { getSession, ipHash } from './_lib/session.js'
import { db, UPLOADS_BUCKET } from './_lib/supabase.js'

const MAX_PROMPT = 1000
// Rate limit on job creation, per client IP (hashed).
const JOBS_PER_MINUTE = 6

type Input =
  | { kind: 'upload'; buffer: Buffer; contentType: string }
  | { kind: 'parent'; jobId: string; url: string }
  // A saved character: its stored photo is the input, so nothing is re-uploaded.
  | { kind: 'character'; characterId: string; url: string }

type Preset = { id: string; cost: number }

type Validated = {
  type: JobType
  prompt: string
  enhancedPrompt: string | null
  params: JobParams
  input?: Input
  preset: Preset | null
}

const PRESET_ID_RE = /^[a-z0-9-]{1,64}$/

async function validate(body: unknown, sessionId: string): Promise<Validated | string> {
  if (!body || typeof body !== 'object') return 'Body must be a JSON object'
  const b = body as Record<string, unknown>

  if (b.type !== 'image' && b.type !== 'effect' && b.type !== 'video') return 'type must be "image", "effect" or "video"'
  const type = b.type

  // Effect presets: prompt, guidance, aspect and cost all come from the preset row, never from the client.
  let preset: Preset | null = null
  let presetPrompt: string | null = null
  const presetParams: JobParams = {}
  if (b.preset_id !== undefined) {
    if (type !== 'effect') return 'preset_id is only valid for effect jobs'
    if (typeof b.preset_id !== 'string' || !PRESET_ID_RE.test(b.preset_id)) return 'preset_id is not valid'
    const { data, error } = await db()
      .from('presets')
      .select('id, cost, prompt_template, params')
      .eq('id', b.preset_id)
      .eq('kind', 'effect')
      .maybeSingle()
    if (error) throw error
    if (!data) return 'Unknown effect'
    preset = { id: data.id, cost: data.cost }
    presetPrompt = data.prompt_template
    const pp = (data.params ?? {}) as Record<string, unknown>
    if (typeof pp.guidance === 'number') presetParams.guidance = pp.guidance
    if (isAspect(pp.aspect)) presetParams.aspect = pp.aspect
  }

  const prompt = presetPrompt ?? (typeof b.prompt === 'string' ? b.prompt.trim() : '')
  if (type !== 'video' && !prompt) return 'Write a prompt first.'
  if (prompt.length > MAX_PROMPT) return `Prompts can be up to ${MAX_PROMPT} characters.`

  // The Prompt Assist rewrite the user explicitly chose with Use. Generation runs on it; prompt keeps what they typed.
  let enhancedPrompt: string | null = null
  if (!preset && b.enhanced_prompt !== undefined && b.enhanced_prompt !== null) {
    if (typeof b.enhanced_prompt !== 'string' || !b.enhanced_prompt.trim()) return 'enhanced_prompt must be a non-empty string'
    if (b.enhanced_prompt.length > MAX_PROMPT) return `enhanced_prompt must be at most ${MAX_PROMPT} characters`
    enhancedPrompt = b.enhanced_prompt.trim()
  }

  const params: JobParams = {}
  const p = (b.params ?? {}) as Record<string, unknown>
  if (p.aspect !== undefined) {
    if (!isAspect(p.aspect)) return 'params.aspect must be "1:1", "3:4" or "16:9"'
    params.aspect = p.aspect
  }
  if (p.guidance !== undefined) {
    if (typeof p.guidance !== 'number' || !Number.isFinite(p.guidance) || p.guidance < 1 || p.guidance > 10)
      return 'params.guidance must be a number from 1 to 10'
    params.guidance = p.guidance
  }
  if (p.seed !== undefined) {
    if (!Number.isInteger(p.seed) || (p.seed as number) < 0 || (p.seed as number) > 2 ** 31 - 1)
      return 'params.seed must be a non-negative integer'
    params.seed = p.seed as number
  }

  let input: Input | undefined
  if (b.character_id !== undefined && b.character_id !== null) {
    if (typeof b.character_id !== 'string' || !UUID_RE.test(b.character_id)) return 'character_id must be a UUID'
    if (type === 'image') return 'character_id needs an effect or video job (the character is the input image)'
    if (b.input_image !== undefined || b.parent_job_id !== undefined) return 'Send either character_id, input_image or parent_job_id, not several'
    const { data, error } = await db()
      .from('characters')
      .select('id, image_url')
      .eq('id', b.character_id)
      .eq('session_id', sessionId)
      .maybeSingle()
    if (error) throw error
    if (!data) return 'character_id must be one of your characters'
    input = { kind: 'character', characterId: data.id, url: data.image_url }
  } else if (typeof b.input_image === 'string') {
    const parsed = await parseImageDataUrl(b.input_image)
    if (typeof parsed === 'string') return parsed
    input = { kind: 'upload', ...parsed }
  } else if (typeof b.parent_job_id === 'string') {
    if (!UUID_RE.test(b.parent_job_id)) return 'parent_job_id must be a UUID'
    const { data, error } = await db()
      .from('jobs')
      .select('id, type, status, output_url')
      .eq('id', b.parent_job_id)
      .eq('session_id', sessionId)
      .maybeSingle()
    if (error) throw error
    if (!data || data.status !== 'done' || !data.output_url || data.type === 'video')
      return 'parent_job_id must be one of your finished image or effect jobs'
    input = { kind: 'parent', jobId: data.id, url: data.output_url }
  }
  if (type !== 'image' && !input) return `${type} jobs need input_image, parent_job_id or character_id`

  return { type, prompt, enhancedPrompt, params: preset ? { ...params, ...presetParams } : params, input, preset }
}

export const POST = route(async (request) => {
  const { session, setCookie } = await getSession(request)

  // Checked before anything else (including validation) so a flood can't reach the database or the models.
  const limit = await rateLimit(`jobs:${ipHash(request)}`, 60, JOBS_PER_MINUTE)
  if (!limit.ok) {
    return json(
      { error: 'rate_limited', code: 'rate_limited', message: "You're going a bit fast. Give it a few seconds and try again.", retry_after: limit.retryAfter },
      429,
      setCookie,
      { 'Retry-After': String(limit.retryAfter) },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Body must be valid JSON', code: 'invalid_input' }, 400, setCookie)
  }
  const v = await validate(body, session.id)
  if (typeof v === 'string') return json({ error: v, code: 'invalid_input' }, 400, setCookie)

  const cost = v.preset?.cost ?? COSTS[v.type]
  const { data: balance, error: spendError } = await db().rpc('spend_credits', { p_session_id: session.id, p_cost: cost })
  if (spendError) throw spendError
  if (balance === null) {
    const { data } = await db().from('sessions').select('credits').eq('id', session.id).single()
    return json({ error: 'insufficient_credits', credits: data?.credits ?? session.credits, cost }, 402, setCookie)
  }

  // Credits are spent from here on: any failure before the job exists must refund them.
  const jobId = randomUUID()
  try {
    let inputUrl: string | undefined
    if (v.input?.kind === 'upload') {
      const ext = v.input.contentType.split('/')[1].replace('jpeg', 'jpg')
      const path = `inputs/${jobId}.${ext}`
      const { error } = await db().storage
        .from(UPLOADS_BUCKET)
        .upload(path, v.input.buffer, { contentType: v.input.contentType, upsert: false })
      if (error) throw error
      inputUrl = db().storage.from(UPLOADS_BUCKET).getPublicUrl(path).data.publicUrl
    } else if (v.input?.kind === 'parent' || v.input?.kind === 'character') {
      inputUrl = v.input.url
    }

    const { data: job, error } = await db()
      .from('jobs')
      .insert({
        id: jobId,
        session_id: session.id,
        type: v.type,
        prompt: v.prompt,
        enhanced_prompt: v.enhancedPrompt,
        input_url: inputUrl ?? null,
        parent_job_id: v.input?.kind === 'parent' ? v.input.jobId : null,
        preset_id: v.preset?.id ?? null,
        character_id: v.input?.kind === 'character' ? v.input.characterId : null,
        model: providerFor(v.type).model,
        params: v.params,
        cost,
        status: 'queued',
      })
      .select(PUBLIC_JOB_COLUMNS)
      .single()
    if (error) throw error

    waitUntil(runJob({ id: jobId, type: v.type, prompt: v.enhancedPrompt ?? v.prompt, params: v.params, inputUrl, presetId: v.preset?.id }))
    return json({ job, credits: balance }, 202, setCookie)
  } catch (err) {
    console.error('job setup failed', err)
    await db().rpc('refund_credits', { p_session_id: session.id, p_amount: cost })
    return json({ error: "Something went wrong starting that. Your credits weren't spent.", code: 'provider_error' }, 500, setCookie)
  }
})

export const GET = route(async (request) => {
  const { session, setCookie } = await getSession(request)
  await sweepStuckJobs(session.id)
  const { data, error } = await db()
    .from('jobs')
    .select(PUBLIC_JOB_COLUMNS)
    .eq('session_id', session.id)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return json({ jobs: data }, 200, setCookie)
})
