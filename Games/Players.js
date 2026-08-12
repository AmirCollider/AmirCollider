// ==========================================
// Games/Players.js
// Every query that touches a game's OWN player database.
//
// Public exports:
//   playerDb(env, game)
//   listGamePlayers(database, { q, limit, offset, status })
//   getGamePlayer(database, playerId)
//   countGamePlayers(database)
//   setModeration(database, playerId, patch)
//   setUsername(database, playerId, username)
//   deleteGamePlayer(database, playerId)
//   setLeaderboardOptOut(database, playerId, hidden)
//   moderationOf(row)      -> 'active' | 'restricted' | 'banned'
//   isBanned(row) / isRestricted(row)
//
// They talk to different databases, and that difference is the
// whole reason the panel's players screen was useless.
//
// The panel joins the two: identity and behaviour from here,
// money from there.
// ==========================================

import { LEADERBOARD_OPT_OUT_COLUMN } from './PlayerRecord.js'


// ==========================================
// playerDb
// The binding for one game's own database, or null.
// ==========================================
export function playerDb(env, game) {
  const binding = game && game.d1Binding
  return (binding && env && env[binding]) || null
}


function now() {
  return Date.now()
}

function changed(result) {
  return Boolean(result && result.meta && result.meta.changes > 0)
}


// ==========================================
// Moderation state
//
// Three states, derived from two columns rather than stored as a
// third. A stored state is a value that can disagree with the
// timestamp beside it; a derived one cannot.
//
//   banned      banned_at is set. Permanent until lifted.
//   restricted  restricted_until is in the future.
//   active      everything else, including a restriction that
//               has simply run out - which is why this is derived
//               and not a column somebody has to remember to
//               clear on a schedule.
// ==========================================
export function isBanned(row) {
  return Boolean(row && row.banned_at)
}

export function isRestricted(row) {
  return Boolean(row && row.restricted_until && Number(row.restricted_until) > now())
}

export function moderationOf(row) {
  if (isBanned(row)) return 'banned'
  if (isRestricted(row)) return 'restricted'
  return 'active'
}


// ==========================================
// SELECT_COLUMNS
// Named rather than SELECT *, so a deployment whose players table
// predates the moderation migration fails ONE query with a clear
// "no such column" instead of silently returning rows the panel
// then renders as un-bannable.
//
// The fallback list is what every game has had since 0001.
// ==========================================
const MODERATION_COLUMNS = 'banned_at, ban_reason, restricted_until, restrict_reason, admin_note'
const BASE_COLUMNS =
  'player_id, email, username, profile_pic_url, high_score, games_played, ' +
  'total_play_time, selected_color, created_at, last_login'


// Every optional column, richest first. Each step is a migration
// a deployment may or may not have run, and the query is retried
// with one fewer group each time - so the panel works on a game
// database at any point along that line, and says which of the
// optional features it can actually offer rather than showing a
// ban button that will refuse.
//
// Ordered richest-first on purpose: the common case is a current
// database, which succeeds on the first attempt and costs
// nothing.
const OPTIONAL_GROUPS = [
  { key: 'optOut', columns: LEADERBOARD_OPT_OUT_COLUMN },
  { key: 'moderation', columns: MODERATION_COLUMNS }
]

async function selectPlayers(database, clause, binds) {
  for (let drop = 0; drop <= OPTIONAL_GROUPS.length; drop++) {
    const groups = OPTIONAL_GROUPS.slice(drop)
    const columns = [BASE_COLUMNS, ...groups.map(group => group.columns)].join(', ')

    try {
      const { results } = await database
        .prepare(`SELECT ${columns} FROM players ${clause}`)
        .bind(...binds).all()

      const present = new Set(groups.map(group => group.key))
      return {
        rows: results || [],
        moderation: present.has('moderation'),
        optOut: present.has('optOut')
      }
    } catch (error) {
      if (!/no such column/i.test(String(error && error.message))) throw error
      // …and round again with one group fewer.
    }
  }

  // Not reachable: the last iteration drops every optional group
  // and selects only columns that have existed since 0001. If
  // THAT fails the error is not about a missing column and was
  // rethrown above.
  return { rows: [], moderation: false, optOut: false }
}


// ==========================================
// listGamePlayers
// Everybody who has ever signed in, newest first.
//
// Not "everybody who bought something". That distinction is the
// entire point of this function existing.
// ==========================================
export async function listGamePlayers(database, { q = '', limit = 40, offset = 0, status = '' } = {}) {
  if (!database) return { rows: [], total: 0, moderation: false, optOut: false }

  const where = []
  const binds = []

  if (q) {
    where.push('(email LIKE ? OR player_id LIKE ? OR username LIKE ?)')
    const like = '%' + String(q).trim().slice(0, 60) + '%'
    binds.push(like, like, like)
  }

  const size = Math.min(Math.max(Number(limit) || 40, 1), 200)
  const from = Math.max(Number(offset) || 0, 0)
  const clause = (where.length ? 'WHERE ' + where.join(' AND ') : '')
    + ` ORDER BY last_login DESC, created_at DESC LIMIT ${size} OFFSET ${from}`

  let total = 0
  try {
    const count = await database
      .prepare(`SELECT COUNT(*) AS n FROM players ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`)
      .bind(...binds).first()
    total = (count && count.n) || 0
  } catch {
    total = 0
  }

  let out
  try {
    out = await selectPlayers(database, clause, binds)
  } catch {
    return { rows: [], total: 0, moderation: false, optOut: false }
  }

  // Status is filtered here rather than in SQL because
  // "restricted" is a comparison against now() that would have to
  // be re-derived in the query, and the page size is at most 200.
  const rows = status
    ? out.rows.filter(row => moderationOf(row) === status)
    : out.rows

  // Both optional columns are reported, not just moderation. The
  // panel uses these to explain why a control is not there rather
  // than showing one that will refuse - which is the difference
  // between "this game's database has not run that migration" and
  // "the button is broken".
  return { rows, total, moderation: out.moderation, optOut: out.optOut }
}


export async function countGamePlayers(database) {
  if (!database) return 0
  try {
    const row = await database.prepare('SELECT COUNT(*) AS n FROM players').first()
    return (row && row.n) || 0
  } catch {
    return 0
  }
}


export async function getGamePlayer(database, playerId) {
  if (!database || !playerId) return null
  try {
    const out = await selectPlayers(database, 'WHERE player_id = ? LIMIT 1', [playerId])
    return out.rows[0] || null
  } catch {
    return null
  }
}


// ==========================================
// setLeaderboardOptOut
// The player's own decision about the public board.
//
// Written from the account page and readable by the panel, and
// deliberately NOT a moderation action: setModeration() is for
// things done TO a player and this is a thing done BY one. They
// are separate functions so that lifting a ban cannot silently
// put somebody back on a board they chose to leave, and so that
// the panel's audit story stays honest about which is which.
// ==========================================
export async function setLeaderboardOptOut(database, playerId, hidden) {
  if (!database || !playerId) return { ok: false, reason: 'bad_input' }

  try {
    const result = await database
      .prepare(`UPDATE players SET ${LEADERBOARD_OPT_OUT_COLUMN} = ? WHERE player_id = ?`)
      .bind(hidden ? 1 : 0, playerId).run()
    return { ok: true, reason: '', changed: changed(result) }
  } catch (error) {
    return {
      ok: false,
      reason: /no such column/i.test(String(error && error.message)) ? 'no_column' : 'failed'
    }
  }
}


// ==========================================
// setModeration
// Ban, restrict, or lift either.
//
// Every field is optional and only what is named is written, so
// "ban this player" does not silently clear the note somebody
// left last month.
//
// Lifting is spelled by passing null, which is why this cannot
// use the COALESCE trick the settings upsert uses: here, null is
// a value the caller means rather than "leave alone".
// ==========================================
export async function setModeration(database, playerId, patch = {}) {
  if (!database || !playerId) return { ok: false, reason: 'bad_input' }

  const sets = []
  const values = []
  const put = (column, value) => { sets.push(`${column} = ?`); values.push(value) }

  if (Object.prototype.hasOwnProperty.call(patch, 'banned')) {
    put('banned_at', patch.banned ? now() : null)
    put('ban_reason', patch.banned ? String(patch.reason || '').slice(0, 300) || null : null)
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'restrictedUntil')) {
    const until = Number(patch.restrictedUntil) || 0
    put('restricted_until', until > now() ? until : null)
    put('restrict_reason', until > now() ? String(patch.reason || '').slice(0, 300) || null : null)
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'note')) {
    put('admin_note', String(patch.note || '').slice(0, 500) || null)
  }

  if (!sets.length) return { ok: true, reason: '' }

  try {
    const result = await database
      .prepare(`UPDATE players SET ${sets.join(', ')} WHERE player_id = ?`)
      .bind(...values, playerId).run()
    return { ok: true, reason: '', changed: changed(result) }
  } catch (error) {
    return {
      ok: false,
      reason: /no such column/i.test(String(error && error.message)) ? 'no_column' : 'failed'
    }
  }
}


// ==========================================
// setUsername
// Rename a player from the panel.
// ==========================================
export async function setUsername(database, playerId, username) {
  if (!database || !playerId) return { ok: false, reason: 'bad_input' }

  const name = String(username || '').trim()
  if (!/^[A-Za-z0-9]{3,12}$/.test(name)) return { ok: false, reason: 'bad_username' }

  try {
    const taken = await database
      .prepare('SELECT player_id FROM players WHERE LOWER(username) = LOWER(?) AND player_id != ? LIMIT 1')
      .bind(name, playerId).first()
    if (taken) return { ok: false, reason: 'taken' }

    // The row-count is checked now. This returned ok for an UPDATE
    // that matched nothing, so a player with no row — everybody who
    // reached the site before they had ever played, back when only
    // the game client created rows — was told their name was saved
    // and given a form that had done nothing.
    const result = await database.prepare('UPDATE players SET username = ? WHERE player_id = ?')
      .bind(name, playerId).run()

    if (!changed(result)) return { ok: false, reason: 'no_such_player' }

    return { ok: true, reason: '' }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}


// ==========================================
// deleteGamePlayer
// Remove the player record itself.
//
// This is the one destructive action on the screen, which is why
// it is a separate function with its own name rather than a flag
// on setModeration.
// ==========================================
export async function deleteGamePlayer(database, playerId) {
  if (!database || !playerId) return false
  try {
    const result = await database.prepare('DELETE FROM players WHERE player_id = ?')
      .bind(playerId).run()
    return changed(result)
  } catch {
    return false
  }
}


// ==========================================
// deletePlayerByEmail
// The player deleting their OWN account.
//
// Keyed on the email as well as the player id, and that is the
// whole reason this is not just deleteGamePlayer() with a
// different caller.
//
// A player id is fifteen characters of an email's local part, so
// it is not unique to a person: ali@gmail.com and ali@yahoo.com
// both derive "ali". Everywhere else in this codebase that
// collision is handled by comparing the row's `email` before
// acting, and a self-service delete is the single worst place to
// forget it - the second person to sign in with a colliding
// address would erase the first one's account, score and cloud
// save by pressing a button on their own settings page.
//
// So the WHERE clause carries both. A mismatch deletes nothing
// and reports that it deleted nothing, which the caller turns
// into a refusal rather than a cheerful "done".
// ==========================================
export async function deletePlayerByEmail(database, playerId, email) {
  const address = String(email || '').trim().toLowerCase()
  if (!database || !playerId || !address) return { ok: false, reason: 'bad_input' }

  try {
    const result = await database
      .prepare('DELETE FROM players WHERE player_id = ? AND LOWER(email) = ?')
      .bind(playerId, address).run()

    // No row matched. Either it was already gone - a double
    // submit, or a second tab - or the row belongs to somebody
    // else. Both are "there is nothing of yours left here", and
    // neither is an error worth showing a person mid-deletion.
    return { ok: true, reason: '', removed: changed(result) }
  } catch (error) {
    return { ok: false, reason: 'failed', error: String(error && error.message).slice(0, 200) }
  }
}
