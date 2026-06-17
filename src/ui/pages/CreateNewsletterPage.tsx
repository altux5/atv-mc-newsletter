import { useState, useEffect, useRef } from 'react'
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
} from '../../utils/localNewsletters'
import { saveDraftApi, getDraftByIdApi, getAllDraftsApi, publishNewsletterApi } from '../../utils/newslettersApi'
import RichTextEditor from '../components/RichTextEditor'
import { generateNewsletterBodyHtml, normalizeButtonUrl } from '../../utils/generateNewsletterHtml'
import type { SubmittedArticle } from '../../types/article'
import { getAvailableArticlesForImport, markArticleAsImported } from '../../utils/articlesApi'
import { cropImageToRatio, ARTICLE_CROP, HEADER_CROP, aspectRatioCss, articleImageBg, downscaleImage } from '../../utils/imageCrop'
import { CANONICAL_CHAPTER_TITLES, isCanonicalChapterTitle } from '../../constants/chapters'
import defaultHeaderImage from '../../photos/newsletter image.png'
import logoUrl from '../../logo/Agent-logo.svg'

// --- Live-canvas display pieces -------------------------------------------

/** A fixed-ratio image slot. Empty shows an upload prompt; filled shows the
 *  image with a hover overlay to replace or remove it. */
function CanvasImage({
  src,
  style,
  onUpload,
  onRemove,
  emptyLabel,
  hint,
  className,
}: {
  src?: string
  style?: React.CSSProperties
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRemove?: () => void
  emptyLabel: string
  hint?: string
  className?: string
}) {
  return (
    <div className={`canvas-image ${className ?? ''}`} style={style}>
      {src ? (
        <>
          <img src={src} alt="" />
          <div className="canvas-image-overlay">
            <label className="canvas-image-btn">
              Replace
              <input type="file" accept="image/*" hidden onChange={onUpload} />
            </label>
            {onRemove && (
              <button type="button" className="canvas-image-btn danger" onClick={onRemove}>
                Remove
              </button>
            )}
          </div>
        </>
      ) : (
        <label className="canvas-image-empty">
          <span className="canvas-image-plus">＋</span>
          <span>{emptyLabel}</span>
          {hint && <span className="canvas-image-hint">{hint}</span>}
          <input type="file" accept="image/*" hidden onChange={onUpload} />
        </label>
      )}
    </div>
  )
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** Background style (cover + pan/zoom) for an article image inside its frame. */
function articleImageStyle(article: NewsletterArticle): React.CSSProperties {
  if (!article.image) return {}
  const bg = articleImageBg(
    ARTICLE_CROP[article.template],
    article.imageAspect,
    article.imageZoom,
    article.imagePosX,
    article.imagePosY,
  )
  return {
    backgroundImage: `url(${article.image})`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: bg.backgroundPosition,
    backgroundSize: bg.backgroundSize,
  }
}

/** The green CTA button under an article (matches the historic .htm button). */
function ArticleButtonView({ button }: { button?: NewsletterArticle['button'] }) {
  if (!button || !button.label.trim() || !button.url.trim()) return null
  return (
    <p style={{ margin: '16px 0 0' }}>
      <a className="nl-cta" href={normalizeButtonUrl(button.url)} target="_blank" rel="noopener noreferrer">
        {button.label}
      </a>
    </p>
  )
}

/** Read-only article rendering used in the canvas display (click to edit). */
function ArticleDisplay({ article }: { article: NewsletterArticle }) {
  if (!article.title && !article.content && !article.image && !article.button) {
    return <p className="nl-placeholder">Click to add this article…</p>
  }
  const body = (
    <div className="nl-article-body">
      {article.title && <p className="nl-article-title">{article.title}</p>}
      {article.content ? (
        <div className="nl-article-content" dangerouslySetInnerHTML={{ __html: article.content }} />
      ) : (
        <p className="nl-placeholder-inline">No content yet…</p>
      )}
      {article.contact && (
        <p className="nl-article-contact">
          <strong>Contact:</strong> {article.contact}
        </p>
      )}
      <ArticleButtonView button={article.button} />
    </div>
  )
  if (article.image) {
    return (
      <div className={`nl-article nl-article--${article.template}`}>
        <div
          className="nl-article-img"
          style={{
            aspectRatio: aspectRatioCss(ARTICLE_CROP[article.template]),
            width: article.template === 'portrait' ? 300 : '100%',
            ...articleImageStyle(article),
          }}
        />
        {body}
      </div>
    )
  }
  return <div className="nl-article">{body}</div>
}

/** Editable image frame: drag to pan, slider/buttons to zoom, replace/remove. */
function ArticleImageEditor({
  article,
  onUpload,
  onChange,
  onRemove,
}: {
  article: NewsletterArticle
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  onChange: (updates: Partial<NewsletterArticle>) => void
  onRemove: () => void
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null)
  const zoom = article.imageZoom ?? 1

  const onPointerDown = (e: React.PointerEvent) => {
    if (!article.image) return
    frameRef.current?.setPointerCapture(e.pointerId)
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      posX: article.imagePosX ?? 0.5,
      posY: article.imagePosY ?? 0.5,
    }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    const el = frameRef.current
    if (!d || !el) return
    const rect = el.getBoundingClientRect()
    onChange({
      imagePosX: clamp01(d.posX - (e.clientX - d.x) / rect.width),
      imagePosY: clamp01(d.posY - (e.clientY - d.y) / rect.height),
    })
  }
  const endDrag = (e: React.PointerEvent) => {
    drag.current = null
    frameRef.current?.releasePointerCapture(e.pointerId)
  }

  return (
    <div className="nl-img-editor">
      <div
        ref={frameRef}
        className={`nl-img-frame ${article.image ? 'has-image' : ''}`}
        style={{
          aspectRatio: aspectRatioCss(ARTICLE_CROP[article.template]),
          ...articleImageStyle(article),
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {article.image ? (
          <span className="nl-img-hint">drag to position</span>
        ) : (
          <label className="article-image-drop">
            <span>📷 Upload</span>
            <input type="file" accept="image/*" hidden onChange={onUpload} />
          </label>
        )}
      </div>
      {article.image && (
        <div className="nl-img-controls">
          <button type="button" title="Zoom out" onClick={() => onChange({ imageZoom: clamp(zoom - 0.2, 1, 3) })}>
            −
          </button>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => onChange({ imageZoom: Number(e.target.value) })}
            aria-label="Zoom"
          />
          <button type="button" title="Zoom in" onClick={() => onChange({ imageZoom: clamp(zoom + 0.2, 1, 3) })}>
            ＋
          </button>
          <label className="button small secondary nl-img-replace">
            Replace
            <input type="file" accept="image/*" hidden onChange={onUpload} />
          </label>
          <button type="button" className="button small danger" onClick={onRemove}>
            Remove
          </button>
        </div>
      )}
    </div>
  )
}

export default function CreateNewsletterPage() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const [draft, setDraft] = useState<NewsletterDraft>(createEmptyDraft())
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [showArticleImport, setShowArticleImport] = useState(false)
  const [availableArticles, setAvailableArticles] = useState<SubmittedArticle[]>([])
  const [loadingArticles, setLoadingArticles] = useState(false)
  const [importTarget, setImportTarget] = useState<{ chapterId: string; articleId: string } | null>(null)
  const [importingArticleId, setImportingArticleId] = useState<string | null>(null)
  const [showDraftImport, setShowDraftImport] = useState(false)
  const [availableDrafts, setAvailableDrafts] = useState<NewsletterDraft[]>([])
  const [loadingDrafts, setLoadingDrafts] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  // Live-canvas editing: which block / article is currently open for editing.
  const [activeBlock, setActiveBlock] = useState<string | null>(null)
  const [activeArticleId, setActiveArticleId] = useState<string | null>(null)

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
      if (
        draft.title ||
        draft.chapters.some(
          (c) => c.title || c.articles.some((a) => a.title || a.content || a.image),
        )
      ) {
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
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      alert('Image size must be less than 10MB')
      return
    }
    try {
      // Keep the full (downscaled) image so the editor can pan/zoom; the visible
      // crop is produced live by articleImageBg().
      const { dataUrl, aspect } = await downscaleImage(file)
      updateArticle(chapterId, articleId, {
        image: dataUrl,
        imageAspect: aspect,
        imageZoom: 1,
        imagePosX: 0.5,
        imagePosY: 0.5,
      })
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

  const openArticleImport = async (chapterId: string, articleId: string) => {
    setImportTarget({ chapterId, articleId })
    setShowArticleImport(true)
    setLoadingArticles(true)
    try {
      const articles = await getAvailableArticlesForImport()
      setAvailableArticles(articles)
    } catch (error) {
      console.error('Failed to load articles:', error)
      setAvailableArticles([])
    } finally {
      setLoadingArticles(false)
    }
  }

  const closeArticleImport = () => {
    setShowArticleImport(false)
    setImportTarget(null)
  }

  const openDraftImport = async () => {
    // Open immediately with a loading state so the button feels responsive.
    setShowDraftImport(true)
    setLoadingDrafts(true)
    try {
      const drafts = await getAllDraftsApi()
      const sorted = drafts
        .filter((d) => d.id !== draft.id && d.status !== 'published')
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      setAvailableDrafts(sorted)
    } catch (error) {
      console.error('Failed to load drafts:', error)
      setAvailableDrafts([])
    } finally {
      setLoadingDrafts(false)
    }
  }

  const closeDraftImport = () => {
    setShowDraftImport(false)
  }

  const openDraft = (target: NewsletterDraft) => {
    setShowDraftImport(false)
    setActiveBlock(null)
    setActiveArticleId(null)
    if (target.id === id) return
    navigate(`/newsletters/edit/${target.id}`)
  }

  const importArticle = async (article: SubmittedArticle) => {
    // Fill the article slot the import was triggered from (stays in its chapter).
    const target = importTarget
    if (!target) return
    setShowArticleImport(false)
    setImportingArticleId(target.articleId)
    updateArticle(target.chapterId, target.articleId, {
      title: article.title,
      content: article.content ? `<p>${article.content}</p>` : '',
      template: article.template,
      image: article.imageDataUrl || undefined,
      imageAspect: undefined,
      imageZoom: 1,
      imagePosX: 0.5,
      imagePosY: 0.5,
      contact: article.contact || '',
    })
    try {
      await markArticleAsImported(article.id)
    } catch (error) {
      console.error('Failed to mark article as imported:', error)
    }
    setImportingArticleId(null)
    setImportTarget(null)
  }

  return (
    <div className="nl-editor">
      {/* Sticky action toolbar */}
      <div className="nl-toolbar">
        <div className="nl-toolbar-left">
          <button type="button" onClick={() => navigate(-1)} className="button secondary">
            ← Back
          </button>
          <span className="nl-toolbar-title">{id ? 'Edit Newsletter' : 'Create Newsletter'}</span>
        </div>
        <div className="nl-toolbar-right">
          {lastSaved && (
            <span className="meta nl-saved">Saved {lastSaved.toLocaleTimeString()}</span>
          )}
          <button type="button" onClick={openDraftImport} className="button secondary">
            📂 Import Draft
          </button>
          <button type="button" onClick={() => setPreviewMode(true)} className="button secondary">
            👁 Preview
          </button>
          <button
            type="button"
            onClick={() => handleSave(true)}
            disabled={isSaving}
            className="button secondary"
          >
            {isSaving ? 'Saving…' : 'Save Draft'}
          </button>
          <button type="button" onClick={handlePublish} className="button primary">
            Publish
          </button>
        </div>
      </div>

      <p className="nl-hint">
        This is a live preview — click any part of the newsletter to edit it in place.
      </p>

      {/* The newsletter canvas */}
      <div className="nl-canvas">
        {/* Masthead: editable title + subtitle, logo top-right */}
        <div className="nl-masthead">
          <div className="nl-masthead-text">
            <input
              className="nl-title-input"
              value={draft.title}
              onChange={(e) => updateDraft({ title: e.target.value })}
              placeholder={computeAutoTitle(draft.month, draft.year)}
              aria-label="Newsletter title"
            />
            <input
              className="nl-subtitle-input"
              value={draft.subtitle}
              onChange={(e) => updateDraft({ subtitle: e.target.value })}
              placeholder="We make green mobility smart!"
              aria-label="Subtitle"
            />
            <div className="nl-issue">
              <span className="nl-issue-label">Issue</span>
              <select
                value={draft.month}
                onChange={(e) => changeMonthYear({ month: Number(e.target.value) })}
                aria-label="Month"
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i} value={i}>
                    {new Date(2024, i, 1).toLocaleString(undefined, { month: 'long' })}
                  </option>
                ))}
              </select>
              <select
                value={draft.year}
                onChange={(e) => changeMonthYear({ year: Number(e.target.value) })}
                aria-label="Year"
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
          <img className="nl-logo" src={logoUrl} alt="Infineon" />
        </div>

        {/* Header image */}
        <CanvasImage
          className="nl-header-image"
          src={draft.headerImage || defaultHeaderImage}
          style={{ aspectRatio: aspectRatioCss(HEADER_CROP) }}
          onUpload={handleHeaderImageUpload}
          onRemove={draft.headerImage ? removeHeaderImage : undefined}
          emptyLabel="Upload header image"
          hint="Optional — a default is used if empty. Cropped to 2:1."
        />

        {/* Intro */}
        {activeBlock === 'intro' ? (
          <div className="nl-edit-pop">
            <div className="nl-edit-head">
              <span className="nl-edit-head-label">Intro</span>
              <button
                type="button"
                className="button small primary"
                onClick={() => setActiveBlock(null)}
              >
                Done
              </button>
            </div>
            <RichTextEditor
              content={draft.introContent}
              onChange={(html) => updateDraft({ introContent: html })}
              placeholder="Write your introduction or opening message..."
              enableRefine
            />
          </div>
        ) : (
          <div
            className="nl-intro nl-click-edit"
            onClick={() => setActiveBlock('intro')}
            title="Click to edit the intro"
          >
            {draft.introContent ? (
              <div dangerouslySetInnerHTML={{ __html: draft.introContent }} />
            ) : (
              <p className="nl-placeholder">Click to add an intro message…</p>
            )}
            <span className="nl-edit-badge">✏️ Edit</span>
          </div>
        )}

        {/* Auto-generated navigation bar */}
        {draft.chapters.some((c) => c.title.trim()) && (
          <div className="nl-nav">
            <div className="nl-nav-items">
              {draft.chapters
                .filter((c) => c.title.trim())
                .map((c, i, arr) => (
                  <span key={c.id} className="nl-nav-item-wrap">
                    <span className="nl-nav-item">{c.title.trim()}</span>
                    {i < arr.length - 1 && <span className="nl-nav-sep">|</span>}
                  </span>
                ))}
            </div>
            <span className="nl-auto-tag" title="Built automatically from your chapter titles">
              auto
            </span>
          </div>
        )}

        {/* Chapters */}
        {draft.chapters.map((chapter, index) => (
          <section key={chapter.id} className="nl-chapter">
            <div className="nl-chapter-bar">
              <div className="nl-chapter-title">
                <select
                  className="nl-chapter-select"
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
                  <option value="">Select a chapter…</option>
                  {CANONICAL_CHAPTER_TITLES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                  <option value="Other...">Other…</option>
                </select>
                {chapter.title !== '' && !isCanonicalChapterTitle(chapter.title) && (
                  <input
                    className="nl-chapter-custom"
                    type="text"
                    value={chapter.title.trimStart()}
                    onChange={(e) => updateChapter(chapter.id, { title: e.target.value })}
                    placeholder="Custom chapter name…"
                  />
                )}
              </div>
              <div className="nl-chapter-tools">
                <button
                  type="button"
                  onClick={() => moveChapterUp(index)}
                  disabled={index === 0}
                  className="button icon"
                  title="Move chapter up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveChapterDown(index)}
                  disabled={index === draft.chapters.length - 1}
                  className="button icon"
                  title="Move chapter down"
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

            {chapter.articles.map((article) => (
              <div key={article.id} className="nl-article-slot">
                {activeArticleId === article.id ? (
                  <div className="nl-article-edit">
                    {importingArticleId === article.id && (
                      <div className="nl-importing-overlay">
                        <span className="nl-spinner" />
                        Importing article…
                      </div>
                    )}

                    {/* Top bar: layout choices + import (the first item in the box) */}
                    <div className="nl-article-topbar">
                      {(['portrait', 'landscape'] as ArticleLayout[]).map((layout) => (
                        <button
                          key={layout}
                          type="button"
                          className={`nl-layout-box ${article.template === layout ? 'selected' : ''}`}
                          onClick={() => updateArticle(chapter.id, article.id, { template: layout })}
                          aria-pressed={article.template === layout}
                        >
                          <span className={`layout-glyph layout-glyph--${layout}`} aria-hidden="true" />
                          <span className="nl-layout-name">
                            {layout === 'portrait' ? 'Portrait' : 'Landscape'}
                          </span>
                        </button>
                      ))}
                      <button
                        type="button"
                        className="nl-layout-box nl-import-box"
                        onClick={() => openArticleImport(chapter.id, article.id)}
                      >
                        <span className="nl-import-glyph" aria-hidden="true">📥</span>
                        <span className="nl-layout-name">Import from submitted articles</span>
                      </button>
                    </div>

                    <div className={`article-layout article-layout--${article.template}`}>
                      <div className="article-image-col">
                        <ArticleImageEditor
                          article={article}
                          onUpload={(e) => handleArticleImageUpload(chapter.id, article.id, e)}
                          onChange={(updates) => updateArticle(chapter.id, article.id, updates)}
                          onRemove={() =>
                            updateArticle(chapter.id, article.id, {
                              image: undefined,
                              imageAspect: undefined,
                            })
                          }
                        />
                      </div>

                      <div className="article-content-col">
                        <input
                          className="nl-article-title-input nl-article-title-block"
                          value={article.title}
                          onChange={(e) =>
                            updateArticle(chapter.id, article.id, { title: e.target.value })
                          }
                          placeholder="Article title…"
                          maxLength={140}
                          aria-label="Article title"
                        />
                        <RichTextEditor
                          content={article.content}
                          onChange={(html) =>
                            updateArticle(chapter.id, article.id, { content: html })
                          }
                          placeholder="Write the article (a few sentences)..."
                          enableRefine
                        />
                        <input
                          className="nl-contact-input"
                          type="text"
                          value={article.contact ?? ''}
                          onChange={(e) =>
                            updateArticle(chapter.id, article.id, { contact: e.target.value })
                          }
                          placeholder="Contact: Name, email or phone"
                          maxLength={200}
                        />
                        {article.button !== undefined ? (
                          <div className="nl-article-button-edit">
                            <div className="nl-article-button-row">
                              <input
                                type="text"
                                value={article.button?.label ?? ''}
                                onChange={(e) =>
                                  updateArticle(chapter.id, article.id, {
                                    button: { label: e.target.value, url: article.button?.url ?? '' },
                                  })
                                }
                                placeholder="Button label"
                                maxLength={60}
                              />
                              <input
                                type="text"
                                value={article.button?.url ?? ''}
                                onChange={(e) =>
                                  updateArticle(chapter.id, article.id, {
                                    button: { label: article.button?.label ?? '', url: e.target.value },
                                  })
                                }
                                placeholder="Button link (e.g. google.com)"
                              />
                            </div>
                            <button
                              type="button"
                              className="nl-remove-button-link"
                              onClick={() =>
                                updateArticle(chapter.id, article.id, { button: undefined })
                              }
                            >
                              Remove button
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="nl-add-button-ghost"
                            onClick={() =>
                              updateArticle(chapter.id, article.id, { button: { label: '', url: '' } })
                            }
                          >
                            ＋ Add button to this article
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="nl-article-foot">
                      <button
                        type="button"
                        className="button icon danger"
                        title="Delete article"
                        disabled={chapter.articles.length === 1}
                        onClick={() => deleteArticle(chapter.id, article.id)}
                      >
                        🗑️
                      </button>
                      <button
                        type="button"
                        className="button small primary"
                        onClick={() => setActiveArticleId(null)}
                      >
                        Done
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="nl-article-display nl-click-edit"
                    onClick={() => setActiveArticleId(article.id)}
                    title="Click to edit this article"
                  >
                    <ArticleDisplay article={article} />
                    <span className="nl-edit-badge">✏️ Edit</span>
                  </div>
                )}
              </div>
            ))}

            <button
              type="button"
              className="nl-add-inline"
              onClick={() => addArticle(chapter.id)}
            >
              ＋ Add article to this chapter
            </button>
          </section>
        ))}

        <button type="button" className="nl-add-chapter" onClick={addChapter}>
          ＋ Add chapter
        </button>

        {/* Footer */}
        {activeBlock === 'footer' ? (
          <div className="nl-edit-pop nl-footer-edit">
            <div className="nl-edit-head">
              <span className="nl-edit-head-label">Footer</span>
              <button
                type="button"
                className="button small primary"
                onClick={() => setActiveBlock(null)}
              >
                Done
              </button>
            </div>
            <RichTextEditor
              content={draft.footerContent}
              onChange={(html) => updateDraft({ footerContent: html })}
              placeholder="Footer links, copyright and contact…"
            />
          </div>
        ) : (
          <div
            className="nl-footer nl-click-edit"
            onClick={() => setActiveBlock('footer')}
            title="Click to edit the footer"
          >
            {draft.footerContent ? (
              <div dangerouslySetInnerHTML={{ __html: draft.footerContent }} />
            ) : (
              <p className="nl-placeholder">Click to add a footer…</p>
            )}
            <span className="nl-edit-badge">✏️ Edit</span>
          </div>
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
              {loadingArticles ? (
                <div className="modal-loading">
                  <span className="nl-spinner" />
                  Loading articles…
                </div>
              ) : availableArticles.length === 0 ? (
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

      {/* Draft Import Modal */}
      {showDraftImport && (
        <div className="modal-overlay" onClick={closeDraftImport}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Open a saved draft</h2>
              <button type="button" onClick={closeDraftImport} className="modal-close">
                ✕
              </button>
            </div>
            <div className="modal-body">
              {loadingDrafts ? (
                <div className="modal-loading">
                  <span className="nl-spinner" />
                  Loading drafts…
                </div>
              ) : availableDrafts.length === 0 ? (
                <p className="empty-state-text">No other saved drafts found.</p>
              ) : (
                <div className="draft-import-list">
                  {availableDrafts.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      className="draft-import-row"
                      onClick={() => openDraft(d)}
                    >
                      <div className="draft-import-main">
                        <span className="draft-import-title">
                          {d.title?.trim() || computeAutoTitle(d.month, d.year)}
                        </span>
                        <span className={`draft-status draft-status--${d.status}`}>
                          {d.status}
                        </span>
                      </div>
                      <span className="meta">
                        Updated {new Date(d.updatedAt).toLocaleString()}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Full-screen read-only preview */}
      {previewMode && (
        <div className="nl-preview-overlay">
          <div className="nl-preview-bar">
            <span className="nl-preview-label">Preview · read only</span>
            <button type="button" className="button primary" onClick={() => setPreviewMode(false)}>
              ← Back to editing
            </button>
          </div>
          <div className="nl-preview-scroll">
            <div className="nl-published-frame">
              <div
                className="embedded-newsletter"
                dangerouslySetInnerHTML={{ __html: generateNewsletterBodyHtml(draft) }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

