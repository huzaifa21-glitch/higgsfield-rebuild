import { Link } from 'react-router-dom'
import type { Character } from '../../lib/api.ts'

type Props = {
  characters: Character[]
  selectedId: string | null
  onPick: (character: Character) => void
  label?: string
}

// "Use a character": saved characters as avatars. Renders nothing until one exists.
function CharacterPicker({ characters, selectedId, onPick, label = 'Use a character' }: Props) {
  if (characters.length === 0) return null
  return (
    <div className="character-picker">
      <span className="label">{label}</span>
      <div className="avatar-row" role="radiogroup" aria-label={label}>
        {characters.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={selectedId === c.id}
            className={`avatar-btn${selectedId === c.id ? ' selected' : ''}`}
            onClick={() => onPick(c)}
            title={c.name}
          >
            <img src={c.image_url} alt="" loading="lazy" decoding="async" />
            <span>{c.name}</span>
          </button>
        ))}
        <Link to="/characters" className="avatar-manage">
          Manage
        </Link>
      </div>
    </div>
  )
}

export default CharacterPicker
