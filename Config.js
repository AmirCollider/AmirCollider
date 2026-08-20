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

  // ==========================================
  // The name, in every form somebody actually types it.
  //
  // "AmirCollider" is one word in Latin script and always has
  // been. That is one of five or six strings a person looking for
  // this site will put in a search box, and a search engine does
  // NOT derive the others on its own:
  //
  //   • It will not split a compound word for you. "Amir Collider"
  //     and "AmirCollider" are two different queries, and roughly
  //     half the people who type the name type the spaced form.
  //   • It will not transliterate for you. A Persian reader types
  //     "امیر کلایدر" and a Japanese reader types "アミールコライダー",
  //     and a site whose every byte is Latin script matches
  //     neither - which is exactly the shape of "the site is
  //     trilingual and only ever found in English".
  //   • It will not spell-correct a brand it has not learned yet.
  //     Correction comes from having seen the correct form near
  //     the incorrect one enough times; on a brand-new domain it
  //     has seen neither.
  //
  // So the three lists below are the three different claims, and
  // they are deliberately kept apart because they are used in
  // different places and confusing them is how a site gets marked
  // as keyword-stuffing:
  //
  //   ALIASES        Genuine alternate names: the same name in
  //                  another script, or with the space, or in the
  //                  casing a URL bar produces. These are the ONLY
  //                  ones that go in `alternateName` in structured
  //                  data, because that field means "this thing is
  //                  also called this" and a misspelling is not
  //                  another name for something.
  //   MISSPELLINGS   What people get wrong. These appear as PROSE
  //                  on /about, in an answer that says out loud
  //                  which spellings are wrong and what the right
  //                  one is. That is a real answer to a real
  //                  question, it is the form a search engine can
  //                  learn a correction from, and it is honest -
  //                  which the same list hidden in a meta tag or
  //                  claimed as an `alternateName` would not be.
  //   TOPICS         What this name is ABOUT, per language. Read
  //                  into `keywords` on the site-wide nodes so the
  //                  brand is attached to a subject rather than
  //                  floating as a string.
  //
  // Everything that renders any of this reads it from here. There
  // is no second list anywhere.
  // ==========================================
  BRAND: {
    NAME: 'AmirCollider',

    // The one form of the name per script, for the places that
    // SHOW it rather than declare it. The footer prints these on
    // every page, which is the whole point: a name that appears in
    // three scripts on 60 pages is a name a crawler has three
    // spellings for, and it is also the spelling a Persian or
    // Japanese reader was looking for. Printing all of ALIASES
    // there would be a footer that reads as keyword stuffing,
    // which is the same signal pointed the wrong way.
    SCRIPTS: {
      en: 'Amir Collider',

      // "امیر کلایدر" - kolayder, not koolayder. The owner's own
      // pronunciation, and the correction that reversed a whole
      // block of this file: an earlier pass here had "امیرکولایدر"
      // as the primary Persian spelling and the CORRECT form sitting
      // in MISSPELLINGS below. Persian transliterates the physics
      // term "collider" as کولایدر, which is what made the wrong
      // guess look reasonable - but this is a personal handle, not
      // the physics term, and the person it belongs to says it
      // کلایدر.
      fa: 'امیر کلایدر',
      ja: 'アミールコライダー'
    },

    // Every entry here has to be a name somebody would genuinely
    // call this, because these are what `alternateName` declares -
    // and Google's structured-data policy is that markup must not
    // be misleading. Three kinds of thing were removed after a
    // second pass:
    //
    //   'amircollider' / 'AMIRCOLLIDER'  Casing. Search is
    //     case-insensitive; declaring these adds nothing and pads
    //     the list, which is the shape of a spam signal.
    //   'Amir-Collider'  Nobody writes it hyphenated.
    //   'AmirCollider Studio'  Invented. No listing, no profile and
    //     no page anywhere uses it, so declaring it is a claim
    //     about an entity that does not exist.
    //
    // What is left is the spaced form, the Persian spelling, the
    // Japanese spelling, and the one name that IS used elsewhere.
    // The Arabic-keyboard forms are derived, not listed - see
    // arabicKeyboardVariants() in Core/Seo.js.
    ALIASES: [
      'Amir Collider',
      'AmirCollider Games',

      // Persian. The spaced form is how it is said and how the
      // owner writes it; the running-on form mirrors the compound
      // Latin spelling. Both are correct and people type both.
      //
      // The separator variants (ZWNJ) and the Arabic-codepoint
      // variants of each are DERIVED, not listed - see
      // persianSpellingVariants() in Core/Seo.js. Listing six
      // near-identical Persian strings here would be unreadable
      // and would go stale the first time one was edited.
      'امیر کلایدر',
      'امیرکلایدر',

      // Japanese katakana, both without and with the middle dot.
      // A Japanese reader writes a two-part foreign name either
      // way and searches for it either way.
      'アミールコライダー',
      'アミール・コライダー'
    ],

    // The three that are actually PUBLISHED, in the answer on
    // /about. Named rather than taken by index out of the list
    // below - which is how the previous version did it, and which
    // broke silently the moment that list was reordered: the
    // answer says "one L dropped" and then printed whatever
    // happened to be at index 0, which after a reorder was a
    // Persian spelling.
    //
    // One Latin mistake of each common kind, and the one Persian
    // mistake that matters. Every entry here must also appear in
    // MISSPELLINGS; Scripts/CheckBrandCoverage.mjs asserts that.
    TYPOS_SHOWN: {
      droppedL: 'Amir Colider',
      swappedVowel: 'Amir Collidor',
      persian: 'امیر کولایدر'
    },

    // ==========================================
    // What people get wrong.
    //
    // Ordered by how often each plausibly turns up. Three of these
    // are worth understanding rather than just reading:
    //
    //   کولایدر  The Persian transliteration of the PHYSICS term
    //     "collider" - as in the Large Hadron Collider, which is
    //     برخورد‌دهنده‌ی هادرونی بزرگ but is written کولایدر
    //     everywhere informal. Anyone who knows the word and does
    //     not know the person will reach for it. It is the single
    //     most likely Persian mistake, and an earlier pass over
    //     this file had it as the CORRECT spelling.
    //
    //   Kollider / Kolider  German and Scandinavian readers spell
    //     the /k/ sound with a K, and so does anyone transcribing
    //     the Persian back into Latin.
    //
    //   Colider / Collidor  One L dropped, or the unstressed final
    //     vowel heard as an o. Between them these are most of the
    //     Latin-script mistakes there are.
    //
    // Only three of these are ever PUBLISHED - see fillBrand() in
    // Content/AboutMe.js. The rest are a reference list for
    // whoever maintains this and for Scripts/CheckBrandCoverage.mjs,
    // which tests that each one still reaches the site.
    // ==========================================
    MISSPELLINGS: [
      // Persian: the physics-term transliteration, and the
      // dropped-diphthong forms.
      'امیر کولایدر',
      'امیرکولایدر',
      'امیر کولیدر',
      'امیرکولیدر',
      'امیر کلیدر',
      'امیرکلیدر',
      'امیر کالایدر',

      // Latin.
      'Amir Colider',
      'AmirColider',
      'Amir Collidor',
      'AmirCollidor',
      'Amir Collader',
      'Amir Collyder',
      'AmirColliderr',
      'Amir Kollider',
      'AmirKollider',
      'Amir Kolider',
      'Amir Collide',
      'AmirCollier',

      // Japanese: the short first vowel, and the dropped final
      // long mark.
      'アミルコライダー',
      'アミールコライダ',
      'アミールコリダー'
    ],

    TOPICS: {
      fa: [
        'بازی‌سازی مستقل',
        'بازی اندروید',
        'یونیتی',
        'افزونه یونیتی',
        'بازی رایگان اندروید',
        'ساخت بازی'
      ],
      en: [
        'indie game developer',
        'Android games',
        'Unity',
        'Unity editor extensions',
        'free Android games',
        'game development'
      ],
      ja: [
        'インディーゲーム開発',
        'Android ゲーム',
        'Unity',
        'Unity エディタ拡張',
        '無料 Android ゲーム',
        'ゲーム開発'
      ]
    }
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

    // The address pasted into Package Manager ▸ Add package from git
    // URL. It is the repository URL with `.git` on the end, and it
    // is NOT interchangeable with REPO_URL: pasting the browser URL
    // into that dialog fails with an unhelpful error, which is why
    // the product page has to print this exact string rather than
    // link to the repository and let somebody work it out.
    GIT_URL: 'https://github.com/AmirCollider/UnityDocSnap.git',

    VERSION: '1.0.3',
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
    VERSION: '2.1.13',
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
  SUPPORT_EMAIL: 'amircollider@yahoo.com',
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
  ICON_BG: '#f4c21e',

  // ==========================================
  // What the sitemap reports as each page's last change.
  //
  // It used to be `new Date()` - today, on every one of the 48
  // URLs, every time the file was fetched. That is not a small
  // inaccuracy: `lastmod` is a hint a crawler decides whether to
  // TRUST, and a sitemap claiming the privacy policy changed
  // today, and again tomorrow, and again the day after, is a
  // sitemap whose dates get ignored - including on the pages where
  // the date was real and would have earned a recrawl.
  //
  // A constant is honest by comparison: it says "this site last
  // changed when it was last deployed", which is true of a Worker
  // that renders every page from code. Update it in the commit
  // that changes something a reader would notice. A date in the
  // past is fine; a date in the future is not, and Google drops
  // the whole tag when it sees one.
  // ==========================================
  SITEMAP_LASTMOD: '2026-08-20'
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

    // ==========================================
    // The game's name in the scripts people search it in.
    //
    // Same problem as CONFIG.BRAND, one level down: a Persian
    // player types "نئون کاتانا" and a Japanese one types
    // "ネオンカタナ", and a page whose only spelling of the name is
    // "Neon Katana" is a page neither query reaches. The Latin
    // name is still THE name - it is what the store listing, the
    // APK and the OAuth consent screen say, and none of those may
    // drift - so these are alternates and never a replacement.
    //
    // Read into `alternateName` on the VideoGame node and into the
    // page's keywords. Nothing renders them as a heading, because
    // the name a page shows has to be the one the store shows.
    // A game with no `altNames` behaves exactly as before.
    // ==========================================
    altNames: ['نئون کاتانا', 'ネオンカタナ', 'NeonKatana', 'Neon-Katana'],

    i18n: {
      // The one-line description on the dashboard card. The game's
      // OWN page no longer reads this: its tagline and its long
      // description are written in the panel. This stays because the
      // card, the games index and the sitemap all need a sentence
      // about a game without loading its settings row.
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

    // ==========================================
    // The card's own motifs.
    //
    // A few of the game's own objects, drifting and breathing
    // behind the card on the dashboard. Neon Katana is a game
    // about cutting things out of the air, so the things it cuts
    // are what belong there.
    //
    // Deliberately small: four glyphs at low opacity behind the
    // content, never in front of it and never in the way of a
    // button. The card is a place somebody decides whether to
    // install a game, and a card that is busier than the game is
    // a card that is harder to read.
    //
    // Emoji rather than art, and here rather than in
    // Pages/GameCards.js, for the same reason `icon` is: it is a
    // fact about the game, and a second game should be able to
    // have its own without anybody editing a view. A game with no
    // `card` entry renders exactly as every card did before this
    // existed - Pages/GameCards.js draws nothing at all rather
    // than inventing a default, because a wrong motif is worse
    // than none.
    card: {
      motifs: ['🍎', '🍑', '🍉', '⚔️']
    },
    // ==========================================
    // No landing baseline.
    //
    // Every section of this game's page - the banner, the tagline,
    // the long description, the features, the screenshots, the
    // videos, the devices and the FAQ - is written in the /thegod
    // panel and stored in game_settings. There is deliberately
    // nothing here for it to fall back to.
    //
    // That is a decision about THIS game, not a rule. A `landing`
    // block is still supported and Games/Registry.js still merges
    // it field by field, so a new game can ship with a page that
    // says something before anybody opens the panel. It was here
    // for the same reason and has been removed now that the panel
    // holds the real copy: two sources for one paragraph is one
    // source too many, and the code half was the half nobody
    // could see they were editing.
    //
    // A section with nothing in the panel now renders as nothing
    // at all, which is what Pages/GameLanding.js has always done
    // with an empty field.

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
      // Matches game_settings.deeplink_scheme and the intent-filter
      // in the shipped APK's AndroidManifest.xml. The three have to
      // agree: if the database row is ever cleared the resolution
      // falls through to this line, and a scheme that does not match
      // the manifest is a sign-in that ends on a blank browser tab
      // with no error anywhere.
      deepLinkScheme: 'com.amircollider.neonkatana'
    }
  },

  'chronoblades': {
    name: 'Chrono Blades',
    icon: '🗡️',
    color: '#20fea9',
    logo: 'https://dl.amircollider.com/ChronoBladesLogo.png',
    description: 'Knife throwing at the target',

    // See the note on Neon Katana's altNames above.
    altNames: ['کرونو بلیدز', 'クロノブレイズ', 'ChronoBlades', 'Chrono-Blades'],

    i18n: {
      description: {
        fa: 'پرتاب چاقو به هدف',
        en: 'Knife throwing at the target',
        ja: '標的へのナイフ投げ'
      }
    },
    tags: [
      { fa: 'بازی', en: 'Game', ja: 'ゲーム' },
      { fa: 'اندروید', en: 'Android', ja: 'Android' }
    ],

    // The things this game throws, drifting behind its card on
    // the dashboard. Same rule as Neon Katana's: the game's own
    // objects, four of them, decorative and aria-hidden.
    card: {
      motifs: ['🎯', '🔪', '🗡️', '🍎']
    },

    // ==========================================
    // What its leaderboard is made of.
    //
    // Most games' boards are a name and a number, and this one is
    // not: Chrono Blades generates its stages one after another
    // with no end, so how far somebody got is a second record
    // that a score alone does not imply - two players tied on
    // points can be a hundred stages apart. And the knife in
    // their hand is the thing they actually bought, so a board
    // that leaves it out is a board that never shows anybody what
    // the store is for.
    //
    // Declared HERE rather than in Pages/Leaderboard.js for the
    // reason `icon` and `card.motifs` are: it is a fact about the
    // game. The page renders what a game declares and nothing
    // else, so Neon Katana's board is untouched by every line
    // below.
    //
    // Both halves are independent and both degrade. `level` needs
    // a high_level column in this game's own D1 and `item` needs
    // selected_item; a database missing either simply drops that
    // half of the row, exactly as a database missing
    // leaderboard_opt_out drops the opt-out.
    // ==========================================
    leaderboard: {
      // The second number, beside the score.
      level: {
        icon: '🎯',
        i18n: { fa: 'مرحله', en: 'Level', ja: 'ステージ' }
      },

      // The knife the player currently has equipped, drawn from
      // the `selected_item` column. The keys ARE the product ids
      // in store.products below - plus the free one, which is not
      // a product because nobody buys it - so what somebody paid
      // for and what the board draws can never be two different
      // strings.
      //
      // `default` is what a player who has never chosen holds:
      // the free knife. Stored as NULL rather than backfilled, so
      // renaming the free knife is one line here and no migration.
      item: {
        default: 'RegularKnife',
        // Turned off wholesale by a reader who asked not to be
        // animated - Pages/Leaderboard.js wraps the spin in
        // prefers-reduced-motion either way. This switch is for
        // the game to say "my item art does not read well
        // rotating", which is a different decision.
        spin: true,
        options: {
          RegularKnife: {
            image: 'https://dl.amircollider.com/ChronoBlades/RegularKnife.png',
            i18n: { fa: 'چاقوی معمولی', en: 'Regular Knife', ja: 'ノーマルナイフ' }
          },
          SilverKnife: {
            image: 'https://dl.amircollider.com/ChronoBlades/SilverKnife.png',
            i18n: { fa: 'چاقوی نقره‌ای', en: 'Silver Knife', ja: 'シルバーナイフ' }
          },
          GoldenKnife: {
            image: 'https://dl.amircollider.com/ChronoBlades/GoldenKnife.png',
            i18n: { fa: 'چاقوی طلایی', en: 'Golden Knife', ja: 'ゴールデンナイフ' }
          }
        }
      }
    },

    // ==========================================
    // A landing page that says something on day one.
    //
    // Neon Katana deliberately has no baseline here - its copy is
    // all in the panel - and this is the other case CLAUDE.md
    // describes: a brand new game whose page would otherwise be a
    // logo, one line and a download button until somebody opens
    // /thegod. Every field below is overridden per field by the
    // panel the moment anything is typed there, so this is a
    // starting point and not a second place to maintain the copy.
    // ==========================================
    landing: {
      tagline: {
        fa: 'یک چاقو، یک هدف در حال چرخش، و مرحله‌ای که هیچ‌وقت تمام نمی‌شود.',
        en: 'One knife, one spinning target, and a stage that never ends.',
        ja: '一本のナイフ、回る標的、そして終わらないステージ。'
      },
      about: {
        fa: 'چاقو را پرتاب کن، به هدفِ در حال چرخش بزن، و برو مرحله‌ی بعد. '
          + 'مرحله‌ها از پیش ساخته نشده‌اند — یکی پس از دیگری تولید می‌شوند، '
          + 'پس پایانی وجود ندارد و تنها چیزی که می‌ماند این است که تا کجا رفته‌ای. '
          + 'امتیاز و مرحله هر دو روی جدول امتیازات ثبت می‌شوند، همراه با چاقویی که در دست داری.',
        en: 'Throw the knife, hit the spinning target, move to the next stage. '
          + 'The stages are not authored — they are generated one after another, '
          + 'so there is no ending and the only thing left is how far you got. '
          + 'Both your score and your stage are recorded on the leaderboard, '
          + 'along with the knife you are holding.',
        ja: 'ナイフを投げ、回転する標的に当て、次のステージへ。'
          + 'ステージは作り置きではなく次々と生成されるため終わりはなく、'
          + '残るのはどこまで進んだかだけです。'
          + 'スコアとステージは、手にしているナイフとともにリーダーボードに記録されます。'
      },
      features: [
        { icon: '♾️', fa: 'مرحله‌های بی‌پایان و تولیدشده', en: 'Endless, generated stages', ja: '終わりのない生成ステージ' },
        { icon: '🏆', fa: 'جدول امتیازات با امتیاز و مرحله', en: 'A board that ranks score and stage', ja: 'スコアとステージのランキング' },
        { icon: '🗡️', fa: 'سه چاقو — یکی رایگان، دوتا خریدنی', en: 'Three knives — one free, two for sale', ja: '3本のナイフ — 1本は無料、2本は有料' },
        { icon: '☁️', fa: 'ذخیره‌ی ابری با ورود گوگل', en: 'Cloud save with Google sign-in', ja: 'Google サインインでクラウドセーブ' }
      ],
      devices: [
        { kind: 'android', label: 'Android 8+' }
      ],
      faq: [
        {
          q: {
            fa: 'مرحله‌ها تمام می‌شوند؟',
            en: 'Do the stages ever end?',
            ja: 'ステージに終わりはありますか？'
          },
          a: {
            fa: 'نه. مرحله‌ها یکی پس از دیگری ساخته می‌شوند، پس بالاترین مرحله‌ی تو همان‌قدر رکورد است که بالاترین امتیازت.',
            en: 'No. They are generated one after another, so your highest stage is as much a record as your highest score.',
            ja: 'いいえ。次々と生成されるため、最高ステージは最高スコアと同じく記録です。'
          }
        },
        {
          q: {
            fa: 'چاقوهایی که می‌خرم چه فرقی دارند؟',
            en: 'What do the knives I buy change?',
            ja: '購入したナイフは何が変わりますか？'
          },
          a: {
            fa: 'ظاهر. چاقوی نقره‌ای و طلایی یک‌بار خریده می‌شوند و برای همیشه می‌مانند، و همانی هستند که کنار نام تو روی جدول امتیازات دیده می‌شود.',
            en: 'How it looks. The silver and golden knives are bought once and kept forever, and they are what appears beside your name on the leaderboard.',
            ja: '見た目です。シルバーとゴールドのナイフは一度の購入で永久に残り、リーダーボードで名前の横に表示されます。'
          }
        },
        {
          q: {
            fa: 'اگر بازی را پاک کنم امتیازم می‌رود؟',
            en: 'Do I lose my score if I uninstall?',
            ja: 'アンインストールするとスコアは消えますか？'
          },
          a: {
            fa: 'نه، اگر با گوگل وارد شده باشی. امتیاز، مرحله و چاقوهایت روی حساب تو ذخیره می‌شوند و با نصب دوباره برمی‌گردند.',
            en: 'Not if you signed in with Google. Your score, your stage and your knives are stored against your account and come back on reinstall.',
            ja: 'Google でサインインしていれば消えません。スコア・ステージ・ナイフはアカウントに保存され、再インストールで戻ります。'
          }
        }
      ]
    },

    package: 'com.amircollider.chronoblades',
    d1Binding: 'CHRONOBLADES_DB',
    deepLink: { host: 'oauth' },

    capabilities: {
      onlinePlay: false,
      login: true,
      cloudSave: true,
      leaderboard: true,
      store: true
    },

    download: {
      primary: 'apk',
      links: {
        apk: 'https://dl.amircollider.com/APK/ChronoBlades.apk'
      }
    },

    status: GAME_STATUS.LIVE,

    // Two knives, and the third is not here on purpose:
    // RegularKnife is free, everybody starts with it, and a
    // product nobody can buy has no business in a catalogue that
    // exists to be priced, ribboned and ordered. It is named in
    // `leaderboard.item.options` above, which is the only place
    // that has to know it exists.
    //
    // The ids ARE the strings the shipped build sends and the
    // entitlements API grants, so they are chosen once and never
    // renamed.
    store: {
      products: [
        {
          id: 'SilverKnife',
          sku: 'chronoblades_silver_knife',
          kind: PRODUCT_KIND.NONCONSUMABLE,
          priceUsd: '4.99',

          // The emoji is the fallback, not the picture. A store
          // selling three near-identical knives cannot tell them
          // apart with 🔪 and 🗡️ - the difference between them IS
          // the artwork, so the artwork is what the card shows.
          // The emoji stays for anywhere too small for an image
          // and for the moment before one loads.
          icon: '🔪',
          image: 'https://dl.amircollider.com/ChronoBlades/SilverKnife.png',
          grant: { type: 'cosmetic', code: 'SilverKnife' },
          i18n: {
            name: { fa: 'چاقوی نقره‌ای', en: 'Silver Knife', ja: 'シルバーナイフ' },
            description: {
              fa: 'تیغه‌ی نقره‌ای. یک‌بار خرید، برای همیشه — و کنار نام تو روی جدول امتیازات.',
              en: 'The silver blade. Bought once, kept forever — and shown beside your name on the board.',
              ja: 'シルバーの刃。一度購入すれば永久に — リーダーボードの名前の横にも表示されます。'
            }
          }
        },
        {
          id: 'GoldenKnife',
          sku: 'chronoblades_golden_knife',
          kind: PRODUCT_KIND.NONCONSUMABLE,
          priceUsd: '9.99',
          icon: '🗡️',
          image: 'https://dl.amircollider.com/ChronoBlades/GoldenKnife.png',
          badge: 'best',
          grant: { type: 'cosmetic', code: 'GoldenKnife' },
          i18n: {
            name: { fa: 'چاقوی طلایی', en: 'Golden Knife', ja: 'ゴールデンナイフ' },
            description: {
              fa: 'گران‌ترین چیزی که می‌شود پرتاب کرد. یک‌بار خرید، برای همیشه — و کنار نام تو روی جدول امتیازات.',
              en: 'The most expensive thing you can throw. Bought once, kept forever — and shown beside your name on the board.',
              ja: '投げられる中で最も高価な一本。一度購入すれば永久に — リーダーボードの名前の横にも表示されます。'
            }
          }
        }
      ]
    },

    env: {
      android: 'CHRONOBLADES_GOOGLE_CLIENT_ID_ANDROID',
      web: 'CHRONOBLADES_GOOGLE_CLIENT_ID_WEB',
      secret: 'CHRONOBLADES_GOOGLE_CLIENT_SECRET',
      deepLinkScheme: 'CHRONOBLADES_DEEPLINK_SCHEME'
    },
    fallback: {
      // Must match the intent-filter in the shipped APK's
      // AndroidManifest.xml exactly. Note that it is NOT the
      // Android package (which is the same string here only by
      // coincidence of naming) - the two are separate facts and
      // are allowed to diverge.
      deepLinkScheme: 'com.amircollider.chronoblades'
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


// ==========================================
// buildBoard
// What a game's leaderboard shows besides a name and a score.
//
// Normalised here rather than trusted as written, for the same
// reason `card.motifs` is: Pages/Leaderboard.js and
// Api/PlayerDataApi.js both read this on every board view, and a
// view that has to check whether a field is a string, an object
// or undefined is a view that eventually renders "[object
// Object]" on a public page.
//
// The result is always the same shape:
//
//   { level: { icon, i18n } | null,
//     item:  { default, spin, options: { key: { image, i18n } } } | null }
//
// null means "this game does not have one", and every reader
// treats that as the board it drew before any of this existed.
// An `item` whose options all lack an image is null too: an
// emblem column with nothing to draw is worse than no column,
// because it reserves the space.
// ==========================================
function trio(source, fallback = '') {
  const read = key => String((source && source[key]) || '').trim()
  const fa = read('fa') || fallback
  const en = read('en') || fallback
  return { fa, en: en, ja: read('ja') || en || fa }
}

function buildBoard(def) {
  const board = (def && def.leaderboard) || {}

  const level = board.level
    ? {
        icon: String(board.level.icon || '').trim(),
        i18n: trio(board.level.i18n, 'Level')
      }
    : null

  const rawItem = board.item || null
  const options = {}

  for (const [key, value] of Object.entries((rawItem && rawItem.options) || {})) {
    // Only https and site-local images. The registry is code
    // rather than operator input, so this is not a trust
    // boundary - it is the same check every other image URL on
    // this site passes, kept here so that a typo is a missing
    // picture instead of a javascript: URL in an <img src>.
    const image = String((value && value.image) || '').trim()
    if (!/^(https?:\/\/|\/)/i.test(image)) continue

    options[key] = { image, i18n: trio(value && value.i18n, key) }
  }

  const item = rawItem && Object.keys(options).length
    ? {
        // Only a default that is actually one of the options. A
        // default naming a key that was renamed is an empty slot
        // on every row belonging to a player who never chose.
        default: options[rawItem.default] ? String(rawItem.default) : '',
        spin: rawItem.spin !== false,
        options
      }
    : null

  return { level, item }
}


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

    // The same name in another script. Normalised to a list of
    // trimmed, non-empty strings so the structured data and the
    // keyword builder can both spread it without checking; a game
    // that declares none gets an empty array rather than
    // undefined, which is what lets `.length` be the only test
    // anywhere downstream.
    altNames: (def.altNames || [])
      .map(entry => String(entry || '').trim())
      .filter(Boolean),

    // The dashboard card's decorative motifs. Normalised to a
    // short array of single glyphs here rather than trusted as
    // written, so a view can render it without checking: at most
    // six, each trimmed, anything empty dropped.
    card: {
      motifs: (((def.card && def.card.motifs) || []))
        .map(motif => String(motif || '').trim())
        .filter(Boolean)
        .slice(0, 6)
    },

    package: def.package,
    myketUrl: def.myketUrl || links[download.primary] || '',
    d1Binding: def.d1Binding,

    status: GAME_STATUS.ALL.includes(def.status) ? def.status : GAME_STATUS.LIVE,
    capabilities: { ...CAPABILITY_DEFAULTS, ...(def.capabilities || {}) },

    // What this game's board shows beyond a name and a score.
    // Always present and always the same shape - see buildBoard.
    leaderboard: buildBoard(def),

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
