import { getDegraded } from './_lib/flags.js'
import { route } from './_lib/http.js'

// Site-wide status for the banner: whether image/effect jobs are currently served as demo outputs.
export const GET = route(async () => {
  const degraded = await getDegraded()
  return new Response(JSON.stringify({ degraded }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=15, s-maxage=30' },
  })
})
