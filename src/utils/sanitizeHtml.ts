import DOMPurify from 'dompurify'

/**
 * Sanitize rich-text HTML (e.g. from the article editor) before storing or
 * rendering it. Strips scripts, inline event handlers and other XSS vectors
 * while keeping the formatting tags the editor produces.
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
}
