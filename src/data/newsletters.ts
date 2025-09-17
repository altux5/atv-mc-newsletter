export type Tag = 'Aurix' | 'Traveo' | 'Psoc' | 'Bulletin Board' | 'Ease of Use'

export const ALL_TAGS: Tag[] = ['Aurix', 'Traveo', 'Psoc', 'Bulletin Board', 'Ease of Use']

export type Newsletter = {
  id: string
  slug: string
  title: string
  date: string
  excerpt: string
  content: Array<{ type: 'h2' | 'p'; text: string }>
  tags: Tag[]
  sourcePath?: string
}

// Build newsletters list dynamically from existing .htm files under src/newsletters
const htmlFiles = import.meta.glob('../newsletters/**/*.htm', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

// Also import raw HTML strings so we can synchronously derive month/year and excerpts
const rawHtmlFiles = import.meta.glob('../newsletters/**/*.htm', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

const MONTHS = [
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

const MONTH_ABBRS: Record<string, number> = {
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

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function parseMonthYearFromPath(p: string): { monthIndex: number; year: number } | null {
  const lower = p.toLowerCase()
  let monthIndex = -1
  // Try full month names first
  for (let i = 0; i < MONTHS.length; i++) {
    if (lower.includes(MONTHS[i])) {
      monthIndex = i
      break
    }
  }
  // Try common abbreviations if full names not found
  if (monthIndex === -1) {
    for (const [abbr, idx] of Object.entries(MONTH_ABBRS)) {
      // Match standalone abbr or abbr immediately followed by digits like "nov22"
      const re = new RegExp(`\\b${abbr}(?=\\b|\\d)`, 'i')
      if (re.test(lower)) {
        monthIndex = idx
        break
      }
    }
  }
  if (monthIndex === -1) return null
  // Prefer 4-digit year anywhere in the path
  const year4 = lower.match(/\b(19|20)\d{2}\b/)
  if (year4) return { monthIndex, year: Number(year4[0]) }
  // Fallback: 2-digit year, optionally with a leading quote; avoid matching days by
  // requiring it near the end or followed by non-digits
  const year2 = lower.match(/(?:^|[^0-9])'?([0-9]{2})(?![0-9])/)
  if (year2) return { monthIndex, year: 2000 + Number(year2[1]) }
  return null
}

function baseName(p: string): string {
  const parts = p.split('/')
  const last = parts[parts.length - 1]
  return decodeURIComponent(last.replace(/\.htm$/i, ''))
}

import { extractFirstMeaningfulParagraphText, extractMonthYearFromHtml, extractMonthYearFromRawText } from '../utils/newsletterHtml'

const derived: Newsletter[] = Object.keys(htmlFiles)
  .map((path) => {
    const originalTitle = baseName(path)
    const raw = rawHtmlFiles[path]
    let parsed = parseMonthYearFromPath(path)
    if (!parsed && raw) {
      parsed = extractMonthYearFromRawText(raw) || extractMonthYearFromHtml(raw) || null
    }
    const date = parsed ? new Date(Date.UTC(parsed.year, parsed.monthIndex, 5)) : new Date()
    const monthName = parsed ? new Date(Date.UTC(parsed.year, parsed.monthIndex, 1)).toLocaleString(undefined, { month: 'long', timeZone: 'UTC' }) : null
    const derivedTitle = parsed && monthName ? `ATV MC Newsletter - ${monthName} ${parsed.year} edition` : originalTitle
    const slug = slugify(originalTitle)
    const id = slug
    let excerpt = `Imported HTML newsletter (${originalTitle})`
    if (raw) {
      const firstPara = extractFirstMeaningfulParagraphText(raw)
      const plain = firstPara.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
      excerpt = plain.length > 200 ? plain.slice(0, 197).trimEnd() + '…' : plain
    }
    const content: Array<{ type: 'h2' | 'p'; text: string }> = [
      { type: 'p', text: 'This newsletter is rendered from an HTML file.' },
    ]
    const tags: Tag[] = []
    return {
      id,
      slug,
      title: derivedTitle,
      date: date.toISOString(),
      excerpt,
      content,
      tags,
      sourcePath: path,
    }
  })
  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

export const newsletters: Newsletter[] = derived


