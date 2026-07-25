// ==========================================
// pages/license.js
// The licence API the Unity Editor talks to, plus the
// browser page a customer manages their key from.
//
// Public entry points (wired in worker.js ROUTES):
//   POST /license/activate         bind a key to a machine
//   POST /license/validate         renew an existing binding
//   POST /license/deactivate       release one machine's seat
//   POST /license/devices          list the machines on a key
//   POST /license/admin            generate / lookup / revoke / restore
//                                  (action in the body, bearer-guarded)
//   GET  /license                  the management page
//
// Two rules run through the whole file:
//
//   • Never say more than the caller already knows. A
//     wrong key gets "that key was not recognised" and
//     not "no such key" versus "wrong product" - the
//     difference between those two is exactly what an
//     enumeration attack is looking for.
//
//   • Always say enough to act on. A refusal a customer
//     CAN act on - the key is on another machine, the
//     key was refunded, all seats are in use - names the
//     situation, because a person holding a valid
//     receipt and reading "invalid licence" writes an
//     email that takes an hour to answer.
// ==========================================

import { CONFIG } from '../config.js'
import { getPageHead } from '../shared-styles.js'
import { createJsonResponse, createHtmlResponse, logInfo, logWarning } from '../utils.js'
import { normalizeKey, isWellFormed, generateBatch } from '../licensing/keys.js'
import { signToken, TOKEN_LIFETIME } from '../licensing/tokens.js'
import {
  db, findLicense, listActivations, findActivation, touchActivation,
  createActivation, removeActivation, insertLicenses, setStatus,
  isRateLimited, recordFailedAttempt, RATE_LIMIT
} from '../licensing/store.js'

const PRODUCT = 'unity-docsnap'

// The batch generator's ceiling per call. Sell.app pools
// are refilled in the low hundreds, and a bound keeps one
// mistyped number from trying to write a million rows
// inside a Worker's CPU budget.
const MAX_BATCH = 500


// ==========================================
// fail / ok
// One shape for every answer, because the Unity client
// reads `ok`, `error` and `message` and nothing else.
// A handler that returned a bare 400 with no body would
// surface in the Editor as "the licence server sent a
// reply this version could not read", which is true and
// useless.
// ==========================================
function fail(error, message, status = 400, extra = {}) {
  return createJsonResponse({ ok: false, error, message, ...extra }, status)
}

function ok(payload = {}) {
  return createJsonResponse({ ok: true, ...payload })
}


// ==========================================
// readBody
// The request as JSON, or null.
//
// A malformed body is a client bug, not a server error,
// and returning null lets the caller answer 400 with a
// message rather than throwing into the Worker's generic
// 500 page - which would tell a customer that our server
// broke when their request did.
// ==========================================
async function readBody(request) {
  try {
    const body = await request.json()
    return body && typeof body === 'object' ? body : null
  } catch {
    return null
  }
}


function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown'
}


// ==========================================
// sanitizeLabel
// The device name the Editor sends, bounded and stripped
// of anything that is not printable text.
//
// It is displayed on the management page and stored, so
// it is the one attacker-controllable string in this
// system that a human ever reads. It is escaped again at
// render time; this is the belt to that's braces, and it
// also stops a 4 KB "device name" from being stored at
// all.
// ==========================================
function sanitizeLabel(value) {
  if (typeof value !== 'string') return null
  // Control characters and angle brackets are dropped; everything
  // else is kept. Device names legitimately contain spaces, dots,
  // parentheses and non-Latin scripts, and a stricter filter would
  // rename half the world's machines to nothing.
  //
  // Written as a loop rather than a regex character class because
  // the class needs escape sequences for the control range, and an
  // escape that gets mangled into a literal control byte is a bug
  // that reads correctly and behaves wrongly.
  let cleaned = ''
  for (const ch of value) {
    const code = ch.codePointAt(0)
    if (code < 32 || code === 127) continue
    if (ch === '<' || ch === '>') continue
    cleaned += ch
  }

  cleaned = cleaned.trim()
  return cleaned ? cleaned.slice(0, 60) : null
}


function sanitizeVersion(value) {
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/[^0-9a-zA-Z.\-+]/g, '').trim()
  return cleaned ? cleaned.slice(0, 24) : null
}


// ==========================================
// resolveKeyRequest
// Everything the three machine-facing endpoints do
// before they diverge: check the database exists, check
// the caller is not hammering us, validate the key
// shape, look the row up, and confirm it is still live.
//
// Written once because the checks have to happen in this
// order every time. Validating the key shape before the
// lookup keeps typos off the database; checking the rate
// limit before either keeps a guessing loop off it
// entirely; and recording a failed attempt only for
// key-level failures means a customer who mistypes their
// machine id field (which cannot happen from the Editor,
// but can from curl) is not pushed towards a rate limit
// by our own bug.
//
// Returns either { error: Response } or { license, ... }.
// ==========================================
async function resolveKeyRequest(request, env, { requireMachine = true } = {}) {
  const database = db(env)
  if (!database) {
    return {
      error: fail('not_configured',
        'Licensing is not configured on this deployment yet.', 503)
    }
  }

  const body = await readBody(request)
  if (!body) {
    return { error: fail('bad_request', 'Expected a JSON body.') }
  }

  const ip = clientIp(request)
  if (await isRateLimited(database, ip)) {
    logWarning('License rate limit hit', { path: new URL(request.url).pathname })
    return {
      error: fail('rate_limited',
        `Too many failed attempts. Try again in ${Math.round(RATE_LIMIT.windowMs / 60000)} minutes.`, 429)
    }
  }

  // The browser's device list is the one caller with no machine
  // of its own to name - it is asking about somebody else's
  // machines. Demanding one there would have meant inventing a
  // placeholder, and a placeholder that has to pass a real
  // validator is a rule with an official way around it.
  const machineId = typeof body.machine === 'string' ? body.machine.trim() : ''
  if (requireMachine && !/^[a-f0-9]{16,128}$/.test(machineId)) {
    return { error: fail('bad_machine', 'The machine identifier was missing or malformed.') }
  }

  const normalized = normalizeKey(body.key)
  if (!isWellFormed(normalized)) {
    await recordFailedAttempt(database, ip)
    return {
      error: fail('bad_key',
        'That key was not recognised. Check it against your purchase email — it looks like DSNAP-XXXXX-XXXXX-XXXXX.')
    }
  }

  const license = await findLicense(database, normalized)
  if (!license) {
    await recordFailedAttempt(database, ip)
    // Same wording as a malformed key, on purpose: telling
    // the caller that a well-formed key does not exist is
    // telling them their guess had the right shape.
    return {
      error: fail('bad_key',
        'That key was not recognised. Check it against your purchase email — it looks like DSNAP-XXXXX-XXXXX-XXXXX.')
    }
  }

  if (license.status !== 'active') {
    return {
      error: fail('revoked',
        'This key is no longer active. If you believe that is wrong, reply to your purchase email and we will sort it out.')
    }
  }

  if (license.product !== PRODUCT) {
    return { error: fail('wrong_product', 'That key belongs to a different product.') }
  }

  return {
    database,
    license,
    machineId,
    label: sanitizeLabel(body.label),
    appVersion: sanitizeVersion(body.version)
  }
}


// ==========================================
// issueToken
// The signed proof plus the seat numbers, which is what
// both activate and validate return on success.
// ==========================================
async function issueToken(env, license, machineId, seatsUsed) {
  const token = await signToken(env, {
    product: license.product,
    tier: license.tier,
    keyLabel: license.key_public,
    machineId
  })

  return ok({
    token,
    tier: license.tier,
    seatsUsed,
    seatsTotal: license.max_activations,
    offlineDays: TOKEN_LIFETIME
  })
}


// ==========================================
// handleLicenseActivate
// Binds this machine to this key, if there is room.
// ==========================================
export async function handleLicenseActivate(url, request, gameId, requestId, GAMES, env) {
  const resolved = await resolveKeyRequest(request, env)
  if (resolved.error) return resolved.error

  const { database, license, machineId, label, appVersion } = resolved

  const existing = await findActivation(database, license.key_hash, machineId)
  if (existing) {
    // Already ours. Refresh it and hand back a token rather
    // than reporting "already activated" as a failure: the
    // Editor arrives here after a reinstall or a cleared
    // EditorPrefs, and the honest answer to "may I use what
    // I bought on the machine I already registered" is yes.
    await touchActivation(database, license.key_hash, machineId, appVersion)
    const seats = await listActivations(database, license.key_hash)
    return issueToken(env, license, machineId, seats.length)
  }

  const seats = await listActivations(database, license.key_hash)
  if (seats.length >= license.max_activations) {
    // Names the machines that hold the seats, because the
    // customer is almost always looking at an old laptop
    // they forgot about, and the fix is one click on the
    // management page rather than an email to us.
    const names = seats.map(s => s.machine_label || 'an unnamed machine').join(', ')
    return fail('seats_full',
      license.max_activations === 1
        ? `This key is already active on ${names}. Release it there (or at ${CONFIG.SITE_URL}/license) and activate here again.`
        : `All ${license.max_activations} devices for this key are in use: ${names}. Release one to activate here.`,
      409,
      { seatsUsed: seats.length, seatsTotal: license.max_activations })
  }

  await createActivation(database, license.key_hash, machineId, label, appVersion)
  logInfo('License activated', { requestId, key: license.key_public, seats: seats.length + 1 })

  return issueToken(env, license, machineId, seats.length + 1)
}


// ==========================================
// handleLicenseValidate
// The renewal call: this machine already has a seat and
// wants a fresh token.
//
// A machine with no seat is refused rather than silently
// given one. Activation is a deliberate act that consumes
// a seat, and a background renewal that could quietly
// claim one would let a key spread across machines
// without anybody choosing to.
// ==========================================
export async function handleLicenseValidate(url, request, gameId, requestId, GAMES, env) {
  const resolved = await resolveKeyRequest(request, env)
  if (resolved.error) return resolved.error

  const { database, license, machineId, appVersion } = resolved

  const activation = await findActivation(database, license.key_hash, machineId)
  if (!activation) {
    return fail('not_activated',
      'This machine is not activated with that key yet. Press Activate to claim a seat.', 409)
  }

  await touchActivation(database, license.key_hash, machineId, appVersion)
  const seats = await listActivations(database, license.key_hash)
  return issueToken(env, license, machineId, seats.length)
}


// ==========================================
// handleLicenseDeactivate
// Releases one machine's seat.
//
// Used by both the Editor's "Release this machine" button
// and the management page's per-device button, which is
// why the machine id is a parameter rather than being
// inferred: from a browser, the machine being released is
// never the one making the request.
// ==========================================
export async function handleLicenseDeactivate(url, request, gameId, requestId, GAMES, env) {
  const resolved = await resolveKeyRequest(request, env)
  if (resolved.error) return resolved.error

  const { database, license, machineId } = resolved

  const removed = await removeActivation(database, license.key_hash, machineId)
  const seats = await listActivations(database, license.key_hash)

  logInfo('License deactivated', { requestId, key: license.key_public, removed })

  return ok({
    released: removed,
    message: removed
      ? 'That device has been released. The key can be activated somewhere else straight away.'
      : 'That device was not activated with this key, so nothing changed.',
    seatsUsed: seats.length,
    seatsTotal: license.max_activations
  })
}


// ==========================================
// handleLicenseDevices
// The device list behind the management page.
//
// Machine ids are returned truncated. The page needs a
// handle to pass back to /license/deactivate, and the
// full hash is not a secret - but it is also not
// something to scatter around a page that might get
// screenshotted into a support thread, and a prefix is
// enough to identify a row.
//
// It is NOT enough to release one, so the page sends the
// full id it was given; the truncation is for display.
// ==========================================
export async function handleLicenseDevices(url, request, gameId, requestId, GAMES, env) {
  const resolved = await resolveKeyRequest(request, env, { requireMachine: false })
  if (resolved.error) return resolved.error

  const { database, license } = resolved
  const seats = await listActivations(database, license.key_hash)

  return ok({
    key: license.key_public,
    tier: license.tier,
    seatsUsed: seats.length,
    seatsTotal: license.max_activations,
    devices: seats.map(s => ({
      machine: s.machine_id,
      short: String(s.machine_id).slice(0, 12),
      label: s.machine_label || 'Unnamed machine',
      version: s.app_version || '',
      activatedAt: s.activated_at,
      lastSeenAt: s.last_seen_at
    }))
  })
}


// ==========================================
// handleLicenseAdmin
// Key generation, lookup and revocation.
//
// Guarded by a bearer token from the environment, and
// compared in constant time. A plain === would leak the
// prefix length through timing, which for a secret that
// gates minting sellable licence keys is not a risk
// worth taking to save four lines.
//
// The generate action is the only place plaintext keys
// ever exist server-side: they are returned once, in the
// response, to be pasted into Sell.app's serial pool.
// After that only their hashes remain, here and nowhere
// else.
// ==========================================
export async function handleLicenseAdmin(url, request, gameId, requestId, GAMES, env) {
  const database = db(env)
  if (!database) return fail('not_configured', 'Licensing is not configured on this deployment yet.', 503)

  const expected = env && env.DOCSNAP_ADMIN_TOKEN
  if (!expected) return fail('not_configured', 'DOCSNAP_ADMIN_TOKEN is not set on this Worker.', 503)

  const presented = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (!timingSafeEqual(presented, expected)) {
    logWarning('License admin rejected', { requestId })
    return fail('unauthorized', 'Not authorised.', 401)
  }

  const body = await readBody(request)
  if (!body) return fail('bad_request', 'Expected a JSON body.')

  const action = String(body.action || '').toLowerCase()

  if (action === 'generate') {
    const count = Math.min(Math.max(parseInt(body.count, 10) || 0, 1), MAX_BATCH)
    const maxActivations = Math.min(Math.max(parseInt(body.seats, 10) || 1, 1), 20)

    // The tier is required rather than defaulted, and an unknown
    // one is refused rather than coerced.
    //
    // Both failure directions cost real money and neither is
    // visible until a customer complains: default to 'pro' and a
    // typo in a $19.99 batch hands every buyer the $49.99 feature
    // set; default to 'plus' and a $49.99 customer is short-changed
    // on activation. There is no safe guess, so there is no guess.
    const tier = String(body.tier || '').toLowerCase()
    if (tier !== 'plus' && tier !== 'pro') {
      return fail('bad_tier', 'tier must be "plus" or "pro" — pass it explicitly so a batch cannot be mispriced.')
    }

    // The batch label carries the tier by default, because the one
    // thing you need to know about a pool of keys six months later
    // is which product it was sold as.
    const batch = sanitizeLabel(body.batch) || `${new Date().toISOString().slice(0, 10)}-${tier}`

    const keys = generateBatch(count)
    const written = await insertLicenses(database, keys, {
      batch,
      maxActivations,
      product: PRODUCT,
      tier
    })

    logInfo('License batch generated', { requestId, batch, tier, count: written })

    return ok({
      batch,
      tier,
      count: keys.length,
      written,
      seats: maxActivations,
      // Newline-joined as well as listed, because the actual
      // next step is a paste into Sell.app's Serials box and
      // reformatting a JSON array by hand is a good way to
      // lose one.
      serials: keys.join('\n'),
      keys,
      note: `These plaintext ${tier} keys are shown once and are not stored. `
          + `Save them before closing this response, and paste them into the ${tier} product's Serials pool.`
    })
  }

  if (action === 'lookup') {
    const license = await findLicense(database, body.key)
    if (!license) return fail('not_found', 'No licence matches that key.', 404)

    const seats = await listActivations(database, license.key_hash)
    return ok({
      key: license.key_public,
      product: license.product,
      tier: license.tier,
      status: license.status,
      batch: license.batch,
      email: license.email,
      note: license.note,
      seatsUsed: seats.length,
      seatsTotal: license.max_activations,
      createdAt: license.created_at,
      firstActivatedAt: license.first_activated_at,
      lastSeenAt: license.last_seen_at,
      devices: seats
    })
  }

  if (action === 'revoke' || action === 'restore') {
    const license = await findLicense(database, body.key)
    if (!license) return fail('not_found', 'No licence matches that key.', 404)

    await setStatus(database, license.key_hash, action === 'revoke' ? 'revoked' : 'active')
    logInfo('License status changed', { requestId, key: license.key_public, action })

    return ok({
      key: license.key_public,
      status: action === 'revoke' ? 'revoked' : 'active',
      // Said plainly rather than left as a surprise. Offline
      // verification is the whole design, and its cost is
      // exactly this: a machine that already has a token
      // keeps it until it expires.
      note: action === 'revoke'
        ? `Activations cleared. Any machine already holding a token keeps Pro for up to ${TOKEN_LIFETIME} more days.`
        : 'The key works again. Machines will need to activate it afresh.'
    })
  }

  return fail('bad_action', 'action must be one of: generate, lookup, revoke, restore.')
}


// ==========================================
// timingSafeEqual
// Constant-time string comparison for the admin token.
//
// Length is compared first and returns early, which does
// leak the length - unavoidable without hashing both
// sides, and the token is a random secret whose length
// is not the interesting part.
// ==========================================
function timingSafeEqual(a, b) {
  const left = String(a || '')
  const right = String(b || '')
  if (left.length !== right.length) return false

  let diff = 0
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i)
  return diff === 0
}



// ==========================================
// handleLicensePage
// The browser side: paste a key, see the machines on it,
// release one.
//
// It exists because a machine-bound licence without
// self-service seat management generates a support email
// every time somebody buys a new laptop - and because
// the Editor's own release button is unreachable exactly
// when it is most needed, which is when the old machine
// is dead, sold, or wiped.
// ==========================================
export async function handleLicensePage(url, request) {
  return createHtmlResponse(renderLicensePage())
}


function renderLicensePage() {
  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  ${getPageHead({
    title: 'Licence — Unity DocSnap',
    amirLogo: CONFIG.AMIR_LOGO,
    description: 'Check your Unity DocSnap Pro licence and manage the machines it is activated on.'
  })}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>${licenseCss()}</style>
</head>
<body>
  <div class="wrap">
    <header class="head">
      <a class="back" href="/unity-docsnap">&larr; Unity DocSnap</a>
      <h1>Your licence</h1>
      <p class="sub">Paste your key to see which machines it is activated on, and release one if you are moving to a new computer.</p>
    </header>

    <section class="card">
      <label class="lbl" for="key">Licence key</label>
      <div class="row">
        <input id="key" type="text" spellcheck="false" autocomplete="off"
               placeholder="DSNAP-XXXXX-XXXXX-XXXXX" aria-describedby="hint">
        <button id="check" type="button">Check</button>
      </div>
      <p id="hint" class="hint">Spacing and capitalisation don't matter. Nothing is stored in your browser.</p>
      <div id="out" class="out" role="status" aria-live="polite"></div>
    </section>

    <section class="card muted">
      <h2>Don't have a key yet?</h2>
      <p><b>Free</b> needs no key at all — install it and every core export works.
         <b>Plus</b> ($${CONFIG.DOCSNAP.TIERS.plus.price}) adds the AI summary outputs and the Changes page.
         <b>Pro</b> ($${CONFIG.DOCSNAP.TIERS.pro.price}) adds unlimited version history, incremental updates,
         file copies, project backups, CI automation and a custom logo. Both are one-off.</p>
      <a class="btn" href="/unity-docsnap">Compare all three</a>
    </section>
  </div>

  <script>${licenseScript()}</script>
</body>
</html>`
}


function licenseCss() {
  return `
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    html { scrollbar-width: none; -ms-overflow-style: none; }
    html::-webkit-scrollbar { width: 0; height: 0; display: none; }

    :root {
      --brand: #6c63ff; --brand-2: #a78bfa;
      --ok: #4caf50; --warn: #ff9800; --err: #f44336;
      --radius: 16px;
      --bg-1: #0b0e16; --bg-2: #141a2e;
      --surface: rgba(255,255,255,0.05);
      --surface-2: rgba(255,255,255,0.09);
      --border: rgba(255,255,255,0.12);
      --text: rgba(255,255,255,0.92);
      --text-dim: rgba(255,255,255,0.58);
      color-scheme: dark;
    }
    @media (prefers-color-scheme: light) {
      :root:not([data-theme]) {
        --bg-1: #f4f6fb; --bg-2: #e7ecf7;
        --surface: rgba(255,255,255,0.72); --surface-2: #ffffff;
        --border: rgba(20,22,33,0.12);
        --text: rgba(22,24,33,0.92); --text-dim: rgba(22,24,33,0.58);
        color-scheme: light;
      }
    }

    body {
      font-family: 'Vazirmatn', 'Segoe UI', Tahoma, Arial, sans-serif;
      min-height: 100vh; padding: 40px 20px; color: var(--text); line-height: 1.7;
      background:
        radial-gradient(1000px 480px at 80% -10%, color-mix(in srgb, var(--brand) 20%, transparent), transparent 60%),
        linear-gradient(160deg, var(--bg-1), var(--bg-2));
      background-attachment: fixed;
    }
    .wrap { max-width: 680px; margin-inline: auto; }

    .back { color: var(--text-dim); text-decoration: none; font-size: 0.9em; }
    .back:hover { color: var(--text); }
    .head { margin-block-end: 26px; }
    .head h1 { font-size: clamp(1.8em, 4vw, 2.3em); font-weight: 800; margin-block: 10px 6px; }
    .sub { color: var(--text-dim); }

    .card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 24px; margin-block-end: 18px;
      backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
    }
    .card.muted h2 { font-size: 1.1em; margin-block-end: 8px; }
    .card.muted p { color: var(--text-dim); font-size: 0.95em; margin-block-end: 14px; }

    .lbl { display: block; font-weight: 700; font-size: 0.9em; margin-block-end: 8px; }
    .row { display: flex; gap: 10px; flex-wrap: wrap; }
    input {
      flex: 1 1 260px; min-width: 0; font: inherit; letter-spacing: 0.06em;
      padding: 12px 14px; border-radius: 12px; color: var(--text);
      background: var(--surface-2); border: 1px solid var(--border);
    }
    input:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }

    button, .btn {
      font: inherit; font-weight: 700; cursor: pointer; text-decoration: none;
      padding: 12px 22px; border: 0; border-radius: 12px; color: #fff;
      display: inline-flex; align-items: center; gap: 8px;
      background: linear-gradient(135deg, var(--brand), var(--brand-2));
      transition: transform 0.16s ease, filter 0.16s ease;
    }
    button:hover, .btn:hover { transform: translateY(-2px); }
    button:disabled { opacity: 0.55; cursor: default; transform: none; }

    .hint { color: var(--text-dim); font-size: 0.85em; margin-block-start: 10px; }

    .out { margin-block-start: 18px; }
    .out:empty { display: none; }
    .note { padding: 12px 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface-2); }
    .note.ok  { border-color: color-mix(in srgb, var(--ok) 55%, transparent); }
    .note.bad { border-color: color-mix(in srgb, var(--err) 55%, transparent); }

    .seat-line { font-size: 0.9em; color: var(--text-dim); margin-block: 14px 8px; }

    .dev {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      flex-wrap: wrap; padding: 12px 14px; border-radius: 12px;
      border: 1px solid var(--border); background: var(--surface-2); margin-block-end: 8px;
    }
    .dev b { display: block; }
    .dev small { color: var(--text-dim); }
    .dev button {
      padding: 8px 14px; font-size: 0.85em;
      background: transparent; color: var(--text); border: 1px solid var(--border);
    }
    .dev button:hover { border-color: var(--err); color: var(--err); }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { transition-duration: 0.001ms !important; }
    }
  `
}


// ==========================================
// licenseScript
// The page's client half.
//
// Everything it renders from the server's answer goes
// through esc(): device labels are chosen on the
// customer's own machine and stored verbatim, so they
// are untrusted text arriving in a page that other
// people (support, the account owner) will read.
// ==========================================
function licenseScript() {
  return `
    var keyEl = document.getElementById('key');
    var outEl = document.getElementById('out');
    var checkEl = document.getElementById('check');

    function esc(v) {
      return String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function note(kind, text) {
      outEl.innerHTML = '<div class="note ' + kind + '">' + esc(text) + '</div>';
    }

    function when(ms) {
      if (!ms) return '';
      try { return new Date(ms).toLocaleDateString(); } catch (e) { return ''; }
    }

    function post(path, payload) {
      return fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (res) { return res.json(); });
    }

    function render(data) {
      var tierName = data.tier === 'pro' ? 'Pro licence'
        : data.tier === 'plus' ? 'Plus licence'
        : data.tier;
      var html = '<div class="note ok">Key <b>' + esc(data.key) + '</b> — ' + esc(tierName) + '</div>';

      html += '<p class="seat-line">' + data.seatsUsed + ' of ' + data.seatsTotal
        + ' device' + (data.seatsTotal === 1 ? '' : 's') + ' in use</p>';

      if (!data.devices.length) {
        html += '<div class="note">No machine has activated this key yet. Paste it into '
          + 'Unity DocSnap → Licence &amp; Pro Features to get started.</div>';
      } else {
        data.devices.forEach(function (d) {
          html += '<div class="dev"><span><b>' + esc(d.label) + '</b>'
            + '<small>' + esc(d.short) + '… · activated ' + esc(when(d.activatedAt))
            + (d.version ? ' · v' + esc(d.version) : '') + '</small></span>'
            + '<button type="button" data-machine="' + esc(d.machine) + '">Release</button></div>';
        });
      }

      outEl.innerHTML = html;

      Array.prototype.forEach.call(outEl.querySelectorAll('[data-machine]'), function (btn) {
        btn.addEventListener('click', function () { release(btn.getAttribute('data-machine')); });
      });
    }

    function load() {
      var key = keyEl.value.trim();
      if (!key) { note('bad', 'Paste your licence key first.'); return; }

      checkEl.disabled = true;
      note('', 'Checking…');

      post('/license/devices', { product: 'unity-docsnap', key: key })
        .then(function (data) {
          checkEl.disabled = false;
          if (data.ok) { render(data); } else { note('bad', data.message || 'That key was not recognised.'); }
        })
        .catch(function () {
          checkEl.disabled = false;
          note('bad', 'Could not reach the licence server. Please try again.');
        });
    }

    function release(machine) {
      if (!window.confirm('Release this device? Pro features stop there until it is activated again.')) return;

      note('', 'Releasing…');
      post('/license/deactivate', { product: 'unity-docsnap', key: keyEl.value.trim(), machine: machine })
        .then(function (data) {
          if (data.ok) { load(); } else { note('bad', data.message || 'Could not release that device.'); }
        })
        .catch(function () { note('bad', 'Could not reach the licence server. Please try again.'); });
    }

    checkEl.addEventListener('click', load);
    keyEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') load(); });
  `
}
