import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { NewsletterDraft, NewsletterChapter } from '../../types/newsletter-creation'
import {
  createEmptyDraft,
  saveDraft,
  getDraftById,
  generateId,
} from '../../utils/localNewsletters'
import RichTextEditor from '../components/RichTextEditor'
import NewsletterPreview from '../components/NewsletterPreview'
import type { SubmittedArticle } from '../../types/article'
import { getAvailableArticlesForImport, markArticleAsImported } from '../../utils/articlesApi'
import type { ArticleTemplate } from '../../types/article'
import { refineContent } from '../../utils/aiRefine'
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

  const refineIntro = (html: string) =>
    refineContent(html, {
      context: `Newsletter intro for ${draft.title || 'newsletter'}`,
    })

  const refineChapterContent = (chapter: NewsletterChapter, index: number) => (html: string) =>
    refineContent(html, {
      context: `Chapter ${index + 1}: ${chapter.title || 'Untitled chapter'}`,
    })

  // Load existing draft if editing
  useEffect(() => {
    if (id) {
      const existingDraft = getDraftById(id)
      if (existingDraft) {
        setDraft(existingDraft)
        setLastSaved(new Date(existingDraft.updatedAt))
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
      saveDraft(draft)
      setLastSaved(new Date())
      if (showNotification) {
        alert('Draft saved successfully!')
      }
    } catch (error) {
      console.error('Failed to save draft:', error)
      if (showNotification) {
        alert('Failed to save draft. Please try again.')
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
      // Update draft status before saving
      const draftToPublish = { ...draft, status: 'published' as const }
      saveDraft(draftToPublish)
      setDraft(draftToPublish)
      // Dispatch custom event to notify other components
      window.dispatchEvent(new Event('newsletterPublished'))
      alert('Newsletter published successfully!')
      navigate('/newsletters')
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
    const newChapter: NewsletterChapter = {
      id: generateId(),
      title: '',
      content: '',
      images: [],
    }
    setDraft((prev) => ({
      ...prev,
      chapters: [...prev.chapters, newChapter],
    }))
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

  const handleHeaderImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('Image size must be less than 5MB')
        return
      }
      const reader = new FileReader()
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string
        updateDraft({ headerImage: dataUrl })
      }
      reader.readAsDataURL(file)
    }
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
    // Convert article to chapter content based on template
    let htmlContent = ''
    
    if (article.template === 'portrait') {
      // Portrait: Image left (H600×W200), Text right (H600×W400)
      htmlContent = `
        <div style="display: flex; gap: 16px; margin-bottom: 16px;">
          <div style="flex: 0 0 200px;">
            <img src="${article.imageDataUrl}" alt="${article.title}" style="width: 100%; height: auto; display: block;" />
          </div>
          <div style="flex: 1;">
            <h3>${article.title}</h3>
            <p>${article.content}</p>
            <p style="margin-top: 12px; font-style: italic;"><strong>Contact:</strong> ${article.contact}</p>
          </div>
        </div>
      `
    } else {
      // Landscape: Image top (H200×W600), Text bottom (H400×W600)
      htmlContent = `
        <div style="margin-bottom: 16px;">
          <img src="${article.imageDataUrl}" alt="${article.title}" style="width: 100%; height: auto; display: block; margin-bottom: 12px;" />
          <h3>${article.title}</h3>
          <p>${article.content}</p>
          <p style="margin-top: 12px; font-style: italic;"><strong>Contact:</strong> ${article.contact}</p>
        </div>
      `
    }

    // Add as new chapter
    const newChapter: NewsletterChapter = {
      id: generateId(),
      title: article.title,
      content: htmlContent,
      images: [],
    }

    setDraft((prev) => ({
      ...prev,
      chapters: [...prev.chapters, newChapter],
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
            <div className="form-group">
              <label htmlFor="title">Newsletter Title</label>
              <input
                id="title"
                type="text"
                value={draft.title}
                onChange={(e) => updateDraft({ title: e.target.value })}
                placeholder="e.g., ATV MC Newsletter - December 2024 edition"
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="month">Month</label>
                <select
                  id="month"
                  value={draft.month}
                  onChange={(e) => updateDraft({ month: Number(e.target.value) })}
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
                  onChange={(e) => updateDraft({ year: Number(e.target.value) })}
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
          </section>

          {/* Header Image */}
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
                  Recommended: 800x400px, max 5MB
                </p>
              </div>
            )}
          </section>

          {/* Intro Section */}
          <section className="editor-section intro-section">
            <h2>Initial Start Section</h2>
            <p className="meta" style={{ marginTop: 0, marginBottom: 12 }}>
              This intro content appears after the header image and before the navigation.
            </p>
            <div className="form-group">
              <label>Intro Content</label>
              <RichTextEditor
                content={draft.introContent}
                onChange={(html) => updateDraft({ introContent: html })}
                placeholder="Write your introduction or opening message..."
                enableRefine
                onRefine={refineIntro}
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
                  <label>Chapter Title</label>
                  <select
                    value={
                      isCanonicalChapterTitle(chapter.title)
                        ? chapter.title
                        : 'Other...'
                    }
                    onChange={(e) => {
                      if (e.target.value === 'Other...') {
                        updateChapter(chapter.id, { title: '' })
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
                      value={chapter.title}
                      onChange={(e) =>
                        updateChapter(chapter.id, { title: e.target.value })
                      }
                      placeholder="Enter custom chapter name..."
                      style={{ marginTop: 8 }}
                    />
                  )}
                </div>

                {/* Chapter Content Mode Selection */}
                <div className="form-group">
                  <label>Content Type</label>
                  <select
                    value={chapter.template ? 'template' : 'rich-text'}
                    onChange={(e) => {
                      if (e.target.value === 'template') {
                        updateChapter(chapter.id, {
                          template: 'portrait',
                          chapterImage: '',
                          chapterText: '',
                          chapterContact: '',
                          content: '', // Clear rich text content when switching to template
                        })
                      } else {
                        updateChapter(chapter.id, {
                          template: undefined,
                          chapterImage: undefined,
                          chapterText: undefined,
                          chapterContact: undefined,
                        })
                      }
                    }}
                  >
                    <option value="rich-text">Rich Text Editor</option>
                    <option value="template">Article Template</option>
                  </select>
                </div>

                {/* Template-based Content Editor */}
                {chapter.template && (
                  <div className="chapter-template-editor">
                    <div className="form-group">
                      <label>Template Layout</label>
                      <div className="template-selection-small">
                        <label className={`template-card-small ${chapter.template === 'portrait' ? 'selected' : ''}`}>
                          <input
                            type="radio"
                            name={`template-${chapter.id}`}
                            value="portrait"
                            checked={chapter.template === 'portrait'}
                            onChange={(e) => updateChapter(chapter.id, { template: e.target.value as ArticleTemplate })}
                          />
                          <div className="template-preview-small portrait-preview">
                            <div className="template-image-small">Image</div>
                            <div className="template-text-small">Text</div>
                          </div>
                          <div className="template-info-small">
                            <strong>Portrait</strong>
                            <span>H600×W200 (left)</span>
                          </div>
                        </label>

                        <label className={`template-card-small ${chapter.template === 'landscape' ? 'selected' : ''}`}>
                          <input
                            type="radio"
                            name={`template-${chapter.id}`}
                            value="landscape"
                            checked={chapter.template === 'landscape'}
                            onChange={(e) => updateChapter(chapter.id, { template: e.target.value as ArticleTemplate })}
                          />
                          <div className="template-preview-small landscape-preview">
                            <div className="template-image-small">Image</div>
                            <div className="template-text-small">Text</div>
                          </div>
                          <div className="template-info-small">
                            <strong>Landscape</strong>
                            <span>H200×W600 (top)</span>
                          </div>
                        </label>
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Article Image</label>
                      {chapter.chapterImage ? (
                        <div className="image-preview-container">
                          <img src={chapter.chapterImage} alt="Chapter preview" className="article-image-preview" />
                          <button
                            type="button"
                            onClick={() => updateChapter(chapter.id, { chapterImage: '' })}
                            className="button small danger"
                          >
                            Remove Image
                          </button>
                        </div>
                      ) : (
                        <div className="image-upload-area">
                          <label htmlFor={`chapter-image-${chapter.id}`} className="upload-label">
                            <span>📷 Upload Image</span>
                            <input
                              id={`chapter-image-${chapter.id}`}
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) {
                                  if (file.size > 5 * 1024 * 1024) {
                                    alert('Image size must be less than 5MB')
                                    return
                                  }
                                  const reader = new FileReader()
                                  reader.onload = (event) => {
                                    const dataUrl = event.target?.result as string
                                    updateChapter(chapter.id, { chapterImage: dataUrl })
                                  }
                                  reader.readAsDataURL(file)
                                }
                              }}
                              style={{ display: 'none' }}
                            />
                          </label>
                          <p className="meta" style={{ marginTop: 8 }}>
                            {chapter.template === 'portrait' 
                              ? 'Recommended: H600 × W200 pixels' 
                              : 'Recommended: H200 × W600 pixels'}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="form-group">
                      <label>Article Content (3-4 sentences)</label>
                      <textarea
                        value={chapter.chapterText || ''}
                        onChange={(e) => updateChapter(chapter.id, { chapterText: e.target.value })}
                        placeholder="Write your article content here (3-4 sentences)..."
                        rows={6}
                        maxLength={500}
                      />
                      <p className="meta" style={{ marginTop: 4 }}>
                        {(chapter.chapterText || '').trim().split(/\s+/).filter(w => w).length} words
                      </p>
                    </div>

                    <div className="form-group">
                      <label>Contact Information</label>
                      <input
                        type="text"
                        value={chapter.chapterContact || ''}
                        onChange={(e) => updateChapter(chapter.id, { chapterContact: e.target.value })}
                        placeholder="Contact: Your Name, Email, or Phone"
                        maxLength={200}
                      />
                    </div>

                    <div className="form-group">
                      <button
                        type="button"
                        onClick={() => {
                          // Generate HTML content from template
                          let htmlContent = ''
                          if (chapter.template === 'portrait' && chapter.chapterImage && chapter.chapterText) {
                            htmlContent = `
                              <div style="display: flex; gap: 16px; margin-bottom: 16px;">
                                <div style="flex: 0 0 200px;">
                                  <img src="${chapter.chapterImage}" alt="${chapter.title}" style="width: 100%; height: auto; display: block;" />
                                </div>
                                <div style="flex: 1;">
                                  <p>${chapter.chapterText}</p>
                                  ${chapter.chapterContact ? `<p style="margin-top: 12px; font-style: italic;"><strong>Contact:</strong> ${chapter.chapterContact}</p>` : ''}
                                </div>
                              </div>
                            `
                          } else if (chapter.template === 'landscape' && chapter.chapterImage && chapter.chapterText) {
                            htmlContent = `
                              <div style="margin-bottom: 16px;">
                                <img src="${chapter.chapterImage}" alt="${chapter.title}" style="width: 100%; height: auto; display: block; margin-bottom: 12px;" />
                                <p>${chapter.chapterText}</p>
                                ${chapter.chapterContact ? `<p style="margin-top: 12px; font-style: italic;"><strong>Contact:</strong> ${chapter.chapterContact}</p>` : ''}
                              </div>
                            `
                          }
                          if (htmlContent) {
                            updateChapter(chapter.id, { content: htmlContent })
                            alert('Template content converted to HTML! You can now edit it in Rich Text mode if needed.')
                          } else {
                            alert('Please fill in the image and content fields first.')
                          }
                        }}
                        className="button small primary"
                      >
                        Convert to HTML Content
                      </button>
                      <p className="meta" style={{ marginTop: 4 }}>
                        This will convert your template content to HTML format that can be edited further
                      </p>
                    </div>
                  </div>
                )}

                {/* Rich Text Editor */}
                {!chapter.template && (
                  <div className="form-group">
                    <label>Chapter Content</label>
                    <RichTextEditor
                      content={chapter.content}
                      onChange={(html) => updateChapter(chapter.id, { content: html })}
                      placeholder="Write your chapter content here..."
                      enableRefine
                      onRefine={refineChapterContent(chapter, index)}
                    />
                  </div>
                )}
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

