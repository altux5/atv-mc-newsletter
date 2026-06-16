// Shared fetch helper for the database-backed REST API.
//
// Converts an auth-gateway redirect or unreachable server into a clear,
// user-safe error. With redirect:'manual', an unauthenticated request that the
// MIAMI gateway redirects to SSO returns an opaque redirect (type
// 'opaqueredirect') instead of silently following cross-origin and failing as a
// generic "Failed to fetch".

export class AuthRequiredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthRequiredError'
  }
}

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  let res: Response
  try {
    res = await fetch(input, { ...init, redirect: 'manual', credentials: 'include' })
  } catch {
    throw new AuthRequiredError(
      'Could not reach the server. Your session may have expired — please refresh the page to sign in from your browser, then try again.',
    )
  }
  if (res.type === 'opaqueredirect' || res.status === 401 || res.status === 403) {
    throw new AuthRequiredError(
      'You need to sign in to do that. Please refresh the page to sign in from your browser, then try again.',
    )
  }
  return res
}

// Parse a JSON response, throwing a readable error for non-2xx replies.
export async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = ''
    try {
      const data = (await res.json()) as { error?: string }
      detail = data?.error ?? ''
    } catch {
      // response had no JSON body
    }
    throw new Error(detail || `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}
