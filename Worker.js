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

import { CONFIG, CORS_HEADERS, LANGUAGES, SECURITY, getGamesConfig, validateEnvironment } from './Config.js'
import { createJsonResponse, createErrorResponse } from './Core/Http.js'
import { logInfo, logError, generateRequestId } from './Core/Logging.js'
import { isLangRoutable, localizedPath, splitLangPath } from './Core/Locale.js'
import { matchRequestLang } from './Core/RequestContext.js'

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

import { handleNotFound } from './Pages/NotFound.js'
import { handleRobots, handleSitemap } from './Pages/Sitemap.js'
import { handleSiteIcon, handleFavicon, handleWebManifest } from './Pages/Icon.js'
import { handleAbout } from './Pages/About.js'
import { handleDonate, handleDonateCreate, handleDonateThanks } from './Pages/Donate.js'
import { handleGamesIndex } from './Pages/Games.js'
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
  handleGameAccountProfile,
  handleGameAccountDelete
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

  // Who is behind all of this. Linked from the footer of every
  // page, and the one page a search engine can attach a
  // biography to.
  { path: '/about', method: 'GET', handler: handleAbout },

  // The games catalogue, and the answer to /tools. It has to be
  // registered before the /games/:gameId/* API routes read like a
  // conflict - they are not one: those all carry a second path
  // segment, and matchRoute tries every static route before any
  // dynamic one regardless. robots.txt disallows "/games/" with
  // the trailing slash, so the API stays out of the index and
  // this page stays in it.
  { path: '/games', method: 'GET', handler: handleGamesIndex },

  // What a crawler asks for first, and what Search Console asks
  // for when a property is added.
  { path: '/robots.txt', method: 'GET', handler: handleRobots },
  { path: '/sitemap.xml', method: 'GET', handler: handleSitemap },

  // The favicon, with a safe area around it so a round crop does
  // not take the logo's corners off. See Pages/Icon.js.
  //
  // /favicon.ico is registered because a browser asks for it whether
  // the document links to an icon or not, and so do several
  // crawlers - Google's favicon fetcher among them. Answering 404
  // there was enough on its own to leave a tab blank.
  { path: '/icon.svg', method: 'GET', handler: handleSiteIcon },
  { path: '/favicon.ico', method: 'GET', handler: handleFavicon },
  { path: '/site.webmanifest', method: 'GET', handler: handleWebManifest },

  // Supporting the work, with whatever amount the donor types.
  // Nothing is delivered and nothing is owed, so this rides the
  // payment provider without any of the checkout's fulfilment
  // machinery. See Pages/Donate.js.
  { path: '/donate', method: 'GET', handler: handleDonate },
  { path: '/donate/create', method: 'POST', handler: handleDonateCreate },
  { path: '/donate/thanks', method: 'GET', handler: handleDonateThanks },

  // The site-wide policy pages. Google's OAuth consent screen and
  // Play Console both want a privacy policy and terms at a stable
  // address on the same domain as the homepage - not one buried
  // under a game id that could be retired. The per-game pages
  // below still answer, because shipped APKs link to those.
  { path: '/privacy', method: 'GET', handler: handlePrivacyPolicyWithGame },
  { path: '/terms', method: 'GET', handler: handleTermsWithGame },

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

  // A player deleting their own record. POST only, and never GET:
  // a prefetching extension, a crawler following links or a chat
  // app unfurling a pasted URL would otherwise delete somebody's
  // account for them. Same reason /account/logout is a POST, with
  // considerably more at stake.
  { path: '/:gameId/account/delete', method: 'POST', handler: handleGameAccountDelete, dynamic: true },
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
  // Dots are literal here: '/robots.txt' as a pattern must not also
  // match '/robotsXtxt'. Only ':param' is a wildcard.
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped.replace(/:\w+/g, '([^/]+)')}$`)
}

/**
 * Percent-decoding that cannot throw.
 *
 * decodeURIComponent('%E0%A4%A') is a URIError, and a game id is
 * whatever a caller put in the path - so an unescaped '%' in a URL
 * used to become an uncaught exception and a 500 where a 404 was
 * the honest answer.
 */
function decodeParam(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
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
    params[name.slice(1)] = decodeParam(matches[index + 1])
  })

  return { ...dynamicRoute, params }
}


// ==========================================
// One address per page
//
// The Worker answers on its workers.dev hostname as well as on the
// domain. Same bytes, two addresses - which to a search engine is
// two sites competing for the same words, and to a visitor is a
// bookmark that quietly stops matching the links they are sent.
//
// Only page requests are redirected. A shipped Android build calls
// /database/, /auth/ and /games/ with its own HTTP stack and may
// not follow a 301 at all, so those keep answering wherever they
// are called - the redirect is for browsers, and browsers ask for
// pages with GET.
// ==========================================
const CANONICAL_EXEMPT = [
  '/oauth/', '/auth/', '/database/', '/games/', '/profile/',
  '/assets/', '/video/', '/thegod', '/testsite', '/checkout/'
]

// ==========================================
// One address per language
//
// Core/Locale.js explains why the language moved out of `?lang=`
// and into the path. This is the part that keeps every address
// that ever worked still working, and keeps exactly one of them
// canonical:
//
//   /fa/about          301  ->  /about
//     The default language has no prefix of its own. Answering on
//     both is the duplicate this whole change exists to remove.
//
//   /about?lang=en     301  ->  /en/about
//     Every link ever shared, every Search Console entry, every
//     bookmark. A 301 moves the authority they carry onto the new
//     address instead of stranding it.
//
//   /en/assets/x.png   301  ->  /assets/x.png
//     A prefix on something that never had one.
//
//   /about             302  ->  /en/about   (for a reader who
//     prefers English)
//     A 302, not a 301: the preference belongs to the visitor, not
//     to the address. Googlebot sends neither a cookie nor an
//     Accept-Language header, so it never sees this and always
//     reads the bare path as the default language - which is what
//     makes the bare path stable enough to index.
//
// Query strings other than `lang` are preserved throughout. The
// checkout's signed order handle arrives as one.
// ==========================================
function redirectTo(pathname, params, status, varies = false) {
  const query = params && params.toString ? params.toString() : ''
  return new Response(null, {
    status,
    headers: {
      Location: pathname + (query ? '?' + query : ''),
      'Cache-Control': status === 301 ? 'public, max-age=3600' : 'no-store',

      // ==========================================
      // Vary, on the one redirect that reads a request header.
      //
      // Only the preference-based 302 below depends on the
      // visitor: it looks at a cookie and at Accept-Language and
      // sends a reader who wants English to /en/. Every other
      // redirect here is decided by the URL alone and would be
      // wrong to mark as varying.
      //
      // `no-store` already stops a shared cache from keeping it,
      // so nothing was actually broken. This is the correct
      // statement of WHY it must not be shared, and it is what
      // Google's own guidance on locale-adaptive pages asks for -
      // a crawler seeing it knows the URL has header-dependent
      // behaviour and that the bare path it was served is not the
      // only answer.
      // ==========================================
      ...(varies ? { Vary: 'Accept-Language, Cookie' } : {})
    }
  })
}

// ==========================================
// normalizeRedirect
// One shape per address, before language routing sees it.
//
// A crawl of the live routes found three ways to reach a 404 that
// a person or an external link produces constantly:
//
//   /about/      a trailing slash. Half the links people paste
//                carry one, and every one of them was landing on
//                the 404 page - a dead end for the reader and a
//                wasted crawl that passes no signal to /about.
//   /About       a capital. URLs are case-sensitive by
//                specification, which is a fact about servers and
//                not about the people typing a brand name into a
//                bar.
//   //about      a doubled slash, which is what string
//                concatenation produces when somebody builds a
//                link with a base that already ends in one.
//
// A 301 to the one correct form fixes all three, and a 301 is
// specifically what moves the authority an external link carries
// onto the page it meant.
//
// WHAT IS DELIBERATELY EXCLUDED, and why it matters more than the
// rule itself: only paths that take a language prefix are
// normalised (isLangRoutable, Core/Locale.js). That leaves out
// `/assets/` - and R2 object keys ARE case-sensitive, so
// lower-casing /assets/NeonKatanaLogo.png would turn every image
// on the site into a 404. The same exclusion covers the machine
// surface that shipped Android builds call, which must not be
// handed a redirect at all.
//
// Runs before languageRedirect so /EN/About/ resolves in one hop
// rather than two.
// ==========================================
function normalizeRedirect(url, request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null

  const original = url.pathname

  const collapsed = original.replace(/\/{2,}/g, '/')
  const trimmed = collapsed.length > 1 ? collapsed.replace(/\/+$/, '') : collapsed
  const normalized = trimmed.toLowerCase() || '/'

  if (normalized === original) return null

  // ==========================================
  // The DESTINATION has to be a page path. Only the destination.
  //
  // Testing the original as well was the obvious first guess and
  // it was wrong twice over.
  //
  // It broke "/en/games/". That splits to a bare "/games/", which
  // is in NO_LANG_ROUTING because "/games/{id}/manifest" is the
  // machine surface - so normalisation refused it, language
  // routing rewrote it to "/games/?lang=en", normalisation then
  // took the slash off, and language routing put the prefix back:
  // three redirects to reach "/en/games". A chain a crawler
  // follows but spends its budget on.
  //
  // And it was not buying the protection it looked like it was.
  // The thing that must never happen is an R2 key being
  // lower-cased - "/assets/NeonKatanaLogo.png" turning into a 404 -
  // and testing the destination catches that on its own: the
  // normalised form still starts with "/assets/", which is not
  // routable, so the redirect is refused. Same for the machine API
  // and both panels.
  //
  // Testing only the destination also resolves "/games/" itself,
  // with no special case: the trailing slash is what put it in the
  // API's prefix, and once it is gone "/games" is the catalogue.
  // ==========================================
  const { path: bare } = splitLangPath(normalized)
  if (!isLangRoutable(bare)) return null

  return redirectTo(normalized, new URLSearchParams(url.search), 301)
}


function languageRedirect(url, request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null

  const { lang: pathLang, path } = splitLangPath(url.pathname)
  const params = new URLSearchParams(url.search)
  const queryLang = params.get('lang')

  // A prefix on a path that never takes one. The language is kept
  // rather than dropped, in the query form those paths still speak
  // - otherwise the language switcher would silently stop working
  // the moment a visitor reached the checkout.
  if (pathLang && !isLangRoutable(path)) {
    params.set('lang', pathLang)
    return redirectTo(path, params, 301)
  }

  // The default language's own prefix. It has none: the bare path
  // is its address, and answering on both is the duplicate this
  // whole change exists to remove.
  if (pathLang === LANGUAGES.default) {
    params.delete('lang')
    return redirectTo(path, params, 301)
  }

  // The old query form. Only for paths that take a prefix - the
  // checkout keeps `?lang=` exactly as it is, because a payment
  // provider is holding a `success_url` that carries one.
  if (!pathLang && queryLang && LANGUAGES.supported.includes(queryLang) && isLangRoutable(path)) {
    params.delete('lang')
    return redirectTo(localizedPath(path, queryLang), params, 301)
  }

  // A bare path, and a reader who would rather have another
  // language. matchRequestLang reads cookie -> Accept-Language ->
  // default, so "no opinion" resolves to the default and stays put.
  if (!pathLang && !queryLang && isLangRoutable(path)) {
    const preferred = matchRequestLang(url, request)
    if (preferred !== LANGUAGES.default) {
      return redirectTo(localizedPath(path, preferred), params, 302, true)
    }
  }

  return null
}


function canonicalRedirect(url, request) {
  const host = url.hostname.toLowerCase()
  const canonicalHost = new URL(CONFIG.SITE_URL).hostname.toLowerCase()

  if (host === canonicalHost) return null
  if (!CONFIG.ALT_HOSTS.some(alt => alt.toLowerCase() === host)) return null
  if (request.method !== 'GET' && request.method !== 'HEAD') return null
  if (CANONICAL_EXEMPT.some(prefix => url.pathname.startsWith(prefix))) return null

  const target = new URL(url.pathname + url.search, CONFIG.SITE_URL)
  return new Response(null, {
    status: 301,
    headers: {
      Location: target.toString(),
      'Cache-Control': 'public, max-age=3600'
    }
  })
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

  const redirect = canonicalRedirect(url, request)
  if (redirect) return redirect

  const normalized = normalizeRedirect(url, request)
  if (normalized) return normalized

  const moved = languageRedirect(url, request)
  if (moved) return moved

  // Past this point the language is settled, and the rest of the
  // Worker is written against a path with no language in it.
  //
  // The prefix is folded back into `?lang=` on the URL object the
  // handlers receive - not on the wire, only in memory - so every
  // page keeps resolving its language through resolveRequestLang()
  // exactly as before, and langCookieHeader() keeps persisting an
  // explicit choice. Sixty call sites did not have to learn a new
  // way to ask what language they are in.
  const { lang: pathLang, path } = splitLangPath(url.pathname)
  if (pathLang) {
    url.pathname = path
    url.searchParams.set('lang', pathLang)
  }

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
      // A browser gets a page it can navigate away from; a shipped
      // client asking for JSON gets exactly the body it got before.
      return handleNotFound(url, request, requestId, Object.values(GAMES))
    }

    // A game id in the path that names no game is a 404, not a
    // silent fallback to the first registered game. The fallback
    // meant /anything/leaderboard rendered Neon Katana's board
    // under an address that is not its own - one page at unlimited
    // URLs, which is a duplicate-content problem for a crawler and
    // a wrong answer for a person.
    if (route.params && route.params.gameId && route.path.startsWith('/:gameId')
        && !GAMES[route.params.gameId]) {
      return handleNotFound(url, request, requestId, Object.values(GAMES))
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
