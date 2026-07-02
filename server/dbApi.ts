import { Router, type Request, type Response } from 'express'
import { randomUUID } from 'crypto'
import { query } from './db.js'
import {
  isMailerEnabled,
  sendNewsletterToSubscribers,
  type NewsletterEmail,
  type Recipient,
  type SendResult,
} from './mailer.js'

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
    const newsletter = mapNewsletter(rows[0])
    // When the editor publishes (notifySubscribers=true), email the distribution
    // list from here — the publish request already reaches the server, whereas a
    // separate /send request is not always exposed to the browser by the gateway.
    // The .htm migration and plain edits omit the flag, so they never send.
    let notify: NotifyResult | null = null
    if (b.notifySubscribers === true) {
      try {
        notify = await dispatchNewsletterToSubscribers({
          title: rows[0].title,
          slug: rows[0].slug,
          excerpt: rows[0].excerpt ?? '',
          date: rows[0].date,
          bodyHtml: typeof b.emailHtml === 'string' ? b.emailHtml : undefined,
        })
      } catch (mailError) {
        console.error('[db-api] notify subscribers failed:', mailError)
        notify = { sent: 0, failed: 0, recipients: 0, errors: ['Email send failed'] }
      }
    }
    res.status(201).json({ ...newsletter, notify })
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

// --- subscribers ----------------------------------------------------------

// Deliberately permissive: enough to reject obvious typos, not a full RFC check.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  return EMAIL_RE.test(email) ? email : null
}

interface SubscriberRow {
  email: string
  subscribed_at: Date | string
}

// Public: a visitor subscribes to the distribution list. Idempotent — an
// existing (or previously unsubscribed) address is simply re-activated.
dbApi.post('/subscribers', async (req: Request, res: Response) => {
  const email = normalizeEmail((req.body ?? {}).email)
  if (!email) return res.status(400).json({ error: 'A valid email address is required.' })
  try {
    await query(
      `INSERT INTO subscribers (id, email, active, unsubscribe_token, subscribed_at)
       VALUES ($1, $2, true, $3, now())
       ON CONFLICT (email) DO UPDATE SET
         active = true, unsubscribed_at = NULL`,
      [randomUUID(), email, randomUUID()],
    )
    res.status(201).json({ email, subscribed: true })
  } catch (error) {
    fail(res, 'POST /subscribers', error)
  }
})

// Editor: list active subscribers (no tokens exposed).
dbApi.get('/subscribers', async (_req: Request, res: Response) => {
  try {
    const rows = await query<SubscriberRow>(
      `SELECT email, subscribed_at FROM subscribers WHERE active = true ORDER BY subscribed_at DESC`,
    )
    res.json(
      rows.map((r) => ({
        email: r.email,
        subscribedAt: r.subscribed_at instanceof Date ? r.subscribed_at.toISOString() : r.subscribed_at,
      })),
    )
  } catch (error) {
    fail(res, 'GET /subscribers', error)
  }
})

// Public one-click unsubscribe (from the link in every email). Returns a small
// HTML confirmation page. The token ensures a recipient can only remove their
// own address.
dbApi.get('/subscribers/unsubscribe', async (req: Request, res: Response) => {
  const email = normalizeEmail(req.query.email)
  const token = typeof req.query.token === 'string' ? req.query.token : ''
  const page = (heading: string, body: string, status: number) =>
    res.status(status).type('html').send(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
        `<title>${heading}</title></head>` +
        `<body style="font-family:Segoe UI,Arial,sans-serif;background:#f4f5f7;color:#1f2937;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;">` +
        `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:32px 40px;max-width:420px;text-align:center;">` +
        `<h1 style="font-size:20px;margin:0 0 10px;">${heading}</h1><p style="color:#4b5563;margin:0;">${body}</p></div></body></html>`,
    )

  if (!email || !token) {
    return page('Invalid link', 'This unsubscribe link is missing or malformed.', 400)
  }
  try {
    const rows = await query<{ email: string }>(
      `UPDATE subscribers SET active = false, unsubscribed_at = now()
       WHERE email = $1 AND unsubscribe_token = $2 AND active = true
       RETURNING email`,
      [email, token],
    )
    if (rows.length === 0) {
      return page('Already unsubscribed', 'This address is not on the list, or the link has already been used.', 200)
    }
    return page('Unsubscribed', `${email} has been removed from the newsletter list.`, 200)
  } catch (error) {
    console.error('[db-api] GET /subscribers/unsubscribe failed:', error)
    return page('Something went wrong', 'Please try again later.', 500)
  }
})

// --- send a published newsletter to the distribution list -----------------

interface SendNewsletterRow {
  title: string
  slug: string
  excerpt: string | null
  date: string
}

interface SendRecipientRow {
  email: string
  unsubscribe_token: string
}

export interface NotifyResult extends SendResult {
  recipients: number
}

// Send a newsletter to every active subscriber. Returns null when the mailer is
// not configured; otherwise a per-run summary (recipients may be 0). Shared by
// the publish flow and the manual /send route below.
async function dispatchNewsletterToSubscribers(
  newsletter: NewsletterEmail,
): Promise<NotifyResult | null> {
  if (!isMailerEnabled()) return null
  const recipientRows = await query<SendRecipientRow>(
    `SELECT email, unsubscribe_token FROM subscribers WHERE active = true`,
  )
  if (recipientRows.length === 0) return { sent: 0, failed: 0, errors: [], recipients: 0 }
  const recipients: Recipient[] = recipientRows.map((r) => ({
    email: r.email,
    unsubscribeToken: r.unsubscribe_token,
  }))
  const result = await sendNewsletterToSubscribers(newsletter, recipients)
  return { ...result, recipients: recipients.length }
}

// Editor: email a published newsletter to every active subscriber. Kept for
// manual/administrative re-sends. The normal publish flow does NOT rely on this
// route (the gateway does not always expose this extra path to the browser);
// publishing triggers the send server-side via POST /newsletters.
dbApi.post('/newsletters/:id/send', async (req: Request, res: Response) => {
  if (!isMailerEnabled()) {
    return res.status(503).json({ error: 'Email distribution is not configured on this server.' })
  }
  try {
    const newsletterRows = await query<SendNewsletterRow>(
      `SELECT title, slug, excerpt, to_char(date, 'YYYY-MM-DD') AS date
       FROM newsletters WHERE id = $1`,
      [req.params.id],
    )
    if (newsletterRows.length === 0) return res.status(404).json({ error: 'Newsletter not found' })

    const result = await dispatchNewsletterToSubscribers({
      title: newsletterRows[0].title,
      slug: newsletterRows[0].slug,
      excerpt: newsletterRows[0].excerpt ?? '',
      date: newsletterRows[0].date,
    })
    res.json(result ?? { sent: 0, failed: 0, recipients: 0, errors: [] })
  } catch (error) {
    fail(res, 'POST /newsletters/:id/send', error)
  }
})
