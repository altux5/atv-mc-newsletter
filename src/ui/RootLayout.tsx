import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import logoUrl from '../logo/Agent-logo.svg'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import SubscribeForm from './components/SubscribeForm'
import { AnalyticsProvider, AnalyticsPreferences, PageAnalytics } from '../contexts/AnalyticsContext'

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
    <AnalyticsProvider>
    <div className="app-shell">
      <PageAnalytics />
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
            <NavLink
              to="/newsletters"
              className={() => {
                const p = location.pathname
                const isNewslettersTab =
                  p === '/newsletters' ||
                  (p.startsWith('/newsletters/') &&
                    p !== '/newsletters/create' &&
                    !p.startsWith('/newsletters/edit/'))
                return isNewslettersTab ? 'active' : ''
              }}
            >
              Newsletters
            </NavLink>
            <NavLink to="/submit-article" data-analytics-action="submit-article" className={({ isActive }) => (isActive ? 'active' : '')}>
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
                <NavLink to="/admin/analytics" className={({ isActive }) => `analytics-nav-link${isActive ? ' active' : ''}`}>
                  Analytics
                </NavLink>
              </>
            )}
          </nav>
          <div className="nav-auth">
            {isAuthenticated ? (
              <div className="user-chip">
                <span className="user-avatar" aria-hidden="true">
                  {(user?.email?.[0] ?? 'U').toUpperCase()}
                </span>
                <div className="user-info">
                  {user?.email && (
                    <span className="user-email" title={user.email}>
                      {user.email}
                    </span>
                  )}
                  <button onClick={handleLogout} className="auth-button logout-button">
                    Logout
                  </button>
                </div>
              </div>
            ) : (
              <Link to="/login" className="auth-button login-button">
                Editor Login
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="container main-content">
        <Outlet />
      </main>
      <footer className="app-footer">
        <div className="container">
          <SubscribeForm />
          <div className="app-footer-copy">© {new Date().getFullYear()} Newsletter Hub</div>
          <AnalyticsPreferences />
        </div>
      </footer>
    </div>
    </AnalyticsProvider>
  )
}



