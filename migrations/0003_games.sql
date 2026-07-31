-- ==========================================
-- 0003_games.sql
-- Game management: the overrides an operator may change
-- without a deploy, the storefront's orders, and what a
-- player owns afterwards.
--
-- Apply with:
--   npx wrangler d1 execute amircollider-licenses --remote \
--       --file=./migrations/0003_games.sql
--
-- Or from the dashboard: D1 ▸ amircollider-licenses ▸ Console
-- ▸ paste this whole file ▸ run.
--
-- Every statement is CREATE ... IF NOT EXISTS, so running it
-- twice is a no-op rather than an error - the same bargain
-- 0002 makes, for the same reason: this will be pasted into a
-- console by somebody who is not sure whether they already
-- did it.
--
-- ------------------------------------------------------------
-- WHAT IS NOT IN HERE, AND WHY
-- ------------------------------------------------------------
-- There is no `games` table. A game is not a row: it is a D1
-- binding, a set of Google OAuth secrets, a deep-link scheme,
-- an Android package and a product catalogue that a shipped
-- build already hard-codes. None of that can be conjured by an
-- INSERT, so a row claiming to be a new game would produce
-- something that renders on the dashboard and cannot log a
-- single player in.
--
-- Games live in GAME_REGISTRY in config.js. This file holds
-- OVERRIDES to them, keyed by the id that already exists in
-- code. A settings row for a game that is not in the registry
-- is ignored on read - it cannot bring a game into being, and
-- deleting a game's row only returns it to its coded defaults.
--
-- The same rule runs one level down: products are defined in
-- code beside their game, and game_product_overrides can only
-- switch one off, re-price it or move it - never invent one.
-- ==========================================


-- ==========================================
-- game_settings
-- One row per game, holding only what an operator changed.
--
-- Every column is NULLable and every NULL means "whatever the
-- registry says". That is what makes the panel's reset button
-- one UPDATE ... SET x = NULL rather than a lookup of what the
-- default used to be, and it means a game renamed in code
-- after being renamed in the panel does not silently keep the
-- old name in a column nobody remembers writing.
-- ==========================================
CREATE TABLE IF NOT EXISTS game_settings (
  -- The registry id ('neon-katana'). Not generated here: a row
  -- whose id is not in GAME_REGISTRY is dead weight that the
  -- merge in games/registry.js drops on sight.
  game_id          TEXT PRIMARY KEY,

  display_name     TEXT,
  logo_url         TEXT,
  accent_color     TEXT,

  -- Per-language description overrides. Three columns rather
  -- than one JSON blob because they are edited one at a time in
  -- three separate fields, and a partial JSON write that loses
  -- the Japanese copy is a bug with no error message.
  desc_fa          TEXT,
  desc_en          TEXT,
  desc_ja          TEXT,

  -- Tags, as a JSON array of {fa,en,ja} objects. JSON here and
  -- not columns because the count is not fixed. Read through a
  -- try/catch: a malformed blob falls back to the registry's
  -- tags rather than emptying the card.
  tags_json        TEXT,

  -- 'live' | 'maintenance' | 'soon'. Anything else is treated
  -- as unset, so a typo cannot hide a game.
  status           TEXT,

  -- The offline switch, and the reason this table exists at
  -- all. 0 withdraws the download link - the button greys out
  -- and /{game}/download stops redirecting - while the store,
  -- the leaderboard, the policy pages and every shared link
  -- keep working exactly as before.
  download_enabled INTEGER,

  -- JSON object of { storeName: url }, replacing the registry's
  -- links wholesale when present. A new mirror (Cafe Bazaar, an
  -- APK on R2) is an edit here rather than a deploy.
  download_json    TEXT,

  -- Shown to a client that asks the manifest whether it is too
  -- old to talk to this Worker. Advisory: nothing is refused on
  -- the strength of a version string a client chose to send.
  min_version      TEXT,

  -- Free text for whoever comes back to this in six months.
  note             TEXT,

  updated_at       INTEGER NOT NULL
);


-- ==========================================
-- game_product_overrides
-- Per-product commercial control, without a deploy.
--
-- A price is the one thing about a product that genuinely
-- changes on a Tuesday afternoon - a sale, a currency shift, a
-- mistake noticed after launch. Making that a code change means
-- either it does not happen or it happens on a branch nobody
-- reviewed.
--
-- price_usd is a TEXT column holding a decimal string, which is
-- not an oversight. SQLite REALs are binary floats: 8.99 stored
-- as a REAL comes back as 8.9900000000000002, and a payment
-- provider asked for that amount is a support thread. The whole
-- money path in this Worker passes decimal strings.
-- ==========================================
CREATE TABLE IF NOT EXISTS game_product_overrides (
  game_id     TEXT NOT NULL,

  -- The catalogue id from config.js. A row for an id that is
  -- not in the catalogue is ignored - it cannot create a
  -- product, because no shipped client has ever heard of it.
  product_id  TEXT NOT NULL,

  -- 0 hides the product from the store and refuses new
  -- purchases of it. Deliberately does NOT touch entitlements
  -- anybody already bought: withdrawing something from sale is
  -- not the same as taking it back from the people who paid.
  enabled     INTEGER,

  price_usd   TEXT,

  -- Lower sorts first. NULL sorts after everything with a
  -- number, so ordering one product pins it without forcing an
  -- opinion about all the others.
  sort_order  INTEGER,

  -- 'best' | 'new' | 'sale' | '' — the ribbon on the card.
  badge       TEXT,

  updated_at  INTEGER NOT NULL,

  PRIMARY KEY (game_id, product_id)
);


-- ==========================================
-- game_orders
-- One row per attempted purchase from the site's storefront.
--
-- A separate table from `orders`, not a `product` value in it,
-- and that separation is load-bearing. The licence checkout's
-- reconciler walks every open row in `orders` and tries to
-- deliver a Unity DocSnap licence for each one; a game purchase
-- sitting in that table would eventually be handed a licence
-- key for an editor extension its buyer has never heard of.
--
-- Status vocabulary, and only these are ever written:
--
--   created          row exists, provider not called yet
--   awaiting_payment invoice open, player has not paid
--   partially_paid   underpaid; needs a human, never auto-grants
--   paid             payment confirmed, entitlement not granted
--   granted          the player owns it
--   expired          invoice timed out unpaid
--   refunded         provider reported the payment reversed
--   failed           terminal; last_error says why
--
-- Rows are written BEFORE the provider is called, for the
-- reason 0002 spells out at length: an order that was never
-- written is money arriving against something this side has
-- never heard of.
-- ==========================================
CREATE TABLE IF NOT EXISTS game_orders (
  -- "gord_" + 24 hex. A different prefix from the licence
  -- checkout's "ord_" on purpose: both ids end up in the same
  -- payment provider dashboard and the same support threads,
  -- and telling them apart at a glance decides which table to
  -- look in.
  id                  TEXT PRIMARY KEY,

  game_id             TEXT NOT NULL,
  product_id          TEXT NOT NULL,

  -- Who is buying. player_uid is the same identifier the game's
  -- own D1 uses for that person, so an entitlement granted here
  -- is readable by the game without a translation step.
  --
  -- google_sub is Google's stable subject id. Kept alongside
  -- because an email address can be changed by its owner and
  -- `sub` cannot - if the two ever disagree, `sub` is the one
  -- that is still talking about the same human.
  player_uid          TEXT NOT NULL,
  google_sub          TEXT,
  email               TEXT NOT NULL,
  email_hash          TEXT NOT NULL,

  lang                TEXT NOT NULL DEFAULT 'en',

  -- The price at the moment of purchase, frozen. Never re-read
  -- from the catalogue afterwards: a product re-priced between
  -- the invoice opening and the payment landing must not change
  -- what the player agreed to pay.
  price_usd           TEXT NOT NULL,
  quantity            INTEGER NOT NULL DEFAULT 1,

  status              TEXT NOT NULL,

  provider            TEXT NOT NULL DEFAULT 'nowpayments',
  provider_invoice_id TEXT,
  provider_payment_id TEXT,
  pay_currency        TEXT,
  pay_amount          TEXT,
  actually_paid       TEXT,

  last_error          TEXT,

  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,
  paid_at             INTEGER,
  granted_at          INTEGER
);

-- The reconciler's query: open rows, oldest first.
CREATE INDEX IF NOT EXISTS idx_game_orders_status  ON game_orders (status, updated_at);
CREATE INDEX IF NOT EXISTS idx_game_orders_player  ON game_orders (game_id, player_uid, created_at);
CREATE INDEX IF NOT EXISTS idx_game_orders_invoice ON game_orders (provider_invoice_id);
CREATE INDEX IF NOT EXISTS idx_game_orders_email   ON game_orders (email_hash);


-- ==========================================
-- game_entitlements
-- What a player owns, per game.
--
-- The one table the game itself reads, through
-- GET /games/{id}/entitlements with the player's Google
-- id_token. Everything else in this file exists to put correct
-- rows in here.
--
-- The primary key is (game, player, product) rather than a
-- purchase id, so buying the same consumable twice adds to a
-- quantity instead of producing two rows the client has to sum.
-- A non-consumable is that same row with quantity 1 that never
-- moves.
-- ==========================================
CREATE TABLE IF NOT EXISTS game_entitlements (
  game_id     TEXT NOT NULL,
  player_uid  TEXT NOT NULL,
  product_id  TEXT NOT NULL,

  -- Mirrored from the catalogue at grant time so the
  -- entitlements endpoint can answer "may this be spent?"
  -- without re-reading config for every row.
  kind        TEXT NOT NULL DEFAULT 'nonconsumable',

  -- Unspent count for a consumable; 1 for anything owned
  -- outright. Decremented by the consume endpoint, never below
  -- zero.
  quantity    INTEGER NOT NULL DEFAULT 0,

  -- Lifetime total, which quantity is not: a player who spent
  -- 6,500 shards has quantity 0 and bought 6,500, and only one
  -- of those two numbers can answer a refund question.
  lifetime    INTEGER NOT NULL DEFAULT 0,

  -- 'web' (bought on this site), 'grant' (given by an operator
  -- in /thegod), 'in-app' (mirrored from a store purchase).
  -- Recorded because "where did this come from?" is the first
  -- question asked about any entitlement somebody disputes.
  source      TEXT NOT NULL DEFAULT 'web',

  -- The game_orders row that most recently added to this, when
  -- there was one.
  order_id    TEXT,

  -- Set for a pass; NULL for everything else. Read at grant
  -- time and re-read on every entitlements call, so an expired
  -- pass stops being reported without a job having to sweep it.
  expires_at  INTEGER,

  granted_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,

  PRIMARY KEY (game_id, player_uid, product_id)
);

CREATE INDEX IF NOT EXISTS idx_entitlements_player ON game_entitlements (game_id, player_uid);
CREATE INDEX IF NOT EXISTS idx_entitlements_order  ON game_entitlements (order_id);


-- ==========================================
-- game_entitlement_events
-- Append-only history of everything granted, spent or taken
-- back.
--
-- game_entitlements only remembers where a balance ended up.
-- Every question actually asked is about the path: was this
-- spent before or after the refund, did the operator grant it
-- twice, when did the pass lapse. A quantity column answers
-- none of those.
--
-- Small - a handful of rows per player per month - and never
-- read by the game, so it costs a purchase nothing.
-- ==========================================
CREATE TABLE IF NOT EXISTS game_entitlement_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id    TEXT NOT NULL,
  player_uid TEXT NOT NULL,
  product_id TEXT NOT NULL,

  -- 'granted' | 'consumed' | 'revoked' | 'expired' | 'refunded'
  kind       TEXT NOT NULL,
  amount     INTEGER NOT NULL DEFAULT 0,

  -- Free text for a human. Redacted at the call site: never a
  -- token, never a full provider payload.
  detail     TEXT,

  at         INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ent_events_player ON game_entitlement_events (game_id, player_uid, at);


-- ==========================================
-- game_order_attempts
-- Purchase attempts by IP, for rate limiting.
--
-- Its own table rather than a second use of order_attempts, so
-- the storefront's limit and the licence checkout's can never
-- be tuned into each other by accident - and so a player
-- browsing skins can never exhaust the limit that protects the
-- thing being sold for fifty dollars.
-- ==========================================
CREATE TABLE IF NOT EXISTS game_order_attempts (
  ip_hash TEXT NOT NULL,
  at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_game_order_attempts ON game_order_attempts (ip_hash, at);
