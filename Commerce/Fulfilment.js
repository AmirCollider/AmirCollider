// ==========================================
// Commerce/Fulfilment.js
// Turning a confirmed payment into a licence key in
// somebody's inbox, and noticing when that did not happen.
//
// The pipeline is four steps, each of which can be
// interrupted and resumed:
//
//   paid   -> claim   the row, so only one worker proceeds
//          -> mint    a key and seal it into the order
//          -> queue   the email and try to send it
//          -> mark    delivered when a provider accepted it
// ==========================================

import { CONFIG } from '../Config.js'
import { logError, logInfo, logWarning } from '../Core/Logging.js'
import { generateKey } from '../Licensing/Keys.js'
import { issueLicenseForOrder } from '../Licensing/Store.js'
import { sealKey, unsealKey, signOrderToken } from './Seal.js'
import { licenseEmail, adminAlertEmail } from './Emails.js'
import { enqueueAndSend, flushOutbox, mailConfigured } from './Mailer.js'
import {
  ORDER_STATE, getOrder, markPaid, claimForIssuing, attachLicense, markDelivered,
  setStatus, noteFailure, recordPayment, logEvent, findOpenOrders, wipeExpiredSeals,
  pruneWebhookLog, countRecentMail, hasLicenseMail, isTestOrder
} from './Orders.js'
import {
  PAYMENT_STATE, fetchPayment, fetchInvoicePayments, pickAuthoritative, isConfigured
} from './Provider.js'

const PRODUCT = 'unity-docsnap'


// ==========================================
// statusUrlFor
// The customer's own page for one order.
// ==========================================
async function statusUrlFor(env, orderId) {
  const token = await signOrderToken(env, orderId)
  return `${CONFIG.SITE_URL}/checkout/pay?o=${encodeURIComponent(token)}`
}


// ==========================================
// deliverOrder
// The paid-to-delivered pipeline for one order.
// ==========================================
export async function deliverOrder(env, database, order) {
  if (!order) return { ok: false, error: 'no_order' }

  // Already finished. The common case for a duplicate
  // callback, and it is a success rather than an error -
  // the customer has their key, which is all the caller
  // wanted to know.
  if (order.status === ORDER_STATE.DELIVERED) {
    return { ok: true, already: true }
  }

  const claimed = await claimForIssuing(database, order.id)
  if (!claimed) {
    // Somebody else holds this order. Not a failure: the other
    // worker is doing exactly what this one would have.
    return { ok: true, contended: true }
  }

  // Re-read after claiming. The row we were handed may be
  // seconds stale, and the field that matters most - whether a
  // key was already minted - is precisely the one a concurrent
  // attempt would have changed.
  const fresh = await getOrder(database, order.id)
  if (!fresh) return { ok: false, error: 'order_vanished' }

  try {
    let plaintext = null

    if (fresh.key_hash) {
      // A previous attempt minted this key and then failed
      // before the email went out. Reuse it rather than minting
      // again: two keys for one payment means one of them has to
      // be revoked later, and there is no way to know which one
      // the customer has already typed into Unity.
      plaintext = await unsealKey(env, fresh.key_sealed)

      if (!plaintext) {
        // Minted, but the plaintext is gone - the retention
        // window passed, or the wrapping secret was rotated.
        // Nothing here can recover it, and inventing a second key
        // silently would be worse than saying so.
        await noteFailure(database, fresh.id, 'sealed key unreadable; needs a manual re-issue')
        await logEvent(database, fresh.id, 'mail_failed', 'sealed key unreadable')
        await alertAdmin(env, database,
          'Order has a key that cannot be re-read',
          [
            `Order ${fresh.id} (${fresh.tier}) minted a key but its sealed copy cannot be opened.`,
            'Re-issue by hand: POST /license/admin {"action":"generate","tier":"' + fresh.tier + '","count":1}',
            'Then revoke the old key: ' + (fresh.key_public || 'unknown')
          ],
          fresh.id)
        return { ok: false, error: 'sealed_key_unreadable' }
      }

    } else {
      plaintext = generateKey()

      const { keyHash, keyPublic } = await issueLicenseForOrder(database, plaintext, {
        product: PRODUCT,
        tier: fresh.tier,
        email: fresh.email,
        orderId: fresh.id
      })

      await attachLicense(database, fresh.id, {
        keyHash,
        keyPublic,
        sealed: await sealKey(env, plaintext)
      })

      await logEvent(database, fresh.id, 'key_issued', keyPublic)
      logInfo('Licence issued for order', { orderId: fresh.id, tier: fresh.tier, key: keyPublic })
    }

    const message = licenseEmail(fresh.lang, {
      key: plaintext,
      tier: fresh.tier,
      orderId: fresh.id,
      priceUsd: fresh.price_usd,
      statusUrl: await statusUrlFor(env, fresh.id)
    })

    const outcome = await enqueueAndSend(env, database, {
      orderId: fresh.id,
      kind: 'license',
      to: fresh.email,
      lang: fresh.lang,
      subject: message.subject,
      html: message.html,
      text: message.text
    })

    if (outcome.sent) {
      await markDelivered(database, fresh.id)
      await logEvent(database, fresh.id, 'mail_sent', outcome.via)
      logInfo('Order delivered', { orderId: fresh.id, tier: fresh.tier, via: outcome.via })
      return { ok: true, delivered: true }
    }

    // Queued but not sent. The order stays at `issued`, which is
    // where the reconciler looks, and the outbox row carries its
    // own retry schedule - so the customer's key is already
    // written down and on its way, not lost.
    await noteFailure(database, fresh.id, outcome.error)
    await logEvent(database, fresh.id, 'mail_failed', String(outcome.error).slice(0, 200))
    logError('Licence email did not go out', { orderId: fresh.id, error: outcome.error })

    return { ok: true, delivered: false, queued: outcome.id }

  } catch (error) {
    // The claim is left as-is rather than rolled back. It ages
    // out of the grace window on its own, and a rollback here
    // would race the very concurrent attempt the claim exists to
    // exclude.
    await noteFailure(database, order.id, error.message)
    await logEvent(database, order.id, 'mail_failed', 'delivery threw: ' + error.message)
    logError('Delivery failed', { orderId: order.id, error: error.message })
    return { ok: false, error: error.message }
  }
}


// ==========================================
// applyPaymentState
// What one payment fact means for one order.
// ==========================================
export async function applyPaymentState(env, database, order, payment) {
  await recordPayment(database, order.id, payment)

  switch (payment.state) {
    case PAYMENT_STATE.PAID: {
      const moved = await markPaid(database, order.id)
      if (moved) await logEvent(database, order.id, 'paid', payment.providerStatus)

      // Delivery runs whether or not this call was the one that
      // moved the row. An order sitting at `issued` after a
      // failed email must still be pushed forward by a later
      // callback, and deliverOrder knows how to be a no-op.
      return deliverOrder(env, database, await getOrder(database, order.id))
    }

    case PAYMENT_STATE.PARTIAL: {
      // Never auto-delivered. Somebody sent less than the invoice
      // - a network fee deducted at the wrong end, a mistyped
      // amount - and the resolution is a judgement call: accept
      // it, ask for the difference, or refund. All three are a
      // human's to make.
      await setStatus(database, order.id, ORDER_STATE.PARTIAL)
      await logEvent(database, order.id, 'webhook', `partial: ${payment.actuallyPaid}/${payment.payAmount} ${payment.payCurrency}`)

      await alertAdmin(env, database,
        'Underpaid order needs a decision',
        [
          `Order ${order.id} (${order.tier}, $${order.price_usd}) was underpaid.`,
          `Expected ${payment.payAmount} ${payment.payCurrency}, received ${payment.actuallyPaid}.`,
          `Customer: ${order.email}`,
          'Nothing was delivered. Decide whether to honour it, request the difference, or refund.'
        ],
        order.id)

      return { ok: true, partial: true }
    }

    case PAYMENT_STATE.REFUNDED: {
      await setStatus(database, order.id, ORDER_STATE.REFUNDED)
      await logEvent(database, order.id, 'webhook', 'refunded')

      await alertAdmin(env, database,
        'Payment refunded after delivery',
        [
          `Order ${order.id} (${order.tier}) was refunded by the provider.`,
          order.key_public
            ? `A key was already delivered: ${order.key_public}. Revoke it with POST /license/admin {"action":"revoke"}.`
            : 'No key had been delivered.',
          `Customer: ${order.email}`
        ],
        order.id)

      return { ok: true, refunded: true }
    }

    case PAYMENT_STATE.EXPIRED:
    case PAYMENT_STATE.FAILED: {
      // Only from a state that has not seen money. An order that
      // reached `paid` and then receives a stale `expired` for an
      // abandoned first attempt must not be walked backwards -
      // that is a delivered customer whose order says failed.
      if ([ORDER_STATE.CREATED, ORDER_STATE.AWAITING].includes(order.status)) {
        await setStatus(database, order.id,
          payment.state === PAYMENT_STATE.EXPIRED ? ORDER_STATE.EXPIRED : ORDER_STATE.FAILED)
        await logEvent(database, order.id, 'webhook', payment.providerStatus)
      }
      return { ok: true }
    }

    default:
      await logEvent(database, order.id, 'webhook', payment.providerStatus || 'pending')
      return { ok: true }
  }
}


// ==========================================
// resendLicense
// The same key, to the same address, again.
// ==========================================
export async function resendLicense(env, database, order, { maxPerHour = 3 } = {}) {
  if (!order || !order.key_hash) {
    return { ok: false, error: 'not_issued' }
  }

  const recent = await countRecentMail(database, order.id, 'license', 60 * 60 * 1000)
  if (recent >= maxPerHour) {
    return { ok: false, error: 'rate_limited' }
  }

  const plaintext = await unsealKey(env, order.key_sealed)
  if (!plaintext) {
    // Past the retention window, or a rotated secret. The order
    // page falls back to showing the masked label, which is
    // enough for support to find the row and re-issue.
    return { ok: false, error: 'key_expired', keyPublic: order.key_public }
  }

  const message = licenseEmail(order.lang, {
    key: plaintext,
    tier: order.tier,
    orderId: order.id,
    priceUsd: order.price_usd,
    statusUrl: await statusUrlFor(env, order.id)
  })

  const outcome = await enqueueAndSend(env, database, {
    orderId: order.id,
    kind: 'license',
    to: order.email,
    lang: order.lang,
    subject: message.subject,
    html: message.html,
    text: message.text
  })

  await logEvent(database, order.id, outcome.sent ? 'mail_sent' : 'mail_queued', 'resend')

  if (outcome.sent) await markDelivered(database, order.id)

  return { ok: true, sent: outcome.sent }
}


// ==========================================
// alertAdmin
// Tells the operator something they have to act on.
// ==========================================
export async function alertAdmin(env, database, title, lines, orderId = null) {
  const to = env && env.DOCSNAP_ADMIN_EMAIL
  if (!to || !mailConfigured(env)) {
    logWarning('Admin alert not sent (no DOCSNAP_ADMIN_EMAIL or mail not configured)', { title, orderId })
    return
  }

  try {
    const message = adminAlertEmail({ title, lines, orderId })
    await enqueueAndSend(env, database, {
      orderId,
      kind: 'admin_alert',
      to,
      lang: 'en',
      subject: message.subject,
      html: message.html,
      text: message.text
    })
    if (orderId) await logEvent(database, orderId, 'alerted', title)
  } catch (error) {
    logError('Admin alert failed', { title, error: error.message })
  }
}


// ==========================================
// reconcile
// The background pass. Everything the happy path can fail
// to do, done again.
//
// Five jobs, in this order and for these reasons:
//
//   1. Flush the mail outbox first. It is the step closest
//      to the customer, and a tick that spent its budget on
//      provider lookups and then ran out before sending a
//      paid customer their key got its priorities backwards.
//
//   2. Push stuck orders forward. Anything at paid, issuing
//      or issued is an order that has been paid for and has
//      not finished arriving.
//
//   3. Ask the provider about orders that are still waiting.
//      This is the answer to a lost callback, which is the
//      failure mode no amount of care on our side prevents.
//
//   4. Expire what nobody paid for, so the open-order list
//      stays short enough to be worth reading.
//
//   5. Housekeeping: wipe retention-expired plaintext, prune
//      the callback ledger.
//
// Returns a summary because the cron handler logs it, and a
// scheduled task whose output is silence is a scheduled
// task nobody notices has stopped.
// ==========================================
export async function reconcile(env, database) {
  const summary = { mail: null, resumed: 0, polled: 0, expired: 0, wiped: 0, alerts: 0 }

  summary.mail = await flushOutbox(env, database)

  // Two minutes of grace before touching anything. Without it a
  // tick would fight the request that is still in flight for the
  // order it just created.
  const open = await findOpenOrders(database, { olderThanMs: 2 * 60 * 1000, limit: 40 })

  for (const order of open) {
    try {
      // --- paid but not in an inbox ---
      if ([ORDER_STATE.PAID, ORDER_STATE.ISSUING, ORDER_STATE.ISSUED].includes(order.status)) {
        const stuckFor = Date.now() - (order.paid_at || order.updated_at)

        // `paid` and `issuing` always need pushing - they have no
        // email yet by definition. An `issued` order is only
        // re-driven when nothing else is going to: if a licence
        // message exists in the outbox, that row owns the retry and
        // running delivery again here would queue a second copy on
        // every single tick.
        const abandoned = order.status !== ORDER_STATE.ISSUED
          || !(await hasLicenseMail(database, order.id))

        if (abandoned) {
          await deliverOrder(env, database, order)
          summary.resumed++
        }

        if (stuckFor > CONFIG.COMMERCE.STUCK_ALERT_MS && order.status !== ORDER_STATE.DELIVERED) {
          const latest = await getOrder(database, order.id)
          if (latest && latest.status !== ORDER_STATE.DELIVERED) {
            await alertAdmin(env, database,
              'Paid order has not been delivered',
              [
                `Order ${latest.id} (${latest.tier}, $${latest.price_usd}) has been paid for ${Math.round(stuckFor / 60000)} minutes.`,
                `Status: ${latest.status}. Delivery attempts: ${latest.delivery_attempts}.`,
                `Last error: ${latest.last_error || 'none recorded'}`,
                `Customer: ${latest.email}`,
                latest.key_public ? `Key minted: ${latest.key_public} — the email is what failed.` : 'No key minted yet.'
              ],
              latest.id)
            summary.alerts++
          }
        }
        continue
      }

      // --- waiting for money ---
      if ([ORDER_STATE.CREATED, ORDER_STATE.AWAITING, ORDER_STATE.PARTIAL].includes(order.status)) {
        const age = Date.now() - order.created_at

        if (age > CONFIG.COMMERCE.INVOICE_TTL_MS && order.status !== ORDER_STATE.PARTIAL) {
          await setStatus(database, order.id, ORDER_STATE.EXPIRED)
          await logEvent(database, order.id, 'expired', 'no payment within the invoice window')
          summary.expired++
          continue
        }

        if (!isConfigured(env)) continue

        const payment = await lookupPayment(env, order)
        if (payment) {
          summary.polled++
          await logEvent(database, order.id, 'reconciled', payment.providerStatus)
          await applyPaymentState(env, database, order, payment)
        }
      }

    } catch (error) {
      logError('Reconciliation failed for one order', { orderId: order.id, error: error.message })
    }
  }

  summary.wiped = await wipeExpiredSeals(database)
  await pruneWebhookLog(database)

  return summary
}


// ==========================================
// lookupPayment
// What the provider currently thinks of this order's money.
// ==========================================
async function lookupPayment(env, order) {
  // A rehearsal order has no invoice at the provider, so asking
  // about it is a wasted API call whose only possible answer is
  // "no such payment" - and on a busy account, a listing that
  // could match somebody else's invoice by coincidence.
  if (isTestOrder(order)) return null

  if (order.provider_payment_id) {
    const result = await fetchPayment(env, order.provider_payment_id)
    return result.ok ? result : null
  }

  if (!order.provider_invoice_id) return null

  const result = await fetchInvoicePayments(env, order.provider_invoice_id)
  if (!result.ok) return null

  return pickAuthoritative(result.payments)
}
