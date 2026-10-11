// Scratch script: flux-2-klein-4b parameter grid. Fixed seed + prompt, varies input size x guidance,
// writes each output plus one labelled contact sheet.
// Run: node scripts/klein-grid.ts
// Needs CF_ACCOUNT_ID and CF_API_TOKEN in .env.local, and scripts/in/selfie.jpg.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, 'out', 'klein-grid')

process.loadEnvFile(join(here, '..', '.env.local'))
const accountId = process.env.CF_ACCOUNT_ID
const token = process.env.CF_API_TOKEN
if (!accountId || !token) {
  console.error('Missing CF_ACCOUNT_ID or CF_API_TOKEN in .env.local')
  process.exit(1)
}

const MODEL = '@cf/black-forest-labs/flux-2-klein-4b'
const SEED = 42
const PROMPT =
  'the same person as a 1940s film noir detective, wearing a fedora and trench coat, black-and-white, ' +
  'rain-soaked street at night, dramatic shadows'
const SIZES = [512, 1024] // longest side of the input image
const GUIDANCES = [2.5, 5, 8]
// Output size is held constant so only the input changes cost between rows.
const OUT_W = 768
const OUT_H = 1024

// Pricing: developers.cloudflare.com/workers-ai/platform/pricing (Image model pricing table).
// Assumes partial tiles round up to a whole tile; the docs don't say how they're counted.
const NEURONS_PER_INPUT_TILE = 5.37
const NEURONS_PER_OUTPUT_TILE = 26.05
const tiles = (w: number, h: number) => Math.ceil(w / 512) * Math.ceil(h / 512)
const estimateNeurons = (inW: number, inH: number) =>
  tiles(inW, inH) * NEURONS_PER_INPUT_TILE + tiles(OUT_W, OUT_H) * NEURONS_PER_OUTPUT_TILE

mkdirSync(outDir, { recursive: true })
const source = readFileSync(join(here, 'in', 'selfie.jpg'))
const sourceMeta = await sharp(source).rotate().metadata()
console.log(`source ${sourceMeta.width}x${sourceMeta.height}, seed ${SEED}, output ${OUT_W}x${OUT_H}\n`)

type Cell = { size: number; guidance: number; file?: string; error?: string }
const cells: Cell[] = []
let totalNeurons = 0

for (const size of SIZES) {
  // Upscaling is allowed here on purpose: the 1024 row needs it when the source is smaller.
  const { data: input, info } = await sharp(source)
    .rotate()
    .resize({ width: size, height: size, fit: 'inside' })
    .jpeg({ quality: 90 })
    .toBuffer({ resolveWithObject: true })
  const neurons = estimateNeurons(info.width, info.height)

  for (const guidance of GUIDANCES) {
    const label = `in ${info.width}x${info.height}  g=${guidance}`
    const form = new FormData()
    form.append('prompt', PROMPT)
    form.append('input_image_0', new Blob([input], { type: 'image/jpeg' }), 'selfie.jpg')
    form.append('width', String(OUT_W))
    form.append('height', String(OUT_H))
    form.append('guidance', String(guidance))
    form.append('seed', String(SEED))

    const start = performance.now()
    try {
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })
      const text = await res.text()
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`)
      const file = join(outDir, `in${size}-g${guidance}.png`)
      writeFileSync(file, Buffer.from(JSON.parse(text).result.image, 'base64'))
      totalNeurons += neurons
      cells.push({ size, guidance, file })
      console.log(`[${label}] ok in ${((performance.now() - start) / 1000).toFixed(2)}s  ~${neurons.toFixed(2)} neurons`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      cells.push({ size, guidance, error: message })
      console.error(`[${label}] failed after ${((performance.now() - start) / 1000).toFixed(2)}s: ${message}`)
      process.exitCode = 1
    }
  }
}

// Contact sheet: one row per input size, one column per guidance, with header labels.
const CELL_W = 384
const CELL_H = 512
const LEFT = 140
const TOP = 56
const GAP = 8
const sheetW = LEFT + GUIDANCES.length * (CELL_W + GAP)
const sheetH = TOP + SIZES.length * (CELL_H + GAP)
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

const labels = [
  `<text x="${LEFT}" y="22" font-size="16" fill="#aaa">flux-2-klein-4b · seed ${SEED} · out ${OUT_W}x${OUT_H}</text>`,
  ...GUIDANCES.map(
    (g, c) =>
      `<text x="${LEFT + c * (CELL_W + GAP) + CELL_W / 2}" y="46" font-size="20" fill="#fff" text-anchor="middle">guidance ${g}</text>`,
  ),
  ...SIZES.map(
    (s, r) =>
      `<text x="${LEFT / 2}" y="${TOP + r * (CELL_H + GAP) + CELL_H / 2}" font-size="20" fill="#fff" text-anchor="middle">input ${s}px</text>`,
  ),
]
const composites: sharp.OverlayOptions[] = [
  {
    input: Buffer.from(
      `<svg width="${sheetW}" height="${sheetH}" xmlns="http://www.w3.org/2000/svg" font-family="Arial, sans-serif">${labels.join('')}</svg>`,
    ),
    left: 0,
    top: 0,
  },
]
for (const cell of cells) {
  const left = LEFT + GUIDANCES.indexOf(cell.guidance) * (CELL_W + GAP)
  const top = TOP + SIZES.indexOf(cell.size) * (CELL_H + GAP)
  const input = cell.file
    ? await sharp(cell.file).resize(CELL_W, CELL_H, { fit: 'contain', background: '#222' }).toBuffer()
    : Buffer.from(
        `<svg width="${CELL_W}" height="${CELL_H}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#400"/>` +
          `<text x="12" y="30" font-family="Arial" font-size="16" fill="#fff">failed: ${esc((cell.error ?? '').slice(0, 40))}</text></svg>`,
      )
  composites.push({ input, left, top })
}

const sheet = join(here, 'out', 'klein-grid.png')
await sharp({ create: { width: sheetW, height: sheetH, channels: 3, background: '#111' } })
  .composite(composites)
  .png()
  .toFile(sheet)
console.log(`\nsaved contact sheet ${join('scripts', 'out', 'klein-grid.png')}`)
console.log(`estimated total ~${totalNeurons.toFixed(2)} neurons (free tier: 10,000/day)`)
