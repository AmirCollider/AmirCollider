// ==========================================
// Licensing/Tokens.js
// Signing the offline proof-of-licence the Unity Editor
// carries.
//
// Shape (verified by DocSnapLicenseToken.cs):
//
//     base64url(payload JSON) "." base64url(signature)
// ==========================================

// How long a token is valid without the Editor reaching
// the server again.
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
