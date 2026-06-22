// ==========================================
// OAuth Proxy v6.7.3 - Secure Version
// AmirCollider Games - Environment Variables
// ==========================================

import { getSharedCSS, getLogosHTML, getPageHead } from './shared-styles.js'
import { CONFIG, SECURITY, CORS_HEADERS, getGamesConfig } from './config.js'
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
// Username Validation
// ==========================================
const PROFANITY_LIST = [
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'damn', 'cunt',
  'cock', 'dick', 'pussy', 'ass', 'piss', 'crap', 'slut', 'whore',
  'faggot', 'nigger', 'nigga', 'retard', 'nazi', 'kike', 'spic',
  'fag', 'homo', 'rape', 'kill', 'sex', 'porn', 'nude', 'naked',
  'jerk', 'idiot', 'moron', 'loser', 'stupid', 'dumb', 'ugly'
]

function validateUsername(username) {
  if (typeof username !== 'string') {
    return {
      errorCode: 'username_invalid',
      messagePersian: 'نام کاربری نامعتبر است',
      messageEnglish: 'Invalid username'
    }
  }

  if (username.length < 3 || username.length > 12) {
    return {
      errorCode: 'username_too_long',
      messagePersian: 'نام کاربری باید بین ۳ تا ۱۲ حرف باشد',
      messageEnglish: 'Username must be between 3 and 12 characters'
    }
  }

  if (!/^[A-Za-z0-9]+$/.test(username)) {
    if (/\s/.test(username)) {
      return {
        errorCode: 'username_has_space',
        messagePersian: 'از فاصله یا نماد ها نمیتوان استفاده کرد',
        messageEnglish: 'Spaces or symbols are not allowed'
      }
    }
    return {
      errorCode: 'username_invalid_chars',
      messagePersian: 'فقط از حروف و اعداد انگلیسی استفاده شود',
      messageEnglish: 'Only English letters and numbers are allowed'
    }
  }

  const lower = username.toLowerCase()
  const hasProfanity = PROFANITY_LIST.some(word => lower.includes(word))
  if (hasProfanity) {
    return {
      errorCode: 'username_profanity',
      messagePersian: 'استفاده از الفاظ نامناسب مجاز نیست',
      messageEnglish: 'Inappropriate language is not allowed'
    }
  }

  return null
}

// ==========================================
// Main Request Handler
// ==========================================
async function handleRequest(request, env, ctx) {
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown'
  
  try {
    validateEnvironmentVariables(env)
  } catch (error) {
    logError('Environment validation failed', { error: error.message })
    return createJsonResponse({
      error: 'configuration_error',
      message: 'Server configuration incomplete. Please contact administrator.',
      details: error.message
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

  const logContext = {
    requestId,
    gameId,
    path,
    method: request.method,
    ip: clientIP,
    timestamp: new Date().toISOString()
  }

  try {
    logInfo('Request received', logContext)

    const route = matchRoute(path, request.method)
    if (!route) {
      const routeExistsWithDifferentMethod = ROUTES.some(r => {
        if (r.prefix) return path.startsWith(r.path)
        if (r.dynamic) {
          const pattern = r.path.replace(/:\w+/g, '([^/]+)')
          return new RegExp(`^${pattern}$`).test(path)
        }
        return r.path === path
      })

      if (routeExistsWithDifferentMethod) {
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

const finalHeaders = new Headers(response.headers)
Object.entries(CORS_HEADERS).forEach(([key, value]) => finalHeaders.set(key, value))
Object.entries(SECURITY.SECURE_HEADERS).forEach(([key, value]) => finalHeaders.set(key, value))
finalHeaders.set('X-Request-ID', requestId)
finalHeaders.set('X-Proxy-Version', CONFIG.VERSION)

const finalResponse = new Response(response.body, {
  status: response.status,
  statusText: response.statusText,
  headers: finalHeaders
})

logInfo('Request completed', { ...logContext, status: finalResponse.status })
return finalResponse

  } catch (error) {
    logError('Request failed', { ...logContext, error: error.message, stack: error.stack })
    
    const defaultGame = {
      name: 'AmirCollider Games',
      icon: '🎮',
      color: '#f44336',
      logo: 'https://drive.google.com/thumbnail?id=1kwjfUTVmbHOtJbl0DbXoOq9-BWitQBnw&sz=w200'
    };
    
    return createErrorResponse(error, requestId, defaultGame)
  }
}

async function handleDatabasePatch(url, request, gameId, requestId, GAMES, envVars) {
  const game = validateGameId(gameId, GAMES)
  if (!game) {
    return createJsonResponse({
      error: 'invalid_game',
      message: 'Database not configured for this game',
      requestId
    }, 400)
  }

  const token = request.headers.get('Authorization')?.replace('Bearer ', '')

if (!token) {
  return createJsonResponse({
    error: 'unauthorized',
    message: 'Authorization token required',
    requestId
  }, 401)
}

const tokenInfoResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`)
const tokenInfo = await tokenInfoResponse.json()

if (!tokenInfoResponse.ok || tokenInfo.error_description) {
  return createJsonResponse({
    error: 'invalid_token',
    message: 'Token is invalid or expired',
    requestId
  }, 401)
}

const tokenPlayerId = tokenInfo.email.split('@')[0].toLowerCase().substring(0, 15)

const dbPath = url.pathname.replace('/database/patch/', '')
const userMatch = dbPath.match(/^games\/[^/]+\/users\/([^/]+)/)
if (userMatch && userMatch[1] !== tokenPlayerId) {
  return createJsonResponse({
    error: 'forbidden',
    message: 'You can only modify your own data',
    requestId
  }, 403)
}
  const body = await request.text()

  logInfo('Database PATCH request', { requestId, gameId, path: dbPath, bodyLength: body.length })

  // ── D1 path: neon-katana ────────────────────────────────
  if (game.d1Binding) {
    const db = envVars[game.d1Binding]

    if (!db) {
      return createJsonResponse({
        error: 'db_not_bound',
        message: `D1 binding "${game.d1Binding}" پیدا نشد`,
        requestId
      }, 500)
    }

    try {
      let patchData
      try {
        patchData = JSON.parse(body)
      } catch {
        return createJsonResponse({ error: 'invalid_json', message: 'Body must be valid JSON', requestId }, 400)
      }

      const d1UserMatch = dbPath.match(/^games\/[^/]+\/users\/([^/]+)/)
if (!d1UserMatch) {
        return createJsonResponse({
          error: 'unknown_path',
          message: `Path not supported for D1: ${dbPath}`,
          requestId
        }, 400)
      }

      const uid = d1UserMatch[1]
      const updates = []
      const values = []

      if (patchData.username !== undefined) {
        const usernameError = validateUsername(patchData.username)
        if (usernameError) {
          return createJsonResponse({
            error: usernameError.errorCode,
            messagePersian: usernameError.messagePersian,
            messageEnglish: usernameError.messageEnglish,
            requestId
          }, 400)
        }
        updates.push('username = ?')
        values.push(patchData.username)
      }
      if (patchData.selectedColor !== undefined)   { updates.push('selected_color = ?');   values.push(patchData.selectedColor) }
      if (patchData.purchasedColors !== undefined) { updates.push('purchased_colors = ?'); values.push(JSON.stringify(patchData.purchasedColors)) }
      if (patchData.purchasedItems !== undefined)  { updates.push('purchased_items = ?');  values.push(JSON.stringify(patchData.purchasedItems)) }
      if (patchData.totalPlayTime !== undefined)   { updates.push('total_play_time = ?');  values.push(patchData.totalPlayTime) }
      if (patchData.gamesPlayed !== undefined)     { updates.push('games_played = ?');     values.push(patchData.gamesPlayed) }

      if (updates.length === 0) {
        return createJsonResponse({ error: 'no_fields', message: 'No valid fields to update', requestId }, 400)
      }

      updates.push('last_login = ?')
      values.push(Date.now())
      values.push(uid)

      await db.prepare(`
        UPDATE players SET ${updates.join(', ')} WHERE player_id = ?
      `).bind(...values).run()

      logInfo('✅ D1 PATCH completed', { requestId, gameId, uid, fields: updates.length })

      return createJsonResponse({ success: true, requestId }, 200)

    } catch (error) {
      logError('D1 PATCH error', { requestId, gameId, path: dbPath, error: error.message })
      return createJsonResponse({ error: 'database_error', message: error.message, requestId }, 500)
    }
  }

  return createJsonResponse({ error: 'unsupported_game', message: 'This game does not support PATCH operations', requestId }, 400)
}

// ==========================================
// Routing Configuration
// ==========================================
const ROUTES = [
  { path: '/', method: 'GET', handler: handleDashboard },
{ path: '/testsite', method: 'GET', handler: handleTestSite },
{ path: '/testsite/login', method: 'GET', handler: handleTestSiteLogin },
{ path: '/testsite/login', method: 'POST', handler: handleTestSiteLoginPost },
{ path: '/testsite/logout', method: 'POST', handler: handleTestSiteLogout },
  { path: '/metrics', method: 'GET', handler: handleMetrics },
  { path: '/assets/', method: 'GET', handler: handleAsset, prefix: true },
  { path: '/:gameId/health', method: 'GET', handler: handleHealthWithUI, dynamic: true },
  { path: '/:gameId/ping', method: 'GET', handler: handlePingWithUI, dynamic: true },
  { path: '/database/patch/', method: 'PATCH', handler: handleDatabasePatch, prefix: true },
  { path: '/database/patch/', method: 'POST', handler: handleDatabasePatch, prefix: true },
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
  { path: '/database/set/', method: 'PUT', handler: handleDatabaseSet, prefix: true }
]

// ==========================================
// Enhanced Route Matcher 
// ==========================================
function matchRoute(path, method) {
  const staticRoute = ROUTES.find(route => {
    if (route.dynamic) return false
    if (route.prefix) {
      return path.startsWith(route.path) && route.method === method
    }
    return route.path === path && route.method === method
  })
  
  if (staticRoute) return staticRoute
  
  const dynamicRoute = ROUTES.find(route => {
    if (!route.dynamic) return false
    const pattern = route.path.replace(/:\w+/g, '([^/]+)')
    const regex = new RegExp(`^${pattern}$`)
    return regex.test(path) && route.method === method
  })
  
  if (dynamicRoute) {
    const pattern = dynamicRoute.path.replace(/:\w+/g, '([^/]+)')
    const regex = new RegExp(`^${pattern}$`)
    const matches = path.match(regex)
    
    const params = {}
    if (matches) {
      const paramNames = (dynamicRoute.path.match(/:\w+/g) || []).map(p => p.slice(1))
      paramNames.forEach((name, index) => {
        params[name] = decodeURIComponent(matches[index + 1])
      })
    }
    return { ...dynamicRoute, params }
  }
  
  return null
}

// ==========================================
// Auth Handlers
// ==========================================
async function handleValidateToken(url, request, gameId, requestId, GAMES, envVars) {
  const game = validateGameId(gameId, GAMES)
  if (!game) {
    return createJsonResponse({
      error: 'invalid_game',
      message: 'Game configuration not found',
      valid: false,
      requestId
    }, 400)
  }

  const token = request.headers.get('Authorization')?.replace('Bearer ', '')

  if (!token) {
    return createJsonResponse({
      error: 'missing_token',
      message: 'Authorization token is required',
      valid: false,
      requestId
    }, 401)
  }

  let body
  try {
    body = await request.json()
  } catch (e) {
    return createJsonResponse({
      error: 'invalid_json',
      message: 'Request body must be valid JSON',
      valid: false,
      requestId
    }, 400)
  }

  const { uid } = body

  if (!uid) {
    return createJsonResponse({
      error: 'missing_uid',
      message: 'User ID is required',
      valid: false,
      requestId
    }, 400)
  }

  try {
    // ── D1 path: neon-katana ──────────────────────────────
    if (game.d1Binding) {
      const tokenInfoResponse = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${token}`
      )
      const tokenInfo = await tokenInfoResponse.json()

      if (!tokenInfoResponse.ok || tokenInfo.error_description) {
        logWarning('Token validation failed', { requestId, gameId, uid })
        return createJsonResponse({
          valid: false,
          error: 'invalid_token',
          message: tokenInfo.error_description || 'Invalid token',
          requestId
        }, 200)
      }

      const db = envVars[game.d1Binding]
      const player = await db.prepare(`
        SELECT player_id, email, profile_pic_url, username FROM players
        WHERE player_id = ? LIMIT 1
      `).bind(uid).first()

      if (!player) {
        return createJsonResponse({
          valid: false,
          error: 'user_not_found',
          message: 'User not found in database',
          requestId
        }, 200)
      }

      logInfo('Token validated successfully', { requestId, gameId, uid })

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
    }

    return createJsonResponse({ valid: false, error: 'unsupported_game', message: 'Game not supported', requestId }, 400)

  } catch (error) {
    logError('Token validation error', { requestId, gameId, uid, error: error.message })
    return createJsonResponse({
      valid: false,
      error: 'validation_error',
      message: error.message,
      requestId
    }, 500)
  }
}

async function handleCheckUserExists(url, request, gameId, requestId, GAMES, envVars) {
  const game = validateGameId(gameId, GAMES)
  if (!game) {
    return createJsonResponse({
      error: 'invalid_game',
      message: 'Game configuration not found',
      exists: false,
      requestId
    }, 400)
  }

  let body
  try {
    body = await request.json()
  } catch (e) {
    return createJsonResponse({
      error: 'invalid_json',
      message: 'Request body must be valid JSON',
      exists: false,
      requestId
    }, 400)
  }

  const { uid } = body

  if (!uid) {
    return createJsonResponse({
      error: 'missing_uid',
      message: 'User ID is required',
      exists: false,
      requestId
    }, 400)
  }

  const token = request.headers.get('Authorization')?.replace('Bearer ', '')

  if (!token) {
    return createJsonResponse({
      error: 'missing_token',
      message: 'Authorization token is required',
      exists: false,
      requestId
    }, 401)
  }

  try {
    // ── D1 path: neon-katana ──────────────────────────────
    if (game.d1Binding) {
      const db = envVars[game.d1Binding]
      const player = await db.prepare(`
        SELECT player_id, email, username, profile_pic_url
        FROM players WHERE player_id = ? LIMIT 1
      `).bind(uid).first()

      if (!player) {
        return createJsonResponse({
          exists: false,
          message: 'User not found in database',
          requestId
        }, 200)
      }

      logInfo('User exists in D1', { requestId, gameId, uid })

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
    }

    return createJsonResponse({ exists: false, error: 'unsupported_game', message: 'Game not supported', requestId }, 400)

  } catch (error) {
    logError('Check user error', { requestId, gameId, uid, error: error.message })
    return createJsonResponse({
      exists: false,
      error: 'check_error',
      message: error.message,
      requestId
    }, 500)
  }
}

async function handleUserProfile(url, request, gameId, requestId, GAMES, envVars) {
  const game = validateGameId(gameId, GAMES)
  if (!game) {
    return createHtmlResponse(createErrorPage('بازی پیدا نشد', game), 404)
  }

  const uid = url.pathname.replace('/profile/', '')

  if (!uid) {
    return createHtmlResponse(createErrorPage('شناسه کاربر الزامی است', game), 400)
  }

  try {
    // ── D1 path: neon-katana ──────────────────────────────
    if (game.d1Binding) {
      const db = envVars[game.d1Binding]
      const player = await db.prepare(`
        SELECT * FROM players WHERE player_id = ? LIMIT 1
      `).bind(uid).first()

      if (!player) {
        return createHtmlResponse(createErrorPage('کاربر یافت نشد', game), 404)
      }

      const userData = {
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

      return createHtmlResponse(createUserProfilePage(userData, game, gameId))
    }

    return createHtmlResponse(createErrorPage('Game not supported', game), 400)

  } catch (error) {
    logError('Profile fetch error', { requestId, gameId, uid, error: error.message })
    return createHtmlResponse(createErrorPage('خطای سرور', game), 500)
  }
}

// ==========================================
// Static Asset Handler (R2 - amircolliderr2)
// ==========================================
async function handleAsset(url, request, gameId, requestId, GAMES, envVars) {
  const key = decodeURIComponent(url.pathname.replace('/assets/', ''))

  if (!key || key.includes('..') || key.includes('/')) {
    return createJsonResponse({ error: 'invalid_asset', message: 'Invalid asset path', requestId }, 400)
  }

  const bucket = envVars.ASSETS
  if (!bucket) {
    return createJsonResponse({ error: 'r2_not_bound', message: 'R2 binding "ASSETS" not found', requestId }, 500)
  }

  const object = await bucket.get(key)
  if (!object) {
    return createJsonResponse({ error: 'asset_not_found', message: `Asset "${key}" not found`, requestId }, 404)
  }

  const extMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon' }
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
// 1. New Function: Android Auth Logic (FIXED SYNTAX)
// ==========================================
function buildAndroidAuthUrl(url, request, game, stateData, finalRedirectUri) {
  logInfo('🤖 Building Android Auth URL', { 
    requestId: stateData.requestId, 
    gameId: stateData.gameId 
  });

  const detectedClientId = game.oauth.web; // Google requires the Web client_id for server-side code exchange, even on Android
  const scope = url.searchParams.get('scope') || 'openid profile email';
  const responseType = url.searchParams.get('response_type') || 'code';

  const proxyRedirectUri = `${url.origin}/oauth/callback`;

  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleAuthUrl.searchParams.set('client_id', detectedClientId);
  googleAuthUrl.searchParams.set('redirect_uri', proxyRedirectUri);
  googleAuthUrl.searchParams.set('response_type', responseType);
  googleAuthUrl.searchParams.set('scope', scope);
  googleAuthUrl.searchParams.set('access_type', 'offline');
  googleAuthUrl.searchParams.set('prompt', 'consent');
  googleAuthUrl.searchParams.set('hl', 'fa');
  googleAuthUrl.searchParams.set('state', btoa(JSON.stringify(stateData)));

  logInfo('✅ Android Auth URL generated', { 
    requestId: stateData.requestId, 
    gameId: stateData.gameId, 
    clientId: detectedClientId.substring(0, 20) + '...',
    redirectUri: proxyRedirectUri
  });
  
  return googleAuthUrl;
}

// ==========================================
// 2. New Function: Web/Desktop Auth Logic (FIXED SYNTAX)
// ==========================================
function buildWebAuthUrl(url, request, game, stateData, finalRedirectUri) {
  logInfo('💻 Building Web Auth URL', { 
    requestId: stateData.requestId, 
    gameId: stateData.gameId 
  });
  const clientId = url.searchParams.get('client_id') || game.oauth.web;
  const scope = url.searchParams.get('scope') || 'openid profile email';
  const responseType = url.searchParams.get('response_type') || 'code';

  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleAuthUrl.searchParams.set('client_id', clientId);
  googleAuthUrl.searchParams.set('redirect_uri', finalRedirectUri);
  googleAuthUrl.searchParams.set('response_type', responseType);
  googleAuthUrl.searchParams.set('scope', scope);
  googleAuthUrl.searchParams.set('access_type', 'offline');
  googleAuthUrl.searchParams.set('prompt', 'consent');
  googleAuthUrl.searchParams.set('hl', 'fa');
  googleAuthUrl.searchParams.set('state', btoa(JSON.stringify(stateData)));

  logInfo('✅ Web Auth URL generated', { 
    requestId: stateData.requestId, 
    gameId: stateData.gameId, 
    clientId: clientId.substring(0, 20) + '...' 
  });

  return googleAuthUrl;
}

// ==========================================
// OAuth Handlers
// ==========================================
async function handleOAuthAuth(url, request, gameId, requestId, GAMES, envVars) {
  // 1. Validate Game
  const game = validateGameId(gameId, GAMES);
  if (!game) {
    return createJsonResponse({
      error: 'invalid_game',
      message: 'Game configuration not found',
      requestId: requestId
    }, 400);
  }

  // 2. Get initial parameters
  const redirectUri = url.searchParams.get('redirect_uri');
  const state = url.searchParams.get('state') || '';
  const platform = url.searchParams.get('platform');
  const userAgent = request.headers.get('User-Agent') || '';

  if (!redirectUri) {
    logError('Missing redirect_uri', { requestId: requestId, gameId: gameId });
    return createJsonResponse({
      error: 'invalid_request',
      error_description: 'Missing redirect_uri parameter',
      requestId: requestId
    }, 400);
  }

  // 3. --- Platform Detection Logic ---
  const isMobile = /Android|iPhone|iPad|iPod/i.test(userAgent);
  const isAndroidUA = /Android/i.test(userAgent);
  let isAndroid = false;
  let detectedPlatform = 'web'; // Default

  if (platform === 'android') {
    isAndroid = true;
    detectedPlatform = 'android (explicit param)';
  }
  else if (redirectUri.includes(':/') && !redirectUri.startsWith('http')) {
    isAndroid = true;
    detectedPlatform = 'android (deep link)';
  }
  else if (isAndroidUA) {
    isAndroid = true;
    detectedPlatform = 'android (user-agent)';
  }
  else if (state) {
    try {
      const stateData = JSON.parse(atob(state));
      if (stateData.platform === 'android' || stateData.isAndroid === true) {
        isAndroid = true;
        detectedPlatform = 'android (state flag)';
      }
    } catch (e) {
      // Invalid state, ignore
    }
  }
  // --- End of Detection ---

  // 4. Set worker callback and State Data
  const finalRedirectUri = `${url.origin}/oauth/callback`;

  const stateData = {
    originalRedirectUri: redirectUri,
    originalState: state,
    language: 'fa',
    isAndroid: isAndroid,
    isMobile: isMobile,
    platform: isAndroid ? 'android' : 'web',
    gameId: gameId,
    timestamp: Date.now(),
    requestId: requestId,
    userAgent: userAgent.substring(0, 100)
  };

  logInfo('🎯 OAuth Auth initiated', {
    requestId: requestId,
    gameId: gameId,
    originalRedirectUri: redirectUri,
    finalRedirectUri: finalRedirectUri,
    detectedPlatform: detectedPlatform
  });

  let googleAuthUrl;

  if (isAndroid) {
    googleAuthUrl = buildAndroidAuthUrl(url, request, game, stateData, finalRedirectUri);
  } else {
    googleAuthUrl = buildWebAuthUrl(url, request, game, stateData, finalRedirectUri);
  }

  return createHtmlResponse(createAuthRedirectPage(googleAuthUrl.toString(), game, url.origin));
}

async function handleOAuthCallback(url, request, gameId, requestId, GAMES) {
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  let stateData = { 
  language: 'fa', 
  isAndroid: false, 
  originalRedirectUri: '', 
  gameId: Object.keys(GAMES)[0],
  requestId: requestId
}

  try {
    if (state) {
      stateData = JSON.parse(atob(state))
      if (stateData.timestamp && (Date.now() - stateData.timestamp) > CONFIG.STATE_EXPIRY_MS) {
        logWarning('State expired', { requestId, gameId: stateData.gameId })
        return createHtmlResponse(createExpiredStatePage())
      }
    }
  } catch (e) {
    logError('State parsing error', { requestId, error: e.message })
  }

  const game = validateGameId(stateData.gameId, GAMES)

  if (error) {
    logWarning('OAuth error received', { requestId, gameId: stateData.gameId, error })
    return createHtmlResponse(createOAuthErrorPage(error, game))
  }

  if (!code || !stateData.originalRedirectUri) {
    return createJsonResponse({
      error: 'invalid_callback',
      error_description: 'Missing code or redirect URI',
      requestId
    }, 400)
  }

  logInfo('OAuth callback successful', { 
    requestId: stateData.requestId || requestId, 
    gameId: stateData.gameId, 
    isAndroid: stateData.isAndroid 
  })

  if (stateData.isAndroid) {
    const androidScheme = `${game.deepLink.scheme}://${game.deepLink.host}?code=${encodeURIComponent(code)}`
    return createHtmlResponse(createAndroidSuccessPage(androidScheme, game, url.origin))
  }

  if (stateData.originalRedirectUri && stateData.originalRedirectUri.startsWith('http://localhost')) {
  return createHtmlResponse(createPCSuccessPage(code, stateData.originalRedirectUri, game))
}
return createHtmlResponse(createDesktopSuccessPage(code, game, url.origin))
}

// ==========================================
// ✅ Fixed Token Exchange Handler - Android PKCE Support
// ==========================================
async function handleTokenExchange(url, request, gameId, requestId, GAMES, envVars) {
  const game = validateGameId(gameId, GAMES)
  if (!game) {
    return createJsonResponse({
      error: 'invalid_game',
      message: 'Game configuration not found',
      requestId
    }, 400)
  }

  let body
  try {
    body = await request.text()
  } catch (e) {
    return createJsonResponse({
      error: 'invalid_body',
      message: 'Failed to read request body',
      requestId
    }, 400)
  }

  const params = new URLSearchParams(body)
  
  const code = params.get('code')
  let redirectUri = params.get('redirect_uri')
  const platform = params.get('platform')
  const xPlatform = request.headers.get('X-Platform')
  
  if (!code) {
    return createJsonResponse({
      error: 'missing_code',
      message: 'Authorization code is required',
      requestId
    }, 400)
  }

  let isAndroid = false
  let detectedPlatform = 'web' 

  if (platform === 'android') {
    isAndroid = true
    detectedPlatform = 'android (explicit param)'
  }
  else if (xPlatform === 'android') {
    isAndroid = true
    detectedPlatform = 'android (X-Platform header)'
  }
  else if (redirectUri && redirectUri.includes(':/') && !redirectUri.startsWith('http')) {
    isAndroid = true
    detectedPlatform = 'android (deep link redirect_uri)'
  }

  const clientId = game.oauth.web
  const clientSecret = game.oauth.secret
  redirectUri = `${url.origin}/oauth/callback`

  logInfo(isAndroid ? '🤖 Android token exchange (using Web Client)' : '💻 Web token exchange', {
    requestId,
    gameId,
    redirectUri,
    platform: isAndroid ? (platform || xPlatform || 'detected') : 'web',
    clientId: clientId.substring(0, 20) + '...',
    hasSecret: true
  })
  
  if (!clientId) {
    logError('Client ID not configured', { requestId, gameId, isAndroid })
    return createJsonResponse({
      error: 'configuration_error',
      message: `Client ID not configured for ${isAndroid ? 'Android' : 'Web'}`,
      requestId
    }, 500)
  }
  
  if (!clientSecret) {
    logError('Client Secret not configured', { requestId, gameId })
    return createJsonResponse({
      error: 'configuration_error',
      message: 'Client Secret not configured',
      requestId
    }, 500)
  }

  const tokenUrl = 'https://oauth2.googleapis.com/token'
  const googleParams = new URLSearchParams({
    code: code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  })

  try {
    logInfo('📤 Sending request to Google', { 
      requestId, 
      gameId,
      tokenUrl,
      redirectUri 
    })

    const googleResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': `${game.name}-Proxy/${CONFIG.VERSION}`
      },
      body: googleParams.toString()
    })

    const responseText = await googleResponse.text()

    if (!googleResponse.ok) {
      logError('Google token exchange failed', { 
        requestId, 
        gameId, 
        isAndroid,
        platform: platform || xPlatform || 'unknown',
        status: googleResponse.status,
        response: responseText,
        sentRedirectUri: redirectUri,
        usedClientId: clientId.substring(0, 20) + '...'
      })
      
      return createJsonResponse({
        error: 'token_exchange_failed',
        details: responseText,
        status: googleResponse.status,
        debug: {
          isAndroid,
          platform: platform || xPlatform || 'unknown',
          sentRedirectUri: redirectUri,
          clientId: clientId.substring(0, 20) + '...',
          hasCode: true,
          hasSecret: true,
          detectedPlatform: detectedPlatform
        },
        requestId
      }, googleResponse.status)
    }

    logInfo('✅ Token exchanged successfully', { 
      requestId, 
      gameId, 
      isAndroid,
      platform: platform || xPlatform || 'detected'
    })
    
    return createJsonResponse(JSON.parse(responseText), 200)

  } catch (error) {
    logError('Token exchange error', { 
      requestId, 
      gameId, 
      error: error.message
    })
    
    return createJsonResponse({
      error: 'network_error',
      message: error.message,
      requestId
    }, 500)
  }
}

async function handleRefreshToken(url, request, gameId, requestId, GAMES, envVars) {
  const game = validateGameId(gameId, GAMES)
  if (!game) {
    return createJsonResponse({
      error: 'invalid_game',
      message: 'Game configuration not found',
      requestId
    }, 400)
  }

  let body
  try {
    body = await request.json()
  } catch (e) {
    return createJsonResponse({
      error: 'invalid_json',
      message: 'Request body must be valid JSON',
      requestId
    }, 400)
  }

  const { refreshToken } = body

  if (!refreshToken) {
    return createJsonResponse({
      error: 'missing_refresh_token',
      message: 'Refresh token is required',
      requestId
    }, 400)
  }

  try {
    // ── D1 path: neon-katana ──────────────────────────────
    // برای neon-katana از Google OAuth token refresh استفاده میکنیم
    if (game.d1Binding) {
      const tokenUrl = `https://oauth2.googleapis.com/token`
      const tokenBody = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: game.oauth.web,
        client_secret: game.oauth.secret
      })

      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenBody.toString()
      })

      const tokenData = await tokenResponse.json()

      if (!tokenResponse.ok || tokenData.error) {
        logError('Google token refresh failed', { requestId, gameId, error: tokenData.error })
        return createJsonResponse({
          success: false,
          error: 'refresh_failed',
          message: tokenData.error_description || 'Failed to refresh token',
          requestId
        }, 400)
      }

      logInfo('Google token refreshed successfully', { requestId, gameId })

      return createJsonResponse({
        success: true,
        id_token: tokenData.id_token,
        refresh_token: tokenData.refresh_token || refreshToken,
        expires_in: tokenData.expires_in || 3600,
        requestId
      }, 200)
    }

    return createJsonResponse({ success: false, error: 'unsupported_game', message: 'Game not supported', requestId }, 400)

  } catch (error) {
    logError('Token refresh error', { requestId, gameId, error: error.message })
    return createJsonResponse({
      success: false,
      error: 'refresh_error',
      message: error.message,
      requestId
    }, 500)
  }
}

// ==========================================
// Database Handlers
// ==========================================
async function handleDatabaseGet(url, request, gameId, requestId, GAMES, envVars) {
  const game = validateGameId(gameId, GAMES)
  if (!game) {
    return createJsonResponse({
      error: 'invalid_game',
      message: 'Database not configured for this game',
      requestId
    }, 400)
  }

  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  const dbPath = url.pathname.replace('/database/get/', '')

  const publicPaths = ['topScores', 'globalTopScores', 'leaderboard']
  const isPublicPath = publicPaths.some(p => dbPath.includes(p))

  if (!isPublicPath && !token) {
    return createJsonResponse({
      error: 'unauthorized',
      message: 'Authorization token required',
      requestId
    }, 401)
  }

  logInfo('Database GET request', { requestId, gameId, path: dbPath, hasToken: !!token, isPublic: isPublicPath })

  try {
    // ── D1 path: neon-katana ──────────────────────────────
    if (game.d1Binding) {
      const db = envVars[game.d1Binding]

      if (!db) {
        return createJsonResponse({
          error: 'db_not_bound',
          message: `D1 binding "${game.d1Binding}" پیدا نشد`,
          requestId
        }, 500)
      }
      const userMatch = dbPath.match(/^games\/[^/]+\/users\/([^/]+)$/)
      if (userMatch) {
        const uid = userMatch[1]
        const player = await db.prepare(`
        SELECT * FROM players WHERE player_id = ? LIMIT 1
      `).bind(uid).first().catch(() => null)

      if (!player) {
        return createJsonResponse({
          error: 'not_found',
          message: 'User not found',
          requestId
        }, 404)
      }

        return createJsonResponse({
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
        }, 200)
      }

      // مسیر: games/neon-katana/users/{uid}/highScore
      const scoreMatch = dbPath.match(/^games\/[^/]+\/users\/([^/]+)\/highScore$/)
      if (scoreMatch) {
        const uid = scoreMatch[1]
        const player = await db.prepare(`
          SELECT high_score FROM players WHERE player_id = ? LIMIT 1
        `).bind(uid).first()

        return createJsonResponse(player ? player.high_score : 0, 200)
      }

      // مسیر: leaderboard
      if (dbPath.includes('leaderboard')) {
        const { results } = await db.prepare(`
          SELECT username, username AS displayName, high_score AS highScore,
                 profile_pic_url AS photoURL, selected_color AS selectedColor
          FROM players
          ORDER BY high_score DESC
          LIMIT 100
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

      return createJsonResponse({
        error: 'unknown_path',
        message: `Path not supported for D1: ${dbPath}`,
        requestId
      }, 400)
    }

    return createJsonResponse({ error: 'unsupported_game', message: 'This game does not support GET operations', requestId }, 400)

  } catch (error) {
    logError('Database GET error', { requestId, gameId, path: dbPath, error: error.message })
    return createJsonResponse({
      error: 'database_error',
      message: error.message,
      requestId
    }, 500)
  }
}

async function handleDatabaseSet(url, request, gameId, requestId, GAMES, envVars) {
  const game = validateGameId(gameId, GAMES)
  if (!game) {
    return createJsonResponse({
      error: 'invalid_game',
      message: 'Database not configured for this game',
      requestId
    }, 400)
  }

  const token = request.headers.get('Authorization')?.replace('Bearer ', '')

if (!token) {
  return createJsonResponse({
    error: 'unauthorized',
    message: 'Authorization token required',
    requestId
  }, 401)
}

const tokenInfoResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`)
const tokenInfo = await tokenInfoResponse.json()

if (!tokenInfoResponse.ok || tokenInfo.error_description) {
  return createJsonResponse({
    error: 'invalid_token',
    message: 'Token is invalid or expired',
    requestId
  }, 401)
}

const tokenPlayerId = tokenInfo.email.split('@')[0].toLowerCase().substring(0, 15)

const dbPath = url.pathname.replace('/database/set/', '')

const uidMatch = dbPath.match(/^games\/[^/]+\/users\/([^/]+)/)
if (uidMatch && uidMatch[1] !== tokenPlayerId) {
  return createJsonResponse({
    error: 'forbidden',
    message: 'You can only modify your own data',
    requestId
  }, 403)
}

const body = await request.text()

  logInfo('Database SET request', { requestId, gameId, path: dbPath, method: request.method, bodyLength: body.length })

  // ── D1 path: neon-katana ────────────────────────────────
  if (game.d1Binding) {
    const db = envVars[game.d1Binding]

    if (!db) {
      return createJsonResponse({
        error: 'db_not_bound',
        message: `D1 binding "${game.d1Binding}" پیدا نشد`,
        requestId
      }, 500)
    }

    try {
      const highScoreMatch = dbPath.match(/^games\/([^/]+)\/users\/([^/]+)\/highScore$/)
      if (highScoreMatch) {
        const uid = highScoreMatch[2]
        const newScore = parseInt(body)

        if (isNaN(newScore) || newScore < 0) {
          return createJsonResponse({
            error: 'invalid_score',
            message: 'Score must be a non-negative number',
            requestId
          }, 400)
        }

        const player = await db.prepare(`
          SELECT high_score, username, profile_pic_url, selected_color
          FROM players WHERE player_id = ? LIMIT 1
        `).bind(uid).first()

        if (!player) {
          return createJsonResponse({
            error: 'user_not_found',
            message: 'Player not found in database',
            requestId
          }, 404)
        }

        const currentHighScore = player.high_score || 0

        if (newScore <= currentHighScore) {
          logInfo('⚠️ New score not higher', { requestId, uid, newScore, currentHighScore })
          return createJsonResponse({
            success: false,
            message: 'Score not higher than current high score',
            currentHighScore,
            submittedScore: newScore,
            requestId
          }, 200)
        }

        await db.prepare(`
          UPDATE players
          SET high_score = ?, games_played = games_played + 1, last_login = ?
          WHERE player_id = ?
        `).bind(newScore, Date.now(), uid).run()

        logInfo('🏆 High score updated in D1', { requestId, uid, previousScore: currentHighScore, newScore })

        return createJsonResponse({
          success: true,
          message: 'High score updated successfully',
          previousHighScore: currentHighScore,
          newHighScore: newScore,
          improvement: newScore - currentHighScore,
          requestId
        }, 200)
      }

      // 🎯 ذخیره اطلاعات کاربر
      const userMatch = dbPath.match(/^games\/([^/]+)\/users\/([^/]+)$/)
      if (userMatch) {
        const uid = userMatch[2]
        let userData
        try {
          userData = JSON.parse(body)
        } catch {
          return createJsonResponse({ error: 'invalid_json', message: 'Body must be valid JSON', requestId }, 400)
        }

        const now = Date.now()
        const updates = []
        const values = []

        if (userData.username !== undefined) {
          const usernameError = validateUsername(userData.username)
          if (usernameError) {
            return createJsonResponse({
              error: usernameError.errorCode,
              messagePersian: usernameError.messagePersian,
              messageEnglish: usernameError.messageEnglish,
              requestId
            }, 400)
          }
          updates.push('username = ?')
          values.push(userData.username)
        }
        if (userData.selectedColor !== undefined) { updates.push('selected_color = ?'); values.push(userData.selectedColor) }
        if (userData.purchasedColors !== undefined) { updates.push('purchased_colors = ?'); values.push(JSON.stringify(userData.purchasedColors)) }
        if (userData.purchasedItems !== undefined) { updates.push('purchased_items = ?'); values.push(JSON.stringify(userData.purchasedItems)) }
        if (userData.totalPlayTime !== undefined) { updates.push('total_play_time = ?'); values.push(userData.totalPlayTime) }

        if (updates.length > 0) {
          updates.push('last_login = ?')
          values.push(now)
          values.push(uid)
          await db.prepare(`UPDATE players SET ${updates.join(', ')} WHERE player_id = ?`).bind(...values).run()
        }

        logInfo('✅ User data updated in D1', { requestId, uid })
        return createJsonResponse({ success: true, requestId }, 200)
      }

      return createJsonResponse({
        error: 'unknown_path',
        message: `Path not supported for D1: ${dbPath}`,
        requestId
      }, 400)

    } catch (error) {
      logError('❌ D1 SET error', { requestId, gameId, path: dbPath, error: error.message })
      return createJsonResponse({ error: 'database_error', message: error.message, requestId }, 500)
    }
  }

  return createJsonResponse({ error: 'unsupported_game', message: 'This game does not support SET operations', requestId }, 400)
}

function createAuthRedirectPage(googleAuthUrl, game, baseUrl) {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="google-site-verification" content="uFvaRQchIco-iyGmdsNknLK7mL5Asxg47GjaOQmhf0Q" />
  <title>در حال انتقال به Google - AmirCollider Proxy</title>
  <link rel="icon" href="https://drive.google.com/uc?export=download&id=1kwjfUTVmbHOtJbl0DbXoOq9-BWitQBnw" type="image/png">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Tahoma, Arial, sans-serif;
      background: linear-gradient(135deg, ${game.color}, #764ba2);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      overflow: hidden;
    }
    .container {
      background: rgba(255,255,255,0.1);
      padding: 60px 50px;
      border-radius: 25px;
      backdrop-filter: blur(25px);
      box-shadow: 0 30px 70px rgba(0,0,0,0.4);
      text-align: center;
      max-width: 500px;
      width: 90%;
      animation: slideUp 0.7s ease;
      position: relative;
      z-index: 10;
    }
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(40px) scale(0.9); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .spinner {
      width: 80px;
      height: 80px;
      border: 6px solid rgba(255,255,255,0.2);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 1.2s linear infinite;
      margin: 30px auto;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .game-icon {
      font-size: 80px;
      margin-bottom: 20px;
      animation: bounce 1s infinite;
    }
    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-10px); }
    }
    .progress-bar {
      width: 100%;
      height: 6px;
      background: rgba(255,255,255,0.2);
      border-radius: 10px;
      margin-top: 20px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #4caf50, #8bc34a);
      animation: progress 2s ease-in-out infinite;
    }
    @keyframes progress {
      0% { width: 0%; }
      50% { width: 70%; }
      100% { width: 100%; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="game-icon">${game.icon}</div>
    <h1>ورود با Google</h1>
    <p style="margin: 15px 0; font-size: 1.1em;"><strong>${game.name}</strong></p>
    <div class="spinner"></div>
    <p>در حال انتقال به صفحه ورود امن Google...</p>
    <div class="progress-bar">
      <div class="progress-fill"></div>
    </div>
    <p style="margin-top: 15px; font-size: 0.9em; opacity: 0.8;">لطفاً منتظر بمانید</p>
  </div>
  <script>
    setTimeout(() => {
      window.location.href = '${googleAuthUrl}';
    }, ${CONFIG.REDIRECT_TIMEOUT_MS});
  </script>
</body>
</html>`
}

function createDesktopSuccessPage(code, game, baseUrl) {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="google-site-verification" content="uFvaRQchIco-iyGmdsNknLK7mL5Asxg47GjaOQmhf0Q" />
  <title>ورود موفق - AmirCollider Proxy</title>
  <link rel="icon" href="https://drive.google.com/uc?export=download&id=1kwjfUTVmbHOtJbl0DbXoOq9-BWitQBnw" type="image/png">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Tahoma, Arial, sans-serif;
      background: linear-gradient(135deg, #4CAF50, #8BC34A);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      overflow: hidden;
    }
    .container {
      background: rgba(255,255,255,0.15);
      padding: 60px;
      border-radius: 30px;
      backdrop-filter: blur(25px);
      text-align: center;
      max-width: 600px;
      box-shadow: 0 30px 80px rgba(0,0,0,0.3);
      animation: scaleIn 0.5s ease;
      position: relative;
      z-index: 10;
    }
    @keyframes scaleIn {
      from { opacity: 0; transform: scale(0.9); }
      to { opacity: 1; transform: scale(1); }
    }
    .success-icon {
      font-size: 100px;
      animation: checkmark 0.8s ease;
    }
    @keyframes checkmark {
      0% { transform: scale(0) rotate(-45deg); }
      50% { transform: scale(1.2) rotate(0deg); }
      100% { transform: scale(1) rotate(0deg); }
    }
    .game-icon {
      font-size: 4em;
      margin: 20px 0;
    }
    .code-box {
      background: rgba(255,235,59,0.2);
      padding: 25px;
      border-radius: 15px;
      margin: 30px 0;
      border: 2px solid #ffeb3b;
    }
    .copy-status {
      margin-top: 15px;
      padding: 12px;
      border-radius: 8px;
      font-weight: bold;
      font-size: 1.1em;
      background: rgba(76,175,80,0.3);
      color: #4caf50;
      border: 2px solid #4caf50;
      animation: fadeIn 0.5s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .action-buttons {
      display: flex;
      gap: 15px;
      justify-content: center;
      margin-top: 30px;
      flex-wrap: wrap;
    }
    .action-btn {
      background: rgba(255,255,255,0.3);
      color: white;
      border: 2px solid white;
      padding: 15px 30px;
      border-radius: 10px;
      cursor: pointer;
      font-size: 1em;
      font-weight: bold;
      transition: all 0.3s;
      text-decoration: none;
      display: inline-block;
    }
    .action-btn:hover {
      background: rgba(255,255,255,0.4);
      transform: scale(1.05);
    }
    .security-badge {
      background: rgba(76,175,80,0.3);
      color: #4caf50;
      padding: 8px 16px;
      border-radius: 20px;
      display: inline-block;
      margin-top: 10px;
      font-size: 0.9em;
      border: 1px solid #4caf50;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="success-icon">✅</div>
    <div class="game-icon">${game?.icon || '🎮'}</div>
    <h1>احراز هویت موفق!</h1>
    <p style="font-size: 1.2em; margin: 10px 0;"><strong>${game?.name || 'AmirCollider Games'}</strong></p>
    <div class="security-badge">🔒 امنیت بالا</div>
    
    <div class="code-box">
      <p style="font-size: 1.3em; margin-bottom: 15px;"><strong>کد احراز هویت</strong></p>
      <button onclick="copyCodeManually()" class="action-btn" style="width: 100%; font-size: 1.1em; padding: 18px;">
        📋 کپی کردن کد
      </button>
      <div class="copy-status" id="copyStatus">✅ کد به صورت خودکار کپی شد!</div>
      <p style="font-size: 0.85em; margin-top: 15px; opacity: 0.9;">ℹ️ کد امنیتی شما آماده استفاده است</p>
    </div>
    
    <div class="action-buttons">
      <button onclick="returnToGame()" class="action-btn">🎮 بازگشت به بازی</button>
      <a href="${baseUrl}" class="action-btn">🌐 بازگشت به سایت</a>
    </div>
    
    <p style="margin-top: 30px; opacity: 0.9; font-size: 0.9em;">این پنجره را می‌توانید ببندید</p>
  </div>
  <script>
    const authCode = ${JSON.stringify(code)};
    
    function copyCodeManually() {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(authCode).then(() => {
          showCopyStatus('✅ کد دوباره کپی شد!');
        }).catch(err => {
          fallbackCopy(authCode);
        });
      } else {
        fallbackCopy(authCode);
      }
    }
    
    function showCopyStatus(message) {
      const status = document.getElementById('copyStatus');
      status.textContent = message;
      status.style.display = 'block';
    }
    
    function returnToGame() {
      if (window.opener) {
        window.close();
      } else {
        window.close();
        setTimeout(() => {
          alert('لطفاً این صفحه را ببندید و به بازی برگردید');
        }, 500);
      }
    }
    
    function autoCopyCode() {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(authCode).then(() => {
          console.log('✅ کد خودکار کپی شد');
        }).catch(err => {
          fallbackCopy(authCode);
        });
      } else {
        fallbackCopy(authCode);
      }
    }
    
    function fallbackCopy(text) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        showCopyStatus('✅ کد کپی شد!');
      } catch (err) {
        alert('خطا در کپی');
      }
      document.body.removeChild(textarea);
    }
    
    autoCopyCode();
  </script>
</body>
</html>`
}

// ==========================================
// ✅ FIXED: Android Success Page با Deep Link بهتر
// ==========================================
function createAndroidSuccessPage(androidScheme, game, baseUrl) {
  const code = androidScheme.split('code=')[1] || androidScheme.split('?code=')[1] || '';
  
  if (!code) {
    logError('❌ No code found in androidScheme', { androidScheme });
  } else {
    logInfo('✅ Code extracted for deep link', { 
      codeLength: code.length,
      codePreview: code.substring(0, 20) + '...'
    });
  }

  const deepLinkScheme = `${game.deepLink.scheme}://${game.deepLink.host}?code=${code}`;

  logInfo('🔗 Generated deep link', { 
    scheme: game.deepLink.scheme,
    host: game.deepLink.host,
    deepLinkScheme: deepLinkScheme 
  });

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ورود موفق - ${game.name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Tahoma, Arial, sans-serif;
      background: linear-gradient(135deg, #4CAF50, #8BC34A);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      text-align: center;
      overflow: hidden;
    }
    .container {
      padding: 40px;
      animation: fadeIn 0.5s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .game-icon {
      font-size: 5em;
      margin-bottom: 20px;
      animation: bounce 1s infinite;
    }
    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-15px); }
    }
    .success-circle {
      width: 120px;
      height: 120px;
      border: 6px solid white;
      border-radius: 50%;
      margin: 20px auto;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 60px;
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }
    .spinner {
      width: 60px;
      height: 60px;
      border: 5px solid rgba(255,255,255,0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 30px auto;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .debug-info {
      margin-top: 30px;
      padding: 20px;
      background: rgba(0,0,0,0.3);
      border-radius: 10px;
      font-size: 0.9em;
      text-align: left;
      font-family: monospace;
      display: none; /* مخفی در production */
    }
    .manual-open {
      margin-top: 20px;
      padding: 15px 30px;
      background: rgba(255,255,255,0.3);
      border: 2px solid white;
      border-radius: 10px;
      color: white;
      font-weight: bold;
      cursor: pointer;
      display: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="success-circle">✔</div>
    <div class="game-icon">${game?.icon || '🎮'}</div>
    <h1>ورود موفقیت‌آمیز!</h1>
    <p style="font-size: 1.2em; margin: 15px 0;"><strong>${game?.name || 'AmirCollider Games'}</strong></p>
    <div class="spinner"></div>
    <p>در حال بازگشت به بازی...</p>
    
    <!-- دکمه Manual (فقط اگر automatic کار نکرد) -->
    <button id="manualOpen" class="manual-open" onclick="openGame()">
      🎮 بازگشت دستی به بازی
    </button>

    <!-- Debug Info (فقط برای توسعه) -->
    <div class="debug-info" id="debugInfo">
      <strong>🔍 Debug Info:</strong><br>
      Deep Link: ${deepLinkScheme}<br>
      Code Length: ${code.length}<br>
      Game: ${game?.name}<br>
      Scheme: ${game?.deepLink?.scheme}
    </div>
  </div>

  <script>
    const deepLink = ${JSON.stringify(deepLinkScheme)};
    const code = ${JSON.stringify(code)};
    
    console.log('🔗 Android Success Page Loaded');
    console.log('   Deep Link:', deepLink);
    console.log('   Code Length:', code.length);
    console.log('   Code Preview:', code.substring(0, 20) + '...');

    function openGame() {
      console.log('🚀 Opening game with deep link...');
      
      try {
        window.location.href = deepLink;
        console.log('✅ Attempted via window.location');
        
        setTimeout(() => {
          try {
            window.open(deepLink, '_self');
            console.log('✅ Attempted via window.open');
          } catch (e) {
            console.warn('⚠️ window.open failed:', e);
          }
        }, 500);

        setTimeout(() => {
          try {
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            iframe.src = deepLink;
            document.body.appendChild(iframe);
            console.log('✅ Attempted via iframe');
            
            setTimeout(() => {
              document.body.removeChild(iframe);
            }, 2000);
          } catch (e) {
            console.warn('⚠️ iframe method failed:', e);
          }
        }, 1000);

      } catch (error) {
        console.error('❌ All methods failed:', error);
        showManualButton();
      }
    }

    function showManualButton() {
      const btn = document.getElementById('manualOpen');
      btn.style.display = 'inline-block';
      console.log('⚠️ Showing manual open button');
    }

    setTimeout(() => {
      console.log('🔄 Auto-opening game...');
      openGame();
      
      // اگر بعد از 5 ثانیه باز نشد، دکمه Manual نشان بده
      setTimeout(() => {
        showManualButton();
      }, 5000);
    }, 1000);

    if (window.location.hostname === 'localhost' || 
        window.location.search.includes('debug=true')) {
      document.getElementById('debugInfo').style.display = 'block';
      console.log('🐛 Debug mode enabled');
    }
  </script>
</body>
</html>`;
}

function createPCSuccessPage(code, localRedirectUri, game) {
  const callbackUrl = `${localRedirectUri}?code=${encodeURIComponent(code)}`
  
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ورود موفق - ${game.name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Tahoma, Arial, sans-serif;
      background: linear-gradient(135deg, #4CAF50, #8BC34A);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      text-align: center;
    }
    .container {
      padding: 60px 50px;
      background: rgba(255,255,255,0.15);
      border-radius: 30px;
      backdrop-filter: blur(25px);
      max-width: 500px;
      width: 90%;
      animation: fadeIn 0.5s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: scale(0.95); }
      to   { opacity: 1; transform: scale(1); }
    }
    .success-circle {
      width: 120px;
      height: 120px;
      border: 6px solid white;
      border-radius: 50%;
      margin: 0 auto 25px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 55px;
    }
    .game-icon { font-size: 4em; margin: 15px 0; }
    .spinner {
      width: 50px;
      height: 50px;
      border: 4px solid rgba(255,255,255,0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 25px auto;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .status { font-size: 1.1em; opacity: 0.9; }
  </style>
</head>
<body>
  <div class="container">
    <div class="success-circle">✔</div>
    <div class="game-icon">${game.icon}</div>
    <h1>ورود موفقیت‌آمیز!</h1>
    <p style="font-size:1.2em; margin:10px 0;"><strong>${game.name}</strong></p>
    <div class="spinner"></div>
    <p class="status" id="status">در حال انتقال اطلاعات به بازی...</p>
    <p style="margin-top:20px; opacity:0.8; font-size:0.9em;">این پنجره را می‌توانید ببندید</p>
  </div>
  <script>
    fetch(${JSON.stringify(callbackUrl)})
      .then(() => {
        document.getElementById('status').textContent = 'بازی آماده است! این پنجره را ببندید.'
      })
      .catch(() => {
        document.getElementById('status').textContent = 'بازی آماده است! این پنجره را ببندید.'
      })
  </script>
</body>
</html>`
}

function createOAuthErrorPage(error, game) {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="google-site-verification" content="uFvaRQchIco-iyGmdsNknLK7mL5Asxg47GjaOQmhf0Q" />
  <title>خطا در ورود - AmirCollider Proxy</title>
  <link rel="icon" href="${game?.logo || ''}" type="image/png">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Tahoma, Arial, sans-serif;
      background: linear-gradient(135deg, #f44336, #e91e63);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      text-align: center;
    }
    .container {
      background: rgba(255,255,255,0.15);
      padding: 60px;
      border-radius: 30px;
      backdrop-filter: blur(25px);
      max-width: 500px;
      animation: shake 0.5s ease;
    }
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-10px); }
      75% { transform: translateX(10px); }
    }
    .error-icon {
      font-size: 100px;
      margin-bottom: 20px;
      animation: errorPulse 1.5s infinite;
    }
    @keyframes errorPulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }
    .error-code {
      background: rgba(0,0,0,0.3);
      padding: 10px 20px;
      border-radius: 10px;
      display: inline-block;
      margin: 15px 0;
      font-family: monospace;
    }
    .retry-btn {
      background: rgba(255,255,255,0.3);
      color: white;
      border: 2px solid white;
      padding: 15px 40px;
      border-radius: 10px;
      cursor: pointer;
      font-size: 1.1em;
      font-weight: bold;
      margin-top: 30px;
      transition: all 0.3s;
    }
    .retry-btn:hover {
      background: rgba(255,255,255,0.4);
      transform: scale(1.05);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="error-icon">❌</div>
    <h1>خطا در ورود</h1>
    <div class="error-code">کد خطا: <strong>${sanitizeInput(error)}</strong></div>
    <p style="margin: 20px 0;">متأسفانه در فرآیند احراز هویت خطایی رخ داده است.</p>
    <p>لطفاً دوباره تلاش کنید یا با پشتیبانی تماس بگیرید</p>
    <button class="retry-btn" onclick="window.close()">بستن پنجره</button>
  </div>
</body>
</html>`
}

function createExpiredStatePage() {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="google-site-verification" content="uFvaRQchIco-iyGmdsNknLK7mL5Asxg47GjaOQmhf0Q" />
  <title>جلسه منقضی شده - AmirCollider Proxy</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Tahoma, Arial, sans-serif;
      background: linear-gradient(135deg, #ff9800, #ff5722);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      text-align: center;
    }
    .container {
      background: rgba(255,255,255,0.15);
      padding: 60px;
      border-radius: 30px;
      backdrop-filter: blur(25px);
      max-width: 500px;
      animation: fadeIn 0.5s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: scale(0.9); }
      to { opacity: 1; transform: scale(1); }
    }
    .warning-icon {
      font-size: 100px;
      margin-bottom: 20px;
      animation: swing 1s ease-in-out infinite;
    }
    @keyframes swing {
      0%, 100% { transform: rotate(-5deg); }
      50% { transform: rotate(5deg); }
    }
    .timer {
      font-size: 3em;
      font-weight: bold;
      margin: 20px 0;
      color: #ffeb3b;
    }
    button {
      background: rgba(255,255,255,0.3);
      color: white;
      border: 2px solid white;
      padding: 15px 40px;
      border-radius: 10px;
      cursor: pointer;
      font-size: 1.1em;
      font-weight: bold;
      margin-top: 30px;
      transition: all 0.3s;
    }
    button:hover {
      background: rgba(255,255,255,0.4);
      transform: scale(1.05);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="warning-icon">⚠️</div>
    <h1>جلسه منقضی شده</h1>
    <div class="timer">⏱️</div>
    <p style="margin: 20px 0; font-size: 1.1em;">زمان درخواست شما به پایان رسیده است</p>
    <p>لطفاً دوباره تلاش کنید</p>
    <button onclick="window.close()">بستن</button>
  </div>
</body>
</html>`
}


function createUserProfilePage(userData, game, gameId) {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="google-site-verification" content="uFvaRQchIco-iyGmdsNknLK7mL5Asxg47GjaOQmhf0Q" />
  <title>پروفایل ${sanitizeInput(userData.displayName || userData.username)} - AmirCollider Proxy</title>
  <link rel="icon" href="https://drive.google.com/uc?export=download&id=1kwjfUTVmbHOtJbl0DbXoOq9-BWitQBnw" type="image/png">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Tahoma, Arial, sans-serif;
      background: linear-gradient(135deg, ${game.color}, #764ba2);
      min-height: 100vh;
      padding: 20px;
      color: white;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      animation: fadeIn 0.6s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .profile-header {
      background: rgba(255,255,255,0.1);
      backdrop-filter: blur(25px);
      padding: 40px;
      border-radius: 25px;
      text-align: center;
      margin-bottom: 30px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .avatar {
      width: 150px;
      height: 150px;
      border-radius: 50%;
      border: 5px solid white;
      margin: 0 auto 20px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      animation: avatarPulse 2s infinite;
    }
    @keyframes avatarPulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }
    .username {
      font-size: 2.5em;
      font-weight: bold;
      margin-bottom: 10px;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: rgba(255,255,255,0.1);
      backdrop-filter: blur(25px);
      padding: 30px;
      border-radius: 20px;
      text-align: center;
      box-shadow: 0 15px 40px rgba(0,0,0,0.2);
      transition: all 0.3s;
    }
    .stat-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 20px 50px rgba(0,0,0,0.3);
    }
    .stat-icon { font-size: 3em; margin-bottom: 15px; }
    .stat-value { font-size: 2em; font-weight: bold; color: #ffeb3b; margin-bottom: 10px; }
    .info-card {
      background: rgba(255,255,255,0.1);
      backdrop-filter: blur(25px);
      padding: 30px;
      border-radius: 20px;
      margin-bottom: 20px;
      box-shadow: 0 15px 40px rgba(0,0,0,0.2);
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 15px 0;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .info-row:last-child { border-bottom: none; }
    .btn {
      background: rgba(255,255,255,0.2);
      color: white;
      border: 2px solid white;
      padding: 15px 30px;
      border-radius: 10px;
      cursor: pointer;
      font-size: 1em;
      font-weight: bold;
      transition: all 0.3s;
      text-decoration: none;
      display: inline-block;
      margin: 5px;
    }
    .btn:hover {
      background: rgba(255,255,255,0.3);
      transform: scale(1.05);
    }
    .btn-primary { background: linear-gradient(135deg, #4caf50, #8bc34a); border: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="profile-header">
      <img src="${userData.photoURL || 'https://via.placeholder.com/150'}" alt="Avatar" class="avatar">
      <div class="username">${sanitizeInput(userData.displayName || userData.username)}</div>
      <div style="font-size: 1.1em; opacity: 0.9; margin-bottom: 20px;">${sanitizeInput(userData.email)}</div>
      <div style="background: rgba(76,175,80,0.3); color: #4caf50; padding: 8px 20px; border-radius: 20px; display: inline-block; font-weight: bold; border: 2px solid #4caf50; margin-top: 10px;">${game.icon} ${game.name}</div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon">🏆</div>
        <div class="stat-value">${userData.highScore || 0}</div>
        <div style="font-size: 1em; opacity: 0.9;">بالاترین امتیاز</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🎮</div>
        <div class="stat-value">${userData.gamesPlayed || 0}</div>
        <div style="font-size: 1em; opacity: 0.9;">بازی‌های انجام شده</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">⭐</div>
        <div class="stat-value">${userData.totalStars || 0}</div>
        <div style="font-size: 1em; opacity: 0.9;">ستاره‌های کسب شده</div>
      </div>
    </div>

    <div class="info-card">
      <h2 style="margin-bottom: 20px; font-size: 1.8em;">📊 اطلاعات حساب</h2>
      <div class="info-row">
        <span style="font-weight: bold; opacity: 0.8;">شناسه کاربری:</span>
        <span style="font-weight: bold;">${sanitizeInput(userData.username)}</span>
      </div>
      <div class="info-row">
        <span style="font-weight: bold; opacity: 0.8;">آخرین ورود:</span>
        <span style="font-weight: bold;">${new Date(userData.lastLogin || Date.now()).toLocaleString('fa-IR')}</span>
      </div>
      <div class="info-row">
        <span style="font-weight: bold; opacity: 0.8;">تاریخ ثبت‌نام:</span>
        <span style="font-weight: bold;">${new Date(userData.createdAt || Date.now()).toLocaleString('fa-IR')}</span>
      </div>
      <div class="info-row">
        <span style="font-weight: bold; opacity: 0.8;">سطح:</span>
        <span style="font-weight: bold;">سطح ${userData.level || 1}</span>
      </div>
    </div>

    <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; margin-top: 30px;">
      <a href="/" class="btn btn-primary">🏠 بازگشت به خانه</a>
      <a href="/oauth/auth?game=${gameId}" class="btn">🎮 ورود به بازی</a>
    </div>
  </div>
</body>
</html>`
}
