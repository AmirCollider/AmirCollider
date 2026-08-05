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

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" `
    + `viewBox="0 0 ${CANVAS} ${CANVAS}" width="${CANVAS}" height="${CANVAS}" role="img" `
    + `aria-label="AmirCollider">`
    + `<title>AmirCollider</title>`
    + `<image x="${inset}" y="${inset}" width="${box}" height="${box}" `
    + `preserveAspectRatio="xMidYMid meet" href="${dataUri}" xlink:href="${dataUri}"/>`
    + `</svg>`
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
