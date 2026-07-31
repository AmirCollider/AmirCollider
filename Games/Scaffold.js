// ==========================================
// Games/Scaffold.js
// The code a new game needs, written by the site.
//
// Public exports:
//   registryEntry(spec)   -> the GAME_REGISTRY entry, as JS source
//   productEntry(spec)    -> one store.products[] entry, as JS source
//   unityConstants(spec)  -> the C# constants file for the game
//   scaffold(spec)        -> all of the above plus the SQL and commands
//
// The panel can add a game. It adds it the only way a game can
// honestly be added: by producing the source for it and asking
// you to paste and deploy.
//
// So: anyone reading Config.js learns exactly which games exist.
// That stays true after this panel has been used, which is the
// whole point of it working this way.
//
// ------------------------------------------------------------
// PLATFORM
// ------------------------------------------------------------
// A browser game and an Android game are not the same object
// with a different link. One has a package name, a signing key,
// an Android OAuth client, a deep-link scheme and a manifest;
// the other has a URL. Asking for all of it and generating all
// of it either way produced a registry entry full of fields the
// game does not have and a checklist mostly made of steps to
// skip.
//
// So spec.platform is 'android' | 'web' | 'both', and it decides
// which fields are asked for, which land in the entry, which
// files are generated and which commands appear.
// ==========================================

import { namesFor, slug, gameSchemaSql, setupCommands, wranglerSnippet } from './Sql.js'
import { constantsSource, androidManifestSource } from '../Content/UnityKit.js'


// ==========================================
// js
// A JavaScript string literal for generated source.
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
// platformOf
// What kind of game this is, normalised.
//
// Trusts the explicit answer when there is one and infers from
// the links otherwise, so a spec written before this field
// existed still produces the entry it used to.
// ==========================================
export function platformOf(spec) {
  const asked = String((spec && spec.platform) || '').toLowerCase()
  if (asked === 'web' || asked === 'android' || asked === 'both') {
    return { kind: asked, android: asked !== 'web', web: asked !== 'android' }
  }

  const links = (spec && spec.downloadLinks) || {}
  const web = Boolean(links.web)
  const android = Boolean(links.myket || links.googleplay || links.apk || (spec && spec.package))

  const kind = web && android ? 'both' : web ? 'web' : 'android'
  return { kind, android: kind !== 'web', web: kind !== 'android' }
}


// Only the links that belong to this platform, and only the ones
// that were filled in. An Android link on a web game is not a
// button nobody clicks - it is a 404 with the site's name on it.
function linksFor(spec, platform) {
  const given = (spec && spec.downloadLinks) || {}
  const allowed = platform.kind === 'web'
    ? ['web']
    : platform.kind === 'android'
      ? ['myket', 'googleplay', 'apk']
      : ['myket', 'googleplay', 'apk', 'web']

  const out = {}
  for (const key of allowed) {
    const url = String(given[key] || '').trim()
    if (url) out[key] = url
  }
  return out
}


function primaryFor(spec, links, platform) {
  const asked = String((spec && spec.downloadPrimary) || '').trim()
  if (asked && links[asked]) return asked
  return Object.keys(links)[0] || (platform.kind === 'web' ? 'web' : 'myket')
}


// ==========================================
// registryEntry
// One GAME_REGISTRY entry, formatted the way the file it is
// going into is formatted.
// ==========================================
export function registryEntry(spec) {
  const names = namesFor(spec.id)
  const platform = platformOf(spec)
  const links = linksFor(spec, platform)
  const primary = primaryFor(spec, links, platform)

  const pkg = spec.package || `com.AmirColliderGames.${names.pascal}`
  const scheme = spec.deepLinkScheme || pkg.toLowerCase()
  const login = spec.login !== false

  const tags = (spec.tags || []).length
    ? (spec.tags || []).map(tag =>
        `      { fa: ${js(tag.fa)}, en: ${js(tag.en)}, ja: ${js(tag.ja)} }`
      ).join(',\n')
    : platform.kind === 'web'
      ? `      { fa: 'بازی', en: 'Game', ja: 'ゲーム' },\n`
        + `      { fa: 'مرورگر', en: 'Browser', ja: 'ブラウザー' }`
      : `      { fa: 'بازی', en: 'Game', ja: 'ゲーム' },\n`
        + `      { fa: 'اندروید', en: 'Android', ja: 'Android' }`

  const linkLines = Object.entries(links)
    .map(([store, url]) => `        ${/^[a-z][a-z0-9]*$/i.test(store) ? store : js(store)}: ${js(url)}`)

  const products = (spec.products || []).length
    ? (spec.products || []).map(product => productEntry(product)).join(',\n')
    : `        // No products yet. Add one entry per thing a player can
        // buy; the id is what the shipped build and the
        // entitlements API both use, so it is chosen once.`

  // Android-only fields. Left out entirely rather than written
  // empty: an empty package name in the registry reads as a
  // value somebody forgot to fill in, and a deep-link scheme on
  // a browser game is a promise about a manifest that will
  // never exist.
  const androidBlock = platform.android
    ? `    package: ${js(pkg)},
    myketUrl: ${js(links.myket || '')},
    deepLink: { host: 'oauth' },

`
    : `    // Browser game: no package, no deep link, no manifest. The
    // OAuth code comes back on the page rather than on a URL
    // scheme, which is what Games/Registry.js falls back to when
    // deepLink.scheme is empty.

`

  const envBlock = login
    ? `    env: {
${platform.android ? `      android: ${js(names.env.android)},\n` : ''}      web: ${js(names.env.web)},
      secret: ${js(names.env.secret)}${platform.android ? `,\n      deepLinkScheme: ${js(names.env.deepLinkScheme)}` : ''}
    }${platform.android ? `,
    fallback: {
      deepLinkScheme: ${js(scheme)}
    }` : ''}`
    : `    // No sign-in, so no Google client and no secrets to set.
    env: {}`

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
${androidBlock}    d1Binding: ${js(names.binding)},

    // What this game asks the network for. The dashboard card is
    // built from this and nothing else, so a game that plays
    // offline stops advertising a ping test simply by saying so
    // here.
    capabilities: {
      onlinePlay: ${bool(spec.onlinePlay)},
      login: ${bool(login)},
      cloudSave: ${bool(spec.cloudSave !== false)},
      leaderboard: ${bool(spec.leaderboard !== false)},
      store: ${bool(spec.store !== false)}
    },

    download: {
      primary: ${js(primary)},
      links: {
${linkLines.length ? linkLines.join(',\n') : "        // No download link yet — the button stays greyed out."}
      }
    },

    status: ${js(spec.status || 'live')},

    store: {
      products: [
${products}
      ]
    },

${envBlock}
  }`
}


// ==========================================
// productEntry
// One catalogue product, as source.
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
// specToGame
// A scaffold spec in the shape the Unity kit reads.
//
// One generator for the constants file, shared by the New game
// tab and the Unity tab. Two copies of it drifted apart once
// already: the tab's version knew about the deep-link HOST and
// this one did not.
// ==========================================
function specToGame(spec) {
  const names = namesFor(spec.id)
  const platform = platformOf(spec)
  const pkg = spec.package || `com.AmirColliderGames.${names.pascal}`

  return {
    id: names.id,
    name: spec.name || names.pascal,
    package: platform.android ? pkg : '',
    deepLink: {
      scheme: platform.android ? (spec.deepLinkScheme || pkg.toLowerCase()) : '',
      host: 'oauth'
    },
    capabilities: {
      onlinePlay: Boolean(spec.onlinePlay),
      login: spec.login !== false,
      cloudSave: spec.cloudSave !== false,
      leaderboard: spec.leaderboard !== false,
      store: spec.store !== false
    },
    download: { links: linksFor(spec, platform) },
    store: { products: spec.products || [] }
  }
}


// ==========================================
// unityConstants
// The C# file that stops a game hard-coding a URL.
// ==========================================
export function unityConstants(spec, origin) {
  const game = specToGame(spec)
  const names = namesFor(spec.id)

  return constantsSource({
    id: game.id,
    name: game.name,
    pascal: names.pascal,
    upper: names.upper,
    package: game.package || `com.AmirColliderGames.${names.pascal}`,
    scheme: game.deepLink.scheme,
    host: game.deepLink.host,
    base: String(origin || 'https://amircollider.com').replace(/\/+$/, ''),
    capabilities: game.capabilities,
    products: game.store.products,
    platforms: platformOf(spec)
  })
}


// ==========================================
// scaffold
// Everything a new game needs, in the order it is needed.
// ==========================================
export function scaffold(spec, origin) {
  const names = namesFor(spec.id)
  const platform = platformOf(spec)
  const login = spec.login !== false

  const files = [
    {
      id: 'registry',
      name: 'Config.js — GAME_REGISTRY entry',
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
      hint: 'Drop into Assets/Scripts/AmirCollider/ in the Unity project. The rest of the C# is in '
          + 'the Unity tab once the game has been deployed.',
      body: unityConstants(spec, origin)
    }
  ]

  // Only for a game that ships an APK. A browser game handed an
  // AndroidManifest is a file whose only correct use is deleting
  // it, and one more thing to wonder about.
  if (platform.android) {
    files.push({
      id: 'manifest',
      name: 'AndroidManifest.xml',
      language: 'xml',
      hint: 'Save as Assets/Plugins/Android/AndroidManifest.xml and tick Player ▸ Publishing Settings ▸ '
          + 'Custom Main Manifest. Without it, Android has nowhere to deliver the sign-in code.',
      body: androidManifestSource({
        ...specToGame(spec),
        name: spec.name || names.pascal,
        pascal: names.pascal,
        scheme: specToGame(spec).deepLink.scheme,
        host: 'oauth'
      })
    })
  }

  return {
    names,
    platform: platform.kind,
    files,
    commands: setupCommands(spec.id, { android: platform.android, login, origin })
  }
}
