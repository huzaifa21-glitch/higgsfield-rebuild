import { json, route } from './_lib/http.js'
import { assistPrompt, type AssistMode } from './_lib/providers/prompt-assist.js'
import { getSession } from './_lib/session.js'

const MAX_PROMPT = 1000

// Prompt Assist preview. Returns a suggestion only: the user picks Use / Edit / Keep original
// on the client, and the chosen text is sent with the job. Free (no credits); costs ~1 neuron.
export const POST = route(async (request) => {
  const { setCookie } = await getSession(request)
  const body = (await request.json().catch(() => null)) as { prompt?: unknown; mode?: unknown } | null
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : ''
  if (!prompt) return json({ error: 'prompt is required' }, 400, setCookie)
  if (prompt.length > MAX_PROMPT) return json({ error: `prompt must be at most ${MAX_PROMPT} characters` }, 400, setCookie)

  // Image mode turns camera language ("drone shot", "slow pan") into what a still image can show.
  const mode: AssistMode = body?.mode === 'video' ? 'video' : 'image'
  return json(await assistPrompt(prompt, mode), 200, setCookie)
})
