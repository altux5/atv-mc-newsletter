import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import type { query as databaseQuery } from './db.js'
import { addManagedSubscriber, listManagedSubscribers, normalizeSubscriberEmail, removeManagedSubscriber } from './subscribersStore.js'

test('subscriber emails are normalized and invalid inputs rejected', () => {
  assert.equal(normalizeSubscriberEmail(' Person@Infineon.com '), 'person@infineon.com')
  for (const input of [null, {}, '', 'person', 'person @example.com', 'person@example', `${'long'.repeat(65)}@example.com`]) {
    assert.equal(normalizeSubscriberEmail(input), null)
  }
})

test('subscriber management preserves history, handles duplicates and never exposes tokens', async () => {
  const database = new PGlite()
  try {
    await database.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'))
    await database.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'))
    const query: typeof databaseQuery = async (sql, params) => (await database.query(sql, params)).rows as never[]
    assert.deepEqual(await listManagedSubscribers(query), [])
    const added = await addManagedSubscriber(query, 'person@infineon.com')
    assert.equal(added.name, null)
    assert.equal(added.department, null)
    assert.equal(added.active, true)
    assert.equal(added.unsubscribedAt, null)
    assert.equal((await addManagedSubscriber(query, added.email)).id, added.id)
    const enriched = await addManagedSubscriber(query, added.email, { name: ' Example Person ', department: ' ATV MC ' })
    assert.equal(enriched.name, 'Example Person')
    assert.equal(enriched.department, 'ATV MC')
    const repeated = await addManagedSubscriber(query, added.email, { name: '', department: null })
    assert.equal(repeated.name, enriched.name)
    assert.equal(repeated.department, enriched.department)
    assert.equal((await listManagedSubscribers(query)).length, 1)
    const removed = await removeManagedSubscriber(query, added.id)
    assert.equal(removed?.active, false)
    assert.ok(removed?.unsubscribedAt)
    assert.equal((await removeManagedSubscriber(query, added.id))?.unsubscribedAt, removed?.unsubscribedAt)
    assert.equal(await removeManagedSubscriber(query, 'missing-id'), null)
    const restored = await addManagedSubscriber(query, added.email)
    assert.equal(restored.id, added.id)
    assert.equal(restored.active, true)
    assert.equal(restored.unsubscribedAt, null)
    assert.equal(restored.subscribedAt, added.subscribedAt)
    assert.equal(restored.name, enriched.name)
    assert.equal(restored.department, enriched.department)
    assert.deepEqual(Object.keys((await listManagedSubscribers(query))[0]).sort(), ['active', 'department', 'email', 'id', 'name', 'subscribedAt', 'unsubscribedAt'])
    const changes = await database.query<{ kind: string }>('SELECT kind FROM analytics_subscription_events ORDER BY id')
    assert.deepEqual(changes.rows.map((row) => row.kind), ['added', 'removed', 'added'])
    const active = await database.query('SELECT email FROM subscribers WHERE active = true')
    assert.equal(active.rows.length, 1)
    await removeManagedSubscriber(query, added.id)
    assert.equal((await database.query('SELECT email FROM subscribers WHERE active = true')).rows.length, 0)
  } finally { await database.close() }
})