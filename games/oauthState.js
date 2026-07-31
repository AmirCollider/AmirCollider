// ==========================================
// games/oauthState.js
// The signed value that survives a round trip through Google.
//
// Public exports:
//   getStateSecret(GAMES, env)
//   encodeState(data, secret)
//   decodeState(state, secret)
//   readClientStateHint(state)
//
// ------------------------------------------------------------
// WHY THIS IS ITS OWN FILE
// ------------------------------------------------------------
// There are now two things that start a Google sign-in - a game
// asking for an authorization code, and the website signing a
// player in - and they come back to the same callback. That
// callback decides what to do next by reading the state, so the
// state has to be produced and verified identically by both.
//
// It used to live inside worker.js, which was correct while
// there was one caller. A second copy of "HMAC the payload,
// compare in constant time" is the kind of duplication that
// stays right for exactly as long as nobody edits one of them.
//
// What the signature buys, concretely: the state carries the
// redirect target and, now, the purpose. Unsigned, anybody could
// hand a player a link whose state says "this is a website
// sign-in, return to <somewhere else>" and be handed a session
// cookie minting flow pointed at their own page.
// ==========================================

const encoder = new TextEncoder()
const decoder = new TextDecoder()


function base64UrlFromBytes(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function bytesFromBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}


// ==========================================
// getStateSecret
// The worker-wide signing secret.
//
// STATE_SIGNING_SECRET when it is set, and the first game's
// OAuth client secret otherwise. The fallback exists so a
// deployment that has not set the dedicated secret still signs
// its state rather than shipping an unsigned one - a value that
// is already required for the sign-in to work at all cannot be
// missing on a deployment where sign-in works.
// ==========================================
export function getStateSecret(GAMES, env) {
  if (env && env.STATE_SIGNING_SECRET) return env.STATE_SIGNING_SECRET
  const first = GAMES && GAMES[Object.keys(GAMES)[0]]
  return (first && first.oauth && first.oauth.secret) || ''
}


async function hmacSign(payload, secret) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return base64UrlFromBytes(new Uint8Array(signature))
}


export async function encodeState(data, secret) {
  const payload = base64UrlFromBytes(encoder.encode(JSON.stringify(data)))
  const signature = await hmacSign(payload, secret)
  return `${payload}.${signature}`
}


export async function decodeState(state, secret) {
  if (typeof state !== 'string' || state.indexOf('.') === -1) return { valid: false, data: null }

  const [payload, signature] = state.split('.')
  if (!payload || !signature) return { valid: false, data: null }

  const expected = await hmacSign(payload, secret)
  if (!constantTimeEqual(expected, signature)) return { valid: false, data: null }

  try {
    return { valid: true, data: JSON.parse(decoder.decode(bytesFromBase64Url(payload))) }
  } catch {
    return { valid: false, data: null }
  }
}


// ==========================================
// readClientStateHint
// Best-effort read of the state a CLIENT supplied.
//
// Unsigned by definition - it comes from the caller - and used
// only to guess a platform when nothing better is available.
// Never trusted for a security decision, which is why it is a
// separate function with a name that says so.
// ==========================================
export function readClientStateHint(state) {
  if (!state) return null
  try {
    return JSON.parse(atob(state))
  } catch {
    return null
  }
}
