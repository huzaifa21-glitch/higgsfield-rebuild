import { useState, type FormEvent } from 'react'
import type { Character } from '../../lib/api.ts'
import { useCharacters } from '../../lib/charactersContext.ts'
import ReferenceInput, { type Reference } from '../create/ReferenceInput.tsx'

type Props = {
  onCreated: (character: Character) => void
  onCancel?: () => void
  uploadLabel?: string
}

// Upload a face (resized to 512px in the browser), name it, save. Free.
function CharacterCreator({ onCreated, onCancel, uploadLabel = 'Upload a face photo' }: Props) {
  const { create } = useCharacters()
  const [photo, setPhoto] = useState<Reference | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (photo?.kind !== 'upload' || !name.trim()) return
    setSaving(true)
    setError(null)
    const result = await create(name.trim(), photo.dataUrl)
    setSaving(false)
    if (result.ok) onCreated(result.character)
    else setError(result.error)
  }

  return (
    <form className="character-creator" onSubmit={save}>
      <ReferenceInput value={photo} onChange={setPhoto} label={uploadLabel} />
      {photo && (
        <>
          <input
            className="text-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name, e.g. Me or Maya"
            maxLength={40}
            aria-label="Character name"
            autoFocus
          />
          <div className="creator-actions">
            <button type="submit" className="primary-sm" disabled={saving || !name.trim()}>
              {saving ? 'Saving…' : 'Save character · free'}
            </button>
            {onCancel && (
              <button type="button" className="ghost-btn" onClick={onCancel}>
                Cancel
              </button>
            )}
          </div>
        </>
      )}
      {!photo && onCancel && (
        <button type="button" className="ghost-btn creator-cancel" onClick={onCancel}>
          Cancel
        </button>
      )}
      {error && <p className="field-error">{error}</p>}
    </form>
  )
}

export default CharacterCreator
