import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import CharacterPicker from '../components/characters/CharacterPicker.tsx'
import ReferenceInput, { type Reference } from '../components/create/ReferenceInput.tsx'
import BeforeAfter from '../components/effects/BeforeAfter.tsx'
import { downloadUrl, type Preset } from '../lib/api.ts'
import { useJobs } from '../lib/jobsContext.ts'
import { friendlyError } from '../lib/jobText.ts'
import { useCharacters } from '../lib/charactersContext.ts'
import { usePhoto } from '../lib/photoContext.ts'
import { usePresets } from '../lib/usePresets.ts'
import './Create.css'
import './Effects.css'

const credits = (n: number) => `${n} ${n === 1 ? 'credit' : 'credits'}`

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [])
  return <span className="tabular">{Math.max(0, (now - since) / 1000).toFixed(1)}s</span>
}

function EffectView({ preset, others }: { preset: Preset; others: Preset[] }) {
  const { jobs, credits: balance, costs, createJob } = useJobs()
  const { photo: sessionPhoto, setPhoto } = usePhoto()
  const { characters, limit, loaded: charactersLoaded, create: createCharacter } = useCharacters()
  // A character deleted since it was picked no longer counts as the photo.
  const photo =
    sessionPhoto?.kind === 'character' && charactersLoaded && !characters.some((c) => c.id === sessionPhoto.characterId) ? null : sessionPhoto
  const photoSrc = photo ? (photo.kind === 'upload' ? photo.dataUrl : photo.url) : null
  const [saveAsCharacter, setSaveAsCharacter] = useState(false)
  const [characterName, setCharacterName] = useState('')
  const canSaveCharacter = photo?.kind === 'upload' && characters.length < limit
  // The job started from this page; looked up in the live job list so Realtime updates it.
  const [jobId, setJobId] = useState<string | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const moreRef = useRef<HTMLElement>(null)

  const job = jobId ? jobs.find((j) => j.id === jobId) : undefined
  const submitting = startedAt !== null && !job
  const pending = submitting || job?.status === 'queued' || job?.status === 'running'
  const known = balance !== null
  const canAfford = known && balance >= preset.cost
  const imageCost = costs?.image ?? 1

  async function apply() {
    if (!photo || !canAfford || pending) return
    setMessage(null)
    setJobId(null)
    setStartedAt(Date.now())
    let input: Reference = photo
    if (photo.kind === 'upload' && saveAsCharacter && canSaveCharacter) {
      // Free and one step: save the face, then run the effect with it as the character.
      const saved = await createCharacter(characterName.trim() || 'Me', photo.dataUrl)
      if (saved.ok) {
        input = { kind: 'character', characterId: saved.character.id, url: saved.character.image_url, name: saved.character.name }
        setPhoto(input)
        setSaveAsCharacter(false)
      } else {
        setMessage(`Couldn't save the character: ${saved.error} The effect still runs on your photo.`)
      }
    }
    const result = await createJob({
      type: 'effect',
      prompt: '',
      preset_id: preset.id,
      input_image: input.kind === 'upload' ? input.dataUrl : undefined,
      character_id: input.kind === 'character' ? input.characterId : undefined,
      parent_job_id: input.kind === 'job' ? input.jobId : undefined,
    })
    if (result.ok) {
      setJobId(result.job.id)
    } else {
      setStartedAt(null)
      setMessage(
        result.status === 402 ? `That needs ${credits(result.cost ?? preset.cost)} and you have ${result.credits ?? 0}.` : result.error,
      )
    }
  }

  const showResult = Boolean(photo && (pending || job))
  const done = job?.status === 'done' && job.output_url

  return (
    <div className="effect-page">
      <div className="effect-stage">
        {showResult && photoSrc ? (
          <BeforeAfter
            key={job?.id ?? 'pending'}
            before={photoSrc}
            after={done ? job!.output_url : null}
            alt={preset.name}
            overlay={
              pending ? (
                <div className="stage-overlay shimmer">
                  <span className="skeleton-label">
                    Applying {preset.name} · <Elapsed since={startedAt ?? (job ? new Date(job.created_at).getTime() : 0)} />
                  </span>
                </div>
              ) : job?.status === 'failed' ? (
                <div className="stage-overlay failed" title={job.error ?? undefined}>
                  <p>{friendlyError(job.error)}</p>
                  <p className="refund">Credits refunded.</p>
                </div>
              ) : null
            }
          />
        ) : preset.before_url && preset.after_url ? (
          <BeforeAfter before={preset.before_url} after={preset.after_url} alt={`${preset.name} example`} />
        ) : null}
      </div>

      <aside className="effect-side">
        <Link to="/" className="back-link">
          ← All effects
        </Link>
        <h1>{preset.name}</h1>
        {preset.description && <p className="effect-desc">{preset.description}</p>}

        <CharacterPicker
          characters={characters}
          selectedId={photo?.kind === 'character' ? photo.characterId : null}
          onPick={(c) => setPhoto({ kind: 'character', characterId: c.id, url: c.image_url, name: c.name })}
        />

        <div className="field">
          <span className="label">{characters.length > 0 ? 'Or upload a photo' : 'Your photo'}</span>
          <ReferenceInput value={photo} onChange={setPhoto} label="Upload a selfie or portrait" />
          {canSaveCharacter && (
            <div className="save-character">
              <label className="check">
                <input type="checkbox" checked={saveAsCharacter} onChange={(e) => setSaveAsCharacter(e.target.checked)} />
                Save as character <span className="optional">free</span>
              </label>
              {saveAsCharacter && (
                <input
                  className="text-input"
                  value={characterName}
                  onChange={(e) => setCharacterName(e.target.value)}
                  placeholder="Name, e.g. Me"
                  maxLength={40}
                  aria-label="Character name"
                />
              )}
            </div>
          )}
          {photo?.kind === 'upload' && !canSaveCharacter && (
            <small className="hint-line left">All {limit} character slots are full. <Link to="/characters">Manage characters</Link></small>
          )}
          {photo && <small className="hint-line left">Kept for this session: try other effects without re-uploading.</small>}
        </div>

        <div className="generate">
          <button type="button" className={`primary${known && !canAfford ? ' short' : ''}`} onClick={apply} disabled={!photo || !canAfford || pending}>
            {known && !canAfford
              ? `Need ${credits(preset.cost)} · you have ${balance}`
              : pending
                ? 'Applying…'
                : `Apply effect · ${credits(preset.cost)}`}
          </button>
          {known && !canAfford && balance >= imageCost && (
            <Link to="/create" className="cheaper">
              Make an image instead · {credits(imageCost)}
            </Link>
          )}
          {known && !canAfford && balance < imageCost && <p className="hint-line">You're out of credits for now.</p>}
          {!photo && canAfford && <p className="hint-line">Add a photo to apply this effect.</p>}
          {message && <p className="field-error">{message}</p>}
        </div>

        {done && (
          <div className="result-actions">
            <a className="ghost-btn" href={downloadUrl(job!)}>
              Download
            </a>
            <button type="button" className="ghost-btn" onClick={() => moreRef.current?.scrollIntoView({ behavior: 'smooth' })}>
              Try another effect
            </button>
            <Link className="ghost-btn" to="/library">
              View in library
            </Link>
          </div>
        )}
      </aside>

      <section className="more-effects" ref={moreRef} aria-label="Other effects">
        <h2>Try another effect{photo ? ' on this photo' : ''}</h2>
        <div className="more-strip">
          {others.map((p) => (
            <Link key={p.id} to={`/effects/${p.id}`} className="more-item">
              {p.after_url && <img src={p.after_url} alt="" loading="lazy" />}
              <span>{p.name}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}

function Effect() {
  const { id } = useParams()
  const { presets, error } = usePresets()

  if (error) return <p className="field-error">Couldn't load this effect. {error}</p>
  if (!presets) return <div className="effect-page loading" aria-busy="true" />

  const preset = presets.find((p) => p.id === id)
  if (!preset) {
    return (
      <section className="placeholder">
        <h1>Effect not found</h1>
        <p>
          <Link to="/">See all effects</Link>
        </p>
      </section>
    )
  }
  // key: switching effects starts fresh (no stale result), while the photo stays in session state.
  return <EffectView key={preset.id} preset={preset} others={presets.filter((p) => p.id !== preset.id)} />
}

export default Effect
