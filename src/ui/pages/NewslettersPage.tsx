import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { getChapterMatchKeys, normalizeChapterTitle } from '../../constants/chapters'
import { useNewsletters } from '../../contexts/NewslettersContext'

/** Condense "ATV MC Newsletter - November 2025 edition" down to "November '25". */
function formatShortTitle(dateStr: string): string {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return 'Newsletter'
  const month = d.toLocaleString(undefined, { month: 'long', timeZone: 'UTC' })
  const yy = String(d.getUTCFullYear() % 100).padStart(2, '0')
  return `${month} '${yy}`
}

export default function NewslettersPage() {
  const location = useLocation()
  const { newsletters, searchIndex, sectionIndex, cardPreviews, availableChapters, isIndexBuilding, isLoadingNewsletters } = useNewsletters()
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null)
  const [textQuery, setTextQuery] = useState('')
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null) // 0-11
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [matches, setMatches] = useState<Array<{ newsletterId: string; newsletterSlug: string; newsletterDate: string; href: string; html: string }>>([])
  const [initialChapterParam] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('chapter')
  })
  // Titles and excerpts are now derived synchronously in the data layer; no runtime overrides needed
  const [page, setPage] = useState(1)
  const pageSize = 4

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
  }, [textQuery, searchIndex, selectedMonth, selectedYear, newsletters])

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
        .newsletters-page .layout-with-sidebar { gap: 20px; align-items: flex-start; }

        /* Filter box — soft card with pill controls */
        .newsletters-page .filters.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 18px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
        .newsletters-page .filters .field { margin-bottom: 16px; }
        .newsletters-page .filters label { font-weight: 600; font-size: 12px; letter-spacing: 0.3px; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; }
        .newsletters-page .filters input,
        .newsletters-page .filters select {
          width: 100%; border-radius: 999px; border: 1px solid #d1d5db; background: #fff;
          padding: 9px 14px; font-size: 14px; color: var(--text);
          transition: border-color 150ms ease, box-shadow 150ms ease;
        }
        .newsletters-page .filters input:focus,
        .newsletters-page .filters select:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-ghost); }
        .newsletters-page .filters .select-row { display: flex; gap: 8px; }
        .newsletters-page .filters .tags { display: flex; flex-wrap: wrap; gap: 8px; }
        .newsletters-page .filters .tag {
          border-radius: 999px; border: 1px solid #d1d5db; background: #fff; color: var(--muted);
          padding: 7px 13px; font-size: 13px; font-weight: 600; cursor: pointer;
          transition: background 150ms ease, color 150ms ease, border-color 150ms ease;
        }
        .newsletters-page .filters .tag:hover { border-color: var(--brand); color: var(--brand); }
        .newsletters-page .filters .tag.on { background: var(--brand); border-color: var(--brand); color: #fff; }
        .newsletters-page .filters .button {
          border-radius: 999px; border: 1px solid var(--brand); background: var(--brand); color: #fff;
          padding: 9px 18px; font-weight: 600; font-size: 14px; cursor: pointer; transition: background 150ms ease;
        }
        .newsletters-page .filters .button:hover { background: #086b61; }

        /* Grid — 4 portrait "mini-newsletter" cards per page (2 columns, equal size) */
        .newsletters-page .content-grid .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-rows: 1fr; gap: 22px; align-items: stretch; }
        .newsletters-page .content-grid .grid.search-active { grid-template-columns: minmax(0, 1fr); grid-auto-rows: auto; }
        .newsletters-page .newsletter-card-wrapper { position: relative; height: 100%; min-width: 0; }
        .newsletters-page .newsletter-card {
          height: 100%; display: flex; flex-direction: column; min-width: 0;
          background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden;
          color: var(--text); text-decoration: none;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04);
          transition: transform 160ms ease, box-shadow 160ms ease;
        }
        .newsletters-page .content-grid .grid:not(.search-active) .newsletter-card { min-height: 500px; }
        .newsletters-page .newsletter-card:hover { transform: translateY(-3px); box-shadow: 0 10px 28px rgba(0,0,0,0.10); }

        /* Cover image with overlaid month title (branded gradient fallback) */
        .newsletters-page .nl-cover {
          position: relative; height: 150px; flex-shrink: 0; overflow: hidden;
          background: linear-gradient(135deg, var(--brand) 0%, #0b5c54 100%);
        }
        .newsletters-page .nl-cover img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
        .newsletters-page .nl-cover-scrim { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,0.62) 100%); }
        .newsletters-page .nl-cover-badge {
          position: absolute; top: 10px; right: 12px; z-index: 1;
          background: rgba(255,255,255,0.9); color: var(--text);
          font-size: 11px; font-weight: 700;
          padding: 3px 9px; border-radius: 999px;
        }
        .newsletters-page .nl-cover-title {
          position: absolute; left: 14px; right: 14px; bottom: 10px; z-index: 1; margin: 0;
          color: #fff; font-size: 26px; font-weight: 800; letter-spacing: 0.2px; line-height: 1.1;
          text-shadow: 0 1px 6px rgba(0,0,0,0.45);
        }

        /* Card body */
        .newsletters-page .nl-body { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; flex: 1; min-height: 0; min-width: 0; }

        /* Top story — the edition's lead headline, replacing the old boilerplate intro */
        .newsletters-page .nl-top { display: flex; flex-direction: column; gap: 2px; }
        .newsletters-page .nl-top-kicker { font-size: 10px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; color: #9ca3af; }
        .newsletters-page .nl-top-chapter { font-size: 12px; font-weight: 800; letter-spacing: 0.3px; color: var(--brand); }
        .newsletters-page .nl-top-headline {
          margin: 0; font-size: 15.5px; font-weight: 700; line-height: 1.3; color: #1f2937;
          display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
        }
        .newsletters-page .nl-fallback {
          margin: 0; font-size: 13px; line-height: 1.55; color: #4b5563;
          display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;
        }
        .newsletters-page .nl-search-snippet {
          margin: 0; font-size: 13px; line-height: 1.55; color: #4b5563;
          display: -webkit-box; -webkit-line-clamp: 6; -webkit-box-orient: vertical; overflow: hidden;
        }
        .newsletters-page .nl-search-snippet mark { background: #fff3cd; padding: 0 2px; }

        /* "Also in this issue" — compact table-of-contents */
        .newsletters-page .nl-toc { display: flex; flex-direction: column; gap: 6px; flex: 1; min-height: 0; min-width: 0; padding-top: 10px; border-top: 1px solid #eef0f2; }
        .newsletters-page .nl-toc-label { margin: 0; font-size: 10px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; color: #9ca3af; }
        .newsletters-page .nl-toc-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
        .newsletters-page .nl-toc-list li { display: flex; flex-direction: column; gap: 0; min-width: 0; }
        .newsletters-page .nl-chapter { font-size: 11px; font-weight: 800; letter-spacing: 0.2px; color: var(--brand); }
        .newsletters-page .nl-article {
          font-size: 12.5px; line-height: 1.35; color: #4b5563; min-width: 0;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .newsletters-page .nl-more { font-size: 11px; font-weight: 700; color: #9ca3af; }

        .newsletters-page .nl-card-cta {
          margin-top: auto; padding-top: 4px; font-size: 13px; font-weight: 700; color: var(--brand);
          opacity: 0; transform: translateX(-4px);
          transition: opacity 150ms ease, transform 150ms ease;
        }
        .newsletters-page .newsletter-card:hover .nl-card-cta { opacity: 1; transform: translateX(0); }

        /* Pagination — pill buttons matching the view toggle */
        .newsletters-page .pagination { display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 28px; }
        .newsletters-page .pagination .button {
          display: inline-flex; align-items: center; gap: 6px;
          border-radius: 999px; border: 1px solid var(--brand); background: #fff; color: var(--brand);
          padding: 8px 18px; font-size: 14px; font-weight: 600; cursor: pointer;
          transition: background 150ms ease, color 150ms ease, border-color 150ms ease;
        }
        .newsletters-page .pagination .button:hover:not(:disabled) { background: var(--brand); color: #fff; }
        .newsletters-page .pagination .button:disabled { opacity: 0.5; cursor: default; border-color: #d1d5db; color: #9ca3af; }
        .newsletters-page .pagination .page-indicator { margin: 0 4px; font-size: 13px; font-weight: 600; color: var(--muted); }

        .newsletters-page .matches-section .match-title-link { color: var(--brand); }
        .newsletters-page .loading .loading-bar { height: 8px; background: #f3f3f3; border-radius: 999px; overflow: hidden; }
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

        @media (max-width: 720px) {
          .newsletters-page .content-grid .grid { grid-template-columns: 1fr; }
        }
      `}</style>
      <div className="heading-row">
        <h1>All Newsletters</h1>
        <div className="view-toggle" role="tablist" aria-label="Newsletter layout">
          <Link
            to="/newsletters"
            className={`toggle ${location.pathname.endsWith('/list') ? '' : 'active'}`}
            aria-current={location.pathname.endsWith('/list') ? undefined : 'page'}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="1" y="1" width="6" height="6" rx="1.2" /><rect x="9" y="1" width="6" height="6" rx="1.2" /><rect x="1" y="9" width="6" height="6" rx="1.2" /><rect x="9" y="9" width="6" height="6" rx="1.2" /></svg>
            <span>Grid</span>
          </Link>
          <Link
            to="/newsletters/list"
            className={`toggle ${location.pathname.endsWith('/list') ? 'active' : ''}`}
            aria-current={location.pathname.endsWith('/list') ? 'page' : undefined}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="1" y="2" width="14" height="2.4" rx="1.2" /><rect x="1" y="6.8" width="14" height="2.4" rx="1.2" /><rect x="1" y="11.6" width="14" height="2.4" rx="1.2" /></svg>
            <span>List</span>
          </Link>
        </div>
      </div>
      <div className="layout-with-sidebar">
        <aside className="filters card">
          {isLoadingNewsletters && (
            <div className="index-banner">
              <span className="index-dot" />
              <span>Syncing newsletters from the server…</span>
            </div>
          )}
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
              const preview = cardPreviews[n.id]
              const cover = preview?.cover || null
              const lead = preview?.chapters?.[0] || null
              const rest = preview?.chapters?.slice(1) ?? []
              const maxRest = 3
              const moreCount = Math.max(0, rest.length - maxRest)
              const isSearching = !!textQuery && !!matchSnippets[n.id]

              return (
                <div key={n.id} className="newsletter-card-wrapper">
                  <Link to={`/newsletters/${n.slug}`} className="card newsletter-card">
                    <div className={`nl-cover${cover ? '' : ' no-image'}`}>
                      {cover && (
                        <img
                          src={cover}
                          alt=""
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                          }}
                        />
                      )}
                      <div className="nl-cover-scrim" />
                      <span className="nl-cover-badge">
                        {new Date(n.date).toLocaleDateString()}
                      </span>
                      <h3 className="nl-cover-title">{formatShortTitle(n.date)}</h3>
                    </div>
                    <div className="nl-body">
                      {isSearching ? (
                        <p className="nl-search-snippet" dangerouslySetInnerHTML={{ __html: matchSnippets[n.id] }} />
                      ) : lead ? (
                        <div className="nl-top">
                          <span className="nl-top-kicker">Top story</span>
                          <span className="nl-top-chapter">{lead.chapter}</span>
                          <p className="nl-top-headline">{lead.article}</p>
                        </div>
                      ) : (
                        <p className="nl-fallback">{n.excerpt}</p>
                      )}
                      {!isSearching && rest.length > 0 && (
                        <div className="nl-toc">
                          <p className="nl-toc-label">Also in this issue</p>
                          <ul className="nl-toc-list">
                            {rest.slice(0, maxRest).map((c) => (
                              <li key={c.chapter}>
                                <span className="nl-chapter">{c.chapter}</span>
                                <span className="nl-article">{c.article}</span>
                              </li>
                            ))}
                          </ul>
                          {moreCount > 0 && <span className="nl-more">+{moreCount} more topic{moreCount > 1 ? 's' : ''}</span>}
                        </div>
                      )}
                      <span className="nl-card-cta">Read the issue →</span>
                    </div>
                  </Link>
                </div>
              )
            })}
            {filtered.length === 0 && (
              isLoadingNewsletters ? (
                <div className="loading">
                  <div className="loading-bar"><div className="loading-bar-inner" /></div>
                  <p className="meta">Loading newsletters…</p>
                </div>
              ) : (
                <p className="meta">No newsletters match your search/filters.</p>
              )
            )}
          </div>
          )}
          {filtered.length > 0 && (
            <div className="pagination">
              <button className="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <span aria-hidden="true">‹</span> Previous
              </button>
              <span className="meta page-indicator">Page {page} of {totalPages}</span>
              <button className="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                Next <span aria-hidden="true">›</span>
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}


