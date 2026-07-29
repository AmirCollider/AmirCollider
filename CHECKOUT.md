# Crypto checkout — operator runbook

Everything needed to sell Unity DocSnap for cryptocurrency, with the
licence key minted and emailed automatically, and everything needed to
deal with it when a step misbehaves.

Read once end to end before you switch it on. Come back for the tables.

---

## What happens when somebody buys

```
customer  ── picks a tier, types an email ──▶  /checkout
                                                  │
                              order row written (status: created)
                                                  │
                          NOWPayments invoice opened  ──▶ hosted pay page
                                                  │          (every coin, QR codes)
                                       status: awaiting_payment
                                                  │
                          customer sends BTC / USDT / ETH / …
                                                  │
                  ┌───────────────────────────────┴───────────────┐
                  │                                               │
        IPN callback arrives                          callback never arrives
        POST /checkout/webhook                        (lost, blocked, provider blip)
                  │                                               │
        HMAC-SHA512 verified                          cron, every 5 minutes,
        de-duplicated                                 asks the provider directly
                  │                                               │
                  └───────────────────────────────┬───────────────┘
                                                  │
                                          status: paid
                                                  │
                        conditional UPDATE claims the row (status: issuing)
                                                  │
                        key minted → licenses table (hash only)
                        plaintext sealed with AES-GCM into the order row
                                          status: issued
                                                  │
                        email queued in mail_outbox, then sent
                                          status: delivered
```

Two properties are worth stating plainly, because everything else in
this document follows from them:

**Nothing is delivered without a verified signature.** The callback URL
is public. If the HMAC check were missing, posting JSON at it would be a
way to be issued a paid licence for free.

**Every step is resumable.** The order row records where it got to
before it attempts the next thing. A Worker that dies between minting a
key and sending the email leaves an order at `issued` with the key
already recorded — and the next cron tick sends it. There is no step
whose failure loses a sale.

---

## Order states

| State              | Meaning                                        | Who moves it on |
|--------------------|------------------------------------------------|-----------------|
| `created`          | Row written, provider not called yet            | The request, immediately |
| `awaiting_payment` | Invoice open, no money yet                      | Webhook, or cron polling |
| `partially_paid`   | Underpaid — **never auto-delivers**             | You |
| `paid`             | Payment confirmed, key not minted yet           | Delivery pipeline |
| `issuing`          | A worker holds this row (claim expires in 2 min)| Delivery pipeline |
| `issued`           | Key minted, email not confirmed sent            | Mail outbox retry |
| `delivered`        | A mail provider accepted the message            | — terminal |
| `expired`          | 24 h with no payment                            | — (a late payment still delivers) |
| `refunded`         | Provider reversed it                            | You — revoke the key |
| `failed`           | Invoice could not be opened                     | — |

---

## One-time setup

### 1. Apply the database migration

The orders, outbox and callback-ledger tables live in the existing
`amircollider-licenses` D1 database, alongside the licences.

```bash
npx wrangler d1 execute amircollider-licenses --remote \
    --file=./migrations/0002_commerce.sql
```

Or from the dashboard: **D1 ▸ amircollider-licenses ▸ Console**, paste
the whole of `migrations/0002_commerce.sql`, run.

Every statement is `CREATE ... IF NOT EXISTS`, so running it twice is a
no-op. If you are not sure whether you already applied it, just apply it.

Check it worked:

```sql
SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;
-- expect: license_activations, license_attempts, licenses,
--         mail_outbox, order_attempts, order_events, orders, webhook_log
```

### 2. Create a NOWPayments account

1. Sign up at <https://nowpayments.io> and add a payout wallet.
   Payouts go to **your** wallet — NOWPayments is non-custodial, so this
   is the address the money actually lands at. Get it right.
2. **Settings ▸ API keys** → create one. That is `NOWPAYMENTS_API_KEY`.
3. **Settings ▸ Payments ▸ Instant Payment Notifications**:
   - IPN callback URL: `https://amircollider.n95pluss.workers.dev/checkout/webhook`
   - Copy the **IPN secret key**. That is `NOWPAYMENTS_IPN_SECRET`.

The IPN secret is not the API key. They are two different values and
swapping them produces a checkout where invoices open fine and no
payment is ever delivered — the single most confusing failure this
system has.

### 3. Set up email sending

A Worker cannot send mail on its own. MailChannels used to be the free
route and was withdrawn, so one of these is required:

**Resend** (recommended — simplest):
1. <https://resend.com> → add and verify your sending domain
   (a few DNS records: SPF, DKIM).
2. Create an API key → `RESEND_API_KEY`.

**Brevo** (free tier is generous, works as the fallback):
1. <https://brevo.com> → verify a sender.
2. **SMTP & API ▸ API keys** → `BREVO_API_KEY`.

Set **both** if you can. The mailer tries Resend, and falls back to
Brevo inside the same attempt — so an outage at one costs a customer
nothing rather than costing them the retry schedule.

> Use a real domain you control for `DOCSNAP_MAIL_FROM`. A free-mail
> address (gmail, yahoo) as the From on transactional mail is rejected
> outright by Resend and spam-foldered by everyone else. If your only
> address is `amircollider@yahoo.com`, keep that as the *reply-to* —
> which is what the templates already do — and send from your own
> domain.

### 4. Generate the two internal secrets

These are yours; nobody else ever sees them. Any long random string:

```bash
openssl rand -base64 32   # → DOCSNAP_KEY_WRAP_SECRET
openssl rand -base64 32   # → DOCSNAP_ORDER_SECRET
```

`DOCSNAP_KEY_WRAP_SECRET` encrypts the plaintext licence key inside the
order row so a customer who lost their email can be sent **the same
key** back. Rotating it makes every un-wiped key unreadable — resends
then fail with `key_expired` and you re-issue by hand. Do not rotate it
casually.

`DOCSNAP_ORDER_SECRET` signs the order-status links. Rotating it
invalidates every link already sitting in a customer's inbox; they can
still get in with the bare order number.

### 5. Put the secrets on the Worker

```bash
npx wrangler secret put NOWPAYMENTS_API_KEY
npx wrangler secret put NOWPAYMENTS_IPN_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put BREVO_API_KEY            # optional fallback
npx wrangler secret put DOCSNAP_MAIL_FROM        # e.g. sales@yourdomain.com
npx wrangler secret put DOCSNAP_MAIL_FROM_NAME   # optional, defaults to "AmirCollider"
npx wrangler secret put DOCSNAP_ADMIN_EMAIL      # where alerts go — your inbox
npx wrangler secret put DOCSNAP_KEY_WRAP_SECRET
npx wrangler secret put DOCSNAP_ORDER_SECRET
```

Dashboard equivalent: **Workers & Pages ▸ amircollider ▸ Settings ▸
Variables and Secrets ▸ Add ▸ type: Secret**.

`DOCSNAP_LICENSE_PRIVATE_KEY` must already be set from the licensing
setup — the checkout mints keys, and the Editor cannot activate them
without it. See `LICENSING.md`.

### Full secret reference

| Secret | Required | What breaks without it |
|---|---|---|
| `NOWPAYMENTS_API_KEY` | yes | Checkout page shows "not switched on"; no invoices open |
| `NOWPAYMENTS_IPN_SECRET` | yes | Every callback is rejected 401; nothing is ever delivered |
| `RESEND_API_KEY` *or* `BREVO_API_KEY` | yes | Keys are minted and never sent |
| `DOCSNAP_MAIL_FROM` | yes | Same — the mailer refuses to send with no From |
| `DOCSNAP_MAIL_FROM_NAME` | no | Sender shows as "AmirCollider" |
| `DOCSNAP_ADMIN_EMAIL` | strongly | You are not told when an order gets stuck |
| `DOCSNAP_KEY_WRAP_SECRET` | yes | Delivery throws; no order completes |
| `DOCSNAP_ORDER_SECRET` | yes | Same |
| `DOCSNAP_LICENSE_PRIVATE_KEY` | yes | Keys are delivered but cannot be activated |
| `DOCSNAP_ADMIN_TOKEN` | for tooling | `/license/admin` and `/testsite/checkout` from a terminal |
| `TestSitePassword` | for tooling | The `/testsite` panel and its checkout simulator |
| `NOWPAYMENTS_API_BASE` | no | Set only to point at the sandbox; delete to go back to live |

### 6. Deploy

```bash
npx wrangler deploy
```

`wrangler.jsonc` now carries a cron trigger (`*/5 * * * *`). Confirm it
registered: **Workers & Pages ▸ amircollider ▸ Settings ▸ Triggers ▸
Cron Triggers**. Without it, a lost callback is never recovered and a
failed email is never retried — the checkout still works, but it loses
its whole safety net.

### 7. Test it before announcing anything

You do not have to spend money to find out whether this works.

#### The fast way: the checkout simulator (recommended)

Everything up to the payment can be checked by looking at it — the form
renders, the invoice opens, NOWPayments shows a price and a coin list.
Everything *after* the payment is the part that matters and the part
you cannot see, because seeing it would mean sending real crypto to
yourself.

So the simulator synthesizes only the provider's message and leaves
everything else real: it builds the exact JSON body NOWPayments would
POST, signs it with your real `NOWPAYMENTS_IPN_SECRET`, and hands it to
the real webhook. A rehearsal therefore exercises the signature check,
the de-duplication ledger, the state machine, key minting, sealing, the
mail queue and your mail provider. **A real key is minted and a real
email is sent.** The only fiction is that the money moved.

1. Set `TestSitePassword` if you have not already, and sign in at
   **`/testsite`**.
2. Scroll to **Checkout simulator**.
3. Put a real address you can read into the email field, pick a tier
   and an email language, and press
   **"Run it all: order → payment → key → email"**.
4. Read the verdict line. Green means the whole chain worked — go and
   look in that inbox. Red names the step that failed and what to look
   at.
5. When you are finished, press **"Purge test data"**.

The other buttons exist for when something is red:

| Button | What it is for |
|---|---|
| Create order only | Get an order id without paying it, to inspect first |
| Simulate payment only | Re-fire a callback at an existing rehearsal order |
| Inspect order | Full state, event history and every mail attempt |
| Send a test email | Is the mail provider working *at all*? Isolates mail from everything else |
| Run cron now | Runs the reconciliation pass immediately instead of waiting five minutes |
| Purge test data | Deletes rehearsal orders and **revokes** their keys |

The **Payment status** dropdown lets you rehearse the unhappy paths
too: `partially_paid` should refuse to deliver and alert you,
`expired` and `failed` should close the order without minting
anything.

From a terminal, the same thing with the admin token:

```bash
BASE=https://amircollider.n95pluss.workers.dev
AUTH="Authorization: Bearer $DOCSNAP_ADMIN_TOKEN"

# What is wired up? (booleans only — never prints a secret)
curl -s $BASE/testsite/checkout -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"action":"config"}'

# Create a rehearsal order
curl -s $BASE/testsite/checkout -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"action":"order","tier":"pro","email":"you@yourdomain.com","lang":"fa"}'

# Pay it (use the id from the previous response)
curl -s $BASE/testsite/checkout -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"action":"pay","order":"ord_…","status":"finished"}'

# Clean up
curl -s $BASE/testsite/checkout -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"action":"purge"}'
```

> **Is this a way to get a free licence?** No. It is gated on the same
> credentials that already mint keys — the admin token can call
> `/license/admin generate` directly — so it grants nothing new. And it
> **refuses to simulate a payment against a real order**: only orders
> it created itself, which are marked `provider='test'`, can be paid
> this way. A rehearsal can never deliver a key for an invoice somebody
> has not actually paid.

#### Also run the automatic sweep

The `/testsite` panel's **Run all** now includes a **Crypto checkout**
group and a **Demo videos** group. They are read-only — every check
asserts a refusal or a fetch — so they are safe to run against
production at any time.

The one to care about is **"Unsigned webhook"**. It posts an unsigned
callback and requires a 401. If that check ever goes red, anybody who
finds the URL can be issued a paid licence for free; treat it as an
emergency and check `NOWPAYMENTS_IPN_SECRET`.

The **Demo videos** group tells you whether the clips are actually
reachable in R2 in each language, and whether `Range` requests work
(without which seeking in the player silently does nothing).

#### The true end-to-end: the NOWPayments sandbox

If you want a real payment flow with fake money, NOWPayments has a
sandbox. It exercises their side as well as ours.

1. Make a sandbox account at <https://account-sandbox.nowpayments.io>.
2. Get its API key and IPN secret — they are **different values** from
   your live ones.
3. Point the Worker at it, without a code change:
   ```bash
   npx wrangler secret put NOWPAYMENTS_API_BASE
   # https://api-sandbox.nowpayments.io/v1
   npx wrangler secret put NOWPAYMENTS_API_KEY      # the sandbox key
   npx wrangler secret put NOWPAYMENTS_IPN_SECRET   # the sandbox secret
   ```
4. Buy something on `/checkout`. The sandbox lets you mark the payment
   paid from its dashboard, and the callback comes back to you for real.
5. **Put the live values back and delete `NOWPAYMENTS_API_BASE`.**

The `config` action and the test panel both report `SANDBOX` when
`NOWPAYMENTS_API_BASE` points at one, because a site quietly running
against the sandbox looks completely healthy — invoices open, callbacks
arrive, keys are delivered — and none of the money is real.

#### And once, for real

None of the above proves your payout wallet is right, because none of
it moves money. Before you announce anything, buy one licence yourself
with the cheapest coin you hold, and confirm the funds arrive in the
wallet you configured at NOWPayments. That is the one thing only a real
payment can tell you. Then check the key **activates in Unity**, and:

```sql
SELECT id, status, tier, key_public, delivered_at FROM orders
WHERE provider != 'test' ORDER BY created_at DESC LIMIT 5;
```

---

## Day-to-day

### Watching

```sql
-- anything that needs attention
SELECT id, status, tier, email, delivery_attempts, last_error,
       datetime(created_at/1000,'unixepoch') AS created
FROM orders
WHERE status NOT IN ('delivered','expired','failed')
ORDER BY created_at DESC;

-- mail that has not gone out
SELECT id, order_id, kind, attempts, last_error,
       datetime(next_attempt_at/1000,'unixepoch') AS next_try
FROM mail_outbox WHERE sent_at IS NULL;

-- the full history of one order
SELECT kind, detail, datetime(at/1000,'unixepoch') FROM order_events
WHERE order_id = 'ord_…' ORDER BY at;
```

### The alerts you will actually get

Each of these lands in `DOCSNAP_ADMIN_EMAIL` with `[DocSnap]` in the
subject.

**"Paid order has not been delivered"** — an order has been paid for
more than 15 minutes without reaching an inbox. Look at `last_error`.
Almost always the mail provider. The outbox keeps retrying on its own
for a day; you usually need to do nothing but check the reason.

**"Underpaid order needs a decision"** — somebody sent less than the
invoice. Nothing was delivered, deliberately. Compare `actually_paid`
with `pay_amount` and choose:
- close enough (a fee shaved off the top) → deliver it by hand:
  ```bash
  curl -X POST https://amircollider.n95pluss.workers.dev/license/admin \
    -H "Authorization: Bearer $DOCSNAP_ADMIN_TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{"action":"generate","tier":"plus","count":1}'
  ```
  then email the key to the address on the order.
- genuinely short → reply asking for the difference, or refund from the
  NOWPayments dashboard.

**"Payment refunded after delivery"** — revoke the key:
```bash
curl -X POST https://amircollider.n95pluss.workers.dev/license/admin \
  -H "Authorization: Bearer $DOCSNAP_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"action":"revoke","key":"DSNAP-XXXXX-XXXXX-XXXXX"}'
```
Note the cost of offline verification: a machine already holding a
token keeps its edition until that token expires (45 days).

**"Payment provider would not open an invoice"** — nobody can buy right
now. Check the NOWPayments account status and the API key. This is the
one alert that is urgent.

**"Payment for an order we do not have"** — a callback for an
`order_id` that is not in the table. Check the provider dashboard
before somebody asks for a refund.

**"Order has a key that cannot be re-read"** — the sealed copy will not
open, which means `DOCSNAP_KEY_WRAP_SECRET` changed. Generate a
replacement key by hand, send it, revoke the old one.

---

## Customer-facing recovery

Three doors, in the order a customer finds them:

1. **The status page** — `/checkout/pay?o=…`. Live status, and a
   **resend** button once a key exists (3 per hour per order).
2. **`/order`** — "my key has not arrived", in all three languages:
   wait / check spam / open your order / *email me my order links* /
   here is a support email already written for you.
   The lookup **always** answers the same regardless of whether that
   address has orders, and sends the real answer to the inbox — so it
   cannot be used to test whether somebody is a customer.
3. **The prepared support email** — `content/supportTemplates.js`.
   Persian, English and Japanese, prefilled with the order number, tier,
   amount, address, payment time and currency when the page knows them,
   with visible `________` blanks where it does not, a reminder to
   attach the payment screenshot, and `#UnityDocSnap
   #LicenseNotReceived #PaidOrder` so it is one search in your mailbox.

Re-sending is always the **same key**, never a new one — a fresh key
would silently invalidate whichever one the customer may already have
activated. That is what the sealed copy is for. It is wiped 30 days
after issue (`COMMERCE.KEY_RETENTION_MS`); after that a resend answers
`key_expired` and you re-issue by hand.

---

## Tuning

All in `CONFIG.COMMERCE` in `config.js`:

| Setting | Default | Note |
|---|---|---|
| `INVOICE_TTL_MS` | 24 h | Unpaid orders are marked expired after this. A late payment still delivers. |
| `DELIVERY_PROMISE_MINUTES` | 5 | Quoted on the pay page **and** in the support template. Keep it ≥ the cron interval. |
| `KEY_RETENTION_MS` | 30 days | How long self-service resend works. |
| `MAIL_RETRY_MINUTES` | 1,3,10,30,120,360,720,1440 | Retries then stop; the list length is the ceiling. |
| `STUCK_ALERT_MS` | 15 min | Paid-but-undelivered alert threshold. |
| `ORDER_RATE_LIMIT` | 12/hour/IP | Each order is a real provider API call. |

`PROVIDER_API` is the live NOWPayments URL. Override it per-deployment
with the `NOWPAYMENTS_API_BASE` secret rather than editing it here — a
code edit is a thing that can be forgotten in a deploy, and the
direction that gets forgotten is the one that leaves a live site
pointed at the sandbox.

If you change the cron interval in `wrangler.jsonc`, change
`DELIVERY_PROMISE_MINUTES` to match or the page is promising something
the schedule cannot keep.

---

## Things worth knowing before they bite

**USDT is not one thing.** TRC20, ERC20 and BEP20 are different
networks with different addresses. The hosted page handles this
correctly — it gives an address for the network the customer picked —
and the checkout page says so in all three languages. It is still the
single most common way a crypto payment is lost, and it is lost on the
customer's side where nothing here can reach it.

**Confirmed counts as paid.** Delivery happens on `confirmed` as well as
`finished`, so the customer is not left waiting for the provider to
finish settling into your account. If a confirmed payment somehow
reverses, you revoke — which has to exist for chargebacks anyway.

**Duplicate callbacks are normal.** Providers retry. The
`(provider, event_key)` primary key on `webhook_log` makes
de-duplication a property of the schema rather than a check somebody has
to remember. The webhook answers 200 even for events it ignores,
because a non-200 just makes the provider try again.

**A 500 in the webhook is answered 200 on purpose.** The event is
already in the ledger, so a retry would be dropped as a duplicate. The
reconciler is what recovers that order, and it will.

**Prices move.** `price_amount` is USD; the provider converts at payment
time. Change a price in `CONFIG.DOCSNAP.TIERS` and it applies to new
orders only — open invoices keep the amount they quoted.

**The plaintext key exists in exactly two places, briefly**: in memory
during delivery, and AES-GCM sealed in the order row for 30 days. It is
never in the `licenses` table, never in `order_events`, never in a log
line.

---

## If you ever want a different payment provider

`commerce/provider.js` is the only file that knows the word
"NOWPayments". It exports `createInvoice`, `fetchPayment`,
`fetchInvoicePayments` and `normalizeStatus`, and everything else in the
checkout speaks the `PAYMENT_STATE` vocabulary rather than the
provider's. A swap to Cryptomus, Coinbase Commerce or a self-hosted
BTCPay Server is that one file plus the signature check in
`commerce/seal.js`.

---

See also: `LICENSING.md` for the key format, activation, seat management
and the admin API.
