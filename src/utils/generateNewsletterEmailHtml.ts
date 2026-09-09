import type {
  NewsletterDraft,
  NewsletterChapter,
  NewsletterArticle,
} from '../types/newsletter-creation'
import { computeAutoTitle, DEFAULT_SUBTITLE, DEFAULT_FOOTER_HTML } from './localNewsletters'
import { normalizeButtonUrl } from './generateNewsletterHtml'
import { ARTICLE_CROP, bakeCrop } from './imageCrop'
// Imported as data URLs (?inline) so the mail server embeds them as CID
// attachments and they display in every email client (no remote-image loading,
// no SVG). PNG/JPG only — email clients do not render SVG.
import defaultHeaderImage from '../photos/newsletter image.png?inline'
import logoDataUrl from '../logo/infineon_logo_color.png?inline'

// Email-specific renderer.
//
// The website version (generateNewsletterBodyHtml) uses flexbox, CSS
// background-image crops and an SVG logo — none of which render in email clients
// (Outlook/Gmail). This renderer produces the SAME visual design using only
// email-safe primitives: table layouts, inline styles and real <img> tags. Image
// `src`s stay as-is (data URLs / absolute URLs); the server embeds data URLs as
// CID attachments so they display everywhere.

const BRAND_GREEN = '#0A8276' // chapter headings + nav bar (matches app --brand)
const TITLE_GREEN = '#007D6F' // masthead title + tagline (matches website)
const FONT = "Arial, 'Segoe UI', Tahoma, sans-serif"

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
    return `<img src="${src}" width="100%" style="width:100%;max-width:100%;height:auto;display:block;border:0;border-radius:2px;" alt="" />`
  }
  return `<img src="${src}" width="${width}" style="display:block;width:${width}px;max-width:${width}px;height:auto;border:0;border-radius:2px;" alt="" />`
}

function renderButton(article: NewsletterArticle): string {
  const b = article.button
  if (!b || !b.label.trim() || !b.url.trim()) return ''
  const url = escapeHtml(normalizeButtonUrl(b.url))
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 0;">
    <tr><td style="background:${BRAND_GREEN};border-radius:2px;">
      <a href="${url}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:9px 20px;font-family:${FONT};font-size:10.5pt;font-weight:bold;color:#ffffff;text-decoration:none;">${escapeHtml(
        b.label,
      )}</a>
    </td></tr>
  </table>`
}

function renderArticleBody(article: NewsletterArticle): string {
  const titleHtml = article.title
    ? `<p style="font-size:12pt;font-weight:bold;color:#222222;margin:0 0 8px;font-family:${FONT};">${escapeHtml(
        article.title,
      )}</p>`
    : ''
  const contactHtml = article.contact
    ? `<p style="margin:12px 0 0;font-style:italic;font-size:10pt;color:#555555;font-family:${FONT};"><strong>Contact:</strong> ${escapeHtml(
        article.contact,
      )}</p>`
    : ''
  return `${titleHtml}<div style="font-size:10.5pt;line-height:1.65;color:#333333;font-family:${FONT};">${
    article.content || ''
  }</div>${contactHtml}${renderButton(article)}`
}

function renderArticle(article: NewsletterArticle): string {
  const hasImage = Boolean(article.image)

  // Portrait: image beside the text (two-column table).
  if (hasImage && article.template === 'portrait') {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td width="260" valign="top" style="padding:0 20px 0 0;">${renderImage(article.image as string, 260)}</td>
        <td valign="top" style="vertical-align:top;">${renderArticleBody(article)}</td>
      </tr>
    </table>`
  }

  // Landscape: full-width image above the text.
  if (hasImage && article.template === 'landscape') {
    return `<div><div style="margin:0 0 14px;">${renderImage(
      article.image as string,
      'full',
    )}</div>${renderArticleBody(article)}</div>`
  }

  // No image.
  return `<div>${renderArticleBody(article)}</div>`
}

function renderChapter(chapter: NewsletterChapter): string {
  const articles = chapterArticles(chapter)
  const heading = chapter.title?.trim()
    ? `<h2 style="font-size:13.5pt;font-weight:bold;color:${BRAND_GREEN};margin:0 0 18px;padding:0 0 8px;border-bottom:1px solid #e5e7eb;font-family:${FONT};">${escapeHtml(
        chapter.title,
      )}</h2>`
    : ''
  const body = articles
    .map(renderArticle)
    .join(
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid #f0f2f4;font-size:0;line-height:0;height:24px;">&nbsp;</td></tr></table>',
    )
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:26px 0;">${heading}${body}</td></tr></table>`
}

/**
 * Bake each article image's pan/zoom crop into the pixels. Must be awaited
 * before {@link generateNewsletterEmailHtml}: the website crops with CSS
 * background-size/position, which no email client reproduces.
 */
export async function prepareDraftForEmail(draft: NewsletterDraft): Promise<NewsletterDraft> {
  const chapters = await Promise.all(
    draft.chapters.map(async (chapter) => {
      const articles = await Promise.all(
        chapterArticles(chapter).map(async (article) => {
          if (!article.image) return article
          const image = await bakeCrop(
            article.image,
            ARTICLE_CROP[article.template] ?? ARTICLE_CROP.portrait,
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
 * Render a newsletter draft as email-safe HTML that mirrors the website design.
 * Intended to be sent to the mail server, which embeds any data-URL images as
 * CID attachments before delivery.
 */
export function generateNewsletterEmailHtml(draft: NewsletterDraft): string {
  const title = draft.title?.trim() || computeAutoTitle(draft.month, draft.year)
  const subtitle = (draft.subtitle ?? DEFAULT_SUBTITLE).trim()
  const headerImg = draft.headerImage || defaultHeaderImage
  const footer = (draft.footerContent ?? DEFAULT_FOOTER_HTML).trim()

  const nav = draft.chapters
    .filter((c) => c.title?.trim())
    .map(
      (c) =>
        `<span style="color:#ffffff;font-size:11.5pt;font-weight:bold;font-family:${FONT};">${escapeHtml(
          c.title,
        )}</span>`,
    )
    .join('<span style="color:#ffffff;opacity:0.5;">&nbsp;&nbsp;|&nbsp;&nbsp;</span>')

  const chapters = draft.chapters.map(renderChapter).join('')

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;font-family:${FONT};color:#333333;">
  <tr>
    <td style="padding:0 0 18px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td valign="top" style="vertical-align:top;">
            <h1 style="font-size:21pt;font-weight:bold;color:${TITLE_GREEN};margin:0;line-height:1.2;font-family:${FONT};">${escapeHtml(
              title,
            )}</h1>
            ${
              subtitle
                ? `<p style="font-size:12pt;font-weight:bold;color:${TITLE_GREEN};margin:8px 0 0;font-family:${FONT};">${escapeHtml(
                    subtitle,
                  )}</p>`
                : ''
            }
          </td>
          <td valign="top" align="right" width="170" style="vertical-align:top;padding-left:16px;">
            <img src="${logoDataUrl}" width="150" alt="Infineon" style="width:150px;max-width:150px;height:auto;display:block;border:0;" />
          </td>
        </tr>
      </table>
    </td>
  </tr>
  ${headerImg ? `<tr><td style="padding:0 0 20px;">${renderImage(headerImg, 'full')}</td></tr>` : ''}
  ${
    draft.introContent
      ? `<tr><td style="font-size:10.5pt;line-height:1.6;padding:0 0 12px;font-family:${FONT};">${draft.introContent}</td></tr>`
      : ''
  }
  ${
    nav
      ? `<tr><td style="padding:0 0 8px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="background:${BRAND_GREEN};padding:18px 16px;">${nav}</td></tr></table></td></tr>`
      : ''
  }
  <tr><td>${chapters}</td></tr>
  ${
    footer
      ? `<tr><td style="padding:20px 0 0;border-top:1px solid #e5e7eb;text-align:center;font-size:10.5pt;line-height:1.6;color:#333333;font-family:${FONT};">${footer}</td></tr>`
      : ''
  }
</table>`.trim()
}
