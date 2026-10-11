import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { downloadUrl, type Job } from '../../lib/api.ts'
import { useJobs } from '../../lib/jobsContext.ts'
import { friendlyError, generationSeconds, jobKind, jobTitle, modelName } from '../../lib/jobText.ts'
import { useCharacters } from '../../lib/charactersContext.ts'
import { usePhoto } from '../../lib/photoContext.ts'
import { urlToDataUrl, type CreatePrefill } from '../../lib/prefill.ts'
import { usePresets } from '../../lib/usePresets.ts'
import DemoBadge from '../DemoBadge.tsx'
import type { Reference } from '../create/ReferenceInput.tsx'

const credits = (n: number) => `${n} ${n === 1 ? 'credit' : 'credits'}`

type Props = {
  job: Job
  onClose: () => void
  onOpenJob: (id: string) => void
}

function JobDetail({ job, onClose, onOpenJob }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const navigate = useNavigate()
  const { jobs, credits: balance, costs, createJob } = useJobs()
  const { presets } = usePresets()
  const { setPhoto } = usePhoto()
  const { characters } = useCharacters()
  const character = job.character_id ? characters.find((c) => c.id === job.character_id) : undefined
  const characterRef: Reference | null = character
    ? { kind: 'character', characterId: character.id, url: character.image_url, name: character.name }
    : null
  const [busy, setBusy] = useState<'remix' | 'animate' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  const preset = job.preset_id ? presets?.find((p) => p.id === job.preset_id) : undefined
  const parent = job.parent_job_id ? jobs.find((j) => j.id === job.parent_job_id) : undefined
  const done = job.status === 'done' && job.output_url
  const pending = job.status === 'queued' || job.status === 'running'
  const took = generationSeconds(job)
  const videoCost = costs?.video ?? 5
  const canAnimate = balance !== null && balance >= videoCost
  const isImage = job.type !== 'video'

  async function remix() {
    setBusy('remix')
    setMessage(null)
    try {
      if (job.preset_id) {
        // Effects: the same preset on the same photo; the user confirms with "Apply effect".
        if (characterRef) setPhoto(characterRef)
        else if (job.input_url) setPhoto({ kind: 'upload', dataUrl: await urlToDataUrl(job.input_url), name: 'Photo from your library' })
        navigate(`/effects/${job.preset_id}`)
        return
      }
      // Prefer the character (the remix keeps character_id), then the parent output, then the original upload.
      let reference: Reference | null = characterRef
      if (!reference && job.parent_job_id && job.input_url) reference = { kind: 'job', jobId: job.parent_job_id, url: job.input_url }
      else if (!reference && job.input_url) reference = { kind: 'upload', dataUrl: await urlToDataUrl(job.input_url), name: 'Original reference' }
      const prefill: CreatePrefill = {
        mode: job.type === 'video' ? 'video' : 'image',
        prompt: job.prompt,
        enhanced_prompt: job.enhanced_prompt,
        aspect: job.params.aspect,
        reference,
      }
      navigate('/create', { state: { prefill } })
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
      setBusy(null)
    }
  }

  async function animate() {
    if (!canAnimate) return
    setBusy('animate')
    setMessage(null)
    const result = await createJob({ type: 'video', prompt: '', parent_job_id: job.id })
    setBusy(null)
    if (result.ok) onOpenJob(result.job.id)
    else setMessage(result.status === 402 ? `That needs ${credits(result.cost ?? videoCost)} and you have ${result.credits ?? 0}.` : result.error)
  }

  function sendToCreateAsReference() {
    const prefill: CreatePrefill = { mode: 'image', prompt: '', reference: { kind: 'job', jobId: job.id, url: job.output_url! } }
    navigate('/create', { state: { prefill } })
  }

  const rows: [string, React.ReactNode][] = [
    ...(job.prompt && !job.preset_id ? [['Prompt', job.prompt] as [string, React.ReactNode]] : []),
    ...(job.enhanced_prompt ? [['Enhanced prompt', job.enhanced_prompt] as [string, React.ReactNode]] : []),
    ['Model', <span title={job.model}>{modelName(job.model)}</span>],
    ['Cost', credits(job.cost)],
    ['Generation time', took !== null && job.status === 'done' ? `${took.toFixed(1)}s` : pending ? 'In progress' : '—'],
    ['Created', new Date(job.created_at).toLocaleString()],
  ]

  return (
    <dialog
      ref={dialogRef}
      className="job-detail"
      onClose={onClose}
      onClick={(e) => e.target === dialogRef.current && dialogRef.current?.close()}
      aria-labelledby="job-detail-title"
    >
      <div className="detail-media">
        {done ? (
          job.type === 'video' ? (
            <video className={loaded ? 'loaded' : ''} src={job.output_url!} onLoadedData={() => setLoaded(true)} autoPlay muted loop playsInline controls />
          ) : (
            <img className={loaded ? 'loaded' : ''} src={job.output_url!} alt={jobTitle(job, preset?.name)} onLoad={() => setLoaded(true)} />
          )
        ) : job.status === 'failed' ? (
          <div className="detail-state failed" title={job.error ?? undefined}>
            <p>{friendlyError(job.error)}</p>
            {job.cost > 0 && <p className="refund">Credits refunded.</p>}
          </div>
        ) : (
          <div className="detail-state shimmer">
            <span className="skeleton-label">{job.type === 'video' ? 'Animating…' : 'Generating…'}</span>
          </div>
        )}
        {job.is_demo && <DemoBadge />}
      </div>

      <div className="detail-side">
        <div className="detail-head">
          <span className="tag">{jobKind(job) === 'effect' ? 'Effect' : jobKind(job) === 'video' ? 'Video' : 'Image'}</span>
          <button type="button" className="icon-btn" onClick={() => dialogRef.current?.close()} aria-label="Close">
            ×
          </button>
        </div>
        <h2 id="job-detail-title" className="detail-title">
          {jobTitle(job, preset?.name)}
        </h2>

        {job.parent_job_id && (
          <button type="button" className="lineage" onClick={() => onOpenJob(job.parent_job_id!)} disabled={!parent}>
            {parent?.output_url && parent.type !== 'video' && <img src={parent.output_url} alt="" />}
            <span>
              {job.type === 'video' ? 'Animated from' : 'Made from'} <strong>{parent ? jobTitle(parent, presets?.find((p) => p.id === parent.preset_id)?.name) : 'an earlier job'}</strong> →
            </span>
          </button>
        )}

        <dl className="detail-rows">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
          {character && (
            <div>
              <dt>Character</dt>
              <dd>
                <Link to={`/characters/${character.id}`} className="character-chip link">
                  <img src={character.image_url} alt="" />
                  {character.name}
                </Link>
              </dd>
            </div>
          )}
          {job.input_url && !job.parent_job_id && !character && (
            <div>
              <dt>{job.preset_id ? 'Input photo' : 'Reference image'}</dt>
              <dd>
                <img className="detail-input" src={job.input_url} alt="Input" />
              </dd>
            </div>
          )}
        </dl>

        <div className="detail-actions">
          <button type="button" className="primary-sm" onClick={remix} disabled={busy !== null}>
            {busy === 'remix' ? 'Opening…' : 'Remix'}
          </button>
          {done && isImage && (
            <button type="button" className="ghost-btn" onClick={animate} disabled={busy !== null || !canAnimate}>
              {busy === 'animate'
                ? 'Starting…'
                : canAnimate || balance === null
                  ? `Animate · ${credits(videoCost)}`
                  : `Need ${credits(videoCost)} · you have ${balance}`}
            </button>
          )}
          {done && (
            <a className="ghost-btn" href={downloadUrl(job)}>
              Download
            </a>
          )}
          {done && isImage && (
            <button type="button" className="ghost-btn" onClick={sendToCreateAsReference}>
              Use as reference
            </button>
          )}
        </div>
        {done && isImage && !canAnimate && balance !== null && (
          <p className="hint-line left">
            {balance >= (costs?.image ?? 1) ? (
              <>
                Remix it as an image instead for {credits(costs?.image ?? 1)}, or <Link to="/">try an effect</Link>.
              </>
            ) : (
              "You're out of credits for now."
            )}
          </p>
        )}
        {message && <p className="field-error">{message}</p>}
      </div>
    </dialog>
  )
}

export default JobDetail
