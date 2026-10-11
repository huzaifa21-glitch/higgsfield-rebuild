export function json(body: unknown, status = 200, setCookie?: string, extraHeaders?: Record<string, string>) {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extraHeaders })
  if (setCookie) headers.append('Set-Cookie', setCookie)
  return new Response(JSON.stringify(body), { status, headers })
}

// Wraps a route so a thrown error (including Supabase's plain-object errors) becomes a logged 500
// instead of an unhandled rejection, which takes down the whole `vercel dev` process.
export function route(fn: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    try {
      return await fn(request)
    } catch (err) {
      console.error(`${request.method} ${new URL(request.url).pathname} failed:`, err)
      return json({ error: 'Internal error' }, 500)
    }
  }
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
