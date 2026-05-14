import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { authMode, isAuthenticated, isEditor, isLoading, login } = useAuth()
  const location = useLocation()

  useEffect(() => {
    if (!isLoading && !isAuthenticated && authMode === 'miami') {
      void login({ returnTo: location.pathname })
    }
  }, [authMode, isAuthenticated, isLoading, location.pathname, login])

  if (isLoading) {
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="login-header">
            <h1>Checking Access</h1>
            <p className="meta">Verifying your corporate session.</p>
          </div>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    if (authMode === 'miami') {
      return (
        <div className="login-page">
          <div className="login-container">
            <div className="login-header">
              <h1>Redirecting</h1>
              <p className="meta">Forwarding you to the corporate sign-in page.</p>
            </div>
          </div>
        </div>
      )
    }

    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  if (!isEditor) {
    return <Navigate to="/login" state={{ from: location.pathname, denied: true }} replace />
  }

  return <>{children}</>
}

