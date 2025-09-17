import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { newsletters } from '../../data/newsletters'
import { extractAndSanitizeBodyHtml, extractMonthYearFromHtml, findHtmlByMonthYear, findHtmlByMonthYearAsync, loadHtmlByPathAsync, parseMonthYearFromPath } from '../../utils/newsletterHtml'

export default function NewsletterDetailPage() {
  const { slug } = useParams()
  const newsletter = useMemo(() => newsletters.find((n) => n.slug === slug), [slug])

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

  const date = new Date(newsletter.date)
  const eagerMatch = findHtmlByMonthYear(date.getUTCMonth(), date.getUTCFullYear())
  const [htmlString, setHtmlString] = useState<string | null>(eagerMatch?.html ?? null)
  const [sourcePath, setSourcePath] = useState<string | null>(eagerMatch?.path ?? null)

  useEffect(() => {
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
  }, [newsletter.slug])

  // Prepare sanitized inline HTML for native rendering
  const [sanitizedHtml, setSanitizedHtml] = useState<string | null>(null)
  const [derivedTitle, setDerivedTitle] = useState<string | null>(null)
  useEffect(() => {
    if (!htmlString) {
      setSanitizedHtml(null)
      setDerivedTitle(null)
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
  }, [htmlString])

  return (
    <article className="newsletter-detail">
      <Link to="/newsletters" className="back-link">
        ← Back to list
      </Link>
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


