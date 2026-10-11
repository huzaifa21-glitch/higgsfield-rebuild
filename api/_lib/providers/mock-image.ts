import { OUTPUTS_BUCKET, db } from '../supabase.js'
import type { Provider } from './types.js'

const SAMPLES_DIR = 'samples/images'
const IMAGE_EXT = /\.(webp|jpe?g|png)$/i

// Fallback while Workers AI is out of free capacity (see flags.ts). Effects return the preset's own
// gallery preview, which at least shows the style; other images return a pre-made sample.
// Never used for normal traffic.
export const mockImage: Provider = {
  model: 'mock-image',
  async generate(job) {
    await new Promise((resolve) => setTimeout(resolve, 1200 + Math.random() * 800))

    if (job.presetId) {
      const { data } = await db().from('presets').select('preview_url').eq('id', job.presetId).maybeSingle()
      if (data?.preview_url) return { url: data.preview_url, isDemo: true }
    }

    const { data, error } = await db().storage.from(OUTPUTS_BUCKET).list(SAMPLES_DIR, { limit: 100 })
    if (error) throw error
    const samples = data.filter((f) => IMAGE_EXT.test(f.name))
    if (samples.length > 0) {
      const pick = samples[Math.floor(Math.random() * samples.length)]
      return { url: db().storage.from(OUTPUTS_BUCKET).getPublicUrl(`${SAMPLES_DIR}/${pick.name}`).data.publicUrl, isDemo: true }
    }

    // Last resort: any effect preview.
    const { data: presets } = await db().from('presets').select('preview_url').not('preview_url', 'is', null).limit(8)
    const url = presets?.[Math.floor(Math.random() * presets.length)]?.preview_url
    if (!url) throw new Error('No demo images available')
    return { url, isDemo: true }
  },
}
