-- ==========================================
-- 0008_landing_extra.sql
-- The rest of a landing page.
--
-- Apply with:
--   npx wrangler d1 execute amircollider-licenses --remote \
--       --file=./migrations/0008_landing_extra.sql
--
-- Or from the dashboard: D1 ▸ amircollider-licenses ▸ Console
-- ▸ paste this file ▸ run.
--
-- ------------------------------------------------------------
-- WHAT THIS IS FOR
-- ------------------------------------------------------------
-- 0005 gave /{game} a hero image, some trailers, a device list
-- and a long "about" paragraph. That is a page, but it is not a
-- landing page: a landing page answers "what is this, why would
-- I want it, show me, and where do I get it" without the visitor
-- having to scroll into a wall of prose.
--
-- The four columns below are the missing answers:
--
--   tagline_*         one line under the title. The pitch.
--   features_json     three to six things the game does, as
--                     icon + label. The "why would I want it".
--   screenshots_json  the "show me". A gallery, not a hero.
--   faq_json          the questions a store page gets asked
--                     before somebody installs anything.
--
-- All of it is DATA, edited in the TheGod panel's "Game page"
-- tab. Nothing here needs a deploy and nothing here can invent a
-- game: same rule as 0003 and 0005, a row whose game_id is not
-- in GAME_REGISTRY is ignored on read.
--
-- ------------------------------------------------------------
-- RUNNING IT TWICE
-- ------------------------------------------------------------
-- The ALTER statements fail with "duplicate column name" the
-- second time, which means they already ran. Run them one at a
-- time and skip whichever reports a duplicate.
--
-- Until this file is applied, the panel's "Game page" tab still
-- opens and still saves the 0005 fields; the four sections below
-- report "this database has not run 0008 yet" instead of failing
-- the whole save. The landing page renders without them.
-- ==========================================


-- ==========================================
-- game_settings — the landing page, continued
-- ==========================================

-- One line under the game's title on its own page and in the
-- OpenGraph description a link preview shows. Separate from
-- desc_* on purpose: those are a card's subtitle in a grid of
-- games, this is the sentence the game leads with on its own
-- page, and the two are rarely the same words.
ALTER TABLE game_settings ADD COLUMN tagline_fa TEXT;
ALTER TABLE game_settings ADD COLUMN tagline_en TEXT;
ALTER TABLE game_settings ADD COLUMN tagline_ja TEXT;

-- What the game actually does, as a JSON array of
--   { "icon": "⚔️", "fa": "...", "en": "...", "ja": "..." }
-- Rendered as a grid of small cards above the fold. Read through
-- a try/catch: a malformed blob costs this section and nothing
-- else on the page.
ALTER TABLE game_settings ADD COLUMN features_json TEXT;

-- The gallery, as a JSON array of
--   { "url": "https://...", "caption": "..." }
-- Ordinary <img> tags with lazy loading, in a horizontally
-- scrolling strip. A caption is optional and is used as the alt
-- text when it is there, which is the whole reason it exists.
ALTER TABLE game_settings ADD COLUMN screenshots_json TEXT;

-- Questions and answers, as a JSON array of
--   { "q": {"fa": "...", "en": "...", "ja": "..."},
--     "a": {"fa": "...", "en": "...", "ja": "..."} }
-- Rendered as <details> elements: closed by default, no
-- JavaScript, and searchable by the browser's own find.
ALTER TABLE game_settings ADD COLUMN faq_json TEXT;
