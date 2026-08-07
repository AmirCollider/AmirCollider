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
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',

    // Every page here is server-rendered with its stylesheet and
    // its runtime inline, so 'unsafe-inline' is not a concession -
    // it is the architecture. What the policy is actually for is
    // the rest: no plugins, no framing, no <base> rewrite, forms
    // that can only post back here, and exactly one third-party
    // frame host (the YouTube embeds a game landing page builds
    // itself). Anything an injection would want to reach - an
    // exfiltration endpoint, a remote script - is not on the list.
    'Content-Security-Policy': [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "img-src 'self' data: https:",
      "media-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "script-src 'self' 'unsafe-inline'",
      "connect-src 'self'",
      'frame-src https://www.youtube.com https://www.youtube-nocookie.com',
      'upgrade-insecure-requests'
    ].join('; ')
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
  VERSION: '6.8.0',

  // A constant rather than url.origin: a handful of places have to
  // produce an absolute address (a licence refusal, canonical and
  // OpenGraph tags), and the request origin is whatever host the
  // caller used - a preview deployment would bake in the wrong one.
  //
  // This is the public domain, NOT the workers.dev hostname the
  // Worker also answers on. Both serve the same bytes, so pointing
  // canonical tags at workers.dev told search engines the real site
  // was the duplicate - the one thing guaranteed to keep
  // amircollider.com out of the results it should own.
  SITE_URL: 'https://amircollider.com',

  // The hostnames that are not the canonical one. A request that
  // arrives on any of them is redirected to SITE_URL, so a link
  // shared from a workers.dev preview still lands on the real site
  // and one page never accumulates two addresses.
  ALT_HOSTS: [
    'amircollider.n95pluss.workers.dev',
    'www.amircollider.com'
  ],

  // What the site says about itself when something else is doing
  // the describing: the landing page's meta description, the
  // OpenGraph card, the search result. Written once, per language,
  // because a page with no description gets one invented for it.
  SITE_TAGLINE: {
    fa: 'AmirCollider — سازنده‌ی بازی‌های اندروید، کامپیوتر و تحت‌وب مثل Neon Katana، و افزونه‌های یونیتی مثل Unity DocSnap و Unity DirectTMP.',
    en: 'AmirCollider — games for Android, PC and the web such as Neon Katana, and Unity editor extensions such as Unity DocSnap and Unity DirectTMP.',
    ja: 'AmirCollider — Neon Katana などの Android・PC・ウェブ向けゲームと、Unity DocSnap・Unity DirectTMP などの Unity エディタ拡張。'
  },

  // Unity DocSnap - the paid Unity editor extension. Sold through
  // this Worker's own crypto checkout (see Docs/Checkout.md).
  // Tier names must match DocSnapEditionMatrix in the Unity package,
  // which is what a licence token carries.
  //
  // VERSION is the number the product page, the tools catalogue and
  // the SoftwareApplication structured data all print. It is the
  // `version` field of the package's own package.json - the one
  // Unity's Package Manager shows - and it is copied here rather
  // than fetched, because a page that renders from a GitHub call is
  // a page that renders wrong the first time GitHub is slow.
  // Whoever tags a release updates this line in the same commit:
  //   https://github.com/AmirCollider/UnityDocSnap/blob/main/package.json
  DOCSNAP: {
    REPO_URL: 'https://github.com/AmirCollider/UnityDocSnap',
    VERSION: '1.0.2',
    TIERS: {
      plus: { name: 'Plus', price: '19.99', buyUrl: '/checkout?tier=plus' },
      pro: { name: 'Pro', price: '49.99', buyUrl: '/checkout?tier=pro' }
    }
  },

  // Unity DirectTMP - free and MIT, so no checkout and no tiers.
  // VERSION must match the package's package.json and
  // DirectTMPConstants.Version:
  //   https://github.com/AmirCollider/UnityDirectTMP/blob/main/package.json
  DIRECTTMP: {
    REPO_URL: 'https://github.com/AmirCollider/UnityDirectTMP',
    VERSION: '1.2.2',
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

  // Where else this person and this project exist, in the exact
  // form each platform publishes.
  //
  // These are the `sameAs` list a search engine reads to decide
  // that the GitHub account, the Instagram account and this domain
  // are one entity rather than three - which is the difference
  // between a brand it recognises and a string it has seen before.
  // Nothing is listed here on the strength of a guessed URL: an
  // account that turns out to belong to somebody else is a claim
  // about a stranger.
  // Order matters: it is the order the footer and the About page
  // render these in, and `sameAs` is read top-down.
  SOCIAL: {
    github: 'https://github.com/AmirCollider',
    youtube: 'https://www.youtube.com/@amircollider',
    instagram: 'https://www.instagram.com/amir.collider/',
    x: 'https://x.com/AmirCollider'
  },

  // Donations. A separate shop again, and for the same reason the
  // game store is separate from the licence checkout: nothing is
  // delivered, so none of the fulfilment machinery applies. What is
  // shared is the payment provider.
  //
  // The bounds are the provider's practical floor and a ceiling
  // that exists only to keep a typo out of an invoice. A donation
  // is not a product, so there is no catalogue and no price - the
  // amount is whatever the person typed, validated against these.
  DONATE: {
    MIN_USD: 1,
    MAX_USD: 5000,
    // What the amount buttons offer before anybody types. Round
    // numbers a person recognises, not a pricing ladder.
    PRESETS_USD: [3, 5, 10, 25],
    DEFAULT_USD: 5,
    // Donations one IP may open per hour. Lower than either shop's:
    // there is no delivery to chase, so the only thing a loop here
    // can produce is noise in the provider's dashboard.
    RATE_LIMIT: 8,
    RATE_WINDOW_MS: 60 * 60 * 1000,
    // How long a donor's note may be. It travels to the provider as
    // the invoice description and comes back in their dashboard.
    MAX_NOTE: 140
  },

  STATE_EXPIRY_MS: 30 * 60 * 1000,
  REDIRECT_TIMEOUT_MS: 1000,
  PING_TIMEOUT_MS: 5000,
  TOKEN_MAX_AGE_MS: 60 * 60 * 1000,
  SESSION_MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000,
  AUTO_COPY_CODE: true,
  SUPPORT_EMAIL: 'amiru.koraida@gmail.com',
  AMIR_LOGO: '/assets/AmirColliderLogo.png',
  DEFAULT_GAME_LOGO: '/assets/DefaultGameLogo.png',

  // ==========================================
  // The icon's backdrop.
  //
  // Google draws a favicon inside a circle in its results, and so
  // do a share sheet, an Android launcher and a bookmark bar. The
  // logo is a square with its own background painted to its own
  // edges, so dropping it into that circle showed a square floating
  // inside a ring - two shapes disagreeing, with the corners cut
  // off for good measure.
  //
  // Pages/Icon.js fixes that by painting this colour across the
  // whole icon canvas FIRST and then placing the artwork inside the
  // middle 70%. The circle then crops nothing but this colour, and
  // what comes back is a solid round mark with the logo centred in
  // it.
  //
  // Set it to the logo's own background colour. Whatever colour
  // the PNG paints its corners is the value that makes the seam
  // between artwork and backdrop invisible; anything else leaves a
  // faint square edge visible inside the circle.
  ICON_BG: '#0b0e16'
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
      },

      // A paragraph, not a tagline, and it lives in CODE rather than
      // in the panel's landing-page blob on purpose.
      //
      // Google's OAuth verification reads the address configured as
      // the app's home page - which for a game is /{gameId} - and
      // asks two questions of it: does this page name the same
      // application as the consent screen, and does it say what that
      // application is FOR. A one-line tagline answers neither, and
      // an empty database row answers nothing at all: the review
      // that prompted this came back with exactly those two
      // objections against a page whose every word was a database
      // override that had not been filled in.
      //
      // So this is the one piece of a landing page an operator
      // cannot empty. Write it as prose a stranger could read: what
      // the game is, and - because this is the sentence a reviewer
      // is actually looking for - what a Google account is used for
      // in it.
      purpose: {
        fa: 'Neon Katana یک بازی اکشن تک‌نفره برای اندروید است که در آن با یک کاتانا در محیط‌های نئونی مبارزه می‌کنی. خود بازی بدون اینترنت اجرا می‌شود. ورود با حساب گوگل اختیاری است و فقط برای همگام‌سازی ذخیره‌ی ابری، ثبت امتیاز در جدول امتیازات عمومی و برگرداندن خریدهای درون‌برنامه‌ای روی دستگاه بعدی استفاده می‌شود.',
        en: 'Neon Katana is a single-player action game for Android in which you fight through neon environments with a katana. The game itself runs without an internet connection. Signing in with a Google account is optional, and is used only to sync your cloud save, place your score on the public leaderboard, and restore your in-app purchases on your next device.',
        ja: 'Neon Katana は、カタナでネオンの世界を戦い抜く Android 向けシングルプレイ・アクションゲームです。ゲーム本体はインターネット接続なしで動作します。Google アカウントでのサインインは任意で、クラウドセーブの同期、公開ランキングへのスコア登録、次の端末でのアプリ内購入の復元にのみ使用します。'
      }
    },
    tags: [
      { fa: 'اکشن', en: 'Action', ja: 'アクション' },
      { fa: 'اندروید', en: 'Android', ja: 'Android' }
    ],
    // The landing page's baseline content.
    //
    // Every one of these fields is overridable from the /thegod
    // panel and none of them has to be here - which is exactly
    // why they were not, and why the page said almost nothing for
    // as long as nobody filled the panel in. A tagline, four
    // features, the devices it runs on and five questions is the
    // least a page has to carry before a reader, a crawler or an
    // assistant reading the site can tell that a game exists.
    //
    // Write only what is true of the shipped build. This is the
    // text a store listing and a search result are quoted from,
    // and the panel can correct it without a deploy - but it
    // cannot un-publish a claim that was never accurate.
    landing: {
      tagline: {
        fa: 'یک کاتانا، مسیری از دشمن‌های نئونی، و هر بار یک تلاش دیگر برای رفتن جلوتر.',
        en: 'One katana, a corridor of neon enemies, and one more run to get further than the last.',
        ja: '一振りのカタナ、ネオンの敵が並ぶ道、そして前回より先へ進むためのもう一度の挑戦。'
      },
      about: {
        fa: 'Neon Katana یک بازی اکشن تک‌نفره برای اندروید است. با یک کاتانا مسیرت را باز می‌کنی، هر ضربه را به‌موقع می‌زنی، و هر بار که می‌بازی از اول شروع می‌کنی تا از دفعه‌ی قبل جلوتر بروی.\n\nبازی کاملاً آفلاین اجرا می‌شود؛ برای شروع لازم نیست حسابی بسازی یا وارد شوی. اگر با گوگل وارد شوی، پیشرفتت روی سرور ذخیره می‌شود، امتیازت به جدول عمومی می‌رود و خریدهایت روی دستگاه بعدی برمی‌گردند.',
        en: 'Neon Katana is a single-player action game for Android. You cut your way forward with a katana, time every strike, and start over each time you fall — to get further than the run before.\n\nIt plays entirely offline; you do not need an account to start. Sign in with Google and your progress is kept on the server, your score joins the public leaderboard, and your purchases follow you to your next device.',
        ja: 'Neon Katana は Android 向けのシングルプレイ・アクションゲームです。カタナで道を切り開き、一撃ごとにタイミングを合わせ、倒れるたびに最初から——前回より先へ進むために。\n\nゲームは完全にオフラインで動作し、始めるのにアカウントは不要です。Google でサインインすれば、進行状況はサーバーに保存され、スコアは公開ランキングに載り、購入内容は次の端末にも引き継がれます。'
      },
      features: [
        {
          icon: '⚔️',
          fa: 'مبارزه‌ی نزدیک با یک کاتانا — ضربه، دفع و جاخالی، همه با یک انگشت.',
          en: 'Close-quarters katana combat — strike, parry and dodge, all with one thumb.',
          ja: 'カタナによる近接戦闘 — 斬る・受ける・かわす、すべて指一本で。'
        },
        {
          icon: '📴',
          fa: 'بدون نیاز به اینترنت. بازی کامل آفلاین اجرا می‌شود.',
          en: 'No connection needed. The whole game runs offline.',
          ja: '通信不要。ゲーム全体がオフラインで動作します。'
        },
        {
          icon: '☁️',
          fa: 'ذخیره‌ی ابری اختیاری — با ورود به حساب گوگل، روی گوشی بعدی از همان‌جا ادامه بده.',
          en: 'Optional cloud save — sign in with Google and carry on from the same place on your next phone.',
          ja: '任意のクラウドセーブ — Google でサインインすれば、次の端末でも同じ場所から続けられます。'
        },
        {
          icon: '🏆',
          fa: 'جدول امتیازات عمومی، با حذف خودکار حساب‌های مسدودشده.',
          en: 'A public leaderboard, with banned accounts filtered out automatically.',
          ja: '公開ランキング。BAN されたアカウントは自動的に除外されます。'
        }
      ],
      devices: [
        { kind: 'android', label: 'Android 8.0+' }
      ],
      faq: [
        {
          q: {
            fa: 'بازی رایگان است؟',
            en: 'Is the game free?',
            ja: 'ゲームは無料ですか?'
          },
          a: {
            fa: 'بله. دانلود و بازی کردنش رایگان است. یک فروشگاه درون‌بازی هم هست که خرید از آن کاملاً اختیاری است.',
            en: 'Yes. It is free to download and play. There is an in-game store as well, and buying anything from it is entirely optional.',
            ja: 'はい。ダウンロードもプレイも無料です。ゲーム内ストアもありますが、購入は完全に任意です。'
          }
        },
        {
          q: {
            fa: 'برای بازی کردن باید وارد حساب شوم؟',
            en: 'Do I need an account to play?',
            ja: 'プレイするのにアカウントは必要ですか?'
          },
          a: {
            fa: 'نه. بازی بدون ورود کامل کار می‌کند. ورود با گوگل فقط برای ذخیره‌ی ابری، جدول امتیازات و برگرداندن خریدها لازم است.',
            en: 'No. The game works fully without signing in. Google sign-in is only needed for cloud saves, the leaderboard and restoring purchases.',
            ja: 'いいえ。サインインしなくてもすべて遊べます。Google サインインが必要なのは、クラウドセーブ・ランキング・購入の復元のときだけです。'
          }
        },
        {
          q: {
            fa: 'اینترنت لازم دارد؟',
            en: 'Does it need an internet connection?',
            ja: 'インターネット接続は必要ですか?'
          },
          a: {
            fa: 'برای بازی کردن نه. فقط همگام‌سازی ذخیره‌ی ابری، ثبت امتیاز و خرید به اینترنت نیاز دارند.',
            en: 'Not to play. Only syncing a cloud save, submitting a score and making a purchase need one.',
            ja: 'プレイには不要です。クラウドセーブの同期、スコア送信、購入のときだけ必要になります。'
          }
        },
        {
          q: {
            fa: 'از کجا دانلودش کنم؟',
            en: 'Where do I download it?',
            ja: 'どこでダウンロードできますか?'
          },
          a: {
            fa: 'از مایکت. لینکش بالای همین صفحه است و همیشه به آخرین نسخه اشاره می‌کند.',
            en: 'From Myket. The link is at the top of this page and always points at the current build.',
            ja: 'Myket からです。リンクはこのページの上部にあり、常に最新のビルドを指しています。'
          }
        },
        {
          q: {
            fa: 'چطور حسابم و داده‌هایم را پاک کنم؟',
            en: 'How do I delete my account and my data?',
            ja: 'アカウントとデータはどう削除しますか?'
          },
          a: {
            fa: 'از صفحه‌ی حساب بازیکن روی همین سایت. دسترسی این برنامه به حساب گوگلت را هم می‌توانی از myaccount.google.com/permissions پس بگیری.',
            en: 'From the player account page on this site. You can also withdraw this app’s access to your Google account at myaccount.google.com/permissions.',
            ja: 'このサイトのプレイヤーアカウントページから行えます。Google アカウントへのアクセスは myaccount.google.com/permissions でも取り消せます。'
          }
        }
      ]
    },

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

    // The baseline the landing page falls back to, field by field,
    // when the panel has not overridden it. Games/Registry.js does
    // the merging; this only has to be present so that a game with
    // no `landing` in its entry is an empty object rather than
    // undefined.
    landing: def.landing || {},
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
 * The Google client ids an id_token for THIS game may name in its
 * `aud` (or `azp`) claim.
 *
 * Both clients, because the two platforms differ: a browser gets a
 * token minted for the web client, and an Android build authorises
 * with its own client id even though the code is exchanged with the
 * web one. Anything else is a token issued to somebody else's
 * application, and Core/GoogleOAuth.js refuses it.
 *
 * Empty when a game has no OAuth configured, which is what makes
 * verification on such a game fail closed rather than open.
 */
export function getGameAudiences(game) {
  const oauth = (game && game.oauth) || {}
  return [oauth.web, oauth.android].filter(Boolean)
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
 *
 * STATE_SIGNING_SECRET is on the list, and it is the one entry
 * that is here for a reason other than "nothing works without it".
 * It signs OAuth state and player session cookies, and it used to
 * fall back to the Google client secret when unset. That fallback
 * was the bug: it made an OAuth credential double as an HMAC key,
 * so rotating one silently invalidated every session signed with
 * the other, and a leak of either compromised both. Requiring the
 * variable is what lets the fallback be gone.
 */
export function validateEnvironment(env) {
  const missing = []

  for (const game of Object.values(getGameEnvNames())) {
    for (const key of game.required) {
      if (!env || !env[key]) missing.push(key)
    }
  }

  // Only when something actually signs sessions. A deployment with
  // no login-capable game issues no cookies and no OAuth state, and
  // has nothing to sign them with either.
  const signsSessions = Object.values(getGameEnvNames()).some(game => game.capabilities.login)
  if (signsSessions && (!env || !env.STATE_SIGNING_SECRET)) {
    missing.push('STATE_SIGNING_SECRET')
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }

  return true
}
