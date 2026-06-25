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
  extractSectionSnippets,
  findHtmlByMonthYearAsync,
  loadHtmlByPathAsync,
} from '../utils/newsletterHtml'
import { CANONICAL_CHAPTER_TITLES } from '../constants/chapters'

export type SectionIndex = Record<string, ReturnType<typeof extractSectionSnippets>>
export type SearchIndex = Record<string, string>

interface NewslettersContextValue {
  /** Merged list of bundled-archive and database newsletters, newest first. */
  newsletters: Newsletter[]
  /** True while the database list is being fetched for the first time. */
  isLoadingNewsletters: boolean
  /** Per-newsletter plain-text body, used for full-text search. */
  searchIndex: SearchIndex
  /** Per-newsletter chapter/section snippets, used for chapter filtering. */
  sectionIndex: SectionIndex
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
let inFlightNewsletters: Promise<Newsletter[]> | null = null

// Per-newsletter parse cache so that rebuilding the index after new database
// rows arrive only fetches and parses the newly added newsletters.
type ParsedEntry = { sections: SectionIndex[string]; body: string } | null
const parsedHtmlCache = new Map<string, ParsedEntry>()

async function indexOne(n: Newsletter): Promise<ParsedEntry> {
  const cached = parsedHtmlCache.get(n.id)
  if (cached !== undefined) return cached
  let entry: ParsedEntry = null
  try {
    const date = new Date(n.date)
    const match = n.sourcePath
      ? await loadHtmlByPathAsync(n.sourcePath)
      : await findHtmlByMonthYearAsync(date.getUTCMonth(), date.getUTCFullYear())
    const html = match?.html
    if (html) {
      entry = { sections: extractSectionSnippets(html), body: extractBodyText(html) }
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
      await Promise.all(
        newsletters.map(async (n) => {
          const entry = await indexOne(n)
          if (entry) {
            nextSections[n.id] = entry.sections
            nextSearch[n.id] = entry.body
          }
        })
      )
      if (cancelled) return
      cachedSectionIndex = nextSections
      cachedSearchIndex = nextSearch
      setSectionIndex(nextSections)
      setSearchIndex(nextSearch)
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
      isIndexBuilding,
      availableChapters: AVAILABLE_CHAPTERS,
      refresh,
    }),
    [newsletters, isLoadingNewsletters, searchIndex, sectionIndex, isIndexBuilding, refresh]
  )

  return <NewslettersContext.Provider value={value}>{children}</NewslettersContext.Provider>
}

export function useNewsletters(): NewslettersContextValue {
  const ctx = useContext(NewslettersContext)
  if (!ctx) throw new Error('useNewsletters must be used within a NewslettersProvider')
  return ctx
}
