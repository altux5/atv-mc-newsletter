/// <reference types="node" />
import nodemailer, { type Transporter } from 'nodemailer'

// SMTP mailer for newsletter distribution.
//
// The company mail relay authorises senders by IP allow-list, so there is no
// SMTP username/password: we simply connect to the relay from the (allow-listed)
// OpenShift pod and hand off the message. Configuration is entirely via env vars
// so the same code runs locally (where it is usually disabled) and in-cluster.
//
//   MAIL_ENABLED     '1' | 'true' to turn sending on (default: off)
//   MAIL_RELAY_HOST  e.g. mailrelay-internal.infineon.com
//   MAIL_RELAY_PORT  e.g. 25
//   MAIL_FROM        e.g. NoReply@infineon.com
//   MAIL_FROM_NAME   display name shown in the inbox, e.g. ATV MC Newsletter-Hub
//   PUBLIC_BASE_URL  public site origin, used to build "read online" and
//                    unsubscribe links, e.g. https://atv-mc-newsletter....icp.infineon.com
//
// Like the AI proxy, the mailer degrades gracefully: if it is not configured the
// server still boots and the send endpoint reports that mail is disabled instead
// of crashing.

export interface MailerConfig {
  host: string
  port: number
  from: string
  fromName: string
  baseUrl: string
}

export interface SendResult {
  sent: number
  failed: number
  errors: string[]
}

export interface NewsletterEmail {
  title: string
  slug: string
  excerpt: string
  date: string
  // Pre-rendered email teaser with selected previews and a closing invitation slot.
  bodyHtml?: string
}

export interface Recipient {
  email: string
  unsubscribeToken: string
}

let transporter: Transporter | null = null
let config: MailerConfig | null = null

function readConfig(): MailerConfig | null {
  const enabled = /^(1|true|yes)$/i.test(process.env.MAIL_ENABLED ?? '')
  if (!enabled) return null

  const host = process.env.MAIL_RELAY_HOST
  const from = process.env.MAIL_FROM
  const fromName = (process.env.MAIL_FROM_NAME ?? 'ATV MC Newsletter-Hub').trim()
  const port = Number(process.env.MAIL_RELAY_PORT ?? 25)
  const baseUrl = process.env.PUBLIC_BASE_URL ?? ''

  if (!host || !from) return null
  return { host, port, from, fromName, baseUrl: baseUrl.replace(/\/+$/, '') }
}

/** Initialise the transporter. Idempotent; call once at startup. */
export function setupMailer(): void {
  config = readConfig()
  if (!config) {
    console.warn(
      '[mailer] Email distribution disabled (set MAIL_ENABLED=1, MAIL_RELAY_HOST and MAIL_FROM to enable). Send requests will report mail as disabled.',
    )
    transporter = null
    return
  }

  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    // Port 25 to an internal relay: connect in plaintext and upgrade to STARTTLS
    // opportunistically if the relay offers it. The relay uses a private CA, so
    // we don't verify the chain.
    secure: false,
    ignoreTLS: false,
    requireTLS: false,
    tls: { rejectUnauthorized: false },
    pool: true,
    maxConnections: 3,
  })

  console.log(`[mailer] Email distribution enabled via ${config.host}:${config.port} (from ${config.fromName} <${config.from}>).`)
}

export function isMailerEnabled(): boolean {
  return transporter !== null && config !== null
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildUnsubscribeUrl(baseUrl: string, recipient: Recipient): string {
  const params = new URLSearchParams({
    email: recipient.email,
    token: recipient.unsubscribeToken,
  })
  return `${baseUrl}/api/subscribers/unsubscribe?${params.toString()}`
}

function buildReadUrl(baseUrl: string, slug: string): string {
  return `${baseUrl}/newsletters/${encodeURIComponent(slug)}`
}

// e.g. "September '26 Edition - ATV MC Newsletter". Month and year come from the
// issue date (set from the draft's month/year), never the free-text title.
function buildSubject(newsletter: NewsletterEmail): string {
  const issued = new Date(newsletter.date)
  if (Number.isNaN(issued.getTime())) return newsletter.title
  const month = issued.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })
  const year = String(issued.getUTCFullYear() % 100).padStart(2, '0')
  return `${month} '${year} Edition - ATV MC Newsletter`
}

export function renderHtml(newsletter: NewsletterEmail, readUrl: string, unsubscribeUrl: string): string {
  const title = escapeHtml(newsletter.title)
  const excerpt = escapeHtml(newsletter.excerpt || 'A new edition of the ATV MC Newsletter is out.')
  const onlineUrl = escapeHtml(readUrl)
  const optOutUrl = escapeHtml(unsubscribeUrl)
  const body = newsletter.bodyHtml?.trim() || `
    <h2 style="margin:0 0 12px;font-size:24px;line-height:1.3;color:#007D6F;">${title}</h2>
    <p style="margin:0;font-size:15px;line-height:1.65;color:#374151;">${excerpt}</p>`
  const closingInvitation = `<table class="email-online-cta" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td class="email-padding" bgcolor="#e8f4f2" style="background:#e8f4f2;padding:28px 28px 32px;border-top:4px solid #0A8276;">
      <p style="margin:0 0 10px;font-size:12px;line-height:1.5;font-weight:bold;color:#00695f;">This is just the preview.</p>
      <h2 style="margin:0 0 12px;font-size:26px;line-height:1.25;color:#007D6F;">Continue on the Newsletter Hub</h2>
      <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#374151;">For the full newsletter, visit the website. Discover all the articles, insights and resources in this edition.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" bgcolor="#0A8276" style="background:#0A8276;border:2px solid #0A8276;border-radius:2px;mso-padding-alt:14px 22px;">
          <a href="${onlineUrl}" target="_blank" style="display:inline-block;padding:14px 22px;font-size:16px;line-height:1.4;font-weight:bold;color:#ffffff;text-decoration:none;mso-padding-alt:0;">Read the full newsletter &rarr;</a>
        </td></tr>
      </table>
    </td></tr>
  </table>`
  const invitationSlot = '<!-- newsletter-online-cta -->'
  const inlineInvitation = body.includes(invitationSlot)
  const renderedBody = inlineInvitation ? body.replace(invitationSlot, () => closingInvitation) : body
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      @media only screen and (max-width:600px) {
        .email-padding { padding-left:20px !important; padding-right:20px !important; }
        .email-heading { font-size:28px !important; line-height:1.2 !important; }
        .email-masthead { display:block !important; width:100% !important; padding:0 !important; text-align:left !important; }
        .email-logo { margin-top:18px !important; }
        .email-preview-image { display:block !important; width:100% !important; padding:0 0 14px !important; }
        .email-preview-image + td { display:block !important; width:100% !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,'Segoe UI',Tahoma,sans-serif;color:#1f2937;">
    <div style="display:none;font-size:1px;line-height:1px;color:#f4f5f7;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${title}. A few highlights inside. Read the full edition on the Newsletter Hub.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f5f7" style="width:100%;background:#f4f5f7;">
      <tr>
        <td align="center">
          <!--[if mso]><table role="presentation" width="720" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:720px;background:#ffffff;table-layout:fixed;overflow-wrap:break-word;">
            <tr>
              <td class="email-padding" bgcolor="#0A8276" style="background:#0A8276;padding:32px 36px 36px;">
                <p style="margin:0 0 16px;font-size:12px;line-height:1.5;font-weight:bold;color:#ffffff;">ATV MC NEWSLETTER HUB</p>
                <h1 class="email-heading" style="margin:0 0 14px;font-size:34px;line-height:1.15;font-weight:bold;color:#ffffff;">View this newsletter online</h1>
                <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#ffffff;">Every story. Every update. The complete edition, on our website.</p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr><td align="center" bgcolor="#ffffff" style="background:#ffffff;border:2px solid #ffffff;border-radius:2px;mso-padding-alt:14px 22px;">
                    <a href="${onlineUrl}" target="_blank" style="display:inline-block;padding:14px 22px;font-size:16px;line-height:1.4;font-weight:bold;color:#00695f;text-decoration:none;mso-padding-alt:0;">Open the full newsletter &rarr;</a>
                  </td></tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="email-padding" style="padding:32px 36px;">
                ${renderedBody}
              </td>
            </tr>
            ${inlineInvitation ? '' : `<tr><td>${closingInvitation}</td></tr>`}
          </table>
          <!--[if mso]></td></tr></table><![endif]-->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:720px;">
            <tr>
              <td style="padding:20px;font-size:12px;line-height:1.6;color:#6b7280;" align="center">
                For internal use and circulation only.<br/>
                You are receiving this because you subscribed to the ATV MC Newsletter.<br/>
                <a href="${optOutUrl}" style="color:#555555;text-decoration:underline;">Unsubscribe</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

export function renderText(newsletter: NewsletterEmail, readUrl: string, unsubscribeUrl: string): string {
  return [
    'ATV MC Newsletter Hub',
    '',
    newsletter.title,
    newsletter.date,
    '',
    `View this newsletter online: ${readUrl}`,
    '',
    newsletter.excerpt || 'A new edition of the ATV MC Newsletter is out.',
    '',
    `For the full newsletter, visit the website: ${readUrl}`,
    '',
    '---',
    'For internal use and circulation only.',
    'You are receiving this because you subscribed to the ATV MC Newsletter.',
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join('\n')
}

interface InlineAttachment {
  filename: string
  content: Buffer
  cid: string
  contentType: string
}

// Matches a base64 data URI, e.g. data:image/png;base64,AAAA...
const DATA_URI_RE = /data:([a-zA-Z0-9.+/-]+);base64,([A-Za-z0-9+/=]+)/g

/**
 * Replace inline base64 image data URIs in the body with `cid:` references and
 * return the matching attachments. Identical images are embedded once. Returns
 * the body unchanged with no attachments when there is nothing to embed.
 */
function embedDataUrisAsCid(html: string | undefined): {
  html: string | undefined
  attachments: InlineAttachment[]
} {
  if (!html) return { html, attachments: [] }
  const attachments: InlineAttachment[] = []
  const cidByDataUri = new Map<string, string>()
  let index = 0

  const out = html.replace(DATA_URI_RE, (match, mime: string, base64: string) => {
    let cid = cidByDataUri.get(match)
    if (!cid) {
      index += 1
      const ext = (mime.split('/')[1] || 'img').replace(/[^a-z0-9]/gi, '') || 'img'
      cid = `nl-img-${index}@newsletter`
      cidByDataUri.set(match, cid)
      attachments.push({
        filename: `image-${index}.${ext}`,
        content: Buffer.from(base64, 'base64'),
        cid,
        contentType: mime,
      })
    }
    return `cid:${cid}`
  })

  return { html: out, attachments }
}

/**
 * Send a "new edition" email to every recipient. Each message carries a
 * personalised unsubscribe link. Failures are collected per-recipient so one bad
 * address never aborts the whole run.
 */
export async function sendNewsletterToSubscribers(
  newsletter: NewsletterEmail,
  recipients: Recipient[],
): Promise<SendResult> {
  if (!transporter || !config) {
    throw new Error('Mailer is not configured')
  }

  const result: SendResult = { sent: 0, failed: 0, errors: [] }
  const readUrl = buildReadUrl(config.baseUrl, newsletter.slug)
  const subject = buildSubject(newsletter)

  // Embed inline (base64 data URL) images once as CID attachments so they render
  // in clients that block data URIs (Gmail, Outlook). The resulting body +
  // attachments are identical for every recipient, so compute them a single time.
  const embedded = embedDataUrisAsCid(newsletter.bodyHtml)
  const emailNewsletter: NewsletterEmail = { ...newsletter, bodyHtml: embedded.html }

  for (const recipient of recipients) {
    const unsubscribeUrl = buildUnsubscribeUrl(config.baseUrl, recipient)
    try {
      await transporter.sendMail({
        from: config.fromName ? { name: config.fromName, address: config.from } : config.from,
        to: recipient.email,
        subject,
        text: renderText(emailNewsletter, readUrl, unsubscribeUrl),
        html: renderHtml(emailNewsletter, readUrl, unsubscribeUrl),
        attachments: embedded.attachments,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
        },
      })
      result.sent += 1
    } catch (error) {
      result.failed += 1
      const message = error instanceof Error ? error.message : 'Unknown error'
      result.errors.push(`${recipient.email}: ${message}`)
      console.error(`[mailer] failed to send to ${recipient.email}:`, message)
    }
  }

  return result
}
