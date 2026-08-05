// ==========================================
// Core/RequestContext.js
// Reads the two things every page needs from a request: which
// language to render in, and which theme the visitor chose.
//
// Language precedence is ?lang -> cookie -> Accept-Language ->
// LANGUAGES.default. The query parameter wins so a shared link can
// carry a language, and the cookie wins over the browser so the
// choice survives the next visit.
//
// Theme is only ever an explicit choice. No cookie means "auto",
// which the stylesheet resolves from prefers-color-scheme.
// ==========================================

import { LANGUAGES } from '../Config.js'

const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export function parseCookies(request) {
  const header = request && request.headers ? request.headers.get('Cookie') : ''
  const cookies = {}
  if (!header) return cookies

  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1) continue
    cookies[part.slice(0, separator).trim()] = decodeURIComponent(part.slice(separator + 1).trim())
  }
  return cookies
}

/** A supported language code, or the default. */
export function resolveLang(code) {
  return LANGUAGES.supported.includes(code) ? code : LANGUAGES.default
}

/** Text direction for a language code. */
export function dirFor(code) {
  return LANGUAGES.meta[resolveLang(code)].dir
}

/**
 * The languages this request asked for, best first.
 *
 * Sorted by q-value, and within an equal q by the order the header
 * lists them - which is the order RFC 9110 gives them. Region
 * subtags are dropped ("en-GB" -> "en"), anything this site does
 * not speak is discarded, and q=0 means "not this one" rather than
 * "this one, weakly".
 *
 * Both language resolvers below go through this, because the two
 * that existed before disagreed. One walked the header; the other
 * walked LANGUAGES.supported and asked whether the header
 * CONTAINED each code, which answers "fa" for a browser that sent
 * `en-US,en;q=0.9,fa;q=0.5` - it never reaches the second entry
 * because the first one it tries is the one it prefers, not the
 * one the visitor does. That is how an English-speaking reader of
 * a game's landing page got a Persian one, and a Google OAuth
 * reviewer with it is a review that comes back saying the home
 * page does not explain the application.
 */
function acceptedLangs(request) {
  const header = request && request.headers ? request.headers.get('Accept-Language') : ''
  if (!header) return []

  return String(header).toLowerCase().split(',')
    .map((piece, index) => {
      const parts = piece.trim().split(';')
      const quality = parts.slice(1)
        .map(part => part.trim())
        .find(part => part.startsWith('q='))
      const weight = quality === undefined ? 1 : Number(quality.slice(2))

      return {
        code: parts[0].trim().slice(0, 2),
        weight: Number.isFinite(weight) ? weight : 0,
        index
      }
    })
    .filter(entry => entry.weight > 0 && LANGUAGES.supported.includes(entry.code))
    .sort((a, b) => (b.weight - a.weight) || (a.index - b.index))
    .map(entry => entry.code)
}

function langFromAcceptHeader(request) {
  return acceptedLangs(request)[0] || null
}

export function resolveRequestLang(url, request, cookies = {}) {
  const fromQuery = url && url.searchParams ? url.searchParams.get('lang') : null
  if (fromQuery && LANGUAGES.supported.includes(fromQuery)) return fromQuery
  if (cookies.lang && LANGUAGES.supported.includes(cookies.lang)) return cookies.lang
  return langFromAcceptHeader(request) || LANGUAGES.default
}

export function resolveRequestTheme(cookies = {}) {
  return cookies.theme === 'light' || cookies.theme === 'dark' ? cookies.theme : null
}

/**
 * Headers that persist a language picked from the query string.
 * Empty when the request did not ask for one, so an ordinary page
 * view never rewrites the visitor's cookie.
 */
export function langCookieHeader(url, lang) {
  const requested = url && url.searchParams ? url.searchParams.get('lang') : null
  if (!requested || !LANGUAGES.supported.includes(requested)) return {}
  return { 'Set-Cookie': `lang=${resolveLang(lang)}; Path=/; Max-Age=${LANG_COOKIE_MAX_AGE}; SameSite=Lax` }
}

/**
 * The same rule as resolveRequestLang, for callers that have the
 * request but have not parsed its cookies: ?lang -> cookie ->
 * Accept-Language -> the default.
 *
 * Kept as its own export because that is the shape the game pages,
 * the panels and the status pages call it in. The two used to
 * differ in how they read Accept-Language, which is documented on
 * acceptedLangs() above; they no longer do.
 */
export function matchRequestLang(url, request) {
  const query = ((url && url.searchParams && url.searchParams.get('lang')) || '').toLowerCase()
  if (LANGUAGES.supported.includes(query)) return query

  const cookie = ((request && request.headers && request.headers.get('Cookie')) || '')
    .match(/(?:^|;\s*)lang=([^;]+)/)
  if (cookie && LANGUAGES.supported.includes(cookie[1])) return cookie[1]

  return langFromAcceptHeader(request) || LANGUAGES.default
}


/** The `data-theme` attribute for <html>, or "" for auto. */
export function themeAttribute(theme) {
  return theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : ''
}


/**
 * The visitor's explicit theme straight off the request, or null
 * for auto.
 *
 * resolveRequestTheme() takes cookies that have already been
 * parsed; this takes the request. The panels and the status pages
 * each carried their own copy of exactly this - three identical
 * four-line functions - so it lives here now.
 */
export function themeFromCookie(request) {
  const header = (request && request.headers && request.headers.get('Cookie')) || ''
  const match = header.match(/(?:^|;\s*)theme=([^;]+)/)
  return match && (match[1] === 'light' || match[1] === 'dark') ? match[1] : null
}
