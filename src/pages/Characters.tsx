import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import CharacterCreator from '../components/characters/CharacterCreator.tsx'
import { ErrorState, SkeletonGrid } from '../components/States.tsx'
import { usePageTitle } from '../lib/usePageTitle.ts'
import { useCharacters } from '../lib/charactersContext.ts'
import { useJobs } from '../lib/jobsContext.ts'
import './Create.css'
import './Characters.css'

function Characters() {
  const { characters, limit, loaded, error, reload } = useCharacters()
  usePageTitle('Characters')
  const { jobs } = useJobs()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const full = characters.length >= limit
  const goTo = (id: string) => navigate(`/characters/${id}`)

  if (!loaded) {
    return (
      <div className="characters">
        <header className="page-head">
          <h1>Characters</h1>
        </header>
        <SkeletonGrid count={3} className="character-grid" lines={2} />
      </div>
    )
  }
  if (error) return <ErrorState title="Characters didn't load" message={error} onRetry={reload} />

  if (characters.length === 0) {
    return (
      <div className="characters-empty">
        <h1>Save your face once, use it in every effect</h1>
        <p>Upload one photo and give it a name. Then pick it on any effect or in Create, with no re-uploading. Saving is free.</p>
        <CharacterCreator onCreated={(c) => goTo(c.id)} uploadLabel="Upload a face photo" />
      </div>
    )
  }

  return (
    <div className="characters">
      <header className="page-head">
        <h1>Characters</h1>
        <p>
          {characters.length} of {limit} saved. Pick one on any effect or in Create.
        </p>
      </header>

      <div className="character-grid">
        {characters.map((c) => {
          const made = jobs.filter((j) => j.character_id === c.id).length
          return (
            <Link key={c.id} to={`/characters/${c.id}`} className="character-card">
              <img src={c.image_url} alt="" loading="lazy" decoding="async" />
              <span className="character-name">{c.name}</span>
              <span className="character-meta">{made === 0 ? 'Nothing made yet' : `${made} ${made === 1 ? 'creation' : 'creations'}`}</span>
            </Link>
          )
        })}

        {creating ? (
          <div className="character-card new open">
            <CharacterCreator onCreated={(c) => goTo(c.id)} onCancel={() => setCreating(false)} />
          </div>
        ) : full ? (
          <div className="character-card new full" role="note">
            <span className="new-plus" aria-hidden="true">
              {characters.length}/{limit}
            </span>
            <span className="character-name">All slots used</span>
            <span className="character-meta">A guest session can save {limit} characters. Delete one to add another.</span>
          </div>
        ) : (
          <button type="button" className="character-card new" onClick={() => setCreating(true)}>
            <span className="new-plus" aria-hidden="true">
              +
            </span>
            <span className="character-name">New character</span>
            <span className="character-meta">Free · {limit - characters.length} left</span>
          </button>
        )}
      </div>
    </div>
  )
}

export default Characters
