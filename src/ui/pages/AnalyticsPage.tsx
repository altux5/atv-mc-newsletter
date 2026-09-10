import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { AnalyticsReport } from '../../types/analytics'
import Icon from '../components/Icon'
import downloadIcon from '../../icons/arrow-down-16.svg'

const number = (value: number) => value.toLocaleString()
const duration = (seconds: number) => `${Math.floor(seconds / 60)}m ${seconds % 60}s`

function exportCsv(report: AnalyticsReport) {
  const rows = [['Newsletter', 'Unique browsers', 'Views', 'Clicks', 'Average active seconds', 'Average scroll percent'],
    ...report.newsletters.map((item) => [item.title, item.visitors, item.views, item.clicks, item.activeSeconds, item.scrollDepth])]
  const csv = rows.map((row) => row.map((value) => {
    let text = String(value)
    if (/^[=+@\-\t\r\n]/.test(text)) text = `'${text}`
    return `"${text.replace(/"/g, '""')}"`
  }).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `newsletter-analytics-${report.days}-days.csv`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(30)
  const [refresh, setRefresh] = useState(0)
  const [report, setReport] = useState<AnalyticsReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    setReport(null)
    void fetch(`/api/analytics/report?days=${days}`, { credentials: 'same-origin', signal: controller.signal, headers: { Accept: 'application/json' } }).then(async (response) => {
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error ?? `Unable to load analytics (${response.status}).`)
      }
      if (!(response.headers.get('content-type') ?? '').includes('application/json')) throw new Error('Analytics sign-in or gateway configuration needs attention.')
      return response.json() as Promise<AnalyticsReport>
    }).then(setReport).catch((reason) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Unable to load analytics.')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [days, refresh])
  const maxViews = Math.max(1, ...(report?.daily.map((day) => day.views) ?? []))
  return (
    <div className="analytics-page" aria-busy={loading}>
      <div className="analytics-heading">
        <h2>Analytics</h2>
        <div className="analytics-controls">
          <label>Period<select aria-label="Analytics period" value={days} onChange={(event) => setDays(Number(event.target.value))}>
            <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
          </select></label>
          <button className="button" disabled={!report || loading} onClick={() => report && exportCsv(report)} title="Download newsletter metrics as CSV"><Icon src={downloadIcon} /> Export CSV</button>
        </div>
      </div>
      {loading && <p className="analytics-state" role="status">Loading analytics...</p>}
      {error && <div className="analytics-state" role="alert"><p>{error}</p><button className="button" onClick={() => setRefresh((value) => value + 1)}>Try again</button></div>}
      {report && <>
        <div className="analytics-status"><span className={report.enabled ? 'analytics-live' : ''}>{report.enabled ? 'Collection enabled' : 'Collection paused'}</span><span>UTC dates · Browser estimates · 90-day retention</span></div>
        <dl className="analytics-metrics">
          {[
            ['Unique browsers', number(report.totals.visitors)], ['Page views', number(report.totals.views)],
            ['Newsletter views', number(report.totals.newsletterViews)], ['Tracked clicks', number(report.totals.clicks)],
            ['Avg. active time', duration(report.totals.activeSeconds)], ['Avg. scroll depth', `${report.totals.scrollDepth}%`],
          ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        {report.totals.views === 0 && <p className="analytics-empty">No website activity recorded in this period.</p>}
        <section className="analytics-section" aria-labelledby="analytics-traffic">
          <h2 id="analytics-traffic">Daily page views</h2>
          <div className="analytics-chart" role="img" aria-label={`Daily page views for the last ${days} days. Total ${report.totals.views}.`}>
            {report.daily.map((day) => <div className="analytics-chart-column" key={day.date} title={`${day.date}: ${day.views} views, ${day.visitors} browsers, ${day.clicks} clicks`}><span style={{ height: `${day.views / maxViews * 100}%` }} /></div>)}
          </div>
          <div className="analytics-chart-axis"><span>{report.daily[0]?.date}</span><span>{report.daily.at(-1)?.date}</span></div>
          <details><summary>Daily figures</summary><div className="analytics-table-wrap"><table><thead><tr><th>Date (UTC)</th><th>Browsers</th><th>Views</th><th>Clicks</th></tr></thead><tbody>{report.daily.map((day) => <tr key={day.date}><td>{day.date}</td><td>{number(day.visitors)}</td><td>{number(day.views)}</td><td>{number(day.clicks)}</td></tr>)}</tbody></table></div></details>
        </section>
        <section className="analytics-section" aria-labelledby="analytics-editions">
          <h2 id="analytics-editions">Newsletter performance</h2>
          <div className="analytics-table-wrap"><table><thead><tr><th>Edition</th><th>Browsers</th><th>Views</th><th>Clicks</th><th>Avg. active</th><th>Avg. scroll</th></tr></thead><tbody>
            {report.newsletters.map((edition) => <tr key={edition.slug}><td><Link to={`/newsletters/${edition.slug}`}>{edition.title}</Link></td><td>{number(edition.visitors)}</td><td>{number(edition.views)}</td><td>{number(edition.clicks)}</td><td>{duration(edition.activeSeconds)}</td><td>{edition.scrollDepth}%</td></tr>)}
            {!report.newsletters.length && <tr><td colSpan={6}>No newsletter views recorded.</td></tr>}
          </tbody></table></div>
        </section>
        <div className="analytics-columns">
          <section className="analytics-section" aria-labelledby="analytics-regions"><h2 id="analytics-regions">Estimated network location</h2>
            <div className="analytics-table-wrap"><table><thead><tr><th>Country</th><th>Region</th><th>Browsers</th><th>Views</th></tr></thead><tbody>
              {report.regions.map((item) => <tr key={`${item.country}-${item.region}`}><td>{item.country === 'Unknown' ? 'Unknown' : new Intl.DisplayNames(['en'], { type: 'region' }).of(item.country) ?? item.country}</td><td>{item.region}</td><td>{number(item.visitors)}</td><td>{number(item.views)}</td></tr>)}
              {!report.regions.length && <tr><td colSpan={4}>No location data recorded.</td></tr>}
            </tbody></table></div>
          </section>
          <section className="analytics-section" aria-labelledby="analytics-subscribers"><h2 id="analytics-subscribers">Subscribers</h2>
            <dl className="analytics-subscribers"><div><dt>Active now</dt><dd>{number(report.subscribers.active)}</dd></div><div><dt>Subscriptions in period</dt><dd>{number(report.subscribers.added)}</dd></div><div><dt>Unsubscribes in period</dt><dd>{number(report.subscribers.removed)}</dd></div><div><dt>Net change</dt><dd>{number(report.subscribers.added - report.subscribers.removed)}</dd></div></dl>
          </section>
        </div>
        <section className="analytics-section" aria-labelledby="analytics-clicks"><h2 id="analytics-clicks">Link and button clicks</h2>
          <div className="analytics-table-wrap"><table><thead><tr><th>Edition</th><th>Link / action</th><th>Clicks</th></tr></thead><tbody>
            {report.links.map((item) => <tr key={`${item.slug}-${item.target}`}><td>{item.slug ? report.newsletters.find((edition) => edition.slug === item.slug)?.title ?? item.slug : 'Website'}</td><td>{item.slug && item.target.startsWith('link-') ? <Link to={`/newsletters/${item.slug}#analytics-${item.target}`}>{item.target.replace('link-', 'Link ')}</Link> : item.target.replaceAll('-', ' ')}</td><td>{number(item.clicks)}</td></tr>)}
            {!report.links.length && <tr><td colSpan={3}>No clicks recorded.</td></tr>}
          </tbody></table></div>
        </section>
      </>}
    </div>
  )
}