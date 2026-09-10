import { test, expect } from '@playwright/test'

test.use({ locale: 'en-US', timezoneId: 'UTC' })

test('editor toolbar stays on one desktop row after saving and scrolls with the page', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date('2026-09-10T11:36:32Z'))
  await page.route('**/oauth2/userinfo', (route) => route.fulfill({ json: { email: 'analytics-test@example.invalid' } }))
  let savedDraft: Record<string, unknown> | null = null
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.startsWith('/api/drafts/')) {
      if (route.request().method() === 'PUT') savedDraft = route.request().postDataJSON()
      return route.fulfill({ json: savedDraft })
    }
    if (path === '/api/analytics/config') return route.fulfill({ json: { enabled: false } })
    return route.fulfill({ json: [] })
  })
  page.on('dialog', (dialog) => dialog.accept())
  await page.goto('/newsletters/create', { waitUntil: 'domcontentloaded' })
  const toolbar = page.locator('.nl-toolbar')
  await expect(toolbar.getByRole('button', { name: 'Save Draft', exact: true })).toBeVisible()
  const unsavedHeight = (await toolbar.boundingBox())!.height
  const canvasWidth = (await page.locator('.nl-canvas').boundingBox())!.width
  await page.getByRole('textbox', { name: 'Newsletter title', exact: true }).fill('Toolbar layout test')
  await toolbar.getByRole('button', { name: 'Save Draft', exact: true }).click()
  await expect(toolbar.locator('.nl-saved')).toHaveText('Saved 11:36:32 AM')
  expect(savedDraft).not.toBeNull()
  expect((await toolbar.boundingBox())!.height).toBe(unsavedHeight)
  expect((await page.locator('.nl-canvas').boundingBox())!.width).toBe(canvasWidth)

  for (const width of [1440, 1280, 1200]) {
    await page.setViewportSize({ width, height: 1000 })
    const bounds = await toolbar.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        width: rect.width,
        right: rect.right,
        left: rect.left,
        controlCenters: [...element.querySelectorAll('button, .nl-toolbar-title, .nl-saved')].map((control) => {
          const bounds = control.getBoundingClientRect()
          return bounds.top + bounds.height / 2
        }),
      }
    })
    expect(bounds.width).toBeGreaterThan(980)
    expect(bounds.right).toBeLessThanOrEqual(width)
    expect(bounds.left).toBeGreaterThanOrEqual(0)
    expect(Math.max(...bounds.controlCenters) - Math.min(...bounds.controlCenters)).toBeLessThanOrEqual(2)
    await page.screenshot({ path: testInfo.outputPath(`toolbar-${width}.png`) })
  }

  await page.evaluate(() => window.scrollTo(0, 650))
  await expect.poll(async () => toolbar.evaluate((element) => element.getBoundingClientRect().bottom)).toBeLessThan(0)
  await page.screenshot({ path: testInfo.outputPath('toolbar-scrolled.png') })

  await page.evaluate(() => window.scrollTo(0, 0))
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    const bounds = await toolbar.evaluate((element) => ({
      right: element.getBoundingClientRect().right,
      clipped: element.scrollWidth > element.clientWidth,
      controlsOutside: [...element.querySelectorAll('button, .nl-saved')].some((control) => {
        const rect = control.getBoundingClientRect()
        return rect.left < 0 || rect.right > innerWidth
      }),
    }))
    expect(bounds.right).toBeLessThanOrEqual(width)
    expect(bounds.clipped).toBe(false)
    expect(bounds.controlsOutside).toBe(false)
    await page.screenshot({ path: testInfo.outputPath(`toolbar-${width}.png`) })
  }
})