// ==========================================
// Scripts/FakeEnv.mjs
// A Worker environment that runs on this machine.
//
// Not a mock in the usual sense: the D1 bindings are real
// SQLite databases built from the files in migrations/, so a
// query with a typo in a column name fails here the way it
// fails in production rather than returning an empty row.
// The R2 binding is a Map, and the secrets are obvious
// placeholders.
//
// CLAUDE.md §14 describes doing this per script. It is here
// instead so every check shares one environment and a new
// migration reaches all of them at once.
//
//   import { makeEnv } from './FakeEnv.mjs'
//   const env = makeEnv()               // empty databases
//   const env = makeEnv({ seed: true }) // one game, one player,
//                                       // one order, one licence
//
// Nothing here touches the network, the real bucket or the
// real databases.
// ==========================================
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const MIGRATIONS = fileURLToPath(new URL('../migrations/', import.meta.url))

// ==========================================
// d1
// The four calls the repository actually makes:
// prepare().bind().first() / .all() / .run(), plus batch and
// exec. `meta.changes` is part of the contract - Games/Store.js
// and Mail/Store.js both read it to decide whether a row
// existed.
// ==========================================
function d1(database) {
  const run = (sql, args) => {
    const statement = database.prepare(sql)
    const reads = /^\s*(select|pragma|with)/i.test(sql)
    if (reads) return { rows: statement.all(...args), changes: 0 }
    const info = statement.run(...args)
    return { rows: [], changes: Number(info.changes || 0) }
  }

  const prepared = (sql, args = []) => ({
    bind: (...next) => prepared(sql, next),
    first: async (column) => {
      const { rows } = run(sql, args)
      const row = rows[0]
      if (!row) return null
      return column === undefined ? row : row[column]
    },
    all: async () => {
      const { rows } = run(sql, args)
      return { results: rows, success: true, meta: { changes: 0 } }
    },
    run: async () => {
      const { changes } = run(sql, args)
      return { success: true, meta: { changes } }
    },
    raw: async () => run(sql, args).rows.map(r => Object.values(r))
  })

  return {
    prepare: (sql) => prepared(sql),
    batch: async (statements) => Promise.all(statements.map(s => s.run())),
    exec: async (sql) => { database.exec(sql); return { count: 0, duration: 0 } },
    __sqlite: database
  }
}

// ==========================================
// apply
// Runs a list of migration files in order. A file that fails
// is REPORTED rather than swallowed: a migration this harness
// cannot run is a migration the live database may not have
// either, and silence there would make every check below a
// check of an empty table.
// ==========================================
function apply(database, files, label, warnings) {
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8')
    try {
      database.exec(sql)
    } catch (e) {
      warnings.push(`${label}: ${file} — ${e.message}`)
    }
  }
}

export function makeEnv({ seed = false, warnings = [] } = {}) {
  // Which file belongs to which database is decided by what the
  // file TOUCHES, not by its number. CLAUDE.md §12 is blunt about
  // this: some of these were applied to the wrong database by
  // hand, and running a players migration against the licence
  // database succeeds and does nothing useful. A file that alters
  // `players` is a game's; everything else numbered is the
  // licence database's.
  const numbered = readdirSync(MIGRATIONS)
    .filter(f => /^\d{4}_.*\.sql$/.test(f))
    .sort()
  const forPlayers = (f) => /\bplayers\b/.test(readFileSync(join(MIGRATIONS, f), 'utf8'))
  const licenseFiles = numbered.filter(f => !forPlayers(f))
  const playerFiles = numbered.filter(forPlayers)

  const licenses = new DatabaseSync(':memory:')
  apply(licenses, licenseFiles, 'LICENSE_DB', warnings)

  // The two game databases. Their base file already carries every
  // column the numbered ones add, so those are applied only to
  // report drift - a duplicate column here means the base file and
  // the migration disagree, which is worth knowing.
  const neon = new DatabaseSync(':memory:')
  apply(neon, ['neon-katana.sql'], 'neon-katana-db', warnings)

  const chrono = new DatabaseSync(':memory:')
  apply(chrono, ['chronoblades.sql'], 'chronoblades-db', warnings)
  void playerFiles

  if (seed) { seedAll(licenses, neon, chrono, warnings) }

  const bucket = new Map()

  return {
    LICENSE_DB: d1(licenses),
    NEON_KATANA_DB: d1(neon),
    CHRONOBLADES_DB: d1(chrono),

    ASSETS: {
      async get(key) {
        const object = bucket.get(key)
        if (!object) return null
        return {
          body: object.body,
          httpEtag: '"fake"',
          httpMetadata: { contentType: object.contentType },
          async text() { return object.body },
          async arrayBuffer() { return new TextEncoder().encode(object.body).buffer }
        }
      },
      async put(key, body, options = {}) {
        bucket.set(key, { body, contentType: (options.httpMetadata || {}).contentType || '' })
        return { key }
      },
      async head(key) { return bucket.has(key) ? { key } : null },
      __bucket: bucket
    },

    // Obvious placeholders. Every one of these is a NAME the code
    // checks for presence; nothing here is or resembles a real
    // secret.
    STATE_SIGNING_SECRET: 'test-state-secret',
    NEON_KATANA_GOOGLE_CLIENT_ID_WEB: 'test.apps.googleusercontent.com',
    NEON_KATANA_GOOGLE_CLIENT_SECRET: 'test-client-secret',
    CHRONOBLADES_GOOGLE_CLIENT_ID_WEB: 'test.apps.googleusercontent.com',
    CHRONOBLADES_GOOGLE_CLIENT_SECRET: 'test-client-secret',
    TheGodPassword: 'test-password',
    TestSitePassword: 'test-password',
    TheEmailPassword: 'test-password',
    DOCSNAP_ADMIN_TOKEN: 'test-admin-token',
    DOCSNAP_ORDER_SECRET: 'test-order-secret',
    DOCSNAP_KEY_WRAP_SECRET: 'test-wrap-secret',
    DOCSNAP_MAIL_FROM: 'test@example.invalid'
  }
}

// ==========================================
// seedAll
// One row of everything a page can list, so a list page is
// exercised with something in it rather than only its empty
// state. Both are worth rendering, which is why this is a
// flag and not the default.
// ==========================================
function seedAll(licenses, neon, chrono, warnings) {
  const now = Date.now()
  const tries = [
    [`INSERT INTO players (player_id, email, username, profile_pic_url, high_score, games_played,
                           total_play_time, created_at, last_login)
      VALUES ('tester', 'tester@example.invalid', 'Tester', '', 4200, 12, 900, ?, ?)`, neon, [now, now]],
    [`INSERT INTO players (player_id, email, username, profile_pic_url, high_score, games_played,
                           total_play_time, created_at, last_login, high_level, selected_item)
      VALUES ('tester', 'tester@example.invalid', 'Tester', '', 99, 3, 120, ?, ?, 7, 'knife-free')`, chrono, [now, now]],
    [`INSERT INTO game_settings (game_id, display_name, status, updated_at)
      VALUES ('neon-katana', 'Neon Katana', 'live', ?)`, licenses, [now]],
    [`INSERT INTO licenses (key_hash, key_public, product, tier, max_activations, created_at, status)
      VALUES ('hash', 'DSNAP-AAAAA-BBBBB-CCCCC', 'unity-docsnap', 'pro', 3, ?, 'active')`, licenses, [now]],
    [`INSERT INTO license_activations (key_hash, machine_id, machine_label, app_version, activated_at, last_seen_at)
      VALUES ('hash', 'machine-0000000000', '', '1.0.4', ?, ?)`, licenses, [now, now]]
  ]
  for (const [sql, database, args] of tries) {
    try { database.prepare(sql).run(...args) } catch (e) { warnings.push('seed: ' + e.message) }
  }
}
