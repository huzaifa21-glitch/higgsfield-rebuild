import { db } from './supabase.js'

export type RateLimitResult = { ok: true } | { ok: false; retryAfter: number }

// Fixed-window limit backed by the rate_limits table (supabase/guards.sql).
// Fails open: if the counter can't be reached, requests go through rather than blocking everyone.
export async function rateLimit(key: string, windowSeconds: number, max: number): Promise<RateLimitResult> {
  const { data, error } = await db().rpc('hit_rate_limit', { p_key: key, p_window_seconds: windowSeconds })
  if (error) {
    console.error('rate limit check failed (allowing request)', error)
    return { ok: true }
  }
  const row = (Array.isArray(data) ? data[0] : data) as { hits: number; reset_at: string } | undefined
  if (!row || row.hits <= max) return { ok: true }
  return { ok: false, retryAfter: Math.max(1, Math.ceil((new Date(row.reset_at).getTime() - Date.now()) / 1000)) }
}
