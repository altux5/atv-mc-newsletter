import { createContext, useContext, useEffect, useState, type ReactNode, type RefObject } from 'react'
import { useLocation } from 'react-router-dom'
import { privacySignal, startAnalyticsView } from '../utils/analytics'
import '../ui/analytics.css'

const AnalyticsContext = createContext({ allowed: false })

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false)
  const [ready, setReady] = useState(false)
  const [blocked, setBlocked] = useState(privacySignal)
  useEffect(() => {
    let cancelled = false
    void fetch('/api/analytics/config', { credentials: 'same-origin' }).then((response) => response.ok ? response.json() : null).then((config) => {
      if (!cancelled) setEnabled(config?.enabled === true)
    }).catch(() => {})
    const update = () => setBlocked(privacySignal())
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    return () => {
      cancelled = true
      window.removeEventListener('focus', update)
      document.removeEventListener('visibilitychange', update)
    }
  }, [])
  useEffect(() => {
    let cancelled = false
    setReady(false)
    if (!enabled || blocked) {
      if (blocked) void fetch('/api/analytics/session', { method: 'DELETE', credentials: 'same-origin' }).catch(() => {})
      return
    }
    void fetch('/api/analytics/session', { method: 'POST', credentials: 'same-origin' }).then((response) => {
      if (!cancelled) setReady(response.ok)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [enabled, blocked])
  const allowed = enabled && ready && !blocked
  return (
    <AnalyticsContext.Provider value={{ allowed }}>
      {children}
    </AnalyticsContext.Provider>
  )
}

export function PageAnalytics() {
  const { allowed } = useContext(AnalyticsContext)
  const { pathname, key } = useLocation()
  useEffect(() => {
    if (allowed && ['/', '/newsletters', '/newsletters/list', '/submit-article'].includes(pathname)) return startAnalyticsView(pathname)
  }, [allowed, pathname, key])
  return null
}

export function useNewsletterAnalytics(slug: string | undefined, ready: boolean, container: RefObject<HTMLDivElement | null>) {
  const { allowed } = useContext(AnalyticsContext)
  const { pathname, key } = useLocation()
  useEffect(() => {
    if (allowed && ready && slug && container.current && pathname === `/newsletters/${slug}`) return startAnalyticsView(pathname, slug, container.current)
  }, [allowed, ready, slug, pathname, key, container])
}