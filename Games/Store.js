// ==========================================
// Games/Store.js
// Every D1 query the game-management system makes.
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
//   -- the shape of the tables, checked rather than assumed --
//   SETTINGS_SCHEMA / tableColumns / settingsSchemaReport
//   repairSettingsSchema / invalidateSchemaCache
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
//
//   -- who a player id belongs to --
//   claimPlayerIdentity / readPlayerIdentity
// ==========================================

import { CONFIG } from '../Config.js'
import { hashEmail } from '../Commerce/Seal.js'
import { hashIp } from '../Licensing/Keys.js'
import { sameEmail } from '../Core/PlayerIdentity.js'


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
// The shape of the tables, checked rather than assumed
//
// game_settings has grown a column at a time across five
// migrations, and a deployment can be at any point along that
// line: the live licence database has run 0003, 0004, 0005 and
// 0009, and has never run 0008. Every column 0008 added -
// tagline_fa/en/ja, features_json, screenshots_json, faq_json -
// is simply absent there.
//
// That absence used to be invisible in exactly the way that
// costs an evening. saveLandingFields wrote its columns in two
// grouped UPDATEs, and SQLite fails a statement as a whole: one
// missing column in the group took the other five down with it,
// so the operator typed a tagline, six features and a five-entry
// FAQ, pressed save, and the panel wrote none of them - while
// the hero image in the OTHER group saved fine, which is what
// made it read as "the page editor half works" rather than as a
// missing column.
//
// So nothing here guesses any more. The live column set is read
// from the database, every write is filtered through it, and
// what could not be written is named - by COLUMN, not by
// migration, because "run 0008" is not an answer an operator can
// act on from inside a browser and "faq_json is missing" is.
// ==========================================================

/**
 * Every column game_settings is supposed to have, in the order
 * a fresh CREATE TABLE would list them.
 *
 * `since` is the migration that introduced it and `type` is what
 * an ALTER TABLE has to say to add it back. Together they are
 * enough for repairSettingsSchema() to bring any older database
 * up to the current shape without a deploy - which is the point:
 * a column added by a migration nobody remembers running is not
 * something an operator should have to discover from a save that
 * silently did nothing.
 */
export const SETTINGS_SCHEMA = [
  { name: 'display_name', type: 'TEXT', since: '0003_games.sql' },
  { name: 'logo_url', type: 'TEXT', since: '0003_games.sql' },
  { name: 'accent_color', type: 'TEXT', since: '0003_games.sql' },
  { name: 'desc_fa', type: 'TEXT', since: '0003_games.sql' },
  { name: 'desc_en', type: 'TEXT', since: '0003_games.sql' },
  { name: 'desc_ja', type: 'TEXT', since: '0003_games.sql' },
  { name: 'tags_json', type: 'TEXT', since: '0003_games.sql' },
  { name: 'status', type: 'TEXT', since: '0003_games.sql' },
  { name: 'download_enabled', type: 'INTEGER', since: '0003_games.sql' },
  { name: 'download_json', type: 'TEXT', since: '0003_games.sql' },
  { name: 'min_version', type: 'TEXT', since: '0003_games.sql' },
  { name: 'note', type: 'TEXT', since: '0003_games.sql' },
  { name: 'deeplink_scheme', type: 'TEXT', since: '0004_deeplink.sql' },
  { name: 'hero_url', type: 'TEXT', since: '0005_game_pages.sql' },
  { name: 'videos_json', type: 'TEXT', since: '0005_game_pages.sql' },
  { name: 'devices_json', type: 'TEXT', since: '0005_game_pages.sql' },
  { name: 'about_fa', type: 'TEXT', since: '0005_game_pages.sql' },
  { name: 'about_en', type: 'TEXT', since: '0005_game_pages.sql' },
  { name: 'about_ja', type: 'TEXT', since: '0005_game_pages.sql' },
  { name: 'tagline_fa', type: 'TEXT', since: '0008_landing_extra.sql' },
  { name: 'tagline_en', type: 'TEXT', since: '0008_landing_extra.sql' },
  { name: 'tagline_ja', type: 'TEXT', since: '0008_landing_extra.sql' },
  { name: 'features_json', type: 'TEXT', since: '0008_landing_extra.sql' },
  { name: 'screenshots_json', type: 'TEXT', since: '0008_landing_extra.sql' },
  { name: 'faq_json', type: 'TEXT', since: '0008_landing_extra.sql' },

  // A gallery and a trailer list PER LANGUAGE. The shared lists
  // above stay exactly what they were and are what a language
  // with nothing of its own falls back to; these exist because a
  // screenshot of a text-heavy game is a different picture in
  // Persian, English and Japanese, and one list cannot be all
  // three.
  { name: 'screenshots_fa_json', type: 'TEXT', since: '0011_landing_languages.sql' },
  { name: 'screenshots_en_json', type: 'TEXT', since: '0011_landing_languages.sql' },
  { name: 'screenshots_ja_json', type: 'TEXT', since: '0011_landing_languages.sql' },
  { name: 'videos_fa_json', type: 'TEXT', since: '0011_landing_languages.sql' },
  { name: 'videos_en_json', type: 'TEXT', since: '0011_landing_languages.sql' },
  { name: 'videos_ja_json', type: 'TEXT', since: '0011_landing_languages.sql' },

  // The Google sign-in disclosure, which used to be hard-coded in
  // Pages/GameLanding.js. INTEGER and three-state on purpose:
  // NULL is "nobody decided", which reads as on.
  { name: 'google_enabled', type: 'INTEGER', since: '0011_landing_languages.sql' },
  { name: 'google_head_fa', type: 'TEXT', since: '0011_landing_languages.sql' },
  { name: 'google_head_en', type: 'TEXT', since: '0011_landing_languages.sql' },
  { name: 'google_head_ja', type: 'TEXT', since: '0011_landing_languages.sql' },
  { name: 'google_body_fa', type: 'TEXT', since: '0011_landing_languages.sql' },
  { name: 'google_body_en', type: 'TEXT', since: '0011_landing_languages.sql' },
  { name: 'google_body_ja', type: 'TEXT', since: '0011_landing_languages.sql' }
]

/**
 * The landing-page half of the above: what the "Game page" tab
 * writes.
 *
 * Prefixes rather than exact names, so `videos_` covers both the
 * shared list and the three per-language ones and a fourth
 * language would need nothing here. The only column this must
 * NOT let through is one the Games tab owns - the name, the
 * colour, the download links - which is why it is a whitelist of
 * prefixes and not "everything except".
 */
export const LANDING_COLUMNS = SETTINGS_SCHEMA
  .filter(column => /^(hero_url|videos_|devices_json|about_|tagline_|features_json|screenshots_|faq_json|google_)/.test(column.name))
  .map(column => column.name)


// A column set per table, for this isolate's lifetime. PRAGMA is
// cheap but a save should not spend a round trip re-asking a
// question whose answer only changes when somebody runs a
// migration - and when somebody does, invalidateSchemaCache()
// clears it.
let schemaCache = new Map()

export function invalidateSchemaCache() {
  schemaCache = new Map()
}


/**
 * The columns a table actually has, as a Set.
 *
 * An empty Set means "could not tell" - a table that does not
 * exist, or a database that refused the read. Callers treat that
 * as "write nothing and say so" rather than as "write
 * everything", because a failed PRAGMA is not evidence that a
 * column is there.
 */
export async function tableColumns(database, table) {
  if (!database || !table) return new Set()

  const cached = schemaCache.get(table)
  if (cached) return cached

  try {
    const { results } = await database.prepare(`SELECT name FROM pragma_table_info(?)`).bind(table).all()
    const columns = new Set((results || []).map(row => String(row.name)))
    if (columns.size) schemaCache.set(table, columns)
    return columns
  } catch {
    return new Set()
  }
}


/**
 * What game_settings looks like versus what it should look like.
 *
 * `readable` is false when the table could not be inspected at
 * all, which is a different problem from a missing column and is
 * reported as one.
 */
export async function settingsSchemaReport(database) {
  const columns = await tableColumns(database, 'game_settings')

  if (!columns.size) {
    return {
      readable: false,
      present: [],
      missing: SETTINGS_SCHEMA.map(column => ({ ...column })),
      migrations: [...new Set(SETTINGS_SCHEMA.map(column => column.since))]
    }
  }

  const missing = SETTINGS_SCHEMA.filter(column => !columns.has(column.name))

  return {
    readable: true,
    present: SETTINGS_SCHEMA.filter(column => columns.has(column.name)).map(column => column.name),
    missing: missing.map(column => ({ ...column })),
    migrations: [...new Set(missing.map(column => column.since))]
  }
}


/**
 * Adds the missing game_settings columns, one ALTER TABLE each.
 *
 * Every column in SETTINGS_SCHEMA is nullable with no default,
 * so adding one is a metadata-only change: no row is rewritten,
 * nothing that was there moves, and a column that was already
 * there is skipped rather than re-added. Running this twice is a
 * no-op, and running it on a database that is already current
 * does nothing at all.
 *
 * One statement per column on purpose. SQLite's ALTER TABLE
 * takes exactly one ADD COLUMN, and doing them separately means
 * a column that cannot be added for some unforeseen reason costs
 * only itself.
 */
export async function repairSettingsSchema(database) {
  const report = await settingsSchemaReport(database)
  if (!report.readable) return { ok: false, reason: 'unreadable', added: [], failed: [] }
  if (!report.missing.length) return { ok: true, reason: 'already_current', added: [], failed: [] }

  const added = []
  const failed = []

  for (const column of report.missing) {
    try {
      await database.prepare(
        `ALTER TABLE game_settings ADD COLUMN ${column.name} ${column.type}`
      ).run()
      added.push(column.name)
    } catch (error) {
      // "duplicate column name" means somebody else added it
      // between the report and this statement, which is a
      // success from where the caller stands.
      if (/duplicate column/i.test(String(error && error.message))) added.push(column.name)
      else failed.push({ name: column.name, error: String(error && error.message).slice(0, 200) })
    }
  }

  invalidateSchemaCache()
  return { ok: failed.length === 0, reason: '', added, failed }
}


// ==========================================================
// Settings - the overrides an operator may change
// ==========================================================


// ==========================================
// readAllSettings
// Every settings row, keyed by game id.
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
// ensureSettingsRow
// The row exists and nothing else changed.
//
// Names only game_id and updated_at, which every version of this
// table has had, so this one statement is safe against a
// database at any migration.
// ==========================================
async function ensureSettingsRow(database, gameId) {
  await database.prepare(
    `INSERT INTO game_settings (game_id, updated_at) VALUES (?, ?)
     ON CONFLICT (game_id) DO UPDATE SET updated_at = excluded.updated_at`
  ).bind(gameId, now()).run()
}


// ==========================================
// writeSettingsColumns
// The one write path into game_settings.
//
// Everything that edits this table goes through here - the games
// tab, the deep-link field and the whole landing-page editor -
// so there is one place that knows how a column is written and
// one place that knows what to do about a column that is not
// there.
//
// The contract:
//   patch   a column named here is set to that value
//   clear   a column named here is set to NULL
//   neither left exactly as it was
//
// Columns the database does not have are dropped from the
// statement and returned in `missing`, so the rest of the save
// lands. That is the whole fix: a missing faq_json used to cost
// the tagline, the features and the screenshots that were named
// in the same statement.
//
// Returns { ok, missing, wrote } where `missing` is a list of
// COLUMN NAMES - what an operator needs to know - and `wrote`
// counts the columns that actually reached the table.
// ==========================================
async function writeSettingsColumns(database, gameId, patch = {}, clear = []) {
  if (!database || !gameId) return { ok: false, reason: 'no_database', missing: [], wrote: 0 }

  const wanted = new Map()
  for (const name of Object.keys(patch)) wanted.set(name, { clear: false, value: patch[name] })
  // clear wins over patch: a caller that named a column in both
  // meant to empty it.
  for (const name of clear) wanted.set(name, { clear: true, value: null })

  try {
    await ensureSettingsRow(database, gameId)
  } catch (error) {
    return { ok: false, reason: 'failed', missing: [], wrote: 0, error: String(error && error.message).slice(0, 200) }
  }

  if (!wanted.size) return { ok: true, reason: '', missing: [], wrote: 0 }

  const columns = await tableColumns(database, 'game_settings')

  // An unreadable table is not a licence to guess. Fall back to
  // "every column this codebase knows about is present", which is
  // what the code assumed before this function existed - so a
  // deployment where PRAGMA is unavailable behaves exactly as it
  // used to rather than refusing every save.
  const has = name => (columns.size ? columns.has(name) : true)

  const sets = []
  const values = []
  const missing = []

  for (const [name, entry] of wanted) {
    if (!has(name)) { missing.push(name); continue }
    if (entry.clear) { sets.push(`${name} = NULL`); continue }
    sets.push(`${name} = ?`)
    values.push(entry.value)
  }

  if (!sets.length) {
    return { ok: missing.length === 0, reason: missing.length ? 'no_column' : '', missing, wrote: 0 }
  }

  try {
    await database.prepare(
      `UPDATE game_settings SET ${sets.join(', ')}, updated_at = ? WHERE game_id = ?`
    ).bind(...values, now(), gameId).run()
  } catch (error) {
    // A column that PRAGMA reported and the UPDATE then refused
    // is worth surfacing rather than swallowing: it means the two
    // disagree, which is not a state any amount of retrying fixes.
    return {
      ok: false, reason: 'failed', missing, wrote: 0,
      error: String(error && error.message).slice(0, 200)
    }
  }

  return { ok: true, reason: missing.length ? 'partial' : '', missing, wrote: sets.length }
}


// ==========================================
// saveSettings
// An upsert of only the fields the caller named.
//
// Returns { ok, missing, row }. `missing` is the columns this
// database does not have; everything else was written.
// ==========================================
export async function saveSettings(database, gameId, patch = {}, clear = []) {
  const written = await writeSettingsColumns(database, gameId, patch, clear)
  const row = await readSettings(database, gameId)
  return { ok: written.ok, reason: written.reason, missing: written.missing, row }
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
// Null clears the override and the resolution falls back to the
// environment variable, then to the registry's own fallback.
// ==========================================
export async function saveDeepLinkScheme(database, gameId, scheme) {
  const written = scheme
    ? await writeSettingsColumns(database, gameId, { deeplink_scheme: scheme }, [])
    : await writeSettingsColumns(database, gameId, {}, ['deeplink_scheme'])

  if (written.missing.includes('deeplink_scheme')) return { ok: false, reason: 'no_column' }
  return { ok: written.ok, reason: written.ok ? '' : (written.reason || 'failed') }
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
// saveLandingFields
// Writes only the landing columns the caller named.
//
// One statement, filtered through the live column set, rather
// than the two grouped statements this used to be. The grouping
// existed to limit the blast radius of a missing column and did
// the opposite: a database missing faq_json lost its tagline,
// its features and its screenshots in the same failed UPDATE,
// because all four are in the group 0008 added.
//
// Returns { ok, reason, missing } where `missing` names the
// COLUMNS this database does not have. Everything else was
// written, and `reason` is 'partial' when both are true.
// ==========================================
export async function saveLandingFields(database, gameId, patch = {}, clear = []) {
  const landing = new Set(LANDING_COLUMNS)

  // Defence against a caller widening this by accident. The
  // landing editor writes the landing page; the games tab writes
  // the game. Keeping that boundary here means neither screen can
  // reach into the other's fields through a crafted body.
  const safePatch = {}
  for (const [name, value] of Object.entries(patch)) if (landing.has(name)) safePatch[name] = value
  const safeClear = (Array.isArray(clear) ? clear : []).filter(name => landing.has(name))

  const written = await writeSettingsColumns(database, gameId, safePatch, safeClear)
  return { ok: written.ok, reason: written.reason, missing: written.missing }
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


// ==========================================
// Player identity claims
//
// A player id is fifteen characters of an email address's local
// part, so it is not unique to a person: ali@gmail.com and
// ali@yahoo.com both derive "ali". Everywhere that id keys a
// player's own row, the row's `email` column settles ownership -
// but entitlements are keyed by (game_id, player_uid) with no
// address on them at all, so there was nothing to compare and two
// people with colliding addresses shared one balance.
//
// This table is that missing column, kept once rather than on
// every table that needs it: the first verified address to use a
// player id owns it, and a second address is refused instead of
// being handed the first one's purchases.
//
// It is deliberately a claim and not an account. Nothing here
// creates a player, nothing here can be edited from a request,
// and a game whose database has not run 0009 simply has no claims
// to check - see the catch in claimPlayerIdentity.
// ==========================================

/**
 * Releases a player id's claim, for a player deleting their own
 * account.
 *
 * This row holds an email address, so it is personal data and has
 * to go with the rest of it — a "delete my account" that leaves
 * the address behind in a second table has not deleted the
 * account.
 *
 * Keyed on the address as well as the id for the same reason
 * deletePlayerByEmail is: two people can derive one player id,
 * and releasing the wrong person's claim would hand their
 * purchases to the next arrival.
 *
 * Releasing it is safe. The id is derived from the email, so the
 * same person signing in again re-derives it, re-claims it, and
 * finds the entitlements their orders paid for still there.
 */
export async function releasePlayerIdentity(database, gameId, playerUid, email) {
  const address = String(email || '').trim().toLowerCase()
  if (!database || !gameId || !playerUid || !address) return false

  try {
    const result = await database.prepare(
      'DELETE FROM player_identity WHERE game_id = ? AND player_uid = ? AND LOWER(email) = ?'
    ).bind(gameId, playerUid, address).run()
    return changed(result)
  } catch {
    // A database that has not run 0009 has no claims to release.
    return false
  }
}


/** The address that owns a player id, or null when unclaimed. */
export async function readPlayerIdentity(database, gameId, playerUid) {
  try {
    return await database.prepare(
      'SELECT email, google_sub, claimed_at FROM player_identity WHERE game_id = ? AND player_uid = ? LIMIT 1'
    ).bind(gameId, playerUid).first()
  } catch {
    return null
  }
}


/**
 * Claims a player id for one address, or reports who already has it.
 *
 * Returns { ok: true } when the caller owns the id - either
 * because they just claimed it or because they already did - and
 * { ok: false, ownerEmail } when somebody else does.
 *
 * A database error is an { ok: true }: this is a guard against a
 * rare collision, not a gate on the storefront, and taking every
 * purchase down because one INSERT failed trades a small problem
 * for a big one. The failure is visible in the logs of whatever
 * called the query.
 */
export async function claimPlayerIdentity(database, gameId, playerUid, email, googleSub) {
  const address = String(email || '').trim().toLowerCase()
  if (!database || !gameId || !playerUid || !address) return { ok: true }

  try {
    const existing = await database.prepare(
      'SELECT email FROM player_identity WHERE game_id = ? AND player_uid = ? LIMIT 1'
    ).bind(gameId, playerUid).first()

    if (existing) {
      return sameEmail(existing.email, address)
        ? { ok: true }
        : { ok: false, ownerEmail: existing.email }
    }

    // INSERT OR IGNORE, then re-read. Two first requests from the
    // same new player can race here, and the loser of that race
    // must not be told the id belongs to somebody else when it
    // belongs to them.
    await database.prepare(
      `INSERT OR IGNORE INTO player_identity (game_id, player_uid, email, google_sub, claimed_at)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(gameId, playerUid, address, String(googleSub || ''), now()).run()

    const settled = await database.prepare(
      'SELECT email FROM player_identity WHERE game_id = ? AND player_uid = ? LIMIT 1'
    ).bind(gameId, playerUid).first()

    if (!settled) return { ok: true }
    return sameEmail(settled.email, address)
      ? { ok: true }
      : { ok: false, ownerEmail: settled.email }

  } catch {
    return { ok: true }
  }
}
