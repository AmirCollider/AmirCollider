// ==========================================
// Api/TheGodApi.js
// Everything the TheGod panel can actually do.
//
// Public entry point (wired in Worker.js ROUTES):
//   POST /thegod/api    { action: … }
//
// One endpoint with an action field rather than twenty routes,
// because every action needs the same authorisation check and a
// single door cannot be forgotten on the twenty-first.
//
// Two rules hold across every action:
//   1. A game id is only ever looked up, never created. An id
//      that is not in Config.js resolves to nothing and answers
//      404, so no request body can add a game.
//   2. Nothing here executes generated SQL. The sql.* actions
//      return text; running it is a human with wrangler.
// ==========================================

import { createJsonResponse, timingSafeEqual } from '../Core/Http.js'
import { logInfo, logWarning } from '../Core/Logging.js'
import { panelPassword } from '../Core/PanelSession.js'
import { getGameProduct, getGameEnvNames } from '../Config.js'
import { isTheGodSession } from '../Pages/TheGod.js'
import {
  resolveGames,
  isDownloadable,
  effectiveProducts,
  gamePlatforms,
  schemeText,
  invalidateSettingsCache
} from '../Games/Registry.js'
import {
  db, readSettings, saveSettings, resetSettings, saveDeepLinkScheme,
  saveProductOverride, resetProductOverride, purgeGameRows,
  saveLandingFields, listVersions, saveVersion, deleteVersion,
  listGameOrders, gameOrderStats, getGameOrder,
  findPlayers, listEntitlementsRaw, listEntitlementEvents,
  revokeEntitlement, GAME_ORDER_STATE, readProductOverrides,
  SETTINGS_SCHEMA, LANDING_COLUMNS, settingsSchemaReport, repairSettingsSchema,
  invalidateSchemaCache, tableColumns
} from '../Games/Store.js'
import { grantForOrder, grantManually } from '../Games/Purchase.js'
import {
  playerDb, listGamePlayers, getGamePlayer, setModeration,
  setUsername, deleteGamePlayer, moderationOf
} from '../Games/Players.js'
import {
  LEADERBOARD_OPT_OUT_COLUMN,
  LEVEL_COLUMN,
  SELECTED_ITEM_COLUMN
} from '../Games/PlayerRecord.js'
import {
  gameSchemaSql, settingsSeedSql, productSeedSql, purgeSeedSql,
  schemaRepairSql, setupCommands, slug, namesFor
} from '../Games/Sql.js'
import { scaffold } from '../Games/Scaffold.js'
import { unityModules, unityKitIndex } from '../Content/UnityKit.js'
import { googleDisclosureDefaults, googleDisclosureFor } from '../Content/GoogleDisclosure.js'

const LANGS = ['fa', 'en', 'ja']


// ==========================================
// authorize
// The panel session, or the admin bearer token.
// ==========================================
async function authorize(request, env) {
  const token = env && env.DOCSNAP_ADMIN_TOKEN
  // TheGodPassword, falling back to TestSitePassword - the same
  // resolution the panel itself uses, so signing in at /thegod and
  // calling this endpoint never disagree about which secret is in
  // force.
  const password = panelPassword(env, 'thegod')

  if (!token && !password) {
    return createJsonResponse({
      ok: false, error: 'not_configured',
      message: 'Set TheGodPassword (for the panel) or DOCSNAP_ADMIN_TOKEN (for curl).'
    }, 503)
  }

  const presented = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (token && presented && timingSafeEqual(presented, token)) return null
  if (password && await isTheGodSession(request, env)) return null

  logWarning('TheGod API rejected')
  return createJsonResponse({
    ok: false, error: 'unauthorized',
    message: 'Sign in at /thegod, or send Authorization: Bearer <DOCSNAP_ADMIN_TOKEN>.'
  }, 401)

}


// ==========================================
// present
// One merged game, in the shape the panel's client holds.
// ==========================================
function present(game) {
  return {
    id: game.id,
    name: game.name,
    icon: game.icon,
    color: game.color,
    logo: game.logo,
    status: game.status,
    description: (game.i18n && game.i18n.description) || {},
    tags: game.tags || [],
    capabilities: game.capabilities,
    download: game.download,
    downloadable: isDownloadable(game),
    minVersion: game.minVersion || '',
    note: game.note || '',
    deepLinkScheme: (game.deepLink && game.deepLink.scheme) || '',
    deepLinkHost: (game.deepLink && game.deepLink.host) || 'oauth',
    overrides: game.overrides || [],
    settingsAt: game.settingsAt || 0,
    products: (game.store.products || []).map(product => ({
      id: product.id,
      sku: product.sku || '',
      kind: product.kind,
      priceUsd: product.priceUsd,
      icon: product.icon || '',
      badge: product.badge || '',
      enabled: product.enabled !== false,
      sortOrder: product.sortOrder,
      durationDays: product.durationDays || 0,
      grant: product.grant || null,
      name: (product.i18n && product.i18n.name) || {},
      overrides: product.overrides || []
    }))
  }
}


// ==========================================
// presentPlayer
// One player row, in the shape the panel holds.
// ==========================================
function presentPlayer(row) {
  return {
    playerId: row.player_id,
    email: row.email || '',
    username: row.username || '',
    picture: row.profile_pic_url || '',
    highScore: Number(row.high_score) || 0,
    gamesPlayed: Number(row.games_played) || 0,
    playTime: Number(row.total_play_time) || 0,

    // The furthest stage reached and the item being held, for a
    // game that records either. Both read as "nothing" on a
    // database that has not run 0012 - and `progressSupported`
    // is what lets the panel say WHY the figure is missing
    // rather than printing a confident 0.
    highLevel: Number(row[LEVEL_COLUMN]) || 0,
    selectedItem: row[SELECTED_ITEM_COLUMN] || '',
    progressSupported: Object.prototype.hasOwnProperty.call(row, LEVEL_COLUMN),

    createdAt: Number(row.created_at) || 0,
    lastLogin: Number(row.last_login) || 0,
    state: moderationOf(row),

    // The player's own leaderboard decision, shown here so that
    // "why is this player not on the board?" has an answer in the
    // panel. Read-only on this screen on purpose: it is the
    // player's setting, and an operator quietly putting somebody
    // back on a public list they left is not a moderation action
    // this panel should make easy.
    boardHidden: Number(row[LEADERBOARD_OPT_OUT_COLUMN]) === 1,
    boardOptOutSupported: Object.prototype.hasOwnProperty.call(row, LEADERBOARD_OPT_OUT_COLUMN),

    bannedAt: Number(row.banned_at) || 0,
    banReason: row.ban_reason || '',
    restrictedUntil: Number(row.restricted_until) || 0,
    restrictReason: row.restrict_reason || '',
    note: row.admin_note || ''
  }
}


function needDatabase(env) {
  const database = db(env)
  if (database) return { database, refusal: null }

  return {
    database: null,
    refusal: createJsonResponse({
      ok: false, error: 'not_configured',
      message: 'LICENSE_DB is not bound on this deployment. Run the 0003_games.sql migration and bind it.'
    }, 503)
  }
}


function unknownGame() {
  return createJsonResponse({
    ok: false, error: 'unknown_game',
    message: 'No game with that id. Games exist only in GAME_REGISTRY in config.js — '
           + 'use the "new game" tab to generate the entry, then deploy it.'
  }, 404)
}


// ==========================================
// Field sanitising
// ==========================================
function cleanPatch(patch) {
  const out = {}
  const text = (value, max) => String(value == null ? '' : value).trim().slice(0, max)

  if (patch.display_name !== undefined) out.display_name = text(patch.display_name, 80)
  if (patch.logo_url !== undefined) out.logo_url = text(patch.logo_url, 300)
  if (patch.desc_fa !== undefined) out.desc_fa = text(patch.desc_fa, 400)
  if (patch.desc_en !== undefined) out.desc_en = text(patch.desc_en, 400)
  if (patch.desc_ja !== undefined) out.desc_ja = text(patch.desc_ja, 400)
  if (patch.min_version !== undefined) out.min_version = text(patch.min_version, 20)
  if (patch.note !== undefined) out.note = text(patch.note, 300)

  // Validated with the same rule the merge layer applies on
  // read, and dropped rather than corrected when it fails. This
  // string is concatenated into the URL a signed-in Android
  // player is redirected to, so a value with a slash or a space
  // in it is a sign-in that dead-ends on a blank browser tab.
  if (patch.deeplink_scheme !== undefined) {
    const scheme = schemeText(patch.deeplink_scheme)
    if (scheme) out.deeplink_scheme = scheme
  }

  if (patch.accent_color !== undefined) {
    const colour = text(patch.accent_color, 7)
    if (/^#[0-9a-fA-F]{6}$/.test(colour)) out.accent_color = colour
  }

  if (patch.status !== undefined) {
    const status = text(patch.status, 20)
    if (['live', 'maintenance', 'soon'].includes(status)) out.status = status
  }

  // Tags. The column existed from 0003 and the merge layer has
  // always read it; nothing could write it, so the only way to
  // re-tag a game was a deploy. Re-serialised from a parsed
  // array rather than stored as given, for the same reason the
  // download links are: what lands in the column is then known
  // to be the shape the reader expects.
  if (patch.tags_json !== undefined) {
    try {
      const parsed = JSON.parse(patch.tags_json)
      const tags = (Array.isArray(parsed) ? parsed : []).slice(0, 8)
        .map(tag => ({
          fa: text(tag && tag.fa, 40),
          en: text(tag && tag.en, 40),
          ja: text(tag && tag.ja, 40)
        }))
        .filter(tag => tag.fa || tag.en || tag.ja)

      if (tags.length) out.tags_json = JSON.stringify(tags)
    } catch {
      // Dropped rather than rejected: the rest of the save is
      // still what the operator asked for.
    }
  }

  if (patch.download_enabled !== undefined) {
    out.download_enabled = Number(patch.download_enabled) ? 1 : 0
  }

  // Re-serialised from a parsed object rather than stored as
  // given, so what lands in the column is known to be a JSON
  // object of strings - and a blob that would fail to parse on
  // read never gets written in the first place.
  if (patch.download_json !== undefined) {
    try {
      const parsed = JSON.parse(patch.download_json)
      const links = {}
      for (const [store, url] of Object.entries(parsed || {})) {
        const name = String(store).trim().slice(0, 40)
        const href = String(url).trim().slice(0, 300)
        if (name && /^https?:\/\//i.test(href)) links[name] = href
      }
      if (Object.keys(links).length) out.download_json = JSON.stringify(links)
    } catch {
      // A malformed blob is dropped rather than rejected: the
      // rest of the save is still what the operator asked for.
    }
  }

  return out
}


function cleanProductPatch(patch) {
  const out = {}

  if (patch.enabled !== undefined) out.enabled = Number(patch.enabled) ? 1 : 0
  if (patch.sort_order !== undefined) out.sort_order = Math.max(Math.min(Number(patch.sort_order) || 0, 999), -999)

  if (patch.badge !== undefined) {
    const badge = String(patch.badge || '').trim()
    if (['', 'best', 'new', 'sale'].includes(badge)) out.badge = badge
  }

  // The same rule the merge layer applies on read. Checked in
  // both places on purpose: this one gives the operator an
  // error, and that one stops a bad row that got in some other
  // way from opening an invoice for zero.
  if (patch.price_usd !== undefined) {
    const price = String(patch.price_usd || '').trim()
    if (/^\d{1,6}(\.\d{1,2})?$/.test(price) && Number(price) > 0) out.price_usd = price
  }

  return out
}


function cleanClear(clear, allowed) {
  return (Array.isArray(clear) ? clear : []).filter(field => allowed.includes(field))
}


// ==========================================
// The landing page's fields
//
// Everything below is operator input that ends up on a public
// page, so it is cleaned here rather than at render time. The
// rule for a URL is the strict one - an absolute http(s) address
// and nothing else - because these are interpolated into src and
// href attributes, where "javascript:" is a script tag with
// extra steps.
// ==========================================
function cleanText(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max)
}

function cleanUrl(value) {
  const url = cleanText(value, 500)
  return /^https?:\/\//i.test(url) ? url : ''
}

// A relative /assets/... path is allowed too: the site serves
// its own images from there and asking an operator to type the
// full origin for a file already on this domain is a way to end
// up with a staging hostname baked into a live page.
function cleanImage(value) {
  const url = cleanText(value, 500)
  if (/^https?:\/\//i.test(url)) return url
  if (/^\/[A-Za-z0-9._~\-/]*$/.test(url)) return url
  return ''
}

function cleanI18n(map, max) {
  const source = map && typeof map === 'object' ? map : {}
  return {
    fa: cleanText(source.fa, max),
    en: cleanText(source.en, max),
    ja: cleanText(source.ja, max)
  }
}

function hasAnyText(map) {
  return Boolean(map && (map.fa || map.en || map.ja))
}

// A list, cleaned entry by entry, capped, and returned as the
// JSON string the column holds - or '' when nothing survived,
// which the caller turns into "clear this column".
function cleanList(input, limit, mapper) {
  const rows = Array.isArray(input) ? input.slice(0, limit) : []
  const out = []
  for (const row of rows) {
    const cleaned = mapper(row && typeof row === 'object' ? row : {})
    if (cleaned) out.push(cleaned)
  }
  return out.length ? JSON.stringify(out) : ''
}

const DEVICE_KINDS = ['android', 'ios', 'windows', 'web', 'vr', 'generic']

function cleanLanding(landing = {}) {
  const patch = {}
  const clear = []

  const put = (column, value) => {
    if (value) patch[column] = value
    else clear.push(column)
  }

  put('hero_url', cleanImage(landing.hero))

  const about = cleanI18n(landing.about, 4000)
  put('about_fa', about.fa)
  put('about_en', about.en)
  put('about_ja', about.ja)

  const tagline = cleanI18n(landing.tagline, 160)
  put('tagline_fa', tagline.fa)
  put('tagline_en', tagline.en)
  put('tagline_ja', tagline.ja)

  // Screenshots and videos exist twice: one shared list, and one
  // per language for the games whose artwork carries words. The
  // cleaner is the same function in both cases - a per-language
  // gallery is a gallery, and a rule that held for the shared list
  // and not for the Japanese one would be a hole in exactly the
  // place operator input reaches a public page.
  const cleanVideoList = value => cleanList(value, 8, row => {
    const url = cleanUrl(row.url)
    return url ? { url, title: cleanText(row.title, 120) } : null
  })

  const cleanShotList = value => cleanList(value, 12, row => {
    const url = cleanImage(row.url)
    return url ? { url, caption: cleanText(row.caption, 140) } : null
  })

  const videosByLang = (landing.videosByLang && typeof landing.videosByLang === 'object') ? landing.videosByLang : {}
  const shotsByLang = (landing.screenshotsByLang && typeof landing.screenshotsByLang === 'object') ? landing.screenshotsByLang : {}

  put('videos_json', cleanVideoList(landing.videos))
  for (const code of LANGS) put(`videos_${code}_json`, cleanVideoList(videosByLang[code]))

  put('devices_json', cleanList(landing.devices, 12, row => {
    const kind = DEVICE_KINDS.includes(String(row.kind || '').toLowerCase())
      ? String(row.kind).toLowerCase()
      : 'generic'
    const label = cleanText(row.label, 60)
    return label ? { kind, label } : null
  }))

  put('features_json', cleanList(landing.features, 8, row => {
    const text = cleanI18n(row, 120)
    if (!hasAnyText(text)) return null
    return { icon: cleanText(row.icon, 8), ...text }
  }))

  put('screenshots_json', cleanShotList(landing.screenshots))
  for (const code of LANGS) put(`screenshots_${code}_json`, cleanShotList(shotsByLang[code]))

  put('faq_json', cleanList(landing.faq, 12, row => {
    const question = cleanI18n(row.q, 200)
    const answer = cleanI18n(row.a, 1200)
    return hasAnyText(question) && hasAnyText(answer) ? { q: question, a: answer } : null
  }))

  // The Google sign-in disclosure.
  //
  // The switch is written as 1 or 0 rather than left NULL when it
  // is on, because "on" here is a decision an operator made on a
  // screen that showed them the switch. NULL keeps meaning
  // "nobody has decided", which the merge layer also reads as on -
  // the two agree, and only one of them is a record of anything.
  //
  // The heading and body are ordinary landing text: empty falls
  // back to the generated default, exactly like the tagline falls
  // back to Config.js. That is what makes "clear the box" mean
  // "put the standard disclosure back" rather than "publish a
  // page with no disclosure on it".
  const google = (landing.google && typeof landing.google === 'object') ? landing.google : {}
  patch.google_enabled = google.enabled === false ? 0 : 1

  const googleHead = cleanI18n(google.head, 120)
  const googleBody = cleanI18n(google.body, 4000)
  for (const code of LANGS) {
    put(`google_head_${code}`, googleHead[code])
    put(`google_body_${code}`, googleBody[code])
  }

  return { patch, clear }
}


// The landing columns as the panel's editor holds them: parsed
// lists rather than JSON strings, so the browser never has to
// parse a blob that might not be JSON.
function presentLanding(row) {
  const list = value => {
    try {
      const parsed = JSON.parse(String(value || '[]'))
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  const lang3 = suffix => ({
    fa: (row && row[`${suffix}_fa`]) || '',
    en: (row && row[`${suffix}_en`]) || '',
    ja: (row && row[`${suffix}_ja`]) || ''
  })

  const listByLang = prefix => ({
    fa: list(row && row[`${prefix}_fa_json`]),
    en: list(row && row[`${prefix}_en_json`]),
    ja: list(row && row[`${prefix}_ja_json`])
  })

  return {
    hero: (row && row.hero_url) || '',
    about: lang3('about'),
    tagline: lang3('tagline'),
    videos: list(row && row.videos_json),
    videosByLang: listByLang('videos'),
    devices: list(row && row.devices_json),
    features: list(row && row.features_json),
    screenshots: list(row && row.screenshots_json),
    screenshotsByLang: listByLang('screenshots'),
    faq: list(row && row.faq_json),

    // The disclosure. `enabled` is the only three-state field on
    // this screen, and it is flattened to a boolean here on the
    // same rule the merge layer uses: an unwritten column, and a
    // database that has no such column at all, both read as on.
    google: {
      enabled: !(row && Number(row.google_enabled) === 0),
      head: lang3('google_head'),
      body: lang3('google_body')
    }
  }
}


// ==========================================
// presentBaseline
// What Config.js says this game's page contains, before any
// database row is laid on top of it.
//
// The editor needs both halves to be honest. Games/Registry.js
// merges field by field - "empty database, real page; edited
// database, edited page" - so a blank box in the panel does not
// mean a blank section on the site, it means "whatever the code
// says". Showing only the row made every one of those look like
// something nobody had filled in yet.
//
// Takes the RAW registry entry, not the merged game: the merged
// one already has the row folded into it, which is exactly the
// thing this has to be separate from.
// ==========================================
function presentBaseline(configGame) {
  const base = (configGame && configGame.landing) || {}
  const list = value => (Array.isArray(value) ? value : [])
  const lang3 = map => ({
    fa: (map && map.fa) || '',
    en: (map && map.en) || '',
    ja: (map && map.ja) || ''
  })

  const listByLang = map => ({
    fa: list(map && map.fa),
    en: list(map && map.en),
    ja: list(map && map.ja)
  })

  // The disclosure's baseline is GENERATED rather than read out
  // of Config.js, because that is what the page renders when the
  // boxes are empty: the lede, one bullet per capability this
  // game actually has, and the closing paragraph. Handing the
  // panel the finished text is what lets it show the real default
  // as a placeholder - and lets "use the standard text" be a
  // button rather than an instruction to go and find the file.
  const googleBase = googleDisclosureDefaults(configGame)
  const googleOverride = base.google || {}

  return {
    hero: base.hero || '',
    tagline: lang3(base.tagline),
    about: lang3(base.about),
    features: list(base.features),
    screenshots: list(base.screenshots),
    screenshotsByLang: listByLang(base.screenshotsByLang),
    videos: list(base.videos),
    videosByLang: listByLang(base.videosByLang),
    devices: list(base.devices),
    faq: list(base.faq),
    google: {
      enabled: googleOverride.enabled !== false,
      head: overBase(googleOverride.head, googleBase.head),
      body: overBase(googleOverride.body, googleBase.body)
    }
  }
}


// A registry entry's own text over the generated default, one
// language at a time - the same field-by-field rule the stored
// row gets laid on top of both.
function overBase(override, generated) {
  return {
    fa: (override && override.fa) || generated.fa,
    en: (override && override.en) || generated.en,
    ja: (override && override.ja) || generated.ja
  }
}


function presentVersion(row) {
  return {
    version: row.version,
    releasedAt: Number(row.released_at) || 0,
    notes: {
      fa: row.notes_fa || '',
      en: row.notes_en || '',
      ja: row.notes_ja || ''
    },
    downloadUrl: row.download_url || ''
  }
}


// Which columns a database is missing, phrased as the sentence
// the panel shows. A save that could not write half its fields
// must say so: "saved" over a section that did not save is how
// somebody spends an evening re-typing a FAQ.
//
// Columns, not migrations. "Run 0008" is not something an
// operator can act on from inside a browser, and it was also not
// specific enough to be true - a database can be missing one
// column out of a migration's six. The panel has a repair button
// now, so the sentence points at it.
function columnWarning(missing) {
  if (!missing || !missing.length) return ''

  const migrations = [...new Set(
    missing
      .map(name => (SETTINGS_SCHEMA.find(column => column.name === name) || {}).since)
      .filter(Boolean)
  )]

  return 'Everything else on this screen was saved, but these fields have no column in this '
       + `database yet: ${missing.join(', ')}. `
       + (migrations.length ? `They come from ${migrations.join(' and ')}. ` : '')
       + 'Press "Repair the schema" on the SQL tab to add them — it is an ALTER TABLE per column '
       + 'and touches no existing data — then save this screen again.'
}


// Which landing fields a missing column costs, so the panel can
// grey out the sections that cannot be saved rather than letting
// somebody fill one in and lose it.
// The per-language lists get their OWN keys rather than being
// folded into 'screenshots' and 'videos'. A database that stopped
// at 0008 can still save a shared gallery perfectly well, and
// greying out the whole section over the three columns it is
// missing would report a working field as broken - which is the
// same mistake, in the other direction, that this map exists to
// stop.
function landingSections(missing) {
  const owner = {
    hero_url: 'hero',
    videos_json: 'videos',
    videos_fa_json: 'videosLang', videos_en_json: 'videosLang', videos_ja_json: 'videosLang',
    devices_json: 'devices',
    about_fa: 'about', about_en: 'about', about_ja: 'about',
    tagline_fa: 'tagline', tagline_en: 'tagline', tagline_ja: 'tagline',
    features_json: 'features',
    screenshots_json: 'screenshots',
    screenshots_fa_json: 'screenshotsLang',
    screenshots_en_json: 'screenshotsLang',
    screenshots_ja_json: 'screenshotsLang',
    faq_json: 'faq',
    google_enabled: 'google',
    google_head_fa: 'google', google_head_en: 'google', google_head_ja: 'google',
    google_body_fa: 'google', google_body_en: 'google', google_body_ja: 'google'
  }
  return [...new Set((missing || []).map(name => owner[name]).filter(Boolean))]
}


// ==========================================
// handleTheGodApi
// ==========================================
export async function handleTheGodApi(url, request, gameId, requestId, GAMES, env) {
  const refusal = await authorize(request, env)
  if (refusal) return refusal

  let body
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const action = String(body.action || '').toLowerCase()

  // Fresh on every panel call. This is where changes are made,
  // and an operator who saves and sees the old value has no way
  // to tell a cache from a failed write.
  const games = await resolveGames(env, GAMES, { fresh: true })
  const game = body.gameId ? games[String(body.gameId)] : null

  switch (action) {

    // -----------------------------------------------------------
    // overview — every game, as the panel holds them
    // -----------------------------------------------------------
    case 'overview':
      return createJsonResponse({
        ok: true,
        games: Object.values(games).map(present)
      })

    // -----------------------------------------------------------
    // game.get / game.save / game.reset
    // -----------------------------------------------------------
    case 'game.get': {
      if (!game) return unknownGame()
      const database = db(env)
      const raw = database ? await readSettings(database, game.id) : null
      return createJsonResponse({ ok: true, game: present(game), settings: raw || null })
    }

    case 'game.save': {
      if (!game) return unknownGame()

      const { database, refusal: noDb } = needDatabase(env)
      if (noDb) return noDb

      const allowed = [
        'display_name', 'logo_url', 'accent_color', 'desc_fa', 'desc_en', 'desc_ja',
        'tags_json', 'status', 'download_enabled', 'download_json', 'min_version', 'note',
        'deeplink_scheme'
      ]

      const patch = cleanPatch(body.patch || {})
      const clear = cleanClear(body.clear, allowed)

      // deeplink_scheme is written after the row exists and on
      // its own, because it is the one column with a resolution
      // chain behind it: a cleared override falls back to the
      // environment variable and then to Config.js, and the panel
      // reports which of the three won.
      // The CLEANED value, not the one that arrived: cleanPatch
      // lower-cases the scheme, so writing body.patch through
      // would store a spelling that differs from the one every
      // read normalises to.
      const cleanScheme = patch.deeplink_scheme
      const wantsScheme = Object.prototype.hasOwnProperty.call(patch, 'deeplink_scheme')
      const clearsScheme = clear.includes('deeplink_scheme')
      delete patch.deeplink_scheme

      const savedSettings = await saveSettings(
        database, game.id, patch, clear.filter(field => field !== 'deeplink_scheme')
      )

      let schemeWarning = columnWarning(savedSettings.missing)

      // Sent, and thrown away by cleanPatch for not being a URL
      // scheme. The panel checks this before it asks, so this is
      // the curl path - and answering a rejected field with a
      // plain "ok" is how somebody ends up debugging a value they
      // believe they set.
      if (!wantsScheme && body.patch && body.patch.deeplink_scheme !== undefined && !clearsScheme) {
        schemeWarning = 'The deep-link scheme was rejected: it must be a URL scheme — a letter followed by '
                      + 'letters, digits, "+", "-" or ".", with no "://" and no spaces. Nothing else on this '
                      + 'save was affected.'
      } else if (wantsScheme || clearsScheme) {
        const written = await saveDeepLinkScheme(database, game.id, wantsScheme ? cleanScheme : null)
        if (!written.ok) {
          schemeWarning = written.reason === 'no_column'
            ? 'The deep-link scheme was not saved: this database has no game_settings.deeplink_scheme '
            + 'column yet. Press "Repair the schema" on the SQL tab. Everything else on this screen was saved.'
            : 'The deep-link scheme could not be saved. Everything else on this screen was saved.'
          logWarning('Deep-link scheme not written', { requestId, gameId: game.id, reason: written.reason })
        }
      }

      // Every isolate is now holding a stale merge. This one
      // clears its own; the others expire within
      // GAMESTORE.SETTINGS_CACHE_MS, which is the whole reason
      // that window is measured in seconds.
      invalidateSettingsCache()

      const merged = await resolveGames(env, GAMES, { fresh: true })
      logInfo('Game settings saved', { requestId, gameId: game.id })

      return createJsonResponse({ ok: true, game: present(merged[game.id]), warning: schemeWarning })
    }

    case 'game.reset': {
      if (!game) return unknownGame()

      const { database, refusal: noDb } = needDatabase(env)
      if (noDb) return noDb

      await resetSettings(database, game.id)
      invalidateSettingsCache()

      const merged = await resolveGames(env, GAMES, { fresh: true })
      logInfo('Game settings reset', { requestId, gameId: game.id })

      return createJsonResponse({ ok: true, game: present(merged[game.id]) })
    }

    // game.purge — both override tables, for one game
    //
    // Orders and entitlements are untouched. Withdrawing an
    // override is not the same as taking back what somebody paid
    // for.
    case 'game.purge': {
      if (!game) return unknownGame()

      const { database, refusal: noDb } = needDatabase(env)
      if (noDb) return noDb

      const removed = await purgeGameRows(database, game.id)
      invalidateSettingsCache()

      const merged = await resolveGames(env, GAMES, { fresh: true })
      logInfo('Game override rows purged', {
        requestId, gameId: game.id, settings: removed.settings, products: removed.products
      })

      return createJsonResponse({
        ok: true,
        game: present(merged[game.id]),
        removed
      })
    }

    // -----------------------------------------------------------
    // landing.get — the game's own page, as the editor holds it
    //
    // The landing page and the version history in one answer,
    // because the screen that edits one edits the other and two
    // round trips to draw one tab is one round trip too many.
    // -----------------------------------------------------------
    case 'landing.get': {
      if (!game) return unknownGame()

      const database = db(env)
      const [row, versions, schema] = database
        ? await Promise.all([
            readSettings(database, game.id),
            listVersions(database, game.id, 60),
            settingsSchemaReport(database)
          ])
        : [null, [], { readable: false, present: [], missing: [], migrations: [] }]

      const missing = (schema.missing || []).map(column => column.name)

      return createJsonResponse({
        ok: true,
        gameId: game.id,
        landing: presentLanding(row),

        // What the page falls back to when a field here is empty.
        // The editor used to show only the stored row, so every
        // box was blank on a game whose landing page was in fact
        // full - of the baseline in Config.js. Somebody typing a
        // hero URL into that screen and pressing save had no way
        // to tell which of the other nine sections they had just
        // agreed to leave alone and which they were about to
        // publish empty.
        baseline: presentBaseline(GAMES[game.id]),

        // Which of these sections cannot be saved on this
        // database, so the editor can say so beside the fields
        // rather than after the save.
        missingColumns: missing,
        blockedSections: landingSections(missing),

        versions: versions.map(presentVersion),
        // Where the page these fields feed actually is, so the
        // editor can link to the thing it is editing.
        preview: `${String(url.origin).replace(/\/+$/, '')}/${game.id}`
      })
    }

    // landing.save — everything on the game's own page
    //
    // Writes only the landing columns. The game's name, colour
    // and download links are game.save's business, and keeping
    // the two apart means a database missing 0008 fails the FAQ
    // rather than the download switch.
    case 'landing.save': {
      if (!game) return unknownGame()

      const { database, refusal: noDb } = needDatabase(env)
      if (noDb) return noDb

      const { patch, clear } = cleanLanding(body.landing || {})

      const written = await saveLandingFields(database, game.id, patch, clear)
      invalidateSettingsCache()

      if (!written.ok && written.reason !== 'no_column' && written.reason !== 'partial') {
        return createJsonResponse({
          ok: false, error: 'save_failed',
          message: 'The landing page could not be saved.'
        }, 500)
      }

      const row = await readSettings(database, game.id)
      logInfo('Landing page saved', { requestId, gameId: game.id, missing: written.missing })

      return createJsonResponse({
        ok: true,
        landing: presentLanding(row),
        baseline: presentBaseline(GAMES[game.id]),
        missingColumns: written.missing,
        blockedSections: landingSections(written.missing),
        warning: columnWarning(written.missing)
      })
    }

    // -----------------------------------------------------------
    // version.save / version.delete — the release history
    //
    // The newest released_at is "the current version", on the
    // game's page and on its dashboard card. There is no second
    // column holding a number that can disagree with this table,
    // which is why publishing a release is one row here and
    // nothing else anywhere.
    // -----------------------------------------------------------
    case 'version.save': {
      if (!game) return unknownGame()

      const { database, refusal: noDb } = needDatabase(env)
      if (noDb) return noDb

      const version = String(body.version || '').trim().slice(0, 24)
      if (!/^[0-9A-Za-z][0-9A-Za-z.\-+_]*$/.test(version)) {
        return createJsonResponse({
          ok: false, error: 'bad_version',
          message: 'A version is letters, digits and . - + _ — for example 1.4.2.'
        }, 400)
      }

      const notes = body.notes || {}
      const written = await saveVersion(database, game.id, version, {
        released_at: Number(body.releasedAt) || Date.now(),
        notes_fa: cleanText(notes.fa, 3000) || null,
        notes_en: cleanText(notes.en, 3000) || null,
        notes_ja: cleanText(notes.ja, 3000) || null,
        download_url: cleanUrl(body.downloadUrl) || null
      })

      if (!written.ok) {
        return createJsonResponse({
          ok: false, error: written.reason,
          message: written.reason === 'no_table'
            ? 'This database has no game_versions table yet. Run migrations/0005_game_pages.sql.'
            : 'That version could not be saved.'
        }, written.reason === 'no_table' ? 409 : 400)
      }

      logInfo('Game version saved', { requestId, gameId: game.id, version })
      const versions = await listVersions(database, game.id, 60)

      return createJsonResponse({ ok: true, versions: versions.map(presentVersion) })
    }

    case 'version.delete': {
      if (!game) return unknownGame()

      const { database, refusal: noDb } = needDatabase(env)
      if (noDb) return noDb

      const version = String(body.version || '').trim()
      const removed = await deleteVersion(database, game.id, version)
      logInfo('Game version deleted', { requestId, gameId: game.id, version, removed })

      const versions = await listVersions(database, game.id, 60)
      return createJsonResponse({ ok: true, removed, versions: versions.map(presentVersion) })
    }

    // -----------------------------------------------------------
    // product.save / product.reset
    // -----------------------------------------------------------
    case 'product.save': {
      if (!game) return unknownGame()

      const productId = String(body.productId || '')
      if (!getGameProduct(game, productId)) {
        return createJsonResponse({
          ok: false, error: 'unknown_product',
          message: 'Products exist only in that game\'s store.products in config.js. '
                 + 'This screen can re-price one, not create one.'
        }, 404)
      }

      const { database, refusal: noDb } = needDatabase(env)
      if (noDb) return noDb

      await saveProductOverride(
        database, game.id, productId,
        cleanProductPatch(body.patch || {}),
        cleanClear(body.clear, ['enabled', 'price_usd', 'sort_order', 'badge'])
      )
      invalidateSettingsCache()

      const merged = await resolveGames(env, GAMES, { fresh: true })
      logInfo('Product override saved', { requestId, gameId: game.id, productId })

      return createJsonResponse({ ok: true, game: present(merged[game.id]) })
    }

    case 'product.reset': {
      if (!game) return unknownGame()

      const { database, refusal: noDb } = needDatabase(env)
      if (noDb) return noDb

      await resetProductOverride(database, game.id, String(body.productId || ''))
      invalidateSettingsCache()

      const merged = await resolveGames(env, GAMES, { fresh: true })
      return createJsonResponse({ ok: true, game: present(merged[game.id]) })
    }

    // -----------------------------------------------------------
    // orders.list — the panel's payments screen
    // -----------------------------------------------------------
    case 'orders.list': {
      const { database, refusal: noDb } = needDatabase(env)
      if (noDb) return noDb

      const filterGame = body.gameId && games[String(body.gameId)] ? String(body.gameId) : ''

      const [page, stats] = await Promise.all([
        listGameOrders(database, {
          gameId: filterGame,
          status: String(body.status || ''),
          q: String(body.q || ''),
          limit: body.limit,
          offset: body.offset
        }),
        gameOrderStats(database, filterGame)
      ])

      return createJsonResponse({
        ok: true,
        total: page.total,
        limit: page.limit,
        offset: page.offset,
        stats,
        orders: page.rows.map(row => ({
          id: row.id,
          gameId: row.game_id,
          productId: row.product_id,
          playerUid: row.player_uid,
          email: row.email,
          priceUsd: row.price_usd,
          quantity: row.quantity,
          status: row.status,
          payCurrency: row.pay_currency || '',
          actuallyPaid: row.actually_paid || '',
          paymentId: row.provider_payment_id || '',
          invoiceId: row.provider_invoice_id || '',
          lastError: row.last_error || '',
          createdAt: row.created_at,
          paidAt: row.paid_at || 0,
          grantedAt: row.granted_at || 0
        }))
      })
    }

    // order.grant — deliver a paid order by hand
    case 'order.grant': {
      const { database, refusal: noDb } = needDatabase(env)
      if (noDb) return noDb

      const order = await getGameOrder(database, String(body.orderId || ''))
      if (!order) {
        return createJsonResponse({ ok: false, error: 'not_found' }, 404)
      }
      if (order.status !== GAME_ORDER_STATE.PAID) {
        return createJsonResponse({
          ok: false, error: 'not_payable',
          message: `Only a paid order can be delivered by hand. This one is "${order.status}".`
        }, 409)
      }

      const result = await grantForOrder(env, database, order, games)
      logInfo('Order granted from the panel', { requestId, orderId: order.id, state: result.state })

      return createJsonResponse({ ok: true, state: result.state })
    }

    // players.list — everybody who has signed in
    case 'players.list': {
      if (!game) return unknownGame()

      const database = playerDb(env, game)
      if (!database) {
        return createJsonResponse({
          ok: false, error: 'no_player_db',
          message: `This game's database binding (${game.d1Binding || 'unset'}) is not bound on this `
                 + 'deployment. Add it to wrangler.jsonc and deploy.'
        }, 503)
      }

      const page = await listGamePlayers(database, {
        q: String(body.q || ''),
        limit: body.limit,
        offset: body.offset,
        status: ['active', 'restricted', 'banned'].includes(String(body.status)) ? String(body.status) : ''
      })

      return createJsonResponse({
        ok: true,
        total: page.total,
        // False when the game's database predates 0006. The panel
        // uses this to explain why the ban buttons are disabled
        // rather than letting them fail one at a time.
        moderation: page.moderation,

        // Same idea for 0010: false means this game's players
        // cannot take themselves off the leaderboard yet, so the
        // panel shows nothing about board visibility rather than
        // showing every player as "on the board" - which would be
        // a claim it cannot actually check.
        boardOptOut: page.optOut,

        players: page.rows.map(presentPlayer)
      })
    }

    // -----------------------------------------------------------
    // player.profile — one player, with what they own
    // -----------------------------------------------------------
    case 'player.profile': {
      if (!game) return unknownGame()

      const database = playerDb(env, game)
      if (!database) {
        return createJsonResponse({ ok: false, error: 'no_player_db' }, 503)
      }

      const playerId = String(body.playerId || '')
      const row = await getGamePlayer(database, playerId)
      if (!row) return createJsonResponse({ ok: false, error: 'not_found' }, 404)

      // Entitlements live in the licence database, so the two
      // halves of a player are assembled here rather than by the
      // browser making two calls and hoping both land.
      const licence = db(env)
      const [owned, events] = licence
        ? await Promise.all([
            listEntitlementsRaw(licence, game.id, playerId),
            listEntitlementEvents(licence, game.id, playerId, 30)
          ])
        : [[], []]

      return createJsonResponse({
        ok: true,
        player: presentPlayer(row),
        entitlements: owned.map(item => ({
          productId: item.product_id, kind: item.kind, quantity: item.quantity,
          source: item.source, expiresAt: item.expires_at || 0, grantedAt: item.granted_at
        })),
        events: events.map(event => ({
          productId: event.product_id, kind: event.kind,
          amount: event.amount, detail: event.detail || '', at: event.at
        }))
      })
    }

    // -----------------------------------------------------------
    // player.moderate — ban, restrict, note, or lift any of them
    // -----------------------------------------------------------
    case 'player.moderate': {
      if (!game) return unknownGame()

      const database = playerDb(env, game)
      if (!database) return createJsonResponse({ ok: false, error: 'no_player_db' }, 503)

      const playerId = String(body.playerId || '')
      const patch = {}
      if (body.banned !== undefined) patch.banned = Boolean(body.banned)
      if (body.restrictDays !== undefined) {
        const days = Math.max(0, Math.min(Number(body.restrictDays) || 0, 3650))
        patch.restrictedUntil = days ? Date.now() + days * 24 * 60 * 60 * 1000 : 0
      }
      if (body.note !== undefined) patch.note = String(body.note || '')
      if (body.reason !== undefined) patch.reason = String(body.reason || '')

      const result = await setModeration(database, playerId, patch)
      if (!result.ok) {
        return createJsonResponse({
          ok: false, error: result.reason,
          message: result.reason === 'no_column'
            ? 'This game\'s database has no moderation columns yet. Run '
              + 'migrations/0006_player_moderation.sql against it.'
            : 'That did not work.'
        }, result.reason === 'no_column' ? 409 : 400)
      }

      logInfo('Player moderated', { requestId, gameId: game.id, playerId, patch: Object.keys(patch) })
      const row = await getGamePlayer(database, playerId)
      return createJsonResponse({ ok: true, player: row ? presentPlayer(row) : null })
    }

    // -----------------------------------------------------------
    // player.rename
    // -----------------------------------------------------------
    case 'player.rename': {
      if (!game) return unknownGame()

      const database = playerDb(env, game)
      if (!database) return createJsonResponse({ ok: false, error: 'no_player_db' }, 503)

      const playerId = String(body.playerId || '')
      const result = await setUsername(database, playerId, body.username)

      if (!result.ok) {
        const messages = {
          bad_username: 'A username is 3 to 12 characters, English letters and digits only.',
          taken: 'Another player already has that username.',
          bad_input: 'Missing player id.'
        }
        return createJsonResponse({
          ok: false, error: result.reason, message: messages[result.reason] || 'That did not work.'
        }, 400)
      }

      logInfo('Player renamed from the panel', { requestId, gameId: game.id, playerId })
      const row = await getGamePlayer(database, playerId)
      return createJsonResponse({ ok: true, player: row ? presentPlayer(row) : null })
    }

    // -----------------------------------------------------------
    // player.delete — the player record, and only that
    //
    // Their orders survive on purpose. An order is a financial
    // record; deleting the money along with the account is how a
    // chargeback six weeks later becomes unanswerable.
    // -----------------------------------------------------------
    case 'player.delete': {
      if (!game) return unknownGame()

      const database = playerDb(env, game)
      if (!database) return createJsonResponse({ ok: false, error: 'no_player_db' }, 503)

      const playerId = String(body.playerId || '')
      const removed = await deleteGamePlayer(database, playerId)

      logInfo('Player record deleted from the panel', { requestId, gameId: game.id, playerId, removed })
      return createJsonResponse({ ok: true, removed })
    }

    // -----------------------------------------------------------
    // players.search / player.get / player.grant / player.revoke
    // -----------------------------------------------------------
    case 'players.search': {
      const { database, refusal: noDb } = needDatabase(env)
      if (noDb) return noDb

      const players = await findPlayers(database, {
        gameId: body.gameId && games[String(body.gameId)] ? String(body.gameId) : '',
        q: String(body.q || ''),
        limit: body.limit
      })

      return createJsonResponse({ ok: true, players })
    }

    case 'player.get': {
      if (!game) return unknownGame()

      const { database, refusal: noDb } = needDatabase(env)
      if (noDb) return noDb

      const playerUid = String(body.playerUid || '')
      const [rows, events] = await Promise.all([
        listEntitlementsRaw(database, game.id, playerUid),
        listEntitlementEvents(database, game.id, playerUid, 40)
      ])

      return createJsonResponse({
        ok: true,
        playerUid,
        entitlements: rows.map(row => ({
          productId: row.product_id,
          kind: row.kind,
          quantity: row.quantity,
          lifetime: row.lifetime,
          source: row.source,
          orderId: row.order_id || '',
          expiresAt: row.expires_at || 0,
          grantedAt: row.granted_at,
          updatedAt: row.updated_at
        })),
        events: events.map(event => ({
          productId: event.product_id,
          kind: event.kind,
          amount: event.amount,
          detail: event.detail || '',
          at: event.at
        }))
      })
    }

    case 'player.grant': {
      if (!game) return unknownGame()

      const { database, refusal: noDb } = needDatabase(env)
      if (noDb) return noDb

      const result = await grantManually(env, database, {
        game,
        productId: String(body.productId || ''),
        playerUid: String(body.playerUid || ''),
        quantity: Number(body.quantity) || 0,
        reason: String(body.reason || '').slice(0, 200)
      })

      if (!result.ok) {
        return createJsonResponse({
          ok: false, error: result.error,
          message: 'That product is not in this game\'s catalogue.'
        }, 404)
      }

      return createJsonResponse({ ok: true, units: result.units })
    }

    case 'player.revoke': {
      if (!game) return unknownGame()

      const { database, refusal: noDb } = needDatabase(env)
      if (noDb) return noDb

      const removed = await revokeEntitlement(
        database, game.id,
        String(body.playerUid || ''), String(body.productId || ''),
        'panel: ' + String(body.reason || '').slice(0, 160)
      )

      logInfo('Entitlement revoked from the panel', {
        requestId, gameId: game.id, productId: body.productId
      })

      return createJsonResponse({ ok: true, revoked: removed })
    }

    // sql.game — the migration for one game's own database
    case 'sql.game': {
      const id = slug(body.gameId || '')
      if (!id) {
        return createJsonResponse({ ok: false, error: 'bad_id', message: 'Pass a game id.' }, 400)
      }

      const known = games[id]
      const names = namesFor(id)

      return createJsonResponse({
        ok: true,
        gameId: id,
        file: `migrations/${names.id}.sql`,
        binding: names.binding,
        database: names.database,
        sql: gameSchemaSql(id, {
          gameName: known ? known.name : '',
          withPurchases: body.withPurchases !== false,
          withSessions: Boolean(body.withSessions),
          withSeed: Boolean(body.withSeed)
        }),
        commands: setupCommands(id, {
          android: known ? gamePlatforms(known).android : true,
          login: known ? known.capabilities.login !== false : true,
          origin: url.origin
        })
      })
    }

    // -----------------------------------------------------------
    // sql.settings — the current overrides, as portable SQL
    //
    // "As they stand right now" has to be true of every line, or
    // the block is worse than nothing: somebody reading it to
    // answer "what is actually stored?" gets an answer that looks
    // authoritative and is partly invented. Two things used to be
    // invented — updated_at was Date.now() rather than the row's
    // own timestamp, and a column the database does not have was
    // indistinguishable from a column that is simply NULL.
    // -----------------------------------------------------------
    case 'sql.settings': {
      if (!game) return unknownGame()

      const database = db(env)
      const [raw, schema, productRows] = database
        ? await Promise.all([
            readSettings(database, game.id),
            settingsSchemaReport(database),
            readProductOverrides(database, game.id)
          ])
        : [null, { readable: false, present: [], missing: [], migrations: [] }, {}]

      const missing = (schema.missing || []).map(column => column.name)

      return createJsonResponse({
        ok: true,
        exists: Boolean(raw),
        settings: settingsSeedSql(game.id, raw || {}, { missingColumns: missing, exists: Boolean(raw) }),
        products: productSeedSql(game.id, effectiveProducts(game), productRows),
        purge: purgeSeedSql(game.id),
        repair: schemaRepairSql(schema),
        schema: {
          readable: schema.readable,
          present: schema.present,
          missing: schema.missing,
          migrations: schema.migrations
        },
        // The row exactly as SELECT * returns it, so the tab can
        // show the stored truth beside the SQL it generated from
        // it and the two can be compared by eye.
        row: raw || null
      })
    }

    // -----------------------------------------------------------
    // schema.get / schema.repair
    //
    // The panel writes to game_settings, and game_settings has
    // grown a column at a time across five migrations. Until now
    // nothing on this deployment could answer "which of them has
    // this database actually run?" — the only way to find out was
    // to fill a screen in, save it, and see what came back.
    // -----------------------------------------------------------
    case 'schema.get': {
      const { database, refusal: noDb } = needDatabase(env)
      if (noDb) return noDb

      invalidateSchemaCache()
      const schema = await settingsSchemaReport(database)

      // The two other tables the panel writes. Neither has grown a
      // column, so they are either there or they are not — which
      // is still worth saying, because "the versions list is empty"
      // and "there is no game_versions table" look identical from
      // the outside.
      const [products, versions] = await Promise.all([
        tableColumns(database, 'game_product_overrides'),
        tableColumns(database, 'game_versions')
      ])

      // And the game's own database, which is a different D1
      // entirely and the one that holds the players.
      const playersDb = game ? playerDb(env, game) : null
      const players = playersDb ? await tableColumns(playersDb, 'players') : new Set()

      return createJsonResponse({
        ok: true,
        gameId: game ? game.id : '',
        licence: {
          binding: 'LICENSE_DB',
          settings: {
            table: 'game_settings',
            readable: schema.readable,
            present: schema.present,
            missing: schema.missing,
            migrations: schema.migrations,
            landingColumns: LANDING_COLUMNS
          },
          productOverrides: { table: 'game_product_overrides', present: [...products] },
          versions: { table: 'game_versions', present: [...versions] }
        },
        player: game
          ? {
              binding: game.d1Binding || '',
              bound: Boolean(playersDb),
              table: 'players',
              present: [...players],
              moderation: players.has('banned_at'),
              document: players.has('data_json'),
              leaderboardOptOut: players.has(LEADERBOARD_OPT_OUT_COLUMN),

              // 0012. Reported for every game, not only the ones
              // that declare a board level, because this card
              // answers "what is in this table?" and the answer
              // does not depend on what Config.js asks for.
              level: players.has(LEVEL_COLUMN),
              selectedItem: players.has(SELECTED_ITEM_COLUMN)
            }
          : null,
        repair: schemaRepairSql(schema)
      })
    }

    case 'schema.repair': {
      const { database, refusal: noDb } = needDatabase(env)
      if (noDb) return noDb

      const result = await repairSettingsSchema(database)
      invalidateSettingsCache()

      logInfo('game_settings schema repaired', {
        requestId, added: result.added.length, failed: result.failed.length
      })

      const schema = await settingsSchemaReport(database)

      return createJsonResponse({
        ok: result.ok,
        reason: result.reason,
        added: result.added,
        failed: result.failed,
        schema: {
          readable: schema.readable,
          present: schema.present,
          missing: schema.missing,
          migrations: schema.migrations
        }
      })
    }

    // -----------------------------------------------------------
    // game.verify — is this game actually wired up?
    //
    // The "new game" flow ends in a deploy, and until now the only
    // way to find out whether the deploy worked was to open five
    // pages and read them. Every check below is something that is
    // either true or false right now on this deployment, phrased
    // as what to do about it when it is false.
    // -----------------------------------------------------------
    case 'game.verify': {
      if (!game) return unknownGame()

      const licence = db(env)
      const playersDb = playerDb(env, game)
      const spec = getGameEnvNames()[game.id] || { keys: {}, capabilities: game.capabilities }
      const origin = String(url.origin || '').replace(/\/+$/, '')

      const checks = []
      const add = (id, ok, label, detail, level = 'error') =>
        checks.push({ id, ok, level: ok ? 'ok' : level, label, detail })

      add('registry', true, 'In GAME_REGISTRY',
        `Config.js defines "${game.id}". This is what makes the game exist.`)

      add('licenceDb', Boolean(licence), 'LICENSE_DB bound',
        licence
          ? 'Settings, orders and entitlements have somewhere to live.'
          : 'Not bound on this deployment. Every panel save will refuse until it is in wrangler.jsonc.')

      add('playerDb', Boolean(playersDb), `Player database (${game.d1Binding || 'unset'})`,
        playersDb
          ? 'Bound, so sign-in, cloud saves and the leaderboard have a table to write to.'
          : `The binding "${game.d1Binding || 'unset'}" is not in wrangler.jsonc, or its name there does `
            + 'not match d1Binding in Config.js. Every data endpoint answers db_not_bound until it does.')

      // The players table itself, not just the binding: a database
      // that was created and never migrated is bound and empty.
      let playersTable = new Set()
      if (playersDb) playersTable = await tableColumns(playersDb, 'players')

      add('playersTable', playersTable.size > 0, 'players table',
        playersTable.size
          ? `${playersTable.size} columns.`
          : 'The database is bound but has no players table. Run the migration the SQL tab generates.',
        playersDb ? 'error' : 'warn')

      if (playersTable.size) {
        add('playersModeration', playersTable.has('banned_at'), 'Moderation columns',
          playersTable.has('banned_at')
            ? 'Bans and restrictions are enforceable.'
            : 'No banned_at column, so the ban buttons on the players tab will refuse. '
              + 'Run migrations/0006_player_moderation.sql against this game\'s database.', 'warn')

        add('playersDocument', playersTable.has('data_json'), 'Free-form save document',
          playersTable.has('data_json')
            ? 'dataPatch writes land in data_json.'
            : 'No data_json column, so a game that saves its own state has nowhere to put it. '
              + 'Run migrations/0007_player_data.sql against this game\'s database.', 'warn')

        add('playersOptOut', playersTable.has(LEADERBOARD_OPT_OUT_COLUMN), 'Leaderboard opt-out',
          playersTable.has(LEADERBOARD_OPT_OUT_COLUMN)
            ? 'Players can hide themselves from the public board.'
            : `No ${LEADERBOARD_OPT_OUT_COLUMN} column. The checkbox on the account page will not appear. `
              + 'Run migrations/0010_leaderboard_optout.sql against this game\'s database.', 'warn')

        // Only asked of a game that says its board carries these.
        // A game whose board is a name and a score is not missing
        // anything by not having them, and reporting it as a
        // warning would be a checklist item nobody can ever clear.
        const board = game.leaderboard || {}

        if (board.level) {
          add('playersLevel', playersTable.has(LEVEL_COLUMN), 'Stage / level record',
            playersTable.has(LEVEL_COLUMN)
              ? 'highLevel is recorded and shown on the board beside the score.'
              : `This game's registry entry declares a level on its board, but there is no `
                + `${LEVEL_COLUMN} column here — so the board shows scores only and a client `
                + 'sending highLevel has it dropped. Run migrations/0012_player_progress.sql '
                + 'against this game\'s database.', 'warn')
        }

        if (board.item) {
          const keys = Object.keys(board.item.options || {})
          add('playersItem', playersTable.has(SELECTED_ITEM_COLUMN), 'Equipped item',
            playersTable.has(SELECTED_ITEM_COLUMN)
              ? `Players show one of ${keys.length} item${keys.length === 1 ? '' : 's'} `
                + `beside their name (${keys.join(', ')}).`
              : `This game's registry entry declares an item on its board, but there is no `
                + `${SELECTED_ITEM_COLUMN} column here — so nothing is drawn and a client `
                + 'sending selectedItem has it dropped. Run '
                + 'migrations/0012_player_progress.sql against this game\'s database.', 'warn')
        }
      }

      if (spec.capabilities && spec.capabilities.login) {
        const hasWeb = Boolean(env && env[spec.keys.web])
        const hasSecret = Boolean(env && env[spec.keys.secret])
        add('oauthWeb', hasWeb, spec.keys.web || 'Google web client id',
          hasWeb ? 'Set.' : 'Not set. Sign-in cannot start without it.')
        add('oauthSecret', hasSecret, spec.keys.secret || 'Google client secret',
          hasSecret ? 'Set.' : 'Not set. The token exchange will fail.')
        add('oauthAndroid', Boolean(env && env[spec.keys.android]), spec.keys.android || 'Android client id',
          env && env[spec.keys.android]
            ? 'Set, so tokens minted by the APK are accepted.'
            : 'Not set. Only browser sign-in will work; an APK\'s id_token will be refused.', 'warn')
        add('redirect', true, 'Redirect URI to authorise',
          `${origin}/oauth/callback must be on the Google web client's authorised list. `
          + 'This one cannot be checked from here — the list lives on Google\'s side.', 'info')
      }

      if (gamePlatforms(game).android) {
        const scheme = (game.deepLink && game.deepLink.scheme) || ''
        add('deepLink', Boolean(scheme), 'Deep-link scheme',
          scheme
            ? `${scheme}://${(game.deepLink && game.deepLink.host) || 'oauth'} — this must match the `
              + 'intent-filter in the APK\'s AndroidManifest.xml exactly.'
            : 'Empty. A signed-in Android player has nowhere to be sent back to.')
      }

      const links = Object.keys((game.download && game.download.links) || {})
      add('download', links.length > 0, 'Download links',
        links.length
          ? `${links.join(', ')} — the button uses "${game.download.primary}".`
          : 'None. The download button will be greyed out.', 'warn')

      add('downloadable', isDownloadable(game), 'Download button live',
        isDownloadable(game)
          ? 'A visitor can get the game.'
          : 'Withdrawn — either the status is "soon", the offline switch is off, or there is no link.', 'warn')

      if (game.capabilities.store) {
        const sellable = effectiveProducts(game)
        add('products', sellable.length > 0, 'Products on sale',
          sellable.length
            ? `${sellable.length} of ${(game.store.products || []).length} in the catalogue.`
            : 'The store capability is on but nothing is for sale. Add entries to store.products in Config.js.',
          'warn')
      }

      // The landing page, judged the way a visitor would: does the
      // page say anything, from either source.
      const landing = game.landing || {}
      const hasText = map => Boolean(map && (map.fa || map.en || map.ja))
      const filled = [
        hasText(landing.tagline) && 'tagline',
        hasText(landing.about) && 'about',
        (landing.features || []).length && 'features',
        (landing.screenshots || []).length && 'screenshots',
        (landing.videos || []).length && 'videos',
        (landing.faq || []).length && 'faq',
        landing.hero && 'hero'
      ].filter(Boolean)

      add('landing', filled.length >= 3, 'Landing page has content',
        `${filled.length} of 7 sections have something in them (${filled.join(', ') || 'none'}). `
        + 'Sections come from Config.js first and the Game page tab on top of it.', 'warn')

      // Which languages have artwork of their own. Not a pass or a
      // fail - one shared gallery is the right answer for a game
      // whose art carries no words - but it is the only place an
      // operator can see at a glance that they translated the
      // Japanese screenshots and forgot the Persian ones.
      const shotLangs = LANGS.filter(code => ((landing.screenshotsByLang || {})[code] || []).length)
      const videoLangs = LANGS.filter(code => ((landing.videosByLang || {})[code] || []).length)
      if (shotLangs.length || videoLangs.length) {
        add('landingLangs', true, 'Per-language artwork',
          `${shotLangs.length ? `Screenshots written for ${shotLangs.join(', ')}. ` : ''}`
          + `${videoLangs.length ? `Videos written for ${videoLangs.join(', ')}. ` : ''}`
          + 'Every other language falls back to the shared list.', 'info')
      }

      if (game.capabilities.login) {
        const disclosure = googleDisclosureFor(game, 'en')
        add('googleDisclosure', disclosure.enabled, 'Google sign-in disclosure',
          disclosure.enabled
            ? (disclosure.custom
                ? 'On, with text written in the Game page tab. Check it still names every scope the game asks for.'
                : 'On, using the standard text built from this game\'s capabilities.')
            : 'Switched off in the Game page tab. This game asks for a Google sign-in and its page now '
              + 'discloses nothing about it, which is what an OAuth review looks for first.', 'warn')
      }

      const schema = licence ? await settingsSchemaReport(licence) : null
      if (schema) {
        add('settingsSchema', schema.missing.length === 0, 'game_settings is current',
          schema.missing.length
            ? `${schema.missing.length} columns missing (${schema.missing.map(c => c.name).join(', ')}). `
              + 'Press "Repair the schema" on the SQL tab.'
            : 'Every column the panel writes exists.')
      }

      const pages = [
        { label: 'Landing page', url: `${origin}/${game.id}` },
        { label: 'Versions', url: `${origin}/${game.id}/versions` },
        game.capabilities.leaderboard && { label: 'Leaderboard', url: `${origin}/${game.id}/leaderboard` },
        game.capabilities.store && { label: 'Store', url: `${origin}/${game.id}/store` },
        game.capabilities.login && { label: 'Account', url: `${origin}/${game.id}/account` },
        { label: 'Manifest (JSON)', url: `${origin}/games/${game.id}/manifest` },
        { label: 'Health', url: `${origin}/${game.id}/health` }
      ].filter(Boolean)

      const failed = checks.filter(check => !check.ok && check.level === 'error').length
      const warned = checks.filter(check => !check.ok && check.level === 'warn').length

      logInfo('Game verified', { requestId, gameId: game.id, failed, warned })

      return createJsonResponse({
        ok: true,
        gameId: game.id,
        summary: { total: checks.length, failed, warned, passed: checks.filter(c => c.ok).length },
        checks,
        pages
      })
    }

    // env — what this deployment has, and what it is missing
    //
    // Reads env and reports on it. What it reports is deliberately
    // narrow:
    //
    //   a secret          -> whether it is set, and its length
    //   a public value    -> the value
    case 'env': {
      const has = key => Boolean(key && env && env[key])
      const value = key => String((key && env && env[key]) || '')

      const secret = key => ({
        key: key || '',
        set: has(key),
        // Enough to tell "pasted with a trailing newline" from
        // "pasted correctly", which is a real failure and one
        // that is otherwise invisible.
        length: has(key) ? value(key).length : 0
      })

      const shown = key => ({
        key: key || '',
        set: has(key),
        value: value(key)
      })

      const origin = String(url.origin || '').replace(/\/+$/, '')

      const gamesEnv = Object.entries(getGameEnvNames()).map(([id, spec]) => {
        const merged = games[id]
        const stored = merged && Array.isArray(merged.overrides) && merged.overrides.includes('deepLinkScheme')

        return {
          id,
          name: (merged && merged.name) || spec.name,
          login: Boolean(spec.capabilities.login),

          // The binding is in wrangler.jsonc, not in the
          // variables screen, and the difference is worth
          // showing: a missing binding is a file to edit and a
          // deploy, not a value to paste.
          binding: { key: spec.d1Binding, set: Boolean(env && env[spec.d1Binding]), value: '' },

          web: shown(spec.keys.web),
          android: shown(spec.keys.android),
          secret: secret(spec.keys.secret),

          deepLink: {
            key: spec.keys.deepLinkScheme,
            // Where the value actually came from, which is the
            // whole point of showing it: three layers resolve
            // this and only one of them is in the variables
            // screen.
            source: stored ? 'panel' : (has(spec.keys.deepLinkScheme) ? 'env' : 'code'),
            envValue: value(spec.keys.deepLinkScheme),
            codeValue: spec.deepLinkFallback,
            effective: (merged && merged.deepLink && merged.deepLink.scheme) || spec.deepLinkFallback,
            host: (merged && merged.deepLink && merged.deepLink.host) || 'oauth'
          },

          // Every hostname Google has to be told about, for THIS
          // request's origin. redirect_uri_mismatch is a check
          // that happens entirely on Google's side against a list
          // it keeps, so no amount of correct configuration here
          // can satisfy it - the only fix is adding the line.
          redirectUri: `${origin}/oauth/callback`
        }
      })

      return createJsonResponse({
        ok: true,
        origin,
        redirectUri: `${origin}/oauth/callback`,
        games: gamesEnv,
        shared: {
          panel: secret('TestSitePassword'),
          adminToken: secret('DOCSNAP_ADMIN_TOKEN'),
          stateSecret: secret('STATE_SIGNING_SECRET'),
          licenseDb: { key: 'LICENSE_DB', set: Boolean(env && env.LICENSE_DB), value: '' },
          assets: { key: 'ASSETS', set: Boolean(env && env.ASSETS), value: '' },
          payments: [secret('NOWPAYMENTS_API_KEY'), secret('NOWPAYMENTS_IPN_SECRET')],
          mail: [secret('BREVO_API_KEY'), secret('RESEND_API_KEY'), shown('DOCSNAP_MAIL_FROM')],
          licensing: [secret('DOCSNAP_LICENSE_PRIVATE_KEY'), secret('DOCSNAP_KEY_WRAP_SECRET'), secret('DOCSNAP_ORDER_SECRET')]
        }
      })
    }

    // -----------------------------------------------------------
    // scaffold — the source for a game that does not exist yet
    // -----------------------------------------------------------
    case 'scaffold': {
      const spec = body.spec || {}
      const id = slug(spec.id || '')

      if (!id) {
        return createJsonResponse({
          ok: false, error: 'bad_id',
          message: 'Give the game an id: lowercase letters, digits and hyphens.'
        }, 400)
      }
      if (games[id]) {
        return createJsonResponse({
          ok: false, error: 'exists',
          message: `"${id}" is already in GAME_REGISTRY.`
        }, 409)
      }

      const built = scaffold({ ...spec, id }, url.origin)
      logInfo('Scaffold generated', { requestId, gameId: id, platform: built.platform })

      return createJsonResponse({
        ok: true,
        names: built.names,
        platform: built.platform,
        files: built.files,
        commands: built.commands
      })
    }

    // -----------------------------------------------------------
    // unity — the whole kit for one game, in the panel's language
    //
    // The env key names are passed in rather than derived, so the
    // Google setup file prints the variables THIS deployment
    // actually reads - which for a game added before the naming
    // convention settled is not what the convention would guess.
    // -----------------------------------------------------------
    case 'unity': {
      if (!game) return unknownGame()

      const lang = LANGS.includes(String(body.lang || '')) ? String(body.lang) : 'fa'
      const spec = getGameEnvNames()[game.id]
      const modules = unityModules(game, url.origin, { envKeys: spec ? spec.keys : null })

      return createJsonResponse({
        ok: true,
        gameId: game.id,
        platform: gamePlatforms(game).kind,

        // The kit as DATA, beside the kit as text.
        //
        // For whoever - or whatever - is asking this endpoint
        // rather than reading the panel. Every module below is a
        // finished client for one part of this Worker's API, with
        // this game's ids and URLs already in it, and the failure
        // this answers is an assistant inferring the request
        // shapes from the routing table and writing its own. The
        // index says what already exists, so "is there code for
        // this?" has an answer that does not require reading
        // twelve files.
        index: unityKitIndex(game, url.origin, { envKeys: spec ? spec.keys : null }),
        usage: 'Every entry in `index` is finished, generated code for this exact game. Use it '
             + 'verbatim rather than writing a client from the route list, and say which modules '
             + 'you are using. The `notes` on each module document the behaviours that are not '
             + 'guessable from the endpoint shapes.',

        modules: modules.map(module => ({
          id: module.id,
          file: module.file,
          icon: module.icon,
          title: module.title[lang] || module.title.en,
          summary: module.summary[lang] || module.summary.en,
          notes: module.notes[lang] || module.notes.en,
          code: module.code
        }))
      })
    }

    default:
      return createJsonResponse({
        ok: false, error: 'bad_action',
        message: 'action must be one of: overview, game.get, game.save, game.reset, game.purge, '
               + 'game.verify, landing.get, landing.save, version.save, version.delete, '
               + 'product.save, product.reset, orders.list, order.grant, players.search, '
               + 'player.get, player.grant, player.revoke, players.list, player.profile, '
               + 'player.moderate, player.rename, player.delete, sql.game, sql.settings, '
               + 'schema.get, schema.repair, env, scaffold, unity.'
      }, 400)
  }
}
