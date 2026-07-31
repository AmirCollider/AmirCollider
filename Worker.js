// ==========================================
// Worker.js
// The edge entry point for every AmirCollider client.
//
//   Api/OAuthApi        Google sign-in, token exchange, refresh
//   Api/AuthApi         token validation, player existence
//   Api/PlayerDataApi   the per-game read/write surface
//   Api/GameApi         manifest, products, entitlements
//   Api/TheGodApi       the operator panel's single endpoint
//   Api/AssetApi        R2 objects
//   Pages/*             everything a browser renders
//
// Adding a game: edit GAME_REGISTRY in Config.js. Nothing here
// changes. Adding an endpoint: one entry in ROUTES below.
//
// Design notes that hold across the whole surface:
//   - Every page is theme-aware (light/dark/auto) and tri-lingual
//     (fa/en/ja) with correct RTL/LTR.
//   - Google-facing OAuth state is HMAC-signed and expiry-checked,
//     so it cannot be forged or tampered with in transit.
//   - Logs are structured and redacted: no secrets, no
//     authorization codes, no raw upstream error bodies.
// ==========================================

import { CONFIG, CORS_HEADERS, SECURITY, getGamesConfig, validateEnvironment } from './Config.js'
import { createJsonResponse, create404Response, createErrorResponse } from './Core/Http.js'
import { logInfo, logError, generateRequestId } from './Core/Logging.js'

import { handleOAuthAuth, handleOAuthCallback, handleTokenExchange, handleRefreshToken } from './Api/OAuthApi.js'
import { handleValidateToken, handleCheckUserExists } from './Api/AuthApi.js'
import { handleDatabaseGet, handleDatabaseSet, handleDatabasePatch } from './Api/PlayerDataApi.js'
import { handleAsset } from './Api/AssetApi.js'
import {
  handleGameManifest,
  handleGameProducts,
  handleGameEntitlements,
  handleGameConsume,
  handleGameDownload
} from './Api/GameApi.js'
import { handleTheGodApi } from './Api/TheGodApi.js'

import { handleUserProfile } from './Pages/PlayerProfile.js'
import { handleDashboard } from './Pages/Dashboard.js'
import { handleHealthWithUI } from './Pages/Health.js'
import { handlePingWithUI } from './Pages/Ping.js'
import { handlePrivacyPolicyWithGame } from './Pages/Privacy.js'
import { handleTermsWithGame } from './Pages/Terms.js'
import { handleLeaderboardUnified } from './Pages/Leaderboard.js'
import { handleMetrics } from './Pages/Metrics.js'
import { handleReleaseNotes } from './Pages/ReleaseNotes.js'
import { handleUnityDocSnap } from './Pages/UnityDocSnap.js'
import { handleUnityDirectTmp } from './Pages/UnityDirectTmp.js'
import { handleTools } from './Pages/Tools.js'
import { handleDocSnapVideo } from './Pages/Video.js'
import { handleOrderHelp, handleOrderLookup } from './Pages/OrderHelp.js'
import { handleCheckoutTest } from './Pages/CheckoutTest.js'
import { handleLicenseAdminPanel } from './Pages/LicenseAdmin.js'
import {
  handleCheckoutPage,
  handleCheckoutCreate,
  handleCheckoutPay,
  handleCheckoutStatus,
  handleCheckoutResend,
  handleCheckoutWebhook
} from './Pages/Checkout.js'
import {
  handleLicensePage,
  handleLicenseActivate,
  handleLicenseValidate,
  handleLicenseDeactivate,
  handleLicenseDevices,
  handleLicenseAdmin
} from './Pages/License.js'
import {
  handleTestSite,
  handleTestSiteLogin,
  handleTestSiteLoginPost,
  handleTestSiteLogout
} from './Pages/TestSite.js'
import {
  handleTheGod,
  handleTheGodLogin,
  handleTheGodLoginPost,
  handleTheGodLogout
} from './Pages/TheGod.js'
import { handleGameLanding, handleGameVersions } from './Pages/GameLanding.js'
import {
  handleGameAccount,
  handleGameAccountSignIn,
  handleGameAccountLogout,
  handleGameAccountProfile
} from './Pages/GameAccount.js'
import {
  handleGameStore,
  handleGameStoreBuy,
  handleGameStoreOrder,
  handleGameStoreStatus,
  handleGameWebhook
} from './Pages/GameStore.js'

import { db as commerceDb } from './Commerce/Orders.js'
import { reconcile } from './Commerce/Fulfilment.js'
import { db as gamesDb } from './Games/Store.js'
import { reconcileGameOrders } from './Games/Purchase.js'
import { resolveGames } from './Games/Registry.js'


export default {
  fetch(request, env, ctx) {
    return handleRequest(request, env, ctx)
  },

  scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduled(env))
  }
}


// ==========================================
// The cron, and why it exists
// ==========================================
async function runScheduled(env) {
  const database = commerceDb(env)
  if (!database) {
    logInfo('Cron skipped: LICENSE_DB is not bound')
    return
  }

  try {
    logInfo('Cron finished', await reconcile(env, database))
  } catch (error) {
    logError('Cron failed', { error: error.message })
  }

  try {
    const games = await resolveGames(env, getGamesConfig(env), { fresh: true })
    logInfo('Game store cron finished', await reconcileGameOrders(env, gamesDb(env), games))
  } catch (error) {
    logError('Game store cron failed', { error: error.message })
  }
}


// ==========================================
// Routing table
//
// Order is irrelevant except for the last entry: matchRoute tries
// every static and prefix route before any dynamic one.
// ==========================================
const ROUTES = [
  { path: '/', method: 'GET', handler: handleDashboard },
  { path: '/metrics', method: 'GET', handler: handleMetrics },
  { path: '/release-notes', method: 'GET', handler: handleReleaseNotes },

  // The tools catalogue. The path is a promise: it appears in
  // shipped C# constants that cannot be updated once somebody has
  // the package installed.
  { path: '/tools', method: 'GET', handler: handleTools },

  // Unity DirectTMP. Free and MIT, so one GET is the whole surface.
  // Both paths are registered because the short one is what people
  // type and the long one is what DirectTMPConstants.ProductUrl
  // points at.
  { path: '/unity-directtmp', method: 'GET', handler: handleUnityDirectTmp },
  { path: '/directtmp', method: 'GET', handler: handleUnityDirectTmp },

  // Unity DocSnap: product page and licensing. The licence
  // endpoints are POST-only and take their key in the body. A key
  // in a URL ends up in access logs, in browser history and in the
  // Referer header of anything the page links to - three places
  // too many for a credential that unlocks a paid product.
  { path: '/unity-docsnap', method: 'GET', handler: handleUnityDocSnap },
  { path: '/docsnap', method: 'GET', handler: handleUnityDocSnap },
  { path: '/license', method: 'GET', handler: handleLicensePage },
  { path: '/license/activate', method: 'POST', handler: handleLicenseActivate },
  { path: '/license/validate', method: 'POST', handler: handleLicenseValidate },
  { path: '/license/deactivate', method: 'POST', handler: handleLicenseDeactivate },
  { path: '/license/devices', method: 'POST', handler: handleLicenseDevices },
  { path: '/license/admin', method: 'POST', handler: handleLicenseAdmin },

  // The crypto checkout. /checkout/webhook is the only
  // unauthenticated POST here that changes anything, and it is
  // guarded by an HMAC over the body rather than a secret in the
  // URL - a secret path would end up in the provider's dashboard,
  // in their logs and in ours. Status and resend take a signed
  // order handle, so a shared link exposes the masked order and
  // nothing usable anywhere else.
  { path: '/checkout', method: 'GET', handler: handleCheckoutPage },
  { path: '/checkout/create', method: 'POST', handler: handleCheckoutCreate },
  { path: '/checkout/pay', method: 'GET', handler: handleCheckoutPay },
  { path: '/checkout/status', method: 'GET', handler: handleCheckoutStatus },
  { path: '/checkout/resend', method: 'POST', handler: handleCheckoutResend },
  { path: '/checkout/webhook', method: 'POST', handler: handleCheckoutWebhook },
  { path: '/order', method: 'GET', handler: handleOrderHelp },
  { path: '/order/lookup', method: 'POST', handler: handleOrderLookup },

  // The developer panel. Its two rehearsal endpoints live under
  // /testsite/ rather than /checkout/ for one concrete reason: the
  // panel's session cookie is scoped Path=/testsite, so a browser
  // simply does not send it anywhere else. The alternative was
  // widening that cookie to Path=/ and posting a dev credential on
  // every public page.
  { path: '/testsite', method: 'GET', handler: handleTestSite },
  { path: '/testsite/login', method: 'GET', handler: handleTestSiteLogin },
  { path: '/testsite/login', method: 'POST', handler: handleTestSiteLoginPost },
  { path: '/testsite/logout', method: 'POST', handler: handleTestSiteLogout },
  { path: '/testsite/checkout', method: 'POST', handler: handleCheckoutTest },
  { path: '/testsite/licenses', method: 'POST', handler: handleLicenseAdminPanel },

  // TheGod, behind the same password as /testsite but with its own
  // cookie scoped Path=/thegod - so signing into one panel does not
  // hand over the other. One API endpoint with an action field
  // rather than twenty routes, because every action needs the same
  // authorisation check and a single door cannot be forgotten on
  // the twenty-first.
  { path: '/thegod', method: 'GET', handler: handleTheGod },
  { path: '/thegod/login', method: 'GET', handler: handleTheGodLogin },
  { path: '/thegod/login', method: 'POST', handler: handleTheGodLoginPost },
  { path: '/thegod/logout', method: 'POST', handler: handleTheGodLogout },
  { path: '/thegod/api', method: 'POST', handler: handleTheGodApi },

  // The games' own API, for shipped clients. /games/webhook has its
  // own path rather than the licence checkout's, because both shops
  // ride one provider account and a game purchase looked up in the
  // licence table is money arriving against nothing.
  { path: '/games/webhook', method: 'POST', handler: handleGameWebhook },
  { path: '/games/:gameId/manifest', method: 'GET', handler: handleGameManifest, dynamic: true },
  { path: '/games/:gameId/products', method: 'GET', handler: handleGameProducts, dynamic: true },
  { path: '/games/:gameId/entitlements', method: 'GET', handler: handleGameEntitlements, dynamic: true },
  { path: '/games/:gameId/entitlements/consume', method: 'POST', handler: handleGameConsume, dynamic: true },

  // Demo clips. Registered for HEAD as well as GET: a <video>
  // element asks for the headers before it commits to a download,
  // and a 405 to that question is a black rectangle.
  { path: '/video/', method: 'GET', handler: handleDocSnapVideo, prefix: true },
  { path: '/video/', method: 'HEAD', handler: handleDocSnapVideo, prefix: true },

  { path: '/assets/', method: 'GET', handler: handleAsset, prefix: true },

  { path: '/:gameId/health', method: 'GET', handler: handleHealthWithUI, dynamic: true },
  { path: '/:gameId/ping', method: 'GET', handler: handlePingWithUI, dynamic: true },
  { path: '/:gameId/privacy', method: 'GET', handler: handlePrivacyPolicyWithGame, dynamic: true },
  { path: '/:gameId/terms', method: 'GET', handler: handleTermsWithGame, dynamic: true },
  { path: '/:gameId/leaderboard', method: 'GET', handler: handleLeaderboardUnified, dynamic: true },
  { path: '/:gameId/leaderboard/:limit', method: 'GET', handler: handleLeaderboardUnified, dynamic: true },

  // A game's player-facing pages. /download is the only address any
  // download link on this site points at, so withdrawing a build
  // withdraws it everywhere at once - including from links people
  // have already shared.
  { path: '/:gameId/versions', method: 'GET', handler: handleGameVersions, dynamic: true },
  { path: '/:gameId/download', method: 'GET', handler: handleGameDownload, dynamic: true },
  { path: '/:gameId/account', method: 'GET', handler: handleGameAccount, dynamic: true },
  { path: '/:gameId/account/signin', method: 'GET', handler: handleGameAccountSignIn, dynamic: true },
  { path: '/:gameId/account/logout', method: 'POST', handler: handleGameAccountLogout, dynamic: true },
  { path: '/:gameId/account/profile', method: 'POST', handler: handleGameAccountProfile, dynamic: true },
  { path: '/:gameId/store', method: 'GET', handler: handleGameStore, dynamic: true },
  { path: '/:gameId/store/buy', method: 'POST', handler: handleGameStoreBuy, dynamic: true },
  { path: '/:gameId/store/order', method: 'GET', handler: handleGameStoreOrder, dynamic: true },
  { path: '/:gameId/store/status', method: 'GET', handler: handleGameStoreStatus, dynamic: true },

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
  { path: '/database/patch/', method: 'POST', handler: handleDatabasePatch, prefix: true },

  // A game's landing page, at the bare game id. LAST on purpose:
  // its pattern is one path segment, so it would happily answer for
  // /checkout or /license. Being last keeps it behind the other
  // dynamic routes; matchRoute keeps it behind every static one. An
  // id that is not a game answers 404, like every other game route.
  { path: '/:gameId', method: 'GET', handler: handleGameLanding, dynamic: true }
]


// ==========================================
// Route matching
// ==========================================
function patternToRegex(path) {
  return new RegExp(`^${path.replace(/:\w+/g, '([^/]+)')}$`)
}

function pathMatches(route, path) {
  if (route.prefix) return path.startsWith(route.path)
  if (route.dynamic) return patternToRegex(route.path).test(path)
  return route.path === path
}

/** Resolves a path and method to a route, extracting :params. */
function matchRoute(path, method) {
  const staticRoute = ROUTES.find(route =>
    !route.dynamic && route.method === method && pathMatches(route, path))
  if (staticRoute) return staticRoute

  const dynamicRoute = ROUTES.find(route =>
    route.dynamic && route.method === method && pathMatches(route, path))
  if (!dynamicRoute) return null

  const matches = path.match(patternToRegex(dynamicRoute.path)) || []
  const params = {}
  ;(dynamicRoute.path.match(/:\w+/g) || []).forEach((name, index) => {
    params[name.slice(1)] = decodeURIComponent(matches[index + 1])
  })

  return { ...dynamicRoute, params }
}


// ==========================================
// The request pipeline
// Validate configuration, resolve the route, apply the shared CORS
// and security headers once, and tag the response with a trace id.
// ==========================================
async function handleRequest(request, env) {
  try {
    validateEnvironment(env)
  } catch (error) {
    logError('Environment validation failed', { error: error.message })
    return createJsonResponse({
      error: 'configuration_error',
      message: 'Server configuration incomplete. Please contact the administrator.'
    }, 500)
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { ...CORS_HEADERS, ...SECURITY.SECURE_HEADERS }
    })
  }

  const GAMES = getGamesConfig(env)
  const url = new URL(request.url)
  const path = url.pathname
  const requestId = generateRequestId()
  const gameId = request.headers.get('X-Game-ID') || url.searchParams.get('game') || Object.keys(GAMES)[0]
  const logContext = { requestId, gameId, path, method: request.method }

  try {
    logInfo('Request received', logContext)

    const route = matchRoute(path, request.method)
    if (!route) {
      const knownPath = ROUTES.some(candidate => pathMatches(candidate, path))
      if (knownPath) {
        return createJsonResponse({
          error: 'method_not_allowed',
          message: 'Method not allowed for this endpoint',
          requestId
        }, 405)
      }
      return create404Response(requestId)
    }

    const availableEndpoints = ROUTES.map(entry => `${entry.method} ${entry.path}`)
    const response = await route.handler(
      url, request, route.params?.gameId || gameId, requestId, GAMES, env, availableEndpoints
    )

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
    logError('Request failed', { ...logContext, error: error.message, version: CONFIG.VERSION })
    return createErrorResponse(requestId)
  }
}
