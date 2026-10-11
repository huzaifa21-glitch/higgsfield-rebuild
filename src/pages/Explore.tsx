import { Link } from 'react-router-dom'
import EffectCard from '../components/effects/EffectCard.tsx'
import { useJobs } from '../lib/jobsContext.ts'
import { usePresets } from '../lib/usePresets.ts'
import './Effects.css'

const FIRST_EFFECT = 'film-noir'

function Explore() {
  const { presets, error } = usePresets()
  const { jobs, loaded } = useJobs()
  const firstRun = loaded && jobs.length === 0

  return (
    <div className="explore">
      <header className="hero">
        <h1>Turn any photo into…</h1>
        <p>Eight one-tap looks. Upload once and try as many as you like.</p>
      </header>

      {firstRun && (
        <Link to={`/effects/${FIRST_EFFECT}`} className="start-banner">
          <span className="start-badge">Start here</span>
          <span className="start-text">Upload a selfie and try Film Noir</span>
          <span className="start-cta" aria-hidden="true">
            →
          </span>
        </Link>
      )}

      {error && <p className="field-error">Couldn't load effects. {error}</p>}

      <div className="effect-grid">
        {presets
          ? presets.map((p, i) => <EffectCard key={p.id} preset={p} eager={i < 4} />)
          : Array.from({ length: 8 }, (_, i) => <div key={i} className="effect-card placeholder-card" aria-hidden="true" />)}
      </div>
    </div>
  )
}

export default Explore
