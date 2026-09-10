import { createContext, useContext, useEffect, useState, type ReactNode, type RefObject } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { analyticsConsentKey, privacySignal, readAnalyticsConsent, saveAnalyticsConsent, startAnalyticsView, type AnalyticsConsent } from '../utils/analytics'
import '../ui/analytics.css'

const AnalyticsContext = createContext({ allowed: false, enabled: false, openPreferences: () => {} })

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const { isEditor, isLoading } = useAuth()
  const [enabled, setEnabled] = useState(false)
  const [consent, setConsent] = useState<AnalyticsConsent>(readAnalyticsConsent)
  const [preferences, setPreferences] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [blocked, setBlocked] = useState(privacySignal)
  useEffect(() => {
    let cancelled = false
    void fetch('/api/analytics/config', { credentials: 'same-origin' }).then((response) => response.ok ? response.json() : null).then((config) => {
      if (!cancelled) setEnabled(config?.enabled === true)
    }).catch(() => {})
    const update = () => { setConsent(readAnalyticsConsent()); setBlocked(privacySignal()) }
    const storage = (event: StorageEvent) => { if (event.key === analyticsConsentKey || event.key === null) update() }
    window.addEventListener('storage', storage)
    window.addEventListener('analytics-consent-change', update)
    window.addEventListener('focus', update)
    return () => {
      cancelled = true
      window.removeEventListener('storage', storage)
      window.removeEventListener('analytics-consent-change', update)
      window.removeEventListener('focus', update)
    }
  }, [])
  useEffect(() => {
    let cancelled = false
    setReady(false)
    if (!enabled || consent !== 'granted' || blocked || isEditor || isLoading) {
      if (consent === 'denied' || blocked || isEditor) void fetch('/api/analytics/session', { method: 'DELETE', credentials: 'same-origin' }).catch(() => {})
      return
    }
    void fetch('/api/analytics/session', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consent: 'granted' }) }).then((response) => {
      if (!cancelled) setReady(response.ok)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [enabled, consent, blocked, isEditor, isLoading])
  const choose = (choice: 'granted' | 'denied') => {
    if (!saveAnalyticsConsent(choice)) { setError('Your browser could not save this choice. Analytics remains off.'); return }
    setError('')
    setConsent(choice)
    setPreferences(false)
  }
  const allowed = enabled && ready && consent === 'granted' && !blocked && !isEditor && !isLoading
  const show = enabled && !isEditor && !isLoading && (preferences || consent === null && !blocked)
  return (
    <AnalyticsContext.Provider value={{ allowed, enabled, openPreferences: () => setPreferences(true) }}>
      {show && (
        <section className="analytics-consent" aria-label="Analytics privacy choice">
          <div className="container analytics-consent-inner">
            <div>
              <strong>Optional website analytics</strong>
              <p>Allow a 30-day browser cookie to count visits, newsletter opens, link clicks, active time, scroll depth and estimated country? Analytics records are kept for 90 days without names, emails or raw IP addresses. Your choice is optional and can be changed in the footer.</p>
              {blocked && <p>Your browser privacy signal keeps analytics off.</p>}
              {error && <p role="alert">{error}</p>}
            </div>
            <div className="analytics-consent-actions">
              <button className="button" onClick={() => choose('denied')}>Decline analytics</button>
              {!blocked && <button className="button" onClick={() => choose('granted')}>Allow analytics</button>}
            </div>
          </div>
        </section>
      )}
      {children}
    </AnalyticsContext.Provider>
  )
}

export function AnalyticsPreferences() {
  const { enabled, openPreferences } = useContext(AnalyticsContext)
  const { isEditor } = useAuth()
  return enabled && !isEditor ? <button className="analytics-preferences" onClick={openPreferences}>Analytics privacy settings</button> : null
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