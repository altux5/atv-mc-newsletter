import { NavLink, Outlet } from 'react-router-dom'
import logoUrl from '../logo/Agent-logo.svg'
import { Link } from 'react-router-dom'

export default function RootLayout() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="container header-inner">
          <Link to="/" className="brand">
            <img src={logoUrl} alt="Agent logo" />
            <span>ATV MC Newsletter Hub</span>
          </Link>
          <nav className="nav">
            <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
              Home
            </NavLink>
            <NavLink to="/newsletters" className={({ isActive }) => (isActive ? 'active' : '')}>
              Newsletters
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="container main-content">
        <Outlet />
      </main>
      <footer className="app-footer">
        <div className="container">© {new Date().getFullYear()} Newsletter Hub</div>
      </footer>
    </div>
  )
}



