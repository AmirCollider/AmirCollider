// ==========================================
// Commerce/Seal.js
// The three cryptographic chores the checkout needs, and
// nothing else.
//
// Public exports:
//   sealKey(env, plaintext)      -> opaque string for D1
//   unsealKey(env, sealed)       -> plaintext, or null
//   signOrderToken(env, orderId) -> "<id>.<sig>"
//   readOrderToken(env, token)   -> orderId, or null
//   hashEmail(email)             -> lookup handle
//   verifyIpnSignature(secret, rawBody, header) -> boolean
// ==========================================

import { timingSafeEqual } from '../Core/Http.js'

const encoder = new TextEncoder()
const decoder = new TextDecoder()


// ==========================================
// base64 helpers
// ==========================================
function toBase64(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('')
}


// ==========================================
// deriveKey
// A CryptoKey from a text secret, for one purpose.
// ==========================================
async function deriveKey(secret, purpose, algorithm, usages) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(purpose + '|' + secret))
  return crypto.subtle.importKey('raw', digest, algorithm, false, usages)
}


// ==========================================
// secretFor
// The environment value backing a purpose, or a throw that
// names the variable.
// ==========================================
function secretFor(env, name) {
  const value = env && env[name]
  if (!value) throw new Error(name + ' is not set on this Worker')
  return String(value)
}


// ==========================================
// sealKey
// A licence key, encrypted for storage in D1.
// ==========================================
export async function sealKey(env, plaintext) {
  const secret = secretFor(env, 'DOCSNAP_KEY_WRAP_SECRET')
  const key = await deriveKey(secret, 'docsnap-key-seal', { name: 'AES-GCM' }, ['encrypt'])

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext))

  const packed = new Uint8Array(iv.length + ciphertext.byteLength)
  packed.set(iv, 0)
  packed.set(new Uint8Array(ciphertext), iv.length)

  return 'v1.' + toBase64(packed)
}


// ==========================================
// unsealKey
// The plaintext back, or null.
// ==========================================
export async function unsealKey(env, sealed) {
  if (typeof sealed !== 'string' || !sealed.startsWith('v1.')) return null

  try {
    const secret = secretFor(env, 'DOCSNAP_KEY_WRAP_SECRET')
    const key = await deriveKey(secret, 'docsnap-key-seal', { name: 'AES-GCM' }, ['decrypt'])

    const packed = fromBase64(sealed.slice(3))
    const iv = packed.slice(0, 12)
    const body = packed.slice(12)

    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, body)
    return decoder.decode(plaintext)
  } catch {
    return null
  }
}


// ==========================================
// signOrderToken
// The handle that opens one order's status page.
// ==========================================
export async function signOrderToken(env, orderId) {
  const secret = secretFor(env, 'DOCSNAP_ORDER_SECRET')
  const key = await deriveKey(secret, 'docsnap-order-token', { name: 'HMAC', hash: 'SHA-256' }, ['sign'])

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(orderId))
  // Base64url and truncated to 32 characters: 24 bytes of tag,
  // which is far past what an unguessable handle needs and far
  // short of a URL nobody can paste into a support email.
  const tag = toBase64(new Uint8Array(signature))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    .slice(0, 32)

  return orderId + '.' + tag
}


// ==========================================
// readOrderToken
// The order id inside a token, if the signature holds.
// ==========================================
export async function readOrderToken(env, token) {
  if (typeof token !== 'string') return null

  const cut = token.lastIndexOf('.')
  if (cut <= 0) return null

  const orderId = token.slice(0, cut)
  const expected = await signOrderToken(env, orderId)
  return timingSafeEqual(expected, token) ? orderId : null
}


// ==========================================
// hashEmail
// A stable handle for an address, for lookup.
// ==========================================
export async function hashEmail(email) {
  const normalized = String(email || '').trim().toLowerCase()
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode('docsnap-order|' + normalized)))
}


// ==========================================
// sortDeep
// An object with every key ordered, recursively.
// ==========================================
function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep)
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((out, key) => {
      out[key] = sortDeep(value[key])
      return out
    }, {})
  }
  return value
}


// ==========================================
// verifyIpnSignature
// Whether a callback really came from the payment provider.
// ==========================================
export async function verifyIpnSignature(secret, rawBody, presented) {
  if (!secret || !presented) return false

  try {
    const parsed = JSON.parse(rawBody)
    const canonical = JSON.stringify(sortDeep(parsed))

    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(String(secret)),
      { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']
    )
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(canonical))

    return timingSafeEqual(toHex(signature), String(presented).trim().toLowerCase())
  } catch {
    return false
  }
}
