import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import express from 'express'
import { PGlite } from '@electric-sql/pglite'
import type { query as databaseQuery } from './db.js'
import { createSubscribersAdminApi } from './subscribersAdminApi.js'

test('subscriber administration verifies editor sessions and origin before reading or mutating data', async () => {
  const database = new PGlite()
  const app = express()
  let authMode = 'normal'
  app.get('/userinfo', (req, res) => {
    if (authMode === 'malformed') return res.type('text').send('not JSON')
    if (authMode === 'expired') return res.sendStatus(401)
    res.json({ email: req.headers.cookie === 'editor=yes' ? 'EDITOR@example.com' : 'reader@example.com' })
  })
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  let queries = 0
  const query: typeof databaseQuery = async (sql, params) => { queries++; return (await database.query(sql, params)).rows as never[] }
  const options = { authUrl: `${origin}/userinfo`, editors: ['editor@example.com'], origin }
  app.use('/api/admin/subscribers', createSubscribersAdminApi(query, options))
  app.use('/unconfigured', createSubscribersAdminApi(query, { ...options, editors: [] }))
  app.use('/unavailable', createSubscribersAdminApi(async () => { throw new Error('Database disconnected') }, options))
  const request = (method = 'GET', suffix = '', body?: unknown, cookie = 'editor=yes', requestOrigin = origin) => fetch(`${origin}/api/admin/subscribers${suffix}`, {
    method, headers: { cookie, origin: requestOrigin, 'content-type': 'application/json', 'x-forwarded-email': 'editor@example.com' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  try {
    await database.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'))
    for (const method of ['GET', 'POST', 'DELETE']) {
      const suffix = method === 'DELETE' ? '/missing' : ''
      const body = method === 'POST' ? { email: 'person@infineon.com' } : undefined
      assert.equal((await request(method, suffix, body, '')).status, 401)
      assert.equal((await request(method, suffix, body, 'reader=yes')).status, 403)
    }
    assert.equal((await request('POST', '', { email: 'person@infineon.com' }, 'editor=yes', 'https://other.example')).status, 403)
    assert.equal((await request('DELETE', '/missing', undefined, 'editor=yes', '')).status, 403)
    assert.equal((await fetch(`${origin}/unconfigured`, { headers: { cookie: 'editor=yes' } })).status, 503)
    authMode = 'malformed'
    assert.equal((await request()).status, 503)
    authMode = 'expired'
    assert.equal((await request()).status, 401)
    authMode = 'normal'
    assert.equal(queries, 0)
    assert.equal((await request('POST', '', { email: 'invalid' })).status, 400)
    for (const details of [{ name: {} }, { department: 'x'.repeat(201) }, { name: 'line\nbreak' }]) {
      assert.equal((await request('POST', '', { email: 'person@infineon.com', ...details })).status, 400)
    }
    assert.equal((await request('POST', '', { email: 'x'.repeat(2500) })).status, 413)
    const addedResponse = await request('POST', '', { email: ' Person@Infineon.com ', name: ' Example Person ', department: ' ATV MC ' })
    assert.equal(addedResponse.status, 200)
    const added = await addedResponse.json() as { id: string; email: string; active: boolean; name: string; department: string }
    assert.equal(added.email, 'person@infineon.com')
    assert.equal(added.active, true)
    assert.equal(added.name, 'Example Person')
    assert.equal(added.department, 'ATV MC')
    const list = await request()
    assert.equal(list.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await list.json(), [added])
    assert.equal('unsubscribe_token' in added, false)
    assert.equal((await request('DELETE', '/missing')).status, 404)
    const removed = await request('DELETE', `/${added.id}`)
    assert.equal(removed.status, 200)
    assert.equal((await removed.json() as { active: boolean }).active, false)
    const restored = await request('POST', '', { email: added.email })
    assert.equal((await restored.json() as { active: boolean }).active, true)
    assert.equal((await fetch(`${origin}/unavailable`, { headers: { cookie: 'editor=yes' } })).status, 503)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await database.close()
  }
})