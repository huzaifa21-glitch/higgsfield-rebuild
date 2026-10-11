import sharp from 'sharp'
import { runModel, sniffImageType } from '../cloudflare.js'
import { ASPECT_SIZES, type Provider } from './types.js'

const MODEL = '@cf/black-forest-labs/flux-1-schnell'

// Text -> image. flux-1-schnell accepts only { prompt, steps } (it rejects seed and has no size options)
// and always returns a 1024x1024 JPEG. Other aspects are cropped with sharp's attention strategy,
// which keeps the most salient region. klein can render other sizes natively, but measured 13-17s
// for text->image against ~2s here.
export const cloudflareImage: Provider = {
  model: MODEL,
  async generate(job) {
    const result = await runModel<{ image: string }>(MODEL, JSON.stringify({ prompt: job.prompt, steps: 4 }), 'application/json')
    const square = Buffer.from(result.image, 'base64')

    const aspect = job.params.aspect ?? '1:1'
    if (aspect === '1:1') return { buffer: square, contentType: sniffImageType(square) }

    const { width, height } = ASPECT_SIZES[aspect]
    const buffer = await sharp(square)
      .resize(width, height, { fit: 'cover', position: sharp.strategy.attention })
      .jpeg({ quality: 92 })
      .toBuffer()
    return { buffer, contentType: 'image/jpeg' }
  },
}
