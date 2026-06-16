import type { SubmittedArticle, ArticleFormData } from '../types/article'

// API client for submitted articles. Mirrors the old localArticles.ts surface
// but talks to the database-backed backend (/api/articles) instead of
// LocalStorage. All functions are async.

const BASE = '/api/articles'

// Thrown when the request was blocked by the auth gateway (not signed in) or the
// server was unreachable. The message is safe to show directly to users.
export class AuthRequiredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthRequiredError'
  }
}

// Wrap fetch so an auth-gateway redirect becomes a clear, actionable error.
// With redirect:'manual', an unauthenticated request that the MIAMI gateway
// redirects to SSO returns an opaque redirect (type 'opaqueredirect', status 0)
// instead of silently following cross-origin and failing as "Failed to fetch".
async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
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

async function parse<T>(res: Response): Promise<T> {
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

export async function saveArticle(formData: ArticleFormData): Promise<SubmittedArticle> {
  const res = await apiFetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formData),
  })
  return parse<SubmittedArticle>(res)
}

export async function getArticles(): Promise<SubmittedArticle[]> {
  const res = await apiFetch(BASE)
  return parse<SubmittedArticle[]>(res)
}

export async function getArticleById(id: string): Promise<SubmittedArticle | null> {
  const res = await apiFetch(`${BASE}/${encodeURIComponent(id)}`)
  if (res.status === 404) return null
  return parse<SubmittedArticle>(res)
}

export async function deleteArticle(id: string): Promise<void> {
  const res = await apiFetch(`${BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete article (${res.status})`)
  }
}

export async function markArticleAsImported(id: string): Promise<void> {
  const res = await apiFetch(`${BASE}/${encodeURIComponent(id)}/import`, { method: 'PATCH' })
  await parse<SubmittedArticle>(res)
}

export async function getAvailableArticlesForImport(): Promise<SubmittedArticle[]> {
  return getArticles()
}
