-- ==========================================
-- 0002_commerce.sql
-- The crypto checkout: orders, the mail outbox that
-- delivers their keys, and the webhook ledger that stops a
-- replayed callback from issuing a second one.
--
-- Apply with:
--   npx wrangler d1 execute amircollider-licenses --remote \
--       --file=./migrations/0002_commerce.sql
--
-- Or from the dashboard: D1 ▸ amircollider-licenses ▸ Console
-- ▸ paste this whole file ▸ run.
--
-- Every statement is CREATE ... IF NOT EXISTS, so running it
-- twice is a no-op rather than an error. That matters more
-- than it sounds: this file will be pasted into a console by
-- a human who is not sure whether they already did it, and a
-- migration that punishes them for checking is a migration
-- that gets skipped.
--
-- Lives in the licence database rather than a third one.
-- Orders and licences are read together on every delivery
-- and every support question, and D1 has no cross-database
-- join - so splitting them would mean two round trips and a
-- join in JavaScript to answer "which key did this order
-- get".
-- ==========================================


-- ==========================================
-- orders
-- One row per attempted purchase, from the moment somebody
-- types an email address.
--
-- Rows are created BEFORE the payment provider is called,
-- not after. If the provider call fails, or the Worker dies
-- between the call and the response, the row is still there
-- with the state it reached - which is the difference
-- between an order that can be reconciled by cron and money
-- that arrived for an invoice nothing on this side has ever
-- heard of.
--
-- The status column is a state machine, and only these
-- values are ever written:
--
--   created          row exists, provider not called yet
--   awaiting_payment invoice open, customer has not paid
--   partially_paid   underpaid; needs a human, never auto-delivers
--   paid             payment confirmed, key not issued yet
--   issuing          a delivery attempt holds this row
--   issued           key minted, email not confirmed sent
--   delivered        key in the customer's inbox
--   expired          invoice timed out unpaid
--   refunded         provider reported the payment reversed
--   failed           terminal; last_error says why
--
-- Forward-only except for the issuing/issued pair, which is
-- the only place two workers can race (a webhook and a cron
-- tick arriving together). That race is settled by a
-- conditional UPDATE rather than by a lock table, because D1
-- gives us a changes count and that is all the mutual
-- exclusion a single-row transition needs.
-- ==========================================
CREATE TABLE IF NOT EXISTS orders (
  -- "ord_" + 24 hex. Handed to the payment provider as its
  -- order_id and printed in the customer's email, so it is
  -- the one identifier that appears on both sides of the
  -- payment and in every support thread.
  id                  TEXT PRIMARY KEY,

  product             TEXT NOT NULL DEFAULT 'unity-docsnap',

  -- 'plus' | 'pro'. Fixed at order creation from the price
  -- the customer was shown, and never re-read from a request
  -- afterwards - a tier that could be changed after payment
  -- is a $19.99 order that delivers a $49.99 key.
  tier                TEXT NOT NULL,
  price_usd           TEXT NOT NULL,

  -- Where the key goes. Stored in the clear because we have
  -- to be able to send mail to it, and hashed alongside so
  -- the "find my order" lookup can match without the address
  -- travelling in a URL.
  email               TEXT NOT NULL,
  email_hash          TEXT NOT NULL,

  -- The language the customer was reading when they bought,
  -- which is the language their receipt and their key email
  -- are written in. Somebody who bought from the Persian
  -- page and got an English email has to work out whether it
  -- is even for them.
  lang                TEXT NOT NULL DEFAULT 'en',

  status              TEXT NOT NULL,

  provider            TEXT NOT NULL DEFAULT 'nowpayments',
  provider_invoice_id TEXT,
  provider_payment_id TEXT,

  -- What the provider says actually happened: which coin,
  -- how much was due, how much arrived. Kept because an
  -- underpayment is settled by a human reading these three
  -- numbers, and asking the provider again months later is
  -- not always possible.
  pay_currency        TEXT,
  pay_amount          TEXT,
  actually_paid       TEXT,

  -- The licence this order produced. key_hash joins to the
  -- licenses table; key_public is the masked label, which is
  -- what support and the order page are allowed to show.
  key_hash            TEXT,
  key_public          TEXT,

  -- The plaintext key, AES-GCM sealed under a Worker secret
  -- that is not in this database.
  --
  -- This is the one place plaintext exists at rest, and it
  -- exists for exactly one reason: a customer whose email
  -- went to spam needs the SAME key back, not a new one that
  -- invalidates the one they may already have activated.
  -- Sealed rather than stored, so a dump of D1 is still worth
  -- nothing, and wiped by cron at key_sealed_until - after
  -- which a lost key is a support re-issue rather than a
  -- self-service resend.
  key_sealed          TEXT,
  key_sealed_until    INTEGER,

  delivery_attempts   INTEGER NOT NULL DEFAULT 0,

  -- The last thing that went wrong, for the operator. Never
  -- shown to a customer: it can contain a provider's error
  -- text, and a stranger's API message in a stranger's
  -- inbox is neither useful nor ours to forward.
  last_error          TEXT,

  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,
  paid_at             INTEGER,
  delivered_at        INTEGER
);

-- The reconciler's query: everything in a non-terminal state,
-- oldest first.
CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders (status, updated_at);
CREATE INDEX IF NOT EXISTS idx_orders_email    ON orders (email_hash);
CREATE INDEX IF NOT EXISTS idx_orders_invoice  ON orders (provider_invoice_id);
CREATE INDEX IF NOT EXISTS idx_orders_sealed   ON orders (key_sealed_until);


-- ==========================================
-- order_events
-- An append-only log of everything that happened to an
-- order.
--
-- Exists because the orders table only remembers where a row
-- ended up, and every question that actually gets asked is
-- about the path: did the webhook arrive before or after the
-- cron reconciled it, was the email attempted twice, did the
-- provider report confirmed and then failed. A status column
-- cannot answer any of those.
--
-- Written on every transition and every delivery attempt.
-- Small - a handful of rows per sale - and never read by the
-- customer-facing path, so it costs a sale nothing.
-- ==========================================
CREATE TABLE IF NOT EXISTS order_events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id  TEXT NOT NULL,

  -- A short machine-readable verb: 'created', 'invoice_opened',
  -- 'webhook', 'paid', 'key_issued', 'mail_queued', 'mail_sent',
  -- 'mail_failed', 'reconciled', 'expired', 'alerted'.
  kind      TEXT NOT NULL,

  -- Free text for a human. Redacted at the call site: never
  -- a plaintext key, never a full provider payload.
  detail    TEXT,

  at        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_order ON order_events (order_id, at);


-- ==========================================
-- mail_outbox
-- Mail that should be sent, with a retry schedule.
--
-- A queue rather than a direct send, and that is the single
-- most important decision in this file. The moment a
-- payment confirms, the key exists and the money is gone -
-- so "send the email" cannot be allowed to be the step that
-- fails silently because a mail provider had a bad thirty
-- seconds. The row is written first, the send is attempted
-- immediately, and if the attempt fails the row is still
-- sitting there for the next cron tick.
--
-- The body is stored rendered rather than as a template
-- reference plus data. Rendering it again at retry time
-- would mean a template edit between the first attempt and
-- the fifth changes what the customer receives, and would
-- mean a retry can fail for a reason that has nothing to do
-- with mail.
-- ==========================================
CREATE TABLE IF NOT EXISTS mail_outbox (
  id              TEXT PRIMARY KEY,

  -- Null for mail not tied to a sale (an operator alert).
  order_id        TEXT,

  -- 'license' | 'receipt' | 'admin_alert' | 'admin_pool'.
  -- Drives nothing except reporting; the row carries its own
  -- fully rendered body.
  kind            TEXT NOT NULL,

  to_email        TEXT NOT NULL,
  lang            TEXT NOT NULL DEFAULT 'en',
  subject         TEXT NOT NULL,
  html            TEXT NOT NULL,
  text            TEXT NOT NULL,

  attempts        INTEGER NOT NULL DEFAULT 0,

  -- When the next attempt becomes eligible. The cron picks
  -- up anything unsent whose time has come, so backoff is a
  -- number in a column rather than a timer somewhere.
  next_attempt_at INTEGER NOT NULL,

  sent_at         INTEGER,

  -- Which provider actually accepted it. Useful exactly once
  -- a year, on the morning one provider starts bouncing and
  -- the question is how long it has been doing that.
  sent_via        TEXT,

  last_error      TEXT,
  created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_outbox_due   ON mail_outbox (sent_at, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_outbox_order ON mail_outbox (order_id);


-- ==========================================
-- webhook_log
-- Every provider callback we have already acted on.
--
-- Payment providers retry callbacks, and they are right to:
-- a callback whose response was lost has to be re-sent or
-- paid orders would hang. The consequence is that the same
-- "payment finished" arrives two, five, twenty times, and
-- the handler has to be able to tell the difference between
-- a retry and a new event.
--
-- The primary key is (provider, event_key), where event_key
-- is payment id + status. An INSERT that violates it is the
-- signal to stop, which makes de-duplication a property of
-- the schema rather than a check somebody can forget to
-- write.
-- ==========================================
CREATE TABLE IF NOT EXISTS webhook_log (
  provider   TEXT NOT NULL,
  event_key  TEXT NOT NULL,
  order_id   TEXT,
  at         INTEGER NOT NULL,
  PRIMARY KEY (provider, event_key)
);

CREATE INDEX IF NOT EXISTS idx_webhook_at ON webhook_log (at);


-- ==========================================
-- order_attempts
-- Order-creation attempts by IP, for rate limiting.
--
-- The licence system's own attempts table counts FAILURES,
-- because guessing a key is the thing it defends against.
-- This one counts every attempt, successful or not, because
-- the thing it defends against is somebody opening a
-- thousand invoices - each of which is a real API call to
-- the payment provider, against our account's quota.
--
-- Separate table rather than a second column on the licence
-- one, so the two limits can never be tuned into each other
-- by accident.
-- ==========================================
CREATE TABLE IF NOT EXISTS order_attempts (
  ip_hash TEXT NOT NULL,
  at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_order_attempts ON order_attempts (ip_hash, at);
