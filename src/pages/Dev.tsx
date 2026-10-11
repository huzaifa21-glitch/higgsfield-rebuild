import { useState, type FormEvent } from 'react'
import { fileToDataUrl, type JobType } from '../lib/api.ts'
import { useJobs } from '../lib/useJobs.ts'

// Bare pipeline test page: not linked from the nav.
function Dev() {
  const { jobs, credits, costs, error, live, createJob } = useJobs()
  const [type, setType] = useState<JobType>('image')
  const [prompt, setPrompt] = useState('')
  const [assist, setAssist] = useState(false)
  const [guidance, setGuidance] = useState('5')
  const [file, setFile] = useState<File | null>(null)
  const [parentId, setParentId] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const cost = costs?.[type]
  const canAfford = credits !== null && cost !== undefined && credits >= cost
  const sources = jobs.filter((j) => j.status === 'done' && j.type !== 'video' && j.output_url)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      const result = await createJob({
        type,
        prompt,
        assist,
        params: type === 'effect' ? { guidance: Number(guidance) } : undefined,
        input_image: type !== 'image' && file && !parentId ? await fileToDataUrl(file) : undefined,
        parent_job_id: type !== 'image' && parentId ? parentId : undefined,
      })
      if (!result.ok) {
        setMessage(
          result.status === 402
            ? `Not enough credits: this costs ${result.cost}, you have ${result.credits}.`
            : `Error ${result.status}: ${result.error}`,
        )
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="dev">
      <h1>Pipeline test</h1>
      <p>
        Credits: <strong>{credits ?? '…'}</strong> · Realtime: {live ? 'connected' : 'not connected'}
        {error && <span className="dev-error"> · {error}</span>}
      </p>

      <form onSubmit={submit} className="dev-form">
        <label>
          Type{' '}
          <select value={type} onChange={(e) => setType(e.target.value as JobType)}>
            {(['image', 'effect', 'video'] as const).map((t) => (
              <option key={t} value={t}>
                {t} ({costs?.[t] ?? '?'} credits)
              </option>
            ))}
          </select>
        </label>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={type === 'video' ? 'Optional motion prompt' : 'Prompt'}
          rows={3}
          maxLength={1000}
        />

        <label>
          <input type="checkbox" checked={assist} onChange={(e) => setAssist(e.target.checked)} /> Prompt Assist
        </label>

        {type === 'effect' && (
          <label>
            Guidance <input type="number" min={1} max={10} step={0.5} value={guidance} onChange={(e) => setGuidance(e.target.value)} />
          </label>
        )}

        {type !== 'image' && (
          <div className="dev-input">
            <label>
              Upload <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <label>
              or use a previous output{' '}
              <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">(none)</option>
                {sources.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.type} · {j.prompt.slice(0, 40) || j.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <button type="submit" disabled={busy || !canAfford}>
          {canAfford || credits === null ? `Generate · ${cost ?? '?'} credits` : `Need ${cost} credits (you have ${credits})`}
        </button>
        {message && <p className="dev-error">{message}</p>}
      </form>

      <ul className="dev-jobs">
        {jobs.map((j) => (
          <li key={j.id} className={`dev-job status-${j.status}`}>
            <div>
              <strong>{j.status}</strong> · {j.type} · {j.cost} cr · {j.model}
              {j.is_demo && ' · DEMO'} · {new Date(j.created_at).toLocaleTimeString()}
            </div>
            {j.prompt && <div>Prompt: {j.prompt}</div>}
            {j.enhanced_prompt && <div>Assisted: {j.enhanced_prompt}</div>}
            {j.error && <div className="dev-error">Error: {j.error}</div>}
            <div className="dev-media">
              {j.input_url && <img src={j.input_url} alt="input" />}
              {j.output_url &&
                (j.type === 'video' ? (
                  <video src={j.output_url} controls muted loop autoPlay playsInline />
                ) : (
                  <img src={j.output_url} alt="output" />
                ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default Dev
