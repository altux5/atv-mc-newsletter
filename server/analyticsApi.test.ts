import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import express from 'express'
import { createAnalyticsApi } from './analyticsApi.js'

test('HTTP collection requires opt-in, signed cookie and origin; reports fail closed', async () => {
  let writes = 0
  const app = express()
  const auth = express()
  auth.get('/userinfo', (req, res) => res.json({ email: req.headers.cookie === 'editor=yes' ? 'editor@example.com' : 'reader@example.com' }))
  const authServer = auth.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => authServer.once('listening', resolve))
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const options = { enabled: true, secret: 'test-secret-not-for-production-123456', origin, authUrl: `http://127.0.0.1:${(authServer.address() as AddressInfo).port}/userinfo`, editors: ['editor@example.com'] }
  app.use('/api/analytics', createAnalyticsApi(async () => { writes++; return [{}] }, options))
  app.use('/disabled', createAnalyticsApi(async () => { throw new Error('Must not write') }, { ...options, enabled: false }))
  const request = (path: string, body?: unknown, cookie = '', requestOrigin = origin) => fetch(`${origin}${path}`, {
    method: 'POST', headers: { origin: requestOrigin, cookie, 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  try {
    assert.equal((await request('/api/analytics/session', { consent: 'granted' }, '', 'https://other.example')).status, 403)
    assert.equal((await request('/api/analytics/session', {})).status, 403)
    assert.equal((await request('/disabled/session', { consent: 'granted' })).status, 403)
    const session = await request('/api/analytics/session', { consent: 'granted' })
    assert.equal(session.status, 204)
    const cookie = session.headers.get('set-cookie')!.split(';')[0]
    assert.match(session.headers.get('set-cookie')!, /HttpOnly/)
    const id = randomUUID()
    const view = { id, viewId: id, type: 'view', path: '/newsletters' }
    assert.equal((await request('/api/analytics/events', view)).status, 403)
    assert.equal((await request('/api/analytics/events', view, `${cookie}tampered`)).status, 403)
    assert.equal((await request('/api/analytics/events', { ...view, email: 'private' }, cookie)).status, 400)
    assert.equal((await request('/api/analytics/events', view, cookie)).status, 204)
    assert.equal(writes, 1)
    assert.equal((await fetch(`${origin}/api/analytics/report`)).status, 401)
    assert.equal((await fetch(`${origin}/api/analytics/report`, { headers: { cookie: 'reader=yes', 'x-forwarded-email': 'editor@example.com' } })).status, 403)
    assert.equal((await fetch(`${origin}/api/analytics/report?days=7`, { headers: { cookie: 'editor=yes' } })).status, 200)
    assert.equal((await fetch(`${origin}/api/analytics/report?days=365`, { headers: { cookie: 'editor=yes' } })).status, 400)
    const revoked = await fetch(`${origin}/api/analytics/session`, { method: 'DELETE', headers: { origin, cookie } })
    assert.equal(revoked.status, 204)
    assert.match(revoked.headers.get('set-cookie')!, /Expires=Thu, 01 Jan 1970/)
  } finally {
    server.closeAllConnections()
    authServer.closeAllConnections()
    await Promise.all([new Promise<void>((resolve) => server.close(() => resolve())), new Promise<void>((resolve) => authServer.close(() => resolve()))])
  }
})