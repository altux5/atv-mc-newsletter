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
