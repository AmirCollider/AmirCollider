-- ==========================================
-- 0005_game_pages.sql
-- The game's own landing page, and its version history.
--
-- Apply with:
--   npx wrangler d1 execute amircollider-licenses --remote \
--       --file=./migrations/0005_game_pages.sql
--
-- Or from the dashboard: D1 ▸ amircollider-licenses ▸ Console
-- ▸ paste this file ▸ run.
--
-- ------------------------------------------------------------
-- WHAT THIS IS FOR
-- ------------------------------------------------------------
-- Two pages that every game wants and none of them had:
--
--   /{game}            a landing page - the logo, the pitch, the
--                      trailers, which devices it runs on, and
--                      the buttons to get it.
--
--   /{game}/versions   what version is out, when it shipped, and
--                      what changed.
--
-- Both are DATA, not deploys. A trailer goes up on a Tuesday and
-- a patch ships on a Thursday, and neither should need somebody
-- with a wrangler token. So the landing copy lives in new
-- game_settings columns and the version history gets its own
-- table.
--
-- Nothing here can invent a game. Same rule as 0003: a row whose
-- game_id is not in GAME_REGISTRY is ignored on read.
--
-- ------------------------------------------------------------
-- RUNNING IT TWICE
-- ------------------------------------------------------------
-- The ALTER statements fail with "duplicate column name" the
-- second time, which means they already ran. The CREATE TABLE is
-- IF NOT EXISTS and is safe either way. If you are re-running
-- this after a partial failure, run the statements one at a time
-- and skip the ones that report a duplicate.
-- ==========================================


-- ==========================================
-- game_settings — the landing page's content
--
-- Three JSON columns rather than three tables, because each is a
-- short ordered list edited as a whole in one textarea, and a
-- table would buy joins nobody needs. All three are read through
-- a try/catch: a malformed blob falls back to "nothing to show"
-- rather than emptying the page.
-- ==========================================

-- Wide artwork behind the landing page's header. NULL means the
-- page falls back to the accent colour, which is what every game
-- looks like until somebody uploads a banner.
ALTER TABLE game_settings ADD COLUMN hero_url TEXT;

-- Promotional videos, as a JSON array of
--   { "url": "...", "title": "..." }
-- YouTube and Aparat links are recognised and embedded; anything
-- else renders as a link, because an <iframe> pointed at an
-- arbitrary host is somebody else's script running on our page.
ALTER TABLE game_settings ADD COLUMN videos_json TEXT;

-- Which devices the game runs on, as a JSON array of
--   { "kind": "android", "label": "Android 8+" }
-- `kind` picks the icon; `label` is free text and is what the
-- visitor actually reads. A kind nobody has drawn gets a generic
-- icon rather than nothing.
ALTER TABLE game_settings ADD COLUMN devices_json TEXT;

-- The long pitch, per language. Separate from desc_* because
-- those are one line on a card and this is three paragraphs on a
-- page - writing one into the other's box is how a card ends up
-- three screens tall.
ALTER TABLE game_settings ADD COLUMN about_fa TEXT;
ALTER TABLE game_settings ADD COLUMN about_en TEXT;
ALTER TABLE game_settings ADD COLUMN about_ja TEXT;


-- ==========================================
-- game_versions
-- One row per release of one game.
--
-- The current version is NOT a column on game_settings. It is
-- whichever row here has the newest released_at, so shipping a
-- version is one INSERT and there is no second place holding a
-- number that can disagree with this table.
--
-- min_version on game_settings stays what it was: the OLDEST
-- build the Worker still wants to talk to. The two answer
-- different questions and a game can have a long gap between
-- them.
-- ==========================================
CREATE TABLE IF NOT EXISTS game_versions (
  game_id     TEXT NOT NULL,

  -- '1.4.2'. Free text rather than three integers: the string is
  -- what a player sees, what the APK reports and what a support
  -- thread quotes, and games number themselves in ways no schema
  -- should have an opinion about.
  version     TEXT NOT NULL,

  -- Epoch milliseconds. The newest one is "current", so this is
  -- the ordering key for the whole page and is never NULL.
  released_at INTEGER NOT NULL,

  -- What changed, one item per line, per language. Plain text
  -- rather than markdown: it is rendered as a list and nothing
  -- here runs a parser over operator input.
  notes_fa    TEXT,
  notes_en    TEXT,
  notes_ja    TEXT,

  -- Optional per-release download override. A game whose old APK
  -- is still up somewhere can point one version at it without
  -- touching the game's current links.
  download_url TEXT,

  created_at  INTEGER NOT NULL,

  PRIMARY KEY (game_id, version)
);

-- The versions page and the landing page's "current version"
-- badge both run ORDER BY released_at DESC on one game.
CREATE INDEX IF NOT EXISTS idx_versions_game ON game_versions (game_id, released_at DESC);
