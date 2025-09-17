// Eagerly import all .htm files in src/newsletters both as raw strings and as URLs
// Raw strings work for UTF-8 files; URLs allow us to fetch and decode UTF-16 files.
const files = import.meta.glob('../newsletters/**/*.htm', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const fileUrls = import.meta.glob('../newsletters/**/*.htm', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>

import DOMPurify from 'dompurify'

const monthNames = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]

const monthAbbreviations: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  sept: 8,
  oct: 9,
  nov: 10,
  dec: 11,
}

// Common German month names occasionally appear in newsletter headers
const germanMonthNames: Record<string, number> = {
  januar: 0,
  februar: 1,
  märz: 2,
  maerz: 2,
  april: 3,
  mai: 4,
  juni: 5,
  juli: 6,
  august: 7,
  september: 8,
  oktober: 9,
  november: 10,
  dezember: 11,
}

export function findHtmlByMonthYear(
  monthIndexZeroBased: number,
  year: number
): { html: string; path: string } | null {
  const month = monthNames[monthIndexZeroBased]
  const yearStr = String(year)
  const yy = String(year % 100).padStart(2, '0')

  for (const [path, html] of Object.entries(files)) {
    const lower = path.toLowerCase()
    const hasMonth = lower.includes(month)
    const hasYear = lower.includes(yearStr) || lower.includes(` '${yy}`)
    if (hasMonth && hasYear) {
      return { html: decodePossiblyUtf16(html), path }
    }
  }

  return null
}

/** Async loader that fetches by URL and decodes UTF-16 when needed. */
export async function findHtmlByMonthYearAsync(
  monthIndexZeroBased: number,
  year: number
): Promise<{ html: string; path: string } | null> {
  const month = monthNames[monthIndexZeroBased]
  const yearStr = String(year)
  const yy = String(year % 100).padStart(2, '0')

  for (const [path, url] of Object.entries(fileUrls)) {
    const lower = path.toLowerCase()
    const hasMonth = lower.includes(month)
    const hasYear = lower.includes(yearStr) || lower.includes(` '${yy}`)
    if (!hasMonth || !hasYear) continue
    try {
      const res = await fetch(url)
      const buf = await res.arrayBuffer()
      const html = decodeArrayBuffer(buf)
      return { html, path }
    } catch (_e) {
      // Fallback to the raw import if fetch fails
      const raw = files[path]
      if (raw) return { html: decodePossiblyUtf16(raw), path }
    }
  }

  return null
}

/** Load a specific HTML file by its import path key (e.g., '../newsletters/Name.htm'). */
export async function loadHtmlByPathAsync(path: string): Promise<{ html: string; path: string } | null> {
  const url = fileUrls[path]
  if (!url) return null
  try {
    const res = await fetch(url)
    const buf = await res.arrayBuffer()
    const html = decodeArrayBuffer(buf)
    return { html, path }
  } catch (_e) {
    const raw = (files as Record<string, string>)[path]
    if (raw) return { html: decodePossiblyUtf16(raw), path }
    return null
  }
}

/**
 * Extracts the <body> inner HTML from a full HTML document string and sanitizes it
 * for safe inline rendering within our React application.
 */
export function extractAndSanitizeBodyHtml(htmlDocumentString: string): string {
  try {
    const normalized = decodePossiblyUtf16(htmlDocumentString)
    const parser = new DOMParser()
    const doc = parser.parseFromString(normalized, 'text/html')
    let bodyHtml = doc.body?.innerHTML ?? htmlDocumentString

    function collectOuterHTMLFromNodeToEnd(startNode: ChildNode): string {
      const parts: string[] = []
      let node: ChildNode | null = startNode
      while (node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          parts.push((node as HTMLElement).outerHTML)
        } else if (node.nodeType === Node.TEXT_NODE) {
          parts.push(node.textContent || '')
        }
        node = node.nextSibling
      }
      return parts.join('')
    }

    // Try to start rendering from the main newsletter container instead of mail headers
    const startAnchors: string[] = [
      '#idHeader_Additional',
      '#nlHeader',
      '#idSortable',
      'table.MsoNormalTable[width="100%"][style*="background:whitesmoke"]',
    ]
    let startElement: Element | null = null
    for (const selector of startAnchors) {
      const el = doc.querySelector(selector)
      if (el) {
        startElement = el
        break
      }
    }
    if (startElement) {
      let container: Element | null = startElement
      // Use the nearest table container if available
      const tableAncestor = startElement.closest('table')
      if (tableAncestor) container = tableAncestor
      bodyHtml = collectOuterHTMLFromNodeToEnd(container as HTMLElement)
    } else {
      // Fallback: skip any preamble text by slicing the body's HTML from the first <table> onwards
      const bodyInner = doc.body?.innerHTML || normalized
      const idx = bodyInner.toLowerCase().indexOf('<table')
      if (idx >= 0) {
        bodyHtml = bodyInner.slice(idx)
      }
    }

    // Sanitize aggressively: block executable/embedding tags and inline handlers
    const sanitized = DOMPurify.sanitize(bodyHtml, {
      ALLOW_UNKNOWN_PROTOCOLS: false,
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'link', 'meta', 'style'],
      FORBID_ATTR: ['onload', 'onclick', 'onerror'],
      ADD_ATTR: ['target', 'rel'],
    })

    // Ensure external links open in a new tab and are safe
    const container = document.createElement('div')
    container.innerHTML = sanitized
    const anchors = container.querySelectorAll('a[href]')
    anchors.forEach((a) => {
      const href = a.getAttribute('href') || ''
      const isHttp = href.startsWith('http://') || href.startsWith('https://')
      if (isHttp) {
        a.setAttribute('target', '_blank')
        a.setAttribute('rel', 'noopener noreferrer')
      }
    })

    // Assign stable ids to headings so we can deep-link to sections
    assignStableHeadingIds(container)

    return container.innerHTML
  } catch (_e) {
    // Fallback to a minimal sanitize if DOMParser fails
    return DOMPurify.sanitize(htmlDocumentString)
  }
}

/** Returns plain text content extracted from the same start container as we render. */
export function extractBodyText(htmlDocumentString: string): string {
  try {
    const normalized = decodePossiblyUtf16(htmlDocumentString)
    const parser = new DOMParser()
    const doc = parser.parseFromString(normalized, 'text/html')

    const startAnchors: string[] = [
      '#idHeader_Additional',
      '#nlHeader',
      '#idSortable',
      'table.MsoNormalTable[width="100%"][style*="background:whitesmoke"]',
    ]
    let startElement: Element | null = null
    for (const selector of startAnchors) {
      const el = doc.querySelector(selector)
      if (el) {
        startElement = el
        break
      }
    }

    let container: HTMLElement | null = null
    if (startElement) {
      const tableAncestor = startElement.closest('table')
      const start = (tableAncestor as HTMLElement) || (startElement as HTMLElement)
      const temp = doc.createElement('div')
      let node: ChildNode | null = start
      while (node) {
        temp.appendChild(node.cloneNode(true))
        node = node.nextSibling
      }
      container = temp
    } else {
      // Slice from first <table> in body for text extraction
      const bodyInner = doc.body?.innerHTML || normalized
      const idx = bodyInner.toLowerCase().indexOf('<table')
      const sliced = idx >= 0 ? bodyInner.slice(idx) : bodyInner
      const temp = doc.createElement('div')
      temp.innerHTML = sliced
      container = temp
    }

    const text = (container || doc.body).textContent || ''
    return text.replace(/\s+/g, ' ').trim()
  } catch (_e) {
    return htmlDocumentString
  }
}

/** Extract the first non-empty paragraph's plain text from the newsletter body. */
export function extractFirstParagraphText(htmlDocumentString: string): string {
  try {
    const normalized = decodePossiblyUtf16(htmlDocumentString)
    const parser = new DOMParser()
    const doc = parser.parseFromString(normalized, 'text/html')

    const startAnchors: string[] = [
      '#idHeader_Additional',
      '#nlHeader',
      '#idSortable',
      'table.MsoNormalTable[width="100%"][style*="background:whitesmoke"]',
    ]

    let container: HTMLElement | null = null
    for (const selector of startAnchors) {
      const el = doc.querySelector(selector)
      if (el) {
        const tableAncestor = el.closest('table')
        container = (tableAncestor as HTMLElement) || (el as HTMLElement)
        break
      }
    }

    if (!container) {
      const bodyInner = doc.body?.innerHTML || normalized
      const idx = bodyInner.toLowerCase().indexOf('<table')
      const sliced = idx >= 0 ? bodyInner.slice(idx) : bodyInner
      const temp = doc.createElement('div')
      temp.innerHTML = sliced
      container = temp
    }

    // Prefer real <p> elements
    const paragraphs = Array.from(container.querySelectorAll('p')) as HTMLParagraphElement[]
    for (const p of paragraphs) {
      const text = (p.textContent || '').replace(/\s+/g, ' ').trim()
      if (text) return text
    }

    // Fallback to any text within the container
    const fallback = (container.textContent || '').replace(/\s+/g, ' ').trim()
    return fallback
  } catch (_e) {
    return htmlDocumentString
  }
}

/** Extract a meaningful first paragraph as plain text, skipping Word/Office boilerplate. */
export function extractFirstMeaningfulParagraphText(htmlDocumentString: string): string {
  try {
    const sanitized = extractAndSanitizeBodyHtml(htmlDocumentString)
    const container = document.createElement('div')
    container.innerHTML = sanitized

    const isGarbage = (text: string): boolean => {
      const t = text.toLowerCase()
      if (t.length < 40) return true
      if (/[{}#@;]|mso|vml|word\s*document|lsdexception|colorschememapping|themedata|editdata|filelist|xml/i.test(text)) return true
      // Many non-letters or too many numbers likely boilerplate
      const letters = (text.match(/[a-zA-Z]/g) || []).length
      if (letters / Math.max(1, text.length) < 0.5) return true
      return false
    }

    const paragraphs = Array.from(container.querySelectorAll('p')) as HTMLParagraphElement[]
    for (const p of paragraphs) {
      const text = (p.textContent || '').replace(/\s+/g, ' ').trim()
      if (!text) continue
      if (!isGarbage(text)) return text
    }

    // Fallback: take the first sentence from the extracted body text
    const bodyText = extractBodyText(htmlDocumentString)
    const cleaned = bodyText.replace(/\s+/g, ' ').trim()
    const sentences = cleaned.split(/(?<=[.!?])\s+/)
    const candidate = sentences.find((s) => s && !isGarbage(s)) || cleaned
    return candidate.length > 0 ? candidate : ''
  } catch (_e) {
    return extractBodyText(htmlDocumentString)
  }
}

/** Parse month index (0-11) and 4-digit year from a newsletter import path or filename. */
export function parseMonthYearFromPath(pathOrName: string): { monthIndex: number; year: number } | null {
  const lower = pathOrName.toLowerCase()
  let monthIndex = -1

  for (let i = 0; i < monthNames.length; i++) {
    if (lower.includes(monthNames[i])) {
      monthIndex = i
      break
    }
  }

  if (monthIndex === -1) {
    for (const [abbr, idx] of Object.entries(monthAbbreviations)) {
      // Match standalone abbr or abbr immediately followed by digits like "nov22"
      const re = new RegExp(`\\b${abbr}(?=\\b|\\d)`, 'i')
      if (re.test(lower)) {
        monthIndex = idx
        break
      }
    }
  }
  if (monthIndex === -1) return null

  const year4 = lower.match(/\b(19|20)\d{2}\b/)
  if (year4) return { monthIndex, year: Number(year4[0]) }

  const year2 = lower.match(/(?:^|[^0-9])'?([0-9]{2})(?![0-9])/)
  if (year2) return { monthIndex, year: 2000 + Number(year2[1]) }

  return null
}

/** Try extracting month/year from the newsletter HTML body text. */
export function extractMonthYearFromHtml(htmlDocumentString: string): { monthIndex: number; year: number } | null {
  try {
    const text = extractBodyText(htmlDocumentString)
    const lower = text.toLowerCase()

    // Build regex parts
    const fullMonths = monthNames.join('|')
    const germanFull = Object.keys(germanMonthNames).join('|')
    const abbrMonths = Object.keys(monthAbbreviations).join('|')

    // 1) Match e.g. "September 2023" or "Sep '23" or "Sep 23"
    const pattern1 = new RegExp(`\\b(${fullMonths}|${germanFull}|${abbrMonths})\\s*[,-]?\\s*(?:'(\\d{2})|(\\d{4})|(\\d{2}))\\b`)
    const m1 = lower.match(pattern1)
    if (m1) {
      const monthToken = m1[1]
      const year4 = m1[3]
      const year2a = m1[2]
      const year2b = m1[4]
      const yearNum = year4 ? Number(year4) : 2000 + Number(year2a || year2b)
      let monthIndex = monthNames.indexOf(monthToken)
      if (monthIndex === -1 && monthToken in germanMonthNames) monthIndex = germanMonthNames[monthToken as keyof typeof germanMonthNames]
      if (monthIndex === -1) monthIndex = monthAbbreviations[monthToken as keyof typeof monthAbbreviations]
      if (monthIndex != null && monthIndex >= 0 && yearNum >= 2000 && yearNum < 2100) {
        return { monthIndex, year: yearNum }
      }
    }

    // 2) Match compact forms like "nov22"
    const pattern2 = new RegExp(`\\b(${abbrMonths})(\\d{2})(?!\\d)`) // abbr + 2 digits
    const m2 = lower.match(pattern2)
    if (m2) {
      const abbr = m2[1]
      const yy = Number(m2[2])
      const monthIndex = monthAbbreviations[abbr as keyof typeof monthAbbreviations]
      return { monthIndex, year: 2000 + yy }
    }

    // 3) Fallback: find any 4-digit year and a nearby month token within proximity (same line or within 400 chars)
    const y4All = Array.from(lower.matchAll(/\b(20)\d{2}\b/g))
    if (y4All.length > 0) {
      // Search for the nearest month token around each year occurrence
      const monthRegex = new RegExp(`(${fullMonths}|${germanFull}|${abbrMonths})`, 'g')
      const monthMatches = Array.from(lower.matchAll(monthRegex))
      for (const y of y4All) {
        const yIndex = y.index ?? 0
        let best: { dist: number; monthIndex: number; year: number } | null = null
        for (const m of monthMatches) {
          const mIndex = m.index ?? 0
          const dist = Math.abs(mIndex - yIndex)
          if (dist <= 400) {
            const token = m[1]
            let mi = monthNames.indexOf(token)
            if (mi === -1 && token in germanMonthNames) mi = germanMonthNames[token as keyof typeof germanMonthNames]
            if (mi === -1) mi = monthAbbreviations[token as keyof typeof monthAbbreviations]
            if (mi >= 0) {
              if (!best || dist < best.dist) best = { dist, monthIndex: mi, year: Number(y[0]) }
            }
          }
        }
        if (best) return { monthIndex: best.monthIndex, year: best.year }
      }
    }

    return null
  } catch (_e) {
    return null
  }
}

/** Extract month/year using only raw text regex (no DOM), robust to UTF-16 NULs. */
export function extractMonthYearFromRawText(raw: string): { monthIndex: number; year: number } | null {
  try {
    const normalized = raw ? raw.replace(/\u0000/g, '') : raw
    const lower = (normalized || '').toLowerCase()
    const fullMonths = monthNames.join('|')
    const germanFull = Object.keys(germanMonthNames).join('|')
    const abbrMonths = Object.keys(monthAbbreviations).join('|')

    const pattern1 = new RegExp(`\\b(${fullMonths}|${germanFull}|${abbrMonths})\\s*[,-]?\\s*(?:'(\\d{2})|(\\d{4})|(\\d{2}))\\b`)
    const m1 = lower.match(pattern1)
    if (m1) {
      const token = m1[1]
      const year4 = m1[3]
      const year2a = m1[2]
      const year2b = m1[4]
      const yearNum = year4 ? Number(year4) : 2000 + Number(year2a || year2b)
      let monthIndex = monthNames.indexOf(token)
      if (monthIndex === -1 && token in germanMonthNames) monthIndex = germanMonthNames[token as keyof typeof germanMonthNames]
      if (monthIndex === -1) monthIndex = monthAbbreviations[token as keyof typeof monthAbbreviations]
      if (monthIndex >= 0 && yearNum >= 2000 && yearNum < 2100) return { monthIndex, year: yearNum }
    }

    const pattern2 = new RegExp(`\\b(${abbrMonths})(\\d{2})(?!\\d)`, 'g')
    const m2 = pattern2.exec(lower)
    if (m2) {
      const abbr = m2[1]
      const yy = Number(m2[2])
      const monthIndex = monthAbbreviations[abbr as keyof typeof monthAbbreviations]
      return { monthIndex, year: 2000 + yy }
    }

    const y4All = Array.from(lower.matchAll(/\b(20)\d{2}\b/g))
    if (y4All.length > 0) {
      const monthRegex = new RegExp(`(${fullMonths}|${germanFull}|${abbrMonths})`, 'g')
      const monthMatches = Array.from(lower.matchAll(monthRegex))
      for (const y of y4All) {
        const yIndex = y.index ?? 0
        let best: { dist: number; monthIndex: number; year: number } | null = null
        for (const m of monthMatches) {
          const mIndex = m.index ?? 0
          const dist = Math.abs(mIndex - yIndex)
          if (dist <= 400) {
            const token = m[1]
            let mi = monthNames.indexOf(token)
            if (mi === -1 && token in germanMonthNames) mi = germanMonthNames[token as keyof typeof germanMonthNames]
            if (mi === -1) mi = monthAbbreviations[token as keyof typeof monthAbbreviations]
            if (mi >= 0) {
              if (!best || dist < best.dist) best = { dist, monthIndex: mi, year: Number(y[0]) }
            }
          }
        }
        if (best) return { monthIndex: best.monthIndex, year: best.year }
      }
    }

    return null
  } catch (_e) {
    return null
  }
}

/**
 * Some of our source .htm files are saved by Word as UTF-16 ("unicode").
 * When imported as raw strings, they may contain many NUL (\u0000) characters
 * or appear garbled. This function attempts to reconstruct the original bytes
 * and decode them as UTF-16LE. If that fails, it falls back to removing NULs.
 */
function decodePossiblyUtf16(raw: string): string {
  if (!raw) return raw
  const hasNulls = raw.indexOf('\u0000') !== -1
  const looksUtf16 = hasNulls || raw.startsWith('\uFEFF')
  if (!looksUtf16) return raw
  try {
    const buffer = new Uint8Array(raw.length * 2)
    for (let i = 0; i < raw.length; i++) {
      const codeUnit = raw.charCodeAt(i)
      buffer[i * 2] = codeUnit & 0xff
      buffer[i * 2 + 1] = codeUnit >> 8
    }
    const decoder = new TextDecoder('utf-16le')
    const decoded = decoder.decode(buffer)
    return decoded
  } catch (_e) {
    return raw.replace(/\u0000/g, '')
  }
}

/** Decode an ArrayBuffer, attempting UTF-16LE first if BOM indicates or if nulls present, otherwise UTF-8. */
function decodeArrayBuffer(buf: ArrayBuffer): string {
  const view = new Uint8Array(buf)
  // Check BOMs
  if (view.length >= 2) {
    const b0 = view[0]
    const b1 = view[1]
    if (b0 === 0xff && b1 === 0xfe) {
      return new TextDecoder('utf-16le').decode(buf)
    }
    if (b0 === 0xfe && b1 === 0xff) {
      return new TextDecoder('utf-16be').decode(buf)
    }
  }
  // Heuristic: many 0x00 bytes -> likely UTF-16LE without BOM
  let zeroCount = 0
  for (let i = 0; i < Math.min(view.length, 1024); i++) if (view[i] === 0) zeroCount++
  if (zeroCount > 50) {
    try {
      return new TextDecoder('utf-16le').decode(buf)
    } catch {}
  }
  // Default to UTF-8
  return new TextDecoder('utf-8').decode(buf)
}


/** Create a slug from heading text suitable for id attributes. */
function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

/** Ensure h1–h4 headings inside container have unique, stable id attributes. */
function assignStableHeadingIds(container: HTMLElement): void {
  const seen = new Map<string, number>()
  const headings = container.querySelectorAll('h1, h2, h3, h4')
  headings.forEach((h) => {
    const el = h as HTMLElement
    const existing = (el.getAttribute('id') || '').trim()
    if (existing) return
    const raw = (el.textContent || '').trim()
    if (!raw) return
    const base = slugifyHeading(raw) || 'section'
    const count = seen.get(base) || 0
    const id = count === 0 ? base : `${base}-${count + 1}`
    seen.set(base, count + 1)
    el.setAttribute('id', id)
  })
}

export type SectionSnippet = {
  id: string
  title: string
  level: 1 | 2 | 3 | 4
  html: string
  text: string
}

/**
 * Extract section snippets from a newsletter HTML string.
 * Each snippet contains the heading and content until the next heading.
 */
export function extractSectionSnippets(htmlDocumentString: string): SectionSnippet[] {
  try {
    const sanitizedBody = extractAndSanitizeBodyHtml(htmlDocumentString)
    const container = document.createElement('div')
    container.innerHTML = sanitizedBody
    // Ensure ids (extractAndSanitizeBodyHtml already calls this, but safe to re-assert)
    assignStableHeadingIds(container)

    // If the newsletter provides explicit chapter containers, use them as authoritative
    const chapterDivs = Array.from(container.querySelectorAll('div[id^="chapter_" i]')) as HTMLElement[]
    if (chapterDivs.length > 0) {
      const snippets: SectionSnippet[] = []
      const guessTitle = (root: HTMLElement): string => {
        // Prefer explicit anchor titles
        const aTitle = (root.querySelector('a[title]') as HTMLAnchorElement | null)?.getAttribute('title') || ''
        const cleanedATitle = (aTitle || '').replace(/\s+/g, ' ').trim()
        if (cleanedATitle) return cleanedATitle
        // Prefer strong/b headings within the container
        const strong = (root.querySelector('strong, b, h1, h2, h3, h4') as HTMLElement | null)
        const strongText = (strong?.textContent || '').replace(/\s+/g, ' ').trim()
        if (strongText) return strongText
        // Fallback to any visible text near the top
        const text = (root.textContent || '').replace(/\s+/g, ' ').trim()
        return text.split(/\s{2,}|\.|\!|\?/)[0] || 'Chapter'
      }

      for (let i = 0; i < chapterDivs.length; i++) {
        const cur = chapterDivs[i]
        const next = chapterDivs[i + 1] || null
        const id = cur.getAttribute('id') || `chapter-${i}`
        const title = guessTitle(cur)
        const level = 2 as 1 | 2 | 3 | 4

        const range = document.createRange()
        range.setStartBefore(cur)
        if (next) {
          range.setEndBefore(next)
        } else if (container.lastChild) {
          range.setEndAfter(container.lastChild)
        }
        const frag = range.cloneContents()
        const wrapper = document.createElement('div')
        wrapper.appendChild(frag)
        const html = wrapper.innerHTML
        const text = wrapper.textContent ? wrapper.textContent.replace(/\s+/g, ' ').trim() : title
        snippets.push({ id, title, level, html, text })
      }
      return snippets
    }

    // Heuristic: many newsletters use colored span headers (e.g., #0A8276)
    const headerSelectors = [
      'h1',
      'h2',
      'h3',
      'h4',
      'span[style*="color:#0a8276" i]',
      'span[style*="#0a8276" i]',
      'span[style*="font-size:13.5pt" i]'
    ]
    const chapterSelectors = [
      'a[name^="chapter_" i], a[name^="Chapter_" i]',
      'div[id^="chapter_" i], div[id^="Chapter_" i]'
    ]
    const headerCandidates = Array.from(
      container.querySelectorAll([...chapterSelectors, ...headerSelectors].join(','))
    ) as HTMLElement[]

    const snippets: SectionSnippet[] = []

    const getTitle = (el: HTMLElement): string => {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
      return text
    }

    // Build an array of anchors we treat as section starts. Prefer the row (tr) that contains the header
    const anchors = headerCandidates.map((el) => {
      // Determine an appropriate block start to capture from
      let startBlock: HTMLElement | null = null
      if (el.tagName.toLowerCase() === 'a' && (el.getAttribute('name') || '').toLowerCase().startsWith('chapter_')) {
        startBlock = (el.closest('table') as HTMLElement) || (el.closest('div[id^="chapter_" i]') as HTMLElement) || el
      } else if (el.tagName.toLowerCase() === 'div' && (el.getAttribute('id') || '').toLowerCase().startsWith('chapter_')) {
        startBlock = el
      } else {
        const tr = el.closest('tr') as HTMLElement | null
        startBlock = tr ? (tr.closest('table') as HTMLElement) || tr : el
      }

      const level = el.tagName.match(/^H[1-4]$/) ? (Number(el.tagName.substring(1)) as 1 | 2 | 3 | 4) : 2
      return {
        headerEl: el,
        anchorEl: startBlock || el,
        level,
        title: getTitle(el),
      }
    }).filter(a => a.title)

    // De-duplicate anchors that map to the same row or element
    const uniqueAnchors: typeof anchors = []
    const seen = new Set<HTMLElement>()
    for (const a of anchors) {
      if (seen.has(a.anchorEl)) continue
      seen.add(a.anchorEl)
      uniqueAnchors.push(a)
    }

    // Sort anchors in document order as querySelectorAll already does, but ensure stable
    const ordered = uniqueAnchors

    for (let i = 0; i < ordered.length; i++) {
      const cur = ordered[i]
      const next = ordered[i + 1] || null

      // Ensure the start block has an id for deep-linking
      let id = cur.anchorEl.getAttribute('id') || ''
      if (!id) {
        const base = slugifyHeading(cur.title) || `section-${i}`
        let candidate = base
        let ctr = 1
        while (container.querySelector(`#${CSS.escape(candidate)}`)) {
          ctr++
          candidate = `${base}-${ctr}`
        }
        cur.anchorEl.setAttribute('id', candidate)
        id = candidate
      }

      // Use a DOM Range to capture from the start block through to (but not including) the next start block
      const range = document.createRange()
      range.setStartBefore(cur.anchorEl)
      if (next) {
        range.setEndBefore(next.anchorEl)
      } else {
        // To the end of container
        const last = container.lastChild
        if (last) range.setEndAfter(last)
      }
      const frag = range.cloneContents()
      const wrapper = document.createElement('div')
      wrapper.appendChild(frag)
      const html = wrapper.innerHTML
      const text = wrapper.textContent ? wrapper.textContent.replace(/\s+/g, ' ').trim() : cur.title
      snippets.push({ id, title: cur.title, level: cur.level, html, text })
    }

    return snippets
  } catch (_e) {
    return []
  }
}

export type QueryMatch = {
  title: string
  html: string
  text: string
}

/**
 * Looser matching: find blocks (p, li, tr/td) that include the query text and
 * return small snippets we can render in cards.
 */
export function extractQueryMatches(htmlDocumentString: string, query: string): QueryMatch[] {
  try {
    const q = (query || '').trim().toLowerCase()
    if (!q) return []
    const sanitizedBody = extractAndSanitizeBodyHtml(htmlDocumentString)
    const container = document.createElement('div')
    container.innerHTML = sanitizedBody

    const results: QueryMatch[] = []
    const candidates = Array.from(
      container.querySelectorAll('p, li, td, th, div')
    ) as HTMLElement[]

    const isBoldish = (el: HTMLElement): boolean => {
      if (el.querySelector('strong, b')) return true
      const fw = (getComputedStyle(el).fontWeight || '').toString()
      const num = parseInt(fw, 10)
      if (!isNaN(num) && num >= 600) return true
      const style = el.getAttribute('style') || ''
      if (/font-weight\s*:\s*(bold|[6-9]00)/i.test(style)) return true
      return false
    }

    const getContextTitle = (el: HTMLElement): string => {
      // Nearest preceding heading else bold paragraph/td else uppercase short line
      let cur: HTMLElement | null = el
      while (cur && cur.previousElementSibling) {
        cur = cur.previousElementSibling as HTMLElement
        if (!cur) break
        const tag = cur.tagName.toLowerCase()
        if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4') {
          const t = (cur.textContent || '').replace(/\s+/g, ' ').trim()
          if (t) return t
        }
        if (isBoldish(cur)) {
          const t = (cur.textContent || '').replace(/\s+/g, ' ').trim()
          if (t) return t
        }
      }
      // fallback: use first sentence of current block
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
      const sentence = text.split(/(?<=[.!?])\s+/)[0] || text
      return sentence.length > 80 ? sentence.slice(0, 77).trimEnd() + '…' : sentence
    }

    const seen = new Set<string>()
    for (const el of candidates) {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
      if (!text || text.toLowerCase().indexOf(q) === -1) continue

      // choose container: prefer table row if inside a table
      const row = el.closest('tr') as HTMLElement | null
      const containerEl = row || el
      const html = containerEl.outerHTML

      // de-dup by html/text to avoid many identical cells
      const key = text.slice(0, 160) + '|' + html.slice(0, 160)
      if (seen.has(key)) continue
      seen.add(key)

      const title = getContextTitle(el)
      results.push({ title, html, text })
    }

    return results
  } catch (_e) {
    return []
  }
}

