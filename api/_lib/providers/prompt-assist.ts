import { runModel } from '../cloudflare.js'

const MODEL = '@cf/meta/llama-3.2-3b-instruct'

const SYSTEM = [
  'You rewrite image-generation prompts so the core subject comes first.',
  'Order: main subject, what it is doing, setting, then style and lighting.',
  'Keep every concrete detail from the original. Remove filler words.',
  'Never add new subjects, objects, people, animals or places that are not in the original.',
  'Reply with the rewritten prompt only: one line, no quotes, no explanation.',
].join(' ')

// Returns the rewritten prompt, or null if the model fails or replies with something unusable.
// Prompt Assist is a nice-to-have, so callers should fall back to the original prompt on null.
export async function assistPrompt(prompt: string): Promise<string | null> {
  try {
    const result = await runModel<{ response: string }>(
      MODEL,
      JSON.stringify({
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: prompt },
        ],
        max_tokens: 200,
        temperature: 0.2,
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
    // A rewrite that is empty or far longer than the original has probably invented content.
    if (!text || text.length > prompt.length * 2 + 100) return null
    return text
  } catch (err) {
    console.error('prompt assist failed', err)
    return null
  }
}
