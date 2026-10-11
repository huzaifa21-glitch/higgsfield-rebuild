// Shared loading and error states, so every page handles both the same way.

type ErrorStateProps = {
  title?: string
  message: string
  onRetry?: () => void
}

export function ErrorState({ title = "Couldn't load this", message, onRetry }: ErrorStateProps) {
  return (
    <div className="error-state" role="alert">
      <span className="error-icon" aria-hidden="true">
        !
      </span>
      <h2>{title}</h2>
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="primary-sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

type SkeletonGridProps = {
  count: number
  ratio?: string
  className?: string
  lines?: number
}

// Placeholder cards with the same footprint as the real ones, so nothing jumps when data arrives.
export function SkeletonGrid({ count, ratio = '1 / 1', className = 'feed', lines = 2 }: SkeletonGridProps) {
  return (
    <div className={className} aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skel-card" aria-hidden="true">
          <div className="skel" style={{ aspectRatio: ratio }} />
          {Array.from({ length: lines }, (_, l) => (
            <div key={l} className="skel skel-line" style={{ width: l === 0 ? '80%' : '45%' }} />
          ))}
        </div>
      ))}
    </div>
  )
}
