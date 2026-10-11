import './env.js'

// Thin client for the Workers AI REST API. Pass FormData without a content type so fetch adds the boundary.
export async function runModel<T>(model: string, body: string | FormData, contentType?: string, timeoutMs = 40_000): Promise<T> {
  const accountId = process.env.CF_ACCOUNT_ID
  const token = process.env.CF_API_TOKEN
  if (!accountId || !token) throw new Error('Missing CF_ACCOUNT_ID or CF_API_TOKEN')

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (contentType) headers['Content-Type'] = contentType
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${model} returned HTTP ${res.status}: ${text.slice(0, 300)}`)
  return (JSON.parse(text) as { result: T }).result
}

// Workers AI image models return base64 without saying the format (flux-1-schnell sends JPEG).
export function sniffImageType(buf: Buffer) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png'
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg'
  if (buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  return 'application/octet-stream'
}
