import type {
  NewsletterDraft,
  NewsletterChapter,
  NewsletterArticle,
} from '../types/newsletter-creation'
import { computeAutoTitle, DEFAULT_SUBTITLE } from './localNewsletters'
import defaultHeaderImage from '../photos/newsletter image.png'
import logoUrl from '../logo/Agent-logo.svg'

/**
 * Generate HTML content for a newsletter draft that matches the format
 * of existing newsletters stored as .htm files
 */
export function generateNewsletterHtml(draft: NewsletterDraft): string {
  const monthName = new Date(Date.UTC(draft.year, draft.month, 1)).toLocaleString(undefined, {
    month: 'long',
    timeZone: 'UTC',
  })
  
  const newsletterTitle = draft.title || `ATV MC Newsletter - ${monthName} ${draft.year} edition`
  
  // Generate chapter navigation
  const chapterNav = draft.chapters
    .map((chapter, index) => {
      const chapterId = `chapter_${index}`
      return `
        <tr>
          <td style="padding: 8px 0;">
            <a href="#${chapterId}" style="color: #0A8276; text-decoration: none;">
              ${chapter.title || `Chapter ${index + 1}`}
            </a>
          </td>
        </tr>
      `
    })
    .join('')

  // Generate chapter content
  const chaptersHtml = draft.chapters
    .map((chapter, index) => {
      const chapterId = `chapter_${index}`
      const chapterTitle = chapter.title || `Chapter ${index + 1}`
      
      return `
        <tr>
          <td style="padding: 20px 0;">
            <a name="${chapterId}"></a>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td>
                  <strong>
                    <span style="font-size: 13.5pt; color: #0A8276;">
                      ${chapterTitle}
                    </span>
                  </strong>
                </td>
              </tr>
              <tr>
                <td style="padding-top: 12px;">
                  ${chapter.content}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `
    })
    .join('')

  // Main HTML structure matching existing newsletters
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${newsletterTitle}</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 0;
      background: #f5f5f5;
    }
    table {
      border-collapse: collapse;
    }
    a {
      color: #0A8276;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    img {
      max-width: 100%;
      height: auto;
      display: block;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      padding: 20px;
    }
  </style>
</head>
<body>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: whitesmoke;">
    <tr>
      <td align="center" style="padding: 20px;">
        <table width="100%" style="max-width: 800px; background: white;" cellpadding="20" cellspacing="0" border="0">
          <!-- Header -->
          <tr>
            <td style="text-align: center; padding: 20px;">
              <h1 style="color: #0A8276; margin: 0; font-size: 24px;">
                ${newsletterTitle}
              </h1>
              <p style="color: #666; margin: 8px 0 0 0;">
                ${monthName} ${draft.year}
              </p>
            </td>
          </tr>
          
          ${draft.headerImage ? `
          <!-- Header Image -->
          <tr>
            <td style="padding: 0 0 20px 0;">
              <img src="${draft.headerImage}" alt="Newsletter Header" style="width: 100%; height: auto;" />
            </td>
          </tr>
          ` : ''}
          
          ${draft.introContent ? `
          <!-- Intro Section -->
          <tr>
            <td style="padding: 20px 0;">
              ${draft.introContent}
            </td>
          </tr>
          ` : ''}
          
          <!-- Chapter Navigation -->
          <tr>
            <td style="padding: 30px 0 20px 0; border-top: 2px solid #0A8276;">
              <strong style="font-size: 14pt; color: #0A8276;">Chapter Navigation</strong>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 12px;">
                ${chapterNav}
              </table>
            </td>
          </tr>
          
          <!-- Chapters Content -->
          ${chaptersHtml}
          
          <!-- Footer -->
          <tr>
            <td style="text-align: center; padding: 20px; color: #999; font-size: 12px; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0;">© ${draft.year} ATV MC Newsletter Hub</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `
  
  return html.trim()
}

/**
 * Generate sanitized body HTML for inline rendering (used by the live preview
 * and the published newsletter detail page). Mirrors the historic .htm look:
 * masthead (logo top-right + green title + tagline), header image, intro, a
 * chapter navigation bar, then chapters — each a green heading holding one or
 * more articles (bold heading + image + body).
 */
const BRAND_GREEN = '#0A8276' // chapter headings (matches app --brand)
const TITLE_GREEN = '#007D6F' // masthead title + tagline (matches .htm baseline)
const FONT_STACK = "Arial, 'Segoe UI', Tahoma, sans-serif"

/** Escape text destined for HTML text nodes / attributes. */
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

function renderArticle(article: NewsletterArticle): string {
  const titleHtml = article.title
    ? `<p style="font-size:12pt;font-weight:bold;color:#222;margin:0 0 8px;">${escapeHtml(article.title)}</p>`
    : ''
  const contactHtml = article.contact
    ? `<p style="margin:10px 0 0;font-style:italic;font-size:10pt;color:#555;"><strong>Contact:</strong> ${escapeHtml(article.contact)}</p>`
    : ''
  const body = `${titleHtml}<div style="font-size:10.5pt;line-height:1.6;color:#333;">${article.content || ''}</div>${contactHtml}`

  if (article.image && article.template === 'portrait') {
    return `
      <div style="display:flex;gap:18px;margin:0 0 22px;align-items:flex-start;">
        <div style="flex:0 0 200px;width:200px;">
          <img src="${article.image}" alt="${escapeHtml(article.title)}" style="width:200px;height:600px;object-fit:cover;display:block;" />
        </div>
        <div style="flex:1;min-width:0;">${body}</div>
      </div>`
  }

  if (article.image && article.template === 'landscape') {
    return `
      <div style="margin:0 0 22px;">
        <img src="${article.image}" alt="${escapeHtml(article.title)}" style="width:100%;max-width:600px;height:200px;object-fit:cover;display:block;margin:0 0 12px;" />
        ${body}
      </div>`
  }

  return `<div style="margin:0 0 22px;">${body}</div>`
}

export function generateNewsletterBodyHtml(draft: NewsletterDraft): string {
  const title = draft.title?.trim() || computeAutoTitle(draft.month, draft.year)
  const subtitle = (draft.subtitle ?? DEFAULT_SUBTITLE).trim()
  const headerSrc = draft.headerImage || defaultHeaderImage

  const navItems = draft.chapters
    .filter((c) => c.title?.trim())
    .map(
      (chapter, index) =>
        `<a href="#chapter_${index}" style="color:#ffffff;text-decoration:none;font-size:11.5pt;font-weight:bold;margin:0 14px 6px 0;display:inline-block;">${escapeHtml(
          chapter.title,
        )}</a>`,
    )
    .join('')

  const chaptersHtml = draft.chapters
    .map((chapter, index) => {
      const heading = chapter.title?.trim()
        ? `<a name="chapter_${index}" id="chapter_${index}"></a>
           <h2 style="font-size:13.5pt;font-weight:bold;color:${BRAND_GREEN};margin:0 0 14px;border-bottom:1px solid #e5e7eb;padding-bottom:6px;">${escapeHtml(
             chapter.title,
           )}</h2>`
        : `<a name="chapter_${index}" id="chapter_${index}"></a>`
      const articles = chapterArticles(chapter).map(renderArticle).join('')
      return `<section style="padding:22px 0;">${heading}${articles}</section>`
    })
    .join('')

  const bodyHtml = `
    <div style="max-width:800px;margin:0 auto;font-family:${FONT_STACK};color:#333;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:0 0 18px;">
        <div style="flex:1;min-width:0;">
          <h1 style="font-size:21pt;font-weight:bold;color:${TITLE_GREEN};margin:0;line-height:1.2;">${escapeHtml(
            title,
          )}</h1>
          ${
            subtitle
              ? `<p style="font-size:12pt;font-weight:bold;color:${TITLE_GREEN};margin:8px 0 0;">${escapeHtml(subtitle)}</p>`
              : ''
          }
        </div>
        <img src="${logoUrl}" alt="Infineon" style="flex:0 0 auto;height:54px;width:auto;display:block;" />
      </div>

      ${
        headerSrc
          ? `<div style="margin:0 0 20px;"><img src="${headerSrc}" alt="Newsletter header" style="width:100%;height:auto;display:block;" /></div>`
          : ''
      }

      ${
        draft.introContent
          ? `<div style="font-size:10.5pt;line-height:1.6;padding:0 0 12px;">${draft.introContent}</div>`
          : ''
      }

      ${
        navItems
          ? `<div style="background:${BRAND_GREEN};padding:14px 18px;margin:8px 0 4px;">
               <div style="color:#ffffff;font-size:12pt;font-weight:bold;margin:0 0 8px;">In this issue</div>
               <div>${navItems}</div>
             </div>`
          : ''
      }

      ${chaptersHtml}
    </div>
  `

  return bodyHtml.trim()
}

