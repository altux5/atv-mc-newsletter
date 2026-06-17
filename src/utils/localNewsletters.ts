import type { Newsletter } from '../data/newsletters'
import type {
  NewsletterDraft,
  NewsletterChapter,
  NewsletterArticle,
  ArticleLayout,
} from '../types/newsletter-creation'

const STORAGE_KEY = 'newsletter_drafts'

export const DEFAULT_SUBTITLE = 'We make green mobility smart!'

// Generate unique ID
export function generateId(): string {
  return `draft_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/** Auto title from month/year, e.g. "ATV MC Monthly Update - June '26". */
export function computeAutoTitle(month: number, year: number): string {
  const monthName = new Date(Date.UTC(year, month, 1)).toLocaleString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  })
  const yy = String(year).slice(-2)
  return `ATV MC Monthly Update - ${monthName} '${yy}`
}

/** A blank article (portrait by default). */
export function createEmptyArticle(): NewsletterArticle {
  return { id: generateId(), title: '', content: '', template: 'portrait', image: undefined, contact: '' }
}

/** A blank chapter containing a single empty article. */
export function createEmptyChapter(): NewsletterChapter {
  return { id: generateId(), title: '', articles: [createEmptyArticle()] }
}

/**
 * Ensure a draft matches the current model: a subtitle is present and every
 * chapter has an `articles` array. Legacy chapters (single rich-text or the old
 * template fields) are migrated into one article so old drafts keep working.
 */
export function normalizeDraft(draft: NewsletterDraft): NewsletterDraft {
  const chapters: NewsletterChapter[] = (draft.chapters ?? []).map((ch) => {
    if (Array.isArray(ch.articles) && ch.articles.length > 0) {
      return {
        id: ch.id,
        title: ch.title,
        articles: ch.articles.map((a) => ({ ...a, template: a.template ?? 'portrait' })),
      }
    }
    const hasRich = (ch.content ?? '').trim().length > 0
    const article: NewsletterArticle = {
      id: generateId(),
      title: '',
      content: hasRich ? (ch.content as string) : ch.chapterText ? `<p>${ch.chapterText}</p>` : '',
      template: (ch.template as ArticleLayout) ?? 'portrait',
      image: !hasRich ? ch.chapterImage || undefined : undefined,
      contact: ch.chapterContact ?? '',
    }
    return { id: ch.id, title: ch.title, articles: [article] }
  })
  return {
    ...draft,
    subtitle: draft.subtitle || DEFAULT_SUBTITLE,
    chapters: chapters.length > 0 ? chapters : [createEmptyChapter()],
  }
}

// Save a newsletter draft to LocalStorage
export function saveDraft(draft: NewsletterDraft): void {
  const drafts = getAllDrafts()
  const existingIndex = drafts.findIndex((d) => d.id === draft.id)
  
  draft.updatedAt = new Date().toISOString()
  
  if (existingIndex >= 0) {
    drafts[existingIndex] = draft
  } else {
    drafts.push(draft)
  }
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts))
}

// Get all newsletter drafts from LocalStorage
export function getAllDrafts(): NewsletterDraft[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    return JSON.parse(stored) as NewsletterDraft[]
  } catch (error) {
    console.error('Failed to load drafts from LocalStorage:', error)
    return []
  }
}

// Get a single draft by ID
export function getDraftById(id: string): NewsletterDraft | null {
  const drafts = getAllDrafts()
  return drafts.find((d) => d.id === id) || null
}

// Delete a draft
export function deleteDraft(id: string): void {
  const drafts = getAllDrafts()
  const filtered = drafts.filter((d) => d.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
}

// Convert a NewsletterDraft to the Newsletter format for display
export function draftToNewsletter(draft: NewsletterDraft): Newsletter {
  const monthName = new Date(Date.UTC(draft.year, draft.month, 1)).toLocaleString(undefined, {
    month: 'long',
    timeZone: 'UTC',
  })
  
  const title = draft.title || `ATV MC Newsletter - ${monthName} ${draft.year} edition`
  const date = new Date(Date.UTC(draft.year, draft.month, 5))
  
  // Create slug from title
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  
  // Create excerpt from intro content or the first article
  let excerpt = 'Custom newsletter'
  const firstChapter = draft.chapters[0]
  const firstArticleContent =
    firstChapter?.articles?.[0]?.content ?? firstChapter?.content ?? ''
  const source = draft.introContent || firstArticleContent
  if (source) {
    const temp = document.createElement('div')
    temp.innerHTML = source
    const text = (temp.textContent || '').replace(/\s+/g, ' ').trim()
    if (text) excerpt = text.length > 200 ? text.slice(0, 197).trimEnd() + '…' : text
  }
  
  return {
    id: draft.id,
    slug,
    title,
    date: date.toISOString(),
    excerpt,
    content: [{ type: 'p', text: 'This newsletter was created using the newsletter editor.' }],
    tags: [],
    sourcePath: undefined, // LocalStorage newsletters don't have a file path
  }
}

// Get all published newsletters (converted from drafts)
export function getPublishedNewsletters(): Newsletter[] {
  const drafts = getAllDrafts()
  return drafts
    .filter((d) => d.status === 'published')
    .map((d) => draftToNewsletter(d))
}

// Create a new empty draft
export function createEmptyDraft(): NewsletterDraft {
  const now = new Date()
  const month = now.getMonth()
  const year = now.getFullYear()
  return {
    id: generateId(),
    title: computeAutoTitle(month, year),
    subtitle: DEFAULT_SUBTITLE,
    date: now.toISOString(),
    month,
    year,
    headerImage: undefined,
    introContent: '',
    chapters: [createEmptyChapter()],
    status: 'draft',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }
}

// Publish a draft (change status to published)
export function publishDraft(id: string): void {
  const draft = getDraftById(id)
  if (draft) {
    draft.status = 'published'
    saveDraft(draft)
  }
}

// Get the HTML content for a specific draft (for rendering)
export function getDraftHtmlContent(id: string): string | null {
  const draft = getDraftById(id)
  if (!draft) return null
  
  // We'll generate this in the generateNewsletterHtml utility
  // For now, return a placeholder
  return null
}

