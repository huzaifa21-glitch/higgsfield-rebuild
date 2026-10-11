// Seeds the sample images served when Workers AI is out of free capacity (api/_lib/providers/mock-image.ts).
// Run: node scripts/seed-demo-images.ts
// Effects fall back to their own preset preview instead, so these only cover Create.

import { dirname, join } from 'node:path'
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

// Varied, neutral subjects so a demo never looks like a broken attempt at the user's prompt.
const SAMPLES: [string, string][] = [
  ['mountain-lake', 'a calm mountain lake at sunrise with mist over the water, wide landscape photo'],
  ['city-night', 'a rainy city street at night with neon reflections on wet pavement, cinematic photo'],
  ['fox-forest', 'a red fox sitting in a snowy forest, soft morning light, wildlife photo'],
  ['coffee-still', 'a cup of coffee on a wooden table by a sunny window, cozy still life photo'],
  ['desert-dunes', 'golden sand dunes under a clear blue sky, minimalist landscape photo'],
  ['abstract-paint', 'abstract swirls of colorful acrylic paint, macro photo, vivid colors'],
]

for (const [name, prompt] of SAMPLES) {
  const start = performance.now()
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, steps: 4 }),
  })
  const json = (await res.json()) as { result?: { image?: string }; errors?: unknown }
  if (!res.ok || !json.result?.image) throw new Error(`${name}: HTTP ${res.status} ${JSON.stringify(json.errors)}`)
  const webp = await sharp(Buffer.from(json.result.image, 'base64')).webp({ quality: 86 }).toBuffer()
  const { error } = await db.storage.from('outputs').upload(`samples/images/${name}.webp`, webp, { contentType: 'image/webp', upsert: true })
  if (error) throw error
  console.log(`${name.padEnd(16)} ${((performance.now() - start) / 1000).toFixed(1)}s  ${(webp.length / 1024).toFixed(0)}KB`)
}
console.log(`\nuploaded ${SAMPLES.length} demo images to outputs/samples/images/`)
