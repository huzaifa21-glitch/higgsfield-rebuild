import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import SiteBanners from './components/SiteBanners.tsx'
import { fetchPresets } from './lib/api.ts'
import { JobsProvider } from './lib/JobsProvider.tsx'
import { PhotoProvider } from './lib/PhotoProvider.tsx'
import { CharactersProvider } from './lib/CharactersProvider.tsx'
import { useJobs } from './lib/jobsContext.ts'
import './App.css'

const navItems = [
  { to: '/', label: 'Explore', end: true },
  { to: '/create', label: 'Create' },
  { to: '/characters', label: 'Characters' },
  { to: '/library', label: 'Library' },
]

function CreditCounter() {
  const { credits } = useJobs()
  return (
    <span className="credits" aria-live="polite" title="Credits update live">
      <span className="credits-dot" aria-hidden="true" />
      {/* key restarts the pulse animation whenever the balance changes */}
      <span key={credits ?? 'loading'} className="credits-value">
        {credits ?? '–'}
      </span>{' '}
      {credits === 1 ? 'credit' : 'credits'}
    </span>
  )
}

function App() {
  // Start loading effect names right away: cards on every page label effect outputs with them.
  useEffect(() => {
    fetchPresets().catch(() => {})
  }, [])

  return (
    <JobsProvider>
      <CharactersProvider>
        <PhotoProvider>
          <header className="topnav">
            <NavLink to="/" className="brand">
              Higgsfield Rebuild
            </NavLink>
            <nav aria-label="Main">
              {navItems.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end}>
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <CreditCounter />
          </header>
          <SiteBanners />
          <main>
            <Outlet />
          </main>
        </PhotoProvider>
      </CharactersProvider>
    </JobsProvider>
  )
}

export default App
