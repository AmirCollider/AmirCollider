// ==========================================
// Pages/Video.js
// Streaming the Unity DocSnap demo clips out of R2.
//
// Public entry points (wired in Worker.js ROUTES):
//   GET  /video/{lang}/{id}    the clip itself
//   HEAD /video/{lang}/{id}    size and type only
// ==========================================

import {
  VIDEOS, VIDEO_LANGS,
  objectCandidatesFor, prefixCandidatesFor
} from '../Content/DocSnapVideos.js'
import { createJsonResponse } from '../Core/Http.js'
import { logWarning } from '../Core/Logging.js'


// ==========================================
// Resolution cache
// language|id -> the R2 key that worked, or null for
// "swept the folders and it genuinely is not there".
// ==========================================
const resolved = new Map()


// ==========================================
// findVideo
// The catalogue entry for a language and id, or null.
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
// ==========================================
function rangeFor(request) {
  return request.headers.get('Range') ? { range: request.headers } : {}
}


// ==========================================
// contentRange
// The Content-Range line for a partial response, and the
// number of bytes it covers.
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
