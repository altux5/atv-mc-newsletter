import type { NewsletterDraft } from '../../types/newsletter-creation'
import { generateNewsletterBodyHtml } from '../../utils/generateNewsletterHtml'

interface NewsletterPreviewProps {
  draft: NewsletterDraft
}

export default function NewsletterPreview({ draft }: NewsletterPreviewProps) {
  const bodyHtml = generateNewsletterBodyHtml(draft)
  
  const monthName = new Date(Date.UTC(draft.year, draft.month, 1)).toLocaleString(undefined, {
    month: 'long',
    timeZone: 'UTC',
  })
  
  const title = draft.title || `ATV MC Newsletter - ${monthName} ${draft.year} edition`
  
  return (
    <div className="newsletter-preview">
      <div className="preview-header">
        <h2 style={{ color: 'var(--brand)', marginBottom: 8 }}>Preview</h2>
        <p className="meta" style={{ marginTop: 0 }}>
          This is how your newsletter will appear when published
        </p>
      </div>
      
      <div className="preview-content">
        <div style={{ textAlign: 'center', padding: '20px 0', borderBottom: '2px solid var(--brand)' }}>
          <h1 style={{ color: 'var(--brand)', margin: 0, fontSize: '24px' }}>
            {title}
          </h1>
          <p style={{ color: '#666', margin: '8px 0 0 0' }}>
            {monthName} {draft.year}
          </p>
        </div>
        
        <div 
          className="embedded-newsletter"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      </div>
    </div>
  )
}

