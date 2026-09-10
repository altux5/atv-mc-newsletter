import { randomUUID } from 'node:crypto'
import type { query as databaseQuery } from './db.js'
import type { ManagedSubscriber } from '../src/types/subscriber.js'

type SubscriberRow = {
  id: string
  email: string
  active: boolean
  subscribed_at: Date | string
  unsubscribed_at: Date | string | null
}

const columns = 'id, email, active, subscribed_at, unsubscribed_at'
const timestamp = (value: Date | string) => value instanceof Date ? value.toISOString() : value
const mapSubscriber = (row: SubscriberRow): ManagedSubscriber => ({
  id: row.id,
  email: row.email,
  active: row.active,
  subscribedAt: timestamp(row.subscribed_at),
  unsubscribedAt: row.unsubscribed_at ? timestamp(row.unsubscribed_at) : null,
})

export function normalizeSubscriberEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

export async function listManagedSubscribers(query: typeof databaseQuery): Promise<ManagedSubscriber[]> {
  const rows = await query<SubscriberRow>(`SELECT ${columns} FROM subscribers ORDER BY active DESC, subscribed_at DESC, email ASC`)
  return rows.map(mapSubscriber)
}

export async function addManagedSubscriber(query: typeof databaseQuery, email: string): Promise<ManagedSubscriber> {
  const rows = await query<SubscriberRow>(
    `INSERT INTO subscribers (id, email, active, unsubscribe_token, subscribed_at)
     VALUES ($1, $2, true, $3, now())
     ON CONFLICT (email) DO UPDATE SET active = true, unsubscribed_at = NULL
     RETURNING ${columns}`,
    [randomUUID(), email, randomUUID()],
  )
  return mapSubscriber(rows[0])
}

export async function removeManagedSubscriber(query: typeof databaseQuery, id: string): Promise<ManagedSubscriber | null> {
  const rows = await query<SubscriberRow>(
    `UPDATE subscribers SET active = false,
       unsubscribed_at = CASE WHEN active THEN now() ELSE unsubscribed_at END
     WHERE id = $1 RETURNING ${columns}`, [id],
  )
  return rows[0] ? mapSubscriber(rows[0]) : null
}