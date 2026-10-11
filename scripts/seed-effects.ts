// Seeds the 8 effect presets and their gallery previews.
// Run: node scripts/seed-effects.ts            (generates a new base portrait)
//      node scripts/seed-effects.ts --reuse-base  (keeps presets/base.webp, re-renders the effects)
//      node scripts/seed-effects.ts --reuse-base --only=comic-book,renaissance
// Needs CF_ACCOUNT_ID, CF_API_TOKEN, VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local.
//
// Previews use one fictional portrait from flux-1-schnell (no real faces), then every preset is applied
// to it with flux-2-klein-4b at a fixed seed, using the settings from scripts/klein-grid.ts:
// 512px input, guidance 5, 768x1024 output.

import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
process.loadEnvFile(join(root, '.env.local'))
const { CF_ACCOUNT_ID, CF_API_TOKEN, VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
if (!CF_ACCOUNT_ID || !CF_API_TOKEN || !VITE_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing env vars in .env.local')
  process.exit(1)
}
const db = createClient(new URL(VITE_SUPABASE_URL).origin, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const BUCKET = 'outputs'
const EDIT_MODEL = '@cf/black-forest-labs/flux-2-klein-4b'
const SEED = 42
const GUIDANCE = 5
const BASE_PROMPT =
  'studio headshot photo of a fictional person in their late twenties, neutral relaxed expression, looking at the camera, ' +
  'plain light gray background, soft even lighting, wearing a plain white t-shirt, head and shoulders, photorealistic'

// Studio Portrait was replaced by Astronaut (see DECISIONS.md, "Polish").
const RETIRED = ['studio-portrait']

type Preset = { id: string; name: string; description: string; prompt: string; featured?: boolean }

const PRESETS: Preset[] = [
  {
    id: 'film-noir',
    name: 'Film Noir',
    description: 'A 1940s detective in black and white, on a rain-soaked street.',
    prompt:
      'the same person as a 1940s film noir detective, wearing a fedora and trench coat, black-and-white, ' +
      'rain-soaked street at night, dramatic shadows',
    featured: true,
  },
  {
    id: 'anime',
    name: 'Anime',
    description: 'Hand-drawn anime character on a spring street.',
    prompt:
      'the same person as an anime character, hand-drawn cel-shaded style with clean line art and large expressive eyes, ' +
      'wearing a navy school blazer, cherry blossom street in spring, soft pastel lighting',
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    description: 'Neon-lit street runner in a rainy future city.',
    prompt:
      'the same person as a cyberpunk street runner, wearing a reflective black jacket with glowing neon trim, ' +
      'rain-soaked neon city alley at night, magenta and cyan neon lighting',
  },
  {
    id: 'astronaut',
    name: 'Astronaut',
    description: 'Suited up on the Moon, with Earth rising behind.',
    prompt:
      'the same person as an astronaut, wearing a white NASA-style spacesuit with the helmet off, standing on the grey lunar surface, ' +
      'Earth rising in the black sky behind, crisp hard sunlight, cinematic photo',
  },
  {
    id: 'claymation',
    name: 'Claymation',
    description: 'A handmade plasticine figure on a stop-motion set.',
    prompt:
      'the same person as a claymation character, handmade plasticine figure with soft clay texture and visible fingerprints, ' +
      'wearing a chunky knitted sweater, miniature stop-motion set of a cozy living room, warm soft lighting',
  },
  {
    id: 'vintage-polaroid',
    name: 'Vintage Polaroid',
    description: 'A sun-faded 1970s instant photo.',
    prompt:
      'the same person in a vintage 1970s Polaroid photo, wearing a patterned shirt with a wide collar, sunny backyard, ' +
      'faded warm colors, soft on-camera flash, white Polaroid frame',
  },
  {
    id: 'comic-book',
    name: 'Comic Book',
    description: 'Bold ink and halftone, straight off the page.',
    prompt:
      // No superhero costume: 'caped superhero suit' tripped Cloudflare's output safety filter (error 3030).
      'the same person as a comic book character, bold ink outlines and halftone dot shading, wearing a red bomber jacket, ' +
      'city rooftop at dusk, dramatic high-contrast lighting, vivid primary colors',
  },
  {
    id: 'renaissance',
    name: 'Renaissance Painting',
    description: 'An oil portrait with old-master lighting.',
    prompt:
      'the same person as a Renaissance oil painting portrait, wearing rich velvet clothing with a lace collar, ' +
      'dark background with a draped curtain, soft window light from the left, fine cracked varnish texture',
  },
]

async function cf(model: string, body: string | FormData, contentType?: string) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${model}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CF_API_TOKEN}`, ...(contentType && { 'Content-Type': contentType }) },
    body,
  })
  const json = (await res.json()) as { result?: { image?: string }; errors?: unknown }
  if (!res.ok || !json.result?.image) throw new Error(`${model}: HTTP ${res.status} ${JSON.stringify(json.errors)}`)
  return Buffer.from(json.result.image, 'base64')
}

async function upload(path: string, buffer: Buffer) {
  const { error } = await db.storage.from(BUCKET).upload(path, buffer, { contentType: 'image/webp', upsert: true })
  if (error) throw error
  // Cache-buster so re-seeding shows new images despite the CDN.
  return `${db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl}?v=${Date.now()}`
}

const time = async <T>(label: string, fn: () => Promise<T>) => {
  const start = performance.now()
  const result = await fn()
  console.log(`${label.padEnd(24)} ${((performance.now() - start) / 1000).toFixed(1)}s`)
  return result
}

// 1. Base portrait (3:4, matching the effect output)
let base: Buffer
let beforeUrl: string
if (process.argv.includes('--reuse-base')) {
  const { data, error } = await db.storage.from(BUCKET).download('presets/base.webp')
  if (error) throw error
  base = Buffer.from(await data.arrayBuffer())
  beforeUrl = `${db.storage.from(BUCKET).getPublicUrl('presets/base.webp').data.publicUrl}?v=${Date.now()}`
  console.log('reusing presets/base.webp')
} else {
  const square = await time('base portrait', () => cf('@cf/black-forest-labs/flux-1-schnell', JSON.stringify({ prompt: BASE_PROMPT, steps: 4 }), 'application/json'))
  base = await sharp(square).resize(768, 1024, { fit: 'cover', position: sharp.strategy.attention }).webp({ quality: 86 }).toBuffer()
  beforeUrl = await upload('presets/base.webp', base)
}
const input = await sharp(base).resize({ width: 512, height: 512, fit: 'inside' }).jpeg({ quality: 90 }).toBuffer()

// 2. Each preset on the base portrait, then upsert the row with its preview
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',')
for (const [order, p] of PRESETS.entries()) {
  if (only && !only.includes(p.id)) continue
  const form = new FormData()
  form.append('prompt', p.prompt)
  form.append('input_image_0', new Blob([new Uint8Array(input)], { type: 'image/jpeg' }), 'base.jpg')
  form.append('width', '768')
  form.append('height', '1024')
  form.append('guidance', String(GUIDANCE))
  form.append('seed', String(SEED))
  const out = await time(p.name, () => cf(EDIT_MODEL, form))
  const previewUrl = await upload(`presets/${p.id}.webp`, await sharp(out).webp({ quality: 86 }).toBuffer())

  const { error } = await db.from('presets').upsert({
    id: p.id,
    name: p.name,
    description: p.description,
    kind: 'effect',
    model: EDIT_MODEL,
    prompt_template: p.prompt,
    params: { guidance: GUIDANCE, aspect: '3:4', order, preview_seed: SEED, preview_before_url: beforeUrl },
    cost: 2,
    featured: p.featured ?? false,
    preview_url: previewUrl,
  })
  if (error) throw error
}
// Retire replaced presets only now that the new ones exist, so the gallery never has a gap.
// Rows are kept (kind = 'retired' hides them) because past jobs reference them.
const { data: retired, error: retireError } = await db
  .from('presets')
  .update({ kind: 'retired', featured: false })
  .in('id', RETIRED)
  .neq('kind', 'retired')
  .select('id')
if (retireError) throw retireError
if (retired.length) console.log(`retired: ${retired.map((r) => r.id).join(', ')}`)
console.log(`\nseeded ${only ? only.length : PRESETS.length} presets; before image ${beforeUrl}`)
