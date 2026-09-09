import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { getNewslettersAsync, type Newsletter } from '../../data/newsletters'
import { extractAndSanitizeBodyHtml, extractMonthYearFromHtml, findHtmlByMonthYearAsync, loadHtmlByPathAsync, parseMonthYearFromPath } from '../../utils/newsletterHtml'
import { getPublishedBodyApi, deleteNewsletterApi } from '../../utils/newslettersApi'
import type { NewsletterDraft } from '../../types/newsletter-creation'
import { generateNewsletterBodyHtml } from '../../utils/generateNewsletterHtml'
import { useAuth } from '../../contexts/AuthContext'
import Icon from '../components/Icon'
import editIcon from '../../icons/edit.svg'
import deleteIcon from '../../icons/delete-16.svg'

export default function NewsletterDetailPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const [newsletters, setNewsletters] = useState<Newsletter[] | null>(null)
  const newsletter = useMemo(
    () => (newsletters ? newsletters.find((n) => n.slug === slug) : undefined),
    [slug, newsletters],
  )

  const isLocalNewsletter = !!newsletter && !newsletter.sourcePath

  const [htmlString, setHtmlString] = useState<string | null>(null)
  const [sourcePath, setSourcePath] = useState<string | null>(null)
  const [sanitizedHtml, setSanitizedHtml] = useState<string | null>(null)
  const [derivedTitle, setDerivedTitle] = useState<string | null>(null)

  // Load the merged newsletter list (.htm archive + DB) to resolve this slug.
  useEffect(() => {
    let cancelled = false
    void getNewslettersAsync().then((list) => {
      if (!cancelled) setNewsletters(list)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Load the body HTML for the resolved newsletter.
  useEffect(() => {
    if (!newsletter) {
      setHtmlString(null)
      return
    }
    const date = new Date(newsletter.date)
    let cancelled = false
    ;(async () => {
      // Custom (DB) newsletter: fetch the draft and render its body HTML.
      if (!newsletter.sourcePath) {
        const draft: NewsletterDraft | null = await getPublishedBodyApi(newsletter.id)
        if (cancelled) return
        setHtmlString(draft ? generateNewsletterBodyHtml(draft) : null)
        return
      }

      // .htm archive newsletter: load by path, or fall back to month/year match.
      const asyncMatch = newsletter.sourcePath
        ? await loadHtmlByPathAsync(newsletter.sourcePath)
        : await findHtmlByMonthYearAsync(date.getUTCMonth(), date.getUTCFullYear())
      if (cancelled) return
      if (asyncMatch) {
        setHtmlString(asyncMatch.html)
        setSourcePath(asyncMatch.path)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [newsletter])

  // Prepare sanitized inline HTML for native rendering.
  useEffect(() => {
    if (!newsletter || !htmlString) {
      setSanitizedHtml(null)
      setDerivedTitle(null)
      return
    }

    // For custom (DB) newsletters, the generated HTML is already safe.
    if (!newsletter.sourcePath) {
      setSanitizedHtml(htmlString)
      setDerivedTitle(newsletter.title)
      return
    }

    setSanitizedHtml(extractAndSanitizeBodyHtml(htmlString))
    // Derive Month Year from HTML or path to show a consistent title.
    const parsedFromPath = (sourcePath && parseMonthYearFromPath(sourcePath)) || null
    const parsedFromHtml = extractMonthYearFromHtml(htmlString)
    const parsed = parsedFromPath || parsedFromHtml
    if (parsed) {
      const monthName = new Date(Date.UTC(parsed.year, parsed.monthIndex, 1)).toLocaleString(undefined, { month: 'long', timeZone: 'UTC' })
      setDerivedTitle(`ATV MC Newsletter - ${monthName} ${parsed.year} edition`)
    } else {
      setDerivedTitle(null)
    }
  }, [htmlString, newsletter, sourcePath])

  const handleDelete = () => {
    if (!newsletter) return
    const confirmed = window.confirm(
      `Are you sure you want to delete "${newsletter.title}"? This action cannot be undone.`
    )
    if (confirmed) {
      void deleteNewsletterApi(newsletter.id)
        .then(() => {
          // Dispatch event to refresh newsletter lists
          window.dispatchEvent(new Event('newsletterPublished'))
          alert('Newsletter deleted successfully!')
          navigate('/newsletters')
        })
        .catch((error) => {
          console.error('Failed to delete newsletter:', error)
          alert('Failed to delete newsletter. Please try again.')
        })
    }
  }

  if (newsletters === null) {
    return (
      <div>
        <p className="meta">Loading newsletter…</p>
      </div>
    )
  }

  if (!newsletter) {
    return (
      <div>
        <p>Newsletter not found.</p>
        <Link to="/newsletters" className="button">
          Back to list
        </Link>
      </div>
    )
  }

  return (
    <article className="newsletter-detail">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Link to="/newsletters" className="back-link">
          ← Back to list
        </Link>
        {isLocalNewsletter && isAuthenticated && (
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to={`/newsletters/edit/${newsletter.id}`} className="button" style={{ textDecoration: 'none' }}>
              <Icon src={editIcon} /> Edit
            </Link>
            <button onClick={handleDelete} className="button" style={{ color: '#dc2626', borderColor: '#fecaca' }}>
              <Icon src={deleteIcon} /> Delete
            </button>
          </div>
        )}
      </div>
      {!isLocalNewsletter && (
        <>
          <h1>{derivedTitle || newsletter.title}</h1>
          <p className="meta">{new Date(newsletter.date).toLocaleDateString()}</p>
        </>
      )}
      {htmlString && sanitizedHtml ? (
        isLocalNewsletter ? (
          <div className="nl-published-frame">
            <div className="embedded-newsletter" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
          </div>
        ) : (
          <div className="embedded-newsletter" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
        )
      ) : (
        <div className="content">
          {newsletter.content.map((block, idx) => {
            if (block.type === 'h2') return <h2 key={idx}>{block.text}</h2>
            return <p key={idx}>{block.text}</p>
          })}
        </div>
      )}
    </article>
  )
}


