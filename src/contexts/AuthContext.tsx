import { createContext, useContext, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import {
  clearAuthState,
  fetchCurrentUser,
  getAuthMode,
  isEditor as checkEditor,
  redirectToLogin,
  redirectToLogout,
  saveAuthState,
  validateCredentials,
  type AuthCredentials,
  type AuthMode,
  type AuthUser,
} from '../utils/auth'

interface AuthContextType {
  isAuthenticated: boolean
  isEditor: boolean
  isLoading: boolean
  user: AuthUser | null
  authMode: AuthMode
  login: (credentials?: AuthCredentials) => Promise<boolean>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const authMode = getAuthMode()

  useEffect(() => {
    let cancelled = false

    const loadUser = async () => {
      setLoading(true)
      const currentUser = await fetchCurrentUser()

      if (!cancelled) {
        setUser(currentUser)
        setLoading(false)
      }
    }

    void loadUser()

    return () => {
      cancelled = true
    }
  }, [])

  const login = async (credentials: AuthCredentials = {}): Promise<boolean> => {
    if (authMode === 'miami') {
      redirectToLogin(credentials.returnTo)
      return false
    }

    if (validateCredentials(credentials)) {
      const email = credentials.username
        ? `${credentials.username}@infineon.com`
        : undefined
      const nextUser: AuthUser = {
        email: email ?? 'admin@infineon.com',
        preferredUsername: credentials.username,
      }

      saveAuthState(nextUser.email)
      setUser(nextUser)
      return true
    }

    return false
  }

  const logout = () => {
    clearAuthState()

    if (authMode === 'miami') {
      redirectToLogout('/')
      return
    }

    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: user !== null,
        isEditor: checkEditor(user),
        isLoading: loading,
        user,
        authMode,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

