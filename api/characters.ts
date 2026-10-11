import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { json, route, UUID_RE } from './_lib/http.js'
import { getSession } from './_lib/session.js'
import { db, UPLOADS_BUCKET } from './_lib/supabase.js'

// Saved faces for the session. Free to create; capped per guest session.
const LIMIT = 3
const MAX_NAME = 40
const MAX_IMAGE_BYTES = 3 * 1024 * 1024
const DATA_URL_RE = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/
const COLUMNS = 'id, name, image_url, created_at'

function readName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.trim().replace(/\s+/g, ' ')
  return name && name.length <= MAX_NAME ? name : null
}

// Storage path from a public URL, for deleting the photo with the character.
function storagePath(url: string) {
  const marker = `/object/public/${UPLOADS_BUCKET}/`
  const i = url.indexOf(marker)
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length).split('?')[0])
}

export const GET = route(async (request) => {
  const { session, setCookie } = await getSession(request)
  const { data, error } = await db()
    .from('characters')
    .select(COLUMNS)
    .eq('session_id', session.id)
    .order('created_at', { ascending: true })
  if (error) throw error
  return json({ characters: data, limit: LIMIT }, 200, setCookie)
})

export const POST = route(async (request) => {
  const { session, setCookie } = await getSession(request)
  const body = (await request.json().catch(() => null)) as { name?: unknown; image?: unknown } | null
  const name = readName(body?.name)
  if (!name) return json({ error: `Name must be 1-${MAX_NAME} characters` }, 400, setCookie)
  const match = typeof body?.image === 'string' ? DATA_URL_RE.exec(body.image) : null
  if (!match) return json({ error: 'image must be a base64 data URL (png, jpeg or webp)' }, 400, setCookie)
  const raw = Buffer.from(match[1], 'base64')
  if (raw.length > MAX_IMAGE_BYTES) return json({ error: 'image must be at most 3MB' }, 400, setCookie)

  const { count, error: countError } = await db()
    .from('characters')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', session.id)
  if (countError) throw countError
  if ((count ?? 0) >= LIMIT) {
    return json({ error: 'limit_reached', limit: LIMIT, message: `You can save up to ${LIMIT} characters. Delete one to add another.` }, 409, setCookie)
  }

  // Normalise to a 512px JPEG: the size the edit model uses, and small to store.
  const image = await sharp(raw)
    .rotate()
    .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer()
  const id = randomUUID()
  const path = `characters/${id}.jpg`
  const { error: uploadError } = await db().storage.from(UPLOADS_BUCKET).upload(path, image, { contentType: 'image/jpeg', upsert: false })
  if (uploadError) throw uploadError
  const imageUrl = db().storage.from(UPLOADS_BUCKET).getPublicUrl(path).data.publicUrl

  const { data, error } = await db()
    .from('characters')
    .insert({ id, session_id: session.id, name, image_url: imageUrl })
    .select(COLUMNS)
    .single()
  if (error) {
    await db().storage.from(UPLOADS_BUCKET).remove([path])
    throw error
  }
  return json({ character: data }, 201, setCookie)
})

export const PATCH = route(async (request) => {
  const { session, setCookie } = await getSession(request)
  const id = new URL(request.url).searchParams.get('id')
  if (!id || !UUID_RE.test(id)) return json({ error: 'id must be a UUID' }, 400, setCookie)
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null
  const name = readName(body?.name)
  if (!name) return json({ error: `Name must be 1-${MAX_NAME} characters` }, 400, setCookie)

  const { data, error } = await db()
    .from('characters')
    .update({ name })
    .eq('id', id)
    .eq('session_id', session.id)
    .select(COLUMNS)
    .maybeSingle()
  if (error) throw error
  if (!data) return json({ error: 'Character not found' }, 404, setCookie)
  return json({ character: data }, 200, setCookie)
})

export const DELETE = route(async (request) => {
  const { session, setCookie } = await getSession(request)
  const id = new URL(request.url).searchParams.get('id')
  if (!id || !UUID_RE.test(id)) return json({ error: 'id must be a UUID' }, 400, setCookie)

  const { data: character, error: findError } = await db()
    .from('characters')
    .select('id, image_url')
    .eq('id', id)
    .eq('session_id', session.id)
    .maybeSingle()
  if (findError) throw findError
  if (!character) return json({ error: 'Character not found' }, 404, setCookie)

  // jobs.character_id references characters: unlink first. The outputs stay in the library.
  const { error: unlinkError } = await db().from('jobs').update({ character_id: null }).eq('character_id', id).eq('session_id', session.id)
  if (unlinkError) throw unlinkError
  const { error } = await db().from('characters').delete().eq('id', id).eq('session_id', session.id)
  if (error) throw error

  const path = storagePath(character.image_url)
  if (path) await db().storage.from(UPLOADS_BUCKET).remove([path])
  return json({ ok: true }, 200, setCookie)
})
