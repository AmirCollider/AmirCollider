# Games, the storefront, and TheGod

How a game exists on this Worker, what an operator can change without a
deploy, how a player buys something on the website, and how the game
finds out.

Companion to `Docs/Checkout.md` (the Unity DocSnap licence checkout) and
`Docs/Licensing.md` (licence keys). Those two sell a developer tool by email.
This one sells a thousand shards to a signed-in player.

---

## The one rule

**Code decides which games exist. The database decides only how an
existing game is presented and sold.**

That is not a limitation that was worked around — it is the property the
whole design protects.

A game is a D1 binding, three Google OAuth secrets, a deep-link scheme, an
Android package name and a product catalogue that a shipped build already
hard-codes. None of that can be conjured by an `INSERT`. A row claiming
to be a game would draw a card on the dashboard and be unable to sign a
single player in — and you would find out from a support message rather
than from a deploy that did not happen.

So:

| | lives in | changed by |
|---|---|---|
| which games exist | `GAME_REGISTRY` in `Config.js` | a deploy |
| capabilities (login, cloud save, leaderboard, store) | `Config.js` | a deploy |
| product ids, skus, what a product grants | `Config.js` | a deploy |
| D1 binding, OAuth env var names, package | `Config.js` | a deploy |
| display name, logo, colour, description, tags | `game_settings` | the panel |
| status (live / maintenance / soon) | `game_settings` | the panel |
| **whether the download link works** | `game_settings` | the panel |
| download links themselves | `game_settings` | the panel |
| minimum client version | `game_settings` | the panel |
| the Android deep-link scheme | `game_settings` | the panel |
| a product's price, ribbon, order, on-sale flag | `game_product_overrides` | the panel |

Reading `Config.js` therefore still tells you exactly which games this
Worker serves. It stays true after the panel has been used, which is the
whole point of it working this way.

The merge happens in `Games/Registry.js`, and it walks the code registry
— never the table. A settings row whose `game_id` is not in
`GAME_REGISTRY` is never read at all. Deleting a row cannot remove a
game; it only returns that game to its coded defaults.

---

## TheGod

`/thegod`, behind `TheGodPassword`, with its own cookie scoped
`Path=/thegod` so a browser will not send one panel's session to the other.

It used to share `TestSitePassword` with `/testsite`, which put the
credential you hand somebody to try a checkout in front of the screens
that set prices and ban players. `TheGodPassword` is its own secret now;
if it is unset the panel falls back to `TestSitePassword`, so a
deployment that has not set it yet is not locked out of the tool it would
use to set it.

Both login endpoints are rate limited — twelve failures per address per
fifteen minutes, in `panel_attempts` — and both session cookies carry
their issue time *inside* the signature, so an expiry is something this
Worker enforces rather than something the browser is asked to.

Nine tabs:

**Games** — every game from the registry, with its overrides. Change the
name, logo, accent colour, status, the tags, the description in all
three languages, the download links, the minimum client version, the
Android deep-link scheme. One switch takes the download offline. "Back
to the coded values" drops the settings row; "Delete the database rows"
drops that **and** the product overrides, putting the game back to
exactly what `Config.js` says. Neither can delete the game, and neither
touches orders or entitlements.

**Game page** — everything `/{game}` renders, and the release history
under it: the header image, the one-line pitch, the long description,
the feature strip, the screenshot gallery, the trailers, the device
list and the FAQ — each in all three languages. Below them, one row per
release: version, date, per-language notes and an optional download
link, with the newest date being what the site calls "the current
version".

The columns behind most of it arrived with `0005_game_pages.sql` and
`0008_landing_extra.sql`, and the landing page has always read them.
Until this tab existed nothing could write one, which is why a game's
own page rendered as a correct, empty template. A database that has run
only 0005 still saves the fields it has and says plainly which
migration the rest are waiting on.

**Storefront** — the catalogue for one game. Re-price a product, take it
off sale, give it a ribbon, change the order. It cannot create one: a
product id is a string a shipped build already holds, so inventing one
from a web form produces an id no client has ever heard of. Adding a
product is one entry in `store.products` in `Config.js`.

**Payments** — orders from the site's storefront, with totals, filters,
and a link to the NOWPayments dashboard where the invoices and
withdrawals actually live. A paid order that did not deliver itself can
be delivered by hand from here.

**Players** — everybody who has bought something. See what they own,
grant something, take something back. Every grant and revoke is written
to `game_entitlement_events`, because a gift nobody can trace is
indistinguishable from a bug.

**SQL builder** — writes the migration for a game's own D1 database, with
the exact columns `Worker.js` reads by name, plus the wrangler commands
in the order they have to be run. Also prints the game's current
overrides as portable SQL, and the two `DELETE`s that clear them. It
generates; it never executes. See below.

**Environment** — read-only. Every variable this Worker looks for,
whether it is set, and — first on the screen, because it is the most
common way sign-in breaks — the exact redirect URI to register with
Google. No secret's value is ever rendered: the API sends a boolean and
a character count, which is what "is it configured?" needs and is also
enough to tell a clean paste from one with a trailing newline. Public
values (a Google client id, a deep-link scheme) are shown in full,
because they already travel in a URL or ship inside the APK.

**New game** — writes the `GAME_REGISTRY` entry, the `wrangler.jsonc`
binding, the SQL, the Unity constants file and — for a game that ships
an APK — its `AndroidManifest.xml`. You paste them and deploy.

It asks **where the game runs** first, and everything after that follows
from the answer. A browser game has no Android package, no deep-link
scheme, no manifest and no Android OAuth client, so it is not asked for
any of them, none of them reach the generated entry, and the setup steps
that cover them are not printed. An Android game is asked for its store
links and gets the manifest and the scheme. "Both" asks for all of it.

**Unity code** — the whole kit for the selected game, not just the C#.
See below.

### What the panel deliberately cannot do

Create a game. Delete a game. Rename a product id. **Run SQL.** Show a
secret's value, or change one.

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
  by saying so in `Config.js`.
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

The provider module (`Commerce/Provider.js`) is shared with the licence
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
| `README.md` | the order to add them in, the project settings, a checklist |
| `{Game}Constants.cs` | every address, product id and Play sku, in one place |
| `AmirColliderApi.cs` | one timeout, one definition of "failed", one place to add a header |
| `AmirColliderAuth.cs` | Google sign-in through the proxy — Android deep link, editor paste-the-code |
| `AmirColliderPlayer.cs` | profile, cloud save, high score |
| `AmirColliderLeaderboard.cs` | the public board |
| `AmirColliderStore.cs` | entitlements, consuming, opening the web store |
| `AmirColliderStatus.cs` | the manifest, the offline switch, version check |
| `AmirColliderBootstrap.cs` | the worked example: what calls what, and in which order |
| `AndroidManifest.xml` | the intent-filter the sign-in code comes back through |
| `link.xml` | stops IL2CPP stripping the classes only `JsonUtility` constructs |
| `GOOGLE-SETUP.md` | the OAuth clients, the SHA-1, the redirect URI, the Play product ids |

Which files appear depends on the game. A browser game gets no
`AndroidManifest.xml` and no `link.xml`, because a deep link is not part
of its answer; a game without a store gets no entitlements client. A
file whose only correct use is deleting it is one more thing to wonder
about.

The last four are the difference between a kit and a folder of C#. The
constants file is referenced by name from every other file, so a kit
without it does not compile — and it was, for a while, the one file this
tab did not produce. The manifest is the reason sign-in "works in the
editor and does nothing on the phone": Android delivers a deep link only
to an app whose manifest claims that scheme. `link.xml` is the reason a
release build parses every response to `null` while the editor is fine.
And Google's console is where most sign-in failures actually live, none
of which produce an error message anywhere a developer is looking.

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
#    PIXEL_RUNNER_DEEPLINK_SCHEME is deliberately NOT here — see
#    "The deep-link scheme is not a secret" below.

# 5. authorise the redirect URI in the Google Cloud console:
#    https://<every hostname this Worker answers on>/oauth/callback
#    Credentials ▸ the Web OAuth client ▸ Authorized redirect URIs.

# 6. the game itself — paste the generated entry into GAME_REGISTRY
#    in Config.js. THIS is the step that makes the game exist.

# 7. ship it
npx wrangler deploy
```

Every name is derived from the id, so the binding in the wrangler
snippet, the binding in the registry entry and the binding in the
migration comment are the same string because they are computed once.

---

## Setup on an existing deployment

```bash
npx wrangler d1 execute amircollider-licenses --remote --file=./migrations/0003_games.sql
npx wrangler d1 execute amircollider-licenses --remote --file=./migrations/0004_deeplink.sql
```

`0003` is the whole game-management schema. Nothing else is required:
with no rows, the site renders exactly what `Config.js` says, which is a
correct site.

`0004` adds one column, `game_settings.deeplink_scheme`, and is what
lets the panel set a deep-link scheme. SQLite has no
`ADD COLUMN IF NOT EXISTS`, so running it a second time fails with
`duplicate column name: deeplink_scheme` — which means it already ran
and there is nothing to do.

---

## The deep-link scheme is not a secret

`NEON_KATANA_DEEPLINK_SCHEME` used to be a required Worker variable. It
should never have been one. The value is the URL scheme the Android
build registers, and the same string sits in the `AndroidManifest.xml`
of every APK anybody has ever downloaded — there is nothing to hide, and
making it a deploy-time secret meant a typo in it could only be
corrected by a redeploy.

Worse, it was on the boot check's required list, so deleting the
variable took down every page on the site, including the panels you
would open to find out why.

It now resolves in three layers, first match wins:

| | set in | changed by |
|---|---|---|
| 1 | `game_settings.deeplink_scheme` | the panel, Games tab |
| 2 | `NEON_KATANA_DEEPLINK_SCHEME` | a Cloudflare variable, if it still exists |
| 3 | `fallback.deepLinkScheme` in `Config.js` | a deploy |

Layer 3 is always present, which is what makes deleting the variable
safe. The panel's **Environment** tab shows the value in use and which
of the three layers it came from.

Anything that is not a URL scheme — a letter followed by letters,
digits, `+`, `-` or `.` — is refused on write and ignored on read, and
the resolution falls through to the next layer. A value with `://` in it
would produce a deep link that silently opens nothing.

---

## `Error 400: redirect_uri_mismatch`

This one is worth spelling out because nothing in Cloudflare can fix it.

The Worker sends Google a redirect URI of `<origin>/oauth/callback`,
where the origin is whatever hostname the player arrived on. Google
compares that string against a list kept in the Google Cloud console and
refuses if it is not there, character for character.

So a deployment reachable at both `amircollider.com` and
`amircollider.n95pluss.workers.dev` needs **both** lines registered:

```
https://amircollider.com/oauth/callback
https://amircollider.n95pluss.workers.dev/oauth/callback
```

Google Cloud console ▸ APIs & Services ▸ Credentials ▸ the **Web**
OAuth client ▸ Authorized redirect URIs. Changes can take a few minutes
to apply.

Two things that look like causes and are not: the OAuth secrets being
set in Cloudflare (they are checked at a later step, not this one), and
an **Android** OAuth client id. Android clients have no redirect URIs at
all, so passing one produces this exact error with a message pointing at
the redirect URI. `/oauth/auth` now ignores a `client_id` query
parameter that is not one of the game's own configured clients, so that
particular confusion cannot start here any more.

The panel's Environment tab prints the exact line to paste for whichever
hostname you opened it with.

The storefront additionally needs what the licence checkout already
needs — `NOWPAYMENTS_API_KEY` and `NOWPAYMENTS_IPN_SECRET`. Without them
the buy buttons render disabled and say so, rather than collecting a
click and failing.

`/thegod` needs `TheGodPassword` (or `TestSitePassword`, which is already set if `/testsite`
works.

Point the NOWPayments IPN callback for game invoices at
`https://amircollider.com/games/webhook`. The Worker sets it per invoice,
so there is nothing to configure in their dashboard — this is only worth
knowing when reading their logs.

---

## Files

```
Config.js                   GAME_REGISTRY — the only place a game exists
Games/Registry.js           code + database → one merged game
Games/Store.js              every D1 query the game system makes
Games/Purchase.js           click → invoice → callback → entitlement
Games/Session.js            who is signed in, and how we know
Games/OAuthState.js         the signed state both sign-in flows share
Games/Sql.js                the SQL builder
Games/Scaffold.js           the code generator for a new game
Content/UnityKit.js         the C# and its notes
Pages/TheGod.js             the panel
Api/TheGodApi.js          everything the panel can do
Api/GameApi.js            manifest, products, entitlements, the download gate
Pages/GameAccount.js        signing a player into the website
Pages/GameStore.js          the storefront and the payment callback
Pages/GameChrome.js         the frame those three pages share
Pages/GameCards.js         the dashboard card
migrations/0003_games.sql   settings, products, orders, entitlements
migrations/0004_deeplink.sql  one column: game_settings.deeplink_scheme
migrations/neon-katana.sql  a game's own database, as the builder writes it
```
