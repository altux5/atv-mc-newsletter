// Image cropping helper.
//
// Articles look uneven when contributors upload images of wildly different
// shapes. To keep every article image the same size, we auto-crop uploads to a
// fixed aspect ratio using a center "cover" crop (same behaviour as
// `object-fit: cover`) and downscale to a sensible bound. This happens silently
// on upload, so the contributor workflow does not change.

export interface CropRatio {
  /** Aspect ratio width unit. */
  ratioW: number
  /** Aspect ratio height unit. */
  ratioH: number
  /** Max output width in px (output is downscaled to fit, ratio preserved). */
  maxW: number
  /** Max output height in px. */
  maxH: number
}

/**
 * Target ratios per layout. Portrait article images are tall (W300×H500), while
 * landscape images span the full article width as a thin band (≈3.5:1, so they
 * "hug" the box like the header). The newsletter header is 2:1.
 */
export const ARTICLE_CROP: Record<'portrait' | 'landscape', CropRatio> = {
  portrait: { ratioW: 300, ratioH: 500, maxW: 600, maxH: 1000 },
  landscape: { ratioW: 1400, ratioH: 400, maxW: 1400, maxH: 400 },
}

export const HEADER_CROP: CropRatio = { ratioW: 800, ratioH: 400, maxW: 1600, maxH: 800 }

/** Aspect-ratio string (e.g. "200 / 600") for CSS `aspect-ratio`. */
export function aspectRatioCss(ratio: CropRatio): string {
  return `${ratio.ratioW} / ${ratio.ratioH}`
}

/**
 * Background size+position for rendering an article image inside a fixed-ratio
 * frame with pan/zoom. The image is sized to "cover" the frame at zoom 1, then
 * scaled by `zoom`; `posX/posY` (0..1) choose which part shows. The SAME math is
 * used by the editor (React style) and the generator (inline CSS string) so the
 * published newsletter matches the editor exactly.
 */
export function articleImageBg(
  ratio: CropRatio,
  imageAspect: number | undefined,
  zoom: number | undefined,
  posX: number | undefined,
  posY: number | undefined,
): { backgroundSize: string; backgroundPosition: string } {
  const px = ((posX ?? 0.5) * 100).toFixed(2)
  const py = ((posY ?? 0.5) * 100).toFixed(2)
  const position = `${px}% ${py}%`

  // Unknown aspect (legacy drafts / pre-cropped imported images): plain cover so
  // the image is never distorted. Pan/zoom only applies once a real aspect is known.
  if (!imageAspect || imageAspect <= 0) {
    return { backgroundSize: 'cover', backgroundPosition: position }
  }

  const frameAspect = ratio.ratioW / ratio.ratioH
  const z = zoom && zoom > 0 ? zoom : 1
  let w: number
  let h: number
  if (imageAspect >= frameAspect) {
    h = 100
    w = (imageAspect / frameAspect) * 100
  } else {
    w = 100
    h = (frameAspect / imageAspect) * 100
  }
  return {
    backgroundSize: `${(w * z).toFixed(2)}% ${(h * z).toFixed(2)}%`,
    backgroundPosition: position,
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = src
  })
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target?.result as string)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

/**
 * Downscale an uploaded image (preserving aspect) and return the data URL plus
 * its natural aspect ratio. The full image is kept (NOT cropped) so the editor
 * can pan/zoom freely; cropping happens visually via {@link articleImageBg}.
 */
export async function downscaleImage(
  file: File,
  maxDim = 1400,
  quality = 0.85,
): Promise<{ dataUrl: string; aspect: number }> {
  const original = await readFileAsDataUrl(file)
  let img: HTMLImageElement
  try {
    img = await loadImage(original)
  } catch {
    return { dataUrl: original, aspect: 1 }
  }
  const aspect = img.width / img.height
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
  const outW = Math.max(1, Math.round(img.width * scale))
  const outH = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!ctx) return { dataUrl: original, aspect }
  ctx.drawImage(img, 0, 0, outW, outH)
  return { dataUrl: canvas.toDataURL('image/jpeg', quality), aspect }
}

/**
 * Center-crop `file` to the target ratio and return a base64 JPEG data URL.
 * Falls back to the original data URL if canvas processing is unavailable.
 */
export async function cropImageToRatio(
  file: File,
  ratio: CropRatio,
  quality = 0.82,
): Promise<string> {
  const dataUrl = await readFileAsDataUrl(file)
  let img: HTMLImageElement
  try {
    img = await loadImage(dataUrl)
  } catch {
    return dataUrl
  }

  const targetAr = ratio.ratioW / ratio.ratioH

  // Output dimensions: fill the max box while preserving the target ratio.
  let outW = ratio.maxW
  let outH = Math.round(outW / targetAr)
  if (outH > ratio.maxH) {
    outH = ratio.maxH
    outW = Math.round(outH * targetAr)
  }

  // Source crop region ("cover"): keep the center, trim the overflow axis.
  const sourceAr = img.width / img.height
  let sx = 0
  let sy = 0
  let sW = img.width
  let sH = img.height
  if (sourceAr > targetAr) {
    // Source is wider than target → crop the sides.
    sW = Math.round(img.height * targetAr)
    sx = Math.round((img.width - sW) / 2)
  } else {
    // Source is taller than target → crop top/bottom.
    sH = Math.round(img.width / targetAr)
    sy = Math.round((img.height - sH) / 2)
  }

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  ctx.drawImage(img, sx, sy, sW, sH, 0, 0, outW, outH)
  return canvas.toDataURL('image/jpeg', quality)
}
