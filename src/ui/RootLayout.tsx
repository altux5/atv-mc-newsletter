import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import logoUrl from '../logo/Agent-logo.svg'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function RootLayout() {
  const { isAuthenticated, isEditor, logout, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // Pages that have their own floating toolbar (newsletter editor, submit
  // article). Keep the site header static there so only one bar floats.
  const hideStickyHeader =
    location.pathname === '/newsletters/create' ||
    location.pathname.startsWith('/newsletters/edit/') ||
    location.pathname === '/submit-article'

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <div className="app-shell">
      <header className={`app-header${hideStickyHeader ? ' editor-route' : ''}`}>
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
            <NavLink to="/submit-article" className={({ isActive }) => (isActive ? 'active' : '')}>
              Submit Article
            </NavLink>
            {isEditor && (
              <>
                <NavLink to="/admin/articles" className={({ isActive }) => (isActive ? 'active' : '')}>
                  Review Articles
                </NavLink>
                <NavLink to="/newsletters/create" className={({ isActive }) => (isActive ? 'active' : '')}>
                  Create Newsletter
                </NavLink>
              </>
            )}
            {isAuthenticated ? (
              <>
                {user?.email && <span className="meta auth-meta">{user.email}</span>}
                <button onClick={handleLogout} className="auth-button logout-button">
                  Logout
                </button>
              </>
            ) : (
              <Link to="/login" className="auth-button login-button">
                Editor Login
              </Link>
            )}
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



