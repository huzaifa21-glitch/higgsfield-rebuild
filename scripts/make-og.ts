// Builds public/og.png (1200x630 social preview) from the effect gallery previews. No AI calls.
// Run: node scripts/make-og.ts

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
process.loadEnvFile(join(root, '.env.local'))
const base = `${new URL(process.env.VITE_SUPABASE_URL!).origin}/storage/v1/object/public/outputs/presets`

const W = 1200
const H = 630
const TILE_W = 150
const TILE_H = 200
const tiles = ['base', 'film-noir', 'anime', 'cyberpunk', 'claymation', 'comic-book']

const images = await Promise.all(
  tiles.map(async (id) => {
    const res = await fetch(`${base}/${id}.webp`)
    if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`)
    return sharp(Buffer.from(await res.arrayBuffer())).resize(TILE_W, TILE_H).png().toBuffer()
  }),
)

// Two rows of three on the right; the first tile is the "before".
const left = W - 3 * TILE_W - 2 * 14 - 64
const composites = images.map((input, i) => ({
  input,
  left: left + (i % 3) * (TILE_W + 14),
  top: 101 + Math.floor(i / 3) * (TILE_H + 28),
}))

const text = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9a76"/><stop offset="1" stop-color="#ff5f45"/></linearGradient>
  </defs>
  <circle cx="98" cy="128" r="22" fill="#ededf0" opacity="0.92"/>
  <rect x="102" y="106" width="44" height="44" rx="12" fill="url(#g)"/>
  <text x="64" y="270" font-family="Segoe UI, Arial, sans-serif" font-size="96" font-weight="700" fill="#ffffff" letter-spacing="-3">Morph</text>
  <text x="64" y="330" font-family="Segoe UI, Arial, sans-serif" font-size="34" fill="#ededf0">Turn any photo into…</text>
  <text x="64" y="386" font-family="Segoe UI, Arial, sans-serif" font-size="24" fill="#8d8d97">Film noir, anime, claymation and more.</text>
  <text x="64" y="420" font-family="Segoe UI, Arial, sans-serif" font-size="24" fill="#8d8d97">Upload once, try them all.</text>
  <text x="${left}" y="${101 + TILE_H + 20}" font-family="Segoe UI, Arial, sans-serif" font-size="15" fill="#ff7a59" font-weight="600">BEFORE</text>
</svg>`

await sharp({ create: { width: W, height: H, channels: 3, background: '#0c0c0e' } })
  .composite([{ input: Buffer.from(text), left: 0, top: 0 }, ...composites])
  .png({ compressionLevel: 9 })
  .toFile(join(root, 'public', 'og.png'))
console.log('wrote public/og.png')
