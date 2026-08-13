// ==========================================
// Games/PlayerRecord.js
// The players table: how a row is read, how it is written, and
// which writes are refused.
//
// Every data-API path goes through here, so the username rules,
// the JSON document merge and the moderation checks exist once
// rather than at each call site.
// ==========================================

import { createJsonResponse } from '../Core/Http.js'
import { logInfo, logWarning } from '../Core/Logging.js'
import { playerIdFromEmail } from '../Core/PlayerIdentity.js'

/**
 * Re-exported from Core/PlayerIdentity.js rather than written out
 * again here.
 *
 * The rule is load-bearing: an entitlement granted on the site is
 * looked up by the game against the player row it already has, so
 * two derivations would mean a player who bought something the
 * game cannot find. This file and Games/Session.js each used to
 * carry their own copy with a comment asking whoever edited one to
 * remember the other. There is one copy now.
 */
export { playerIdFromEmail }


// ==========================================
// The leaderboard opt-out
//
// One column, one meaning: 1 means this player is not on the
// public board at all.
//
// Not "shown anonymously", not "shown without a picture" - not
// there. The row is excluded from every board query, from the
// count above it and from the JSON the game client reads, so
// there is no rank with a gap in it and nothing for anybody to
// infer a hidden player from. A player who asks to be off a
// public list has not asked to be an asterisk on it.
//
// It changes nothing else. The score keeps being recorded, the
// account page keeps showing it, entitlements and purchases are
// untouched, and turning the switch back on puts the player
// straight back at whatever rank their score earns. This is a
// visibility decision, not a deletion.
//
// The column is nullable with no default so that adding it to a
// live table is a metadata-only change, and every read below
// treats NULL and 0 identically: listed. Opting out has to be an
// act.
// ==========================================
export const LEADERBOARD_OPT_OUT_COLUMN = 'leaderboard_opt_out'

/**
 * Whether this game's players table can hold the opt-out.
 *
 * Probed rather than assumed, exactly as hasModerationColumns()
 * is, and for the same reason: a game whose database predates the
 * migration must keep working - it simply has no player who can
 * hide, which is the behaviour it had before the feature existed.
 */
export async function hasLeaderboardOptOut(db) {
  if (!db) return false
  try {
    await db.prepare(`SELECT ${LEADERBOARD_OPT_OUT_COLUMN} FROM players LIMIT 1`).first()
    return true
  } catch {
    return false
  }
}

/**
 * The WHERE fragment that keeps opted-out players off a board,
 * or '' when this database has no such column.
 *
 * Returned as text rather than applied here because the three
 * board queries in this codebase are each shaped differently and
 * all three have to agree about who is on the list. A shared
 * fragment is the cheapest way to make disagreement impossible.
 */
export function optOutClause(supported) {
  return supported ? `(${LEADERBOARD_OPT_OUT_COLUMN} IS NULL OR ${LEADERBOARD_OPT_OUT_COLUMN} = 0)` : ''
}


/**
 * Who belongs on a public board, as SQL conditions.
 *
 * Three queries answer "who is on the leaderboard" - the page in
 * Pages/Leaderboard.js, the count above it, and the JSON the game
 * client reads from Api/PlayerDataApi.js - and they have to agree
 * exactly. They did not: the page filtered on high_score > 0 and
 * the game's copy did not, for long enough that the two boards
 * visibly disagreed about who was on them.
 *
 * So the rule is written once. Both optional columns are probed
 * rather than assumed, and a database that has neither gets the
 * same board it had before either existed.
 */
export async function boardFilter(db) {
  const [moderated, optOut] = await Promise.all([
    hasModerationColumns(db),
    hasLeaderboardOptOut(db)
  ])

  const conditions = ['high_score > 0']
  if (moderated) conditions.push('banned_at IS NULL')
  if (optOut) conditions.push(optOutClause(true))

  return { conditions, where: conditions.join(' AND '), moderated, optOut }
}


// ==========================================
// The two columns a board may carry BESIDES the score
//
// Both belong to a game rather than to this file: whether they
// mean anything is declared in GAME_REGISTRY (see buildBoard in
// Config.js), and whether they exist is a property of that
// game's own D1. Neither is assumed anywhere.
//
//   high_level     the furthest stage reached. Monotonic, like
//                  high_score, for the same reason: the client
//                  sends its own running record read out of a
//                  save file, so a plain assignment lets a fresh
//                  install erase what the server already knew.
//
//   selected_item  which single thing the player has equipped.
//                  A product id from the game's catalogue, so
//                  the thing somebody paid for and the thing the
//                  board draws are one string.
//
// A game that declares neither is unaffected by every line
// below, and a game that declares one against a database that
// has not been migrated for it loses that half of the row rather
// than the whole board.
// ==========================================
export const LEVEL_COLUMN = 'high_level'
export const SELECTED_ITEM_COLUMN = 'selected_item'

/**
 * Whether this players table has a given column.
 *
 * The same probe hasLeaderboardOptOut() makes, parameterised.
 * SELECT ... LIMIT 1 rather than PRAGMA table_info because it
 * answers the question a query is actually about - "will naming
 * this column fail?" - on an empty table as well as a full one.
 *
 * The name is interpolated, so it must never come from a
 * request. Every caller passes one of the constants above.
 */
export async function hasPlayerColumn(db, column) {
  if (!db) return false
  try {
    await db.prepare(`SELECT ${column} FROM players LIMIT 1`).first()
    return true
  } catch {
    return false
  }
}

/**
 * Which of the optional board columns this game WANTS and this
 * database HAS, plus the SQL fragments that follow from it.
 *
 * Wanting without having is the interesting case and it is
 * deliberately silent: the column is dropped from the SELECT and
 * from the ORDER BY, the page renders the half it can, and
 * /thegod's health check is where somebody is told to run the
 * migration. A board that 500s because a game was configured
 * before its database was migrated is the wrong trade - the
 * scores are still correct and still worth showing.
 */
export async function boardExtras(db, board) {
  const wantsLevel = Boolean(board && board.level)
  const wantsItem = Boolean(board && board.item)

  const [level, item] = await Promise.all([
    wantsLevel ? hasPlayerColumn(db, LEVEL_COLUMN) : Promise.resolve(false),
    wantsItem ? hasPlayerColumn(db, SELECTED_ITEM_COLUMN) : Promise.resolve(false)
  ])

  const select = [
    level ? `, ${LEVEL_COLUMN} AS highLevel` : '',
    item ? `, ${SELECTED_ITEM_COLUMN} AS selectedItem` : ''
  ].join('')

  return {
    // What the game asked for.
    wantsLevel,
    wantsItem,
    // What it actually got.
    level,
    item,
    select,
    // The stage is the tie-break the score leaves open: two
    // players on the same points are not equal, one of them got
    // further. Only added when the column is there, so the
    // ordering of a board without it is exactly what it was.
    order: level ? `high_score DESC, ${LEVEL_COLUMN} DESC` : 'high_score DESC'
  }
}


/**
 * Which item key to draw for one row.
 *
 * A stored value that is not in the game's option list - a
 * renamed knife, an old build, a client sending whatever it
 * likes - falls back to the declared default rather than to
 * nothing. An empty slot on a board row reads as a missing
 * image; the free item reads as a player who has not bought one,
 * which is the true statement in every case that gets here.
 */
function itemKey(item, stored) {
  const key = String(stored || '').trim()
  if (key && item.options[key]) return key
  return item.default || ''
}


// ==========================================
// readBoard
// THE board query. One copy, two callers.
//
// Pages/Leaderboard.js renders it and Api/PlayerDataApi.js hands
// it to the game client, and CLAUDE.md's rule is that those two
// can never disagree about who is on the list or what a row
// says. They each used to build their own SELECT, which is how
// they disagreed the first time; the WHERE clause was pulled out
// into boardFilter() then, and the rest of the query follows it
// here now that a row is more than a name and a number.
//
// `board` is the normalised block from GAME_REGISTRY. A game
// without one gets exactly the four columns every board has
// always returned, in exactly the same order.
// ==========================================
export async function readBoard(db, { board = null, limit = 100, withTotal = false } = {}) {
  const filter = await boardFilter(db)
  const extras = await boardExtras(db, board)

  const { results } = await db.prepare(`
    SELECT username AS displayName, high_score AS highScore,
           profile_pic_url AS photoURL, selected_color AS selectedColor${extras.select}
    FROM players
    WHERE ${filter.where}
    ORDER BY ${extras.order}
    LIMIT ?
  `).bind(limit).all()

  const rows = (results || []).map((row, index) => {
    const out = {
      rank: index + 1,
      username: row.displayName || 'Unknown User',
      displayName: row.displayName || 'Unknown User',
      highScore: row.highScore || 0,
      photoURL: row.photoURL || '',
      selectedColor: row.selectedColor || 'FFFFFF'
    }

    // Present when the GAME declares the field, not when the
    // database happens to have the column. A client reading this
    // should see a stable shape per game: 0 for a level nobody
    // has recorded and the default item for a player who has
    // never chosen are both true answers, and an absent key is
    // not.
    if (board && board.level) out.highLevel = Number(row.highLevel) || 0
    if (board && board.item) out.selectedItem = itemKey(board.item, row.selectedItem)

    return out
  })

  let total = rows.length
  if (withTotal) {
    total = await db.prepare(`SELECT COUNT(*) AS total FROM players WHERE ${filter.where}`)
      .first()
      .then(row => Number(row && row.total) || 0)
      .catch(() => rows.length)
  }

  return { rows, total, filter, extras }
}


// ==========================================
// Username policy
// Length and character rules plus a blocklist. Messages come back
// in all three UI languages so a client can show one without a
// round trip.
// ==========================================
const USERNAME_BLOCKLIST = [
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'cunt',
  'pussy', 'slut', 'whore', 'faggot', 'nigger', 'nigga',
  'retard', 'kike', 'porn'
]

function refusal(code, fa, en, ja) {
  return { errorCode: code, messagePersian: fa, messageEnglish: en, messageJapanese: ja }
}

export function validateUsername(username) {
  if (typeof username !== 'string') {
    return refusal('username_invalid', 'نام کاربری نامعتبر است', 'Invalid username', 'ユーザー名が無効です')
  }

  if (username.length < 3 || username.length > 12) {
    return refusal(
      'username_too_long',
      'نام کاربری باید بین ۳ تا ۱۲ حرف باشد',
      'Username must be between 3 and 12 characters',
      'ユーザー名は3〜12文字にしてください'
    )
  }

  if (!/^[A-Za-z0-9]+$/.test(username)) {
    if (/\s/.test(username)) {
      return refusal(
        'username_has_space',
        'از فاصله یا نماد‌ها نمی‌توان استفاده کرد',
        'Spaces or symbols are not allowed',
        'スペースや記号は使用できません'
      )
    }
    return refusal(
      'username_invalid_chars',
      'فقط از حروف و اعداد انگلیسی استفاده شود',
      'Only English letters and numbers are allowed',
      '英数字のみ使用できます'
    )
  }

  const lower = username.toLowerCase()
  if (USERNAME_BLOCKLIST.some(word => lower.includes(word))) {
    return refusal(
      'username_profanity',
      'استفاده از الفاظ نامناسب مجاز نیست',
      'Inappropriate language is not allowed',
      '不適切な表現は使用できません'
    )
  }

  return null
}

/**
 * Validates the fields that have constraints. Returns an error
 * object to send back, or null when the payload is acceptable.
 */
export function validateProfileFields(data) {
  if (data.username === undefined) return null

  const error = validateUsername(data.username)
  if (!error) return null

  return {
    error: error.errorCode,
    messagePersian: error.messagePersian,
    messageEnglish: error.messageEnglish,
    messageJapanese: error.messageJapanese
  }
}


// ==========================================
// Reading a row
// ==========================================

/**
 * A stored JSON object, or {}. Never throws: one unparseable value
 * written months ago should not fail the read path for a player
 * who has been fine ever since.
 */
function safeJson(raw) {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

/** The API shape of a players row. */
export function mapPlayer(player) {
  return {
    uid: player.player_id,
    email: player.email,
    username: player.username,
    displayName: player.username,
    photoURL: player.profile_pic_url,
    highScore: player.high_score,

    // The furthest stage reached, for a game that has stages.
    // Reads as 0 on a database with no such column, which is the
    // same answer a player who has never finished one gives - so
    // a client never has to know which of the two it is looking
    // at.
    highLevel: Number(player[LEVEL_COLUMN]) || 0,

    gamesPlayed: player.games_played,
    totalPlayTime: player.total_play_time,
    selectedColor: player.selected_color,

    // Which single item is equipped, as a catalogue product id.
    // Empty means "the game's default" - the registry names it,
    // not this column, so nothing has to be backfilled when a
    // free item is renamed.
    selectedItem: player[SELECTED_ITEM_COLUMN] || '',
    purchasedColors: JSON.parse(player.purchased_colors || '["FFFFFF"]'),
    purchasedItems: JSON.parse(player.purchased_items || '{}'),
    createdAt: player.created_at,
    lastLogin: player.last_login,

    // Whether this player has taken themselves off the public
    // board. Reads as false on a database that has not run 0010,
    // which is the behaviour that database already had.
    //
    // Sent to the game client as well as to the site so that a
    // build can show the switch in its own settings screen and
    // have it agree with the website.
    leaderboardOptOut: Number(player[LEADERBOARD_OPT_OUT_COLUMN]) === 1,

    // Whatever this particular game decided to save. The Worker
    // stores it, merges it and has no opinion about its contents,
    // so a game that wants to keep an inventory adds a key here
    // instead of a column, a mapping and a C# field.
    //
    // Absent on a database that has not run 0007, which reads as
    // an empty object and behaves exactly as before.
    data: safeJson(player.data_json)
  }
}

/**
 * One player's stored document, for a merge. Returns {} on any
 * failure, including a database that has not run 0007 - so a
 * dataPatch against an un-migrated game writes a fresh object
 * instead of failing the whole save.
 */
export async function readPlayerData(db, playerId) {
  try {
    const row = await db.prepare('SELECT data_json FROM players WHERE player_id = ? LIMIT 1')
      .bind(playerId).first()
    return safeJson(row && row.data_json)
  } catch {
    return {}
  }
}


/**
 * Column and value lists for an UPDATE built from a profile payload.
 *
 * `data` replaces the document; `dataPatch` merges into it. Two
 * verbs because they are not the same decision: a game syncing its
 * whole save wants replace, a game bumping one counter wants merge,
 * and doing the second with the first is how a client with stale
 * state silently deletes keys it did not know about.
 *
 * The merge is shallow on purpose - a deep merge has no obvious
 * answer for arrays, and an inventory is usually an array.
 */
export function buildProfileUpdate(data, includeGamesPlayed = false, currentData = null) {
  const updates = []
  const values = []
  const push = (column, value) => { updates.push(`${column} = ?`); values.push(value) }

  if (data.data !== undefined && data.data && typeof data.data === 'object') {
    push('data_json', JSON.stringify(data.data))
  } else if (data.dataPatch !== undefined && data.dataPatch && typeof data.dataPatch === 'object') {
    push('data_json', JSON.stringify({ ...(currentData || {}), ...data.dataPatch }))
  }

  if (data.username !== undefined) push('username', data.username)
  if (data.selectedColor !== undefined) push('selected_color', data.selectedColor)

  // ==========================================
  // Which item the player is holding.
  //
  // A plain assignment, unlike the counters below, because
  // equipping is a choice and a choice goes both ways: somebody
  // who buys the golden knife and then puts the free one back is
  // not regressing, they changed their mind.
  //
  // AN EMPTY STRING IS IGNORED, and that is not tidiness - it is
  // the one thing standing between this column and Unity's
  // JsonUtility. JsonUtility.ToJson serialises every field of a
  // class, including the ones the caller never set, so a patch
  // built to change only the username arrives here carrying
  // "selectedItem":"". Written literally, that unequips the
  // player every time they rename themselves.
  //
  // Nothing is lost by refusing it: empty already means "the
  // game's default" on read, the column starts NULL, and a
  // player who wants the free item back sends its id like any
  // other. There is deliberately no way for a client to blank
  // this column.
  //
  // Not validated against the catalogue on purpose. The board
  // resolves an unknown key to the game's default when it draws
  // (itemKey above), so a build shipping an id nobody here has
  // heard of costs that player their picture and nothing else -
  // a better failure than a save that refuses because the client
  // is one version ahead of the registry.
  // ==========================================
  if (data.selectedItem !== undefined) {
    const chosen = String(data.selectedItem || '').trim().slice(0, 60)
    if (chosen) push(SELECTED_ITEM_COLUMN, chosen)
  }

  // The board opt-out, writable by the game as well as by the
  // site. A player who turns it off inside the game should not
  // have to open a browser to have it take effect, and the site's
  // checkbox and the game's switch are then the same setting
  // rather than two that can disagree.
  //
  // Written as a hard 1 or 0 rather than the value that arrived,
  // because "true", 1 and "yes" all reach this line from clients
  // nobody here wrote.
  if (data.leaderboardOptOut !== undefined) {
    const hide = data.leaderboardOptOut === true
      || data.leaderboardOptOut === 1
      || data.leaderboardOptOut === '1'
      || String(data.leaderboardOptOut).toLowerCase() === 'true'
    push(LEADERBOARD_OPT_OUT_COLUMN, hide ? 1 : 0)
  }

  if (data.purchasedColors !== undefined) push('purchased_colors', JSON.stringify(data.purchasedColors))
  if (data.purchasedItems !== undefined) push('purchased_items', JSON.stringify(data.purchasedItems))

  // ==========================================
  // Lifetime counters only ever go UP.
  //
  // These two used to be plain assignments, and the game
  // sends its own running totals - read out of the
  // device's save file - rather than a delta. So the
  // first sync from a device that had not played much
  // REPLACED the server's totals with the smaller local
  // ones, and a player's history was gone.
  //
  // It looked intermittent, which is what made it hard
  // to place: it only happens on the first sync after a
  // fresh install or a cleared save, because after that
  // the local total is already the larger of the two and
  // an assignment and a maximum are the same thing.
  //
  // A total that has been played cannot become unplayed,
  // so the column is the maximum of what it held and
  // what arrived. That makes the reset impossible from
  // any client, including old builds and ones nobody
  // here wrote.
  // ==========================================
  if (data.totalPlayTime !== undefined) {
    updates.push('total_play_time = MAX(COALESCE(total_play_time, 0), ?)')
    values.push(data.totalPlayTime)
  }

  // The furthest stage reached, written the same way and for the
  // same reason.
  //
  // This is a RECORD, not a position: a player currently on
  // stage 3 of a fresh run has still reached stage 90, and a
  // client that sends "where I am now" instead of "the best I
  // have done" must not be able to take the record down with it.
  // high_score is protected by its own write path refusing a
  // lower number; this column has no separate endpoint, so the
  // MAX is what protects it.
  //
  // An operator lowering somebody's record is not something any
  // client can ask for, and there is no path here that offers
  // it - by design, exactly as with high_score.
  if (data.highLevel !== undefined) {
    const level = Math.max(0, Math.floor(Number(data.highLevel) || 0))
    updates.push(`${LEVEL_COLUMN} = MAX(COALESCE(${LEVEL_COLUMN}, 0), ?)`)
    values.push(level)
  }

  if (includeGamesPlayed && data.gamesPlayed !== undefined) {
    updates.push('games_played = MAX(COALESCE(games_played, 0), ?)')
    values.push(data.gamesPlayed)
  }

  return { updates, values }
}


// ==========================================
// A username that satisfies a NOT NULL column
//
// The live neon-katana database declares
//
//   username TEXT NOT NULL UNIQUE
//
// while migrations/neon-katana.sql and the panel's builder in
// Games/Sql.js both declare it nullable. The live table predates
// both files, and nothing reconciled them - so the INSERT below,
// which named no username at all, violated NOT NULL on the only
// database that matters. INSERT OR IGNORE does not raise that: it
// skips the row. Silently. No exception for the try/catch to
// catch, no error in the log, and no player row - which is why a
// new account could sign in perfectly, score, and exist nowhere
// on the server.
//
// So a name is always supplied now, and it satisfies
// validateUsername() so the player can keep it: 3 to 12 English
// letters and digits, nothing on the blocklist.
//
// NOT from the address. The player id is the local part of an
// email and this column is printed on a public leaderboard; the
// rest of this codebase refuses that trade deliberately, and so
// does this. The Google account's own name if it can be made to
// fit, and an anonymous "Player…" if it cannot.
// ==========================================
const USERNAME_MAX = 12
const USERNAME_MIN = 3

function sanitizeUsername(name) {
  const stripped = String(name || '').replace(/[^A-Za-z0-9]/g, '').slice(0, USERNAME_MAX)
  if (stripped.length < USERNAME_MIN) return null

  return validateUsername(stripped) ? null : stripped
}

async function usernameIsFree(db, candidate) {
  try {
    const taken = await db.prepare('SELECT 1 FROM players WHERE LOWER(username) = LOWER(?) LIMIT 1')
      .bind(candidate).first()
    return !taken
  } catch {
    // A table with no username column at all answers this way. Nothing
    // is taken on a column that does not exist.
    return true
  }
}

/**
 * A free username for a brand new row: the Google account's name if
 * it can be made to fit, otherwise an anonymous one. Never null, so
 * a NOT NULL column is always satisfied.
 */
async function pickUsername(db, identity) {
  const fromGoogle = sanitizeUsername(identity && identity.name)
  if (fromGoogle && await usernameIsFree(db, fromGoogle)) return fromGoogle

  // Numbered rather than random so two players signing in at the same
  // moment do not collide any more often than they have to, and short
  // enough to stay inside twelve characters.
  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = `Player${Math.floor(Math.random() * 900000) + 100000}`
    if (await usernameIsFree(db, candidate)) return candidate
  }

  return `P${Date.now().toString(36).slice(-11)}`
}


// ==========================================
// ensurePlayerRow
// Creates the caller's own row the first time they are seen.
//
// The schema says "the row is created at first sign-in", and for
// a long time only ONE of the two sign-ins created it: the game
// client's, on its way through Api/PlayerDataApi.js. The website
// signed a player in, minted them a week-long session, welcomed
// them by name - and left the players table untouched.
//
// It is called from both now, and it no longer fails in silence.
// The old version was INSERT OR IGNORE and a try/catch around it,
// which is two separate ways of discarding the reason a row was
// not created - and it did not create one, on the live database,
// for anybody. Every failure is logged now, and the caller is
// told, because "the player does not exist" is the wrong answer
// to give a player who does.
// ==========================================
export async function ensurePlayerRow(db, playerId, identity) {
  if (!db || !playerId || !identity || !identity.email) return false

  const now = Date.now()

  let existing
  try {
    existing = await db.prepare('SELECT player_id, profile_pic_url FROM players WHERE player_id = ? LIMIT 1')
      .bind(playerId).first()
  } catch (error) {
    logWarning('Could not look for a player row', { playerId, error: error.message })
    return false
  }

  if (!existing) {
    // Empty string, never null: profile_pic_url is NOT NULL on the live
    // table, and an explicit null violates that even though the column
    // has a default - a default only applies to a column left out.
    const picture = String((identity && identity.picture) || '')
    const username = await pickUsername(db, identity)

    try {
      await db.prepare(
        `INSERT INTO players (player_id, email, username, profile_pic_url, created_at, last_login)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(playerId, identity.email, username, picture, now, now).run()

      logInfo('Player row created', { playerId })
      return true
    } catch (error) {
      // Two first requests racing each other is the ordinary case, and
      // the loser has nothing to report: the row it wanted is there.
      if (/UNIQUE|constraint failed/i.test(String(error && error.message))) return true

      logWarning('Could not create a player row', { playerId, error: error.message })
      return false
    }
  }

  // ==========================================
  // The picture, for a row that already existed.
  //
  // A player whose row was made before Google's picture was being
  // read, or made by a path that had no identity to hand, had no
  // picture and no way of ever getting one: the game asked for the
  // profile, the profile came back with photoURL empty, and the
  // avatar stayed on its placeholder for good.
  //
  // Only when the column is empty. A picture the player chose on the
  // site is theirs, and having Google overwrite it on every sign-in
  // would be a worse bug than the one this fixes.
  // ==========================================
  if (identity.picture) {
    try {
      await db.prepare(
        `UPDATE players
            SET profile_pic_url = ?, last_login = ?
          WHERE player_id = ?
            AND email = ?
            AND (profile_pic_url IS NULL OR profile_pic_url = '')`
      ).bind(identity.picture, now, playerId, identity.email).run()
    } catch (error) {
      logWarning('Could not backfill a profile picture', { playerId, error: error.message })
    }
  }

  return true
}


// ==========================================
// Moderation, enforced
//
// A ban that only shows in the panel is a note, not a ban. Every
// write path asks refuseIfBanned() before it changes anything and
// the leaderboard queries exclude banned rows.
// ==========================================
export async function hasModerationColumns(db) {
  try {
    await db.prepare('SELECT banned_at FROM players LIMIT 1').first()
    return true
  } catch {
    return false
  }
}

/**
 * A refusal Response when the player is banned or still
 * restricted, and null when they may proceed.
 */
export async function refuseIfBanned(db, playerId, requestId) {
  let row
  try {
    row = await db.prepare('SELECT banned_at, restricted_until FROM players WHERE player_id = ? LIMIT 1')
      .bind(playerId).first()
  } catch {
    return null
  }
  if (!row) return null

  const banned = Boolean(row.banned_at)
  const restricted = row.restricted_until && Number(row.restricted_until) > Date.now()
  if (!banned && !restricted) return null

  logWarning('Refused a write for a moderated player', { requestId, playerId, banned, restricted })

  // Deliberately vague. A refusal that named the rule and the
  // expiry is a description of the detection handed to the person
  // working around it.
  return createJsonResponse({
    error: 'account_restricted',
    message: 'This account cannot submit data at the moment.',
    requestId
  }, 403)
}
