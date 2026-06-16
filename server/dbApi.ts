import { Router, type Request, type Response } from 'express'
import { query } from './db.js'

// REST API backed by PostgreSQL. Mounted under /api by the server entry point.
//
// Resources:
//   /api/newsletters   published / display newsletters (Newsletter)
//   /api/drafts        full newsletter editor state (NewsletterDraft)
//   /api/articles      submitted articles (SubmittedArticle)

export const dbApi = Router()

// --- helpers --------------------------------------------------------------

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

function fail(res: Response, where: string, error: unknown): void {
  const message = error instanceof Error ? error.message : 'Unknown error'
  console.error(`[db-api] ${where} failed:`, message)
  res.status(500).json({ error: 'Database error' })
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

// --- row shapes -----------------------------------------------------------

interface NewsletterRow {
  id: string
  slug: string
  title: string
  date: string // YYYY-MM-DD (via to_char)
  excerpt: string | null
  content: unknown
  tags: string[] | null
  source_path: string | null
}

interface ArticleRow {
  id: string
  template: string
  title: string
  content: string
  image_data_url: string | null
  contact: string | null
  submitted_at: Date | string
  imported_to_newsletter: boolean
}

function mapNewsletter(r: NewsletterRow) {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    date: `${r.date}T00:00:00.000Z`,
    excerpt: r.excerpt ?? '',
    content: r.content ?? [],
    tags: r.tags ?? [],
    sourcePath: r.source_path ?? undefined,
  }
}

function mapArticle(r: ArticleRow) {
  const submittedAt = r.submitted_at instanceof Date ? r.submitted_at.toISOString() : r.submitted_at
  return {
    id: r.id,
    template: r.template,
    title: r.title,
    content: r.content,
    imageDataUrl: r.image_data_url ?? '',
    contact: r.contact ?? '',
    submittedAt,
    importedToNewsletter: r.imported_to_newsletter,
  }
}

const NEWSLETTER_COLUMNS =
  "id, slug, title, to_char(date, 'YYYY-MM-DD') AS date, excerpt, content, tags, source_path"
const ARTICLE_COLUMNS =
  'id, template, title, content, image_data_url, contact, submitted_at, imported_to_newsletter'

// --- newsletters ----------------------------------------------------------

dbApi.get('/newsletters', async (_req: Request, res: Response) => {
  try {
    const rows = await query<NewsletterRow>(
      `SELECT ${NEWSLETTER_COLUMNS} FROM newsletters ORDER BY date DESC`,
    )
    res.json(rows.map(mapNewsletter))
  } catch (error) {
    fail(res, 'GET /newsletters', error)
  }
})

dbApi.get('/newsletters/:id', async (req: Request, res: Response) => {
  try {
    const rows = await query<NewsletterRow>(
      `SELECT ${NEWSLETTER_COLUMNS} FROM newsletters WHERE id = $1`,
      [req.params.id],
    )
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' })
    res.json(mapNewsletter(rows[0]))
  } catch (error) {
    fail(res, 'GET /newsletters/:id', error)
  }
})

// Upsert (used for publishing and for the .htm migration).
dbApi.post('/newsletters', async (req: Request, res: Response) => {
  const b = req.body ?? {}
  if (!isNonEmptyString(b.slug) || !isNonEmptyString(b.title)) {
    return res.status(400).json({ error: 'slug and title are required' })
  }
  const id: string = isNonEmptyString(b.id) ? b.id : b.slug
  const date: string = isNonEmptyString(b.date) ? b.date : new Date().toISOString()
  const content = Array.isArray(b.content) ? b.content : []
  const tags: string[] = Array.isArray(b.tags) ? b.tags : []
  try {
    const rows = await query<NewsletterRow>(
      `INSERT INTO newsletters (id, slug, title, date, excerpt, content, tags, source_path, updated_at)
       VALUES ($1, $2, $3, $4::date, $5, $6::jsonb, $7, $8, now())
       ON CONFLICT (id) DO UPDATE SET
         slug = EXCLUDED.slug, title = EXCLUDED.title, date = EXCLUDED.date,
         excerpt = EXCLUDED.excerpt, content = EXCLUDED.content, tags = EXCLUDED.tags,
         source_path = EXCLUDED.source_path, updated_at = now()
       RETURNING ${NEWSLETTER_COLUMNS}`,
      [id, b.slug, b.title, date, b.excerpt ?? null, JSON.stringify(content), tags, b.sourcePath ?? null],
    )
    res.status(201).json(mapNewsletter(rows[0]))
  } catch (error) {
    fail(res, 'POST /newsletters', error)
  }
})

dbApi.delete('/newsletters/:id', async (req: Request, res: Response) => {
  try {
    await query('DELETE FROM newsletters WHERE id = $1', [req.params.id])
    res.status(204).end()
  } catch (error) {
    fail(res, 'DELETE /newsletters/:id', error)
  }
})

// --- drafts (full editor state) -------------------------------------------

dbApi.get('/drafts', async (req: Request, res: Response) => {
  try {
    const status = req.query.status
    const rows = isNonEmptyString(status)
      ? await query<{ data: unknown }>(
          'SELECT data FROM newsletter_drafts WHERE status = $1 ORDER BY updated_at DESC',
          [status],
        )
      : await query<{ data: unknown }>(
          'SELECT data FROM newsletter_drafts ORDER BY updated_at DESC',
        )
    res.json(rows.map((r) => r.data))
  } catch (error) {
    fail(res, 'GET /drafts', error)
  }
})

dbApi.get('/drafts/:id', async (req: Request, res: Response) => {
  try {
    const rows = await query<{ data: unknown }>(
      'SELECT data FROM newsletter_drafts WHERE id = $1',
      [req.params.id],
    )
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' })
    res.json(rows[0].data)
  } catch (error) {
    fail(res, 'GET /drafts/:id', error)
  }
})

// Upsert the full draft. Body is the NewsletterDraft object.
dbApi.put('/drafts/:id', async (req: Request, res: Response) => {
  const draft = req.body ?? {}
  const id = req.params.id
  if (!isNonEmptyString(id)) return res.status(400).json({ error: 'id is required' })
  const status: string = isNonEmptyString(draft.status) ? draft.status : 'draft'
  const data = { ...draft, id }
  try {
    const rows = await query<{ data: unknown }>(
      `INSERT INTO newsletter_drafts (id, status, data, updated_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status, data = EXCLUDED.data, updated_at = now()
       RETURNING data`,
      [id, status, JSON.stringify(data)],
    )
    res.status(200).json(rows[0].data)
  } catch (error) {
    fail(res, 'PUT /drafts/:id', error)
  }
})

dbApi.delete('/drafts/:id', async (req: Request, res: Response) => {
  try {
    await query('DELETE FROM newsletter_drafts WHERE id = $1', [req.params.id])
    res.status(204).end()
  } catch (error) {
    fail(res, 'DELETE /drafts/:id', error)
  }
})

// --- articles -------------------------------------------------------------

dbApi.get('/articles', async (_req: Request, res: Response) => {
  try {
    const rows = await query<ArticleRow>(
      `SELECT ${ARTICLE_COLUMNS} FROM articles ORDER BY submitted_at DESC`,
    )
    res.json(rows.map(mapArticle))
  } catch (error) {
    fail(res, 'GET /articles', error)
  }
})

dbApi.get('/articles/:id', async (req: Request, res: Response) => {
  try {
    const rows = await query<ArticleRow>(
      `SELECT ${ARTICLE_COLUMNS} FROM articles WHERE id = $1`,
      [req.params.id],
    )
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' })
    res.json(mapArticle(rows[0]))
  } catch (error) {
    fail(res, 'GET /articles/:id', error)
  }
})

// Create an article. Body is ArticleFormData.
dbApi.post('/articles', async (req: Request, res: Response) => {
  const b = req.body ?? {}
  if (b.template !== 'landscape' && b.template !== 'portrait') {
    return res.status(400).json({ error: 'template must be landscape or portrait' })
  }
  if (!isNonEmptyString(b.title) || !isNonEmptyString(b.content)) {
    return res.status(400).json({ error: 'title and content are required' })
  }
  try {
    const rows = await query<ArticleRow>(
      `INSERT INTO articles (id, template, title, content, image_data_url, contact, submitted_at, imported_to_newsletter)
       VALUES ($1, $2, $3, $4, $5, $6, now(), false)
       RETURNING ${ARTICLE_COLUMNS}`,
      [genId('article'), b.template, b.title, b.content, b.imageDataUrl ?? null, b.contact ?? null],
    )
    res.status(201).json(mapArticle(rows[0]))
  } catch (error) {
    fail(res, 'POST /articles', error)
  }
})

// Mark an article as imported into a newsletter.
dbApi.patch('/articles/:id/import', async (req: Request, res: Response) => {
  try {
    const rows = await query<ArticleRow>(
      `UPDATE articles SET imported_to_newsletter = true WHERE id = $1
       RETURNING ${ARTICLE_COLUMNS}`,
      [req.params.id],
    )
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' })
    res.json(mapArticle(rows[0]))
  } catch (error) {
    fail(res, 'PATCH /articles/:id/import', error)
  }
})

dbApi.delete('/articles/:id', async (req: Request, res: Response) => {
  try {
    await query('DELETE FROM articles WHERE id = $1', [req.params.id])
    res.status(204).end()
  } catch (error) {
    fail(res, 'DELETE /articles/:id', error)
  }
})
