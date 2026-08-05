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
  if (data.totalPlayTime !== undefined) push('total_play_time', data.totalPlayTime)
  if (includeGamesPlayed && data.gamesPlayed !== undefined) push('games_played', data.gamesPlayed)

  return { updates, values }
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
