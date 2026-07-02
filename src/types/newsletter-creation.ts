// Data models for newsletter creation

export type ArticleLayout = 'portrait' | 'landscape'

/** A call-to-action button rendered under an article (label + link). */
export interface ArticleButton {
  label: string
  url: string
}

/**
 * A single article inside a chapter. A chapter (e.g. "AURIX™") can contain
 * several of these. Each article has its own bold heading, layout, image and
 * rich-text body — distinct from the green chapter heading.
 */
export interface NewsletterArticle {
  id: string
  title: string // bold article heading (distinct from the green chapter title)
  content: string // HTML content from the rich text editor
  template: ArticleLayout // controls image placement/size (portrait vs landscape)
  image?: string // base64 encoded source image (downscaled, NOT pre-cropped)
  imageAspect?: number // natural width/height of the source image
  imageZoom?: number // 1..3, pan/zoom scale within the frame (default 1)
  imagePosX?: number // 0..1 horizontal focus (default 0.5)
  imagePosY?: number // 0..1 vertical focus (default 0.5)
  contact?: string
  button?: ArticleButton // optional CTA button
}

export interface NewsletterChapter {
  id: string
  title: string // green chapter heading
  articles: NewsletterArticle[]
  // --- legacy fields (pre-multi-article model); kept optional so older drafts
  // still load and render. normalizeDraft() migrates these into `articles`. ---
  content?: string
  images?: ChapterImage[]
  template?: 'portrait' | 'landscape'
  chapterImage?: string
  chapterText?: string
  chapterContact?: string
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
  subtitle: string // tagline under the main title, e.g. "We make green mobility smart!"
  date: string // ISO date string
  month: number // 0-11
  year: number
  headerImage?: string // base64 encoded main photo; falls back to the bundled default
  introContent: string // Initial start section content after header image
  chapters: NewsletterChapter[]
  footerContent: string // HTML footer (imprint/contact/privacy + copyright + CTA)
  status: 'draft' | 'published'
  createdAt: string
  updatedAt: string
  autoSaved?: boolean // true when the most recent save was an automatic autosave
  lastEditedBy?: string // email of the editor who last saved this draft
}

export interface CreateNewsletterFormData {
  title: string
  month: number
  year: number
  headerImage?: string
}

