import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { getNewsletters } from '../../data/newsletters'
import { extractAndSanitizeBodyHtml, extractMonthYearFromHtml, findHtmlByMonthYear, findHtmlByMonthYearAsync, loadHtmlByPathAsync, parseMonthYearFromPath } from '../../utils/newsletterHtml'
import { getDraftById, deleteDraft } from '../../utils/localNewsletters'
import { generateNewsletterBodyHtml } from '../../utils/generateNewsletterHtml'
import { useAuth } from '../../contexts/AuthContext'

export default function NewsletterDetailPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const [newsletters] = useState(() => getNewsletters())
  const newsletter = useMemo(() => newsletters.find((n) => n.slug === slug), [slug, newsletters])

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

  const handleDelete = () => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${newsletter.title}"? This action cannot be undone.`
    )
    if (confirmed) {
      deleteDraft(newsletter.id)
      // Dispatch event to refresh newsletter lists
      window.dispatchEvent(new Event('newsletterPublished'))
      alert('Newsletter deleted successfully!')
      navigate('/newsletters')
    }
  }

  const date = new Date(newsletter.date)
  
  // Check if this is a locally created newsletter (no sourcePath)
  const isLocalNewsletter = !newsletter.sourcePath
  const localDraft = isLocalNewsletter ? getDraftById(newsletter.id) : null
  
  const eagerMatch = !isLocalNewsletter ? findHtmlByMonthYear(date.getUTCMonth(), date.getUTCFullYear()) : null
  const [htmlString, setHtmlString] = useState<string | null>(
    localDraft ? generateNewsletterBodyHtml(localDraft) : (eagerMatch?.html ?? null)
  )
  const [sourcePath, setSourcePath] = useState<string | null>(eagerMatch?.path ?? null)

  useEffect(() => {
    if (isLocalNewsletter && localDraft) {
      setHtmlString(generateNewsletterBodyHtml(localDraft))
      return
    }
    
    let cancelled = false
    ;(async () => {
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
  }, [newsletter.slug, isLocalNewsletter])

  // Prepare sanitized inline HTML for native rendering
  const [sanitizedHtml, setSanitizedHtml] = useState<string | null>(null)
  const [derivedTitle, setDerivedTitle] = useState<string | null>(null)
  useEffect(() => {
    if (!htmlString) {
      setSanitizedHtml(null)
      setDerivedTitle(null)
      return
    }
    
    // For local newsletters, HTML is already safe
    if (isLocalNewsletter) {
      setSanitizedHtml(htmlString)
      setDerivedTitle(newsletter.title)
      return
    }
    
    setSanitizedHtml(extractAndSanitizeBodyHtml(htmlString))
    // Derive Month Year from HTML or path to show consistent title
    const parsedFromPath = (sourcePath && parseMonthYearFromPath(sourcePath)) || null
    const parsedFromHtml = extractMonthYearFromHtml(htmlString)
    const parsed = parsedFromPath || parsedFromHtml
    if (parsed) {
      const monthName = new Date(Date.UTC(parsed.year, parsed.monthIndex, 1)).toLocaleString(undefined, { month: 'long', timeZone: 'UTC' })
      setDerivedTitle(`ATV MC Newsletter - ${monthName} ${parsed.year} edition`)
    } else {
      setDerivedTitle(null)
    }
  }, [htmlString, isLocalNewsletter])

  return (
    <article className="newsletter-detail">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Link to="/newsletters" className="back-link">
          ← Back to list
        </Link>
        {isLocalNewsletter && isAuthenticated && (
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to={`/newsletters/edit/${newsletter.id}`} className="button" style={{ textDecoration: 'none' }}>
              ✏️ Edit
            </Link>
            <button onClick={handleDelete} className="button" style={{ color: '#dc2626', borderColor: '#fecaca' }}>
              🗑️ Delete
            </button>
          </div>
        )}
      </div>
      <h1>{derivedTitle || newsletter.title}</h1>
      <p className="meta">{new Date(newsletter.date).toLocaleDateString()}</p>
      {htmlString && sanitizedHtml ? (
        <div className="embedded-newsletter" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
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


