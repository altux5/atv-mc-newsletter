import * as tls from 'node:tls'
import { Agent } from 'undici'
import type { Plugin } from 'vite'
import type { CustomFetch } from 'openid-client'
import { createLocalAuth } from './localAuth.js'
import { createLocalOidc } from './localOidc.js'

export function localAuthPlugin(clientId: string): Plugin {
  return {
    name: 'newsletter-local-oidc',
    apply: 'serve',
    configureServer(server) {
      const getCertificates = (tls as typeof tls & { getCACertificates?: (type: string) => string[] }).getCACertificates
      const trustedCertificates = [...(getCertificates?.('default') ?? tls.rootCertificates), ...(getCertificates?.('system') ?? [])]
      const agent = new Agent({ connect: { ca: trustedCertificates } })
      const request: CustomFetch = (url, options) => {
        const init: RequestInit & { dispatcher: Agent } = { ...options, dispatcher: agent }
        return fetch(url, init)
      }
      let handler: ReturnType<typeof createLocalAuth> | undefined
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/oauth2/')) return next()
        const address = server.httpServer?.address()
        const port = typeof address === 'object' && address ? address.port : server.config.server.port
        handler ??= createLocalAuth({ origin: `http://localhost:${port}`, oidc: clientId ? createLocalOidc(clientId, request) : undefined })
        void handler(req, res, next).catch(() => {
          if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
          res.end('Local sign-in failed. Restart the development server and try Editor Login again.')
        })
      })
      server.httpServer?.once('close', () => { void agent.close() })
    },
  }
}