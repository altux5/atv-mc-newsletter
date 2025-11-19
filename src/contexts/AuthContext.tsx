import { createContext, useContext, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { isAuthenticated as checkAuth, saveAuthState, clearAuthState, validateCredentials, type AuthCredentials } from '../utils/auth'

interface AuthContextType {
  isAuthenticated: boolean
  login: (credentials: AuthCredentials) => Promise<boolean>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(() => checkAuth())

  useEffect(() => {
    // Check authentication status on mount
    setAuthenticated(checkAuth())
  }, [])

  const login = async (credentials: AuthCredentials): Promise<boolean> => {
    if (validateCredentials(credentials)) {
      saveAuthState()
      setAuthenticated(true)
      return true
    }
    return false
  }

  const logout = () => {
    clearAuthState()
    setAuthenticated(false)
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated: authenticated, login, logout }}>
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

