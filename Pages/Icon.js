// ==========================================
// Pages/Icon.js
// The site icon, with room around it.
//
// Public entry point (wired in Worker.js ROUTES):
//   GET /icon.svg
//
// ------------------------------------------------------------
// WHY THIS ROUTE EXISTS
// ------------------------------------------------------------
// The favicon used to be the logo file itself. Every surface that
// shows a favicon in a round frame - Google's search results on a
// phone, a bookmark bar on some platforms, a share sheet - takes
// the largest circle that fits inside the square and throws the
// rest away. A logo drawn to the edges of its own square loses its
// four corners to that, which is exactly what happened here: the
// mark came back cropped in Google's results.
//
// The fix is a safe area, and the arithmetic is not a matter of
// taste. A circle inscribed in a square of side S has room for a
// centred square of side S/√2 - about 70.7% - and nothing outside
// that is guaranteed to survive. So the artwork is placed inside
// the middle 70%, and the outer band is padding whose only job is
// to be the part that gets cropped.
//
// It is generated rather than uploaded because the alternative is
// a second image file that has to be re-exported by hand every
// time the logo changes, and which will silently be the old logo
// the first time somebody forgets. This reads the same object the
// rest of the site already points at, so there is one logo.
//
// SVG rather than a resized PNG because a Worker cannot decode a
// PNG - and does not have to. The bytes are embedded verbatim as a
// data: URI inside an <svg>, which every browser and every crawler
// that accepts an SVG favicon will rasterise correctly at whatever
// size it needs. No pixels are resampled; the file is only given
// somewhere to sit.
// ==========================================

import { CONFIG } from '../Config.js'
import { logWarning } from '../Core/Logging.js'


// The generated square. 512 is what an icon this is scaled down
// from should be, and every number below is a fraction of it.
const CANVAS = 512

// The centred square a circular crop cannot reach into. 70% rather
// than the 70.7% the geometry allows, because the last 0.7% buys
// nothing and a round number is easier to check by eye.
const SAFE = 0.70

// ------------------------------------------------------------
// THE PART THE SAFE AREA ALONE DID NOT FIX
// ------------------------------------------------------------
// Padding the artwork stopped the corners being cropped, and
// replaced that with a different picture: the logo is a square that
// paints its own background out to its own edges, so insetting it
// inside a TRANSPARENT canvas and letting Google draw a circle
// behind it produced a small square sitting inside a ring. Two
// shapes disagreeing - which is exactly what the search result
// showed.
//
// A circle can only ever crop the outermost band of this canvas, so
// the fix is to make that band be something worth cropping. The
// backdrop is painted across the whole square first and the artwork
// goes on top of it, inside the safe area. What a circular mask
// takes is then a ring of solid colour, and what it leaves is a
// round mark with the logo centred in it.
//
// CONFIG.ICON_BG is that colour, and it should be the logo's own
// background - see the note there.
// ------------------------------------------------------------

// Refuse to inline anything larger than this. A logo is tens of
// kilobytes; a megabyte in this slot is somebody having replaced
// the object with a screenshot, and base64 makes it a third bigger
// again on every uncached request.
const MAX_BYTES = 512 * 1024

const MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp'
}


/**
 * The R2 key CONFIG.AMIR_LOGO names.
 *
 * Returns null for a logo that is not served from this Worker's
 * own bucket - an absolute URL, or a path outside /assets/ - which
 * is a configuration this route has nothing to offer and should
 * step out of the way of rather than guess about.
 */
function logoKey() {
  const path = String(CONFIG.AMIR_LOGO || '')
  if (!path.startsWith('/assets/')) return null

  const key = path.slice('/assets/'.length)
  return key && !key.includes('/') && !key.includes('..') ? key : null
}


/**
 * Bytes to base64, in chunks.
 *
 * String.fromCharCode.apply over a whole image blows the argument
 * limit and throws; a character at a time is correct and slow. 8k
 * at a time is neither.
 */
function toBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let at = 0; at < bytes.length; at += 8192) {
    binary += String.fromCharCode.apply(null, bytes.subarray(at, at + 8192))
  }
  return btoa(binary)
}


/**
 * The wrapper.
 *
 * preserveAspectRatio="xMidYMid meet" is what makes the safe area
 * a promise rather than a hope: whatever the logo's own aspect
 * ratio turns out to be, it is scaled to FIT the box and centred
 * in it, so a wide logo gets bars above and below rather than
 * being stretched into the square or spilling out of it.
 */
function wrap(dataUri) {
  const box = Math.round(CANVAS * SAFE)
  const inset = Math.round((CANVAS - box) / 2)
  const background = safeColor(CONFIG.ICON_BG)

  // The backdrop is also the last line of defence. If a surface
  // ever declines to draw the nested <image> - some renderers treat
  // an SVG used as an icon very conservatively - what is left is a
  // solid mark in the brand's own colour rather than an empty tab.
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" `
    + `viewBox="0 0 ${CANVAS} ${CANVAS}" width="${CANVAS}" height="${CANVAS}" role="img" `
    + `aria-label="AmirCollider">`
    + `<title>AmirCollider</title>`
    + `<rect width="${CANVAS}" height="${CANVAS}" fill="${background}"/>`
    + `<image x="${inset}" y="${inset}" width="${box}" height="${box}" `
    + `preserveAspectRatio="xMidYMid meet" href="${dataUri}" xlink:href="${dataUri}"/>`
    + `</svg>`
}


/**
 * A CSS colour that is safe to drop into an SVG attribute.
 *
 * Only the two hex forms, because that is what a configuration file
 * writes and because anything looser here is a string from config
 * going straight into markup.
 */
function safeColor(value) {
  const text = String(value || '').trim()
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(text) ? text : '#0b0e16'
}


// ==========================================
// handleSiteIcon
// GET /icon.svg
//
// Every failure path ends at the logo itself rather than at an
// error: a browser that asked for an icon and got a 500 shows the
// generic globe, and a page whose <link rel=icon> is broken is a
// page that looks abandoned in a tab strip.
// ==========================================
export async function handleSiteIcon(url, request, gameId, requestId, GAMES, env) {
  const fallback = () => Response.redirect(new URL(CONFIG.AMIR_LOGO, url.origin).toString(), 302)

  const key = logoKey()
  const bucket = env && env.ASSETS
  if (!key || !bucket) return fallback()

  try {
    const object = await bucket.get(key)
    if (!object) {
      logWarning('Site icon: logo object missing in R2', { requestId, key })
      return fallback()
    }
    if (object.size > MAX_BYTES) {
      logWarning('Site icon: logo too large to inline', { requestId, key, size: object.size })
      return fallback()
    }

    const extension = key.slice(key.lastIndexOf('.') + 1).toLowerCase()
    const type = object.httpMetadata?.contentType || MIME[extension] || 'image/png'
    const svg = wrap(`data:${type};base64,${toBase64(await object.arrayBuffer())}`)

    return new Response(svg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        // A day, not a year. The logo is one object away from being
        // replaced, and a favicon nobody can flush is a favicon
        // that is wrong until the domain expires.
        'Cache-Control': 'public, max-age=86400',
        'ETag': object.httpEtag
      }
    })
  } catch (error) {
    logWarning('Site icon: falling back to the raw logo', { requestId, error: error.message })
    return fallback()
  }
}


// ==========================================
// handleFavicon
// GET /favicon.ico
//
// A browser asks for this address whether the document links to an
// icon or not, and so do several crawlers - Google's favicon
// fetcher among them. This site had no route for it, so all of
// them got the 404 page: an HTML document, served where an image
// was expected, which is one of the two reasons the tab was blank.
//
// It serves the logo's own bytes rather than the padded SVG. The
// extension is a lie either way - nothing here is a Windows ICO -
// but Content-Type is what a client actually reads, and a PNG
// declared as a PNG is understood by everything, including the
// handful of old surfaces that would decline an SVG. The padded
// version is the one the document links to, and it is what any
// client that understands `type="image/svg+xml"` will prefer.
// ==========================================
export async function handleFavicon(url, request, gameId, requestId, GAMES, env) {
  const fallback = () => Response.redirect(new URL(CONFIG.AMIR_LOGO, url.origin).toString(), 302)

  const key = logoKey()
  const bucket = env && env.ASSETS
  if (!key || !bucket) return fallback()

  try {
    const object = await bucket.get(key)
    if (!object) {
      logWarning('Favicon: logo object missing in R2', { requestId, key })
      return fallback()
    }

    const extension = key.slice(key.lastIndexOf('.') + 1).toLowerCase()
    const type = object.httpMetadata?.contentType || MIME[extension] || 'image/png'

    return new Response(object.body, {
      status: 200,
      headers: {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=86400',
        'ETag': object.httpEtag
      }
    })
  } catch (error) {
    logWarning('Favicon: falling back to the raw logo', { requestId, error: error.message })
    return fallback()
  }
}


// ==========================================
// handleWebManifest
// GET /site.webmanifest
//
// What an Android launcher reads when somebody adds the site to
// their home screen, and one more machine-readable place the site
// states its own name.
//
// `purpose: "maskable"` is the whole reason the manifest is worth
// having here: it tells a launcher that this icon already carries
// its own safe area, so the launcher may crop it to whatever shape
// the device uses without adding padding of its own on top - which
// is what turns a logo into a postage stamp floating in a circle.
// ==========================================
export function handleWebManifest() {
  const manifest = {
    name: 'AmirCollider',
    short_name: 'AmirCollider',
    description: CONFIG.SITE_TAGLINE.en,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: CONFIG.ICON_BG,
    theme_color: CONFIG.ICON_BG,
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any maskable'
      },
      {
        src: CONFIG.AMIR_LOGO,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any'
      }
    ]
  }

  return new Response(JSON.stringify(manifest, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=86400'
    }
  })
}
