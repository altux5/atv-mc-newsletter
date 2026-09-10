import type {
  NewsletterDraft,
  NewsletterChapter,
  NewsletterArticle,
} from '../types/newsletter-creation'
import { computeAutoTitle, DEFAULT_SUBTITLE, DEFAULT_FOOTER_HTML } from './localNewsletters'
import { bakeCrop } from './imageCrop'
// Imported as data URLs (?inline) so the mail server embeds them as CID
// attachments and they display in every email client (no remote-image loading,
// no SVG). PNG/JPG only — email clients do not render SVG.
import defaultHeaderImage from '../photos/newsletter image.png?inline'
import logoDataUrl from '../logo/infineon_logo_color.png?inline'

// Email-specific renderer.
//
// The website version (generateNewsletterBodyHtml) uses flexbox, CSS
// background-image crops and an SVG logo — none of which render in email clients
// (Outlook/Gmail). This renderer produces a short, branded teaser using only
// email-safe primitives: table layouts, inline styles and real <img> tags. Image
// `src`s stay as-is (data URLs / absolute URLs); the server embeds data URLs as
// CID attachments so they display everywhere.

const BRAND_GREEN = '#0A8276' // chapter headings + nav bar (matches app --brand)
const TITLE_GREEN = '#007D6F' // masthead title + tagline (matches website)
const FONT = "Arial, 'Segoe UI', Tahoma, sans-serif"
const THUMBNAIL_CROP = { ratioW: 1, ratioH: 1, maxW: 248, maxH: 248 }

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Resolve a chapter to its articles, migrating legacy single-content chapters. */
function chapterArticles(chapter: NewsletterChapter): NewsletterArticle[] {
  if (Array.isArray(chapter.articles) && chapter.articles.length > 0) {
    return chapter.articles
  }
  if ((chapter.content ?? '').trim()) {
    return [
      {
        id: `${chapter.id}_legacy`,
        title: '',
        content: chapter.content as string,
        template: (chapter.template as 'portrait' | 'landscape') ?? 'portrait',
        image: chapter.chapterImage || undefined,
        contact: chapter.chapterContact ?? '',
      },
    ]
  }
  return []
}

function renderImage(src: string, width: number | 'full'): string {
  if (!src) return ''
  if (width === 'full') {
    return `<img src="${escapeHtml(src)}" width="648" style="width:100%;max-width:100%;height:auto;display:block;border:0;border-radius:2px;" alt="" />`
  }
  return `<img src="${escapeHtml(src)}" width="${width}" style="display:block;width:${width}px;max-width:${width}px;height:auto;border:0;border-radius:2px;" alt="" />`
}

function plainText(html: string): string {
  const document = new DOMParser().parseFromString(html || '', 'text/html')
  document.querySelectorAll('script, style, iframe, object, embed, noscript, template').forEach((element) => element.remove())
  document.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6, br, tr, td').forEach((element) => element.append(' '))
  return (document.body.textContent || '').replace(/\s+/g, ' ').trim()
}

function excerpt(text: string, limit: number): string {
  if (text.length <= limit) return text
  const shortened = text.slice(0, limit - 3)
  const boundary = shortened.lastIndexOf(' ')
  return `${(boundary > 0 ? shortened.slice(0, boundary) : shortened).trimEnd()}...`
}

function selectHighlights(draft: NewsletterDraft) {
  return draft.chapters.flatMap((chapter) => chapterArticles(chapter).map((article) => ({
    chapter,
    article,
    text: plainText(article.content),
  }))).filter(({ article, text }) => text || article.image).slice(0, 2)
}

function renderHighlight({ chapter, article, text }: ReturnType<typeof selectHighlights>[number]): string {
  return `<tr><td style="padding:20px 0;border-bottom:1px solid #e5e7eb;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;">
      <tr>
        ${article.image ? `<td class="email-preview-image" width="144" valign="top" style="width:144px;padding:0 20px 0 0;">${renderImage(article.image, 124)}</td>` : ''}
        <td valign="top" style="vertical-align:top;">
          ${chapter.title?.trim() && article.title?.trim() ? `<p style="margin:0 0 6px;font-size:12px;line-height:1.4;font-weight:bold;color:${BRAND_GREEN};">${escapeHtml(chapter.title.trim())}</p>` : ''}
          <h3 style="margin:0 0 8px;font-size:18px;line-height:1.35;color:#222222;font-family:${FONT};">${escapeHtml(article.title?.trim() || chapter.title?.trim() || 'From this edition')}</h3>
          ${text ? `<p class="email-excerpt" style="margin:0;font-size:14px;line-height:1.65;color:#374151;font-family:${FONT};">${escapeHtml(excerpt(text, 260))}</p>` : ''}
          ${article.contact?.trim() ? `<p class="email-contact" style="margin:12px 0 0;font-size:13px;line-height:1.5;color:#555555;font-family:${FONT};"><strong>Contact:</strong> ${escapeHtml(article.contact.trim())}</p>` : ''}
        </td>
      </tr>
    </table>
  </td></tr>`
}

/**
 * Bake the selected images into square thumbnails, keeping their focal points. Must be awaited
 * before {@link generateNewsletterEmailHtml}: the website crops with CSS
 * background-size/position, which no email client reproduces.
 */
export async function prepareDraftForEmail(draft: NewsletterDraft): Promise<NewsletterDraft> {
  const selected = new Set(selectHighlights(draft).map(({ article }) => article.id))
  const chapters = await Promise.all(
    draft.chapters.map(async (chapter) => {
      const articles = await Promise.all(
        chapterArticles(chapter).map(async (article) => {
          if (!article.image || !selected.has(article.id)) return article
          const image = await bakeCrop(
            article.image,
            THUMBNAIL_CROP,
            article.imageAspect,
            article.imageZoom,
            article.imagePosX,
            article.imagePosY,
          )
          // Crop is now in the pixels, so drop the pan/zoom hints.
          return {
            ...article,
            image,
            imageAspect: undefined,
            imageZoom: undefined,
            imagePosX: undefined,
            imagePosY: undefined,
          }
        }),
      )
      return { ...chapter, articles }
    }),
  )
  return { ...draft, chapters }
}

/**
 * Render at most two short article previews and their contacts as email-safe HTML.
 * Intended to be sent to the mail server, which embeds any data-URL images as
 * CID attachments before delivery.
 */
export function generateNewsletterEmailHtml(draft: NewsletterDraft): string {
  const title = draft.title?.trim() || computeAutoTitle(draft.month, draft.year)
  const subtitle = (draft.subtitle ?? DEFAULT_SUBTITLE).trim()
  const headerImg = draft.headerImage || defaultHeaderImage
  const footer = (draft.footerContent ?? DEFAULT_FOOTER_HTML).trim()

  const highlights = selectHighlights(draft).map(renderHighlight).join('')
  const intro = excerpt(plainText(draft.introContent), 180)

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;font-family:${FONT};color:#333333;">
  <tr>
    <td style="padding:0 0 18px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td class="email-masthead" valign="top" style="vertical-align:top;">
            <h2 style="font-size:24px;font-weight:bold;color:${TITLE_GREEN};margin:0;line-height:1.25;font-family:${FONT};">${escapeHtml(
              title,
            )}</h2>
            ${
              subtitle
                ? `<p style="font-size:12pt;font-weight:bold;color:${TITLE_GREEN};margin:8px 0 0;font-family:${FONT};">${escapeHtml(
                    subtitle,
                  )}</p>`
                : ''
            }
          </td>
          <td class="email-masthead" valign="top" align="right" width="136" style="vertical-align:top;padding-left:16px;">
            <img class="email-logo" src="${logoDataUrl}" width="120" alt="Infineon" style="width:120px;max-width:120px;height:auto;display:block;border:0;" />
          </td>
        </tr>
      </table>
    </td>
  </tr>
  ${headerImg ? `<tr><td style="padding:0 0 20px;">${renderImage(headerImg, 'full')}</td></tr>` : ''}
  ${
    intro
      ? `<tr><td style="font-size:14px;line-height:1.6;padding:0 0 20px;font-family:${FONT};">${escapeHtml(intro)}</td></tr>`
      : ''
  }
  ${highlights ? `<tr><td class="email-preview-section" style="padding:8px 0 24px;">
    <h2 style="margin:0;font-size:22px;line-height:1.3;color:${TITLE_GREEN};font-family:${FONT};">Preview of this edition</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${highlights}</table>
  </td></tr>` : ''}
  <tr><td><!-- newsletter-online-cta --></td></tr>
  ${
    footer
      ? `<tr><td class="email-footer" style="padding:24px 0 0;text-align:center;font-size:10.5pt;line-height:1.6;color:#333333;font-family:${FONT};">${footer}</td></tr>`
      : ''
  }
</table>`.trim()
}
