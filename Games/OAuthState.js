// ==========================================
// Games/OAuthState.js
// The signed value that survives a round trip through Google.
// ==========================================

import { timingSafeEqual } from '../Core/Http.js'

const encoder = new TextEncoder()
const decoder = new TextDecoder()


function base64UrlFromBytes(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function bytesFromBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}


// ==========================================
// getStateSecret
// The worker-wide signing secret.
//
// One variable, no fallback. This used to drop back to the first
// game's Google client secret, which meant the key protecting
// OAuth state against forgery was the same value we send to
// Google to prove who we are - two jobs for one secret, so
// rotating it for either reason broke the other, and a leak of it
// was a leak of both. Config.js requires STATE_SIGNING_SECRET at
// boot now, so an unset value never reaches this far.
// ==========================================
export function getStateSecret(GAMES, env) {
  return (env && env.STATE_SIGNING_SECRET) || ''
}


async function hmacSign(payload, secret) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return base64UrlFromBytes(new Uint8Array(signature))
}


export async function encodeState(data, secret) {
  const payload = base64UrlFromBytes(encoder.encode(JSON.stringify(data)))
  const signature = await hmacSign(payload, secret)
  return `${payload}.${signature}`
}


export async function decodeState(state, secret) {
  if (typeof state !== 'string' || state.indexOf('.') === -1) return { valid: false, data: null }

  const [payload, signature] = state.split('.')
  if (!payload || !signature) return { valid: false, data: null }

  const expected = await hmacSign(payload, secret)
  if (!timingSafeEqual(expected, signature)) return { valid: false, data: null }

  try {
    return { valid: true, data: JSON.parse(decoder.decode(bytesFromBase64Url(payload))) }
  } catch {
    return { valid: false, data: null }
  }
}


// ==========================================
// readClientStateHint
// Best-effort read of the state a CLIENT supplied.
// ==========================================
export function readClientStateHint(state) {
  if (!state) return null
  try {
    return JSON.parse(atob(state))
  } catch {
    return null
  }
}
