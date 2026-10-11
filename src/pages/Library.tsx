import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import JobCard from '../components/create/JobCard.tsx'
import JobDetail from '../components/library/JobDetail.tsx'
import { useCharacters } from '../lib/charactersContext.ts'
import { useJobs } from '../lib/jobsContext.ts'
import { jobKind, type JobKind } from '../lib/jobText.ts'
import './Create.css'
import './Library.css'

const FILTERS: { id: 'all' | JobKind; label: string; empty: string }[] = [
  { id: 'all', label: 'All', empty: '' },
  { id: 'image', label: 'Images', empty: 'No images yet.' },
  { id: 'effect', label: 'Effects', empty: 'No effects yet.' },
  { id: 'video', label: 'Videos', empty: 'No videos yet. Open an image and choose Animate.' },
]

// Filter and open job live in the URL, so Back closes the detail view and links can be shared.
function Library() {
  const { jobs, loaded } = useJobs()
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const filter = (FILTERS.find((f) => f.id === params.get('filter')) ?? FILTERS[0]).id
  const openId = params.get('job')
  const { characters } = useCharacters()
  const characterId = characters.some((c) => c.id === params.get('character')) ? params.get('character') : null
  const real = jobs.filter((j) => !j.id.startsWith('temp-'))
  // Type counts follow the character filter, so the chips always describe what you'd see.
  const byCharacter = characterId ? real.filter((j) => j.character_id === characterId) : real
  const shown = filter === 'all' ? byCharacter : byCharacter.filter((j) => jobKind(j) === filter)
  const open = openId ? real.find((j) => j.id === openId) : undefined

  const count = (id: 'all' | JobKind) => (id === 'all' ? byCharacter.length : byCharacter.filter((j) => jobKind(j) === id).length)

  function update(changes: Record<string, string | null>, replace = false, state?: unknown) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [k, v] of Object.entries(changes)) {
          if (v === null) next.delete(k)
          else next.set(k, v)
        }
        return next
      },
      { replace, state },
    )
  }

  // Opening a job adds a history entry; closing steps back over it, so Back never reopens a closed detail.
  const openJob = (id: string) => update({ job: id }, false, { detailFromLibrary: true })
  function closeJob() {
    if ((location.state as { detailFromLibrary?: boolean } | null)?.detailFromLibrary) navigate(-1)
    else update({ job: null }, true)
  }

  return (
    <div className="library">
      <header className="library-head">
        <h1>Library</h1>
        <p>{loaded ? `${real.length} ${real.length === 1 ? 'creation' : 'creations'} this session` : 'Loading…'}</p>
      </header>

      {loaded && real.length === 0 ? (
        <div className="library-empty">
          <p>Nothing yet.</p>
          <Link to="/" className="primary-sm">
            Try an effect
          </Link>
        </div>
      ) : (
        <>
          <div className="chips" role="group" aria-label="Filter">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`chip${filter === f.id ? ' active' : ''}`}
                aria-pressed={filter === f.id}
                onClick={() => update({ filter: f.id === 'all' ? null : f.id }, true)}
              >
                {f.label} <span className="chip-count">{count(f.id)}</span>
              </button>
            ))}
          </div>

          {characters.length > 0 && (
            <div className="chips" role="group" aria-label="Character">
              <button
                type="button"
                className={`chip${characterId === null ? ' active' : ''}`}
                aria-pressed={characterId === null}
                onClick={() => update({ character: null }, true)}
              >
                Everyone
              </button>
              {characters.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`chip avatar-chip${characterId === c.id ? ' active' : ''}`}
                  aria-pressed={characterId === c.id}
                  onClick={() => update({ character: c.id }, true)}
                >
                  <img src={c.image_url} alt="" />
                  {c.name} <span className="chip-count">{real.filter((j) => j.character_id === c.id).length}</span>
                </button>
              ))}
            </div>
          )}

          {shown.length === 0 && loaded ? (
            <p className="library-none">
              {characterId ? `Nothing here with ${characters.find((c) => c.id === characterId)?.name} yet.` : FILTERS.find((f) => f.id === filter)?.empty}
            </p>
          ) : (
            <div className="feed">
              {shown.map((job) => (
                <JobCard key={job.id} job={job} onOpen={(j) => openJob(j.id)} />
              ))}
            </div>
          )}
        </>
      )}

      {open && (
        <JobDetail
          key={open.id}
          job={open}
          onClose={closeJob}
          // Lineage links and Animate swap the open detail in place, so × still returns to the grid.
          onOpenJob={(id) => update({ job: id }, true, location.state)}
        />
      )}
    </div>
  )
}

export default Library
