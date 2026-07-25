# Unity DocSnap licensing — operator runbook

Everything needed to sell Unity DocSnap Pro and support it afterwards.
Read once, then come back for the commands.

## How it fits together

```
you  ──generate 100 keys──▶  D1 (hashes only)
      │
      └──paste plaintext──▶  Sell.app "Serials" pool
                                   │
                       customer buys, gets one key
                                   │
                    Unity ──activate──▶ Worker ──▶ D1
                          ◀──signed token──┘
                                   │
                    Editor verifies offline for 45 days
```

The payment path contains no code of ours. Sell.app holds a pool of
pre-generated keys and hands one out when a payment clears — no
webhook, nothing to go down at the moment of a sale, and no work for
you per order. The Worker's only job is turning a key into a
machine-bound token.

A key becomes a customer at **first activation**, which is the only
moment this system can observe. Sell.app holds the actual order
record; D1 holds who activated what, where.

---

## One-time setup

### 1. Create the database

```bash
npx wrangler d1 create amircollider-licenses
```

Copy the printed `database_id` into `wrangler.jsonc`, replacing
`REPLACE_WITH_D1_DATABASE_ID`. Then create the tables:

```bash
npx wrangler d1 execute amircollider-licenses --remote \
    --file=./migrations/0001_licenses.sql
```

Until that id is filled in, every `/license` endpoint answers
`503 not_configured`. No other route is affected, so deploying before
this is finished is safe.

### 2. Set the two secrets

```bash
bash scripts/generate-license-keypair.sh
```

It prints exactly what to paste for both. The private key signs
tokens and lives only in the Worker; the admin token guards key
generation.

```bash
npx wrangler secret put DOCSNAP_LICENSE_PRIVATE_KEY
npx wrangler secret put DOCSNAP_ADMIN_TOKEN
```

The script also prints the `PublicModulus` constant to paste into
`Editor/UnityDocSnap/Licensing/DocSnapLicenseToken.cs` in the
UnityDocSnap repository. **The two must match**, or every activation
will succeed on the server and be rejected by the Editor that asked
for it — which only shows up after somebody has paid.

> If you use the keypair that shipped with this change, the modulus
> already in `DocSnapLicenseToken.cs` is the right one and you only
> need to set the secret. Run the script only when you want a fresh
> key.

### 3. Deploy

```bash
npx wrangler deploy
```

---

## Selling

### Generate a batch

```bash
curl -s https://amircollider.n95pluss.workers.dev/license/admin \
  -H "Authorization: Bearer $DOCSNAP_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"generate","count":100,"batch":"2026-07-launch","seats":1}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['serials'])" \
  > serials.txt
```

`serials.txt` is one key per line — the format Sell.app's **Serials**
box wants. Paste it in, delete the file.

**The plaintext keys exist only in that one response.** D1 stores
SHA-256 hashes, so a leak of the database hands over nothing usable,
and there is no way to read a key back later. If a customer loses
theirs, revoke and re-issue (below) — it is one command.

`seats` defaults to 1, which is what the product page promises. Issue
a multi-seat key for a studio by passing e.g. `"seats":3`.

### Refill

Generate another batch with a new `batch` label and append to the
pool. Batches exist so that if one ever needs invalidating, you can
find its rows.

---

## Support

Every command below is the same `curl` with a different `action`.
`$KEY` is the customer's key, as they sent it — case and spacing are
normalised server-side, so paste it verbatim.

### "Is my key valid?" / "Where is it activated?"

```bash
-d '{"action":"lookup","key":"'"$KEY"'"}'
```

Returns the status, seat count, batch, and every activated machine
with its label, version and last-seen time.

### "I got a refund" / chargeback

```bash
-d '{"action":"revoke","key":"'"$KEY"'"}'
```

Clears the activations and stops future ones. A machine already
holding a token keeps Pro until it expires — up to 45 days. That is
the price of offline verification, and it is bounded.

`"action":"restore"` reverses it.

### "I lost my key"

Revoke the old one, generate a batch of 1, send them the new key.

### "I can't activate — it says the key is on another machine"

They should not need you. The refusal names the machine, and they can
release it from:

- **Unity** → `Unity DocSnap ▸ Licence & Pro Features ▸ Release this machine`
- **The web**, when the old machine is gone → `/license`, paste the key,
  press Release next to the device

### "It stopped working and I've been offline"

Their token's 45-day offline window lapsed. Connecting once and
pressing **Re-check now** fixes it. Nothing was lost, and their key is
unaffected.

---

## What the Editor sends

Three fields, on activation and renewal only:

| Field | Value |
|---|---|
| `key` | the licence key |
| `machine` | salted SHA-256 of Unity's `deviceUniqueIdentifier` |
| `version` | the package version, e.g. `1.0.0` |
| `label` | a device name like `DESKTOP-A1B2 (Windows)` — activation only |

Nothing about the project is transmitted: not its name, not its path,
not its size, not whether the export succeeded. The Free edition
never contacts the network at all.

`machine` is a hash, so the server can tell two machines apart and can
do nothing else with them. Raw hardware identifiers are never stored.

---

## Endpoints

| Method | Path | Who calls it |
|---|---|---|
| `POST` | `/license/activate` | Unity Editor |
| `POST` | `/license/validate` | Unity Editor (background renewal) |
| `POST` | `/license/deactivate` | Editor and web page |
| `POST` | `/license/devices` | web page |
| `POST` | `/license/admin` | you, with the bearer token |
| `GET` | `/license` | customers |
| `GET` | `/unity-docsnap` | the product page |

All the licence endpoints are POST and take the key in the body. A key
in a query string ends up in access logs, browser history, and the
`Referer` of anything the page links to.

---

## Things worth knowing before they bite

**Revocation is not instant.** Bounded by the 45-day token lifetime.
Shorten it in `licensing/tokens.js` (`TOKEN_LIFETIME_DAYS`) if you ever
need to trade offline tolerance for faster revocation — but that
window is what lets a customer work on a plane.

**Rotating the signing key invalidates every live token.** Customers
are not locked out: their keys and activations are untouched, and the
Editor renews within a day of being online. But anybody offline at the
time drops to Free until they reconnect.

**The gate is a licence check, not copy protection.** Unity DocSnap
ships as C# source inside the customer's own Editor, so a determined
person can edit the check out. That is a deliberate trade — the
alternative is an obfuscated DLL a Unity developer cannot read, debug
or trust inside their project, which costs every honest customer
something real. What the design *does* guarantee is that nobody can
forge a token: the signing key never leaves the Worker, so no working
keygen can be built from what ships.

**Rate limiting** is 20 failed attempts per IP per 15 minutes, swept
on read. Successful activations are never recorded there, so a busy
launch day cannot rate-limit itself.
