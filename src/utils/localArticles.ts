import type { SubmittedArticle, ArticleFormData } from '../types/article'

const STORAGE_KEY = 'submitted_articles'

export function generateArticleId(): string {
  return `article_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

export function saveArticle(formData: ArticleFormData): SubmittedArticle {
  try {
    const article: SubmittedArticle = {
      id: generateArticleId(),
      ...formData,
      submittedAt: new Date().toISOString(),
      importedToNewsletter: false,
    }

    const existingArticles = getArticles()
    existingArticles.push(article)
    
    // Check if the data is too large for localStorage
    const dataToStore = JSON.stringify(existingArticles)
    // Approximate size: each character is 1 byte in UTF-16, but JSON.stringify uses UTF-8
    // For safety, we'll use a conservative estimate
    const sizeInMB = new TextEncoder().encode(dataToStore).length / (1024 * 1024)
    
    if (sizeInMB > 4) {
      throw new Error('Article data is too large. Please use a smaller image or contact support.')
    }
    
    try {
      localStorage.setItem(STORAGE_KEY, dataToStore)
    } catch (storageError) {
      if (storageError instanceof DOMException && storageError.name === 'QuotaExceededError') {
        throw new Error('Storage limit exceeded. Please clear some data or use a smaller image.')
      }
      throw storageError
    }
    
    return article
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    // Handle QuotaExceededError or other localStorage errors
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      throw new Error('Storage limit exceeded. Please clear some data or use a smaller image.')
    }
    throw new Error('Failed to save article. Please try again or contact support.')
  }
}

export function getArticles(): SubmittedArticle[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch (error) {
    console.error('Error reading articles from localStorage:', error)
    return []
  }
}

export function getArticleById(id: string): SubmittedArticle | null {
  const articles = getArticles()
  return articles.find(article => article.id === id) || null
}

export function deleteArticle(id: string): void {
  const articles = getArticles()
  const filtered = articles.filter(article => article.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
}

export function markArticleAsImported(id: string): void {
  const articles = getArticles()
  const updated = articles.map(article => 
    article.id === id ? { ...article, importedToNewsletter: true } : article
  )
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
}

export function getAvailableArticlesForImport(): SubmittedArticle[] {
  return getArticles() // Return all articles, showing imported status in UI
}

