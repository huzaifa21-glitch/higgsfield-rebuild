// Scratch script: smoke-test the three Cloudflare Workers AI models we plan to use.
// Run: node scripts/test-models.ts
// Needs CF_ACCOUNT_ID and CF_API_TOKEN in .env.local, and scripts/in/selfie.jpg (any size; resized to fit 512px).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const inDir = join(here, 'in')
const outDir = join(here, 'out')

process.loadEnvFile(join(root, '.env.local'))
const accountId = process.env.CF_ACCOUNT_ID
const token = process.env.CF_API_TOKEN
if (!accountId || !token) {
  console.error('Missing CF_ACCOUNT_ID or CF_API_TOKEN in .env.local')
  process.exit(1)
}

const runUrl = (model: string) =>
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`

async function run(model: string, body: BodyInit, contentType?: string) {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  // Leave Content-Type unset for FormData so fetch adds the multipart boundary.
  if (contentType) headers['Content-Type'] = contentType
  const res = await fetch(runUrl(model), { method: 'POST', headers, body })
  const text = await res.text()
  if (!res.ok) throw new Error(`${model} -> HTTP ${res.status}: ${text.slice(0, 500)}`)
  return JSON.parse(text).result
}

async function timed<T>(label: string, fn: () => Promise<T>) {
  const start = performance.now()
  try {
    const result = await fn()
    console.log(`[${label}] ok in ${((performance.now() - start) / 1000).toFixed(2)}s`)
    return result
  } catch (err) {
    console.error(`[${label}] failed after ${((performance.now() - start) / 1000).toFixed(2)}s`)
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  }
}

mkdirSync(outDir, { recursive: true })

// (1) Text -> image. flux-1-schnell takes JSON and returns { image: base64 jpeg }.
await timed('t2i  flux-1-schnell', async () => {
  const result = await run(
    '@cf/black-forest-labs/flux-1-schnell',
    JSON.stringify({
      prompt: 'a corgi astronaut floating above a neon city at night, cinematic lighting',
      steps: 4,
    }),
    'application/json',
  )
  writeFileSync(join(outDir, 't2i.png'), Buffer.from(result.image, 'base64'))
  console.log(`  saved ${join('scripts', 'out', 't2i.png')}`)
})

// (2) Image edit. flux-2-klein-4b only accepts multipart: prompt (required), input_image_0..3 (binary),
// optional width/height (256-1920), guidance, seed. Steps are fixed at 4. Returns { image: base64 }.
// Docs: "All input images must be smaller than 512x512." The API doesn't reject larger inputs, but we follow the doc.
// Source: developers.cloudflare.com/changelog/2026-01-15-flux-2-klein-4b-workers-ai
await timed('edit flux-2-klein-4b', async () => {
  const original = readFileSync(join(inDir, 'selfie.jpg'))
  const before = await sharp(original).metadata()
  // rotate() applies EXIF orientation so phone portraits aren't sent sideways.
  const { data: selfie, info } = await sharp(original)
    .rotate()
    .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer({ resolveWithObject: true })
  console.log(`  input ${before.width}x${before.height} -> ${info.width}x${info.height}`)

  const portrait = info.height > info.width
  const form = new FormData()
  form.append('prompt', 'turn this person into a film noir detective')
  form.append('input_image_0', new Blob([selfie], { type: 'image/jpeg' }), 'selfie.jpg')
  form.append('width', portrait ? '768' : '1024')
  form.append('height', portrait ? '1024' : '768')

  const result = await run('@cf/black-forest-labs/flux-2-klein-4b', form)
  writeFileSync(join(outDir, 'edit.png'), Buffer.from(result.image, 'base64'))
  console.log(`  saved ${join('scripts', 'out', 'edit.png')}`)
})

// (3) Prompt Assist: rewrite a messy prompt so the core subject comes first.
await timed('llm  llama-3.2-3b   ', async () => {
  const messy =
    'ok so like neon lights everywhere, rainy, kinda cyberpunk vibe, 8k, and theres a old fisherman ' +
    'with a glowing fish in the middle i guess, moody, blade runner style, reflections on the ground'
  const result = await run(
    '@cf/meta/llama-3.2-3b-instruct',
    JSON.stringify({
      messages: [
        {
          role: 'system',
          content:
            'You rewrite image-generation prompts. Put the core subject first, then its action, then setting, ' +
            'then style and lighting. Keep every concrete detail, drop filler words, do not invent new elements. ' +
            'Reply with the rewritten prompt only, one line, no quotes.',
        },
        { role: 'user', content: messy },
      ],
      max_tokens: 200,
      temperature: 0.3,
    }),
    'application/json',
  )
  console.log(`  before: ${messy}`)
  console.log(`  after:  ${String(result.response).trim()}`)
})
