import { NavLink, Outlet } from 'react-router-dom'
import './App.css'

const navItems = [
  { to: '/', label: 'Explore', end: true },
  { to: '/create', label: 'Create' },
  { to: '/characters', label: 'Characters' },
  { to: '/library', label: 'Library' },
]

function App() {
  return (
    <>
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
      </header>
      <main>
        <Outlet />
      </main>
    </>
  )
}

export default App
