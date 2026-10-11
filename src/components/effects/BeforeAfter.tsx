import { useState, type ReactNode } from 'react'

type Props = {
  before: string
  after: string | null
  ratio?: string
  // Shown over the before image while there's no after yet (e.g. a running job).
  overlay?: ReactNode
  alt: string
}

// Drag (or arrow-key) slider: before on the left, after on the right.
function BeforeAfter({ before, after, ratio = '3 / 4', overlay, alt }: Props) {
  const [pos, setPos] = useState(50)
  const [loaded, setLoaded] = useState(false)
  const showAfter = after !== null

  return (
    <div className="ba" style={{ aspectRatio: ratio }}>
      <img className="ba-img" src={before} alt={`${alt}, before`} />
      {showAfter && (
        <img
          className={`ba-img ba-after${loaded ? ' loaded' : ''}`}
          src={after}
          alt={`${alt}, after`}
          style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
          onLoad={() => setLoaded(true)}
        />
      )}
      {showAfter && loaded && (
        <>
          <div className="ba-handle" style={{ left: `${pos}%` }} aria-hidden="true">
            <span />
          </div>
          <span className="ba-label left">Before</span>
          <span className="ba-label right">After</span>
          <input
            className="ba-range"
            type="range"
            min={0}
            max={100}
            value={pos}
            onChange={(e) => setPos(Number(e.target.value))}
            aria-label="Compare before and after"
          />
        </>
      )}
      {overlay}
    </div>
  )
}

export default BeforeAfter
