// ==========================================
// Games/Session.js
// Who is signed in on the site, and how we know.
//
// Public exports:
//   playerIdFromEmail(email)
//   verifyGoogleIdToken(idToken)
//   issuePlayerSession(env, GAMES, player)   -> Set-Cookie value
//   readPlayerSession(env, GAMES, request)   -> player, or null
//   clearPlayerSession()                     -> Set-Cookie value
//   requirePlayer(env, GAMES, request)       -> player, or null
//   playerFromBearer(request)                -> player, or null
//
// A person on the site and a game on a phone are the same
// player and prove it differently.
//
// Both resolve to the same player id, which is what makes a
// purchase made in a browser visible to the game five seconds
// later.
// ==========================================

import { CONFIG, getGameAudiences } from '../Config.js'

import { timingSafeEqual } from '../Core/Http.js'
import { verifyIdToken } from '../Core/GoogleOAuth.js'
import { playerIdFromEmail } from '../Core/PlayerIdentity.js'

const COOKIE_NAME = 'ac_player'
const encoder = new TextEncoder()
const decoder = new TextDecoder()


// ==========================================
// playerIdFromEmail
// Re-exported, not redefined.
//
// It lives in Core/PlayerIdentity.js now. It used to be written
// out here AND in Games/PlayerRecord.js, each with a comment
// saying the two must never disagree - which is a promise, where
// one function is a guarantee.
// ==========================================
export { playerIdFromEmail }


// ==========================================
// verifyGoogleIdToken
// Google's opinion of a token, checked against ours, or null.
//
// `game` is required: it names the Google client ids this token
// is allowed to have been issued for. Without it there is no
// audience to check against and Core/GoogleOAuth.js refuses
// everything - see the long note there for why that is the right
// way round.
// ==========================================
export function verifyGoogleIdToken(idToken, game) {
  return verifyIdToken(idToken, getGameAudiences(game))
}


// ==========================================
// Cookie signing - HMAC-SHA256
//
// One secret, and no fallback. This used to drop back to the
// first game's Google client secret when STATE_SIGNING_SECRET was
// unset, which quietly made an OAuth credential the key that
// signs every player's session. Config.js requires the variable
// now, so the fallback has nothing left to do.
// ==========================================
function sessionSecret(env) {
  return (env && env.STATE_SIGNING_SECRET) || ''
}


function base64Url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}


async function sign(payload, secret) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return base64Url(new Uint8Array(signature))
}


// ==========================================
// issuePlayerSession
// The Set-Cookie value for somebody who has just proved who
// they are.
//
// Path=/ because the account page, the store, and every game's
// pages all need it, and they do not share a prefix.
// ==========================================
export async function issuePlayerSession(env, GAMES, player) {
  const secret = sessionSecret(env)
  if (!secret) return null

  const body = {
    sub: player.sub,
    email: player.email,
    name: player.name || '',
    picture: player.picture || '',
    playerId: player.playerId || playerIdFromEmail(player.email),
    gameId: player.gameId || '',
    iat: Date.now()
  }

  const payload = base64Url(encoder.encode(JSON.stringify(body)))
  const signature = await sign(payload, secret)
  const maxAge = Math.floor(CONFIG.GAMESTORE.SESSION_MAX_AGE_MS / 1000)

  return `${COOKIE_NAME}=${payload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
}


export function clearPlayerSession() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
}


// ==========================================
// readPlayerSession
// The signed-in player, or null.
// ==========================================
export async function readPlayerSession(env, GAMES, request) {
  const secret = sessionSecret(env)
  if (!secret) return null

  const header = (request && request.headers && request.headers.get('Cookie')) || ''
  const match = header.match(new RegExp('(?:^|;\\s*)' + COOKIE_NAME + '=([^;]+)'))
  if (!match) return null

  const cut = match[1].lastIndexOf('.')
  if (cut <= 0) return null

  const payload = match[1].slice(0, cut)
  const signature = match[1].slice(cut + 1)

  const expected = await sign(payload, secret)
  if (!timingSafeEqual(expected, signature)) return null

  let body
  try {
    body = JSON.parse(decoder.decode(fromBase64Url(payload)))
  } catch {
    return null
  }

  if (!body || !body.email || !body.playerId) return null
  if (Date.now() - (body.iat || 0) > CONFIG.GAMESTORE.SESSION_MAX_AGE_MS) return null

  return body
}


// ==========================================
// playerFromBearer
// The player a game client is calling as, or null.
//
// `game` names the audience the token must have been issued for.
// ==========================================
export async function playerFromBearer(request, game) {
  const header = (request && request.headers && request.headers.get('Authorization')) || ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  if (!token || token === header.trim()) {
    // No "Bearer " prefix at all. Refused rather than guessed
    // at: a caller that sends a bare token is a caller with a
    // bug, and accepting it teaches the bug to stay.
    if (!/^Bearer\s+/i.test(header)) return null
  }
  return verifyGoogleIdToken(token, game)
}


// ==========================================
// requirePlayer
// Either proof, whichever the caller brought.
//
// `game` is the game whose OAuth clients a bearer token must name.
// A caller that arrives with a session cookie does not need it -
// the cookie was signed by this Worker, and the audience was
// already checked when it was issued.
// ==========================================
export async function requirePlayer(env, GAMES, request, game) {
  const header = (request && request.headers && request.headers.get('Authorization')) || ''
  if (/^Bearer\s+/i.test(header)) {
    const fromToken = await playerFromBearer(request, game)
    if (fromToken) return { ...fromToken, via: 'token' }
    return null
  }

  const fromCookie = await readPlayerSession(env, GAMES, request)
  return fromCookie ? { ...fromCookie, via: 'session' } : null
}
