import './env.js'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const OUTPUTS_BUCKET = 'outputs'
export const UPLOADS_BUCKET = 'uploads'

let client: SupabaseClient | undefined

// Service-role client: bypasses RLS, server only. Created on first use so a missing env var
// fails the request (caught by route()) instead of crashing the module at import.
export function db() {
  if (!client) {
    const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Missing SUPABASE_URL (or VITE_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY')
    // origin strips a stray path like /rest/v1/.
    client = createClient(new URL(url).origin, key, { auth: { persistSession: false, autoRefreshToken: false } })
  }
  return client
}
