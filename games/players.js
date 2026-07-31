// ==========================================
// games/players.js
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
//   moderationOf(row)      -> 'active' | 'restricted' | 'banned'
//   isBanned(row) / isRestricted(row)
//
// ------------------------------------------------------------
// WHY THIS IS A SEPARATE FILE FROM games/store.js
// ------------------------------------------------------------
// They talk to different databases, and that difference is the
// whole reason the panel's players screen was useless.
//
// games/store.js talks to LICENSE_DB: orders, entitlements,
// settings. Its findPlayers() searched game_orders, so the only
// people it could find were people who had BOUGHT something. A
// player who signed in, played for forty hours and never spent a
// dollar did not exist as far as the panel was concerned - and
// the columns it could show were commercial, which is why the
// screen had no username, no score and no playtime.
//
// This file talks to the GAME's database - env[game.d1Binding] -
// where the players table actually lives. That table is the one
// with username, high_score, total_play_time and created_at, and
// it is the one moderation has to be written to, because it is
// the one worker.js checks on every save and every score.
//
// The panel joins the two: identity and behaviour from here,
// money from there.
// ==========================================


// ==========================================
// playerDb
// The binding for one game's own database, or null.
//
// Null rather than a throw. A game whose binding is missing from
// wrangler.jsonc is a configuration mistake that should show up
// as "this game has no player database" on one screen, not as a
// 500 on every screen that lists games.
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


// Runs the moderation-aware query and silently falls back to the
// plain one, so the panel works on a game database that has not
// run 0006 yet - it simply shows every player as active.
async function selectPlayers(database, clause, binds) {
  try {
    const { results } = await database
      .prepare(`SELECT ${BASE_COLUMNS}, ${MODERATION_COLUMNS} FROM players ${clause}`)
      .bind(...binds).all()
    return { rows: results || [], moderation: true }
  } catch (error) {
    if (!/no such column/i.test(String(error && error.message))) throw error
    const { results } = await database
      .prepare(`SELECT ${BASE_COLUMNS} FROM players ${clause}`)
      .bind(...binds).all()
    return { rows: results || [], moderation: false }
  }
}


// ==========================================
// listGamePlayers
// Everybody who has ever signed in, newest first.
//
// Not "everybody who bought something". That distinction is the
// entire point of this function existing.
// ==========================================
export async function listGamePlayers(database, { q = '', limit = 40, offset = 0, status = '' } = {}) {
  if (!database) return { rows: [], total: 0, moderation: false }

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
    return { rows: [], total: 0, moderation: false }
  }

  // Status is filtered here rather than in SQL because
  // "restricted" is a comparison against now() that would have to
  // be re-derived in the query, and the page size is at most 200.
  const rows = status
    ? out.rows.filter(row => moderationOf(row) === status)
    : out.rows

  return { rows, total, moderation: out.moderation }
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
//
// The same rule the game's own client is held to - 3 to 12
// characters, English letters and digits - because the column is
// read by the leaderboard and a name that could not have been
// typed in the game should not arrive through the back door
// either. Uniqueness is checked because two identical names on a
// leaderboard is a support thread.
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

    await database.prepare('UPDATE players SET username = ? WHERE player_id = ?')
      .bind(name, playerId).run()
    return { ok: true, reason: '' }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}


// ==========================================
// deleteGamePlayer
// Remove the player record itself.
//
// The row and nothing else. Their ORDERS stay: an order is a
// financial record, and deleting the money because somebody
// asked to be forgotten is how a refund dispute becomes
// unanswerable. player_purchases in the game's own database
// cascades, because that table is a mirror of the entitlements
// rather than the record of them.
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
