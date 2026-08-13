-- ==========================================
-- 0012_player_progress.sql
--
-- Two columns on a GAME'S OWN database, not on LICENSE_DB.
--
-- Run it once per game whose board should show more than a name
-- and a score:
--
--   npx wrangler d1 execute <game>-db --remote --file=./migrations/0012_player_progress.sql
--
-- chronoblades-db already has both - migrations/chronoblades.sql
-- creates them - so this file exists for the games that came
-- first. Running it against a database that already has a column
-- fails with "duplicate column name" on that statement and
-- changes nothing, which is why each ALTER is on its own line:
-- one that fails costs only itself.
--
-- NOTHING BREAKS WITHOUT IT. Both columns are probed rather than
-- assumed (hasPlayerColumn / boardExtras in
-- Games/PlayerRecord.js), so a database that never runs this
-- keeps the exact board it has today. /thegod ▸ Games ▸ Health
-- check names them when they are absent.
-- ==========================================


-- ==========================================
-- high_level
-- The furthest stage, level or wave a player reached.
--
-- A second record rather than a second score. A game whose
-- stages are generated one after another has no end to reach, so
-- how far somebody got is not implied by how many points they
-- scored - two players tied on points can be a long way apart.
--
-- Written through the ordinary profile PATCH as `highLevel` and
-- MONOTONIC: buildProfileUpdate() writes
-- MAX(COALESCE(high_level, 0), ?), for the same reason
-- total_play_time is written that way. The client sends its own
-- running record read out of a save file, not a delta, so a
-- plain assignment would let the first sync after a fresh
-- install replace the record with whatever that device happened
-- to have. That failure was invisible for months on
-- total_play_time and it is not repeatable here.
--
-- NOT NULL DEFAULT 0 is a constant default, which is the only
-- kind SQLite allows on an ADD COLUMN - so this rewrites no
-- rows and moves nothing that is already stored.
-- ==========================================
ALTER TABLE players ADD COLUMN high_level INTEGER NOT NULL DEFAULT 0;


-- ==========================================
-- selected_item
-- Which single item the player currently has equipped.
--
-- A product id from that game's store.products in Config.js, so
-- the thing somebody paid for and the thing the leaderboard
-- draws beside their name are one string and cannot disagree.
--
-- Nullable with no default on purpose. NULL means "the game's
-- default", and the registry names that default rather than this
-- column, so renaming a free starter item is one line of config
-- instead of a backfill across every row belonging to a player
-- who never chose anything.
--
-- Deliberately NOT part of purchased_items: that column is an
-- inventory and this one is a selection, and a player owns
-- several things while holding one.
-- ==========================================
ALTER TABLE players ADD COLUMN selected_item TEXT;


-- ==========================================
-- The board index, rebuilt to carry the tie-break.
--
-- The board reads "highest scores, excluding banned and
-- excluding anybody who opted out, and where two players have
-- the same score the one who got further comes first". The
-- existing index stops at high_score, so the last clause has
-- nothing to lean on.
--
-- DROP then CREATE rather than a second index beside the first:
-- two indexes on overlapping prefixes of the same query cost
-- writes and buy nothing, and SQLite would use only one of them.
-- Both statements are guarded, so this is safe on a database
-- that has neither.
-- ==========================================
DROP INDEX IF EXISTS idx_players_board;
CREATE INDEX IF NOT EXISTS idx_players_board
  ON players (banned_at, leaderboard_opt_out, high_score DESC, high_level DESC);
