import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import express from 'express'
import { protectEditorRoutes } from './editorAccess.js'

test('editor-only API routes require an allowlisted session while public routes stay open', async () => {
  const app = express()
  app.get('/userinfo', (req, res) => {
    if (!req.headers.cookie) return res.sendStatus(401)
    res.json({ email: req.headers.cookie === 'editor=yes' ? 'Editor@Example.com' : 'reader@example.com' })
  })
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  protectEditorRoutes(app, { authUrl: `${origin}/userinfo`, editors: ['editor@example.com'] })
  app.all('/api/*', (_req, res) => { res.sendStatus(200) })

  const request = (method: string, path: string, cookie?: string) =>
    fetch(`${origin}${path}`, { method, headers: cookie ? { cookie } : {} })

  const editorRoutes: Array<[string, string]> = [
    ['GET', '/api/drafts'], ['GET', '/api/drafts/d1'], ['PUT', '/api/drafts/d1'], ['DELETE', '/api/drafts/d1'], ['POST', '/api/drafts'],
    ['GET', '/api/articles'], ['GET', '/api/articles/a1'], ['PATCH', '/api/articles/a1/import'], ['DELETE', '/api/articles/a1'],
    ['POST', '/api/newsletters'], ['PUT', '/api/newsletters/n1'], ['DELETE', '/api/newsletters/n1'], ['POST', '/api/newsletters/n1/send'],
    ['GET', '/api/subscribers'], ['POST', '/api/refine'], ['GET', '/API/Drafts/'],
  ]
  const publicRoutes: Array<[string, string]> = [
    ['GET', '/api/newsletters'], ['GET', '/api/newsletters/n1'], ['GET', '/api/newsletters/n1/body'],
    ['POST', '/api/articles'], ['POST', '/api/subscribers'], ['GET', '/api/subscribers/unsubscribe?token=x'],
  ]
  try {
    for (const [method, path] of editorRoutes) {
      assert.equal((await request(method, path)).status, 401, `${method} ${path} anonymous`)
      assert.equal((await request(method, path, 'reader=yes')).status, 403, `${method} ${path} non-editor`)
      assert.equal((await request(method, path, 'editor=yes')).status, 200, `${method} ${path} editor`)
    }
    for (const [method, path] of publicRoutes) {
      assert.equal((await request(method, path)).status, 200, `${method} ${path} anonymous`)
      assert.equal((await request(method, path, 'reader=yes')).status, 200, `${method} ${path} non-editor`)
    }
  } finally {
    server.close()
  }
})
