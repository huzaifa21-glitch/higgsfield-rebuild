import { runModel, sniffImageType } from '../cloudflare.js'
import type { Provider } from './types.js'

const MODEL = '@cf/black-forest-labs/flux-1-schnell'

// Text -> image. flux-1-schnell takes JSON and returns { image: base64 }.
export const cloudflareImage: Provider = {
  model: MODEL,
  async generate(job) {
    const result = await runModel<{ image: string }>(
      MODEL,
      JSON.stringify({ prompt: job.prompt, steps: 4, ...(job.params.seed !== undefined && { seed: job.params.seed }) }),
      'application/json',
    )
    const buffer = Buffer.from(result.image, 'base64')
    return { buffer, contentType: sniffImageType(buffer) }
  },
}
