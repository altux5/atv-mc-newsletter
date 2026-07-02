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
  // Full, pre-rendered newsletter body HTML (matches the website). When present
  // the email shows the whole newsletter instead of the short teaser.
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
  const port = Number(process.env.MAIL_RELAY_PORT ?? 25)
  const baseUrl = process.env.PUBLIC_BASE_URL ?? ''

  if (!host || !from) return null
  return { host, port, from, baseUrl: baseUrl.replace(/\/+$/, '') }
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

  console.log(`[mailer] Email distribution enabled via ${config.host}:${config.port} (from ${config.from}).`)
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

function renderHtml(newsletter: NewsletterEmail, readUrl: string, unsubscribeUrl: string): string {
  // Full-content email: wrap the pre-rendered newsletter body with a light
  // "view online" header and an unsubscribe footer.
  if (newsletter.bodyHtml && newsletter.bodyHtml.trim()) {
    return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f4f5f7;">
    <div style="text-align:center;padding:12px 16px;font-family:Arial,Segoe UI,sans-serif;font-size:12px;color:#6b7280;">
      <a href="${readUrl}" style="color:#0a6ed1;text-decoration:none;">View this newsletter online</a>
    </div>
    <div style="max-width:840px;margin:0 auto 16px;background:#ffffff;border:1px solid #e5e7eb;padding:28px 32px;">
      ${newsletter.bodyHtml}
    </div>
    <div style="text-align:center;padding:0 16px 24px;font-family:Arial,Segoe UI,sans-serif;font-size:12px;line-height:1.6;color:#9ca3af;">
      You are receiving this because you subscribed to the ATV MC Newsletter.<br/>
      <a href="${unsubscribeUrl}" style="color:#6b7280;">Unsubscribe</a>
    </div>
  </body>
</html>`
  }

  const title = escapeHtml(newsletter.title)
  const excerpt = escapeHtml(newsletter.excerpt || 'A new edition of the ATV MC Newsletter is out.')
  const date = escapeHtml(newsletter.date)
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:Segoe UI,Arial,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 8px;">
                <p style="margin:0 0 6px;font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:#6b7280;">ATV MC Newsletter Hub</p>
                <h1 style="margin:0;font-size:22px;line-height:1.3;color:#111827;">${title}</h1>
                <p style="margin:8px 0 0;font-size:13px;color:#9ca3af;">${date}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 32px 4px;font-size:15px;line-height:1.6;color:#374151;">
                <p style="margin:0;">${excerpt}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 32px;">
                <a href="${readUrl}" style="display:inline-block;background:#0a6ed1;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:8px;">Read the newsletter</a>
              </td>
            </tr>
          </table>
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;">
            <tr>
              <td style="padding:16px 32px;font-size:12px;line-height:1.6;color:#9ca3af;" align="center">
                You are receiving this because you subscribed to the ATV MC Newsletter.<br/>
                <a href="${unsubscribeUrl}" style="color:#6b7280;">Unsubscribe</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function renderText(newsletter: NewsletterEmail, readUrl: string, unsubscribeUrl: string): string {
  return [
    'ATV MC Newsletter Hub',
    '',
    newsletter.title,
    newsletter.date,
    '',
    newsletter.excerpt || 'A new edition of the ATV MC Newsletter is out.',
    '',
    `Read the newsletter: ${readUrl}`,
    '',
    '---',
    'You are receiving this because you subscribed to the ATV MC Newsletter.',
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join('\n')
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
  const subject = `New: ${newsletter.title}`

  for (const recipient of recipients) {
    const unsubscribeUrl = buildUnsubscribeUrl(config.baseUrl, recipient)
    try {
      await transporter.sendMail({
        from: config.from,
        to: recipient.email,
        subject,
        text: renderText(newsletter, readUrl, unsubscribeUrl),
        html: renderHtml(newsletter, readUrl, unsubscribeUrl),
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
