import { OUTPUTS_BUCKET, db } from '../supabase.js'
import { JobError } from '../errors.js'
import type { Provider } from './types.js'

const SAMPLES_DIR = 'samples'
const VIDEO_EXT = /\.(mp4|webm|mov)$/i

// Image -> video stand-in: no real video model fits the zero budget (see DECISIONS.md).
// Waits like a real provider would, then returns a pre-made clip from outputs/samples/, marked as a demo.
export const mockVideo: Provider = {
  model: 'mock-video',
  async generate(job) {
    if (!job.inputUrl) throw new JobError('invalid_input', 'Video jobs need an input image')

    const { data, error } = await db().storage.from(OUTPUTS_BUCKET).list(SAMPLES_DIR, { limit: 100 })
    if (error) throw error
    const clips = data.filter((f) => VIDEO_EXT.test(f.name))
    if (clips.length === 0) throw new JobError('no_samples', `No sample clips in ${OUTPUTS_BUCKET}/${SAMPLES_DIR}/`)

    await new Promise((resolve) => setTimeout(resolve, 6_000 + Math.random() * 4_000))

    const clip = clips[Math.floor(Math.random() * clips.length)]
    const { data: pub } = db().storage.from(OUTPUTS_BUCKET).getPublicUrl(`${SAMPLES_DIR}/${clip.name}`)
    return { url: pub.publicUrl, isDemo: true }
  },
}
