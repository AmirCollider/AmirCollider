// ==========================================
// Api/AssetApi.js
// GET /assets/<key> - immutable objects from the bound R2 bucket.
// ==========================================

import { createJsonResponse } from '../Core/Http.js'
import { escapeHtml } from '../Core/Html.js'
import {
  dirFor, parseCookies, resolveLang, resolveRequestLang, resolveRequestTheme
} from '../Core/RequestContext.js'
import { logWarning } from '../Core/Logging.js'

/**
 * Fallbacks for when R2 has no contentType of its own.
 *
 * This used to list images only, which was fine while images were
 * the only thing in the bucket. A DocSnap export is a folder of
 * HTML, CSS, JS, JSON and fonts, and every one of those served as
 * application/octet-stream is a file the browser offers to
 * DOWNLOAD rather than a page it renders - so the demo would open
 * as a save dialog on any object uploaded without its type set.
 * The stored type still wins; this is the net underneath it.
 */
const CONTENT_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  md: 'text/plain; charset=utf-8',
  woff2: 'font/woff2',
  woff: 'font/woff'
}

/**
 * Objects under this prefix are a published DocSnap export being
 * read as part of this site rather than as a folder on somebody's
 * disk, which is the one case where the export needs a way out of
 * itself.
 */
const DEMO_PREFIX = 'demo/docsnap/'

/**
 * The largest page this will read into memory to add a link to. A
 * DocSnap dashboard is tens of kilobytes; anything past this is
 * something else, and it gets streamed untouched.
 */
const MAX_INJECT_BYTES = 4 * 1024 * 1024

/**
 * The way back to this site, injected into a published DocSnap
 * export.
 *
 * A visitor who opens the demo is inside a complete,
 * self-contained website with its own sidebar and its own
 * navigation, and the moment they click anything in it the site
 * they came from is several history entries back. They are not
 * lost because the demo is bad - they are lost because it is
 * convincing. So the way home travels with them, on every page.
 *
 * It goes INSIDE the export's sidebar, at the top, in exactly the
 * place an export from 1.0.4 onwards puts its own back link. The
 * first version of this floated a dark pill over the top-left
 * corner with position:fixed, and on a right-to-left export that
 * corner is where the sidebar's logo and title are: the pill
 * landed on top of the brand and looked like a rendering fault.
 * A link that belongs to the page beats one that hovers over it,
 * and this way the 1.0.3 demo and a 1.0.4 export look the same.
 *
 * Styled with the export's OWN CSS variables, so it inherits
 * whichever of the four themes and two skins the reader has
 * chosen rather than fighting them. No script, no external
 * stylesheet, nothing loaded from anywhere - which is why this
 * needs no change to the Content-Security-Policy.
 */
function demoBackBar(lang) {
  const label = lang === 'fa'
    ? 'بازگشت به سایت'
    : lang === 'ja'
      ? 'サイトに戻る'
      : 'Back to the site'
  const note = lang === 'fa'
    ? 'این یک نمونه‌ی خروجی Unity DocSnap است'
    : lang === 'ja'
      ? 'これは Unity DocSnap の出力サンプルです'
      : 'This is a sample Unity DocSnap export'

  const href = lang === 'fa' ? '/unity-docsnap' : `/${lang}/unity-docsnap`

  // var() with a fallback, because this markup is injected into an
  // export built by a version of the tool that may predate any of
  // these tokens.
  const box = 'display:flex;align-items:center;gap:6px;margin:0 0 10px;padding:5px 9px;'
    + 'border:1px solid var(--border,rgba(128,128,160,0.25));border-radius:var(--radius-sm,7px);'
    + 'color:var(--text-dim,#9aa);font:600 12px/1.35 inherit;text-decoration:none;'

  // The chevron points the way the reader's language reads, so it
  // means "back" in both directions instead of pointing into the
  // page on a right-to-left one.
  const arrow = lang === 'fa' ? '\u203A' : '\u2039'

  return `<a href="${escapeHtml(href)}" style="${box}" title="${escapeHtml(note)}">`
    + `<span style="font-size:14px;line-height:1;" aria-hidden="true">${arrow}</span>`
    + `<span>${escapeHtml(label)}</span></a>`
}

/**
 * Where the bar goes.
 *
 * Inside the sidebar when there is one - which is every DocSnap
 * export, and is the placement that looks deliberate. Before
 * </body> only as a fallback, for an export whose shell this does
 * not recognise; there it is a plain link at the end of the
 * document rather than a pill over the content, because a
 * fallback that misplaces itself is worse than a plain one.
 */
function injectBackBar(html, bar) {
  const sidebar = html.indexOf('<aside class="ds-sidebar">')
  if (sidebar >= 0) {
    const at = html.indexOf('>', sidebar) + 1
    return html.slice(0, at) + bar + html.slice(at)
  }
  return html.includes('</body>') ? html.replace('</body>', `${bar}</body>`) : html + bar
}

/**
 * Percent-decoding that cannot throw. An unescaped '%' anywhere in
 * an asset path used to raise a URIError before any validation ran,
 * which turned a malformed URL into a 500 rather than the 400 it
 * plainly is.
 */
function decodeKey(raw) {
  try {
    return decodeURIComponent(raw)
  } catch {
    return null
  }
}

/**
 * Whether a decoded key is one this route will fetch.
 *
 * This used to be `key.includes('/')` - one flat level, nothing
 * nested - and that single condition is why an attached photo
 * never appeared anywhere on this site. Both writers of image
 * objects store them under a dated prefix, which is the sane
 * layout for anything a sweep has to expire:
 *
 *   contact/2026-09-06/<uuid>.png   the public contact form
 *   mail/2026-09-06/<uuid>.png      inbound mail and the panel
 *
 * Every one of those has a slash in it, so every request for one
 * was answered 400 invalid_asset. The message in the mailbox said
 * "1 attachment" and showed a broken image, and the picture it was
 * pointing at was sitting in the bucket the whole time.
 *
 * What the check is actually FOR is path traversal, and that is
 * what it does now: no empty segments, no '.' or '..' segment, no
 * leading slash, no backslash (which some stores treat as a
 * separator), and a bounded depth. A slash between two ordinary
 * segments was never the danger - '..' was.
 */
function safeKey(key) {
  if (!key || key.length > 512) return false
  if (key.startsWith('/') || key.includes('\\')) return false

  const segments = key.split('/')
  if (segments.length > 8) return false

  return segments.every(segment =>
    segment.length > 0 && segment !== '.' && segment !== '..')
}



/**
 * Headers for anything under the demo prefix.
 *
 * max-age=0 with must-revalidate means the browser may keep the
 * copy but has to ask before using it, which an ETag turns into a
 * 304 with no body. The demo is a showcase, not a hot path: being
 * right the moment a new export is uploaded is worth far more than
 * the saved round trip.
 *
 * `personal` marks a response whose body was built from the
 * reader's own cookies, which must never be served to a different
 * reader out of a shared cache.
 */
function demoHeaders(contentType, personal) {
  const headers = {
    'Content-Type': contentType,
    'Cache-Control': personal
      ? 'private, max-age=0, must-revalidate'
      : 'public, max-age=0, must-revalidate'
  }
  if (personal) { headers.Vary = 'Cookie, Accept-Language' }
  return headers
}

/**
 * A validator for a body this site BUILT, rather than one R2
 * stored. It has to change when the source object changes and when
 * the language or theme it was built for changes, or a reader
 * would revalidate their way into somebody else's page.
 *
 * Weak, because the bytes are a transformation of the object
 * rather than the object itself.
 */
function weakEtag(objectEtag, lang, theme) {
  const base = String(objectEtag || '').replace(/^W\//, '').replace(/"/g, '')
  return `W/"${base}-${lang || 'x'}-${theme || 'x'}-${BAR_VERSION}"`
}

/**
 * Bumped whenever the injected markup changes, so a reader holding
 * a cached copy of the old bar gets the new one rather than
 * revalidating into it forever.
 */
const BAR_VERSION = 3

function matchesEtag(request, etag) {
  const header = request && request.headers ? request.headers.get('If-None-Match') : null
  if (!header || !etag) { return false }
  const wanted = String(etag).replace(/^W\//, '')
  return header.split(',').some(part => part.trim().replace(/^W\//, '') === wanted)
}

function notModified(etag, headers) {
  const out = new Headers(headers)
  out.set('ETag', etag)
  out.delete('Content-Type')
  return new Response(null, { status: 304, headers: out })
}

/**
 * Everything this site changes on its way out of a demo page, and
 * the only place allowed to fail.
 *
 * Returns { html, lang, theme }, or null when it could not be done
 * for any reason at all. A null is not an error the caller reports
 * to the reader; it means "serve the file the old way".
 */
async function tryInject(object, url, request, key, requestId) {
  try {
    // A page bigger than this is not a page, and buffering it to
    // add one link is a worse trade than not adding the link.
    if (typeof object.size === 'number' && object.size > MAX_INJECT_BYTES) {
      logWarning('Demo back bar skipped: page too large to buffer', { requestId, key, size: object.size })
      return null
    }

    const html = await object.text()
    if (typeof html !== 'string' || !html) { return null }

    const cookies = parseCookies(request)
    const lang = resolveLang(resolveRequestLang(url, request, cookies))
    const theme = resolveRequestTheme(cookies)

    // On EVERY page of the demo, not only the one the reader
    // arrived on. Doing it on arrival alone was the second half
    // of the theme-flipping report: the first click inside the
    // demo fetched a page nobody had rewritten, and the reader
    // went from the dark Persian page they arrived on to the
    // export's own light English one.
    //
    // Why this does not overrule the demo's own switchers is
    // adoptSitePreferences' whole subject - read the note there.
    const out = injectBackBar(stripExportBackLink(adoptSitePreferences(html, lang, theme)), demoBackBar(lang))
    return { html: out, lang, theme: theme || 'auto' }
  } catch (error) {
    logWarning('Demo back bar could not be added', { requestId, key, error: error.message })
    return null
  }
}


/**
 * Opens the demo the way the reader was already reading the site -
 * and keeps it that way as they click through it, without taking
 * the demo's own language and theme switchers away from them.
 *
 * Somebody browsing in Persian on a dark page who clicks "see a
 * real export" and lands on a light English one has been handed a
 * different product. So the export's baked defaults are replaced
 * with the reader's.
 *
 * ---------------------------------------------------------------
 * WHY IT REWRITES THE TWO SCRIPT CONSTANTS AS WELL AS THE TAG
 * ---------------------------------------------------------------
 * This is the part that took a bug report to get right, so it is
 * written down. The export decides what to show in three steps:
 *
 *   1. A pre-paint script reads lang and data-theme OFF THE HTML
 *      ELEMENT, and restores the reader's saved choice only when
 *      localStorage holds the marker "<stamp>|<that lang>|<that
 *      theme>".
 *   2. app.js reads window.__DOCSNAP_LANG__ and
 *      window.__DOCSNAP_THEME__ - the values BAKED INTO THE BODY,
 *      which step 1 never touches - and writes that marker.
 *   3. The switchers write the reader's choice beside it.
 *
 * Rewriting only the html element makes 1 and 2 disagree forever:
 * the marker app.js writes can never match the marker the boot
 * script computes, so every saved choice is discarded on every
 * page and the demo's own switchers stop surviving a click.
 *
 * Rewriting both makes the site's preference look exactly like an
 * export whose defaults were those values. Then the marker
 * matches, and the order of precedence comes out right on its own:
 * the reader's choice inside the demo beats the site's cookie,
 * which beats the export's baked default.
 *
 * The values must be the SAME on every page of one visit or the
 * marker breaks again - they come from a cookie and an
 * Accept-Language header, so they are.
 */
function adoptSitePreferences(html, lang, theme) {
  // Only a language this export actually carries. The list is
  // baked into the page; if it is not there, this is not a page
  // built by a version that knows about languages at all, and the
  // safe answer is to leave the language alone.
  const known = html.match(/window\.__DOCSNAP_LANGS__\s*=\s*(\[[^\]]*\])/)
  let useLang = lang
  if (known) {
    try {
      const codes = JSON.parse(known[1])
      if (!Array.isArray(codes) || !codes.includes(lang)) { useLang = null }
    } catch { useLang = null }
  }

  const useTheme = theme === 'light' || theme === 'dark' ? theme : null

  let out = html
  const open = out.indexOf('<html')
  if (open >= 0) {
    const close = out.indexOf('>', open)
    if (close >= 0) {
      let tag = out.slice(open, close)
      if (useLang) {
        tag = setAttr(tag, 'lang', useLang)
        tag = setAttr(tag, 'dir', dirFor(useLang))
      }
      if (useTheme) { tag = setAttr(tag, 'data-theme', useTheme) }
      out = out.slice(0, open) + tag + out.slice(close)
    }
  }

  if (useLang) { out = setGlobal(out, '__DOCSNAP_LANG__', useLang) }
  if (useTheme) { out = setGlobal(out, '__DOCSNAP_THEME__', useTheme) }
  return out
}


/**
 * Replaces one `window.__X__="value"` assignment in the page's
 * baked constants.
 *
 * Deliberately narrow: it matches an assignment of a double-quoted
 * string and nothing else, so it cannot touch the export
 * constants that hold arrays or objects. A page that does not
 * carry the constant is returned untouched rather than patched
 * with a new one - an assignment invented here would run before
 * the script that defines the rest and mean nothing.
 */
function setGlobal(html, name, value) {
  const pattern = new RegExp('(window\\.' + name + '\\s*=\\s*)"[^"]*"')
  if (!pattern.test(html)) { return html }
  return html.replace(pattern, '$1"' + String(value).replace(/["\\]/g, '') + '"')
}


/** Replaces an attribute on an opening tag, or adds it. */
function setAttr(tag, name, value) {
  const pattern = new RegExp('\\\\s' + name + '="[^"]*"')
  const next = ` ${name}="${value}"`
  return pattern.test(tag) ? tag.replace(pattern, next) : tag + next
}


/**
 * Removes the export's own back link so there is exactly one, and
 * it is this site's.
 *
 * Exports from 1.0.4 carry a hidden link that their own script
 * fills in from ?home=. Leaving it and skipping the injection
 * looked like the tidier answer and was not: the script that fills
 * it is theme/app.js, which a browser may be holding a cached copy
 * of from an older export, in which case the link stays hidden and
 * the reader has no way out at all. That is precisely what
 * happened.
 *
 * The site's own bar does not depend on any version of any file in
 * the export, so it is the one that ships.
 */
function stripExportBackLink(html) {
  return html.replace(/<a[^>]*\bdata-site-back\b[^>]*>[\s\S]*?<\/a>/gi, '')
}


export async function handleAsset(url, request, gameId, requestId, GAMES, env) {
  const key = decodeKey(url.pathname.replace('/assets/', ''))
  if (!safeKey(key)) {
    return createJsonResponse({ error: 'invalid_asset', message: 'Invalid asset path', requestId }, 400)
  }

  const bucket = env.ASSETS
  if (!bucket) {
    return createJsonResponse({ error: 'r2_not_bound', message: 'R2 binding "ASSETS" not found', requestId }, 500)
  }

  const object = await bucket.get(key)
  if (!object) {
    return createJsonResponse({ error: 'asset_not_found', message: `Asset "${key}" not found`, requestId }, 404)
  }

  const extension = key.split('.').pop().toLowerCase()
  const contentType = object.httpMetadata?.contentType || CONTENT_TYPES[extension] || 'application/octet-stream'
  const isDemo = key.startsWith(DEMO_PREFIX)

  // ==========================================
  // Caching, and the bug it is written for.
  //
  // Everything here used to be served
  // "max-age=31536000, immutable". That promise is only
  // true when a URL's bytes never change, which is the case
  // for an uploaded photo under a dated prefix and is NOT
  // the case for the published demo: a new export is
  // uploaded over the old one, at the same addresses, every
  // time. So a reader who had opened it once kept
  // theme/app.js and theme/style.css from a year-long cache
  // and got them mixed with freshly-fetched HTML.
  //
  // That is not a cosmetic staleness. The export's boot
  // script matches the reader's saved theme against a stamp
  // baked into each page, so a cached page and a new one
  // disagree and the theme flips between pages. The version
  // badge read 1.0.1 on a 1.0.4 export. The back link was
  // missing because the cached app.js predated it. Three
  // separate bug reports, one wrong header.
  //
  // The demo revalidates on every request instead. With an
  // ETag that costs a 304 and no body, so it is cheap; and
  // it is correct the moment anything is re-uploaded, which
  // is what a demo needs.
  // ==========================================
  if (isDemo && contentType.startsWith('text/html')) {
    const injected = await tryInject(object, url, request, key, requestId)
    if (injected !== null) {
      // The body now depends on the reader's cookies, so the
      // validator has to as well, and so does Vary - without it a
      // shared cache could hand one reader the page built for
      // another reader's language.
      const etag = weakEtag(object.httpEtag, injected.lang, injected.theme)
      if (matchesEtag(request, etag)) { return notModified(etag, demoHeaders(contentType, true)) }
      return new Response(injected.html, {
        status: 200,
        headers: { ...demoHeaders(contentType, true), ETag: etag }
      })
    }

    // The body may have been partly consumed by the attempt, so the
    // object is fetched again rather than reused. One extra read of
    // one file, only when something already went wrong.
    const fresh = await bucket.get(key)
    if (fresh) {
      return new Response(fresh.body, {
        status: 200,
        headers: { ...demoHeaders(contentType, false), ETag: fresh.httpEtag }
      })
    }
    return createJsonResponse({ error: 'asset_not_found', message: `Asset "${key}" not found`, requestId }, 404)
  }

  if (isDemo) {
    if (matchesEtag(request, object.httpEtag)) {
      return notModified(object.httpEtag, demoHeaders(contentType, false))
    }
    return new Response(object.body, {
      status: 200,
      headers: { ...demoHeaders(contentType, false), ETag: object.httpEtag }
    })
  }

  // Everything else, split by whether the ADDRESS can ever hold
  // different bytes - which is the only question `immutable`
  // actually asks.
  const caching = writeOnce(key)
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=3600, must-revalidate'

  if (matchesEtag(request, object.httpEtag)) {
    return notModified(object.httpEtag, { 'Content-Type': contentType, 'Cache-Control': caching })
  }
  return new Response(object.body, {
    status: 200,
    headers: { 'Content-Type': contentType, 'Cache-Control': caching, 'ETag': object.httpEtag }
  })
}


/**
 * Whether an address in this bucket can be trusted never to hold
 * different bytes.
 *
 * `immutable` is a promise to every cache between here and the
 * reader that they need never ask again for a year. It is true of
 * an attachment, which is written once under a dated prefix with
 * a UUID for a name and can never be written again:
 *
 *     contact/2026-09-11/9f3c....png
 *     mail/2026-09-11/2b71....jpg
 *
 * It is NOT true of anything uploaded by hand at a name somebody
 * chose - the site logo, a screenshot a landing page points at.
 * Those get replaced at the same address, and the whole point of
 * replacing them is that people see the new one. A year of
 * `immutable` on those means the old one, in the browser of
 * everybody who ever loaded it, until they clear their cache.
 *
 * That is the same mistake the published demo was serving under,
 * and it produced three bug reports that read like three
 * different bugs. The rule is written once, here: a date in the
 * key is the evidence, and without it the answer is an hour and a
 * revalidation.
 */
function writeOnce(key) {
  return /(^|\/)\d{4}-\d{2}-\d{2}\//.test(String(key || ''))
}
