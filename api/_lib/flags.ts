import { db } from './supabase.js'

// Degraded mode: when Workers AI says the free allocation (or capacity) is gone, image and effect
// jobs go to the mock provider until this flag expires, instead of failing one by one.
const FLAG = 'ai_degraded'
const CAPACITY_BACKOFF_MS = 10 * 60 * 1000
const CACHE_MS = 15_000

export type Degraded = { until: string; reason: 'quota' | 'capacity' }

let cache: { value: Degraded | null; at: number } | null = null

export async function getDegraded(): Promise<Degraded | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value
  try {
    const { data, error } = await db().from('app_flags').select('until, reason').eq('name', FLAG).maybeSingle()
    if (error) throw error
    const value = data?.until && new Date(data.until).getTime() > Date.now() ? { until: data.until, reason: data.reason as Degraded['reason'] } : null
    cache = { value, at: Date.now() }
    return value
  } catch (err) {
    // If the flag can't be read, behave as if healthy: the provider call will tell us otherwise.
    console.error('could not read degraded flag', err)
    return null
  }
}

// The free allocation resets daily at 00:00 UTC; capacity errors are short-lived.
function untilFor(reason: Degraded['reason']) {
  if (reason === 'capacity') return new Date(Date.now() + CAPACITY_BACKOFF_MS)
  const next = new Date()
  next.setUTCHours(24, 0, 0, 0)
  return next
}

export async function setDegraded(reason: Degraded['reason']) {
  const until = untilFor(reason)
  const current = await getDegraded()
  // Never shorten an existing window (a capacity blip mustn't end a quota outage early).
  if (current && new Date(current.until) >= until) return
  const { error } = await db()
    .from('app_flags')
    .upsert({ name: FLAG, until: until.toISOString(), reason, updated_at: new Date().toISOString() })
  if (error) console.error('could not set degraded flag', error)
  cache = { value: { until: until.toISOString(), reason }, at: Date.now() }
  console.warn(`AI degraded (${reason}) until ${until.toISOString()}`)
}
