// Article submission data models

export type ArticleTemplate = 'landscape' | 'portrait'

/** Optional call-to-action button rendered under an article (label + link). */
export interface ArticleButton {
  label: string
  url: string
}

export interface SubmittedArticle {
  id: string
  template: ArticleTemplate
  title: string
  content: string // 3-4 sentences
  imageDataUrl: string // base64 encoded image (full/downscaled, NOT pre-cropped)
  contact: string
  chapter?: string // chapter this article belongs to (e.g. "AURIX™")
  button?: ArticleButton // optional CTA button
  imageAspect?: number // natural width/height of the source image
  imageZoom?: number // 1..3 pan/zoom scale within the frame
  imagePosX?: number // 0..1 horizontal focus
  imagePosY?: number // 0..1 vertical focus
  submittedAt: string // ISO date string
  importedToNewsletter: boolean
}

export interface ArticleFormData {
  template: ArticleTemplate
  title: string
  content: string
  imageDataUrl: string
  contact: string
  chapter?: string
  button?: ArticleButton
  imageAspect?: number
  imageZoom?: number
  imagePosX?: number
  imagePosY?: number
}

