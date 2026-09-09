import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ArticleTemplate, ArticleButton } from '../../types/article'
import { saveArticle } from '../../utils/articlesApi'
import { downscaleImage } from '../../utils/imageCrop'
import RichTextEditor from '../components/RichTextEditor'
import ArticleImageEditor from '../components/ArticleImageEditor'
import { sanitizeHtml } from '../../utils/sanitizeHtml'
import { CANONICAL_CHAPTER_TITLES, isCanonicalChapterTitle } from '../../constants/chapters'

/** True when rich-text HTML has no visible text and no image. */
function isHtmlEmpty(html: string): boolean {
  const text = html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim()
  return text.length === 0 && !/<img\b/i.test(html)
}

/** The pan/zoom image fields kept alongside the full (uncropped) source image. */
interface ImageState {
  image?: string
  imageAspect?: number
  imageZoom?: number
  imagePosX?: number
  imagePosY?: number
}

export default function SubmitArticlePage() {
  const navigate = useNavigate()
  const [selectedTemplate, setSelectedTemplate] = useState<ArticleTemplate>('portrait')
  const [chapter, setChapter] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [contact, setContact] = useState('')
  const [image, setImage] = useState<ImageState>({})
  const [button, setButton] = useState<ArticleButton | undefined>(undefined)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      alert('Image size must be less than 10MB. Please use a smaller image.')
      return
    }
    try {
      // Keep the full (downscaled) image so it can be panned/zoomed; the visible
      // crop is produced live by articleImageBg() — same as the newsletter editor.
      const { dataUrl, aspect } = await downscaleImage(file)
      setImage({ image: dataUrl, imageAspect: aspect, imageZoom: 1, imagePosX: 0.5, imagePosY: 0.5 })
    } catch {
      alert('Could not process that image. Please try another file.')
    }
    e.target.value = ''
  }

  const removeImage = () => setImage({})

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    if (!title.trim()) {
      alert('Please enter a title for your article.')
      return
    }

    if (isHtmlEmpty(content)) {
      alert('Please enter article content.')
      return
    }

    if (!image.image) {
      alert('Please upload an image for your article.')
      return
    }

    if (!contact.trim()) {
      alert('Please provide your contact information.')
      return
    }

    const hasButton = !!(button && button.label.trim() && button.url.trim())

    setIsSubmitting(true)
    try {
      await saveArticle({
        template: selectedTemplate,
        title: title.trim(),
        content: sanitizeHtml(content),
        imageDataUrl: image.image,
        contact: contact.trim(),
        chapter: chapter.trim() || undefined,
        button: hasButton ? { label: button!.label.trim(), url: button!.url.trim() } : undefined,
        imageAspect: image.imageAspect,
        imageZoom: image.imageZoom,
        imagePosX: image.imagePosX,
        imagePosY: image.imagePosY,
      })

      alert('Article submitted successfully! Thank you for your contribution.')

      // Reset form
      setChapter('')
      setTitle('')
      setContent('')
      setContact('')
      setImage({})
      setButton(undefined)
      setSelectedTemplate('portrait')

      // Navigate to home or stay on page
      navigate('/')
    } catch (error) {
      console.error('Error submitting article:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to submit article. Please try again.'
      alert(`Error: ${errorMessage}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Value shown in the chapter picker: the canonical title, empty, or "Other…".
  const chapterSelectValue = isCanonicalChapterTitle(chapter)
    ? chapter
    : chapter.trim() === ''
      ? ''
      : 'Other...'

  return (
    <form onSubmit={handleSubmit} className="nl-editor submit-article-page">
      {/* Floating action toolbar (matches the newsletter editor) */}
      <div className="nl-toolbar">
        <div className="nl-toolbar-left">
          <button type="button" onClick={() => navigate(-1)} className="button secondary">
            ← Back
          </button>
          <span className="nl-toolbar-title">Submit Article</span>
        </div>
        <div className="nl-toolbar-right">
          <button type="button" onClick={() => navigate(-1)} className="button secondary">
            Cancel
          </button>
          <button type="submit" disabled={isSubmitting} className="button primary">
            {isSubmitting ? 'Submitting…' : 'Submit Article'}
          </button>
        </div>
      </div>

      <p className="nl-hint">
        Pick a chapter and layout, add your image, then write your article — this is how it will look.
      </p>

      <div className="nl-canvas submit-canvas">
        <div className="nl-article-edit">
          {/* Chapter picker — which section this article belongs to. */}
          <div className="submit-chapter-field">
            <label className="submit-field-label" htmlFor="submit-chapter">
              Chapter
            </label>
            <select
              id="submit-chapter"
              className="nl-chapter-select"
              value={chapterSelectValue}
              onChange={(e) => {
                if (e.target.value === 'Other...') {
                  setChapter(' ')
                } else {
                  setChapter(e.target.value)
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
            {chapter !== '' && !isCanonicalChapterTitle(chapter) && (
              <input
                className="nl-chapter-custom"
                type="text"
                value={chapter.trimStart()}
                onChange={(e) => setChapter(e.target.value)}
                placeholder="Custom chapter name…"
              />
            )}
          </div>

          {/* Layout choice (same boxes as the newsletter editor) */}
          <div className="nl-article-topbar nl-article-topbar--two">
            {(['portrait', 'landscape'] as ArticleTemplate[]).map((layout) => (
              <button
                key={layout}
                type="button"
                className={`nl-layout-box ${selectedTemplate === layout ? 'selected' : ''}`}
                onClick={() => setSelectedTemplate(layout)}
                aria-pressed={selectedTemplate === layout}
              >
                <span className={`layout-glyph layout-glyph--${layout}`} aria-hidden="true" />
                <span className="nl-layout-name">
                  {layout === 'portrait' ? 'Portrait' : 'Landscape'}
                </span>
              </button>
            ))}
          </div>

          <div className={`article-layout article-layout--${selectedTemplate}`}>
            <div className="article-image-col">
              <ArticleImageEditor
                article={{ ...image, template: selectedTemplate }}
                onUpload={handleImageUpload}
                onChange={(updates) => setImage((prev) => ({ ...prev, ...updates }))}
                onRemove={removeImage}
              />
            </div>

            <div className="article-content-col">
              <input
                className="nl-article-title-input nl-article-title-block"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Article title…"
                maxLength={140}
                aria-label="Article title"
              />
              <RichTextEditor
                content={content}
                onChange={setContent}
                placeholder="Write your article (a few sentences)…"
                enableRefine
              />
              <input
                className="nl-contact-input"
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="Contact: Your name, email or phone"
                maxLength={200}
              />
              {button !== undefined ? (
                <div className="nl-article-button-edit">
                  <div className="nl-article-button-row">
                    <input
                      type="text"
                      value={button.label}
                      onChange={(e) => setButton({ label: e.target.value, url: button.url })}
                      placeholder="Button label"
                      maxLength={60}
                    />
                    <input
                      type="text"
                      value={button.url}
                      onChange={(e) => setButton({ label: button.label, url: e.target.value })}
                      placeholder="Button link (e.g. google.com)"
                    />
                  </div>
                  <button
                    type="button"
                    className="nl-remove-button-link"
                    onClick={() => setButton(undefined)}
                  >
                    Remove button
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="nl-add-button-ghost"
                  onClick={() => setButton({ label: '', url: '' })}
                >
                  ＋ Add button to this article
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </form>
  )
}


