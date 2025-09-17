import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { newsletters } from '../../data/newsletters'
import { extractAndSanitizeBodyHtml, findHtmlByMonthYearAsync, loadHtmlByPathAsync } from '../../utils/newsletterHtml'
import photo1 from '../../photos/lowres-Advanced Security.jpg.png'
import photo2 from '../../photos/lowres-AI-Keyvisual_RGB-1080x1080.jpg.png'
import photo3 from '../../photos/lowres-Car_curving_road.jpg.png'
import photo4 from '../../photos/lowres-Man looks at the Quantum Chip.jpg.png'
import photo5 from '../../photos/lowres-Sky_world_water_day.jpg.png'
import photo6 from '../../photos/lowres-Wind turbines and solar panels.jpg.png'
import mcIcon from '../../logo/MC-ICON.png'
import newsletterImage from '../../photos/newsletter image.png'

export default function HomePage() {
  const latest = newsletters[0]
  const [latestParagraphs, setLatestParagraphs] = useState<string[]>([])
  const slides = [
    { src: photo1, alt: 'Advanced Security', caption: 'Advanced Security' },
    { src: photo2, alt: 'AI', caption: 'AI' },
    { src: photo3, alt: 'Car on curving road', caption: 'Automotive' },
    { src: photo4, alt: 'Quantum chip', caption: 'Semiconductors' },
    { src: photo5, alt: 'World Water Day', caption: 'Sustainability' },
    { src: photo6, alt: 'Wind turbines and solar panels', caption: 'Renewables' },
  ]
  const [slideIndex, setSlideIndex] = useState(0)

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
  const go = (direction: 'prev' | 'next') => {
    setSlideIndex((i) => {
      const len = slides.length
      return direction === 'next' ? (i + 1) % len : (i - 1 + len) % len
    })
  }
  return (
    <div className="home">
      <section className="hero">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src={mcIcon} alt="MC Icon" style={{ height: 36, width: 36 }} />
          Curate. Discover. Learn.
        </h1>
        <p>
          Newsletter Hub is your centralized place to explore current and archived newsletters.
          Clean, fast, and organized for deep dives.
        </p>
      </section>

      {latest && (
        <section className="latest-newsletter">
          <div className="latest-grid">
            <div className="left">
              <div className="media">
                <img src={newsletterImage} alt="Newsletter picture" />
              </div>
              <div>
                <h3>Latest newsletter</h3>
                <p style={{ margin: 0 }}>{new Date(latest.date).toLocaleDateString()}</p>
                <Link to={`/newsletters/${latest.slug}`} style={{ display: 'inline-block', marginTop: 8 }}>
                  <strong>{latest.title}</strong>
                </Link>
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
        <h2>Explore topics</h2>
        <div className="insight-grid">
          <article className="topic-card">
            <img src={photo3} alt="AURIX" />
            <div className="body">
              <h3>AURIX™</h3>
              <p>Microcontrollers and safety for automotive architectures.</p>
              <Link to="/newsletters?chapter=AURIX" className="cta">Go to Aurix news →</Link>
            </div>
          </article>
          <article className="topic-card">
            <img src={photo2} alt="TRAVEO" />
            <div className="body">
              <h3>TRAVEO™</h3>
              <p>Body control, cluster, and lighting solutions.</p>
              <Link to="/newsletters?chapter=TRAVEO" className="cta">Go to Traveo news →</Link>
            </div>
          </article>
          <article className="topic-card">
            <img src={photo1} alt="PSOC Automotive" />
            <div className="body">
              <h3>PSOC™ Automotive</h3>
              <p>Configurable MCUs enabling rapid feature delivery.</p>
              <Link to="/newsletters?chapter=PSOC" className="cta">Go to PSOC news →</Link>
            </div>
          </article>
        </div>
      </section>

      <section className="social-widget">
        <h2>ATV MC social feed</h2>
        {/* Cropped iframe view focusing on the posts column */}
        <div
          style={{
            position: 'relative',
            width: 730,
            height: 720,
            border: '1px solid var(--border-color, #e0e0e0)',
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
              left: -730,
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

      <section className="mission">
        <h2>Gallery</h2>
        <div className="carousel">
          <div className="carousel-track" style={{ transform: `translateX(-${slideIndex * 100}%)` }}>
            {slides.map((s, idx) => (
              <figure key={idx} className="carousel-item photo-card">
                <img src={s.src} alt={s.alt} />
                <figcaption className="caption">{s.caption}</figcaption>
              </figure>
            ))}
          </div>
          <button className="carousel-btn prev" onClick={() => go('prev')} aria-label="Previous">‹</button>
          <button className="carousel-btn next" onClick={() => go('next')} aria-label="Next">›</button>
        </div>
      </section>
    </div>
  )
}



