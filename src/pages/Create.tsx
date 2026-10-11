import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useLocation } from 'react-router-dom'
import JobCard from '../components/create/JobCard.tsx'
import ReferenceInput, { type Reference } from '../components/create/ReferenceInput.tsx'
import { ASPECTS, requestAssist, type Aspect, type AssistResult, type Job, type JobType } from '../lib/api.ts'
import CharacterPicker from '../components/characters/CharacterPicker.tsx'
import { useCharacters } from '../lib/charactersContext.ts'
import { useJobs } from '../lib/jobsContext.ts'
import type { CreatePrefill } from '../lib/prefill.ts'
import './Create.css'

type Mode = 'image' | 'video'

const EXAMPLES = [
  'A red fox curled up asleep in a snowy forest at dawn, soft golden light',
  'A tiny astronaut eating ramen at a neon street stall in Tokyo, rain, 35mm film',
  'A lighthouse on a rocky cliff at sunset, waves crashing, cinematic',
  'A ceramic teapot shaped like a sleeping cat, studio product photo, pastel background',
]

const ASSIST_KEY = 'create.promptAssist'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)

function readAssistPref() {
  try {
    return localStorage.getItem(ASSIST_KEY) !== 'off'
  } catch {
    return true
  }
}

const credits = (n: number) => `${n} ${n === 1 ? 'credit' : 'credits'}`

function AspectIcon({ aspect }: { aspect: Aspect }) {
  const [w, h] = aspect === '1:1' ? [12, 12] : aspect === '3:4' ? [10, 13] : [15, 9]
  return <span className="aspect-icon" style={{ width: w, height: h }} aria-hidden="true" />
}

function Create() {
  const { jobs, credits: balance, costs, createJob } = useJobs()
  const { characters } = useCharacters()
  // Remix / Use as reference from the Library arrive as router state with the exact settings to restore.
  const prefill = (useLocation().state as { prefill?: CreatePrefill } | null)?.prefill
  const [mode, setMode] = useState<Mode>(prefill?.mode ?? 'image')
  const [prompt, setPrompt] = useState(prefill?.prompt ?? '')
  const [aspect, setAspect] = useState<Aspect>(prefill?.aspect ?? '1:1')
  const [reference, setReference] = useState<Reference | null>(prefill?.reference ?? null)
  const [assistOn, setAssistOn] = useState(readAssistPref)
  const [assist, setAssist] = useState<{ loading: boolean; result?: AssistResult }>({ loading: false })
  // The rewrite the user explicitly chose with "Use". Cleared as soon as they edit the prompt.
  const [accepted, setAccepted] = useState<string | null>(prefill?.enhanced_prompt ?? null)
  const [message, setMessage] = useState<string | null>(null)
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const latestPrompt = useRef(prompt)

  const type: JobType = mode === 'video' ? 'video' : reference ? 'effect' : 'image'
  const cost = costs?.[type]
  const known = balance !== null && cost !== undefined
  const canAfford = known && balance >= cost
  const ready = mode === 'video' ? reference !== null : prompt.trim().length > 0

  // A cheaper option that fits the balance, offered inline instead of any paywall.
  let cheaper: { label: string; apply: () => void } | null = null
  if (known && !canAfford && costs) {
    if (mode === 'video' && reference && balance >= costs.effect) {
      cheaper = { label: `Try Image instead · ${credits(costs.effect)}`, apply: () => setMode('image') }
    } else if (mode === 'video' && balance >= costs.image) {
      cheaper = {
        label: `Try Image instead · ${credits(costs.image)}`,
        apply: () => {
          setMode('image')
          setReference(null)
        },
      }
    } else if (mode === 'image' && reference && balance >= costs.image) {
      cheaper = { label: `Try without reference · ${credits(costs.image)}`, apply: () => setReference(null) }
    }
  }

  function changePrompt(value: string) {
    setPrompt(value)
    latestPrompt.current = value
    setAccepted(null)
    setAssist({ loading: false })
  }

  function toggleAssist(on: boolean) {
    setAssistOn(on)
    setAssist({ loading: false })
    setAccepted(null)
    try {
      localStorage.setItem(ASSIST_KEY, on ? 'on' : 'off')
    } catch {
      // Preference just won't persist.
    }
  }

  async function enhance() {
    const text = prompt.trim()
    if (!text) return
    setAssist({ loading: true })
    const result = await requestAssist(text, mode)
    // Ignore a late answer if the prompt changed while waiting.
    if (latestPrompt.current.trim() === text) setAssist({ loading: false, result })
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    if (!ready || !canAfford) return
    setMessage(null)
    const result = await createJob({
      type,
      prompt: prompt.trim(),
      enhanced_prompt: accepted ?? undefined,
      params: mode === 'image' ? { aspect } : undefined,
      input_image: reference?.kind === 'upload' ? reference.dataUrl : undefined,
      parent_job_id: reference?.kind === 'job' ? reference.jobId : undefined,
      character_id: reference?.kind === 'character' ? reference.characterId : undefined,
    })
    if (!result.ok) {
      setMessage(
        result.status === 402
          ? `That needs ${credits(result.cost ?? 0)} and you have ${result.credits ?? 0}.`
          : result.error,
      )
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void submit()
    }
  }

  function pickReference(job: Job) {
    setReference({ kind: 'job', jobId: job.id, url: job.output_url! })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function pickExample(text: string) {
    setMode('image')
    changePrompt(text)
    promptRef.current?.focus()
  }

  const suggestion = assist.result
  const buttonLabel =
    known && !canAfford ? `Need ${credits(cost)} · you have ${balance}` : `Generate · ${cost === undefined ? '…' : credits(cost)}`

  return (
    <div className="create">
      <form className="panel" onSubmit={submit}>
        <div className="tabs" role="tablist" aria-label="Mode">
          {(['image', 'video'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              className={mode === m ? 'active' : ''}
              onClick={() => setMode(m)}
            >
              {m === 'image' ? 'Image' : 'Video'}
            </button>
          ))}
        </div>

        <div className="field">
          <label htmlFor="prompt">{mode === 'video' ? 'Motion (optional)' : 'Prompt'}</label>
          <textarea
            id="prompt"
            ref={promptRef}
            value={prompt}
            onChange={(e) => changePrompt(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={mode === 'video' ? 'Describe how it should move' : 'Describe what you want to see'}
            rows={5}
            maxLength={1000}
          />
          <div className="assist-row">
            <label className="switch">
              <input type="checkbox" checked={assistOn} onChange={(e) => toggleAssist(e.target.checked)} />
              <span className="switch-track" aria-hidden="true" />
              Prompt Assist
            </label>
            {assistOn && (
              <button
                type="button"
                className="ghost-btn"
                onClick={enhance}
                disabled={!prompt.trim() || assist.loading}
              >
                {assist.loading ? 'Enhancing…' : 'Enhance'}
              </button>
            )}
            <span className="hint">
              <kbd>{isMac ? "⌘" : "Ctrl"}</kbd>
              <kbd>Enter</kbd>
            </span>
          </div>

          {suggestion && suggestion.changed && (
            <div className="assist-card">
              <span className="tag">Suggested</span>
              <p>{suggestion.prompt}</p>
              {suggestion.notes?.map((note) => (
                <small key={note} className="assist-note">
                  {note}
                </small>
              ))}
              <div className="assist-actions">
                <button
                  type="button"
                  className="primary-sm"
                  onClick={() => {
                    setAccepted(suggestion.prompt)
                    setAssist({ loading: false })
                  }}
                >
                  Use
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => {
                    changePrompt(suggestion.prompt)
                    promptRef.current?.focus()
                  }}
                >
                  Edit
                </button>
                <button type="button" className="ghost-btn" onClick={() => setAssist({ loading: false })}>
                  Keep original
                </button>
              </div>
            </div>
          )}
          {suggestion && !suggestion.changed && (
            <div className="assist-card quiet">
              <p>
                {suggestion.reason === 'error'
                  ? "Prompt Assist isn't available right now. Your prompt is unchanged."
                  : suggestion.reason === 'invented'
                    ? "Prompt Assist couldn't improve this without adding things you didn't ask for, so it kept your words."
                    : 'Your prompt already reads clearly. Nothing to change.'}
              </p>
              <button type="button" className="ghost-btn" onClick={() => setAssist({ loading: false })}>
                OK
              </button>
            </div>
          )}
          {accepted && (
            <div className="assist-card accepted">
              <span className="tag">Generating with</span>
              <p>{accepted}</p>
              <button type="button" className="ghost-btn" onClick={() => setAccepted(null)}>
                Undo
              </button>
            </div>
          )}
        </div>

        {mode === 'image' && (
          <div className="field">
            <span className="label">Aspect ratio</span>
            <div className="segmented">
              {ASPECTS.map((a) => (
                <button key={a} type="button" className={aspect === a ? 'active' : ''} onClick={() => setAspect(a)}>
                  <AspectIcon aspect={a} />
                  {a}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="field">
          <span className="label">
            {mode === 'video' ? 'Image to animate' : 'Reference image'}
            {mode === 'image' && <span className="optional">optional</span>}
          </span>
          <CharacterPicker
            characters={characters}
            selectedId={reference?.kind === 'character' ? reference.characterId : null}
            onPick={(c) => setReference({ kind: 'character', characterId: c.id, url: c.image_url, name: c.name })}
            label="Use a character"
          />
          <ReferenceInput
            value={reference}
            onChange={setReference}
            label={mode === 'video' ? 'Add the image to animate' : 'Add a reference'}
          />
        </div>

        <div className="generate">
          <button type="submit" className={`primary${known && !canAfford ? ' short' : ''}`} disabled={!ready || !canAfford}>
            {buttonLabel}
          </button>
          {cheaper && (
            <button type="button" className="cheaper" onClick={cheaper.apply}>
              {cheaper.label}
            </button>
          )}
          {known && !canAfford && !cheaper && <p className="hint-line">You're out of credits for now.</p>}
          {mode === 'video' && !reference && <p className="hint-line">Add an image to animate.</p>}
          {message && <p className="field-error">{message}</p>}
        </div>
      </form>

      <section className="results" aria-label="Results" aria-live="polite">
        {jobs.length === 0 ? (
          <div className="empty">
            <h1>What do you want to make?</h1>
            <p>Pick an example to start, or write your own.</p>
            <div className="examples">
              {EXAMPLES.map((text) => (
                <button key={text} type="button" className="example" onClick={() => pickExample(text)}>
                  {text}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="feed">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} onUseAsReference={pickReference} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default Create
