import type { NewsletterDraft } from '../../types/newsletter-creation'
import { generateNewsletterBodyHtml } from '../../utils/generateNewsletterHtml'

interface NewsletterPreviewProps {
  draft: NewsletterDraft
}

export default function NewsletterPreview({ draft }: NewsletterPreviewProps) {
  const bodyHtml = generateNewsletterBodyHtml(draft)

  return (
    <div className="newsletter-preview">
      <div className="preview-header">
        <h2 style={{ color: 'var(--brand)', marginBottom: 8 }}>Preview</h2>
        <p className="meta" style={{ marginTop: 0 }}>
          This is how your newsletter will appear when published
        </p>
      </div>

      <div className="preview-content">
        <div
          className="embedded-newsletter"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      </div>
    </div>
  )
}

