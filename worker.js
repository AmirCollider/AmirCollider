// ==========================================
// OAuth Proxy v6.7 - Secure Version
// AmirCollider Games - Worker Core (routing, auth, data API)
// ==========================================
//
// Edge entry point for every AmirCollider game client.
//
// Login surface (stable contract — Unity, mobile app, web game all depend on it):
//   GET  /oauth/auth        -> start Google sign-in (web / desktop / android)
//   GET  /oauth/callback    -> Google returns here; delivers the code to the client
//   POST /oauth/token       -> exchange authorization code for tokens
//   POST /auth/refresh      -> refresh an expired session
//   POST /auth/validate     -> verify an id_token against a stored player
//   POST /auth/check        -> check whether a player exists
//   GET  /profile/{uid}     -> server-rendered player profile
//
// Data surface (per-game, token-guarded where it mutates):
//   GET  /database/get/...      POST|PUT /database/set/...      PATCH|POST /database/patch/...
//
// Design notes:
//   - Every page is theme-aware (light/dark/auto) and tri-lingual (fa/en/ja)
//     with correct RTL/LTR, rendered through the shared design system.
//   - Google-facing OAuth state is HMAC-signed and expiry-checked, so it
//     cannot be forged or tampered with in transit.
//   - Logs are structured and redacted: no secrets, no authorization codes,
//     no raw upstream error bodies, and nothing returned to the client beyond
//     a stable error code.
//
// Adding a game: edit GAME_REGISTRY in config.js only. No change is needed here.
// ==========================================

import { getSharedCSS, getLogosHTML, getPageHead } from './shared-styles.js'
import { CONFIG, CORS_HEADERS, SECURITY, LANGUAGES, getGamesConfig } from './config.js'
import {
  logInfo, logError, logWarning,
  generateRequestId,
  validateEnvironmentVariables,
  sanitizeInput,
  validateGameId,
  createJsonResponse, createHtmlResponse,
  create404Response, createErrorResponse, createErrorPage
} from './utils.js'
import { handleHealthWithUI } from './pages/health.js'
import { handlePingWithUI } from './pages/ping.js'
import { handlePrivacyPolicyWithGame } from './pages/privacy.js'
import { handleTermsWithGame } from './pages/terms.js'
import { handleLeaderboardUnified } from './pages/leaderboard.js'
import { handleMetrics } from './pages/metrics.js'
import { handleDashboard } from './pages/dashboard.js'
import { handleReleaseNotes } from './pages/releaseNotes.js'
import {
  handleTestSite,
  handleTestSiteLogin,
  handleTestSiteLoginPost,
  handleTestSiteLogout
} from './pages/testsite.js'

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx)
  }
}


// ==========================================
// Username Policy
// Length and character rules plus a blocklist of slurs. Messages are returned
// in all three UI languages so the client can localize without a round-trip.
// ==========================================
const USERNAME_BLOCKLIST = [
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'cunt',
  'pussy', 'slut', 'whore', 'faggot', 'nigger', 'nigga',
  'retard', 'kike', 'porn'
]

function validateUsername(username) {
  const fail = (code, fa, en, ja) => ({
    errorCode: code,
    messagePersian: fa,
    messageEnglish: en,
    messageJapanese: ja
  })

  if (typeof username !== 'string') {
    return fail('username_invalid', 'نام کاربری نامعتبر است', 'Invalid username', 'ユーザー名が無効です')
  }
  if (username.length < 3 || username.length > 12) {
    return fail(
      'username_too_long',
      'نام کاربری باید بین ۳ تا ۱۲ حرف باشد',
      'Username must be between 3 and 12 characters',
      'ユーザー名は3〜12文字にしてください'
    )
  }
  if (!/^[A-Za-z0-9]+$/.test(username)) {
    if (/\s/.test(username)) {
      return fail(
        'username_has_space',
        'از فاصله یا نماد‌ها نمی‌توان استفاده کرد',
        'Spaces or symbols are not allowed',
        'スペースや記号は使用できません'
      )
    }
    return fail(
      'username_invalid_chars',
      'فقط از حروف و اعداد انگلیسی استفاده شود',
      'Only English letters and numbers are allowed',
      '英数字のみ使用できます'
    )
  }
  const lower = username.toLowerCase()
  if (USERNAME_BLOCKLIST.some(word => lower.includes(word))) {
    return fail(
      'username_profanity',
      'استفاده از الفاظ نامناسب مجاز نیست',
      'Inappropriate language is not allowed',
      '不適切な表現は使用できません'
    )
  }
  return null
}


// ==========================================
// Request Helpers - Language & Theme
// Resolves the active locale (?lang -> cookie -> Accept-Language -> default)
// and an explicit theme override, mirroring the rest of the site so every
// page renders with the same direction and palette the visitor expects.
// ==========================================
function parseCookies(request) {
  const header = request && request.headers ? request.headers.get('Cookie') : ''
  const out = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i === -1) continue
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
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

function resolveLang(code) {
  return LANGUAGES.supported.includes(code) ? code : LANGUAGES.default
}

function resolveRequestLang(url, request, cookies) {
  const fromQuery = url && url.searchParams ? url.searchParams.get('lang') : null
  if (fromQuery && LANGUAGES.supported.includes(fromQuery)) return fromQuery
  if (cookies.lang && LANGUAGES.supported.includes(cookies.lang)) return cookies.lang
  return langFromAcceptHeader(request) || LANGUAGES.default
}

function resolveRequestTheme(cookies) {
  return cookies.theme === 'light' || cookies.theme === 'dark' ? cookies.theme : null
}

function dirFor(code) {
  return LANGUAGES.meta[resolveLang(code)].dir
}


// ==========================================
// Output Safety
// HTML-escape for direct markup interpolation and a script-string encoder for
// safely embedding untrusted values inside inline <script> blocks.
// ==========================================
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function jsString(value) {
  return JSON.stringify(String(value == null ? '' : value)).replace(/</g, '\\u003c')
}


// ==========================================
// OAuth State - Signing
// The Google-facing state is HMAC-SHA256 signed with a worker-wide secret and
// carries an issue timestamp. Forged or modified state fails verification, so
// callback delivery and the carried redirect target cannot be spoofed.
// ==========================================
const TEXT_ENCODER = new TextEncoder()
const TEXT_DECODER = new TextDecoder()

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

function getStateSecret(GAMES, env) {
  if (env && env.STATE_SIGNING_SECRET) return env.STATE_SIGNING_SECRET
  const first = GAMES[Object.keys(GAMES)[0]]
  return (first && first.oauth && first.oauth.secret) || ''
}

async function hmacSign(payload, secret) {
  const key = await crypto.subtle.importKey(
    'raw', TEXT_ENCODER.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, TEXT_ENCODER.encode(payload))
  return base64UrlFromBytes(new Uint8Array(signature))
}

async function encodeState(data, secret) {
  const payload = base64UrlFromBytes(TEXT_ENCODER.encode(JSON.stringify(data)))
  const signature = await hmacSign(payload, secret)
  return `${payload}.${signature}`
}

async function decodeState(state, secret) {
  if (typeof state !== 'string' || state.indexOf('.') === -1) return { valid: false, data: null }
  const [payload, signature] = state.split('.')
  if (!payload || !signature) return { valid: false, data: null }

  const expected = await hmacSign(payload, secret)
  if (!constantTimeEqual(expected, signature)) return { valid: false, data: null }

  try {
    return { valid: true, data: JSON.parse(TEXT_DECODER.decode(bytesFromBase64Url(payload))) }
  } catch {
    return { valid: false, data: null }
  }
}

// Best-effort read of the client-supplied state (unsigned, used only as a hint
// for platform detection). Never trusted for security decisions.
function readClientStateHint(state) {
  if (!state) return null
  try {
    return JSON.parse(atob(state))
  } catch {
    return null
  }
}


// ==========================================
// Platform Detection
// Classifies a request as android or web from explicit params, the redirect
// scheme, the user agent, or a client state hint.
// ==========================================
function detectAndroid({ explicitPlatform, headerPlatform, redirectUri, userAgent, clientStateHint }) {
  if (explicitPlatform === 'android' || headerPlatform === 'android') return true
  if (redirectUri && redirectUri.includes(':/') && !redirectUri.startsWith('http')) return true
  if (userAgent && /Android/i.test(userAgent)) return true
  if (clientStateHint && (clientStateHint.platform === 'android' || clientStateHint.isAndroid === true)) return true
  return false
}


// ==========================================
// Main Request Handler
// Validates configuration, resolves the route, applies the shared CORS and
// security headers once, and tags the response with a trace id.
// ==========================================
async function handleRequest(request, env, ctx) {
  try {
    validateEnvironmentVariables(env)
  } catch (error) {
    logError('Environment validation failed', { error: error.message })
    return createJsonResponse({
      error: 'configuration_error',
      message: 'Server configuration incomplete. Please contact the administrator.'
    }, 500)
  }

  const GAMES = getGamesConfig(env)

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { ...CORS_HEADERS, ...SECURITY.SECURE_HEADERS }
    })
  }

  const url = new URL(request.url)
  const path = url.pathname
  const gameId = request.headers.get('X-Game-ID') || url.searchParams.get('game') || Object.keys(GAMES)[0]
  const requestId = generateRequestId()
  const logContext = { requestId, gameId, path, method: request.method }

  try {
    logInfo('Request received', logContext)

    const route = matchRoute(path, request.method)
    if (!route) {
      const existsWithOtherMethod = ROUTES.some(r => {
        if (r.prefix) return path.startsWith(r.path)
        if (r.dynamic) return new RegExp(`^${r.path.replace(/:\w+/g, '([^/]+)')}$`).test(path)
        return r.path === path
      })
      if (existsWithOtherMethod) {
        return createJsonResponse({
          error: 'method_not_allowed',
          message: 'Method not allowed for this endpoint',
          requestId
        }, 405)
      }
      return create404Response(requestId)
    }

    const resolvedGameId = route.params?.gameId || gameId
    const availableEndpoints = ROUTES.map(r => `${r.method} ${r.path}`)
    const response = await route.handler(url, request, resolvedGameId, requestId, GAMES, env, availableEndpoints)

    const headers = new Headers(response.headers)
    for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value)
    for (const [key, value] of Object.entries(SECURITY.SECURE_HEADERS)) headers.set(key, value)
    headers.set('X-Request-ID', requestId)

    const finalResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    })

    logInfo('Request completed', { ...logContext, status: finalResponse.status })
    return finalResponse

  } catch (error) {
    logError('Request failed', { ...logContext, error: error.message })
    return createErrorResponse(error, requestId, {
      name: 'AmirCollider Games',
      color: '#f44336',
      logo: CONFIG.AMIR_LOGO
    })
  }
}


// ==========================================
// Routing Table
// Order is irrelevant: static and prefix routes are matched before dynamic
// ones by matchRoute. Add new endpoints here.
// ==========================================
const ROUTES = [
  { path: '/', method: 'GET', handler: handleDashboard },
  { path: '/testsite', method: 'GET', handler: handleTestSite },
  { path: '/testsite/login', method: 'GET', handler: handleTestSiteLogin },
  { path: '/testsite/login', method: 'POST', handler: handleTestSiteLoginPost },
  { path: '/testsite/logout', method: 'POST', handler: handleTestSiteLogout },
  { path: '/metrics', method: 'GET', handler: handleMetrics },
  { path: '/release-notes', method: 'GET', handler: handleReleaseNotes },
  { path: '/assets/', method: 'GET', handler: handleAsset, prefix: true },
  { path: '/:gameId/health', method: 'GET', handler: handleHealthWithUI, dynamic: true },
  { path: '/:gameId/ping', method: 'GET', handler: handlePingWithUI, dynamic: true },
  { path: '/:gameId/privacy', method: 'GET', handler: handlePrivacyPolicyWithGame, dynamic: true },
  { path: '/:gameId/terms', method: 'GET', handler: handleTermsWithGame, dynamic: true },
  { path: '/:gameId/leaderboard', method: 'GET', handler: handleLeaderboardUnified, dynamic: true },
  { path: '/:gameId/leaderboard/:limit', method: 'GET', handler: handleLeaderboardUnified, dynamic: true },
  { path: '/oauth/auth', method: 'GET', handler: handleOAuthAuth },
  { path: '/oauth/callback', method: 'GET', handler: handleOAuthCallback },
  { path: '/oauth/token', method: 'POST', handler: handleTokenExchange },
  { path: '/auth/refresh', method: 'POST', handler: handleRefreshToken },
  { path: '/auth/validate', method: 'POST', handler: handleValidateToken },
  { path: '/auth/check', method: 'POST', handler: handleCheckUserExists },
  { path: '/profile/', method: 'GET', handler: handleUserProfile, prefix: true },
  { path: '/database/get/', method: 'GET', handler: handleDatabaseGet, prefix: true },
  { path: '/database/set/', method: 'POST', handler: handleDatabaseSet, prefix: true },
  { path: '/database/set/', method: 'PUT', handler: handleDatabaseSet, prefix: true },
  { path: '/database/patch/', method: 'PATCH', handler: handleDatabasePatch, prefix: true },
  { path: '/database/patch/', method: 'POST', handler: handleDatabasePatch, prefix: true }
]


// ==========================================
// Route Matcher
// Resolves a path/method to a route, extracting :params for dynamic routes.
// ==========================================
function matchRoute(path, method) {
  const staticRoute = ROUTES.find(route => {
    if (route.dynamic) return false
    if (route.prefix) return path.startsWith(route.path) && route.method === method
    return route.path === path && route.method === method
  })
  if (staticRoute) return staticRoute

  const dynamicRoute = ROUTES.find(route => {
    if (!route.dynamic || route.method !== method) return false
    return new RegExp(`^${route.path.replace(/:\w+/g, '([^/]+)')}$`).test(path)
  })
  if (!dynamicRoute) return null

  const regex = new RegExp(`^${dynamicRoute.path.replace(/:\w+/g, '([^/]+)')}$`)
  const matches = path.match(regex)
  const paramNames = (dynamicRoute.path.match(/:\w+/g) || []).map(p => p.slice(1))
  const params = {}
  if (matches) {
    paramNames.forEach((name, index) => { params[name] = decodeURIComponent(matches[index + 1]) })
  }
  return { ...dynamicRoute, params }
}


// ==========================================
// OAuth: Build Google Authorization URL
// One builder for every platform. Android server-side code exchange requires
// the Web client_id, so it is used for both; only web allows a client_id
// override via query.
// ==========================================
function buildGoogleAuthUrl(url, game, stateValue, isAndroid, lang) {
  const clientId = isAndroid
    ? game.oauth.web
    : (url.searchParams.get('client_id') || game.oauth.web)
  const scope = url.searchParams.get('scope') || 'openid profile email'
  const responseType = url.searchParams.get('response_type') || 'code'

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', `${url.origin}/oauth/callback`)
  authUrl.searchParams.set('response_type', responseType)
  authUrl.searchParams.set('scope', scope)
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent')
  authUrl.searchParams.set('hl', resolveLang(lang))
  authUrl.searchParams.set('state', stateValue)
  return authUrl
}


// ==========================================
// OAuth: Start Authorization
// Validates the request, classifies the platform, issues a signed state, and
// hands off to Google via a localized redirect page.
// ==========================================
async function handleOAuthAuth(url, request, gameId, requestId, GAMES, env) {
  const game = validateGameId(gameId, GAMES)
  if (!game) {
    return createJsonResponse({ error: 'invalid_game', message: 'Game configuration not found', requestId }, 400)
  }

  const redirectUri = url.searchParams.get('redirect_uri')
  if (!redirectUri) {
    logWarning('Missing redirect_uri', { requestId, gameId })
    return createJsonResponse({
      error: 'invalid_request',
      error_description: 'Missing redirect_uri parameter',
      requestId
    }, 400)
  }

  const clientState = url.searchParams.get('state') || ''
  const userAgent = request.headers.get('User-Agent') || ''
  const cookies = parseCookies(request)
  const lang = resolveRequestLang(url, request, cookies)
  const theme = resolveRequestTheme(cookies)

  const isAndroid = detectAndroid({
    explicitPlatform: url.searchParams.get('platform'),
    redirectUri,
    userAgent,
    clientStateHint: readClientStateHint(clientState)
  })

  const stateData = {
    originalRedirectUri: redirectUri,
    originalState: clientState,
    language: lang,
    isAndroid,
    platform: isAndroid ? 'android' : 'web',
    gameId,
    requestId,
    timestamp: Date.now()
  }

  const signedState = await encodeState(stateData, getStateSecret(GAMES, env))
  const authUrl = buildGoogleAuthUrl(url, game, signedState, isAndroid, lang)

  logInfo('OAuth authorization started', { requestId, gameId, platform: stateData.platform })

  return createHtmlResponse(renderRedirectPage(authUrl.toString(), game, lang, theme))
}


// ==========================================
// OAuth: Callback
// Verifies the signed state, then delivers the authorization code to the
// caller by platform: android deep link, desktop loopback, or copy page.
// ==========================================
async function handleOAuthCallback(url, request, gameId, requestId, GAMES, env) {
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const oauthError = url.searchParams.get('error')

  const cookies = parseCookies(request)
  const theme = resolveRequestTheme(cookies)

  const decoded = await decodeState(state, getStateSecret(GAMES, env))
  if (state && !decoded.valid) {
    logWarning('Invalid OAuth state', { requestId })
    return createHtmlResponse(renderExpiredPage(LANGUAGES.default, theme))
  }

  const stateData = decoded.data || { language: LANGUAGES.default, isAndroid: false, gameId: Object.keys(GAMES)[0] }
  const lang = resolveLang(stateData.language)
  const game = validateGameId(stateData.gameId, GAMES)

  if (stateData.timestamp && (Date.now() - stateData.timestamp) > CONFIG.STATE_EXPIRY_MS) {
    logWarning('State expired', { requestId, gameId: stateData.gameId })
    return createHtmlResponse(renderExpiredPage(lang, theme))
  }

  if (oauthError) {
    logWarning('OAuth error from provider', { requestId, gameId: stateData.gameId, error: oauthError })
    return createHtmlResponse(renderOAuthErrorPage(oauthError, game, lang, theme))
  }

  if (!code || !stateData.originalRedirectUri) {
    return createJsonResponse({
      error: 'invalid_callback',
      error_description: 'Missing code or redirect URI',
      requestId
    }, 400)
  }

  logInfo('OAuth callback received', { requestId, gameId: stateData.gameId, platform: stateData.isAndroid ? 'android' : 'web' })

  if (stateData.isAndroid) {
    const deepLink = `${game.deepLink.scheme}://${game.deepLink.host}?code=${encodeURIComponent(code)}`
    return createHtmlResponse(renderAndroidSuccessPage(deepLink, game, lang, theme))
  }

  if (stateData.originalRedirectUri.startsWith('http://localhost')) {
    return createHtmlResponse(renderLoopbackSuccessPage(code, stateData.originalRedirectUri, game, lang, theme))
  }

  return createHtmlResponse(renderDesktopSuccessPage(code, game, url.origin, lang, theme))
}


// ==========================================
// OAuth: Token Exchange
// Swaps an authorization code for tokens. The upstream error body is logged
// server-side but never returned to the caller; the client only sees a stable
// error code and the upstream status.
// ==========================================
async function handleTokenExchange(url, request, gameId, requestId, GAMES, env) {
  const game = validateGameId(gameId, GAMES)
  if (!game) {
    return createJsonResponse({ error: 'invalid_game', message: 'Game configuration not found', requestId }, 400)
  }

  let rawBody
  try {
    rawBody = await request.text()
  } catch {
    return createJsonResponse({ error: 'invalid_body', message: 'Failed to read request body', requestId }, 400)
  }

  const params = new URLSearchParams(rawBody)
  const code = params.get('code')
  if (!code) {
    return createJsonResponse({ error: 'missing_code', message: 'Authorization code is required', requestId }, 400)
  }

  const isAndroid = detectAndroid({
    explicitPlatform: params.get('platform'),
    headerPlatform: request.headers.get('X-Platform'),
    redirectUri: params.get('redirect_uri')
  })

  const clientId = game.oauth.web
  const clientSecret = game.oauth.secret
  const redirectUri = `${url.origin}/oauth/callback`

  if (!clientId || !clientSecret) {
    logError('OAuth client not configured', { requestId, gameId })
    return createJsonResponse({ error: 'configuration_error', message: 'OAuth client not configured', requestId }, 500)
  }

  const googleParams = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  })

  try {
    const googleResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': `${game.name}-Proxy/${CONFIG.VERSION}`
      },
      body: googleParams.toString()
    })

    const responseText = await googleResponse.text()

    if (!googleResponse.ok) {
      logError('Token exchange rejected by provider', {
        requestId, gameId,
        platform: isAndroid ? 'android' : 'web',
        status: googleResponse.status,
        providerError: safeErrorCode(responseText)
      })
      return createJsonResponse({
        error: 'token_exchange_failed',
        status: googleResponse.status,
        requestId
      }, googleResponse.status)
    }

    let tokens
    try {
      tokens = JSON.parse(responseText)
    } catch {
      logError('Token exchange returned malformed JSON', { requestId, gameId })
      return createJsonResponse({ error: 'invalid_provider_response', requestId }, 502)
    }

    logInfo('Token exchanged', { requestId, gameId, platform: isAndroid ? 'android' : 'web' })
    return createJsonResponse(tokens, 200)

  } catch (error) {
    logError('Token exchange network error', { requestId, gameId, error: error.message })
    return createJsonResponse({ error: 'network_error', message: 'Upstream request failed', requestId }, 502)
  }
}

// Extracts only the upstream error identifier for logging, never the body.
function safeErrorCode(body) {
  try {
    const parsed = JSON.parse(body)
    return parsed.error || 'unknown'
  } catch {
    return 'unparsable'
  }
}


// ==========================================
// OAuth: Refresh Token
// Exchanges a refresh token for a fresh id_token via Google.
// ==========================================
async function handleRefreshToken(url, request, gameId, requestId, GAMES, env) {
  const game = validateGameId(gameId, GAMES)
  if (!game) {
    return createJsonResponse({ error: 'invalid_game', message: 'Game configuration not found', requestId }, 400)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return createJsonResponse({ error: 'invalid_json', message: 'Request body must be valid JSON', requestId }, 400)
  }

  const refreshToken = body.refreshToken
  if (!refreshToken) {
    return createJsonResponse({ error: 'missing_refresh_token', message: 'Refresh token is required', requestId }, 400)
  }
  if (!game.d1Binding) {
    return createJsonResponse({ success: false, error: 'unsupported_game', message: 'Game not supported', requestId }, 400)
  }

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: game.oauth.web,
        client_secret: game.oauth.secret
      }).toString()
    })

    const tokenData = await tokenResponse.json().catch(() => ({}))

    if (!tokenResponse.ok || tokenData.error) {
      logWarning('Token refresh rejected', { requestId, gameId, providerError: tokenData.error || 'unknown' })
      return createJsonResponse({ success: false, error: 'refresh_failed', message: 'Failed to refresh token', requestId }, 400)
    }

    logInfo('Token refreshed', { requestId, gameId })
    return createJsonResponse({
      success: true,
      id_token: tokenData.id_token,
      refresh_token: tokenData.refresh_token || refreshToken,
      expires_in: tokenData.expires_in || 3600,
      requestId
    }, 200)

  } catch (error) {
    logError('Token refresh error', { requestId, gameId, error: error.message })
    return createJsonResponse({ success: false, error: 'refresh_error', message: 'Upstream request failed', requestId }, 502)
  }
}


// ==========================================
// Token Verification Helper
// Validates a Google id_token and returns its info, or null when invalid.
// ==========================================
async function verifyIdToken(token) {
  if (!token) return null
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`)
  if (!response.ok) return null
  const info = await response.json().catch(() => null)
  if (!info || info.error_description) return null
  return info
}

function playerIdFromEmail(email) {
  return String(email || '').split('@')[0].toLowerCase().substring(0, 15)
}


// ==========================================
// Auth: Validate Token
// Confirms an id_token is valid and the referenced player exists.
// ==========================================
async function handleValidateToken(url, request, gameId, requestId, GAMES, env) {
  const game = validateGameId(gameId, GAMES)
  if (!game) {
    return createJsonResponse({ error: 'invalid_game', message: 'Game configuration not found', valid: false, requestId }, 400)
  }

  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) {
    return createJsonResponse({ error: 'missing_token', message: 'Authorization token is required', valid: false, requestId }, 401)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return createJsonResponse({ error: 'invalid_json', message: 'Request body must be valid JSON', valid: false, requestId }, 400)
  }

  const uid = body.uid
  if (!uid) {
    return createJsonResponse({ error: 'missing_uid', message: 'User ID is required', valid: false, requestId }, 400)
  }
  if (!game.d1Binding) {
    return createJsonResponse({ valid: false, error: 'unsupported_game', message: 'Game not supported', requestId }, 400)
  }

  try {
    const tokenInfo = await verifyIdToken(token)
    if (!tokenInfo) {
      logWarning('Token validation failed', { requestId, gameId })
      return createJsonResponse({ valid: false, error: 'invalid_token', message: 'Invalid token', requestId }, 200)
    }

    const db = env[game.d1Binding]
    const player = await db.prepare(
      'SELECT player_id, email, profile_pic_url, username FROM players WHERE player_id = ? LIMIT 1'
    ).bind(uid).first()

    if (!player) {
      return createJsonResponse({ valid: false, error: 'user_not_found', message: 'User not found in database', requestId }, 200)
    }

    logInfo('Token validated', { requestId, gameId })
    return createJsonResponse({
      valid: true,
      user: {
        uid: player.player_id,
        email: player.email,
        displayName: player.username,
        photoURL: player.profile_pic_url
      },
      requestId
    }, 200)

  } catch (error) {
    logError('Token validation error', { requestId, gameId, error: error.message })
    return createJsonResponse({ valid: false, error: 'validation_error', message: 'Validation failed', requestId }, 500)
  }
}


// ==========================================
// Auth: Check User Exists
// Returns whether a player record exists for the given uid.
// ==========================================
async function handleCheckUserExists(url, request, gameId, requestId, GAMES, env) {
  const game = validateGameId(gameId, GAMES)
  if (!game) {
    return createJsonResponse({ error: 'invalid_game', message: 'Game configuration not found', exists: false, requestId }, 400)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return createJsonResponse({ error: 'invalid_json', message: 'Request body must be valid JSON', exists: false, requestId }, 400)
  }

  const uid = body.uid
  if (!uid) {
    return createJsonResponse({ error: 'missing_uid', message: 'User ID is required', exists: false, requestId }, 400)
  }

  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) {
    return createJsonResponse({ error: 'missing_token', message: 'Authorization token is required', exists: false, requestId }, 401)
  }
  if (!game.d1Binding) {
    return createJsonResponse({ exists: false, error: 'unsupported_game', message: 'Game not supported', requestId }, 400)
  }

  try {
    const db = env[game.d1Binding]
    const player = await db.prepare(
      'SELECT player_id, email, username, profile_pic_url FROM players WHERE player_id = ? LIMIT 1'
    ).bind(uid).first()

    if (!player) {
      return createJsonResponse({ exists: false, message: 'User not found in database', requestId }, 200)
    }

    logInfo('User exists', { requestId, gameId })
    return createJsonResponse({
      exists: true,
      message: 'User exists',
      user: {
        uid: player.player_id,
        email: player.email,
        displayName: player.username,
        photoURL: player.profile_pic_url
      },
      requestId
    }, 200)

  } catch (error) {
    logError('Check user error', { requestId, gameId, error: error.message })
    return createJsonResponse({ exists: false, error: 'check_error', message: 'Lookup failed', requestId }, 500)
  }
}


// ==========================================
// Page: User Profile
// Server-rendered, theme-aware, tri-lingual player profile.
// ==========================================
async function handleUserProfile(url, request, gameId, requestId, GAMES, env) {
  const game = validateGameId(gameId, GAMES)
  const cookies = parseCookies(request)
  const lang = resolveRequestLang(url, request, cookies)
  const theme = resolveRequestTheme(cookies)
  const t = key => authText(lang, key)

  if (!game) {
    return createHtmlResponse(createErrorPage(t('gameNotFound'), null, lang), 404)
  }

  const uid = url.pathname.replace('/profile/', '')
  if (!uid) {
    return createHtmlResponse(createErrorPage(t('userIdRequired'), game, lang), 400)
  }
  if (!game.d1Binding) {
    return createHtmlResponse(createErrorPage(t('gameNotSupported'), game, lang), 400)
  }

  try {
    const db = env[game.d1Binding]
    const player = await db.prepare('SELECT * FROM players WHERE player_id = ? LIMIT 1').bind(uid).first()
    if (!player) {
      return createHtmlResponse(createErrorPage(t('userNotFound'), game, lang), 404)
    }

    const userData = {
      uid: player.player_id,
      email: player.email,
      username: player.username,
      displayName: player.username,
      photoURL: player.profile_pic_url,
      highScore: player.high_score,
      gamesPlayed: player.games_played,
      createdAt: player.created_at,
      lastLogin: player.last_login
    }

    return createHtmlResponse(renderProfilePage(userData, game, gameId, lang, theme))

  } catch (error) {
    logError('Profile fetch error', { requestId, gameId, error: error.message })
    return createHtmlResponse(createErrorPage(t('serverError'), game, lang), 500)
  }
}


// ==========================================
// Data: Read
// Public leaderboard / score reads are open; user record reads require a token.
// ==========================================
async function handleDatabaseGet(url, request, gameId, requestId, GAMES, env) {
  const game = validateGameId(gameId, GAMES)
  if (!game) {
    return createJsonResponse({ error: 'invalid_game', message: 'Database not configured for this game', requestId }, 400)
  }

  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  const dbPath = url.pathname.replace('/database/get/', '')
  const isPublicPath = ['topScores', 'globalTopScores', 'leaderboard'].some(p => dbPath.includes(p))

  if (!isPublicPath && !token) {
    return createJsonResponse({ error: 'unauthorized', message: 'Authorization token required', requestId }, 401)
  }
  if (!game.d1Binding) {
    return createJsonResponse({ error: 'unsupported_game', message: 'This game does not support GET operations', requestId }, 400)
  }

  logInfo('Database GET', { requestId, gameId, public: isPublicPath })

  try {
    const db = env[game.d1Binding]
    if (!db) {
      return createJsonResponse({ error: 'db_not_bound', message: `D1 binding "${game.d1Binding}" not found`, requestId }, 500)
    }

    const userMatch = dbPath.match(/^games\/[^/]+\/users\/([^/]+)$/)
    if (userMatch) {
      const player = await db.prepare('SELECT * FROM players WHERE player_id = ? LIMIT 1').bind(userMatch[1]).first().catch(() => null)
      if (!player) {
        return createJsonResponse({ error: 'not_found', message: 'User not found', requestId }, 404)
      }
      return createJsonResponse(mapPlayer(player), 200)
    }

    const scoreMatch = dbPath.match(/^games\/[^/]+\/users\/([^/]+)\/highScore$/)
    if (scoreMatch) {
      const player = await db.prepare('SELECT high_score FROM players WHERE player_id = ? LIMIT 1').bind(scoreMatch[1]).first()
      return createJsonResponse(player ? player.high_score : 0, 200)
    }

    if (dbPath.includes('leaderboard')) {
      const { results } = await db.prepare(`
        SELECT username, username AS displayName, high_score AS highScore,
               profile_pic_url AS photoURL, selected_color AS selectedColor
        FROM players ORDER BY high_score DESC LIMIT 100
      `).all()
      const mapped = (results || []).map((row, index) => ({
        rank: index + 1,
        username: row.username || 'Unknown User',
        displayName: row.displayName || 'Unknown User',
        highScore: row.highScore || 0,
        photoURL: row.photoURL || '',
        selectedColor: row.selectedColor || 'FFFFFF'
      }))
      return createJsonResponse(mapped, 200)
    }

    return createJsonResponse({ error: 'unknown_path', message: 'Path not supported', requestId }, 400)

  } catch (error) {
    logError('Database GET error', { requestId, gameId, error: error.message })
    return createJsonResponse({ error: 'database_error', message: 'Database operation failed', requestId }, 500)
  }
}


// ==========================================
// Data: Write
// Writes high scores or profile fields. The token owner may only modify their
// own records.
// ==========================================
async function handleDatabaseSet(url, request, gameId, requestId, GAMES, env) {
  const game = validateGameId(gameId, GAMES)
  if (!game) {
    return createJsonResponse({ error: 'invalid_game', message: 'Database not configured for this game', requestId }, 400)
  }

  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) {
    return createJsonResponse({ error: 'unauthorized', message: 'Authorization token required', requestId }, 401)
  }

  const tokenInfo = await verifyIdToken(token)
  if (!tokenInfo) {
    return createJsonResponse({ error: 'invalid_token', message: 'Token is invalid or expired', requestId }, 401)
  }
  const tokenPlayerId = playerIdFromEmail(tokenInfo.email)

  const dbPath = url.pathname.replace('/database/set/', '')
  const ownerMatch = dbPath.match(/^games\/[^/]+\/users\/([^/]+)/)
  if (ownerMatch && ownerMatch[1] !== tokenPlayerId) {
    return createJsonResponse({ error: 'forbidden', message: 'You can only modify your own data', requestId }, 403)
  }

  const body = await request.text()
  if (!game.d1Binding) {
    return createJsonResponse({ error: 'unsupported_game', message: 'This game does not support SET operations', requestId }, 400)
  }

  logInfo('Database SET', { requestId, gameId, method: request.method })

  try {
    const db = env[game.d1Binding]
    if (!db) {
      return createJsonResponse({ error: 'db_not_bound', message: `D1 binding "${game.d1Binding}" not found`, requestId }, 500)
    }

    const highScoreMatch = dbPath.match(/^games\/([^/]+)\/users\/([^/]+)\/highScore$/)
    if (highScoreMatch) {
      const uid = highScoreMatch[2]
      const newScore = parseInt(body, 10)
      if (isNaN(newScore) || newScore < 0) {
        return createJsonResponse({ error: 'invalid_score', message: 'Score must be a non-negative number', requestId }, 400)
      }

      const player = await db.prepare('SELECT high_score FROM players WHERE player_id = ? LIMIT 1').bind(uid).first()
      if (!player) {
        return createJsonResponse({ error: 'user_not_found', message: 'Player not found in database', requestId }, 404)
      }

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

    const userMatch = dbPath.match(/^games\/([^/]+)\/users\/([^/]+)$/)
    if (userMatch) {
      const uid = userMatch[2]
      let userData
      try {
        userData = JSON.parse(body)
      } catch {
        return createJsonResponse({ error: 'invalid_json', message: 'Body must be valid JSON', requestId }, 400)
      }

      const fieldError = applyProfileFields(userData)
      if (fieldError) {
        return createJsonResponse({ ...fieldError, requestId }, 400)
      }

      const { updates, values } = buildProfileUpdate(userData)
      if (updates.length > 0) {
        updates.push('last_login = ?')
        values.push(Date.now(), uid)
        await db.prepare(`UPDATE players SET ${updates.join(', ')} WHERE player_id = ?`).bind(...values).run()
      }

      logInfo('User data updated', { requestId, gameId })
      return createJsonResponse({ success: true, requestId }, 200)
    }

    return createJsonResponse({ error: 'unknown_path', message: 'Path not supported', requestId }, 400)

  } catch (error) {
    logError('Database SET error', { requestId, gameId, error: error.message })
    return createJsonResponse({ error: 'database_error', message: 'Database operation failed', requestId }, 500)
  }
}


// ==========================================
// Data: Patch
// Partial profile update for the authenticated owner.
// ==========================================
async function handleDatabasePatch(url, request, gameId, requestId, GAMES, env) {
  const game = validateGameId(gameId, GAMES)
  if (!game) {
    return createJsonResponse({ error: 'invalid_game', message: 'Database not configured for this game', requestId }, 400)
  }

  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) {
    return createJsonResponse({ error: 'unauthorized', message: 'Authorization token required', requestId }, 401)
  }

  const tokenInfo = await verifyIdToken(token)
  if (!tokenInfo) {
    return createJsonResponse({ error: 'invalid_token', message: 'Token is invalid or expired', requestId }, 401)
  }
  const tokenPlayerId = playerIdFromEmail(tokenInfo.email)

  const dbPath = url.pathname.replace('/database/patch/', '')
  const ownerMatch = dbPath.match(/^games\/[^/]+\/users\/([^/]+)/)
  if (ownerMatch && ownerMatch[1] !== tokenPlayerId) {
    return createJsonResponse({ error: 'forbidden', message: 'You can only modify your own data', requestId }, 403)
  }

  const body = await request.text()
  if (!game.d1Binding) {
    return createJsonResponse({ error: 'unsupported_game', message: 'This game does not support PATCH operations', requestId }, 400)
  }

  logInfo('Database PATCH', { requestId, gameId })

  try {
    const db = env[game.d1Binding]
    if (!db) {
      return createJsonResponse({ error: 'db_not_bound', message: `D1 binding "${game.d1Binding}" not found`, requestId }, 500)
    }

    if (!ownerMatch) {
      return createJsonResponse({ error: 'unknown_path', message: 'Path not supported', requestId }, 400)
    }

    let patchData
    try {
      patchData = JSON.parse(body)
    } catch {
      return createJsonResponse({ error: 'invalid_json', message: 'Body must be valid JSON', requestId }, 400)
    }

    const fieldError = applyProfileFields(patchData)
    if (fieldError) {
      return createJsonResponse({ ...fieldError, requestId }, 400)
    }

    const { updates, values } = buildProfileUpdate(patchData, true)
    if (updates.length === 0) {
      return createJsonResponse({ error: 'no_fields', message: 'No valid fields to update', requestId }, 400)
    }

    updates.push('last_login = ?')
    values.push(Date.now(), ownerMatch[1])
    await db.prepare(`UPDATE players SET ${updates.join(', ')} WHERE player_id = ?`).bind(...values).run()

    logInfo('Profile patched', { requestId, gameId })
    return createJsonResponse({ success: true, requestId }, 200)

  } catch (error) {
    logError('Database PATCH error', { requestId, gameId, error: error.message })
    return createJsonResponse({ error: 'database_error', message: 'Database operation failed', requestId }, 500)
  }
}


// ==========================================
// Player Field Mapping
// Shared serialization and update-builder logic for the players table.
// ==========================================
function mapPlayer(player) {
  return {
    uid: player.player_id,
    email: player.email,
    username: player.username,
    displayName: player.username,
    photoURL: player.profile_pic_url,
    highScore: player.high_score,
    gamesPlayed: player.games_played,
    totalPlayTime: player.total_play_time,
    selectedColor: player.selected_color,
    purchasedColors: JSON.parse(player.purchased_colors || '["FFFFFF"]'),
    purchasedItems: JSON.parse(player.purchased_items || '{}'),
    createdAt: player.created_at,
    lastLogin: player.last_login
  }
}

// Validates fields that have constraints. Returns an error object to send back,
// or null when the data is acceptable.
function applyProfileFields(data) {
  if (data.username !== undefined) {
    const usernameError = validateUsername(data.username)
    if (usernameError) {
      return {
        error: usernameError.errorCode,
        messagePersian: usernameError.messagePersian,
        messageEnglish: usernameError.messageEnglish,
        messageJapanese: usernameError.messageJapanese
      }
    }
  }
  return null
}

// Builds the column/value lists for an UPDATE from a profile payload.
function buildProfileUpdate(data, includeGamesPlayed = false) {
  const updates = []
  const values = []
  const push = (column, value) => { updates.push(`${column} = ?`); values.push(value) }

  if (data.username !== undefined) push('username', data.username)
  if (data.selectedColor !== undefined) push('selected_color', data.selectedColor)
  if (data.purchasedColors !== undefined) push('purchased_colors', JSON.stringify(data.purchasedColors))
  if (data.purchasedItems !== undefined) push('purchased_items', JSON.stringify(data.purchasedItems))
  if (data.totalPlayTime !== undefined) push('total_play_time', data.totalPlayTime)
  if (includeGamesPlayed && data.gamesPlayed !== undefined) push('games_played', data.gamesPlayed)

  return { updates, values }
}


// ==========================================
// Static Asset Handler (R2)
// Serves immutable assets from the bound R2 bucket with path-traversal guards.
// ==========================================
async function handleAsset(url, request, gameId, requestId, GAMES, env) {
  const key = decodeURIComponent(url.pathname.replace('/assets/', ''))
  if (!key || key.includes('..') || key.includes('/')) {
    return createJsonResponse({ error: 'invalid_asset', message: 'Invalid asset path', requestId }, 400)
  }

  const bucket = env.ASSETS
  if (!bucket) {
    return createJsonResponse({ error: 'r2_not_bound', message: 'R2 binding "ASSETS" not found', requestId }, 500)
  }

  const object = await bucket.get(key)
  if (!object) {
    return createJsonResponse({ error: 'asset_not_found', message: `Asset "${key}" not found`, requestId }, 404)
  }

  const extMap = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon'
  }
  const ext = key.split('.').pop().toLowerCase()
  const contentType = object.httpMetadata?.contentType || extMap[ext] || 'application/octet-stream'

  return new Response(object.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'ETag': object.httpEtag
    }
  })
}


// ==========================================
// Auth Flow Pages - i18n
// Strings for the redirect, success, error and profile pages in all three
// supported languages. Add a language by adding one block here.
// ==========================================
const AUTH_I18N = {
  fa: {
    locale: 'fa-IR',
    langName: 'فارسی',
    themeToLight: 'حالت روشن',
    themeToDark: 'حالت تاریک',
    redirectTitle: 'در حال انتقال به Google',
    redirectBody: 'در حال انتقال به صفحه ورود امن Google…',
    pleaseWait: 'لطفاً منتظر بمانید',
    continueManually: 'اگر به‌صورت خودکار منتقل نشدید، اینجا کلیک کنید',
    authSuccess: 'ورود موفقیت‌آمیز بود',
    secureBadge: 'اتصال امن',
    copyCode: 'کپی کردن کد',
    copied: 'کد کپی شد',
    codeReady: 'کد ورود شما آماده است',
    backToGame: 'بازگشت به بازی',
    backToSite: 'بازگشت به سایت',
    canClose: 'می‌توانید این پنجره را ببندید',
    transferring: 'در حال انتقال اطلاعات به بازی…',
    gameReady: 'بازی آماده است؛ این پنجره را ببندید',
    returningToGame: 'در حال بازگشت به بازی…',
    manualReturn: 'بازگشت دستی به بازی',
    signInError: 'خطا در ورود',
    errorCode: 'کد خطا',
    errorBody: 'در فرآیند احراز هویت خطایی رخ داد.',
    tryAgain: 'لطفاً دوباره تلاش کنید یا با پشتیبانی تماس بگیرید.',
    close: 'بستن',
    sessionExpired: 'جلسه منقضی شده است',
    expiredBody: 'زمان درخواست شما به پایان رسیده است.',
    tryAgainShort: 'لطفاً دوباره تلاش کنید.',
    profile: 'پروفایل',
    highScore: 'بالاترین امتیاز',
    gamesPlayed: 'بازی‌های انجام‌شده',
    accountInfo: 'اطلاعات حساب',
    userId: 'شناسه کاربری',
    lastLogin: 'آخرین ورود',
    joined: 'تاریخ ثبت‌نام',
    backHome: 'بازگشت به خانه',
    enterGame: 'ورود به بازی',
    gameNotFound: 'بازی پیدا نشد.',
    userIdRequired: 'شناسه کاربر الزامی است.',
    userNotFound: 'کاربر یافت نشد.',
    serverError: 'خطای داخلی سرور رخ داد.',
    gameNotSupported: 'این بازی پشتیبانی نمی‌شود.'
  },
  en: {
    locale: 'en-US',
    langName: 'English',
    themeToLight: 'Light mode',
    themeToDark: 'Dark mode',
    redirectTitle: 'Redirecting to Google',
    redirectBody: 'Redirecting to Google’s secure sign-in…',
    pleaseWait: 'Please wait',
    continueManually: 'If you are not redirected automatically, click here',
    authSuccess: 'Signed in successfully',
    secureBadge: 'Secure connection',
    copyCode: 'Copy code',
    copied: 'Code copied',
    codeReady: 'Your sign-in code is ready',
    backToGame: 'Back to game',
    backToSite: 'Back to site',
    canClose: 'You can close this window',
    transferring: 'Transferring data to the game…',
    gameReady: 'The game is ready. You can close this window.',
    returningToGame: 'Returning to the game…',
    manualReturn: 'Return to the game manually',
    signInError: 'Sign-in error',
    errorCode: 'Error code',
    errorBody: 'Something went wrong during authentication.',
    tryAgain: 'Please try again or contact support.',
    close: 'Close',
    sessionExpired: 'Session expired',
    expiredBody: 'Your request has timed out.',
    tryAgainShort: 'Please try again.',
    profile: 'Profile',
    highScore: 'High score',
    gamesPlayed: 'Games played',
    accountInfo: 'Account information',
    userId: 'User ID',
    lastLogin: 'Last login',
    joined: 'Joined',
    backHome: 'Back home',
    enterGame: 'Enter game',
    gameNotFound: 'Game not found.',
    userIdRequired: 'User ID is required.',
    userNotFound: 'User not found.',
    serverError: 'An internal server error occurred.',
    gameNotSupported: 'This game is not supported.'
  },
  ja: {
    locale: 'ja-JP',
    langName: '日本語',
    themeToLight: 'ライトモード',
    themeToDark: 'ダークモード',
    redirectTitle: 'Google にリダイレクトしています',
    redirectBody: 'Google の安全なサインインに移動しています…',
    pleaseWait: 'お待ちください',
    continueManually: '自動的に移動しない場合はこちらをクリック',
    authSuccess: 'サインインに成功しました',
    secureBadge: '安全な接続',
    copyCode: 'コードをコピー',
    copied: 'コードをコピーしました',
    codeReady: 'サインインコードの準備ができました',
    backToGame: 'ゲームに戻る',
    backToSite: 'サイトに戻る',
    canClose: 'このウィンドウを閉じてかまいません',
    transferring: 'ゲームにデータを転送しています…',
    gameReady: 'ゲームの準備ができました。このウィンドウを閉じてください。',
    returningToGame: 'ゲームに戻っています…',
    manualReturn: '手動でゲームに戻る',
    signInError: 'サインインエラー',
    errorCode: 'エラーコード',
    errorBody: '認証中に問題が発生しました。',
    tryAgain: 'もう一度お試しいただくか、サポートにお問い合わせください。',
    close: '閉じる',
    sessionExpired: 'セッションが期限切れです',
    expiredBody: 'リクエストがタイムアウトしました。',
    tryAgainShort: 'もう一度お試しください。',
    profile: 'プロフィール',
    highScore: 'ハイスコア',
    gamesPlayed: 'プレイ回数',
    accountInfo: 'アカウント情報',
    userId: 'ユーザーID',
    lastLogin: '最終ログイン',
    joined: '登録日',
    backHome: 'ホームに戻る',
    enterGame: 'ゲームに入る',
    gameNotFound: 'ゲームが見つかりません。',
    userIdRequired: 'ユーザーIDが必要です。',
    userNotFound: 'ユーザーが見つかりません。',
    serverError: 'サーバー内部エラーが発生しました。',
    gameNotSupported: 'このゲームはサポートされていません。'
  }
}

function authText(lang, key) {
  const pack = AUTH_I18N[resolveLang(lang)]
  return pack[key] != null ? pack[key] : AUTH_I18N[LANGUAGES.default][key]
}


// ==========================================
// Auth Flow Pages - Shared Chrome
// Inline SVG icons, the pre-paint theme bootstrap, and a tiny runtime that
// powers the language/theme controls without a heavy client bundle.
// ==========================================
const PAGE_ICONS = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16.5" x2="12" y2="16.5"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  contrast: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor" stroke="none"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'
}

function themeBootScript() {
  return `<script>(function(){try{var t=localStorage.getItem('ac_theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>`
}

function chromeScript() {
  return `<script>
    (function(){
      function applyLabel(){
        var b=document.getElementById('themeBtn'); if(!b) return;
        var dark=document.documentElement.getAttribute('data-theme')==='dark'||
                 (!document.documentElement.getAttribute('data-theme')&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);
        b.setAttribute('aria-label', b.getAttribute(dark?'data-to-light':'data-to-dark')||'');
      }
      window.acToggleTheme=function(){
        var cur=document.documentElement.getAttribute('data-theme');
        var dark=cur==='dark'||(!cur&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);
        var next=dark?'light':'dark';
        document.documentElement.setAttribute('data-theme',next);
        try{localStorage.setItem('ac_theme',next);}catch(e){}
        document.cookie='theme='+next+';path=/;max-age=31536000;samesite=lax';
        applyLabel();
      };
      window.acSetLang=function(code){
        try{localStorage.setItem('ac_lang',code);}catch(e){}
        document.cookie='lang='+code+';path=/;max-age=31536000;samesite=lax';
        var u=new URL(window.location.href); u.searchParams.set('lang',code); window.location.href=u.toString();
      };
      applyLabel();
    })();
  </script>`
}

function renderTopbar(lang) {
  const current = resolveLang(lang)
  const seg = LANGUAGES.supported.map(code =>
    `<button type="button" lang="${code}" aria-pressed="${code === current ? 'true' : 'false'}" onclick="acSetLang('${code}')">${escapeHtml(AUTH_I18N[code].langName)}</button>`
  ).join('')

  return `
    <div class="ac-topbar">
      <div class="ac-seg" role="group">${seg}</div>
      <button type="button" id="themeBtn" class="ac-icon-btn" onclick="acToggleTheme()"
              data-to-dark="${escapeHtml(authText(lang, 'themeToDark'))}"
              data-to-light="${escapeHtml(authText(lang, 'themeToLight'))}">${PAGE_ICONS.contrast}</button>
    </div>`
}

// Auth-page-specific styles layered on top of the shared design system.
function authPageCSS() {
  return `
    body { display: flex; flex-direction: column; align-items: center; }
    .ac-topbar {
      width: 100%; max-width: var(--maxw); margin-inline: auto;
      display: flex; justify-content: flex-end; align-items: center; gap: 12px; margin-block-end: 18px;
    }
    .ac-seg { display: inline-flex; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
    .ac-seg button {
      border: none; background: transparent; color: var(--text-dim); font: inherit; font-weight: 600;
      padding: 7px 12px; cursor: pointer; transition: color 0.2s ease, background 0.2s ease;
    }
    .ac-seg button[aria-pressed="true"] { color: #fff; background: var(--accent); }
    .ac-icon-btn {
      width: 40px; height: 40px; display: inline-flex; align-items: center; justify-content: center;
      border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--text);
      cursor: pointer; transition: transform 0.2s ease, background 0.2s ease;
    }
    .ac-icon-btn:hover { transform: translateY(-2px); }
    .ac-icon-btn svg { width: 20px; height: 20px; }
    .ac-card { max-width: 540px; width: 100%; text-align: center; }
    .ac-status-icon {
      width: 92px; height: 92px; margin: 6px auto 18px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center; border: 3px solid currentColor;
    }
    .ac-status-icon svg { width: 46px; height: 46px; }
    .ac-status-icon.ok { color: var(--ok); }
    .ac-status-icon.err { color: var(--err); }
    .ac-status-icon.warn { color: var(--warn); }
    .ac-game-name { font-size: 1.15em; font-weight: 700; margin-block: 4px 14px; color: var(--text); }
    .ac-badge {
      display: inline-flex; align-items: center; gap: 7px; padding: 6px 14px; border-radius: 20px;
      font-size: 0.85em; font-weight: 700; color: var(--ok);
      background: rgba(var(--ok-rgb), 0.16); border: 1px solid rgba(var(--ok-rgb), 0.5);
    }
    .ac-badge svg { width: 15px; height: 15px; }
    .ac-spinner {
      width: 54px; height: 54px; margin: 22px auto; border-radius: 50%;
      border: 5px solid var(--border); border-top-color: var(--accent); animation: acSpin 0.8s linear infinite;
    }
    .ac-muted { color: var(--text-dim); font-size: 0.95em; margin-block-start: 10px; }
    .ac-status-text { font-size: 1.05em; margin-block-start: 8px; }
    @keyframes acSpin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .ac-spinner { animation-duration: 0.001ms; } }
  `
}

// Base shell every auth-flow page shares: head, design tokens, chrome, body.
function renderAuthShell({ title, lang, theme, brandColor, body, script = '', includeChrome = true }) {
  const code = resolveLang(lang)
  const dir = dirFor(code)
  const themeAttr = theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : ''

  return `<!DOCTYPE html>
<html lang="${code}" dir="${dir}"${themeAttr}>
<head>
  ${getPageHead({ title, amirLogo: CONFIG.AMIR_LOGO })}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  ${themeBootScript()}
  <style>${getSharedCSS(brandColor)}${authPageCSS()}</style>
</head>
<body>
  ${includeChrome ? renderTopbar(lang) : ''}
  <div class="container ac-card">
    ${body}
  </div>
  ${includeChrome ? chromeScript() : ''}
  ${script}
</body>
</html>`
}


// ==========================================
// Page: Redirect to Google
// Localized interstitial that forwards the browser to Google's sign-in.
// ==========================================
function renderRedirectPage(googleAuthUrl, game, lang, theme) {
  const safeUrl = escapeHtml(googleAuthUrl)
  const body = `
    ${getLogosHTML(CONFIG.AMIR_LOGO, game.logo, game.name)}
    <h1>${escapeHtml(authText(lang, 'redirectTitle'))}</h1>
    <div class="ac-game-name">${escapeHtml(game.name)}</div>
    <div class="ac-spinner"></div>
    <p class="ac-status-text">${escapeHtml(authText(lang, 'redirectBody'))}</p>
    <p class="ac-muted">${escapeHtml(authText(lang, 'pleaseWait'))}</p>
    <div class="btn-container">
      <a class="btn" href="${safeUrl}" rel="nofollow">${escapeHtml(authText(lang, 'continueManually'))}</a>
    </div>`
  const script = `<script>
    setTimeout(function(){ window.location.href = ${jsString(googleAuthUrl)}; }, ${CONFIG.REDIRECT_TIMEOUT_MS});
  </script>`
  return renderAuthShell({
    title: `${authText(lang, 'redirectTitle')} - AmirCollider Proxy`,
    lang, theme, brandColor: game.color, body, script
  })
}


// ==========================================
// Page: Desktop Success (copy-code)
// Shown to web/desktop callers; auto-copies the code and offers a copy button.
// ==========================================
function renderDesktopSuccessPage(code, game, baseUrl, lang, theme) {
  const body = `
    <div class="ac-status-icon ok">${PAGE_ICONS.check}</div>
    <h1>${escapeHtml(authText(lang, 'authSuccess'))}</h1>
    <div class="ac-game-name">${escapeHtml(game?.name || 'AmirCollider Games')}</div>
    <span class="ac-badge">${PAGE_ICONS.lock}${escapeHtml(authText(lang, 'secureBadge'))}</span>
    <p class="ac-muted" style="margin-block-start:18px;">${escapeHtml(authText(lang, 'codeReady'))}</p>
    <div class="btn-container">
      <button type="button" class="btn" onclick="acCopyCode()">${escapeHtml(authText(lang, 'copyCode'))}</button>
      <a class="btn btn-secondary" href="${escapeHtml(baseUrl)}">${escapeHtml(authText(lang, 'backToSite'))}</a>
    </div>
    <p class="ac-muted" id="copyStatus" style="display:none;"></p>
    <p class="ac-muted" style="margin-block-start:22px;">${escapeHtml(authText(lang, 'canClose'))}</p>`
  const script = `<script>
    var authCode = ${jsString(code)};
    var copiedLabel = ${jsString(authText(lang, 'copied'))};
    function acShowCopied(){ var s=document.getElementById('copyStatus'); if(s){ s.textContent=copiedLabel; s.style.display='block'; } }
    function acFallbackCopy(text){
      var ta=document.createElement('textarea'); ta.value=text; ta.style.position='fixed'; ta.style.opacity='0';
      document.body.appendChild(ta); ta.select();
      try{ document.execCommand('copy'); acShowCopied(); }catch(e){} document.body.removeChild(ta);
    }
    window.acCopyCode=function(){
      if(navigator.clipboard&&navigator.clipboard.writeText){
        navigator.clipboard.writeText(authCode).then(acShowCopied).catch(function(){ acFallbackCopy(authCode); });
      } else { acFallbackCopy(authCode); }
    };
    acCopyCode();
  </script>`
  return renderAuthShell({
    title: `${authText(lang, 'authSuccess')} - AmirCollider Proxy`,
    lang, theme, brandColor: game?.color || '#4caf50', body, script
  })
}


// ==========================================
// Page: Loopback Success (desktop localhost)
// Delivers the code to a local redirect URI used by Unity/desktop loopback.
// ==========================================
function renderLoopbackSuccessPage(code, localRedirectUri, game, lang, theme) {
  const callbackUrl = `${localRedirectUri}?code=${encodeURIComponent(code)}`
  const body = `
    <div class="ac-status-icon ok">${PAGE_ICONS.check}</div>
    <h1>${escapeHtml(authText(lang, 'authSuccess'))}</h1>
    <div class="ac-game-name">${escapeHtml(game.name)}</div>
    <div class="ac-spinner"></div>
    <p class="ac-status-text" id="status">${escapeHtml(authText(lang, 'transferring'))}</p>
    <p class="ac-muted" style="margin-block-start:22px;">${escapeHtml(authText(lang, 'canClose'))}</p>`
  const script = `<script>
    var ready = ${jsString(authText(lang, 'gameReady'))};
    function done(){ var s=document.getElementById('status'); if(s) s.textContent=ready; }
    fetch(${jsString(callbackUrl)}).then(done).catch(done);
  </script>`
  return renderAuthShell({
    title: `${authText(lang, 'authSuccess')} - AmirCollider Proxy`,
    lang, theme, brandColor: game.color, body, script
  })
}


// ==========================================
// Page: Android Success (deep link)
// Opens the game via its registered deep link and offers a manual fallback.
// ==========================================
function renderAndroidSuccessPage(deepLink, game, lang, theme) {
  const body = `
    <div class="ac-status-icon ok">${PAGE_ICONS.check}</div>
    <h1>${escapeHtml(authText(lang, 'authSuccess'))}</h1>
    <div class="ac-game-name">${escapeHtml(game?.name || 'AmirCollider Games')}</div>
    <div class="ac-spinner"></div>
    <p class="ac-status-text">${escapeHtml(authText(lang, 'returningToGame'))}</p>
    <div class="btn-container">
      <button type="button" id="manualOpen" class="btn" style="display:none;" onclick="acOpenGame()">${escapeHtml(authText(lang, 'manualReturn'))}</button>
    </div>
    <p class="ac-muted" style="margin-block-start:22px;">${escapeHtml(authText(lang, 'canClose'))}</p>`
  const script = `<script>
    var deepLink = ${jsString(deepLink)};
    function acShowManual(){ var b=document.getElementById('manualOpen'); if(b) b.style.display='inline-flex'; }
    window.acOpenGame=function(){
      try {
        window.location.href = deepLink;
        setTimeout(function(){ try{ window.open(deepLink,'_self'); }catch(e){} }, 400);
      } catch (e) { acShowManual(); }
    };
    setTimeout(function(){ acOpenGame(); setTimeout(acShowManual, 4000); }, 800);
  </script>`
  return renderAuthShell({
    title: `${authText(lang, 'authSuccess')} - ${game?.name || 'AmirCollider'}`,
    lang, theme, brandColor: game?.color || '#4caf50', body, script
  })
}


// ==========================================
// Page: OAuth Error
// Localized provider-error page with the upstream error code shown safely.
// ==========================================
function renderOAuthErrorPage(error, game, lang, theme) {
  const body = `
    <div class="ac-status-icon err">${PAGE_ICONS.alert}</div>
    <h1>${escapeHtml(authText(lang, 'signInError'))}</h1>
    <p class="version-badge" style="color:var(--err);background:rgba(var(--err-rgb),0.16);border-color:rgba(var(--err-rgb),0.5);">
      ${escapeHtml(authText(lang, 'errorCode'))}: ${escapeHtml(sanitizeInput(error))}
    </p>
    <p class="ac-status-text">${escapeHtml(authText(lang, 'errorBody'))}</p>
    <p class="ac-muted">${escapeHtml(authText(lang, 'tryAgain'))}</p>
    <div class="btn-container">
      <button type="button" class="btn" onclick="window.close()">${escapeHtml(authText(lang, 'close'))}</button>
    </div>`
  return renderAuthShell({
    title: `${authText(lang, 'signInError')} - AmirCollider Proxy`,
    lang, theme, brandColor: game?.color || '#f44336', body
  })
}


// ==========================================
// Page: Expired Session
// Shown when the signed state is invalid or past its expiry window.
// ==========================================
function renderExpiredPage(lang, theme) {
  const body = `
    <div class="ac-status-icon warn">${PAGE_ICONS.clock}</div>
    <h1>${escapeHtml(authText(lang, 'sessionExpired'))}</h1>
    <p class="ac-status-text">${escapeHtml(authText(lang, 'expiredBody'))}</p>
    <p class="ac-muted">${escapeHtml(authText(lang, 'tryAgainShort'))}</p>
    <div class="btn-container">
      <button type="button" class="btn" onclick="window.close()">${escapeHtml(authText(lang, 'close'))}</button>
    </div>`
  return renderAuthShell({
    title: `${authText(lang, 'sessionExpired')} - AmirCollider Proxy`,
    lang, theme, brandColor: '#ff9800', body
  })
}


// ==========================================
// Page: User Profile
// Theme-aware, direction-correct player profile rendered from D1 data.
// ==========================================
function renderProfilePage(userData, game, gameId, lang, theme) {
  const code = resolveLang(lang)
  const locale = AUTH_I18N[code].locale
  const formatDate = value => {
    try { return new Date(value || Date.now()).toLocaleString(locale) } catch { return '' }
  }

  const stats = [
    { value: userData.highScore || 0, label: authText(lang, 'highScore') },
    { value: userData.gamesPlayed || 0, label: authText(lang, 'gamesPlayed') }
  ].map(s => `
      <div class="info-card" style="text-align:center;">
        <div style="font-size:2em;font-weight:800;color:var(--accent);">${escapeHtml(String(s.value))}</div>
        <div class="ac-muted">${escapeHtml(s.label)}</div>
      </div>`).join('')

  const rows = [
    [authText(lang, 'userId'), userData.username],
    [authText(lang, 'lastLogin'), formatDate(userData.lastLogin)],
    [authText(lang, 'joined'), formatDate(userData.createdAt)]
  ].map(([label, value]) => `
      <div class="info-row"><span class="ac-muted">${escapeHtml(label)}</span><span style="font-weight:700;">${escapeHtml(String(value || ''))}</span></div>`).join('')

  const body = `
    <div style="text-align:center;">
      <img src="${escapeHtml(userData.photoURL || '/assets/DefaultGameLogo.png')}" alt=""
           style="width:120px;height:120px;border-radius:50%;border:4px solid var(--surface-2);object-fit:cover;"
           onerror="this.onerror=null;this.src='/assets/DefaultGameLogo.png';">
      <h1 style="margin-block-start:16px;">${escapeHtml(userData.displayName || userData.username)}</h1>
      <p class="ac-muted">${escapeHtml(userData.email || '')}</p>
      <span class="version-badge">${escapeHtml(game.name)}</span>
    </div>

    <div class="info-grid">${stats}</div>

    <div class="info-card">
      <h2 style="margin-block:0 14px;">${escapeHtml(authText(lang, 'accountInfo'))}</h2>
      ${rows}
    </div>

    <div class="btn-container">
      <a class="btn" href="/?lang=${code}">${escapeHtml(authText(lang, 'backHome'))}</a>
      <a class="btn btn-secondary" href="/oauth/auth?game=${escapeHtml(gameId)}">${escapeHtml(authText(lang, 'enterGame'))}</a>
    </div>`

  return renderAuthShell({
    title: `${authText(lang, 'profile')} - ${userData.displayName || userData.username}`,
    lang, theme, brandColor: game.color, body
  })
}
