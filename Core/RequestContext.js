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

function langFromAcceptHeader(request) {
  const header = request && request.headers ? request.headers.get('Accept-Language') : ''
  if (!header) return null

  for (const piece of header.toLowerCase().split(',')) {
    const code = piece.split(';')[0].trim().slice(0, 2)
    if (LANGUAGES.supported.includes(code)) return code
  }
  return null
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
 * The older language rule the panels and status pages use:
 * ?lang -> cookie -> the first supported code that appears anywhere
 * in Accept-Language.
 *
 * Kept separate from resolveRequestLang because that last step picks
 * by LANGUAGES.supported order rather than by the browser's own
 * ordering. Folding the two together would move some visitors to a
 * different language than the one they get today.
 */
export function matchRequestLang(url, request) {
  const query = ((url && url.searchParams && url.searchParams.get('lang')) || '').toLowerCase()
  if (LANGUAGES.supported.includes(query)) return query

  const cookie = ((request && request.headers && request.headers.get('Cookie')) || '')
    .match(/(?:^|;\s*)lang=([^;]+)/)
  if (cookie && LANGUAGES.supported.includes(cookie[1])) return cookie[1]

  const accept = ((request && request.headers && request.headers.get('Accept-Language')) || '').toLowerCase()
  for (const code of LANGUAGES.supported) if (accept.includes(code)) return code
  return LANGUAGES.default
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
