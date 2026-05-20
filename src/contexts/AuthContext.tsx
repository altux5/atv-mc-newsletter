import { createContext, useContext, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import {
  fetchCurrentUser,
  isEditor as checkEditor,
  redirectToLogin,
  redirectToLogout,
  type AuthUser,
} from '../utils/auth'

interface AuthContextType {
  isAuthenticated: boolean
  isEditor: boolean
  isLoading: boolean
  user: AuthUser | null
  login: (returnTo?: string) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

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

  const login = (returnTo?: string): void => {
    redirectToLogin(returnTo)
  }

  const logout = () => {
    redirectToLogout('/')
  }

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: user !== null,
        isEditor: checkEditor(user),
        isLoading: loading,
        user,
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

