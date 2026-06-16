import type { SubmittedArticle, ArticleFormData } from '../types/article'
import { apiFetch, parseJson, AuthRequiredError } from './apiClient'

// API client for submitted articles. Mirrors the old localArticles.ts surface
// but talks to the database-backed backend (/api/articles) instead of
// LocalStorage. All functions are async.

const BASE = '/api/articles'

// Re-export so existing imports of AuthRequiredError from this module keep working.
export { AuthRequiredError }

export async function saveArticle(formData: ArticleFormData): Promise<SubmittedArticle> {
  const res = await apiFetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formData),
  })
  return parseJson<SubmittedArticle>(res)
}

export async function getArticles(): Promise<SubmittedArticle[]> {
  const res = await apiFetch(BASE)
  return parseJson<SubmittedArticle[]>(res)
}

export async function getArticleById(id: string): Promise<SubmittedArticle | null> {
  const res = await apiFetch(`${BASE}/${encodeURIComponent(id)}`)
  if (res.status === 404) return null
  return parseJson<SubmittedArticle>(res)
}

export async function deleteArticle(id: string): Promise<void> {
  const res = await apiFetch(`${BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete article (${res.status})`)
  }
}

export async function markArticleAsImported(id: string): Promise<void> {
  const res = await apiFetch(`${BASE}/${encodeURIComponent(id)}/import`, { method: 'PATCH' })
  await parseJson<SubmittedArticle>(res)
}

export async function getAvailableArticlesForImport(): Promise<SubmittedArticle[]> {
  return getArticles()
}
