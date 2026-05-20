const OAUTH_SIGN_IN_PATH = import.meta.env.VITE_OAUTH_SIGN_IN_PATH ?? '/oauth2/sign_in'
const OAUTH_SIGN_OUT_PATH = import.meta.env.VITE_OAUTH_SIGN_OUT_PATH ?? '/oauth2/sign_out'
const OAUTH_USERINFO_PATH = import.meta.env.VITE_OAUTH_USERINFO_PATH ?? '/oauth2/userinfo'

const editorEmails = parseList(import.meta.env.VITE_EDITOR_EMAILS)

export interface AuthUser {
  email: string
  name?: string
  preferredUsername?: string
}

interface OAuthUserInfo {
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

async function parseUserInfo(response: Response): Promise<OAuthUserInfo | null> {
  const contentType = response.headers.get('content-type') ?? ''

  try {
    if (contentType.includes('application/json')) {
      return (await response.json()) as OAuthUserInfo
    }

    const text = await response.text()
    return JSON.parse(text) as OAuthUserInfo
  } catch {
    return null
  }
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

  if (editorEmails.length === 0) {
    return false
  }

  return editorEmails.includes(normalizeEmail(user.email))
}

export function getEditorEmailList(): string[] {
  return [...editorEmails]
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
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

