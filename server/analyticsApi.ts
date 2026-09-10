import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { Router, json, type Request, type Response } from 'express'
import { rateLimit, ipKeyGenerator } from 'express-rate-limit'
import ipaddr from 'ipaddr.js'
import { open, type CountryResponse, type Reader } from 'maxmind'
import { parseAnalyticsEvent } from './analyticsEvents.js'
import { getAnalyticsReport, storeAnalyticsEvent, type AnalyticsQuery, type VisitorLocation } from './analyticsStore.js'

type AnalyticsOptions = {
  enabled: boolean
  secret: string
  origin: string
  authUrl: string
  editors: string[]
  geoLookup?: (address: string) => VisitorLocation
}

const cookieName = 'newsletter_analytics'
const cookieAge = 30 * 24 * 60 * 60 * 1000

export function createAnalyticsApi(query: AnalyticsQuery, options: AnalyticsOptions) {
  const router = Router()
  const enabled = options.enabled && options.secret.length >= 32 && /^https?:\/\//.test(options.origin)
  const secure = options.origin.startsWith('https:')
  const cookieOptions = { httpOnly: true, secure, sameSite: 'lax' as const, path: '/api/analytics' }
  const sign = (value: string) => createHmac('sha256', options.secret).update(value).digest('hex')
  const visitor = (req: Request): string | null => {
    const token = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1)
    if (!token || token.length > 200 || !options.secret) return null
    const [id, expiry, signature, extra] = token.split('.')
    if (!id || !expiry || extra || !/^[a-f0-9]{64}$/.test(signature ?? '') || !/^\d+$/.test(expiry)) return null
    if (Number(expiry) <= Date.now() || Number(expiry) > Date.now() + cookieAge) return null
    const expected = sign(`${id}.${expiry}`)
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null
    return sign(`visitor:${id}`)
  }
  const sameOrigin = (req: Request, res: Response): boolean => {
    if (req.get('origin') !== options.origin) {
      res.status(403).json({ error: 'Same-origin request required.' })
      return false
    }
    return true
  }
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
  router.use(json({ limit: '4kb' }))
  router.use(rateLimit({
    windowMs: 60_000, limit: 3000, standardHeaders: 'draft-8', legacyHeaders: false,
    keyGenerator: (req) => visitor(req) ?? ipKeyGenerator(req.socket.remoteAddress ?? '127.0.0.1'),
  }))
  router.get('/config', (_req, res) => res.json({ enabled }))
  router.post('/session', (req, res) => {
    if (!sameOrigin(req, res)) return
    if (!enabled) return res.status(403).json({ error: 'Analytics collection is disabled.' })
    if (req.get('sec-gpc') === '1' || req.get('dnt') === '1') return res.status(403).json({ error: 'Analytics blocked by browser privacy settings.' })
    if (!visitor(req)) {
      const value = `${randomUUID()}.${Date.now() + cookieAge}`
      res.cookie(cookieName, `${value}.${sign(value)}`, { ...cookieOptions, maxAge: cookieAge })
    }
    res.status(204).end()
  })
  router.delete('/session', (req, res) => {
    if (!sameOrigin(req, res)) return
    res.clearCookie(cookieName, cookieOptions)
    res.status(204).end()
  })
  router.post('/events', async (req, res) => {
    if (!sameOrigin(req, res)) return
    if (!enabled) return res.status(403).json({ error: 'Analytics collection is disabled.' })
    const identity = visitor(req)
    if (req.get('sec-gpc') === '1' || req.get('dnt') === '1') return res.status(403).json({ error: 'Analytics blocked by browser privacy settings.' })
    if (!identity) return res.status(403).json({ error: 'Analytics session required.' })
    if (/bot|crawler|spider|headless/i.test(req.get('user-agent') ?? '')) return res.status(204).end()
    const event = parseAnalyticsEvent(req.body)
    if (!event) return res.status(400).json({ error: 'Invalid analytics event.' })
    try {
      const location = options.geoLookup?.(req.ip ?? '') ?? { country: 'Unknown', region: 'Unknown' }
      await storeAnalyticsEvent(query, event, identity, location)
      res.status(204).end()
    } catch {
      res.status(503).json({ error: 'Analytics storage unavailable.' })
    }
  })
  router.get('/report', async (req, res) => {
    if (!options.authUrl || !options.editors.length) return res.status(503).json({ error: 'Analytics editor access is not configured.' })
    if (!req.headers.cookie) return res.status(401).json({ error: 'Editor sign-in required.' })
    try {
      const auth = await fetch(options.authUrl, { headers: { cookie: req.headers.cookie, accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(5000) })
      if (!auth.ok) return res.status(401).json({ error: 'Editor sign-in required.' })
      const user = await auth.json() as { email?: unknown }
      if (typeof user.email !== 'string' || !options.editors.includes(user.email.toLowerCase().trim())) return res.status(403).json({ error: 'Editor access required.' })
    } catch {
      return res.status(503).json({ error: 'Unable to verify editor access.' })
    }
    const days = Number(req.query.days ?? 30)
    if (![7, 30, 90].includes(days)) return res.status(400).json({ error: 'Choose 7, 30, or 90 days.' })
    try {
      res.json(await getAnalyticsReport(query, days, enabled))
    } catch {
      res.status(503).json({ error: 'Analytics report unavailable.' })
    }
  })
  return router
}

export function analyticsOptionsFromEnv(): AnalyticsOptions {
  let geo: Reader<CountryResponse> | undefined
  if (process.env.ANALYTICS_GEOIP_PATH) {
    void open<CountryResponse>(process.env.ANALYTICS_GEOIP_PATH).then((reader) => { geo = reader }).catch(() => console.warn('[analytics] GeoIP unavailable; locations will be Unknown.'))
  }
  const origin = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '') ?? ''
  return {
    enabled: process.env.ANALYTICS_ENABLED === '1',
    secret: process.env.ANALYTICS_SECRET ?? '',
    origin,
    authUrl: process.env.ANALYTICS_AUTH_USERINFO_URL ?? (origin ? `${origin}/oauth2/userinfo` : ''),
    editors: (process.env.ANALYTICS_EDITOR_EMAILS ?? '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean),
    geoLookup: (address) => {
      const unknown = { country: 'Unknown', region: 'Unknown' }
      if (!geo || !ipaddr.isValid(address)) return unknown
      const ip = ipaddr.process(address)
      if (ip.range() !== 'unicast') return unknown
      const record = geo.get(ip.toString())
      const country = record?.country?.iso_code
      if (!country) return unknown
      const continent = record?.continent?.code ?? ''
      const region = ['NA', 'SA'].includes(continent) ? 'Americas' : ['EU', 'AF'].includes(continent) || ['AE', 'BH', 'IL', 'IQ', 'IR', 'JO', 'KW', 'LB', 'OM', 'PS', 'QA', 'SA', 'SY', 'TR', 'YE'].includes(country) ? 'EMEA' : ['AS', 'OC'].includes(continent) ? 'APAC' : 'Unknown'
      return { country, region }
    },
  }
}