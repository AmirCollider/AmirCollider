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

import { validateGameId, getGameAudiences } from '../Config.js'
import { createJsonResponse } from '../Core/Http.js'
import { logInfo, logError } from '../Core/Logging.js'
import { verifyIdToken } from '../Core/GoogleOAuth.js'
import { emailMatchesRow, playerIdConflict } from '../Core/PlayerIdentity.js'
import {
  mapPlayer,
  playerIdFromEmail,
  readPlayerData,
  buildProfileUpdate,
  validateProfileFields,
  hasModerationColumns,
  refuseIfBanned
} from '../Games/PlayerRecord.js'

// ==========================================
// What may be read without proving anything
//
// Anchored patterns, not substrings. This was a list of words
// tested with dbPath.includes(), which is a different question
// from the one it was meant to ask: any path with "leaderboard"
// ANYWHERE in it counted as public, so
//
//   /database/get/games/leaderboard/users/ali
//
// skipped the token check entirely and then matched the
// user-record branch below - handing out a player's email address
// to anybody who typed it. Player ids are the local part of an
// address, so guessing one is not the hard part either.
//
// A regex per public shape means a path is public because it IS a
// leaderboard, not because it contains the word.
// ==========================================
const PUBLIC_READ_PATTERNS = [
  /^games\/[^/]+\/leaderboard$/,
  /^games\/[^/]+\/topScores$/,
  /^games\/[^/]+\/globalTopScores$/,
  /^leaderboard$/,
  /^topScores$/,
  /^globalTopScores$/
]

function isPublicRead(dbPath) {
  return PUBLIC_READ_PATTERNS.some(pattern => pattern.test(dbPath))
}

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
 * The caller's verified identity, or a refusal Response.
 *
 * `game` supplies the audience the token has to name, so a token
 * minted for somebody else's Google client is refused here rather
 * than accepted as whoever it happens to describe.
 */
async function authenticate(request, game, requestId) {
  const token = bearerToken(request)
  if (!token) {
    return { refusal: createJsonResponse({ error: 'unauthorized', message: 'Authorization token required', requestId }, 401) }
  }

  const identity = await verifyIdToken(token, getGameAudiences(game))
  if (!identity) {
    return { refusal: createJsonResponse({ error: 'invalid_token', message: 'Token is invalid or expired', requestId }, 401) }
  }

  return { identity, tokenPlayerId: playerIdFromEmail(identity.email) }
}


/**
 * Resolves the caller and checks they own the record the path
 * names. Returns { identity, tokenPlayerId, ownerMatch } or a
 * refusal Response.
 */
async function authorizeOwner(request, game, dbPath, requestId) {
  const auth = await authenticate(request, game, requestId)
  if (auth.refusal) return auth

  const ownerMatch = dbPath.match(/^games\/[^/]+\/users\/([^/]+)/)
  if (ownerMatch && ownerMatch[1] !== auth.tokenPlayerId) {
    return { refusal: createJsonResponse({ error: 'forbidden', message: 'You can only modify your own data', requestId }, 403) }
  }

  return { ...auth, ownerMatch }
}


/**
 * Whether the row this caller is about to touch is actually theirs.
 *
 * Deriving a player id from an address is not injective - fifteen
 * characters of the local part means ali@gmail.com and
 * ali@yahoo.com are both "ali" - so "the id matches" and "the
 * record is yours" stopped being the same statement the moment a
 * second person with a colliding address signed in. The row itself
 * settles it: whoever's address is in the `email` column owns it.
 *
 * Returns a refusal Response, or null when the caller may proceed.
 * A row that does not exist yet is nobody's, so it passes.
 */
async function refuseIfSomebodyElses(db, playerId, email, requestId) {
  let row
  try {
    row = await db.prepare('SELECT email FROM players WHERE player_id = ? LIMIT 1')
      .bind(playerId).first()
  } catch {
    // A read that failed is not evidence of ownership either way.
    // Refusing here would take the data API down with the database
    // it could not reach, and the write below is going to fail on
    // its own if the table is genuinely gone.
    return null
  }

  if (emailMatchesRow(row, email)) return null
  return playerIdConflict(requestId, { playerId })
}

/**
 * Creates the caller's own row if this is the first time they have
 * been seen.
 *
 * The schema says "the row is created at first sign-in", and nothing
 * created it. There is no INSERT into `players` anywhere else in this
 * Worker: a row came from the migration's demo seed or from nowhere at
 * all. So a player who had signed in perfectly well - correct token,
 * correct id - still met 404 on their profile and 404 on every score
 * they tried to save, for as long as they owned the game.
 *
 * Here rather than at sign-in because this is where an identity has
 * just been verified against Google, and because a row is then only
 * ever made for the person asking about themselves: `authenticate`
 * has already resolved the id from the token, and the callers below
 * have already refused a path naming anybody else.
 *
 * INSERT OR IGNORE, so two first requests racing each other produce
 * one row rather than an error, and so an id that already belongs to
 * somebody else is left exactly as it is - the collision guard that
 * follows is what refuses that case, and it can only do its job on a
 * row this has not overwritten.
 *
 * `username` is deliberately left null. The column takes 3 to 12
 * English letters and digits and nothing else, which a Google account
 * name is under no obligation to be; the player chooses one on the
 * site, and until then the game shows their account name instead.
 */
async function ensureOwnRow(db, playerId, identity) {
  if (!playerId || !identity || !identity.email) return

  try {
    const now = Date.now()
    await db.prepare(
      `INSERT OR IGNORE INTO players (player_id, email, profile_pic_url, created_at, last_login)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(playerId, identity.email, identity.picture || null, now, now).run()
  } catch {
    // Not fatal on its own. Whatever the caller was doing is about to
    // read or write the same row and will report the failure itself,
    // with the status that actually describes it.
  }
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
  const isPublicPath = isPublicRead(dbPath)

  if (!game.d1Binding) {
    return createJsonResponse({ error: 'unsupported_game', message: 'This game does not support GET operations', requestId }, 400)
  }

  // Anything that is not a public board is authenticated for real
  // now. The old check asked only whether an Authorization header
  // existed - "Bearer x" satisfied it - which made every read
  // below unauthenticated in everything but name.
  let caller = null
  if (!isPublicPath) {
    const auth = await authenticate(request, game, requestId)
    if (auth.refusal) return auth.refusal
    caller = auth
  }

  logInfo('Database GET', { requestId, gameId, public: isPublicPath })

  const { db, refusal } = database(env, game, requestId)
  if (refusal) return refusal

  try {
    const userMatch = dbPath.match(/^games\/[^/]+\/users\/([^/]+)$/)
    if (userMatch) {
      // The full record carries an email address, so it is the
      // owner's alone. A score is a different matter - see below.
      if (userMatch[1] !== caller.tokenPlayerId) {
        return createJsonResponse({
          error: 'forbidden',
          message: 'You can only read your own record',
          requestId
        }, 403)
      }

      // Their own record, and they have just proved who they are, so
      // "there is no row yet" is the first read of a new player rather
      // than a failure to report back to them.
      await ensureOwnRow(db, userMatch[1], caller.identity)

      const player = await db.prepare('SELECT * FROM players WHERE player_id = ? LIMIT 1')
        .bind(userMatch[1]).first().catch(() => null)
      if (!player) {
        return createJsonResponse({ error: 'not_found', message: 'User not found', requestId }, 404)
      }
      if (!emailMatchesRow(player, caller.identity.email)) {
        return playerIdConflict(requestId, { playerId: userMatch[1] })
      }
      return createJsonResponse(mapPlayer(player), 200)
    }

    // Somebody else's high score stays readable to a signed-in
    // caller: it is one integer, it is already on the public
    // leaderboard, and the game shows a rival's best beside your
    // own. Nothing identifying comes back with it.
    const scoreMatch = dbPath.match(/^games\/[^/]+\/users\/([^/]+)\/highScore$/)
    if (scoreMatch) {
      const player = await db.prepare('SELECT high_score FROM players WHERE player_id = ? LIMIT 1')
        .bind(scoreMatch[1]).first()
      return createJsonResponse(player ? player.high_score : 0, 200)
    }

    if (isPublicPath) {
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
  const auth = await authorizeOwner(request, game, dbPath, requestId)
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
      // Before the guard, not after: an id that already belongs to
      // somebody else is left untouched by INSERT OR IGNORE, so the
      // guard still has the other person's row to refuse on.
      await ensureOwnRow(db, highScoreMatch[2], auth.identity)

      const conflict = await refuseIfSomebodyElses(db, highScoreMatch[2], auth.identity.email, requestId)
      if (conflict) return conflict
      return writeHighScore(db, highScoreMatch[2], body, gameId, requestId)
    }

    const userMatch = dbPath.match(/^games\/([^/]+)\/users\/([^/]+)$/)
    if (userMatch) {
      await ensureOwnRow(db, userMatch[2], auth.identity)

      const conflict = await refuseIfSomebodyElses(db, userMatch[2], auth.identity.email, requestId)
      if (conflict) return conflict
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
  const auth = await authorizeOwner(request, game, dbPath, requestId)
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
    await ensureOwnRow(db, auth.ownerMatch[1], auth.identity)

    const conflict = await refuseIfSomebodyElses(db, auth.ownerMatch[1], auth.identity.email, requestId)
    if (conflict) return conflict
    return await writeProfile(db, auth.ownerMatch[1], body, gameId, requestId, true)
  } catch (error) {
    logError('Database PATCH error', { requestId, gameId, error: error.message })
    return createJsonResponse({ error: 'database_error', message: 'Database operation failed', requestId }, 500)
  }
}
