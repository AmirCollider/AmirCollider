-- ==========================================
-- chronoblades-db
-- The player database for Chrono Blades.
--
-- Apply with:
--   npx wrangler d1 create chronoblades-db
--   (copy the printed database_id into wrangler.jsonc)
--   npx wrangler d1 execute chronoblades-db --remote --file=./migrations/chronoblades.sql
--
-- Every statement is CREATE ... IF NOT EXISTS, so running it
-- twice is a no-op rather than an error.
--
-- Bound in wrangler.jsonc as "CHRONOBLADES_DB", which is the
-- name GAME_REGISTRY['chronoblades'].d1Binding must contain. If
-- those two strings ever disagree, every data endpoint for this
-- game answers "db_not_bound" and nothing else breaks - which
-- is a confusing hour, so they are worth checking first.
-- ==========================================


-- ==========================================
-- players
-- One row per person who has signed in.
--
-- THE COLUMN NAMES BELOW ARE A CONTRACT. Api/PlayerDataApi.js
-- reads them by name in handleDatabaseGet, handleDatabaseSet and
-- handleDatabasePatch, and Pages/Leaderboard.js reads
-- username / high_score / high_level / selected_item /
-- profile_pic_url. Renaming one here does not produce an error
-- anywhere - it produces a game whose saves quietly stop
-- working.
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

  -- The furthest stage this player has reached.
  --
  -- Chrono Blades generates its stages one after another with no
  -- end, so "level" is a second record rather than a place in a
  -- fixed list - two players with the same score can be a long
  -- way apart, and the board shows both numbers because either
  -- one alone is half the story.
  --
  -- Written through the ordinary profile PATCH as `highLevel`,
  -- and MONOTONIC exactly like high_score: buildProfileUpdate()
  -- writes MAX(existing, incoming), so a fresh install that has
  -- not caught up cannot erase the record it is about to read
  -- back. That is the same failure total_play_time had, and this
  -- column is written the same way so it cannot repeat it.
  --
  -- Optional everywhere it is read. A game database without this
  -- column keeps working; its board simply shows scores only.
  high_level      INTEGER NOT NULL DEFAULT 0,

  games_played    INTEGER NOT NULL DEFAULT 0,
  total_play_time INTEGER NOT NULL DEFAULT 0,

  -- Cosmetics the game owns the meaning of. selected_color is a
  -- bare hex string ('FFFFFF'); the two purchased_* columns are
  -- JSON, read with a fallback so a malformed value is an empty
  -- inventory rather than a 500.
  selected_color  TEXT NOT NULL DEFAULT 'FFFFFF',
  purchased_colors TEXT NOT NULL DEFAULT '["FFFFFF"]',
  purchased_items  TEXT NOT NULL DEFAULT '{}',

  -- Which single item the player currently has equipped.
  --
  -- For Chrono Blades that is the knife in their hand:
  -- 'RegularKnife' (free, everybody has it), 'SilverKnife' or
  -- 'GoldenKnife' (bought). The string is a product id from
  -- GAME_REGISTRY['chronoblades'].store.products, so the thing
  -- somebody paid for and the thing the board draws are one
  -- value and cannot disagree.
  --
  -- NULL means "the game's default", which the registry names
  -- rather than this column - so the free knife can be renamed
  -- in one place instead of backfilled across every row that
  -- never chose anything.
  --
  -- Deliberately NOT inside purchased_items: that is an
  -- inventory, this is a selection, and a player owns several
  -- knives while holding one.
  selected_item   TEXT,

  -- Anything else THIS game wants to save.
  --
  -- A JSON object the Worker stores, merges and never inspects.
  -- The columns above are the ones this side reads by name - the
  -- leaderboard needs high_score and high_level, the account
  -- page needs total_play_time - and this is for everything it
  -- does not need to understand.
  --
  --   PATCH  { "dataPatch": { "combo": 12 } }   merges
  --   POST   { "data":      { ... whole document ... } }  replaces
  data_json        TEXT NOT NULL DEFAULT '{}',

  created_at      INTEGER NOT NULL,
  last_login      INTEGER,

  -- Moderation. NULL everywhere means an ordinary account.
  --
  -- banned_at is permanent until lifted; restricted_until is the
  -- time-boxed version and needs no clearing, because a value in
  -- the past is simply not a restriction. The state shown in the
  -- panel is derived from these two, so there is no third column
  -- that can disagree with them.
  banned_at        INTEGER,
  ban_reason       TEXT,
  restricted_until INTEGER,
  restrict_reason  TEXT,
  admin_note       TEXT,

  -- The player's own decision about the public board.
  --
  -- 1 keeps them off it entirely: no score, no level, no name,
  -- no picture, and no gap in the ranking where they used to be.
  -- Set from the account page at /chronoblades/account, and
  -- readable and writable by the game client as
  -- `leaderboardOptOut` on the profile endpoints, so a switch
  -- inside the game and the checkbox on the site are the same
  -- setting.
  --
  -- NULL and 0 both mean listed. Opting out has to be an act, so
  -- the absence of a decision is not one.
  leaderboard_opt_out INTEGER
);

-- The leaderboard query, which is the only hot read in this
-- database: ORDER BY high_score DESC LIMIT n, run on every
-- board view.
CREATE INDEX IF NOT EXISTS idx_players_score ON players (high_score DESC);
CREATE INDEX IF NOT EXISTS idx_players_email ON players (email);

-- The board query is "highest scores, excluding banned and
-- excluding anybody who opted out", so the index carries all
-- three columns in the order the WHERE clause narrows them.
--
-- high_level is the tie-break that follows high_score, so it is
-- on the end of the same index rather than in one of its own:
-- two players on the identical score are separated by how far
-- they got, and without it the order between them is whatever
-- SQLite happened to return that minute.
CREATE INDEX IF NOT EXISTS idx_players_board
  ON players (banned_at, leaderboard_opt_out, high_score DESC, high_level DESC);


-- ==========================================
-- player_purchases
-- This game's own copy of what a player owns.
--
-- The authoritative record lives in the licence database's
-- game_entitlements table, which is what
-- GET /games/chronoblades/entitlements reads. This table is a
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

  -- The catalogue id from GAME_REGISTRY['chronoblades'].store,
  -- not the Google Play sku. The two are allowed to differ and
  -- usually do: 'GoldenKnife' here, 'chronoblades_golden_knife'
  -- in the Play Console.
  product_id  TEXT NOT NULL,

  -- 'consumable' | 'nonconsumable' | 'pass'
  kind        TEXT NOT NULL DEFAULT 'nonconsumable',

  -- Unspent balance for a consumable; 1 for anything owned
  -- outright. Both knives are nonconsumable, so both are 1.
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
