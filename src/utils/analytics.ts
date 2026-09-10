import type { AnalyticsEvent } from '../types/analytics'

export const analyticsConsentKey = 'newsletter-analytics-consent-v1'
export type AnalyticsConsent = 'granted' | 'denied' | null

export function privacySignal(): boolean {
  return navigator.doNotTrack === '1' || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true
}

export function readAnalyticsConsent(): AnalyticsConsent {
  try {
    const saved = JSON.parse(localStorage.getItem(analyticsConsentKey) ?? 'null') as { choice?: string; expires?: number } | null
    if (!saved || !saved.expires || saved.expires < Date.now()) return null
    return saved.choice === 'granted' || saved.choice === 'denied' ? saved.choice : null
  } catch { return null }
}

export function saveAnalyticsConsent(choice: Exclude<AnalyticsConsent, null>): boolean {
  try {
    localStorage.setItem(analyticsConsentKey, JSON.stringify({ choice, expires: Date.now() + 30 * 86400000 }))
    window.dispatchEvent(new Event('analytics-consent-change'))
    return true
  } catch { return false }
}

export function collectionAllowed(): boolean {
  return readAnalyticsConsent() === 'granted' && !privacySignal()
}

export function startAnalyticsView(path: string, newsletterSlug?: string, container?: HTMLElement) {
  let disposed = false
  let removeListeners = () => {}
  const deferred = window.setTimeout(() => {
    if (!collectionAllowed() || disposed) return
    const viewId = crypto.randomUUID()
    const base = { path, newsletterSlug, viewId }
    const post = async (event: AnalyticsEvent) => {
      if (!collectionAllowed()) return false
      try {
        const response = await fetch('/api/analytics/events', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event), keepalive: true })
        return response.ok
      } catch { return false }
    }
    const ready = post({ ...base, id: viewId, type: 'view' })
    const send = (event: AnalyticsEvent) => { void ready.then((created) => { if (created) void post(event) }) }
    let activeMilliseconds = 0
    let lastTick = performance.now()
    let lastActivity = lastTick
    let scrollDepth = 0
    let previous = ''
    const sample = () => {
      const now = performance.now()
      if (document.visibilityState === 'visible' && now - lastActivity < 30000) activeMilliseconds += Math.min(now - lastTick, 2000)
      lastTick = now
      if (container && document.visibilityState === 'visible') {
        const rect = container.getBoundingClientRect()
        scrollDepth = Math.max(scrollDepth, Math.min(100, Math.max(0, Math.round((window.innerHeight - rect.top) / Math.max(1, rect.height) * 100))))
      }
    }
    const flush = () => {
      if (!newsletterSlug) return
      sample()
      const activeSeconds = Math.min(7200, Math.floor(activeMilliseconds / 1000))
      const value = `${activeSeconds}:${scrollDepth}`
      if (value === previous) return
      previous = value
      send({ ...base, id: crypto.randomUUID(), type: 'engagement', activeSeconds, scrollDepth })
    }
    const activity = () => { lastActivity = performance.now() }
    const click = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return
      const link = event.target.closest('a[href]')
      let target: string | undefined
      if (link && container?.contains(link)) {
        const index = Array.from(container.querySelectorAll('a[href]')).indexOf(link)
        if (index >= 0 && index < 9999) target = `link-${index + 1}`
      } else {
        target = event.target.closest<HTMLElement>('[data-analytics-action]')?.dataset.analyticsAction
      }
      if (target) send({ ...base, id: crypto.randomUUID(), type: 'click', target })
    }
    const activityEvents = ['pointerdown', 'pointermove', 'keydown', 'scroll']
    activityEvents.forEach((name) => window.addEventListener(name, activity, { passive: true }))
    document.addEventListener('click', click, true)
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flush)
    const sampling = window.setInterval(sample, 1000)
    const reporting = window.setInterval(flush, 15000)
    sample()
    removeListeners = () => {
      flush()
      window.clearInterval(sampling)
      window.clearInterval(reporting)
      activityEvents.forEach((name) => window.removeEventListener(name, activity))
      document.removeEventListener('click', click, true)
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, 0)
  return () => { disposed = true; window.clearTimeout(deferred); removeListeners() }
}