// ==========================================
// commerce/seal.js
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
//
// Kept in one small file rather than inlined at the call
// sites, because every one of these is a thing that is
// easy to write in a way that looks right and is not - a
// comparison that returns early, an IV that repeats, a
// signature checked over the parsed object instead of the
// bytes. Written once, they can be got right once.
// ==========================================

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
// constantTimeEqual
// Comparison whose duration does not depend on where two
// strings first differ.
//
// Used for the IPN signature and the order token. A plain
// === on either would let a caller learn the correct value
// one character at a time by timing the answer, which for
// the IPN signature means forging a "payment finished"
// callback and being sent a licence key for free.
// ==========================================
function constantTimeEqual(a, b) {
  const left = String(a || '')
  const right = String(b || '')
  if (left.length !== right.length) return false

  let diff = 0
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i)
  return diff === 0
}


// ==========================================
// deriveKey
// A CryptoKey from a text secret, for one purpose.
//
// SHA-256 of "purpose|secret" rather than the secret's own
// bytes, so the same environment variable can back both the
// sealing key and a signing key without either being usable
// to attack the other. Not a KDF with a work factor, and it
// does not need to be: the input is a random secret the
// operator generated, not a password somebody chose.
// ==========================================
async function deriveKey(secret, purpose, algorithm, usages) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(purpose + '|' + secret))
  return crypto.subtle.importKey('raw', digest, algorithm, false, usages)
}


// ==========================================
// secretFor
// The environment value backing a purpose, or a throw that
// names the variable.
//
// Named in the message on purpose. Every one of these fails
// at exactly one moment - the first sale after a deploy that
// forgot a secret - and the operator reading that log line
// is having a bad five minutes already.
// ==========================================
function secretFor(env, name) {
  const value = env && env[name]
  if (!value) throw new Error(name + ' is not set on this Worker')
  return String(value)
}


// ==========================================
// sealKey
// A licence key, encrypted for storage in D1.
//
// AES-GCM with a fresh 12-byte IV per call, stored in front
// of the ciphertext. GCM rather than CBC because the tag
// makes a tampered row fail to open rather than open into
// garbage, and a fresh IV every time because re-using one
// under the same key is the mistake that turns AES-GCM from
// strong into broken.
//
// The output is "v1." + base64(iv || ciphertext||tag). The
// version prefix costs three characters and means a future
// change of algorithm can be rolled out without a migration
// that has to decrypt every historical row first.
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
//
// Null rather than a throw for every failure - wrong
// version, corrupt base64, wrong secret, tampered tag -
// because every caller wants the same thing from all four:
// treat this order as though the key were already wiped and
// fall back to re-issuing. A throw would turn a rotated
// secret into a 500 on the customer's "resend my key"
// button.
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
//
// An order id alone would do the job and would also be
// enumerable: they are sequential in time and a customer
// who has one could read the next person's address and
// masked key by editing a URL. Signing it means a valid
// token can only come from us, and costs one HMAC.
//
// Not an expiry-bearing token, deliberately. It is the link
// in a customer's browser history and in the receipt email,
// and it has to still work in three weeks when they come
// back looking for the key they lost.
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
  return constantTimeEqual(expected, token) ? orderId : null
}


// ==========================================
// hashEmail
// A stable handle for an address, for lookup.
//
// Lowercased first, because "Amir@x.com" and "amir@x.com"
// are the same inbox and a customer typing their address
// into the order-recovery form will not reproduce their own
// capitalisation.
//
// Unsalted: the point is to look a row up by an address
// somebody just typed, which a salt would prevent. It is a
// lookup index, not a defence - the address is in the row
// next to it in the clear, because we have to send mail to
// it.
// ==========================================
export async function hashEmail(email) {
  const normalized = String(email || '').trim().toLowerCase()
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode('docsnap-order|' + normalized)))
}


// ==========================================
// sortDeep
// An object with every key ordered, recursively.
//
// Only exists to reproduce, byte for byte, what NOWPayments
// hashed on their side. Their IPN signature is taken over
// JSON.stringify of the sorted payload, so verifying it
// means serialising the same structure the same way - the
// raw body we received cannot be used directly, because
// their key order and ours need not match.
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
//
// This is the load-bearing check of the entire checkout.
// Everything downstream of it - minting a key, emailing it -
// happens because a callback said a payment finished, and
// the callback URL is public. Without this, the URL IS the
// product: anybody who finds it posts a JSON body naming a
// tier and is sent a licence.
//
// HMAC-SHA512 over the sorted-and-re-serialised payload,
// which is what the provider documents and what their own
// SDK does. Compared in constant time, and false on any
// exception - a body that will not parse is not a body we
// act on.
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

    return constantTimeEqual(toHex(signature), String(presented).trim().toLowerCase())
  } catch {
    return false
  }
}
