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
 * The script that hands the export the reader's preferences.
 *
 * It is a plain inline script at the very end of the body, and
 * both of those are load-bearing:
 *
 *   at the end   the export writes window.__DOCSNAP_LANG__ and
 *                window.__DOCSNAP_THEME__ in a script near the
 *                end of its own body. Anything injected earlier
 *                would be overwritten by it.
 *
 *   plain        app.js is deferred, so it runs after the
 *                document is parsed. A non-deferred script
 *                anywhere in the body runs BEFORE it. So this
 *                always wins, and app.js reads the values it
 *                leaves.
 *
 * Why it matters at all: the export decides what to show in two
 * places that must agree. Its pre-paint script reads the
 * attributes on the html element; app.js reads these two
 * constants and writes the marker that same script checks. Change
 * one and not the other and the marker can never match, and every
 * choice the reader makes with the demo's OWN switchers is
 * discarded on their next click.
 *
 * The language check is done here rather than on the server
 * because only the page knows which languages its export carries.
 * An export that does not have the reader's language gets its own
 * back, attributes included.
 */
function demoPreferenceScript(lang, theme) {
  const want = JSON.stringify(lang)
  const wanted = JSON.stringify(theme === 'light' || theme === 'dark' ? theme : '')
  return '<script>(function(){'
    + 'var w=' + want + ',t=' + wanted + ';'
    + 'var d=document.documentElement;'
    + 'var L=window.__DOCSNAP_LANGS__,baked=window.__DOCSNAP_LANG__;'
    + 'if(L&&L.indexOf&&L.indexOf(w)<0){'
    + 'if(baked){d.setAttribute("lang",baked);'
    + 'd.setAttribute("dir",(window.__DOCSNAP_RTL__||[]).indexOf(baked)>=0?"rtl":"ltr");}'
    + '}else{window.__DOCSNAP_LANG__=w;}'
    + 'if(t){window.__DOCSNAP_THEME__=t;}'
    + '})();<\/script>'
}


/**
 * Everything this site changes on a demo page, as a streaming
 * pass over the bytes rather than a string in memory.
 *
 * This used to read the whole page with object.text(), rewrite it
 * with regular expressions and serve the result, with a size cap
 * above which it gave up and served the file untouched. The cap
 * was the bug: an Assets page listing a real project's files is
 * megabytes of HTML, so on that ONE page the reader got an
 * export nobody had touched - its own baked theme instead of
 * theirs, and no way back to the site. Every other page in the
 * same demo behaved, which is exactly what made it look like a
 * caching fault.
 *
 * HTMLRewriter is Cloudflare's own parser and it streams: nothing
 * is buffered, there is no page too large, and the cost does not
 * grow with the file. It needs no dependency - it is part of the
 * runtime - so rule 7 is untouched.
 *
 *   html                the reader's language, direction and
 *                       theme, before the export's pre-paint
 *                       script reads them
 *   a[data-site-back]   the export's own back link, removed so
 *                       there is exactly one and it is this
 *                       site's. An export from 1.0.4 fills that
 *                       link in from ?home= using app.js, and a
 *                       browser holding an older cached app.js
 *                       leaves it hidden forever.
 *   aside.ds-sidebar    where the bar goes, at the top, in the
 *                       place the export puts its own
 *   body (end tag)      the preference script, and the bar too if
 *                       this export has no sidebar to put it in
 */
function demoRewriter(lang, theme) {
  const bar = demoBackBar(lang)
  const script = demoPreferenceScript(lang, theme)
  let placed = false

  return new HTMLRewriter()
    .on('html', {
      element(element) {
        element.setAttribute('lang', lang)
        element.setAttribute('dir', dirFor(lang))
        if (theme === 'light' || theme === 'dark') { element.setAttribute('data-theme', theme) }
      }
    })
    .on('a[data-site-back]', {
      element(element) { element.remove() }
    })
    .on('aside.ds-sidebar', {
      element(element) { placed = true; element.prepend(bar, { html: true }) }
    })
    .on('body', {
      element(element) {
        element.onEndTag(end => {
          if (!placed) { end.before(bar, { html: true }) }
          end.before(script, { html: true })
        })
      }
    })
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
const BAR_VERSION = 4

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
 * The reader's preferences, as this request carries them.
 *
 * Kept in one place because the ETag has to be built from exactly
 * the same two values the page is built from - otherwise a reader
 * revalidates their way into the page built for somebody else's
 * language.
 */
function demoPreferences(url, request) {
  const cookies = parseCookies(request)
  return {
    lang: resolveLang(resolveRequestLang(url, request, cookies)),
    theme: resolveRequestTheme(cookies)
  }
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
    const { lang, theme } = demoPreferences(url, request)

    // The body depends on the reader's cookies, so the validator
    // has to as well, and so does Vary - without it a shared cache
    // could hand one reader the page built for another reader's
    // language. Both are known before a single byte is read, which
    // is what lets the rest of this stream.
    const etag = weakEtag(object.httpEtag, lang, theme || 'auto')
    if (matchesEtag(request, etag)) { return notModified(etag, demoHeaders(contentType, true)) }

    const headers = { ...demoHeaders(contentType, true), ETag: etag }
    const original = new Response(object.body, { status: 200, headers })

    // Fail open, always. A demo page nobody could rewrite is
    // still a demo page; a demo page nobody could SERVE is a
    // broken link on the product page.
    try {
      return demoRewriter(lang, theme).transform(original)
    } catch (error) {
      logWarning('Demo rewrite could not be set up', { requestId, key, error: error.message })
      return original
    }
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
