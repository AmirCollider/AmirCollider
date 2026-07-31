// ==========================================
// Licensing/Store.js
// Every D1 query the licence system makes.
// ==========================================

import { hashKey, hashIp, publicLabel, normalizeKey } from './Keys.js'


// How long a failed-attempt record counts against a
// caller, and how many are allowed inside it.
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000
const ATTEMPT_LIMIT = 20


// ==========================================
// db
// The licence database binding, or null.
// ==========================================
export function db(env) {
  return (env && env.LICENSE_DB) || null
}


// ==========================================
// findLicense
// One row by plaintext key. Normalises and hashes on the
// way in, so callers never handle the hash themselves
// and can never forget to normalise first.
// ==========================================
export async function findLicense(database, rawKey) {
  const normalized = normalizeKey(rawKey)
  if (!normalized) return null

  const keyHash = await hashKey(normalized)
  const row = await database
    .prepare('SELECT * FROM licenses WHERE key_hash = ? LIMIT 1')
    .bind(keyHash)
    .first()

  return row ? { ...row, key_hash: keyHash, normalized } : null
}


// ==========================================
// listActivations
// Every machine currently holding a seat on this key,
// oldest first.
// ==========================================
export async function listActivations(database, keyHash) {
  const { results } = await database
    .prepare(`SELECT machine_id, machine_label, app_version, activated_at, last_seen_at
              FROM license_activations WHERE key_hash = ? ORDER BY activated_at ASC`)
    .bind(keyHash)
    .all()
  return results || []
}


// ==========================================
// findActivation
// This machine's seat on this key, if it has one.
// ==========================================
export async function findActivation(database, keyHash, machineId) {
  return database
    .prepare('SELECT * FROM license_activations WHERE key_hash = ? AND machine_id = ? LIMIT 1')
    .bind(keyHash, machineId)
    .first()
}


// ==========================================
// touchActivation
// Records that this machine used its seat just now, and
// on which package version.
// ==========================================
export async function touchActivation(database, keyHash, machineId, appVersion) {
  const now = Date.now()
  await database
    .prepare(`UPDATE license_activations
              SET last_seen_at = ?, app_version = COALESCE(?, app_version)
              WHERE key_hash = ? AND machine_id = ?`)
    .bind(now, appVersion || null, keyHash, machineId)
    .run()

  await database
    .prepare('UPDATE licenses SET last_seen_at = ? WHERE key_hash = ?')
    .bind(now, keyHash)
    .run()
}


// ==========================================
// createActivation
// Binds a machine to a key.
// ==========================================
export async function createActivation(database, keyHash, machineId, label, appVersion) {
  const now = Date.now()

  await database
    .prepare(`INSERT OR REPLACE INTO license_activations
              (key_hash, machine_id, machine_label, app_version, activated_at, last_seen_at)
              VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(keyHash, machineId, label || null, appVersion || null, now, now)
    .run()

  // first_activated_at is set once and never moved: it is
  // the closest thing this database has to a sale date, and
  // a value that quietly re-dated itself every time somebody
  // reinstalled would be worse than not recording it.
  await database
    .prepare(`UPDATE licenses
              SET first_activated_at = COALESCE(first_activated_at, ?), last_seen_at = ?
              WHERE key_hash = ?`)
    .bind(now, now, keyHash)
    .run()
}


// ==========================================
// removeActivation
// Releases one machine's seat. Returns whether a row
// actually went away, so the caller can tell "released"
// from "there was nothing here" - a customer who clicks
// release twice should be told the second click did
// nothing, not shown a second success.
// ==========================================
export async function removeActivation(database, keyHash, machineId) {
  const result = await database
    .prepare('DELETE FROM license_activations WHERE key_hash = ? AND machine_id = ?')
    .bind(keyHash, machineId)
    .run()

  const changes = result && result.meta ? result.meta.changes : 0
  return changes > 0
}


// ==========================================
// insertLicenses
// Writes a freshly generated batch.
// ==========================================
export async function insertLicenses(database, keys, { batch, maxActivations, product, tier }) {
  const now = Date.now()
  const statement = database.prepare(
    `INSERT OR IGNORE INTO licenses
     (key_hash, key_public, product, tier, status, max_activations, batch, created_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`
  )

  const bound = []
  for (const key of keys) {
    bound.push(statement.bind(
      await hashKey(key),
      publicLabel(key),
      product,
      tier,
      maxActivations,
      batch,
      now
    ))
  }

  // One batch() rather than N awaited run() calls. D1 charges
  // per round trip, and a hundred sequential awaits from a
  // Worker is the difference between a fast command and one
  // that trips the request time limit halfway through -
  // leaving half a batch inserted and half the printed keys
  // dead on arrival in Sell.app.
  if (bound.length) await database.batch(bound)

  return bound.length
}


// ==========================================
// issueLicenseForOrder
// One key, minted for one paid order.
// ==========================================
export async function issueLicenseForOrder(database, plaintextKey, { product, tier, email, orderId, maxActivations = 1 }) {
  const normalized = normalizeKey(plaintextKey)
  const keyHash = await hashKey(normalized)
  const keyPublic = publicLabel(normalized)
  const now = Date.now()

  await database
    .prepare(`INSERT INTO licenses
              (key_hash, key_public, product, tier, status, max_activations, email, note, batch, created_at)
              VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`)
    .bind(
      keyHash, keyPublic, product, tier, maxActivations,
      email || null,
      // The order id in `note` rather than a new column: it is
      // exactly what the column is for, it needs no migration
      // against a table that already holds live keys, and it is
      // the first thing anyone looking at a row wants to know.
      orderId ? `order:${orderId}` : null,
      `auto-${new Date(now).toISOString().slice(0, 10)}-${tier}`,
      now
    )
    .run()

  return { keyHash, keyPublic }
}


// ==========================================
// listLicenses
// The licences that exist, newest first.
// ==========================================
export async function listLicenses(database, {
  status = '', tier = '', batch = '', product = '', q = '', limit = 50, offset = 0
} = {}) {
  const where = []
  const args = []

  if (status) { where.push('l.status = ?'); args.push(String(status)) }
  if (tier) { where.push('l.tier = ?'); args.push(String(tier)) }
  if (batch) { where.push('l.batch = ?'); args.push(String(batch)) }
  if (product) { where.push('l.product = ?'); args.push(String(product)) }

  if (q) {
    // Matched case-insensitively against all three, because an
    // operator pasting "DSNAP-Q3MDQ" from an email, or an order id
    // from the checkout panel, or a customer's address, all mean
    // "find me this licence".
    where.push('(UPPER(l.key_public) LIKE UPPER(?) OR UPPER(l.email) LIKE UPPER(?) OR UPPER(l.note) LIKE UPPER(?))')
    const like = '%' + String(q).trim() + '%'
    args.push(like, like, like)
  }

  const clause = where.length ? 'WHERE ' + where.join(' AND ') : ''
  const size = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200)
  const skip = Math.max(parseInt(offset, 10) || 0, 0)

  const { results } = await database.prepare(
    `SELECT l.*,
            (SELECT COUNT(*) FROM license_activations a WHERE a.key_hash = l.key_hash) AS seats_used
     FROM licenses l
     ${clause}
     ORDER BY l.created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(...args, size, skip).all()

  const total = await database.prepare(
    `SELECT COUNT(*) AS n FROM licenses l ${clause}`
  ).bind(...args).first()

  return { rows: results || [], total: (total && total.n) || 0, limit: size, offset: skip }
}


// ==========================================
// findLicenseByLabel
// One licence by its masked public label.
//
// Matched with a LIKE on the two ends rather than on the
// literal string, because the ellipsis in the middle is a
// display character that does not survive every copy-paste.
// ==========================================
export async function findLicenseByLabel(database, label) {
  const text = String(label || '').trim()
  if (!text) return null

  const exact = await database
    .prepare('SELECT * FROM licenses WHERE key_public = ? LIMIT 1')
    .bind(text)
    .first()
  if (exact) return exact

  // Fall back to first-group + last-group matching, which survives
  // an ellipsis that got mangled into "..." or dropped entirely.
  const parts = text.replace(/[…]/g, '-').split('-').filter(Boolean)
  if (parts.length < 3) return null

  const head = parts[0] + '-' + parts[1] + '%'
  const tail = '%' + parts[parts.length - 1]

  const { results } = await database
    .prepare('SELECT * FROM licenses WHERE key_public LIKE ? AND key_public LIKE ? LIMIT 2')
    .bind(head, tail)
    .all()

  // Exactly one match, or nothing. Two rows sharing both ends is
  // vanishingly unlikely and, if it ever happened, acting on a
  // guess would be revoking the wrong customer's licence.
  return (results && results.length === 1) ? results[0] : null
}


// ==========================================
// findLicenseByOrder
// The licence a checkout order produced.
// ==========================================
export async function findLicenseByOrder(database, orderId) {
  const id = String(orderId || '').trim()
  if (!id) return null

  return database
    .prepare('SELECT * FROM licenses WHERE note = ? LIMIT 1')
    .bind('order:' + id)
    .first()
}


// ==========================================
// deleteLicense
// Removes a licence row and its activations outright.
// ==========================================
export async function deleteLicense(database, keyHash) {
  await database.prepare('DELETE FROM license_activations WHERE key_hash = ?').bind(keyHash).run()
  const result = await database.prepare('DELETE FROM licenses WHERE key_hash = ?').bind(keyHash).run()
  return Boolean(result && result.meta && result.meta.changes > 0)
}


// ==========================================
// licenseStats
// The shape of the whole table at a glance.
// ==========================================
export async function licenseStats(database) {
  const { results } = await database.prepare(
    `SELECT tier,
            status,
            COUNT(*) AS n,
            SUM(CASE WHEN first_activated_at IS NOT NULL THEN 1 ELSE 0 END) AS activated
     FROM licenses
     GROUP BY tier, status`
  ).all()

  const seats = await database.prepare(
    'SELECT COUNT(*) AS n FROM license_activations'
  ).first()

  return { byTierAndStatus: results || [], machinesActivated: (seats && seats.n) || 0 }
}


// ==========================================
// setStatus
// Revokes or restores a key.
//
// Already-issued tokens keep working until they expire.
// That is the deliberate cost of offline verification,
// and it is bounded by the token lifetime.
// ==========================================
export async function setStatus(database, keyHash, status) {
  await database
    .prepare('UPDATE licenses SET status = ? WHERE key_hash = ?')
    .bind(status, keyHash)
    .run()

  if (status === 'revoked') {
    await database.prepare('DELETE FROM license_activations WHERE key_hash = ?').bind(keyHash).run()
  }
}


// ==========================================
// isRateLimited
// Whether this caller has failed too often lately.
// ==========================================
export async function isRateLimited(database, ip) {
  const ipHash = await hashIp(ip)
  const since = Date.now() - ATTEMPT_WINDOW_MS

  await database.prepare('DELETE FROM license_attempts WHERE at < ?').bind(since).run()

  const row = await database
    .prepare('SELECT COUNT(*) AS n FROM license_attempts WHERE ip_hash = ? AND at >= ?')
    .bind(ipHash, since)
    .first()

  return (row && row.n ? row.n : 0) >= ATTEMPT_LIMIT
}


// ==========================================
// recordFailedAttempt
// One failure against a caller.
// ==========================================
export async function recordFailedAttempt(database, ip) {
  const ipHash = await hashIp(ip)
  await database
    .prepare('INSERT INTO license_attempts (ip_hash, at) VALUES (?, ?)')
    .bind(ipHash, Date.now())
    .run()
}


export const RATE_LIMIT = { windowMs: ATTEMPT_WINDOW_MS, limit: ATTEMPT_LIMIT }
