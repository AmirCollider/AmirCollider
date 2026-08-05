// ==========================================
// Core/PanelSession.js
// The operator panels' shared sign-in.
//
// /testsite and /thegod had a copy of this each - same cookie
// shape, same HMAC, same bug in both. One module now, because two
// panels behind two copies of one rule is two chances to fix only
// one of them.
//
// Public exports:
//   panelPassword(env, name)                 the secret, resolved
//   issuePanelCookie(...)                    the Set-Cookie value
//   clearPanelCookie(name, path)             the sign-out value
//   readPanelSession(request, ...)           valid, and not expired
//   isRateLimited / recordAttempt / clearAttempts
//   PANEL_LOGIN_LIMIT
// ==========================================

import { timingSafeEqual } from './Http.js'
import { logWarning } from './Logging.js'

const encoder = new TextEncoder()
const decoder = new TextDecoder()


// ==========================================
// The login rate limit
//
// Twelve failures per address per fifteen minutes. The panels are
// used by one person who knows the password, so a limit this low
// costs nothing on the honest path - and one password guards
// every game, every price and every player record, which is far
// too much to leave behind an endpoint that answers as fast as
// Cloudflare's edge can be asked.
// ==========================================
export const PANEL_LOGIN_LIMIT = { limit: 12, windowMs: 15 * 60 * 1000 }


// ==========================================
// panelPassword
// The secret guarding one panel.
//
// TheGod has its own now. It used to share TestSitePassword with
// the rehearsal panel, which meant the password for the harmless
// one - the panel whose whole purpose is being handed around to
// try a checkout - was also the password for the one that edits
// prices and bans players.
//
// The fallback stays so a deployment that has not set the new
// secret yet keeps working rather than locking its operator out
// of the tool they would use to fix it.
// ==========================================
export function panelPassword(env, name) {
  if (!env) return ''
  if (name === 'thegod') return String(env.TheGodPassword || env.TestSitePassword || '')
  return String(env.TestSitePassword || '')
}


function base64Url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}


async function sign(payload, secret) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return Array.from(new Uint8Array(signature), b => b.toString(16).padStart(2, '0')).join('')
}


// ==========================================
// issuePanelCookie
// The Set-Cookie value for an operator who just proved the
// password.
//
// The payload carries the issue time and is signed WITH it. The
// old cookie signed a random token alone and leaned on Max-Age to
// expire it - but Max-Age is an instruction to the browser, and
// an attacker holding a stolen cookie is not running the browser
// that was told. That session stayed valid until the password
// changed. Now the expiry travels inside the signature, where the
// server checks it and the holder cannot edit it.
// ==========================================
export async function issuePanelCookie(name, path, secret, maxAgeMs) {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('')
  const payload = base64Url(encoder.encode(JSON.stringify({ nonce, iat: Date.now(), panel: path })))
  const signature = await sign(payload, secret)
  const maxAge = Math.floor(maxAgeMs / 1000)

  return `${name}=${payload}.${signature}; Path=${path}; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`
}


export function clearPanelCookie(name, path) {
  return `${name}=; Path=${path}; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
}


// ==========================================
// readPanelSession
// Whether this request carries a live session for one panel.
//
// Two things have to hold: the signature, and the age. A cookie
// whose signature is good but whose iat is older than the window
// is refused here rather than trusted because it arrived.
// ==========================================
export async function readPanelSession(request, name, secret, maxAgeMs) {
  if (!secret) return false

  const cookies = (request && request.headers && request.headers.get('Cookie')) || ''
  const match = cookies.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'))
  if (!match) return false

  const cut = match[1].lastIndexOf('.')
  if (cut <= 0) return false

  const payload = match[1].slice(0, cut)
  const signature = match[1].slice(cut + 1)

  const expected = await sign(payload, secret)
  if (!timingSafeEqual(expected, signature)) return false

  let body
  try {
    body = JSON.parse(decoder.decode(fromBase64Url(payload)))
  } catch {
    return false
  }

  const issuedAt = Number(body && body.iat) || 0
  if (!issuedAt) return false
  return Date.now() - issuedAt <= maxAgeMs
}


// ==========================================
// The attempt ledger
//
// Shares the shape of the licence and order limiters: hashed
// address, one row per failure, swept on read.
//
// It degrades rather than locks. A panel whose D1 binding is
// missing or broken still accepts the right password - because
// the alternative is an operator shut out of the only tool that
// can fix the deployment, by the failure they are trying to fix.
// The refusal is logged so a database that has quietly stopped
// answering does not stay quiet.
// ==========================================
async function hashIp(ip) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode('panel-login|' + (ip || 'unknown')))
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}


export async function isRateLimited(database, panel, ip) {
  if (!database) return false

  try {
    const since = Date.now() - PANEL_LOGIN_LIMIT.windowMs
    await database.prepare('DELETE FROM panel_attempts WHERE at < ?').bind(since).run()

    const row = await database
      .prepare('SELECT COUNT(*) AS n FROM panel_attempts WHERE ip_hash = ? AND panel = ? AND at >= ?')
      .bind(await hashIp(ip), panel, since).first()

    return (row && row.n ? row.n : 0) >= PANEL_LOGIN_LIMIT.limit
  } catch (error) {
    logWarning('Panel rate limit unavailable, allowing the attempt', { panel, error: error.message })
    return false
  }
}


export async function recordAttempt(database, panel, ip) {
  if (!database) return
  try {
    await database
      .prepare('INSERT INTO panel_attempts (ip_hash, panel, at) VALUES (?, ?, ?)')
      .bind(await hashIp(ip), panel, Date.now()).run()
  } catch {
    // A limiter that cannot write is a limiter that does not
    // limit. It is not a reason to refuse the sign-in that is
    // otherwise correct.
  }
}


/** Forgets an address's failures. Called on a successful sign-in. */
export async function clearAttempts(database, panel, ip) {
  if (!database) return
  try {
    await database
      .prepare('DELETE FROM panel_attempts WHERE ip_hash = ? AND panel = ?')
      .bind(await hashIp(ip), panel).run()
  } catch {
    // Nothing to do about it, and nothing broken by it: the rows
    // fall out of the window on their own.
  }
}
