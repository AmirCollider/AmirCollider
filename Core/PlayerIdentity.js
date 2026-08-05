// ==========================================
// Core/PlayerIdentity.js
// Who a Google address is, to a game's own database.
//
// This used to exist twice - once in Games/Session.js and once
// in Games/PlayerRecord.js - with a comment on each copy saying
// the two must never disagree. They are one function now, which
// is a cheaper way to keep that promise than remembering to.
//
// Public exports:
//   playerIdFromEmail(email)            the derivation
//   sameEmail(a, b)                     case/whitespace-insensitive
//   emailMatchesRow(row, email)         the collision guard
//   playerIdConflict(requestId)         the refusal it produces
// ==========================================

import { createJsonResponse } from './Http.js'
import { logWarning } from './Logging.js'


// ==========================================
// playerIdFromEmail
// The identifier a game's own database uses for a person.
//
// Fifteen characters of the local part: short, stable, and
// readable in a support thread, which a Google subject id is
// not. Every shipped build and every existing row already
// depends on this exact rule, so it does not change.
//
// It is NOT injective, and that is the problem it hands to
// emailMatchesRow() below: ali@gmail.com and ali@yahoo.com
// both derive "ali". The derivation stays; what changes is
// that deriving an id is no longer the same thing as being
// allowed to use it.
// ==========================================
export function playerIdFromEmail(email) {
  return String(email || '').split('@')[0].toLowerCase().substring(0, 15)
}


/** Whether two addresses are the same address. */
export function sameEmail(left, right) {
  const a = String(left || '').trim().toLowerCase()
  const b = String(right || '').trim().toLowerCase()
  return Boolean(a) && a === b
}


// ==========================================
// emailMatchesRow
// Whether the player row in front of us belongs to the person
// who just proved an address.
//
// This is the collision guard, and it is the reason a shared
// player id is no longer a shared account. Two people whose
// addresses derive the same id now resolve to the same ROW, and
// exactly one of them owns it - the one whose address is in the
// `email` column. The other is refused rather than silently
// handed somebody else's scores, saves and purchases.
//
// A row with no email at all (only the demo seed, in practice)
// is treated as unclaimed and passes, because refusing it would
// break a fresh database before its first real player.
// ==========================================
export function emailMatchesRow(row, email) {
  if (!row) return true
  if (!row.email) return true
  return sameEmail(row.email, email)
}


// ==========================================
// playerIdConflict
// What the loser of a collision is told.
//
// 403 rather than 404: the record exists and the caller may not
// have it. The message names the cause because this one is
// genuinely not the caller's fault and a support thread that
// starts with "forbidden" and nothing else wastes everybody's
// afternoon.
// ==========================================
export function playerIdConflict(requestId, context = {}) {
  logWarning('Player id collision refused', { requestId, ...context })

  return createJsonResponse({
    error: 'player_id_conflict',
    message:
      'This player id already belongs to a different Google account. ' +
      'Contact support so the record can be separated.',
    requestId
  }, 403)
}
