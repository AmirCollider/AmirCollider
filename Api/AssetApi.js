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
 * The bar injected at the top of every page of the published demo.
 *
 * A visitor who opens the demo is inside a complete, self-contained
 * website with its own sidebar and its own navigation, and the
 * moment they click anything in it the site they came from is
 * several history entries back. They are not lost because the demo
 * is bad - they are lost because it is convincing. So the way home
 * travels with them, on every page.
 *
 * No script, no external stylesheet, nothing loaded from anywhere:
 * one element with inline styles, which is why this needs no change
 * to the Content-Security-Policy. `position: fixed` with
 * `inset-inline-start` rather than `left`, because the export is
 * right-to-left in Persian and a bar pinned to the left edge would
 * sit over its sidebar there.
 */
function demoBackBar(lang) {
  const label = lang === 'fa'
    ? 'بازگشت به سایت'
    : lang === 'ja'
      ? 'サイトに戻る'
      : 'Back to the site'
  const note = lang === 'fa'
    ? 'نمونه‌ی خروجی Unity DocSnap'
    : lang === 'ja'
      ? 'Unity DocSnap の出力サンプル'
      : 'A sample Unity DocSnap export'

  const href = lang === 'fa' ? '/unity-docsnap' : `/${lang}/unity-docsnap`
  const box = 'position:fixed;z-index:2147483647;inset-block-start:10px;inset-inline-start:10px;'
    + 'display:flex;align-items:center;gap:8px;padding:7px 12px;border-radius:10px;'
    + 'background:rgba(17,17,24,0.92);color:#fff;font:600 13px/1.2 system-ui,sans-serif;'
    + 'text-decoration:none;box-shadow:0 6px 20px rgba(0,0,0,0.35);backdrop-filter:blur(6px);'

  return `<a href="${escapeHtml(href)}" style="${box}" title="${escapeHtml(note)}">`
    + `<span style="font-size:15px;line-height:1;">\u2039</span>`
    + `<span>${escapeHtml(label)}</span></a>`
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
      const bar = demoBackBar(lang)
      const withBar = html.includes('</body>')
        ? html.replace('</body>', `${bar}</body>`)
        : html + bar
      return new Response(withBar, {
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
