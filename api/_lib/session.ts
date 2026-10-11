import { UUID_RE } from './http.js'
import { db } from './supabase.js'

const COOKIE = 'hf_session'
const ONE_YEAR = 60 * 60 * 24 * 365

export type Session = { id: string; credits: number; realtime_key: string }

function readCookie(request: Request, name: string) {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return undefined
}

function sessionCookie(id: string) {
  // vercel dev runs on plain http://localhost, so only mark Secure on real deployments.
  const secure = process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview'
  return `${COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ONE_YEAR}${secure ? '; Secure' : ''}`
}

// Returns the caller's session, creating one (with the default 10 credits) on first request.
// setCookie is set only when a new session was created and must be sent back on the response.
export async function getSession(request: Request): Promise<{ session: Session; setCookie?: string }> {
  const id = readCookie(request, COOKIE)
  if (id && UUID_RE.test(id)) {
    const { data, error } = await db().from('sessions').select('id, credits, realtime_key').eq('id', id).maybeSingle()
    if (error) throw error
    if (data) return { session: data }
  }

  const { data, error } = await db().from('sessions').insert({}).select('id, credits, realtime_key').single()
  if (error) throw error
  return { session: data, setCookie: sessionCookie(data.id) }
}
