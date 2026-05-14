import { useState } from 'react'
import { useEffect } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { authMode, isAuthenticated, isEditor, isLoading: isAuthLoading, login, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string })?.from || '/'
  const denied = Boolean((location.state as { denied?: boolean } | null)?.denied)

  useEffect(() => {
    if (!isAuthLoading && isAuthenticated && isEditor) {
      navigate(from, { replace: true })
    }
  }, [from, isAuthenticated, isAuthLoading, isEditor, navigate])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const success = await login({ username, password, returnTo: from })
      if (success) {
        navigate(from, { replace: true })
      } else {
        setError('Invalid username or password')
      }
    } catch (err) {
      setError('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCorporateLogin = async () => {
    setError('')
    setIsLoading(true)
    try {
      await login({ returnTo: from })
    } finally {
      setIsLoading(false)
    }
  }

  if (authMode === 'miami') {
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="login-header">
            <h1>Editor Access</h1>
            <p className="meta">Sign in with your Infineon corporate account to access editor features.</p>
          </div>

          {denied && (
            <div className="error-message" role="alert">
              Your account is signed in but is not in the editor allowlist for this app.
            </div>
          )}

          {isAuthenticated && !isEditor && user?.email && (
            <div className="error-message" role="alert">
              Signed in as {user.email}, but this account does not currently have editor access.
            </div>
          )}

          <div className="form-actions">
            <button
              type="button"
              className="button primary"
              onClick={handleCorporateLogin}
              disabled={isLoading || isAuthLoading}
            >
              {isLoading ? 'Redirecting...' : 'Sign In With Corporate Email'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <h1>Admin Login</h1>
          <p className="meta">Enter your local development credentials to access admin features.</p>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              disabled={isLoading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              disabled={isLoading}
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="button primary" disabled={isLoading}>
              {isLoading ? 'Logging in...' : 'Login'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

