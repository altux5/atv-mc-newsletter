import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { newsletters } from '../../data/newsletters'
import { extractBodyText, findHtmlByMonthYearAsync, loadHtmlByPathAsync } from '../../utils/newsletterHtml'

export default function NewslettersListPage() {
  const [textQuery, setTextQuery] = useState('')
  const [searchIndex, setSearchIndex] = useState<Record<string, string>>({})
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)
  const [selectedYear, setSelectedYear] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const entries: Record<string, string> = {}
      for (const n of newsletters) {
        try {
          const date = new Date(n.date)
          const match = n.sourcePath
            ? await loadHtmlByPathAsync(n.sourcePath)
            : await findHtmlByMonthYearAsync(date.getUTCMonth(), date.getUTCFullYear())
          const html = match?.html
          if (html) entries[n.id] = extractBodyText(html)
        } catch {}
      }
      if (!cancelled) setSearchIndex(entries)
    })()
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    const q = textQuery.trim().toLowerCase()
    const byDate = newsletters.filter((n) => {
      const d = new Date(n.date)
      if (selectedYear != null && d.getUTCFullYear() !== selectedYear) return false
      if (selectedMonth != null && d.getUTCMonth() !== selectedMonth) return false
      return true
    })
    if (!q) return byDate
    return byDate.filter((n) => {
      const inTitle = n.title.toLowerCase().includes(q)
      const inExcerpt = n.excerpt.toLowerCase().includes(q)
      const inBody = (searchIndex[n.id] || '').toLowerCase().includes(q)
      return inTitle || inExcerpt || inBody
    })
  }, [textQuery, selectedMonth, selectedYear, searchIndex])

  const clearAll = () => {
    setTextQuery('')
    setSelectedMonth(null)
    setSelectedYear(null)
  }

  return (
    <div className="newsletters-page">
      <style>{`
        .newsletters-page .heading-row h1 { color: var(--brand); margin: 0; }
        .newsletters-page .heading-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
        .newsletters-page .heading-row .toggle { color: var(--brand); text-decoration: none; padding: 4px 8px; border-radius: 0; }
        .newsletters-page .heading-row .toggle.active { background: rgba(0,0,0,0.04); }
        .newsletters-page .inline-filters.card { background: #fff; border: 1px solid var(--border-color, #e0e0e0); border-radius: 0; padding: 16px; margin-bottom: 16px; }
        .newsletters-page .inline-group label { font-weight: 600; }
        .newsletters-page .list-row { background: #fff; border: 1px solid var(--border-color, #e0e0e0); border-radius: 0; padding: 12px 16px; margin-bottom: 8px; text-decoration: none; color: inherit; transition: border-color 150ms ease, background 150ms ease; }
        .newsletters-page .list-row:hover { border-color: var(--brand); background: #fafafa; }
        .newsletters-page .list-row-title strong { color: #000; }
        .newsletters-page .list-row:hover .list-row-title strong { color: var(--brand); }
      `}</style>
      <div className="heading-row">
        <h1>All Newsletters</h1>
        <div className="view-toggle">
          <Link to="/newsletters" className="toggle">Grid view</Link>
          <span className="sep">/</span>
          <Link to="/newsletters/list" className="toggle active">List view</Link>
        </div>
      </div>
      <div className="inline-filters card">
        <div className="inline-group">
          <label htmlFor="nl-search-inline">Search</label>
          <input id="nl-search-inline" value={textQuery} onChange={(e) => setTextQuery(e.target.value)} placeholder="Search by title or body text..." />
        </div>
        <div className="inline-group">
          <label>Month</label>
          <select value={selectedMonth ?? ''} onChange={(e) => setSelectedMonth(e.target.value === '' ? null : Number(e.target.value))}>
            <option value="">All</option>
            <option value={0}>January</option>
            <option value={1}>February</option>
            <option value={2}>March</option>
            <option value={3}>April</option>
            <option value={4}>May</option>
            <option value={5}>June</option>
            <option value={6}>July</option>
            <option value={7}>August</option>
            <option value={8}>September</option>
            <option value={9}>October</option>
            <option value={10}>November</option>
            <option value={11}>December</option>
          </select>
        </div>
        <div className="inline-group">
          <label>Year</label>
          <select value={selectedYear ?? ''} onChange={(e) => setSelectedYear(e.target.value === '' ? null : Number(e.target.value))}>
            <option value="">All</option>
            {Array.from(new Set(newsletters.map((n) => new Date(n.date).getUTCFullYear())))
              .sort((a, b) => b - a)
              .map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
          </select>
        </div>
        {(textQuery || selectedMonth != null || selectedYear != null) && (
          <button className="button" onClick={clearAll}>Clear</button>
        )}
      </div>
      <section className="content-grid">
        <div className="list full-width">
          {filtered.map((n) => (
            <Link key={n.id} to={`/newsletters/${n.slug}`} className="list-row">
              <div className="list-row-title">
                <strong>{n.title}</strong>
              </div>
              <div className="list-row-meta">{new Date(n.date).toLocaleDateString()}</div>
              <div className="list-row-excerpt">{n.excerpt}</div>
            </Link>
          ))}
          {filtered.length === 0 && <p className="meta">No newsletters match your filters.</p>}
        </div>
      </section>
    </div>
  )
}


