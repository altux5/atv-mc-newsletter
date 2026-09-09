import type { Newsletter } from '../data/newsletters'
import type { NewsletterDraft } from '../types/newsletter-creation'
import type { SendResult } from './subscribersApi'
import { apiFetch, parseJson } from './apiClient'
import { draftToNewsletter } from './localNewsletters'
import { generateNewsletterEmailHtml } from './generateNewsletterEmailHtml'

// API client for newsletter drafts + published newsletters, backed by the
// database (/api/drafts and /api/newsletters). This mirrors the old
// localNewsletters.ts surface but is async and shared across browsers.
//
// Two-track model:
//   - Published newsletters created in-app -> rows in the `newsletters` table
//     (this module). Reading them is public (GET /api/newsletters).
//   - The full editor state -> the `newsletter_drafts` table (NewsletterDraft).
//   - The bundled .htm archive stays in src/data/newsletters.ts (untouched).

const DRAFTS = '/api/drafts'
const NEWSLETTERS = '/api/newsletters'

// --- published newsletters (public read) ----------------------------------

/** All published newsletters from the database, as Newsletter objects. */
export async function getPublishedNewslettersApi(): Promise<Newsletter[]> {
  const res = await apiFetch(NEWSLETTERS)
  return parseJson<Newsletter[]>(res)
}

/**
 * Full editor state of a *published* newsletter. Public read, so visitors
 * without editor rights can still see the newsletter body.
 */
export async function getPublishedBodyApi(id: string): Promise<NewsletterDraft | null> {
  const res = await apiFetch(`${NEWSLETTERS}/${encodeURIComponent(id)}/body`)
  if (res.status === 404) return null
  return parseJson<NewsletterDraft>(res)
}

// --- drafts (editor-only) --------------------------------------------------

export async function getAllDraftsApi(): Promise<NewsletterDraft[]> {
  const res = await apiFetch(DRAFTS)
  return parseJson<NewsletterDraft[]>(res)
}

export async function getDraftByIdApi(id: string): Promise<NewsletterDraft | null> {
  const res = await apiFetch(`${DRAFTS}/${encodeURIComponent(id)}`)
  if (res.status === 404) return null
  return parseJson<NewsletterDraft>(res)
}

/** Insert or update the full draft (PUT upsert). Returns the stored draft. */
export async function saveDraftApi(draft: NewsletterDraft): Promise<NewsletterDraft> {
  const body: NewsletterDraft = { ...draft, updatedAt: new Date().toISOString() }
  const res = await apiFetch(`${DRAFTS}/${encodeURIComponent(draft.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson<NewsletterDraft>(res)
}

export async function deleteDraftApi(id: string): Promise<void> {
  const res = await apiFetch(`${DRAFTS}/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete draft (${res.status})`)
  }
}

// --- publish ---------------------------------------------------------------

/**
 * Publish a draft: mark it published (drafts table) AND upsert a Newsletter
 * summary row into the `newsletters` table so it appears in the public list.
 * The full editor body is reconstructed from the draft on the detail page.
 *
 * `notifySubscribers` tells the server to email the distribution list as part of
 * this same (gateway-reachable) request; the returned `notify` summary reports
 * how many subscribers were emailed. `notify` is null when mail is not
 * configured on the server.
 */
export interface PublishResult extends Newsletter {
  notify?: SendResult | null
}

/**
 * Rewrite root-relative asset URLs (e.g. the header image and logo bundled by
 * Vite as `/assets/...`) to absolute URLs so they load inside email clients,
 * which cannot resolve site-relative paths. Data URLs and already-absolute URLs
 * are left untouched.
 */
function absolutizeAssetUrls(html: string): string {
  const origin = window.location.origin
  return html
    .replace(/src="\/(?!\/)/g, `src="${origin}/`)
    .replace(/url\('\/(?!\/)/g, `url('${origin}/`)
}

export async function publishNewsletterApi(draft: NewsletterDraft): Promise<PublishResult> {
  const published: NewsletterDraft = { ...draft, status: 'published' }
  await saveDraftApi(published)

  const summary = draftToNewsletter(published)
  // Render the full newsletter with an email-safe (table-based) layout, then
  // make bundled asset URLs (e.g. the default header image) absolute so email
  // clients can load them. Article/embedded data-URL images are left as-is and
  // embedded as CID attachments by the server.
  const emailHtml = absolutizeAssetUrls(generateNewsletterEmailHtml(published))
  const res = await apiFetch(NEWSLETTERS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...summary, notifySubscribers: true, emailHtml }),
  })
  return parseJson<PublishResult>(res)
}

/**
 * Editor: email a single test copy of the current draft to one address.
 * Nothing is published and no subscriber is contacted. The server restricts the
 * recipient to an @infineon.com address.
 */
export async function sendTestNewsletterApi(
  draft: NewsletterDraft,
  email: string,
): Promise<SendResult> {
  const summary = draftToNewsletter(draft)
  const emailHtml = absolutizeAssetUrls(generateNewsletterEmailHtml(draft))
  const res = await apiFetch(`${NEWSLETTERS}/${encodeURIComponent(draft.id)}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      testEmail: email,
      title: summary.title,
      slug: summary.slug,
      excerpt: summary.excerpt,
      date: summary.date,
      emailHtml,
    }),
  })
  return parseJson<SendResult>(res)
}

/**
 * Delete a custom (DB) newsletter completely: remove both the published
 * summary row and the underlying draft. 404s are ignored so deleting a
 * newsletter that only ever existed as one of the two is still safe.
 */
export async function deleteNewsletterApi(id: string): Promise<void> {
  const res = await apiFetch(`${NEWSLETTERS}/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete newsletter (${res.status})`)
  }
  await deleteDraftApi(id)
}
