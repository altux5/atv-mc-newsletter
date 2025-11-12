// Data models for newsletter creation

export interface NewsletterChapter {
  id: string
  title: string
  content: string // HTML content from rich text editor
  images: ChapterImage[]
}

export interface ChapterImage {
  id: string
  dataUrl: string // base64 encoded image
  alt: string
  position?: 'inline' | 'top' | 'bottom'
}

export interface NewsletterDraft {
  id: string
  title: string
  date: string // ISO date string
  month: number // 0-11
  year: number
  headerImage?: string // base64 encoded main photo
  introContent: string // Initial start section content after header image
  chapters: NewsletterChapter[]
  status: 'draft' | 'published'
  createdAt: string
  updatedAt: string
}

export interface CreateNewsletterFormData {
  title: string
  month: number
  year: number
  headerImage?: string
}

