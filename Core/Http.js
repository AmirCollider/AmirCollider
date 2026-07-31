// ==========================================
// Core/Http.js
// Response builders. Every response leaves through one of these,
// so the shared CORS and security header set is applied once.
// ==========================================

import { SECURITY, CONFIG, CORS_HEADERS } from '../Config.js'

function respond(body, status, contentType, additionalHeaders) {
  return new Response(body, {
    status,
    headers: {
      ...CORS_HEADERS,
      ...SECURITY.SECURE_HEADERS,
      'Content-Type': contentType,
      ...additionalHeaders
    }
  })
}

export function createJsonResponse(data, status = 200, additionalHeaders = {}) {
  return respond(JSON.stringify(data, null, 2), status, 'application/json; charset=utf-8', additionalHeaders)
}

export function createHtmlResponse(html, status = 200, additionalHeaders = {}) {
  return respond(html, status, 'text/html; charset=utf-8', additionalHeaders)
}

export function create404Response(requestId) {
  return createJsonResponse({
    error: 'not_found',
    message: 'Endpoint not found',
    version: CONFIG.VERSION,
    requestId
  }, 404)
}

/**
 * A generic, non-leaking failure. The underlying error is expected to have
 * been logged by the caller under the same requestId.
 */
export function createErrorResponse(requestId) {
  return createJsonResponse({
    error: 'internal_error',
    message: 'An unexpected error occurred. Please try again later.',
    version: CONFIG.VERSION,
    timestamp: new Date().toISOString(),
    requestId
  }, 500)
}

/** The caller's IP as Cloudflare reports it. */
export function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown'
}

/**
 * Compares two strings without leaking their contents through timing.
 * Length is compared first and does leak, which is acceptable: the
 * secrets this guards are fixed-length.
 */
export function timingSafeEqual(a, b) {
  const left = String(a || '')
  const right = String(b || '')
  if (left.length !== right.length) return false

  let diff = 0
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i)
  return diff === 0
}
