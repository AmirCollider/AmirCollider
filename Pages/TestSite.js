// ==========================================
// Pages/TestSite.js
// Test Panel Page Handler
// AmirCollider Games - Worker Proxy


// ==========================================
// Developer-only dashboard that exercises the live proxy and reports the
// real state of every public endpoint. Gated behind a signed-cookie login.
//
// Integration contract (do not break without updating callers in Worker.js):
//   - handleTestSite          GET  /testsite          (auth required)
//   - handleTestSiteLogin     GET  /testsite/login
//   - handleTestSiteLoginPost POST /testsite/login
//   - handleTestSiteLogout    POST /testsite/logout
//   Each receives (url, request, gameId, requestId, GAMES, env).
//
// Theme & language (shared with the rest of the site)
//   - Theme:    <html data-theme="light|dark">; absent = follow the OS.
//               Persisted in localStorage 'ac_theme' + cookie 'theme'.
//   - Language: server-resolved (?lang= -> cookie 'lang' -> Accept-Language),
//               switchable client-side with no reload. Layout uses logical
//               properties so fa (RTL) and en/ja (LTR) both stay correct.
//
// Test catalogue
//   - The catalogue is data-driven: every check is one entry in TEST_GROUPS,
//     bound to a runner by `kind`. Adding a check is a single entry; adding a
//     language is a single I18N block. Checks assert only contracts the worker
//     actually exposes, so a green panel means a healthy site.
// ==========================================

import { CONFIG } from '../Config.js'
import { getPageHead } from '../Core/DesignSystem.js'
import { createHtmlResponse, clientIp, timingSafeEqual } from '../Core/Http.js'
import { logWarning } from '../Core/Logging.js'
import { escapeHtml, hexToRgb, accentInk } from '../Core/Html.js'
import { themeBootScript } from '../Core/PageChrome.js'
import { langCookieHeader, matchRequestLang, themeFromCookie } from '../Core/RequestContext.js'
import {
  panelPassword, issuePanelCookie, clearPanelCookie, readPanelSession,
  isRateLimited, recordAttempt, clearAttempts
} from '../Core/PanelSession.js'
import { db } from '../Games/Store.js'
import { siteOrigin, persianSpellingVariants } from '../Core/Seo.js'

const AUTH_COOKIE = 'amir_testsite_auth'
const COOKIE_PATH = '/testsite'
const SESSION_MAX_AGE_MS = 2 * 60 * 60 * 1000

// Whose panel this is. The test panel exercises the whole site -
// the licence server, the checkout, every registered game - so it
// is branded as the site and not as whichever game happens to be
// first in the registry.
const PANEL_BRAND = 'AmirCollider'
const PANEL_ACCENT = '#2f6df6'

const LANGS = ['fa', 'en', 'ja']
const DEFAULT_LANG = 'fa'

const LANG_META = {
  fa: { dir: 'rtl', locale: 'fa-IR', label: 'فا' },
  en: { dir: 'ltr', locale: 'en-US', label: 'EN' },
  ja: { dir: 'ltr', locale: 'ja-JP', label: '日本' }
}


// ==========================================
// Cookie Signing - HMAC-SHA256
// Cookie signing lives in Core/PanelSession.js now - this panel
// and /thegod each carried their own copy of it, and both copies
// signed a random token with no issue time in it. That left the
// expiry entirely to Max-Age, which is an instruction to a
// browser rather than a rule the server enforces, so a stolen
// cookie outlived every window it was supposed to have.
// ==========================================
function testSitePassword(env) {
  return panelPassword(env, 'testsite')
}


// ==========================================
// Auth Check
// Validates the signed session cookie against the panel password.
// ==========================================
export { isAuthenticated as isTestSiteSession }

function isAuthenticated(request, env) {
  return readPanelSession(request, AUTH_COOKIE, testSitePassword(env), SESSION_MAX_AGE_MS)
}


// ==========================================
// Handler: Test Panel (auth required)
// ==========================================
export async function handleTestSite(url, request, gameId, requestId, GAMES, env) {
  if (!(await isAuthenticated(request, env))) {
    return Response.redirect(`${url.origin}/testsite/login`, 302)
  }
  const lang = matchRequestLang(url, request)
  const theme = themeFromCookie(request)
  const headers = langCookieHeader(url, lang)
  return createHtmlResponse(renderDashboard(GAMES, url.origin, lang, theme), 200, headers)
}


// ==========================================
// Handler: Login (GET)
// ==========================================
export async function handleTestSiteLogin(url, request, gameId, requestId, GAMES, env) {
  if (await isAuthenticated(request, env)) {
    return Response.redirect(`${url.origin}/testsite`, 302)
  }
  const error = url.searchParams.get('error')
  const lang = matchRequestLang(url, request)
  const theme = themeFromCookie(request)
  const headers = langCookieHeader(url, lang)
  return createHtmlResponse(renderLogin(url.origin, lang, theme, error), 200, headers)
}


// ==========================================
// Handler: Login (POST)
// ==========================================
export async function handleTestSiteLoginPost(url, request, gameId, requestId, GAMES, env) {
  const secret = testSitePassword(env)
  const database = db(env)
  const ip = clientIp(request)

  if (await isRateLimited(database, 'testsite', ip)) {
    logWarning('TestSite login rate limited', { requestId })
    return Response.redirect(`${url.origin}/testsite/login?error=2`, 302)
  }

  let password = ''
  try {
    const params = new URLSearchParams(await request.text())
    password = params.get('password') || ''
  } catch {
    await recordAttempt(database, 'testsite', ip)
    return Response.redirect(`${url.origin}/testsite/login?error=1`, 302)
  }

  if (!secret || !timingSafeEqual(password, secret)) {
    await recordAttempt(database, 'testsite', ip)
    logWarning('TestSite login refused', { requestId })
    return Response.redirect(`${url.origin}/testsite/login?error=1`, 302)
  }

  await clearAttempts(database, 'testsite', ip)

  return new Response(null, {
    status: 302,
    headers: {
      'Location': `${url.origin}/testsite`,
      'Set-Cookie': await issuePanelCookie(AUTH_COOKIE, COOKIE_PATH, secret, SESSION_MAX_AGE_MS)
    }
  })
}


// ==========================================
// Handler: Logout (POST)
// ==========================================
export async function handleTestSiteLogout(url, request, gameId, requestId, GAMES, env) {
  return new Response(null, {
    status: 302,
    headers: {
      'Location': `${url.origin}/testsite/login`,
      'Set-Cookie': clearPanelCookie(AUTH_COOKIE, COOKIE_PATH)
    }
  })
}









// ==========================================
// Inline SVG Icon Set (theme-aware via currentColor)
// ==========================================
const ICONS = {
  flask: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6"/><path d="M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3"/><line x1="7.5" y1="15" x2="16.5" y2="15"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 4 20 12 6 20 6 4" fill="currentColor" stroke="none"/></svg>',
  reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 4 3 9 8 9"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  system: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>',
  game: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="11" x2="10" y2="11"/><line x1="8" y1="9" x2="8" y2="13"/><line x1="15" y1="12" x2="15.01" y2="12"/><line x1="18" y1="10" x2="18.01" y2="10"/><rect x="2" y="6" width="20" height="12" rx="2"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z"/></svg>',
  database: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>',
  layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
  cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.6 12.4a1.5 1.5 0 0 0 1.5 1.2h8.3a1.5 1.5 0 0 0 1.5-1.2L21 7H6"/></svg>',
  video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="14" height="14" rx="2.5"/><path d="M16.5 10.5 22 7.5v9l-5.5-3z"/></svg>',
  terminal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.9 17.9A10.9 10.9 0 0 1 12 19c-7 0-11-7-11-7a18.4 18.4 0 0 1 5.1-5.9M9.9 4.2A11 11 0 0 1 12 4c7 0 11 7 11 7a18.5 18.5 0 0 1-2.2 3.2M1 1l22 22"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
}

const GROUP_ICONS = {
  system: ICONS.system,
  game: ICONS.game,
  auth: ICONS.shield,
  oauth: ICONS.globe,
  db: ICONS.database,
  d1: ICONS.layers,
  checkout: ICONS.cart,
  video: ICONS.video,
  thegod: ICONS.terminal
}


// ==========================================
// Test Catalogue (data-driven)
// Each entry binds to a client runner by `kind`. Per-game checks are expanded
// once per registered game. Every assertion matches a real worker route.
// ==========================================
const TEST_GROUPS = [
  {
    key: 'system',
    titleKey: 'gSystem',
    tests: [
      { kind: 'sysMetrics' }, { kind: 'sys404' }, { kind: 'sys405' },
      { kind: 'sysCors' }, { kind: 'sysPreflight' }, { kind: 'sysContentType' },
      { kind: 'sysSecurity' }, { kind: 'sysRequestId' }, { kind: 'sysResponseTime' }
    ]
  },
  {
    key: 'auth',
    titleKey: 'gAuth',
    tests: [
      { kind: 'authValidateNoToken' }, { kind: 'authValidateNoUid' },
      { kind: 'authRefreshEmpty' }, { kind: 'authCheckNoBody' }, { kind: 'authCheckNoToken' }
    ]
  },
  {
    key: 'oauth',
    titleKey: 'gOauth',
    tests: [
      { kind: 'oauthAuthNoRedirect' }, { kind: 'oauthAuthWithRedirect' },
      { kind: 'oauthTokenNoCode' }, { kind: 'oauthCallbackNoParams' }
    ]
  },
  {
    key: 'db',
    titleKey: 'gDb',
    tests: [
      { kind: 'dbGetUnauth' }, { kind: 'dbSetUnauth' }, { kind: 'dbPatchUnauth' }
    ]
  },
  {
    key: 'd1',
    titleKey: 'gD1',
    tests: [
      { kind: 'd1Connection' }, { kind: 'd1Schema' }, { kind: 'd1Limit' },
      { kind: 'd1EmptyUser' }, { kind: 'd1GetUnauth' }, { kind: 'd1SetUnauth' },
      { kind: 'd1PatchUnauth' }, { kind: 'd1ScoreInvalid' }, { kind: 'd1UnknownPath' }
    ]
  },
  {
    // Read-only checks over the crypto checkout. Every one of
    // these asserts a REFUSAL - a malformed order rejected, an
    // unsigned callback turned away - because those are the
    // assertions that can be made without creating anything.
    // Rehearsing an actual sale is the simulator below, which is
    // a deliberate act rather than part of a sweep.
    key: 'checkout',
    titleKey: 'gCheckout',
    tests: [
      { kind: 'coConfig' }, { kind: 'coPage' }, { kind: 'coOrderPage' },
      { kind: 'coBadEmail' }, { kind: 'coBadTier' }, { kind: 'coWebhookUnsigned' },
      { kind: 'coStatusUnknown' }, { kind: 'coLookupBad' }
    ]
  },
  {
    // ==========================================
    // What a crawler sees.
    //
    // Everything in this group is a GET of a public page, and it
    // exists because the SEO surface is the one part of this site
    // that nobody looks at: a canonical tag pointing at the wrong
    // host, a robots.txt that stopped naming the sitemap, or a
    // hreflang cluster that lost a language all render a perfectly
    // normal-looking page and are invisible until three months of
    // indexing have gone somewhere else.
    //
    // seoBrand is the odd one and the most useful. It asserts that
    // the brand's Persian and Japanese spellings are actually
    // present in the bytes of the front page - which is the whole
    // point of CONFIG.BRAND, and exactly the thing that is easy to
    // lose in a refactor of the footer without anybody noticing.
    // ==========================================
    key: 'seo',
    titleKey: 'gSeo',
    tests: [
      { kind: 'seoRobots' }, { kind: 'seoSitemap' }, { kind: 'seoCanonical' },
      { kind: 'seoHreflang' }, { kind: 'seoJsonLd' }, { kind: 'seoBrand' },
      { kind: 'seoSnippet' }, { kind: 'seoGamePage' }, { kind: 'seoCanonicalForm' },
      { kind: 'seoNames' }
    ]
  },
  {
    key: 'video',
    titleKey: 'gVideo',
    tests: [
      { kind: 'vidPlay' }, { kind: 'vidRange' }, { kind: 'vidHead' },
      { kind: 'vidJa' }, { kind: 'vidFa' }, { kind: 'vidMissing' }
    ]
  },
  {
    // ==========================================
    // TheGod, the operator panel.
    //
    // Every check here is a READ or a refusal. Nothing in this
    // group changes a price, writes a setting, bans anybody or
    // creates a row - which is what makes it safe to leave in a
    // sweep that anybody might press "run all" on. The one call
    // that looks like a write, tgUnknownProduct, is asserting
    // that the write is REFUSED.
    //
    // The group exists because this panel writes to five tables
    // across two databases and had no coverage at all, and the
    // failure that motivated it was silent: a column the
    // database did not have, a save that answered "ok", and
    // nothing on the site changing. tgSchema is the check that
    // catches exactly that, and it fails rather than warns.
    //
    // Authorisation is the /thegod session cookie the browser is
    // already carrying. Signed out, every one of these warns and
    // says where to sign in.
    // ==========================================
    key: 'thegod',
    titleKey: 'gTheGod',
    tests: [
      { kind: 'tgReachable' }, { kind: 'tgMethod' }, { kind: 'tgOverview' },
      { kind: 'tgGameGet' }, { kind: 'tgUnknownGame' }, { kind: 'tgUnknownProduct' },
      { kind: 'tgSchema' }, { kind: 'tgPlayerDb' }, { kind: 'tgLanding' },
      { kind: 'tgSqlSettings' }, { kind: 'tgSqlGame' }, { kind: 'tgScaffold' },
      { kind: 'tgUnity' }, { kind: 'tgEnv' }, { kind: 'tgOrders' },
      { kind: 'tgPlayers' }, { kind: 'tgVerify' }
    ]
  }
]

const GAME_TESTS = [
  { kind: 'gameHealth' }, { kind: 'gamePing' }, { kind: 'gameLeaderboard' },
  { kind: 'gameLbLimit' }, { kind: 'gamePrivacy' }, { kind: 'gameTerms' }
]


// ==========================================
// i18n - Login + Dashboard strings (fa / en / ja)
// ==========================================
const I18N = {
  fa: {
    // login
    loginTitle: 'ورود به پنل تست',
    loginSub: 'دسترسی فقط برای توسعه‌دهنده',
    loginPassword: 'رمز عبور',
    loginPlaceholder: 'رمز عبور را وارد کنید',
    loginButton: 'ورود',
    loginLoading: 'در حال ورود…',
    loginError: 'رمز عبور اشتباه است',
    loginBlocked: 'تلاش‌های ناموفق زیاد بوده. یک ربع دیگر دوباره امتحان کن.',
    showPassword: 'نمایش رمز عبور',
    // chrome
    panelTitle: 'پنل تست',
    panelSub: 'بررسی سلامت زنده‌ی پروکسی و پایگاه‌داده',
    runAll: 'اجرای همه',
    running: 'در حال اجرا…',
    reset: 'بازنشانی',
    exportReport: 'خروجی نتایج',
    copied: 'کپی شد',
    logout: 'خروج',
    theme: 'تغییر تم',
    language: 'تغییر زبان',
    controls: 'کنترل‌ها',
    allDone: 'همه تست‌ها اجرا شد',
    nothingToExport: 'ابتدا تست‌ها را اجرا کنید',
    // summary
    statTotal: 'کل',
    statPass: 'موفق',
    statFail: 'ناموفق',
    statWarn: 'هشدار',
    statTime: 'زمان',
    // badges / chips
    bPending: 'در انتظار',
    bRunning: 'در حال اجرا',
    bPass: 'سالم',
    bFail: 'خطا',
    bPartial: 'ناقص',
    rPass: 'موفق',
    rFail: 'ناموفق',
    rWarn: 'هشدار',
    rRunning: 'در حال اجرا',
    rIdle: '—',
    // group titles
    gSystem: 'سیستم پایه',
    gGame: 'بازی',
    gAuth: 'احراز هویت',
    gOauth: 'جریان OAuth',
    gDb: 'پایگاه‌داده',
    gD1: 'پایگاه‌داده D1',
    gCheckout: 'خرید با ارز دیجیتال',
    gSeo: 'دیده‌شدن در گوگل',
    gVideo: 'ویدیوهای معرفی',
    gTheGod: 'پنل TheGod',
    // detail fragments
    net: 'خطای شبکه',
    coOff: 'هنوز پیکربندی نشده (۵۰۳)',
    coNoAuth: 'اول در /testsite وارد شو',
    coMissing: 'ناقص',
    coForged: '⚠ وبهوک بدون امضا پذیرفته شد — فوراً NOWPAYMENTS_IPN_SECRET را بررسی کن',
    vidNotInR2: 'فایل در R2 پیدا نشد',
    d1Leak: '⚠ بدون توکن معتبر، وجود یا نبودِ آن بازیکن لو رفت — باید ۴۰۱ می‌داد',
    tgNoAuth: 'اول در /thegod وارد شو',
    tgError: 'پنل خطا داد',
    tgNoGames: 'هیچ بازی‌ای ثبت نشده',
    tgNoTable: 'جدول game_settings خوانده نشد — مهاجرت 0003_games.sql را اجرا کن',
    tgMissingColumns: '⚠ این ستون‌ها در پایگاه‌داده نیستند؛ هرچه در آن فیلدها بنویسی ذخیره نمی‌شود. در تب «ساخت SQL» دکمه‌ی تعمیر را بزن',
    tgNoBinding: 'اتصال D1 این بازی وصل نشده',
    tgNoPlayers: 'جدول players ساخته نشده',
    tgNoModeration: 'ستون‌های مسدودسازی نیستند (0006)',
    tgNoOptOut: 'ستون پنهان‌شدن از جدول امتیازات نیست (0010)',
    tgBlocked: 'این بخش‌های صفحه‌ی بازی قابل ذخیره نیستند',
    tgStaleSql: 'SQL تولیدشده با ردیف واقعی نمی‌خواند',
    tgEmptyModule: 'این فایل‌های یونیتی خالی برگشتند',
    tgNoOauth: 'کلیدهای گوگل این بازی ست نشده',
    tgVerifyFailed: 'بررسی سلامت این موارد را ناموفق گزارش کرد',
    tgVerifyWarned: 'بررسی سلامت روی این موارد هشدار داد',
    expected: 'انتظار',
    missingField: 'فیلد غایب',
    badStruct: 'ساختار نامعتبر',
    missingHeaders: 'هدر غایب',
    serverErr: 'خطای سرور (500)',
    overLimit: 'بیش از حد مجاز',
    quality: 'کیفیت',
    records: 'رکورد',
    players: 'بازیکن',
    slow: 'کند',
    tooSlow: 'بسیار کند',
    validHtml: 'HTML معتبر',
    // manual panel
    licTitle: 'مدیریت لایسنس‌ها',
    licLede: 'همه‌ی کلیدهای ساخته‌شده را ببین، جست‌وجو کن، و هر کدام را که لازم بود باطل کن. جست‌وجو با بخشی از برچسب کلید، شماره سفارش، یا ایمیل مشتری کار می‌کند.',
    licSearch: 'جست‌وجو',
    licStatus: 'وضعیت',
    licTier: 'نسخه',
    licAny: 'همه',
    licLoad: 'نمایش لایسنس‌ها',
    licStats: 'آمار کلی',
    licNone: 'لایسنسی با این فیلترها پیدا نشد.',
    licSeats: 'سیستم',
    licRevoke: 'باطل کردن',
    licRestore: 'برگرداندن',
    licDevices: 'سیستم‌ها',
    licDelete: 'حذف کامل',
    licNever: 'هیچ‌وقت فعال نشده',
    licRevokeAsk: 'این کلید باطل شود؟ روی سیستم‌های جدید دیگر کار نمی‌کند.',
    licDeleteAsk: 'رکورد کامل حذف شود؟ برگشت‌پذیر نیست. برای کلیدی که سوءاستفاده شده، «باطل کردن» گزینه‌ی درست‌تری است چون تاریخچه را نگه می‌دارد.',
    licDeleteActivated: 'این کلید روی یک سیستم واقعی فعال شده — یعنی احتمالاً کسی بابتش پول داده. مطمئنی که می‌خواهی رکوردش را کامل پاک کنی؟',
    licReleaseAsk: 'این سیستم آزاد شود؟',
    licTotal: 'مجموع',
    simTitle: 'شبیه‌ساز خرید',
    simLede: 'کل مسیر بعد از پرداخت را بدون خرج کردن پول اجرا می‌کند: کلید واقعی ساخته می‌شود و ایمیل واقعی فرستاده می‌شود. فقط پیام درگاه پرداخت شبیه‌سازی می‌شود — همان بدنه‌ی JSON با همان امضای واقعی به همان وبهوک واقعی می‌رود.',
    simTier: 'نسخه',
    simLang: 'زبان ایمیل',
    simEmail: 'ایمیل (واقعی باشد — ایمیل واقعاً فرستاده می‌شود)',
    simStatus: 'وضعیت پرداخت',
    simOrder: 'شماره سفارش (خودکار پر می‌شود)',
    simFull: 'اجرای کامل: سفارش ← پرداخت ← کلید ← ایمیل',
    simCreate: 'فقط ساخت سفارش',
    simPay: 'فقط شبیه‌سازی پرداخت',
    simInspect: 'بررسی سفارش',
    simMail: 'ارسال ایمیل آزمایشی',
    simCron: 'اجرای دستی cron',
    simPurge: 'پاک کردن داده‌های آزمایشی',
    simNeedEmail: 'اول یک ایمیل واقعی بنویس.',
    simNeedOrder: 'اول یک شماره سفارش بنویس یا سفارش بساز.',
    simWorking: 'در حال اجرا…',
    manualTitle: 'درخواست دستی',
    mMethod: 'متد',
    mEndpoint: 'مسیر',
    mHeaders: 'هدرها',
    mBody: 'بدنه',
    mSend: 'ارسال',
    mWaiting: 'در حال ارسال…',
    mNeedEndpoint: 'ابتدا مسیر را وارد کنید',
    mBadHeaders: 'هدرهای JSON نامعتبر',
    // test labels + descriptions
    t_seoRobots: 'robots.txt', d_seoRobots: 'وجود Sitemap و قواعد Disallow و Allow',
    t_seoSitemap: 'sitemap.xml', d_seoSitemap: 'تعداد آدرس‌ها، hreflang کامل و تصاویر',
    t_seoCanonical: 'آدرس کاننیکال', d_seoCanonical: 'کاننیکال صفحه‌ی اصلی باید دامنه‌ی رسمی باشد',
    t_seoHreflang: 'hreflang', d_seoHreflang: 'سه زبان به‌علاوه‌ی x-default',
    t_seoJsonLd: 'داده‌ی ساختاریافته', d_seoJsonLd: 'JSON-LD معتبر با Organization و WebSite و WebPage',
    t_seoBrand: 'نام برند', d_seoBrand: 'نوشتن نام به فارسی و ژاپنی در صفحه‌ی اصلی',
    t_seoSnippet: 'عنوان و توضیح', d_seoSnippet: 'طول عنوان و توضیح صفحه‌ی اصلی و وجود یک h1',
    t_seoGamePage: 'صفحه‌ی بازی', d_seoGamePage: 'همان بررسی روی صفحه‌ی لندینگ یک بازی',
    t_seoCanonicalForm: 'یک آدرس برای هر صفحه', d_seoCanonicalForm: 'اسلش آخر و حروف بزرگ باید با یک ۳۰۱ درست شوند',
    t_seoNames: 'همه‌ی املاهای نام بازی', d_seoNames: 'نام بازی به هر خط و هر کدگذاری در صفحه‌اش هست',
    seoBadRedirect: 'ریدایرکت نادرست',
    seoNoNames: 'این املاها در صفحه نیست',
    seoNameCount: 'تعداد املا',
    seoSnippetBad: 'مشکل در',
    seoWidths: 'عرض عنوان/توضیح',
    seoMissing: 'موارد جاافتاده',
    seoUrls: 'تعداد آدرس',
    seoNodes: 'تعداد گره',
    seoNoImages: 'هیچ تصویری در سایت‌مپ نیست',
    seoNoCanonical: 'تگ کاننیکال وجود ندارد',
    seoWrongHost: 'کاننیکال به دامنه‌ی دیگری اشاره می‌کند',
    seoHreflangShort: 'hreflang ناقص',
    seoNoJsonLd: 'هیچ JSON-LD در صفحه نیست',
    seoBadJsonLd: 'بلاک JSON-LD خراب',
    seoNoBrand: 'این شکل‌های نام در صفحه نیست',
    t_sysMetrics: 'Metrics', d_sysMetrics: 'صحت /metrics و فیلدهای کلیدی',
    t_sys404: 'مدیریت 404', d_sys404: 'مسیر نامعتبر باید 404 بدهد',
    t_sys405: 'مدیریت 405', d_sys405: 'متد غیرمجاز روی /metrics باید 405 بدهد',
    t_sysCors: 'هدر CORS', d_sysCors: 'وجود Access-Control-Allow-Origin',
    t_sysPreflight: 'CORS Preflight', d_sysPreflight: 'پاسخ صحیح به OPTIONS',
    t_sysContentType: 'Content-Type', d_sysContentType: '/metrics باید application/json باشد',
    t_sysSecurity: 'هدرهای امنیتی', d_sysSecurity: 'X-Frame-Options و X-Content-Type-Options',
    t_sysRequestId: 'Request ID', d_sysRequestId: 'وجود هدر X-Request-ID',
    t_sysResponseTime: 'زمان پاسخ', d_sysResponseTime: 'سرعت پاسخ /metrics',
    t_gameHealth: 'سلامت', d_gameHealth: 'وضعیت و ساختار health',
    t_gamePing: 'پینگ', d_gamePing: 'تأخیر و کیفیت اتصال',
    t_gameLeaderboard: 'برترین‌ها', d_gameLeaderboard: 'لیست بازیکنان و ساختار',
    t_gameLbLimit: 'محدودیت برترین‌ها', d_gameLbLimit: 'limit=5 باید رعایت شود',
    t_gamePrivacy: 'حریم خصوصی', d_gamePrivacy: 'صفحه HTML با وضعیت 200',
    t_gameTerms: 'قوانین', d_gameTerms: 'صفحه HTML با وضعیت 200',
    t_authValidateNoToken: 'Validate بدون توکن', d_authValidateNoToken: 'بدون Authorization باید 401 بدهد',
    t_authValidateNoUid: 'Validate بدون uid', d_authValidateNoUid: 'با توکن ولی بدون uid باید 400 بدهد',
    t_authRefreshEmpty: 'Refresh خالی', d_authRefreshEmpty: 'بدون refreshToken باید 400 بدهد',
    t_authCheckNoBody: 'Check بدون بدنه', d_authCheckNoBody: 'بدون uid باید 400 بدهد',
    t_authCheckNoToken: 'Check بدون توکن', d_authCheckNoToken: 'با uid ولی بدون توکن باید 401 بدهد',
    t_oauthAuthNoRedirect: 'Auth بدون redirect_uri', d_oauthAuthNoRedirect: 'بدون redirect_uri باید 400 بدهد',
    t_oauthAuthWithRedirect: 'Auth با redirect_uri', d_oauthAuthWithRedirect: 'باید صفحه HTML هدایت بدهد',
    t_oauthTokenNoCode: 'Token بدون code', d_oauthTokenNoCode: 'بدون code باید 400 بدهد',
    t_oauthCallbackNoParams: 'Callback بدون پارامتر', d_oauthCallbackNoParams: 'نباید با 500 خطا بدهد',
    t_dbGetUnauth: 'GET بدون توکن', d_dbGetUnauth: '/database/get باید 401 بدهد',
    t_dbSetUnauth: 'SET بدون توکن', d_dbSetUnauth: '/database/set باید 401 بدهد',
    t_dbPatchUnauth: 'PATCH بدون توکن', d_dbPatchUnauth: '/database/patch باید 401 بدهد',
    t_d1Connection: 'اتصال D1', d_d1Connection: 'leaderboard باید از D1 پاسخ دهد',
    t_d1Schema: 'ساختار D1', d_d1Schema: 'فیلدهای rank و username و highScore',
    t_d1Limit: 'محدودیت D1', d_d1Limit: 'limit=3 باید رعایت شود',
    t_d1EmptyUser: 'کاربر ناموجود با توکن نامعتبر', d_d1EmptyUser: 'باید ۴۰۱ بدهد و نگوید آن کاربر هست یا نیست',
    t_d1GetUnauth: 'GET بدون توکن', d_d1GetUnauth: 'دسترسی کاربر باید 401 بدهد',
    t_d1SetUnauth: 'SET بدون توکن', d_d1SetUnauth: 'نوشتن کاربر باید 401 بدهد',
    t_d1PatchUnauth: 'PATCH بدون توکن', d_d1PatchUnauth: 'به‌روزرسانی کاربر باید 401 بدهد',
    t_d1ScoreInvalid: 'امتیاز نامعتبر', d_d1ScoreInvalid: 'امتیاز منفی باید رد شود',
    t_d1UnknownPath: 'مسیر ناشناخته', d_d1UnknownPath: 'نباید با 500 خطا بدهد',

    t_tgReachable: 'در دسترس بودن پنل', d_tgReachable: 'اکشن ناشناخته باید ۴۰۰ bad_action بدهد',
    t_tgMethod: 'فقط POST', d_tgMethod: 'GET روی /thegod/api باید ۴۰۵ بدهد',
    t_tgOverview: 'فهرست بازی‌ها', d_tgOverview: 'overview باید همه‌ی بازی‌ها را با ساختار درست بدهد',
    t_tgGameGet: 'خواندن یک بازی', d_tgGameGet: 'game.get باید همان بازی خواسته‌شده را بدهد',
    t_tgUnknownGame: 'بازی ناموجود', d_tgUnknownGame: 'شناسه‌ای که در Config.js نیست باید ۴۰۴ بدهد، نه اینکه ساخته شود',
    t_tgUnknownProduct: 'محصول ناموجود', d_tgUnknownProduct: 'قیمت‌گذاری محصولی که در کد نیست باید رد شود',
    t_tgSchema: 'ساختار game_settings', d_tgSchema: 'هر ستونی که پنل می‌نویسد باید در پایگاه‌داده باشد — همین مورد است که «ذخیره شد ولی چیزی عوض نشد» را می‌گیرد',
    t_tgPlayerDb: 'پایگاه‌داده‌ی خود بازی', d_tgPlayerDb: 'اتصال بازی و جدول players باید وصل و موجود باشند',
    t_tgLanding: 'ویرایشگر صفحه‌ی بازی', d_tgLanding: 'باید هم مقدار ذخیره‌شده و هم مقدار پایه‌ی Config.js را برگرداند',
    t_tgSqlSettings: 'صحت SQL تنظیمات', d_tgSqlSettings: 'SQL تولیدشده باید با ردیف واقعی بخواند، از جمله زمان آخرین تغییر',
    t_tgSqlGame: 'SQL بازی جدید', d_tgSqlGame: 'باید جدول players و مراحل اجرا را تولید کند',
    t_tgScaffold: 'ساخت کد بازی جدید', d_tgScaffold: 'باید هر چهار فایل را بدهد؛ چیزی هم ساخته یا ذخیره نمی‌شود',
    t_tgUnity: 'کیت یونیتی', d_tgUnity: 'همه‌ی فایل‌ها باید کد واقعی داشته باشند، نه خالی',
    t_tgEnv: 'متغیرها', d_tgEnv: 'کلیدهای لازم و آدرس بازگشت OAuth باید گزارش شوند',
    t_tgOrders: 'پرداخت‌ها', d_tgOrders: 'orders.list باید فهرست و آمار بدهد',
    t_tgPlayers: 'بازیکن‌ها', d_tgPlayers: 'players.list باید از پایگاه‌داده‌ی خود بازی بخواند',
    t_tgVerify: 'بررسی سلامت بازی', d_tgVerify: 'همان بررسی داخل پنل، از بیرون — هر ایراد جدی این‌جا ناموفق است',

    t_coConfig: 'پیکربندی', d_coConfig: 'همه‌ی Secretها و جدول‌های لازم موجودند؟',
    t_coPage: 'صفحه‌ی خرید', d_coPage: '/checkout بالا می‌آید و دکمه فعال است',
    t_coOrderPage: 'صفحه‌ی سفارش', d_coOrderPage: '/order با متن آماده‌ی پشتیبانی',
    t_coBadEmail: 'ایمیل نامعتبر', d_coBadEmail: 'سفارش با ایمیل غلط باید رد شود',
    t_coBadTier: 'نسخه‌ی نامعتبر', d_coBadTier: 'نسخه‌ی ناشناخته باید رد شود',
    t_coWebhookUnsigned: 'وبهوک بدون امضا', d_coWebhookUnsigned: 'باید ۴۰۱ بدهد — مهم‌ترین تست امنیتی',
    t_coStatusUnknown: 'سفارش ناموجود', d_coStatusUnknown: 'شناسه‌ی ناشناخته باید ۴۰۴ بدهد',
    t_coLookupBad: 'جست‌وجوی نامعتبر', d_coLookupBad: 'ایمیل غلط در بازیابی سفارش',

    t_vidPlay: 'پخش ویدیو', d_vidPlay: '/video/en/1 با هدر Accept-Ranges',
    t_vidRange: 'جلو/عقب بردن', d_vidRange: 'درخواست Range باید ۲۰۶ بدهد',
    t_vidHead: 'اطلاعات فایل', d_vidHead: 'HEAD باید حجم را برگرداند',
    t_vidJa: 'ویدیوی ژاپنی', d_vidJa: '/video/ja/1 در R2 موجود است',
    t_vidFa: 'ویدیوی فارسی', d_vidFa: '/video/fa/1 در R2 موجود است',
    t_vidMissing: 'کلیپ ۱۰ فارسی', d_vidMissing: 'فقط انگلیسی ضبط شده — باید ۴۰۴ بدهد'
  },
  en: {
    loginTitle: 'Test panel login',
    loginSub: 'Developer access only',
    loginPassword: 'Password',
    loginPlaceholder: 'Enter your password',
    loginButton: 'Sign in',
    loginLoading: 'Signing in…',
    loginError: 'Incorrect password',
    loginBlocked: 'Too many failed attempts. Try again in fifteen minutes.',
    showPassword: 'Show password',
    panelTitle: 'Test panel',
    panelSub: 'Live proxy & database health checks',
    runAll: 'Run all',
    running: 'Running…',
    reset: 'Reset',
    exportReport: 'Export results',
    copied: 'Copied',
    logout: 'Log out',
    theme: 'Toggle theme',
    language: 'Change language',
    controls: 'Controls',
    allDone: 'All tests finished',
    nothingToExport: 'Run the tests first',
    statTotal: 'Total',
    statPass: 'Passed',
    statFail: 'Failed',
    statWarn: 'Warnings',
    statTime: 'Time',
    bPending: 'Pending',
    bRunning: 'Running',
    bPass: 'Healthy',
    bFail: 'Failed',
    bPartial: 'Partial',
    rPass: 'Pass',
    rFail: 'Fail',
    rWarn: 'Warn',
    rRunning: 'Running',
    rIdle: '—',
    gSystem: 'Core system',
    gGame: 'Game',
    gAuth: 'Authentication',
    gOauth: 'OAuth flow',
    gDb: 'Database',
    gD1: 'D1 database',
    gCheckout: 'Crypto checkout',
    gSeo: 'Search visibility',
    gVideo: 'Demo videos',
    gTheGod: 'TheGod panel',
    net: 'Network error',
    coOff: 'Not configured yet (503)',
    coNoAuth: 'Sign in at /testsite first',
    coMissing: 'Missing',
    coForged: '⚠ An unsigned webhook was ACCEPTED — check NOWPAYMENTS_IPN_SECRET now',
    vidNotInR2: 'File not found in R2',
    d1Leak: '⚠ The lookup ran without a verified token, revealing whether that player exists — it must be 401',
    tgNoAuth: 'Sign in at /thegod first',
    tgError: 'The panel refused',
    tgNoGames: 'No games registered',
    tgNoTable: 'game_settings could not be read — run migrations/0003_games.sql',
    tgMissingColumns: '⚠ These columns are not in the database; anything typed into those fields is lost. Press Repair on the SQL tab',
    tgNoBinding: 'This game\'s D1 binding is not bound',
    tgNoPlayers: 'No players table',
    tgNoModeration: 'No moderation columns (0006)',
    tgNoOptOut: 'No leaderboard opt-out column (0010)',
    tgBlocked: 'These Game page sections cannot be saved',
    tgStaleSql: 'The generated SQL disagrees with the stored row',
    tgEmptyModule: 'These Unity files came back empty',
    tgNoOauth: 'Google client keys are not set for this game',
    tgVerifyFailed: 'The health check reported these as broken',
    tgVerifyWarned: 'The health check flagged these',
    expected: 'Expected',
    missingField: 'Missing field',
    badStruct: 'Invalid structure',
    missingHeaders: 'Missing headers',
    serverErr: 'Server error (500)',
    overLimit: 'Exceeds limit',
    quality: 'Quality',
    records: 'records',
    players: 'players',
    slow: 'Slow',
    tooSlow: 'Too slow',
    validHtml: 'Valid HTML',
    licTitle: 'Licence manager',
    licLede: 'See every key that exists, search it, and revoke any of them. Search matches part of a key label, an order id, or a customer email.',
    licSearch: 'Search',
    licStatus: 'Status',
    licTier: 'Edition',
    licAny: 'Any',
    licLoad: 'Show licences',
    licStats: 'Overview',
    licNone: 'No licence matched those filters.',
    licSeats: 'machines',
    licRevoke: 'Revoke',
    licRestore: 'Restore',
    licDevices: 'Machines',
    licDelete: 'Delete',
    licNever: 'never activated',
    licRevokeAsk: 'Revoke this key? It will stop working on new machines.',
    licDeleteAsk: 'Delete the whole record? This cannot be undone. For a key being misused, revoking is the better answer — it stops the key and keeps the history.',
    licDeleteActivated: 'This key has been activated on a real machine, so somebody probably paid for it. Delete the record anyway?',
    licReleaseAsk: 'Release this machine?',
    licTotal: 'total',
    simTitle: 'Checkout simulator',
    simLede: 'Runs the whole post-payment chain without spending anything: a real key is minted and a real email is sent. Only the provider\u2019s message is synthesized — the same JSON body, with a genuine signature, goes to the real webhook.',
    simTier: 'Edition',
    simLang: 'Email language',
    simEmail: 'Email (use a real one — a real message is sent)',
    simStatus: 'Payment status',
    simOrder: 'Order id (filled in for you)',
    simFull: 'Run it all: order → payment → key → email',
    simCreate: 'Create order only',
    simPay: 'Simulate payment only',
    simInspect: 'Inspect order',
    simMail: 'Send a test email',
    simCron: 'Run cron now',
    simPurge: 'Purge test data',
    simNeedEmail: 'Enter a real email address first.',
    simNeedOrder: 'Enter an order id, or create one first.',
    simWorking: 'Working…',
    manualTitle: 'Manual request',
    mMethod: 'Method',
    mEndpoint: 'Endpoint',
    mHeaders: 'Headers',
    mBody: 'Body',
    mSend: 'Send',
    mWaiting: 'Sending…',
    mNeedEndpoint: 'Enter an endpoint first',
    mBadHeaders: 'Invalid headers JSON',
    t_seoRobots: 'robots.txt', d_seoRobots: 'Sitemap line, Disallow and Allow rules',
    t_seoSitemap: 'sitemap.xml', d_seoSitemap: 'URL count, full hreflang set and images',
    t_seoCanonical: 'Canonical URL', d_seoCanonical: 'The front page must name the canonical domain',
    t_seoHreflang: 'hreflang', d_seoHreflang: 'Three languages plus x-default',
    t_seoJsonLd: 'Structured data', d_seoJsonLd: 'Valid JSON-LD with Organization, WebSite and WebPage',
    t_seoBrand: 'Brand name', d_seoBrand: 'The Persian and Japanese spellings on the front page',
    t_seoSnippet: 'Title & description', d_seoSnippet: 'Front page title and description width, and a single h1',
    t_seoGamePage: 'Game page', d_seoGamePage: 'The same three checks on a game landing page',
    t_seoCanonicalForm: 'One address per page', d_seoCanonicalForm: 'Trailing slash and capitals must 301 in a single hop',
    t_seoNames: 'Every spelling of the name', d_seoNames: 'The game name in every script and encoding, on its page',
    seoBadRedirect: 'Wrong redirect',
    seoNoNames: 'These spellings are absent from the page',
    seoNameCount: 'spellings',
    seoSnippetBad: 'Problem with',
    seoWidths: 'title/description width',
    seoMissing: 'Missing',
    seoUrls: 'URLs',
    seoNodes: 'Nodes',
    seoNoImages: 'No images in the sitemap',
    seoNoCanonical: 'No canonical tag',
    seoWrongHost: 'Canonical points at another host',
    seoHreflangShort: 'Incomplete hreflang set',
    seoNoJsonLd: 'No JSON-LD on the page',
    seoBadJsonLd: 'Unparsable JSON-LD blocks',
    seoNoBrand: 'These name forms are absent from the page',
    t_sysMetrics: 'Metrics', d_sysMetrics: '/metrics payload & key fields',
    t_sys404: '404 handling', d_sys404: 'Unknown route should return 404',
    t_sys405: '405 handling', d_sys405: 'Bad method on /metrics should return 405',
    t_sysCors: 'CORS header', d_sysCors: 'Access-Control-Allow-Origin present',
    t_sysPreflight: 'CORS preflight', d_sysPreflight: 'Correct response to OPTIONS',
    t_sysContentType: 'Content-Type', d_sysContentType: '/metrics should be application/json',
    t_sysSecurity: 'Security headers', d_sysSecurity: 'X-Frame-Options & X-Content-Type-Options',
    t_sysRequestId: 'Request ID', d_sysRequestId: 'X-Request-ID header present',
    t_sysResponseTime: 'Response time', d_sysResponseTime: '/metrics latency',
    t_gameHealth: 'Health', d_gameHealth: 'Status & health structure',
    t_gamePing: 'Ping', d_gamePing: 'Latency & connection quality',
    t_gameLeaderboard: 'Leaderboard', d_gameLeaderboard: 'Player list & structure',
    t_gameLbLimit: 'Leaderboard limit', d_gameLbLimit: 'limit=5 must be respected',
    t_gamePrivacy: 'Privacy', d_gamePrivacy: 'HTML page with status 200',
    t_gameTerms: 'Terms', d_gameTerms: 'HTML page with status 200',
    t_authValidateNoToken: 'Validate (no token)', d_authValidateNoToken: 'No Authorization should return 401',
    t_authValidateNoUid: 'Validate (no uid)', d_authValidateNoUid: 'Token but no uid should return 400',
    t_authRefreshEmpty: 'Refresh (empty)', d_authRefreshEmpty: 'No refreshToken should return 400',
    t_authCheckNoBody: 'Check (no body)', d_authCheckNoBody: 'No uid should return 400',
    t_authCheckNoToken: 'Check (no token)', d_authCheckNoToken: 'uid but no token should return 401',
    t_oauthAuthNoRedirect: 'Auth (no redirect_uri)', d_oauthAuthNoRedirect: 'No redirect_uri should return 400',
    t_oauthAuthWithRedirect: 'Auth (redirect_uri)', d_oauthAuthWithRedirect: 'Should return an HTML redirect page',
    t_oauthTokenNoCode: 'Token (no code)', d_oauthTokenNoCode: 'No code should return 400',
    t_oauthCallbackNoParams: 'Callback (no params)', d_oauthCallbackNoParams: 'Must not error with 500',
    t_dbGetUnauth: 'GET (no token)', d_dbGetUnauth: '/database/get should return 401',
    t_dbSetUnauth: 'SET (no token)', d_dbSetUnauth: '/database/set should return 401',
    t_dbPatchUnauth: 'PATCH (no token)', d_dbPatchUnauth: '/database/patch should return 401',
    t_d1Connection: 'D1 connection', d_d1Connection: 'Leaderboard served from D1',
    t_d1Schema: 'D1 schema', d_d1Schema: 'rank, username & highScore fields',
    t_d1Limit: 'D1 limit', d_d1Limit: 'limit=3 must be respected',
    t_d1EmptyUser: 'Unknown user, unusable token', d_d1EmptyUser: 'Must be 401 — and must not reveal whether the row exists',
    t_d1GetUnauth: 'GET (no token)', d_d1GetUnauth: 'User read should return 401',
    t_d1SetUnauth: 'SET (no token)', d_d1SetUnauth: 'User write should return 401',
    t_d1PatchUnauth: 'PATCH (no token)', d_d1PatchUnauth: 'User update should return 401',
    t_d1ScoreInvalid: 'Invalid score', d_d1ScoreInvalid: 'Negative score should be rejected',
    t_d1UnknownPath: 'Unknown path', d_d1UnknownPath: 'Must not error with 500',

    t_tgReachable: 'Panel reachable', d_tgReachable: 'An unknown action must be 400 bad_action',
    t_tgMethod: 'POST only', d_tgMethod: 'GET on /thegod/api must be 405',
    t_tgOverview: 'Game list', d_tgOverview: 'overview must return every game in the expected shape',
    t_tgGameGet: 'Read one game', d_tgGameGet: 'game.get must return the game that was asked for',
    t_tgUnknownGame: 'Unknown game', d_tgUnknownGame: 'An id that is not in Config.js must be 404, never created',
    t_tgUnknownProduct: 'Unknown product', d_tgUnknownProduct: 'Re-pricing a product that is not in code must be refused',
    t_tgSchema: 'game_settings schema', d_tgSchema: 'Every column the panel writes must exist \u2014 this is the check that catches "it saved but nothing changed"',
    t_tgPlayerDb: 'The game\'s own database', d_tgPlayerDb: 'The game binding and its players table must both be there',
    t_tgLanding: 'Game page editor', d_tgLanding: 'Must return both the stored row and the Config.js baseline under it',
    t_tgSqlSettings: 'Settings SQL is honest', d_tgSqlSettings: 'The generated SQL must match the stored row, timestamp included',
    t_tgSqlGame: 'New-game SQL', d_tgSqlGame: 'Must produce the players table and the ordered setup steps',
    t_tgScaffold: 'New-game scaffold', d_tgScaffold: 'Must return all four files; nothing is created or stored',
    t_tgUnity: 'Unity kit', d_tgUnity: 'Every module must arrive with real code in it, not empty',
    t_tgEnv: 'Environment', d_tgEnv: 'Must report the required keys and the OAuth redirect URI',
    t_tgOrders: 'Payments', d_tgOrders: 'orders.list must return a page and its stats',
    t_tgPlayers: 'Players', d_tgPlayers: 'players.list must read the game\'s own database',
    t_tgVerify: 'Game health check', d_tgVerify: 'The panel\'s own check, run from outside \u2014 anything it calls broken fails here',

    t_coConfig: 'Configuration', d_coConfig: 'Every secret and table the checkout needs',
    t_coPage: 'Checkout page', d_coPage: '/checkout renders with the button enabled',
    t_coOrderPage: 'Order help page', d_coOrderPage: '/order with the support template',
    t_coBadEmail: 'Invalid email', d_coBadEmail: 'An order with a bad address is refused',
    t_coBadTier: 'Invalid tier', d_coBadTier: 'An unknown edition is refused',
    t_coWebhookUnsigned: 'Unsigned webhook', d_coWebhookUnsigned: 'Must be 401 — the critical security check',
    t_coStatusUnknown: 'Unknown order', d_coStatusUnknown: 'An unknown id must be 404',
    t_coLookupBad: 'Invalid lookup', d_coLookupBad: 'A bad address in order recovery',

    t_vidPlay: 'Video playback', d_vidPlay: '/video/en/1 with Accept-Ranges',
    t_vidRange: 'Seeking', d_vidRange: 'A Range request must return 206',
    t_vidHead: 'File metadata', d_vidHead: 'HEAD returns the size',
    t_vidJa: 'Japanese clip', d_vidJa: '/video/ja/1 exists in R2',
    t_vidFa: 'Persian clip', d_vidFa: '/video/fa/1 exists in R2',
    t_vidMissing: 'Persian clip 10', d_vidMissing: 'English-only — must be a clean 404'
  },
  ja: {
    loginTitle: 'テストパネル ログイン',
    loginSub: '開発者専用アクセス',
    loginPassword: 'パスワード',
    loginPlaceholder: 'パスワードを入力',
    loginButton: 'サインイン',
    loginLoading: 'サインイン中…',
    loginError: 'パスワードが正しくありません',
    loginBlocked: 'ログインの失敗が多すぎます。15分後にもう一度お試しください。',
    showPassword: 'パスワードを表示',
    panelTitle: 'テストパネル',
    panelSub: 'プロキシとデータベースのライブ診断',
    runAll: 'すべて実行',
    running: '実行中…',
    reset: 'リセット',
    exportReport: '結果をエクスポート',
    copied: 'コピーしました',
    logout: 'ログアウト',
    theme: 'テーマ切替',
    language: '言語切替',
    controls: 'コントロール',
    allDone: '全テスト完了',
    nothingToExport: '先にテストを実行してください',
    statTotal: '合計',
    statPass: '成功',
    statFail: '失敗',
    statWarn: '警告',
    statTime: '時間',
    bPending: '待機中',
    bRunning: '実行中',
    bPass: '正常',
    bFail: '失敗',
    bPartial: '一部',
    rPass: '成功',
    rFail: '失敗',
    rWarn: '警告',
    rRunning: '実行中',
    rIdle: '—',
    gSystem: 'コアシステム',
    gGame: 'ゲーム',
    gAuth: '認証',
    gOauth: 'OAuth フロー',
    gDb: 'データベース',
    gD1: 'D1 データベース',
    gCheckout: '暗号資産チェックアウト',
    gSeo: '検索での見え方',
    gVideo: 'デモ動画',
    gTheGod: 'TheGod パネル',
    net: 'ネットワークエラー',
    coOff: '未設定です (503)',
    coNoAuth: 'まず /testsite にサインインしてください',
    coMissing: '不足',
    coForged: '⚠ 署名なしの Webhook が受理されました — NOWPAYMENTS_IPN_SECRET を確認してください',
    vidNotInR2: 'R2 にファイルが見つかりません',
    d1Leak: '⚠ 検証済みトークンなしで参照が実行され、そのプレイヤーの有無が漏れています。401 であるべきです',
    tgNoAuth: '先に /thegod でサインインしてください',
    tgError: 'パネルが拒否しました',
    tgNoGames: 'ゲームが登録されていません',
    tgNoTable: 'game_settings を読めません — migrations/0003_games.sql を実行してください',
    tgMissingColumns: '⚠ これらの列がデータベースにありません。該当フィールドの入力は失われます。SQL タブの「修復」を実行してください',
    tgNoBinding: 'このゲームの D1 バインディングが未接続です',
    tgNoPlayers: 'players テーブルがありません',
    tgNoModeration: 'モデレーション列がありません (0006)',
    tgNoOptOut: 'ランキング非表示の列がありません (0010)',
    tgBlocked: 'これらのゲームページ項目は保存できません',
    tgStaleSql: '生成された SQL が保存済みの行と一致しません',
    tgEmptyModule: 'これらの Unity ファイルが空で返りました',
    tgNoOauth: 'このゲームの Google クライアントキーが未設定です',
    tgVerifyFailed: 'ヘルスチェックが失敗と報告した項目',
    tgVerifyWarned: 'ヘルスチェックが警告した項目',
    expected: '期待',
    missingField: '欠落フィールド',
    badStruct: '不正な構造',
    missingHeaders: '欠落ヘッダー',
    serverErr: 'サーバーエラー (500)',
    overLimit: '上限超過',
    quality: '品質',
    records: 'レコード',
    players: 'プレイヤー',
    slow: '遅い',
    tooSlow: '非常に遅い',
    validHtml: '有効なHTML',
    licTitle: 'ライセンス管理',
    licLede: '発行済みのキーを一覧・検索し、必要なものを失効させられます。検索はキーのラベルの一部、注文番号、顧客のメールアドレスに一致します。',
    licSearch: '検索',
    licStatus: '状態',
    licTier: 'エディション',
    licAny: 'すべて',
    licLoad: 'ライセンスを表示',
    licStats: '概要',
    licNone: '条件に一致するライセンスはありません。',
    licSeats: '台',
    licRevoke: '失効',
    licRestore: '復元',
    licDevices: 'マシン',
    licDelete: '削除',
    licNever: '未有効化',
    licRevokeAsk: 'このキーを失効させますか?新しいマシンでは使えなくなります。',
    licDeleteAsk: 'レコードを完全に削除しますか?元に戻せません。不正利用への対処としては、履歴が残る「失効」の方が適切です。',
    licDeleteActivated: 'このキーは実際のマシンで有効化されています。購入者がいる可能性が高いです。それでも削除しますか?',
    licReleaseAsk: 'このマシンを解放しますか?',
    licTotal: '合計',
    simTitle: 'チェックアウト・シミュレーター',
    simLede: '支払い後の処理全体を、実際に支払うことなく実行します。ライセンスキーは本物が発行され、メールも実際に送信されます。作り物は決済事業者からの通知だけで、同じ JSON を本物の署名付きで本物の Webhook に送ります。',
    simTier: 'エディション',
    simLang: 'メールの言語',
    simEmail: 'メールアドレス(実際に送信されます)',
    simStatus: '支払いステータス',
    simOrder: '注文番号(自動入力)',
    simFull: '一括実行: 注文 → 支払い → キー → メール',
    simCreate: '注文の作成のみ',
    simPay: '支払いのシミュレートのみ',
    simInspect: '注文を確認',
    simMail: 'テストメールを送信',
    simCron: 'cron を今すぐ実行',
    simPurge: 'テストデータを削除',
    simNeedEmail: 'まず実在するメールアドレスを入力してください。',
    simNeedOrder: '注文番号を入力するか、先に注文を作成してください。',
    simWorking: '実行中…',
    manualTitle: '手動リクエスト',
    mMethod: 'メソッド',
    mEndpoint: 'エンドポイント',
    mHeaders: 'ヘッダー',
    mBody: 'ボディ',
    mSend: '送信',
    mWaiting: '送信中…',
    mNeedEndpoint: '先にエンドポイントを入力',
    mBadHeaders: 'ヘッダーJSONが不正',
    t_seoRobots: 'robots.txt', d_seoRobots: 'Sitemap 行と Disallow・Allow の規則',
    t_seoSitemap: 'sitemap.xml', d_seoSitemap: 'URL 数、hreflang の完全性、画像',
    t_seoCanonical: 'canonical URL', d_seoCanonical: 'トップページの canonical は正規ドメインであること',
    t_seoHreflang: 'hreflang', d_seoHreflang: '3 言語 + x-default',
    t_seoJsonLd: '構造化データ', d_seoJsonLd: 'Organization・WebSite・WebPage を含む有効な JSON-LD',
    t_seoBrand: 'ブランド名', d_seoBrand: 'トップページ内のペルシア語・日本語表記',
    t_seoSnippet: 'タイトルと説明', d_seoSnippet: 'トップページのタイトル・説明の表示幅と h1 が 1 つであること',
    t_seoGamePage: 'ゲームページ', d_seoGamePage: 'ゲームのランディングページで同じ 3 項目を確認',
    t_seoCanonicalForm: '1 ページ 1 アドレス', d_seoCanonicalForm: '末尾スラッシュと大文字は 1 回の 301 で正規化されること',
    t_seoNames: '名前の全表記', d_seoNames: 'ゲーム名が各文字体系・各エンコーディングでページ内にあること',
    seoBadRedirect: 'リダイレクトが不正',
    seoNoNames: 'これらの表記がページにありません',
    seoNameCount: '表記数',
    seoSnippetBad: '問題箇所',
    seoWidths: 'タイトル/説明の幅',
    seoMissing: '不足',
    seoUrls: 'URL 数',
    seoNodes: 'ノード数',
    seoNoImages: 'サイトマップに画像がありません',
    seoNoCanonical: 'canonical タグがありません',
    seoWrongHost: 'canonical が別のホストを指しています',
    seoHreflangShort: 'hreflang が不完全です',
    seoNoJsonLd: 'ページに JSON-LD がありません',
    seoBadJsonLd: '解析できない JSON-LD ブロック',
    seoNoBrand: 'これらの表記がページにありません',
    t_sysMetrics: 'Metrics', d_sysMetrics: '/metrics と主要フィールド',
    t_sys404: '404 処理', d_sys404: '不明なルートは 404 を返すべき',
    t_sys405: '405 処理', d_sys405: '/metrics への不正メソッドは 405 を返すべき',
    t_sysCors: 'CORS ヘッダー', d_sysCors: 'Access-Control-Allow-Origin の存在',
    t_sysPreflight: 'CORS プリフライト', d_sysPreflight: 'OPTIONS への正しい応答',
    t_sysContentType: 'Content-Type', d_sysContentType: '/metrics は application/json であるべき',
    t_sysSecurity: 'セキュリティヘッダー', d_sysSecurity: 'X-Frame-Options と X-Content-Type-Options',
    t_sysRequestId: 'Request ID', d_sysRequestId: 'X-Request-ID ヘッダーの存在',
    t_sysResponseTime: '応答時間', d_sysResponseTime: '/metrics の応答速度',
    t_gameHealth: 'ヘルス', d_gameHealth: 'ステータスと health 構造',
    t_gamePing: 'Ping', d_gamePing: 'レイテンシと接続品質',
    t_gameLeaderboard: 'リーダーボード', d_gameLeaderboard: 'プレイヤー一覧と構造',
    t_gameLbLimit: 'リーダーボード上限', d_gameLbLimit: 'limit=5 を守るべき',
    t_gamePrivacy: 'プライバシー', d_gamePrivacy: 'ステータス 200 の HTML ページ',
    t_gameTerms: '利用規約', d_gameTerms: 'ステータス 200 の HTML ページ',
    t_authValidateNoToken: 'Validate (トークンなし)', d_authValidateNoToken: 'Authorization なしは 401 を返すべき',
    t_authValidateNoUid: 'Validate (uidなし)', d_authValidateNoUid: 'トークンありで uid なしは 400 を返すべき',
    t_authRefreshEmpty: 'Refresh (空)', d_authRefreshEmpty: 'refreshToken なしは 400 を返すべき',
    t_authCheckNoBody: 'Check (ボディなし)', d_authCheckNoBody: 'uid なしは 400 を返すべき',
    t_authCheckNoToken: 'Check (トークンなし)', d_authCheckNoToken: 'uid ありでトークンなしは 401 を返すべき',
    t_oauthAuthNoRedirect: 'Auth (redirect_uriなし)', d_oauthAuthNoRedirect: 'redirect_uri なしは 400 を返すべき',
    t_oauthAuthWithRedirect: 'Auth (redirect_uri)', d_oauthAuthWithRedirect: 'HTML リダイレクトページを返すべき',
    t_oauthTokenNoCode: 'Token (codeなし)', d_oauthTokenNoCode: 'code なしは 400 を返すべき',
    t_oauthCallbackNoParams: 'Callback (パラメータなし)', d_oauthCallbackNoParams: '500 でエラーになってはいけない',
    t_dbGetUnauth: 'GET (トークンなし)', d_dbGetUnauth: '/database/get は 401 を返すべき',
    t_dbSetUnauth: 'SET (トークンなし)', d_dbSetUnauth: '/database/set は 401 を返すべき',
    t_dbPatchUnauth: 'PATCH (トークンなし)', d_dbPatchUnauth: '/database/patch は 401 を返すべき',
    t_d1Connection: 'D1 接続', d_d1Connection: 'リーダーボードは D1 から提供される',
    t_d1Schema: 'D1 スキーマ', d_d1Schema: 'rank, username, highScore フィールド',
    t_d1Limit: 'D1 上限', d_d1Limit: 'limit=3 を守るべき',
    t_d1EmptyUser: '不明なユーザー・無効トークン', d_d1EmptyUser: '401 を返し、行の有無を明かさないこと',
    t_d1GetUnauth: 'GET (トークンなし)', d_d1GetUnauth: 'ユーザー読取は 401 を返すべき',
    t_d1SetUnauth: 'SET (トークンなし)', d_d1SetUnauth: 'ユーザー書込は 401 を返すべき',
    t_d1PatchUnauth: 'PATCH (トークンなし)', d_d1PatchUnauth: 'ユーザー更新は 401 を返すべき',
    t_d1ScoreInvalid: '不正なスコア', d_d1ScoreInvalid: 'マイナススコアは拒否されるべき',
    t_d1UnknownPath: '不明なパス', d_d1UnknownPath: '500 でエラーになってはいけない',

    t_tgReachable: 'パネルへの到達', d_tgReachable: '不明なアクションは 400 bad_action を返すこと',
    t_tgMethod: 'POST のみ', d_tgMethod: '/thegod/api への GET は 405 であること',
    t_tgOverview: 'ゲーム一覧', d_tgOverview: 'overview が全ゲームを想定どおりの形で返すこと',
    t_tgGameGet: '単一ゲームの取得', d_tgGameGet: 'game.get が要求したゲームを返すこと',
    t_tgUnknownGame: '存在しないゲーム', d_tgUnknownGame: 'Config.js にない ID は 404。作成されないこと',
    t_tgUnknownProduct: '存在しない商品', d_tgUnknownProduct: 'コードにない商品の価格変更は拒否されること',
    t_tgSchema: 'game_settings のスキーマ', d_tgSchema: 'パネルが書き込む列がすべて存在すること — 「保存できたのに何も変わらない」を検出する項目です',
    t_tgPlayerDb: 'ゲーム専用 DB', d_tgPlayerDb: 'ゲームのバインディングと players テーブルが揃っていること',
    t_tgLanding: 'ゲームページ編集', d_tgLanding: '保存済みの行と Config.js のベースラインの両方を返すこと',
    t_tgSqlSettings: '設定 SQL の正確さ', d_tgSqlSettings: '生成 SQL が保存済みの行（更新時刻を含む）と一致すること',
    t_tgSqlGame: '新規ゲームの SQL', d_tgSqlGame: 'players テーブルと手順を生成すること',
    t_tgScaffold: '新規ゲームの雛形', d_tgScaffold: '4 つのファイルをすべて返すこと。何も作成・保存されません',
    t_tgUnity: 'Unity キット', d_tgUnity: '各モジュールに実際のコードが含まれていること',
    t_tgEnv: '環境変数', d_tgEnv: '必要なキーと OAuth リダイレクト URI を報告すること',
    t_tgOrders: '決済', d_tgOrders: 'orders.list が一覧と統計を返すこと',
    t_tgPlayers: 'プレイヤー', d_tgPlayers: 'players.list がゲーム専用 DB を読むこと',
    t_tgVerify: 'ゲームのヘルスチェック', d_tgVerify: 'パネル内蔵のチェックを外部から実行。重大な問題があれば失敗',

    t_coConfig: '設定', d_coConfig: '必要なシークレットとテーブルの有無',
    t_coPage: '購入ページ', d_coPage: '/checkout が表示されボタンが有効',
    t_coOrderPage: '注文ページ', d_coOrderPage: '/order とサポート文面',
    t_coBadEmail: '無効なメール', d_coBadEmail: '不正なアドレスの注文は拒否される',
    t_coBadTier: '無効なエディション', d_coBadTier: '未知のエディションは拒否される',
    t_coWebhookUnsigned: '署名なし Webhook', d_coWebhookUnsigned: '401 必須 — 最重要のセキュリティ確認',
    t_coStatusUnknown: '存在しない注文', d_coStatusUnknown: '未知の ID は 404',
    t_coLookupBad: '無効な検索', d_coLookupBad: '注文復旧での不正なアドレス',

    t_vidPlay: '動画の再生', d_vidPlay: '/video/en/1 と Accept-Ranges',
    t_vidRange: 'シーク', d_vidRange: 'Range リクエストは 206 を返す',
    t_vidHead: 'ファイル情報', d_vidHead: 'HEAD がサイズを返す',
    t_vidJa: '日本語クリップ', d_vidJa: '/video/ja/1 が R2 に存在',
    t_vidFa: 'ペルシア語クリップ', d_vidFa: '/video/fa/1 が R2 に存在',
    t_vidMissing: 'ペルシア語クリップ 10', d_vidMissing: '英語のみ — 404 が正しい'
  }
}


// ==========================================
// Shared Theme Tokens (light default + dark override + OS-follow)
// ==========================================
function themeTokens(accent, accentRgb) {
  return `
  :root {
    --accent: ${accent};
    --accent-rgb: ${accentRgb};

    /* The text colour that reads on an accent-filled control.
       Measured, not assumed - accentInk() in Core/Html.js. This
       page paints with the GAME's colour, so a bright one used to
       print white on mint at about 1.3:1. */
    --on-accent: ${accentInk(accent)};
    --bg: #f4f6fb;
    --bg-soft: #eef1f8;
    --surface: #ffffff;
    --surface-2: #f7f9fd;
    --text: #1d2433;
    --muted: #6b7488;
    --border: rgba(20, 28, 45, 0.10);
    --shadow: 0 10px 30px rgba(20, 28, 45, 0.10);
    --ok: #18a558;  --ok-rgb: 24, 165, 88;
    --warn: #e08600; --warn-rgb: 224, 134, 0;
    --err: #e23b3b; --err-rgb: 226, 59, 59;
    --info: #2f6df6; --info-rgb: 47, 109, 246;
    --radius: 16px;
  }
  [data-theme="dark"] {
    --bg: #0e131c;
    --bg-soft: #131a26;
    --surface: #161e2b;
    --surface-2: #1c2636;
    --text: #e7ecf5;
    --muted: #9aa6bd;
    --border: rgba(255, 255, 255, 0.09);
    --shadow: 0 14px 36px rgba(0, 0, 0, 0.45);
    --ok: #2ecc71; --ok-rgb: 46, 204, 113;
    --warn: #f5a623; --warn-rgb: 245, 166, 35;
    --err: #ff5c5c; --err-rgb: 255, 92, 92;
    --info: #5b8dff; --info-rgb: 91, 141, 255;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #0e131c; --bg-soft: #131a26; --surface: #161e2b; --surface-2: #1c2636;
      --text: #e7ecf5; --muted: #9aa6bd; --border: rgba(255,255,255,0.09);
      --shadow: 0 14px 36px rgba(0,0,0,0.45);
      --ok: #2ecc71; --ok-rgb: 46, 204, 113;
      --warn: #f5a623; --warn-rgb: 245, 166, 35;
      --err: #ff5c5c; --err-rgb: 255, 92, 92;
      --info: #5b8dff; --info-rgb: 91, 141, 255;
    }
  }`
}


// ==========================================
// Topbar (brand + language pills + theme toggle), shared by both pages
// ==========================================
function topbarHtml(prefix, amirLogo, brandName, lang) {
  const langButtons = LANGS.map(code =>
    `<button type="button" class="${prefix}-lang-btn${code === lang ? ' is-active' : ''}" data-lang="${code}" lang="${code}">${LANG_META[code].label}</button>`
  ).join('')

  return `
    <header class="${prefix}-topbar">
      <div class="${prefix}-brand">
        <span class="${prefix}-logo"><img src="${escapeHtml(amirLogo)}" alt="AmirCollider" onerror="this.style.display='none'"></span>
        <span class="${prefix}-brand-name">${escapeHtml(brandName)}</span>
      </div>
      <div class="${prefix}-controls-top">
        <div class="${prefix}-lang" role="group" data-i18n-aria="language">${langButtons}</div>
        <button type="button" class="${prefix}-icon-btn" id="${prefix}-theme" data-i18n-aria="theme">
          <span class="${prefix}-sun">${ICONS.sun}</span><span class="${prefix}-moon">${ICONS.moon}</span>
        </button>
      </div>
    </header>`
}


// ==========================================
// Page: Login
// ==========================================
function renderLogin(baseUrl, lang, theme, error) {
  // '1' is a wrong password, '2' is too many tries. The banner is
  // one element either way - only its text changes - so the CSS
  // below still asks a single question: is there anything to show?
  const failed = error === '1' || error === '2'
  const blocked = error === '2'
  const dict = I18N[lang] || I18N[DEFAULT_LANG]
  const meta = LANG_META[lang] || LANG_META[DEFAULT_LANG]
  const accent = PANEL_ACCENT
  const accentRgb = hexToRgb(accent)
  const amirLogo = CONFIG.AMIR_LOGO
  const themeAttr = theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : ''
  const payload = JSON.stringify({ lang, defaultLang: DEFAULT_LANG, i18n: I18N, langMeta: LANG_META }).replace(/</g, '\\u003c')

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${meta.dir}"${themeAttr}>
<head>
  ${getPageHead({ title: `${escapeHtml(dict.loginTitle)} | AmirCollider`, amirLogo })}
  ${themeBootScript()}
  <style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  ${themeTokens(accent, accentRgb)}
  html { -webkit-text-size-adjust: 100%; }
  body {
    font-family: 'Vazirmatn', 'Segoe UI', system-ui, -apple-system, 'Hiragino Sans', 'Noto Sans JP', Tahoma, sans-serif;
    background: var(--bg); color: var(--text); min-height: 100vh; line-height: 1.6;
    display: flex; flex-direction: column;
    transition: background .35s ease, color .35s ease;
  }
  .lg-bg { position: fixed; inset: 0; z-index: -1; pointer-events: none;
    background:
      radial-gradient(60vw 60vw at 82% -12%, rgba(var(--accent-rgb), .18), transparent 60%),
      radial-gradient(55vw 55vw at -12% 112%, rgba(var(--accent-rgb), .12), transparent 60%); }

  .lg-topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px;
    flex-wrap: wrap; padding: 18px clamp(16px, 4vw, 34px); }
  .lg-brand { display: flex; align-items: center; gap: 10px; }
  .lg-logo { width: 36px; height: 36px; border-radius: 50%; overflow: hidden; flex: none;
    background: var(--surface); border: 1px solid var(--border); display: inline-flex;
    align-items: center; justify-content: center; }
  .lg-logo img { width: 100%; height: 100%; object-fit: cover; }
  .lg-brand-name { font-weight: 700; font-size: .95rem; }
  .lg-controls-top { display: flex; align-items: center; gap: 10px; }
  .lg-lang { display: inline-flex; background: var(--surface); border: 1px solid var(--border);
    border-radius: 999px; padding: 3px; box-shadow: var(--shadow); }
  .lg-lang-btn { border: 0; background: transparent; color: var(--muted); cursor: pointer;
    font: inherit; font-size: .8rem; padding: 6px 11px; border-radius: 999px;
    transition: color .2s ease, background .2s ease; }
  .lg-lang-btn:hover { color: var(--text); }
  .lg-lang-btn.is-active { color: var(--on-accent, #fff); background: var(--accent); }
  .lg-icon-btn { width: 38px; height: 38px; border-radius: 50%; cursor: pointer;
    background: var(--surface); border: 1px solid var(--border); color: var(--text);
    display: inline-flex; align-items: center; justify-content: center; box-shadow: var(--shadow);
    transition: transform .2s ease; }
  .lg-icon-btn:hover { transform: translateY(-2px); }
  .lg-icon-btn svg { width: 18px; height: 18px; }
  .lg-sun { display: none; } .lg-moon { display: inline-flex; }
  [data-theme="dark"] .lg-sun { display: inline-flex; } [data-theme="dark"] .lg-moon { display: none; }

  .lg-wrap { flex: 1; display: flex; align-items: center; justify-content: center; padding: 24px 16px 56px; }
  .lg-card { width: 100%; max-width: 410px; background: var(--surface); border: 1px solid var(--border);
    border-radius: 22px; padding: clamp(30px, 5vw, 44px); box-shadow: var(--shadow);
    animation: lgIn .5s cubic-bezier(.16,1,.3,1) both; }
  @keyframes lgIn { from { opacity: 0; transform: translateY(18px) scale(.98); } to { opacity: 1; transform: none; } }

  .lg-head { text-align: center; margin-bottom: 26px; }
  .lg-icon { width: 56px; height: 56px; margin: 0 auto 16px; border-radius: 16px;
    display: flex; align-items: center; justify-content: center; color: var(--on-accent, #fff);
    background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 60%, #8a5bff));
    box-shadow: 0 10px 26px rgba(var(--accent-rgb), .4); }
  .lg-icon svg { width: 26px; height: 26px; }
  .lg-head h1 { font-size: 1.4rem; font-weight: 800; letter-spacing: -.01em; }
  .lg-head p { color: var(--muted); font-size: .88rem; margin-top: 6px; }

  .lg-error { display: ${failed ? 'flex' : 'none'}; align-items: center; gap: 8px;
    background: rgba(var(--err-rgb), .12); border: 1px solid rgba(var(--err-rgb), .3);
    color: var(--err); border-radius: 12px; padding: 11px 15px; font-size: .85rem;
    margin-bottom: 20px; animation: lgShake .4s ease; }
  @keyframes lgShake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }

  .lg-label { display: block; font-size: .8rem; color: var(--muted); margin-bottom: 8px; font-weight: 600; }
  .lg-field { position: relative; margin-bottom: 24px; }
  .lg-input { width: 100%; padding: 13px 46px 13px 16px; background: var(--surface-2);
    border: 1px solid var(--border); border-radius: 13px; color: var(--text); font: inherit;
    font-size: 1rem; outline: none; transition: border-color .2s ease, box-shadow .2s ease; }
  :root[dir="rtl"] .lg-input { padding: 13px 16px 13px 46px; }
  .lg-input:focus { border-color: var(--accent); box-shadow: 0 0 0 4px rgba(var(--accent-rgb), .14); }
  .lg-toggle { position: absolute; inset-inline-end: 8px; top: 50%; transform: translateY(-50%);
    width: 34px; height: 34px; border: 0; background: transparent; color: var(--muted);
    cursor: pointer; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; }
  .lg-toggle:hover { color: var(--text); }
  .lg-toggle svg { width: 19px; height: 19px; }
  .lg-eye-off { display: none; }

  .lg-btn { width: 100%; padding: 14px; border: 0; border-radius: 13px; cursor: pointer;
    font: inherit; font-weight: 700; font-size: 1rem; color: var(--on-accent, #fff);
    background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 62%, #8a5bff));
    box-shadow: 0 8px 22px rgba(var(--accent-rgb), .38);
    transition: transform .2s ease, box-shadow .2s ease, opacity .2s ease; }
  .lg-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 30px rgba(var(--accent-rgb), .48); }
  .lg-btn:disabled { opacity: .65; cursor: default; transform: none; }
  .lg-foot { text-align: center; margin-top: 22px; font-size: .76rem; color: var(--muted); }

  :where(button, a, input):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
  </style>
</head>
<body>
  <div class="lg-bg" aria-hidden="true"></div>
  ${topbarHtml('lg', amirLogo, PANEL_BRAND, lang)}

  <div class="lg-wrap">
    <div class="lg-card">
      <div class="lg-head">
        <div class="lg-icon">${ICONS.lock}</div>
        <h1 data-i18n="loginTitle">${escapeHtml(dict.loginTitle)}</h1>
        <p data-i18n="loginSub">${escapeHtml(dict.loginSub)}</p>
      </div>

      <div class="lg-error" role="alert">${ICONS.shield}<span${blocked ? '' : ' data-i18n="loginError"'}>${escapeHtml(blocked ? dict.loginBlocked : dict.loginError)}</span></div>

      <form method="POST" action="${escapeHtml(baseUrl)}/testsite/login" id="lg-form">
        <label class="lg-label" for="lg-pw" data-i18n="loginPassword">${escapeHtml(dict.loginPassword)}</label>
        <div class="lg-field">
          <input class="lg-input" type="password" id="lg-pw" name="password"
            placeholder="${escapeHtml(dict.loginPlaceholder)}" data-i18n-ph="loginPlaceholder"
            autocomplete="current-password" required autofocus>
          <button type="button" class="lg-toggle" id="lg-toggle" data-i18n-aria="showPassword" aria-label="${escapeHtml(dict.showPassword)}">
            <span class="lg-eye-on">${ICONS.eye}</span><span class="lg-eye-off">${ICONS.eyeOff}</span>
          </button>
        </div>
        <button type="submit" class="lg-btn" id="lg-submit" data-i18n="loginButton">${escapeHtml(dict.loginButton)}</button>
      </form>

      <div class="lg-foot" data-i18n="loginSub">${escapeHtml(dict.loginSub)}</div>
    </div>
  </div>

  <script id="lg-data" type="application/json">${payload}</script>
  <script>${loginClientScript()}</script>
</body>
</html>`
}


// ==========================================
// Login Client Runtime (theme + language switch, no reload)
// ==========================================
function loginClientScript() {
  return `
  (function () {
    var data = JSON.parse(document.getElementById('lg-data').textContent);
    var root = document.documentElement;

    function write(key, val) {
      try { localStorage.setItem(key, val); } catch (e) {}
      if (key === 'lang') document.cookie = 'lang=' + val + ';path=/;max-age=31536000;SameSite=Lax';
      if (key === 'ac_theme') document.cookie = 'theme=' + val + ';path=/;max-age=31536000;SameSite=Lax';
    }
    function currentTheme() {
      var a = root.getAttribute('data-theme');
      if (a === 'dark' || a === 'light') return a;
      return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    function applyTheme(t) { root.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light'); write('ac_theme', t === 'dark' ? 'dark' : 'light'); }
    document.getElementById('lg-theme').addEventListener('click', function () { applyTheme(currentTheme() === 'dark' ? 'light' : 'dark'); });

    function applyLang(lang) {
      var dict = data.i18n[lang], meta = data.langMeta[lang];
      if (!dict || !meta) return;
      root.setAttribute('lang', lang); root.setAttribute('dir', meta.dir);
      document.querySelectorAll('[data-i18n]').forEach(function (el) {
        var k = el.getAttribute('data-i18n'); if (dict[k] != null) el.textContent = dict[k];
      });
      document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
        var k = el.getAttribute('data-i18n-ph'); if (dict[k] != null) el.setAttribute('placeholder', dict[k]);
      });
      document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
        var k = el.getAttribute('data-i18n-aria'); if (dict[k] != null) el.setAttribute('aria-label', dict[k]);
      });
      document.querySelectorAll('.lg-lang-btn').forEach(function (b) {
        b.classList.toggle('is-active', b.getAttribute('data-lang') === lang);
      });
      document.title = dict.loginTitle + ' | AmirCollider';
      write('lang', lang);
    }
    document.querySelectorAll('.lg-lang-btn').forEach(function (b) {
      b.addEventListener('click', function () { applyLang(b.getAttribute('data-lang')); });
    });

    var pw = document.getElementById('lg-pw');
    var toggle = document.getElementById('lg-toggle');
    var on = toggle.querySelector('.lg-eye-on'), off = toggle.querySelector('.lg-eye-off');
    toggle.addEventListener('click', function () {
      var show = pw.type === 'password';
      pw.type = show ? 'text' : 'password';
      on.style.display = show ? 'none' : 'inline-flex';
      off.style.display = show ? 'inline-flex' : 'none';
    });

    document.getElementById('lg-form').addEventListener('submit', function () {
      var lang = root.getAttribute('lang') || data.lang;
      var btn = document.getElementById('lg-submit');
      btn.textContent = (data.i18n[lang] || data.i18n[data.defaultLang]).loginLoading;
      btn.disabled = true;
    });

    var saved = null;
    try { saved = localStorage.getItem('lang'); } catch (e) {}
    applyLang(data.i18n[saved] ? saved : data.lang);
  })();
  `
}


// ==========================================
// Page: Test Dashboard
// ==========================================
function renderDashboard(GAMES, baseUrl, lang, theme) {
  const dict = I18N[lang] || I18N[DEFAULT_LANG]
  const meta = LANG_META[lang] || LANG_META[DEFAULT_LANG]
  const amirLogo = CONFIG.AMIR_LOGO

  const gameIds = Object.keys(GAMES)

  // The panel's own brand, not the first registered game's.
  const accent = PANEL_ACCENT
  const accentRgb = hexToRgb(accent)
  const themeAttr = theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : ''

  // Build the full plan: system, one game group per registered game, then shared groups.
  const plan = []
  for (const group of TEST_GROUPS) {
    if (group.key === 'system') {
      plan.push({ key: 'system', titleKey: 'gSystem', icon: 'system', tests: group.tests.map(t => ({ ...t, id: t.kind })) })
      for (const id of gameIds) {
        plan.push({
          key: `game-${id}`, titleKey: 'gGame', icon: 'game', gameName: GAMES[id].name || id,
          tests: GAME_TESTS.map(t => ({ ...t, id: `${t.kind}--${id}`, game: id }))
        })
      }
    } else {
      plan.push({ key: group.key, titleKey: group.titleKey, icon: group.key, tests: group.tests.map(t => ({ ...t, id: t.kind })) })
    }
  }

  const payload = JSON.stringify({
    lang, defaultLang: DEFAULT_LANG, baseUrl, gameIds, i18n: I18N, langMeta: LANG_META,

    // What the SEO group checks against, sent rather than
    // hard-coded in the client script. The origin is the one the
    // canonical tag has to name; the brand forms are the spellings
    // the front page has to contain. Both are CONFIG values, so a
    // change there re-aims the test instead of breaking it.
    siteOrigin: siteOrigin(),
    langs: LANGS,
    brandForms: Object.values((CONFIG.BRAND && CONFIG.BRAND.SCRIPTS) || {}).filter(Boolean),

    // Every spelling of the FIRST game's name, including the
    // derived Persian encodings. seoNames asserts each one is in
    // that game's page.
    gameNames: (function () {
      const first = Object.values(GAMES || {})[0]
      if (!first) return []
      const declared = [first.name, ...(first.altNames || [])]
      return [...declared, ...persianSpellingVariants(declared)]
    })()
  }).replace(/</g, '\\u003c')

  const sectionsHtml = plan.map(group => renderGroupSection(group, dict)).join('')

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${meta.dir}"${themeAttr}>
<head>
  ${getPageHead({ title: `${escapeHtml(dict.panelTitle)} | AmirCollider`, amirLogo, description: escapeHtml(dict.panelSub) })}
  ${themeBootScript()}
  <style>${dashStyles(accent, accentRgb)}</style>
</head>
<body>
  <div class="ts-bg" aria-hidden="true"></div>

  <main class="ts-shell">
    ${topbarHtml('ts', amirLogo, PANEL_BRAND, lang)}

    <section class="ts-hero">
      <span class="ts-badge"><span class="ts-ic">${ICONS.flask}</span>v${escapeHtml(CONFIG.VERSION)}</span>
      <h1 data-i18n="panelTitle">${escapeHtml(dict.panelTitle)}</h1>
      <p class="ts-sub" data-i18n="panelSub">${escapeHtml(dict.panelSub)}</p>
    </section>

    <section class="ts-summary">
      <div class="ts-stat"><div class="ts-stat-num" id="ts-total" style="color:var(--info)">0</div><div class="ts-stat-label" data-i18n="statTotal">${escapeHtml(dict.statTotal)}</div></div>
      <div class="ts-stat"><div class="ts-stat-num" id="ts-pass" style="color:var(--ok)">0</div><div class="ts-stat-label" data-i18n="statPass">${escapeHtml(dict.statPass)}</div></div>
      <div class="ts-stat"><div class="ts-stat-num" id="ts-fail" style="color:var(--err)">0</div><div class="ts-stat-label" data-i18n="statFail">${escapeHtml(dict.statFail)}</div></div>
      <div class="ts-stat"><div class="ts-stat-num" id="ts-warn" style="color:var(--warn)">0</div><div class="ts-stat-label" data-i18n="statWarn">${escapeHtml(dict.statWarn)}</div></div>
      <div class="ts-stat"><div class="ts-stat-num" id="ts-time">—</div><div class="ts-stat-label" data-i18n="statTime">${escapeHtml(dict.statTime)}</div></div>
    </section>

    <div class="ts-progress" id="ts-progress"><div class="ts-progress-fill" id="ts-progress-fill"></div></div>

    <section class="ts-controls">
      <button class="ts-btn ts-btn-run" id="ts-run">
        <span class="ts-ic ts-run-ic">${ICONS.play}</span><span data-i18n="runAll" id="ts-run-label">${escapeHtml(dict.runAll)}</span>
      </button>
      <button class="ts-btn" id="ts-reset"><span class="ts-ic">${ICONS.reset}</span><span data-i18n="reset">${escapeHtml(dict.reset)}</span></button>
      <button class="ts-btn" id="ts-export"><span class="ts-ic">${ICONS.download}</span><span data-i18n="exportReport">${escapeHtml(dict.exportReport)}</span></button>

      <!-- The games panel opens with this same password (its own
           cookie, scoped Path=/thegod). Linked from here because
           it is the only place a developer would think to look for
           it, and an unlinked panel is a panel nobody uses. -->
      <a class="ts-btn" href="${escapeHtml(baseUrl)}/thegod" target="_blank" rel="noopener">
        <span class="ts-ic">${ICONS.game}</span><span>TheGod</span>
      </a>

      <form method="POST" action="${escapeHtml(baseUrl)}/testsite/logout" class="ts-logout-form">
        <button type="submit" class="ts-btn ts-btn-danger"><span class="ts-ic">${ICONS.logout}</span><span data-i18n="logout">${escapeHtml(dict.logout)}</span></button>
      </form>
    </section>

    <section class="ts-groups">
      ${sectionsHtml}
    </section>

    <section class="ts-manual ts-lic">
      <h2><span class="ts-ic">${ICONS.lock}</span><span data-i18n="licTitle">${escapeHtml(dict.licTitle)}</span></h2>
      <p class="ts-sim-lede" data-i18n="licLede">${escapeHtml(dict.licLede)}</p>

      <div class="ts-manual-grid">
        <label class="ts-m-field ts-m-endpoint">
          <span data-i18n="licSearch">${escapeHtml(dict.licSearch)}</span>
          <input type="text" id="ts-lic-q" dir="ltr" spellcheck="false" placeholder="DSNAP-…  /  ord_…  /  email">
        </label>
        <label class="ts-m-field">
          <span data-i18n="licStatus">${escapeHtml(dict.licStatus)}</span>
          <select id="ts-lic-status">
            <option value="" data-i18n="licAny">${escapeHtml(dict.licAny)}</option>
            <option value="active">active</option>
            <option value="revoked">revoked</option>
          </select>
        </label>
        <label class="ts-m-field">
          <span data-i18n="licTier">${escapeHtml(dict.licTier)}</span>
          <select id="ts-lic-tier">
            <option value="" data-i18n="licAny">${escapeHtml(dict.licAny)}</option>
            <option value="plus">plus</option>
            <option value="pro">pro</option>
          </select>
        </label>
      </div>

      <div class="ts-sim-actions">
        <button class="ts-btn ts-btn-run" id="ts-lic-load"><span class="ts-ic">${ICONS.eye}</span><span data-i18n="licLoad">${escapeHtml(dict.licLoad)}</span></button>
        <button class="ts-btn" id="ts-lic-stats"><span data-i18n="licStats">${escapeHtml(dict.licStats)}</span></button>
      </div>

      <div class="ts-lic-summary" id="ts-lic-summary"></div>
      <div class="ts-lic-list" id="ts-lic-list"></div>
      <pre class="ts-m-out" id="ts-lic-out" dir="ltr"></pre>
    </section>

    <section class="ts-manual ts-sim">
      <h2><span class="ts-ic">${ICONS.cart}</span><span data-i18n="simTitle">${escapeHtml(dict.simTitle)}</span></h2>
      <p class="ts-sim-lede" data-i18n="simLede">${escapeHtml(dict.simLede)}</p>

      <div class="ts-manual-grid">
        <label class="ts-m-field">
          <span data-i18n="simTier">${escapeHtml(dict.simTier)}</span>
          <select id="ts-sim-tier">
            <option value="plus">Plus — $${escapeHtml(CONFIG.DOCSNAP.TIERS.plus.price)}</option>
            <option value="pro">Pro — $${escapeHtml(CONFIG.DOCSNAP.TIERS.pro.price)}</option>
          </select>
        </label>
        <label class="ts-m-field">
          <span data-i18n="simLang">${escapeHtml(dict.simLang)}</span>
          <select id="ts-sim-lang">
            <option value="fa">فارسی</option><option value="en">English</option><option value="ja">日本語</option>
          </select>
        </label>
        <label class="ts-m-field ts-m-endpoint">
          <span data-i18n="simEmail">${escapeHtml(dict.simEmail)}</span>
          <input type="email" id="ts-sim-email" placeholder="you@example.com" dir="ltr">
        </label>
        <label class="ts-m-field">
          <span data-i18n="simStatus">${escapeHtml(dict.simStatus)}</span>
          <select id="ts-sim-status">
            <option value="finished">finished</option>
            <option value="confirmed">confirmed</option>
            <option value="partially_paid">partially_paid</option>
            <option value="expired">expired</option>
            <option value="failed">failed</option>
          </select>
        </label>
        <label class="ts-m-field">
          <span data-i18n="simOrder">${escapeHtml(dict.simOrder)}</span>
          <input type="text" id="ts-sim-order" placeholder="ord_…" dir="ltr">
        </label>
      </div>

      <div class="ts-sim-actions">
        <button class="ts-btn ts-btn-run" id="ts-sim-full"><span class="ts-ic">${ICONS.play}</span><span data-i18n="simFull">${escapeHtml(dict.simFull)}</span></button>
        <button class="ts-btn" id="ts-sim-order-btn"><span data-i18n="simCreate">${escapeHtml(dict.simCreate)}</span></button>
        <button class="ts-btn" id="ts-sim-pay"><span data-i18n="simPay">${escapeHtml(dict.simPay)}</span></button>
        <button class="ts-btn" id="ts-sim-inspect"><span data-i18n="simInspect">${escapeHtml(dict.simInspect)}</span></button>
        <button class="ts-btn" id="ts-sim-mail"><span data-i18n="simMail">${escapeHtml(dict.simMail)}</span></button>
        <button class="ts-btn" id="ts-sim-cron"><span data-i18n="simCron">${escapeHtml(dict.simCron)}</span></button>
        <button class="ts-btn ts-btn-danger" id="ts-sim-purge"><span data-i18n="simPurge">${escapeHtml(dict.simPurge)}</span></button>
      </div>

      <div class="ts-sim-verdict" id="ts-sim-verdict"></div>
      <pre class="ts-m-out" id="ts-sim-out" dir="ltr"></pre>
    </section>

    <section class="ts-manual">
      <h2><span class="ts-ic">${ICONS.terminal}</span><span data-i18n="manualTitle">${escapeHtml(dict.manualTitle)}</span></h2>
      <div class="ts-manual-grid">
        <label class="ts-m-field ts-m-method">
          <span data-i18n="mMethod">${escapeHtml(dict.mMethod)}</span>
          <select id="ts-m-method">
            <option>GET</option><option>POST</option><option>PUT</option>
            <option>PATCH</option><option>DELETE</option><option>OPTIONS</option>
          </select>
        </label>
        <label class="ts-m-field ts-m-endpoint">
          <span data-i18n="mEndpoint">${escapeHtml(dict.mEndpoint)}</span>
          <input type="text" id="ts-m-endpoint" placeholder="/neon-katana/health" dir="ltr">
        </label>
        <label class="ts-m-field ts-m-headers">
          <span data-i18n="mHeaders">${escapeHtml(dict.mHeaders)}</span>
          <input type="text" id="ts-m-headers" placeholder='{"Authorization":"Bearer ..."}' dir="ltr">
        </label>
        <label class="ts-m-field ts-m-body">
          <span data-i18n="mBody">${escapeHtml(dict.mBody)}</span>
          <textarea id="ts-m-body" rows="3" placeholder='{"key":"value"}' dir="ltr"></textarea>
        </label>
      </div>
      <button class="ts-btn ts-btn-run" id="ts-m-send"><span class="ts-ic">${ICONS.play}</span><span data-i18n="mSend">${escapeHtml(dict.mSend)}</span></button>
      <pre class="ts-m-output" id="ts-m-output" dir="ltr"></pre>
    </section>
  </main>

  <div class="ts-toast" id="ts-toast" role="status" aria-live="polite"></div>

  <script id="ts-data" type="application/json">${payload}</script>
  <script>${dashClientScript()}</script>
</body>
</html>`
}


// ==========================================
// Group Section Renderer (collapsible, with per-test rows)
// ==========================================
function renderGroupSection(group, dict) {
  const icon = GROUP_ICONS[group.icon] || ICONS.system
  const titleText = group.gameName
    ? `${dict[group.titleKey] || group.titleKey} · ${escapeHtml(group.gameName)}`
    : (dict[group.titleKey] || group.titleKey)
  const titleAttr = group.gameName ? '' : ` data-i18n="${group.titleKey}"`

  const rows = group.tests.map(test => {
    const label = dict[`t_${test.kind}`] || test.kind
    const desc = dict[`d_${test.kind}`] || ''
    const gameAttr = test.game ? ` data-game="${escapeHtml(test.game)}"` : ''
    return `
      <div class="ts-test" data-id="${escapeHtml(test.id)}" data-kind="${escapeHtml(test.kind)}"${gameAttr}>
        <div class="ts-test-main">
          <div class="ts-test-name" data-i18n="t_${test.kind}">${escapeHtml(label)}</div>
          <div class="ts-test-desc" data-i18n="d_${test.kind}">${escapeHtml(desc)}</div>
          <div class="ts-test-detail" id="detail-${escapeHtml(test.id)}"></div>
        </div>
        <span class="ts-result" id="result-${escapeHtml(test.id)}" data-i18n="rIdle">—</span>
      </div>`
  }).join('')

  return `
    <article class="ts-group" id="group-${escapeHtml(group.key)}">
      <header class="ts-group-head" data-group="${escapeHtml(group.key)}">
        <div class="ts-group-title"><span class="ts-ic">${icon}</span><span class="ts-group-name"${titleAttr}>${escapeHtml(titleText)}</span></div>
        <div class="ts-group-right">
          <span class="ts-group-badge badge-pending" id="badge-${escapeHtml(group.key)}" data-i18n="bPending">${escapeHtml(dict.bPending)}</span>
          <span class="ts-group-arrow">${ICONS.chevron}</span>
        </div>
      </header>
      <div class="ts-group-body">${rows}</div>
    </article>`
}


// ==========================================
// Page Styles (light/dark + RTL/LTR safe via logical properties)
// ==========================================
function dashStyles(accent, accentRgb) {
  return `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  ${themeTokens(accent, accentRgb)}
  html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }
  body {
    font-family: 'Vazirmatn', 'Segoe UI', system-ui, -apple-system, 'Hiragino Sans', 'Noto Sans JP', Tahoma, sans-serif;
    background: var(--bg); color: var(--text); min-height: 100vh; line-height: 1.6;
    transition: background .35s ease, color .35s ease;
  }
  .ts-bg { position: fixed; inset: 0; z-index: -1; pointer-events: none;
    background:
      radial-gradient(60vw 60vw at 84% -12%, rgba(var(--accent-rgb), .16), transparent 60%),
      radial-gradient(55vw 55vw at -12% 112%, rgba(var(--accent-rgb), .12), transparent 60%); }

  .ts-shell { max-width: 980px; margin-inline: auto; padding: clamp(16px, 4vw, 38px);
    animation: tsFade .5s ease both; }
  @keyframes tsFade { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }

  /* topbar */
  .ts-topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px;
    flex-wrap: wrap; margin-bottom: 22px; }
  .ts-brand { display: flex; align-items: center; gap: 10px; }
  .ts-logo { width: 38px; height: 38px; border-radius: 50%; overflow: hidden; flex: none;
    background: var(--surface); border: 1px solid var(--border); display: inline-flex;
    align-items: center; justify-content: center; }
  .ts-logo img { width: 100%; height: 100%; object-fit: cover; }
  .ts-brand-name { font-weight: 700; font-size: .96rem; }
  .ts-controls-top { display: flex; align-items: center; gap: 10px; }
  .ts-lang { display: inline-flex; background: var(--surface); border: 1px solid var(--border);
    border-radius: 999px; padding: 3px; box-shadow: var(--shadow); }
  .ts-lang-btn { border: 0; background: transparent; color: var(--muted); cursor: pointer;
    font: inherit; font-size: .82rem; padding: 6px 12px; border-radius: 999px;
    transition: color .2s ease, background .2s ease; }
  .ts-lang-btn:hover { color: var(--text); }
  .ts-lang-btn.is-active { color: var(--on-accent, #fff); background: var(--accent); }
  .ts-icon-btn { width: 40px; height: 40px; border-radius: 50%; cursor: pointer;
    background: var(--surface); border: 1px solid var(--border); color: var(--text);
    display: inline-flex; align-items: center; justify-content: center; box-shadow: var(--shadow);
    transition: transform .2s ease; }
  .ts-icon-btn:hover { transform: translateY(-2px); }
  .ts-icon-btn svg { width: 19px; height: 19px; }
  .ts-sun { display: none; } .ts-moon { display: inline-flex; }
  [data-theme="dark"] .ts-sun { display: inline-flex; } [data-theme="dark"] .ts-moon { display: none; }

  /* hero */
  .ts-hero { text-align: center; margin: 6px 0 26px; }
  .ts-badge { display: inline-flex; align-items: center; gap: 7px; font-weight: 700; font-size: .85rem;
    color: var(--accent); background: rgba(var(--accent-rgb), .12);
    border: 1px solid rgba(var(--accent-rgb), .32); padding: 6px 14px; border-radius: 999px; }
  .ts-badge .ts-ic svg { width: 15px; height: 15px; }
  .ts-hero h1 { font-size: clamp(1.7rem, 4vw, 2.3rem); margin: 14px 0 6px; letter-spacing: -.01em; }
  .ts-sub { color: var(--muted); }

  /* shared icon wrapper */
  .ts-ic { display: inline-flex; align-items: center; color: var(--accent); }
  .ts-ic svg { width: 18px; height: 18px; }

  /* summary */
  .ts-summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 16px; }
  .ts-stat { background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
    padding: 16px 12px; text-align: center; box-shadow: var(--shadow); }
  .ts-stat-num { font-size: 1.9rem; font-weight: 800; line-height: 1; }
  .ts-stat-label { font-size: .76rem; color: var(--muted); margin-top: 6px; }

  /* progress */
  .ts-progress { height: 5px; background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 999px; overflow: hidden; margin-bottom: 18px; opacity: 0; transition: opacity .3s ease; }
  .ts-progress.is-active { opacity: 1; }
  .ts-progress-fill { height: 100%; width: 0%;
    background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #8a5bff));
    border-radius: 999px; transition: width .35s ease; }

  /* controls */
  .ts-controls { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 22px; }
  .ts-logout-form { margin-inline-start: auto; }
  .ts-btn { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font: inherit;
    font-weight: 600; font-size: .88rem; color: var(--text);
    background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
    padding: 10px 18px; box-shadow: var(--shadow);
    transition: transform .2s ease, background .2s ease, color .2s ease, opacity .2s ease; }
  .ts-btn:hover { transform: translateY(-2px); }
  .ts-btn:disabled { opacity: .55; cursor: default; transform: none; }
  .ts-btn .ts-ic { color: currentColor; }
  .ts-btn .ts-ic svg { width: 16px; height: 16px; }
  .ts-btn-run { background: var(--accent); color: var(--on-accent, #fff); border-color: transparent; }
  .ts-btn-run:hover { box-shadow: 0 10px 26px rgba(var(--accent-rgb), .4); }
  .ts-btn-danger { color: var(--err); border-color: rgba(var(--err-rgb), .35); background: rgba(var(--err-rgb), .08); }
  .ts-btn-danger:hover { background: rgba(var(--err-rgb), .16); }
  .ts-run-ic.is-spin svg { animation: tsSpin .8s linear infinite; }
  @keyframes tsSpin { to { transform: rotate(360deg); } }

  /* groups */
  .ts-groups { display: flex; flex-direction: column; gap: 12px; }
  .ts-group { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    box-shadow: var(--shadow); overflow: hidden; }
  .ts-group-head { display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 15px 20px; cursor: pointer; user-select: none; transition: background .2s ease; }
  .ts-group-head:hover { background: rgba(var(--accent-rgb), .05); }
  .ts-group-title { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: .96rem; }
  .ts-group-right { display: flex; align-items: center; gap: 10px; }
  .ts-group-badge { font-size: .72rem; font-weight: 700; padding: 4px 11px; border-radius: 999px; }
  .badge-pending { background: var(--surface-2); color: var(--muted); }
  .badge-running { background: rgba(var(--info-rgb), .16); color: var(--info); }
  .badge-pass    { background: rgba(var(--ok-rgb), .16); color: var(--ok); }
  .badge-fail    { background: rgba(var(--err-rgb), .16); color: var(--err); }
  .badge-partial { background: rgba(var(--warn-rgb), .16); color: var(--warn); }
  .ts-group-arrow { display: inline-flex; color: var(--muted); transition: transform .25s ease; }
  .ts-group-arrow svg { width: 18px; height: 18px; }
  :root[dir="rtl"] .ts-group-arrow { transform: scaleX(-1); }
  .ts-group.is-collapsed .ts-group-arrow { transform: rotate(90deg); }
  :root[dir="rtl"] .ts-group.is-collapsed .ts-group-arrow { transform: scaleX(-1) rotate(90deg); }
  .ts-group-body { border-top: 1px solid var(--border); padding: 6px 20px 12px; }
  .ts-group.is-collapsed .ts-group-body { display: none; }

  /* test rows */
  .ts-test { display: flex; align-items: flex-start; gap: 14px; padding: 12px 0;
    border-bottom: 1px solid var(--border); }
  .ts-test:last-child { border-bottom: 0; }
  .ts-test-main { flex: 1; min-width: 0; }
  .ts-test-name { font-weight: 600; font-size: .9rem; }
  .ts-test-desc { font-size: .78rem; color: var(--muted); margin-top: 2px; }
  .ts-test-detail { display: none; margin-top: 8px; padding: 9px 12px; border-radius: 9px;
    background: var(--surface-2); border: 1px solid var(--border);
    font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size: .76rem;
    color: var(--text); direction: ltr; text-align: start; unicode-bidi: plaintext; word-break: break-word; }
  .ts-test-detail.is-shown { display: block; }
  .ts-result { flex: none; min-width: 92px; text-align: center; font-weight: 700; font-size: .78rem;
    padding: 6px 12px; border-radius: 9px; background: var(--surface-2); border: 1px solid var(--border);
    color: var(--muted); white-space: nowrap; }
  .ts-result.running { color: var(--info); border-color: rgba(var(--info-rgb), .3);
    background: rgba(var(--info-rgb), .1); animation: tsPulse 1.2s ease-in-out infinite; }
  .ts-result.pass { color: var(--ok); border-color: rgba(var(--ok-rgb), .32); background: rgba(var(--ok-rgb), .12); }
  .ts-result.fail { color: var(--err); border-color: rgba(var(--err-rgb), .32); background: rgba(var(--err-rgb), .12); }
  .ts-result.warn { color: var(--warn); border-color: rgba(var(--warn-rgb), .32); background: rgba(var(--warn-rgb), .12); }
  @keyframes tsPulse { 0%,100% { opacity: 1; } 50% { opacity: .5; } }

  /* manual */
  .ts-manual { margin-top: 24px; background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 22px; box-shadow: var(--shadow); }
  .ts-manual h2 { display: flex; align-items: center; gap: 9px; font-size: 1.02rem; margin-bottom: 18px; }
  .ts-manual-grid { display: grid; grid-template-columns: 140px 1fr; gap: 12px; margin-bottom: 14px; }
  .ts-m-field { display: flex; flex-direction: column; gap: 6px; }
  .ts-m-field > span { font-size: .78rem; color: var(--muted); font-weight: 600; }
  .ts-m-endpoint, .ts-m-headers, .ts-m-body { grid-column: 1 / -1; }
  .ts-m-field select, .ts-m-field input, .ts-m-field textarea {
    width: 100%; background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px;
    padding: 10px 12px; color: var(--text); font: inherit; font-size: .88rem; outline: none;
    transition: border-color .2s ease, box-shadow .2s ease; }
  .ts-m-field textarea { font-family: ui-monospace, 'SF Mono', Consolas, monospace; resize: vertical; }
  .ts-m-field select:focus, .ts-m-field input:focus, .ts-m-field textarea:focus {
    border-color: var(--accent); box-shadow: 0 0 0 3px rgba(var(--accent-rgb), .14); }
  .ts-m-output { display: none; margin-top: 14px; padding: 14px; border-radius: 10px;
    background: var(--surface-2); border: 1px solid var(--border);
    font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size: .78rem;
    color: var(--text); max-height: 280px; overflow: auto; white-space: pre-wrap;
    direction: ltr; text-align: start; unicode-bidi: plaintext; line-height: 1.7; }
  .ts-m-output.is-shown { display: block; }

  /* checkout simulator */
  .ts-sim { border-inline-start: 3px solid var(--accent); }
  .ts-sim-lede { color: var(--text-dim); font-size: .84rem; line-height: 1.8; margin: 6px 0 16px; }
  .ts-sim-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
  .ts-sim-actions .ts-btn { font-size: .82rem; padding: 9px 15px; }

  /* The verdict line is the whole point of the panel: one sentence
     saying whether the chain worked, above a JSON dump nobody
     should have to read to find that out. */
  .ts-sim-verdict { margin-top: 14px; font-weight: 600; font-size: .86rem; line-height: 1.7; }
  .ts-sim-verdict:empty { display: none; }
  .ts-sim-verdict.is-pass { color: var(--ok); }
  .ts-sim-verdict.is-fail { color: var(--err); }
  .ts-m-out { display: none; margin-top: 12px; padding: 14px; border-radius: 10px;
    background: var(--surface-2); border: 1px solid var(--border);
    font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size: .76rem;
    color: var(--text); max-height: 340px; overflow: auto; white-space: pre-wrap;
    direction: ltr; text-align: start; unicode-bidi: plaintext; line-height: 1.65; }
  .ts-m-out.is-shown { display: block; }

  /* licence manager */
  .ts-lic { border-inline-start: 3px solid var(--warn); }
  .ts-lic-summary { font-size: .8rem; color: var(--text-dim); margin-top: 14px; }
  .ts-lic-summary:empty { display: none; }
  .ts-lic-list { margin-top: 10px; max-height: 460px; overflow-y: auto; }
  .ts-lic-list:empty { display: none; }
  .ts-lic-empty { color: var(--text-dim); font-size: .85rem; padding: 14px 2px; }

  .ts-lic-row { padding: 12px 14px; border-radius: 10px; border: 1px solid var(--border);
    background: var(--surface-2); margin-bottom: 8px; }
  /* A revoked row stays legible rather than being greyed into
     nothing: the whole point of keeping it is that somebody reads
     it later. */
  .ts-lic-row.is-dead { opacity: .72; border-inline-start: 3px solid var(--err); }
  .ts-lic-main { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .ts-lic-label { font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size: .84rem;
    font-weight: 700; direction: ltr; unicode-bidi: plaintext; }
  .ts-lic-badge { font-size: .68rem; font-weight: 800; text-transform: uppercase; letter-spacing: .05em;
    padding: 2px 8px; border-radius: 999px; border: 1px solid var(--border); color: var(--text-dim); }
  .ts-lic-badge.ts-lic-pro { color: var(--accent); border-color: var(--accent); }
  .ts-lic-badge.ts-lic-plus { color: var(--info); border-color: var(--info); }
  .ts-lic-badge.ts-lic-active { color: var(--ok); border-color: var(--ok); }
  .ts-lic-badge.ts-lic-revoked { color: var(--err); border-color: var(--err); }
  .ts-lic-meta { font-size: .76rem; color: var(--text-dim); margin-top: 5px;
    direction: ltr; text-align: start; unicode-bidi: plaintext; }
  .ts-lic-acts { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
  .ts-lic-acts .ts-btn { font-size: .74rem; padding: 6px 12px; }

  /* toast */
  .ts-toast { position: fixed; inset-block-end: 26px; inset-inline-start: 50%;
    transform: translate(-50%, 12px); padding: 11px 22px; border-radius: 12px;
    font-weight: 600; font-size: .86rem; color: #fff; background: var(--info);
    box-shadow: 0 14px 36px rgba(0,0,0,.3); opacity: 0; pointer-events: none;
    transition: opacity .3s ease, transform .3s ease; z-index: 99; max-width: 90vw; }
  :root[dir="rtl"] .ts-toast { transform: translate(50%, 12px); }
  .ts-toast.is-shown { opacity: 1; transform: translate(-50%, 0); }
  :root[dir="rtl"] .ts-toast.is-shown { transform: translate(50%, 0); }
  .ts-toast.t-pass { background: var(--ok); } .ts-toast.t-fail { background: var(--err); }
  .ts-toast.t-warn { background: var(--warn); }

  :where(button, a, input, select, textarea):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

  @media (max-width: 720px) {
    .ts-summary { grid-template-columns: repeat(3, 1fr); }
    .ts-manual-grid { grid-template-columns: 1fr; }
    .ts-logout-form { margin-inline-start: 0; }
  }
  @media (max-width: 460px) { .ts-summary { grid-template-columns: repeat(2, 1fr); } }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; } }
  `
}


// ==========================================
// Dashboard Client Runtime (theme/lang + data-driven test engine)
// Reads only the embedded JSON payload; runs every check against the live
// worker and reports the real outcome. No server interpolation in this scope.
// ==========================================
function dashClientScript() {
  return `
  (function () {
    var data = JSON.parse(document.getElementById('ts-data').textContent);
    var root = document.documentElement;
    var BASE = data.baseUrl;
    var SITE_ORIGIN = data.siteOrigin || BASE;
    var LANGS = data.langs || ['fa', 'en', 'ja'];
    var BRAND_FORMS = data.brandForms || [];
    var GAME_NAMES = data.gameNames || [];
    var RESULTS = {};
    var stats = { total: 0, pass: 0, fail: 0, warn: 0 };
    var startTime = null;
    var toastTimer = null;
    var isRunning = false;

    function dictNow() { return data.i18n[root.getAttribute('lang')] || data.i18n[data.defaultLang]; }

    /* ---------- theme + language ---------- */
    function write(key, val) {
      try { localStorage.setItem(key, val); } catch (e) {}
      if (key === 'lang') document.cookie = 'lang=' + val + ';path=/;max-age=31536000;SameSite=Lax';
      if (key === 'ac_theme') document.cookie = 'theme=' + val + ';path=/;max-age=31536000;SameSite=Lax';
    }
    function currentTheme() {
      var a = root.getAttribute('data-theme');
      if (a === 'dark' || a === 'light') return a;
      return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    function applyTheme(t) { root.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light'); write('ac_theme', t === 'dark' ? 'dark' : 'light'); }
    document.getElementById('ts-theme').addEventListener('click', function () { applyTheme(currentTheme() === 'dark' ? 'light' : 'dark'); });

    function applyLang(lang) {
      var dict = data.i18n[lang], meta = data.langMeta[lang];
      if (!dict || !meta) return;
      root.setAttribute('lang', lang); root.setAttribute('dir', meta.dir);
      document.querySelectorAll('[data-i18n]').forEach(function (el) {
        var k = el.getAttribute('data-i18n'); if (dict[k] != null) el.textContent = dict[k];
      });
      document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
        var k = el.getAttribute('data-i18n-aria'); if (dict[k] != null) el.setAttribute('aria-label', dict[k]);
      });
      document.querySelectorAll('.ts-lang-btn').forEach(function (b) {
        b.classList.toggle('is-active', b.getAttribute('data-lang') === lang);
      });
      document.title = dict.panelTitle + ' | AmirCollider';
      relabelResults();
      updateRunLabel();
      write('lang', lang);
    }
    document.querySelectorAll('.ts-lang-btn').forEach(function (b) {
      b.addEventListener('click', function () { applyLang(b.getAttribute('data-lang')); });
    });

    /* ---------- collapsible groups ---------- */
    document.querySelectorAll('.ts-group-head').forEach(function (h) {
      h.addEventListener('click', function () { h.parentElement.classList.toggle('is-collapsed'); });
    });

    /* ---------- toast ---------- */
    function toast(msg, kind) {
      var t = document.getElementById('ts-toast');
      t.textContent = msg;
      t.className = 'ts-toast' + (kind ? ' t-' + kind : '');
      void t.offsetWidth;
      t.classList.add('is-shown');
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { t.classList.remove('is-shown'); }, 3000);
    }

    /* ---------- detail formatting (localized, re-renderable) ---------- */
    function formatDetail(dict, r) {
      var parts = [];
      if (r.code != null) parts.push('HTTP ' + r.code);
      else parts.push(dict.net);
      if (r.ping != null) parts.push(r.ping + 'ms');
      if (r.noteKey && dict[r.noteKey]) parts.push(dict[r.noteKey] + (r.noteVal != null ? ': ' + r.noteVal : ''));
      else if (r.noteVal != null) parts.push(r.noteVal);
      return parts.join(' · ');
    }
    function relabelResults() {
      var dict = dictNow();
      Object.keys(RESULTS).forEach(function (id) {
        var r = RESULTS[id];
        var chip = document.getElementById('result-' + id);
        var detail = document.getElementById('detail-' + id);
        if (chip) chip.textContent = dict['r' + r.status.charAt(0).toUpperCase() + r.status.slice(1)] || r.status;
        if (detail) detail.textContent = formatDetail(dict, r);
      });
      document.querySelectorAll('.ts-group-badge').forEach(function (b) {
        var key = b.getAttribute('data-i18n');
        if (key && dict[key] != null) b.textContent = dict[key];
      });
    }

    /* ---------- result + summary helpers ---------- */
    function setRunning(id) {
      var chip = document.getElementById('result-' + id);
      if (!chip) return;
      chip.className = 'ts-result running';
      chip.textContent = dictNow().rRunning;
      chip.removeAttribute('data-i18n');
    }
    function setResult(id, r) {
      RESULTS[id] = r;
      var dict = dictNow();
      var chip = document.getElementById('result-' + id);
      var detail = document.getElementById('detail-' + id);
      if (chip) {
        chip.className = 'ts-result ' + r.status;
        chip.textContent = dict['r' + r.status.charAt(0).toUpperCase() + r.status.slice(1)];
        chip.setAttribute('data-i18n', 'r' + r.status.charAt(0).toUpperCase() + r.status.slice(1));
      }
      if (detail) { detail.textContent = formatDetail(dict, r); detail.classList.add('is-shown'); }
      stats.total++;
      if (r.status === 'pass') stats.pass++;
      else if (r.status === 'fail') stats.fail++;
      else if (r.status === 'warn') stats.warn++;
      updateSummary();
    }
    function updateSummary() {
      document.getElementById('ts-total').textContent = stats.total;
      document.getElementById('ts-pass').textContent = stats.pass;
      document.getElementById('ts-fail').textContent = stats.fail;
      document.getElementById('ts-warn').textContent = stats.warn;
      if (startTime) document.getElementById('ts-time').textContent = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
    }
    function updateGroupBadge(groupKey) {
      var group = document.getElementById('group-' + groupKey);
      var badge = document.getElementById('badge-' + groupKey);
      if (!group || !badge) return;
      var chips = group.querySelectorAll('.ts-result');
      var pass = 0, fail = 0, warn = 0, done = 0;
      chips.forEach(function (c) {
        if (c.classList.contains('pass')) { pass++; done++; }
        else if (c.classList.contains('fail')) { fail++; done++; }
        else if (c.classList.contains('warn')) { warn++; done++; }
      });
      if (done === 0) { setBadge(badge, 'pending'); return; }
      if (fail > 0) setBadge(badge, 'fail');
      else if (warn > 0) setBadge(badge, 'partial');
      else if (done === chips.length) setBadge(badge, 'pass');
      else setBadge(badge, 'running');
    }
    function setBadge(badge, state) {
      var map = { pending: 'bPending', running: 'bRunning', pass: 'bPass', fail: 'bFail', partial: 'bPartial' };
      badge.className = 'ts-group-badge badge-' + state;
      badge.setAttribute('data-i18n', map[state]);
      badge.textContent = dictNow()[map[state]];
    }

    /* ---------- low-level fetch ---------- */
    function fetchTest(path, opts) {
      var t0 = Date.now();
      return fetch(BASE + path, Object.assign({ redirect: 'manual' }, opts || {}))
        .then(function (res) { return { ok: true, status: res.status, ping: Date.now() - t0, headers: res.headers, res: res }; })
        .catch(function (e) { return { ok: false, error: e.message, ping: Date.now() - t0 }; });
    }
    function netFail() { return { status: 'fail', code: null, ping: null, noteKey: 'net' }; }
    function expectFail(r, codes) { return { status: 'fail', code: r.code != null ? r.code : r.status, ping: r.ping, noteKey: 'expected', noteVal: codes }; }

    /* ---------- runners (keyed by kind) ---------- */

    /* A checkout endpoint answers 503 everywhere when its secrets
       are not set. That is correct behaviour, not a failure, so it
       is reported as a warning with a note rather than as red -
       otherwise a deployment that has simply not been configured
       yet looks broken. */
    function offOrFail(r, want) {
      if (r.status === 503) return { status: 'warn', code: 503, ping: r.ping, noteKey: 'coOff' };
      return { status: 'fail', code: r.status, ping: r.ping, noteKey: 'expected', noteVal: want };
    }

    /* Rendered width of a string: full-width CJK glyphs count two.
       The client-side twin of textWidth() in Core/Seo.js. */
    function seoWidth(text) {
      var width = 0;
      var full = /[\u3000-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uFF00-\uFF60]/;
      for (var i = 0; i < text.length; i++) width += full.test(text.charAt(i)) ? 2 : 1;
      return width;
    }

    /* Title, description and heading on one page. */
    function snippetCheck(path) {
      return fetchTest(path, {}).then(function (r) {
        if (!r.ok) return netFail();
        if (r.status !== 200) return expectFail(r, '200');
        return r.res.text().then(function (body) {
          var title = (body.match(/<title>([^<]*)<\\/title>/) || [])[1] || '';
          var desc = (body.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
          var h1s = (body.match(/<h1[\s>]/g) || []).length;

          var problems = [];
          if (!desc) problems.push('description');
          else if (seoWidth(desc) < 70) problems.push('description ' + seoWidth(desc));
          else if (seoWidth(desc) > 165) problems.push('description ' + seoWidth(desc));
          if (!title) problems.push('title');
          else if (seoWidth(title) > 65) problems.push('title ' + seoWidth(title));
          if (h1s !== 1) problems.push('h1 x' + h1s);

          if (problems.length) {
            return { status: 'fail', code: 200, ping: r.ping, noteKey: 'seoSnippetBad', noteVal: problems.join(', ') };
          }
          return { status: 'pass', code: 200, ping: r.ping, noteKey: 'seoWidths', noteVal: seoWidth(title) + '/' + seoWidth(desc) };
        });
      });
    }

    function postJson(path, payload) {
      return fetchTest(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    /* ==========================================
       TheGod, from here
       ==========================================
       The operator panel has one endpoint and an action field, so
       one helper covers every check below.

       Authorisation is the cookie the browser is already holding.
       /thegod's session cookie is scoped Path=/thegod and a
       cookie's path is matched against the REQUEST url, not
       against the page making the request - so a fetch from this
       panel to /thegod/api carries it, and one to anywhere else
       does not. That is the same property the two cookies were
       separated for, and it is what lets these tests run here
       without this panel holding TheGod's credential.

       Not signed into /thegod: every call answers 401. That is a
       correct refusal rather than a broken panel, so it is
       reported as a warning that says where to sign in - exactly
       how the checkout group already treats its 503s. */
    function tgApi(action, payload) {
      var body = payload || {};
      body.action = action;

      return postJson('/thegod/api', body).then(function (r) {
        if (!r.ok) return { net: true };
        if (r.status === 401 || r.status === 403) return { unauth: true, ping: r.ping, status: r.status };
        return r.res.json()
          .then(function (data) { return { data: data, status: r.status, ping: r.ping }; })
          .catch(function () { return { bad: true, status: r.status, ping: r.ping }; });
      });
    }

    /* The shape every TheGod runner shares: refuse cleanly, warn
       when signed out, and hand the parsed body to the assertion.
       'assert' returns a note key, or null when everything it
       cares about held. */
    function tgRunner(action, payload, assert) {
      return tgApi(action, payload).then(function (out) {
        if (out.net) return netFail();
        if (out.unauth) return { status: 'warn', code: out.status, ping: out.ping, noteKey: 'tgNoAuth' };
        if (out.bad) return { status: 'fail', code: out.status, ping: out.ping, noteKey: 'badStruct' };

        var data = out.data;
        if (!data || data.ok !== true) {
          return {
            status: 'fail', code: out.status, ping: out.ping,
            noteKey: 'tgError', noteVal: (data && (data.error || data.message)) || '—'
          };
        }

        var verdict = assert ? assert(data) : null;
        if (!verdict) return { status: 'pass', code: out.status, ping: out.ping };

        return {
          status: verdict.status || 'fail',
          code: out.status, ping: out.ping,
          noteKey: verdict.noteKey, noteVal: verdict.noteVal
        };
      });
    }

    /* The game the panel tests run against: whichever one this
       deployment lists first, read from the same registry the
       per-game group above is built from. Hard-coding 'neon-katana'
       here would make this whole group red on a deployment that
       renames or retires it. */
    function tgGameId() {
      return (data.gameIds && data.gameIds[0]) || 'neon-katana';
    }

    var RUNNERS = {
      /* ==========================================
         What a crawler sees.

         Six GETs of public pages. Each one reads the BYTES rather
         than a status code, because every failure this group is
         written for returns 200: a canonical naming the wrong
         host, a robots.txt that stopped pointing at the sitemap, a
         hreflang cluster missing a language, a page that lost its
         structured data in a refactor.
         ========================================== */

      seoRobots: function () {
        return fetchTest('/robots.txt', {}).then(function (r) {
          if (!r.ok) return netFail();
          if (r.status !== 200) return expectFail(r, '200');
          return r.res.text().then(function (body) {
            var missing = [];
            if (body.indexOf('Sitemap:') === -1) missing.push('Sitemap');
            if (body.indexOf('Disallow: /thegod') === -1) missing.push('Disallow /thegod');
            if (body.indexOf('Allow: /assets/') === -1) missing.push('Allow /assets/');
            if (missing.length) {
              return { status: 'fail', code: 200, ping: r.ping, noteKey: 'seoMissing', noteVal: missing.join(', ') };
            }
            return { status: 'pass', code: 200, ping: r.ping };
          });
        });
      },

      seoSitemap: function () {
        return fetchTest('/sitemap.xml', {}).then(function (r) {
          if (!r.ok) return netFail();
          if (r.status !== 200) return expectFail(r, '200');
          return r.res.text().then(function (body) {
            var locs = (body.match(/<loc>/g) || []).length;
            var alts = (body.match(/hreflang=/g) || []).length;
            var imgs = (body.match(/<image:loc>/g) || []).length;
            if (!locs) return { status: 'fail', code: 200, ping: r.ping, noteKey: 'badStruct' };

            /* Every entry carries the full reciprocal set plus
               x-default, so four per URL is the floor. Fewer means
               the cluster is incomplete, which is the failure that
               kept two thirds of this site out of the index. */
            if (alts < locs * 4) {
              return { status: 'fail', code: 200, ping: r.ping, noteKey: 'seoHreflangShort', noteVal: alts + '/' + (locs * 4) };
            }

            /* No images is not broken - it is a site with no key
               art in the registry - but it is worth saying out
               loud, because the usual cause is a logo path that
               stopped resolving. */
            if (!imgs) return { status: 'warn', code: 200, ping: r.ping, noteKey: 'seoNoImages' };
            return { status: 'pass', code: 200, ping: r.ping, noteKey: 'seoUrls', noteVal: String(locs) };
          });
        });
      },

      seoCanonical: function () {
        return fetchTest('/', {}).then(function (r) {
          if (!r.ok) return netFail();
          if (r.status !== 200) return expectFail(r, '200');
          return r.res.text().then(function (body) {
            var m = body.match(/<link rel="canonical" href="([^"]+)"/);
            if (!m) return { status: 'fail', code: 200, ping: r.ping, noteKey: 'seoNoCanonical' };

            /* The whole reason this check exists: a canonical that
               names workers.dev tells a search engine the real
               domain is the duplicate. */
            if (m[1].indexOf(SITE_ORIGIN) !== 0) {
              return { status: 'fail', code: 200, ping: r.ping, noteKey: 'seoWrongHost', noteVal: m[1] };
            }
            return { status: 'pass', code: 200, ping: r.ping };
          });
        });
      },

      seoHreflang: function () {
        return fetchTest('/', {}).then(function (r) {
          if (!r.ok) return netFail();
          if (r.status !== 200) return expectFail(r, '200');
          return r.res.text().then(function (body) {
            var found = (body.match(/rel="alternate" hreflang="/g) || []).length;
            var want = LANGS.length + 1;
            if (found < want) {
              return { status: 'fail', code: 200, ping: r.ping, noteKey: 'seoHreflangShort', noteVal: found + '/' + want };
            }
            return { status: 'pass', code: 200, ping: r.ping };
          });
        });
      },

      /* ==========================================
         Two things below are written the long way on purpose.

         There is no regex here and no literal closing script tag,
         because this function is itself rendered INSIDE a script
         tag: the browser's HTML parser ends that tag at the first
         closing script sequence it sees - in a comment, in a regex
         or in a string alike - and the rest of the panel would
         simply stop existing. (This comment cannot spell that
         sequence out either, for the same reason.) The tag is
         assembled from two halves below so it never appears
         anywhere in the source.

         And nothing un-escapes the JSON. jsonLd() writes "<" as a
         \u003c escape, and JSON.parse resolves that itself - which
         is the whole reason that escape is safe to use.
         ========================================== */
      seoJsonLd: function () {
        return fetchTest('/', {}).then(function (r) {
          if (!r.ok) return netFail();
          if (r.status !== 200) return expectFail(r, '200');
          return r.res.text().then(function (body) {
            var OPEN = '<script type="application/ld+json">';
            var CLOSE = '<' + '/script>';

            var blocks = [];
            var from = 0;
            while (true) {
              var start = body.indexOf(OPEN, from);
              if (start === -1) break;
              var end = body.indexOf(CLOSE, start + OPEN.length);
              if (end === -1) break;
              blocks.push(body.slice(start + OPEN.length, end));
              from = end + CLOSE.length;
            }
            if (!blocks.length) return { status: 'fail', code: 200, ping: r.ping, noteKey: 'seoNoJsonLd' };

            /* Parsed, not counted. A block that does not parse is
               a block a search engine discards silently, and the
               usual cause is an unescaped character in operator
               text that reached a description field. */
            var broken = 0;
            var types = [];
            for (var i = 0; i < blocks.length; i++) {
              try {
                types.push(JSON.parse(blocks[i])['@type']);
              } catch (e) { broken++; }
            }
            if (broken) return { status: 'fail', code: 200, ping: r.ping, noteKey: 'seoBadJsonLd', noteVal: String(broken) };

            var want = ['Organization', 'WebSite', 'WebPage'];
            var missing = want.filter(function (t) { return types.indexOf(t) === -1; });
            if (missing.length) {
              return { status: 'fail', code: 200, ping: r.ping, noteKey: 'seoMissing', noteVal: missing.join(', ') };
            }
            return { status: 'pass', code: 200, ping: r.ping, noteKey: 'seoNodes', noteVal: String(blocks.length) };
          });
        });
      },

      /* ==========================================
         What a result actually looks like.

         Title and description are measured by RENDERED WIDTH, not
         by character count, because Google truncates by pixels and
         this site writes in three scripts. A full-width kana is
         about two Latin characters, so a Japanese description of
         100 characters renders past the cutoff that a 150-character
         English one clears. Counting characters got Japanese wrong
         in both directions at once - see textWidth() in
         Core/Seo.js, which this mirrors.
         ========================================== */
      seoSnippet: function () {
        return snippetCheck('/');
      },

      /* The same three checks on a game's landing page - the pages
         whose descriptions were three words long, and the ones
         that had no h1 on their store tab. Checked separately from
         the front page because they are built by a completely
         different code path. */
      seoGamePage: function () {
        return snippetCheck('/' + tgGameId());
      },

      /* ==========================================
         One address per page.

         A trailing slash, a capital letter and a doubled slash all
         used to answer 404 - which is a dead end for the reader
         and a link whose authority reaches nothing. Each must now
         be a single 301 to the canonical form. Asserting ONE hop
         matters as much as asserting the redirect: the first
         version of this rule sent /en/games/ through three.
         ========================================== */
      seoCanonicalForm: function () {
        var cases = [
          { from: '/about/', to: '/about' },
          { from: '/About', to: '/about' },
          { from: '/games/', to: '/games' }
        ];
        return Promise.all(cases.map(function (c) {
          return fetchTest(c.from, {}).then(function (r) {
            if (!r.ok) return { bad: c.from + ' net' };
            if (r.status !== 301) return { bad: c.from + ' = ' + r.status };
            var to = r.headers.get('location') || '';
            return to === c.to ? null : { bad: c.from + ' -> ' + to };
          });
        })).then(function (out) {
          var bad = out.filter(Boolean).map(function (x) { return x.bad; });
          if (bad.length) {
            return { status: 'fail', code: null, ping: null, noteKey: 'seoBadRedirect', noteVal: bad.join('; ') };
          }
          return { status: 'pass', code: 301, ping: null };
        });
      },

      /* ==========================================
         Every spelling of every name reaches a page.

         The browser-side twin of Scripts/CheckBrandCoverage.mjs,
         narrowed to what one page fetch can answer: the front page
         must contain the brand in all three scripts, and a game
         page must contain that game's name in the reader's script.

         This is the check that would have caught the Persian
         spelling being wrong - it was "کولایدر" for two passes of
         this work, and the correct "کلایدر" was sitting in the
         misspellings list.
         ========================================== */
      seoNames: function () {
        return fetchTest('/' + tgGameId(), {}).then(function (r) {
          if (!r.ok) return netFail();
          if (r.status !== 200) return expectFail(r, '200');
          return r.res.text().then(function (body) {
            var missing = GAME_NAMES.filter(function (name) { return body.indexOf(name) === -1; });
            if (missing.length) {
              return { status: 'fail', code: 200, ping: r.ping, noteKey: 'seoNoNames', noteVal: missing.join(', ') };
            }
            return { status: 'pass', code: 200, ping: r.ping, noteKey: 'seoNameCount', noteVal: String(GAME_NAMES.length) };
          });
        });
      },

      /* The check with the shortest description and the longest
         reason. See the note on this group. */
      seoBrand: function () {
        return fetchTest('/', {}).then(function (r) {
          if (!r.ok) return netFail();
          if (r.status !== 200) return expectFail(r, '200');
          return r.res.text().then(function (body) {
            var missing = BRAND_FORMS.filter(function (form) { return body.indexOf(form) === -1; });
            if (missing.length) {
              return { status: 'fail', code: 200, ping: r.ping, noteKey: 'seoNoBrand', noteVal: missing.join(', ') };
            }
            return { status: 'pass', code: 200, ping: r.ping };
          });
        });
      },

      /* ---------- TheGod operator panel ---------- */

      /* Does the endpoint exist, route, and refuse an action it
         does not know? A 400 here means authorised and reachable;
         the switch's default is what produces it. */
      tgReachable: function () {
        return tgApi('definitely-not-an-action', {}).then(function (out) {
          if (out.net) return netFail();
          if (out.unauth) return { status: 'warn', code: out.status, ping: out.ping, noteKey: 'tgNoAuth' };
          if (out.status === 400 && out.data && out.data.error === 'bad_action') {
            return { status: 'pass', code: 400, ping: out.ping };
          }
          return { status: 'fail', code: out.status, ping: out.ping, noteKey: 'expected', noteVal: '400 bad_action' };
        });
      },

      tgOverview: function () {
        return tgRunner('overview', {}, function (data) {
          if (!Array.isArray(data.games)) return { noteKey: 'badStruct' };
          if (!data.games.length) return { status: 'warn', noteKey: 'tgNoGames' };
          var first = data.games[0];
          var missing = ['id', 'name', 'status', 'capabilities', 'products'].filter(function (field) {
            return !(field in first);
          });
          return missing.length ? { noteKey: 'missingField', noteVal: missing.join(', ') } : null;
        });
      },

      tgGameGet: function () {
        return tgRunner('game.get', { gameId: tgGameId() }, function (data) {
          if (!data.game || data.game.id !== tgGameId()) return { noteKey: 'badStruct' };
          return null;
        });
      },

      /* ==========================================
         The check that would have caught the bug.

         game_settings has grown a column at a time across five
         migrations, and the licence database had never run the
         one that added the tagline, the features, the screenshots
         and the FAQ. Nothing anywhere reported that. The panel
         accepted those fields, the save answered ok, and the
         columns silently went nowhere.

         A missing column is a FAILURE and not a warning, because
         everything typed into the fields it holds is lost with no
         error - which is the most expensive kind of broken there
         is. The panel's SQL tab has a repair button for it.
         ========================================== */
      tgSchema: function () {
        return tgRunner('schema.get', { gameId: tgGameId() }, function (data) {
          var settings = data.licence && data.licence.settings;
          if (!settings) return { noteKey: 'badStruct' };
          if (!settings.readable) return { noteKey: 'tgNoTable' };
          if (settings.missing && settings.missing.length) {
            return {
              noteKey: 'tgMissingColumns',
              noteVal: settings.missing.map(function (column) { return column.name; }).join(', ')
            };
          }
          return null;
        });
      },

      /* The game's own database is a different D1 entirely, and
         the failure it produces - every data endpoint answering
         db_not_bound - looks nothing like a schema problem from
         the outside. */
      tgPlayerDb: function () {
        return tgRunner('schema.get', { gameId: tgGameId() }, function (data) {
          var player = data.player;
          if (!player) return { noteKey: 'badStruct' };
          if (!player.bound) return { noteKey: 'tgNoBinding', noteVal: player.binding || '—' };
          if (!player.present || !player.present.length) return { noteKey: 'tgNoPlayers' };
          if (!player.moderation) return { status: 'warn', noteKey: 'tgNoModeration' };
          if (!player.leaderboardOptOut) return { status: 'warn', noteKey: 'tgNoOptOut' };
          return null;
        });
      },

      /* The landing editor has to hand back both halves - what is
         stored and what Config.js supplies underneath it - or
         every field on that screen looks empty on a game whose
         page is full. */
      tgLanding: function () {
        return tgRunner('landing.get', { gameId: tgGameId() }, function (data) {
          var missing = ['landing', 'baseline', 'versions', 'preview'].filter(function (field) {
            return !(field in data);
          });
          if (missing.length) return { noteKey: 'missingField', noteVal: missing.join(', ') };
          if (!data.landing || typeof data.landing.hero !== 'string') return { noteKey: 'badStruct' };

          /* The per-language halves and the disclosure have to
             come back as objects even on a game that has never
             used them, because the editor reads three keys off
             each without checking - and an undefined there is a
             tab that silently renders no rows rather than an
             error anybody would notice. */
          var shaped = ['screenshotsByLang', 'videosByLang', 'google'].filter(function (field) {
            return !data.landing[field] || typeof data.landing[field] !== 'object';
          });
          if (shaped.length) return { noteKey: 'missingField', noteVal: shaped.join(', ') };

          if (data.blockedSections && data.blockedSections.length) {
            return { noteKey: 'tgBlocked', noteVal: data.blockedSections.join(', ') };
          }
          return null;
        });
      },

      /* The generated SQL claims to be "as they stand right now".
         The one way to check that from out here is to compare the
         timestamp it prints against the row it printed it from. */
      tgSqlSettings: function () {
        return tgRunner('sql.settings', { gameId: tgGameId() }, function (data) {
          if (typeof data.settings !== 'string' || !data.settings.length) return { noteKey: 'badStruct' };
          if (typeof data.products !== 'string' || typeof data.purge !== 'string') return { noteKey: 'badStruct' };
          if (data.row && data.settings.indexOf(String(data.row.updated_at)) === -1
              && data.settings.indexOf('no overrides stored') === -1) {
            return { noteKey: 'tgStaleSql' };
          }
          return null;
        });
      },

      tgSqlGame: function () {
        return tgRunner('sql.game', { gameId: tgGameId() }, function (data) {
          if (!data.sql || data.sql.indexOf('CREATE TABLE IF NOT EXISTS players') === -1) {
            return { noteKey: 'badStruct' };
          }
          if (!Array.isArray(data.commands) || !data.commands.length) return { noteKey: 'badStruct' };
          return null;
        });
      },

      /* The Unity kit. Every module has to arrive with real code
         in it: an empty module is a file somebody pastes into a
         project and only discovers is empty at compile time. */
      tgUnity: function () {
        return tgRunner('unity', { gameId: tgGameId(), lang: 'en' }, function (data) {
          if (!Array.isArray(data.modules) || !data.modules.length) return { noteKey: 'badStruct' };
          var empty = data.modules.filter(function (module) {
            return !module.code || module.code.length < 40 || !module.file;
          });
          if (empty.length) {
            return { noteKey: 'tgEmptyModule', noteVal: empty.map(function (m) { return m.file || '?'; }).join(', ') };
          }
          return { status: 'pass', noteKey: 'records', noteVal: data.modules.length };
        });
      },

      /* The "new game" generator, run against an id that cannot
         collide with a real one. Nothing is created: scaffold
         returns source text and writes nothing anywhere. */
      tgScaffold: function () {
        return tgRunner('scaffold', {
          spec: { id: 'testsite-probe-game', name: 'Probe', platform: 'android', login: true }
        }, function (data) {
          if (!Array.isArray(data.files) || data.files.length < 4) return { noteKey: 'badStruct' };
          var ids = data.files.map(function (file) { return file.id; });
          var wanted = ['registry', 'wrangler', 'sql', 'unity'];
          var absent = wanted.filter(function (id) { return ids.indexOf(id) === -1; });
          if (absent.length) return { noteKey: 'missingField', noteVal: absent.join(', ') };
          return null;
        });
      },

      tgEnv: function () {
        return tgRunner('env', {}, function (data) {
          if (!Array.isArray(data.games) || !data.shared) return { noteKey: 'badStruct' };
          if (!data.redirectUri || data.redirectUri.indexOf('/oauth/callback') === -1) {
            return { noteKey: 'badStruct' };
          }
          var unset = data.games.filter(function (game) {
            return game.login && (!game.web.set || !game.secret.set);
          });
          if (unset.length) {
            return { noteKey: 'tgNoOauth', noteVal: unset.map(function (g) { return g.id; }).join(', ') };
          }
          return null;
        });
      },

      tgOrders: function () {
        return tgRunner('orders.list', { limit: 1 }, function (data) {
          if (!Array.isArray(data.orders) || !data.stats) return { noteKey: 'badStruct' };
          return { status: 'pass', noteKey: 'records', noteVal: data.total || 0 };
        });
      },

      tgPlayers: function () {
        return tgRunner('players.list', { gameId: tgGameId(), limit: 1 }, function (data) {
          if (!Array.isArray(data.players)) return { noteKey: 'badStruct' };
          if (data.moderation === false) return { status: 'warn', noteKey: 'tgNoModeration' };
          return { status: 'pass', noteKey: 'records', noteVal: data.total || 0 };
        });
      },

      /* The panel's own health check, run from out here. Anything
         it calls an error is an error. */
      tgVerify: function () {
        return tgRunner('game.verify', { gameId: tgGameId() }, function (data) {
          if (!data.summary || !Array.isArray(data.checks)) return { noteKey: 'badStruct' };
          if (data.summary.failed) {
            var broken = data.checks.filter(function (check) { return check.level === 'error'; });
            return { noteKey: 'tgVerifyFailed', noteVal: broken.map(function (c) { return c.label; }).join(', ') };
          }
          if (data.summary.warned) {
            var warned = data.checks.filter(function (check) { return check.level === 'warn'; });
            return {
              status: 'warn', noteKey: 'tgVerifyWarned',
              noteVal: warned.map(function (c) { return c.label; }).join(', ')
            };
          }
          return null;
        });
      },

      /* A game id that is not in Config.js must be a 404 and not
         a row somebody's request brought into existence. This is
         the rule the whole panel rests on: code decides which
         games exist. */
      tgUnknownGame: function () {
        return tgApi('game.get', { gameId: 'no-such-game-xyz-99' }).then(function (out) {
          if (out.net) return netFail();
          if (out.unauth) return { status: 'warn', code: out.status, ping: out.ping, noteKey: 'tgNoAuth' };
          if (out.status === 404 && out.data && out.data.error === 'unknown_game') {
            return { status: 'pass', code: 404, ping: out.ping };
          }
          return { status: 'fail', code: out.status, ping: out.ping, noteKey: 'expected', noteVal: '404 unknown_game' };
        });
      },

      /* The panel writes prices; a product id that is not in the
         catalogue must be refused rather than invented. */
      tgUnknownProduct: function () {
        return tgApi('product.save', {
          gameId: tgGameId(), productId: 'no-such-product-xyz-99', patch: { price_usd: '1.00' }
        }).then(function (out) {
          if (out.net) return netFail();
          if (out.unauth) return { status: 'warn', code: out.status, ping: out.ping, noteKey: 'tgNoAuth' };
          if (out.status === 404 && out.data && out.data.error === 'unknown_product') {
            return { status: 'pass', code: 404, ping: out.ping };
          }
          return { status: 'fail', code: out.status, ping: out.ping, noteKey: 'expected', noteVal: '404 unknown_product' };
        });
      },

      /* GET is not a verb this endpoint has. Worth asserting
         because every action behind it changes something, and a
         panel action reachable by GET is reachable from an <img>
         tag on another site. */
      tgMethod: function () {
        return fetchTest('/thegod/api').then(function (r) {
          if (!r.ok) return netFail();
          if (r.status === 405) return { status: 'pass', code: 405, ping: r.ping };
          return expectFail(r, '405');
        });
      },

      /* ---------- checkout ---------- */
      coConfig: function () {
        return postJson('/testsite/checkout', { action: 'config' }).then(function (r) {
          if (!r.ok) return netFail();
          if (r.status === 401) return { status: 'fail', code: 401, ping: r.ping, noteKey: 'coNoAuth' };
          if (r.status === 503) return { status: 'warn', code: 503, ping: r.ping, noteKey: 'coOff' };
          return r.res.json().then(function (d) {
            if (d.ready) {
              return { status: 'pass', code: r.status, ping: r.ping,
                       noteVal: d.sandbox ? 'SANDBOX' : 'live' };
            }
            /* The missing pieces are named. This check exists to answer
               "why is the buy button disabled", and a bare red dot
               answers it worse than the list does. */
            return { status: 'fail', code: r.status, ping: r.ping,
                     noteKey: 'coMissing', noteVal: (d.missing || []).join(', ') };
          }).catch(function () { return { status: 'fail', code: r.status, ping: r.ping, noteKey: 'badStruct' }; });
        });
      },
      coPage: function () {
        return fetchTest('/checkout?tier=pro').then(function (r) {
          if (!r.ok) return netFail();
          if (r.status !== 200) return expectFail(r, '200');
          return r.res.text().then(function (html) {
            var hasForm = html.indexOf('id="email2"') !== -1;
            var disabled = html.indexOf('id="pay" type="button" class="btn wide" disabled') !== -1;
            if (!hasForm) return { status: 'fail', code: 200, ping: r.ping, noteKey: 'badStruct' };
            /* A rendered form with a disabled button is a correctly
               behaving page on a deployment whose secrets are not in
               yet — a warning, not a failure. */
            if (disabled) return { status: 'warn', code: 200, ping: r.ping, noteKey: 'coOff' };
            return { status: 'pass', code: 200, ping: r.ping };
          });
        });
      },
      coOrderPage: function () {
        return fetchTest('/order').then(function (r) {
          if (!r.ok) return netFail();
          if (r.status !== 200) return expectFail(r, '200');
          return r.res.text().then(function (html) {
            return html.indexOf('#UnityDocSnap') !== -1
              ? { status: 'pass', code: 200, ping: r.ping }
              : { status: 'fail', code: 200, ping: r.ping, noteKey: 'badStruct' };
          });
        });
      },
      coBadEmail: function () {
        return postJson('/checkout/create', { tier: 'plus', email: 'not-an-email', lang: 'en' }).then(function (r) {
          if (!r.ok) return netFail();
          return r.status === 400
            ? { status: 'pass', code: 400, ping: r.ping }
            : offOrFail(r, '400');
        });
      },
      coBadTier: function () {
        return postJson('/checkout/create', { tier: 'enterprise', email: 'a@b.com', emailConfirm: 'a@b.com' }).then(function (r) {
          if (!r.ok) return netFail();
          return r.status === 400
            ? { status: 'pass', code: 400, ping: r.ping }
            : offOrFail(r, '400');
        });
      },
      coWebhookUnsigned: function () {
        /* The single most important assertion on this page. If an
           unsigned callback is ever accepted, anybody who finds the
           URL is issued a paid licence for free. */
        return postJson('/checkout/webhook', { payment_status: 'finished', order_id: 'ord_forged', payment_id: 1 }).then(function (r) {
          if (!r.ok) return netFail();
          if (r.status === 401) return { status: 'pass', code: 401, ping: r.ping };
          if (r.status === 503) return { status: 'warn', code: 503, ping: r.ping, noteKey: 'coOff' };
          return { status: 'fail', code: r.status, ping: r.ping, noteKey: 'coForged' };
        });
      },
      coStatusUnknown: function () {
        return fetchTest('/checkout/status?o=ord_000000000000000000000000').then(function (r) {
          if (!r.ok) return netFail();
          if (r.status === 404) return { status: 'pass', code: 404, ping: r.ping };
          return offOrFail(r, '404');
        });
      },
      coLookupBad: function () {
        return postJson('/order/lookup', { email: 'nope', lang: 'en' }).then(function (r) {
          if (!r.ok) return netFail();
          return r.status === 400
            ? { status: 'pass', code: 400, ping: r.ping }
            : offOrFail(r, '400');
        });
      },

      /* ---------- videos ---------- */
      vidPlay: function () {
        return fetchTest('/video/en/1').then(function (r) {
          if (!r.ok) return netFail();
          if (r.status === 404) return { status: 'fail', code: 404, ping: r.ping, noteKey: 'vidNotInR2' };
          if (r.status !== 200) return expectFail(r, '200');
          var type = r.headers.get('Content-Type') || '';
          var ranges = r.headers.get('Accept-Ranges');
          if (ranges !== 'bytes') return { status: 'fail', code: 200, ping: r.ping, noteKey: 'missingHeaders', noteVal: 'Accept-Ranges' };
          return { status: 'pass', code: 200, ping: r.ping, noteVal: type };
        });
      },
      vidRange: function () {
        /* Without a 206 here, seeking in the player either stalls or
           silently does nothing — which looks like a broken video
           rather than a missing feature. */
        return fetchTest('/video/en/1', { headers: { Range: 'bytes=0-1023' } }).then(function (r) {
          if (!r.ok) return netFail();
          if (r.status === 404) return { status: 'fail', code: 404, ping: r.ping, noteKey: 'vidNotInR2' };
          if (r.status !== 206) return expectFail(r, '206');
          var cr = r.headers.get('Content-Range') || '';
          return /^bytes 0-1023\\/\\d+$/.test(cr)
            ? { status: 'pass', code: 206, ping: r.ping, noteVal: cr }
            : { status: 'fail', code: 206, ping: r.ping, noteKey: 'missingHeaders', noteVal: 'Content-Range' };
        });
      },
      vidHead: function () {
        return fetchTest('/video/en/1', { method: 'HEAD' }).then(function (r) {
          if (!r.ok) return netFail();
          if (r.status === 404) return { status: 'fail', code: 404, ping: r.ping, noteKey: 'vidNotInR2' };
          if (r.status !== 200) return expectFail(r, '200');
          var len = r.headers.get('Content-Length');
          return { status: 'pass', code: 200, ping: r.ping, noteVal: len ? (Math.round(len / 1048576 * 10) / 10) + ' MB' : '' };
        });
      },
      vidJa: function () {
        return fetchTest('/video/ja/1', { method: 'HEAD' }).then(function (r) {
          if (!r.ok) return netFail();
          if (r.status === 404) return { status: 'fail', code: 404, ping: r.ping, noteKey: 'vidNotInR2' };
          return r.status === 200 ? { status: 'pass', code: 200, ping: r.ping } : expectFail(r, '200');
        });
      },
      vidFa: function () {
        return fetchTest('/video/fa/1', { method: 'HEAD' }).then(function (r) {
          if (!r.ok) return netFail();
          if (r.status === 404) return { status: 'fail', code: 404, ping: r.ping, noteKey: 'vidNotInR2' };
          return r.status === 200 ? { status: 'pass', code: 200, ping: r.ping } : expectFail(r, '200');
        });
      },
      vidMissing: function () {
        /* Clip 10 was only recorded in English. Asking for it in
           Persian must be a clean 404, not a sweep of three folders
           that ends in one anyway. */
        return fetchTest('/video/fa/10', { method: 'HEAD' }).then(function (r) {
          if (!r.ok) return netFail();
          return r.status === 404 ? { status: 'pass', code: 404, ping: r.ping } : expectFail(r, '404');
        });
      },

      sysMetrics: function () {
        return fetchTest('/metrics', { headers: { Accept: 'application/json' } }).then(function (r) {
          if (!r.ok) return netFail();
          if (r.status !== 200) return expectFail(r, '200');
          return r.res.json().then(function (d) {
            var miss = ['version', 'games', 'endpoints', 'security'].filter(function (f) { return d[f] === undefined; });
            if (miss.length) return { status: 'fail', code: 200, ping: r.ping, noteKey: 'missingField', noteVal: miss.join(', ') };
            return { status: 'pass', code: 200, ping: r.ping, noteVal: 'v' + d.version };
          }).catch(function () { return { status: 'fail', code: 200, ping: r.ping, noteKey: 'badStruct' }; });
        });
      },
      sys404: function () {
        return fetchTest('/this-route-does-not-exist-' + Date.now()).then(function (r) {
          if (!r.ok) return netFail();
          return r.status === 404 ? { status: 'pass', code: 404, ping: r.ping } : { status: 'warn', code: r.status, ping: r.ping, noteKey: 'expected', noteVal: '404' };
        });
      },
      sys405: function () {
        return fetchTest('/metrics', { method: 'DELETE' }).then(function (r) {
          if (!r.ok) return netFail();
          if (r.status === 405) return { status: 'pass', code: 405, ping: r.ping };
          if (r.status === 404) return { status: 'warn', code: 404, ping: r.ping, noteKey: 'expected', noteVal: '405' };
          return expectFail(r, '405');
        });
      },
      sysCors: function () {
        return fetchTest('/metrics').then(function (r) {
          if (!r.ok) return netFail();
          var acao = r.headers.get('Access-Control-Allow-Origin');
          return acao ? { status: 'pass', code: r.status, ping: r.ping, noteVal: 'ACAO ' + acao } : { status: 'fail', code: r.status, ping: r.ping, noteKey: 'missingHeaders', noteVal: 'Access-Control-Allow-Origin' };
        });
      },
      sysPreflight: function () {
        return fetchTest('/metrics', { method: 'OPTIONS', headers: { Origin: 'https://example.com', 'Access-Control-Request-Method': 'POST' } }).then(function (r) {
          if (!r.ok) return netFail();
          var acao = r.headers.get('Access-Control-Allow-Origin');
          return acao ? { status: 'pass', code: r.status, ping: r.ping, noteVal: 'ACAO ' + acao } : { status: 'warn', code: r.status, ping: r.ping, noteKey: 'missingHeaders', noteVal: 'Access-Control-Allow-Origin' };
        });
      },
      sysContentType: function () {
        return fetchTest('/metrics', { headers: { Accept: 'application/json' } }).then(function (r) {
          if (!r.ok) return netFail();
          var ct = r.headers.get('Content-Type') || '';
          return ct.indexOf('application/json') >= 0 ? { status: 'pass', code: r.status, ping: r.ping, noteVal: 'json' } : { status: 'fail', code: r.status, ping: r.ping, noteVal: ct || 'none' };
        });
      },
      sysSecurity: function () {
        return fetchTest('/metrics').then(function (r) {
          if (!r.ok) return netFail();
          var miss = ['X-Content-Type-Options', 'X-Frame-Options'].filter(function (h) { return !r.headers.get(h); });
          return miss.length === 0 ? { status: 'pass', code: r.status, ping: r.ping } : { status: 'warn', code: r.status, ping: r.ping, noteKey: 'missingHeaders', noteVal: miss.join(', ') };
        });
      },
      sysRequestId: function () {
        return fetchTest('/metrics').then(function (r) {
          if (!r.ok) return netFail();
          var rid = r.headers.get('X-Request-ID');
          return rid ? { status: 'pass', code: r.status, ping: r.ping, noteVal: rid.slice(0, 16) + '…' } : { status: 'fail', code: r.status, ping: r.ping, noteKey: 'missingHeaders', noteVal: 'X-Request-ID' };
        });
      },
      sysResponseTime: function () {
        return fetchTest('/metrics', { headers: { Accept: 'application/json' } }).then(function (r) {
          if (!r.ok) return netFail();
          if (r.ping < 500) return { status: 'pass', code: r.status, ping: r.ping };
          if (r.ping < 2000) return { status: 'warn', code: r.status, ping: r.ping, noteKey: 'slow' };
          return { status: 'fail', code: r.status, ping: r.ping, noteKey: 'tooSlow' };
        });
      },

      gameHealth: function (game) {
        return fetchTest('/' + game + '/health', { headers: { Accept: 'application/json' } }).then(function (r) {
          if (!r.ok) return netFail();
          if (r.status !== 200) return expectFail(r, '200');
          return r.res.json().then(function (d) {
            var miss = ['status', 'version'].filter(function (f) { return d[f] === undefined; });
            if (miss.length) return { status: 'fail', code: 200, ping: r.ping, noteKey: 'missingField', noteVal: miss.join(', ') };
            return { status: r.ping > 500 ? 'warn' : 'pass', code: 200, ping: r.ping, noteVal: d.status };
          }).catch(function () { return { status: 'fail', code: 200, ping: r.ping, noteKey: 'badStruct' }; });
        });
      },
      gamePing: function (game) {
        return fetchTest('/' + game + '/ping', { headers: { Accept: 'application/json' } }).then(function (r) {
          if (!r.ok) return netFail();
          if (r.status !== 200) return expectFail(r, '200');
          return r.res.json().then(function (d) {
            if (d.ping === undefined || d.quality === undefined) return { status: 'fail', code: 200, ping: r.ping, noteKey: 'missingField', noteVal: 'ping/quality' };
            return { status: d.quality === 'acceptable' ? 'warn' : 'pass', code: 200, ping: r.ping, noteKey: 'quality', noteVal: d.quality };
          }).catch(function () { return { status: 'fail', code: 200, ping: r.ping, noteKey: 'badStruct' }; });
        });
      },
      gameLeaderboard: function (game) {
        return fetchTest('/' + game + '/leaderboard', { headers: { Accept: 'application/json' } }).then(function (r) {
          if (!r.ok) return netFail();
          if (r.status !== 200) return expectFail(r, '200');
          return r.res.json().then(function (d) {
            if (!Array.isArray(d.leaderboard) || d.total === undefined) return { status: 'fail', code: 200, ping: r.ping, noteKey: 'badStruct' };
            return { status: 'pass', code: 200, ping: r.ping, noteKey: 'players', noteVal: d.total || 0 };
          }).catch(function () { return { status: 'fail', code: 200, ping: r.ping, noteKey: 'badStruct' }; });
        });
      },
      gameLbLimit: function (game) {
        return fetchTest('/' + game + '/leaderboard/5', { headers: { Accept: 'application/json' } }).then(function (r) {
          if (!r.ok) return netFail();
          if (r.status !== 200) return expectFail(r, '200');
          return r.res.json().then(function (d) {
            if (!Array.isArray(d.leaderboard)) return { status: 'fail', code: 200, ping: r.ping, noteKey: 'badStruct' };
            if (d.leaderboard.length > 5 || d.limit !== 5) return { status: 'fail', code: 200, ping: r.ping, noteKey: 'overLimit', noteVal: d.leaderboard.length };
            return { status: 'pass', code: 200, ping: r.ping, noteKey: 'players', noteVal: d.leaderboard.length };
          }).catch(function () { return { status: 'fail', code: 200, ping: r.ping, noteKey: 'badStruct' }; });
        });
      },
      gamePrivacy: function (game) { return htmlPageRunner('/' + game + '/privacy'); },
      gameTerms: function (game) { return htmlPageRunner('/' + game + '/terms'); },

      authValidateNoToken: function () { return statusRunner('/auth/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"uid":"test123"}' }, [401], 'pass'); },
      authValidateNoUid: function () { return statusRunner('/auth/validate', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fake_token' }, body: '{}' }, [400, 401], 'pass'); },
      authRefreshEmpty: function () { return statusRunner('/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, [400, 401], 'pass'); },
      authCheckNoBody: function () { return statusRunner('/auth/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, [400, 401], 'pass'); },
      authCheckNoToken: function () { return statusRunner('/auth/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"uid":"test123"}' }, [401], 'pass'); },

      oauthAuthNoRedirect: function () { return statusRunner('/oauth/auth?game=neon-katana', {}, [400], 'pass'); },
      oauthAuthWithRedirect: function () {
        var ru = encodeURIComponent('com.amircollidergames.neonkatana://oauth');
        return fetchTest('/oauth/auth?game=neon-katana&redirect_uri=' + ru).then(function (r) {
          if (!r.ok) return netFail();
          var ct = r.headers.get('Content-Type') || '';
          return (r.status === 200 && ct.indexOf('text/html') >= 0) ? { status: 'pass', code: 200, ping: r.ping, noteKey: 'validHtml' } : expectFail(r, '200 HTML');
        });
      },
      oauthTokenNoCode: function () { return statusRunner('/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=authorization_code' }, [400], 'pass'); },
      oauthCallbackNoParams: function () { return noServerErrorRunner('/oauth/callback', {}); },

      dbGetUnauth: function () { return statusRunner('/database/get/private/data', {}, [400, 401], 'pass'); },
      dbSetUnauth: function () { return statusRunner('/database/set/test', { method: 'POST', body: 'test' }, [400, 401], 'pass'); },
      dbPatchUnauth: function () { return statusRunner('/database/patch/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, [400, 401], 'pass'); },

      d1Connection: function () {
        return fetchTest('/neon-katana/leaderboard', { headers: { Accept: 'application/json' } }).then(function (r) {
          if (!r.ok) return netFail();
          if (r.status !== 200) return expectFail(r, '200');
          return r.res.json().then(function (d) {
            if (!Array.isArray(d.leaderboard)) return { status: 'fail', code: 200,
            ping: r.ping, noteKey: 'badStruct' };
            return { status: 'pass', code: 200, ping: r.ping, noteKey: 'records', noteVal: d.total || 0 };
          }).catch(function () { return { status: 'fail', code: 200, ping: r.ping, noteKey: 'badStruct' }; });
        });
      },
      d1Schema: function () {
        return fetchTest('/neon-katana/leaderboard', { headers: { Accept: 'application/json' } }).then(function (r) {
          if (!r.ok) return netFail();
          if (r.status !== 200) return expectFail(r, '200');
          return r.res.json().then(function (d) {
            var rootMiss = ['leaderboard', 'total', 'limit', 'returned'].filter(function (f) { return !(f in d); });
            if (rootMiss.length) return { status: 'fail', code: 200, ping: r.ping, noteKey: 'missingField', noteVal: rootMiss.join(', ') };
            if (Array.isArray(d.leaderboard) && d.leaderboard.length) {
              var p = d.leaderboard[0];
              var pMiss = ['rank', 'username', 'displayName', 'highScore'].filter(function (f) { return !(f in p); });
              if (pMiss.length) return { status: 'fail', code: 200, ping: r.ping, noteKey: 'missingField', noteVal: pMiss.join(', ') };
            }
            return { status: 'pass', code: 200, ping: r.ping };
          }).catch(function () { return { status: 'fail', code: 200, ping: r.ping, noteKey: 'badStruct' }; });
        });
      },
      d1Limit: function () {
        return fetchTest('/neon-katana/leaderboard/3', { headers: { Accept: 'application/json' } }).then(function (r) {
          if (!r.ok) return netFail();
          if (r.status !== 200) return expectFail(r, '200');
          return r.res.json().then(function (d) {
            if (!Array.isArray(d.leaderboard)) return { status: 'fail', code: 200, ping: r.ping, noteKey: 'badStruct' };
            if (d.leaderboard.length > 3 || d.limit !== 3) return { status: 'fail', code: 200, ping: r.ping, noteKey: 'overLimit', noteVal: d.leaderboard.length };
            return { status: 'pass', code: 200, ping: r.ping, noteKey: 'records', noteVal: d.leaderboard.length };
          }).catch(function () { return { status: 'fail', code: 200, ping: r.ping, noteKey: 'badStruct' }; });
        });
      },
      // ==========================================
      // An unknown player id, asked for with an unusable token.
      //
      // This test used to expect 404 and warn on the 401 it always
      // got, which made a correct endpoint look permanently
      // broken. The expectation was written when
      // /database/get/games/:id/users/:uid checked only that an
      // Authorization HEADER existed - "Bearer x" satisfied it -
      // so the request reached the lookup and the lookup answered
      // "no such row".
      //
      // That is no longer the order things happen in, and the
      // change was the point: the token is verified with Google
      // BEFORE anything is looked up, so an unusable one is
      // refused at the door. 401 is not a near miss here, it is
      // the correct answer and the safer one - a 404 would be this
      // endpoint confirming which player ids exist to anybody who
      // can send a malformed token, and player ids are the local
      // part of an email address.
      //
      // So the assertion is now the property that actually
      // matters: an unverified caller learns nothing. 401 passes;
      // 404 or 200 is a real failure, because either means the
      // lookup ran.
      d1EmptyUser: function () {
        return fetchTest('/database/get/games/neon-katana/users/nonexistentuser99999xyz', { headers: { Accept: 'application/json', Authorization: 'Bearer not_a_real_google_id_token' } }).then(function (r) {
          if (!r.ok) return netFail();
          if (r.status === 401) return { status: 'pass', code: 401, ping: r.ping };
          if (r.status === 404) return { status: 'fail', code: 404, ping: r.ping, noteKey: 'd1Leak' };
          if (r.status === 200) return { status: 'fail', code: 200, ping: r.ping, noteKey: 'd1Leak' };
          return { status: 'warn', code: r.status, ping: r.ping, noteKey: 'expected', noteVal: '401' };
        });
      },
      d1GetUnauth: function () { return statusRunner('/database/get/games/neon-katana/users/testuser', {}, [400, 401], 'pass'); },
      d1SetUnauth: function () { return statusRunner('/database/set/games/neon-katana/users/testuser', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"username":"test"}' }, [400, 401], 'pass'); },
      d1PatchUnauth: function () { return statusRunner('/database/patch/games/neon-katana/users/testuser', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"selectedColor":"FF0000"}' }, [400, 401], 'pass'); },
      d1ScoreInvalid: function () { return statusRunner('/database/set/games/neon-katana/users/testuser/highScore', { method: 'POST', headers: { Authorization: 'Bearer fake_token', 'Content-Type': 'text/plain' }, body: '-999' }, [400, 401, 404], 'pass'); },
      d1UnknownPath: function () { return noServerErrorRunner('/database/get/games/neon-katana/unknown_path_xyz', { headers: { Authorization: 'Bearer fake_token' } }); }
    };

    /* ---------- shared runner helpers ---------- */
    function htmlPageRunner(path) {
      return fetchTest(path).then(function (r) {
        if (!r.ok) return netFail();
        var ct = r.headers.get('Content-Type') || '';
        if (r.status === 200 && ct.indexOf('text/html') >= 0) return { status: 'pass', code: 200, ping: r.ping, noteKey: 'validHtml' };
        if (r.status === 200) return { status: 'warn', code: 200, ping: r.ping, noteVal: ct || 'none' };
        return expectFail(r, '200');
      });
    }
    function statusRunner(path, opts, codes, okStatus) {
      return fetchTest(path, opts).then(function (r) {
        if (!r.ok) return netFail();
        if (codes.indexOf(r.status) >= 0) return { status: okStatus, code: r.status, ping: r.ping };
        return expectFail(r, codes.join('/'));
      });
    }
    function noServerErrorRunner(path, opts) {
      return fetchTest(path, opts).then(function (r) {
        if (!r.ok) return netFail();
        if (r.status >= 500) return { status: 'fail', code: r.status, ping: r.ping, noteKey: 'serverErr' };
        return { status: 'pass', code: r.status, ping: r.ping };
      });
    }

    /* ---------- test engine ---------- */
    function listTests() { return Array.prototype.slice.call(document.querySelectorAll('.ts-test')); }
    function groupKeyOf(el) {
      var g = el.closest('.ts-group');
      return g ? g.id.replace('group-', '') : null;
    }
    function updateRunLabel() {
      var label = document.getElementById('ts-run-label');
      if (label) label.textContent = isRunning ? dictNow().running : dictNow().runAll;
    }
    function runOne(el) {
      var id = el.getAttribute('data-id');
      var kind = el.getAttribute('data-kind');
      var game = el.getAttribute('data-game');
      var runner = RUNNERS[kind];
      if (!runner) return Promise.resolve();
      setRunning(id);
      return Promise.resolve(runner(game)).then(function (r) {
        setResult(id, r);
        var gk = groupKeyOf(el);
        if (gk) updateGroupBadge(gk);
      });
    }
    function runAll() {
      if (isRunning) return;
      reset();
      isRunning = true;
      startTime = Date.now();
      var runBtn = document.getElementById('ts-run');
      runBtn.disabled = true;
      document.querySelector('.ts-run-ic').classList.add('is-spin');
      document.getElementById('ts-progress').classList.add('is-active');
      updateRunLabel();
      document.querySelectorAll('.ts-group-badge').forEach(function (b) { setBadge(b, 'running'); });

      var tests = listTests();
      var total = tests.length || 1;
      var i = 0;
      function next() {
        if (i >= tests.length) return finish();
        return runOne(tests[i]).then(function () {
          i++;
          document.getElementById('ts-progress-fill').style.width = Math.round((i / total) * 100) + '%';
          if (startTime) document.getElementById('ts-time').textContent = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
          return next();
        });
      }
      function finish() {
        isRunning = false;
        runBtn.disabled = false;
        document.querySelector('.ts-run-ic').classList.remove('is-spin');
        updateRunLabel();
        var kind = stats.fail > 0 ? 'fail' : (stats.warn > 0 ? 'warn' : 'pass');
        toast(dictNow().allDone, kind);
      }
      next();
    }
    function reset() {
      RESULTS = {};
      stats = { total: 0, pass: 0, fail: 0, warn: 0 };
      startTime = null;
      ['ts-total', 'ts-pass', 'ts-fail', 'ts-warn'].forEach(function (id) { document.getElementById(id).textContent = '0'; });
      document.getElementById('ts-time').textContent = '—';
      document.getElementById('ts-progress-fill').style.width = '0%';
      document.getElementById('ts-progress').classList.remove('is-active');
      document.querySelectorAll('.ts-result').forEach(function (c) {
        c.className = 'ts-result'; c.textContent = dictNow().rIdle; c.setAttribute('data-i18n', 'rIdle');
      });
      document.querySelectorAll('.ts-test-detail').forEach(function (d) { d.textContent = ''; d.classList.remove('is-shown'); });
      document.querySelectorAll('.ts-group-badge').forEach(function (b) { setBadge(b, 'pending'); });
    }

    /* ---------- export results (clipboard, leaks nothing) ---------- */
    function exportReport() {
      if (!Object.keys(RESULTS).length) { toast(dictNow().nothingToExport, 'warn'); return; }
      var report = {
        panel: 'AmirCollider Worker Proxy',
        baseUrl: BASE,
        generatedAt: new Date().toISOString(),
        summary: { total: stats.total, pass: stats.pass, fail: stats.fail, warn: stats.warn },
        results: []
      };
      listTests().forEach(function (el) {
        var id = el.getAttribute('data-id');
        var r = RESULTS[id];
        if (!r) return;
        var nameEl = el.querySelector('.ts-test-name');
        report.results.push({
          test: nameEl ? nameEl.textContent.trim() : id,
          status: r.status,
          httpStatus: r.code,
          pingMs: r.ping,
          note: r.noteKey || r.noteVal || ''
        });
      });
      var text = JSON.stringify(report, null, 2);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast(dictNow().copied, 'pass'); }).catch(function () { fallbackCopy(text); });
      } else { fallbackCopy(text); }
    }
    function fallbackCopy(text) {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.position = 'absolute'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast(dictNow().copied, 'pass'); } catch (e) {}
      document.body.removeChild(ta);
    }

    /* ---------- manual request ---------- */
    function runManual() {
      var dict = dictNow();
      var method = document.getElementById('ts-m-method').value;
      var endpoint = document.getElementById('ts-m-endpoint').value.trim();
      var headersRaw = document.getElementById('ts-m-headers').value.trim();
      var bodyRaw = document.getElementById('ts-m-body').value.trim();
      var out = document.getElementById('ts-m-output');
      if (!endpoint) { toast(dict.mNeedEndpoint, 'warn'); return; }
      var headers = { Accept: 'application/json' };
      if (headersRaw) {
        try { var parsed = JSON.parse(headersRaw); for (var k in parsed) headers[k] = parsed[k]; }
        catch (e) { toast(dict.mBadHeaders, 'fail'); return; }
      }
      var opts = { method: method, headers: headers, redirect: 'manual' };
      if (bodyRaw && method !== 'GET' && method !== 'OPTIONS') {
        opts.body = bodyRaw;
        if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
      }
      out.classList.add('is-shown');
      out.textContent = dict.mWaiting;
      var t0 = Date.now();
      fetch(BASE + endpoint, opts).then(function (res) {
        var ping = Date.now() - t0;
        return res.text().then(function (body) {
          try { body = JSON.stringify(JSON.parse(body), null, 2); } catch (e) {}
          var lines = ['> ' + method + ' ' + endpoint, '< HTTP ' + res.status + ' · ' + ping + 'ms', '────────────────────'];
          res.headers.forEach(function (v, key) { lines.push(key + ': ' + v); });
          lines.push('────────────────────', body);
          out.textContent = lines.join('\\n');
        });
      }).catch(function (e) {
        out.textContent = dict.net + ': ' + e.message;
      });
    }

    /* ---------- licence manager ---------- */
    /* Rows are addressed by their masked label, never by a key.
       The label is five characters short of usable, so a screenshot
       of this panel, or a support thread quoting a row from it,
       hands nobody a working licence. */
    var licList = document.getElementById('ts-lic-list');
    var licSummary = document.getElementById('ts-lic-summary');
    var licOut = document.getElementById('ts-lic-out');

    function licCall(payload) {
      return fetch(BASE + '/testsite/licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (res) { return res.json().then(function (d) { return { status: res.status, data: d }; }); });
    }

    function licWhen(ms) {
      if (!ms) return '—';
      try { return new Date(ms).toLocaleDateString(); } catch (e) { return '—'; }
    }

    function licShowRaw(data) {
      licOut.classList.add('is-shown');
      licOut.textContent = JSON.stringify(data, null, 2);
    }

    function licRender(rows, total) {
      var dict = dictNow();
      if (!rows.length) {
        licList.innerHTML = '<div class="ts-lic-empty">' + acEscT(dict.licNone) + '</div>';
        return;
      }

      licList.innerHTML = rows.map(function (l) {
        var dead = l.status === 'revoked';
        return '<div class="ts-lic-row' + (dead ? ' is-dead' : '') + '">'
          + '<div class="ts-lic-main">'
          +   '<code class="ts-lic-label">' + acEscT(l.label) + '</code>'
          +   '<span class="ts-lic-badge ts-lic-' + acEscT(l.tier) + '">' + acEscT(l.tier) + '</span>'
          +   '<span class="ts-lic-badge ts-lic-' + acEscT(l.status) + '">' + acEscT(l.status) + '</span>'
          + '</div>'
          + '<div class="ts-lic-meta">'
          +   (l.email ? acEscT(l.email) + ' · ' : '')
          +   l.seatsUsed + '/' + l.seatsTotal + ' ' + acEscT(dict.licSeats) + ' · '
          +   licWhen(l.createdAt)
          +   (l.everActivated ? '' : ' · ' + acEscT(dict.licNever))
          +   (l.orderId ? ' · ' + acEscT(l.orderId) : '')
          + '</div>'
          + '<div class="ts-lic-acts">'
          +   '<button type="button" class="ts-btn" data-lic-devices="' + acEscT(l.label) + '">' + acEscT(dict.licDevices) + '</button>'
          +   (dead
                ? '<button type="button" class="ts-btn" data-lic-restore="' + acEscT(l.label) + '">' + acEscT(dict.licRestore) + '</button>'
                : '<button type="button" class="ts-btn ts-btn-danger" data-lic-revoke="' + acEscT(l.label) + '">' + acEscT(dict.licRevoke) + '</button>')
          +   '<button type="button" class="ts-btn ts-btn-danger" data-lic-delete="' + acEscT(l.label) + '">' + acEscT(dict.licDelete) + '</button>'
          + '</div>'
          + '</div>';
      }).join('');

      licSummary.textContent = rows.length + ' / ' + total + ' ' + dict.licTotal;
      licBind();
    }

    function licLoad() {
      var payload = {
        action: 'list',
        q: document.getElementById('ts-lic-q').value.trim(),
        status: document.getElementById('ts-lic-status').value,
        tier: document.getElementById('ts-lic-tier').value,
        limit: 100
      };
      licList.innerHTML = '<div class="ts-lic-empty">…</div>';
      licCall(payload).then(function (r) {
        if (!r.data.ok) { licShowRaw(r.data); return; }
        licOut.classList.remove('is-shown');
        licRender(r.data.licenses, r.data.total);
      }).catch(function (e) { licShowRaw({ error: e.message }); });
    }

    function licAct(action, label, extra) {
      var payload = Object.assign({ action: action, label: label }, extra || {});
      licCall(payload).then(function (r) {
        licShowRaw(r.data);
        /* A refusal that asks for confirmation is not an error - it is
           the server insisting the operator mean it. Surfaced as its
           own prompt rather than as a red JSON blob. */
        if (r.data.error === 'confirm_required') {
          if (window.confirm(dictNow().licDeleteAsk)) licAct(action, label, { confirm: true });
          return;
        }
        if (r.data.error === 'activated_license') {
          if (window.confirm(dictNow().licDeleteActivated)) {
            licAct(action, label, { confirm: true, evenThoughActivated: true });
          }
          return;
        }
        if (r.data.ok) licLoad();
      }).catch(function (e) { licShowRaw({ error: e.message }); });
    }

    function licBind() {
      Array.prototype.forEach.call(licList.querySelectorAll('[data-lic-revoke]'), function (b) {
        b.addEventListener('click', function () {
          if (window.confirm(dictNow().licRevokeAsk)) licAct('revoke', b.getAttribute('data-lic-revoke'));
        });
      });
      Array.prototype.forEach.call(licList.querySelectorAll('[data-lic-restore]'), function (b) {
        b.addEventListener('click', function () { licAct('restore', b.getAttribute('data-lic-restore')); });
      });
      Array.prototype.forEach.call(licList.querySelectorAll('[data-lic-delete]'), function (b) {
        b.addEventListener('click', function () { licAct('delete', b.getAttribute('data-lic-delete')); });
      });
      Array.prototype.forEach.call(licList.querySelectorAll('[data-lic-devices]'), function (b) {
        b.addEventListener('click', function () {
          licCall({ action: 'get', label: b.getAttribute('data-lic-devices') }).then(function (r) {
            licShowRaw(r.data);
          });
        });
      });
    }

    function acEscT(v) {
      return String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    document.getElementById('ts-lic-load').addEventListener('click', licLoad);
    document.getElementById('ts-lic-q').addEventListener('keydown', function (e) { if (e.key === 'Enter') licLoad(); });
    document.getElementById('ts-lic-stats').addEventListener('click', function () {
      licCall({ action: 'stats' }).then(function (r) { licShowRaw(r.data); });
    });

    /* ---------- checkout simulator ---------- */
    /* Every button here is one POST to /testsite/checkout, which is
       gated by this panel's own session cookie. The admin bearer
       token is deliberately NOT in this page - putting it in the
       markup would hand a key-minting credential to anyone who
       opens dev tools.

       The path has to stay under /testsite/: the session cookie is
       set with Path=/testsite, so the browser sends it here and
       nowhere else. Move this endpoint and every button on this
       panel answers 401. */
    var simOut = document.getElementById('ts-sim-out');
    var simVerdict = document.getElementById('ts-sim-verdict');

    function simShow(payload, verdict) {
      simOut.classList.add('is-shown');
      simOut.textContent = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);

      if (!verdict) { simVerdict.className = 'ts-sim-verdict'; simVerdict.textContent = ''; return; }
      simVerdict.className = 'ts-sim-verdict ' + (verdict.pass ? 'is-pass' : 'is-fail');
      simVerdict.textContent = (verdict.pass ? '✓  ' : '✕  ') + verdict.message;
    }

    function simBusy(on) {
      var dict = dictNow();
      Array.prototype.forEach.call(document.querySelectorAll('.ts-sim-actions .ts-btn'), function (b) { b.disabled = on; });
      if (on) { simOut.classList.add('is-shown'); simOut.textContent = dict.simWorking; simVerdict.textContent = ''; }
    }

    function simCall(payload) {
      return fetch(BASE + '/testsite/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (res) {
        return res.json().then(function (d) { return { status: res.status, data: d }; });
      });
    }

    function simFields() {
      return {
        tier: document.getElementById('ts-sim-tier').value,
        lang: document.getElementById('ts-sim-lang').value,
        email: document.getElementById('ts-sim-email').value.trim(),
        status: document.getElementById('ts-sim-status').value,
        order: document.getElementById('ts-sim-order').value.trim()
      };
    }

    function simRun(payload, needs) {
      var dict = dictNow();
      var f = simFields();
      if (needs === 'email' && !f.email) { toast(dict.simNeedEmail, 'warn'); return Promise.resolve(null); }
      if (needs === 'order' && !f.order) { toast(dict.simNeedOrder, 'warn'); return Promise.resolve(null); }

      simBusy(true);
      return simCall(payload)
        .then(function (r) {
          simBusy(false);
          if (r.data.order && r.data.order.id) document.getElementById('ts-sim-order').value = r.data.order.id;
          simShow(r.data, r.data.verdict);
          return r;
        })
        .catch(function (e) { simBusy(false); simShow(dictNow().net + ': ' + e.message); return null; });
    }

    document.getElementById('ts-sim-order-btn').addEventListener('click', function () {
      var f = simFields();
      simRun({ action: 'order', tier: f.tier, email: f.email, lang: f.lang }, 'email');
    });

    document.getElementById('ts-sim-pay').addEventListener('click', function () {
      var f = simFields();
      simRun({ action: 'pay', order: f.order, status: f.status }, 'order');
    });

    document.getElementById('ts-sim-inspect').addEventListener('click', function () {
      simRun({ action: 'inspect', order: simFields().order }, 'order');
    });

    document.getElementById('ts-sim-mail').addEventListener('click', function () {
      var f = simFields();
      simRun({ action: 'mail', email: f.email, lang: f.lang }, 'email');
    });

    document.getElementById('ts-sim-cron').addEventListener('click', function () {
      simRun({ action: 'reconcile' });
    });

    document.getElementById('ts-sim-purge').addEventListener('click', function () {
      simRun({ action: 'purge' });
    });

    /* The one-button path, which is what somebody actually wants:
       create an order and immediately pay it, so the answer to
       "does buying work" is one click and one verdict line. */
    document.getElementById('ts-sim-full').addEventListener('click', function () {
      var dict = dictNow();
      var f = simFields();
      if (!f.email) { toast(dict.simNeedEmail, 'warn'); return; }

      simBusy(true);
      simCall({ action: 'order', tier: f.tier, email: f.email, lang: f.lang })
        .then(function (r) {
          if (!r.data.ok) { simBusy(false); simShow(r.data); return null; }
          document.getElementById('ts-sim-order').value = r.data.order.id;
          return simCall({ action: 'pay', order: r.data.order.id, status: f.status });
        })
        .then(function (r) {
          simBusy(false);
          if (!r) return;
          simShow(r.data, r.data.verdict);
        })
        .catch(function (e) { simBusy(false); simShow(dictNow().net + ': ' + e.message); });
    });

    /* ---------- bindings + boot ---------- */
    document.getElementById('ts-run').addEventListener('click', runAll);
    document.getElementById('ts-reset').addEventListener('click', function () { if (!isRunning) reset(); });
    document.getElementById('ts-export').addEventListener('click', exportReport);
    document.getElementById('ts-m-send').addEventListener('click', runManual);

    var savedLang = null;
    try { savedLang = localStorage.getItem('lang'); } catch (e) {}
    applyLang(data.i18n[savedLang] ? savedLang : data.lang);
  })();
  `
}
