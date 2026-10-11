import './env.js'
import { JobError, type JobErrorCode } from './errors.js'

// Workers AI internal error codes (developers.cloudflare.com/workers-ai/platform/errors).
const CODE_MAP: Record<number, JobErrorCode> = {
  3030: 'safety_filter',
  3036: 'quota', // documented code for the daily free allocation
  4006: 'quota', // what the API actually returns for it (seen 2026-10-11)
  3040: 'capacity',
  3007: 'timeout',
  3008: 'timeout',
  5006: 'invalid_input',
  5004: 'invalid_input',
  3003: 'invalid_input',
  3006: 'invalid_input',
}

export function classify(status: number, body: string): JobErrorCode {
  try {
    const errors = (JSON.parse(body) as { errors?: { code?: number }[] }).errors ?? []
    for (const e of errors) if (e.code && CODE_MAP[e.code]) return CODE_MAP[e.code]
  } catch {
    // Not JSON: fall through to the message and status checks.
  }
  // Codes have drifted from the docs before, so also recognise the message itself.
  if (/daily free allocation/i.test(body)) return 'quota'
  if (status === 429) return 'capacity'
  if (status === 408 || status === 504) return 'timeout'
  return 'provider_error'
}

// Thin client for the Workers AI REST API. Pass FormData without a content type so fetch adds the boundary.
// Throws JobError with a code the pipeline and UI understand.
export async function runModel<T>(model: string, body: string | FormData, contentType?: string, timeoutMs = 40_000): Promise<T> {
  const accountId = process.env.CF_ACCOUNT_ID
  const token = process.env.CF_API_TOKEN
  if (!accountId || !token) throw new JobError('provider_error', 'Missing CF_ACCOUNT_ID or CF_API_TOKEN')

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (contentType) headers['Content-Type'] = contentType
  let res: Response
  try {
    res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    const name = err instanceof Error ? err.name : ''
    if (name === 'TimeoutError' || name === 'AbortError') throw new JobError('timeout', `${model} timed out after ${timeoutMs}ms`)
    throw new JobError('provider_error', `${model} request failed: ${err instanceof Error ? err.message : String(err)}`)
  }
  const text = await res.text()
  if (!res.ok) throw new JobError(classify(res.status, text), `${model} returned HTTP ${res.status}: ${text.slice(0, 300)}`)
  return (JSON.parse(text) as { result: T }).result
}

// Workers AI image models return base64 without saying the format (flux-1-schnell sends JPEG).
export function sniffImageType(buf: Buffer) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png'
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg'
  if (buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  return 'application/octet-stream'
}
