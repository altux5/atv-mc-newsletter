import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ArticleTemplate } from '../../types/article'
import { saveArticle } from '../../utils/articlesApi'
import { cropImageToRatio, ARTICLE_CROP, aspectRatioCss } from '../../utils/imageCrop'

export default function SubmitArticlePage() {
  const navigate = useNavigate()
  const [selectedTemplate, setSelectedTemplate] = useState<ArticleTemplate>('portrait')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [contact, setContact] = useState('')
  const [imageDataUrl, setImageDataUrl] = useState('')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      alert('Image size must be less than 10MB. Please use a smaller image.')
      return
    }
    try {
      // Auto-crop to the selected layout ratio so every article image is uniform.
      const cropped = await cropImageToRatio(file, ARTICLE_CROP[selectedTemplate])
      setImageDataUrl(cropped)
      setImagePreview(cropped)
    } catch {
      alert('Could not process that image. Please try another file.')
    }
    e.target.value = ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    if (!title.trim()) {
      alert('Please enter a title for your article.')
      return
    }

    if (!content.trim()) {
      alert('Please enter article content.')
      return
    }

    if (!imageDataUrl) {
      alert('Please upload an image for your article.')
      return
    }

    if (!contact.trim()) {
      alert('Please provide your contact information.')
      return
    }

    setIsSubmitting(true)
    try {
      await saveArticle({
        template: selectedTemplate,
        title: title.trim(),
        content: content.trim(),
        imageDataUrl,
        contact: contact.trim(),
      })

      alert('Article submitted successfully! Thank you for your contribution.')
      
      // Reset form
      setTitle('')
      setContent('')
      setContact('')
      setImageDataUrl('')
      setImagePreview(null)
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

  const removeImage = () => {
    setImageDataUrl('')
    setImagePreview(null)
  }

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
        Pick a layout, add your image, then write your article — this is how it will look.
      </p>

      <div className="nl-canvas submit-canvas">
        <div className="nl-article-edit">
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
              <div
                className="nl-img-frame"
                style={{ aspectRatio: aspectRatioCss(ARTICLE_CROP[selectedTemplate]) }}
              >
                {imagePreview ? (
                  <img src={imagePreview} alt="Article" />
                ) : (
                  <label className="article-image-drop">
                    <span>📷 Upload</span>
                    <input type="file" accept="image/*" hidden onChange={handleImageUpload} />
                  </label>
                )}
              </div>
              {imagePreview && (
                <div className="nl-img-controls">
                  <label className="button small secondary nl-img-replace">
                    Replace
                    <input type="file" accept="image/*" hidden onChange={handleImageUpload} />
                  </label>
                  <button type="button" className="button small danger" onClick={removeImage}>
                    Remove
                  </button>
                </div>
              )}
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
              <textarea
                className="nl-content-input"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your article (a few sentences)…"
                rows={8}
              />
              <input
                className="nl-contact-input"
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="Contact: Your name, email or phone"
                maxLength={200}
              />
            </div>
          </div>
        </div>
      </div>
    </form>
  )
}

