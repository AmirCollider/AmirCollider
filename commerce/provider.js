// ==========================================
// commerce/provider.js
// The payment provider, behind an interface the rest of the
// checkout can hold without knowing whose it is.
//
// Public exports:
//   isConfigured(env)
//   createInvoice(env, { orderId, tier, priceUsd, lang, description })
//   fetchPayment(env, paymentId)
//   fetchInvoicePayments(env, invoiceId)
//   normalizeStatus(providerStatus)
//   PAYMENT_STATE
//
// NOWPayments, using their hosted invoice rather than their
// raw payment API, and that is the central decision here.
//
// The raw API hands back a coin address and an amount, and
// then we would owe the customer everything that goes with
// it: a QR code they can scan from a phone wallet, a
// countdown, a note about which network a USDT transfer has
// to use, and a coin picker covering three hundred assets.
// Getting the network note wrong on one coin means a
// customer sends real money to an address that will never
// credit it.
//
// The hosted invoice is that entire surface, built and
// maintained by the people whose job it is, and it is
// exactly what "pay with whatever currency you like"
// requires. What stays on our side is the part that is
// actually ours: knowing which order a payment belongs to,
// and turning a confirmed one into a licence key.
// ==========================================

import { CONFIG } from '../config.js'
import { logError, logInfo, logWarning } from '../utils.js'


// ==========================================
// PAYMENT_STATE
// Our vocabulary, not the provider's.
//
// Provider status strings are mapped into these before
// anything else in the checkout sees them, so a provider
// that renames a status - or a second provider with an
// entirely different set - changes this file and no other.
// ==========================================
export const PAYMENT_STATE = {
  PENDING: 'pending',     // opened, nothing received
  PARTIAL: 'partial',     // some funds arrived, not enough
  PAID: 'paid',           // enough funds, confirmed
  FAILED: 'failed',       // provider gave up on it
  EXPIRED: 'expired',     // window closed unpaid
  REFUNDED: 'refunded',   // reversed after the fact
  UNKNOWN: 'unknown'
}


// ==========================================
// normalizeStatus
// A NOWPayments status string, mapped in.
//
// `confirmed` counts as paid alongside `finished`, and that
// is a considered choice rather than an oversight.
// `confirmed` means the blockchain has the transaction with
// enough confirmations; `finished` means the provider has
// finished settling it into our account. The gap between
// them is minutes to hours, and it is a gap the customer
// spends staring at a page having already paid.
//
// For a digital good with no marginal cost and a revocable
// licence, waiting out that gap buys nothing. A payment
// that reaches `confirmed` and then somehow reverses is
// answered by revoking a key, which is one admin call - and
// it has to exist anyway for chargebacks.
//
// An unrecognised status maps to UNKNOWN and is logged
// rather than guessed at. Guessing in the paid direction
// gives away the product; guessing in the failed direction
// tells somebody who paid that they did not.
// ==========================================
export function normalizeStatus(status) {
  switch (String(status || '').toLowerCase()) {
    case 'waiting':
    case 'confirming':
    case 'sending':
      return PAYMENT_STATE.PENDING
    case 'partially_paid':
      return PAYMENT_STATE.PARTIAL
    case 'confirmed':
    case 'finished':
      return PAYMENT_STATE.PAID
    case 'failed':
      return PAYMENT_STATE.FAILED
    case 'expired':
      return PAYMENT_STATE.EXPIRED
    case 'refunded':
       return PAYMENT_STATE.REFUNDED
    default:
      return PAYMENT_STATE.UNKNOWN
  }
}


// ==========================================
// isConfigured
// Whether this deployment can take money.
//
// Checked before the checkout page renders a buy button, so
// a fresh clone of this repository shows an honest "not
// available yet" instead of a form that collects an email
// address and then fails.
// ==========================================
export function isConfigured(env) {
  return Boolean(env && env.NOWPAYMENTS_API_KEY && env.NOWPAYMENTS_IPN_SECRET)
}


// ==========================================
// isSandbox
// Whether this deployment is pointed at the rehearsal API.
//
// Reported by the test panel, and worth reporting loudly:
// a site quietly running against the sandbox looks
// completely healthy - invoices open, callbacks arrive,
// keys are delivered - and none of the money is real.
// ==========================================
export function isSandbox(env) {
  return /sandbox/i.test(apiBase(env))
}


// ==========================================
// call
// One request to the provider, with a timeout and a
// non-leaking failure.
//
// The timeout matters more than it looks: this call sits
// inside a customer's click on "pay", and a provider having
// a slow morning would otherwise hold that request until
// the Worker's own limit kills it - turning a ten-second
// hiccup into a blank error page. Fifteen seconds, then we
// answer for ourselves.
//
// The provider's error body is logged and never returned.
// It can contain our account identifiers, and a customer
// does not benefit from reading an upstream API's opinion
// of our request.
// ==========================================
// ==========================================
// apiBase
// Which NOWPayments to talk to.
//
// An environment override rather than only the constant in
// config.js, so switching to the sandbox for a rehearsal is
// `wrangler secret put NOWPAYMENTS_API_BASE` and switching
// back is deleting it - neither of which is a code change
// that could be forgotten in a deploy and leave the live
// site taking sandbox money it will never receive.
//
// Live is the default precisely because that failure is
// one-directional: a sandbox that is accidentally live
// takes fake money and nobody loses anything, while a live
// site accidentally pointed at the sandbox takes real
// payments into an account that does not exist.
// ==========================================
function apiBase(env) {
  const override = env && env.NOWPAYMENTS_API_BASE
  return (override ? String(override) : CONFIG.COMMERCE.PROVIDER_API).replace(/\/+$/, '')
}


async function call(env, path, { method = 'GET', body = null } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)

  try {
    const response = await fetch(apiBase(env) + path, {
      method,
      headers: {
        'x-api-key': env.NOWPAYMENTS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    })

    const text = await response.text()

    if (!response.ok) {
      logError('Payment provider rejected a call', {
        path,
        status: response.status,
        // The provider's own error code, if it gave one. Not the
        // body - see above.
        providerError: safeCode(text)
      })
      return { ok: false, status: response.status, error: 'provider_error' }
    }

    try {
      return { ok: true, data: JSON.parse(text) }
    } catch {
      logError('Payment provider returned malformed JSON', { path })
      return { ok: false, status: 502, error: 'provider_bad_response' }
    }

  } catch (error) {
    const aborted = error && error.name === 'AbortError'
    logError('Payment provider unreachable', { path, aborted, error: error.message })
    return { ok: false, status: 504, error: aborted ? 'provider_timeout' : 'provider_unreachable' }

  } finally {
    clearTimeout(timer)
  }
}

function safeCode(body) {
  try {
    const parsed = JSON.parse(body)
    return parsed.code || parsed.statusCode || parsed.message || 'unknown'
  } catch {
    return 'unparsable'
  }
}


// ==========================================
// createInvoice
// A hosted payment page for one order.
//
// order_id carries OUR order id, and that is the whole
// linkage between a payment and a customer. Every callback
// and every reconciliation looks the order up by it, so it
// is the one field here that must never be changed to
// something prettier.
//
// success_url returns the customer to our own status page
// rather than to the product page: the moment after paying
// is the moment they most want to be told the key is on its
// way, and a landing back on a page with a buy button on it
// reads as "did that work?".
//
// No pay_currency is sent. Fixing one would defeat the
// point - the invoice is meant to offer every coin the
// provider supports and let the customer choose.
// ==========================================
// ------------------------------------------------------------
// The three paths are parameters with the licence checkout's
// own values as defaults, because there are now two shops on
// this Worker riding one provider account.
//
// The callback path in particular has to be per-shop: both
// callbacks are verified with the same IPN secret, and a game
// purchase delivered to the licence checkout's webhook would be
// looked up in the wrong table and answered as an unknown
// order - money arriving against nothing, on the one path built
// to make that impossible.
// ------------------------------------------------------------
export async function createInvoice(env, {
  orderId, statusToken, tier, priceUsd, lang, description, siteUrl,
  webhookPath = '/checkout/webhook',
  successPath = '/checkout/pay',
  cancelUrl = null
}) {
  const result = await call(env, '/invoice', {
    method: 'POST',
    body: {
      price_amount: Number(priceUsd),
      price_currency: CONFIG.COMMERCE.PRICE_CURRENCY,
      order_id: orderId,
      order_description: description,
      ipn_callback_url: `${siteUrl}${webhookPath}`,
      // The signed token, not the bare order id. This URL ends up
      // in the customer's browser history and in the payment
      // provider's own records, and the token is the form of the
      // handle that is safe to have in both.
      success_url: `${siteUrl}${successPath}?o=${encodeURIComponent(statusToken)}&lang=${encodeURIComponent(lang)}`,
      cancel_url: cancelUrl || `${siteUrl}/checkout?tier=${encodeURIComponent(tier)}&lang=${encodeURIComponent(lang)}`
    }
  })

  if (!result.ok) return result

  const invoice = result.data || {}
  if (!invoice.invoice_url) {
    logError('Payment provider returned an invoice with no URL', { orderId })
    return { ok: false, status: 502, error: 'provider_bad_response' }
  }

  logInfo('Invoice opened', { orderId, invoiceId: invoice.id, tier })
  return { ok: true, invoiceId: String(invoice.id), payUrl: invoice.invoice_url }
}


// ==========================================
// fetchPayment
// The provider's current view of one payment.
//
// Used by the reconciler, which exists because a callback
// is a message that can be lost. Every automated system
// that waits for a webhook and has no way to ask instead
// eventually has a customer who paid into a silence.
// ==========================================
export async function fetchPayment(env, paymentId) {
  const result = await call(env, `/payment/${encodeURIComponent(paymentId)}`)
  if (!result.ok) return result

  const payment = result.data || {}
  return {
    ok: true,
    state: normalizeStatus(payment.payment_status),
    providerStatus: payment.payment_status || '',
    paymentId: String(payment.payment_id || paymentId),
    payCurrency: payment.pay_currency || '',
    payAmount: payment.pay_amount != null ? String(payment.pay_amount) : '',
    actuallyPaid: payment.actually_paid != null ? String(payment.actually_paid) : '',
    orderId: payment.order_id || ''
  }
}


// ==========================================
// fetchInvoicePayments
// The payments made against one invoice.
//
// An invoice is not a payment: the customer picks a coin on
// the hosted page and THAT creates the payment, so an order
// we opened knows an invoice id and does not learn a
// payment id until money moves. When a callback goes
// missing, this is how the reconciler finds out whether
// anything ever happened.
//
// Filtered by invoice id on our side rather than asked for
// by invoice: the list endpoint pages over the account's
// whole history, and the alternative - trusting a query
// parameter to filter it - silently returns everything if
// the parameter is ever renamed.
// ==========================================
export async function fetchInvoicePayments(env, invoiceId) {
  const result = await call(env, '/payment/?limit=100&page=0&sortBy=created_at&orderBy=desc')
  if (!result.ok) return result

  const list = (result.data && result.data.data) || []
  const mine = list.filter(payment => String(payment.invoice_id || '') === String(invoiceId))

  if (!mine.length) return { ok: true, payments: [] }

  return {
    ok: true,
    payments: mine.map(payment => ({
      state: normalizeStatus(payment.payment_status),
      providerStatus: payment.payment_status || '',
      paymentId: String(payment.payment_id || ''),
      payCurrency: payment.pay_currency || '',
      payAmount: payment.pay_amount != null ? String(payment.pay_amount) : '',
      actuallyPaid: payment.actually_paid != null ? String(payment.actually_paid) : '',
      orderId: payment.order_id || ''
    }))
  }
}


// ==========================================
// pickAuthoritative
// The one payment that decides an invoice's fate.
//
// An invoice can collect several payment records - somebody
// opens it, picks BTC, changes their mind, comes back and
// pays in USDT. Only one of them matters, and it is not the
// newest: a paid record from twenty minutes ago outranks a
// pending one from thirty seconds ago.
//
// Ordered by consequence, most decisive first.
// ==========================================
export function pickAuthoritative(payments) {
  const order = [
    PAYMENT_STATE.PAID,
    PAYMENT_STATE.PARTIAL,
    PAYMENT_STATE.REFUNDED,
    PAYMENT_STATE.PENDING,
    PAYMENT_STATE.FAILED,
    PAYMENT_STATE.EXPIRED,
    PAYMENT_STATE.UNKNOWN
  ]

  for (const state of order) {
    const match = (payments || []).find(payment => payment.state === state)
    if (match) return match
  }
  return null
}


// ==========================================
// warnUnknownStatus
// One log line for a status we do not recognise.
//
// Its own function so the call sites stay short, and so
// there is exactly one place to look when a provider adds a
// state and orders start sitting in limbo.
// ==========================================
export function warnUnknownStatus(providerStatus, context) {
  logWarning('Unrecognised payment status from provider', { providerStatus, ...context })
}
