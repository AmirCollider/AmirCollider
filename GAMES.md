# Games, the storefront, and TheGod

How a game exists on this Worker, what an operator can change without a
deploy, how a player buys something on the website, and how the game
finds out.

Companion to `CHECKOUT.md` (the Unity DocSnap licence checkout) and
`LICENSING.md` (licence keys). Those two sell a developer tool by email.
This one sells a thousand shards to a signed-in player.

---

## The one rule

**Code decides which games exist. The database decides only how an
existing game is presented and sold.**

That is not a limitation that was worked around — it is the property the
whole design protects.

A game is a D1 binding, four Google OAuth secrets, a deep-link scheme, an
Android package name and a product catalogue that a shipped build already
hard-codes. None of that can be conjured by an `INSERT`. A row claiming
to be a game would draw a card on the dashboard and be unable to sign a
single player in — and you would find out from a support message rather
than from a deploy that did not happen.

So:

| | lives in | changed by |
|---|---|---|
| which games exist | `GAME_REGISTRY` in `config.js` | a deploy |
| capabilities (login, cloud save, leaderboard, store) | `config.js` | a deploy |
| product ids, skus, what a product grants | `config.js` | a deploy |
| D1 binding, OAuth env var names, package, deep link | `config.js` | a deploy |
| display name, logo, colour, description, tags | `game_settings` | the panel |
| status (live / maintenance / soon) | `game_settings` | the panel |
| **whether the download link works** | `game_settings` | the panel |
| download links themselves | `game_settings` | the panel |
| minimum client version | `game_settings` | the panel |
| a product's price, ribbon, order, on-sale flag | `game_product_overrides` | the panel |

Reading `config.js` therefore still tells you exactly which games this
Worker serves. It stays true after the panel has been used, which is the
whole point of it working this way.

The merge happens in `games/registry.js`, and it walks the code registry
— never the table. A settings row whose `game_id` is not in
`GAME_REGISTRY` is never read at all. Deleting a row cannot remove a
game; it only returns that game to its coded defaults.

---

## TheGod

`/thegod`, behind `TestSitePassword` — the same password as `/testsite`,
with its own cookie scoped `Path=/thegod` so a browser will not send one
panel's session to the other.

Seven tabs:

**Games** — every game from the registry, with its overrides. Change the
name, logo, accent colour, status, the description in all three
languages, the download links, the minimum client version. One switch
takes the download offline. "Back to the coded values" drops the whole
override row.

**Storefront** — the catalogue for one game. Re-price a product, take it
off sale, give it a ribbon, change the order. It cannot create one: a
product id is a string a shipped build already holds, so inventing one
from a web form produces an id no client has ever heard of. Adding a
product is one entry in `store.products` in `config.js`.

**Payments** — orders from the site's storefront, with totals, filters,
and a link to the NOWPayments dashboard where the invoices and
withdrawals actually live. A paid order that did not deliver itself can
be delivered by hand from here.

**Players** — everybody who has bought something. See what they own,
grant something, take something back. Every grant and revoke is written
to `game_entitlement_events`, because a gift nobody can trace is
indistinguishable from a bug.

**SQL builder** — writes the migration for a game's own D1 database, with
the exact columns `worker.js` reads by name, plus the wrangler commands
in the order they have to be run. It generates; it never executes. See
below.

**New game** — writes the `GAME_REGISTRY` entry, the `wrangler.jsonc`
binding, the SQL and the Unity constants file. You paste them and deploy.

**Unity code** — the C# that connects a game to this Worker, with the
selected game's real id, endpoints and product ids already in it.

### What the panel deliberately cannot do

Create a game. Delete a game. Rename a product id. **Run SQL.**

The last one is worth stating plainly: a panel that could execute
generated SQL against a bound database is one stolen session cookie away
from dropping a live game's players table. The cost of copying into
`wrangler d1 execute` is about four seconds, and it buys a step where a
human reads what is about to happen.

---

## The offline switch

> "Take the game offline — the download link stops working, but the game
> is still on the site."

`game_settings.download_enabled = 0`, or the switch on the Games tab.

What changes:

- The card's download button greys out and says so.
- `/{game}/download` stops redirecting and renders a short "not right
  now" page with links onward.
- `/games/{game}/manifest` reports `download.enabled: false`, so a
  shipped build knows too.

What does **not** change: the game's page, sign-in, the store, the
leaderboard, the privacy and terms pages, and every link anybody has ever
shared. Pulling a build is an afternoon's decision, not a deletion.

Every download link on the site points at `/{game}/download` rather than
at the store directly. That is what makes the switch real: a link
straight to Myket would keep working after the download was withdrawn,
which is the exact thing the switch exists to prevent.

`status = 'maintenance'` is the same idea with a badge that says it out
loud. `status = 'soon'` is for a game that has never shipped: the
download is off by default and no row is needed.

---

## The card

The old card was six equal buttons: health, ping, metrics, privacy,
terms, leaderboard. Every one of them answers a question a developer has
and nobody else does — and three of them are meaningless for a game that
plays offline and only reaches the network to sign in.

The card now leads with what a visitor came for:

- **capability chips** — "Plays offline" or "Online play", then Google
  sign-in, cloud save, leaderboard, in-app purchases. Driven entirely by
  `game.capabilities`, so an offline game stops advertising a ping test
  by saying so in `config.js`.
- **an explainer**, when a game plays offline and still wants the network
  — otherwise "plays offline" next to a sign-in button is a contradiction
  on the face of it.
- **In-app purchases** and **Sign in**, as the two primary actions.
- **the download button**, greyed and labelled when withdrawn — never
  missing, because a button that vanishes reads as a bug and a greyed one
  reads as a decision.
- leaderboard / privacy / terms as quiet links.
- **the diagnostics**, folded into a collapsed `<details>`. Still one
  click away, no longer the first thing the page says about a game. Ping
  and metrics only appear for a game that has online services at all.

---

## Buying on the website

```
player signs in with Google        /{game}/account
    ↓
picks a product                    /{game}/store
    ↓
POST /{game}/store/buy             row written FIRST, then the invoice
    ↓
hosted NOWPayments invoice         any coin they like
    ↓
POST /games/webhook                signed, de-duplicated
    ↓
entitlement granted                game_entitlements
    ↓
GET /games/{game}/entitlements     the game sees it
```

### Why the site needs a sign-in

Because the store does. Somebody buying 6,500 shards in a browser has to
be the same person the game will hand them to, and an email typed into a
form is not proof of that — it is a support ticket waiting for the moment
somebody mistypes their own address.

The player id is derived from the Google address exactly as the game
derives it (`playerIdFromEmail`: local part, lowercased, fifteen
characters). That identity is load-bearing rather than a coincidence: it
is why a purchase made on a laptop is in the account before the laptop is
put down.

The flow routes through `/oauth/callback` — already a registered redirect
URI with Google — carrying `purpose: 'site'` in the **signed** state. The
signature matters there: the state also carries where to return to, and a
caller who could choose that from a query string could have a session
cookie minted on a redirect to their own page.

### Two ways to prove who you are

| | proof | why |
|---|---|---|
| the website | signed `ac_player` cookie, one week | a page cannot hold an id_token; it expires in an hour, and refreshing it would mean the browser keeping a refresh token |
| a game | `Authorization: Bearer <id_token>`, verified with Google on every call | the build already holds that token from `/oauth/token` |

Both resolve to the same player id.

### The money

The provider module (`commerce/provider.js`) is shared with the licence
checkout, unchanged apart from the callback and return paths becoming
parameters. What is **not** shared is the order table or the fulfilment:
a game purchase in the `orders` table would eventually be handed a Unity
DocSnap licence key by that reconciler.

Both shops ride one NOWPayments account and one IPN secret, so
`/games/webhook` ignores any callback whose `order_id` does not start
with `gord_`, and de-duplicates under its own provider name in
`webhook_log`.

The price is read from the catalogue and frozen into the row. It is never
read from a request body — a price that can arrive from the client is a
$9.99 season pass bought for one cent by anybody who opens dev tools.

A refund revokes the entitlement. Left alone, a refunded purchase is a
player who has the shards and the money.

### The safety net

The cron that already runs every five minutes now also reconciles game
orders: grants anything paid and not granted, asks the provider about
orders still waiting, expires what nobody paid for. In its own
`try`/`catch`, because the two shops fail independently.

---

## What a game sees

| endpoint | auth | for |
|---|---|---|
| `GET /games/{id}/manifest` | none | status, capabilities, download, products, every endpoint URL |
| `GET /games/{id}/products` | none | the catalogue on its own |
| `GET /games/{id}/entitlements` | player | what this player owns |
| `POST /games/{id}/entitlements/consume` | player | spend a consumable |

The manifest exists because everything an operator changes in the panel
is invisible to a build already on somebody's phone. Without one call at
boot, the only way a player learns their game changed is by hitting the
thing that changed and getting an error.

**Balances are per product, not per currency.** A player with two shard
packs has two rows. That is deliberate: the decrement is a conditional
`UPDATE` on one row — "subtract this if there is this much" — which is
what makes two devices spending the last hundred shards at the same
moment impossible to get wrong. `AmirColliderStore.Spend()` in the Unity
kit walks the rows so game code does not have to.

Kinds:

- `consumable` — spent and bought again. The balance moves by
  `grant.amount`, so "1,000 Neon Shards" adds 1,000.
- `nonconsumable` — owned once, forever. A double grant is harmless.
- `pass` — owned for `durationDays`. Buying again while one is running
  **extends** it rather than restarting it.

---

## The Unity kit

`/thegod` ▸ Unity code, generated from the game record so the ids,
endpoints and product constants are that game's real ones.

| file | what it is for |
|---|---|
| `{Game}Constants.cs` | every address, in one place |
| `AmirColliderApi.cs` | one timeout, one definition of "failed", one place to add a header |
| `AmirColliderAuth.cs` | Google sign-in through the proxy — Android deep link, editor paste-the-code |
| `AmirColliderPlayer.cs` | profile, cloud save, high score |
| `AmirColliderLeaderboard.cs` | the public board |
| `AmirColliderStore.cs` | entitlements, consuming, opening the web store |
| `AmirColliderStatus.cs` | the manifest, the offline switch, version check |

Plain C#: coroutines and `JsonUtility`, no third-party JSON, no
async/await over `UnityWebRequest`. A sample that needs three packages
installed before it compiles is a sample that gets skimmed and
reimplemented badly.

Each file comes with the notes that are not obvious from the code — that
a score below the record returns `200` with `success:false` and is not an
error, that the score body is a bare number and not JSON, that a failed
manifest fetch must never stop the game starting.

---

## Adding a game

`/thegod` ▸ New game writes all of this. The steps, in the order they
have to happen:

```bash
# 1. the database
npx wrangler d1 create pixel-runner-db          # prints a database_id

# 2. the binding — paste into wrangler.jsonc, with that id
#    { "binding": "PIXEL_RUNNER_DB",
#      "database_name": "pixel-runner-db",
#      "database_id": "…" }

# 3. the tables
npx wrangler d1 execute pixel-runner-db --remote --file=./migrations/pixel-runner.sql

# 4. the secrets
npx wrangler secret put PIXEL_RUNNER_GOOGLE_CLIENT_ID_WEB
npx wrangler secret put PIXEL_RUNNER_GOOGLE_CLIENT_SECRET
npx wrangler secret put PIXEL_RUNNER_GOOGLE_CLIENT_ID_ANDROID
npx wrangler secret put PIXEL_RUNNER_DEEPLINK_SCHEME

# 5. the game itself — paste the generated entry into GAME_REGISTRY
#    in config.js. THIS is the step that makes the game exist.

# 6. ship it
npx wrangler deploy
```

Every name is derived from the id, so the binding in the wrangler
snippet, the binding in the registry entry and the binding in the
migration comment are the same string because they are computed once.

---

## Setup on an existing deployment

```bash
npx wrangler d1 execute amircollider-licenses --remote --file=./migrations/0003_games.sql
```

That is the whole migration. Nothing else is required: with no rows, the
site renders exactly what `config.js` says, which is a correct site.

The storefront additionally needs what the licence checkout already
needs — `NOWPAYMENTS_API_KEY` and `NOWPAYMENTS_IPN_SECRET`. Without them
the buy buttons render disabled and say so, rather than collecting a
click and failing.

`/thegod` needs `TestSitePassword`, which is already set if `/testsite`
works.

Point the NOWPayments IPN callback for game invoices at
`https://amircollider.com/games/webhook`. The Worker sets it per invoice,
so there is nothing to configure in their dashboard — this is only worth
knowing when reading their logs.

---

## Files

```
config.js                   GAME_REGISTRY — the only place a game exists
games/registry.js           code + database → one merged game
games/store.js              every D1 query the game system makes
games/purchase.js           click → invoice → callback → entitlement
games/session.js            who is signed in, and how we know
games/oauthState.js         the signed state both sign-in flows share
games/sql.js                the SQL builder
games/scaffold.js           the code generator for a new game
content/unityKit.js         the C# and its notes
pages/thegod.js             the panel
pages/thegodApi.js          everything the panel can do
pages/gameApi.js            manifest, products, entitlements, the download gate
pages/gameAccount.js        signing a player into the website
pages/gameStore.js          the storefront and the payment callback
pages/gameChrome.js         the frame those three pages share
pages/GamesCards.js         the dashboard card
migrations/0003_games.sql   settings, products, orders, entitlements
migrations/neon-katana.sql  a game's own database, as the builder writes it
```
