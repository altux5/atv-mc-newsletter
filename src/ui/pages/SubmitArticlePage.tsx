import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ArticleTemplate } from '../../types/article'
import { saveArticle } from '../../utils/articlesApi'

export default function SubmitArticlePage() {
  const navigate = useNavigate()
  const [selectedTemplate, setSelectedTemplate] = useState<ArticleTemplate>('portrait')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [contact, setContact] = useState('')
  const [imageDataUrl, setImageDataUrl] = useState('')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const compressImage = (file: File, maxWidth: number, maxHeight: number, quality: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (event) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          let width = img.width
          let height = img.height

          // Calculate new dimensions
          if (width > height) {
            if (width > maxWidth) {
              height = (height * maxWidth) / width
              width = maxWidth
            }
          } else {
            if (height > maxHeight) {
              width = (width * maxHeight) / height
              height = maxHeight
            }
          }

          canvas.width = width
          canvas.height = height

          const ctx = canvas.getContext('2d')
          if (!ctx) {
            reject(new Error('Could not get canvas context'))
            return
          }

          ctx.drawImage(img, 0, 0, width, height)
          const compressedDataUrl = canvas.toDataURL('image/jpeg', quality)
          resolve(compressedDataUrl)
        }
        img.onerror = () => reject(new Error('Failed to load image'))
        img.src = event.target?.result as string
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert('Image size must be less than 10MB. Please use a smaller image.')
        return
      }
      
      try {
        // Compress image to reduce localStorage size
        // For portrait: max 600x800, for landscape: max 1200x400
        const maxWidth = selectedTemplate === 'portrait' ? 600 : 1200
        const maxHeight = selectedTemplate === 'portrait' ? 800 : 400
        const compressedDataUrl = await compressImage(file, maxWidth, maxHeight, 0.8)
        
        // Check compressed size (approximate - base64 is about 33% larger than binary)
        // Remove data URL prefix to get approximate size
        const base64Data = compressedDataUrl.split(',')[1] || ''
        const sizeInMB = (base64Data.length * 3) / 4 / (1024 * 1024)
        
        if (sizeInMB > 2) {
          // Try more aggressive compression
          const moreCompressed = await compressImage(file, maxWidth, maxHeight, 0.6)
          setImageDataUrl(moreCompressed)
          setImagePreview(moreCompressed)
        } else {
          setImageDataUrl(compressedDataUrl)
          setImagePreview(compressedDataUrl)
        }
      } catch (error) {
        console.error('Error compressing image:', error)
        // Fallback to original if compression fails
        const reader = new FileReader()
        reader.onload = (event) => {
          const dataUrl = event.target?.result as string
          setImageDataUrl(dataUrl)
          setImagePreview(dataUrl)
        }
        reader.readAsDataURL(file)
      }
    }
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

    const wordCount = content.trim().split(/\s+/).length
    if (wordCount < 15 || wordCount > 100) {
      alert('Article content should be 3-4 sentences (approximately 15-100 words).')
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
        {/* Template Selection */}
        <section className="form-section">
          <h2>Select Template</h2>
          <p className="meta" style={{ marginTop: 0, marginBottom: 16 }}>
            Choose the template that best fits your article type
          </p>

          <div className="template-selection">
            <label className={`template-card ${selectedTemplate === 'portrait' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="template"
                value="portrait"
                checked={selectedTemplate === 'portrait'}
                onChange={(e) => setSelectedTemplate(e.target.value as ArticleTemplate)}
              />
              <div className="template-preview portrait-preview">
                <div className="template-image">Image</div>
                <div className="template-text">Text Content</div>
              </div>
              <div className="template-info">
                <strong>Portrait Layout</strong>
                <span className="template-dimensions">Image: H600 × W200 (left)</span>
                <span className="template-dimensions">Text: H600 × W400 (right)</span>
              </div>
            </label>

            <label className={`template-card ${selectedTemplate === 'landscape' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="template"
                value="landscape"
                checked={selectedTemplate === 'landscape'}
                onChange={(e) => setSelectedTemplate(e.target.value as ArticleTemplate)}
              />
              <div className="template-preview landscape-preview">
                <div className="template-image">Image</div>
                <div className="template-text">Text Content</div>
              </div>
              <div className="template-info">
                <strong>Landscape Layout</strong>
                <span className="template-dimensions">Image: H200 × W600 (top)</span>
                <span className="template-dimensions">Text: H400 × W600 (bottom)</span>
              </div>
            </label>
          </div>

          <div className="template-recommendations">
            <h3>Template Recommendations</h3>
            <ul>
              <li>
                <strong>Portrait (H600 × W200):</strong> Best for Events, Product News, Applications, 
                New Kits, Eval Boards, Samples, Team News
              </li>
              <li>
                <strong>Landscape (W600 × H200):</strong> Best for Design Wins, Success Stories, 
                Business Wins, Market News
              </li>
            </ul>
          </div>
        </section>

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
              maxLength={100}
              required
            />
          </div>
        </section>

        {/* Image Upload */}
        <section className="form-section">
          <h2>Article Image *</h2>
          <p className="meta" style={{ marginTop: 0, marginBottom: 12 }}>
            {selectedTemplate === 'portrait' 
              ? 'Recommended dimensions: H600 × W200 pixels' 
              : 'Recommended dimensions: H200 × W600 pixels'}
          </p>

          {imagePreview ? (
            <div className="image-preview-container">
              <img src={imagePreview} alt="Article preview" className="article-image-preview" />
              <button
                type="button"
                onClick={removeImage}
                className="button small danger"
              >
                Remove Image
              </button>
            </div>
          ) : (
            <div className="image-upload-area">
              <label htmlFor="article-image" className="upload-label">
                <span>📷 Upload Image</span>
                <input
                  id="article-image"
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  style={{ display: 'none' }}
                />
              </label>
              <p className="meta" style={{ marginTop: 8 }}>
                Max file size: 5MB
              </p>
            </div>
          )}
        </section>

        {/* Article Content */}
        <section className="form-section">
          <div className="form-group">
            <label htmlFor="content">Article Content (3-4 sentences) *</label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your article content here (3-4 sentences)..."
              rows={6}
              maxLength={500}
              required
            />
            <p className="meta" style={{ marginTop: 4 }}>
              {content.trim().split(/\s+/).filter(w => w).length} words
            </p>
          </div>
        </section>

        {/* Contact Information */}
        <section className="form-section">
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
            <p className="meta" style={{ marginTop: 4 }}>
              This will appear at the bottom of your article
            </p>
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

