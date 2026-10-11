export function GET() {
  return Response.json({ ok: true, provider: process.env.IMAGE_PROVIDER })
}
