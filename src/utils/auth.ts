// Authentication utilities

const AUTH_STORAGE_KEY = 'newsletter_auth'
const ADMIN_USERNAME = 'admin'
const ADMIN_PASSWORD = 'admin'

export interface AuthCredentials {
  username: string
  password: string
}

export function validateCredentials(credentials: AuthCredentials): boolean {
  return credentials.username === ADMIN_USERNAME && credentials.password === ADMIN_PASSWORD
}

export function saveAuthState(): void {
  localStorage.setItem(AUTH_STORAGE_KEY, 'authenticated')
}

export function clearAuthState(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY)
}

export function isAuthenticated(): boolean {
  return localStorage.getItem(AUTH_STORAGE_KEY) === 'authenticated'
}

