// ==========================================
// licensing/keys.js
// Licence key format, generation, normalisation and
// hashing.
//
// One file owns the shape of a key, because three
// separate places have to agree on it byte for byte:
// the generator that fills Sell.app's serial pool, the
// lookup that verifies an activation, and the Unity
// Editor's own normaliser. A disagreement between any
// two of them looks, to a customer, exactly like
// "I paid and my key doesn't work".
//
// Format:
//
//     DSNAP-7QK4M-2XZH9-B3TFR
//
// Fifteen characters of payload in three groups, from a
// 32-symbol alphabet, prefixed so a key is recognisable
// on sight in an email. The last character is a
// checksum, which is what makes a typo say "check that
// key" instead of "invalid licence" - the difference
// between a customer fixing it themselves and a
// customer emailing.
// ==========================================


// ==========================================
// Alphabet
// Crockford base32: no I, L, O or U.
//
// I/1, O/0 and L/1 are the pairs people actually
// mistype when copying from a receipt, and U is dropped
// because excluding it means no random key can spell an
// English obscenity. A key is something a human reads
// aloud over a support call at least once.
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
//
// Keys arrive from an email client that helpfully
// lowercased them, from a PDF receipt that turned the
// hyphens into en dashes, from a password manager that
// appended a newline, and from a chat window that broke
// the line in the middle. Every one of those is the
// same key. Stripping to [A-Z0-9] and re-grouping makes
// all of them identical before anything is compared, so
// none of them becomes a support ticket.
//
// Deliberately identical to DocSnapLicenseClient.NormalizeKey
// in the Unity package. If one side ever changes, keys
// stop matching and the failure is silent on the way in
// and loud on the way out.
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
//
// Checked before the database is touched. A malformed
// key is the overwhelmingly common failure (a typo, a
// truncated paste) and answering it from arithmetic
// rather than from a query means the abuse path costs
// an attacker a round trip and costs the database
// nothing.
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
//
// Weighted so that transposing two adjacent characters
// changes the result - an unweighted sum would not, and
// swapping two characters is the second most common way
// a hand-copied key goes wrong after mistyping one.
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
//
// crypto.getRandomValues, not Math.random. The whole
// value of a pre-generated pool is that a key cannot be
// guessed from another one, and Math.random in a
// Worker is a seeded PRNG whose output stream is
// recoverable from a handful of samples - which, for a
// pool loaded into a public storefront, would mean
// anybody who bought one key could compute the rest.
//
// Rejection sampling on the random byte rather than a
// modulo. 256 is not a multiple of 32 only in the sense
// that it is - it is, so the modulo would be uniform
// here - but writing the biased version and relying on
// that coincidence is how the next person who changes
// the alphabet length introduces a bias nobody notices.
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
//
// The Set is not paranoia about the CSPRNG; it is about
// the consequence. Two identical serials in Sell.app's
// pool means two customers are handed the same key, the
// second one activates into a seat the first already
// holds, and the failure surfaces as a refund request
// rather than as a log line. Cheap to prevent, so it is
// prevented.
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
//
// Storing the hash rather than the key means a leak of
// this database hands over nothing usable. The cost is
// that a lost key cannot be looked up and re-read to a
// customer - it has to be re-issued, which is one
// command and also revokes the old one. That trade is
// the right way round: re-issuing is an inconvenience,
// a dumped table of live serials for a paid product is
// not.
//
// No salt, deliberately. A salt defends against
// precomputation, and there is nothing to precompute:
// the input is 75 bits of CSPRNG output, not a password
// somebody chose.
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
//
// The attempts table only ever needs to answer "have I
// seen this caller recently?", and a hash answers that
// exactly as well as the address does. Keeping raw IPs
// in a database for that would be collecting personal
// data to solve a counting problem.
// ==========================================
export async function hashIp(ip) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('license-attempt|' + (ip || 'unknown')))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}
