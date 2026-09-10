import type { AnalyticsEvent } from '../src/types/analytics.js'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const publicPaths = new Set(['/', '/newsletters', '/newsletters/list', '/submit-article'])
const eventFields = new Set(['id', 'viewId', 'type', 'path', 'newsletterSlug', 'activeSeconds', 'scrollDepth', 'target'])

export function parseAnalyticsEvent(value: unknown): AnalyticsEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const event = value as Record<string, unknown>
  if (Object.keys(event).some((key) => !eventFields.has(key))) return null
  if (typeof event.id !== 'string' || !uuid.test(event.id) || typeof event.viewId !== 'string' || !uuid.test(event.viewId)) return null
  if (!['view', 'engagement', 'click'].includes(String(event.type))) return null
  if (typeof event.path !== 'string' || event.path.length > 240) return null
  if (event.newsletterSlug !== undefined) {
    if (typeof event.newsletterSlug !== 'string' || event.newsletterSlug.length > 180 || !slugPattern.test(event.newsletterSlug)) return null
    if (event.path !== `/newsletters/${event.newsletterSlug}` || ['create', 'edit', 'list'].includes(event.newsletterSlug)) return null
  } else if (!publicPaths.has(event.path)) return null
  if (event.type === 'engagement') {
    if (!event.newsletterSlug || !Number.isInteger(event.activeSeconds) || Number(event.activeSeconds) < 0 || Number(event.activeSeconds) > 7200) return null
    if (!Number.isInteger(event.scrollDepth) || Number(event.scrollDepth) < 0 || Number(event.scrollDepth) > 100) return null
  } else if (event.activeSeconds !== undefined || event.scrollDepth !== undefined) return null
  if (event.type === 'click') {
    if (typeof event.target !== 'string' || !/^(link-[1-9][0-9]{0,3}|subscribe|submit-article|newsletter-grid|newsletter-list)$/.test(event.target)) return null
    if (event.target.startsWith('link-') && !event.newsletterSlug) return null
  } else if (event.target !== undefined) return null
  if (event.type === 'view' && event.id !== event.viewId) return null
  return event as AnalyticsEvent
}