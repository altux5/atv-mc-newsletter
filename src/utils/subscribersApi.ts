import { apiFetch, parseJson } from './apiClient'
import type { ManagedSubscriber } from '../types/subscriber'

// API client for the newsletter distribution list (/api/subscribers) and for
// triggering a send of a published newsletter (/api/newsletters/:id/send).

const SUBSCRIBERS = '/api/subscribers'
const NEWSLETTERS = '/api/newsletters'
const ADMIN_SUBSCRIBERS = '/api/admin/subscribers'

export async function getManagedSubscribersApi(signal?: AbortSignal): Promise<ManagedSubscriber[]> {
  return parseJson<ManagedSubscriber[]>(await apiFetch(ADMIN_SUBSCRIBERS, { signal }))
}

export async function addManagedSubscriberApi(email: string, details: Partial<Pick<ManagedSubscriber, 'name' | 'department'>> = {}): Promise<ManagedSubscriber> {
  return parseJson<ManagedSubscriber>(await apiFetch(ADMIN_SUBSCRIBERS, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, ...details }),
  }))
}

export async function removeManagedSubscriberApi(id: string): Promise<ManagedSubscriber> {
  return parseJson<ManagedSubscriber>(await apiFetch(`${ADMIN_SUBSCRIBERS}/${encodeURIComponent(id)}`, { method: 'DELETE' }))
}

export interface Subscriber {
  email: string
  subscribedAt: string
}

export interface SendResult {
  sent: number
  failed: number
  recipients: number
  errors: string[]
}

/** Public: add an email to the distribution list. Idempotent on the server. */
export async function subscribeApi(email: string): Promise<void> {
  const res = await apiFetch(SUBSCRIBERS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  await parseJson<{ email: string; subscribed: boolean }>(res)
}

/** Editor: list active subscribers. */
export async function getSubscribersApi(): Promise<Subscriber[]> {
  const res = await apiFetch(SUBSCRIBERS)
  return parseJson<Subscriber[]>(res)
}

/**
 * Editor: email a published newsletter to all active subscribers. Returns a
 * per-run summary. A 503 means email distribution is not configured on the
 * server; callers treat that as a non-fatal skip.
 */
export async function sendNewsletterApi(id: string): Promise<SendResult> {
  const res = await apiFetch(`${NEWSLETTERS}/${encodeURIComponent(id)}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  return parseJson<SendResult>(res)
}
