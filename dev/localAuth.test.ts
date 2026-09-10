import assert from 'node:assert/strict'
import { createServer, request as httpRequest } from 'node:http'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import { createLocalAuth, localReturnPath, type LoginAttempt, type LocalOidc } from './localAuth.js'

test('return destinations cannot leave the local application', () => {
  for (const value of [null, '//outside.example', 'https://outside.example', '/\\outside.example', '/oauth2/callback', '/\nmalformed']) assert.equal(localReturnPath(value), '/')
  assert.equal(localReturnPath('/admin/analytics?days=7'), '/admin/analytics?days=7')
})

test('local OIDC session, PKCE/state parameters, replay protection, expiry and sign-out', async () => {
  let attempt: LoginAttempt | undefined
  let verifications = 0
  let time = Date.now()
  const oidc: LocalOidc = {
    authorize: async (value) => { attempt = value; return `https://sso.infineon.com/authorize?state=${value.state}` },
    authenticate: async (_url, value) => { verifications++; assert.equal(value.verifier, attempt?.verifier); return { email: 'editor@infineon.com' } },
  }
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  const origin = `http://localhost:${port}`
  const handler = createLocalAuth({ origin, oidc, now: () => time })
  server.on('request', (request, response) => { void handler(request, response, () => { response.writeHead(200); response.end('React') }) })
  const request = (path: string, cookie = '', host = `localhost:${port}`) => new Promise<Response>((resolve, reject) => {
    const outgoing = httpRequest({ hostname: '127.0.0.1', port, path, headers: { host, cookie } }, (incoming) => {
      const chunks: Buffer[] = []
      incoming.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      incoming.on('end', () => {
        const headers = new Headers()
        for (let index = 0; index < incoming.rawHeaders.length; index += 2) headers.append(incoming.rawHeaders[index], incoming.rawHeaders[index + 1])
        resolve(new Response(Buffer.concat(chunks), { status: incoming.statusCode, headers }))
      })
      incoming.on('error', reject)
    })
    outgoing.on('error', reject)
    outgoing.end()
  })
  try {
    assert.equal((await request('/newsletters')).status, 200)
    assert.equal((await request('/oauth2/userinfo')).status, 401)
    assert.equal((await request('/oauth2/sign_in', '', 'outside.example')).status, 403)
    const canonical = await request('/oauth2/sign_in?rd=%2Fadmin%2Fanalytics', '', `127.0.0.1:${port}`)
    assert.equal(canonical.headers.get('location'), `${origin}/oauth2/sign_in?rd=%2Fadmin%2Fanalytics`)
    const login = await request('/oauth2/sign_in?rd=%2Fadmin%2Fanalytics')
    assert.equal(login.status, 302)
    assert.equal(attempt?.redirectUri, `${origin}/oauth2/callback`)
    assert.equal(attempt?.verifier.length, 43)
    assert.ok(attempt?.nonce)
    const loginCookie = login.headers.get('set-cookie')!.split(';')[0]
    assert.match(login.headers.get('set-cookie')!, /HttpOnly; SameSite=Lax/)
    assert.equal((await request('/oauth2/callback?code=test&state=forged', loginCookie)).status, 400)
    assert.equal(verifications, 0)
    const retry = await request('/oauth2/sign_in?rd=%2Fadmin%2Fanalytics')
    const retryCookie = retry.headers.get('set-cookie')!.split(';')[0]
    const callbackUrl = `/oauth2/callback?code=test&state=${attempt!.state}`
    const callback = await request(callbackUrl, retryCookie)
    assert.equal(callback.status, 302)
    assert.equal(callback.headers.get('location'), '/admin/analytics')
    const sessionCookie = callback.headers.getSetCookie().find((value) => value.startsWith(`newsletter_local_session_${port}=`))!.split(';')[0]
    assert.deepEqual(await (await request('/oauth2/userinfo', sessionCookie)).json(), { email: 'editor@infineon.com' })
    assert.equal((await request(callbackUrl, retryCookie)).status, 400)
    assert.equal(verifications, 1)
    time += 3600001
    assert.equal((await request('/oauth2/userinfo', sessionCookie)).status, 401)
    const logout = await request('/oauth2/sign_out?rd=https://outside.example', sessionCookie)
    assert.equal(logout.headers.get('location'), '/')
    assert.match(logout.headers.get('set-cookie')!, /Max-Age=0/)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test('missing local configuration fails explicitly rather than serving React', async () => {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  const handler = createLocalAuth({ origin: `http://localhost:${port}` })
  server.on('request', (request, response) => { void handler(request, response, () => response.end('React')) })
  try {
    const response = await fetch(`http://localhost:${port}/oauth2/sign_in`)
    assert.equal(response.status, 503)
    assert.match(await response.text(), /MIAMI_CLIENT_ID/)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})