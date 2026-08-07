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
import { logWarning } from '../Core/Logging.js'
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
    gamesPlayed: player.games_played,
    totalPlayTime: player.total_play_time,
    selectedColor: player.selected_color,
    purchasedColors: JSON.parse(player.purchased_colors || '["FFFFFF"]'),
    purchasedItems: JSON.parse(player.purchased_items || '{}'),
    createdAt: player.created_at,
    lastLogin: player.last_login,

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

  if (includeGamesPlayed && data.gamesPlayed !== undefined) {
    updates.push('games_played = MAX(COALESCE(games_played, 0), ?)')
    values.push(data.gamesPlayed)
  }

  return { updates, values }
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
// What that looked like to somebody who visited the site before
// they had played:
//
//   - the stats block and the whole profile form are rendered
//     `record ? ... : ''`, so both simply were not on the page.
//     There was no way to set a username or an avatar at all.
//   - a save that did reach the server UPDATEd nothing and said
//     it had worked, because setUsername() never looked at how
//     many rows changed.
//   - and then playing the game created the row for real, with
//     a null username, quietly discarding whatever they thought
//     they had set.
//
// So it lives here, next to everything else that knows the shape
// of this table, and both sign-ins call it.
//
// INSERT OR IGNORE, so two first requests racing each other
// produce one row rather than an error - and so an id that
// already belongs to somebody else is left exactly as it is. The
// collision guard in Core/PlayerIdentity.js is what refuses that
// case, and it can only do its job on a row this has not
// overwritten.
//
// `username` is deliberately left null. The column takes 3 to 12
// English letters and digits and nothing else, which a Google
// account name is under no obligation to be; the player chooses
// one on the site, and until then the game shows their account
// name instead.
// ==========================================
export async function ensurePlayerRow(db, playerId, identity) {
  if (!db || !playerId || !identity || !identity.email) return

  try {
    const now = Date.now()

    await db.prepare(
      `INSERT OR IGNORE INTO players (player_id, email, profile_pic_url, created_at, last_login)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(playerId, identity.email, identity.picture || null, now, now).run()

    // ==========================================
    // The picture, for a row that already existed.
    //
    // INSERT OR IGNORE fills profile_pic_url in exactly once -
    // the moment the row is created. A player whose row was made
    // before Google's picture was being read, or made by a path
    // that had no identity to hand, therefore had no picture and
    // no way of ever getting one: the game asked for the profile,
    // the profile came back with photoURL empty, and the avatar
    // stayed on its placeholder for good.
    //
    // Only when the column is empty. A picture the player chose
    // on the site is theirs, and having Google overwrite it on
    // every sign-in would be a worse bug than the one this fixes.
    // ==========================================
    if (identity.picture) {
      await db.prepare(
        `UPDATE players
            SET profile_pic_url = ?, last_login = ?
          WHERE player_id = ?
            AND email = ?
            AND (profile_pic_url IS NULL OR profile_pic_url = '')`
      ).bind(identity.picture, now, playerId, identity.email).run()
    }
  } catch {
    // Not fatal on its own. Whatever the caller was doing is about to
    // read or write the same row and will report the failure itself,
    // with the status that actually describes it.
  }
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
