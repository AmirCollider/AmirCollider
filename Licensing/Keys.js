// ==========================================
// Licensing/Keys.js
// Licence key format, generation, normalisation and
// hashing.
//
// Format:
//
//     DSNAP-7QK4M-2XZH9-B3TFR
// ==========================================


// ==========================================
// Alphabet
// Crockford base32: no I, L, O or U.
// ==========================================
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

const PREFIX = 'DSNAP'
const GROUPS = 3
const GROUP_SIZE = 5
const PAYLOAD_LENGTH = GROUPS * GROUP_SIZE   // 15, checksum included


// ==========================================
// normalizeKey
// Whatever somebody pasted, turned into the canonical
// form this system hashes.
// ==========================================
export function normalizeKey(raw) {
  if (typeof raw !== 'string') return ''

  const bare = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!bare) return ''

  if (!bare.startsWith(PREFIX) || bare.length !== PREFIX.length + PAYLOAD_LENGTH) {
    // Passed through unchanged rather than reshaped. A value
    // that is not key-shaped should reach the lookup and be
    // rejected with a real reason, not be padded into
    // something that looks canonical and is not.
    return bare
  }

  const payload = bare.slice(PREFIX.length)
  const groups = []
  for (let i = 0; i < GROUPS; i++) groups.push(payload.slice(i * GROUP_SIZE, (i + 1) * GROUP_SIZE))
  return PREFIX + '-' + groups.join('-')
}


// ==========================================
// isWellFormed
// Whether a normalised key could possibly be one of
// ours: right shape, right alphabet, checksum agrees.
// ==========================================
export function isWellFormed(normalized) {
  if (typeof normalized !== 'string') return false

  const bare = normalized.replace(/-/g, '')
  if (!bare.startsWith(PREFIX)) return false
  if (bare.length !== PREFIX.length + PAYLOAD_LENGTH) return false

  const payload = bare.slice(PREFIX.length)
  for (const ch of payload) {
    if (ALPHABET.indexOf(ch) === -1) return false
  }

  return payload[PAYLOAD_LENGTH - 1] === checksumChar(payload.slice(0, PAYLOAD_LENGTH - 1))
}


// ==========================================
// checksumChar
// One character derived from the other fourteen.
// ==========================================
function checksumChar(body) {
  let sum = 0
  for (let i = 0; i < body.length; i++) {
    sum += (ALPHABET.indexOf(body[i]) + 1) * (i + 2)
  }
  return ALPHABET[sum % ALPHABET.length]
}


// ==========================================
// generateKey
// One fresh key, from the platform CSPRNG.
// ==========================================
export function generateKey() {
  const body = []
  const bytes = new Uint8Array(64)
  let cursor = bytes.length

  while (body.length < PAYLOAD_LENGTH - 1) {
    if (cursor >= bytes.length) {
      crypto.getRandomValues(bytes)
      cursor = 0
    }
    const value = bytes[cursor++]
    if (value >= 256 - (256 % ALPHABET.length)) continue
    body.push(ALPHABET[value % ALPHABET.length])
  }

  const payload = body.join('') + checksumChar(body.join(''))
  const groups = []
  for (let i = 0; i < GROUPS; i++) groups.push(payload.slice(i * GROUP_SIZE, (i + 1) * GROUP_SIZE))
  return PREFIX + '-' + groups.join('-')
}


// ==========================================
// generateBatch
// `count` distinct keys.
// ==========================================
export function generateBatch(count) {
  const keys = new Set()
  const ceiling = count * 4 + 16   // bounded so a broken RNG cannot spin forever
  let attempts = 0

  while (keys.size < count && attempts < ceiling) {
    keys.add(generateKey())
    attempts++
  }
  return [...keys]
}


// ==========================================
// hashKey
// The value actually stored: SHA-256 of the normalised
// key, as lowercase hex.
// ==========================================
export async function hashKey(normalized) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}


// ==========================================
// publicLabel
// The support-safe fragment of a key: first group and
// last group, middle elided.
//
//     DSNAP-7QK4M-2XZH9-B3TFR  ->  DSNAP-7QK4M-…-B3TFR
//
// Enough for a human to match what a customer read out
// against a row; five characters short of enough to
// use.
// ==========================================
export function publicLabel(normalized) {
  const parts = normalizeKey(normalized).split('-')
  if (parts.length < 4) return normalized.slice(0, 12)
  return `${parts[0]}-${parts[1]}-…-${parts[parts.length - 1]}`
}


// ==========================================
// hashIp
// A caller identity for rate limiting that is not an
// address.
// ==========================================
export async function hashIp(ip) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('license-attempt|' + (ip || 'unknown')))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}
