import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

export default function LoginPage() {
  const { isAuthenticated, isEditor, isLoading: isAuthLoading, login, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string })?.from || '/'
  const denied = Boolean((location.state as { denied?: boolean } | null)?.denied)

  // Redirect back if already authenticated as editor
  useEffect(() => {
    if (!isAuthLoading && isAuthenticated && isEditor) {
      navigate(from, { replace: true })
    }
  }, [from, isAuthenticated, isAuthLoading, isEditor, navigate])

  // Auto-trigger SSO if landing here without a session and not a denied redirect
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated && !denied) {
      login(from)
    }
  }, [isAuthLoading, isAuthenticated, denied, login, from])

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <h1>Editor Access</h1>
          <p className="meta">Sign in with your Infineon corporate account to access editor features.</p>
        </div>

        {denied && (
          <div className="error-message" role="alert">
            Your account is signed in but is not authorised for editor access.
            Please contact the newsletter administrator to request access.
          </div>
        )}

        {isAuthenticated && !isEditor && user?.email && (
          <div className="error-message" role="alert">
            Signed in as <strong>{user.email}</strong>, but this account does not currently have editor access.
            Please contact the newsletter administrator to request access.
          </div>
        )}

        {!isAuthenticated && (
          <div className="form-actions">
            <button
              type="button"
              className="button primary"
              onClick={() => login(from)}
              disabled={isAuthLoading}
            >
              {isAuthLoading ? 'Redirecting...' : 'Sign In With Corporate Email'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

