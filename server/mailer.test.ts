import assert from 'node:assert/strict'
import test from 'node:test'
import { renderHtml, renderText, type NewsletterEmail } from './mailer'

const newsletter: NewsletterEmail = {
  title: 'September <2026> & updates',
  slug: 'september-2026',
  date: '2026-09-01',
  excerpt: 'A look at this month & what comes next.',
}
const readUrl = 'https://newsletter.example/newsletters/september-2026'
const unsubscribeUrl = 'https://newsletter.example/api/subscribers/unsubscribe?email=reader&token=test'

test('email frames the teaser with two prominent links to the full edition', () => {
  const html = renderHtml({ ...newsletter, bodyHtml: '<p>Selected article previews</p>' }, readUrl, unsubscribeUrl)
  assert.equal(html.split(`href="${readUrl}"`).length - 1, 2)
  assert.ok(html.indexOf('View this newsletter online') < html.indexOf('Selected article previews'))
  assert.ok(html.indexOf('This is just the preview.') > html.indexOf('Selected article previews'))
  assert.match(html, /Open the full newsletter &rarr;/)
  assert.match(html, /Read the full newsletter &rarr;/)
  assert.match(html, /bgcolor="#0A8276"/)
  assert.match(html, /max-width:720px/)
  assert.match(html, /\[if mso\]/)
  assert.match(html, /email=reader&amp;token=test/)
  assert.match(html, />Unsubscribe<\/a>/)
})

test('summary-only emails use the same invitations and escape dynamic text and links', () => {
  const html = renderHtml(newsletter, `${readUrl}?source=email&edition=9`, unsubscribeUrl)
  assert.match(html, /September &lt;2026&gt; &amp; updates/)
  assert.match(html, /month &amp; what comes next/)
  assert.match(html, /source=email&amp;edition=9/)
  assert.match(html, /Open the full newsletter/)
  assert.match(html, /Read the full newsletter/)
})

test('closing invitation fills its slot before the footer with swapped heading sizes', () => {
  const bodyHtml = '<table><tr><td>Article previews</td></tr><tr><td><!-- newsletter-online-cta --></td></tr><tr><td>Edition footer</td></tr></table>'
  const html = renderHtml({ ...newsletter, bodyHtml }, readUrl, unsubscribeUrl)
  assert.equal(html.split(`href="${readUrl}"`).length - 1, 2)
  assert.equal(html.split('class="email-online-cta"').length - 1, 1)
  assert.ok(html.indexOf('Article previews') < html.indexOf('This is just the preview.'))
  assert.ok(html.indexOf('Read the full newsletter') < html.indexOf('Edition footer'))
  assert.match(html, /<p style="[^"]*font-size:12px[^"]*">This is just the preview\.<\/p>/)
  assert.match(html, /<h2 style="[^"]*font-size:26px[^"]*">Continue on the Newsletter Hub<\/h2>/)
  assert.ok(!html.includes('<!-- newsletter-online-cta -->'))
})

test('plain-text emails also lead and close with the website destination', () => {
  const text = renderText(newsletter, readUrl, unsubscribeUrl)
  assert.equal(text.split(readUrl).length - 1, 2)
  assert.ok(text.indexOf(readUrl) < text.indexOf(newsletter.excerpt))
  assert.match(text, /For the full newsletter, visit the website:/)
  assert.ok(text.endsWith(`Unsubscribe: ${unsubscribeUrl}`))
})