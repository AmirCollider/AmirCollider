// ==========================================
// games/scaffold.js
// The code a new game needs, written by the site.
//
// Public exports:
//   registryEntry(spec)   -> the GAME_REGISTRY entry, as JS source
//   productEntry(spec)    -> one store.products[] entry, as JS source
//   unityConstants(spec)  -> the C# constants file for the game
//   scaffold(spec)        -> all of the above plus the SQL and commands
//
// ------------------------------------------------------------
// WHY A GENERATOR AND NOT A FORM THAT WRITES A ROW
// ------------------------------------------------------------
// The panel can add a game. It adds it the only way a game can
// honestly be added: by producing the source for it and asking
// you to paste and deploy.
//
// That is not a limitation worked around - it is the property
// being protected. A game is a D1 binding, four Google secrets,
// a deep-link scheme, an Android package and a product
// catalogue that a shipped build already hard-codes. A row
// claiming to be a game would render a card on the dashboard
// and be unable to log a single player in, and the failure
// would surface as a support message rather than as a deploy
// that did not happen.
//
// So: anyone reading config.js learns exactly which games exist.
// That stays true after this panel has been used, which is the
// whole point of it working this way.
// ==========================================

import { namesFor, slug, gameSchemaSql, setupCommands, wranglerSnippet } from './sql.js'


// ==========================================
// js
// A JavaScript string literal for generated source.
//
// Single quotes, with the two characters that could end or
// continue the literal escaped. The values reaching this are
// game names and descriptions typed into a panel - including
// Persian and Japanese text, which is why the output is not
// ASCII-escaped: a config file full of ی is a config file
// nobody can proofread.
// ==========================================
function js(value) {
  return "'" + String(value === null || value === undefined ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r?\n/g, ' ')
    + "'"
}

function bool(value) {
  return value ? 'true' : 'false'
}


// ==========================================
// registryEntry
// One GAME_REGISTRY entry, formatted the way the file it is
// going into is formatted.
//
// Indented to sit inside the existing object, with the comment
// blocks the surrounding entries have. A generated entry that
// looks generated is an entry the next person deletes and
// rewrites; one that reads like the file it lives in is one
// they edit.
// ==========================================
export function registryEntry(spec) {
  const names = namesFor(spec.id)
  const pkg = spec.package || `com.AmirColliderGames.${names.pascal}`
  const scheme = spec.deepLinkScheme || pkg.toLowerCase()

  const tags = (spec.tags || []).length
    ? (spec.tags || []).map(tag =>
        `      { fa: ${js(tag.fa)}, en: ${js(tag.en)}, ja: ${js(tag.ja)} }`
      ).join(',\n')
    : `      { fa: 'بازی', en: 'Game', ja: 'ゲーム' }`

  const links = Object.entries(spec.downloadLinks || {})
    .filter(([, url]) => url)
    .map(([store, url]) => `        ${/^[a-z][a-z0-9]*$/i.test(store) ? store : js(store)}: ${js(url)}`)

  const products = (spec.products || []).length
    ? (spec.products || []).map(product => productEntry(product)).join(',\n')
    : `        // No products yet. Add one entry per thing a player can
        // buy; the id is what the shipped build and the
        // entitlements API both use, so it is chosen once.`

  return `  '${names.id}': {
    name: ${js(spec.name || names.pascal)},
    icon: ${js(spec.icon || '🎮')},
    color: ${js(spec.color || '#6c63ff')},
    logo: ${js(spec.logo || `/assets/${names.pascal}Logo.png`)},
    description: ${js(spec.descriptionEn || spec.name || names.pascal)},
    i18n: {
      description: {
        fa: ${js(spec.descriptionFa || '')},
        en: ${js(spec.descriptionEn || '')},
        ja: ${js(spec.descriptionJa || '')}
      }
    },
    tags: [
${tags}
    ],
    package: ${js(pkg)},
    myketUrl: ${js((spec.downloadLinks && spec.downloadLinks.myket) || '')},
    d1Binding: ${js(names.binding)},
    deepLink: { host: 'oauth' },

    // What this game asks the network for. The dashboard card is
    // built from this and nothing else, so a game that plays
    // offline stops advertising a ping test simply by saying so
    // here.
    capabilities: {
      onlinePlay: ${bool(spec.onlinePlay)},
      login: ${bool(spec.login !== false)},
      cloudSave: ${bool(spec.cloudSave !== false)},
      leaderboard: ${bool(spec.leaderboard !== false)},
      store: ${bool(spec.store !== false)}
    },

    download: {
      primary: ${js(spec.downloadPrimary || Object.keys(spec.downloadLinks || {})[0] || 'myket')},
      links: {
${links.length ? links.join(',\n') : "        // No download link yet — the button stays greyed out."}
      }
    },

    status: ${js(spec.status || 'live')},

    store: {
      products: [
${products}
      ]
    },

    env: {
      android: ${js(names.env.android)},
      web: ${js(names.env.web)},
      secret: ${js(names.env.secret)},
      deepLinkScheme: ${js(names.env.deepLinkScheme)}
    },
    fallback: {
      deepLinkScheme: ${js(scheme)}
    }
  }`
}


// ==========================================
// productEntry
// One catalogue product, as source.
//
// `grant` is passed through to the game untouched - nothing on
// this side interprets it - so the generated shape is a
// suggestion, and a game that wants something else can simply
// write something else.
// ==========================================
export function productEntry(spec) {
  const kind = ['consumable', 'nonconsumable', 'pass'].includes(spec.kind) ? spec.kind : 'nonconsumable'
  const grant = spec.grant && typeof spec.grant === 'object'
    ? JSON.stringify(spec.grant).replace(/"(\w+)":/g, '$1: ').replace(/"/g, "'")
    : kind === 'consumable'
      ? `{ type: 'currency', code: 'coins', amount: ${Number(spec.amount) || 100} }`
      : `{ type: 'flag', code: ${js(slug(spec.id) || 'item')} }`

  return `        {
          id: ${js(spec.id)},
          sku: ${js(spec.sku || String(spec.id || '').replace(/-/g, '_'))},
          kind: ${js(kind)},
          priceUsd: ${js(spec.priceUsd || '1.99')},
          icon: ${js(spec.icon || '✨')},${kind === 'pass' ? `\n          durationDays: ${Number(spec.durationDays) || 30},` : ''}
          grant: ${grant},
          i18n: {
            name: { fa: ${js(spec.nameFa)}, en: ${js(spec.nameEn)}, ja: ${js(spec.nameJa)} },
            description: {
              fa: ${js(spec.descFa)},
              en: ${js(spec.descEn)},
              ja: ${js(spec.descJa)}
            }
          }
        }`
}


// ==========================================
// unityConstants
// The C# file that stops a game hard-coding a URL.
//
// Every path in it comes from the same place the Worker's
// routing table does, so a build made from this cannot be
// pointing at an endpoint that was renamed - it can only be
// pointing at one that no longer exists, which fails loudly on
// the first call instead of quietly on the tenth.
// ==========================================
export function unityConstants(spec, origin) {
  const names = namesFor(spec.id)
  const base = String(origin || 'https://amircollider.com').replace(/\/+$/, '')
  const pkg = spec.package || `com.AmirColliderGames.${names.pascal}`
  const scheme = spec.deepLinkScheme || pkg.toLowerCase()

  return `// ==========================================
// ${names.pascal}Constants.cs
// Generated by the AmirCollider TheGod panel.
//
// Every address this game uses to reach its backend, in one
// place. Nothing else in the project should contain a literal
// URL: a path that appears twice is a path that will be updated
// once.
//
// Drop this in Assets/Scripts/AmirCollider/.
// ==========================================

namespace AmirCollider
{
    public static class ${names.pascal}Constants
    {
        // The Worker. No trailing slash — every path below starts
        // with one, and two slashes is a 404 that looks like a
        // server problem.
        public const string BaseUrl = "${base}";

        // The game id, as it appears in GAME_REGISTRY in the
        // Worker's config.js. It is part of nearly every path, so
        // a typo here fails everything at once rather than one
        // feature at a time — which is the better failure.
        public const string GameId = "${names.id}";

        public const string PackageName = "${pkg}";

        // The scheme Android hands the OAuth code back on. Must
        // match the intent-filter in this app's manifest and the
        // deep-link scheme the Worker resolves for this game -
        // the TheGod panel shows that value, and its Environment
        // tab says where it came from.
        public const string DeepLinkScheme = "${scheme}";
        public const string DeepLinkRedirect = "${scheme}://oauth";

        // ---- sign-in ----
        public const string OAuthStart    = BaseUrl + "/oauth/auth";
        public const string OAuthToken    = BaseUrl + "/oauth/token";
        public const string AuthRefresh   = BaseUrl + "/auth/refresh";
        public const string AuthValidate  = BaseUrl + "/auth/validate";
        public const string AuthCheck     = BaseUrl + "/auth/check";

        // ---- the player's own data ----
        public const string PlayerGet     = BaseUrl + "/database/get/games/" + GameId + "/users/";
        public const string PlayerSet     = BaseUrl + "/database/set/games/" + GameId + "/users/";
        public const string PlayerPatch   = BaseUrl + "/database/patch/games/" + GameId + "/users/";
        public const string Leaderboard   = BaseUrl + "/" + GameId + "/leaderboard";

        // ---- the store ----
        public const string Manifest      = BaseUrl + "/games/" + GameId + "/manifest";
        public const string Products      = BaseUrl + "/games/" + GameId + "/products";
        public const string Entitlements  = BaseUrl + "/games/" + GameId + "/entitlements";
        public const string Consume       = BaseUrl + "/games/" + GameId + "/entitlements/consume";

        // Opened in the device browser when a player buys on the
        // web instead of through the store.
        public const string WebStore      = BaseUrl + "/" + GameId + "/store";
        public const string WebAccount    = BaseUrl + "/" + GameId + "/account";

        // ---- product ids ----
        // These match store.products[].id in the Worker's config.
        // The Play Store sku is the other string on that entry and
        // is deliberately allowed to differ.
        public static class Products_
        {
${(spec.products || []).map(product =>
  `            public const string ${csharpName(product.id)} = "${product.id}";`
).join('\n') || '            // No products defined yet.'}
        }
    }
}
`
}


// A C# identifier from a product id. Leading digits get a
// prefix, because "1000Shards" does not compile and a generator
// that emits code which does not compile is worse than no
// generator.
function csharpName(id) {
  const parts = String(id || 'item').split(/[^a-zA-Z0-9]+/).filter(Boolean)
  const name = parts.map(part => part[0].toUpperCase() + part.slice(1)).join('')
  return /^[0-9]/.test(name) ? 'P' + name : (name || 'Item')
}


// ==========================================
// scaffold
// Everything a new game needs, in the order it is needed.
//
// One call so the panel renders one screen rather than six
// buttons, and so the pieces cannot drift apart: the binding in
// the wrangler snippet, the binding in the registry entry and
// the binding in the migration comment are the same string
// because they are computed once.
// ==========================================
export function scaffold(spec, origin) {
  const names = namesFor(spec.id)

  return {
    names,
    files: [
      {
        id: 'registry',
        name: 'config.js — GAME_REGISTRY entry',
        language: 'javascript',
        hint: 'Paste inside the GAME_REGISTRY object. This is the step that makes the game exist.',
        body: registryEntry(spec)
      },
      {
        id: 'wrangler',
        name: 'wrangler.jsonc — d1_databases entry',
        language: 'jsonc',
        hint: 'Paste into the d1_databases array, with the id printed by wrangler d1 create.',
        body: wranglerSnippet(spec.id)
      },
      {
        id: 'sql',
        name: `migrations/${names.id}.sql`,
        language: 'sql',
        hint: 'Save as that file, then apply it with the command in step 3.',
        body: gameSchemaSql(spec.id, {
          gameName: spec.name,
          withPurchases: spec.store !== false,
          withSessions: Boolean(spec.withSessions)
        })
      },
      {
        id: 'unity',
        name: `${names.pascal}Constants.cs`,
        language: 'csharp',
        hint: 'Drop into Assets/Scripts/AmirCollider/ in the Unity project.',
        body: unityConstants(spec, origin)
      }
    ],
    commands: setupCommands(spec.id)
  }
}
