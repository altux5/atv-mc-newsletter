export const CANONICAL_CHAPTER_TITLES = [
  'AURIX™',
  'TRAVEO™ T2G',
  'PSOC™ Automotive',
  'Bulletin Board',
  'PDH & Partners',
  'Ease of Use',
  'Market News & Press Release',
] as const

export type CanonicalChapterTitle = (typeof CANONICAL_CHAPTER_TITLES)[number]

export function normalizeChapterTitle(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/™/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function isCanonicalChapterTitle(title: string): title is CanonicalChapterTitle {
  return (CANONICAL_CHAPTER_TITLES as readonly string[]).includes(title)
}

/**
 * Some UI chapter labels intentionally differ from how the same chapter is titled
 * inside historic newsletter HTML. This returns the normalized "keys" we should
 * match against extracted section titles.
 */
export function getChapterMatchKeys(selectedTitle: string): string[] {
  const normalized = normalizeChapterTitle(selectedTitle)

  // Keep label "TRAVEO™ T2G" but match newsletter sections titled "TRAVEO™"
  if (normalizeChapterTitle(selectedTitle) === normalizeChapterTitle('TRAVEO™ T2G')) {
    return Array.from(new Set([normalizeChapterTitle('TRAVEO™'), normalized]))
  }

  return [normalized]
}

