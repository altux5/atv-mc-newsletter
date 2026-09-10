import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { getAnalyticsReport, pruneAnalytics, storeAnalyticsEvent, type AnalyticsQuery } from './analyticsStore.js'
import type { AnalyticsEvent } from '../src/types/analytics.js'

test('PostgreSQL migrations, deduplication, ownership, reports and retention', async () => {
  const database = new PGlite()
  try {
    const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8')
    await database.exec(schema)
    await database.exec(schema)
    const query: AnalyticsQuery = async (sql, params) => (await database.query(sql, params)).rows as Record<string, any>[]
    await query("SET TIME ZONE 'Pacific/Honolulu'")
    const id = randomUUID()
    const event: AnalyticsEvent = { id, viewId: id, type: 'view', path: '/newsletters/test-edition', newsletterSlug: 'test-edition' }
    const location = { country: 'DE', region: 'EMEA' }
    await storeAnalyticsEvent(query, event, 'visitor-one', location)
    await storeAnalyticsEvent(query, event, 'visitor-one', location)
    await storeAnalyticsEvent(query, { ...event, type: 'engagement', activeSeconds: 65, scrollDepth: 80 }, 'visitor-one', location)
    await storeAnalyticsEvent(query, { ...event, type: 'engagement', activeSeconds: 10, scrollDepth: 20 }, 'visitor-one', location)
    await storeAnalyticsEvent(query, { ...event, type: 'engagement', activeSeconds: 500, scrollDepth: 100 }, 'another-visitor', location)
    const click: AnalyticsEvent = { ...event, id: randomUUID(), type: 'click', target: 'link-1' }
    await storeAnalyticsEvent(query, click, 'visitor-one', location)
    await storeAnalyticsEvent(query, click, 'visitor-one', location)
    await storeAnalyticsEvent(query, { ...click, id: randomUUID() }, 'another-visitor', location)
    await query("INSERT INTO subscribers (id,email,unsubscribe_token) VALUES ('subscriber','test@example.com','test')")
    await query("UPDATE subscribers SET active = false WHERE id = 'subscriber'")
    await query("UPDATE subscribers SET active = false WHERE id = 'subscriber'")
    await query("UPDATE subscribers SET active = true WHERE id = 'subscriber'")
    const report = await getAnalyticsReport(query, 7, true)
    assert.deepEqual(report.totals, { visitors: 1, views: 1, newsletterViews: 1, activeSeconds: 65, scrollDepth: 80, clicks: 1 })
    assert.deepEqual(report.subscribers, { active: 1, added: 2, removed: 1 })
    assert.equal(report.daily.length, 7)
    assert.equal(report.daily.at(-1)?.date, new Date().toISOString().slice(0, 10))
    assert.equal(report.daily.at(-1)?.views, 1)
    assert.equal(report.newsletters[0].slug, 'test-edition')
    assert.equal(report.newsletters[0].clicks, 1)
    assert.equal(report.regions[0].country, 'DE')
    assert.equal(report.links[0].clicks, 1)
    await query("UPDATE analytics_views SET created_at = now() - interval '91 days'")
    await pruneAnalytics(query)
    assert.equal((await query('SELECT * FROM analytics_clicks')).length, 0)
    assert.equal((await getAnalyticsReport(query, 7, false)).totals.views, 0)
  } finally {
    await database.close()
  }
})