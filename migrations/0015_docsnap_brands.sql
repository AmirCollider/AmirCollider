-- ==========================================
-- 0015_docsnap_brands.sql
-- The brand profiles behind /unity-docsnap/panel.
--
-- Run against LICENSE_DB (amircollider-licenses):
--   npx wrangler d1 execute amircollider-licenses --remote \
--     --file=./migrations/0015_docsnap_brands.sql
-- Or from the dashboard: D1 ▸ amircollider-licenses ▸ Console
--
-- WHAT THIS IS FOR
--
-- Unity DocSnap can put a studio's logo and footer on an
-- exported site, and lock sections of it. All of that is
-- configured inside Unity and works with no network at all -
-- that is the product's promise and this table does not
-- change it.
--
-- This table exists for the person with five Unity projects
-- who does not want to type the same footer five times. They
-- set a profile up here once, download a brand file, and
-- import it in each project. The Editor never reads this
-- table; a human carries the file across.
--
-- WHAT IS DELIBERATELY NOT HERE
--
-- The lock PASSWORD. It is typed in Unity and stored only on
-- that person's machine. This site must never hold anything
-- that could open a customer's locked export - not because
-- it would be hard to store safely, but because not having
-- it is a sentence we can print on the panel.
--
-- And the project's NAME comes from the customer typing one.
-- Nothing about a Unity project ever reaches this server, and
-- listing "your projects" by reading them off the Editor
-- would break the promise on the product page to get a
-- slightly nicer label. `name` is whatever they called it.
-- ==========================================

CREATE TABLE IF NOT EXISTS docsnap_brands (
  id           TEXT PRIMARY KEY,
  key_hash     TEXT NOT NULL,

  -- The customer's own label for this profile. Their words,
  -- never derived from anything the Editor sent.
  name         TEXT NOT NULL,

  -- An R2 key under docsnap/brand/, never a remote URL: the
  -- brand file inlines these bytes, so they have to be ours.
  logo_key     TEXT,
  logo_type    TEXT,

  footer_fa    TEXT,
  footer_en    TEXT,
  footer_ja    TEXT,
  footer_url   TEXT,

  -- '' | 'omit' | 'encrypt'
  lock_mode    TEXT NOT NULL DEFAULT '',

  -- JSON array of section ids, e.g. ["changes","issues"]
  locked_json  TEXT NOT NULL DEFAULT '[]',

  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,

  FOREIGN KEY (key_hash) REFERENCES licenses (key_hash) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_docsnap_brands_key ON docsnap_brands (key_hash);
