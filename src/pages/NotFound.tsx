import { Link, useLocation } from 'react-router-dom'
import { usePageTitle } from '../lib/usePageTitle.ts'
import './Create.css'

function NotFound() {
  const { pathname } = useLocation()
  usePageTitle('Page not found')

  return (
    <section className="not-found">
      <p className="not-found-code" aria-hidden="true">
        404
      </p>
      <h1>This page didn't make it</h1>
      <p className="not-found-text">
        Nothing lives at <code>{pathname}</code>. It may have moved, or the link has a typo.
      </p>
      <div className="not-found-actions">
        <Link to="/" className="primary-sm">
          Browse effects
        </Link>
        <Link to="/create" className="ghost-btn">
          Create an image
        </Link>
        <Link to="/library" className="ghost-btn">
          Your library
        </Link>
      </div>
    </section>
  )
}

export default NotFound
