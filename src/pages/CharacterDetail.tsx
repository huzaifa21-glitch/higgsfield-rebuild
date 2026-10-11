import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import JobCard from '../components/create/JobCard.tsx'
import type { Reference } from '../components/create/ReferenceInput.tsx'
import type { Character } from '../lib/api.ts'
import { useCharacters } from '../lib/charactersContext.ts'
import { useJobs } from '../lib/jobsContext.ts'
import { usePhoto } from '../lib/photoContext.ts'
import type { CreatePrefill } from '../lib/prefill.ts'
import './Create.css'
import './Characters.css'

function CharacterView({ character }: { character: Character }) {
  const { rename, remove } = useCharacters()
  const { jobs } = useJobs()
  const { photo, setPhoto } = usePhoto()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(character.name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const made = jobs.filter((j) => j.character_id === character.id)
  const ref = { kind: 'character' as const, characterId: character.id, url: character.image_url, name: character.name } satisfies Reference

  async function saveName(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || name.trim() === character.name) return setEditing(false)
    setBusy(true)
    const result = await rename(character.id, name.trim())
    setBusy(false)
    if (result.ok) {
      setEditing(false)
      setError(null)
      // Keep the session photo's label in step if this character is the one selected.
      if (photo?.kind === 'character' && photo.characterId === character.id) setPhoto({ ...ref, name: result.character.name })
    } else setError(result.error)
  }

  async function deleteIt() {
    setBusy(true)
    const ok = await remove(character.id)
    setBusy(false)
    if (!ok) return setError("Couldn't delete this character. Try again.")
    if (photo?.kind === 'character' && photo.characterId === character.id) setPhoto(null)
    navigate('/characters')
  }

  function putInEffect() {
    setPhoto(ref)
    navigate('/')
  }

  function openInCreate() {
    const prefill: CreatePrefill = { mode: 'image', prompt: '', reference: ref }
    navigate('/create', { state: { prefill } })
  }

  return (
    <div className="character-page">
      <Link to="/characters" className="back-link">
        ← All characters
      </Link>

      <div className="character-hero">
        <img className="character-photo" src={character.image_url} alt={character.name} />
        <div className="character-side">
          {editing ? (
            <form className="rename" onSubmit={saveName}>
              <input
                className="text-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                aria-label="Character name"
                autoFocus
              />
              <button type="submit" className="primary-sm" disabled={busy || !name.trim()}>
                Save
              </button>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  setEditing(false)
                  setName(character.name)
                }}
              >
                Cancel
              </button>
            </form>
          ) : (
            <h1>{character.name}</h1>
          )}

          <button type="button" className="primary cta" onClick={putInEffect}>
            Put {character.name} in an effect
          </button>
          <button type="button" className="ghost-btn" onClick={openInCreate}>
            Use in Create
          </button>

          <div className="character-manage">
            {!editing && (
              <button type="button" className="ghost-btn" onClick={() => setEditing(true)}>
                Rename
              </button>
            )}
            {confirmDelete ? (
              <span className="confirm">
                Delete {character.name}? Outputs stay in your library.
                <button type="button" className="danger-btn" onClick={deleteIt} disabled={busy}>
                  Delete
                </button>
                <button type="button" className="ghost-btn" onClick={() => setConfirmDelete(false)}>
                  Keep
                </button>
              </span>
            ) : (
              <button type="button" className="ghost-btn" onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            )}
          </div>
          {error && <p className="field-error">{error}</p>}
        </div>
      </div>

      <section className="character-gallery" aria-label={`Made with ${character.name}`}>
        <h2>Made with {character.name}</h2>
        {made.length === 0 ? (
          <p className="muted-line">Nothing yet. Put {character.name} in an effect to start.</p>
        ) : (
          <div className="feed">
            {made.map((job) => (
              <JobCard key={job.id} job={job} onOpen={(j) => navigate(`/library?job=${j.id}`)} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function CharacterDetail() {
  const { id } = useParams()
  const { characters, loaded } = useCharacters()
  if (!loaded) return <div className="character-page" aria-busy="true" />
  const character = characters.find((c) => c.id === id)
  if (!character) {
    return (
      <section className="placeholder">
        <h1>Character not found</h1>
        <p>
          <Link to="/characters">See your characters</Link>
        </p>
      </section>
    )
  }
  // key: switching characters resets the rename/delete state.
  return <CharacterView key={character.id} character={character} />
}

export default CharacterDetail
