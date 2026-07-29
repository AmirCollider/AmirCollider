// ==========================================
// pages/licenseAdmin.js
// Seeing and controlling the licences that exist.
//
// Public entry point (wired in worker.js ROUTES):
//   POST /testsite/licenses    { action: … }
//
// Why this exists as a second surface next to
// /license/admin: that one is keyed entirely by the
// plaintext licence key, because it was built for the case
// where a customer emails you theirs. The table stores only
// hashes, so a key is the only way in - which is correct for
// support and leaves the operator unable to answer the two
// questions they actually have:
//
//     "what have I sold?"
//     "kill that one" — about a licence nobody emailed them
//
// A key being used illegitimately is precisely the key you
// do not have. Before this, the only way to reach it was the
// D1 console and hand-written SQL.
//
// ------------------------------------------------------------------
// Identifiers
// ------------------------------------------------------------------
// Every action that names a licence accepts any of:
//
//   key      the full plaintext key      (from a customer's email)
//   label    the masked public label     (from a listing, an order,
//                                         our own delivery email)
//   order    a checkout order id         (from the order panel)
//
// The label is the one the interface uses, and that is on
// purpose: it is five characters short of being usable to
// activate anything, so an admin screen, a screenshot of it
// and a support thread quoting it all leak nothing.
//
// Under /testsite/ for the same reason the checkout
// simulator is: the panel's session cookie is scoped
// Path=/testsite and a browser will not send it anywhere
// else.
// ==========================================

import { createJsonResponse, logInfo, logWarning } from '../utils.js'
import { isTestSiteSession } from './testsite.js'
import {
  db, findLicense, findLicenseByLabel, findLicenseByOrder,
  listLicenses, listActivations, removeActivation,
  setStatus, deleteLicense, licenseStats
} from '../licensing/store.js'
import { TOKEN_LIFETIME } from '../licensing/tokens.js'


// ==========================================
// authorize
// Admin bearer token, or a signed panel session.
//
// Identical contract to the checkout simulator, and
// intentionally so - it is the same operator doing the same
// job from the same two places, and two different rules for
// that would be two chances to get one of them wrong.
// ==========================================
async function authorize(request, env) {
  const token = env && env.DOCSNAP_ADMIN_TOKEN
  const password = env && env.TestSitePassword

  if (!token && !password) {
    return createJsonResponse({
      ok: false,
      error: 'not_configured',
      message: 'Set DOCSNAP_ADMIN_TOKEN (for curl) or TestSitePassword (for the /testsite panel).'
    }, 503)
  }

  const presented = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (token && presented && timingSafeEqual(presented, token)) return null
  if (password && await isTestSiteSession(request, env)) return null

  logWarning('Licence admin rejected')
  return createJsonResponse({
    ok: false,
    error: 'unauthorized',
    message: 'Send Authorization: Bearer <DOCSNAP_ADMIN_TOKEN>, or sign in at /testsite first.'
  }, 401)
}


function timingSafeEqual(a, b) {
  const left = String(a || '')
  const right = String(b || '')
  if (left.length !== right.length) return false
  let diff = 0
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i)
  return diff === 0
}


// ==========================================
// resolve
// The licence a request is talking about.
//
// Tries the three identifiers in order of how specific they
// are. Returns null rather than throwing, so every caller
// answers 404 the same way.
// ==========================================
async function resolve(database, body) {
  if (body.key) {
    const byKey = await findLicense(database, body.key)
    if (byKey) return byKey
  }
  if (body.label) {
    const byLabel = await findLicenseByLabel(database, body.label)
    if (byLabel) return byLabel
  }
  if (body.order) {
    const byOrder = await findLicenseByOrder(database, body.order)
    if (byOrder) return byOrder
  }
  return null
}


// ==========================================
// present
// One licence row, as the interface reads it.
//
// key_hash is never returned. It is not a secret - it cannot
// be reversed into a key - but it is also of no use to
// anybody looking at this screen, and a 64-character hex
// string in every row is noise that hides the fields that
// matter.
// ==========================================
function present(row, seatsUsed) {
  return {
    label: row.key_public,
    product: row.product,
    tier: row.tier,
    status: row.status,
    seatsUsed: seatsUsed != null ? seatsUsed : (row.seats_used || 0),
    seatsTotal: row.max_activations,
    email: row.email || '',
    // "order:ord_…" as stored; handed back split so the interface
    // can link straight to the order panel.
    orderId: /^order:/.test(row.note || '') ? String(row.note).slice(6) : '',
    note: row.note || '',
    batch: row.batch || '',
    createdAt: row.created_at,
    firstActivatedAt: row.first_activated_at,
    lastSeenAt: row.last_seen_at,
    // Never sold is a real and useful state: a generated key that
    // no customer has ever touched is safe to delete outright,
    // where a used one is not.
    everActivated: Boolean(row.first_activated_at)
  }
}


// ==========================================
// handleLicenseAdminPanel
// ==========================================
export async function handleLicenseAdminPanel(url, request, gameId, requestId, GAMES, env) {
  const refusal = await authorize(request, env)
  if (refusal) return refusal

  const database = db(env)
  if (!database) {
    return createJsonResponse({
      ok: false, error: 'not_configured',
      message: 'LICENSE_DB is not bound on this deployment.'
    }, 503)
  }

  let body
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const action = String(body.action || 'list').toLowerCase()

  // ---------------------------------------------------------------
  // list — what exists, with filters
  // ---------------------------------------------------------------
  if (action === 'list') {
    const page = await listLicenses(database, {
      status: body.status,
      tier: body.tier,
      batch: body.batch,
      product: body.product,
      q: body.q,
      limit: body.limit,
      offset: body.offset
    })

    return createJsonResponse({
      ok: true,
      total: page.total,
      limit: page.limit,
      offset: page.offset,
      licenses: page.rows.map(row => present(row))
    })
  }

  // ---------------------------------------------------------------
  // stats — the table at a glance
  // ---------------------------------------------------------------
  if (action === 'stats') {
    return createJsonResponse({ ok: true, ...(await licenseStats(database)) })
  }

  // ---------------------------------------------------------------
  // get — one licence and the machines on it
  // ---------------------------------------------------------------
  if (action === 'get') {
    const license = await resolve(database, body)
    if (!license) return notFound()

    const seats = await listActivations(database, license.key_hash)

    return createJsonResponse({
      ok: true,
      license: present(license, seats.length),
      devices: seats.map(seat => ({
        machine: seat.machine_id,
        short: String(seat.machine_id).slice(0, 12),
        label: seat.machine_label || 'Unnamed machine',
        version: seat.app_version || '',
        activatedAt: seat.activated_at,
        lastSeenAt: seat.last_seen_at
      }))
    })
  }

  // ---------------------------------------------------------------
  // revoke / restore — the normal way to kill or un-kill a licence
  // ---------------------------------------------------------------
  if (action === 'revoke' || action === 'restore') {
    const license = await resolve(database, body)
    if (!license) return notFound()

    const next = action === 'revoke' ? 'revoked' : 'active'
    await setStatus(database, license.key_hash, next)

    logInfo('Licence status changed from the panel', { requestId, key: license.key_public, action })

    return createJsonResponse({
      ok: true,
      label: license.key_public,
      status: next,
      // The cost of offline verification, said plainly rather than
      // left as a surprise. A machine already holding a token keeps
      // its edition until that token expires, and an operator who
      // revokes a key expecting it to stop working this second
      // needs to know that before the customer tells them.
      note: action === 'revoke'
        ? `Activations cleared. A machine already holding a token keeps its edition for up to ${TOKEN_LIFETIME} more days.`
        : 'The key works again. Machines will need to activate it afresh.'
    })
  }

  // ---------------------------------------------------------------
  // release — free one machine's seat
  // ---------------------------------------------------------------
  if (action === 'release') {
    const license = await resolve(database, body)
    if (!license) return notFound()

    const machine = String(body.machine || '').trim()
    if (!machine) {
      return createJsonResponse({
        ok: false, error: 'bad_machine',
        message: 'Pass the full machine id from the devices list.'
      }, 400)
    }

    const removed = await removeActivation(database, license.key_hash, machine)
    const seats = await listActivations(database, license.key_hash)

    logInfo('Seat released from the panel', { requestId, key: license.key_public, removed })

    return createJsonResponse({
      ok: true,
      released: removed,
      seatsUsed: seats.length,
      seatsTotal: license.max_activations,
      message: removed
        ? 'That machine has been released. The key can be activated somewhere else straight away.'
        : 'That machine was not activated with this key, so nothing changed.'
    })
  }

  // ---------------------------------------------------------------
  // delete — removes the row entirely
  // ---------------------------------------------------------------
  if (action === 'delete') {
    const license = await resolve(database, body)
    if (!license) return notFound()

    // Guarded twice, because it is the one irreversible action here
    // and it is almost never what somebody actually wants.
    //
    // Revoking is the right answer for a licence being misused: the
    // key stops working AND the row survives, so the question "what
    // was this, and why did I kill it?" still has an answer next
    // year. A deleted row can be explained to nobody.
    if (body.confirm !== true) {
      return createJsonResponse({
        ok: false,
        error: 'confirm_required',
        message: 'Deleting removes the record permanently and cannot be undone. '
               + 'For a licence being misused, revoke instead — that stops the key AND keeps the history. '
               + 'If you are sure, send "confirm": true.',
        wouldDelete: present(license)
      }, 409)
    }

    // A licence somebody has activated is a licence somebody may
    // have paid for. Deleting that record loses the only proof the
    // sale happened, so it takes a second, separate acknowledgement.
    if (license.first_activated_at && body.evenThoughActivated !== true) {
      return createJsonResponse({
        ok: false,
        error: 'activated_license',
        message: 'This licence has been activated on a real machine, so a customer probably paid for it. '
               + 'Revoking is almost certainly what you want. To delete anyway, also send '
               + '"evenThoughActivated": true.',
        wouldDelete: present(license)
      }, 409)
    }

    const gone = await deleteLicense(database, license.key_hash)
    logInfo('Licence deleted from the panel', { requestId, key: license.key_public })

    return createJsonResponse({
      ok: true,
      deleted: gone,
      label: license.key_public,
      note: 'The row is gone. Any machine already holding a token keeps its edition until that token expires — '
          + 'deleting a row does not reach a token that was already signed.'
    })
  }

  return createJsonResponse({
    ok: false,
    error: 'bad_action',
    message: 'action must be one of: list, stats, get, revoke, restore, release, delete.'
  }, 400)
}


function notFound() {
  return createJsonResponse({
    ok: false,
    error: 'not_found',
    message: 'No licence matched. Pass "key" (the full key), "label" (DSNAP-XXXXX-…-XXXXX) or "order" (ord_…).'
  }, 404)
}
