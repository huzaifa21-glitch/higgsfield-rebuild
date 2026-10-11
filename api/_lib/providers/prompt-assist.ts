import { runModel } from '../cloudflare.js'

const MODEL = '@cf/meta/llama-3.2-3b-instruct'

export type AssistMode = 'image' | 'video'

const SYSTEM_BASE = [
  'You reorder and clarify image-generation prompts. You do not add content.',
  'Put the main subject first, then what it is doing, then the setting, then style and mood.',
  'Use only the subjects, objects, places, colors, styles and moods the user wrote.',
  'Never introduce a new subject, object, place, time of day, color, lighting or style.',
  'You may fix spelling, remove filler words like "ok so like" or "i guess", and add small connecting words.',
  'If the prompt is too vague or short to improve without guessing, reply with it exactly as written.',
  'Reply with the prompt only: one line, no quotes, no explanation.',
]

const SYSTEM: Record<AssistMode, string> = {
  image: [
    ...SYSTEM_BASE,
    'This is for a single still image: describe what is visible. Viewpoints like "aerial view from above" describe',
    'the framing, not an object in the picture. Never mention cameras, drones or camera movement.',
  ].join(' '),
  video: [...SYSTEM_BASE, 'This is for a video: keep any camera movement the user wrote.'].join(' '),
}

// ---------- Camera language -> still-image language (image mode only) ----------
// Done with fixed rules rather than the model: the 3B model turned "drone shot" into "a drone is flying",
// and the image model then drew a drone in the frame.

const ADVERB = '(?:slowly|gently|smoothly|quickly|rapidly|steadily)'
const MOTION = '(?:flying|flies|fly|gliding|glides|soaring|soars|sweeping|sweeps|moving|moves|cruising|cruises|drifting|drifts|hovering|hovers)'

// A viewpoint phrase also takes the preposition after it ("drone shot over"), so it can move to the end.
const PREP = '(?:\\s+(?:over|across|above|of|through|into|toward|towards|around|along))?'

// Phrases that describe a viewpoint: rewritten as what the still image shows, and moved after the subject.
const CONVERSIONS: [RegExp, string][] = [
  [
    new RegExp(`\\b(?:an?\\s+)?(?:fpv\\s+)?drone\\s+(?:shot|footage|view|video|camera|perspective)(?:\\s+${ADVERB})?(?:\\s+${MOTION})?${PREP}`, 'gi'),
    'aerial view from above',
  ],
  [new RegExp(`\\b(?:an?\\s+)?(?:aerial|helicopter)\\s+(?:shot|footage)(?:\\s+${ADVERB})?(?:\\s+${MOTION})?${PREP}`, 'gi'), 'aerial view'],
  [new RegExp(`\\b(?:a\\s+)?(?:pov|first[- ]person)\\s+shot${PREP}`, 'gi'), 'first-person view'],
  [new RegExp(`\\b(?:a\\s+)?(?:wide|establishing)\\s+shot${PREP}`, 'gi'), 'wide view'],
  [new RegExp(`\\b(?:an?\\s+)?over[- ]the[- ]shoulder\\s+shot${PREP}`, 'gi'), 'seen from over the shoulder'],
]

// Pure camera movement: nothing to show in a still, so drop it.
const DROPS: RegExp[] = [
  new RegExp(`\\bcamera\\s+(?:${ADVERB}\\s+)?(?:pans|moves|pushes\\s+in|pulls\\s+back|orbits|tilts|tracks|rotates|zooms\\s+(?:in|out))(?:\\s+(?:on|to|toward|towards|around|across|over))?`, 'gi'),
  /\b(?:a\s+)?(?:slow|smooth|quick|camera)\s+pan(?:s|ning)?(?:\s+(?:shot|left|right|up|down|across))?\b/gi,
  /\bpan(?:ning)?\s+(?:shot|left|right|up|down|across)\b/gi,
  /\bpanning\b/gi,
  /\b(?:a\s+)?(?:slow\s+)?tracking\s+shot\b/gi,
  /\b(?:a\s+)?(?:slow\s+)?dolly(?:\s+(?:in|out|zoom|shot))?\b/gi,
  /\b(?:slow\s+)?zoom(?:s|ing)?\s+(?:in|out)\b/gi,
  /\b(?:in\s+)?slow[- ]?motion\b/gi,
  /\b(?:a\s+)?time[- ]?lapse(?:\s+of)?\b/gi,
  /\b(?:slow\s+)?push[- ]in\b/gi,
  /\b(?:slow\s+)?pull[- ]back\b/gi,
  /\b(?:an?\s+)?orbit(?:ing)?\s+shot\b/gi,
  /\bhandheld\s+(?:shot|camera|footage)\b/gi,
  /\bsteadicam(?:\s+shot)?\b/gi,
]

function tidy(text: string) {
  return text
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;])/g, '$1')
    .replace(/([,;])\s*(?=[,;.])/g, '')
    .replace(/^[\s,;.]+|[\s,;]+$/g, '')
    .trim()
}

// Rewrites camera language for a still image. notes describe each change for the UI.
export function toStill(prompt: string): { text: string; notes: string[] } {
  const notes: string[] = []
  const views: string[] = []
  let text = prompt
  for (const [re, replacement] of CONVERSIONS) {
    text = text.replace(re, (match) => {
      notes.push(`"${match.trim()}" → "${replacement}"`)
      if (!views.includes(replacement)) views.push(replacement)
      return ''
    })
  }
  for (const re of DROPS) {
    text = text.replace(re, (match) => {
      notes.push(`"${match.trim()}" removed (camera movement)`)
      return ''
    })
  }
  if (!notes.length) return { text: prompt, notes }
  // Subject first, viewpoint last: "A misty mountain lake at sunrise, aerial view from above".
  const still = [tidy(text), ...views].filter(Boolean).join(', ')
  return { text: still.charAt(0).toUpperCase() + still.slice(1), notes }
}

// ---------- Guard against invented content ----------

// Words a pure reordering may legitimately introduce. Anything else new counts as invented.
const CONNECTORS = new Set(
  (
    'the and with from into onto over under near beside behind among amid amidst against through across ' +
    'while its their his her this that there which who whose are has have being been holding standing sitting ' +
    'lying wearing surrounded featuring set scene style background foreground front side'
  ).split(' '),
)

const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, '')

function words(text: string) {
  return (text.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => w.length >= 3)
}

// Content words in the rewrite that never appear (by rough stem) in the original.
export function inventedWords(original: string, rewrite: string) {
  const known = new Set(words(original).map(stem))
  return [...new Set(words(rewrite))].filter((w) => !CONNECTORS.has(w) && !known.has(stem(w)))
}

export type AssistResult = {
  prompt: string
  changed: boolean
  reason?: 'unchanged' | 'invented' | 'error'
  notes?: string[]
}

// Never throws. The caller shows the result to the user, who decides whether to use it.
// In image mode, camera language is converted first; if the model then fails or invents content,
// the converted prompt (if anything changed) is returned instead of the model's rewrite.
export async function assistPrompt(original: string, mode: AssistMode = 'image'): Promise<AssistResult> {
  const { text: base, notes } = mode === 'image' ? toStill(original) : { text: original, notes: [] }
  const fallback = (reason: AssistResult['reason']): AssistResult =>
    notes.length ? { prompt: base, changed: true, notes } : { prompt: original, changed: false, reason }

  try {
    const result = await runModel<{ response: string }>(
      MODEL,
      JSON.stringify({
        messages: [
          { role: 'system', content: SYSTEM[mode] },
          { role: 'user', content: base },
        ],
        max_tokens: 200,
        temperature: 0.1,
      }),
      'application/json',
      10_000,
    )
    const text = String(result.response ?? '')
      .trim()
      .replace(/^(here('s| is)[^:]*:)\s*/i, '')
      .replace(/^["'“]+|["'”]+$/g, '')
      .split('\n')[0]
      .trim()

    if (!text || text.toLowerCase() === base.trim().toLowerCase()) return fallback('unchanged')
    // Checked against the converted prompt, so the model can't bring back a dropped "drone" or "pan".
    // A reordering shouldn't need more than one new content word (e.g. "lit" in "neon-lit").
    const invented = inventedWords(base, text)
    if (invented.length > 1) {
      console.info('prompt assist rejected a rewrite that added:', invented.join(', '), '|', text)
      return fallback('invented')
    }
    return { prompt: text, changed: true, ...(notes.length && { notes }) }
  } catch (err) {
    console.error('prompt assist failed', err)
    return fallback('error')
  }
}
