// ==========================================
// games/registry.js
// The one place the code registry and the database overrides
// become a single object.
//
// Public exports:
//   resolveGames(env, GAMES, { fresh })  -> merged games map
//   resolveGame(env, GAMES, id, opts)    -> one merged game, or null
//   effectiveProducts(game)              -> catalogue with overrides applied
//   productPrice(game, productId)        -> decimal string, or null
//   isDownloadable(game) / isPlayable(game)
//   downloadUrl(game)
//   gameManifest(game, origin)           -> the JSON a client reads
//   schemeText(value)                    -> a valid URL scheme, or null
//   landingVideo(url)                    -> { kind, embed } | null
//   invalidateSettingsCache()
//
// ------------------------------------------------------------
// THE RULE THIS FILE ENFORCES
// ------------------------------------------------------------
// Code decides WHICH GAMES EXIST. The database decides only
// HOW AN EXISTING GAME IS PRESENTED AND SOLD.
//
// The merge is therefore one-directional and starts from the
// registry: it walks the games in config.js and, for each one,
// looks for a row. A row with no matching registry entry is
// never even read - so no INSERT anywhere, by anybody, can put
// a game on this site. Deleting a row cannot remove one
// either; it only puts that game back to its coded defaults.
//
// Everything below copies rather than mutates. getGamesConfig()
// returns a deep-frozen tree and it stays frozen: the merged
// object is new, so a page holding the frozen original is
// holding exactly what the code says, which is what makes the
// override layer safe to have at all.
// ==========================================

import { CONFIG, GAME_STATUS, PRODUCT_KIND } from '../config.js'
import { db, readAllSettings, readProductOverrides } from './store.js'


// ==========================================
// Settings cache
//
// A Worker isolate serves many requests, and the overrides
// change when somebody presses save - a handful of times a
// month. Reading two tables on every page view to discover
// that nothing has changed is two round trips per visitor for
// nothing.
//
// Held for CONFIG.GAMESTORE.SETTINGS_CACHE_MS, which is short
// enough that a change made in the panel is live across every
// isolate within half a minute, and the panel itself always
// reads fresh - so the person making the change never sees a
// stale screen and never has to wonder whether the save took.
//
// Module-level rather than a global cache API: the value is
// tied to this isolate's lifetime, which is exactly the scope
// where it is safe.
// ==========================================
let cache = { at: 0, settings: null, products: null }

export function invalidateSettingsCache() {
  cache = { at: 0, settings: null, products: null }
}

async function loadOverrides(env, fresh) {
  const database = db(env)
  if (!database) return { settings: {}, products: {} }

  const age = Date.now() - cache.at
  if (!fresh && cache.settings && age < CONFIG.GAMESTORE.SETTINGS_CACHE_MS) {
    return { settings: cache.settings, products: cache.products }
  }

  const [settings, products] = await Promise.all([
    readAllSettings(database),
    readProductOverrides(database)
  ])

  cache = { at: Date.now(), settings, products }
  return { settings, products }
}


// ==========================================
// Small readers
//
// Every one of these treats a bad value in the database as
// "not set". A row is written by a panel, and a panel is a
// form: an operator who pastes a status of "Live " with a
// trailing space, or a colour of "red", should see the coded
// default rather than a broken card.
// ==========================================
function text(value) {
  const out = String(value == null ? '' : value).trim()
  return out || null
}

function hexColor(value) {
  const out = text(value)
  return out && /^#[0-9a-fA-F]{6}$/.test(out) ? out : null
}

// A URL scheme, by the rule in RFC 3986: a letter, then letters,
// digits, '+', '-' and '.'. Anything else is treated as unset,
// because this string is concatenated into the deep link a
// signed-in Android player is sent to, and a value with a slash
// or a space in it produces a link that silently opens nothing.
export function schemeText(value) {
  const out = text(value)
  return out && /^[a-zA-Z][a-zA-Z0-9+.-]{0,80}$/.test(out) ? out.toLowerCase() : null
}

function bool(value, fallback) {
  if (value === null || value === undefined) return fallback
  return Number(value) === 1 || value === true
}

function json(value, fallback) {
  const raw = text(value)
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : fallback
  } catch {
    return fallback
  }
}

// A JSON array, or []. Same forgiveness as json() above and for
// the same reason: these blobs are edited as raw text in a
// textarea, and one missing bracket should cost the section it
// belongs to, not the whole page.
function jsonArray(value) {
  const raw = text(value)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}


// A price the payment provider will accept: a positive decimal
// with at most two places. Anything else falls back to the
// catalogue, because an invoice opened for "9,99" or "-4" is a
// failed sale at best.
function price(value, fallback) {
  const raw = text(value)
  if (!raw || !/^\d{1,6}(\.\d{1,2})?$/.test(raw) || Number(raw) <= 0) return fallback
  return raw
}


// ==========================================
// mergeGame
// One registry entry plus its row.
//
// The shape is identical to what getGamesConfig() produces,
// with two additions: `overrides` lists which fields the
// database is currently deciding (so the panel can show a
// "changed" marker and offer a reset), and `settingsAt` is
// when that last happened.
//
// Fields the database is not allowed anywhere near - the D1
// binding, the OAuth client id and secret, the package name,
// the product ids - are copied straight through and never
// consulted for an override. That is not an oversight to be
// fixed later: those are credentials, or fields a shipped
// client has already hard-coded, and a row that could change
// one of them is a row that can break every install in the
// wild.
//
// The deep-link scheme is the deliberate exception, added when
// it stopped being a Worker secret. It is public by
// construction - it is in the manifest of every APK - and
// getting it wrong breaks Android sign-in until somebody
// redeploys, which is exactly the kind of thing this layer
// exists to make fixable in thirty seconds. It is validated as
// a URL scheme on the way in and on the way out.
// ==========================================
function mergeGame(game, row, productRows) {
  const overrides = []
  const take = (field, value) => {
    if (value === null || value === undefined) return null
    overrides.push(field)
    return value
  }

  const name = take('name', text(row && row.display_name))
  const logo = take('logo', text(row && row.logo_url))
  const color = take('color', hexColor(row && row.accent_color))
  const status = take('status', GAME_STATUS.ALL.includes(text(row && row.status)) ? text(row.status) : null)
  const tags = take('tags', Array.isArray(json(row && row.tags_json, null)) ? json(row.tags_json, null) : null)
  const minVersion = take('minVersion', text(row && row.min_version))

  // The one field below that a shipped client also holds, and
  // therefore the one to be careful with. It is here rather than
  // in the "never overridden" list because it is not a
  // credential and not a binding - it is the URL scheme the APK
  // registered, which an operator can read off the manifest and
  // may need to correct without a deploy.
  //
  // Reads as undefined on a database that has not run 0004,
  // which text() turns into null and the merge treats as unset.
  const deepLinkScheme = take('deepLinkScheme', schemeText(row && row.deeplink_scheme))

  const descriptions = {
    fa: text(row && row.desc_fa),
    en: text(row && row.desc_en),
    ja: text(row && row.desc_ja)
  }
  if (descriptions.fa || descriptions.en || descriptions.ja) overrides.push('description')

  const downloadJson = json(row && row.download_json, null)
  const links = downloadJson && Object.keys(downloadJson).length
    ? (overrides.push('download'), { ...downloadJson })
    : { ...game.download.links }

  // The offline switch. Defaults to "on" for a live game and
  // "off" for one that is announced but not out - so a game
  // added to the registry with status 'soon' does not need a
  // row written before it stops offering a download that does
  // not exist.
  const downloadDefault = (status || game.status) !== GAME_STATUS.SOON
  const downloadEnabled = bool(row && row.download_enabled, downloadDefault)
  if (row && row.download_enabled !== null && row.download_enabled !== undefined) {
    overrides.push('downloadEnabled')
  }

  const i18nDescription = { ...((game.i18n && game.i18n.description) || {}) }
  for (const code of ['fa', 'en', 'ja']) {
    if (descriptions[code]) i18nDescription[code] = descriptions[code]
  }

  return {
    ...game,

    name: name || game.name,
    logo: logo || game.logo,
    color: color || game.color,
    status: status || game.status,
    tags: tags || game.tags,

    description: descriptions.en || game.description,
    i18n: { ...game.i18n, description: i18nDescription },

    download: {
      primary: game.download.primary && links[game.download.primary]
        ? game.download.primary
        : Object.keys(links)[0] || '',
      links,
      enabled: downloadEnabled
    },

    minVersion: minVersion || '',

    deepLink: {
      ...game.deepLink,
      scheme: deepLinkScheme || game.deepLink.scheme
    },

    // The landing page's own content. Entirely database-driven:
    // config.js has no opinion about trailers, and a game with no
    // row here gets a landing page built from what the card
    // already knows - which is a correct page, just a shorter one.
    landing: {
      hero: text(row && row.hero_url) || '',
      videos: jsonArray(row && row.videos_json),
      devices: jsonArray(row && row.devices_json),
      about: {
        fa: text(row && row.about_fa) || '',
        en: text(row && row.about_en) || '',
        ja: text(row && row.about_ja) || ''
      }
    },

    store: {
      ...game.store,
      products: applyProductOverrides(game, productRows)
    },

    overrides,
    settingsAt: (row && row.updated_at) || 0,
    note: (row && row.note) || ''
  }
}


// ==========================================
// applyProductOverrides
// The catalogue, re-priced and re-ordered.
//
// Starts from the code catalogue and never adds to it. An
// override row naming a product id that no longer exists in
// config.js is skipped in silence: the product was removed in
// a deploy, which is a decision, and a stale row is not
// grounds for un-making it.
// ==========================================
function applyProductOverrides(game, productRows) {
  const rows = productRows || {}

  const products = (game.store.products || []).map((product, index) => {
    const row = rows[product.id]
    const overrides = []

    const priceUsd = price(row && row.price_usd, null)
    if (priceUsd) overrides.push('priceUsd')

    // A ribbon has THREE states, not two, and conflating the last
    // two was a bug you could see on the store page: NULL means
    // "no override, use the catalogue", and an empty string means
    // "the operator chose No ribbon". Reading the column through
    // text() collapsed '' to null, so taking the "best value"
    // ribbon off shards-large in the panel appeared to save and
    // then came straight back from config.js on the next render.
    //
    // So the presence of the column decides whether it is an
    // override, and the value decides what the override says.
    const badgeSet = Boolean(row) && row.badge !== null && row.badge !== undefined
    const badgeValue = badgeSet ? String(row.badge).trim() : ''
    // Same guard the status field gets, for the same reason: a
    // row written by something other than the panel should not be
    // able to put arbitrary text on a product card.
    const badge = badgeSet && ['', 'best', 'new', 'sale'].includes(badgeValue) ? badgeValue : null
    if (badge !== null) overrides.push('badge')

    const enabled = bool(row && row.enabled, true)
    if (row && row.enabled !== null && row.enabled !== undefined) overrides.push('enabled')

    const sortOrder = row && row.sort_order !== null && row.sort_order !== undefined
      ? (overrides.push('sortOrder'), Number(row.sort_order))
      : index

    return {
      ...product,
      kind: PRODUCT_KIND.ALL.includes(product.kind) ? product.kind : PRODUCT_KIND.NONCONSUMABLE,
      priceUsd: priceUsd || product.priceUsd,
      badge: badge !== null ? badge : (product.badge || ''),
      enabled,
      sortOrder,
      overrides
    }
  })

  return products.sort((a, b) => a.sortOrder - b.sortOrder)
}


// ==========================================
// resolveGames
// The games map every page should render from.
//
// Falls back to the unmerged map on any failure, and that
// fallback is the point of the whole design: a database that is
// unreachable, a migration that has not been run, a row full of
// nonsense - none of them can take the site's games away,
// because the games are in the code that is already running.
// ==========================================
export async function resolveGames(env, GAMES, { fresh = false } = {}) {
  try {
    const { settings, products } = await loadOverrides(env, fresh)
    const out = {}
    for (const [id, game] of Object.entries(GAMES || {})) {
      out[id] = mergeGame(game, settings[id] || null, products[id] || null)
    }
    return out
  } catch {
    const out = {}
    for (const [id, game] of Object.entries(GAMES || {})) {
      out[id] = mergeGame(game, null, null)
    }
    return out
  }
}


export async function resolveGame(env, GAMES, gameId, options = {}) {
  if (!gameId || !GAMES || !GAMES[gameId]) return null
  const merged = await resolveGames(env, GAMES, options)
  return merged[gameId] || null
}


// ==========================================
// landingVideo
// How to show one promotional video.
//
// Two hosts are embedded and everything else is linked, which is
// a security decision rather than a laziness one: an <iframe>
// whose src is operator input is somebody else's JavaScript
// running inside our origin's frame. YouTube and Aparat are
// recognised by pattern, their ids are extracted, and the embed
// URL is BUILT here - the operator's string is never passed
// through to the src attribute.
//
// Returns null for anything unparseable, and the caller renders
// a plain link instead.
// ==========================================
export function landingVideo(url) {
  const raw = String(url || '').trim()
  if (!raw) return null

  const youtube = raw.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/)
  if (youtube) return { kind: 'youtube', embed: `https://www.youtube-nocookie.com/embed/${youtube[1]}` }

  const aparat = raw.match(/aparat\.com\/v\/([A-Za-z0-9]{4,20})/)
  if (aparat) return { kind: 'aparat', embed: `https://www.aparat.com/video/video/embed/videohash/${aparat[1]}/vt/frame` }

  return null
}


// ==========================================
// effectiveProducts
// The products a player may actually buy right now.
//
// Disabled ones are dropped here rather than filtered at three
// call sites, so a product withdrawn from sale disappears from
// the store page, the manifest and the purchase endpoint in one
// change instead of two out of three.
// ==========================================
export function effectiveProducts(game) {
  return ((game && game.store && game.store.products) || []).filter(product => product.enabled !== false)
}


// ==========================================
// productPrice
// What one product costs, as a decimal string.
//
// Null for a product that does not exist or is not for sale,
// which is what the purchase endpoint checks - so "is this
// buyable?" and "what does it cost?" are one question with one
// answer, rather than two checks that can disagree.
// ==========================================
export function productPrice(game, productId) {
  const product = effectiveProducts(game).find(item => item.id === productId)
  return product ? product.priceUsd : null
}


// ==========================================
// isDownloadable
// Whether the download button does anything.
//
// Two conditions, and both have to hold: the operator has not
// withdrawn it, and there is somewhere to send people. A live
// button pointing at nothing is worse than a greyed-out one.
// ==========================================
export function isDownloadable(game) {
  if (!game || game.status === GAME_STATUS.SOON) return false
  if (game.download && game.download.enabled === false) return false
  return Boolean(downloadUrl(game))
}


export function downloadUrl(game) {
  const download = (game && game.download) || {}
  const links = download.links || {}
  return links[download.primary] || Object.values(links)[0] || ''
}


// ==========================================
// isPlayable
// Whether the game's online services should be advertised.
//
// A game in maintenance still signs players in and still sells
// them things - maintenance means the BUILD was withdrawn, not
// that the backend went away. Only 'soon' hides the services,
// because a game that is not out has no players to serve.
// ==========================================
export function isPlayable(game) {
  return Boolean(game) && game.status !== GAME_STATUS.SOON
}


// ==========================================
// gameManifest
// The JSON a client reads before it does anything else.
//
// Exists so a shipped build can find out that its download was
// withdrawn, that a product is no longer on sale, or that it is
// older than the Worker now expects - none of which it can
// learn from a store page it never opens.
//
// Contains nothing secret, and is served without
// authentication: every value in it is already visible to
// anybody who opens the game's page in a browser.
// ==========================================
export function gameManifest(game, origin) {
  const base = String(origin || '').replace(/\/+$/, '')

  return {
    id: game.id,
    name: game.name,
    status: game.status,
    icon: game.icon || '',
    color: game.color,
    logo: game.logo ? base + game.logo : '',
    package: game.package || '',
    minVersion: game.minVersion || '',

    capabilities: game.capabilities,

    download: {
      enabled: isDownloadable(game),
      url: isDownloadable(game) ? downloadUrl(game) : '',
      links: (game.download && game.download.links) || {}
    },

    products: effectiveProducts(game).map(product => ({
      id: product.id,
      sku: product.sku || '',
      kind: product.kind,
      priceUsd: product.priceUsd,
      icon: product.icon || '',
      badge: product.badge || '',
      durationDays: product.durationDays || 0,
      grant: product.grant || null,
      name: (product.i18n && product.i18n.name) || {},
      description: (product.i18n && product.i18n.description) || {}
    })),

    // Spelled out rather than left for a client to assemble, so
    // a path that changes here does not have to be chased
    // through every shipped build's string constants.
    endpoints: {
      manifest: `${base}/games/${game.id}/manifest`,
      products: `${base}/games/${game.id}/products`,
      entitlements: `${base}/games/${game.id}/entitlements`,
      consume: `${base}/games/${game.id}/entitlements/consume`,
      store: `${base}/${game.id}/store`,
      account: `${base}/${game.id}/account`,
      leaderboard: `${base}/${game.id}/leaderboard`,
      health: `${base}/${game.id}/health`,
      oauth: `${base}/oauth/auth`,
      token: `${base}/oauth/token`,
      profile: `${base}/database/get/games/${game.id}/users/`
    }
  }
}
