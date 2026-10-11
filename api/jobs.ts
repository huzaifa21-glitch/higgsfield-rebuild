// Placeholder until the generation pipeline lands. Every file in api/ is deployed as a function,
// so an empty module here would fail at runtime instead of returning a clear status.
export function POST() {
  return Response.json({ error: 'Not implemented' }, { status: 501 })
}

export function GET() {
  return Response.json({ error: 'Not implemented' }, { status: 501 })
}
