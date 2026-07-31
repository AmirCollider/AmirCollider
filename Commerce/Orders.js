// ==========================================
// Commerce/Orders.js
// Every D1 query the checkout makes.
// ==========================================

import { CONFIG } from '../Config.js'
import { hashEmail } from './Seal.js'
import { hashIp } from '../Licensing/Keys.js'


// ==========================================
// ORDER_STATE
// The state machine, spelled once.
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
// ==========================================
export function newOrderId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return 'ord_' + [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
}


// ==========================================
// createOrder
// The row, before the provider is called.
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


// ==========================================
// Test orders
// ==========================================
export const TEST_PROVIDER = 'test'

export function isTestOrder(order) {
  return Boolean(order && order.provider === TEST_PROVIDER)
}


// ==========================================
// createTestOrder
// A row that behaves like a paid-for order, without a
// payment provider having been called.
// ==========================================
export async function createTestOrder(database, { id, tier, priceUsd, email, lang }) {
  const at = now()

  await database.prepare(
    `INSERT INTO orders
     (id, product, tier, price_usd, email, email_hash, lang, status,
      provider, provider_invoice_id, delivery_attempts, created_at, updated_at)
     VALUES (?, 'unity-docsnap', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
  ).bind(
    id, tier, String(priceUsd), email, await hashEmail(email), lang,
    ORDER_STATE.AWAITING, TEST_PROVIDER, 'test_' + id.slice(4, 12), at, at
  ).run()

  return getOrder(database, id)
}


export async function listTestOrders(database, limit = 50) {
  const { results } = await database.prepare(
    'SELECT * FROM orders WHERE provider = ? ORDER BY created_at DESC LIMIT ?'
  ).bind(TEST_PROVIDER, limit).all()
  return results || []
}


// ==========================================
// purgeTestOrders
// Removes every rehearsal row and everything it created.
// ==========================================
export async function purgeTestOrders(database) {
  const orders = await listTestOrders(database, 500)
  if (!orders.length) return { orders: 0, licenses: 0, mail: 0, events: 0 }

  let licenses = 0
  for (const order of orders) {
    if (!order.key_hash) continue
    const result = await database.prepare(
      "UPDATE licenses SET status = 'revoked' WHERE key_hash = ? AND note = ?"
    ).bind(order.key_hash, 'order:' + order.id).run()
    if (result && result.meta && result.meta.changes) licenses += result.meta.changes

    await database.prepare('DELETE FROM license_activations WHERE key_hash = ?').bind(order.key_hash).run()
  }

  const ids = orders.map(order => order.id)
  const holes = ids.map(() => '?').join(', ')

  const mail = await database.prepare(`DELETE FROM mail_outbox WHERE order_id IN (${holes})`).bind(...ids).run()
  const events = await database.prepare(`DELETE FROM order_events WHERE order_id IN (${holes})`).bind(...ids).run()
  await database.prepare(`DELETE FROM webhook_log WHERE order_id IN (${holes})`).bind(...ids).run()
  await database.prepare('DELETE FROM orders WHERE provider = ?').bind(TEST_PROVIDER).run()

  return {
    orders: orders.length,
    licenses,
    mail: (mail.meta && mail.meta.changes) || 0,
    events: (events.meta && events.meta.changes) || 0
  }
}


// ==========================================
// listOutbox
// Every message an order produced, newest first.
// ==========================================
export async function listOutbox(database, orderId, limit = 20) {
  const { results } = await database.prepare(
    `SELECT id, kind, to_email, subject, attempts, next_attempt_at, sent_at, sent_via, last_error, created_at
     FROM mail_outbox WHERE order_id = ? ORDER BY created_at DESC LIMIT ?`
  ).bind(orderId, limit).all()
  return results || []
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
// ==========================================
export async function pruneWebhookLog(database, olderThanMs = 30 * 24 * 60 * 60 * 1000) {
  await database.prepare('DELETE FROM webhook_log WHERE at < ?').bind(now() - olderThanMs).run()
}


// ==========================================
// isOrderRateLimited
// Whether this caller has opened too many orders lately.
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
// ==========================================
function changed(result) {
  return Boolean(result && result.meta && result.meta.changes > 0)
}
