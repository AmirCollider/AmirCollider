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
//   GAME_STATUS     -> live | maintenance | soon  (games/*, pages/*)
//   PRODUCT_KIND    -> consumable | nonconsumable | pass
//   getGamesConfig(env)          -> map keyed by game id  (worker.js, pages/*)
//   getGameProduct(game, id)     -> one catalogue product, or null
//
// Adding a game:      add one entry to GAME_REGISTRY below.
// Translating a game: fill i18n.description[fa|en|ja] and tags[].
// Adding a product:   add one entry to that game's store.products[].
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

  // Unity DirectTMP — the free Unity editor extension.
  //
  // Free and MIT, with no checkout, no licence server
  // and no tiers, which is why this block is three
  // lines where DOCSNAP is fifteen. It is still listed
  // here rather than only in the tools catalogue,
  // because the version number appears on the product
  // page, in the catalogue card and in the release
  // notes, and one constant is easier to keep honest
  // than three literals.
  //
  // VERSION must match "version" in the package's own
  // package.json and DirectTMPConstants.Version. The
  // package's CI already fails when those two disagree;
  // this is the third copy, and the one furthest from
  // that check, so it is the one most likely to drift.
  DIRECTTMP: {
    REPO_URL: 'https://github.com/AmirCollider/UnityDirectTMP',
    VERSION: '1.0.0',
    GIT_URL: 'https://github.com/AmirCollider/UnityDirectTMP.git'
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

  // The games' own storefront.
  //
  // Separate from COMMERCE above even though both ride the
  // same payment provider, because they are two different
  // shops with two different customers: COMMERCE sells a Unity
  // editor extension to a developer by email, this sells a
  // thousand shards to a signed-in player. Sharing one set of
  // numbers would mean a limit tuned for one silently
  // governing the other.
  GAMESTORE: {
    // How long a player's site session lasts. Long enough that
    // buying something on a phone and coming back that evening
    // does not mean signing in again; short enough that a
    // borrowed browser is not a permanent account.
    SESSION_MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000,

    // Same shape as COMMERCE's invoice window and for the same
    // reason - somebody funding a wallet to buy a skin is not
    // faster than somebody funding one to buy a licence.
    INVOICE_TTL_MS: 24 * 60 * 60 * 1000,

    // Purchases one IP may start per hour. Lower than the
    // licence checkout's because a game store has more products
    // and therefore more ways to open invoices in a loop.
    ORDER_RATE_LIMIT: 10,
    ORDER_RATE_WINDOW_MS: 60 * 60 * 1000,

    // How long a merged games map is reused inside one isolate
    // before the settings are read from D1 again. The overrides
    // change when an operator presses save - a handful of times
    // a month - so paying for a database read on every page view
    // buys nothing. The panel reads fresh on every load, so the
    // person making the change never sees a stale screen.
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
// Game Status
// The three states a game can be in, and what each one means
// for a visitor. The database can move a game between them
// (see games/store.js); it can never invent a fourth.
//
//   live         playable, downloadable, buyable
//   maintenance  on the site, download withheld
//   soon         announced, nothing to download yet
//
// `maintenance` is the one that earns its keep. Pulling a
// build is not the same as deleting a game: the store page,
// the leaderboard, the privacy policy and every link anybody
// has ever shared must keep working, or taking a broken APK
// down for an afternoon costs more than leaving it up.
// ==========================================
export const GAME_STATUS = deepFreeze({
  LIVE: 'live',
  MAINTENANCE: 'maintenance',
  SOON: 'soon',
  ALL: ['live', 'maintenance', 'soon']
})


// ==========================================
// Product Kinds
// What buying one of a game's products actually does.
//
//   consumable     spent and bought again (currency, refills)
//   nonconsumable  owned once, forever (a skin, an ad removal)
//   pass           owned once and time-boxed (a season)
//
// The kind decides whether the entitlements API lets a game
// CONSUME the thing. A consumable that cannot be spent is a
// player who paid for a thousand shards and can never use
// them; a non-consumable that can be is a skin that vanishes
// after one game.
// ==========================================
export const PRODUCT_KIND = deepFreeze({
  CONSUMABLE: 'consumable',
  NONCONSUMABLE: 'nonconsumable',
  PASS: 'pass',
  ALL: ['consumable', 'nonconsumable', 'pass']
})


// ==========================================
// Game Registry
// Static, environment-independent definition of each game.
//
// THIS FILE IS THE ONLY PLACE A GAME CAN COME INTO EXISTENCE.
//
// That is a deliberate constraint rather than an accident of
// how it grew. A game is not a row: it is a D1 binding, a set
// of Google OAuth secrets, a deep-link scheme, an Android
// package name and a store catalogue - none of which a form
// on a web page can conjure. A panel that "added a game" by
// writing a row would produce something that looks like a
// game on the dashboard and cannot log a single player in.
//
// So the split is:
//
//   here        which games exist, and everything about them
//               that a deploy has to know: bindings, secrets,
//               packages, the product catalogue.
//
//   database    what an operator may change afterwards without
//               a deploy: the display name, the logo, the
//               description, whether the download link is live,
//               which products are on sale and at what price.
//               Overrides only - see games/registry.js.
//
// Reading this file therefore tells you exactly which games
// this Worker serves, which is the property the /thegod panel
// is built to preserve rather than to work around: its "add a
// game" screen GENERATES the entry below, the wrangler binding
// and the SQL, and then asks you to paste and deploy them.
//
// Adding a game:      add one entry here (or let /thegod write it).
// Translating a game: fill i18n.description[fa|en|ja] and tags[].
// Adding a product:   add one entry to store.products[] here.
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

    // ------------------------------------------------------------
    // What this game asks the network for.
    //
    // The card on the dashboard is built from this and nothing
    // else, which is the point. A game that plays offline and
    // only reaches the internet to sign in should not be
    // advertising a ping test and a metrics button - those are
    // answers to questions nobody playing it has.
    //
    //   onlinePlay  gameplay itself needs the network
    //   login       Google sign-in through this proxy
    //   cloudSave   profile / progress stored in D1
    //   leaderboard public score table
    //   store       in-app purchases, in-game and on the site
    // ------------------------------------------------------------
    capabilities: {
      onlinePlay: false,
      login: true,
      cloudSave: true,
      leaderboard: true,
      store: true
    },

    // ------------------------------------------------------------
    // Where somebody gets the game.
    //
    // `primary` names which link the download button uses; the
    // rest are listed underneath. Whether the button works at
    // all is a database setting (downloadEnabled), because
    // pulling a build is an afternoon's decision and not a
    // deploy's.
    // ------------------------------------------------------------
    download: {
      primary: 'myket',
      links: {
        myket: 'https://myket.ir/app/com.AmirColliderGames.NeonKatana'
      }
    },

    status: GAME_STATUS.LIVE,

    // ------------------------------------------------------------
    // The store catalogue.
    //
    // In code, next to the game, for the same reason the game
    // is: a product id is a string the shipped Unity build
    // hard-codes, so inventing one from a web form produces an
    // id no client has ever heard of. The database may switch a
    // product off, re-price it or re-order it - it may not
    // create one.
    //
    // `sku` is what the game asks Google Play for; `id` is what
    // this Worker and its entitlements API use. They are
    // allowed to differ, and usually do, because Play skus are
    // per-application and ours are not.
    //
    // `grant` is what the game hands the player when the
    // purchase lands. It is passed through verbatim to the
    // entitlements API - nothing here interprets it, so a game
    // can invent whatever shape suits it.
    // ------------------------------------------------------------
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

    // ------------------------------------------------------------
    // What has to be a Worker secret, and what does not.
    //
    // The two client ids and the client secret do: they come from
    // the Google Cloud console, they are per-deployment, and the
    // client secret is a credential.
    //
    // deepLinkScheme is none of those things. It is the URL scheme
    // an Android build registers - the same string that is printed
    // in the manifest of every shipped APK and visible to anyone
    // who unzips one. It stayed in `env` only because it arrived
    // alongside the OAuth values, and being there made it a
    // deploy-time change that also had to be typed into
    // "Variables and secrets" for the Worker to boot at all.
    //
    // It is now an OPTIONAL override, in this order:
    //
    //   game_settings.deeplink_scheme   the TheGod panel
    //   NEON_KATANA_DEEPLINK_SCHEME     if it is still set
    //   fallback.deepLinkScheme         below, always present
    //
    // Nothing breaks if the variable is deleted, which is the
    // point of moving it: the fallback is the value the shipped
    // build already registered.
    // ------------------------------------------------------------
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
// Defaults for an entry that leaves something out
//
// Every field the rest of the Worker reads has to exist on
// every game, or one older registry entry becomes a crash on
// a page that was written after it. Filled in here rather
// than guarded at forty call sites.
// ==========================================
const CAPABILITY_DEFAULTS = deepFreeze({
  onlinePlay: false,
  login: true,
  cloudSave: false,
  leaderboard: false,
  store: false
})


// ==========================================
// Game Builder
// Merges a registry entry with per-environment secrets into the
// runtime shape consumed by the rest of the proxy.
//
// Secrets are read through `read` rather than spread from env,
// so a game whose secrets have not been set yet is a game with
// empty strings in those slots - not a crash, and not a game
// that silently borrows another one's client id.
// ==========================================
function buildGame(id, def, env) {
  const read = key => (key && env ? env[key] : undefined)

  const download = def.download || {}
  const links = { ...(download.links || {}) }
  // Kept in step for entries written before `download` existed:
  // myketUrl was the only store link a game could have, and the
  // privacy and terms pages still read it by that name.
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
      // deployment that has the variable set keeps behaving
      // exactly as it did. games/registry.js layers the panel's
      // stored value on top of whatever comes out here.
      scheme: read(envNames.deepLinkScheme) || fallback.deepLinkScheme || '',
      host: (def.deepLink && def.deepLink.host) || 'oauth'
    }
  }
}


// ==========================================
// getGameEnvNames
// Which environment keys each game reads, and which of them the
// Worker genuinely cannot start without.
//
// Exported so the two places that need this list - the boot
// check in utils.js and the environment screen in the TheGod
// panel - read it from the registry instead of keeping their own
// copy. A hard-coded list is a list that is right for one game
// and silently wrong for the second.
//
// Only names are returned. No value is ever read here: the
// caller decides whether it may look at env, which keeps this
// safe to call from a page.
// ==========================================
export function getGameEnvNames() {
  const out = {}

  for (const [id, def] of Object.entries(GAME_REGISTRY)) {
    const env = def.env || {}
    const capabilities = { ...CAPABILITY_DEFAULTS, ...(def.capabilities || {}) }

    out[id] = {
      name: def.name,
      d1Binding: def.d1Binding || '',
      capabilities,

      // Missing means Google sign-in cannot work for this game,
      // and there is nothing to fall back to. Everything else in
      // `keys` below is optional: an Android client id is only
      // needed by a game that ships an APK, and a deep-link
      // scheme resolves from the panel or from `fallback`.
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


// ==========================================
// getGamesConfig
// Returns the games map keyed by id, with secrets resolved from env.
//
// Frozen, and deliberately so: this is the code-defined truth
// about which games exist. Database overrides are applied by
// games/registry.js, which copies rather than mutates - so the
// worst a bad row can do is change how a game is described,
// never which games there are.
// ==========================================
export function getGamesConfig(env) {
  const games = {}
  for (const [id, def] of Object.entries(GAME_REGISTRY)) {
    games[id] = buildGame(id, def, env || {})
  }
  return deepFreeze(games)
}


// ==========================================
// getGameProduct
// One product from a game's code catalogue, or null.
//
// Every purchase path goes through this. A product id that
// arrives in a request body is never trusted to name anything
// - if it is not in the catalogue above, there is nothing to
// sell and no price to charge.
// ==========================================
export function getGameProduct(game, productId) {
  const products = (game && game.store && game.store.products) || []
  return products.find(product => product.id === productId) || null
}
