import assert from 'node:assert/strict'
import test from 'node:test'
import { parseAnalyticsEvent } from './analyticsEvents.js'

const view = {
  id: 'a641ca08-6fc8-4c0f-9a27-97f13967caf0',
  viewId: 'a641ca08-6fc8-4c0f-9a27-97f13967caf0',
  type: 'view',
  path: '/newsletters/september-2026',
  newsletterSlug: 'september-2026',
}

test('accepts public views and cumulative newsletter engagement', () => {
  assert.deepEqual(parseAnalyticsEvent(view), view)
  assert.ok(parseAnalyticsEvent({ ...view, type: 'engagement', activeSeconds: 60, scrollDepth: 75 }))
  assert.ok(parseAnalyticsEvent({ ...view, type: 'click', target: 'link-2' }))
  assert.ok(parseAnalyticsEvent({ ...view, path: '/newsletters', newsletterSlug: undefined }))
})

test('rejects private routes, query strings, mismatched slugs and personal fields', () => {
  for (const change of [
    { path: '/admin/analytics', newsletterSlug: undefined },
    { path: '/newsletters/create', newsletterSlug: 'create' },
    { path: '/newsletters/september-2026?email=person@example.com' },
    { newsletterSlug: 'another-edition' },
    { email: 'person@example.com' },
    { ip: '192.0.2.1' },
    { country: 'DE' },
    { id: 'not-a-uuid' },
  ]) assert.equal(parseAnalyticsEvent({ ...view, ...change }), null)
})

test('rejects arbitrary click content and invalid engagement', () => {
  assert.equal(parseAnalyticsEvent({ ...view, type: 'click', target: 'https://example.com?token=secret' }), null)
  assert.equal(parseAnalyticsEvent({ ...view, type: 'engagement', activeSeconds: -1, scrollDepth: 50 }), null)
  assert.equal(parseAnalyticsEvent({ ...view, type: 'engagement', activeSeconds: 10, scrollDepth: 101 }), null)
  assert.equal(parseAnalyticsEvent({ ...view, type: 'view', activeSeconds: 10 }), null)
  assert.equal(parseAnalyticsEvent(null), null)
})