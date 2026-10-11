import { NavLink, Outlet } from 'react-router-dom'
import { JobsProvider } from './lib/JobsProvider.tsx'
import { PhotoProvider } from './lib/PhotoProvider.tsx'
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
  return (
    <JobsProvider>
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
        <main>
          <Outlet />
        </main>
      </PhotoProvider>
    </JobsProvider>
  )
}

export default App
