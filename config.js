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

  // The site's own public origin.
  //
  // Needed because a handful of places have to produce an
  // ABSOLUTE url rather than a path: a licence refusal that
  // tells somebody where to release a seat, and the product
  // page's canonical/OpenGraph tags. Everything else uses
  // paths and should keep doing so.
  //
  // A constant rather than url.origin, deliberately: the
  // request origin is whatever host the caller used, so a
  // preview deployment or a proxied hostname would bake the
  // wrong address into a customer-facing message.
  SITE_URL: 'https://amircollider.n95pluss.workers.dev',

  // Unity DocSnap — the paid Unity editor extension.
  //
  // Three tiers. Free needs no key at all. Plus is the two
  // outputs people ask for by name (the AI-ready summaries
  // and the Changes page) and exists because somebody who
  // wants exactly those would look at a single $49.99 price
  // and buy nothing. Pro is everything.
  //
  // Both tiers are sold through this Worker's own crypto
  // checkout (/checkout), which mints a key of the right
  // tier and emails it the moment a payment confirms. See
  // CHECKOUT.md for the whole path and COMMERCE below for
  // the knobs.
  //
  // The tier names here must match DocSnapEditionMatrix in
  // the Unity package, which is what a licence token carries.
  DOCSNAP: {
    REPO_URL: 'https://github.com/AmirCollider/UnityDocSnap',
    VERSION: '1.0.0',
    TIERS: {
      plus: { name: 'Plus', price: '19.99', buyUrl: '/checkout?tier=plus' },
      pro: { name: 'Pro', price: '49.99', buyUrl: '/checkout?tier=pro' }
    }
  },

  // Crypto checkout.
  //
  // Every number here is a promise made to a customer on the
  // pay page, so they live next to each other rather than
  // scattered through the handlers that enforce them - a
  // page that says "within 5 minutes" while a cron runs
  // every 15 is a support ticket with our name on it.
  COMMERCE: {
    // The payment provider. NOWPayments is the one
    // implemented in commerce/provider.js; the field exists
    // so a second one can be added without the order code
    // learning its name.
    PROVIDER: 'nowpayments',
    PROVIDER_API: 'https://api.nowpayments.io/v1',

    // Prices are quoted in USD and converted by the provider
    // at payment time. Quoting in a coin instead would mean
    // re-pricing the product every time BTC moved.
    PRICE_CURRENCY: 'usd',

    // How long an unpaid invoice is kept warm before the
    // reconciler marks it expired. Generous on purpose:
    // somebody funding an exchange withdrawal to pay for
    // this can easily be an hour, and an order marked dead
    // while their transaction is in flight still delivers
    // (a late payment is honoured) but panics the customer.
    INVOICE_TTL_MS: 24 * 60 * 60 * 1000,

    // The promise on the pay page, and the number the "it
    // never arrived" email template quotes back. Delivery is
    // normally seconds; five minutes is the number that
    // covers a slow mail provider without inviting a ticket.
    DELIVERY_PROMISE_MINUTES: 5,

    // How long the issued key stays retrievable for a
    // re-send after it was delivered. Sealed with AES-GCM
    // under a Worker secret for the whole window and wiped
    // by cron afterwards, so a customer who lost the email
    // can get the same key back without us keeping plaintext
    // licence keys around forever.
    KEY_RETENTION_MS: 30 * 24 * 60 * 60 * 1000,

    // Delivery email retry schedule, in minutes from the
    // first failure. Front-loaded because the overwhelming
    // majority of mail-provider failures are a blip that is
    // over in a minute, and the long tail exists for the
    // afternoon an API key gets rotated by mistake.
    MAIL_RETRY_MINUTES: [1, 3, 10, 30, 120, 360, 720, 1440],

    // An order that has been paid this long without a key in
    // the customer's inbox is something a human needs to
    // know about, so it raises an admin alert.
    STUCK_ALERT_MS: 15 * 60 * 1000,

    // Orders one IP may open per hour. High enough that a
    // person retrying a failed invoice three times never
    // notices, low enough that the provider's API is not a
    // free amplifier.
    ORDER_RATE_LIMIT: 12,
    ORDER_RATE_WINDOW_MS: 60 * 60 * 1000
  },

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
