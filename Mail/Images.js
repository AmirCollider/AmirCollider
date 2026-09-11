// ==========================================
// Mail/Images.js
//
// One place that decides what counts as an image and where an
// image goes.
//
// There are three callers and they used to be one, two and none:
//
//   Pages/Contact.js      a visitor attaches a screenshot to the
//                         public form
//   Mail/Inbound.js       somebody emails the address a photo
//   Api/MailApi.js        the operator drops an image into a
//                         message they are composing
//
// The first had a magic-byte check and an R2 write; the second
// noted the filename and threw the bytes away, which is why a
// received photo showed in the panel as the words "1 attachment";
// the third could only take a URL somebody typed. Three answers to
// one question is how a check gets tightened in one place and left
// alone in the other two, so the answer lives here.
//
// Storage is R2, never a data URI in the row. A 4 MB photo
// base64-encoded into an HTML body is a 5.3 MB database row in a
// table that is read on every list render, and most mail clients
// refuse to display a data URI anyway - so an inlined image is
// both expensive here and invisible there.
// ==========================================

import { CONFIG } from '../Config.js'
import { logWarning } from '../Core/Logging.js'


// ==========================================
// What an image is allowed to be.
//
// The declared type AND the first bytes have to agree. A declared
// type is whatever the browser or the sending mail client said;
// the first bytes are what the file actually is, and accepting an
// executable because it claimed to be a PNG is the whole reason
// to look at them.
// ==========================================
const MAGIC = [
  { type: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { type: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { type: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },

  // WebP is "RIFF....WEBP". The first four are enough here because
  // the declared type has to agree as well.
  { type: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] }
]

export const IMAGE_TYPES = MAGIC.map(entry => entry.type)


// ==========================================
// looksLikeImage
// ==========================================
export function looksLikeImage(declared, head) {
  const match = MAGIC.find(entry => entry.type === String(declared || '').toLowerCase())
  if (!match) return false
  return match.bytes.every((byte, index) => head[index] === byte)
}


// ==========================================
// imageExtension
//
// The extension the stored object gets. Never the sender's - an
// uploaded or emailed filename is text somebody else wrote and it
// would otherwise become a path in a bucket.
// ==========================================
export function imageExtension(type) {
  const sub = String(type || '').split('/')[1] || 'bin'
  return sub.replace('jpeg', 'jpg')
}


// ==========================================
// putImage
//
// Writes one image and returns what the caller needs to show it,
// or null if it is not an image, is too big, or the bucket is not
// bound. Never throws: every caller here is on a path where a
// failure has to degrade rather than fail - a photo that cannot be
// stored must still leave the message readable, and on the inbound
// path a thrown error is a BOUNCE back to the sender.
// ==========================================
export async function putImage(env, { bytes, type, prefix, retentionMs, requestId, maxBytes }) {
  const bucket = env && env.ASSETS
  if (!bucket || !bytes || !bytes.length) return null

  // maxBytes lets a caller be stricter than the mailbox is.
  // A brand logo is drawn at 44 by 44 pixels and is inlined
  // into every page of an export, so it has nothing like a
  // mail attachment's budget - but WHAT counts as an image,
  // and where it goes, stays this file's answer.
  const limit = maxBytes || CONFIG.MAIL.MAX_IMAGE_BYTES
  if (bytes.length > limit) {
    logWarning('Image skipped: too large', { requestId, size: bytes.length, limit })
    return null
  }
  if (!looksLikeImage(type, bytes.subarray(0, 8))) return null

  const key = String(prefix || CONFIG.MAIL.IMAGE_PREFIX)
    + new Date().toISOString().slice(0, 10) + '/'
    + crypto.randomUUID() + '.' + imageExtension(type)

  try {
    await bucket.put(key, bytes, {
      httpMetadata: { contentType: type },

      // The expiry a sweep reads. R2 has no TTL of its own, so
      // this is a note for whatever eventually deletes these
      // rather than something enforced here.
      customMetadata: {
        expiresAt: String(Date.now() + (retentionMs || CONFIG.MAIL.IMAGE_RETENTION_MS))
      }
    })
  } catch (error) {
    logWarning('Mail image not stored', { requestId, error: error.message })
    return null
  }

  return {
    key,
    type,
    size: bytes.length,

    // Absolute, always. This URL is written into an HTML body that
    // is read in the panel, in the recipient's mail client and in
    // whatever forwards it afterwards - none of which resolve a
    // site-relative path against this site.
    url: CONFIG.SITE_URL + '/assets/' + key
  }
}


// ==========================================
// base64ToBytes
//
// Used by both the compose upload (the browser sends a data URI)
// and the MIME parser (a base64 part). Tolerant of the line breaks
// and whitespace both of those arrive with, and returns an empty
// array rather than throwing on anything it cannot read - see the
// note on putImage about what a throw costs on the inbound path.
// ==========================================
export function base64ToBytes(input) {
  const clean = String(input || '').replace(/[^A-Za-z0-9+/=]/g, '')
  if (!clean) return new Uint8Array(0)
  try {
    const binary = atob(clean)
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
    return out
  } catch (error) {
    return new Uint8Array(0)
  }
}
