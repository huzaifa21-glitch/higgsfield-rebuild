import { useState } from 'react'
import { useJobs } from '../lib/jobsContext.ts'

const DISMISS_KEY = 'banner.starterWithheld.dismissed'

function readDismissed() {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

// Site-wide notices: degraded AI capacity (not dismissible: it explains every demo output),
// and a session that started without free credits.
function SiteBanners() {
  const { degraded, starterWithheld, credits } = useJobs()
  const [dismissed, setDismissed] = useState(readDismissed)

  const resetTime = degraded ? new Date(degraded.until).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''

  return (
    <>
      {degraded && (
        <div className="site-banner degraded" role="status">
          <span className="site-banner-dot" aria-hidden="true" />
          <p>
            {degraded.reason === 'quota'
              ? 'Free daily AI capacity reached — showing demo outputs until reset.'
              : 'The AI service is busy — showing demo outputs for a few minutes.'}{' '}
            <span className="muted">
              {degraded.reason === 'quota' ? `Resets around ${resetTime}.` : `Back by about ${resetTime}.`} Credits for demo outputs are refunded.
            </span>
          </p>
        </div>
      )}
      {starterWithheld && credits === 0 && !dismissed && (
        <div className="site-banner notice" role="status">
          <p>
            This network has already started 3 sessions today, so this one begins with 0 credits.{' '}
            <span className="muted">Your earlier sessions keep theirs, and you can still browse effects and save characters.</span>
          </p>
          <button
            type="button"
            className="icon-btn"
            aria-label="Dismiss"
            onClick={() => {
              setDismissed(true)
              try {
                sessionStorage.setItem(DISMISS_KEY, '1')
              } catch {
                // Dismissal just won't persist across reloads.
              }
            }}
          >
            ×
          </button>
        </div>
      )}
    </>
  )
}

export default SiteBanners
