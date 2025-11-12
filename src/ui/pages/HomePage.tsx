import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getNewsletters } from '../../data/newsletters'
import { extractAndSanitizeBodyHtml, extractBodyText, findHtmlByMonthYearAsync, loadHtmlByPathAsync } from '../../utils/newsletterHtml'
import newsletterImage from '../../photos/newsletter image.png'
import headerImage from '../../photos/new-header.jpg'

export default function HomePage() {
  const [newsletters, setNewsletters] = useState(() => getNewsletters())
  const latest = newsletters[0]
  const [latestParagraphs, setLatestParagraphs] = useState<string[]>([])
  
  // Search state
  const [textQuery, setTextQuery] = useState('')
  const [searchIndex, setSearchIndex] = useState<Record<string, string>>({})
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  
  // Refresh newsletters on mount
  useEffect(() => {
    setNewsletters(getNewsletters())
  }, [])
  
  // Listen for newsletter publish events
  useEffect(() => {
    const handleNewsletterPublished = () => {
      setNewsletters(getNewsletters())
    }
    window.addEventListener('newsletterPublished', handleNewsletterPublished)
    return () => window.removeEventListener('newsletterPublished', handleNewsletterPublished)
  }, [])
  
  // Build search index
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
  }, [newsletters])

  // Filter newsletters based on search criteria
  const filteredNewsletters = useMemo(() => {
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
    setCurrentPage(1)
  }

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [textQuery, selectedMonth, selectedYear])

  // Pagination logic
  const itemsPerPage = 3
  const totalPages = Math.ceil(filteredNewsletters.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedNewsletters = filteredNewsletters.slice(startIndex, endIndex)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!latest) return
      try {
        let html: string | null = null
        if (latest.sourcePath) {
          const match = await loadHtmlByPathAsync(latest.sourcePath)
          html = match?.html || null
        }
        if (!html) {
          const d = new Date(latest.date)
          const match = await findHtmlByMonthYearAsync(d.getUTCMonth(), d.getUTCFullYear())
          html = match?.html || null
        }
        if (!html) return
        const sanitized = extractAndSanitizeBodyHtml(html)
        const container = document.createElement('div')
        container.innerHTML = sanitized
        const paragraphs = Array.from(container.querySelectorAll('p')) as HTMLParagraphElement[]
        const meaningful: string[] = []
        for (const p of paragraphs) {
          const text = (p.textContent || '').replace(/\s+/g, ' ').trim()
          if (text.length < 40) continue
          meaningful.push(text)
          break
        }
        if (!cancelled) setLatestParagraphs(meaningful)
      } catch {}
    })()
    return () => { cancelled = true }
  }, [latest?.id])
  
  return (
    <div className="home">
      <section
        className="header-image"
        style={{
          width: '100vw',
          position: 'relative',
          left: '50%',
          right: '50%',
          marginLeft: '-50vw',
          marginRight: '-50vw',
          marginTop: -32,
          height: 'clamp(240px, 22vw, 380px)',
          overflow: 'hidden',
        }}
      >
        <img
          src={headerImage}
          alt="Header"
          style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
        />
      </section>
      <div
        className="home-wide"
        style={{
          position: 'relative',
          width: '100vw',
          left: '50%',
          right: '50%',
          marginLeft: '-50vw',
          marginRight: '-50vw',
        }}
      >
        <div
          className="home-two-col"
          style={{
            display: 'grid',
            gridTemplateColumns: '12fr 5fr',
            gap: 100,
            width: 'min(95vw, 1400px)',
            margin: '0 auto',
            alignItems: 'start',
          }}
        >
        <div>
          <section className="hero" style={{ borderTop: 'none', padding: '40px 0' }}>
            <h1 style={{ textAlign: 'left', width: '100%', color: 'var(--brand)' }}>
              Welcome to the ATV MC Digital Newsletter 
            
            </h1>
            <p style={{ textAlign: 'left', width: '100%', maxWidth: 'none', fontSize: '18px'  }}>
            <br /> Your secure, always-current dashboard for everything Automotive Microcontrollers. Learn more about our products and solutions. Each month we update six focused sections, no scrolling through threads, no hunting for links.
            <br />
            <br />
            </p>
            <div className="chapters-grid" style={{ marginTop: 16 }}>
              <Link to="/newsletters?chapter=AURIX" className="chapter-tile">
                <h3>AURIX™</h3>
                <p>the safety & performance guardian</p>
              </Link>
              <Link to="/newsletters?chapter=TRAVEO" className="chapter-tile">
                <h3>TRAVEO™ T2G</h3>
                <p>the graphics & body powerhouse</p>
              </Link>
              <Link to="/newsletters?chapter=PSOC" className="chapter-tile">
                <h3>PSOC™ Automotive</h3>
                <p>the smart surface</p>
              </Link>
              <Link to="/newsletters?chapter=BULLETIN" className="chapter-tile">
                <h3>Bulletin Board</h3>
                <p>design-win spotlights, team announcements regional highlights</p>
              </Link>
              <Link to="/newsletters?chapter=EASE" className="chapter-tile">
                <h3>Ease of Use</h3>
                <p>one click access to collateral, samples, kits, training videos, price lists</p>
              </Link>
              <Link to="/newsletters?chapter=MARKET" className="chapter-tile">
                <h3>Market News & Press Release</h3>
                <p>Every headline, note and quote on</p>
              </Link>
            </div>
            <p style={{ textAlign: 'left', width: '100%', maxWidth: 'none', fontSize: '18px' }}>
              <br/>
              <br />
            Bookmark the link, enable notifications, and check back on the first working day of every month. Always stay up to date with the latest news and information.
<br /> <br /> Thank you for keeping the information strictly internal—let’s turn these updates into design-ins.

            </p>
          </section>

          <section className="search-section" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <h2 style={{ marginTop: 0, color: 'var(--brand)' }}>Search Newsletters</h2>
            <div className="search-filters" style={{
              background: '#fff',
              border: '1px solid var(--border-color, #e0e0e0)',
              borderRadius: 0,
              padding: 16,
              marginBottom: 16
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label htmlFor="home-search" style={{ fontWeight: 600 }}>Search</label>
                  <input
                    id="home-search"
                    value={textQuery}
                    onChange={(e) => setTextQuery(e.target.value)}
                    placeholder="Search by title or body text..."
                    style={{
                      padding: '8px 12px',
                      border: '1px solid var(--border-color, #e0e0e0)',
                      borderRadius: 4,
                      fontSize: 14
                    }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontWeight: 600 }}>Month</label>
                    <select
                      value={selectedMonth ?? ''}
                      onChange={(e) => setSelectedMonth(e.target.value === '' ? null : Number(e.target.value))}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid var(--border-color, #e0e0e0)',
                        borderRadius: 4,
                        fontSize: 14
                      }}
                    >
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontWeight: 600 }}>Year</label>
                    <select
                      value={selectedYear ?? ''}
                      onChange={(e) => setSelectedYear(e.target.value === '' ? null : Number(e.target.value))}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid var(--border-color, #e0e0e0)',
                        borderRadius: 4,
                        fontSize: 14
                      }}
                    >
                      <option value="">All</option>
                      {Array.from(new Set(newsletters.map((n) => new Date(n.date).getUTCFullYear())))
                        .sort((a, b) => b - a)
                        .map((y) => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                  </div>
                  {(textQuery || selectedMonth != null || selectedYear != null) && (
                    <button
                      onClick={clearAll}
                      style={{
                        padding: '8px 16px',
                        background: 'var(--brand)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontSize: 14,
                        fontWeight: 600
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>
            
            {(textQuery || selectedMonth != null || selectedYear != null) && (
              <div className="search-results">
                {filteredNewsletters.length > 0 ? (
                  <>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: 16,
                        marginBottom: 16
                      }}
                    >
                      {paginatedNewsletters.map((n) => (
                        <Link
                          key={n.id}
                          to={`/newsletters/${n.slug}`}
                          style={{
                            background: '#fff',
                            border: '1px solid var(--border-color, #e0e0e0)',
                            borderRadius: 0,
                            padding: 16,
                            textDecoration: 'none',
                            color: 'inherit',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                            transition: 'border-color 150ms ease, background 150ms ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = 'var(--brand)'
                            e.currentTarget.style.background = '#fafafa'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = 'var(--border-color, #e0e0e0)'
                            e.currentTarget.style.background = '#fff'
                          }}
                        >
                          <h3 style={{ margin: 0, color: 'var(--brand)', fontSize: 18 }}>{n.title}</h3>
                          <p style={{ margin: 0, fontSize: 14, color: '#666' }}>
                            {new Date(n.date).toLocaleDateString()}
                          </p>
                          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{n.excerpt}</p>
                        </Link>
                      ))}
                    </div>
                    {totalPages > 1 && (
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'center',
                          alignItems: 'center',
                          gap: 12,
                          marginTop: 8
                        }}
                      >
                        <button
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                          style={{
                            padding: '8px 16px',
                            background: currentPage === 1 ? '#e0e0e0' : 'var(--brand)',
                            color: currentPage === 1 ? '#999' : '#fff',
                            border: 'none',
                            borderRadius: 4,
                            cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                            fontSize: 14,
                            fontWeight: 600
                          }}
                        >
                          ← Previous
                        </button>
                        <span style={{ fontSize: 14, color: '#666' }}>
                          Page {currentPage} of {totalPages}
                        </span>
                        <button
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                          style={{
                            padding: '8px 16px',
                            background: currentPage === totalPages ? '#e0e0e0' : 'var(--brand)',
                            color: currentPage === totalPages ? '#999' : '#fff',
                            border: 'none',
                            borderRadius: 4,
                            cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                            fontSize: 14,
                            fontWeight: 600
                          }}
                        >
                          Next →
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <p style={{ color: '#666', fontStyle: 'italic' }}>No newsletters match your search criteria.</p>
                )}
              </div>
            )}
          </section>

          {latest && (
            <section className="latest-newsletter" style={{ paddingLeft: 0, paddingRight: 0 }}>
              <h2 style={{ marginTop: 0, color: 'var(--brand)' }}>Latest newsletter</h2>
              <div className="latest-grid">
                <div className="left">
                  <div className="media">
                    <img src={newsletterImage} alt="Newsletter picture" />
                  </div>
                  <div>
                    <h3 style={{ color: '#000' }}>{latest.title}</h3>
                    <p style={{ margin: 0 }}>{new Date(latest.date).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="latest-desc">
                  <h4 style={{ marginTop: 0, marginBottom: 8 }}>from this newsletter:</h4>
                  {latestParagraphs.length > 0 ? (
                    latestParagraphs.map((t, i) => (
                      <p key={i} style={{ marginTop: i === 0 ? 0 : 8 }}>{t}</p>
                    ))
                  ) : (
                    <p className="meta" style={{ marginTop: 0 }}>Loading preview…</p>
                  )}
                  <Link to={`/newsletters/${latest.slug}`} className="cta" style={{ display: 'inline-block', marginTop: 12 }}>Go to the newsletter →</Link>
                </div>
              </div>
            </section>
          )}

          <section className="insights">
            <h2 style={{ color: 'var(--brand)' }}>Explore News by Products</h2>
            <style>{`
              .topic-bar { position: relative; }
              .topic-bar .fill {
                height: 100%;
                background: var(--brand);
                width: calc(var(--fill, 0) * 100%);
                transition: width 240ms ease;
              }
              .topic-bar:hover .fill,
              .topic-bar:focus-visible .fill {
                width: calc((var(--fill, 0) + 0.05) * 100%);
              }
            `}</style>
            <div className="topic-bars" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { to: '/newsletters?chapter=AURIX', label: 'AURIX™', fraction: 0.15 },
                { to: '/newsletters?chapter=TRAVEO', label: 'TRAVEO™', fraction: 0.35 },
                { to: '/newsletters?chapter=PSOC', label: 'PSOC™ Automotive', fraction: 0.55 },
              ].map((t, idx) => (
                <Link
                  key={idx}
                  to={t.to}
                  className="topic-bar"
                  style={{
                    display: 'flex',
                    alignItems: 'stretch',
                    width: '100%',
                    height: 56,
                    borderRadius: 8,
                    overflow: 'hidden',
                    border: '1px solid var(--border-color, #e0e0e0)',
                    textDecoration: 'none',
                    color: 'inherit',
                    background: '#fff',
                    ['--fill' as any]: t.fraction,
                  } as React.CSSProperties}
                  aria-label={`Go to ${t.label} news`}
                >
                  <div className="fill" />
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      padding: '0 16px',
                      fontWeight: 700,
                      color: 'var(--brand)',
                    }}
                  >
                    {t.label}
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section className="useful-links">
            <h2 style={{ color: 'var(--brand)' }}>Useful links</h2>
            <style>{`
              .useful-links a { text-decoration: none; color: var(--brand); }
              .useful-links a:hover, .useful-links a:focus-visible { text-decoration: underline; }
            `}</style>
            <div
              className="useful-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 16,
              }}
            >
              <div className="column products">
                <h3 style={{ marginTop: 0 }}>Products</h3>
                <div
                  className="link-box"
                  style={{
                    background: '#fff',
                    border: '1px solid var(--border-color, #e0e0e0)',
                    borderRadius: 0,
                    padding: 16,
                  }}
                >
                  <ul style={{ margin: 0 }}>
                    <li>
                      <a href="https://www.infineon.com/products/microcontroller/32-bit-tricore" target="_blank" rel="noopener noreferrer">
                        AURIX™ TriCore™ Microcontroller
                      </a>
                    </li>
                    <li>
                      <a href="https://www.infineon.com/products/microcontroller/32-bit-psoc-arm-cortex/automotive-psoc-4-mcu" target="_blank" rel="noopener noreferrer">
                        PSOC™ 4 Automotive Arm® Cortex®-M0/M0+
                      </a>
                    </li>
                    <li>
                      <a href="https://www.infineon.com/products/microcontroller/32-bit-psoc-arm-cortex/psoc-4-hv-m0" target="_blank" rel="noopener noreferrer">
                        PSOC™ 4 HV Arm® Cortex®-M0+
                      </a>
                    </li>
                    <li>
                      <a href="https://www.infineon.com/products/microcontroller/32-bit-psoc-arm-cortex/fingerprint-m0-plus" target="_blank" rel="noopener noreferrer">
                        PSOC™ Fingerprint Arm® Cortex®-M0+
                      </a>
                    </li>
                    <li>
                      <a href="https://www.infineon.com/products/microcontroller/32-bit-psoc-arm-cortex/automotive-multitouch-m0" target="_blank" rel="noopener noreferrer">
                        PSOC™ Automotive Multitouch Arm® Cortex®-M0
                      </a>
                    </li>
                    <li>
                      <a href="https://www.infineon.com/products/microcontroller/32-bit-traveo-t2g-arm-cortex/for-body" target="_blank" rel="noopener noreferrer">
                        TRAVEO™ T2G Arm® Cortex® for Body
                      </a>
                    </li>
                    <li>
                      <a href="https://www.infineon.com/products/microcontroller/32-bit-traveo-t2g-arm-cortex/for-cluster" target="_blank" rel="noopener noreferrer">
                        TRAVEO™ T2G Arm® Cortex® for Cluster
                      </a>
                    </li>
                  </ul>
                </div>
              </div>
              <div className="column myicp" style={{ display: 'grid', gap: 16 }}>
                <div>
                  <h3 style={{ marginTop: 0 }}>myICP</h3>
                  <div
                    className="link-box"
                    style={{
                      background: '#fff',
                      border: '1px solid var(--border-color, #e0e0e0)',
                      borderRadius: 0,
                      padding: 16,
                    }}
                  >
                    <ul style={{ margin: 0 }}>
                      <li>
                        <a href="https://myicp.infineon.com/sites/microcontrollers-aurix_customer_doc/SitePages/default.aspx" target="_blank" rel="noopener noreferrer">
                          TriCore™ Microcontroller
                        </a>
                      </li>
                      <li>
                        <a href="https://myicp.infineon.com/sites/TRAVEODocumentation/SitePages/default.aspx" target="_blank" rel="noopener noreferrer">
                          TRAVEO™ Microcontroller
                        </a>
                      </li>
                      <li>
                        <a href="https://myicp.infineon.com/sites/PSoCDocumentation/SitePages/default.aspx" target="_blank" rel="noopener noreferrer">
                          PSOC™ Microcontroller
                        </a>
                      </li>
                    </ul>
                  </div>
                </div>
                <div className="link-box"
                  style={{
                    background: '#fff',
                    border: '1px solid var(--border-color, #e0e0e0)',
                    borderRadius: 0,
                    padding: 16,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 80,
                  }}
                >
                  TBD
                </div>
              </div>
            </div>
          </section>
        </div>
        <aside>
          <section className="social-widget" style={{ marginTop: 60 }}>
            <h4 style={{ margin: '0 0 2px', color: 'var(--brand)' }}>ATV social feed</h4>
            {/* Cropped iframe view focusing on the posts column */}
            <div
              style={{
                position: 'relative',
                width: 360,
                height: 600,
                border: '0px solid var(--border-color, #e0e0e0)',
                borderRadius: 8,
                overflow: 'hidden',
                background: '#fff',
              }}
            >
              <iframe
                src="https://intranet.infineon.com/tagOverview/?tag=ATV"
                title="ATV MC social media feed"
                style={{
                  position: 'absolute',
                  top: -200,
                  left: -10,
                  width: 400,
                  height: 1920,
                  border: 0,
                  transform: 'scale(1)',
                  transformOrigin: 'top left',
                }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </section>
          <section className="events-widget" style={{ marginTop: 24 }}>
          <h4 style={{ margin: '0 0 2px',color: 'var(--brand)' }}>Events</h4>
            {/* Cropped iframe view for events */}
            <div
              style={{
                position: 'relative',
                width: 370,
                height: 530,
                border: '0px solid var(--border-color, #e0e0e0)',
                borderRadius: 8,
                overflow: 'hidden',
                background: '#fff',
                
              }}
            >
              <iframe
                src="https://intranet.infineon.com/"
                title="ATV MC events"
                style={{
                  position: 'absolute',
                  top: -890,
                  left: -650,
                  width: 1024,
                  height: 2400,
                  border: 0,
                  transform: 'scale(1)',
                  transformOrigin: 'top left',
                }}
                scrolling="no"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </section>
        </aside>
        </div>
      </div>

    </div>
  )
}



