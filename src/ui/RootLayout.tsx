import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import logoUrl from '../logo/Agent-logo.svg'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function RootLayout() {
  const { isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

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
            <NavLink to="/submit-article" className={({ isActive }) => (isActive ? 'active' : '')}>
              Submit Article
            </NavLink>
            {isAuthenticated && (
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
              <button onClick={handleLogout} className="auth-button logout-button">
                Logout
              </button>
            ) : (
              <Link to="/login" className="auth-button login-button">
                Login
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



