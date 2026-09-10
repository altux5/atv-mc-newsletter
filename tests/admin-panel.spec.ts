import { test, expect, type Page } from '@playwright/test'
import type { ManagedSubscriber } from '../src/types/subscriber'

async function fixture(page: Page) {
  const state = {
    subscribers: Array.from({ length: 27 }, (_, index): ManagedSubscriber => ({
      id: `subscriber-${index}`, email: `reader${String(index).padStart(2, '0')}@infineon.com`, active: true,
      name: index === 1 ? 'Example Reader' : null, department: index === 1 ? 'ATV MC' : null,
      subscribedAt: '2026-09-01T09:00:00.000Z', unsubscribedAt: null,
    })),
    failList: false, failAdd: false, failRemove: false, expired: false, editor: true,
    listCalls: 0, mutations: [] as { method: string; path: string; body: unknown }[], events: 0,
  }
  state.subscribers.push({ id: 'inactive', email: 'former@infineon.com', name: null, department: null, active: false, subscribedAt: '2026-08-01T00:00:00.000Z', unsubscribedAt: '2026-09-01T00:00:00.000Z' })
  await page.route('**/oauth2/userinfo', (route) => route.fulfill({ json: { email: state.editor ? 'analytics-test@example.invalid' : 'reader@example.invalid' } }))
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/analytics/config') return route.fulfill({ json: { enabled: true } })
    if (path === '/api/analytics/session') return route.fulfill({ status: 204 })
    if (path === '/api/analytics/events') { state.events++; return route.fulfill({ status: 204 }) }
    if (path === '/api/analytics/report') return route.fulfill({ json: {
      enabled: true, days: 30, totals: { visitors: 0, views: 0, newsletterViews: 0, clicks: 0, activeSeconds: 0, scrollDepth: 0 },
      subscribers: { active: state.subscribers.filter((item) => item.active).length, added: 0, removed: 0 }, daily: [], newsletters: [], regions: [], links: [],
    } })
    if (path.startsWith('/api/admin/subscribers')) {
      if (request.method() === 'GET') state.listCalls++
      if (state.expired) return route.fulfill({ status: 401, json: { error: 'Editor sign-in required.' } })
      if (request.method() === 'GET') return state.failList ? route.fulfill({ status: 503, json: { error: 'Subscriber list is unavailable.' } }) : route.fulfill({ json: state.subscribers })
      state.mutations.push({ method: request.method(), path, body: request.postData() ? request.postDataJSON() : null })
      if (request.method() === 'POST') {
        if (state.failAdd) return route.fulfill({ status: 503, json: { error: 'Could not add the subscriber.' } })
        const email = (request.postDataJSON().email as string).trim().toLowerCase()
        const name = (request.postDataJSON().name as string | null)?.trim() || null
        const department = (request.postDataJSON().department as string | null)?.trim() || null
        let subscriber = state.subscribers.find((item) => item.email === email)
        if (subscriber) { subscriber.active = true; subscriber.unsubscribedAt = null; subscriber.name = name ?? subscriber.name; subscriber.department = department ?? subscriber.department }
        else { subscriber = { id: `added-${state.subscribers.length}`, email, name, department, active: true, subscribedAt: '2026-09-10T00:00:00.000Z', unsubscribedAt: null }; state.subscribers.push(subscriber) }
        return route.fulfill({ json: subscriber })
      }
      if (request.method() === 'DELETE') {
        if (state.failRemove) return route.fulfill({ status: 503, json: { error: 'Could not remove the subscriber.' } })
        const subscriber = state.subscribers.find((item) => path.endsWith(`/${item.id}`))!
        subscriber.active = false
        subscriber.unsubscribedAt = '2026-09-10T00:00:00.000Z'
        return route.fulfill({ json: subscriber })
      }
    }
    return route.fulfill({ json: [] })
  })
  return state
}

test('admin panel tabs, subscriber add/remove/reactivate, filtering and pagination', async ({ page }, testInfo) => {
  const state = await fixture(page)
  await page.goto('/admin/analytics', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Admin Panel', exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/admin\/panel\/analytics$/)
  const header = page.getByRole('navigation', { name: 'Editor navigation' })
  await expect(header.getByRole('link')).toHaveText(['Review Articles', 'Create Newsletter', 'Admin Panel'])
  await expect(page.getByRole('tab', { name: 'Analytics', exact: true })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: 'Subscribers', exact: true }).click()
  await expect(page.getByRole('tabpanel', { name: 'Subscribers', exact: true })).toBeVisible()
  await expect(page.getByText('27 active / 1 unsubscribed', { exact: true })).toBeVisible()
  await expect(page.locator('.subscribers-page tbody tr')).toHaveCount(25)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.locator('.subscribers-page tbody tr')).toHaveCount(2)
  await page.getByRole('button', { name: 'Previous', exact: true }).click()

  await page.getByLabel('Search subscribers').fill('reader01')
  await expect(page.locator('.subscribers-page tbody tr')).toHaveCount(1)
  await expect(page.getByRole('cell', { name: 'reader01@infineon.com', exact: true })).toBeVisible()
  await page.getByLabel('Search subscribers').fill('example reader')
  await expect(page.locator('.subscribers-page tbody tr')).toHaveCount(1)
  await expect(page.getByRole('cell', { name: 'Example Reader', exact: true })).toBeVisible()
  await page.getByLabel('Search subscribers').fill('atv mc')
  await expect(page.locator('.subscribers-page tbody tr')).toHaveCount(1)
  await expect(page.getByRole('cell', { name: 'ATV MC', exact: true })).toBeVisible()
  await page.getByLabel('Search subscribers').fill('not-present')
  await expect(page.getByText('No matching subscribers.')).toBeVisible()
  await page.getByLabel('Search subscribers').fill('')
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('inactive')
  await expect(page.getByRole('cell', { name: 'former@infineon.com', exact: true })).toBeVisible()
  await expect(page.locator('.subscriber-remove')).toHaveCount(0)

  await page.getByLabel('Add subscriber', { exact: true }).fill('New.Person@infineon.com')
  await page.getByLabel('Name (optional)', { exact: true }).fill('New Person')
  await page.getByLabel('Department / DL (optional)', { exact: true }).fill('ATV MC SPE')
  await page.getByRole('button', { name: 'Add subscriber', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('new.person@infineon.com added')
  await expect(page.getByRole('cell', { name: 'new.person@infineon.com', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'New Person', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'ATV MC SPE', exact: true })).toBeVisible()
  await expect(page.getByLabel('Name (optional)', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Department / DL (optional)', { exact: true })).toHaveValue('')
  await page.getByLabel('Add subscriber', { exact: true }).fill('new.person@infineon.com')
  await page.getByRole('button', { name: 'Add subscriber', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('already subscribed')
  expect(state.subscribers.filter((item) => item.email === 'new.person@infineon.com')).toHaveLength(1)
  await expect(page.getByRole('cell', { name: 'New Person', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Remove new.person@infineon.com', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Remove subscriber?' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  expect(state.mutations.filter((change) => change.method === 'DELETE')).toHaveLength(0)
  await page.getByRole('button', { name: 'Remove new.person@infineon.com', exact: true }).click()
  await dialog.getByRole('button', { name: 'Remove subscriber', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('status')).toContainText('removed from the distribution list')
  await expect(page.getByRole('cell', { name: 'new.person@infineon.com', exact: true })).toHaveCount(0)
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('inactive')
  await expect(page.getByRole('cell', { name: 'new.person@infineon.com', exact: true })).toBeVisible()
  await page.getByLabel('Add subscriber', { exact: true }).fill('new.person@infineon.com')
  await page.getByRole('button', { name: 'Add subscriber', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('added to the distribution list')
  expect(state.subscribers.find((item) => item.email === 'new.person@infineon.com')?.active).toBe(true)

  await page.getByRole('tab', { name: 'Subscribers', exact: true }).focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('tab', { name: 'Analytics', exact: true })).toBeFocused()
  await expect(page).toHaveURL(/\/admin\/panel\/analytics$/)
  await page.keyboard.press('End')
  await expect(page).toHaveURL(/\/admin\/panel\/subscribers$/)
  await expect(page.getByRole('cell', { name: 'new.person@infineon.com', exact: true })).toBeVisible()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('cell', { name: 'new.person@infineon.com', exact: true })).toBeVisible()

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.screenshot({ path: testInfo.outputPath(`subscribers-${width}.png`), fullPage: true })
    const bounds = await page.evaluate(() => ({
      overflowing: document.documentElement.scrollWidth > innerWidth,
      clipped: [...document.querySelectorAll('.admin-tabs, .subscriber-add, .subscriber-filters, .subscriber-pagination')].some((element) => element.getBoundingClientRect().right > document.documentElement.clientWidth),
      details: [...document.querySelectorAll('.header-inner, .brand, .nav-auth, .user-chip, .user-email, .subscribe-form, .admin-panel, .subscriber-add, .subscriber-filters, .subscriber-table-wrap, .subscriber-pagination')].map((element) => ({ name: element.className, right: element.getBoundingClientRect().right, width: element.getBoundingClientRect().width })).filter((item) => item.right > innerWidth),
    }))
    expect(bounds.overflowing, JSON.stringify(bounds.details)).toBe(false)
    expect(bounds.clipped).toBe(false)
  }
  await page.getByRole('button', { name: 'Remove new.person@infineon.com', exact: true }).click()
  await expect(dialog).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('remove-mobile.png') })
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(state.events).toBe(0)
})

test('subscriber loading, mutation errors, empty states and expired access', async ({ page }) => {
  const state = await fixture(page)
  state.failList = true
  await page.goto('/admin/panel/subscribers', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('alert')).toContainText('Subscriber list is unavailable.')
  await expect(page.getByRole('button', { name: 'Add subscriber', exact: true })).toBeDisabled()
  state.failList = false
  state.subscribers = []
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByText('No active subscribers.')).toBeVisible()
  state.failAdd = true
  await page.getByLabel('Add subscriber', { exact: true }).fill('test@infineon.com')
  await page.getByRole('button', { name: 'Add subscriber', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Could not add the subscriber.')
  await expect(page.getByLabel('Add subscriber', { exact: true })).toHaveValue('test@infineon.com')
  state.failAdd = false
  await page.getByRole('button', { name: 'Add subscriber', exact: true }).click()
  await expect(page.getByRole('cell', { name: 'test@infineon.com', exact: true })).toBeVisible()
  state.failRemove = true
  await page.getByRole('button', { name: 'Remove test@infineon.com', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Remove subscriber', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Could not remove the subscriber.')
  expect(state.subscribers[0].active).toBe(true)
  state.failRemove = false
  await dialog.getByRole('button', { name: 'Remove subscriber', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByText('No active subscribers.')).toBeVisible()
  state.expired = true
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('alert')).toContainText('You need to sign in')
  await expect(page.getByRole('button', { name: 'Add subscriber', exact: true })).toBeDisabled()
})

test('non-editors cannot open the admin panel or fetch the subscriber list', async ({ page }) => {
  const state = await fixture(page)
  state.editor = false
  await page.goto('/admin/panel/subscribers', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Editor Access', exact: true })).toBeVisible()
  expect(state.listCalls).toBe(0)
  await expect(page.getByRole('heading', { name: 'Admin Panel', exact: true })).toHaveCount(0)
})