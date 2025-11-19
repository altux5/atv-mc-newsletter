// Article submission data models

export type ArticleTemplate = 'landscape' | 'portrait'

export interface SubmittedArticle {
  id: string
  template: ArticleTemplate
  title: string
  content: string // 3-4 sentences
  imageDataUrl: string // base64 encoded image
  contact: string
  submittedAt: string // ISO date string
  importedToNewsletter: boolean
}

export interface ArticleFormData {
  template: ArticleTemplate
  title: string
  content: string
  imageDataUrl: string
  contact: string
}

