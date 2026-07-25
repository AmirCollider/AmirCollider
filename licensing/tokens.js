// ==========================================
// licensing/tokens.js
// Signing the offline proof-of-licence the Unity Editor
// carries.
//
// Shape (verified by DocSnapLicenseToken.cs):
//
//     base64url(payload JSON) "." base64url(signature)
//
// RSASSA-PKCS1-v1_5 over SHA-256, signed with a private
// key that exists only in this Worker's encrypted
// environment. The matching public key is compiled into
// the Unity package, so an activated Editor verifies its
// own licence with no network at all.
//
// Asymmetric rather than an HMAC, and that choice is the
// point of the file. An HMAC would be simpler and would
// need the same secret on both sides - which means
// shipping the signing secret inside a C# file in every
// customer's project, where anybody could read it and
// mint themselves a licence. With RSA the Editor holds
// only the half that checks.
//
// It does not make the gate uncrackable: the package is
// source, so the check can be edited out. It makes the
// SERVER uncrackable, which is the part that matters -
// nobody can forge a token, so nobody can build a
// working keygen from what ships.
// ==========================================

// How long a token is valid without the Editor reaching
// the server again.
//
// Forty-five days is chosen from what the offline period
// has to survive: a holiday, a contract with no VPN
// access, a laptop that only opens Unity on weekends. The
// Editor renews at twenty days remaining whenever it
// happens to be online, so in normal use it never gets
// close - the window exists for the abnormal weeks.
//
// It is not zero for one reason: an expiry is what makes
// revocation possible at all. A token that never expired
// would mean a refunded key kept working forever on the
// machine that already activated it.
const TOKEN_LIFETIME_DAYS = 45


// ==========================================
// base64url helpers
// ==========================================
function toBase64Url(bytes) {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64(value) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}


// ==========================================
// importPrivateKey
// The signing key, read from the environment as base64
// PKCS#8 DER.
//
// Deliberately not cached across requests. A Worker
// isolate is reused for many requests and a module-level
// CryptoKey would live in it for the isolate's whole
// lifetime; importing per signature costs well under a
// millisecond and happens a few times per sale, so there
// is nothing to buy with the risk.
//
// A missing or malformed key throws with a message
// naming the variable. This fails at exactly one moment
// - the first activation after a deploy that forgot the
// secret - and "cannot read properties of undefined" at
// that moment is a bad twenty minutes.
// ==========================================
async function importPrivateKey(env) {
  const pem = env && env.DOCSNAP_LICENSE_PRIVATE_KEY
  if (!pem) {
    throw new Error('DOCSNAP_LICENSE_PRIVATE_KEY is not set on this Worker')
  }

  // Tolerates both a raw base64 blob and a pasted PEM, because
  // both are things a person will reasonably put into
  // `wrangler secret put`.
  const base64 = String(pem)
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '')

  let der
  try {
    der = fromBase64(base64)
  } catch {
    throw new Error('DOCSNAP_LICENSE_PRIVATE_KEY is not valid base64 PKCS#8')
  }

  return crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
}


// ==========================================
// signToken
// The token for one activated machine.
//
// Field names are single letters because this string is
// stored in EditorPrefs on every customer's machine and
// re-sent on every renewal; there is no reader that
// benefits from `machineId` over `m`.
//
// What is NOT in the payload: the licence key. Only its
// masked label. A token is a bearer credential for one
// machine, and a machine-bound bearer credential that
// also carries the key it came from would turn a leaked
// token into a leaked key.
// ==========================================
export async function signToken(env, { product, tier, keyLabel, machineId }) {
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    v: 1,
    p: product,
    t: tier,
    k: keyLabel,
    m: machineId,
    iat: now,
    exp: now + TOKEN_LIFETIME_DAYS * 24 * 60 * 60
  }

  const encodedPayload = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)))

  const key = await importPrivateKey(env)
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    // ASCII of the encoded payload, not the raw JSON. The
    // Editor verifies over exactly the bytes it received, so
    // it never has to re-serialise the JSON to check the
    // signature - which would make the check depend on two
    // implementations agreeing on key order and whitespace.
    new TextEncoder().encode(encodedPayload)
  )

  return encodedPayload + '.' + toBase64Url(new Uint8Array(signature))
}

export const TOKEN_LIFETIME = TOKEN_LIFETIME_DAYS
