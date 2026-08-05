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
//
// Both are about the CALLER. A uid in the body that is not the
// one the token resolves to is refused rather than answered:
// these endpoints return an email address, and answering about
// somebody else turns them into a directory. Shipped clients ask
// about themselves, so this is not a change they notice.
// ==========================================

import { validateGameId, getGameAudiences } from '../Config.js'
import { createJsonResponse } from '../Core/Http.js'
import { logInfo, logWarning, logError } from '../Core/Logging.js'
import { verifyIdToken } from '../Core/GoogleOAuth.js'
import { emailMatchesRow, playerIdConflict } from '../Core/PlayerIdentity.js'

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

/**
 * The refusal for a uid that is not the caller's.
 *
 * 403 and no detail about whether the row exists: the whole point
 * of the check is that this endpoint stops answering questions
 * about other people, and "no such player" is still an answer.
 */
function notYourUid(field, requestId) {
  return createJsonResponse({
    error: 'forbidden',
    message: 'This endpoint only answers for the account the token belongs to.',
    [field]: false,
    requestId
  }, 403)
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
    const identity = await verifyIdToken(token, getGameAudiences(game))
    if (!identity) {
      logWarning('Token validation failed', { requestId, gameId })
      return createJsonResponse({ valid: false, error: 'invalid_token', message: 'Invalid token', requestId }, 200)
    }

    // The check this endpoint was missing. It used to verify the
    // token and then look up whatever uid the body named, with
    // nothing tying the two together - so one valid Google token
    // read out the email address of any player whose id could be
    // guessed, and player ids are the local part of an address.
    if (String(body.uid) !== identity.playerId) {
      logWarning('Token validated for a uid that is not its own', { requestId, gameId })
      return notYourUid('valid', requestId)
    }

    const player = await env[game.d1Binding]
      .prepare(`SELECT ${PLAYER_COLUMNS} FROM players WHERE player_id = ? LIMIT 1`)
      .bind(body.uid).first()

    if (!player) {
      return createJsonResponse({ valid: false, error: 'user_not_found', message: 'User not found in database', requestId }, 200)
    }

    // The id matched and the row exists, which is still not proof
    // it is this person's row: two addresses can derive one id.
    if (!emailMatchesRow(player, identity.email)) {
      return playerIdConflict(requestId, { playerId: identity.playerId, gameId })
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

  const token = bearerToken(request)
  if (!token) {
    return createJsonResponse({ error: 'missing_token', message: 'Authorization token is required', exists: false, requestId }, 401)
  }
  if (!game.d1Binding) {
    return createJsonResponse({ exists: false, error: 'unsupported_game', message: 'Game not supported', requestId }, 400)
  }

  try {
    // The token is verified here now. This endpoint used to check
    // only that the Authorization header was non-empty - the
    // string "Bearer x" passed - and then return a player's email
    // address, username and photo. That made it an unauthenticated
    // lookup with a step in front of it that looked like one.
    const identity = await verifyIdToken(token, getGameAudiences(game))
    if (!identity) {
      logWarning('User check refused an unusable token', { requestId, gameId })
      return createJsonResponse({ exists: false, error: 'invalid_token', message: 'Invalid token', requestId }, 200)
    }

    if (String(body.uid) !== identity.playerId) {
      logWarning('User check asked about a uid that is not its own', { requestId, gameId })
      return notYourUid('exists', requestId)
    }

    const player = await env[game.d1Binding]
      .prepare(`SELECT ${PLAYER_COLUMNS} FROM players WHERE player_id = ? LIMIT 1`)
      .bind(body.uid).first()

    if (!player) {
      return createJsonResponse({ exists: false, message: 'User not found in database', requestId }, 200)
    }
    if (!emailMatchesRow(player, identity.email)) {
      return playerIdConflict(requestId, { playerId: identity.playerId, gameId })
    }

    logInfo('User exists', { requestId, gameId })
    return createJsonResponse({ exists: true, message: 'User exists', user: publicPlayer(player), requestId }, 200)

  } catch (error) {
    logError('Check user error', { requestId, gameId, error: error.message })
    return createJsonResponse({ exists: false, error: 'check_error', message: 'Lookup failed', requestId }, 500)
  }
}
