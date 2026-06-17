import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type {
  NewsletterDraft,
  NewsletterChapter,
  NewsletterArticle,
  ArticleLayout,
} from '../../types/newsletter-creation'
import {
  createEmptyDraft,
  createEmptyChapter,
  createEmptyArticle,
  normalizeDraft,
  computeAutoTitle,
  generateId,
} from '../../utils/localNewsletters'
import { saveDraftApi, getDraftByIdApi, publishNewsletterApi } from '../../utils/newslettersApi'
import RichTextEditor from '../components/RichTextEditor'
import NewsletterPreview from '../components/NewsletterPreview'
import type { SubmittedArticle } from '../../types/article'
import { getAvailableArticlesForImport, markArticleAsImported } from '../../utils/articlesApi'
import { cropImageToRatio, ARTICLE_CROP, HEADER_CROP, aspectRatioCss } from '../../utils/imageCrop'
import { CANONICAL_CHAPTER_TITLES, isCanonicalChapterTitle } from '../../constants/chapters'

export default function CreateNewsletterPage() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const [draft, setDraft] = useState<NewsletterDraft>(createEmptyDraft())
  const [showPreview, setShowPreview] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [showArticleImport, setShowArticleImport] = useState(false)
  const [availableArticles, setAvailableArticles] = useState<SubmittedArticle[]>([])

  // Load existing draft if editing
  useEffect(() => {
    if (id) {
      let cancelled = false
      void getDraftByIdApi(id).then((existingDraft) => {
        if (cancelled || !existingDraft) return
        setDraft(normalizeDraft(existingDraft))
        setLastSaved(new Date(existingDraft.updatedAt))
      })
      return () => {
        cancelled = true
      }
    }
  }, [id])

  // Auto-save every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (draft.title || draft.chapters.some((c) => c.title || c.content)) {
        handleSave(false)
      }
    }, 30000)
    return () => clearInterval(interval)
  }, [draft])

  const handleSave = async (showNotification = true) => {
    setIsSaving(true)
    try {
      await saveDraftApi(draft)
      setLastSaved(new Date())
      if (showNotification) {
        alert('Draft saved successfully!')
      }
    } catch (error) {
      console.error('Failed to save draft:', error)
      if (showNotification) {
        const message = error instanceof Error ? error.message : 'Failed to save draft. Please try again.'
        alert(message)
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handlePublish = () => {
    if (!draft.title) {
      alert('Please enter a newsletter title before publishing.')
      return
    }
    if (draft.chapters.length === 0 || !draft.chapters[0].title) {
      alert('Please add at least one chapter with a title before publishing.')
      return
    }
    
    const confirmed = window.confirm(
      'Are you sure you want to publish this newsletter? It will be visible to all users.'
    )
    if (confirmed) {
      const draftToPublish = { ...draft, status: 'published' as const }
      void publishNewsletterApi(draftToPublish)
        .then(() => {
          setDraft(draftToPublish)
          // Dispatch custom event to notify other components
          window.dispatchEvent(new Event('newsletterPublished'))
          alert('Newsletter published successfully!')
          navigate('/newsletters')
        })
        .catch((error) => {
          console.error('Failed to publish newsletter:', error)
          const message = error instanceof Error ? error.message : 'Failed to publish newsletter. Please try again.'
          alert(message)
        })
    }
  }

  const updateDraft = (updates: Partial<NewsletterDraft>) => {
    setDraft((prev) => ({ ...prev, ...updates }))
  }

  const updateChapter = (chapterId: string, updates: Partial<NewsletterChapter>) => {
    setDraft((prev) => ({
      ...prev,
      chapters: prev.chapters.map((ch) =>
        ch.id === chapterId ? { ...ch, ...updates } : ch
      ),
    }))
  }

  const addChapter = () => {
    setDraft((prev) => ({ ...prev, chapters: [...prev.chapters, createEmptyChapter()] }))
  }

  // Keep the title in sync with the selected month/year, but only while the
  // editor hasn't typed a custom title (i.e. it still matches the auto value).
  const changeMonthYear = (next: { month?: number; year?: number }) => {
    setDraft((prev) => {
      const month = next.month ?? prev.month
      const year = next.year ?? prev.year
      const keepAuto = !prev.title.trim() || prev.title.trim() === computeAutoTitle(prev.month, prev.year)
      return {
        ...prev,
        month,
        year,
        title: keepAuto ? computeAutoTitle(month, year) : prev.title,
      }
    })
  }

  const updateArticle = (
    chapterId: string,
    articleId: string,
    updates: Partial<NewsletterArticle>,
  ) => {
    setDraft((prev) => ({
      ...prev,
      chapters: prev.chapters.map((ch) =>
        ch.id === chapterId
          ? { ...ch, articles: ch.articles.map((a) => (a.id === articleId ? { ...a, ...updates } : a)) }
          : ch,
      ),
    }))
  }

  const addArticle = (chapterId: string) => {
    setDraft((prev) => ({
      ...prev,
      chapters: prev.chapters.map((ch) =>
        ch.id === chapterId ? { ...ch, articles: [...ch.articles, createEmptyArticle()] } : ch,
      ),
    }))
  }

  const deleteArticle = (chapterId: string, articleId: string) => {
    setDraft((prev) => {
      const chapter = prev.chapters.find((c) => c.id === chapterId)
      if (chapter && chapter.articles.length <= 1) return prev
      return {
        ...prev,
        chapters: prev.chapters.map((ch) =>
          ch.id === chapterId ? { ...ch, articles: ch.articles.filter((a) => a.id !== articleId) } : ch,
        ),
      }
    })
  }

  const handleArticleImageUpload = async (
    chapterId: string,
    articleId: string,
    template: ArticleLayout,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      alert('Image size must be less than 10MB')
      return
    }
    try {
      const cropped = await cropImageToRatio(file, ARTICLE_CROP[template])
      updateArticle(chapterId, articleId, { image: cropped })
    } catch {
      alert('Could not process that image. Please try another file.')
    }
    e.target.value = ''
  }

  const deleteChapter = (chapterId: string) => {
    if (draft.chapters.length === 1) {
      alert('You must have at least one chapter.')
      return
    }
    const confirmed = window.confirm('Are you sure you want to delete this chapter?')
    if (confirmed) {
      setDraft((prev) => ({
        ...prev,
        chapters: prev.chapters.filter((ch) => ch.id !== chapterId),
      }))
    }
  }

  const moveChapterUp = (index: number) => {
    if (index === 0) return
    setDraft((prev) => {
      const newChapters = [...prev.chapters]
      const temp = newChapters[index]
      newChapters[index] = newChapters[index - 1]
      newChapters[index - 1] = temp
      return { ...prev, chapters: newChapters }
    })
  }

  const moveChapterDown = (index: number) => {
    if (index === draft.chapters.length - 1) return
    setDraft((prev) => {
      const newChapters = [...prev.chapters]
      const temp = newChapters[index]
      newChapters[index] = newChapters[index + 1]
      newChapters[index + 1] = temp
      return { ...prev, chapters: newChapters }
    })
  }

  const handleHeaderImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      alert('Image size must be less than 10MB')
      return
    }
    try {
      const cropped = await cropImageToRatio(file, HEADER_CROP)
      updateDraft({ headerImage: cropped })
    } catch {
      alert('Could not process that image. Please try another file.')
    }
    e.target.value = ''
  }

  const removeHeaderImage = () => {
    updateDraft({ headerImage: undefined })
  }

  const openArticleImport = async () => {
    try {
      const articles = await getAvailableArticlesForImport()
      setAvailableArticles(articles)
    } catch (error) {
      console.error('Failed to load articles:', error)
      setAvailableArticles([])
    }
    setShowArticleImport(true)
  }

  const closeArticleImport = () => {
    setShowArticleImport(false)
  }

  const importArticle = async (article: SubmittedArticle) => {
    // Import the submitted article as a new chapter holding one article. The
    // contributor's image is already sized; the chapter title (AURIX™, TRAVEO™,
    // …) is left for the editor to assign.
    const newArticle: NewsletterArticle = {
      id: generateId(),
      title: article.title,
      content: article.content ? `<p>${article.content}</p>` : '',
      template: article.template,
      image: article.imageDataUrl || undefined,
      contact: article.contact || '',
    }

    setDraft((prev) => ({
      ...prev,
      chapters: [...prev.chapters, { id: generateId(), title: '', articles: [newArticle] }],
    }))

    // Mark article as imported
    try {
      await markArticleAsImported(article.id)
    } catch (error) {
      console.error('Failed to mark article as imported:', error)
    }

    // Update available articles list
    const updatedArticles = await getAvailableArticlesForImport()
    setAvailableArticles(updatedArticles)

    alert('Article imported successfully!')
  }

  return (
    <div className="create-newsletter-page">
      <div className="page-header">
        <h1 style={{ color: 'var(--brand)', margin: 0 }}>
          {id ? 'Edit Newsletter' : 'Create Newsletter'}
        </h1>
        <div className="header-actions">
          {lastSaved && (
            <span className="meta" style={{ marginRight: 16 }}>
              Last saved: {lastSaved.toLocaleTimeString()}
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className="button secondary"
          >
            {showPreview ? 'Hide Preview' : 'Show Preview'}
          </button>
          <button
            type="button"
            onClick={() => handleSave(true)}
            disabled={isSaving}
            className="button secondary"
          >
            {isSaving ? 'Saving...' : 'Save Draft'}
          </button>
          <button type="button" onClick={handlePublish} className="button primary">
            Publish
          </button>
        </div>
      </div>

      <div className={`editor-layout ${showPreview ? 'with-preview' : ''}`}>
        <div className="editor-main">
          {/* Newsletter Metadata */}
          <section className="editor-section metadata-section">
            <h2>Newsletter Details</h2>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="month">Month</label>
                <select
                  id="month"
                  value={draft.month}
                  onChange={(e) => changeMonthYear({ month: Number(e.target.value) })}
                >
                  {Array.from({ length: 12 }, (_, i) => {
                    const monthName = new Date(2024, i, 1).toLocaleString(undefined, {
                      month: 'long',
                    })
                    return (
                      <option key={i} value={i}>
                        {monthName}
                      </option>
                    )
                  })}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="year">Year</label>
                <select
                  id="year"
                  value={draft.year}
                  onChange={(e) => changeMonthYear({ year: Number(e.target.value) })}
                >
                  {Array.from({ length: 10 }, (_, i) => {
                    const year = new Date().getFullYear() - 1 + i
                    return (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    )
                  })}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="title">Newsletter Title</label>
              <input
                id="title"
                type="text"
                value={draft.title}
                onChange={(e) => updateDraft({ title: e.target.value })}
                placeholder="ATV MC Monthly Update - June '26"
              />
              <p className="meta" style={{ marginTop: 4 }}>
                Auto-filled from the month and year. Edit it and your wording is kept.
              </p>
            </div>
            <div className="form-group">
              <label htmlFor="subtitle">Subtitle</label>
              <input
                id="subtitle"
                type="text"
                value={draft.subtitle}
                onChange={(e) => updateDraft({ subtitle: e.target.value })}
                placeholder="We make green mobility smart!"
              />
            </div>
          </section>

          {/* Header Image + Intro */}
          <section className="editor-section header-image-section">
            <h2>Header Image</h2>
            {draft.headerImage ? (
              <div className="image-preview">
                <img src={draft.headerImage} alt="Header" />
                <button
                  type="button"
                  onClick={removeHeaderImage}
                  className="button small danger"
                >
                  Remove Image
                </button>
              </div>
            ) : (
              <div className="image-upload">
                <label htmlFor="header-image" className="upload-label">
                  <span>📷 Upload Header Image</span>
                  <input
                    id="header-image"
                    type="file"
                    accept="image/*"
                    onChange={handleHeaderImageUpload}
                    style={{ display: 'none' }}
                  />
                </label>
                <p className="meta" style={{ marginTop: 8 }}>
                  Optional — a default header image is used if you don't upload one. Cropped to 2:1 (≈800×400).
                </p>
              </div>
            )}

            <div className="form-group" style={{ marginTop: 24 }}>
              <p className="meta" style={{ marginTop: 0, marginBottom: 12 }}>
                This intro content appears after the header image and before the navigation.
              </p>
              <label>Intro Content</label>
              <RichTextEditor
                content={draft.introContent}
                onChange={(html) => updateDraft({ introContent: html })}
                placeholder="Write your introduction or opening message..."
                enableRefine
              />
            </div>
          </section>

          {/* Chapters */}
          <section className="editor-section chapters-section">
            <div className="section-header">
              <h2>Chapters</h2>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={openArticleImport} className="button small secondary">
                  📥 Import from Articles
                </button>
                <button type="button" onClick={addChapter} className="button small">
                  + Add Chapter
                </button>
              </div>
            </div>

            {draft.chapters.map((chapter, index) => (
              <div key={chapter.id} className="chapter-editor">
                <div className="chapter-header">
                  <span className="chapter-number">Chapter {index + 1}</span>
                  <div className="chapter-actions">
                    <button
                      type="button"
                      onClick={() => moveChapterUp(index)}
                      disabled={index === 0}
                      className="button icon"
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveChapterDown(index)}
                      disabled={index === draft.chapters.length - 1}
                      className="button icon"
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteChapter(chapter.id)}
                      disabled={draft.chapters.length === 1}
                      className="button icon danger"
                      title="Delete chapter"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label>
                    Chapter Title <span className="meta">(green section heading)</span>
                  </label>
                  <select
                    value={
                      isCanonicalChapterTitle(chapter.title)
                        ? chapter.title
                        : chapter.title.trim() === ''
                          ? ''
                          : 'Other...'
                    }
                    onChange={(e) => {
                      if (e.target.value === 'Other...') {
                        updateChapter(chapter.id, { title: ' ' })
                      } else {
                        updateChapter(chapter.id, { title: e.target.value })
                      }
                    }}
                  >
                    <option value="">Select a chapter...</option>
                    {CANONICAL_CHAPTER_TITLES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                    <option value="Other...">Other...</option>
                  </select>
                  {chapter.title !== '' && !isCanonicalChapterTitle(chapter.title) && (
                    <input
                      type="text"
                      value={chapter.title.trimStart()}
                      onChange={(e) =>
                        updateChapter(chapter.id, { title: e.target.value })
                      }
                      placeholder="Enter custom chapter name..."
                      style={{ marginTop: 8 }}
                    />
                  )}
                </div>

                {/* Articles within this chapter */}
                <div className="articles-block">
                  <div className="articles-block-header">
                    <span className="articles-label">Articles</span>
                    <button
                      type="button"
                      onClick={() => addArticle(chapter.id)}
                      className="button small"
                    >
                      + Add Article
                    </button>
                  </div>

                  {chapter.articles.map((article, aIndex) => (
                    <div key={article.id} className="article-editor">
                      <div className="article-editor-head">
                        <span className="article-number">Article {aIndex + 1}</span>
                        <button
                          type="button"
                          onClick={() => deleteArticle(chapter.id, article.id)}
                          disabled={chapter.articles.length === 1}
                          className="button icon danger"
                          title="Delete article"
                        >
                          🗑️
                        </button>
                      </div>

                      <div className="form-group">
                        <label>
                          Article Title <span className="meta">(bold heading)</span>
                        </label>
                        <input
                          type="text"
                          value={article.title}
                          onChange={(e) =>
                            updateArticle(chapter.id, article.id, { title: e.target.value })
                          }
                          placeholder="e.g., New AURIX™ TC4x evaluation board"
                          maxLength={140}
                        />
                      </div>

                      <div className="form-group">
                        <label>Layout</label>
                        <div className="layout-toggle">
                          {(['portrait', 'landscape'] as ArticleLayout[]).map((layout) => (
                            <label
                              key={layout}
                              className={`layout-option ${article.template === layout ? 'selected' : ''}`}
                            >
                              <input
                                type="radio"
                                name={`layout-${article.id}`}
                                value={layout}
                                checked={article.template === layout}
                                onChange={() =>
                                  updateArticle(chapter.id, article.id, { template: layout })
                                }
                              />
                              <span className={`layout-glyph layout-glyph--${layout}`} aria-hidden="true" />
                              <span className="layout-name">
                                {layout === 'portrait' ? 'Portrait' : 'Landscape'}
                                <span className="meta">
                                  {layout === 'portrait'
                                    ? ' image left · W200×H600'
                                    : ' image top · W600×H200'}
                                </span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className={`article-layout article-layout--${article.template}`}>
                        <div className="article-image-col">
                          <label>Article Image</label>
                          <div
                            className="article-image-box"
                            style={{ aspectRatio: aspectRatioCss(ARTICLE_CROP[article.template]) }}
                          >
                            {article.image ? (
                              <>
                                <img src={article.image} alt="Article" />
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateArticle(chapter.id, article.id, { image: undefined })
                                  }
                                  className="button small danger article-image-remove"
                                >
                                  Remove
                                </button>
                              </>
                            ) : (
                              <label className="article-image-drop">
                                <span>📷 Upload</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  style={{ display: 'none' }}
                                  onChange={(e) =>
                                    handleArticleImageUpload(chapter.id, article.id, article.template, e)
                                  }
                                />
                              </label>
                            )}
                          </div>
                          <p className="meta" style={{ marginTop: 6 }}>
                            Auto-cropped to {article.template === 'portrait' ? 'W200×H600' : 'W600×H200'}.
                          </p>
                        </div>

                        <div className="article-content-col">
                          <label>Article Content</label>
                          <RichTextEditor
                            content={article.content}
                            onChange={(html) =>
                              updateArticle(chapter.id, article.id, { content: html })
                            }
                            placeholder="Write the article (a few sentences)..."
                            enableRefine
                          />
                          <div className="form-group" style={{ marginTop: 12 }}>
                            <label>Contact</label>
                            <input
                              type="text"
                              value={article.contact ?? ''}
                              onChange={(e) =>
                                updateArticle(chapter.id, article.id, { contact: e.target.value })
                              }
                              placeholder="Contact: Name, email or phone"
                              maxLength={200}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        </div>

        {/* Preview Sidebar */}
        {showPreview && (
          <aside className="preview-sidebar">
            <NewsletterPreview draft={draft} />
          </aside>
        )}
      </div>

      {/* Article Import Modal */}
      {showArticleImport && (
        <div className="modal-overlay" onClick={closeArticleImport}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Import Submitted Article</h2>
              <button
                type="button"
                onClick={closeArticleImport}
                className="modal-close"
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              {availableArticles.length === 0 ? (
                <p className="empty-state-text">
                  No submitted articles available to import.
                </p>
              ) : (
                <div className="articles-import-list">
                  {availableArticles.map((article) => (
                    <div key={article.id} className="import-article-card">
                      <div className="import-article-header">
                        <h3>{article.title}</h3>
                        {article.importedToNewsletter && (
                          <span className="imported-badge">Already Imported</span>
                        )}
                      </div>
                      <div className={`import-article-preview ${article.template}`}>
                        <div className="import-article-image">
                          <img src={article.imageDataUrl} alt={article.title} />
                        </div>
                        <div className="import-article-text">
                          <p>{article.content}</p>
                          <p className="import-article-contact">
                            <strong>Contact:</strong> {article.contact}
                          </p>
                        </div>
                      </div>
                      <div className="import-article-actions">
                        <span className="meta">
                          {article.template === 'portrait' ? 'Portrait Layout' : 'Landscape Layout'}
                        </span>
                        <button
                          type="button"
                          onClick={() => importArticle(article)}
                          className="button small primary"
                        >
                          Import
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

