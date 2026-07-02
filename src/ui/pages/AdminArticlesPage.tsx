import { useState, useEffect } from 'react'
import type { SubmittedArticle } from '../../types/article'
import { getArticles, deleteArticle } from '../../utils/articlesApi'
import { sanitizeHtml } from '../../utils/sanitizeHtml'

export default function AdminArticlesPage() {
  const [articles, setArticles] = useState<SubmittedArticle[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const loadArticles = async () => {
    setIsLoading(true)
    try {
      const allArticles = await getArticles()
      // Sort by submission date, newest first
      const sorted = [...allArticles].sort((a, b) =>
        new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
      )
      setArticles(sorted)
      setLoadError(null)
    } catch (error) {
      console.error('Failed to load articles:', error)
      setArticles([])
      setLoadError(
        error instanceof Error
          ? error.message
          : 'Could not load articles. Please try again.',
      )
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadArticles()
  }, [])

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm('Are you sure you want to delete this article? This action cannot be undone.')
    if (confirmed) {
      try {
        await deleteArticle(id)
      } catch (error) {
        console.error('Failed to delete article:', error)
        alert('Failed to delete article. Please try again.')
      }
      await loadArticles()
    }
  }

  const formatDate = (isoString: string) => {
    const date = new Date(isoString)
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (articles.length === 0) {
    return (
      <div className="admin-articles-page">
        <div className="page-header">
          <h1 style={{ color: 'var(--brand)', margin: 0 }}>Review Submitted Articles</h1>
          <p className="meta" style={{ marginTop: 8 }}>
            Manage article submissions for newsletters
          </p>
        </div>
        {isLoading ? (
          <div className="empty-state">
            <p style={{ fontSize: 18, color: 'var(--muted)' }}>Loading articles…</p>
          </div>
        ) : loadError ? (
          <div className="empty-state">
            <p style={{ fontSize: 18, color: '#dc2626' }}>Couldn’t load articles</p>
            <p className="meta">{loadError}</p>
            <button type="button" className="button small" onClick={loadArticles} style={{ marginTop: 12 }}>
              Try again
            </button>
          </div>
        ) : (
          <div className="empty-state">
            <p style={{ fontSize: 18, color: 'var(--muted)' }}>
              No articles have been submitted yet.
            </p>
            <p className="meta">
              When users submit articles, they will appear here for review.
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="admin-articles-page">
      <div className="page-header">
        <h1 style={{ color: 'var(--brand)', margin: 0 }}>Review Submitted Articles</h1>
        <p className="meta" style={{ marginTop: 8 }}>
          {articles.length} {articles.length === 1 ? 'article' : 'articles'} submitted
        </p>
      </div>

      <div className="articles-grid">
        {articles.map((article) => (
          <article key={article.id} className="article-review-card">
            <div className="article-status-bar">
              {article.importedToNewsletter && (
                <span className="status-badge imported">Imported to Newsletter</span>
              )}
              <span className="submission-date">{formatDate(article.submittedAt)}</span>
            </div>

            <h3 className="article-title">{article.title}</h3>

            <div className={`article-preview-layout ${article.template}`}>
              <div className="article-image-container">
                <img src={article.imageDataUrl} alt={article.title} />
                <span className="template-label">
                  {article.template === 'portrait' ? 'H600×W200' : 'H200×W600'}
                </span>
              </div>
              <div className="article-content-container">
                <div
                  className="article-content"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(article.content) }}
                />
                <p className="article-contact">
                  <strong>Contact:</strong> {article.contact}
                </p>
              </div>
            </div>

            <div className="article-actions">
              <button
                type="button"
                onClick={() => handleDelete(article.id)}
                className="button small danger"
              >
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

