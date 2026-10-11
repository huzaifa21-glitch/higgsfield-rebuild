import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
if (!url || !anonKey) throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')

// Anon client, used only for Realtime. Tables are behind RLS with no policies, so it can't read data;
// everything else goes through /api. origin strips a stray path like /rest/v1/.
export const supabase = createClient(new URL(url).origin, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
