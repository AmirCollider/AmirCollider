// ==========================================
// Api/AssetApi.js
// GET /assets/<key> - immutable objects from the bound R2 bucket.
// ==========================================

import { createJsonResponse } from '../Core/Http.js'
import { escapeHtml } from '../Core/Html.js'
import { parseCookies, resolveRequestLang } from '../Core/RequestContext.js'

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

  // A page of the published demo gets a way back to this site put
  // into it on the way out. Read as text rather than streamed,
  // which is the cost of the feature and is bounded: this branch is
  // HTML under one prefix, never the whole bucket.
  //
  // The guard matters. Exports from 1.0.4 onwards carry their own
  // back link, filled in from ?home= - injecting a second bar over
  // the top of it would be two ways out of the same page. The
  // marker is the attribute that link is rendered with, so the
  // check is exact rather than a guess at a version number.
  if (key.startsWith(DEMO_PREFIX) && contentType.startsWith('text/html')) {
    const html = await object.text()
    if (!html.includes('data-site-back')) {
      const lang = resolveRequestLang(url, request, parseCookies(request))
      return new Response(injectBackBar(html, demoBackBar(lang)), {
        status: 200,
        headers: {
          'Content-Type': contentType,
          // Deliberately not immutable: the bar is this site's, not
          // the export's, and a year-long cache of a page carrying
          // it would outlive any change to it.
          'Cache-Control': 'public, max-age=300'
        }
      })
    }
  }

  return new Response(object.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'ETag': object.httpEtag
    }
  })
}
