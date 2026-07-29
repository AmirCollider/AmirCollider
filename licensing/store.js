// ==========================================
// licensing/store.js
// Every D1 query the licence system makes.
//
// Isolated from the handlers so that the rules about
// what counts as a seat, what a revoked key does, and
// how long a rate-limit window is live in one file
// instead of being re-implemented slightly differently
// in activate, validate and deactivate.
//
// Every function takes the binding explicitly rather
// than reading it off a module global, so a caller
// cannot accidentally run a licence query against the
// game database.
// ==========================================

import { hashKey, hashIp, publicLabel, normalizeKey } from './keys.js'


// How long a failed-attempt record counts against a
// caller, and how many are allowed inside it.
//
// Twenty in fifteen minutes is far above anything a
// human does - somebody fumbling their key three times
// and then finding the right email never sees it - and
// far below what makes guessing a 75-bit key worth
// starting.
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000
const ATTEMPT_LIMIT = 20


// ==========================================
// db
// The licence database binding, or null.
//
// Returning null rather than throwing lets the caller
// answer with a clear "licensing is not configured on
// this deployment" instead of a 500. That is the state
// of every fresh clone of this repository until the D1
// database is created, and a stack trace is a poor way
// to communicate a missing setup step.
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
//
// Oldest first because that is the order the customer's
// device list reads best: the machine they set up months
// ago is the one they have forgotten about, and it
// belongs at the top of the list they are scanning for
// something to release.
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
//
// Called on renewal as well as activation. It is the
// only place last_seen_at moves, which makes "when did
// this customer last actually run the tool" a real
// answer rather than an inference from the activation
// date.
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
//
// INSERT OR REPLACE rather than a plain INSERT: a
// machine re-activating a key it already holds is a
// completely normal thing (the customer reinstalled
// Unity, or cleared their EditorPrefs) and must refresh
// the row rather than fail on the primary key. The seat
// COUNT is unaffected either way, because the primary
// key is (key_hash, machine_id) - re-activating the same
// machine can never consume a second seat.
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
//
// INSERT OR IGNORE, so a re-run of a generation command
// can never overwrite a key that has already been sold
// and activated. The generator reports how many rows it
// actually created, and a number lower than requested is
// the signal that something was already there.
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
//
// The counterpart to insertLicenses, and deliberately not a
// special case of it. A batch is written ahead of any sale
// and has no owner; this row is created BECAUSE somebody
// bought it, so it can record who and against what - which
// is the difference between a support question that has an
// answer and one that ends in "check the payment provider".
//
// A plain INSERT rather than INSERT OR IGNORE. A collision
// here would mean the CSPRNG produced a key that already
// exists, and quietly ignoring that would hand the customer
// somebody else's licence. Better to throw: the caller
// treats it as a delivery failure, the order stays
// undelivered, and the retry generates a different key.
//
// The plaintext is passed in and never returned. It exists
// in the caller's scope for as long as it takes to seal it
// into the order row and put it in an email, and nothing
// here extends that.
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
//
// This function is the answer to a gap the rest of this file
// created. Everything else here is keyed by the plaintext
// key, because that is what a customer sends when they need
// help - and the table stores only hashes, so a key is the
// ONLY way in. That is exactly right for the customer-facing
// path and useless for the operator, who has to be able to
// ask "what have I sold?" and "revoke that one" about a
// licence nobody has emailed them about.
//
// Without this, the only way to see a licence was to open
// the D1 console and write SQL, and the only way to revoke
// one was to already possess the key you wanted to revoke -
// which, for a key being used illegitimately, is the one
// thing you do not have.
//
// Filters are all optional and all parameterised. `q` is the
// free-text one, matched against the masked label, the email
// and the note (which carries the order id), because those
// are the three things an operator actually has in front of
// them when they come looking.
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
// The label is what appears in an email, in the order record
// and on the management page - "DSNAP-Q3MDQ-…-C3R7T" - and it
// is deliberately five characters short of usable as a key.
// That makes it the safe identifier to pass around an admin
// interface: enough to name a row, not enough to activate
// anything.
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
//
// Joins through the note column, which issueLicenseForOrder
// fills with "order:<id>". That is the link between a payment
// and a key, and it is the identifier an operator has when
// the complaint arrives via the order rather than the key.
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
//
// Deliberately separate from setStatus, and deliberately not
// the thing the interface offers first. Revoking keeps the
// row, which is what makes "was this key ever real?" a
// question with an answer six months later - and a deleted
// key is one nobody can explain, to a customer or to
// themselves.
//
// It exists for the two cases revoking does not cover: a
// batch generated by mistake that was never sold, and a
// genuine erasure request. Both are rare and both are
// deliberate, which is why the caller has to ask for it
// explicitly.
// ==========================================
export async function deleteLicense(database, keyHash) {
  await database.prepare('DELETE FROM license_activations WHERE key_hash = ?').bind(keyHash).run()
  const result = await database.prepare('DELETE FROM licenses WHERE key_hash = ?').bind(keyHash).run()
  return Boolean(result && result.meta && result.meta.changes > 0)
}


// ==========================================
// licenseStats
// The shape of the whole table at a glance.
//
// What an operator wants on opening the page: how many keys
// exist, how many are live, how many were ever activated,
// and how many have been revoked - per tier, because the two
// tiers are two products with two prices.
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
// Revoking also drops its activations, because the two
// halves of "this key no longer works" have to happen
// together: a revoked key whose seats survived would
// look free again the moment somebody un-revoked it by
// mistake, and would keep answering seat questions in
// the meantime.
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
//
// The window is swept on read rather than by a cron:
// there is no scheduler to depend on, the delete is
// indexed, and a table nobody reads never needs
// cleaning. Sweeping globally rather than per-IP keeps
// the whole table bounded by traffic instead of by the
// number of distinct callers who ever failed.
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
//
// Only failures. A customer activating successfully
// writes nothing here, so a busy launch day does not
// rate-limit itself, and the table holds only the
// traffic that had no business succeeding.
// ==========================================
export async function recordFailedAttempt(database, ip) {
  const ipHash = await hashIp(ip)
  await database
    .prepare('INSERT INTO license_attempts (ip_hash, at) VALUES (?, ?)')
    .bind(ipHash, Date.now())
    .run()
}


export const RATE_LIMIT = { windowMs: ATTEMPT_WINDOW_MS, limit: ATTEMPT_LIMIT }
