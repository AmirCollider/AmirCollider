// ==========================================
// Commerce/Provider.js
// The payment provider, behind an interface the rest of the
// checkout can hold without knowing whose it is.
//
// NOWPayments, using their hosted invoice rather than their
// raw payment API, and that is the central decision here.
// ==========================================

import { CONFIG } from '../Config.js'
import { logError, logInfo, logWarning } from '../Core/Logging.js'


// ==========================================
// PAYMENT_STATE
// Our vocabulary, not the provider's.
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
// ==========================================
export function isConfigured(env) {
  return Boolean(env && env.NOWPAYMENTS_API_KEY && env.NOWPAYMENTS_IPN_SECRET)
}


// ==========================================
// isSandbox
// Whether this deployment is pointed at the rehearsal API.
// ==========================================
export function isSandbox(env) {
  return /sandbox/i.test(apiBase(env))
}


// ==========================================
// call
// One request to the provider, with a timeout and a
// non-leaking failure.


// ==========================================
// ==========================================
// apiBase
// Which NOWPayments to talk to.
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
// No pay_currency is sent. Fixing one would defeat the
// point - the invoice is meant to offer every coin the
// provider supports and let the customer choose.


// ==========================================
// The three paths are parameters with the licence checkout's
// own values as defaults, because there are now two shops on
// this Worker riding one provider account.
export async function createInvoice(env, {
  orderId, statusToken, tier, priceUsd, lang, description, siteUrl,
  webhookPath = '/checkout/webhook',
  successPath = '/checkout/pay',
  successUrl = null,
  cancelUrl = null
}) {
  // A donation has no order to look up afterwards and nothing to
  // deliver, so it passes its own success_url and no webhook path
  // at all. Both are therefore conditional rather than assumed:
  // sending `ipn_callback_url` as the bare origin - which is what
  // an empty webhookPath used to concatenate to - is an address the
  // provider will happily accept and then POST to for the life of
  // the invoice.
  const body = {
    price_amount: Number(priceUsd),
    price_currency: CONFIG.COMMERCE.PRICE_CURRENCY,
    order_id: orderId,
    order_description: description,

    // The signed token, not the bare order id. This URL ends up
    // in the customer's browser history and in the payment
    // provider's own records, and the token is the form of the
    // handle that is safe to have in both.
    success_url: successUrl
      || `${siteUrl}${successPath}?o=${encodeURIComponent(statusToken)}&lang=${encodeURIComponent(lang)}`,
    cancel_url: cancelUrl || `${siteUrl}/checkout?tier=${encodeURIComponent(tier)}&lang=${encodeURIComponent(lang)}`
  }

  if (webhookPath) body.ipn_callback_url = `${siteUrl}${webhookPath}`

  const result = await call(env, '/invoice', { method: 'POST', body })

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
