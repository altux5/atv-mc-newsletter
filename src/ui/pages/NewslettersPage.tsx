import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { newsletters } from '../../data/newsletters'
import { findHtmlByMonthYearAsync, loadHtmlByPathAsync, extractSectionSnippets, extractBodyText } from '../../utils/newsletterHtml'

const CHAPTERS = [
  'AURIX™',
  'TRAVEO™',
  'PSOC™ Automotive',
  'Bulletin Board',
  'Ease of Use',
  'Market News & Press Release',
  'Success Stories',
  'Team News',
]

export default function NewslettersPage() {
  const location = useLocation()
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null)
  const [sectionIndex, setSectionIndex] = useState<Record<string, ReturnType<typeof extractSectionSnippets>>>({})
  const [htmlCache, setHtmlCache] = useState<Record<string, string>>({})
  const [searchIndex, setSearchIndex] = useState<Record<string, string>>({})
  const [textQuery, setTextQuery] = useState('')
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null) // 0-11
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [matches, setMatches] = useState<Array<{ newsletterId: string; newsletterSlug: string; newsletterDate: string; href: string; html: string }>>([])
  // Titles and excerpts are now derived synchronously in the data layer; no runtime overrides needed
  const [page, setPage] = useState(1)
  const pageSize = 9

  // Build indexes used for section extraction
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const sectionsEntries: Record<string, ReturnType<typeof extractSectionSnippets>> = {}
      const htmls: Record<string, string> = {}
      const searchEntries: Record<string, string> = {}
      for (const n of newsletters) {
        try {
          const date = new Date(n.date)
          const match = n.sourcePath
            ? await loadHtmlByPathAsync(n.sourcePath)
            : await findHtmlByMonthYearAsync(date.getUTCMonth(), date.getUTCFullYear())
          const html = match?.html
          if (html) {
            sectionsEntries[n.id] = extractSectionSnippets(html)
            htmls[n.id] = html
            searchEntries[n.id] = extractBodyText(html)
          }
        } catch {}
      }
      if (!cancelled) {
        setSectionIndex(sectionsEntries)
        setHtmlCache(htmls)
        setSearchIndex(searchEntries)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Read chapter from query param on mount and when it changes
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const chapterParam = params.get('chapter')
    if (!chapterParam) return
    const normalized = chapterParam.trim().toUpperCase()
    if (normalized.includes('AURIX')) setSelectedChapter('AURIX™')
    else if (normalized.includes('TRAVEO')) setSelectedChapter('TRAVEO™')
    else if (normalized.includes('PSOC')) setSelectedChapter('PSOC™ Automotive')
  }, [location.search])

  const filtered = useMemo(() => {
    const q = textQuery.trim().toLowerCase()

    // First filter by Month/Year selections
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
  }, [textQuery, searchIndex, selectedMonth, selectedYear])

  // Build highlighted snippets centered around the first body/excerpt match
  const matchSnippets: Record<string, string> = useMemo(() => {
    const q = textQuery.trim()
    if (!q) return {}

    const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const highlight = (snippet: string, query: string) => {
      try {
        const re = new RegExp(escapeRegExp(query), 'gi')
        return snippet.replace(re, (m) => `<mark>${m}</mark>`) // safe: we only inject our own <mark>
      } catch {
        return snippet
      }
    }

    const build = (fullText: string, query: string) => {
      if (!fullText) return ''
      const lower = fullText.toLowerCase()
      const idx = lower.indexOf(query.toLowerCase())
      if (idx === -1) return ''
      const context = 160
      const start = Math.max(0, idx - context)
      const end = Math.min(fullText.length, idx + query.length + context)
      const prefix = start > 0 ? '…' : ''
      const suffix = end < fullText.length ? '…' : ''
      const slice = fullText.slice(start, end).replace(/\s+/g, ' ').trim()
      return prefix + highlight(slice, query) + suffix
    }

    const out: Record<string, string> = {}
    for (const n of filtered) {
      const body = searchIndex[n.id] || ''
      let snippet = build(body, q)
      if (!snippet) {
        // Fallback to excerpt if body had no match but excerpt matched
        if (n.excerpt.toLowerCase().includes(q.toLowerCase())) {
          snippet = highlight(n.excerpt, q)
        }
      }
      if (snippet) out[n.id] = snippet
    }
    return out
  }, [textQuery, filtered, searchIndex])

  const normalize = (s: string): string => s.toLowerCase().replace(/™/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim()

  // Compute chapter matches when a chapter is selected
  useEffect(() => {
    let cancelled = false
    if (!selectedChapter) {
      setMatches([])
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    const wanted = normalize(selectedChapter)
    const results: Array<{ newsletterId: string; newsletterSlug: string; newsletterDate: string; href: string; html: string }> = []
    for (const n of newsletters) {
      const snippets = sectionIndex[n.id] || []
      const found = snippets.find((s) => normalize(s.title).includes(wanted))
      if (found) {
        results.push({
          newsletterId: n.id,
          newsletterSlug: n.slug,
          newsletterDate: n.date,
          href: `/newsletters/${n.slug}#${found.id}`,
          html: found.html,
        })
        continue
      }
    }
    results.sort((a, b) => new Date(b.newsletterDate).getTime() - new Date(a.newsletterDate).getTime())
    if (!cancelled) {
      setMatches(results)
      setIsLoading(false)
    }
    return () => { cancelled = true }
  }, [selectedChapter, sectionIndex])

  // no typed search effect anymore

  // Reset to first page (static for now)
  useEffect(() => {
    setPage(1)
  }, [])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const start = (page - 1) * pageSize
  const end = start + pageSize
  const paged = filtered.slice(start, end)

  const clearAll = () => {
    setSelectedChapter(null)
    setMatches([])
    setIsLoading(false)
    setTextQuery('')
    setSelectedMonth(null)
    setSelectedYear(null)
  }

  return (
    <div className="newsletters-page">
      <div className="heading-row">
        <h1>All Newsletters</h1>
        <div className="view-toggle">
          <Link to="/newsletters" className={`toggle ${location.pathname.endsWith('/list') ? '' : 'active'}`}>Grid view</Link>
          <span className="sep">/</span>
          <Link to="/newsletters/list" className={`toggle ${location.pathname.endsWith('/list') ? 'active' : ''}`}>List view</Link>
        </div>
      </div>
      <div className="layout-with-sidebar">
        <aside className="filters card">
          <div className="field">
            <label htmlFor="nl-search">Search newsletters</label>
            <input
              id="nl-search"
              value={textQuery}
              onChange={(e) => setTextQuery(e.target.value)}
              placeholder="Search by title or body text..."
            />
          </div>
          <div className="field">
            <label>Chapters</label>
            <div className="tags">
              {CHAPTERS.map((c) => (
                <button
                  key={c}
                  className={`tag ${selectedChapter === c ? 'on' : ''}`}
                  onClick={() => setSelectedChapter((prev) => (prev === c ? null : c))}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Month and Year</label>
            <div className="select-row">
              <select value={selectedMonth ?? ''} onChange={(e) => setSelectedMonth(e.target.value === '' ? null : Number(e.target.value))}>
                <option value="">All months</option>
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
              <select value={selectedYear ?? ''} onChange={(e) => setSelectedYear(e.target.value === '' ? null : Number(e.target.value))}>
                <option value="">All years</option>
                {Array.from(new Set(newsletters.map((n) => new Date(n.date).getUTCFullYear())))
                  .sort((a, b) => b - a)
                  .map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
              </select>
            </div>
          </div>
          {(selectedChapter || textQuery || selectedMonth != null || selectedYear != null) && (
            <button className="button" onClick={clearAll}>Clear</button>
          )}
        </aside>
        <section className="content-grid">
          {/* Results container (not grid cards) */}
          {selectedChapter && (
            <div className="matches-section">
              {isLoading && (
                <div className="loading">
                  <div className="loading-bar"><div className="loading-bar-inner" /></div>
                  <p className="meta">Loading “{selectedChapter}” chapters…</p>
                </div>
              )}
              {!isLoading && matches.length === 0 && (
                <p className="meta">No matching sections found.</p>
              )}
              {!isLoading && matches.length > 0 && (
                <div className="matches-list">
                  {matches.map((m, idx) => (
                    <div key={`${m.newsletterId}-${idx}`} className="match-snippet">
                      <div className="match-header">
                        <Link to={m.href} className="match-title-link">
                          <strong>{(newsletters.find((x) => x.id === m.newsletterId)?.title) || 'Newsletter'}</strong>
                        </Link>
                        <span className="meta" style={{ marginLeft: 8 }}>
                          {new Date(newsletters.find((x) => x.id === m.newsletterId)?.date || m.newsletterDate).toLocaleDateString()}
                        </span>
                      </div>
                      <div dangerouslySetInnerHTML={{ __html: m.html }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className={`grid ${textQuery ? 'search-active' : ''}`}>
            {paged.map((n) => (
              <Link key={n.id} to={`/newsletters/${n.slug}`} className="card newsletter-card">
                <h3>{n.title}</h3>
                <p className="meta">{new Date(n.date).toLocaleDateString()}</p>
                {textQuery && matchSnippets[n.id] ? (
                  <p className="query-snippet" dangerouslySetInnerHTML={{ __html: matchSnippets[n.id] }} />
                ) : (
                  <p>{n.excerpt}</p>
                )}
                <div className="tag-row">
                  {n.tags.map((t) => (
                    <span key={t} className="pill">{t}</span>
                  ))}
                </div>
              </Link>
            ))}
            {filtered.length === 0 && <p className="meta">No newsletters match your search/filters.</p>}
          </div>
          {filtered.length > 0 && (
            <div className="pagination">
              <button className="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
              <span className="meta" style={{ margin: '0 8px' }}>Page {page} of {totalPages}</span>
              <button className="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}


