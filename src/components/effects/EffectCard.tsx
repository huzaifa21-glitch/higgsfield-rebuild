import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Preset } from '../../lib/api.ts'

type Props = { preset: Preset; eager?: boolean }

// After image by default; hover (or the Before chip on touch screens) reveals the original.
function EffectCard({ preset, eager }: Props) {
  const [showBefore, setShowBefore] = useState(false)

  return (
    <Link to={`/effects/${preset.id}`} className={`effect-card${showBefore ? ' show-before' : ''}`}>
      <div className="effect-media">
        {preset.after_url && (
          <img src={preset.after_url} alt={`${preset.name} example`} loading={eager ? 'eager' : 'lazy'} />
        )}
        {preset.before_url && (
          <img className="effect-before" src={preset.before_url} alt="" loading={eager ? 'eager' : 'lazy'} />
        )}
        {preset.before_url && (
          <button
            type="button"
            className="before-chip"
            aria-pressed={showBefore}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setShowBefore((s) => !s)
            }}
          >
            {showBefore ? 'After' : 'Before'}
          </button>
        )}
      </div>
      <div className="effect-info">
        <span className="effect-name">{preset.name}</span>
        <span className="effect-cost">
          {preset.cost} {preset.cost === 1 ? 'credit' : 'credits'}
        </span>
      </div>
    </Link>
  )
}

export default EffectCard
