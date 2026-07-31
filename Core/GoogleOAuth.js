// ==========================================
// Core/GoogleOAuth.js
// Every call this Worker makes to Google, in one place.
// ==========================================

export const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
export const GOOGLE_TOKENINFO_ENDPOINT = 'https://oauth2.googleapis.com/tokeninfo'

/**
 * Google's own opinion of an id_token, or null.
 *
 * Null for every failure - network, non-200, malformed body, an
 * error field - because every caller wants the same thing from all
 * four: treat this request as unauthenticated.
 */
export async function fetchTokenInfo(idToken) {
  if (!idToken) return null

  try {
    const response = await fetch(`${GOOGLE_TOKENINFO_ENDPOINT}?id_token=${encodeURIComponent(idToken)}`)
    if (!response.ok) return null

    const info = await response.json().catch(() => null)
    return info && !info.error_description ? info : null
  } catch {
    return null
  }
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
