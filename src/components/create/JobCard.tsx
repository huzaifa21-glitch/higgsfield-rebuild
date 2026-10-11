import { useEffect, useState } from 'react'
import { downloadUrl, type Job } from '../../lib/api.ts'
import { friendlyError, jobTitle } from '../../lib/jobText.ts'
import DemoBadge from '../DemoBadge.tsx'
import { useCharacters } from '../../lib/charactersContext.ts'
import { usePresets } from '../../lib/usePresets.ts'

const ASPECT_RATIO: Record<string, string> = { '1:1': '1 / 1', '3:4': '3 / 4', '16:9': '16 / 9' }

function ratioFor(job: Job) {
  if (job.type === 'video') return '16 / 9'
  return ASPECT_RATIO[job.params.aspect ?? (job.type === 'effect' ? '3:4' : '1:1')]
}

function seconds(from: string, to: number) {
  return Math.max(0, (to - new Date(from).getTime()) / 1000)
}

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [])
  return <span className="tabular">{seconds(since, now).toFixed(1)}s</span>
}

type Props = {
  job: Job
  onUseAsReference?: (job: Job) => void
  // Library mode: the card opens a detail view, which holds the actions.
  onOpen?: (job: Job) => void
}

function JobCard({ job, onUseAsReference, onOpen }: Props) {
  const [loaded, setLoaded] = useState(false)
  const { presets } = usePresets()
  const preset = job.preset_id ? presets?.find((p) => p.id === job.preset_id) : undefined
  const { characters } = useCharacters()
  const character = job.character_id ? characters.find((c) => c.id === job.character_id) : undefined
  const pending = job.status === 'queued' || job.status === 'running'
  const done = job.status === 'done' && job.output_url
  const took = job.completed_at ? seconds(job.created_at, new Date(job.completed_at).getTime()) : null

  return (
    <article className={`job-card status-${job.status}`}>
      <div className="job-media" style={{ aspectRatio: ratioFor(job) }}>
        {job.status !== 'failed' && (
          <div className={`skeleton${loaded ? ' hidden' : ''}`}>
            <span className="skeleton-label">
              {job.status === 'queued' ? 'Queued' : done ? 'Loading' : job.type === 'video' ? 'Animating' : 'Generating'}
              {pending && (
                <>
                  {' · '}
                  <Elapsed since={job.created_at} />
                </>
              )}
            </span>
          </div>
        )}

        {done &&
          (job.type === 'video' ? (
            <video
              className={loaded ? 'loaded' : ''}
              src={job.output_url!}
              onLoadedData={() => setLoaded(true)}
              autoPlay
              muted
              loop
              playsInline
              controls={!onOpen}
            />
          ) : (
            <img className={loaded ? 'loaded' : ''} src={job.output_url!} alt={job.prompt} onLoad={() => setLoaded(true)} />
          ))}

        {job.status === 'failed' && (
          <div className="job-failed" title={job.error ?? undefined}>
            <p>{friendlyError(job.error)}</p>
            {job.cost > 0 && <p className="refund">Credits refunded.</p>}
          </div>
        )}

        {onOpen && (
          <button type="button" className="job-open" onClick={() => onOpen(job)} aria-label={`Open details: ${jobTitle(job, preset?.name)}`} />
        )}
        {job.is_demo && loaded && <DemoBadge />}
      </div>

      <div className="job-body">
        {character && (
          <span className="character-chip">
            <img src={character.image_url} alt="" />
            {character.name}
          </span>
        )}
        {job.preset_id ? (
          <p className="job-prompt">{preset?.name ?? 'Effect'}</p>
        ) : job.prompt ? (
          <p className="job-prompt">{job.prompt}</p>
        ) : (
          <p className="job-prompt muted">No prompt</p>
        )}
        {job.enhanced_prompt && (
          <p className="job-assisted">
            <span className="tag">Assist</span> {job.enhanced_prompt}
          </p>
        )}
        <div className="job-footer">
          <span className="job-meta">
            {job.preset_id ? 'Effect' : job.type === 'effect' ? 'Image + reference' : job.type === 'video' ? 'Video' : 'Image'} · {job.cost}{' '}
            {job.cost === 1 ? 'credit' : 'credits'}
            {took !== null && job.status === 'done' && ` · ${took.toFixed(1)}s`}
          </span>
          {done && !onOpen && (
            <span className="job-actions">
              {job.type !== 'video' && onUseAsReference && (
                <button type="button" className="ghost-btn" onClick={() => onUseAsReference(job)}>
                  Use as reference
                </button>
              )}
              <a className="ghost-btn" href={downloadUrl(job)}>
                Download
              </a>
            </span>
          )}
        </div>
      </div>
    </article>
  )
}

export default JobCard
