import { createHash } from 'node:crypto'
import { UUID_RE } from './http.js'
import { db } from './supabase.js'

const COOKIE = 'hf_session'
const ONE_YEAR = 60 * 60 * 24 * 365
// Session farming guard: a network gets starter credits on at most this many new sessions per 24h.
const FREE_SESSIONS_PER_IP_PER_DAY = 3

export type Session = { id: string; credits: number; realtime_key: string; starter_withheld: boolean }
const COLUMNS = 'id, credits, realtime_key, starter_withheld'

const isLocal = () => !process.env.VERCEL_ENV || process.env.VERCEL_ENV === 'development'

function readCookie(request: Request, name: string) {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return undefined
}

function sessionCookie(id: string) {
  // vercel dev runs on plain http://localhost, so only mark Secure on real deployments.
  return `${COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ONE_YEAR}${isLocal() ? '' : '; Secure'}`
}

// Vercel sets x-forwarded-for / x-vercel-forwarded-for; the first entry is the client.
// Locally, x-test-client-ip simulates different networks for testing. It is ignored on deployments.
export function clientIp(request: Request) {
  const h = request.headers
  if (isLocal() && h.get('x-test-client-ip')) return h.get('x-test-client-ip')!
  return (h.get('x-vercel-forwarded-for') ?? h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? 'unknown').split(',')[0].trim()
}

// Salted SHA-256, so raw IPs are never stored. The service key is already a server-only secret.
export function ipHash(request: Request) {
  const salt = process.env.IP_HASH_SALT ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createHash('sha256').update(`${salt}:${clientIp(request)}`).digest('hex')
}

// Returns the caller's session, creating one on first request.
// setCookie is set only when a new session was created and must be sent back on the response.
export async function getSession(request: Request): Promise<{ session: Session; setCookie?: string }> {
  const id = readCookie(request, COOKIE)
  if (id && UUID_RE.test(id)) {
    const { data, error } = await db().from('sessions').select(COLUMNS).eq('id', id).maybeSingle()
    if (error) throw error
    if (data) return { session: data }
  }

  const hash = ipHash(request)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count, error: countError } = await db()
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', hash)
    .gte('created_at', since)
  if (countError) throw countError
  // Past the daily allowance the session still works (browse, characters, demo video), just with 0 credits.
  const withheld = (count ?? 0) >= FREE_SESSIONS_PER_IP_PER_DAY

  const { data, error } = await db()
    .from('sessions')
    .insert({ ip_hash: hash, ...(withheld && { credits: 0, starter_withheld: true }) })
    .select(COLUMNS)
    .single()
  if (error) throw error
  return { session: data, setCookie: sessionCookie(data.id) }
}
