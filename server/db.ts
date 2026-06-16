/// <reference types="node" />
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pkg from 'pg'

const { Pool } = pkg

// `pg` is CommonJS; under ESM the named import pattern above (default + destructure)
// is the runtime-safe way to get `Pool`.

const sslDisabled = process.env.PGSSLMODE === 'disable'

/**
 * Connection is configured entirely through environment variables so the same
 * code runs locally (via `oc port-forward`) and inside OpenShift.
 *
 * Either set DATABASE_URL, or the standard PG* vars:
 *   PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD
 *
 * StackGres/pgBouncer require SSL. We connect with TLS but do not verify the
 * certificate chain (rejectUnauthorized: false) because the in-cluster cert CN
 * and the port-forwarded localhost host never match. Set PGSSLMODE=disable to
 * turn TLS off entirely (not recommended).
 */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslDisabled ? false : { rejectUnauthorized: false },
  max: Number(process.env.PG_POOL_MAX ?? 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
})

pool.on('error', (err) => {
  // A pooled client sitting idle errored (e.g. DB restarted). Log, don't crash.
  console.error('[db] idle client error:', err.message)
})

/** Run a parameterized query and return the rows. Always use $1, $2, … for values. */
export async function query<T extends pkg.QueryResultRow = pkg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await pool.query<T>(text, params as never[])
  return result.rows
}

/** Create tables/indexes if they do not exist. Idempotent; safe on every boot. */
export async function ensureSchema(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const schemaPath = path.join(here, 'schema.sql')
  const sql = fs.readFileSync(schemaPath, 'utf8')
  await pool.query(sql)
  console.log('[db] schema ensured')
}
