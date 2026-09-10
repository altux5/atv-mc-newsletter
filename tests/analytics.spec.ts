import { test, expect, type Page } from '@playwright/test'
import type { AnalyticsEvent, AnalyticsReport } from '../src/types/analytics'

async function fixture(page: Page, editor: boolean, enabled = true) {
  const events: AnalyticsEvent[] = []
  const sessions: string[] = []
  await page.route('**/oauth2/userinfo', (route) => editor ? route.fulfill({ json: { email: 'analytics-test@example.invalid' } }) : route.fulfill({ status: 401 }))
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/analytics/config') return route.fulfill({ json: { enabled } })
    if (url.pathname === '/api/analytics/session') {
      expect(route.request().postData()).toBeNull()
      sessions.push(route.request().method())
      return route.fulfill({ status: 204 })
    }
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

test('header groups editor navigation beside the account with responsive bounds', async ({ page }, testInfo) => {
  await fixture(page, true, false)
  await page.goto('/admin/analytics', { waitUntil: 'domcontentloaded' })
  const publicNav = page.getByRole('navigation', { name: 'Main navigation', exact: true })
  const editorNav = page.getByRole('navigation', { name: 'Editor navigation', exact: true })
  await expect(editorNav).toBeVisible()
  await expect(publicNav.getByRole('link')).toHaveText(['Home', 'Newsletters', 'Submit Article'])
  await expect(editorNav.getByRole('link')).toHaveText(['Review Articles', 'Create Newsletter', 'Analytics'])
  await expect(page.locator('.nav-auth').getByRole('navigation', { name: 'Editor navigation' })).toBeVisible()
  await expect(page.locator('.nav-auth').getByRole('button', { name: 'Logout' })).toBeVisible()
  await expect(editorNav.getByRole('link', { name: 'Analytics', exact: true })).toHaveAttribute('aria-current', 'page')
  for (const width of [1440, 1280, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    const bounds = await page.evaluate(() => {
      const header = document.querySelector('.header-inner')!.getBoundingClientRect()
      const account = document.querySelector('.nav-auth')!.getBoundingClientRect()
      const mainNav = document.querySelector('nav[aria-label="Main navigation"]')!.getBoundingClientRect()
      const controls = [...document.querySelectorAll('.header-inner a, .header-inner button, .user-email')]
      const clipped = controls.filter((element) => {
        const rect = element.getBoundingClientRect()
        return rect.left < 0 || rect.right > document.documentElement.clientWidth || rect.top < header.top || rect.bottom > header.bottom
      }).map((element) => element.textContent)
      const overlap = controls.some((element, index) => controls.slice(index + 1).some((other) => {
        const first = element.getBoundingClientRect()
        const second = other.getBoundingClientRect()
        return first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top
      }))
      return { clipped, overlap, rightGap: header.right - account.right, separated: account.left >= mainNav.right || account.top >= mainNav.bottom }
    })
    expect(bounds.clipped, `Clipped controls at ${width}px`).toEqual([])
    expect(bounds.overlap, `Overlapping controls at ${width}px`).toBe(false)
    expect(Math.abs(bounds.rightGap)).toBeLessThan(2)
    expect(bounds.separated).toBe(true)
    await page.locator('.app-header').screenshot({ path: testInfo.outputPath(`header-${width}.png`) })
  }
  await editorNav.getByRole('link', { name: 'Review Articles', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/articles$/)
  await expect(editorNav.getByRole('link', { name: 'Review Articles', exact: true })).toHaveAttribute('aria-current', 'page')
  await editorNav.getByRole('link', { name: 'Create Newsletter', exact: true }).click()
  await expect(page).toHaveURL(/\/newsletters\/create$/)
  await expect(editorNav.getByRole('link', { name: 'Create Newsletter', exact: true })).toHaveAttribute('aria-current', 'page')
  await publicNav.getByRole('link', { name: 'Newsletters', exact: true }).click()
  await page.route('**/oauth2/userinfo', (route) => route.fulfill({ json: { email: 'reader@example.invalid' } }))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('.user-email')).toHaveText('reader@example.invalid')
  await expect(editorNav).toHaveCount(0)
  await page.route('**/oauth2/userinfo', (route) => route.fulfill({ status: 401 }))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('link', { name: 'Editor Login', exact: true })).toBeVisible()
  await expect(editorNav).toHaveCount(0)
  await expect(publicNav.getByRole('link')).toHaveCount(3)
})

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

test('automatic newsletter views, clicks, engagement and navigation without a banner', async ({ page }) => {
  const { events, sessions } = await fixture(page, false)
  await page.goto('/newsletters', { waitUntil: 'domcontentloaded' })
  await expect.poll(() => events.filter((event) => event.type === 'view').length).toBe(1)
  expect(sessions).toEqual(['POST'])
  await expect(page.getByRole('button', { name: /Allow analytics|Decline analytics|Analytics privacy settings/ })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Analytics privacy choice' })).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('newsletter-analytics-consent-v1'))).toBeNull()
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
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'globalPrivacyControl', { value: true, configurable: true })
    window.dispatchEvent(new Event('focus'))
  })
  await expect.poll(() => sessions.includes('DELETE')).toBe(true)
  const count = events.length
  await page.getByRole('navigation').getByRole('link', { name: 'Home', exact: true }).click()
  await page.clock.runFor(16000)
  expect(events).toHaveLength(count)
})

test('signed-in editors are never tracked, including during delayed authentication', async ({ page }) => {
  const { events, sessions } = await fixture(page, true)
  let releaseAuth = () => {}
  const authReady = new Promise<void>((resolve) => { releaseAuth = resolve })
  await page.route('**/oauth2/userinfo', async (route) => {
    await authReady
    await route.fulfill({ json: { email: 'analytics-test@example.invalid' } })
  })
  const configReady = page.waitForResponse('**/api/analytics/config')
  await page.goto('/newsletters', { waitUntil: 'domcontentloaded' })
  await configReady
  await page.clock.install()
  await page.clock.runFor(2000)
  expect(sessions.includes('POST')).toBe(false)
  expect(events).toHaveLength(0)
  releaseAuth()
  await expect(page.getByRole('navigation', { name: 'Editor navigation' })).toBeVisible()
  await expect.poll(() => sessions.includes('DELETE')).toBe(true)
  expect(sessions.includes('POST')).toBe(false)
  await page.goto('/newsletters/atv-mc-newsletter-august-26-edition', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.embedded-newsletter')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Editor navigation' })).toBeVisible()
  await page.locator('.embedded-newsletter a[href]').first().evaluate((link) => {
    link.addEventListener('click', (event) => event.preventDefault(), { once: true })
    ;(link as HTMLAnchorElement).click()
  })
  await page.evaluate(() => window.scrollBy(0, 600))
  await page.clock.runFor(16000)
  await page.getByRole('link', { name: /Back to list/ }).click()
  await page.clock.runFor(16000)
  await page.getByRole('navigation', { name: 'Editor navigation' }).getByRole('link', { name: 'Analytics', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Newsletter performance' })).toBeVisible()
  expect(events).toHaveLength(0)
  expect(sessions.includes('POST')).toBe(false)
  await expect(page.getByRole('button', { name: /Allow analytics|Decline analytics|Analytics privacy settings/ })).toHaveCount(0)
})

test('automatic tracking continues for non-editors and resumes after editor logout', async ({ page }) => {
  const { events, sessions } = await fixture(page, false)
  await page.route('**/oauth2/userinfo', (route) => route.fulfill({ json: { email: 'reader@example.invalid' } }))
  await page.goto('/submit-article', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.user-email')).toHaveText('reader@example.invalid')
  await expect.poll(() => events.filter((event) => event.type === 'view').length).toBe(1)
  expect(sessions.filter((method) => method === 'POST')).toHaveLength(1)

  await page.route('**/oauth2/userinfo', (route) => route.fulfill({ json: { email: 'analytics-test@example.invalid' } }))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('navigation', { name: 'Editor navigation' })).toBeVisible()
  await expect.poll(() => sessions.includes('DELETE')).toBe(true)
  expect(events).toHaveLength(1)
  expect(sessions.filter((method) => method === 'POST')).toHaveLength(1)

  await page.route('**/oauth2/userinfo', (route) => route.fulfill({ status: 401 }))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('link', { name: 'Editor Login', exact: true })).toBeVisible()
  await expect.poll(() => events.filter((event) => event.type === 'view').length).toBe(2)
  expect(sessions.filter((method) => method === 'POST')).toHaveLength(2)
  await expect(page.getByRole('button', { name: /Allow analytics|Decline analytics/ })).toHaveCount(0)
})

for (const signal of ['globalPrivacyControl', 'doNotTrack']) {
  test(`${signal} prevents automatic collection`, async ({ page }) => {
    const { events, sessions } = await fixture(page, false)
    await page.addInitScript((name) => Object.defineProperty(navigator, name, { value: name === 'doNotTrack' ? '1' : true }), signal)
    await page.goto('/submit-article', { waitUntil: 'domcontentloaded' })
    await expect.poll(() => sessions.includes('DELETE')).toBe(true)
    await page.clock.install()
    await page.clock.runFor(16000)
    expect(sessions.includes('POST')).toBe(false)
    expect(events).toHaveLength(0)
    await expect(page.getByRole('button', { name: /Allow analytics|Decline analytics/ })).toHaveCount(0)
  })
}

test('disabled collection and session failures never send events', async ({ page }) => {
  const { events, sessions } = await fixture(page, false, false)
  await page.goto('/submit-article', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('link', { name: 'Editor Login', exact: true })).toBeVisible()
  await page.clock.install()
  await page.clock.runFor(16000)
  expect(sessions).toHaveLength(0)
  expect(events).toHaveLength(0)
  await page.route('**/api/analytics/config', (route) => route.fulfill({ json: { enabled: true } }))
  let attempts = 0
  await page.route('**/api/analytics/session', (route) => { attempts++; return route.fulfill({ status: 503 }) })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect.poll(() => attempts).toBeGreaterThan(0)
  await page.clock.runFor(16000)
  expect(events).toHaveLength(0)
})