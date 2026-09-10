import { test, expect, type Page } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { renderHtml } from '../server/mailer'
import { DEFAULT_FOOTER_HTML } from '../src/utils/localNewsletters'
import type { NewsletterDraft } from '../src/types/newsletter-creation'

const readUrl = 'https://newsletter.example/newsletters/september-2026'
const draft: NewsletterDraft = {
  id: 'email-preview', title: "ATV MC Monthly Update - September '26", subtitle: 'We make green mobility smart!',
  date: '2026-09-01', month: 8, year: 2026, status: 'draft', createdAt: '2026-09-01', updatedAt: '2026-09-01',
  introContent: '<p>Discover the latest from Automotive Microcontrollers, from new technology to the people and events shaping our next chapter.</p>',
  footerContent: DEFAULT_FOOTER_HTML,
  chapters: [
    { id: 'products', title: 'Products & technology', articles: [
      { id: 'aurix', title: 'A new chapter for AURIX microcontrollers', template: 'portrait', content: `<p>Explore the latest developments in automotive microcontrollers and what they mean for the next generation of software-defined vehicles.</p><p>${'Our teams are bringing new ideas to life across the automotive ecosystem. '.repeat(12)}PRODUCT_FULL_BODY_END</p>`, contact: 'Alex Morgan & team', button: { label: 'OMITTED_EXTERNAL_CTA', url: 'https://external.example' } },
      { id: 'tools', title: 'From first prototype to the road ahead', template: 'landscape', content: `<p>Get a first look at the tools and collaborations helping development teams turn ambitious designs into practical solutions.</p><p>${'Meet the people behind the progress and discover the resources available. '.repeat(12)}TOOLS_FULL_BODY_END</p>` },
    ] },
    { id: 'business', title: 'Business & markets', articles: [
      { id: 'market', title: 'Automotive market outlook', template: 'portrait', content: '<p>OMITTED_MARKET_CONTENT</p>', image: 'https://omitted.example/image.jpg' },
      { id: 'customer', title: 'Working together with our customers', template: 'portrait', content: '<p>OMITTED_CUSTOMER_CONTENT</p>' },
    ] },
    { id: 'people', title: 'People & events', articles: [
      { id: 'team', title: 'Meet the team behind the technology', template: 'portrait', content: '<p>OMITTED_TEAM_CONTENT</p>' },
      { id: 'events', title: 'Upcoming events and learning opportunities', template: 'portrait', content: '<p>OMITTED_EVENTS_CONTENT</p>' },
    ] },
  ],
}

async function renderDraft(page: Page, source: NewsletterDraft, prepare = false) {
  return page.evaluate(async ({ source, prepare }) => {
    const modulePath = '/src/utils/generateNewsletterEmailHtml.ts'
    const renderer = await import(modulePath)
    const original = JSON.stringify(source)
    const prepared = prepare ? await renderer.prepareDraftForEmail(source) : source
    return { html: renderer.generateNewsletterEmailHtml(prepared), unchanged: original === JSON.stringify(source) }
  }, { source, prepare })
}

test.beforeEach(async ({ page }) => {
  await page.route('**/email-renderer-test', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head></head><body></body></html>' }))
  await page.goto('/email-renderer-test')
})

test('email trailer keeps two previews with contacts and places the invitation before the footer', async ({ page }, testInfo) => {
  const imagePaths = ['/src/photos/lowres-Car_curving_road.jpg.png?inline', '/src/photos/lowres-AI-Keyvisual_RGB-1080x1080.jpg.png?inline']
  const images = await page.evaluate(async (paths) => Promise.all(paths.map(async (path) => (await import(path)).default as string)), imagePaths)
  const source = structuredClone(draft)
  source.chapters[0].articles[0].image = images[0]
  source.chapters[0].articles[1].image = images[1]
  source.chapters[0].articles[1].contact = 'Sam Taylor'
  const rendered = await renderDraft(page, source, true)
  expect(rendered.unchanged).toBe(true)
  for (const article of source.chapters[0].articles) expect(rendered.html).toContain(article.title)
  for (const chapter of source.chapters.slice(1)) {
    expect(rendered.html).not.toContain(chapter.title.replaceAll('&', '&amp;'))
    for (const article of chapter.articles) expect(rendered.html).not.toContain(article.title)
  }
  expect(rendered.html).not.toMatch(/In this edition|A first look/)
  expect(rendered.html).not.toMatch(/OMITTED_|FULL_BODY_END|omitted\.example|external\.example/)
  const websiteHtml = await page.evaluate(async (source) => {
    const modulePath = '/src/utils/generateNewsletterHtml.ts'
    return (await import(modulePath)).generateNewsletterBodyHtml(source) as string
  }, source)
  for (const marker of ['PRODUCT_FULL_BODY_END', 'TOOLS_FULL_BODY_END', 'OMITTED_MARKET_CONTENT', 'OMITTED_CUSTOMER_CONTENT', 'OMITTED_TEAM_CONTENT', 'OMITTED_EVENTS_CONTENT', 'Alex Morgan &amp; team', 'OMITTED_EXTERNAL_CTA']) {
    expect(websiteHtml).toContain(marker)
  }
  const email = renderHtml({ title: source.title, slug: 'september-2026', date: source.date, excerpt: '', bodyHtml: rendered.html }, readUrl, 'https://newsletter.example/unsubscribe')
  await page.setContent(email)
  await expect(page.getByRole('heading', { name: 'Preview of this edition', exact: true })).toBeVisible()
  await expect(page.locator('.email-excerpt')).toHaveCount(2)
  await expect(page.locator('.email-contact')).toHaveText(['Contact: Alex Morgan & team', 'Contact: Sam Taylor'])
  await expect(page.locator('.email-online-cta')).toHaveCount(1)
  await expect(page.locator('.email-preview-section').locator('xpath=../following-sibling::tr[1]').locator('.email-online-cta')).toHaveCount(1)
  await expect(page.locator('.email-online-cta').locator('xpath=../..').locator('xpath=following-sibling::tr[1]').locator('.email-footer')).toHaveCount(1)
  await expect(page.locator('.email-online-cta h2')).toHaveText('Continue on the Newsletter Hub')
  await expect(page.locator('.email-online-cta p').first()).toHaveText('This is just the preview.')
  const excerpts = await page.locator('.email-excerpt').allTextContents()
  for (const text of excerpts) {
    expect(text.length).toBeLessThanOrEqual(260)
    expect(text).toMatch(/\.\.\.$/)
  }
  await expect(page.getByRole('link', { name: 'Open the full newsletter' })).toHaveAttribute('href', readUrl)
  await expect(page.getByRole('link', { name: 'Read the full newsletter' })).toHaveAttribute('href', readUrl)
  await expect(page.getByRole('link', { name: 'Unsubscribe', exact: true })).toHaveCount(1)
  await page.evaluate(async () => { await Promise.all([...document.images].map((image) => image.decode())) })
  expect(await page.locator('img').count()).toBe(4)
  expect(await page.locator('.email-preview-image img').evaluateAll((elements) => elements.map((element) => {
    const image = element as HTMLImageElement
    return [image.naturalWidth, image.naturalHeight]
  }))).toEqual([[248, 248], [248, 248]])
  for (const width of [1440, 720, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      invalid: [...document.querySelectorAll('h1,h2,h3,p,a,img')].filter((element) => {
        const rect = element.getBoundingClientRect()
        return rect.width > 0 && (rect.right > innerWidth + 1 || rect.left < -1 || element.scrollWidth > element.clientWidth + 1)
      }).map((element) => element.textContent || element.tagName),
      opening: document.querySelector('a')!.getBoundingClientRect().bottom,
    }))
    expect(layout.overflow).toBe(false)
    expect(layout.invalid).toEqual([])
    expect(layout.opening).toBeLessThan(600)
    const invitation = await page.locator('.email-online-cta').boundingBox()
    const previews = await page.locator('.email-preview-section').boundingBox()
    const footer = await page.locator('.email-footer').boundingBox()
    expect(invitation!.y).toBeGreaterThanOrEqual(previews!.y + previews!.height)
    expect(footer!.y).toBeGreaterThanOrEqual(invitation!.y + invitation!.height)
    await page.screenshot({ path: testInfo.outputPath(`email-${width}.png`), fullPage: true })
  }
  const sampleUrl = 'https://atv-mc-newsletter.eu-de-3.icp.infineon.com/newsletters/atv-mc-monthly-update-september-26'
  const preview = renderHtml({ title: source.title, slug: 'september-2026', date: source.date, excerpt: '', bodyHtml: rendered.html }, sampleUrl, '#unsubscribe-preview-only')
  await writeFile(testInfo.outputPath('email-preview.html'), preview)
})

test('email trailer handles legacy, empty and single-article drafts without leaking rich content', async ({ page }) => {
  const empty = { ...draft, introContent: '', chapters: [] }
  const emptyHtml = (await renderDraft(page, empty)).html
  expect(emptyHtml).not.toContain('Preview of this edition')
  expect(emptyHtml).not.toContain('In this edition')
  const source: NewsletterDraft = { ...empty, chapters: [
    { id: 'empty', title: 'Coming next', articles: [{ id: 'blank', title: '', content: '<p><br></p>', template: 'portrait' }] },
    { id: 'legacy', title: 'Legacy & updates', articles: [], content: '<p>One &amp; two</p><p>Three <strong>four</strong></p><script>OMITTED_SCRIPT</script>', chapterContact: 'Casey <Team> & colleagues' },
  ] }
  const rendered = await renderDraft(page, source, true)
  expect(rendered.unchanged).toBe(true)
  expect(rendered.html).not.toContain('Coming next')
  expect(rendered.html).toContain('Legacy &amp; updates')
  expect(rendered.html).toContain('One &amp; two Three four')
  expect(rendered.html).toContain('Casey &lt;Team&gt; &amp; colleagues')
  expect(rendered.html).not.toMatch(/OMITTED_|<script>|<strong>four/)
  await page.setContent(rendered.html)
  await expect(page.locator('.email-excerpt')).toHaveCount(1)
  await expect(page.locator('.email-contact')).toHaveText('Contact: Casey <Team> & colleagues')
  source.chapters[1].chapterContact = '   '
  await page.setContent((await renderDraft(page, source)).html)
  await expect(page.locator('.email-contact')).toHaveCount(0)
})