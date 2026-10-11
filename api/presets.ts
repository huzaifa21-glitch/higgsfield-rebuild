import { route } from './_lib/http.js'
import { db } from './_lib/supabase.js'

// Effect gallery. Public data, so it can be cached briefly; prompt templates stay server-side.
export const GET = route(async () => {
  const { data, error } = await db()
    .from('presets')
    .select('id, name, description, preview_url, params, cost, featured')
    .eq('kind', 'effect')
  if (error) throw error

  const order = (p: { params: unknown }) => ((p.params ?? {}) as { order?: number }).order ?? 999
  const presets = [...data]
    .sort((a, b) => order(a) - order(b))
    .map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      cost: p.cost,
      featured: p.featured,
      after_url: p.preview_url,
      before_url: ((p.params ?? {}) as { preview_before_url?: string }).preview_before_url ?? null,
    }))

  return new Response(JSON.stringify({ presets }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60, s-maxage=300' },
  })
})
