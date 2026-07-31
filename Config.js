// ==========================================
// Config.js
// Single source of truth for the Worker.
//
// Exports
//   SECURITY / CORS_HEADERS     headers applied to every response
//   CONFIG                      runtime constants and product data
//   LANGUAGES / THEME           i18n and theming source of truth
//   GAME_STATUS / PRODUCT_KIND  the closed vocabularies
//   getGamesConfig(env)         the games map, secrets resolved
//   getGameProduct(game, id)    one catalogue product, or null
//   getGameEnvNames()           which env keys each game reads
//   validateGameId(id, games)   resolve a request's game
//   validateEnvironment(env)    throw when a required secret is absent
//
// Adding a game:      one entry in GAME_REGISTRY.
// Translating a game: fill i18n.description[fa|en|ja] and tags[].
// Adding a product:   one entry in that game's store.products[].
// ==========================================

/** Freezes a config tree so nothing can mutate it at runtime. */
function deepFreeze(target) {
  if (target && typeof target === 'object' && !Object.isFrozen(target)) {
    for (const value of Object.values(target)) deepFreeze(value)
    Object.freeze(target)
  }
  return target
}


// ==========================================
// Response headers
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

// Open on purpose: the API surface is called by Android builds,
// desktop players and browsers that share no common origin.
export const CORS_HEADERS = deepFreeze({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, User-Agent, X-Game-ID, X-Request-ID',
  'Access-Control-Max-Age': '86400'
})


// ==========================================
// Runtime constants. Durations are milliseconds.
// ==========================================
export const CONFIG = deepFreeze({
  VERSION: '6.7.3',

  // A constant rather than url.origin: a handful of places have to
  // produce an absolute address (a licence refusal, canonical and
  // OpenGraph tags), and the request origin is whatever host the
  // caller used - a preview deployment would bake in the wrong one.
  SITE_URL: 'https://amircollider.n95pluss.workers.dev',

  // Unity DocSnap - the paid Unity editor extension. Sold through
  // this Worker's own crypto checkout (see Docs/Checkout.md).
  // Tier names must match DocSnapEditionMatrix in the Unity package,
  // which is what a licence token carries.
  DOCSNAP: {
    REPO_URL: 'https://github.com/AmirCollider/UnityDocSnap',
    VERSION: '1.0.0',
    TIERS: {
      plus: { name: 'Plus', price: '19.99', buyUrl: '/checkout?tier=plus' },
      pro: { name: 'Pro', price: '49.99', buyUrl: '/checkout?tier=pro' }
    }
  },

  // Unity DirectTMP - free and MIT, so no checkout and no tiers.
  // VERSION must match the package's package.json and
  // DirectTMPConstants.Version.
  DIRECTTMP: {
    REPO_URL: 'https://github.com/AmirCollider/UnityDirectTMP',
    VERSION: '1.0.0',
    GIT_URL: 'https://github.com/AmirCollider/UnityDirectTMP.git'
  },

  // The licence checkout. Every number here is a promise made to a
  // customer on the pay page, so they live together rather than
  // scattered through the handlers that enforce them.
  COMMERCE: {
    PROVIDER: 'nowpayments',
    PROVIDER_API: 'https://api.nowpayments.io/v1',

    // Quoted in USD and converted by the provider at payment time,
    // so the product is not re-priced every time BTC moves.
    PRICE_CURRENCY: 'usd',

    // How long an unpaid invoice stays warm. Generous: funding an
    // exchange withdrawal can take an hour, and an order marked dead
    // mid-transfer still delivers but panics the customer.
    INVOICE_TTL_MS: 24 * 60 * 60 * 1000,

    // The number the pay page and the "it never arrived" email both
    // quote. Delivery is normally seconds; this covers a slow mail
    // provider without inviting a ticket.
    DELIVERY_PROMISE_MINUTES: 5,

    // How long a delivered key stays retrievable for a re-send.
    // Sealed with AES-GCM under a Worker secret for the window and
    // wiped by cron afterwards.
    KEY_RETENTION_MS: 30 * 24 * 60 * 60 * 1000,

    // Delivery-email retry schedule, in minutes from the first
    // failure. Front-loaded: most mail failures are over in a
    // minute, and the tail covers a rotated API key.
    MAIL_RETRY_MINUTES: [1, 3, 10, 30, 120, 360, 720, 1440],

    // Paid this long with no key delivered raises an admin alert.
    STUCK_ALERT_MS: 15 * 60 * 1000,

    // Orders one IP may open per hour.
    ORDER_RATE_LIMIT: 12,
    ORDER_RATE_WINDOW_MS: 60 * 60 * 1000
  },

  // The games' storefront. Separate from COMMERCE even though both
  // ride one payment provider: one sells an editor extension to a
  // developer by email, the other sells shards to a signed-in
  // player, and a limit tuned for one should not govern the other.
  GAMESTORE: {
    // Long enough that buying on a phone and returning that evening
    // does not mean signing in again.
    SESSION_MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000,
    INVOICE_TTL_MS: 24 * 60 * 60 * 1000,

    // Lower than the licence checkout's: more products means more
    // ways to open invoices in a loop.
    ORDER_RATE_LIMIT: 10,
    ORDER_RATE_WINDOW_MS: 60 * 60 * 1000,

    // How long a merged games map is reused inside one isolate.
    // Overrides change a few times a month, so a database read per
    // page view buys nothing; the panel always reads fresh.
    SETTINGS_CACHE_MS: 30 * 1000
  },

  STATE_EXPIRY_MS: 30 * 60 * 1000,
  REDIRECT_TIMEOUT_MS: 1000,
  PING_TIMEOUT_MS: 5000,
  TOKEN_MAX_AGE_MS: 60 * 60 * 1000,
  SESSION_MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000,
  AUTO_COPY_CODE: true,
  SUPPORT_EMAIL: 'amiru.koraida@gmail.com',
  AMIR_LOGO: '/assets/AmirColliderLogo.png',
  DEFAULT_GAME_LOGO: '/assets/DefaultGameLogo.png'
})


// ==========================================
// Languages and theme.
// The only place the supported locales, their direction and where
// a visitor's choice is persisted are written down.
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

export const THEME = deepFreeze({
  default: 'auto',
  modes: ['light', 'dark', 'auto'],
  storageKey: 'ac_theme',
  cookieKey: 'theme'
})


// ==========================================
// Closed vocabularies.
// ==========================================
export const GAME_STATUS = deepFreeze({
  LIVE: 'live',
  MAINTENANCE: 'maintenance',
  SOON: 'soon',
  ALL: ['live', 'maintenance', 'soon']
})

export const PRODUCT_KIND = deepFreeze({
  CONSUMABLE: 'consumable',
  NONCONSUMABLE: 'nonconsumable',
  PASS: 'pass',
  ALL: ['consumable', 'nonconsumable', 'pass']
})


// ==========================================
// Game registry - the only place a game can come into existence.
//
// A game is not a row: it is a D1 binding, a set of Google OAuth
// secrets, a deep-link scheme, an Android package and a catalogue,
// none of which a web form can conjure. So the split is:
//
//   here      which games exist, and everything a deploy must know
//   database  what an operator may change without a deploy: name,
//             logo, description, download switch, prices
//             (overrides only - see Games/Registry.js)
//
// The /thegod panel's "add a game" screen generates an entry below
// plus the wrangler binding and SQL, then asks you to deploy them.
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

    // What this game asks the network for. The dashboard card is
    // built from this and nothing else, so a game that only reaches
    // the internet to sign in does not advertise a ping test.
    capabilities: {
      onlinePlay: false,
      login: true,
      cloudSave: true,
      leaderboard: true,
      store: true
    },

    // `primary` names the link the download button uses; the rest
    // are listed underneath. Whether the button works at all is a
    // database setting, because pulling a build is an afternoon's
    // decision and not a deploy's.
    download: {
      primary: 'myket',
      links: {
        myket: 'https://myket.ir/app/com.AmirColliderGames.NeonKatana'
      }
    },

    status: GAME_STATUS.LIVE,

    // The catalogue lives in code, next to the game, because a
    // product id is a string the shipped build hard-codes. The
    // database may switch a product off, re-price it or re-order
    // it - it may not create one.
    //
    //   sku    what the game asks Google Play for
    //   id     what this Worker and its entitlements API use
    //   grant  passed to the entitlements API verbatim; nothing
    //          here interprets it, so a game can invent its shape
    store: {
      products: [
        {
          id: 'shards-small',
          sku: 'neon_shards_1000',
          kind: PRODUCT_KIND.CONSUMABLE,
          priceUsd: '1.99',
          icon: '💎',
          grant: { type: 'currency', code: 'shards', amount: 1000 },
          i18n: {
            name: { fa: '۱۰۰۰ شارد نئون', en: '1,000 Neon Shards', ja: 'ネオンシャード 1,000' },
            description: {
              fa: 'یک مشت شارد برای باز کردن قدم بعدی.',
              en: 'A handful of shards to unlock the next step.',
              ja: '次の一歩を解放するためのシャード。'
            }
          }
        },
        {
          id: 'shards-large',
          sku: 'neon_shards_6500',
          kind: PRODUCT_KIND.CONSUMABLE,
          priceUsd: '8.99',
          icon: '💠',
          badge: 'best',
          grant: { type: 'currency', code: 'shards', amount: 6500 },
          i18n: {
            name: { fa: '۶۵۰۰ شارد نئون', en: '6,500 Neon Shards', ja: 'ネオンシャード 6,500' },
            description: {
              fa: 'بهترین ارزش — تقریباً سه برابر بسته‌ی کوچک به ازای هر دلار.',
              en: 'Best value — nearly three times the small pack per dollar.',
              ja: '最もお得 — 1ドルあたり小パックの約3倍。'
            }
          }
        },
        {
          id: 'skin-oni',
          sku: 'neon_skin_oni',
          kind: PRODUCT_KIND.NONCONSUMABLE,
          priceUsd: '4.99',
          icon: '👺',
          grant: { type: 'cosmetic', code: 'katana_oni' },
          i18n: {
            name: { fa: 'کاتانای اونی', en: 'Oni Katana', ja: '鬼の刀' },
            description: {
              fa: 'پوسته‌ی تیغه‌ی اونی. یک‌بار خرید، برای همیشه.',
              en: 'The Oni blade skin. Bought once, kept forever.',
              ja: '鬼の刃スキン。一度購入すれば永久に。'
            }
          }
        },
        {
          id: 'no-ads',
          sku: 'neon_no_ads',
          kind: PRODUCT_KIND.NONCONSUMABLE,
          priceUsd: '2.99',
          icon: '🚫',
          grant: { type: 'flag', code: 'ads_removed' },
          i18n: {
            name: { fa: 'حذف تبلیغات', en: 'Remove ads', ja: '広告を削除' },
            description: {
              fa: 'تبلیغات بین مرحله‌ها برای همیشه خاموش می‌شود.',
              en: 'Turns off between-run ads for good.',
              ja: 'ラン間の広告を永久にオフにします。'
            }
          }
        },
        {
          id: 'season-pass',
          sku: 'neon_season_pass',
          kind: PRODUCT_KIND.PASS,
          priceUsd: '9.99',
          icon: '🎫',
          durationDays: 90,
          grant: { type: 'pass', code: 'season', tier: 'gold' },
          i18n: {
            name: { fa: 'پاس فصل', en: 'Season pass', ja: 'シーズンパス' },
            description: {
              fa: 'سه ماه دسترسی به مسیر جایزه‌ی فصل.',
              en: 'Three months of the season reward track.',
              ja: 'シーズン報酬トラックに3か月アクセス。'
            }
          }
        }
      ]
    },

    // The two client ids and the client secret must be Worker
    // secrets: they come from the Google Cloud console and one of
    // them is a credential.
    //
    // deepLinkScheme is none of those things - it is printed in the
    // manifest of every shipped APK. It is an optional override,
    // resolved in this order:
    //
    //   game_settings.deeplink_scheme   the TheGod panel
    //   NEON_KATANA_DEEPLINK_SCHEME     if it is still set
    //   fallback.deepLinkScheme         below, always present
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


// Every field the rest of the Worker reads has to exist on every
// game, or one older entry becomes a crash on a page written after
// it. Filled in here rather than guarded at forty call sites.
const CAPABILITY_DEFAULTS = deepFreeze({
  onlinePlay: false,
  login: true,
  cloudSave: false,
  leaderboard: false,
  store: false
})


/**
 * Merges a registry entry with per-environment secrets into the
 * runtime shape the rest of the Worker consumes.
 *
 * Secrets are read one key at a time rather than spread from env,
 * so a game whose secrets are unset has empty strings in those
 * slots - not a crash, and never another game's client id.
 */
function buildGame(id, def, env) {
  const read = key => (key && env ? env[key] : undefined)

  const download = def.download || {}
  const links = { ...(download.links || {}) }
  // Entries written before `download` existed carried myketUrl as
  // their only store link, and the policy pages still read it.
  if (def.myketUrl && !links.myket) links.myket = def.myketUrl

  const envNames = def.env || {}
  const fallback = def.fallback || {}

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
    myketUrl: def.myketUrl || links[download.primary] || '',
    d1Binding: def.d1Binding,

    status: GAME_STATUS.ALL.includes(def.status) ? def.status : GAME_STATUS.LIVE,
    capabilities: { ...CAPABILITY_DEFAULTS, ...(def.capabilities || {}) },
    download: {
      primary: download.primary || Object.keys(links)[0] || '',
      links
    },
    store: {
      products: ((def.store && def.store.products) || []).map(product => ({
        kind: PRODUCT_KIND.ALL.includes(product.kind) ? product.kind : PRODUCT_KIND.NONCONSUMABLE,
        ...product
      }))
    },

    oauth: {
      android: read(envNames.android),
      web: read(envNames.web),
      secret: read(envNames.secret)
    },
    deepLink: {
      // The environment still wins over the code fallback, so a
      // deployment with the variable set behaves exactly as before.
      // Games/Registry.js layers the panel's value on top of this.
      scheme: read(envNames.deepLinkScheme) || fallback.deepLinkScheme || '',
      host: (def.deepLink && def.deepLink.host) || 'oauth'
    }
  }
}


/**
 * Which environment keys each game reads, and which of them the
 * Worker genuinely cannot start without.
 *
 * Derived from the registry so the boot check and the panel's
 * environment screen share one list; a hard-coded one is right for
 * the first game and silently wrong for the second.
 *
 * Only names are returned - no value is ever read here, which
 * keeps this safe to call from a page.
 */
export function getGameEnvNames() {
  const out = {}

  for (const [id, def] of Object.entries(GAME_REGISTRY)) {
    const env = def.env || {}
    const capabilities = { ...CAPABILITY_DEFAULTS, ...(def.capabilities || {}) }

    out[id] = {
      name: def.name,
      d1Binding: def.d1Binding || '',
      capabilities,

      // Everything outside `required` has somewhere to fall back
      // to: an Android client id is only needed by a game that
      // ships an APK, and a deep-link scheme resolves from the
      // panel or from `fallback`.
      required: capabilities.login ? [env.web, env.secret].filter(Boolean) : [],

      keys: {
        web: env.web || '',
        secret: env.secret || '',
        android: env.android || '',
        deepLinkScheme: env.deepLinkScheme || ''
      },

      deepLinkFallback: (def.fallback && def.fallback.deepLinkScheme) || ''
    }
  }

  return out
}


/**
 * The games map keyed by id, with secrets resolved from env.
 *
 * Frozen deliberately: this is the code-defined truth about which
 * games exist. Games/Registry.js copies rather than mutates, so the
 * worst a bad database row can do is change how a game is
 * described, never which games there are.
 */
export function getGamesConfig(env) {
  const games = {}
  for (const [id, def] of Object.entries(GAME_REGISTRY)) {
    games[id] = buildGame(id, def, env || {})
  }
  return deepFreeze(games)
}


/**
 * One product from a game's code catalogue, or null. Every purchase
 * path goes through this: a product id arriving in a request body
 * never names anything that is not in the catalogue.
 */
export function getGameProduct(game, productId) {
  const products = (game && game.store && game.store.products) || []
  return products.find(product => product.id === productId) || null
}


/**
 * Resolves a request's game id against the registry: the match, the
 * first registered game as a fallback, or null when the registry is
 * empty. Pure - callers decide how to react to null.
 */
export function validateGameId(gameId, games) {
  if (!games || Object.keys(games).length === 0) return null

  const firstGame = games[Object.keys(games)[0]] || null
  if (!gameId || gameId === 'undefined') return firstGame

  return games[gameId] || firstGame
}


/**
 * Fails fast at boot when a required secret is missing.
 *
 * Only what has no fallback is required: the Google web client id
 * and client secret of a game that claims `login`. A deep-link
 * scheme is not on the list - requiring it meant deleting one
 * variable took down every page on the site, including the panels
 * you would use to find out why.
 */
export function validateEnvironment(env) {
  const missing = []

  for (const game of Object.values(getGameEnvNames())) {
    for (const key of game.required) {
      if (!env || !env[key]) missing.push(key)
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }

  return true
}
