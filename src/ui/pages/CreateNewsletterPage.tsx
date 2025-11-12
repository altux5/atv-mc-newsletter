import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { NewsletterDraft, NewsletterChapter } from '../../types/newsletter-creation'
import {
  createEmptyDraft,
  saveDraft,
  getDraftById,
  publishDraft,
  generateId,
} from '../../utils/localNewsletters'
import RichTextEditor from '../components/RichTextEditor'
import NewsletterPreview from '../components/NewsletterPreview'

export default function CreateNewsletterPage() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const [draft, setDraft] = useState<NewsletterDraft>(createEmptyDraft())
  const [showPreview, setShowPreview] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

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
      saveDraft(draft)
      publishDraft(draft.id)
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
              />
            </div>
          </section>

          {/* Chapters */}
          <section className="editor-section chapters-section">
            <div className="section-header">
              <h2>Chapters</h2>
              <button type="button" onClick={addChapter} className="button small">
                + Add Chapter
              </button>
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
                      [
                        'AURIX™',
                        'TRAVEO™ T2G',
                        'PSOC™ Automotive',
                        'Bulletin Board',
                        'Ease of Use',
                        'Market News & Press Release',
                        'Success Stories',
                        'Team News',
                      ].includes(chapter.title)
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
                    <option value="AURIX™">AURIX™</option>
                    <option value="TRAVEO™ T2G">TRAVEO™ T2G</option>
                    <option value="PSOC™ Automotive">PSOC™ Automotive</option>
                    <option value="Bulletin Board">Bulletin Board</option>
                    <option value="Ease of Use">Ease of Use</option>
                    <option value="Market News & Press Release">
                      Market News & Press Release
                    </option>
                    <option value="Success Stories">Success Stories</option>
                    <option value="Team News">Team News</option>
                    <option value="Other...">Other...</option>
                  </select>
                  {![
                    'AURIX™',
                    'TRAVEO™ T2G',
                    'PSOC™ Automotive',
                    'Bulletin Board',
                    'Ease of Use',
                    'Market News & Press Release',
                    'Success Stories',
                    'Team News',
                    '',
                  ].includes(chapter.title) && (
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

                <div className="form-group">
                  <label>Chapter Content</label>
                  <RichTextEditor
                    content={chapter.content}
                    onChange={(html) => updateChapter(chapter.id, { content: html })}
                    placeholder="Write your chapter content here..."
                  />
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
    </div>
  )
}

