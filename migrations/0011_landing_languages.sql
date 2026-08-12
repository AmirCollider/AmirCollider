-- ==========================================
-- 0011_landing_languages.sql
-- Per-language artwork, and the Google disclosure as content.
--
-- Apply with:
--   npx wrangler d1 execute amircollider-licenses --remote \
--       --file=./migrations/0011_landing_languages.sql
--
-- Or from the dashboard: D1 ▸ amircollider-licenses ▸ Console
-- ▸ paste this file ▸ run.
--
-- Or, from inside the panel: /thegod ▸ SQL ▸ "Repair the schema".
-- Every column below is nullable with no default, so adding one
-- is a metadata-only change and the repair button is the same
-- thing as running this file.
--
-- ------------------------------------------------------------
-- WHAT THIS IS FOR
-- ------------------------------------------------------------
-- Two things the Game page tab could not say.
--
-- 1. SCREENSHOTS AND VIDEOS ARE NOT ALWAYS THE SAME PICTURE.
--
--    0005 and 0008 gave a game one list of screenshots and one
--    list of videos, shared by all three languages. That is right
--    for a game whose art carries no words, and wrong the moment
--    one does: a text-heavy game shot in Persian is unreadable on
--    the English page, and a Japanese trailer is the wrong video
--    to autoplay for a Persian visitor.
--
--    So each language may now have its OWN list. An empty one
--    falls back to the shared list, which is what every existing
--    game keeps doing without anybody touching anything.
--
-- 2. THE GOOGLE SIGN-IN DISCLOSURE IS NOW EDITABLE, AND OPTIONAL.
--
--    The "what Google sign-in is used for here" section was
--    hard-coded into Pages/GameLanding.js. Changing a word of it,
--    or leaving it off a game that does not want it, meant a
--    deploy. The default text still lives in code
--    (Content/GoogleDisclosure.js) and is still assembled from the
--    game's own capabilities, so a game with no store never claims
--    to have one - but the heading, the body and whether the
--    section appears at all are settings now.
--
--    google_enabled is deliberately three-state: NULL means
--    nobody has decided, which reads as ON. A disclosure that
--    vanished because a column was never written is exactly the
--    failure the section exists to prevent.
--
-- ------------------------------------------------------------
-- RUNNING IT TWICE
-- ------------------------------------------------------------
-- The ALTER statements fail with "duplicate column name" the
-- second time, which means they already ran. Run them one at a
-- time and skip whichever reports a duplicate. Until this file is
-- applied, the Game page tab still opens and still saves
-- everything else; the per-language lists and the disclosure
-- fields report "no column in this database yet" beside the
-- boxes rather than failing the whole save.
-- ==========================================


-- ==========================================
-- game_settings — screenshots per language
--
-- Same JSON shape as screenshots_json:
--   [ { "url": "https://…", "caption": "…" } ]
--
-- Read INSTEAD of screenshots_json when the visitor's language
-- has one, not merged with it. Merging two galleries of different
-- lengths produces an order nobody chose.
-- ==========================================
ALTER TABLE game_settings ADD COLUMN screenshots_fa_json TEXT;
ALTER TABLE game_settings ADD COLUMN screenshots_en_json TEXT;
ALTER TABLE game_settings ADD COLUMN screenshots_ja_json TEXT;


-- ==========================================
-- game_settings — videos per language
--
-- Same JSON shape as videos_json:
--   [ { "url": "https://…", "title": "…" } ]
--
-- Same rule: a language with its own list uses only that list.
-- ==========================================
ALTER TABLE game_settings ADD COLUMN videos_fa_json TEXT;
ALTER TABLE game_settings ADD COLUMN videos_en_json TEXT;
ALTER TABLE game_settings ADD COLUMN videos_ja_json TEXT;


-- ==========================================
-- game_settings — the Google sign-in disclosure
--
-- google_enabled  1 = show the section, 0 = do not, NULL = the
--                 operator has not decided, which shows it.
-- google_head_*   the heading. Empty falls back to the default
--                 in Content/GoogleDisclosure.js.
-- google_body_*   the text under it, as PLAIN TEXT. Blank lines
--                 separate paragraphs; a line beginning with
--                 "- ", "* " or "• " becomes a bullet. Empty
--                 falls back to the default, which is assembled
--                 from the game's capabilities.
--
-- A game whose capabilities.login is false renders nothing here
-- whatever these columns say: there is no sign-in to disclose.
-- ==========================================
ALTER TABLE game_settings ADD COLUMN google_enabled INTEGER;
ALTER TABLE game_settings ADD COLUMN google_head_fa TEXT;
ALTER TABLE game_settings ADD COLUMN google_head_en TEXT;
ALTER TABLE game_settings ADD COLUMN google_head_ja TEXT;
ALTER TABLE game_settings ADD COLUMN google_body_fa TEXT;
ALTER TABLE game_settings ADD COLUMN google_body_en TEXT;
ALTER TABLE game_settings ADD COLUMN google_body_ja TEXT;
