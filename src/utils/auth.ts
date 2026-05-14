const AUTH_STORAGE_KEY = 'newsletter_auth'
const AUTH_EMAIL_STORAGE_KEY = 'newsletter_auth_email'

const LOCAL_EDITOR_USERNAME = import.meta.env.VITE_LOCAL_EDITOR_USERNAME ?? 'admin'
const LOCAL_EDITOR_PASSWORD = import.meta.env.VITE_LOCAL_EDITOR_PASSWORD ?? 'admin'
const AUTH_MODE = (import.meta.env.VITE_AUTH_MODE ?? 'local').toLowerCase() === 'miami'
  ? 'miami'
  : 'local'

const OAUTH_SIGN_IN_PATH = import.meta.env.VITE_OAUTH_SIGN_IN_PATH ?? '/oauth2/sign_in'
const OAUTH_SIGN_OUT_PATH = import.meta.env.VITE_OAUTH_SIGN_OUT_PATH ?? '/oauth2/sign_out'
const OAUTH_USERINFO_PATH = import.meta.env.VITE_OAUTH_USERINFO_PATH ?? '/oauth2/userinfo'

const editorEmails = parseList(import.meta.env.VITE_EDITOR_EMAILS)

export type AuthMode = 'local' | 'miami'

export interface AuthCredentials {
  username?: string
  password?: string
  returnTo?: string
}

export interface AuthUser {
  email: string
  name?: string
  preferredUsername?: string
}

interface MiamiUserInfo {
  email?: string
  name?: string
  preferred_username?: string
  sub?: string
}

function parseList(value?: string): string[] {
  if (!value) {
    return []
  }

  return value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

function normalizeEmail(value?: string): string {
  return value?.trim().toLowerCase() ?? ''
}

function buildReturnToPath(returnTo?: string): string {
  if (returnTo) {
    return returnTo
  }

  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

function buildOauthUrl(basePath: string, returnTo?: string): string {
  const separator = basePath.includes('?') ? '&' : '?'
  return `${basePath}${separator}rd=${encodeURIComponent(buildReturnToPath(returnTo))}`
}

async function parseUserInfo(response: Response): Promise<MiamiUserInfo | null> {
  const contentType = response.headers.get('content-type') ?? ''

  try {
    if (contentType.includes('application/json')) {
      return (await response.json()) as MiamiUserInfo
    }

    const text = await response.text()
    return JSON.parse(text) as MiamiUserInfo
  } catch {
    return null
  }
}

export function getAuthMode(): AuthMode {
  return AUTH_MODE
}

export function isMiamiAuthEnabled(): boolean {
  return AUTH_MODE === 'miami'
}

export function validateCredentials(credentials: AuthCredentials): boolean {
  if (AUTH_MODE !== 'local') {
    return false
  }

  return credentials.username === LOCAL_EDITOR_USERNAME && credentials.password === LOCAL_EDITOR_PASSWORD
}

export function saveAuthState(email?: string): void {
  localStorage.setItem(AUTH_STORAGE_KEY, 'authenticated')

  if (email) {
    localStorage.setItem(AUTH_EMAIL_STORAGE_KEY, normalizeEmail(email))
  }
}

export function clearAuthState(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY)
  localStorage.removeItem(AUTH_EMAIL_STORAGE_KEY)
}

export function isAuthenticated(): boolean {
  if (AUTH_MODE === 'miami') {
    return false
  }

  return localStorage.getItem(AUTH_STORAGE_KEY) === 'authenticated'
}

export function getLoginUrl(returnTo?: string): string {
  return buildOauthUrl(OAUTH_SIGN_IN_PATH, returnTo)
}

export function getLogoutUrl(returnTo = '/'): string {
  return buildOauthUrl(OAUTH_SIGN_OUT_PATH, returnTo)
}

export function redirectToLogin(returnTo?: string): void {
  window.location.assign(getLoginUrl(returnTo))
}

export function redirectToLogout(returnTo = '/'): void {
  window.location.assign(getLogoutUrl(returnTo))
}

export function isEditor(user: AuthUser | null): boolean {
  if (!user) {
    return false
  }

  if (AUTH_MODE === 'local') {
    return true
  }

  if (editorEmails.length === 0) {
    return false
  }

  return editorEmails.includes(normalizeEmail(user.email))
}

export function getEditorEmailList(): string[] {
  return [...editorEmails]
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  if (AUTH_MODE === 'local') {
    if (!isAuthenticated()) {
      return null
    }

    const email = localStorage.getItem(AUTH_EMAIL_STORAGE_KEY) ?? `${LOCAL_EDITOR_USERNAME}@infineon.com`
    return {
      email: normalizeEmail(email),
      preferredUsername: LOCAL_EDITOR_USERNAME,
    }
  }

  try {
    const response = await fetch(OAUTH_USERINFO_PATH, {
      credentials: 'include',
      headers: {
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      return null
    }

    const payload = await parseUserInfo(response)
    const email = normalizeEmail(payload?.email ?? payload?.preferred_username ?? payload?.sub)

    if (!email) {
      return null
    }

    return {
      email,
      name: payload?.name,
      preferredUsername: payload?.preferred_username,
    }
  } catch {
    return null
  }
}

