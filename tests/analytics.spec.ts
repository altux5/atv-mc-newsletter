import { test, expect, type Page } from '@playwright/test'
import type { AnalyticsEvent, AnalyticsReport } from '../src/types/analytics'

async function fixture(page: Page, editor: boolean, enabled = true) {
  const events: AnalyticsEvent[] = []
  const sessions: string[] = []
  await page.route('**/oauth2/userinfo', (route) => editor ? route.fulfill({ json: { email: 'analytics-test@example.invalid' } }) : route.fulfill({ status: 401 }))
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/analytics/config') return route.fulfill({ json: { enabled } })
    if (url.pathname === '/api/analytics/session') { sessions.push(route.request().method()); return route.fulfill({ status: 204 }) }
    if (url.pathname === '/api/analytics/events') { events.push(route.request().postDataJSON()); return route.fulfill({ status: 204 }) }
    if (url.pathname === '/api/analytics/report') {
      const days = Number(url.searchParams.get('days'))
      const report: AnalyticsReport = {
        enabled, days, totals: { visitors: 128, views: 410, newsletterViews: 260, clicks: 74, activeSeconds: 143, scrollDepth: 68 },
        subscribers: { active: 315, added: 24, removed: 3 },
        daily: Array.from({ length: days }, (_, index) => ({ date: new Date(Date.UTC(2026, 8, 9 - days + index + 1)).toISOString().slice(0, 10), visitors: index % 5 * 4, views: index % 5 * 8, clicks: index % 3 })),
        newsletters: [{ slug: 'atv-mc-newsletter-august-26-edition', title: 'ATV MC Newsletter - August 2026', visitors: 98, views: 168, clicks: 48, activeSeconds: 160, scrollDepth: 78 }],
        regions: [{ country: 'DE', region: 'EMEA', visitors: 70, views: 210 }, { country: 'SG', region: 'APAC', visitors: 38, views: 150 }, { country: 'Unknown', region: 'Unknown', visitors: 20, views: 50 }],
        links: [{ slug: 'atv-mc-newsletter-august-26-edition', target: 'link-1', clicks: 28 }, { slug: null, target: 'subscribe', clicks: 7 }],
      }
      return route.fulfill({ json: report })
    }
    return route.fulfill({ json: [] })
  })
  return { events, sessions }
}

test('dashboard, period selection, CSV, errors, empty data and responsive layout', async ({ page }, testInfo) => {
  const { events } = await fixture(page, true)
  await page.goto('/admin/analytics', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Newsletter performance' })).toBeVisible()
  await expect(page.locator('.analytics-metrics dd').first()).toHaveText('128')
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Analytics', exact: true })).toBeVisible()
  await page.getByLabel('Analytics period').selectOption('7')
  await expect(page.locator('.analytics-chart-column')).toHaveCount(7)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export CSV' }).click()
  expect((await download).suggestedFilename()).toBe('newsletter-analytics-7-days.csv')
  await expect(page.getByRole('region', { name: 'Analytics privacy choice' })).toHaveCount(0)
  expect(events).toHaveLength(0)
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const bounds = await page.evaluate(() => {
      const viewport = document.documentElement.clientWidth
      const clipped = [...document.querySelectorAll('.analytics-page, .analytics-chart, .analytics-subscribers dd, .user-email')].filter((element) => element.getBoundingClientRect().right > viewport).map((element) => ({ className: element.className, right: element.getBoundingClientRect().right, viewport }))
      return { clipped, formHeight: document.querySelector('.subscribe-form')!.getBoundingClientRect().height }
    })
    expect(bounds.clipped).toEqual([])
    expect(bounds.formHeight).toBeLessThan(80)
    await page.screenshot({ path: testInfo.outputPath(`dashboard-${width}.png`), fullPage: true })
  }
  await page.route('**/api/analytics/report?*', (route) => route.fulfill({ status: 503, json: { error: 'Analytics report unavailable.' } }))
  await page.getByLabel('Analytics period').selectOption('30')
  await expect(page.getByRole('alert')).toContainText('Analytics report unavailable.')
  await page.route('**/api/analytics/report?*', (route) => route.fulfill({ json: { enabled: false, days: 30, totals: { visitors: 0, views: 0, newsletterViews: 0, clicks: 0, activeSeconds: 0, scrollDepth: 0 }, subscribers: { active: 5, added: 0, removed: 0 }, daily: [], newsletters: [], regions: [], links: [] } }))
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('Collection paused')).toBeVisible()
  await expect(page.getByText('No website activity recorded in this period.')).toBeVisible()
})

test('opt-in, newsletter view, clicks, engagement, navigation and withdrawal', async ({ page }) => {
  const { events, sessions } = await fixture(page, false)
  await page.goto('/newsletters', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: 'Allow analytics' })).toBeVisible()
  expect(events).toHaveLength(0)
  expect(sessions).toHaveLength(0)
  await page.getByRole('button', { name: 'Allow analytics' }).click()
  await expect.poll(() => events.filter((event) => event.type === 'view').length).toBe(1)
  await page.goto('/newsletters/atv-mc-newsletter-august-26-edition', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.embedded-newsletter')).toBeVisible()
  await expect.poll(() => events.filter((event) => event.type === 'view' && !!event.newsletterSlug).length).toBe(1)
  await page.locator('.embedded-newsletter a[href]').first().evaluate((link) => {
    link.addEventListener('click', (event) => event.preventDefault(), { once: true })
    ;(link as HTMLAnchorElement).click()
  })
  await expect.poll(() => events.filter((event) => event.type === 'click').length).toBe(1)
  await page.clock.install()
  await page.clock.runFor(16000)
  await expect.poll(() => events.filter((event) => event.type === 'engagement').length).toBeGreaterThan(0)
  expect(events.find((event) => event.type === 'engagement')?.activeSeconds).toBeGreaterThan(0)
  expect(events.find((event) => event.type === 'click')?.target).toBe('link-1')
  await page.getByRole('link', { name: /Back to list/ }).click()
  await expect.poll(() => events.filter((event) => event.type === 'view' && !event.newsletterSlug).length).toBe(2)
  await page.getByRole('button', { name: 'Analytics privacy settings' }).click()
  await page.getByRole('button', { name: 'Decline analytics' }).click()
  await expect.poll(() => sessions.includes('DELETE')).toBe(true)
  const count = events.length
  await page.getByRole('navigation').getByRole('link', { name: 'Home', exact: true }).click()
  await page.clock.runFor(16000)
  expect(events).toHaveLength(count)
})

test('decline and privacy signals prevent collection; disabled collection shows no prompt', async ({ page }, testInfo) => {
  const { events } = await fixture(page, false)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/newsletters', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: 'Decline analytics' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('consent-mobile.png') })
  await page.getByRole('button', { name: 'Decline analytics' }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Allow analytics' })).toHaveCount(0)
  expect(events).toHaveLength(0)
  await page.evaluate(() => localStorage.clear())
  await page.addInitScript(() => Object.defineProperty(navigator, 'globalPrivacyControl', { value: true }))
  await page.reload()
  await expect(page.getByRole('button', { name: 'Allow analytics' })).toHaveCount(0)
  expect(events).toHaveLength(0)
  await page.route('**/api/analytics/config', (route) => route.fulfill({ json: { enabled: false } }))
  await page.reload()
  await expect(page.getByRole('button', { name: 'Analytics privacy settings' })).toHaveCount(0)
})