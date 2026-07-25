-- ==========================================
-- 0001_licenses.sql
-- Licence keys and their machine activations.
--
-- Apply with:
--   npx wrangler d1 create amircollider-licenses
--   (copy the printed database_id into wrangler.jsonc)
--   npx wrangler d1 execute amircollider-licenses --remote --file=./migrations/0001_licenses.sql
--
-- A separate database from the game data on purpose. The
-- game DB is written by every player on every score
-- submission; this one is written a few times per sale.
-- Mixing them would put commercial records behind the same
-- binding as a public gameplay endpoint, and a bug in the
-- busy half should not be able to reach the half that
-- decides who paid.
-- ==========================================


-- ==========================================
-- licenses
-- One row per key. Rows are created in bulk BEFORE any
-- sale (see /license/admin/generate) and the plaintext
-- keys are loaded into Sell.app's serial pool, so a
-- purchase delivers one instantly with neither this
-- Worker nor any webhook in the payment path.
--
-- A row therefore has no owner until somebody activates
-- it. "Sold" is not a state this database can observe,
-- and pretending otherwise would mean trusting a webhook
-- that does not exist. First activation is the first
-- moment a key becomes a customer, and that is the moment
-- recorded.
-- ==========================================
CREATE TABLE IF NOT EXISTS licenses (
  -- SHA-256 of the normalised key. The plaintext is never
  -- stored: it is printed once at generation time, goes
  -- into Sell.app, and from then on this table can verify
  -- a key without being able to produce one. A dump of
  -- this database is worth nothing to whoever takes it.
  key_hash        TEXT PRIMARY KEY,

  -- The first and last group of the key ("DSNAP-7QK4…M2XZ"),
  -- for support. Enough for a human to match a key somebody
  -- reads out over email against a row here; not enough to
  -- reconstruct one.
  key_public      TEXT NOT NULL,

  product         TEXT NOT NULL DEFAULT 'unity-docsnap',
  tier            TEXT NOT NULL DEFAULT 'pro',

  -- 'active' | 'revoked'. Revoked is for refunds and
  -- chargebacks; the row is kept rather than deleted so the
  -- same key can never be silently re-issued and so a
  -- support question about it still has an answer.
  status          TEXT NOT NULL DEFAULT 'active',

  -- How many machines this key may be bound to at once.
  -- One by default, which is what the product page
  -- promises. A per-row column rather than a constant so a
  -- studio licence or a goodwill second seat is one UPDATE
  -- and not a code change.
  max_activations INTEGER NOT NULL DEFAULT 1,

  -- Optional and filled in by hand: whatever the customer
  -- told us when they emailed. Nothing collects this
  -- automatically - the Editor never sends an address, and
  -- Sell.app holds the real order record.
  email           TEXT,
  note            TEXT,

  -- Batch label from the generation run ("2026-07-sellapp-100"),
  -- so a batch that has to be invalidated can be found.
  batch           TEXT,

  created_at      INTEGER NOT NULL,

  -- First and most recent successful activation, as epoch
  -- milliseconds. first_activated_at doubles as the
  -- closest thing to a sale date this database has.
  first_activated_at INTEGER,
  last_seen_at    INTEGER
);

CREATE INDEX IF NOT EXISTS idx_licenses_batch  ON licenses (batch);
CREATE INDEX IF NOT EXISTS idx_licenses_public ON licenses (key_public);


-- ==========================================
-- license_activations
-- One row per (key, machine). This table is the licence:
-- a key with max_activations = 1 is enforced by counting
-- rows here, and nothing else in the system decides it.
--
-- Rows are deleted on deactivation rather than flagged.
-- A customer who releases a machine has released it, and
-- a "released" row that still counted towards the seat
-- limit is the classic way a self-service seat move turns
-- into a support ticket.
-- ==========================================
CREATE TABLE IF NOT EXISTS license_activations (
  key_hash      TEXT NOT NULL,

  -- The salted SHA-256 the Editor computes from Unity's
  -- deviceUniqueIdentifier. Opaque here by design: this
  -- table can tell two machines apart and can do nothing
  -- else with them.
  machine_id    TEXT NOT NULL,

  -- "DESKTOP-A1B2 (Windows)", supplied by the Editor, shown
  -- back to the customer on the device list so they can
  -- tell which row is their laptop.
  machine_label TEXT,

  -- Package version at activation, then at each renewal.
  -- The one genuinely useful support signal: "still on
  -- 1.0.0" answers half the questions that arrive.
  app_version   TEXT,

  activated_at  INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL,

  PRIMARY KEY (key_hash, machine_id),
  FOREIGN KEY (key_hash) REFERENCES licenses (key_hash) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_activations_key ON license_activations (key_hash);


-- ==========================================
-- license_attempts
-- Failed activations, by IP, for rate limiting.
--
-- Needed because /license/activate is the one endpoint
-- where guessing has a payoff. Without a limit, the key
-- space is only as strong as how fast somebody can send
-- requests to a Worker that answers in milliseconds and
-- scales for them for free.
--
-- Only failures are recorded, and only an IP hash: a
-- successful activation writes nothing here, so the table
-- stays small and holds nothing about a customer.
-- ==========================================
CREATE TABLE IF NOT EXISTS license_attempts (
  ip_hash    TEXT NOT NULL,
  at         INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attempts_ip ON license_attempts (ip_hash, at);
