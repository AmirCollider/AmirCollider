// ==========================================
// Api/OAuthApi.js
// The Google sign-in surface. A stable contract: Unity, the mobile
// app and the web game all depend on these four paths.
//
//   GET  /oauth/auth      start sign-in (web / desktop / android)
//   GET  /oauth/callback  Google returns here
//   POST /oauth/token     exchange an authorization code
//   POST /auth/refresh    refresh an expired session
// ==========================================

import { CONFIG, LANGUAGES, validateGameId } from '../Config.js'
import { createJsonResponse, createHtmlResponse } from '../Core/Http.js'
import { logInfo, logWarning, logError } from '../Core/Logging.js'
import { parseCookies, resolveLang, resolveRequestLang, resolveRequestTheme } from '../Core/RequestContext.js'
import {
  GOOGLE_AUTH_ENDPOINT,
  postTokenGrant,
  providerErrorCode
} from '../Core/GoogleOAuth.js'
import { encodeState, decodeState, getStateSecret, readClientStateHint } from '../Games/OAuthState.js'
import { resolveGame } from '../Games/Registry.js'
import { completeSiteSignIn } from '../Pages/GameAccount.js'
import {
  renderRedirectPage,
  renderAndroidSuccessPage,
  renderLoopbackSuccessPage,
  renderDesktopSuccessPage,
  renderOAuthErrorPage,
  renderExpiredPage
} from '../Pages/AuthFlow.js'


/**
 * Classifies a request as android or web from an explicit param,
 * the redirect scheme, the user agent, or a client state hint.
 */
export function detectAndroid({ explicitPlatform, headerPlatform, redirectUri, userAgent, clientStateHint }) {
  if (explicitPlatform === 'android' || headerPlatform === 'android') return true
  if (redirectUri && redirectUri.includes(':/') && !redirectUri.startsWith('http')) return true
  if (userAgent && /Android/i.test(userAgent)) return true
  if (clientStateHint && (clientStateHint.platform === 'android' || clientStateHint.isAndroid === true)) return true
  return false
}


/**
 * One builder for every platform. Android server-side code exchange
 * requires the Web client id, so it is used for both.
 *
 * A caller may name which of THIS GAME's clients to use; it may not
 * name somebody else's. Anything unrecognised falls back to the web
 * client, which is the one the token exchange uses regardless - so
 * authorising with a different client could only ever have failed
 * one step later, with Google reporting "redirect_uri_mismatch"
 * against a redirect URI that was fine.
 */
function buildGoogleAuthUrl(url, game, stateValue, isAndroid, lang) {
  const requested = url.searchParams.get('client_id')
  const known = [game.oauth.web, game.oauth.android].filter(Boolean)
  const clientId = !isAndroid && requested && known.includes(requested) ? requested : game.oauth.web

  const authUrl = new URL(GOOGLE_AUTH_ENDPOINT)
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', `${url.origin}/oauth/callback`)
  authUrl.searchParams.set('response_type', url.searchParams.get('response_type') || 'code')
  authUrl.searchParams.set('scope', url.searchParams.get('scope') || 'openid profile email')
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent')
  authUrl.searchParams.set('hl', resolveLang(lang))
  authUrl.searchParams.set('state', stateValue)
  return authUrl
}


// ==========================================
// GET /oauth/auth
// Validates the request, classifies the platform, issues a signed
// state, and hands off to Google via a localized redirect page.
// ==========================================
export async function handleOAuthAuth(url, request, gameId, requestId, GAMES, env) {
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
  const cookies = parseCookies(request)
  const lang = resolveRequestLang(url, request, cookies)
  const theme = resolveRequestTheme(cookies)

  const isAndroid = detectAndroid({
    explicitPlatform: url.searchParams.get('platform'),
    redirectUri,
    userAgent: request.headers.get('User-Agent') || '',
    clientStateHint: readClientStateHint(clientState)
  })

  const signedState = await encodeState({
    originalRedirectUri: redirectUri,
    originalState: clientState,
    language: lang,
    isAndroid,
    platform: isAndroid ? 'android' : 'web',
    gameId,
    requestId,
    timestamp: Date.now()
  }, getStateSecret(GAMES, env))

  const authUrl = buildGoogleAuthUrl(url, game, signedState, isAndroid, lang)
  logInfo('OAuth authorization started', { requestId, gameId, platform: isAndroid ? 'android' : 'web' })

  return createHtmlResponse(renderRedirectPage(authUrl.toString(), game, lang, theme))
}


// ==========================================
// GET /oauth/callback
// Verifies the signed state, then delivers the authorization code
// by platform: android deep link, desktop loopback, or copy page.
// ==========================================
export async function handleOAuthCallback(url, request, gameId, requestId, GAMES, env) {
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const oauthError = url.searchParams.get('error')
  const theme = resolveRequestTheme(parseCookies(request))

  const decoded = await decodeState(state, getStateSecret(GAMES, env))
  if (state && !decoded.valid) {
    logWarning('Invalid OAuth state', { requestId })
    return createHtmlResponse(renderExpiredPage(LANGUAGES.default, theme))
  }

  const stateData = decoded.data || {
    language: LANGUAGES.default,
    isAndroid: false,
    gameId: Object.keys(GAMES)[0]
  }
  const lang = resolveLang(stateData.language)
  const game = validateGameId(stateData.gameId, GAMES)

  if (stateData.timestamp && (Date.now() - stateData.timestamp) > CONFIG.STATE_EXPIRY_MS) {
    logWarning('State expired', { requestId, gameId: stateData.gameId })
    return createHtmlResponse(renderExpiredPage(lang, theme))
  }

  // The website's own sign-in, handled before the checks below
  // because it has neither: there is no client redirect_uri to
  // deliver a code to, and a refusal at Google should land the
  // player back on the button rather than on an error document.
  if (stateData.purpose === 'site') {
    if (oauthError || !code) {
      logWarning('Site sign-in returned without a code', { requestId, error: oauthError || 'no_code' })
      return Response.redirect(`${url.origin}/${encodeURIComponent(stateData.gameId || '')}/account?error=1`, 302)
    }
    return completeSiteSignIn(url, request, stateData, code, GAMES, env)
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

  logInfo('OAuth callback received', {
    requestId,
    gameId: stateData.gameId,
    platform: stateData.isAndroid ? 'android' : 'web'
  })

  if (stateData.isAndroid) {
    // Resolved through the override layer rather than read off the
    // frozen registry: the deep-link scheme is something the TheGod
    // panel can correct, and reading it from GAMES here would mean
    // the panel showed the new value while the callback kept
    // sending players to the old one. Falls back to `game` on any
    // failure - a database that is down cannot break a sign-in that
    // never needed it.
    const resolved = (await resolveGame(env, GAMES, stateData.gameId)) || game
    const deepLink = `${resolved.deepLink.scheme}://${resolved.deepLink.host}?code=${encodeURIComponent(code)}`
    return createHtmlResponse(renderAndroidSuccessPage(deepLink, resolved, lang, theme))
  }

  if (stateData.originalRedirectUri.startsWith('http://localhost')) {
    return createHtmlResponse(renderLoopbackSuccessPage(code, stateData.originalRedirectUri, game, lang, theme))
  }

  return createHtmlResponse(renderDesktopSuccessPage(code, game, url.origin, lang, theme))
}


// ==========================================
// POST /oauth/token
// Swaps an authorization code for tokens. The upstream error body
// is logged server-side but never returned: the client sees a
// stable error code and the upstream status, nothing more.
// ==========================================
export async function handleTokenExchange(url, request, gameId, requestId, GAMES) {
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

  const platform = detectAndroid({
    explicitPlatform: params.get('platform'),
    headerPlatform: request.headers.get('X-Platform'),
    redirectUri: params.get('redirect_uri')
  }) ? 'android' : 'web'

  const clientId = game.oauth.web
  const clientSecret = game.oauth.secret
  if (!clientId || !clientSecret) {
    logError('OAuth client not configured', { requestId, gameId })
    return createJsonResponse({ error: 'configuration_error', message: 'OAuth client not configured', requestId }, 500)
  }

  try {
    const googleResponse = await postTokenGrant({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${url.origin}/oauth/callback`,
      grant_type: 'authorization_code'
    }, { 'User-Agent': `${game.name}-Proxy/${CONFIG.VERSION}` })

    const responseText = await googleResponse.text()

    if (!googleResponse.ok) {
      logError('Token exchange rejected by provider', {
        requestId, gameId, platform,
        status: googleResponse.status,
        providerError: providerErrorCode(responseText)
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

    logInfo('Token exchanged', { requestId, gameId, platform })
    return createJsonResponse(tokens, 200)

  } catch (error) {
    logError('Token exchange network error', { requestId, gameId, error: error.message })
    return createJsonResponse({ error: 'network_error', message: 'Upstream request failed', requestId }, 502)
  }
}


// ==========================================
// POST /auth/refresh
// Exchanges a refresh token for a fresh id_token.
// ==========================================
export async function handleRefreshToken(url, request, gameId, requestId, GAMES) {
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
    const tokenResponse = await postTokenGrant({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: game.oauth.web,
      client_secret: game.oauth.secret
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
