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
    <div className="submit-article-page">
      <div className="page-header">
        <h1 style={{ color: 'var(--brand)', margin: 0 }}>Submit Your Article</h1>
        <p className="meta" style={{ marginTop: 8 }}>
          Share your content with our newsletter community
        </p>
      </div>

      <form onSubmit={handleSubmit} className="article-form">
        {/* Article Title */}
        <section className="form-section">
          <div className="form-group">
            <label htmlFor="title">Article Title *</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter your article title"
              maxLength={140}
              required
            />
          </div>
        </section>

        {/* Layout */}
        <section className="form-section">
          <h2>Layout</h2>
          <div className="layout-toggle">
            {(['portrait', 'landscape'] as ArticleTemplate[]).map((layout) => (
              <label
                key={layout}
                className={`layout-option ${selectedTemplate === layout ? 'selected' : ''}`}
              >
                <input
                  type="radio"
                  name="template"
                  value={layout}
                  checked={selectedTemplate === layout}
                  onChange={() => setSelectedTemplate(layout)}
                />
                <span className={`layout-glyph layout-glyph--${layout}`} aria-hidden="true" />
                <span className="layout-name">
                  {layout === 'portrait' ? 'Portrait' : 'Landscape'}
                  <span className="meta">
                    {layout === 'portrait' ? ' image left · W200×H600' : ' image top · W600×H200'}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <p className="meta" style={{ marginTop: 10 }}>
            Portrait suits events, product news, kits and team news. Landscape suits design wins,
            success stories and market news.
          </p>
        </section>

        {/* Article: image + content laid out by the selected template */}
        <section className="form-section">
          <h2>Article *</h2>
          <div className={`article-layout article-layout--${selectedTemplate}`}>
            <div className="article-image-col">
              <label>Article Image *</label>
              <div
                className="article-image-box"
                style={{ aspectRatio: aspectRatioCss(ARTICLE_CROP[selectedTemplate]) }}
              >
                {imagePreview ? (
                  <>
                    <img src={imagePreview} alt="Article preview" />
                    <button
                      type="button"
                      onClick={removeImage}
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
                      onChange={handleImageUpload}
                      style={{ display: 'none' }}
                    />
                  </label>
                )}
              </div>
              <p className="meta" style={{ marginTop: 6 }}>
                Auto-cropped to {selectedTemplate === 'portrait' ? 'W200×H600' : 'W600×H200'}. Max 10MB.
              </p>
            </div>

            <div className="article-content-col">
              <div className="form-group">
                <label htmlFor="content">Article Content *</label>
                <textarea
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Write your article content..."
                  rows={8}
                  required
                />
                <p className="meta" style={{ marginTop: 4 }}>
                  {content.trim().split(/\s+/).filter((w) => w).length} words
                </p>
              </div>

              <div className="form-group">
                <label htmlFor="contact">Contact Information *</label>
                <input
                  id="contact"
                  type="text"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="Contact: Your Name, Email, or Phone"
                  maxLength={200}
                  required
                />
              </div>
            </div>
          </div>
        </section>

        {/* Submit Button */}
        <div className="form-actions">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="button secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="button primary"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Article'}
          </button>
        </div>
      </form>
    </div>
  )
}

