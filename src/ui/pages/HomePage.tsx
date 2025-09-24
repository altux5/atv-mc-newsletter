import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { newsletters } from '../../data/newsletters'
import { extractAndSanitizeBodyHtml, findHtmlByMonthYearAsync, loadHtmlByPathAsync } from '../../utils/newsletterHtml'
import newsletterImage from '../../photos/newsletter image.png'
import headerImage from '../../photos/header.png'

export default function HomePage() {
  const latest = newsletters[0]
  const [latestParagraphs, setLatestParagraphs] = useState<string[]>([])
  

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
        }}
      >
        <img
          src={headerImage}
          alt="Header"
          style={{ display: 'block', width: '100%', height: 'auto' }}
        />
      </section>
      <section className="hero" style={{ borderTop: 'none' }}>
        <h1 style={{ textAlign: 'center', width: '100%', color: 'var(--brand)' }}>
          Welcome to the ATV MC Digital Newsletter 
        
        </h1>
        <p style={{ textAlign: 'center', width: '100%', maxWidth: 'none', fontSize: '18px'  }}>
        <br />This secure, internal portal is your single source of truth for the full Automotive Microcontroller portfolio. <br /> Each month we update six focused sections, no scrolling through threads, no hunting for links.
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
        <p style={{ textAlign: 'center', width: '100%', maxWidth: 'none', fontSize: '18px' }}>
          <br/>
          <br />
        Bookmark the link, enable notifications, and check back on the first working day of every month.
<br />Thank you for keeping the information strictly internal—let’s turn these updates into design-ins.

        </p>
      </section>

      

      {latest && (
        <section className="latest-newsletter">
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

      <section className="social-widget">
        <h2 style={{ color: 'var(--brand)' }}>ATV MC social feed</h2>
        {/* Cropped iframe view focusing on the posts column */}
        <div
          style={{
            position: 'relative',
            width: 1100,
            height: 720,
            border: '0px solid var(--border-color, #e0e0e0)',
            borderRadius: 8,
            overflow: 'hidden',
            background: '#fff',
          }}
        >
          <iframe
            src="https://intranet.infineon.com/profile/public/ifxinternalcomm?accountname=INFINEON%5Cifxinternalcomm"
            title="ATV MC social media feed"
            style={{
              position: 'absolute',
              top: -750,
              left: -550,
              width: 1600,
              height: 1600,
              border: 0,
              transform: 'scale(1)',
              transformOrigin: 'top left',
            }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
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
                    32-bit AURIX™ TriCore™ Microcontroller
                  </a>
                </li>
                <li>
                  <a href="https://www.infineon.com/products/microcontroller/32-bit-psoc-arm-cortex/automotive-psoc-4-mcu" target="_blank" rel="noopener noreferrer">
                    32-bit PSOC™ 4 Automotive Arm® Cortex®-M0/M0+
                  </a>
                </li>
                <li>
                  <a href="https://www.infineon.com/products/microcontroller/32-bit-psoc-arm-cortex/psoc-4-hv-m0" target="_blank" rel="noopener noreferrer">
                    32-bit PSOC™ 4 HV Arm® Cortex®-M0+
                  </a>
                </li>
                <li>
                  <a href="https://www.infineon.com/products/microcontroller/32-bit-psoc-arm-cortex/fingerprint-m0-plus" target="_blank" rel="noopener noreferrer">
                    32-bit PSOC™ Fingerprint Arm® Cortex®-M0+
                  </a>
                </li>
                <li>
                  <a href="https://www.infineon.com/products/microcontroller/32-bit-psoc-arm-cortex/automotive-multitouch-m0" target="_blank" rel="noopener noreferrer">
                    32-bit PSOC™ Automotive Multitouch Arm® Cortex®-M0
                  </a>
                </li>
                <li>
                  <a href="https://www.infineon.com/products/microcontroller/32-bit-traveo-t2g-arm-cortex/for-body" target="_blank" rel="noopener noreferrer">
                    32-bit TRAVEO™ T2G Arm® Cortex® for Body
                  </a>
                </li>
                <li>
                  <a href="https://www.infineon.com/products/microcontroller/32-bit-traveo-t2g-arm-cortex/for-cluster" target="_blank" rel="noopener noreferrer">
                    32-bit TRAVEO™ T2G Arm® Cortex® for Cluster
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
                      32-bit TriCore™ Microcontroller
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
  )
}



