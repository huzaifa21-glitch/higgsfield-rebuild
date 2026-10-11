import { db } from './supabase.js'

export type RateLimitResult = { ok: true } | { ok: false; retryAfter: number }

// Sliding-window limit over the fixed-window counters in rate_limits (supabase/guards.sql).
// The previous window's count is weighted by how much of it still overlaps the last `windowSeconds`,
// so a burst split across a window boundary can't get through at double the limit.
// Fails open: if the counter can't be reached, requests go through rather than blocking everyone.
export async function rateLimit(key: string, windowSeconds: number, max: number): Promise<RateLimitResult> {
  const { data, error } = await db().rpc('hit_rate_limit', { p_key: key, p_window_seconds: windowSeconds })
  if (error) {
    console.error('rate limit check failed (allowing request)', error)
    return { ok: true }
  }
  const row = (Array.isArray(data) ? data[0] : data) as { hits: number; reset_at: string } | undefined
  if (!row) return { ok: true }

  const windowMs = windowSeconds * 1000
  const resetAt = new Date(row.reset_at).getTime()
  const windowStart = resetAt - windowMs
  const previousStart = new Date(windowStart - windowMs).toISOString()
  const { data: prev } = await db().from('rate_limits').select('count').eq('key', key).eq('window_start', previousStart).maybeSingle()

  const previous = prev?.count ?? 0
  const elapsed = Math.min(1, Math.max(0, (Date.now() - windowStart) / windowMs))
  const estimate = row.hits + previous * (1 - elapsed)
  if (estimate <= max) return { ok: true }

  // Wait until the estimate drops back to the limit: either the previous window's weight decays enough,
  // or (if this window alone is over) the window ends.
  let waitMs = resetAt - Date.now()
  if (row.hits <= max && previous > 0) waitMs = Math.min(waitMs, (1 - (max - row.hits) / previous - elapsed) * windowMs)
  return { ok: false, retryAfter: Math.max(1, Math.ceil(waitMs / 1000)) }
}
