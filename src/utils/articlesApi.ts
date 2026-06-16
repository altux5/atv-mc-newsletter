import type { SubmittedArticle, ArticleFormData } from '../types/article'

// API client for submitted articles. Mirrors the old localArticles.ts surface
// but talks to the database-backed backend (/api/articles) instead of
// LocalStorage. All functions are async.

const BASE = '/api/articles'

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
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formData),
  })
  return parse<SubmittedArticle>(res)
}

export async function getArticles(): Promise<SubmittedArticle[]> {
  const res = await fetch(BASE)
  return parse<SubmittedArticle[]>(res)
}

export async function getArticleById(id: string): Promise<SubmittedArticle | null> {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`)
  if (res.status === 404) return null
  return parse<SubmittedArticle>(res)
}

export async function deleteArticle(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete article (${res.status})`)
  }
}

export async function markArticleAsImported(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}/import`, { method: 'PATCH' })
  await parse<SubmittedArticle>(res)
}

export async function getAvailableArticlesForImport(): Promise<SubmittedArticle[]> {
  return getArticles()
}
