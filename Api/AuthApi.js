// ==========================================
// Api/AuthApi.js
// Two questions a game client asks about a player.
//
//   POST /auth/validate  is this id_token good, and is the player known?
//   POST /auth/check     does a player row exist for this uid?
//
// Both answer 200 with a false flag rather than 401 for a token
// Google rejected, because "not signed in" is an answer the client
// acts on and not a transport failure.
// ==========================================

import { validateGameId } from '../Config.js'
import { createJsonResponse } from '../Core/Http.js'
import { logInfo, logWarning, logError } from '../Core/Logging.js'
import { fetchTokenInfo } from '../Core/GoogleOAuth.js'

const PLAYER_COLUMNS = 'player_id, email, username, profile_pic_url'

function bearerToken(request) {
  return request.headers.get('Authorization')?.replace('Bearer ', '')
}

function publicPlayer(player) {
  return {
    uid: player.player_id,
    email: player.email,
    displayName: player.username,
    photoURL: player.profile_pic_url
  }
}

async function readJsonBody(request) {
  try {
    return { body: await request.json() }
  } catch {
    return { body: null }
  }
}


export async function handleValidateToken(url, request, gameId, requestId, GAMES, env) {
  const game = validateGameId(gameId, GAMES)
  if (!game) {
    return createJsonResponse({ error: 'invalid_game', message: 'Game configuration not found', valid: false, requestId }, 400)
  }

  const token = bearerToken(request)
  if (!token) {
    return createJsonResponse({ error: 'missing_token', message: 'Authorization token is required', valid: false, requestId }, 401)
  }

  const { body } = await readJsonBody(request)
  if (!body) {
    return createJsonResponse({ error: 'invalid_json', message: 'Request body must be valid JSON', valid: false, requestId }, 400)
  }
  if (!body.uid) {
    return createJsonResponse({ error: 'missing_uid', message: 'User ID is required', valid: false, requestId }, 400)
  }
  if (!game.d1Binding) {
    return createJsonResponse({ valid: false, error: 'unsupported_game', message: 'Game not supported', requestId }, 400)
  }

  try {
    if (!await fetchTokenInfo(token)) {
      logWarning('Token validation failed', { requestId, gameId })
      return createJsonResponse({ valid: false, error: 'invalid_token', message: 'Invalid token', requestId }, 200)
    }

    const player = await env[game.d1Binding]
      .prepare(`SELECT ${PLAYER_COLUMNS} FROM players WHERE player_id = ? LIMIT 1`)
      .bind(body.uid).first()

    if (!player) {
      return createJsonResponse({ valid: false, error: 'user_not_found', message: 'User not found in database', requestId }, 200)
    }

    logInfo('Token validated', { requestId, gameId })
    return createJsonResponse({ valid: true, user: publicPlayer(player), requestId }, 200)

  } catch (error) {
    logError('Token validation error', { requestId, gameId, error: error.message })
    return createJsonResponse({ valid: false, error: 'validation_error', message: 'Validation failed', requestId }, 500)
  }
}


export async function handleCheckUserExists(url, request, gameId, requestId, GAMES, env) {
  const game = validateGameId(gameId, GAMES)
  if (!game) {
    return createJsonResponse({ error: 'invalid_game', message: 'Game configuration not found', exists: false, requestId }, 400)
  }

  const { body } = await readJsonBody(request)
  if (!body) {
    return createJsonResponse({ error: 'invalid_json', message: 'Request body must be valid JSON', exists: false, requestId }, 400)
  }
  if (!body.uid) {
    return createJsonResponse({ error: 'missing_uid', message: 'User ID is required', exists: false, requestId }, 400)
  }
  if (!bearerToken(request)) {
    return createJsonResponse({ error: 'missing_token', message: 'Authorization token is required', exists: false, requestId }, 401)
  }
  if (!game.d1Binding) {
    return createJsonResponse({ exists: false, error: 'unsupported_game', message: 'Game not supported', requestId }, 400)
  }

  try {
    const player = await env[game.d1Binding]
      .prepare(`SELECT ${PLAYER_COLUMNS} FROM players WHERE player_id = ? LIMIT 1`)
      .bind(body.uid).first()

    if (!player) {
      return createJsonResponse({ exists: false, message: 'User not found in database', requestId }, 200)
    }

    logInfo('User exists', { requestId, gameId })
    return createJsonResponse({ exists: true, message: 'User exists', user: publicPlayer(player), requestId }, 200)

  } catch (error) {
    logError('Check user error', { requestId, gameId, error: error.message })
    return createJsonResponse({ exists: false, error: 'check_error', message: 'Lookup failed', requestId }, 500)
  }
}
