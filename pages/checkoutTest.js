// ==========================================
// pages/checkoutTest.js
// Rehearsing the checkout without spending money.
//
// Public entry point (wired in worker.js ROUTES):
//   POST /testsite/checkout    { action: … }
//
// The path sits under /testsite/ and not under /checkout/,
// which looks like a filing mistake and is not. The test
// panel's session cookie is set with Path=/testsite, so a
// browser will not send it to any other prefix - an endpoint
// at /checkout/test can therefore never see the credential it
// is meant to accept, and answers 401 to a signed-in operator.
//
// The alternative fix was widening that cookie to Path=/,
// which would attach a dev credential to every request for
// every public page on the site. A longer URL is the cheaper
// of the two.
//
// The problem this solves: everything up to the payment can
// be checked by looking at it - the form renders, the
// invoice opens, the provider's page appears. Everything
// AFTER the payment is the part that actually matters and
// the part nobody can see, because seeing it means sending
// real cryptocurrency to yourself and paying the network
// fee to find out whether an email arrives.
//
// So the provider's message is synthesized here and
// everything else is real. `pay` builds the exact JSON body
// NOWPayments would post, signs it with the real
// NOWPAYMENTS_IPN_SECRET, and hands it to the real webhook
// handler. That means a rehearsal exercises the signature
// check, the de-duplication ledger, the state machine, key
// minting, sealing, the mail queue and the mail provider -
// every line that runs on a genuine sale. The only fiction
// is that the money moved.
//
// ------------------------------------------------------------------
// Why this is not a way to get a free licence
// ------------------------------------------------------------------
// It is gated on the same credentials that already mint
// keys: the admin bearer token (which can call
// /license/admin generate and print as many keys as it
// likes) or a signed test-panel session (same password).
// Anybody able to reach this endpoint can already issue
// themselves a licence more directly, so it grants no
// capability that did not exist.
//
// What it must never become is a bypass that is easier than
// paying. Three things keep it honest:
//
//   • It refuses to touch an order it did not create.
//     Simulating a payment against a REAL order - one with
//     a real invoice at the provider - is refused outright,
//     so a rehearsal cannot deliver a key for an order
//     somebody has not paid for.
//
//   • Every rehearsal order is marked provider='test' and
//     every action it takes is written into order_events
//     with a `simulated` marker. A key minted this way is
//     identifiable forever.
//
//   • `purge` revokes those keys and deletes those rows, so
//     a rehearsal leaves nothing behind that could later be
//     mistaken for a sale.
// ==========================================

import { CONFIG } from '../config.js'
import { createJsonResponse, logInfo, logWarning } from '../utils.js'
import { isTestSiteSession } from './testsite.js'
import { handleCheckoutWebhook } from './checkout.js'
import { licenseEmail } from '../commerce/emails.js'
import { sendNow, mailConfigured } from '../commerce/mailer.js'
import { isConfigured as providerConfigured, isSandbox } from '../commerce/provider.js'
import { reconcile } from '../commerce/fulfilment.js'
import { unsealKey } from '../commerce/seal.js'
import {
  db, ORDER_STATE, newOrderId, createTestOrder, getOrder, listTestOrders,
  purgeTestOrders, listEvents, listOutbox, isTestOrder, logEvent
} from '../commerce/orders.js'


// ==========================================
// authorize
// Either credential, or nothing.
//
// Returns a Response on refusal rather than a boolean, so a
// caller cannot forget to act on a false. The refusal says
// which credentials would work, because the person hitting
// this is the operator and a bare 401 costs them ten
// minutes of guessing.
// ==========================================
async function authorize(request, env) {
  const token = env && env.DOCSNAP_ADMIN_TOKEN
  const password = env && env.TestSitePassword

  if (!token && !password) {
    return createJsonResponse({
      ok: false,
      error: 'not_configured',
      message: 'Set DOCSNAP_ADMIN_TOKEN (for curl) or TestSitePassword (for the /testsite panel).'
    }, 503)
  }

  const presented = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (token && presented && timingSafeEqual(presented, token)) return null

  if (password && await isTestSiteSession(request, env)) return null

  logWarning('Checkout test endpoint rejected')
  return createJsonResponse({
    ok: false,
    error: 'unauthorized',
    message: 'Send Authorization: Bearer <DOCSNAP_ADMIN_TOKEN>, or sign in at /testsite first.'
  }, 401)
}


function timingSafeEqual(a, b) {
  const left = String(a || '')
  const right = String(b || '')
  if (left.length !== right.length) return false
  let diff = 0
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i)
  return diff === 0
}


// ==========================================
// sortDeep / signIpn
// The provider's signature, computed the provider's way.
//
// Duplicated from seal.js rather than shared, and
// deliberately so: seal.js VERIFIES and this SIGNS, and a
// single function used for both would mean a bug in the
// canonicalisation cancels itself out. Two independent
// implementations that agree is evidence; one
// implementation agreeing with itself is not.
// ==========================================
function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep)
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((out, key) => {
      out[key] = sortDeep(value[key])
      return out
    }, {})
  }
  return value
}

async function signIpn(secret, payload) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(String(secret)),
    { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']
  )
  const signature = await crypto.subtle.sign(
    'HMAC', key, new TextEncoder().encode(JSON.stringify(sortDeep(payload)))
  )
  return [...new Uint8Array(signature)].map(b => b.toString(16).padStart(2, '0')).join('')
}


// ==========================================
// summarise
// One order, flattened for a JSON panel.
//
// The sealed key is reported as a boolean, never as a
// value. This response goes to a browser and into a
// terminal's scrollback, and a rehearsal that printed a
// live licence key into either would have defeated the
// point of sealing it.
// ==========================================
function summarise(order) {
  if (!order) return null
  return {
    id: order.id,
    isTest: isTestOrder(order),
    status: order.status,
    tier: order.tier,
    priceUsd: order.price_usd,
    email: order.email,
    lang: order.lang,
    provider: order.provider,
    invoiceId: order.provider_invoice_id,
    paymentId: order.provider_payment_id,
    payCurrency: order.pay_currency,
    payAmount: order.pay_amount,
    actuallyPaid: order.actually_paid,
    keyPublic: order.key_public,
    hasSealedKey: Boolean(order.key_sealed),
    deliveryAttempts: order.delivery_attempts,
    lastError: order.last_error,
    createdAt: order.created_at,
    paidAt: order.paid_at,
    deliveredAt: order.delivered_at
  }
}


// ==========================================
// handleCheckoutTest
// ==========================================
export async function handleCheckoutTest(url, request, gameId, requestId, GAMES, env) {
  const refusal = await authorize(request, env)
  if (refusal) return refusal

  const database = db(env)

  let body
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const action = String(body.action || 'config').toLowerCase()

  // ---------------------------------------------------------------
  // config — what is wired up, without ever echoing a secret
  // ---------------------------------------------------------------
  if (action === 'config') {
    const checks = {
      database: Boolean(database),
      providerKey: Boolean(env.NOWPAYMENTS_API_KEY),
      providerIpnSecret: Boolean(env.NOWPAYMENTS_IPN_SECRET),
      mailResend: Boolean(env.RESEND_API_KEY),
      mailBrevo: Boolean(env.BREVO_API_KEY),
      mailFrom: Boolean(env.DOCSNAP_MAIL_FROM),
      adminEmail: Boolean(env.DOCSNAP_ADMIN_EMAIL),
      keyWrapSecret: Boolean(env.DOCSNAP_KEY_WRAP_SECRET),
      orderSecret: Boolean(env.DOCSNAP_ORDER_SECRET),
      licenseSigningKey: Boolean(env.DOCSNAP_LICENSE_PRIVATE_KEY),
      adminToken: Boolean(env.DOCSNAP_ADMIN_TOKEN)
    }

    // Reported as booleans and one non-secret hint. The From
    // address is shown because getting it wrong is the most common
    // setup mistake and the value is on every email anyway.
    const tables = {}
    if (database) {
      for (const table of ['orders', 'order_events', 'mail_outbox', 'webhook_log', 'order_attempts', 'licenses']) {
        try {
          await database.prepare(`SELECT 1 FROM ${table} LIMIT 1`).first()
          tables[table] = true
        } catch {
          tables[table] = false
        }
      }
    }

    const missing = []
    if (!checks.database) missing.push('LICENSE_DB binding')
    if (!checks.providerKey) missing.push('NOWPAYMENTS_API_KEY')
    if (!checks.providerIpnSecret) missing.push('NOWPAYMENTS_IPN_SECRET')
    if (!checks.mailResend && !checks.mailBrevo) missing.push('RESEND_API_KEY or BREVO_API_KEY')
    if (!checks.mailFrom) missing.push('DOCSNAP_MAIL_FROM')
    if (!checks.keyWrapSecret) missing.push('DOCSNAP_KEY_WRAP_SECRET')
    if (!checks.orderSecret) missing.push('DOCSNAP_ORDER_SECRET')
    if (!checks.licenseSigningKey) missing.push('DOCSNAP_LICENSE_PRIVATE_KEY')
    for (const [name, present] of Object.entries(tables)) {
      if (!present) missing.push(`table ${name} (run migrations/0002_commerce.sql)`)
    }

    let counts = null
    if (database) {
      const row = await database.prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
                SUM(CASE WHEN provider = 'test' THEN 1 ELSE 0 END) AS tests
         FROM orders`
      ).first()
      const queued = await database.prepare(
        'SELECT COUNT(*) AS n FROM mail_outbox WHERE sent_at IS NULL'
      ).first()
      counts = {
        orders: (row && row.total) || 0,
        delivered: (row && row.delivered) || 0,
        testOrders: (row && row.tests) || 0,
        mailWaiting: (queued && queued.n) || 0
      }
    }

    return createJsonResponse({
      ok: missing.length === 0,
      ready: missing.length === 0,
      sandbox: isSandbox(env),
      checkoutLive: providerConfigured(env) && mailConfigured(env) && Boolean(database),
      mailFrom: env.DOCSNAP_MAIL_FROM || null,
      checks,
      tables,
      missing,
      counts
    })
  }

  if (!database) {
    return createJsonResponse({
      ok: false,
      error: 'not_configured',
      message: 'LICENSE_DB is not bound. Run action "config" to see everything that is missing.'
    }, 503)
  }

  // ---------------------------------------------------------------
  // order — a rehearsal order, no provider involved
  // ---------------------------------------------------------------
  if (action === 'order') {
    const tier = String(body.tier || 'plus').toLowerCase()
    if (tier !== 'plus' && tier !== 'pro') {
      return createJsonResponse({ ok: false, error: 'bad_tier', message: 'tier must be "plus" or "pro".' }, 400)
    }

    const email = String(body.email || '').trim()
    if (!/^[^@\s]+@[^@.\s]+(\.[^@.\s]+)+$/.test(email)) {
      return createJsonResponse({
        ok: false, error: 'bad_email',
        message: 'Give a real address you can read — the rehearsal sends an actual email to it.'
      }, 400)
    }

    const lang = ['fa', 'en', 'ja'].includes(body.lang) ? body.lang : 'en'
    const id = newOrderId()

    await createTestOrder(database, { id, tier, priceUsd: CONFIG.DOCSNAP.TIERS[tier].price, email, lang })
    await logEvent(database, id, 'created', `simulated ${tier} order`)

    logInfo('Test order created', { requestId, orderId: id, tier })

    return createJsonResponse({
      ok: true,
      order: summarise(await getOrder(database, id)),
      next: 'Call this endpoint again with { "action": "pay", "order": "' + id + '" }.'
    })
  }

  // ---------------------------------------------------------------
  // pay — a real, correctly signed callback for a rehearsal order
  // ---------------------------------------------------------------
  if (action === 'pay') {
    const secret = env.NOWPAYMENTS_IPN_SECRET
    if (!secret) {
      return createJsonResponse({
        ok: false, error: 'not_configured',
        message: 'NOWPAYMENTS_IPN_SECRET is not set, so a callback cannot be signed the way the real one is.'
      }, 503)
    }

    const order = await getOrder(database, String(body.order || ''))
    if (!order) {
      return createJsonResponse({ ok: false, error: 'not_found', message: 'No such order.' }, 404)
    }

    // The guard that keeps this from being a bypass. A real order
    // has a real invoice waiting for real money, and simulating
    // its payment would deliver a key nobody paid for.
    if (!isTestOrder(order)) {
      return createJsonResponse({
        ok: false,
        error: 'not_a_test_order',
        message: 'That is a real order. Rehearsals only run against orders created by this endpoint.'
      }, 409)
    }

    const status = String(body.status || 'finished').toLowerCase()
    const known = ['waiting', 'confirming', 'confirmed', 'finished', 'partially_paid', 'failed', 'expired', 'refunded']
    if (!known.includes(status)) {
      return createJsonResponse({
        ok: false, error: 'bad_status',
        message: 'status must be one of: ' + known.join(', ')
      }, 400)
    }

    // Shaped exactly like a NOWPayments IPN. The payment id is
    // derived from the order so that repeating the same call is a
    // duplicate - which is itself worth being able to rehearse.
    const payload = {
      payment_id: Number('9' + order.id.slice(-8).replace(/[^0-9]/g, '0')),
      invoice_id: order.provider_invoice_id,
      payment_status: status,
      order_id: order.id,
      order_description: `Unity DocSnap ${order.tier} — rehearsal`,
      price_amount: Number(order.price_usd),
      price_currency: 'usd',
      pay_currency: String(body.currency || 'usdttrc20'),
      pay_amount: Number(order.price_usd),
      actually_paid: status === 'partially_paid'
        ? Number(body.paid != null ? body.paid : (Number(order.price_usd) / 2).toFixed(2))
        : Number(order.price_usd),
      outcome_amount: Number(order.price_usd),
      outcome_currency: 'usd'
    }

    const raw = JSON.stringify(payload)
    const signature = await signIpn(secret, payload)

    await logEvent(database, order.id, 'webhook', `simulated ${status}`)

    // The real handler, not a copy of it. This is the whole value
    // of the rehearsal: if the signature check, the ledger or the
    // state machine is broken, it breaks here exactly as it would
    // on a genuine sale.
    const response = await handleCheckoutWebhook(
      new URL(CONFIG.SITE_URL + '/checkout/webhook'),
      new Request(CONFIG.SITE_URL + '/checkout/webhook', {
        method: 'POST',
        body: raw,
        headers: { 'Content-Type': 'application/json', 'x-nowpayments-sig': signature }
      }),
      gameId, requestId, GAMES, env
    )

    const webhookResult = await response.json().catch(() => ({}))
    const after = await getOrder(database, order.id)

    logInfo('Simulated payment', { requestId, orderId: order.id, status, result: after.status })

    return createJsonResponse({
      ok: response.status === 200,
      webhookStatus: response.status,
      webhookResult,
      order: summarise(after),
      mail: await listOutbox(database, order.id),
      events: await listEvents(database, order.id),
      // Said plainly, because "delivered" is the only outcome that
      // means the whole chain worked, and every other status has a
      // different next step.
      verdict: verdictFor(after, await listOutbox(database, order.id))
    })
  }

  // ---------------------------------------------------------------
  // inspect — everything known about one order
  // ---------------------------------------------------------------
  if (action === 'inspect') {
    const order = await getOrder(database, String(body.order || ''))
    if (!order) return createJsonResponse({ ok: false, error: 'not_found' }, 404)

    return createJsonResponse({
      ok: true,
      order: summarise(order),
      events: await listEvents(database, order.id),
      mail: await listOutbox(database, order.id),
      verdict: verdictFor(order, await listOutbox(database, order.id)),
      // Only ever for a rehearsal order, and only to prove the
      // sealed copy can be opened - which is what a resend depends
      // on. A real order's key is never returned by anything.
      sealedKeyReadable: isTestOrder(order) && order.key_sealed
        ? Boolean(await unsealKey(env, order.key_sealed))
        : null
    })
  }

  // ---------------------------------------------------------------
  // list — the rehearsal orders that exist
  // ---------------------------------------------------------------
  if (action === 'list') {
    const orders = await listTestOrders(database)
    return createJsonResponse({ ok: true, count: orders.length, orders: orders.map(summarise) })
  }

  // ---------------------------------------------------------------
  // mail — is the mail provider actually working?
  // ---------------------------------------------------------------
  if (action === 'mail') {
    const to = String(body.email || env.DOCSNAP_ADMIN_EMAIL || '').trim()
    if (!to) {
      return createJsonResponse({ ok: false, error: 'bad_email', message: 'Give an address to send to.' }, 400)
    }
    if (!mailConfigured(env)) {
      return createJsonResponse({
        ok: false, error: 'mail_not_configured',
        message: 'Set DOCSNAP_MAIL_FROM and one of RESEND_API_KEY / BREVO_API_KEY.'
      }, 503)
    }

    const lang = ['fa', 'en', 'ja'].includes(body.lang) ? body.lang : 'en'

    // The real licence template with an obviously fake key, so what
    // lands in the inbox is what a customer sees - including
    // whether it renders right-to-left correctly and whether the
    // mail provider's spam scoring likes it.
    const message = licenseEmail(lang, {
      key: 'DSNAP-00000-TEST0-00000',
      tier: 'pro',
      orderId: 'ord_testtesttesttesttest00',
      priceUsd: CONFIG.DOCSNAP.TIERS.pro.price,
      statusUrl: CONFIG.SITE_URL + '/order'
    })

    const result = await sendNow(env, {
      to,
      subject: '[TEST] ' + message.subject,
      html: message.html,
      text: message.text,
      kind: 'license'
    })

    return createJsonResponse({
      ok: result.ok,
      via: result.via || null,
      error: result.error || null,
      to,
      note: result.ok
        ? 'Accepted by the provider. If it does not arrive, the problem is deliverability (SPF/DKIM/spam), not the code.'
        : 'The mail provider refused it. The error above is the reason it gave.'
    }, result.ok ? 200 : 502)
  }

  // ---------------------------------------------------------------
  // reconcile — run the cron pass now instead of waiting
  // ---------------------------------------------------------------
  if (action === 'reconcile') {
    const summary = await reconcile(env, database)
    return createJsonResponse({
      ok: true,
      summary,
      note: 'This is exactly what the cron trigger runs every five minutes.'
    })
  }

  // ---------------------------------------------------------------
  // purge — remove every rehearsal row, revoke its keys
  // ---------------------------------------------------------------
  if (action === 'purge') {
    const removed = await purgeTestOrders(database)
    logInfo('Test orders purged', { requestId, ...removed })
    return createJsonResponse({
      ok: true,
      removed,
      note: 'Rehearsal licences were revoked rather than deleted, so a key that escaped stops working.'
    })
  }

  return createJsonResponse({
    ok: false,
    error: 'bad_action',
    message: 'action must be one of: config, order, pay, inspect, list, mail, reconcile, purge.'
  }, 400)
}


// ==========================================
// verdictFor
// What the order's state means, and what to do about it.
//
// A status string is an answer to "what happened"; the
// operator's question is "did it work, and if not what do I
// look at". Answering the second one here means the panel
// and a curl session say the same thing.
// ==========================================
function verdictFor(order, mail = []) {
  switch (order.status) {
    case ORDER_STATE.DELIVERED: {
      // Names the exact message to go and look for, because "check
      // the inbox" is not an instruction somebody can follow when
      // their inbox also contains mail from the payment provider,
      // and mistaking one for the other reads as "your system sent
      // me an empty email with a broken key in it".
      //
      // And it says accepted, not arrived. Everything this system
      // can observe stops at the mail provider's API returning 200.
      // Whether Gmail then filed it, binned it or spam-foldered it
      // is a question only the provider's dashboard answers - which
      // is what the message id is for.
      const sent = mail.find(row => row.kind === 'license' && row.sent_at) || mail[0] || {}
      return {
        pass: true,
        message: 'The whole chain worked: payment accepted, key minted, email handed to the mail provider and accepted by it.',
        lookFor: {
          to: sent.to_email || order.email,
          subject: sent.subject || '',
          searchYourMailboxFor: 'DSNAP-',
          providerMessageId: sent.sent_via || '',
          note: 'Accepted by the provider is not the same as landed in the inbox. If it is not there, look in spam, '
              + 'then look this message id up in your mail provider\'s dashboard to see whether it was delivered or bounced. '
              + 'Do not confuse it with mail from NOWPayments — that is the payment provider writing to you, not this system.'
        }
      }
    }
    case ORDER_STATE.ISSUED:
      return {
        pass: false,
        message: 'The key was minted but the email did not go out. Look at `mail[0].last_error` — it is almost always the mail provider. The outbox will keep retrying; run action "reconcile" to try now.'
      }
    case ORDER_STATE.ISSUING:
      return {
        pass: false,
        message: 'Delivery started and did not finish. Look at `lastError`. Run action "reconcile" — the claim ages out after two minutes and a retry takes over.'
      }
    case ORDER_STATE.PAID:
      return {
        pass: false,
        message: 'The payment registered but no key was minted. Usually DOCSNAP_KEY_WRAP_SECRET or DOCSNAP_LICENSE_PRIVATE_KEY missing. Run action "config".'
      }
    case ORDER_STATE.PARTIAL:
      return {
        pass: true,
        message: 'Correctly refused to auto-deliver an underpayment, and raised an admin alert. This is the intended behaviour.'
      }
    case ORDER_STATE.AWAITING:
      return {
        pass: false,
        message: 'Nothing moved. The callback was rejected — almost always NOWPAYMENTS_IPN_SECRET not matching the one in the NOWPayments dashboard.'
      }
    case ORDER_STATE.EXPIRED:
      return { pass: true, message: 'Marked expired, as intended for an unpaid invoice.' }
    case ORDER_STATE.REFUNDED:
      return { pass: true, message: 'Marked refunded and an admin alert was raised. Revoke the key if one was delivered.' }
    default:
      return { pass: false, message: 'Unexpected state: ' + order.status }
  }
}
