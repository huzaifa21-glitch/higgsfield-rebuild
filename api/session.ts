import { json, route } from './_lib/http.js'
import { COSTS } from './_lib/providers/index.js'
import { getSession } from './_lib/session.js'

// realtimeKey names the session's broadcast channel; it is not the session id and grants nothing else.
export const GET = route(async (request) => {
  const { session, setCookie } = await getSession(request)
  // starterWithheld: this network already started 3 sessions today, so this one began with 0 credits.
  return json(
    { credits: session.credits, realtimeKey: session.realtime_key, costs: COSTS, starterWithheld: session.starter_withheld },
    200,
    setCookie,
  )
})
