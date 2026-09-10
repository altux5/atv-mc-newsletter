/// <reference types="node" />
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import express, { type Request, type Response } from 'express'
import dotenv from 'dotenv'
import { Agent as UndiciAgent } from 'undici'
import { dbApi } from './dbApi.js'
import { ensureSchema, query } from './db.js'
import { setupMailer } from './mailer.js'
import { analyticsOptionsFromEnv, createAnalyticsApi } from './analyticsApi.js'
import { pruneAnalytics } from './analyticsStore.js'
import { createSubscribersAdminApi } from './subscribersAdminApi.js'

dotenv.config()

// Initialise the SMTP mailer (no-op / disabled unless MAIL_ENABLED is set).
setupMailer()

const app = express()
if (process.env.ANALYTICS_TRUST_PROXY) {
  app.set('trust proxy', process.env.ANALYTICS_TRUST_PROXY.split(',').map((entry) => entry.trim()))
}
const analyticsOptions = analyticsOptionsFromEnv()
app.use('/api/analytics', createAnalyticsApi(query, analyticsOptions))
app.use('/api/admin/subscribers', createSubscribersAdminApi(query, analyticsOptions))
// Limit is generous because submitted articles embed base64 images.
app.use(express.json({ limit: '15mb' }))

// Database-backed REST API (newsletters, drafts, articles).
app.use('/api', dbApi)

// --- AI refine route (optional) -------------------------------------------
// The AI proxy is optional. If its CA bundle or credentials are missing, the
// server still boots (to serve the SPA and the database API) and the refine
// route returns 503 instead of crashing the whole process at startup.
function setupAiRefine(): void {
  const baseUrl = process.env.AI_BASE_URL ?? 'https://gpt4ifx.icp.infineon.com'
  const model = process.env.AI_MODEL ?? 'gpt-5-mini'
  const caBundlePath = process.env.AI_CA_BUNDLE ?? 'ca-bundle.crt'
  const caFullPath = path.isAbsolute(caBundlePath)
    ? caBundlePath
    : path.join(process.cwd(), caBundlePath)

  const username = process.env.AI_USERNAME
  const password = process.env.AI_PASSWORD
  const bearerToken = process.env.AI_TOKEN
  const hasAuth = Boolean((username && password) || bearerToken)
  const hasCa = fs.existsSync(caFullPath)

  if (!hasCa || !hasAuth) {
    const reasons = [
      !hasCa ? `CA bundle not found at ${caFullPath}` : null,
      !hasAuth ? 'no AI_TOKEN or AI_USERNAME/AI_PASSWORD set' : null,
    ]
      .filter(Boolean)
      .join('; ')
    console.warn(`[ai-proxy] AI refine disabled (${reasons}). The /api/refine route will return 503.`)
    app.post('/api/refine', (_req: Request, res: Response) => {
      res.status(503).json({ error: 'AI refine is not configured on this server.' })
    })
    return
  }

  const ca = fs.readFileSync(caFullPath)
  // Undici Agent with custom CA for fetch.
  const dispatcher = new UndiciAgent({
    connect: { ca },
    keepAliveTimeout: 30_000,
  })

  const authHeader =
    username && password
      ? `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
      : `Bearer ${bearerToken}`

  app.post('/api/refine', async (req: Request, res: Response) => {
    const { content, context } = req.body ?? {}

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'Missing content to refine.' })
    }

    try {
      const requestInit: RequestInit & { dispatcher: UndiciAgent } = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content:
                'You are a precise newsletter editor. Improve clarity, grammar, and flow. Keep HTML tags/links/images intact. Return only refined HTML.',
            },
            {
              role: 'user',
              content: `Context: ${context || 'newsletter section'}\n\nHTML content:\n${content}`,
            },
          ],
        }),
        dispatcher,
      }

      const response = await fetch(`${baseUrl}/chat/completions`, requestInit)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[ai-proxy] Upstream error:', response.status, errorText)
        return res.status(502).json({ error: 'AI service error', detail: errorText })
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      const refined = data.choices?.[0]?.message?.content?.trim()

      if (!refined) {
        return res.status(500).json({ error: 'AI returned empty response.' })
      }

      return res.json({ refined })
    } catch (error) {
      console.error('[ai-proxy] Request failed:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      return res.status(500).json({ error: message })
    }
  })
  console.log('[ai-proxy] AI refine enabled.')
}

setupAiRefine()

// --- static SPA (production) ----------------------------------------------
// When a built frontend is present (dist/), this single server also serves the
// SPA. In local dev the Vite dev server serves the frontend instead and proxies
// /api here, so this block is simply skipped when dist/ is absent.
const here = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(here, '..', 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  // SPA fallback: any non-API route returns index.html for client-side routing.
  app.get('*', (req: Request, res: Response) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'Not found' })
    }
    res.sendFile(path.join(distDir, 'index.html'))
  })
  console.log(`[server] serving static SPA from ${distDir}`)
}

// Knative/OpenShift inject PORT (usually 8080); fall back to PROXY_PORT for dev.
const port = Number(process.env.PORT ?? process.env.PROXY_PORT ?? 8788)
app.listen(port, '0.0.0.0', () => {
  console.log(`[server] listening on http://0.0.0.0:${port}`)
})

// Ensure the database schema exists. Non-fatal: the server still serves the SPA
// and AI proxy (and returns per-request errors on DB routes) if the DB is down.
ensureSchema().then(async () => {
  const cleanup = () => pruneAnalytics(query).catch(() => console.warn('[analytics] Retention cleanup failed.'))
  await cleanup()
  setInterval(() => { void cleanup() }, 6 * 60 * 60 * 1000).unref()
}).catch((error) => {
  const message = error instanceof Error ? error.message : 'Unknown error'
  console.warn(`[db] schema init skipped: ${message}`)
})

