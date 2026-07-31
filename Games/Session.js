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

import { CONFIG } from '../Config.js'

import { timingSafeEqual } from '../Core/Http.js'
const COOKIE_NAME = 'ac_player'
const encoder = new TextEncoder()
const decoder = new TextDecoder()


// ==========================================
// playerIdFromEmail
// The identifier a game's own database uses for a person.
//
// If that rule ever changes, it changes in both places in the
// same commit or not at all.
// ==========================================
export function playerIdFromEmail(email) {
  return String(email || '').split('@')[0].toLowerCase().substring(0, 15)
}


// ==========================================
// verifyGoogleIdToken
// Google's own opinion of a token, or null.
//
// Null for every failure - network, non-200, malformed body,
// an error field - because every caller wants the same thing
// from all four: treat this request as unauthenticated.
// ==========================================
export async function verifyGoogleIdToken(idToken) {
  if (!idToken) return null

  try {
    const response = await fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken)
    )
    if (!response.ok) return null

    const info = await response.json().catch(() => null)
    if (!info || info.error_description || !info.email) return null

    // An unverified address is one somebody typed into a Google
    // account and never proved. Accepting it would let a person
    // claim another player's id simply by putting their address
    // on a fresh account.
    if (info.email_verified === false || info.email_verified === 'false') return null

    return {
      sub: String(info.sub || ''),
      email: String(info.email || ''),
      name: String(info.name || ''),
      picture: String(info.picture || ''),
      playerId: playerIdFromEmail(info.email)
    }
  } catch {
    return null
  }
}


// ==========================================
// Cookie signing - HMAC-SHA256
// ==========================================
function sessionSecret(env, GAMES) {
  if (env && env.STATE_SIGNING_SECRET) return env.STATE_SIGNING_SECRET
  const first = GAMES && GAMES[Object.keys(GAMES)[0]]
  return (first && first.oauth && first.oauth.secret) || ''
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
  const secret = sessionSecret(env, GAMES)
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
  const secret = sessionSecret(env, GAMES)
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
// ==========================================
export async function playerFromBearer(request) {
  const header = (request && request.headers && request.headers.get('Authorization')) || ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  if (!token || token === header.trim()) {
    // No "Bearer " prefix at all. Refused rather than guessed
    // at: a caller that sends a bare token is a caller with a
    // bug, and accepting it teaches the bug to stay.
    if (!/^Bearer\s+/i.test(header)) return null
  }
  return verifyGoogleIdToken(token)
}


// ==========================================
// requirePlayer
// Either proof, whichever the caller brought.
// ==========================================
export async function requirePlayer(env, GAMES, request) {
  const header = (request && request.headers && request.headers.get('Authorization')) || ''
  if (/^Bearer\s+/i.test(header)) {
    const fromToken = await playerFromBearer(request)
    if (fromToken) return { ...fromToken, via: 'token' }
    return null
  }

  const fromCookie = await readPlayerSession(env, GAMES, request)
  return fromCookie ? { ...fromCookie, via: 'session' } : null
}
