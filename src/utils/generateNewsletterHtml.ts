import type { NewsletterDraft } from '../types/newsletter-creation'

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
 * Generate sanitized body HTML for inline rendering (without full HTML document structure)
 */
export function generateNewsletterBodyHtml(draft: NewsletterDraft): string {
  // Generate chapter navigation
  const chapterNav = draft.chapters
    .map((chapter, index) => {
      const chapterId = `chapter_${index}`
      return `
        <div style="padding: 8px 0;">
          <a href="#${chapterId}" style="color: #0A8276; text-decoration: none;">
            ${chapter.title || `Chapter ${index + 1}`}
          </a>
        </div>
      `
    })
    .join('')

  // Generate chapter content
  const chaptersHtml = draft.chapters
    .map((chapter, index) => {
      const chapterId = `chapter_${index}`
      const chapterTitle = chapter.title || `Chapter ${index + 1}`
      
      return `
        <div style="padding: 20px 0;">
          <a name="${chapterId}" id="${chapterId}"></a>
          <h2 style="color: #0A8276; font-size: 18px; margin: 0 0 12px 0;">
            ${chapterTitle}
          </h2>
          <div>
            ${chapter.content}
          </div>
        </div>
      `
    })
    .join('')

  const bodyHtml = `
    <div style="max-width: 800px; margin: 0 auto;">
      ${draft.headerImage ? `
      <div style="margin-bottom: 20px;">
        <img src="${draft.headerImage}" alt="Newsletter Header" style="width: 100%; height: auto;" />
      </div>
      ` : ''}
      
      ${draft.introContent ? `
      <div style="padding: 20px 0;">
        ${draft.introContent}
      </div>
      ` : ''}
      
      <div style="padding: 30px 0 20px 0; border-top: 2px solid #0A8276;">
        <h3 style="color: #0A8276; margin: 0 0 12px 0;">Chapter Navigation</h3>
        ${chapterNav}
      </div>
      
      ${chaptersHtml}
    </div>
  `
  
  return bodyHtml.trim()
}

