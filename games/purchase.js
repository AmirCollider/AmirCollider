// ==========================================
// games/purchase.js
// Turning a player's click into something they own.
//
// Public exports:
//   storeReady(env)
//   signGameToken(env, GAMES, orderId) / readGameToken(env, GAMES, token)
//   startPurchase(env, database, args)
//   applyGamePayment(env, database, order, payment)
//   grantForOrder(env, database, order, GAMES)
//   reconcileGameOrders(env, database, GAMES)
//   grantManually(env, database, args)
//
// ------------------------------------------------------------
// THE SHAPE OF THE PATH
// ------------------------------------------------------------
//   1. row written             (before the provider is called)
//   2. hosted invoice opened   (NOWPayments, whatever coin they like)
//   3. player pays
//   4. callback arrives        -> verified, de-duplicated, applied
//   5. entitlement granted     -> the game can see it on the next call
//
// Step 1 before step 2 is the whole reason this can be
// reconciled at all: a Worker that dies between opening an
// invoice and writing a row leaves money arriving against
// something this side has never heard of.
//
// The payment provider module is shared with the licence
// checkout, unchanged. What is NOT shared is the order table
// and the fulfilment: a game purchase in the `orders` table
// would eventually be handed a Unity DocSnap licence key by
// that reconciler, which is a support thread nobody wants to
// have.
// ==========================================

import { CONFIG, getGameProduct } from '../config.js'
import { logError, logInfo, logWarning } from '../utils.js'
import {
  isConfigured as providerConfigured, createInvoice, fetchPayment,
  fetchInvoicePayments, pickAuthoritative, PAYMENT_STATE
} from '../commerce/provider.js'
import { effectiveProducts, productPrice } from './registry.js'
import {
  GAME_ORDER_STATE, newGameOrderId, createGameOrder, getGameOrder,
  markInvoiceOpened, recordPayment, markPaid, claimForGrant, setOrderStatus,
  noteOrderError, findOpenGameOrders, grantEntitlement, revokeEntitlement,
  isGameOrderRateLimited, recordGameOrderAttempt, logEntitlementEvent
} from './store.js'

const encoder = new TextEncoder()


// ==========================================
// storeReady
// Whether this deployment can take money for a game.
//
// Checked before a buy button renders, so a fresh clone shows
// an honest "not available here" instead of a button that opens
// a spinner and fails.
//
// The mailer is deliberately NOT part of this. The licence
// checkout cannot deliver without email - the key IS an email.
// A game purchase delivers into the player's account, which
// they are already signed into, so a mail outage costs a
// receipt and not the thing they paid for.
// ==========================================
export function storeReady(env) {
  return Boolean(providerConfigured(env) && env && env.LICENSE_DB)
}


// ==========================================
// Order handles
//
// The status page is reachable by a link, so the link cannot
// simply be the order id: ids are handed out in time order and
// a player with one could read the next person's email address
// by editing a URL. Signing it means a valid handle can only
// have come from us, and costs one HMAC.
//
// The secret is whichever of three exists, in that order. A
// dedicated one would be correct and would also mean a
// deployment that forgot to set it has a storefront that 500s
// on the first purchase - so it falls back to the values that
// are already there on any working install.
//
// Not expiry-bearing, deliberately: it is the link in a
// player's browser history, and it has to still work next week
// when they come back wondering where their shards went.
// ==========================================
function tokenSecret(env, GAMES) {
  if (env && env.DOCSNAP_ORDER_SECRET) return String(env.DOCSNAP_ORDER_SECRET)
  if (env && env.STATE_SIGNING_SECRET) return String(env.STATE_SIGNING_SECRET)
  const first = GAMES && GAMES[Object.keys(GAMES)[0]]
  return (first && first.oauth && first.oauth.secret) || ''
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function signGameToken(env, GAMES, orderId) {
  const secret = tokenSecret(env, GAMES)
  if (!secret) return ''

  const digest = await crypto.subtle.digest('SHA-256', encoder.encode('game-order|' + secret))
  const key = await crypto.subtle.importKey('raw', digest, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(orderId))

  let binary = ''
  for (const byte of new Uint8Array(signature)) binary += String.fromCharCode(byte)
  const tag = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 32)

  return orderId + '.' + tag
}

export async function readGameToken(env, GAMES, token) {
  if (typeof token !== 'string') return null
  const cut = token.lastIndexOf('.')
  if (cut <= 0) return null

  const orderId = token.slice(0, cut)
  const expected = await signGameToken(env, GAMES, orderId)
  return expected && constantTimeEqual(expected, token) ? orderId : null
}


// ==========================================
// startPurchase
// Everything between the click and the payment page.
//
// The price is read from the catalogue here and frozen into the
// row. It is never re-read from a request body, and that is the
// single most important line in this function: a price that can
// arrive from the client is a $9.99 season pass bought for one
// cent by anybody who opens dev tools.
// ==========================================
export async function startPurchase(env, database, {
  game, productId, player, lang = 'en', ip = '', origin = '', quantity = 1, GAMES
}) {
  if (!storeReady(env)) {
    return { ok: false, status: 503, error: 'not_configured' }
  }
  if (!game || !game.capabilities || !game.capabilities.store) {
    return { ok: false, status: 404, error: 'no_store' }
  }

  // Two lookups, not one. getGameProduct proves the id exists in
  // code at all; productPrice proves it is on sale right now.
  // A product withdrawn in the panel fails the second and not
  // the first, and the two deserve different answers.
  const product = getGameProduct(game, productId)
  if (!product) {
    return { ok: false, status: 404, error: 'unknown_product' }
  }

  const priceUsd = productPrice(game, productId)
  if (!priceUsd) {
    return { ok: false, status: 409, error: 'not_for_sale' }
  }

  const count = Math.min(Math.max(Number(quantity) || 1, 1), 10)

  if (await isGameOrderRateLimited(database, ip)) {
    logWarning('Game store rate limit hit', { gameId: game.id, productId })
    return { ok: false, status: 429, error: 'rate_limited' }
  }
  await recordGameOrderAttempt(database, ip)

  const orderId = newGameOrderId()
  const total = (Number(priceUsd) * count).toFixed(2)

  await createGameOrder(database, {
    id: orderId,
    gameId: game.id,
    productId: product.id,
    playerUid: player.playerId,
    googleSub: player.sub || '',
    email: player.email,
    lang,
    priceUsd,
    quantity: count
  })

  const statusToken = await signGameToken(env, GAMES, orderId)
  const siteUrl = String(origin || CONFIG.SITE_URL).replace(/\/+$/, '')

  const name = (product.i18n && product.i18n.name && (product.i18n.name.en || product.i18n.name.fa)) || product.id

  const invoice = await createInvoice(env, {
    orderId,
    statusToken,
    tier: product.id,
    priceUsd: total,
    lang,
    description: `${game.name} — ${name}${count > 1 ? ' ×' + count : ''}`,
    siteUrl,
    // Its own callback, its own success page. Sharing the
    // licence checkout's would look the order up in the wrong
    // table and land the player on a page about a Unity editor
    // extension.
    webhookPath: '/games/webhook',
    successPath: `/${game.id}/store/order`,
    cancelUrl: `${siteUrl}/${game.id}/store?lang=${encodeURIComponent(lang)}`
  })

  if (!invoice.ok) {
    await setOrderStatus(database, orderId, GAME_ORDER_STATE.FAILED, 'provider: ' + invoice.error)
    logError('Could not open a game invoice', { orderId, gameId: game.id, error: invoice.error })
    return { ok: false, status: 502, error: 'provider_unavailable', orderId }
  }

  await markInvoiceOpened(database, orderId, invoice.invoiceId)
  logInfo('Game purchase started', { orderId, gameId: game.id, productId: product.id, count })

  return {
    ok: true,
    orderId,
    statusToken,
    payUrl: invoice.payUrl,
    statusUrl: `/${game.id}/store/order?o=${encodeURIComponent(statusToken)}&lang=${encodeURIComponent(lang)}`
  }
}


// ==========================================
// applyGamePayment
// One provider verdict, turned into a state and its
// consequence.
//
// Every branch is idempotent, because every branch will be run
// more than once: providers retry callbacks, and the cron polls
// the same order the callback is about. "Already done" has to
// be a quiet no-op rather than a second grant.
// ==========================================
export async function applyGamePayment(env, database, order, payment, GAMES) {
  await recordPayment(database, order.id, payment)

  switch (payment.state) {
    case PAYMENT_STATE.PAID: {
      const moved = await markPaid(database, order.id)
      const current = await getGameOrder(database, order.id)

      // `moved` false with a status of granted means a duplicate
      // callback for a purchase that already landed. Nothing to
      // do, and nothing wrong.
      if (!moved && current && current.status === GAME_ORDER_STATE.GRANTED) {
        return { state: 'already_granted' }
      }

      return grantForOrder(env, database, current || order, GAMES)
    }

    case PAYMENT_STATE.PARTIAL:
      // Never auto-grants. An underpayment is a human decision -
      // the three numbers recorded above are the entire basis for
      // it - and a system that guesses generously here is a
      // system that can be underpaid on purpose.
      await setOrderStatus(database, order.id, GAME_ORDER_STATE.PARTIAL)
      logWarning('Game purchase underpaid', { orderId: order.id, gameId: order.game_id })
      return { state: 'partial' }

    case PAYMENT_STATE.REFUNDED: {
      await setOrderStatus(database, order.id, GAME_ORDER_STATE.REFUNDED)
      // Taking the entitlement back is the point of recording a
      // refund at all. Left alone, a refunded purchase is a
      // player who has the shards and the money.
      await revokeEntitlement(database, order.game_id, order.player_uid, order.product_id, 'refund ' + order.id)
      logWarning('Game purchase refunded', { orderId: order.id, gameId: order.game_id })
      return { state: 'refunded' }
    }

    case PAYMENT_STATE.EXPIRED:
      await setOrderStatus(database, order.id, GAME_ORDER_STATE.EXPIRED)
      return { state: 'expired' }

    case PAYMENT_STATE.FAILED:
      await setOrderStatus(database, order.id, GAME_ORDER_STATE.FAILED, 'provider reported failure')
      return { state: 'failed' }

    default:
      // Pending, or a status this Worker does not recognise.
      // Neither is grounds for touching the order's state:
      // guessing forward gives the product away, guessing back
      // tells somebody who paid that they did not.
      return { state: 'pending' }
  }
}


// ==========================================
// grantForOrder
// The moment a purchase becomes something the player owns.
//
// claimForGrant is the mutual exclusion, and it is a
// conditional UPDATE rather than a lock: a webhook and a cron
// tick arriving in the same second both run this, exactly one
// sees a row change, and the other returns without granting.
//
// The claim happens BEFORE the grant, not after. Granting first
// and marking second would mean a Worker that dies in between
// leaves a paid order that looks ungranted - and the next tick
// grants it again.
// ==========================================
export async function grantForOrder(env, database, order, GAMES) {
  if (!order) return { state: 'missing' }
  if (order.status === GAME_ORDER_STATE.GRANTED) return { state: 'already_granted' }

  const claimed = await claimForGrant(database, order.id)
  if (!claimed) {
    const fresh = await getGameOrder(database, order.id)
    return { state: fresh && fresh.status === GAME_ORDER_STATE.GRANTED ? 'already_granted' : 'not_claimable' }
  }

  const game = GAMES && GAMES[order.game_id]
  const product = game ? getGameProduct(game, order.product_id) : null

  if (!product) {
    // The catalogue no longer has this product: it was removed
    // from config.js between the invoice opening and the payment
    // landing. The money is real, so the order is flagged rather
    // than quietly closed, and an operator can grant something
    // equivalent by hand from the panel.
    await noteOrderError(database, order.id, 'product ' + order.product_id + ' is no longer in the catalogue')
    logError('Paid game order for a product that no longer exists', {
      orderId: order.id, gameId: order.game_id, productId: order.product_id
    })
    return { state: 'granted_without_product' }
  }

  const units = unitsFor(product) * (order.quantity || 1)
  const expiresAt = product.durationDays
    ? Date.now() + product.durationDays * 24 * 60 * 60 * 1000
    : null

  await grantEntitlement(database, {
    gameId: order.game_id,
    playerUid: order.player_uid,
    productId: order.product_id,
    kind: product.kind,
    quantity: units,
    source: 'web',
    orderId: order.id,
    expiresAt
  })

  logInfo('Game entitlement granted', {
    orderId: order.id, gameId: order.game_id,
    productId: order.product_id, units
  })

  return { state: 'granted', units }
}


// ==========================================
// unitsFor
// How much one purchase of a product is worth.
//
// A consumable's `grant.amount` is the number the player thinks
// they bought - "1,000 Neon Shards" - so that is the number the
// balance moves by. Anything owned outright is one, because
// owning a skin twice is still owning a skin.
// ==========================================
function unitsFor(product) {
  if (product.kind === 'consumable') {
    const amount = product.grant && Number(product.grant.amount)
    return amount > 0 ? amount : 1
  }
  return 1
}


// ==========================================
// grantManually
// An operator handing somebody something from /thegod.
//
// Exists because every store eventually needs it: a payment
// that arrived outside the flow, an apology after an outage, a
// tester who needs the pass. Recorded with source 'grant' so it
// is never mistaken for a sale in any total, and written to the
// event log like everything else - a gift nobody can trace is
// indistinguishable from a bug.
// ==========================================
export async function grantManually(env, database, { game, productId, playerUid, quantity, reason = '' }) {
  const product = getGameProduct(game, productId)
  if (!product) return { ok: false, error: 'unknown_product' }

  const units = Number(quantity) > 0 ? Number(quantity) : unitsFor(product)
  const expiresAt = product.durationDays
    ? Date.now() + product.durationDays * 24 * 60 * 60 * 1000
    : null

  await grantEntitlement(database, {
    gameId: game.id,
    playerUid,
    productId,
    kind: product.kind,
    quantity: units,
    source: 'grant',
    orderId: null,
    expiresAt
  })

  await logEntitlementEvent(database, {
    gameId: game.id, playerUid, productId,
    kind: 'granted', amount: units, detail: 'manual: ' + reason
  })

  logInfo('Manual entitlement grant', { gameId: game.id, playerUid, productId, units })
  return { ok: true, units }
}


// ==========================================
// reconcileGameOrders
// The storefront's safety net, run from cron.
//
// A callback is a message, and messages get lost. Every
// automated system that waits for a webhook and has no way to
// ASK instead eventually has a customer who paid into silence.
//
// Four jobs, in order of how much they cost somebody:
//   1. grant anything paid for and not granted
//   2. ask the provider about orders still waiting
//   3. expire what nobody paid for
//   4. return a summary, so a scheduled task that has quietly
//      stopped is visible in a log line
// ==========================================
export async function reconcileGameOrders(env, database, GAMES) {
  const summary = { granted: 0, polled: 0, expired: 0, failed: 0 }

  // Two minutes of grace before touching anything, so a tick
  // does not fight the request that is still opening the order
  // it just found.
  const open = await findOpenGameOrders(database, { olderThanMs: 2 * 60 * 1000, limit: 30 })

  for (const order of open) {
    try {
      if (order.status === GAME_ORDER_STATE.PAID) {
        const result = await grantForOrder(env, database, order, GAMES)
        if (result.state === 'granted') summary.granted++
        continue
      }

      const age = Date.now() - order.created_at
      if (age > CONFIG.GAMESTORE.INVOICE_TTL_MS && order.status !== GAME_ORDER_STATE.PARTIAL) {
        await setOrderStatus(database, order.id, GAME_ORDER_STATE.EXPIRED)
        summary.expired++
        continue
      }

      if (!providerConfigured(env)) continue

      const payment = await lookupPayment(env, order)
      if (payment) {
        summary.polled++
        await applyGamePayment(env, database, order, payment, GAMES)
      }

    } catch (error) {
      summary.failed++
      logError('Game order reconciliation failed', { orderId: order.id, error: error.message })
    }
  }

  return summary
}


// ==========================================
// lookupPayment
// What the provider currently thinks of one order's money.
//
// By payment id when there is one, and by invoice otherwise.
// The two are not interchangeable: an order knows its invoice
// from the moment it opens and only learns a payment id once
// the player has picked a coin - so an order nobody paid has no
// payment to ask about, and the invoice route is the only one
// that can say so.
// ==========================================
async function lookupPayment(env, order) {
  if (order.provider_payment_id) {
    const result = await fetchPayment(env, order.provider_payment_id)
    return result.ok ? result : null
  }

  if (!order.provider_invoice_id) return null

  const result = await fetchInvoicePayments(env, order.provider_invoice_id)
  if (!result.ok) return null

  return pickAuthoritative(result.payments)
}


// ==========================================
// storeSummary
// What the panel shows above the order list.
//
// Assembled here rather than in the page, so the numbers the
// operator reads come from the same module that produced them.
// ==========================================
export function catalogueSummary(game) {
  const products = effectiveProducts(game)
  return {
    total: ((game.store && game.store.products) || []).length,
    onSale: products.length,
    cheapest: products.reduce((low, p) => (low === null || Number(p.priceUsd) < low ? Number(p.priceUsd) : low), null),
    dearest: products.reduce((high, p) => (high === null || Number(p.priceUsd) > high ? Number(p.priceUsd) : high), null)
  }
}
