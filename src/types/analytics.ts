export type AnalyticsEvent = {
  id: string
  viewId: string
  type: 'view' | 'engagement' | 'click'
  path: string
  newsletterSlug?: string
  activeSeconds?: number
  scrollDepth?: number
  target?: string
}

export interface AnalyticsReport {
  enabled: boolean
  days: number
  totals: { visitors: number; views: number; newsletterViews: number; clicks: number; activeSeconds: number; scrollDepth: number }
  subscribers: { active: number; added: number; removed: number }
  daily: { date: string; visitors: number; views: number; clicks: number }[]
  newsletters: { slug: string; title: string; visitors: number; views: number; clicks: number; activeSeconds: number; scrollDepth: number }[]
  regions: { country: string; region: string; visitors: number; views: number }[]
  links: { slug: string | null; target: string; clicks: number }[]
}