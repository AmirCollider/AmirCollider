// ==========================================
// pages/video.js
// Streaming the Unity DocSnap demo clips out of R2.
//
// Public entry points (wired in worker.js ROUTES):
//   GET  /video/{lang}/{id}    the clip itself
//   HEAD /video/{lang}/{id}    size and type only
//
// This is a separate handler from /assets/ rather than a
// widening of it, and the reason is one line of that one:
// it refuses any key containing a slash. That guard is
// exactly right for a flat bucket of logos and exactly
// wrong for video files that live in per-language folders,
// and loosening it would have re-opened path traversal on
// the route that serves everything else.
//
// Here the caller never supplies a key at all. It supplies
// a language and a clip number, both of which are matched
// against a fixed catalogue, and the key is assembled from
// what the catalogue says. There is no string from the
// request in the R2 lookup, so there is nothing to escape.
//
// The other thing this route does that /assets/ does not is
// answer Range requests. A <video> element does not
// download an MP4 and then play it - it asks for the first
// few hundred kilobytes, reads the moov atom, and then asks
// for byte ranges as the user scrubs. Serve it a flat 200
// with the whole body and seeking either stalls or silently
// does nothing, which looks like a broken player rather
// than a missing feature.
// ==========================================

import {
  VIDEOS, VIDEO_LANGS,
  objectCandidatesFor, prefixCandidatesFor
} from '../content/docsnapVideos.js'
import { createJsonResponse, logWarning } from '../utils.js'


// ==========================================
// Resolution cache
// language|id -> the R2 key that worked, or null for
// "swept the folders and it genuinely is not there".
//
// Module-level, so it lives for the isolate's lifetime and
// is shared by every request that isolate serves. Safe to
// cache because the mapping is immutable in practice: the
// clips are uploaded once and the catalogue is code. The
// worst case after a re-upload under a new name is one
// isolate serving 404s until it recycles, which is minutes,
// against saving a listing on every single video request.
//
// Negative results are cached deliberately. A missing clip
// is the case that costs the most to discover - candidate
// misses plus a full prefix sweep - and it is also the case
// a crawler will hit over and over.
// ==========================================
const resolved = new Map()


// ==========================================
// findVideo
// The catalogue entry for a language and id, or null.
//
// Checks the clip's own language list rather than just the
// number, so /video/fa/10 - the one clip that was never
// recorded in Persian - is a clean 404 rather than a lookup
// that sweeps three folders to discover the same thing.
// ==========================================
function findVideo(lang, id) {
  if (VIDEO_LANGS.indexOf(lang) === -1) return null

  const numeric = parseInt(id, 10)
  if (!Number.isFinite(numeric)) return null

  const video = VIDEOS.find(item => item.id === numeric)
  if (!video || video.langs.indexOf(lang) === -1) return null

  return video
}


// ==========================================
// resolveKey
// The R2 key holding this clip.
//
// Two passes, cheapest first:
//
//   1. Try the keys the catalogue predicts. A head() per
//      candidate, and in the normal case the first one hits.
//
//   2. If none did, list each candidate folder and look for
//      an object whose file name starts with the clip
//      number. This is what makes the route survive a file
//      that was uploaded as "02 What Changed-FA.mp4" or
//      "02_What_Changed.mp4" - anything at all, as long as
//      it begins with the two digits and sits in a folder
//      we know about.
//
// The sweep is bounded by prefix rather than run over the
// whole bucket: the bucket also holds the site's images,
// and a listing that had to page through those to find a
// video would be slow in exactly the case where something
// is already wrong.
// ==========================================
async function resolveKey(bucket, lang, video) {
  const cacheKey = lang + '|' + video.id
  if (resolved.has(cacheKey)) return resolved.get(cacheKey)

  for (const candidate of objectCandidatesFor(lang, video)) {
    const head = await bucket.head(candidate)
    if (head) {
      resolved.set(cacheKey, candidate)
      return candidate
    }
  }

  const wanted = String(video.id).padStart(2, '0')
  for (const prefix of prefixCandidatesFor(lang)) {
    const listing = await bucket.list({ prefix, limit: 1000 })
    for (const object of listing.objects || []) {
      const name = object.key.slice(object.key.lastIndexOf('/') + 1)
      // Anchored on the number and the extension, and nothing
      // in between. Matching loosely on the title as well would
      // mean a re-cut clip with a tweaked name stops resolving,
      // which is the failure this pass exists to prevent.
      if (name.startsWith(wanted) && name.toLowerCase().endsWith('.mp4')) {
        resolved.set(cacheKey, object.key)
        return object.key
      }
    }
  }

  resolved.set(cacheKey, null)
  return null
}


// ==========================================
// rangeFor
// What the client asked for, as R2 understands it.
//
// The binding accepts the request Headers directly and
// parses Range itself, which is both less code and less
// room to disagree with the spec than parsing "bytes=0-"
// by hand. Passed through only when a Range header is
// actually present: handing R2 a header set with no Range
// is a full-object read either way, but being explicit
// about which of the two cases we are in is what decides
// the status code below.
// ==========================================
function rangeFor(request) {
  return request.headers.get('Range') ? { range: request.headers } : {}
}


// ==========================================
// contentRange
// The Content-Range line for a partial response, and the
// number of bytes it covers.
//
// R2 reports what it actually served in `object.range`,
// which is either an offset/length pair or a suffix ("the
// last N bytes"). Both are converted to absolute positions
// here, because Content-Range only speaks absolute - and a
// suffix range echoed back as a suffix is a header a
// browser will reject and a player will treat as a stall.
// ==========================================
function contentRange(object) {
  const size = object.size
  const served = object.range || {}

  let start
  let length

  if (typeof served.suffix === 'number') {
    length = Math.min(served.suffix, size)
    start = size - length
  } else {
    start = typeof served.offset === 'number' ? served.offset : 0
    length = typeof served.length === 'number' ? served.length : size - start
  }

  const end = start + length - 1
  return { header: `bytes ${start}-${end}/${size}`, length }
}


// ==========================================
// handleDocSnapVideo
// One clip, whole or in part.
// ==========================================
export async function handleDocSnapVideo(url, request, gameId, requestId, GAMES, env) {
  const parts = url.pathname.split('/').filter(Boolean)   // ['video', lang, id]
  const video = findVideo(parts[1], parts[2])
  if (!video) {
    return createJsonResponse({ error: 'video_not_found', message: 'No such clip.', requestId }, 404)
  }

  const bucket = env.ASSETS
  if (!bucket) {
    return createJsonResponse({ error: 'r2_not_bound', message: 'R2 binding "ASSETS" not found', requestId }, 500)
  }

  const key = await resolveKey(bucket, parts[1], video)
  if (!key) {
    // Logged rather than swallowed. A clip that resolves in one
    // language and not another is an upload that half happened,
    // and it is invisible from the outside - the page just shows
    // one card that does nothing.
    logWarning('Video object missing in R2', { requestId, lang: parts[1], id: video.id })
    return createJsonResponse({ error: 'video_not_found', message: 'No such clip.', requestId }, 404)
  }

  const object = await bucket.get(key, rangeFor(request))
  if (!object) {
    // The head/list above said it was there. Between then and
    // now it was deleted, or the cached key is stale - either
    // way the cache entry is a lie and is dropped so the next
    // request re-resolves instead of repeating this.
    resolved.delete(parts[1] + '|' + video.id)
    return createJsonResponse({ error: 'video_not_found', message: 'No such clip.', requestId }, 404)
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('Content-Type', object.httpMetadata?.contentType || 'video/mp4')
  headers.set('ETag', object.httpEtag)
  headers.set('Accept-Ranges', 'bytes')

  // A week rather than a year, and not immutable. These clips
  // get re-cut - a typo in a caption, a slower cursor - and an
  // immutable year on a URL that has no content hash in it
  // means the fix reaches nobody who already watched.
  headers.set('Cache-Control', 'public, max-age=604800')

  let status = 200
  if (request.headers.get('Range') && object.range) {
    const { header, length } = contentRange(object)
    headers.set('Content-Range', header)
    headers.set('Content-Length', String(length))
    status = 206
  } else {
    headers.set('Content-Length', String(object.size))
  }

  // A HEAD is answered with the same headers and no body, which
  // is what lets a player learn the size and type before
  // committing to a download.
  const body = request.method === 'HEAD' ? null : object.body
  return new Response(body, { status, headers })
}
