// ==========================================
// Api/PlayerDataApi.js
// The per-game data surface a shipped build talks to.
//
//   GET        /database/get/...     leaderboards are public, rows are not
//   POST | PUT /database/set/...     write, owner only
//   PATCH|POST /database/patch/...   partial write, owner only
//
// Ownership is derived from the verified id_token, never from the
// path: a caller may only touch the player id their own token
// resolves to.
// ==========================================

import { validateGameId } from '../Config.js'
import { createJsonResponse } from '../Core/Http.js'
import { logInfo, logError } from '../Core/Logging.js'
import { fetchTokenInfo } from '../Core/GoogleOAuth.js'
import {
  mapPlayer,
  playerIdFromEmail,
  readPlayerData,
  buildProfileUpdate,
  validateProfileFields,
  hasModerationColumns,
  refuseIfBanned
} from '../Games/PlayerRecord.js'

const PUBLIC_READ_PATHS = ['topScores', 'globalTopScores', 'leaderboard']

function bearerToken(request) {
  return request.headers.get('Authorization')?.replace('Bearer ', '')
}

function database(env, game, requestId) {
  const db = env[game.d1Binding]
  if (db) return { db }
  return {
    refusal: createJsonResponse({
      error: 'db_not_bound',
      message: `D1 binding "${game.d1Binding}" not found`,
      requestId
    }, 500)
  }
}

/**
 * Resolves the caller and checks they own the record the path
 * names. Returns { playerId } or a refusal Response.
 */
async function authorizeOwner(request, dbPath, requestId) {
  const token = bearerToken(request)
  if (!token) {
    return { refusal: createJsonResponse({ error: 'unauthorized', message: 'Authorization token required', requestId }, 401) }
  }

  const tokenInfo = await fetchTokenInfo(token)
  if (!tokenInfo) {
    return { refusal: createJsonResponse({ error: 'invalid_token', message: 'Token is invalid or expired', requestId }, 401) }
  }

  const tokenPlayerId = playerIdFromEmail(tokenInfo.email)
  const ownerMatch = dbPath.match(/^games\/[^/]+\/users\/([^/]+)/)
  if (ownerMatch && ownerMatch[1] !== tokenPlayerId) {
    return { refusal: createJsonResponse({ error: 'forbidden', message: 'You can only modify your own data', requestId }, 403) }
  }

  return { tokenPlayerId, ownerMatch }
}

function parseJsonBody(body, requestId) {
  try {
    return { data: JSON.parse(body) }
  } catch {
    return { refusal: createJsonResponse({ error: 'invalid_json', message: 'Body must be valid JSON', requestId }, 400) }
  }
}

function unknownPath(requestId) {
  return createJsonResponse({ error: 'unknown_path', message: 'Path not supported', requestId }, 400)
}


// ==========================================
// GET /database/get/...
// ==========================================
export async function handleDatabaseGet(url, request, gameId, requestId, GAMES, env) {
  const game = validateGameId(gameId, GAMES)
  if (!game) {
    return createJsonResponse({ error: 'invalid_game', message: 'Database not configured for this game', requestId }, 400)
  }

  const dbPath = url.pathname.replace('/database/get/', '')
  const isPublicPath = PUBLIC_READ_PATHS.some(path => dbPath.includes(path))

  if (!isPublicPath && !bearerToken(request)) {
    return createJsonResponse({ error: 'unauthorized', message: 'Authorization token required', requestId }, 401)
  }
  if (!game.d1Binding) {
    return createJsonResponse({ error: 'unsupported_game', message: 'This game does not support GET operations', requestId }, 400)
  }

  logInfo('Database GET', { requestId, gameId, public: isPublicPath })

  const { db, refusal } = database(env, game, requestId)
  if (refusal) return refusal

  try {
    const userMatch = dbPath.match(/^games\/[^/]+\/users\/([^/]+)$/)
    if (userMatch) {
      const player = await db.prepare('SELECT * FROM players WHERE player_id = ? LIMIT 1')
        .bind(userMatch[1]).first().catch(() => null)
      if (!player) {
        return createJsonResponse({ error: 'not_found', message: 'User not found', requestId }, 404)
      }
      return createJsonResponse(mapPlayer(player), 200)
    }

    const scoreMatch = dbPath.match(/^games\/[^/]+\/users\/([^/]+)\/highScore$/)
    if (scoreMatch) {
      const player = await db.prepare('SELECT high_score FROM players WHERE player_id = ? LIMIT 1')
        .bind(scoreMatch[1]).first()
      return createJsonResponse(player ? player.high_score : 0, 200)
    }

    if (dbPath.includes('leaderboard')) {
      const moderated = await hasModerationColumns(db)
      const { results } = await db.prepare(`
        SELECT username, username AS displayName, high_score AS highScore,
               profile_pic_url AS photoURL, selected_color AS selectedColor
        FROM players ${moderated ? 'WHERE banned_at IS NULL' : ''}
        ORDER BY high_score DESC LIMIT 100
      `).all()

      return createJsonResponse((results || []).map((row, index) => ({
        rank: index + 1,
        username: row.username || 'Unknown User',
        displayName: row.displayName || 'Unknown User',
        highScore: row.highScore || 0,
        photoURL: row.photoURL || '',
        selectedColor: row.selectedColor || 'FFFFFF'
      })), 200)
    }

    return unknownPath(requestId)

  } catch (error) {
    logError('Database GET error', { requestId, gameId, error: error.message })
    return createJsonResponse({ error: 'database_error', message: 'Database operation failed', requestId }, 500)
  }
}


// ==========================================
// POST | PUT /database/set/...
// Writes a high score or a profile. Only the token owner's rows.
// ==========================================
export async function handleDatabaseSet(url, request, gameId, requestId, GAMES, env) {
  const game = validateGameId(gameId, GAMES)
  if (!game) {
    return createJsonResponse({ error: 'invalid_game', message: 'Database not configured for this game', requestId }, 400)
  }

  const dbPath = url.pathname.replace('/database/set/', '')
  const auth = await authorizeOwner(request, dbPath, requestId)
  if (auth.refusal) return auth.refusal

  const body = await request.text()
  if (!game.d1Binding) {
    return createJsonResponse({ error: 'unsupported_game', message: 'This game does not support SET operations', requestId }, 400)
  }

  logInfo('Database SET', { requestId, gameId, method: request.method })

  const { db, refusal } = database(env, game, requestId)
  if (refusal) return refusal

  try {
    const highScoreMatch = dbPath.match(/^games\/([^/]+)\/users\/([^/]+)\/highScore$/)
    if (highScoreMatch) {
      return writeHighScore(db, highScoreMatch[2], body, gameId, requestId)
    }

    const userMatch = dbPath.match(/^games\/([^/]+)\/users\/([^/]+)$/)
    if (userMatch) {
      return writeProfile(db, userMatch[2], body, gameId, requestId, false)
    }

    return unknownPath(requestId)

  } catch (error) {
    logError('Database SET error', { requestId, gameId, error: error.message })
    return createJsonResponse({ error: 'database_error', message: 'Database operation failed', requestId }, 500)
  }
}


async function writeHighScore(db, uid, body, gameId, requestId) {
  const newScore = parseInt(body, 10)
  if (isNaN(newScore) || newScore < 0) {
    return createJsonResponse({ error: 'invalid_score', message: 'Score must be a non-negative number', requestId }, 400)
  }

  const player = await db.prepare('SELECT high_score FROM players WHERE player_id = ? LIMIT 1').bind(uid).first()
  if (!player) {
    return createJsonResponse({ error: 'user_not_found', message: 'Player not found in database', requestId }, 404)
  }

  // A banned player's score never reaches the table, so it can
  // never reach the board either.
  const barred = await refuseIfBanned(db, uid, requestId)
  if (barred) return barred

  const currentHighScore = player.high_score || 0
  if (newScore <= currentHighScore) {
    return createJsonResponse({
      success: false,
      message: 'Score not higher than current high score',
      currentHighScore,
      submittedScore: newScore,
      requestId
    }, 200)
  }

  await db.prepare(
    'UPDATE players SET high_score = ?, games_played = games_played + 1, last_login = ? WHERE player_id = ?'
  ).bind(newScore, Date.now(), uid).run()

  logInfo('High score updated', { requestId, gameId })
  return createJsonResponse({
    success: true,
    message: 'High score updated successfully',
    previousHighScore: currentHighScore,
    newHighScore: newScore,
    improvement: newScore - currentHighScore,
    requestId
  }, 200)
}


async function writeProfile(db, uid, body, gameId, requestId, isPatch) {
  const parsed = parseJsonBody(body, requestId)
  if (parsed.refusal) return parsed.refusal

  const fieldError = validateProfileFields(parsed.data)
  if (fieldError) {
    return createJsonResponse({ ...fieldError, requestId }, 400)
  }

  const currentData = parsed.data.dataPatch !== undefined ? await readPlayerData(db, uid) : null
  const { updates, values } = buildProfileUpdate(parsed.data, isPatch, currentData)

  if (isPatch && updates.length === 0) {
    return createJsonResponse({ error: 'no_fields', message: 'No valid fields to update', requestId }, 400)
  }

  if (updates.length > 0) {
    updates.push('last_login = ?')
    values.push(Date.now(), uid)
    await db.prepare(`UPDATE players SET ${updates.join(', ')} WHERE player_id = ?`).bind(...values).run()
  }

  logInfo(isPatch ? 'Profile patched' : 'User data updated', { requestId, gameId })
  return createJsonResponse({ success: true, requestId }, 200)
}


// ==========================================
// PATCH | POST /database/patch/...
// Partial profile update for the authenticated owner.
// ==========================================
export async function handleDatabasePatch(url, request, gameId, requestId, GAMES, env) {
  const game = validateGameId(gameId, GAMES)
  if (!game) {
    return createJsonResponse({ error: 'invalid_game', message: 'Database not configured for this game', requestId }, 400)
  }

  const dbPath = url.pathname.replace('/database/patch/', '')
  const auth = await authorizeOwner(request, dbPath, requestId)
  if (auth.refusal) return auth.refusal

  const body = await request.text()
  if (!game.d1Binding) {
    return createJsonResponse({ error: 'unsupported_game', message: 'This game does not support PATCH operations', requestId }, 400)
  }

  logInfo('Database PATCH', { requestId, gameId })

  const { db, refusal } = database(env, game, requestId)
  if (refusal) return refusal
  if (!auth.ownerMatch) return unknownPath(requestId)

  try {
    return await writeProfile(db, auth.ownerMatch[1], body, gameId, requestId, true)
  } catch (error) {
    logError('Database PATCH error', { requestId, gameId, error: error.message })
    return createJsonResponse({ error: 'database_error', message: 'Database operation failed', requestId }, 500)
  }
}
