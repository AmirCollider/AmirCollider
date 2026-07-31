-- ==========================================
-- 0006_player_moderation.sql
--
-- ############################################################
-- RUN THIS AGAINST EACH GAME'S OWN DATABASE — NOT THE
-- LICENCE DATABASE.
-- ############################################################
--
-- Every other migration in this folder targets
-- amircollider-licenses. This one does not. The players table
-- lives in the GAME's database, one per game, so this file has
-- to be applied once per game:
--
--   npx wrangler d1 execute neon-katana-db --remote \
--       --file=./migrations/0006_player_moderation.sql
--
-- Running it against the licence database will fail with
-- "no such table: players", which is the correct outcome and
-- costs nothing.
--
-- ------------------------------------------------------------
-- WHAT THIS IS FOR
-- ------------------------------------------------------------
-- The TheGod panel could see a player only if they had bought
-- something, because its search ran against game_orders in the
-- licence database. Somebody who signed in, played for forty
-- hours and never spent a dollar was invisible - and there was
-- no way to rename them, no way to see their score or playtime,
-- and no way to stop somebody abusing the leaderboard.
--
-- The panel now reads this table directly. These columns are
-- what it needs to act rather than only look.
--
-- ------------------------------------------------------------
-- BANNED VERSUS RESTRICTED
-- ------------------------------------------------------------
-- Two different decisions, so two different columns.
--
--   banned      an account that should not be able to sign in,
--               save, or appear on the leaderboard at all.
--               Permanent until somebody lifts it.
--
--   restricted  a time-boxed version of the same thing, for the
--               ordinary case: a score that is obviously forged,
--               a name that has to go. It expires on its own.
--
-- Neither is a status column, deliberately. The state is derived
-- from these timestamps in games/players.js, so a restriction
-- that has run out is simply over - there is no scheduled job
-- that has to remember to clear a flag, and no way for a flag
-- and its timestamp to disagree.
--
-- ------------------------------------------------------------
-- RUNNING IT TWICE
-- ------------------------------------------------------------
-- SQLite has no ADD COLUMN IF NOT EXISTS, so a second run fails
-- with "duplicate column name". That means it already ran.
-- Nothing is lost and there is nothing to fix.
-- ==========================================


-- When the ban was applied, in epoch milliseconds. NULL means
-- not banned. A timestamp rather than a 0/1 flag because "since
-- when" is the first question anybody asks about a ban.
ALTER TABLE players ADD COLUMN banned_at INTEGER;

-- Shown to the operator in the panel, never to the player. The
-- refusal a banned client receives says only that the account is
-- not available - a reason handed back to somebody circumventing
-- a ban is a description of how the detection works.
ALTER TABLE players ADD COLUMN ban_reason TEXT;

-- Epoch milliseconds at which the restriction ends. A value in
-- the past is treated as no restriction at all, so this never
-- needs clearing.
ALTER TABLE players ADD COLUMN restricted_until INTEGER;

ALTER TABLE players ADD COLUMN restrict_reason TEXT;

-- Free text for whoever picks this up in six months. Not shown
-- to the player.
ALTER TABLE players ADD COLUMN admin_note TEXT;


-- The leaderboard now excludes banned players, which turns its
-- hot query into "ORDER BY high_score DESC WHERE banned_at IS
-- NULL". Without this index that is a full scan on the one query
-- that runs on every board view.
CREATE INDEX IF NOT EXISTS idx_players_active_score
  ON players (banned_at, high_score DESC);
