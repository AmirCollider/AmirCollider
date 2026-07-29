# Unity DocSnap licensing — operator runbook

Everything needed to sell Unity DocSnap Plus and Pro and support them
afterwards.
Read once, then come back for the commands.

## How it fits together

```
customer buys at /checkout, pays in any coin
                     │
        payment confirms ──▶ Worker mints ONE key at the right tier
                     │              │
                     │         D1 (hash only) ──▶ licenses
                     │
        key emailed automatically, in the buyer's language
                     │
   Unity ──activate──▶ Worker ──▶ D1
         ◀──signed token (carries the tier)──┘
                     │
   Editor verifies offline for 45 days
```

**The tier is fixed when a key is minted** and travels in the signed
token, so the Editor unlocks exactly what was bought. There is no
upgrade path inside a key — a Plus customer moving to Pro buys a Pro
key.

**Keys are minted per sale, not pre-generated into a pool.** The
checkout in `CHECKOUT.md` generates one at the moment a payment
confirms and emails the plaintext straight out; D1 keeps only the
hash. That is what makes automatic delivery possible at all, because
a pool of hashes cannot be emailed to anybody.

The batch generator below still exists and is still the right tool for
everything that is not an automated sale: a manual sale, a replacement
key, a studio licence, a review copy, or loading a third-party
storefront's serial pool.

A key becomes a customer at **first activation**, which is the only
moment the licence tables can observe. The `orders` table holds the
sale; `licenses` holds who activated what, where.

---

## One-time setup

### 1. Create the database

The `LICENSE_DB` binding ships **commented out** in `wrangler.jsonc`,
so the Worker deploys and runs normally before any of this is done —
every `/license` endpoint simply answers `503 not_configured` and no
other route is affected. Do not uncomment it before the database
exists: Cloudflare validates every binding at deploy time and rejects
an invalid id with

```
binding LICENSE_DB of type d1 must have a valid `database_id`
specified [code: 10021]
```

which, on a Git-connected build, fails the deploy for the *whole*
Worker.

**With the CLI:**

```bash
npx wrangler d1 create amircollider-licenses
npx wrangler d1 execute amircollider-licenses --remote \
    --file=./migrations/0001_licenses.sql
```

**From the dashboard**, if you deploy by pushing to GitHub and never
run wrangler locally:

1. Cloudflare dashboard ▸ **Storage & Databases ▸ D1 ▸ Create**
2. Name it `amircollider-licenses`
3. Open it ▸ **Console** tab ▸ paste the whole of
   `migrations/0001_licenses.sql` ▸ run
4. Copy the **Database ID** from the database's overview page

Either way, finish by uncommenting the `LICENSE_DB` block at the
bottom of `d1_databases` in `wrangler.jsonc` and pasting the real
UUID in. Note the leading comma — it separates the new entry from
`NEON_KATANA_DB`:

```jsonc
    ,{
      "binding": "LICENSE_DB",
      "database_name": "amircollider-licenses",
      "database_id": "the-uuid-you-just-copied"
    }
```

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

The automated path — crypto checkout, automatic minting, automatic
delivery, and what to do when a step misbehaves — is documented
separately in **[CHECKOUT.md](CHECKOUT.md)**. What follows is the
manual path.

### Generate a batch

`tier` is required — `"plus"` or `"pro"`. There is deliberately no
default: guessing wrong in either direction costs real money and is
invisible until a customer complains.

```bash
# Plus pool
curl -s https://amircollider.n95pluss.workers.dev/license/admin \
  -H "Authorization: Bearer $DOCSNAP_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"generate","count":100,"tier":"plus","batch":"2026-07-launch-plus","seats":1}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['serials'])" \
  > serials-plus.txt

# Pro pool — same call, different tier
curl -s https://amircollider.n95pluss.workers.dev/license/admin \
  -H "Authorization: Bearer $DOCSNAP_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"generate","count":100,"tier":"pro","batch":"2026-07-launch-pro","seats":1}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['serials'])" \
  > serials-pro.txt
```

Each file is one key per line. Send one to a customer, or paste the
list into a storefront's serials box — then delete the files.

**Check the tier before you send anything.** The response echoes it
back, and the batch label defaults to include it. A Pro key sent for a
$19.99 sale hands that buyer the whole $49.99 feature set; the other
way round, a $49.99 buyer gets two features and asks for a refund.

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

Returns the tier, status, seat count, batch, and every activated
machine with its label, version and last-seen time. The tier is the
first thing to check on any "I bought Pro but feature X is locked"
report.

### "I got a refund" / chargeback

```bash
-d '{"action":"revoke","key":"'"$KEY"'"}'
```

Clears the activations and stops future ones. A machine already
holding a token keeps Pro until it expires — up to 45 days. That is
the price of offline verification, and it is bounded.

`"action":"restore"` reverses it.

### "I lost my key"

If they bought through `/checkout` within the last 30 days, they do not
need you: `/order` looks their orders up by email and re-sends **the
same key**. See CHECKOUT.md.

Otherwise: revoke the old one, generate a batch of 1 **at the same
tier**, and send them the new key.

### "I bought Plus and want to upgrade to Pro"

They buy a Pro key and enter it in Unity — it replaces the stored
activation. Their Plus key is untouched and can stay on another
machine. There is no in-place upgrade and no partial-refund mechanism
here; refunds are issued from the payment provider's dashboard.

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
| `key` | the licence key (its tier is looked up server-side) |
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

**A key's tier is fixed at generation.** It is stored on the row and
copied into every token that key produces. Changing what somebody
bought means issuing a key at the other tier, not editing this one -
and the `licenses.tier` column is the single source of truth the
Editor ultimately reads.

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
