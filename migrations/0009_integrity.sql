-- ==========================================
-- 0009_integrity.sql
-- Referential integrity for the commerce and game tables, plus
-- the two tables the hardened auth needs.
--
-- Run against LICENSE_DB:
--
--   wrangler d1 execute amircollider-licenses --remote \
--     --file=migrations/0009_integrity.sql
--
-- Take a backup first. Four tables are rebuilt, and SQLite has no
-- other way to add a constraint to a table that already exists:
--
--   wrangler d1 export amircollider-licenses --remote \
--     --output=before-0009.sql
--
-- Why the rebuild is worth doing at all
-- -------------------------------------
-- Nine migration files had two REFERENCES between them. Every
-- other parent/child relation in this schema was a convention -
-- order_events.order_id "is" an order id because the code that
-- writes it says so, and nothing at all if a delete misses a row.
-- Commerce/Orders.js already sweeps three child tables by hand on
-- every order delete, which is the same job written out in
-- JavaScript and only correct while somebody remembers to call
-- it. These constraints are that sweep, made a property of the
-- data instead of a habit of the caller.
--
-- Only relations with a real parent TABLE are here. game_settings
-- and game_product_overrides key off game_id, but games live in
-- Config.js and not in any table, so there is nothing to point a
-- foreign key at - the registry merge in Games/Registry.js is what
-- enforces that one, by walking the code and never the rows.
-- ==========================================

PRAGMA foreign_keys = OFF;


-- ==========================================
-- Orphans first
--
-- A rebuild with a foreign key fails outright if a single child
-- row points at a parent that is gone, and it fails after copying
-- everything else - so the orphans go before the tables move, not
-- after.
--
-- These are set to NULL rather than deleted wherever the column
-- allows it. A mail_outbox row whose order was purged is still a
-- real email that was really sent, and the delivery history is
-- worth more than the broken pointer.
-- ==========================================
DELETE FROM order_events
 WHERE order_id NOT IN (SELECT id FROM orders);

UPDATE mail_outbox
   SET order_id = NULL
 WHERE order_id IS NOT NULL
   AND order_id NOT IN (SELECT id FROM orders);

UPDATE webhook_log
   SET order_id = NULL
 WHERE order_id IS NOT NULL
   AND order_id NOT IN (SELECT id FROM orders);

UPDATE game_entitlements
   SET order_id = NULL
 WHERE order_id IS NOT NULL
   AND order_id NOT IN (SELECT id FROM game_orders);


-- ==========================================
-- order_events -> orders
--
-- CASCADE. An event is a line in one order's history and has no
-- meaning without it; deleting the order should take the log with
-- it, which is exactly what Commerce/Orders.js does by hand today.
-- ==========================================
CREATE TABLE order_events_new (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id  TEXT NOT NULL,
  kind      TEXT NOT NULL,
  detail    TEXT,
  at        INTEGER NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
);

INSERT INTO order_events_new (id, order_id, kind, detail, at)
  SELECT id, order_id, kind, detail, at FROM order_events;

DROP TABLE order_events;
ALTER TABLE order_events_new RENAME TO order_events;

CREATE INDEX IF NOT EXISTS idx_events_order ON order_events (order_id, at);


-- ==========================================
-- mail_outbox -> orders
--
-- SET NULL, and the column stays nullable. Not every email
-- belongs to an order: the admin alerts in Commerce/Fulfilment.js
-- are addressed to nobody's purchase.
-- ==========================================
CREATE TABLE mail_outbox_new (
  id              TEXT PRIMARY KEY,
  order_id        TEXT,
  kind            TEXT NOT NULL,
  to_email        TEXT NOT NULL,
  lang            TEXT NOT NULL DEFAULT 'en',
  subject         TEXT NOT NULL,
  html            TEXT NOT NULL,
  text            TEXT NOT NULL,
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  sent_at         INTEGER,
  sent_via        TEXT,
  last_error      TEXT,
  created_at      INTEGER NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE SET NULL
);

INSERT INTO mail_outbox_new
  (id, order_id, kind, to_email, lang, subject, html, text,
   attempts, next_attempt_at, sent_at, sent_via, last_error, created_at)
  SELECT id, order_id, kind, to_email, lang, subject, html, text,
         attempts, next_attempt_at, sent_at, sent_via, last_error, created_at
    FROM mail_outbox;

DROP TABLE mail_outbox;
ALTER TABLE mail_outbox_new RENAME TO mail_outbox;

CREATE INDEX IF NOT EXISTS idx_outbox_due   ON mail_outbox (sent_at, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_outbox_order ON mail_outbox (order_id);


-- ==========================================
-- webhook_log -> orders
--
-- SET NULL. A callback that arrived for an order we never had is
-- the exact case Pages/Checkout.js alerts an admin about, and that
-- row has to survive to be looked at.
-- ==========================================
CREATE TABLE webhook_log_new (
  provider   TEXT NOT NULL,
  event_key  TEXT NOT NULL,
  order_id   TEXT,
  at         INTEGER NOT NULL,
  PRIMARY KEY (provider, event_key),
  FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE SET NULL
);

INSERT INTO webhook_log_new (provider, event_key, order_id, at)
  SELECT provider, event_key, order_id, at FROM webhook_log;

DROP TABLE webhook_log;
ALTER TABLE webhook_log_new RENAME TO webhook_log;

CREATE INDEX IF NOT EXISTS idx_webhook_at ON webhook_log (at);


-- ==========================================
-- game_entitlements -> game_orders
--
-- SET NULL, because an entitlement outlives the order that
-- produced it and some have no order at all - the panel can grant
-- one by hand. Losing the receipt must never lose the thing the
-- player paid for.
-- ==========================================
CREATE TABLE game_entitlements_new (
  game_id     TEXT NOT NULL,
  player_uid  TEXT NOT NULL,
  product_id  TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'nonconsumable',
  quantity    INTEGER NOT NULL DEFAULT 0,
  lifetime    INTEGER NOT NULL DEFAULT 0,
  source      TEXT NOT NULL DEFAULT 'web',
  order_id    TEXT,
  expires_at  INTEGER,
  granted_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (game_id, player_uid, product_id),
  FOREIGN KEY (order_id) REFERENCES game_orders (id) ON DELETE SET NULL
);

INSERT INTO game_entitlements_new
  (game_id, player_uid, product_id, kind, quantity, lifetime,
   source, order_id, expires_at, granted_at, updated_at)
  SELECT game_id, player_uid, product_id, kind, quantity, lifetime,
         source, order_id, expires_at, granted_at, updated_at
    FROM game_entitlements;

DROP TABLE game_entitlements;
ALTER TABLE game_entitlements_new RENAME TO game_entitlements;

CREATE INDEX IF NOT EXISTS idx_entitlements_player ON game_entitlements (game_id, player_uid);
CREATE INDEX IF NOT EXISTS idx_entitlements_order  ON game_entitlements (order_id);


-- ==========================================
-- player_identity
-- Which Google address owns a player id.
--
-- A player id is fifteen characters of an address's local part,
-- so it is not unique to a person: ali@gmail.com and
-- ali@yahoo.com both derive "ali". Where a player's own row is
-- concerned the `email` column on it settles ownership, but
-- entitlements are keyed by (game_id, player_uid) and carry no
-- address at all - so two people with colliding addresses shared
-- one balance, and nothing in the schema could tell.
--
-- This is that missing column, kept once instead of on every
-- table that needs it. First verified address to use an id owns
-- it; a second is refused rather than handed the first one's
-- purchases.
--
-- No foreign key on game_id, for the same reason as everywhere
-- else: games are defined in Config.js, not in a table.
-- ==========================================
CREATE TABLE IF NOT EXISTS player_identity (
  game_id    TEXT NOT NULL,
  player_uid TEXT NOT NULL,

  -- Lowercased before it is written, so the comparison is a plain
  -- equality and not a policy.
  email      TEXT NOT NULL,

  -- Recorded but never matched on. Google's subject id is the
  -- stable identifier for a person, and having it stored is what
  -- makes an address change resolvable by hand later; matching on
  -- it today would refuse every player whose row predates 0009.
  google_sub TEXT,

  claimed_at INTEGER NOT NULL,

  PRIMARY KEY (game_id, player_uid)
);

CREATE INDEX IF NOT EXISTS idx_player_identity_email ON player_identity (email);


-- ==========================================
-- Backfill the claims from what is already known
--
-- Every completed purchase carries the address that made it, so
-- the players who have bought something can be claimed without
-- asking them to sign in again. The earliest order wins, which is
-- the same first-come rule the code applies from here on.
--
-- Players who have never bought anything are simply unclaimed,
-- and the first verified address to appear takes the id.
-- ==========================================
INSERT OR IGNORE INTO player_identity (game_id, player_uid, email, google_sub, claimed_at)
  SELECT game_id,
         player_uid,
         LOWER(email),
         MIN(google_sub),
         MIN(created_at)
    FROM game_orders
   WHERE email IS NOT NULL AND email <> ''
   GROUP BY game_id, player_uid, LOWER(email);


-- ==========================================
-- panel_attempts
-- Failed operator sign-ins, for the login rate limit.
--
-- /thegod and /testsite had no limit at all: one password, and an
-- endpoint that answered as fast as the edge could be asked. The
-- shape matches license_attempts and order_attempts - hashed
-- address, one row per failure, swept on read - so there is one
-- limiter pattern in this schema rather than three.
--
-- `panel` is stored so exhausting the rehearsal panel's budget
-- does not lock somebody out of the one that runs the games.
-- ==========================================
CREATE TABLE IF NOT EXISTS panel_attempts (
  ip_hash TEXT NOT NULL,
  panel   TEXT NOT NULL,
  at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_panel_attempts ON panel_attempts (ip_hash, panel, at);


PRAGMA foreign_keys = ON;
