import sharp from 'sharp'
import { runModel, sniffImageType } from '../cloudflare.js'
import type { Provider } from './types.js'

const MODEL = '@cf/black-forest-labs/flux-2-klein-4b'

// Settings from scripts/klein-grid.ts (see DECISIONS.md, "Model validation"):
// guidance 5 (no gain above it), 512px input (docs limit; bigger cost more and wasn't better),
// fixed 768x1024 output (the output is ~95% of the neuron cost).
const DEFAULT_GUIDANCE = 5
const MAX_INPUT_SIDE = 512
const OUT_W = 768
const OUT_H = 1024

// Image + prompt -> image. klein only accepts multipart: prompt, input_image_0..3, width, height, guidance, seed.
export const cloudflareEdit: Provider = {
  model: MODEL,
  async generate(job) {
    if (!job.inputUrl) throw new Error('Effect jobs need an input image')
    const res = await fetch(job.inputUrl, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) throw new Error(`Could not fetch input image: HTTP ${res.status}`)

    // rotate() applies EXIF orientation so phone portraits aren't sent sideways.
    const input = await sharp(Buffer.from(await res.arrayBuffer()))
      .rotate()
      .resize({ width: MAX_INPUT_SIDE, height: MAX_INPUT_SIDE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer()

    const form = new FormData()
    form.append('prompt', job.prompt)
    form.append('input_image_0', new Blob([new Uint8Array(input)], { type: 'image/jpeg' }), 'input.jpg')
    form.append('width', String(OUT_W))
    form.append('height', String(OUT_H))
    form.append('guidance', String(job.params.guidance ?? DEFAULT_GUIDANCE))
    if (job.params.seed !== undefined) form.append('seed', String(job.params.seed))

    const result = await runModel<{ image: string }>(MODEL, form)
    const buffer = Buffer.from(result.image, 'base64')
    return { buffer, contentType: sniffImageType(buffer) }
  },
}
