import sharp from 'sharp'
import { runModel, sniffImageType } from '../cloudflare.js'
import { JobError } from '../errors.js'
import { ASPECT_SIZES, type Provider } from './types.js'

const MODEL = '@cf/black-forest-labs/flux-2-klein-4b'

// Settings from scripts/klein-grid.ts (see DECISIONS.md, "Model validation"):
// guidance 5 (no gain above it), 512px input (docs limit; bigger cost more and wasn't better),
// output size from the job aspect (default 3:4), always <= 4 tiles since the output is ~95% of the cost.
const DEFAULT_GUIDANCE = 5
const MAX_INPUT_SIDE = 512

// Image + prompt -> image. klein only accepts multipart: prompt, input_image_0..3, width, height, guidance, seed.
export const cloudflareEdit: Provider = {
  model: MODEL,
  async generate(job) {
    if (!job.inputUrl) throw new JobError('invalid_input', 'Effect jobs need an input image')
    const res = await fetch(job.inputUrl, { signal: AbortSignal.timeout(15_000) }).catch((err: unknown) => {
      throw new JobError('provider_error', `Could not fetch input image: ${String(err)}`)
    })
    if (!res.ok) throw new JobError('invalid_input', `Could not fetch input image: HTTP ${res.status}`)

    // rotate() applies EXIF orientation so phone portraits aren't sent sideways.
    const input = await sharp(Buffer.from(await res.arrayBuffer()))
      .rotate()
      .resize({ width: MAX_INPUT_SIDE, height: MAX_INPUT_SIDE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer()
      .catch((err: unknown) => {
        throw new JobError('invalid_input', `Unreadable input image: ${String(err)}`)
      })

    const { width, height } = ASPECT_SIZES[job.params.aspect ?? '3:4']
    const form = new FormData()
    form.append('prompt', job.prompt)
    form.append('input_image_0', new Blob([new Uint8Array(input)], { type: 'image/jpeg' }), 'input.jpg')
    form.append('width', String(width))
    form.append('height', String(height))
    form.append('guidance', String(job.params.guidance ?? DEFAULT_GUIDANCE))
    if (job.params.seed !== undefined) form.append('seed', String(job.params.seed))

    const result = await runModel<{ image: string }>(MODEL, form)
    const buffer = Buffer.from(result.image, 'base64')
    return { buffer, contentType: sniffImageType(buffer) }
  },
}
