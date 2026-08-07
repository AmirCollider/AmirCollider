// ==========================================
// Core/Locale.js
// Where a language lives in a URL.
//
// ------------------------------------------------------------
// WHY THIS FILE EXISTS
// ------------------------------------------------------------
// Every page on this site used to exist at one address and change
// language according to `?lang=`, a cookie, or an Accept-Language
// header. Read that back as a search engine does and the problem
// is immediate:
//
//   - `/`, `/?lang=fa`, `/?lang=en` and `/?lang=ja` all declared
//     the same canonical URL, `/`. An hreflang cluster whose
//     members all canonicalise to one member is not a cluster;
//     Google discards it and keeps the one URL.
//
//   - So the site had exactly one indexable address per page, and
//     the language it showed there was decided by Accept-Language.
//     Googlebot sends no Accept-Language header. `LANGUAGES.default`
//     is `fa`. Every page Google has ever indexed of this site is
//     the Persian one - which is why searching the brand from a
//     non-Persian locale finds nothing, and why the English and
//     Japanese content the site genuinely has may as well not
//     exist.
//
// The fix is the one thing that makes an hreflang cluster real:
// give every language its own URL.
//
//   fa   /about          the default language keeps the bare path
//   en   /en/about
//   ja   /ja/about
//
// A path, not a query string. `?lang=` is not itself fatal to
// ranking - but a path segment is unambiguous, survives being
// copied by hand, and cannot be dropped by anything that
// normalises query strings.
//
// ------------------------------------------------------------
// THE RULE THAT MAKES IT WORK
// ------------------------------------------------------------
// A bare path is ALWAYS the default language. Not "the default
// unless a cookie says otherwise" - always. That is what makes the
// address stable enough to index: one URL, one language, one set
// of bytes, for every visitor and every crawler.
//
// A human who prefers another language is redirected to that
// language's own URL (Worker.js), with a 302 rather than a 301,
// because the preference belongs to the visitor and not to the
// address.
//
// Exports
//   splitLangPath(pathname)      -> { lang, path }
//   localizedPath(path, lang)    -> '/en/about'
//   isLangRoutable(path)         -> whether a path takes a prefix
//   stripLangPath(pathname)      -> the bare path
// ==========================================

import { LANGUAGES } from '../Config.js'
import { resolveLang } from './RequestContext.js'


// ==========================================
// Paths that never carry a language prefix.
//
// Two kinds, and they are here for different reasons.
//
// The machine surface (`/assets/`, `/oauth/`, `/database/`, the
// `/games/{id}/...` API) is called by shipped Android builds with
// their own HTTP stacks. Some of them do not follow redirects at
// all. Nothing about a language belongs in those addresses and
// nothing may ever redirect them.
//
// The transactional surface (`/checkout`, `/order`, `/license`) is
// left alone for a narrower reason: the payment provider is handed
// a `success_url` when an invoice is opened, and that URL is stored
// on their side for the life of the invoice. It carries `?lang=`
// and a signed order handle. Rewriting those addresses would mean a
// customer returning from a payment made yesterday lands on a
// redirect this deployment invented today. They are `noindex` and
// disallowed in robots.txt, so nothing is lost by leaving them as
// they are.
//
// Note `/games/` carries its trailing slash: `/games` exactly is
// the public catalogue page and IS language-routed.
// ==========================================
const NO_LANG_ROUTING = [
  '/assets/',
  '/video/',
  '/oauth/',
  '/auth/',
  '/database/',
  '/games/',
  '/profile/',
  '/thegod',
  '/testsite',
  '/checkout',
  '/order',
  '/license',
  '/robots.txt',
  '/sitemap.xml',
  '/icon.svg',
  '/favicon.ico',
  '/site.webmanifest'
]


/** Whether a bare path is one that carries a language prefix. */
export function isLangRoutable(path) {
  const bare = String(path || '/')
  return !NO_LANG_ROUTING.some(prefix => bare === prefix || bare.startsWith(prefix))
}


/**
 * Splits a request path into its language prefix and the bare path
 * underneath it.
 *
 * The first segment is only read as a language when it is exactly
 * two letters AND names a language this site speaks - so a game id,
 * a tool name and a policy path all fall through untouched. A
 * two-letter game id would collide, which is why `LANGUAGES.supported`
 * is checked rather than the shape alone.
 *
 *   '/en/about'  -> { lang: 'en', path: '/about' }
 *   '/en'        -> { lang: 'en', path: '/' }
 *   '/about'     -> { lang: null, path: '/about' }
 */
export function splitLangPath(pathname) {
  const full = String(pathname || '/')
  const match = /^\/([A-Za-z]{2})(\/.*)?$/.exec(full)
  if (!match) return { lang: null, path: full }

  const code = match[1].toLowerCase()
  if (!LANGUAGES.supported.includes(code)) return { lang: null, path: full }

  return { lang: code, path: match[2] || '/' }
}


/** The bare path, with any language prefix removed. */
export function stripLangPath(pathname) {
  return splitLangPath(pathname).path
}


/**
 * The address of `path` in `lang`.
 *
 * The default language keeps the bare path rather than taking a
 * `/fa/` prefix of its own. Two addresses for one page is the
 * problem this file exists to remove, and a default language that
 * answers on both is exactly that - so `/fa/...` is a 301 back to
 * the bare form (Worker.js) and is never generated here.
 *
 * Any prefix already on `path` is stripped first, so this is safe
 * to call on a value that has been through it before.
 */
export function localizedPath(path, lang) {
  const code = resolveLang(lang)
  const bare = stripLangPath(String(path || '/'))

  if (code === LANGUAGES.default) return bare
  if (!isLangRoutable(bare)) return bare

  return bare === '/' ? '/' + code : '/' + code + bare
}
