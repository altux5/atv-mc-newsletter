import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { getNewslettersAsync, type Newsletter } from '../../data/newsletters'
import { findHtmlByMonthYearAsync, loadHtmlByPathAsync, extractSectionSnippets, extractBodyText } from '../../utils/newsletterHtml'
import { deleteNewsletterApi } from '../../utils/newslettersApi'
import { useAuth } from '../../contexts/AuthContext'
import { CANONICAL_CHAPTER_TITLES, getChapterMatchKeys, normalizeChapterTitle } from '../../constants/chapters'

export default function NewslettersPage() {
  const location = useLocation()
  const { isAuthenticated } = useAuth()
  const [newsletters, setNewsletters] = useState<Newsletter[]>([])
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null)
  const [sectionIndex, setSectionIndex] = useState<Record<string, ReturnType<typeof extractSectionSnippets>>>({})
  const [searchIndex, setSearchIndex] = useState<Record<string, string>>({})
  const [availableChapters, setAvailableChapters] = useState<string[]>([])
  const [textQuery, setTextQuery] = useState('')
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null) // 0-11
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [matches, setMatches] = useState<Array<{ newsletterId: string; newsletterSlug: string; newsletterDate: string; href: string; html: string }>>([])
  const [isIndexBuilding, setIsIndexBuilding] = useState(true)
  const [initialChapterParam] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('chapter')
  })
  // Titles and excerpts are now derived synchronously in the data layer; no runtime overrides needed
  const [page, setPage] = useState(1)
  const pageSize = 9
  
  // Refresh newsletters when component mounts or location changes
  useEffect(() => {
    let cancelled = false
    void getNewslettersAsync().then((list) => {
      if (!cancelled) setNewsletters(list)
    })
    return () => {
      cancelled = true
    }
  }, [location.pathname])
  
  // Listen for newsletter publish events
  useEffect(() => {
    const handleNewsletterPublished = () => {
      void getNewslettersAsync().then(setNewsletters)
    }
    window.addEventListener('newsletterPublished', handleNewsletterPublished)
    return () => window.removeEventListener('newsletterPublished', handleNewsletterPublished)
  }, [])

  // Build indexes used for section extraction
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setIsIndexBuilding(true)
      const sectionsEntries: Record<string, ReturnType<typeof extractSectionSnippets>> = {}
      const searchEntries: Record<string, string> = {}
      const tasks = newsletters.map(async (n) => {
        try {
          const date = new Date(n.date)
          const match = n.sourcePath
            ? await loadHtmlByPathAsync(n.sourcePath)
            : await findHtmlByMonthYearAsync(date.getUTCMonth(), date.getUTCFullYear())
          const html = match?.html
          if (html) {
            sectionsEntries[n.id] = extractSectionSnippets(html)
            searchEntries[n.id] = extractBodyText(html)
          }
        } catch {
          // ignore individual failures so others can still load quickly
        }
      })

      await Promise.all(tasks)

      if (!cancelled) {
        setSectionIndex(sectionsEntries)
        setSearchIndex(searchEntries)
        
        // Compute unique chapter titles from all extracted sections
        const chapterTitlesSet = new Set<string>()
        Object.values(sectionsEntries).forEach((sections) => {
          sections.forEach((section) => {
            chapterTitlesSet.add(section.title)
          })
        })
        
        // Fixed chapter list (always show these filter options)
        setAvailableChapters([...CANONICAL_CHAPTER_TITLES])
        console.log('[DEBUG] Available main chapters:', CANONICAL_CHAPTER_TITLES)
        setIsIndexBuilding(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [newsletters])

  // Read chapter from query param on mount and when it changes
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const chapterParam = params.get('chapter')
    if (!chapterParam || availableChapters.length === 0) return
    
    // Try to find exact match first
    const exactMatch = availableChapters.find((ch) => 
      ch.toLowerCase() === chapterParam.toLowerCase()
    )
    if (exactMatch) {
      setSelectedChapter(exactMatch)
      return
    }
    
    // Fallback to partial match for backward compatibility
    const normalized = chapterParam.trim().toLowerCase()
    const partialMatch = availableChapters.find((ch) => {
      const chLower = ch.toLowerCase()
      return (
        (normalized.includes('aurix') && chLower.includes('aurix')) ||
        (normalized.includes('traveo') && chLower.includes('traveo')) ||
        (normalized.includes('psoc') && chLower.includes('psoc')) ||
        (normalized.includes('bulletin') && chLower.includes('bulletin')) ||
        (normalized.includes('pdh') && (chLower.includes('pdh') || chLower.includes('partner'))) ||
        (normalized.includes('ease') && chLower.includes('ease')) ||
        (normalized.includes('market') && chLower.includes('market')) ||
        (normalized.includes('press') && (chLower.includes('press') || chLower.includes('release')))
      )
    })
    if (partialMatch) {
      setSelectedChapter(partialMatch)
    }
  }, [location.search, availableChapters])

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

  const normalize = normalizeChapterTitle
  const tokens = (s: string): string[] => normalizeChapterTitle(s).split(' ').filter(Boolean)

  // Compute chapter matches when a chapter is selected
  useEffect(() => {
    let cancelled = false
    if (!selectedChapter) {
      setMatches([])
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    const wantedKeys = getChapterMatchKeys(selectedChapter)
    const wantedTokens = tokens(wantedKeys[0] || selectedChapter)
    const results: Array<{ newsletterId: string; newsletterSlug: string; newsletterDate: string; href: string; html: string }> = []
    
    // Create normalized set of all available chapter titles for matching
    const normalizedAvailableChapters = availableChapters.map(ch => normalize(ch))
    
    // Only search in newsletters that pass the month/year/search filters
    const newslettersToSearch = filtered
    
    for (const n of newslettersToSearch) {
      const snippets = sectionIndex[n.id] || []
      
      // DEBUG: Log all section titles for the first newsletter
      if (n === newslettersToSearch[0]) {
        console.log(`[DEBUG] Newsletter: ${n.title}`)
        console.log(
          `[DEBUG] Looking for chapter: "${selectedChapter}" (match keys: ${JSON.stringify(wantedKeys)})`
        )
        console.log(`[DEBUG] All section titles:`, snippets.map(s => ({ title: s.title, normalized: normalize(s.title), id: s.id })))
      }
      
      // Find section that matches the selected chapter
      const found = snippets.find((s) => {
        const titleNorm = normalize(s.title)
        
        // Exact match for the chapter name (preferred)
        if (wantedKeys.includes(titleNorm)) return true
        
        // Check if this section title is in our available chapters list
        // This means it's likely a main chapter heading, not a subsection
        const isMainChapter = normalizedAvailableChapters.includes(titleNorm)
        
        if (isMainChapter) {
          // For main chapters, check if all wanted tokens are present
          const titleTokens = tokens(s.title)
          return wantedTokens.every((wt) => titleTokens.includes(wt))
        }
        
        // For sections not in the main chapter list, only match if:
        // 1. Title is very short (1-3 words), indicating it's likely a chapter header
        // 2. All wanted tokens are present
        const titleTokens = tokens(s.title)
        if (titleTokens.length <= 3 && wantedTokens.every((wt) => titleTokens.includes(wt))) {
          return true
        }
        
        return false
      })
      
      if (n === newslettersToSearch[0] && found) {
        console.log(`[DEBUG] Found matching section:`, { title: found.title, id: found.id })
      } else if (n === newslettersToSearch[0]) {
        console.log(`[DEBUG] No matching section found`)
      }
      
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
  }, [selectedChapter, sectionIndex, availableChapters, filtered])

  // no typed search effect anymore

  // Reset to first page (static for now)
  useEffect(() => {
    setPage(1)
  }, [])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const start = (page - 1) * pageSize
  const end = start + pageSize
  const paged = filtered.slice(start, end)

  const shouldHideGridForInitialChapter =
    !!initialChapterParam &&
    (isIndexBuilding ||
      !selectedChapter ||
      (selectedChapter != null && isLoading && matches.length === 0))

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
      <style>{`
        .newsletters-page .heading-row h1 { color: var(--brand); margin: 0; }
        .newsletters-page .heading-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
        .newsletters-page .heading-row .toggle { color: var(--brand); text-decoration: none; padding: 4px 8px; border-radius: 0; }
        .newsletters-page .heading-row .toggle.active { background: rgba(0,0,0,0.04); }
        .newsletters-page .layout-with-sidebar { gap: 16px; align-items: flex-start; }
        .newsletters-page .filters.card { background: #fff; border: 1px solid var(--border-color, #e0e0e0); border-radius: 0; padding: 16px; }
        .newsletters-page .filters .field { margin-bottom: 12px; }
        .newsletters-page .filters label { font-weight: 600; }
        .newsletters-page .content-grid .grid { gap: 16px; }
        .newsletters-page .newsletter-card { background: #fff; border: 1px solid var(--border-color, #e0e0e0); border-radius: 0; padding: 16px; transition: transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease; }
        .newsletters-page .newsletter-card:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.06); border-color: var(--brand); }
        .newsletters-page .newsletter-card h3 { margin-top: 0; }
        .newsletters-page .newsletter-card:hover h3 { color: var(--brand); }
        .newsletters-page .pill { color: var(--brand); border: 1px solid var(--brand); background: transparent; border-radius: 0; }
        .newsletters-page .matches-section .match-title-link { color: var(--brand); }
        .newsletters-page .loading .loading-bar { height: 8px; background: #f3f3f3; border-radius: 0; overflow: hidden; }
        .newsletters-page .loading .loading-bar-inner { height: 100%; width: 40%; background: var(--brand); animation: nlblink 1.2s ease-in-out infinite alternate; }
        @keyframes nlblink { from { width: 25%; } to { width: 55%; } }
        .newsletters-page .index-banner {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
          font-size: 13px;
          color: #555;
        }
        .newsletters-page .index-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: var(--brand);
          animation: nlindexpulse 0.9s ease-in-out infinite alternate;
        }
        @keyframes nlindexpulse {
          from { transform: scale(0.9); opacity: 0.6; }
          to { transform: scale(1.1); opacity: 1; }
        }
      `}</style>
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
          {isIndexBuilding && (
            <div className="index-banner">
              <span className="index-dot" />
              <span>Preparing chapters and search index…</span>
            </div>
          )}
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
              {availableChapters.length === 0 && (
                <p className="meta" style={{ fontSize: '12px', color: '#666' }}>Loading chapters...</p>
              )}
              {availableChapters.map((c) => (
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
          {shouldHideGridForInitialChapter && (
            <div className="initial-chapter-loading card">
              <p style={{ marginTop: 0, marginBottom: 8, fontWeight: 600 }}>
                Taking you to “{initialChapterParam}” chapters…
              </p>
              <p className="meta" style={{ margin: 0 }}>
                We’re preparing the chapter index for all newsletters. This usually takes just a moment.
              </p>
            </div>
          )}
          {!shouldHideGridForInitialChapter && (
          <div className={`grid ${textQuery ? 'search-active' : ''}`}>
            {paged.map((n) => {
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
                      return getNewslettersAsync()
                    })
                    .then(setNewsletters)
                    .catch((error) => {
                      console.error('Failed to delete newsletter:', error)
                      alert('Failed to delete newsletter. Please try again.')
                    })
                }
              }
              
              return (
                <div key={n.id} className="newsletter-card-wrapper">
                  <Link to={`/newsletters/${n.slug}`} className="card newsletter-card" style={{ display: 'block' }}>
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
                  {isLocal && isAuthenticated && (
                    <button
                      onClick={handleDelete}
                      className="delete-newsletter-btn"
                      title="Delete newsletter"
                      style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        padding: '4px 8px',
                        background: '#fff',
                        border: '1px solid #fecaca',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        color: '#dc2626',
                        zIndex: 10,
                      }}
                    >
                      🗑️
                    </button>
                  )}
                </div>
              )
            })}
            {filtered.length === 0 && <p className="meta">No newsletters match your search/filters.</p>}
          </div>
          )}
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


