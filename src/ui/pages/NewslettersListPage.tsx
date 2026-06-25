import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteNewsletterApi } from '../../utils/newslettersApi'
import { useAuth } from '../../contexts/AuthContext'
import { useNewsletters } from '../../contexts/NewslettersContext'

export default function NewslettersListPage() {
  const { isAuthenticated } = useAuth()
  const { newsletters, searchIndex, isLoadingNewsletters } = useNewsletters()
  const [textQuery, setTextQuery] = useState('')
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)
  const [selectedYear, setSelectedYear] = useState<number | null>(null)

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
  }, [textQuery, selectedMonth, selectedYear, searchIndex, newsletters])

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
        .newsletters-page .inline-filters.card { background: #fff; border: 1px solid var(--border-color, #e0e0e0); border-radius: 0; padding: 16px; margin-bottom: 16px; }
        .newsletters-page .inline-group label { font-weight: 600; }
        .newsletters-page .list-row { background: #fff; border: 1px solid var(--border-color, #e0e0e0); border-radius: 0; padding: 12px 16px; margin-bottom: 8px; text-decoration: none; color: inherit; transition: border-color 150ms ease, background 150ms ease; }
        .newsletters-page .list-row:hover { border-color: var(--brand); background: #fafafa; }
        .newsletters-page .list-row-title strong { color: #000; }
        .newsletters-page .list-row:hover .list-row-title strong { color: var(--brand); }
        .newsletters-page .index-banner { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: 13px; color: #555; }
        .newsletters-page .index-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--brand); animation: nllistpulse 0.9s ease-in-out infinite alternate; }
        @keyframes nllistpulse { from { transform: scale(0.9); opacity: 0.6; } to { transform: scale(1.1); opacity: 1; } }
      `}</style>
      <div className="heading-row">
        <h1>All Newsletters</h1>
        <div className="view-toggle" role="tablist" aria-label="Newsletter layout">
          <Link to="/newsletters" className="toggle">
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="1" y="1" width="6" height="6" rx="1.2" /><rect x="9" y="1" width="6" height="6" rx="1.2" /><rect x="1" y="9" width="6" height="6" rx="1.2" /><rect x="9" y="9" width="6" height="6" rx="1.2" /></svg>
            <span>Grid</span>
          </Link>
          <Link to="/newsletters/list" className="toggle active" aria-current="page">
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="1" y="2" width="14" height="2.4" rx="1.2" /><rect x="1" y="6.8" width="14" height="2.4" rx="1.2" /><rect x="1" y="11.6" width="14" height="2.4" rx="1.2" /></svg>
            <span>List</span>
          </Link>
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
        {isLoadingNewsletters && (
          <div className="index-banner">
            <span className="index-dot" />
            <span>Loading newsletters from the server…</span>
          </div>
        )}
        <div className="list full-width">
          {filtered.map((n) => {
            const isLocal = !n.sourcePath
            
            const handleDelete = (e: React.MouseEvent) => {
              e.preventDefault()
              e.stopPropagation()
              const confirmed = window.confirm(
                `Are you sure you want to delete "${n.title}"? This action cannot be undone.`
              )
              if (confirmed) {
                void deleteNewsletterApi(n.id)
                  .then(() => {
                    window.dispatchEvent(new Event('newsletterPublished'))
                  })
                  .catch((error) => {
                    console.error('Failed to delete newsletter:', error)
                    alert('Failed to delete newsletter. Please try again.')
                  })
              }
            }
            
            return (
              <div key={n.id} style={{ position: 'relative' }}>
                <Link to={`/newsletters/${n.slug}`} className="list-row">
                  <div className="list-row-title">
                    <strong>{n.title}</strong>
                    {isLocal && (
                      <span style={{ marginLeft: 8, fontSize: 12, color: '#0A8276', background: '#e6f7f5', padding: '2px 6px', borderRadius: 4 }}>
                        Custom
                      </span>
                    )}
                  </div>
                  <div className="list-row-meta">
                    {new Date(n.date).toLocaleDateString()}
                    {isLocal && isAuthenticated && (
                      <button
                        onClick={handleDelete}
                        style={{
                          marginLeft: 12,
                          padding: '2px 8px',
                          background: 'transparent',
                          border: '1px solid #fecaca',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          color: '#dc2626',
                        }}
                        title="Delete newsletter"
                      >
                        🗑️ Delete
                      </button>
                    )}
                  </div>
                  <div className="list-row-excerpt">{n.excerpt}</div>
                </Link>
              </div>
            )
          })}
          {filtered.length === 0 && (
            isLoadingNewsletters
              ? <p className="meta">Loading newsletters…</p>
              : <p className="meta">No newsletters match your filters.</p>
          )}
        </div>
      </section>
    </div>
  )
}


