// ==========================================
// pages/testsite.js
// Test Panel Page Handler
// AmirCollider Games - Worker Proxy
// ==========================================
//
// Developer-only dashboard that exercises the live proxy and reports the
// real state of every public endpoint. Gated behind a signed-cookie login.
//
// Integration contract (do not break without updating callers in worker.js):
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

import { CONFIG } from '../config.js'
import { getPageHead } from '../shared-styles.js'
import { createHtmlResponse } from '../utils.js'

const AUTH_COOKIE = 'amir_testsite_auth'
const COOKIE_MAX_AGE = 60 * 60 * 2

const LANGS = ['fa', 'en', 'ja']
const DEFAULT_LANG = 'fa'

const LANG_META = {
  fa: { dir: 'rtl', locale: 'fa-IR', label: 'فا' },
  en: { dir: 'ltr', locale: 'en-US', label: 'EN' },
  ja: { dir: 'ltr', locale: 'ja-JP', label: '日本' }
}


// ==========================================
// Cookie Signing - HMAC-SHA256
// Signs the random session token so a tampered cookie cannot pass auth.
// ==========================================
async function signToken(token, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(token))
  return Array.from(new Uint8Array(sig), b => b.toString(16).padStart(2, '0')).join('')
}


// ==========================================
// Constant-Time Compare
// Avoids leaking the signature through early-exit timing.
// ==========================================
function safeEqual(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}


// ==========================================
// Auth Check
// Validates the signed session cookie against the panel password.
// ==========================================
async function isAuthenticated(request, env) {
  if (!env.TestSitePassword) return false
  const cookies = request.headers.get('Cookie') || ''
  const match = cookies.match(new RegExp(`${AUTH_COOKIE}=([^;]+)`))
  if (!match) return false
  const parts = match[1].split('__')
  if (parts.length !== 2) return false
  const [token, signature] = parts
  const expected = await signToken(token, env.TestSitePassword)
  return safeEqual(signature, expected)
}


// ==========================================
// Handler: Test Panel (auth required)
// ==========================================
export async function handleTestSite(url, request, gameId, requestId, GAMES, env) {
  if (!(await isAuthenticated(request, env))) {
    return Response.redirect(`${url.origin}/testsite/login`, 302)
  }
  const lang = detectLanguage(url, request)
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
  const failed = url.searchParams.get('error') === '1'
  const lang = detectLanguage(url, request)
  const theme = themeFromCookie(request)
  const headers = langCookieHeader(url, lang)
  return createHtmlResponse(renderLogin(url.origin, lang, theme, failed), 200, headers)
}


// ==========================================
// Handler: Login (POST)
// ==========================================
export async function handleTestSiteLoginPost(url, request, gameId, requestId, GAMES, env) {
  let password = ''
  try {
    const params = new URLSearchParams(await request.text())
    password = params.get('password') || ''
  } catch {
    return Response.redirect(`${url.origin}/testsite/login?error=1`, 302)
  }

  if (!env.TestSitePassword || password !== env.TestSitePassword) {
    return Response.redirect(`${url.origin}/testsite/login?error=1`, 302)
  }

  const sessionToken = Array.from(
    crypto.getRandomValues(new Uint8Array(32)),
    b => b.toString(16).padStart(2, '0')
  ).join('')
  const signature = await signToken(sessionToken, env.TestSitePassword)

  return new Response(null, {
    status: 302,
    headers: {
      'Location': `${url.origin}/testsite`,
      'Set-Cookie': `${AUTH_COOKIE}=${sessionToken}__${signature}; Path=/testsite; HttpOnly; Secure; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE}`
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
      'Set-Cookie': `${AUTH_COOKIE}=; Path=/testsite; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
    }
  })
}


// ==========================================
// Language Detection (query > cookie > header > default)
// ==========================================
function detectLanguage(url, request) {
  const fromQuery = (url.searchParams.get('lang') || '').toLowerCase()
  if (LANGS.includes(fromQuery)) return fromQuery

  const cookie = request.headers.get('Cookie') || ''
  const match = cookie.match(/(?:^|;\s*)lang=([^;]+)/)
  if (match && LANGS.includes(match[1])) return match[1]

  const accept = (request.headers.get('Accept-Language') || '').toLowerCase()
  for (const code of LANGS) {
    if (accept.includes(code)) return code
  }
  return DEFAULT_LANG
}


// ==========================================
// Theme From Cookie ('light' | 'dark' | null = follow OS)
// ==========================================
function themeFromCookie(request) {
  const cookie = request.headers.get('Cookie') || ''
  const match = cookie.match(/(?:^|;\s*)theme=([^;]+)/)
  return match && (match[1] === 'light' || match[1] === 'dark') ? match[1] : null
}


// ==========================================
// Persist ?lang= Selection
// Mirrors the metrics/dashboard pages so a switch survives navigation.
// ==========================================
function langCookieHeader(url, lang) {
  const requested = url.searchParams.get('lang')
  if (requested && LANGS.includes(requested)) {
    return { 'Set-Cookie': `lang=${lang}; Path=/; Max-Age=31536000; SameSite=Lax` }
  }
  return {}
}


// ==========================================
// HTML Escape (safe interpolation)
// ==========================================
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}


// ==========================================
// Hex Color To RGB Channels
// ==========================================
function hexToRgb(hex) {
  const clean = String(hex || '').replace('#', '')
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean
  const int = parseInt(full || '667eea', 16)
  return `${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}`
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
  d1: ICONS.layers
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
    // detail fragments
    net: 'خطای شبکه',
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
    t_d1EmptyUser: 'کاربر ناموجود', d_d1EmptyUser: 'کاربر ناموجود باید 404 بدهد',
    t_d1GetUnauth: 'GET بدون توکن', d_d1GetUnauth: 'دسترسی کاربر باید 401 بدهد',
    t_d1SetUnauth: 'SET بدون توکن', d_d1SetUnauth: 'نوشتن کاربر باید 401 بدهد',
    t_d1PatchUnauth: 'PATCH بدون توکن', d_d1PatchUnauth: 'به‌روزرسانی کاربر باید 401 بدهد',
    t_d1ScoreInvalid: 'امتیاز نامعتبر', d_d1ScoreInvalid: 'امتیاز منفی باید رد شود',
    t_d1UnknownPath: 'مسیر ناشناخته', d_d1UnknownPath: 'نباید با 500 خطا بدهد'
  },
  en: {
    loginTitle: 'Test panel login',
    loginSub: 'Developer access only',
    loginPassword: 'Password',
    loginPlaceholder: 'Enter your password',
    loginButton: 'Sign in',
    loginLoading: 'Signing in…',
    loginError: 'Incorrect password',
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
    net: 'Network error',
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
    manualTitle: 'Manual request',
    mMethod: 'Method',
    mEndpoint: 'Endpoint',
    mHeaders: 'Headers',
    mBody: 'Body',
    mSend: 'Send',
    mWaiting: 'Sending…',
    mNeedEndpoint: 'Enter an endpoint first',
    mBadHeaders: 'Invalid headers JSON',
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
    t_d1EmptyUser: 'Missing user', d_d1EmptyUser: 'Unknown user should return 404',
    t_d1GetUnauth: 'GET (no token)', d_d1GetUnauth: 'User read should return 401',
    t_d1SetUnauth: 'SET (no token)', d_d1SetUnauth: 'User write should return 401',
    t_d1PatchUnauth: 'PATCH (no token)', d_d1PatchUnauth: 'User update should return 401',
    t_d1ScoreInvalid: 'Invalid score', d_d1ScoreInvalid: 'Negative score should be rejected',
    t_d1UnknownPath: 'Unknown path', d_d1UnknownPath: 'Must not error with 500'
  },
  ja: {
    loginTitle: 'テストパネル ログイン',
    loginSub: '開発者専用アクセス',
    loginPassword: 'パスワード',
    loginPlaceholder: 'パスワードを入力',
    loginButton: 'サインイン',
    loginLoading: 'サインイン中…',
    loginError: 'パスワードが正しくありません',
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
    net: 'ネットワークエラー',
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
    manualTitle: '手動リクエスト',
    mMethod: 'メソッド',
    mEndpoint: 'エンドポイント',
    mHeaders: 'ヘッダー',
    mBody: 'ボディ',
    mSend: '送信',
    mWaiting: '送信中…',
    mNeedEndpoint: '先にエンドポイントを入力',
    mBadHeaders: 'ヘッダーJSONが不正',
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
    t_d1EmptyUser: '存在しないユーザー', d_d1EmptyUser: '不明なユーザーは 404 を返すべき',
    t_d1GetUnauth: 'GET (トークンなし)', d_d1GetUnauth: 'ユーザー読取は 401 を返すべき',
    t_d1SetUnauth: 'SET (トークンなし)', d_d1SetUnauth: 'ユーザー書込は 401 を返すべき',
    t_d1PatchUnauth: 'PATCH (トークンなし)', d_d1PatchUnauth: 'ユーザー更新は 401 を返すべき',
    t_d1ScoreInvalid: '不正なスコア', d_d1ScoreInvalid: 'マイナススコアは拒否されるべき',
    t_d1UnknownPath: '不明なパス', d_d1UnknownPath: '500 でエラーになってはいけない'
  }
}


// ==========================================
// Theme Boot (applied before paint to avoid flicker)
// ==========================================
function themeBootScript() {
  return `<script>
    (function () {
      try {
        var t = localStorage.getItem('ac_theme');
        if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
      } catch (e) {}
    })();
  </script>`
}


// ==========================================
// Shared Theme Tokens (light default + dark override + OS-follow)
// ==========================================
function themeTokens(accent, accentRgb) {
  return `
  :root {
    --accent: ${accent};
    --accent-rgb: ${accentRgb};
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
        <span class="${prefix}-logo"><img src="${esc(amirLogo)}" alt="AmirCollider" onerror="this.style.display='none'"></span>
        <span class="${prefix}-brand-name">${esc(brandName)}</span>
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
function renderLogin(baseUrl, lang, theme, failed) {
  const dict = I18N[lang] || I18N[DEFAULT_LANG]
  const meta = LANG_META[lang] || LANG_META[DEFAULT_LANG]
  const accent = '#2f6df6'
  const accentRgb = hexToRgb(accent)
  const amirLogo = CONFIG.AMIR_LOGO
  const themeAttr = theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : ''
  const payload = JSON.stringify({ lang, defaultLang: DEFAULT_LANG, i18n: I18N, langMeta: LANG_META }).replace(/</g, '\\u003c')

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${meta.dir}"${themeAttr}>
<head>
  ${getPageHead({ title: `${esc(dict.loginTitle)} | AmirCollider`, amirLogo })}
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
  .lg-lang-btn.is-active { color: #fff; background: var(--accent); }
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
    display: flex; align-items: center; justify-content: center; color: #fff;
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
    font: inherit; font-weight: 700; font-size: 1rem; color: #fff;
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
  ${topbarHtml('lg', amirLogo, 'AmirCollider', lang)}

  <div class="lg-wrap">
    <div class="lg-card">
      <div class="lg-head">
        <div class="lg-icon">${ICONS.lock}</div>
        <h1 data-i18n="loginTitle">${esc(dict.loginTitle)}</h1>
        <p data-i18n="loginSub">${esc(dict.loginSub)}</p>
      </div>

      <div class="lg-error" role="alert">${ICONS.shield}<span data-i18n="loginError">${esc(dict.loginError)}</span></div>

      <form method="POST" action="${esc(baseUrl)}/testsite/login" id="lg-form">
        <label class="lg-label" for="lg-pw" data-i18n="loginPassword">${esc(dict.loginPassword)}</label>
        <div class="lg-field">
          <input class="lg-input" type="password" id="lg-pw" name="password"
            placeholder="${esc(dict.loginPlaceholder)}" data-i18n-ph="loginPlaceholder"
            autocomplete="current-password" required autofocus>
          <button type="button" class="lg-toggle" id="lg-toggle" data-i18n-aria="showPassword" aria-label="${esc(dict.showPassword)}">
            <span class="lg-eye-on">${ICONS.eye}</span><span class="lg-eye-off">${ICONS.eyeOff}</span>
          </button>
        </div>
        <button type="submit" class="lg-btn" id="lg-submit" data-i18n="loginButton">${esc(dict.loginButton)}</button>
      </form>

      <div class="lg-foot" data-i18n="loginSub">${esc(dict.loginSub)}</div>
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
  const firstGame = GAMES[gameIds[0]] || { color: '#2f6df6', name: 'AmirCollider Games' }
  const accent = firstGame.color || '#2f6df6'
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
    lang, defaultLang: DEFAULT_LANG, baseUrl, gameIds, i18n: I18N, langMeta: LANG_META
  }).replace(/</g, '\\u003c')

  const sectionsHtml = plan.map(group => renderGroupSection(group, dict)).join('')

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${meta.dir}"${themeAttr}>
<head>
  ${getPageHead({ title: `${esc(dict.panelTitle)} | AmirCollider`, amirLogo, description: esc(dict.panelSub) })}
  ${themeBootScript()}
  <style>${dashStyles(accent, accentRgb)}</style>
</head>
<body>
  <div class="ts-bg" aria-hidden="true"></div>

  <main class="ts-shell">
    ${topbarHtml('ts', amirLogo, esc(firstGame.name), lang)}

    <section class="ts-hero">
      <span class="ts-badge"><span class="ts-ic">${ICONS.flask}</span>v${esc(CONFIG.VERSION)}</span>
      <h1 data-i18n="panelTitle">${esc(dict.panelTitle)}</h1>
      <p class="ts-sub" data-i18n="panelSub">${esc(dict.panelSub)}</p>
    </section>

    <section class="ts-summary">
      <div class="ts-stat"><div class="ts-stat-num" id="ts-total" style="color:var(--info)">0</div><div class="ts-stat-label" data-i18n="statTotal">${esc(dict.statTotal)}</div></div>
      <div class="ts-stat"><div class="ts-stat-num" id="ts-pass" style="color:var(--ok)">0</div><div class="ts-stat-label" data-i18n="statPass">${esc(dict.statPass)}</div></div>
      <div class="ts-stat"><div class="ts-stat-num" id="ts-fail" style="color:var(--err)">0</div><div class="ts-stat-label" data-i18n="statFail">${esc(dict.statFail)}</div></div>
      <div class="ts-stat"><div class="ts-stat-num" id="ts-warn" style="color:var(--warn)">0</div><div class="ts-stat-label" data-i18n="statWarn">${esc(dict.statWarn)}</div></div>
      <div class="ts-stat"><div class="ts-stat-num" id="ts-time">—</div><div class="ts-stat-label" data-i18n="statTime">${esc(dict.statTime)}</div></div>
    </section>

    <div class="ts-progress" id="ts-progress"><div class="ts-progress-fill" id="ts-progress-fill"></div></div>

    <section class="ts-controls">
      <button class="ts-btn ts-btn-run" id="ts-run">
        <span class="ts-ic ts-run-ic">${ICONS.play}</span><span data-i18n="runAll" id="ts-run-label">${esc(dict.runAll)}</span>
      </button>
      <button class="ts-btn" id="ts-reset"><span class="ts-ic">${ICONS.reset}</span><span data-i18n="reset">${esc(dict.reset)}</span></button>
      <button class="ts-btn" id="ts-export"><span class="ts-ic">${ICONS.download}</span><span data-i18n="exportReport">${esc(dict.exportReport)}</span></button>
      <form method="POST" action="${esc(baseUrl)}/testsite/logout" class="ts-logout-form">
        <button type="submit" class="ts-btn ts-btn-danger"><span class="ts-ic">${ICONS.logout}</span><span data-i18n="logout">${esc(dict.logout)}</span></button>
      </form>
    </section>

    <section class="ts-groups">
      ${sectionsHtml}
    </section>

    <section class="ts-manual">
      <h2><span class="ts-ic">${ICONS.terminal}</span><span data-i18n="manualTitle">${esc(dict.manualTitle)}</span></h2>
      <div class="ts-manual-grid">
        <label class="ts-m-field ts-m-method">
          <span data-i18n="mMethod">${esc(dict.mMethod)}</span>
          <select id="ts-m-method">
            <option>GET</option><option>POST</option><option>PUT</option>
            <option>PATCH</option><option>DELETE</option><option>OPTIONS</option>
          </select>
        </label>
        <label class="ts-m-field ts-m-endpoint">
          <span data-i18n="mEndpoint">${esc(dict.mEndpoint)}</span>
          <input type="text" id="ts-m-endpoint" placeholder="/neon-katana/health" dir="ltr">
        </label>
        <label class="ts-m-field ts-m-headers">
          <span data-i18n="mHeaders">${esc(dict.mHeaders)}</span>
          <input type="text" id="ts-m-headers" placeholder='{"Authorization":"Bearer ..."}' dir="ltr">
        </label>
        <label class="ts-m-field ts-m-body">
          <span data-i18n="mBody">${esc(dict.mBody)}</span>
          <textarea id="ts-m-body" rows="3" placeholder='{"key":"value"}' dir="ltr"></textarea>
        </label>
      </div>
      <button class="ts-btn ts-btn-run" id="ts-m-send"><span class="ts-ic">${ICONS.play}</span><span data-i18n="mSend">${esc(dict.mSend)}</span></button>
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
    ? `${dict[group.titleKey] || group.titleKey} · ${esc(group.gameName)}`
    : (dict[group.titleKey] || group.titleKey)
  const titleAttr = group.gameName ? '' : ` data-i18n="${group.titleKey}"`

  const rows = group.tests.map(test => {
    const label = dict[`t_${test.kind}`] || test.kind
    const desc = dict[`d_${test.kind}`] || ''
    const gameAttr = test.game ? ` data-game="${esc(test.game)}"` : ''
    return `
      <div class="ts-test" data-id="${esc(test.id)}" data-kind="${esc(test.kind)}"${gameAttr}>
        <div class="ts-test-main">
          <div class="ts-test-name" data-i18n="t_${test.kind}">${esc(label)}</div>
          <div class="ts-test-desc" data-i18n="d_${test.kind}">${esc(desc)}</div>
          <div class="ts-test-detail" id="detail-${esc(test.id)}"></div>
        </div>
        <span class="ts-result" id="result-${esc(test.id)}" data-i18n="rIdle">—</span>
      </div>`
  }).join('')

  return `
    <article class="ts-group" id="group-${esc(group.key)}">
      <header class="ts-group-head" data-group="${esc(group.key)}">
        <div class="ts-group-title"><span class="ts-ic">${icon}</span><span class="ts-group-name"${titleAttr}>${esc(titleText)}</span></div>
        <div class="ts-group-right">
          <span class="ts-group-badge badge-pending" id="badge-${esc(group.key)}" data-i18n="bPending">${esc(dict.bPending)}</span>
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
  .ts-lang-btn.is-active { color: #fff; background: var(--accent); }
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
  .ts-btn-run { background: var(--accent); color: #fff; border-color: transparent; }
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
    var RUNNERS = {
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
      d1EmptyUser: function () {
        return fetchTest('/database/get/games/neon-katana/users/nonexistentuser99999xyz', { headers: { Accept: 'application/json', Authorization: 'Bearer fake_token_for_404_test' } }).then(function (r) {
          if (!r.ok) return netFail();
          if (r.status === 404) return { status: 'pass', code: 404, ping: r.ping };
          if (r.status === 401) return { status: 'warn', code: 401, ping: r.ping };
          return { status: 'warn', code: r.status, ping: r.ping, noteKey: 'expected', noteVal: '404' };
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
