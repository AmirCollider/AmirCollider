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

1. Open `/checkout?tier=plus`. If it says purchase is not switched on,
   a secret is missing — the page checks the provider, the mailer and
   the database before it enables the button.
2. Buy one yourself, with the cheapest coin you hold. $19.99 is the
   cost of knowing the whole path works.
3. Watch it: `npx wrangler tail`. You want to see
   `Invoice opened` → `Licence issued for order` → `Order delivered`.
4. Check the email arrived, the key is well-formed (`DSNAP-…`), and it
   **activates in Unity**.
5. Verify the row:
   ```sql
   SELECT id, status, tier, key_public, delivered_at FROM orders
   ORDER BY created_at DESC LIMIT 5;
   ```

NOWPayments also has a sandbox (`api-sandbox.nowpayments.io`) if you
want to rehearse without spending anything — change `PROVIDER_API` in
`config.js`, test, and **change it back**.

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
