import type { Express, RequestHandler } from 'express'

export interface EditorAccessOptions {
  authUrl: string
  editors: string[]
}

export function requireEditor(options: EditorAccessOptions): RequestHandler {
  return async (req, res, next) => {
    if (!options.authUrl || !options.editors.length) {
      res.status(503).json({ error: 'Editor access is not configured.' })
      return
    }
    if (!req.headers.cookie) {
      res.status(401).json({ error: 'Editor sign-in required.' })
      return
    }
    try {
      const auth = await fetch(options.authUrl, {
        headers: { cookie: req.headers.cookie, accept: 'application/json' },
        redirect: 'error', signal: AbortSignal.timeout(5000),
      })
      if (!auth.ok) {
        res.status(401).json({ error: 'Editor sign-in required.' })
        return
      }
      const user = await auth.json() as { email?: unknown }
      if (typeof user.email !== 'string' || !options.editors.includes(user.email.toLowerCase().trim())) {
        res.status(403).json({ error: 'Editor access required.' })
        return
      }
    } catch {
      res.status(503).json({ error: 'Unable to verify editor access.' })
      return
    }
    next()
  }
}

// The gateway only authenticates, so every editor-only API endpoint must be listed here.
export function protectEditorRoutes(app: Express, options: EditorAccessOptions): void {
  const editorOnly = requireEditor(options)
  app.use('/api/drafts', editorOnly)
  app.get(['/api/articles', '/api/articles/:id', '/api/subscribers'], editorOnly)
  app.patch('/api/articles/:id/import', editorOnly)
  app.put('/api/newsletters/:id', editorOnly)
  app.delete(['/api/articles/:id', '/api/newsletters/:id'], editorOnly)
  app.post(['/api/newsletters', '/api/newsletters/:id/send', '/api/refine'], editorOnly)
}