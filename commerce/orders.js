// ==========================================
// commerce/orders.js
// Every D1 query the checkout makes.
//
// The same split as licensing/store.js, for the same
// reason: the rules about what an order state means, when a
// row may be claimed, and how a retry is scheduled belong
// in one file instead of being re-derived slightly
// differently in the webhook, the cron and the status page.
//
// Every function takes the database binding explicitly. A
// module global would make it possible to run an order
// query against the game database, which is a bug with no
// symptom until it has one.
// ==========================================

import { CONFIG } from '../config.js'
import { hashEmail } from './seal.js'
import { hashIp } from '../licensing/keys.js'


// ==========================================
// ORDER_STATE
// The state machine, spelled once.
//
// Constants rather than string literals at forty call
// sites, because 'awaiting_payment' misspelled in one
// UPDATE is a row that never matches any query again and
// never throws.
// ==========================================
export const ORDER_STATE = {
  CREATED: 'created',
  AWAITING: 'awaiting_payment',
  PARTIAL: 'partially_paid',
  PAID: 'paid',
  ISSUING: 'issuing',
  ISSUED: 'issued',
  DELIVERED: 'delivered',
  EXPIRED: 'expired',
  REFUNDED: 'refunded',
  FAILED: 'failed'
}

// States a background pass should still be looking at. A
// delivered or refunded order is finished; everything else
// is either waiting for money or waiting for us.
const OPEN_STATES = [
  ORDER_STATE.CREATED,
  ORDER_STATE.AWAITING,
  ORDER_STATE.PARTIAL,
  ORDER_STATE.PAID,
  ORDER_STATE.ISSUING,
  ORDER_STATE.ISSUED
]


// ==========================================
// db
// The licence/commerce database, or null.
//
// Null rather than a throw, so an unconfigured deployment
// answers "checkout is not set up here" instead of a 500 -
// the same contract licensing/store.js offers, because it
// is the same database and the same fresh-clone problem.
// ==========================================
export function db(env) {
  return (env && env.LICENSE_DB) || null
}


function now() {
  return Date.now()
}


// ==========================================
// newOrderId
// "ord_" + 24 hex characters.
//
// From the CSPRNG rather than a counter or a timestamp.
// The id is the customer's handle on their own purchase
// and appears in a URL; a sequential one would let anybody
// with one order walk to their neighbour's. The prefix is
// for humans reading a support thread, who need to tell an
// order id from a payment id at a glance.
// ==========================================
export function newOrderId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return 'ord_' + [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
}


// ==========================================
// createOrder
// The row, before the provider is called.
//
// Written first on purpose. If the provider call fails, or
// the isolate dies mid-flight, this row is what lets the
// reconciler find out later whether money arrived for
// something we never finished opening. An order created
// after a successful provider call would be an order that
// cannot exist in the one case it is needed for.
// ==========================================
export async function createOrder(database, { id, tier, priceUsd, email, lang }) {
  const at = now()

  await database.prepare(
    `INSERT INTO orders
     (id, product, tier, price_usd, email, email_hash, lang, status,
      provider, delivery_attempts, created_at, updated_at)
     VALUES (?, 'unity-docsnap', ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
  ).bind(
    id, tier, String(priceUsd), email, await hashEmail(email), lang,
    ORDER_STATE.CREATED, CONFIG.COMMERCE.PROVIDER, at, at
  ).run()

  return getOrder(database, id)
}


export async function getOrder(database, id) {
  if (!id) return null
  return database.prepare('SELECT * FROM orders WHERE id = ? LIMIT 1').bind(id).first()
}


export async function getOrderByInvoice(database, invoiceId) {
  if (!invoiceId) return null
  return database
    .prepare('SELECT * FROM orders WHERE provider_invoice_id = ? ORDER BY created_at DESC LIMIT 1')
    .bind(String(invoiceId))
    .first()
}


// ==========================================
// markInvoiceOpened
// The provider answered; the customer is on their way to
// pay.
// ==========================================
export async function markInvoiceOpened(database, id, invoiceId) {
  await database.prepare(
    'UPDATE orders SET status = ?, provider_invoice_id = ?, updated_at = ? WHERE id = ?'
  ).bind(ORDER_STATE.AWAITING, String(invoiceId), now(), id).run()
}


// ==========================================
// recordPayment
// What the provider says about the money, whatever the
// answer is.
//
// Separate from the state transition below because the two
// have different rules: the payment facts are always worth
// writing down, even for a status we then decide not to act
// on, and especially for a partial payment where those three
// numbers are the entire basis on which a human will decide
// what to do.
// ==========================================
export async function recordPayment(database, id, payment) {
  await database.prepare(
    `UPDATE orders
     SET provider_payment_id = COALESCE(?, provider_payment_id),
         pay_currency        = COALESCE(?, pay_currency),
         pay_amount          = COALESCE(?, pay_amount),
         actually_paid       = COALESCE(?, actually_paid),
         updated_at          = ?
     WHERE id = ?`
  ).bind(
    payment.paymentId || null,
    payment.payCurrency || null,
    payment.payAmount || null,
    payment.actuallyPaid || null,
    now(), id
  ).run()
}


// ==========================================
// markPaid
// The transition that makes an order deliverable.
//
// Guarded on the CURRENT state rather than applied
// unconditionally, and the guard is the point: a callback
// for a payment that finished can arrive after we have
// already issued and delivered the key, and an unguarded
// UPDATE would push a delivered order back to `paid` -
// where the next cron tick would dutifully issue it a
// second key.
//
// Returns whether it actually moved, so the caller can tell
// "this is the transition" from "somebody already did it".
// ==========================================
export async function markPaid(database, id) {
  const at = now()
  const result = await database.prepare(
    `UPDATE orders SET status = ?, paid_at = COALESCE(paid_at, ?), updated_at = ?
     WHERE id = ? AND status IN (?, ?, ?, ?)`
  ).bind(
    ORDER_STATE.PAID, at, at, id,
    ORDER_STATE.CREATED, ORDER_STATE.AWAITING, ORDER_STATE.PARTIAL, ORDER_STATE.EXPIRED
  ).run()

  return changed(result)
}


// ==========================================
// claimForIssuing
// The lock that stops two workers minting two keys for one
// order.
//
// This is the only mutual exclusion in the checkout, and it
// is a conditional UPDATE rather than a lock table because
// D1 tells us how many rows an UPDATE touched. A webhook and
// a cron tick arriving in the same second both run this;
// exactly one sees a change count of 1, and the other walks
// away.
//
// ISSUING is also re-claimable after a grace period, because
// the alternative is worse. A Worker that dies between
// claiming and issuing would otherwise leave an order locked
// forever, with the customer's money taken - so a claim older
// than the grace window is treated as abandoned and taken
// over. Two minutes is far longer than the work takes and
// far shorter than a customer's patience.
// ==========================================
export async function claimForIssuing(database, id, graceMs = 2 * 60 * 1000) {
  const at = now()
  const result = await database.prepare(
    `UPDATE orders SET status = ?, updated_at = ?
     WHERE id = ? AND (status = ? OR (status = ? AND updated_at < ?))`
  ).bind(ORDER_STATE.ISSUING, at, id, ORDER_STATE.PAID, ORDER_STATE.ISSUING, at - graceMs).run()

  return changed(result)
}


// ==========================================
// attachLicense
// The key this order produced.
//
// key_sealed_until is set here rather than at delivery, so
// the retention clock starts when the key exists. Starting
// it at delivery would mean an order whose email keeps
// failing holds a plaintext key indefinitely - which is the
// exact case where it is most likely to be forgotten about.
// ==========================================
export async function attachLicense(database, id, { keyHash, keyPublic, sealed }) {
  const at = now()
  await database.prepare(
    `UPDATE orders
     SET key_hash = ?, key_public = ?, key_sealed = ?, key_sealed_until = ?,
         status = ?, updated_at = ?
     WHERE id = ?`
  ).bind(
    keyHash, keyPublic, sealed, at + CONFIG.COMMERCE.KEY_RETENTION_MS,
    ORDER_STATE.ISSUED, at, id
  ).run()
}


// ==========================================
// markDelivered
// A mail provider accepted the key email.
//
// "Accepted", not "read". That is the strongest claim
// anything in this system can honestly make, and the
// customer-facing copy is written to match - the status
// page says the key was sent, never that it arrived.
// ==========================================
export async function markDelivered(database, id) {
  const at = now()
  await database.prepare(
    `UPDATE orders SET status = ?, delivered_at = COALESCE(delivered_at, ?), updated_at = ?
     WHERE id = ? AND status IN (?, ?, ?)`
  ).bind(ORDER_STATE.DELIVERED, at, at, id, ORDER_STATE.ISSUED, ORDER_STATE.ISSUING, ORDER_STATE.PAID).run()
}


// ==========================================
// setStatus
// A transition with no side effects of its own: expiry,
// refund, partial payment, terminal failure.
// ==========================================
export async function setStatus(database, id, status, lastError = null) {
  await database.prepare(
    'UPDATE orders SET status = ?, last_error = COALESCE(?, last_error), updated_at = ? WHERE id = ?'
  ).bind(status, lastError, now(), id).run()
}


// ==========================================
// noteFailure
// A delivery attempt that did not work.
//
// Increments the counter and records the reason without
// changing the state, because the state is what the retry
// loop selects on and a failed attempt has not changed what
// the order still needs.
// ==========================================
export async function noteFailure(database, id, message) {
  await database.prepare(
    `UPDATE orders SET delivery_attempts = delivery_attempts + 1,
                       last_error = ?, updated_at = ?
     WHERE id = ?`
  ).bind(String(message || '').slice(0, 400), now(), id).run()
}


// ==========================================
// findOpenOrders
// Everything a reconciliation pass should look at.
//
// Bounded by both age and count. Age, so a tick does not
// re-examine an order that was created eleven seconds ago
// and is simply still being paid; count, so a backlog after
// an outage is worked through over several ticks instead of
// blowing one tick's CPU budget and completing none of it.
// ==========================================
export async function findOpenOrders(database, { olderThanMs = 0, limit = 40 } = {}) {
  const cutoff = now() - olderThanMs
  const placeholders = OPEN_STATES.map(() => '?').join(', ')

  const { results } = await database.prepare(
    `SELECT * FROM orders
     WHERE status IN (${placeholders}) AND updated_at < ?
     ORDER BY updated_at ASC LIMIT ?`
  ).bind(...OPEN_STATES, cutoff, limit).all()

  return results || []
}


// ==========================================
// findOrdersByEmail
// A customer's recent orders, for the recovery page.
//
// Capped at five and newest first. Somebody looking for a
// key they bought is looking for the one they just bought,
// and a list of everything they ever purchased is a longer
// page that answers the question less well.
// ==========================================
export async function findOrdersByEmail(database, email, limit = 5) {
  const { results } = await database.prepare(
    `SELECT * FROM orders WHERE email_hash = ?
     ORDER BY created_at DESC LIMIT ?`
  ).bind(await hashEmail(email), limit).all()

  return results || []
}


// ==========================================
// wipeExpiredSeals
// Drops plaintext keys whose retention window has passed.
//
// The clean-up half of the bargain struck in the schema:
// the plaintext is kept so a lost email can be answered
// with the same key, and it does not get kept forever. Run
// from cron, so no request path ever pays for it.
// ==========================================
export async function wipeExpiredSeals(database) {
  const result = await database.prepare(
    `UPDATE orders SET key_sealed = NULL, updated_at = ?
     WHERE key_sealed IS NOT NULL AND key_sealed_until IS NOT NULL AND key_sealed_until < ?`
  ).bind(now(), now()).run()

  return changed(result) ? (result.meta.changes || 0) : 0
}


// ==========================================
// logEvent
// One line in an order's history.
//
// Never throws into the caller. This is diagnostics, and a
// diagnostic write that can fail a sale is worse than no
// diagnostics - the one moment the log is most wanted is
// the moment the database is having trouble.
// ==========================================
export async function logEvent(database, orderId, kind, detail = '') {
  try {
    await database.prepare(
      'INSERT INTO order_events (order_id, kind, detail, at) VALUES (?, ?, ?, ?)'
    ).bind(orderId, kind, String(detail).slice(0, 500), now()).run()
  } catch {
    // Deliberately silent.
  }
}


export async function listEvents(database, orderId, limit = 50) {
  const { results } = await database.prepare(
    'SELECT kind, detail, at FROM order_events WHERE order_id = ? ORDER BY at ASC LIMIT ?'
  ).bind(orderId, limit).all()
  return results || []
}


// ==========================================
// claimWebhook
// Whether this exact callback is new.
//
// The de-duplication is the INSERT itself: the table's
// primary key is (provider, event_key), so a repeat is a
// constraint violation rather than something we have to
// remember to check for. Returning false on the exception
// makes "have I seen this?" and "record that I have seen
// it" a single atomic step, which is the only way two
// simultaneous retries can both be handled correctly.
// ==========================================
export async function claimWebhook(database, provider, eventKey, orderId) {
  try {
    await database.prepare(
      'INSERT INTO webhook_log (provider, event_key, order_id, at) VALUES (?, ?, ?, ?)'
    ).bind(provider, eventKey, orderId || null, now()).run()
    return true
  } catch {
    return false
  }
}


// ==========================================
// pruneWebhookLog
// Forgets callbacks older than a month.
//
// Retention has to outlast any retry a provider will ever
// attempt, or an ancient re-delivery would look new and be
// acted on. A month is comfortably past that and keeps the
// table from being a permanent record of nothing.
// ==========================================
export async function pruneWebhookLog(database, olderThanMs = 30 * 24 * 60 * 60 * 1000) {
  await database.prepare('DELETE FROM webhook_log WHERE at < ?').bind(now() - olderThanMs).run()
}


// ==========================================
// isOrderRateLimited
// Whether this caller has opened too many orders lately.
//
// Swept on read, like the licence system's limiter, and for
// the same reasons: no scheduler to depend on, an indexed
// delete, and a table that cleans itself as a side effect of
// being used.
// ==========================================
export async function isOrderRateLimited(database, ip) {
  const ipHash = await hashIp(ip)
  const since = now() - CONFIG.COMMERCE.ORDER_RATE_WINDOW_MS

  await database.prepare('DELETE FROM order_attempts WHERE at < ?').bind(since).run()

  const row = await database.prepare(
    'SELECT COUNT(*) AS n FROM order_attempts WHERE ip_hash = ? AND at >= ?'
  ).bind(ipHash, since).first()

  return (row && row.n ? row.n : 0) >= CONFIG.COMMERCE.ORDER_RATE_LIMIT
}


export async function recordOrderAttempt(database, ip) {
  await database.prepare(
    'INSERT INTO order_attempts (ip_hash, at) VALUES (?, ?)'
  ).bind(await hashIp(ip), now()).run()
}


// ==========================================
// Mail outbox
// ==========================================

// ==========================================
// queueMail
// A rendered message, waiting to go.
//
// next_attempt_at is now, so the immediate send that
// follows is simply the first attempt rather than a
// separate path - which means the retry loop and the happy
// path run identical code, and the retry loop is therefore
// exercised on every single sale instead of only on the bad
// days.
// ==========================================
export async function queueMail(database, { orderId, kind, to, lang, subject, html, text }) {
  const id = 'mail_' + crypto.randomUUID().replace(/-/g, '').slice(0, 20)
  const at = now()

  await database.prepare(
    `INSERT INTO mail_outbox
     (id, order_id, kind, to_email, lang, subject, html, text, attempts, next_attempt_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
  ).bind(id, orderId || null, kind, to, lang || 'en', subject, html, text, at, at).run()

  return id
}


export async function getMail(database, id) {
  return database.prepare('SELECT * FROM mail_outbox WHERE id = ? LIMIT 1').bind(id).first()
}


// ==========================================
// findDueMail
// Unsent messages whose next attempt is due.
//
// The attempts ceiling is the length of the backoff
// schedule: once every delay has been used, the row stops
// being selected and an operator alert has already been
// raised. Retrying past that is a queue that never drains
// and a log nobody reads twice.
// ==========================================
export async function findDueMail(database, limit = 20) {
  const { results } = await database.prepare(
    `SELECT * FROM mail_outbox
     WHERE sent_at IS NULL AND next_attempt_at <= ? AND attempts < ?
     ORDER BY next_attempt_at ASC LIMIT ?`
  ).bind(now(), CONFIG.COMMERCE.MAIL_RETRY_MINUTES.length, limit).all()

  return results || []
}


export async function markMailSent(database, id, via) {
  await database.prepare(
    'UPDATE mail_outbox SET sent_at = ?, sent_via = ?, last_error = NULL WHERE id = ?'
  ).bind(now(), via || '', id).run()
}


// ==========================================
// markMailFailed
// Records the failure and books the next attempt.
//
// The delay comes from the configured schedule, indexed by
// how many attempts have already happened, and clamps to
// the last entry. Reading the schedule here rather than
// computing an exponential means the gaps are a thing an
// operator can look at and change, which matters because
// the right answer depends on the mail provider and not on
// arithmetic.
// ==========================================
export async function markMailFailed(database, id, attempts, message) {
  const schedule = CONFIG.COMMERCE.MAIL_RETRY_MINUTES
  const minutes = schedule[Math.min(attempts, schedule.length - 1)]

  await database.prepare(
    `UPDATE mail_outbox SET attempts = ?, next_attempt_at = ?, last_error = ? WHERE id = ?`
  ).bind(attempts + 1, now() + minutes * 60 * 1000, String(message || '').slice(0, 400), id).run()
}


// ==========================================
// countRecentMail
// How many messages of one kind an order has already sent
// in a window.
//
// Backs the resend button's limit. Without it, the button
// is a way to make our mail provider send a stranger
// unlimited email, which is both a bill and a fast route to
// being told our domain sends spam.
// ==========================================
export async function countRecentMail(database, orderId, kind, windowMs) {
  const row = await database.prepare(
    'SELECT COUNT(*) AS n FROM mail_outbox WHERE order_id = ? AND kind = ? AND created_at >= ?'
  ).bind(orderId, kind, now() - windowMs).first()

  return row && row.n ? row.n : 0
}


// ==========================================
// hasLicenseMail
// Whether an order already has a licence email in the
// outbox at all.
//
// The reconciler's test for "is anything going to retry
// this?". An order at `issued` with a queued message is
// owned by the outbox and its backoff schedule; one with no
// message at all crashed before the queue write and needs
// the pipeline run again.
//
// Deliberately counts sent messages too. A delivered
// message is the strongest possible evidence that the
// pipeline is not stuck, and re-running delivery for an
// order whose email is already in the customer's inbox
// would send it twice.
// ==========================================
export async function hasLicenseMail(database, orderId) {
  const row = await database.prepare(
    "SELECT COUNT(*) AS n FROM mail_outbox WHERE order_id = ? AND kind = 'license'"
  ).bind(orderId).first()

  return Boolean(row && row.n > 0)
}


// ==========================================
// changed
// Whether a run() actually touched a row.
//
// D1 reports it under meta.changes, and every conditional
// transition in this file depends on reading it correctly -
// so it is read in one place rather than being spelled out,
// slightly differently, five times.
// ==========================================
function changed(result) {
  return Boolean(result && result.meta && result.meta.changes > 0)
}
