import type { Newsletter } from '../data/newsletters'
import type { NewsletterDraft } from '../types/newsletter-creation'

const STORAGE_KEY = 'newsletter_drafts'

// Generate unique ID
export function generateId(): string {
  return `draft_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
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
  
  // Create excerpt from intro content or first chapter
  let excerpt = 'Custom newsletter'
  if (draft.introContent) {
    const temp = document.createElement('div')
    temp.innerHTML = draft.introContent
    const text = (temp.textContent || '').replace(/\s+/g, ' ').trim()
    excerpt = text.length > 200 ? text.slice(0, 197).trimEnd() + '…' : text
  } else if (draft.chapters.length > 0) {
    const firstContent = draft.chapters[0].content
    const temp = document.createElement('div')
    temp.innerHTML = firstContent
    const text = (temp.textContent || '').replace(/\s+/g, ' ').trim()
    excerpt = text.length > 200 ? text.slice(0, 197).trimEnd() + '…' : text
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
  return {
    id: generateId(),
    title: '',
    date: now.toISOString(),
    month: now.getMonth(),
    year: now.getFullYear(),
    headerImage: undefined,
    introContent: '',
    chapters: [
      {
        id: generateId(),
        title: '',
        content: '',
        images: [],
      },
    ],
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

