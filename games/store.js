// ==========================================
// games/store.js
// Every D1 query the game-management system makes.
//
// The same split as licensing/store.js and commerce/orders.js,
// for the same reason: the rules about what an override means,
// when an order may be claimed, and how an entitlement is spent
// belong in one file instead of being re-derived slightly
// differently in the panel, the webhook and the cron.
//
// Every function takes the database binding explicitly. A
// module global would make it possible to run a settings query
// against a game's own database, which is a bug with no symptom
// until it has one.
//
// Public exports:
//   db(env)
//
//   -- settings (overrides to the code registry) --
//   readAllSettings / readSettings / saveSettings / resetSettings
//   saveDeepLinkScheme
//   readProductOverrides / saveProductOverride / resetProductOverride
//   resetAllProductOverrides / purgeGameRows
//
//   -- the landing page and the version history --
//   saveLandingFields / listVersions / listAllVersions
//   saveVersion / deleteVersion
//
//   -- the storefront's orders --
//   GAME_ORDER_STATE / newGameOrderId / createGameOrder / getGameOrder
//   getGameOrderByInvoice / markInvoiceOpened / recordPayment / markPaid
//   claimForGrant / markGranted / setOrderStatus / noteOrderError
//   findOpenGameOrders / listGameOrders / gameOrderStats
//   isGameOrderRateLimited / recordGameOrderAttempt
//
//   -- what a player owns --
//   grantEntitlement / listEntitlements / consumeEntitlement
//   revokeEntitlement / listEntitlementEvents / logEntitlementEvent
// ==========================================

import { CONFIG } from '../config.js'
import { hashEmail } from '../commerce/seal.js'
import { hashIp } from '../licensing/keys.js'


// ==========================================
// db
// The licence/commerce database, or null.
//
// Null rather than a throw, so an unconfigured deployment
// answers "game management is not set up here" instead of a
// 500 - the same contract the other two stores offer, because
// it is the same database and the same fresh-clone problem.
//
// Game settings live here rather than in a game's own database
// on purpose: they are commercial records read while rendering
// the dashboard, and a dashboard that has to open five game
// databases to draw five cards is five round trips where one
// will do.
// ==========================================
export function db(env) {
  return (env && env.LICENSE_DB) || null
}


function now() {
  return Date.now()
}

function changed(result) {
  return Boolean(result && result.meta && result.meta.changes > 0)
}


// ==========================================
// GAME_ORDER_STATE
// The state machine, spelled once.
//
// Constants rather than string literals at forty call sites,
// because 'awaiting_payment' misspelled in one UPDATE is a row
// that never matches any query again and never throws.
// ==========================================
export const GAME_ORDER_STATE = {
  CREATED: 'created',
  AWAITING: 'awaiting_payment',
  PARTIAL: 'partially_paid',
  PAID: 'paid',
  GRANTED: 'granted',
  EXPIRED: 'expired',
  REFUNDED: 'refunded',
  FAILED: 'failed'
}

// States a background pass should still be looking at. A
// granted or refunded order is finished; everything else is
// either waiting for money or waiting for us.
const OPEN_ORDER_STATES = [
  GAME_ORDER_STATE.CREATED,
  GAME_ORDER_STATE.AWAITING,
  GAME_ORDER_STATE.PARTIAL,
  GAME_ORDER_STATE.PAID
]


// ==========================================================
// Settings - the overrides an operator may change
// ==========================================================

// ==========================================
// readAllSettings
// Every settings row, keyed by game id.
//
// One query for the whole table rather than one per game: the
// table has as many rows as there are games, which is a number
// that fits in a sentence, and the caller merging them needs
// all of them anyway.
//
// Returns {} on any failure rather than throwing. A missing
// table on a deployment that has not run 0003 yet must degrade
// to "no overrides" - the site then renders exactly what the
// code registry says, which is a correct site, not a broken
// one.
// ==========================================
export async function readAllSettings(database) {
  if (!database) return {}
  try {
    const { results } = await database.prepare('SELECT * FROM game_settings').all()
    const out = {}
    for (const row of results || []) out[row.game_id] = row
    return out
  } catch {
    return {}
  }
}


export async function readSettings(database, gameId) {
  if (!database || !gameId) return null
  try {
    return await database
      .prepare('SELECT * FROM game_settings WHERE game_id = ? LIMIT 1')
      .bind(gameId).first()
  } catch {
    return null
  }
}


// ==========================================
// saveSettings
// An upsert of only the fields the caller named.
//
// COALESCE(?, column) on every field is what makes a partial
// save partial: the panel sends the one field somebody edited,
// and the other nine keep whatever they held. Sending the whole
// row instead would mean two operators with the panel open in
// two tabs silently undoing each other.
//
// An explicit null is therefore not "leave it alone" - it is
// spelled by simply not sending the key. Clearing a field back
// to the registry default is resetSettings below, or a null
// passed through `clear`.
// ==========================================
export async function saveSettings(database, gameId, patch = {}, clear = []) {
  const at = now()
  const field = name => (Object.prototype.hasOwnProperty.call(patch, name) ? patch[name] : null)
  const cleared = name => (clear.includes(name) ? 1 : 0)

  await database.prepare(
    `INSERT INTO game_settings
       (game_id, display_name, logo_url, accent_color, desc_fa, desc_en, desc_ja,
        tags_json, status, download_enabled, download_json, min_version, note, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (game_id) DO UPDATE SET
       display_name     = CASE WHEN ?  THEN NULL ELSE COALESCE(?,  display_name)     END,
       logo_url         = CASE WHEN ?  THEN NULL ELSE COALESCE(?,  logo_url)         END,
       accent_color     = CASE WHEN ?  THEN NULL ELSE COALESCE(?,  accent_color)     END,
       desc_fa          = CASE WHEN ?  THEN NULL ELSE COALESCE(?,  desc_fa)          END,
       desc_en          = CASE WHEN ?  THEN NULL ELSE COALESCE(?,  desc_en)          END,
       desc_ja          = CASE WHEN ?  THEN NULL ELSE COALESCE(?,  desc_ja)          END,
       tags_json        = CASE WHEN ?  THEN NULL ELSE COALESCE(?,  tags_json)        END,
       status           = CASE WHEN ?  THEN NULL ELSE COALESCE(?,  status)           END,
       download_enabled = CASE WHEN ?  THEN NULL ELSE COALESCE(?,  download_enabled) END,
       download_json    = CASE WHEN ?  THEN NULL ELSE COALESCE(?,  download_json)    END,
       min_version      = CASE WHEN ?  THEN NULL ELSE COALESCE(?,  min_version)      END,
       note             = CASE WHEN ?  THEN NULL ELSE COALESCE(?,  note)             END,
       updated_at       = ?`
  ).bind(
    // INSERT
    gameId,
    field('display_name'), field('logo_url'), field('accent_color'),
    field('desc_fa'), field('desc_en'), field('desc_ja'),
    field('tags_json'), field('status'), field('download_enabled'),
    field('download_json'), field('min_version'), field('note'), at,
    // UPDATE - (clearFlag, value) per column, in the same order
    cleared('display_name'), field('display_name'),
    cleared('logo_url'), field('logo_url'),
    cleared('accent_color'), field('accent_color'),
    cleared('desc_fa'), field('desc_fa'),
    cleared('desc_en'), field('desc_en'),
    cleared('desc_ja'), field('desc_ja'),
    cleared('tags_json'), field('tags_json'),
    cleared('status'), field('status'),
    cleared('download_enabled'), field('download_enabled'),
    cleared('download_json'), field('download_json'),
    cleared('min_version'), field('min_version'),
    cleared('note'), field('note'),
    at
  ).run()

  return readSettings(database, gameId)
}


// ==========================================
// resetSettings
// Drops the whole override row.
//
// A DELETE rather than an UPDATE ... SET everything = NULL,
// because the two are identical on read and only one of them
// leaves no trace of a decision that has been undone.
//
// The game itself is untouched: it is defined in code, and the
// worst this can do is put its description back the way the
// registry has it.
// ==========================================
export async function resetSettings(database, gameId) {
  const result = await database.prepare('DELETE FROM game_settings WHERE game_id = ?').bind(gameId).run()
  return changed(result)
}


// ==========================================
// saveDeepLinkScheme
// The one settings column that is written on its own.
//
// It is separate from saveSettings deliberately. deeplink_scheme
// arrived after 0003, so a deployment that ran that migration
// and not 0004 has a game_settings table without the column -
// and naming it in the big upsert would turn "no such column"
// into a save that loses the operator's name, colour and
// description too. Here, that failure costs exactly the field
// that caused it, and says which migration fixes it.
//
// Assumes the row exists: every caller runs saveSettings first,
// which upserts it.
//
// Null clears the override and the resolution falls back to the
// environment variable, then to the registry's own fallback.
// ==========================================
export async function saveDeepLinkScheme(database, gameId, scheme) {
  if (!database || !gameId) return { ok: false, reason: 'no_database' }

  try {
    await database
      .prepare('UPDATE game_settings SET deeplink_scheme = ?, updated_at = ? WHERE game_id = ?')
      .bind(scheme || null, now(), gameId)
      .run()
    return { ok: true, reason: '' }
  } catch (error) {
    // Almost always "no such column: deeplink_scheme".
    return { ok: false, reason: /no such column/i.test(String(error && error.message)) ? 'no_column' : 'failed' }
  }
}


// ==========================================
// readProductOverrides
// Product overrides for one game (or all of them), keyed by
// product id.
// ==========================================
export async function readProductOverrides(database, gameId) {
  if (!database) return {}
  try {
    const query = gameId
      ? database.prepare('SELECT * FROM game_product_overrides WHERE game_id = ?').bind(gameId)
      : database.prepare('SELECT * FROM game_product_overrides')

    const { results } = await query.all()
    const out = {}
    for (const row of results || []) {
      if (!out[row.game_id]) out[row.game_id] = {}
      out[row.game_id][row.product_id] = row
    }
    return gameId ? (out[gameId] || {}) : out
  } catch {
    return {}
  }
}


export async function saveProductOverride(database, gameId, productId, patch = {}, clear = []) {
  const at = now()
  const field = name => (Object.prototype.hasOwnProperty.call(patch, name) ? patch[name] : null)
  const cleared = name => (clear.includes(name) ? 1 : 0)

  await database.prepare(
    `INSERT INTO game_product_overrides
       (game_id, product_id, enabled, price_usd, sort_order, badge, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (game_id, product_id) DO UPDATE SET
       enabled    = CASE WHEN ? THEN NULL ELSE COALESCE(?, enabled)    END,
       price_usd  = CASE WHEN ? THEN NULL ELSE COALESCE(?, price_usd)  END,
       sort_order = CASE WHEN ? THEN NULL ELSE COALESCE(?, sort_order) END,
       badge      = CASE WHEN ? THEN NULL ELSE COALESCE(?, badge)      END,
       updated_at = ?`
  ).bind(
    gameId, productId,
    field('enabled'), field('price_usd'), field('sort_order'), field('badge'), at,
    cleared('enabled'), field('enabled'),
    cleared('price_usd'), field('price_usd'),
    cleared('sort_order'), field('sort_order'),
    cleared('badge'), field('badge'),
    at
  ).run()
}


export async function resetProductOverride(database, gameId, productId) {
  const result = await database.prepare(
    'DELETE FROM game_product_overrides WHERE game_id = ? AND product_id = ?'
  ).bind(gameId, productId).run()
  return changed(result)
}


export async function resetAllProductOverrides(database, gameId) {
  const result = await database.prepare(
    'DELETE FROM game_product_overrides WHERE game_id = ?'
  ).bind(gameId).run()
  return (result && result.meta && result.meta.changes) || 0
}


// ==========================================
// purgeGameRows
// Every override row this game has, gone.
//
// The panel's per-screen resets each undo one thing: the game's
// settings row, or one product's price. Neither answers "put
// this game back to exactly what the code says", which is the
// question somebody asks when a half-filled row of NULLs has
// accumulated and they want to start again.
//
// Two DELETEs and nothing else. It cannot remove the game -
// that lives in config.js - so the worst case is a game that
// renders from its coded defaults, which is the state a fresh
// deployment is in. The next save in the panel writes a clean
// row.
// ==========================================
export async function purgeGameRows(database, gameId) {
  if (!database || !gameId) return { settings: false, products: 0 }

  const products = await resetAllProductOverrides(database, gameId)
  const settings = await resetSettings(database, gameId)

  return { settings, products }
}


// ==========================================================
// The landing page and the version history
// ==========================================================

// ==========================================
// LANDING_COLUMNS
// The columns 0005 added, in one place.
//
// Written through their own statement for the same reason
// deeplink_scheme is: they arrived after 0003, so a database that
// stopped at an earlier migration does not have them, and naming
// them in the main upsert would make one missing column cost the
// operator's name, colour and description too.
// ==========================================
const LANDING_COLUMNS = [
  'hero_url', 'videos_json', 'devices_json', 'about_fa', 'about_en', 'about_ja'
]

export async function saveLandingFields(database, gameId, patch = {}, clear = []) {
  if (!database || !gameId) return { ok: false, reason: 'no_database' }

  const sets = []
  const values = []
  for (const column of LANDING_COLUMNS) {
    if (clear.includes(column)) { sets.push(`${column} = NULL`); continue }
    if (Object.prototype.hasOwnProperty.call(patch, column)) {
      sets.push(`${column} = ?`)
      values.push(patch[column])
    }
  }
  if (!sets.length) return { ok: true, reason: '' }

  try {
    await database
      .prepare(`UPDATE game_settings SET ${sets.join(', ')}, updated_at = ? WHERE game_id = ?`)
      .bind(...values, now(), gameId)
      .run()
    return { ok: true, reason: '' }
  } catch (error) {
    return {
      ok: false,
      reason: /no such column/i.test(String(error && error.message)) ? 'no_column' : 'failed'
    }
  }
}


// ==========================================
// listVersions
// One game's releases, newest first.
//
// [] on any failure, so a deployment that has not run 0005 shows
// a versions page saying "nothing published yet" instead of a
// 500. That is the honest answer for a game with no rows anyway.
// ==========================================
export async function listVersions(database, gameId, limit = 50) {
  if (!database || !gameId) return []
  try {
    const { results } = await database
      .prepare('SELECT * FROM game_versions WHERE game_id = ? ORDER BY released_at DESC LIMIT ?')
      .bind(gameId, Math.max(1, Math.min(Number(limit) || 50, 200)))
      .all()
    return results || []
  } catch {
    return []
  }
}


// ==========================================
// listAllVersions
// The newest release of every game, keyed by game id.
//
// One query rather than one per game: the dashboard draws a
// "v1.4.2" badge on every card, and a grid of five cards should
// not be five round trips.
// ==========================================
export async function listAllVersions(database) {
  if (!database) return {}
  try {
    const { results } = await database.prepare(
      `SELECT v.* FROM game_versions v
        WHERE v.released_at = (
          SELECT MAX(v2.released_at) FROM game_versions v2 WHERE v2.game_id = v.game_id
        )`
    ).all()

    const out = {}
    for (const row of results || []) out[row.game_id] = row
    return out
  } catch {
    return {}
  }
}


export async function saveVersion(database, gameId, version, fields = {}) {
  if (!database || !gameId || !version) return { ok: false, reason: 'bad_input' }

  try {
    await database.prepare(
      `INSERT INTO game_versions
         (game_id, version, released_at, notes_fa, notes_en, notes_ja, download_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (game_id, version) DO UPDATE SET
         released_at  = excluded.released_at,
         notes_fa     = excluded.notes_fa,
         notes_en     = excluded.notes_en,
         notes_ja     = excluded.notes_ja,
         download_url = excluded.download_url`
    ).bind(
      gameId, version,
      Number(fields.released_at) || now(),
      fields.notes_fa || null, fields.notes_en || null, fields.notes_ja || null,
      fields.download_url || null,
      now()
    ).run()
    return { ok: true, reason: '' }
  } catch (error) {
    return {
      ok: false,
      reason: /no such table/i.test(String(error && error.message)) ? 'no_table' : 'failed'
    }
  }
}


export async function deleteVersion(database, gameId, version) {
  if (!database || !gameId || !version) return false
  try {
    const result = await database
      .prepare('DELETE FROM game_versions WHERE game_id = ? AND version = ?')
      .bind(gameId, version).run()
    return changed(result)
  } catch {
    return false
  }
}


// ==========================================================
// Orders - the storefront
// ==========================================================

// ==========================================
// newGameOrderId
// "gord_" + 24 hex characters.
//
// From the CSPRNG rather than a counter. The id is a player's
// handle on their own purchase and appears in a URL; a
// sequential one would let anybody with one order walk to their
// neighbour's.
//
// A different prefix from the licence checkout's "ord_"
// because both land in the same payment provider dashboard,
// and telling them apart at a glance decides which table a
// support question is about.
// ==========================================
export function newGameOrderId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return 'gord_' + [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
}


export async function createGameOrder(database, order) {
  const at = now()

  await database.prepare(
    `INSERT INTO game_orders
       (id, game_id, product_id, player_uid, google_sub, email, email_hash, lang,
        price_usd, quantity, status, provider, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    order.id, order.gameId, order.productId, order.playerUid, order.googleSub || null,
    order.email, await hashEmail(order.email), order.lang || 'en',
    String(order.priceUsd), order.quantity || 1,
    GAME_ORDER_STATE.CREATED, order.provider || CONFIG.COMMERCE.PROVIDER, at, at
  ).run()

  return getGameOrder(database, order.id)
}


export async function getGameOrder(database, id) {
  if (!id) return null
  return database.prepare('SELECT * FROM game_orders WHERE id = ? LIMIT 1').bind(id).first()
}


export async function getGameOrderByInvoice(database, invoiceId) {
  if (!invoiceId) return null
  return database
    .prepare('SELECT * FROM game_orders WHERE provider_invoice_id = ? ORDER BY created_at DESC LIMIT 1')
    .bind(String(invoiceId)).first()
}


export async function markInvoiceOpened(database, id, invoiceId) {
  await database.prepare(
    'UPDATE game_orders SET status = ?, provider_invoice_id = ?, updated_at = ? WHERE id = ?'
  ).bind(GAME_ORDER_STATE.AWAITING, String(invoiceId), now(), id).run()
}


// ==========================================
// recordPayment
// What the provider says about the money, whatever the answer
// is.
//
// Separate from the state transition below because the two have
// different rules: the payment facts are always worth writing
// down, even for a status we then decide not to act on, and
// especially for a partial payment where those three numbers
// are the entire basis on which a human decides what to do.
// ==========================================
export async function recordPayment(database, id, payment) {
  await database.prepare(
    `UPDATE game_orders
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
// The transition that makes an order grantable.
//
// Guarded on the CURRENT state rather than applied
// unconditionally, and the guard is the point: a callback for a
// payment that finished can arrive after the entitlement is
// already in the player's account, and an unguarded UPDATE
// would push a granted order back to `paid` - where the next
// cron tick would dutifully grant it a second time.
// ==========================================
export async function markPaid(database, id) {
  const at = now()
  const result = await database.prepare(
    `UPDATE game_orders SET status = ?, paid_at = COALESCE(paid_at, ?), updated_at = ?
     WHERE id = ? AND status IN (?, ?, ?, ?)`
  ).bind(
    GAME_ORDER_STATE.PAID, at, at, id,
    GAME_ORDER_STATE.CREATED, GAME_ORDER_STATE.AWAITING,
    GAME_ORDER_STATE.PARTIAL, GAME_ORDER_STATE.EXPIRED
  ).run()

  return changed(result)
}


// ==========================================
// claimForGrant
// The lock that stops two workers granting one purchase twice.
//
// A conditional UPDATE rather than a lock table, because D1
// reports how many rows an UPDATE touched. A webhook and a cron
// tick arriving in the same second both run this; exactly one
// sees a change count of 1, and the other walks away.
//
// Only `paid` is claimable. There is no re-claimable
// intermediate state here - unlike the licence checkout, whose
// issuing step mints a key and sends an email - because
// granting is a single UPDATE that either happened or did not.
// ==========================================
export async function claimForGrant(database, id) {
  const result = await database.prepare(
    'UPDATE game_orders SET status = ?, granted_at = ?, updated_at = ? WHERE id = ? AND status = ?'
  ).bind(GAME_ORDER_STATE.GRANTED, now(), now(), id, GAME_ORDER_STATE.PAID).run()

  return changed(result)
}


export async function markGranted(database, id) {
  const at = now()
  await database.prepare(
    'UPDATE game_orders SET status = ?, granted_at = COALESCE(granted_at, ?), updated_at = ? WHERE id = ?'
  ).bind(GAME_ORDER_STATE.GRANTED, at, at, id).run()
}


export async function setOrderStatus(database, id, status, lastError = null) {
  await database.prepare(
    'UPDATE game_orders SET status = ?, last_error = COALESCE(?, last_error), updated_at = ? WHERE id = ?'
  ).bind(status, lastError ? String(lastError).slice(0, 400) : null, now(), id).run()
}


export async function noteOrderError(database, id, message) {
  await database.prepare(
    'UPDATE game_orders SET last_error = ?, updated_at = ? WHERE id = ?'
  ).bind(String(message || '').slice(0, 400), now(), id).run()
}


// ==========================================
// findOpenGameOrders
// Everything a reconciliation pass should look at.
//
// Bounded by both age and count. Age, so a tick does not
// re-examine an order created eleven seconds ago that is simply
// still being paid; count, so a backlog after an outage is
// worked through over several ticks instead of blowing one
// tick's CPU budget and completing none of it.
// ==========================================
export async function findOpenGameOrders(database, { olderThanMs = 0, limit = 30 } = {}) {
  const cutoff = now() - olderThanMs
  const holes = OPEN_ORDER_STATES.map(() => '?').join(', ')

  const { results } = await database.prepare(
    `SELECT * FROM game_orders
     WHERE status IN (${holes}) AND updated_at < ?
     ORDER BY updated_at ASC LIMIT ?`
  ).bind(...OPEN_ORDER_STATES, cutoff, limit).all()

  return results || []
}


// ==========================================
// listGameOrders
// The panel's order list, filtered.
//
// Filters are built as a WHERE fragment with bound parameters
// rather than interpolated text. The search term reaches this
// from an admin form, and an admin form is still a form.
// ==========================================
export async function listGameOrders(database, {
  gameId = '', status = '', productId = '', q = '', limit = 50, offset = 0
} = {}) {
  const where = []
  const binds = []

  if (gameId) { where.push('game_id = ?'); binds.push(gameId) }
  if (status) { where.push('status = ?'); binds.push(status) }
  if (productId) { where.push('product_id = ?'); binds.push(productId) }
  if (q) {
    where.push('(id LIKE ? OR email LIKE ? OR player_uid LIKE ? OR provider_payment_id LIKE ?)')
    const like = '%' + String(q).trim() + '%'
    binds.push(like, like, like, like)
  }

  const clause = where.length ? 'WHERE ' + where.join(' AND ') : ''
  const size = Math.min(Math.max(Number(limit) || 50, 1), 200)
  const skip = Math.max(Number(offset) || 0, 0)

  const totalRow = await database
    .prepare(`SELECT COUNT(*) AS n FROM game_orders ${clause}`)
    .bind(...binds).first()

  const { results } = await database.prepare(
    `SELECT * FROM game_orders ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(...binds, size, skip).all()

  return { rows: results || [], total: (totalRow && totalRow.n) || 0, limit: size, offset: skip }
}


// ==========================================
// gameOrderStats
// The storefront at a glance, per game.
//
// Revenue is summed over granted orders only. Counting `paid`
// as well would flatter the number by everything currently
// mid-flight, and counting `partially_paid` would count money
// that is not enough to buy the thing it was sent for.
// ==========================================
export async function gameOrderStats(database, gameId = '') {
  const clause = gameId ? 'WHERE game_id = ?' : ''
  const binds = gameId ? [gameId] : []

  const row = await database.prepare(
    `SELECT
       COUNT(*)                                                       AS total,
       SUM(CASE WHEN status = 'granted' THEN 1 ELSE 0 END)            AS granted,
       SUM(CASE WHEN status IN ('created','awaiting_payment') THEN 1 ELSE 0 END) AS open,
       SUM(CASE WHEN status = 'partially_paid' THEN 1 ELSE 0 END)     AS partial,
       SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END)            AS expired,
       SUM(CASE WHEN status = 'refunded' THEN 1 ELSE 0 END)           AS refunded,
       SUM(CASE WHEN status = 'granted' THEN CAST(price_usd AS REAL) * quantity ELSE 0 END) AS revenue
     FROM game_orders ${clause}`
  ).bind(...binds).first()

  return {
    total: (row && row.total) || 0,
    granted: (row && row.granted) || 0,
    open: (row && row.open) || 0,
    partial: (row && row.partial) || 0,
    expired: (row && row.expired) || 0,
    refunded: (row && row.refunded) || 0,
    // Rounded here rather than in the view, because a float sum
    // of decimal strings produces 42.900000000000006 and a panel
    // that shows that reads as broken.
    revenueUsd: Math.round(((row && row.revenue) || 0) * 100) / 100
  }
}


// ==========================================
// isGameOrderRateLimited
// Whether this caller has started too many purchases lately.
//
// Swept on read, like the licence system's limiter, and for the
// same reasons: no scheduler to depend on, an indexed delete,
// and a table that cleans itself as a side effect of being
// used.
// ==========================================
export async function isGameOrderRateLimited(database, ip) {
  const ipHash = await hashIp(ip)
  const since = now() - CONFIG.GAMESTORE.ORDER_RATE_WINDOW_MS

  await database.prepare('DELETE FROM game_order_attempts WHERE at < ?').bind(since).run()

  const row = await database.prepare(
    'SELECT COUNT(*) AS n FROM game_order_attempts WHERE ip_hash = ? AND at >= ?'
  ).bind(ipHash, since).first()

  return ((row && row.n) || 0) >= CONFIG.GAMESTORE.ORDER_RATE_LIMIT
}


export async function recordGameOrderAttempt(database, ip) {
  await database.prepare(
    'INSERT INTO game_order_attempts (ip_hash, at) VALUES (?, ?)'
  ).bind(await hashIp(ip), now()).run()
}


// ==========================================================
// Entitlements - what a player owns
// ==========================================================

// ==========================================
// grantEntitlement
// Adds to what a player owns.
//
// An upsert that ADDS rather than sets, which is the only
// correct behaviour for a consumable: buying a thousand shards
// twice is two thousand shards, and a SET would be a player who
// paid twice and received once.
//
// For a non-consumable the quantity clamps at 1 on read (see
// listEntitlements), so a double grant is harmless rather than
// something that has to be prevented here - and preventing it
// here would mean a legitimate re-grant after a support
// question silently doing nothing.
// ==========================================
export async function grantEntitlement(database, {
  gameId, playerUid, productId, kind = 'nonconsumable',
  quantity = 1, source = 'web', orderId = null, expiresAt = null
}) {
  const at = now()
  const amount = Math.max(Number(quantity) || 0, 0)

  await database.prepare(
    `INSERT INTO game_entitlements
       (game_id, player_uid, product_id, kind, quantity, lifetime, source, order_id, expires_at, granted_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (game_id, player_uid, product_id) DO UPDATE SET
       quantity   = quantity + ?,
       lifetime   = lifetime + ?,
       kind       = ?,
       source     = ?,
       order_id   = COALESCE(?, order_id),
       -- A pass bought while one is still running extends it
       -- from where it ends, not from today. Overwriting with
       -- "now + 90 days" would quietly delete whatever was left
       -- of the first one.
       expires_at = CASE
                      WHEN ? IS NULL THEN expires_at
                      WHEN expires_at IS NULL OR expires_at < ? THEN ?
                      ELSE expires_at + (? - ?)
                    END,
       updated_at = ?`
  ).bind(
    gameId, playerUid, productId, kind, amount, amount, source, orderId, expiresAt, at, at,
    amount, amount, kind, source, orderId,
    expiresAt, at, expiresAt, expiresAt, at,
    at
  ).run()

  await logEntitlementEvent(database, {
    gameId, playerUid, productId, kind: 'granted', amount,
    detail: source + (orderId ? ' ' + orderId : '')
  })

  return readEntitlement(database, gameId, playerUid, productId)
}


export async function readEntitlement(database, gameId, playerUid, productId) {
  return database.prepare(
    'SELECT * FROM game_entitlements WHERE game_id = ? AND player_uid = ? AND product_id = ? LIMIT 1'
  ).bind(gameId, playerUid, productId).first()
}


// ==========================================
// listEntitlements
// Everything one player owns in one game.
//
// Expired passes are filtered on read rather than swept by a
// job. A sweep would mean a pass that lapses at 3am is reported
// as owned until the next tick, and it would mean a job that
// has to exist and be watched. A comparison in the WHERE clause
// costs nothing and is right the moment the clock passes it.
// ==========================================
export async function listEntitlements(database, gameId, playerUid) {
  const { results } = await database.prepare(
    `SELECT * FROM game_entitlements
     WHERE game_id = ? AND player_uid = ?
       AND (expires_at IS NULL OR expires_at > ?)
     ORDER BY granted_at DESC`
  ).bind(gameId, playerUid, now()).all()

  return results || []
}


// Everything a player owns, expired rows included. The panel's
// view: an operator answering "what happened to my pass?" needs
// to see the row that lapsed, not an empty list.
export async function listEntitlementsRaw(database, gameId, playerUid) {
  const { results } = await database.prepare(
    'SELECT * FROM game_entitlements WHERE game_id = ? AND player_uid = ? ORDER BY granted_at DESC'
  ).bind(gameId, playerUid).all()

  return results || []
}


// ==========================================
// consumeEntitlement
// Spends part of a consumable balance.
//
// The `quantity >= ?` guard in the WHERE clause is the whole
// safety property: two clients spending the last hundred shards
// at the same moment both run this, and D1's change count means
// exactly one of them succeeds. Reading the balance and then
// writing it back would let both.
//
// Refuses anything that is not a consumable, because spending a
// skin is not a thing - and a client that asks to is a client
// with a bug worth surfacing rather than silently absorbing.
// ==========================================
export async function consumeEntitlement(database, gameId, playerUid, productId, amount = 1) {
  const spend = Math.max(Number(amount) || 0, 1)

  const result = await database.prepare(
    `UPDATE game_entitlements
     SET quantity = quantity - ?, updated_at = ?
     WHERE game_id = ? AND player_uid = ? AND product_id = ?
       AND kind = 'consumable' AND quantity >= ?`
  ).bind(spend, now(), gameId, playerUid, productId, spend).run()

  if (!changed(result)) return { ok: false, error: 'insufficient' }

  await logEntitlementEvent(database, {
    gameId, playerUid, productId, kind: 'consumed', amount: spend, detail: ''
  })

  const row = await readEntitlement(database, gameId, playerUid, productId)
  return { ok: true, remaining: (row && row.quantity) || 0 }
}


// ==========================================
// revokeEntitlement
// Takes something back.
//
// Sets the balance to zero and expires a pass rather than
// deleting the row, so the history of a refund or a chargeback
// survives the action that caused it. A deleted row can be
// explained to nobody six months later.
// ==========================================
export async function revokeEntitlement(database, gameId, playerUid, productId, reason = '') {
  const at = now()
  const result = await database.prepare(
    `UPDATE game_entitlements
     SET quantity = 0, expires_at = ?, updated_at = ?
     WHERE game_id = ? AND player_uid = ? AND product_id = ?`
  ).bind(at, at, gameId, playerUid, productId).run()

  if (changed(result)) {
    await logEntitlementEvent(database, {
      gameId, playerUid, productId, kind: 'revoked', amount: 0, detail: reason
    })
  }

  return changed(result)
}


// ==========================================
// logEntitlementEvent
// One line in a player's history.
//
// Never throws into the caller. This is diagnostics, and a
// diagnostic write that can fail a purchase is worse than no
// diagnostics - the one moment the log is most wanted is the
// moment the database is having trouble.
// ==========================================
export async function logEntitlementEvent(database, { gameId, playerUid, productId, kind, amount = 0, detail = '' }) {
  try {
    await database.prepare(
      `INSERT INTO game_entitlement_events (game_id, player_uid, product_id, kind, amount, detail, at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(gameId, playerUid, productId, kind, amount, String(detail || '').slice(0, 400), now()).run()
  } catch {
    // Deliberately silent.
  }
}


export async function listEntitlementEvents(database, gameId, playerUid, limit = 50) {
  const { results } = await database.prepare(
    `SELECT * FROM game_entitlement_events
     WHERE game_id = ? AND player_uid = ? ORDER BY at DESC LIMIT ?`
  ).bind(gameId, playerUid, Math.min(Number(limit) || 50, 200)).all()

  return results || []
}


// ==========================================
// findPlayers
// Who has bought something, for the panel's player search.
//
// Derived from orders rather than kept as a players table:
// this database has no business holding a roster of everybody
// who ever signed in. It knows about the people who paid,
// which is exactly the set an operator ever needs to look up.
// ==========================================
export async function findPlayers(database, { gameId = '', q = '', limit = 30 } = {}) {
  const where = []
  const binds = []

  if (gameId) { where.push('game_id = ?'); binds.push(gameId) }
  if (q) {
    where.push('(email LIKE ? OR player_uid LIKE ?)')
    const like = '%' + String(q).trim() + '%'
    binds.push(like, like)
  }

  const clause = where.length ? 'WHERE ' + where.join(' AND ') : ''
  const size = Math.min(Math.max(Number(limit) || 30, 1), 100)

  const { results } = await database.prepare(
    `SELECT game_id, player_uid, email,
            COUNT(*) AS orders,
            MAX(created_at) AS last_order_at,
            SUM(CASE WHEN status = 'granted' THEN CAST(price_usd AS REAL) * quantity ELSE 0 END) AS spent
     FROM game_orders ${clause}
     GROUP BY game_id, player_uid, email
     ORDER BY last_order_at DESC
     LIMIT ?`
  ).bind(...binds, size).all()

  return (results || []).map(row => ({
    gameId: row.game_id,
    playerUid: row.player_uid,
    email: row.email,
    orders: row.orders,
    lastOrderAt: row.last_order_at,
    spentUsd: Math.round((row.spent || 0) * 100) / 100
  }))
}
