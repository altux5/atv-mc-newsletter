import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { getNewsletters, getNewslettersAsync, type Newsletter } from '../data/newsletters'
import {
  extractBodyText,
  extractCoverImageFromHtml,
  extractFirstArticleTitleFromHtml,
  extractSectionSnippets,
  loadHtmlByPathAsync,
  type SectionSnippet,
} from '../utils/newsletterHtml'
import { CANONICAL_CHAPTER_TITLES, normalizeChapterTitle } from '../constants/chapters'
import { getPublishedBodyApi } from '../utils/newslettersApi'
import { normalizeDraft } from '../utils/localNewsletters'
import { sanitizeHtml } from '../utils/sanitizeHtml'
import type { NewsletterDraft } from '../types/newsletter-creation'
import defaultHeaderImage from '../photos/newsletter image.png'

export type SectionIndex = Record<string, ReturnType<typeof extractSectionSnippets>>
export type SearchIndex = Record<string, string>

/** A compact "mini-newsletter" summary shown on each grid card. */
export type ChapterPreview = { chapter: string; article: string }
export type CardPreview = { cover: string | null; chapters: ChapterPreview[] }
export type CardPreviewIndex = Record<string, CardPreview>

interface NewslettersContextValue {
  /** Merged list of bundled-archive and database newsletters, newest first. */
  newsletters: Newsletter[]
  /** True while the database list is being fetched for the first time. */
  isLoadingNewsletters: boolean
  /** Per-newsletter plain-text body, used for full-text search. */
  searchIndex: SearchIndex
  /** Per-newsletter chapter/section snippets, used for chapter filtering. */
  sectionIndex: SectionIndex
  /** Per-newsletter cover image + chapter headlines, used to render grid cards. */
  cardPreviews: CardPreviewIndex
  /** True while the search/section index is being built for the first time. */
  isIndexBuilding: boolean
  /** Fixed list of chapter filter options. */
  availableChapters: string[]
  /** Force a fresh reload (used after publishing/deleting a newsletter). */
  refresh: () => void
}

// The chapter filter options are fixed, so expose a single stable reference.
const AVAILABLE_CHAPTERS: string[] = [...CANONICAL_CHAPTER_TITLES]

// Session-scoped caches. These live for as long as the SPA is open so that
// navigating between pages never re-fetches the database or re-parses any HTML.
let cachedNewsletters: Newsletter[] | null = null
let cachedSectionIndex: SectionIndex | null = null
let cachedSearchIndex: SearchIndex | null = null
let cachedCardPreviews: CardPreviewIndex | null = null
let inFlightNewsletters: Promise<Newsletter[]> | null = null

// Per-newsletter parse cache so that rebuilding the index after new database
// rows arrive only fetches and parses the newly added newsletters.
type ParsedEntry = {
  sections: SectionIndex[string]
  body: string
  preview: CardPreview
} | null
const parsedHtmlCache = new Map<string, ParsedEntry>()

/** Map a raw section heading to its canonical, display-ready chapter label. */
function recognizeChapterLabel(title: string): string | null {
  const n = normalizeChapterTitle(title)
  if (!n) return null
  if (n.includes('aurix')) return 'AURIX™'
  if (n.includes('traveo')) return 'TRAVEO™'
  if (n.includes('psoc')) return 'PSOC™ Automotive'
  if (n.includes('bulletin')) return 'Bulletin Board'
  if (n.includes('pdh') || n.includes('partner')) return 'PDH & Partners'
  if (n.includes('ease of use')) return 'Ease of Use'
  if (n.includes('market') || n.includes('press')) return 'Market News & Press Release'
  return null
}

/** Build the ordered "in this issue" list: one article headline per chapter. */
function buildChapterPreviews(sections: SectionIndex[string]): ChapterPreview[] {
  const out: ChapterPreview[] = []
  const seen = new Set<string>()
  for (const s of sections) {
    const label = recognizeChapterLabel(s.title)
    if (!label || seen.has(label)) continue
    const article = extractFirstArticleTitleFromHtml(s.html, s.title)
    if (!article) continue
    seen.add(label)
    out.push({ chapter: label, article })
  }
  return out
}

/** Minimal HTML escaping for text injected into a section snippet. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Strip HTML tags to collapsed plain text (browser-only). */
function htmlToText(html: string): string {
  if (!html) return ''
  const div = document.createElement('div')
  div.innerHTML = html
  return (div.textContent || '').replace(/\s+/g, ' ').trim()
}

/**
 * Build the search/section/preview index entry for a platform-created (DB)
 * newsletter directly from its stored draft. The .htm extractors don't apply
 * here because the header image is a base64 data URL and the chapters are
 * structured editor data rather than parsed HTML.
 */
function buildEntryFromDraft(rawDraft: NewsletterDraft): ParsedEntry {
  const draft = normalizeDraft(rawDraft)
  const sections: SectionSnippet[] = []
  const chapters: ChapterPreview[] = []
  const seenLabels = new Set<string>()
  const bodyParts: string[] = []

  if (draft.introContent) bodyParts.push(htmlToText(draft.introContent))

  draft.chapters.forEach((chapter, index) => {
    const rawTitle = (chapter.title ?? '').trim()
    const label = recognizeChapterLabel(rawTitle) ?? rawTitle

    const articlesHtml = chapter.articles
      .map((a) => {
        const parts: string[] = []
        if (a.title?.trim()) parts.push(`<p><strong>${escapeHtml(a.title.trim())}</strong></p>`)
        if (a.content?.trim()) parts.push(a.content)
        return parts.join('')
      })
      .filter(Boolean)
      .join('')

    // Section snippet — powers chapter filtering and the search-result excerpt.
    if (rawTitle) {
      sections.push({
        id: `chapter_${index}`,
        title: rawTitle,
        level: 2,
        html: sanitizeHtml(articlesHtml),
        text: htmlToText(articlesHtml),
      })
    }

    // Body text — powers full-text search.
    const chapterText = [rawTitle, ...chapter.articles.map((a) => `${a.title ?? ''} ${htmlToText(a.content)}`)]
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (chapterText) bodyParts.push(chapterText)

    // Grid "in this issue" preview — one headline per chapter.
    if (label && !seenLabels.has(label)) {
      const firstArticle = chapter.articles.find(
        (a) => a.title?.trim() || htmlToText(a.content).trim(),
      )
      const headline =
        firstArticle?.title?.trim() || htmlToText(firstArticle?.content ?? '').slice(0, 120).trim()
      if (headline) {
        seenLabels.add(label)
        chapters.push({ chapter: label, article: headline })
      }
    }
  })

  return {
    sections,
    body: bodyParts.join(' \n '),
    preview: {
      cover: draft.headerImage || defaultHeaderImage,
      chapters,
    },
  }
}

async function indexOne(n: Newsletter): Promise<ParsedEntry> {
  const cached = parsedHtmlCache.get(n.id)
  if (cached !== undefined) return cached
  let entry: ParsedEntry = null
  try {
    if (!n.sourcePath) {
      // Platform-created newsletter: build the index from the stored draft.
      const draft = await getPublishedBodyApi(n.id)
      if (draft) entry = buildEntryFromDraft(draft)
    } else {
      const match = await loadHtmlByPathAsync(n.sourcePath)
      const html = match?.html
      if (html) {
        const sections = extractSectionSnippets(html)
        entry = {
          sections,
          body: extractBodyText(html),
          preview: {
            cover: extractCoverImageFromHtml(html),
            chapters: buildChapterPreviews(sections),
          },
        }
      }
    }
  } catch {
    // Ignore individual failures so the rest of the index still builds.
    entry = null
  }
  parsedHtmlCache.set(n.id, entry)
  return entry
}

const NewslettersContext = createContext<NewslettersContextValue | undefined>(undefined)

export function NewslettersProvider({ children }: { children: ReactNode }) {
  // Seed synchronously from the bundled archive so the first page of cards
  // paints instantly while the database rows stream in afterwards.
  const [newsletters, setNewsletters] = useState<Newsletter[]>(() => cachedNewsletters ?? getNewsletters())
  const [isLoadingNewsletters, setIsLoadingNewsletters] = useState<boolean>(cachedNewsletters === null)
  const [sectionIndex, setSectionIndex] = useState<SectionIndex>(() => cachedSectionIndex ?? {})
  const [searchIndex, setSearchIndex] = useState<SearchIndex>(() => cachedSearchIndex ?? {})
  const [cardPreviews, setCardPreviews] = useState<CardPreviewIndex>(() => cachedCardPreviews ?? {})
  const [isIndexBuilding, setIsIndexBuilding] = useState<boolean>(cachedSectionIndex === null)

  const loadNewsletters = useCallback(() => {
    setIsLoadingNewsletters(cachedNewsletters === null)
    if (!inFlightNewsletters) {
      inFlightNewsletters = getNewslettersAsync()
    }
    const pending = inFlightNewsletters
    return pending
      .then((list) => {
        cachedNewsletters = list
        if (inFlightNewsletters === pending) inFlightNewsletters = null
        setNewsletters(list)
        setIsLoadingNewsletters(false)
        return list
      })
      .catch((error) => {
        console.error('Failed to load newsletters:', error)
        if (inFlightNewsletters === pending) inFlightNewsletters = null
        setIsLoadingNewsletters(false)
        return [] as Newsletter[]
      })
  }, [])

  const refresh = useCallback(() => {
    cachedNewsletters = null
    cachedSectionIndex = null
    cachedSearchIndex = null
    cachedCardPreviews = null
    inFlightNewsletters = null
    parsedHtmlCache.clear()
    setIsIndexBuilding(true)
    void loadNewsletters()
  }, [loadNewsletters])

  // Kick off the background load once. Later visits reuse the session cache.
  useEffect(() => {
    if (cachedNewsletters === null) {
      void loadNewsletters()
    }
  }, [loadNewsletters])

  // Reload when a newsletter is published, edited, or deleted anywhere.
  useEffect(() => {
    const handler = () => refresh()
    window.addEventListener('newsletterPublished', handler)
    return () => window.removeEventListener('newsletterPublished', handler)
  }, [refresh])

  // Build (or extend) the search/section index whenever the list changes. The
  // per-newsletter cache keeps this cheap once the first build has completed.
  useEffect(() => {
    let cancelled = false
    if (cachedSectionIndex === null) setIsIndexBuilding(true)
    void (async () => {
      const nextSections: SectionIndex = {}
      const nextSearch: SearchIndex = {}
      const nextPreviews: CardPreviewIndex = {}
      await Promise.all(
        newsletters.map(async (n) => {
          const entry = await indexOne(n)
          if (entry) {
            nextSections[n.id] = entry.sections
            nextSearch[n.id] = entry.body
            nextPreviews[n.id] = entry.preview
          }
        })
      )
      if (cancelled) return
      cachedSectionIndex = nextSections
      cachedSearchIndex = nextSearch
      cachedCardPreviews = nextPreviews
      setSectionIndex(nextSections)
      setSearchIndex(nextSearch)
      setCardPreviews(nextPreviews)
      setIsIndexBuilding(false)
    })()
    return () => {
      cancelled = true
    }
  }, [newsletters])

  const value = useMemo<NewslettersContextValue>(
    () => ({
      newsletters,
      isLoadingNewsletters,
      searchIndex,
      sectionIndex,
      cardPreviews,
      isIndexBuilding,
      availableChapters: AVAILABLE_CHAPTERS,
      refresh,
    }),
    [newsletters, isLoadingNewsletters, searchIndex, sectionIndex, cardPreviews, isIndexBuilding, refresh]
  )

  return <NewslettersContext.Provider value={value}>{children}</NewslettersContext.Provider>
}

export function useNewsletters(): NewslettersContextValue {
  const ctx = useContext(NewslettersContext)
  if (!ctx) throw new Error('useNewsletters must be used within a NewslettersProvider')
  return ctx
}
