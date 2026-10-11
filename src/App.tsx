import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import SiteBanners from './components/SiteBanners.tsx'
import { ToastProvider } from './components/ToastProvider.tsx'
import { fetchPresets } from './lib/api.ts'
import { CharactersProvider } from './lib/CharactersProvider.tsx'
import { JobsProvider } from './lib/JobsProvider.tsx'
import { useJobs } from './lib/jobsContext.ts'
import { PhotoProvider } from './lib/PhotoProvider.tsx'
import './App.css'

// /dev stays reachable for debugging but is deliberately not in the nav.
const navItems = [
  { to: '/', label: 'Explore', end: true },
  { to: '/create', label: 'Create' },
  { to: '/characters', label: 'Characters' },
  { to: '/library', label: 'Library' },
]

function Logo() {
  return (
    <svg className="logo-mark" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff9a76" />
          <stop offset="1" stopColor="#ff5f45" />
        </linearGradient>
      </defs>
      <circle cx="25" cy="32" r="13" fill="#ededf0" opacity="0.92" />
      <rect x="27" y="19" width="26" height="26" rx="7" fill="url(#logo-g)" />
    </svg>
  )
}

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

function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()
  // Close the mobile menu whenever the route changes (track the path it was opened on).
  const [openedOn, setOpenedOn] = useState(pathname)
  if (menuOpen && openedOn !== pathname) setMenuOpen(false)

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  return (
    <header className={`topnav${menuOpen ? ' menu-open' : ''}`}>
      <NavLink to="/" className="brand" aria-label="Morph home">
        <Logo />
        Morph
      </NavLink>
      <nav id="main-nav" aria-label="Main">
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end}>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <CreditCounter />
      <button
        type="button"
        className="menu-btn"
        aria-expanded={menuOpen}
        aria-controls="main-nav"
        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        onClick={() => {
          setOpenedOn(pathname)
          setMenuOpen((o) => !o)
        }}
      >
        <span aria-hidden="true" />
      </button>
    </header>
  )
}

function App() {
  // Start loading effect names right away: cards on every page label effect outputs with them.
  useEffect(() => {
    fetchPresets().catch(() => {})
  }, [])

  return (
    <ToastProvider>
      <JobsProvider>
        <CharactersProvider>
          <PhotoProvider>
            <a className="skip-link" href="#main">
              Skip to content
            </a>
            <Header />
            <SiteBanners />
            <main id="main">
              <Outlet />
            </main>
          </PhotoProvider>
        </CharactersProvider>
      </JobsProvider>
    </ToastProvider>
  )
}

export default App
