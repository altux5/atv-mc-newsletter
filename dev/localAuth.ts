import { randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

export interface LocalUser {
  email: string
  name?: string
  preferred_username?: string
}

export interface LoginAttempt {
  state: string
  nonce: string
  verifier: string
  redirectUri: string
}

export interface LocalOidc {
  authorize: (attempt: LoginAttempt) => Promise<string>
  authenticate: (callback: URL, attempt: LoginAttempt) => Promise<LocalUser>
}

const random = () => randomBytes(32).toString('base64url')

export function localReturnPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x1f\x7f]/.test(value)) return '/'
  const url = new URL(value, 'http://localhost')
  if (url.origin !== 'http://localhost' || url.pathname.startsWith('/oauth2')) return '/'
  return `${url.pathname}${url.search}${url.hash}`
}

export function createLocalAuth(options: { origin: string; oidc?: LocalOidc; now?: () => number }) {
  const origin = new URL(options.origin)
  if (origin.protocol !== 'http:' || origin.hostname !== 'localhost' || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) throw new Error('Local auth requires an http://localhost:<port> origin.')
  const now = options.now ?? Date.now
  const loginCookie = `newsletter_local_login_${origin.port}`
  const sessionCookie = `newsletter_local_session_${origin.port}`
  const pending = new Map<string, LoginAttempt & { expires: number; returnTo: string }>()
  const sessions = new Map<string, { user: LocalUser; expires: number }>()
  const cookie = (name: string, value: string, age: number) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}`
  const getCookie = (request: IncomingMessage, name: string) => request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1)
  const json = (response: ServerResponse, status: number, body: object) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(body)) }
  const message = (response: ServerResponse, status: number, text: string) => { response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end(text) }
  const redirect = (response: ServerResponse, location: string) => { response.writeHead(302, { Location: location }); response.end() }

  return async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const url = new URL(request.url ?? '/', origin)
    if (!url.pathname.startsWith('/oauth2/')) return next()
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Referrer-Policy', 'no-referrer')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '')) return message(response, 403, 'Local sign-in requires a loopback connection.')
    const actualHost = request.headers.host
    const localhostHost = origin.host
    const loopbackHost = `127.0.0.1${origin.port ? `:${origin.port}` : ''}`
    if (actualHost !== localhostHost && actualHost !== loopbackHost) return message(response, 403, 'Local sign-in is available on localhost only.')
    if (request.method !== 'GET') return message(response, 405, 'Method not allowed.')
    for (const [key, value] of pending) if (value.expires <= now()) pending.delete(key)
    for (const [key, value] of sessions) if (value.expires <= now()) sessions.delete(key)
    if (url.pathname === '/oauth2/userinfo') {
      const session = sessions.get(getCookie(request, sessionCookie) ?? '')
      return session ? json(response, 200, session.user) : json(response, 401, { error: 'Local corporate sign-in required.' })
    }
    if (url.pathname === '/oauth2/sign_out') {
      sessions.delete(getCookie(request, sessionCookie) ?? '')
      pending.delete(getCookie(request, loginCookie) ?? '')
      response.setHeader('Set-Cookie', [cookie(sessionCookie, '', 0), cookie(loginCookie, '', 0)])
      return redirect(response, localReturnPath(url.searchParams.get('rd')))
    }
    if (url.pathname !== '/oauth2/sign_in' && url.pathname !== '/oauth2/start' && url.pathname !== '/oauth2/callback') return message(response, 404, 'Unknown local authentication endpoint.')
    if (actualHost !== localhostHost) return redirect(response, `${origin.origin}/oauth2/sign_in?rd=${encodeURIComponent(localReturnPath(url.searchParams.get('rd')))}`)
    if (!options.oidc) return message(response, 503, 'Local MIAMI sign-in is not configured. Set MIAMI_CLIENT_ID in .env.development.local to the public client ID registered for this app, then restart npm run dev. No changes to the deployed MIAMI gateway are needed.')
    if (url.pathname === '/oauth2/callback') {
      const key = getCookie(request, loginCookie) ?? ''
      const attempt = pending.get(key)
      pending.delete(key)
      response.setHeader('Set-Cookie', cookie(loginCookie, '', 0))
      if (!attempt || url.searchParams.get('state') !== attempt.state || !url.searchParams.get('code') || url.searchParams.has('error')) return message(response, 400, 'Local sign-in expired or the callback was invalid. Start Editor Login again on localhost.')
      try {
        const user = await options.oidc.authenticate(url, attempt)
        if (!/^[^\s@]+@infineon\.com$/i.test(user.email)) throw new Error('Corporate email required')
        if (sessions.size >= 100) return message(response, 503, 'Too many local sessions. Restart the development server.')
        sessions.delete(getCookie(request, sessionCookie) ?? '')
        const sessionId = random()
        sessions.set(sessionId, { user, expires: now() + 3600000 })
        response.setHeader('Set-Cookie', [cookie(loginCookie, '', 0), cookie(sessionCookie, sessionId, 3600)])
        return redirect(response, attempt.returnTo)
      } catch {
        return message(response, 502, 'Local MIAMI token verification failed. Check the registered localhost callback, public-client PKCE configuration, network access and Node certificate trust, then start Editor Login again.')
      }
    }
    if (pending.size >= 100) return message(response, 429, 'Too many local sign-in attempts. Try again in ten minutes.')
    const attempt = { state: random(), nonce: random(), verifier: random(), redirectUri: `${origin.origin}/oauth2/callback`, expires: now() + 600000, returnTo: localReturnPath(url.searchParams.get('rd')) }
    try {
      const authorizationUrl = await options.oidc.authorize(attempt)
      const key = random()
      pending.delete(getCookie(request, loginCookie) ?? '')
      pending.set(key, attempt)
      response.setHeader('Set-Cookie', cookie(loginCookie, key, 600))
      return redirect(response, authorizationUrl)
    } catch {
      return message(response, 502, 'Could not reach MIAMI discovery for local sign-in. Check MIAMI_CLIENT_ID, corporate network access and Node certificate trust. Production MIAMI has not been changed.')
    }
  }
}