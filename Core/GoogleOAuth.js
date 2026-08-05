// ==========================================
// Core/GoogleOAuth.js
// Every call this Worker makes to Google, in one place - and the
// only place an id_token is ever turned into an identity.
//
// There used to be two token verifiers: this file's and
// Games/Session.js's. They had drifted, only one of them checked
// email_verified, and NEITHER of them checked `aud`. That is the
// hole this file closes; Games/Session.js now calls in here.
// ==========================================

import { logWarning } from './Logging.js'
import { playerIdFromEmail } from './PlayerIdentity.js'

export const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
export const GOOGLE_TOKENINFO_ENDPOINT = 'https://oauth2.googleapis.com/tokeninfo'


// ==========================================
// verifyIdToken
// Google's opinion of an id_token, checked against OURS.
//
// `audiences` is the list of client ids this token is allowed to
// have been issued for - normally one game's web and android
// clients, from getGameAudiences() in Config.js.
//
// Why that argument is not optional
// ---------------------------------
// "Google says this token is valid" and "this token was issued
// to me" are different claims, and only the second one is an
// authentication. Without the audience check, ANY Google id_token
// from ANY OAuth client on earth is accepted here: somebody runs
// a site with a Google sign-in button, keeps the id_tokens their
// own visitors hand them, replays one against this Worker, and is
// that visitor - their entitlements, their cloud save, their
// score. Google's own documentation lists this check as
// mandatory for exactly that reason.
//
// So an empty audience list fails closed. A deployment that
// cannot say who it is cannot authenticate anybody, and refusing
// every request is the safe half of that.
//
// Returns a normalized identity, or null. Null for every
// failure - network, non-200, malformed body, wrong audience,
// unverified address - because every caller wants the same thing
// from all of them: treat this request as unauthenticated.
// ==========================================
export async function verifyIdToken(idToken, audiences) {
  if (!idToken) return null

  const allowed = (audiences || []).filter(Boolean)
  if (allowed.length === 0) {
    logWarning('id_token refused: no audience configured for this game')
    return null
  }

  let info
  try {
    const response = await fetch(
      `${GOOGLE_TOKENINFO_ENDPOINT}?id_token=${encodeURIComponent(idToken)}`
    )
    if (!response.ok) return null
    info = await response.json().catch(() => null)
  } catch {
    return null
  }

  if (!info || info.error_description || !info.email) return null

  // The audience check. `aud` is who the token was minted for;
  // `azp` is the client that actually asked for it, which differs
  // on Android where the app authorises with its own client id and
  // the code is exchanged with the web one. Either naming one of
  // ours makes this our token.
  const audience = String(info.aud || '')
  const authorizedParty = String(info.azp || '')
  if (!allowed.includes(audience) && !allowed.includes(authorizedParty)) {
    logWarning('id_token refused: audience is not this deployment', {
      // The value itself is not logged. It is somebody else's
      // client id, it is attacker-controlled, and the only things
      // worth knowing here are the shape of the refusal and how
      // often it happens.
      hasAud: Boolean(audience),
      hasAzp: Boolean(authorizedParty)
    })
    return null
  }

  // An unverified address is one somebody typed into a Google
  // account and never proved. Accepting it would let a person
  // claim another player's id simply by putting their address on
  // a fresh account.
  if (info.email_verified === false || info.email_verified === 'false') return null

  return {
    sub: String(info.sub || ''),
    email: String(info.email || ''),
    name: String(info.name || ''),
    picture: String(info.picture || ''),
    playerId: playerIdFromEmail(info.email)
  }
}


/**
 * Back-compatible name for verifyIdToken.
 *
 * Kept because "fetch the token info" is what the call sites in
 * Api/ have always said. The behaviour is the strict one now, and
 * the audience argument is just as required here.
 */
export function fetchTokenInfo(idToken, audiences) {
  return verifyIdToken(idToken, audiences)
}


/** Extracts only the upstream error identifier, never the body. */
export function providerErrorCode(body) {
  try {
    return JSON.parse(body).error || 'unknown'
  } catch {
    return 'unparsable'
  }
}


/** POSTs a form-encoded grant to Google's token endpoint. */
export function postTokenGrant(params, headers = {}) {
  return fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(params).toString()
  })
}
