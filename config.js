// ==========================================
// OAuth Proxy v6.7 - Secure Version
// AmirCollider Games - Central Configuration
// ==========================================
//
// Single source of truth for the Worker proxy.
//
// Public exports (do not break without updating callers):
//   SECURITY        -> SECURITY.SECURE_HEADERS   (utils.js)
//   CORS_HEADERS                                 (utils.js, worker.js)
//   CONFIG          -> runtime constants         (worker.js, utils.js, pages/*)
//   LANGUAGES       -> supported UI languages     (i18n / RTL-LTR source of truth)
//   THEME           -> light / dark / auto config (theming source of truth)
//   getGamesConfig(env) -> map keyed by game id   (worker.js, utils.js, pages/*)
//
// Adding a game:      add one entry to GAME_REGISTRY below.
// Translating a game: fill i18n.description[fa|en|ja] and tags[].
// ==========================================


// ==========================================
// Immutability Helper
// Freezes config trees so they cannot be mutated at runtime.
// ==========================================
function deepFreeze(target) {
  if (target && typeof target === 'object' && !Object.isFrozen(target)) {
    for (const value of Object.values(target)) deepFreeze(value)
    Object.freeze(target)
  }
  return target
}


// ==========================================
// Security Response Headers
// Applied to every Response by utils.js.
// ==========================================
export const SECURITY = deepFreeze({
  SECURE_HEADERS: {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
  }
})


// ==========================================
// CORS Headers
// Open API surface for game clients (Android, web, bots).
// ==========================================
export const CORS_HEADERS = deepFreeze({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, User-Agent, X-Game-ID, X-Request-ID',
  'Access-Control-Max-Age': '86400'
})


// ==========================================
// Runtime Constants
// Durations are milliseconds. Consumed across worker.js / utils.js / pages.
// ==========================================
export const CONFIG = deepFreeze({
  VERSION: '6.7',
  STATE_EXPIRY_MS: 30 * 60 * 1000,
  REDIRECT_TIMEOUT_MS: 1000,
  PING_TIMEOUT_MS: 5000,
  TOKEN_MAX_AGE_MS: 60 * 60 * 1000,
  SESSION_MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000,
  AUTO_COPY_CODE: true,
  SUPPORT_EMAIL: 'amircollider@yahoo.com',
  AMIR_LOGO: '/assets/AmirColliderLogo.png',
  DEFAULT_GAME_LOGO: '/assets/DefaultGameLogo.png'
})


// ==========================================
// Languages
// Source of truth for the site's three supported locales and their
// text direction. Keeps RTL/LTR consistent across every page.
// ==========================================
export const LANGUAGES = deepFreeze({
  default: 'fa',
  supported: ['fa', 'en', 'ja'],
  meta: {
    fa: { label: 'فارسی', dir: 'rtl' },
    en: { label: 'English', dir: 'ltr' },
    ja: { label: '日本語', dir: 'ltr' }
  },
  storageKey: 'ac_lang',
  cookieKey: 'lang'
})


// ==========================================
// Theme
// Source of truth for light / dark / auto theming and where the
// user's choice is persisted.
// ==========================================
export const THEME = deepFreeze({
  default: 'auto',
  modes: ['light', 'dark', 'auto'],
  storageKey: 'ac_theme',
  cookieKey: 'theme'
})


// ==========================================
// Game Registry
// Static, environment-independent definition of each game.
// One entry per game; secrets are injected from env in getGamesConfig().
// ==========================================
const GAME_REGISTRY = {
  'neon-katana': {
    name: 'Neon Katana',
    icon: '⚔️',
    color: '#FF5722',
    logo: '/assets/NeonKatanaLogo.png',
    description: 'Neon action sword game',
    i18n: {
      description: {
        fa: 'بازی اکشن شمشیر نئونی',
        en: 'Neon action sword game',
        ja: 'ネオンの剣アクションゲーム'
      }
    },
    tags: [
      { fa: 'اکشن', en: 'Action', ja: 'アクション' },
      { fa: 'اندروید', en: 'Android', ja: 'Android' }
    ],
    package: 'com.AmirColliderGames.NeonKatana',
    myketUrl: 'https://myket.ir/app/com.AmirColliderGames.NeonKatana',
    d1Binding: 'NEON_KATANA_DB',
    deepLink: { host: 'oauth' },
    env: {
      android: 'NEON_KATANA_GOOGLE_CLIENT_ID_ANDROID',
      web: 'NEON_KATANA_GOOGLE_CLIENT_ID_WEB',
      secret: 'NEON_KATANA_GOOGLE_CLIENT_SECRET',
      deepLinkScheme: 'NEON_KATANA_DEEPLINK_SCHEME'
    },
    fallback: {
      deepLinkScheme: 'com.amircollidergames.neonkatana'
    }
  }
}


// ==========================================
// Game Builder
// Merges a registry entry with per-environment secrets into the
// runtime shape consumed by the rest of the proxy.
// ==========================================
function buildGame(id, def, env) {
  const read = key => (key && env ? env[key] : undefined)

  return {
    id,
    name: def.name,
    icon: def.icon,
    color: def.color,
    logo: def.logo,
    description: def.description,
    i18n: def.i18n,
    tags: def.tags,
    package: def.package,
    myketUrl: def.myketUrl,
    d1Binding: def.d1Binding,
    oauth: {
      android: read(def.env.android),
      web: read(def.env.web),
      secret: read(def.env.secret)
    },
    deepLink: {
      scheme: read(def.env.deepLinkScheme) || def.fallback.deepLinkScheme,
      host: def.deepLink.host
    }
  }
}


// ==========================================
// getGamesConfig
// Returns the games map keyed by id, with secrets resolved from env.
// ==========================================
export function getGamesConfig(env) {
  const games = {}
  for (const [id, def] of Object.entries(GAME_REGISTRY)) {
    games[id] = buildGame(id, def, env || {})
  }
  return deepFreeze(games)
}
