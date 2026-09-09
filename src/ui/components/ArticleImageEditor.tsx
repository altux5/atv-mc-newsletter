import { useRef } from 'react'
import { ARTICLE_CROP, aspectRatioCss, articleImageBg } from '../../utils/imageCrop'

/**
 * The subset of article image fields this editor reads and writes. Both
 * NewsletterArticle (create/edit newsletter) and the submit-article form state
 * satisfy this shape structurally, so the same drag-to-pan / zoom editor is
 * shared by both pages.
 */
export interface ArticleImageValue {
  image?: string // base64 source image (downscaled, NOT pre-cropped)
  imageAspect?: number // natural width/height of the source image
  imageZoom?: number // 1..3 pan/zoom scale within the frame
  imagePosX?: number // 0..1 horizontal focus
  imagePosY?: number // 0..1 vertical focus
  template: 'portrait' | 'landscape'
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** Background style (cover + pan/zoom) for the image inside its fixed frame. */
function articleImageStyle(article: ArticleImageValue): React.CSSProperties {
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

/** Editable image frame: drag to pan, slider/buttons to zoom, replace/remove. */
export default function ArticleImageEditor({
  article,
  onUpload,
  onChange,
  onRemove,
}: {
  article: ArticleImageValue
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  onChange: (updates: Partial<ArticleImageValue>) => void
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
