-- ==========================================
-- neon-katana-db
-- The player database for Neon Katana.
--
-- Written by the SQL builder in the TheGod panel
-- (/thegod ▸ SQL), and checked in so a reader of this
-- repository can see the schema without opening the panel.
--
-- This is the shape every game's database has to have: the
-- column names below are read BY NAME in Games/PlayerRecord.js
-- (handleDatabaseGet / Set / Patch) and in
-- Pages/Leaderboard.js. Renaming one produces no error
-- anywhere - it produces a game whose saves quietly stop
-- working.
--
-- neon-katana-db already exists on the live account, so this
-- file is a record of it rather than a step anybody still has
-- to run. For a NEW game, the panel writes the same thing
-- with that game's names in it, and the steps are:
--
--   npx wrangler d1 create neon-katana-db
--   (copy the printed database_id into wrangler.jsonc)
--   npx wrangler d1 execute neon-katana-db --remote --file=./migrations/neon-katana.sql
--
-- Every statement is CREATE ... IF NOT EXISTS, so running it
-- twice is a no-op rather than an error.
--
-- Bound in wrangler.jsonc as "NEON_KATANA_DB", which is the
-- name GAME_REGISTRY['neon-katana'].d1Binding must contain. If
-- those two strings ever disagree, every data endpoint for this
-- game answers "db_not_bound" and nothing else breaks - which
-- is a confusing hour, so they are worth checking first.
-- ==========================================


-- ==========================================
-- players
-- One row per person who has signed in.
--
-- THE COLUMN NAMES BELOW ARE A CONTRACT. Games/PlayerRecord.js reads them
-- by name in handleDatabaseGet, handleDatabaseSet and
-- handleDatabasePatch, and Pages/Leaderboard.js reads
-- username / high_score / profile_pic_url. Renaming one here
-- does not produce an error anywhere - it produces a game whose
-- saves quietly stop working.
--
-- The row is created at first sign-in and updated from then on.
-- Nothing deletes it: a player who uninstalls and comes back
-- next year still owns their score.
-- ==========================================
CREATE TABLE IF NOT EXISTS players (
  -- The local part of the Google address, lowercased and cut to
  -- fifteen characters - the same derivation the Worker makes
  -- in playerIdFromEmail(). Short, stable, and readable in a
  -- support thread, which a Google subject id is not.
  player_id       TEXT PRIMARY KEY,

  email           TEXT NOT NULL,

  -- 3-12 characters, English letters and digits only, checked
  -- against a profanity blocklist by validateUsername() in
  -- Games/PlayerRecord.js before it ever reaches this column.
  username        TEXT,

  profile_pic_url TEXT,

  -- The leaderboard's sort key. Only ever moves up: the write
  -- path refuses a score that is not higher than the one
  -- already here, so a replayed or tampered submission cannot
  -- lower somebody's record.
  high_score      INTEGER NOT NULL DEFAULT 0,

  games_played    INTEGER NOT NULL DEFAULT 0,
  total_play_time INTEGER NOT NULL DEFAULT 0,

  -- Cosmetics the game owns the meaning of. selected_color is a
  -- bare hex string ('FFFFFF'); the two purchased_* columns are
  -- JSON, read with a fallback so a malformed value is an empty
  -- inventory rather than a 500.
  selected_color  TEXT NOT NULL DEFAULT 'FFFFFF',
  purchased_colors TEXT NOT NULL DEFAULT '["FFFFFF"]',
  purchased_items  TEXT NOT NULL DEFAULT '{}',

  created_at      INTEGER NOT NULL,
  last_login      INTEGER
);

-- The leaderboard query, which is the only hot read in this
-- database: ORDER BY high_score DESC LIMIT n, run on every
-- board view.
CREATE INDEX IF NOT EXISTS idx_players_score ON players (high_score DESC);
CREATE INDEX IF NOT EXISTS idx_players_email ON players (email);


-- ==========================================
-- player_purchases
-- This game's own copy of what a player owns.
--
-- The authoritative record lives in the licence database's
-- game_entitlements table, which is what
-- GET /games/neon-katana/entitlements reads. This table is a
-- mirror, and it exists for one reason: a game that has to make
-- a network call before it can draw the shop is a game that
-- shows a spinner on a train.
--
-- Written when the client syncs, read freely, and never trusted
-- over the entitlements API when the two disagree - the API is
-- the side that saw the money.
-- ==========================================
CREATE TABLE IF NOT EXISTS player_purchases (
  player_id   TEXT NOT NULL,

  -- The catalogue id from GAME_REGISTRY['neon-katana'].store,
  -- not the Google Play sku. The two are allowed to differ and
  -- usually do.
  product_id  TEXT NOT NULL,

  -- 'consumable' | 'nonconsumable' | 'pass'
  kind        TEXT NOT NULL DEFAULT 'nonconsumable',

  -- Unspent balance for a consumable; 1 for anything owned
  -- outright.
  quantity    INTEGER NOT NULL DEFAULT 0,

  -- 'web' (bought on the site), 'in-app' (bought in the store),
  -- 'grant' (given by an operator).
  source      TEXT NOT NULL DEFAULT 'web',

  expires_at  INTEGER,
  synced_at   INTEGER NOT NULL,

  PRIMARY KEY (player_id, product_id),
  FOREIGN KEY (player_id) REFERENCES players (player_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_purchases_player ON player_purchases (player_id);
