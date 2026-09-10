import { Router, json } from 'express'
import type { query as databaseQuery } from './db.js'
import { requireEditor, type EditorAccessOptions } from './editorAccess.js'
import { addManagedSubscriber, listManagedSubscribers, normalizeSubscriberEmail, removeManagedSubscriber } from './subscribersStore.js'

export function createSubscribersAdminApi(query: typeof databaseQuery, options: EditorAccessOptions & { origin: string }) {
  const router = Router()
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET' && req.method !== 'HEAD' && (!options.origin || req.get('origin') !== options.origin)) {
      res.status(403).json({ error: 'Same-origin request required.' })
      return
    }
    next()
  })
  router.use(requireEditor(options))
  router.use(json({ limit: '2kb' }))
  router.get('/', async (_req, res) => {
    try {
      res.json(await listManagedSubscribers(query))
    } catch { res.status(503).json({ error: 'Subscriber list is unavailable.' }) }
  })
  router.post('/', async (req, res) => {
    const email = normalizeSubscriberEmail(req.body?.email)
    if (!email) return res.status(400).json({ error: 'A valid email address is required (maximum 254 characters).' })
    for (const field of ['name', 'department']) {
      const value: unknown = req.body?.[field]
      if (value != null && (typeof value !== 'string' || value.trim().length > 200 || /[\x00-\x1f\x7f]/.test(value))) {
        return res.status(400).json({ error: 'Name and department must be text, maximum 200 characters each.' })
      }
    }
    try {
      res.json(await addManagedSubscriber(query, email, { name: req.body?.name, department: req.body?.department }))
    } catch { res.status(503).json({ error: 'Could not add the subscriber.' }) }
  })
  router.delete('/:id', async (req, res) => {
    if (req.params.id.length > 200) return res.status(400).json({ error: 'Invalid subscriber ID.' })
    try {
      const subscriber = await removeManagedSubscriber(query, req.params.id)
      if (!subscriber) return res.status(404).json({ error: 'Subscriber not found.' })
      res.json(subscriber)
    } catch { res.status(503).json({ error: 'Could not remove the subscriber.' }) }
  })
  return router
}