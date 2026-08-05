// ==========================================
// Api/AssetApi.js
// GET /assets/<key> - immutable objects from the bound R2 bucket.
// ==========================================

import { createJsonResponse } from '../Core/Http.js'

const CONTENT_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon'
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

export async function handleAsset(url, request, gameId, requestId, GAMES, env) {
  const key = decodeKey(url.pathname.replace('/assets/', ''))
  if (!key || key.includes('..') || key.includes('/')) {
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

  return new Response(object.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'ETag': object.httpEtag
    }
  })
}
