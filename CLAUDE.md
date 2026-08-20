# CLAUDE.md — AmirCollider Worker

**Audience: an AI assistant with no memory of this repository.**
Read this file before opening anything else. It exists so a fresh session does
not spend its budget re-deriving facts that are written down here. It is
optimised for machine reading, not for humans: dense, literal, no narrative.

Everything below is verified against the live Cloudflare account and the code in
this repository. Where the two disagree, that is called out explicitly under
[Known drift](#12-known-drift-verify-before-trusting).

---

## 0. Non-negotiable rules

| # | Rule |
|---|------|
| 1 | **Never bump `CONFIG.VERSION`** in `Config.js`, and never add or edit entries in `Pages/ReleaseNotes.js`, unless explicitly asked. Both are owner-controlled. |
| 2 | **Never write a new Unity/C# client** for this API. Finished, per-game generated clients already exist — see [§9](#9-the-unity-kit-read-this-before-writing-any-c). |
| 3 | **A game exists only in `GAME_REGISTRY` in `Config.js`.** No database row, no request body and no panel action can create one. |
| 4 | **Two D1 databases, different jobs.** `LICENSE_DB` holds settings/orders/entitlements. Each game has its OWN D1 holding `players`. Running a migration against the wrong one succeeds and does nothing useful. |
| 5 | **Never execute generated SQL from a page handler.** The only place the Worker runs DDL is `schema.repair` (additive `ALTER TABLE ADD COLUMN` only). Everything else in `Games/Sql.js` returns text. |
| 6 | **Every string a visitor can see is trilingual** (`fa` / `en` / `ja`), and `fa` is RTL. Adding a UI string means adding three. |
| 7 | **No build step, no dependencies, no `node_modules`.** Plain ES modules, deployed as-is by `wrangler`. Do not introduce a bundler, a framework, or a package.json. |
| 8 | Never log a token, an authorization code, a password, an email body, or a raw upstream error body. |

---

## 1. What this is

A single Cloudflare Worker that serves:

- the **public site** at `https://amircollider.com` (dashboard, about, tools, policies)
- one **landing / store / leaderboard / account page per game**
- the **game API** shipped Unity builds call (OAuth, player data, entitlements)
- a **crypto checkout** for a paid Unity editor extension (Unity DocSnap)
- two password-protected **operator panels**: `/thegod` and `/testsite`

~47,000 lines of hand-written JavaScript. Server-rendered HTML with inline CSS
and inline JS — that is the architecture, not a shortcut, and it is why the CSP
allows `'unsafe-inline'`.

---

## 2. Deployment topology

| Thing | Value |
|---|---|
| Canonical domain | `https://amircollider.com` |
| Alt hosts (301 → canonical) | `amircollider.n95pluss.workers.dev`, `www.amircollider.com` |
| Cloudflare Worker | `amircollider` (created 2025-08-03) |
| Entry point | `Worker.js` (`main` in `wrangler.jsonc`) |
| Compatibility date | `2025-08-03` |
| Cron | `*/5 * * * *` → `scheduled()` → order/mail reconciliation |
| Source of truth | GitHub `AmirCollider/AmirCollider` |
| Asset storage | R2 bucket `amircolliderr2`, bound as `ASSETS`, served at `/assets/` |

### D1 databases (live, verified)

| Binding | Database name | UUID | Holds |
|---|---|---|---|
| `LICENSE_DB` | `amircollider-licenses` | `7ddcf78a-8de1-47d4-899d-9ca72b903b68` | game settings, product overrides, versions, orders, entitlements, licences, mail outbox, panel rate limits |
| `NEON_KATANA_DB` | `neon-katana-db` | `790fc372-1b4d-4e5a-996f-bf92cde2d19c` | Neon Katana's `players` table |
| `CHRONOBLADES_DB` | `chronoblades-db` | `90733250-c9e3-4430-8d56-46d74773750e` | Chrono Blades' `players` table (created 2026-08-13, schema applied) |

Other D1 databases exist on the account (`amircodecolliderdb`,
`mcjn-jazzy-commissions-db`, `unit-v-synth-voices-db`) and other R2 buckets —
**none belong to this project.** Do not touch them.

### Worker secrets (names only; values are not in the repo)

Per game, derived from the id (`NEON_KATANA_*` for `neon-katana`,
`CHRONOBLADES_*` for `chronoblades`):
`{UPPER}_GOOGLE_CLIENT_ID_WEB`, `{UPPER}_GOOGLE_CLIENT_SECRET`,
`{UPPER}_GOOGLE_CLIENT_ID_ANDROID`, `{UPPER}_DEEPLINK_SCHEME` (optional).

Shared: `STATE_SIGNING_SECRET` (required when any game has `login`),
`TheGodPassword`, `TestSitePassword`, `DOCSNAP_ADMIN_TOKEN`,
`NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`, `BREVO_API_KEY`,
`RESEND_API_KEY`, `DOCSNAP_MAIL_FROM`, `DOCSNAP_LICENSE_PRIVATE_KEY`,
`DOCSNAP_KEY_WRAP_SECRET`, `DOCSNAP_ORDER_SECRET`.

`validateEnvironment(env)` in `Config.js` runs on every request and 500s the
whole Worker when a *required* secret is missing. Only the web client id, the
client secret and `STATE_SIGNING_SECRET` are required.

**To see what is actually set on the live deployment:** `/thegod` → Variables
tab, or `POST /thegod/api {"action":"env"}`. Secret values are never returned —
only whether they are set and their length.

---

## 3. Repository map

```
Worker.js              Entry point. ROUTES table (83 entries), route matching,
                       canonical-host redirect, language redirect, CORS +
                       security headers, cron handler.
Config.js              THE source of truth. CONFIG, SECURITY, LANGUAGES, THEME,
                       GAME_STATUS, PRODUCT_KIND, and GAME_REGISTRY.
wrangler.jsonc         Bindings: D1 databases, R2 bucket, cron.

Api/                   JSON endpoints for shipped clients + the panel
  OAuthApi.js          /oauth/auth, /oauth/callback, /oauth/token, /auth/refresh
  AuthApi.js           /auth/validate, /auth/check
  PlayerDataApi.js     /database/get|set|patch/**  (the player row surface)
  GameApi.js           /games/:id/manifest|products|entitlements|consume, download
  TheGodApi.js         POST /thegod/api — ONE endpoint, `action` field, ~30 actions
  AssetApi.js          /assets/** from R2

Core/                  Cross-cutting, no business logic
  Http.js              createJsonResponse / createHtmlResponse / timingSafeEqual / clientIp
  Html.js              escapeHtml, safeColor
  Locale.js            language-in-path routing (/en/..., /ja/...); fa has no prefix
  RequestContext.js    resolveRequestLang, matchRequestLang, theme + lang cookies
  Logging.js           structured, redacted logs; generateRequestId
  GoogleOAuth.js       verifyIdToken — real JWKS verification, audience-checked
  PlayerIdentity.js    playerIdFromEmail, emailMatchesRow, playerIdConflict
  PanelSession.js      signed panel cookies + login rate limiting (shared by both panels)
  DesignSystem.js      getPageHead, shared tokens
  SiteNav.js           site header/footer
  Seo.js               canonical, hreflang, keywords, OpenGraph, JSON-LD.
                       The brand's other spellings come from CONFIG.BRAND;
                       seoHead() adds a WebPage node to every page itself.
  PageChrome.js        page shell
  ErrorPage.js         friendly error documents

Games/                 The game system
  Registry.js          resolveGames() — merges Config.js with DB overrides. THE merge.
  Store.js             every LICENSE_DB query + SETTINGS_SCHEMA + schema repair
  Players.js           every query against a GAME's own D1 (players table)
  PlayerRecord.js      players-table rules: username policy, profile update builder,
                       moderation, boardFilter(), leaderboard opt-out
  Session.js           player website session (signed cookie)
  OAuthState.js        HMAC-signed OAuth state
  Purchase.js          game store fulfilment + reconciliation
  Sql.js               SQL/text generators for the panel (executes nothing)
  Scaffold.js          generates a new game's source (registry entry, wrangler, SQL, C#)

Pages/                 Everything a browser renders (one file per page)
  Dashboard.js         /
  GameCards.js         the card grid (pure view; motifs live here)
  GameLanding.js       /:gameId  and  /:gameId/versions
  GameChrome.js        shared shell for all per-game pages
  GameAccount.js       /:gameId/account  (+ profile POST, leaderboard opt-out,
                       and account deletion at POST /:gameId/account/delete)
  GameStore.js         /:gameId/store
  Leaderboard.js       /:gameId/leaderboard  (HTML or JSON by Accept header)
  TheGod.js            /thegod  — the operator panel (4,300 lines: i18n, CSS, client JS)
  TestSite.js          /testsite — the live test panel (2,700 lines)
  Checkout.js          the DocSnap crypto checkout
  License.js           licence activate/validate/deactivate
  ...                  About, Tools, Donate, Privacy, Terms, Metrics, Health, Ping,
                       Sitemap, Icon, ReleaseNotes, NotFound, Video, OrderHelp

Commerce/              The DocSnap checkout: Orders, Provider (NOWPayments),
                       Fulfilment, Emails, Mailer, Seal (AES-GCM key sealing)
Licensing/             Licence keys: Store, Tokens, Keys
Content/               Large static content
  UnityKit.js          THE UNITY CLIENT GENERATOR — see §9
  GoogleDisclosure.js  the "what Google sign-in is for" text (fa/en/ja) and the
                       per-game default built from `capabilities`. Read by
                       Pages/GameLanding.js AND Api/TheGodApi.js — one copy.
  ToolsCatalog.js, AboutMe.js, DocSnapVideos.js, SupportTemplates.js
Scripts/               Dev tools. Not deployed.
  CheckBrandCoverage.mjs  every spelling of every name -> does the
                       site match it? Three tiers; see Docs/Seo.md.
migrations/            SQL. NOT authoritative — see §12.
                       0012 + <game>.sql belong to a GAME's own D1; the
                       numbered rest belong to LICENSE_DB.
Docs/                  Checkout.md, Games.md, Licensing.md, Seo.md
```

---

## 4. Request lifecycle (`Worker.js`)

1. `validateEnvironment(env)` — 500 if a required secret is missing.
2. `OPTIONS` → 204 with CORS + security headers.
3. `canonicalRedirect` — alt host → `CONFIG.SITE_URL` (301). Skipped for
   `CANONICAL_EXEMPT` prefixes (`/oauth/`, `/auth/`, `/database/`, `/games/`,
   `/profile/`, `/assets/`, `/video/`, `/thegod`, `/testsite`, `/checkout/`) —
   shipped Android builds may not follow redirects.
4. `languageRedirect` — `/fa/x`→`/x` (301), `/x?lang=en`→`/en/x` (301),
   `/x`→`/en/x` (302, preference-based). Then the prefix is folded back into
   `url.searchParams.lang` **in memory only**, so every handler resolves
   language the same way.
5. `matchRoute(path, method)` — **all static routes are tried before any dynamic
   one**, regardless of table order. `/:gameId` is last on purpose.
6. Unknown game id in a `/:gameId*` route → 404 (never a silent fallback).
7. Handler signature — every handler takes exactly this:
   `(url, request, gameId, requestId, GAMES, env, availableEndpoints)`
8. CORS + `SECURITY.SECURE_HEADERS` + `X-Request-ID` applied to the response.

`GAMES` passed to handlers is the **raw** map from `getGamesConfig(env)`.
Handlers that need database overrides call
`resolveGame(env, GAMES, id)` / `resolveGames(env, GAMES)` themselves.

---

## 5. Live database schemas

**Read the schema from D1, not from `migrations/`.** These were verified with
`PRAGMA table_info` against production.

### `LICENSE_DB` (`amircollider-licenses`)

Tables: `game_settings`, `game_product_overrides`, `game_versions`,
`game_orders`, `game_entitlements`, `game_entitlement_events`,
`game_order_attempts`, `orders`, `order_events`, `order_attempts`, `licenses`,
`license_activations`, `license_attempts`, `mail_outbox`, `webhook_log`,
`panel_attempts`, `player_identity`.

`game_settings` — the panel's main write target. Every column is nullable;
NULL means "no override, use `Config.js`". Full expected column set is
`SETTINGS_SCHEMA` in `Games/Store.js`:

| Group | Columns | Migration |
|---|---|---|
| base | `display_name, logo_url, accent_color, desc_fa, desc_en, desc_ja, tags_json, status, download_enabled, download_json, min_version, note` | 0003 |
| deep link | `deeplink_scheme` | 0004 |
| landing A | `hero_url, videos_json, devices_json, about_fa, about_en, about_ja` | 0005 |
| landing B | `tagline_fa, tagline_en, tagline_ja, features_json, screenshots_json, faq_json` | 0008 |
| landing C | `screenshots_{fa,en,ja}_json, videos_{fa,en,ja}_json, google_enabled, google_head_{fa,en,ja}, google_body_{fa,en,ja}` | 0011 |

### A game's own D1 (`neon-katana-db`, `chronoblades-db`)

One table matters: `players`.

```
id, player_id (UNIQUE), email (UNIQUE), username (NOT NULL UNIQUE),
profile_pic_url (NOT NULL), high_score, games_played, total_play_time,
purchased_colors, selected_color, purchased_items, created_at, last_login,
banned_at, ban_reason, restricted_until, restrict_reason, admin_note,   -- 0006
data_json,                                                              -- 0007
leaderboard_opt_out,                                                    -- 0010
high_level, selected_item                                               -- 0012
```

`username` and `profile_pic_url` are `NOT NULL` on the **live** neon-katana
table while `migrations/neon-katana.sql` declares them nullable.
`ensurePlayerRow()` in `Games/PlayerRecord.js` always supplies both — do not
remove that.

`chronoblades-db` was created from `migrations/chronoblades.sql` and has every
column above, 0012 included. `neon-katana-db` has **not** run 0012 — see
[Known drift](#12-known-drift-verify-before-trusting).

Optional columns are **probed, never assumed**: `hasModerationColumns()`,
`hasLeaderboardOptOut()`, `hasPlayerColumn()`, `boardFilter()`,
`boardExtras()`. A database missing a column keeps working with that feature
switched off.

---

## 6. The games system — code vs database

```
Config.js GAME_REGISTRY   WHICH GAMES EXIST + everything a deploy must know:
                          d1Binding, OAuth env key names, package, capabilities,
                          store.products (ids are hard-coded in shipped builds),
                          landing baseline, card.motifs
        │
        ▼  Games/Registry.js  mergeGame()  — field by field
game_settings row         HOW an existing game is PRESENTED AND SOLD:
game_product_overrides    name, logo, colour, description, tags, status,
                          download links + switch, deep-link scheme, prices,
                          ribbons, ordering, and the whole landing page
```

**The merge rule that matters:** a database value overrides the code baseline
*per field*. An empty field in the panel does **not** blank the section — it
falls through to `Config.js`. This is why the panel's Game page tab shows a
`from code` / `saved here` badge on every heading.

**`neon-katana` has no `landing` baseline any more.** Its whole page — banner,
tagline, long description, features, screenshots, videos, devices, FAQ — is
written in the panel, so an empty field there renders as nothing rather than
falling through to code. A `landing` block is still supported and still merged
field by field; a new game may ship one so its page says something before
anybody opens the panel.

`GAMESTORE.SETTINGS_CACHE_MS` (30 s) caches the merge per isolate.
`invalidateSettingsCache()` after any write; the panel always reads
`{ fresh: true }`.

Current registry: **two games, `neon-katana` and `chronoblades`.**

`chronoblades` ships a `landing` baseline, which `neon-katana` deliberately
does not: it is brand new, and a page that says nothing until somebody opens
the panel is the case the baseline exists for. The panel still wins per field.

### What a board row carries — `leaderboard` in `GAME_REGISTRY`

A leaderboard is a name and a score for most games and not for all. A registry
entry may declare either or both of:

```
leaderboard.level   a second number beside the score  -> players.high_level
leaderboard.item    the thing the player is holding   -> players.selected_item
```

`buildBoard()` in `Config.js` normalises it to
`{ level: {icon,i18n}|null, item: {default,spin,options}|null }`, always that
shape. `chronoblades` declares both (stage + three knives, the free one of
which is **not** a product); `neon-katana` declares neither and every code path
below renders exactly what it rendered before this existed.

**`readBoard()` in `Games/PlayerRecord.js` is the one board query.** The page
(`Pages/Leaderboard.js`), its count and the game client's copy
(`Api/PlayerDataApi.js`) all call it, so membership *and* row contents cannot
drift apart. It reports `highLevel`/`selectedItem` when the GAME declares them
— not when the database happens to have the column — and resolves an unknown
or absent `selected_item` to the game's declared default, so a board row's
item is never empty.

`high_level` is **monotonic**: `buildProfileUpdate()` writes
`MAX(existing, incoming)`, same as `total_play_time`, because clients send a
record read out of a save file. An **empty** `selectedItem` is ignored on
write — Unity's `JsonUtility.ToJson` serialises every field of a class, so a
patch meant to change a username arrives carrying `selectedItem:""`, and
writing that literally would unequip the player.

### The landing page's section order (`Pages/GameLanding.js`)

```
hero → features → screenshots → videos → about → devices → products
     → faq → google disclosure → where to get it
```

"Where to get it" is **last**, under the FAQ: the download button belongs at the
point a reader has finished the reasons to press it. Every block between the
hero and the Google disclosure returns `''` when the panel has nothing in it.

**Screenshots and videos exist twice: shared, and per language.** A text-heavy
game is a different picture in each language, so `screenshots_{lang}_json` and
`videos_{lang}_json` override `screenshots_json` / `videos_json` — **replacing
the list, never merging it**. A language with an empty list of its own shows the
shared one. `langRows()` in `Pages/GameLanding.js` is the only place that
resolves this. Every other section is either language-neutral (devices, the
banner) or already carries `fa/en/ja` inside each row (features, FAQ).

**The Google disclosure is content now, with a switch.** It is still not
marketing copy — it is the OAuth disclosure (which scopes, what each is for, how
to withdraw access) — and its default is still *generated* from the same
`capabilities` flags that decide whether the account, store and leaderboard
pages exist, so a game with no store can never claim purchases are tied to an
account. What changed:

- The words live in `Content/GoogleDisclosure.js`, imported by both the page
  (which renders them) and `Api/TheGodApi.js` (which hands them to the panel as
  the baseline). **Not** in `Pages/GameLanding.js` any more.
- `google_head_*` / `google_body_*` override the default **per language** —
  falling back to that language's default, deliberately *not* to another
  language's stored text the way `pickLang()` does elsewhere. An English
  disclosure on a Persian page is worse than the correct Persian one.
- `google_body_*` is **plain text**: a blank line starts a paragraph, a line
  starting with `- `, `* ` or `• ` becomes a bullet. `disclosureHtml()` in
  `Pages/GameLanding.js` is the whole parser, and it runs over the default and
  over operator text alike — so what the panel shows is exactly what renders.
- `google_enabled` is three-state: `NULL` = nobody decided = **on**. A database
  that has not run 0011 keeps showing the section.
- A game without `capabilities.login` renders nothing there whatever the row
  says, and `game.verify` warns when a game that *does* sign in has it off —
  turning it off is a Google verification risk, not a layout choice.

---

## 7. `/thegod` — the operator panel

`Pages/TheGod.js` renders it; `Api/TheGodApi.js` is the only endpoint
(`POST /thegod/api`, `{ action, ... }`). Auth is the `amir_thegod_auth` cookie
(`Path=/thegod`) or `Authorization: Bearer $DOCSNAP_ADMIN_TOKEN`.

Tabs → actions:

| Tab | Actions |
|---|---|
| Games | `overview`, `game.get`, `game.save`, `game.reset`, `game.purge`, `game.verify` |
| Game page | `landing.get`, `landing.save`, `version.save`, `version.delete` |
| Store | `product.save`, `product.reset` |
| Payments | `orders.list`, `order.grant` |
| Players | `players.list`, `player.profile`, `player.moderate`, `player.rename`, `player.delete`, `players.search`, `player.get`, `player.grant`, `player.revoke` |
| SQL | `schema.get`, `schema.repair`, `sql.settings`, `sql.game` |
| Variables | `env` |
| New game | `scaffold`, `game.verify` |
| Unity | `unity` |

Two actions are worth knowing about because nothing else answers their question:

- **`schema.get`** — the real column set of `game_settings`, `game_versions`,
  `game_product_overrides` (LICENSE_DB) and `players` (the game's own D1), read
  with `PRAGMA table_info`. Use this before believing `migrations/`.
- **`game.verify`** — every binding, table, secret, link and landing section
  checked on the live deployment, each with a fix instruction. This is the
  fastest way to answer "why is this game not behaving?".

`schema.repair` is the **only** action that executes DDL, and only
`ALTER TABLE game_settings ADD COLUMN <name> <type>` for columns in
`SETTINGS_SCHEMA` that the table lacks. Every such column is nullable with no
default, so it is a metadata-only change.

---

## 8. `/testsite` — the live test panel

`Pages/TestSite.js`. Runs real HTTP requests against the deployed Worker from
the browser and reports pass / warn / fail. Cookie `amir_testsite_auth`,
`Path=/testsite`.

Catalogue is data-driven: `TEST_GROUPS` (8 groups) + `GAME_TESTS` (expanded once
per registered game) + a `RUNNERS` object keyed by `kind`.

**Adding a test requires four things or it breaks:**
1. an entry in `TEST_GROUPS` (or `GAME_TESTS`) with a `kind`
2. `RUNNERS[kind] = function () { ... }` returning
   `{ status, code, ping, noteKey?, noteVal? }`
3. `t_<kind>` and `d_<kind>` in **all three** `I18N` languages
4. any `noteKey` you emit, in all three languages

Groups: `system`, `game-<id>` (per game), `auth`, `oauth`, `db`, `d1`,
`checkout`, `seo`, `video`, `thegod`.

The `seo` group is ten GETs of public pages and the only group that
reads response BODIES rather than status codes — every failure it is
written for returns 200. It checks `robots.txt`, `sitemap.xml` (URL
count, a complete hreflang set, images), the front page's canonical
host, its hreflang links, its JSON-LD (parsed, and asserting
`Organization` + `WebSite` + `WebPage`), and that the brand's Persian
and Japanese spellings are present in the page's bytes. That last one
is the whole point of `CONFIG.BRAND` and the easiest thing to lose in
a refactor of the footer. It also checks that `/about/`, `/About`
and `/games/` each 301 to the canonical form in **one** hop, and
that a game's name appears on its page in every script and Unicode
encoding — the check that would have caught the Persian spelling
being wrong for two passes.

`Scripts/CheckBrandCoverage.mjs` is the deeper version of that last
one: it generates every written form of every name and asserts each
reaches a page, while asserting the unpublished misspellings do
**not**. Run it after touching `CONFIG.BRAND` or any `altNames`.

The `thegod` group exercises the operator panel read-paths and its refusals.
It authorises with the `/thegod` cookie the browser already holds (cookie paths
match the *request* URL), so it warns "sign in at /thegod first" when signed
out. Everything in it is a read or an asserted refusal — nothing writes.

---

## 9. The Unity kit — read this before writing any C#

**`Content/UnityKit.js` already contains a complete, working Unity client for
this Worker.** It is generated per game with that game's id, base URL, deep-link
scheme, Android package and product catalogue substituted in. It is not example
code. It is the client.

### How to get it

```js
import { unityModules, unityKitIndex } from './Content/UnityKit.js'
const modules = unityModules(game, origin)   // [{ id, file, icon, title, summary, notes, code }]
const index   = unityKitIndex(game, origin)  // machine-readable: what each file covers
```

or over HTTP: `POST /thegod/api {"action":"unity","gameId":"<id>","lang":"en"}`
— returns `modules`, plus `index` and a `usage` string.

### The modules

| id | file | covers | gated by |
|---|---|---|---|
| `readme` | `README.md` | install order + troubleshooting | — |
| `constants` | `<Pascal>Constants.cs` | every URL, id, package, scheme, product id | — |
| `api` | `AmirColliderApi.cs` | HTTP layer, bearer token, retry, `ParseArray` | — |
| `auth` | `AmirColliderAuth.cs` | full Google sign-in + deep-link return + refresh | `capabilities.login` |
| `player` | `AmirColliderPlayer.cs` | profile, high score, `data_json` save document | `capabilities.cloudSave` |
| `leaderboard` | `AmirColliderLeaderboard.cs` | the public board | `capabilities.leaderboard` |
| `store` | `AmirColliderStore.cs` | products, entitlements, consume | `capabilities.store` |
| `status` | `AmirColliderStatus.cs` | manifest, min version, download switch | — |
| `bootstrap` | `AmirColliderBootstrap.cs` | one MonoBehaviour wiring the rest together | — |
| `manifest` | `AndroidManifest.xml` | the intent-filter sign-in needs | Android |
| `link` | `link.xml` | IL2CPP stripping guard for JsonUtility classes | Android |
| `google` | `GOOGLE-SETUP.md` | Google Cloud console steps + redirect URIs | `capabilities.login` |

### The procedure

1. Call `unityKitIndex()` (or the `unity` action) and read it.
2. **Tell the user which modules you found and are using.** Name the files.
3. Use the generated code verbatim. Do not paraphrase it, do not "simplify" it,
   do not re-derive request shapes from the `ROUTES` table.
4. Read each module's `notes` array. It documents behaviour that is **not**
   inferable from the endpoint shapes — for example:
   - a score below the record returns **200 with `success:false`**, not an
     error (treating it as one produces an infinite retry loop)
   - the high-score request body is a **bare integer**, not JSON
   - the leaderboard returns a **top-level array**, which `JsonUtility` cannot
     parse — hence `ParseArray` in `AmirColliderApi.cs`
   - the player row is created **server-side on first read**
5. Only write new C# for something no module covers, and follow the conventions
   of the files beside it.

Every endpoint constant in `constants` has been cross-checked against the
`ROUTES` table in `Worker.js`. If you change a route, regenerate and re-check.

---

## 10. Adding a game

`/thegod` → New game tab generates all of this. Doing it by hand:

1. `npx wrangler d1 create <id>-db` → copy the printed `database_id`
2. Add a `d1_databases` entry to `wrangler.jsonc` with binding `<UPPER>_DB`
3. Save the generated schema as `migrations/<id>.sql`, then
   `npx wrangler d1 execute <id>-db --remote --file=./migrations/<id>.sql`
4. `npx wrangler secret put <UPPER>_GOOGLE_CLIENT_ID_WEB` (and `_SECRET`, and
   `_ANDROID` for an APK)
5. Authorise `https://amircollider.com/oauth/callback` on the Google web client
   — **and every hostname the Worker answers on**, including workers.dev.
   `redirect_uri_mismatch` is checked entirely on Google's side.
6. Paste the generated entry into `GAME_REGISTRY` in `Config.js`
   ← **this is the step that makes the game exist**
7. `npx wrangler deploy`
8. `/thegod` → Games → **Health check** (`game.verify`) to confirm all of it

`d1Binding` in `Config.js` and the binding name in `wrangler.jsonc` must be the
same string. When they differ, every data endpoint answers `db_not_bound` and
nothing else breaks — a confusing hour.

---

## 11. Task → file index

| Task | Files |
|---|---|
| Add/change a game's fixed facts | `Config.js` → `GAME_REGISTRY` |
| Change how a game is presented | `/thegod` Games tab (no deploy) |
| Change a game's landing page | `/thegod` Game page tab (no deploy) |
| Give one language its own screenshots/videos | `/thegod` Game page tab → the language strip on that section |
| Change the Google sign-in disclosure's DEFAULT text | `Content/GoogleDisclosure.js` — one file, read by the page and the panel |
| Change one game's disclosure, or switch it off | `/thegod` Game page tab (no deploy) |
| Change how the landing page RENDERS | `Pages/GameLanding.js` |
| Change the dashboard card | `Pages/GameCards.js` (+ `card.motifs` in `Config.js`) |
| Add a route | `Worker.js` `ROUTES` + a handler in `Pages/` or `Api/` |
| Change the merge of code ↔ database | `Games/Registry.js` `mergeGame()` |
| Add a `game_settings` column | `SETTINGS_SCHEMA` in `Games/Store.js` + a migration file. Nothing else — the writer, the repair, the SQL generator and the panel all read that array. |
| Change leaderboard membership | `boardFilter()` in `Games/PlayerRecord.js` — **one place**, read by the page, its count, and the game's JSON copy |
| Change what a board ROW says | `readBoard()` in `Games/PlayerRecord.js` — the single query all three boards run |
| Give a game a stage/level or an equipped item on its board | `leaderboard` in that game's `GAME_REGISTRY` entry + `migrations/0012_player_progress.sql` against its own D1 |
| Add a knife / skin / emblem to that strip | `leaderboard.item.options` in `Config.js`. A key that is also for sale needs a matching `store.products` id — a free one does not |
| Change what account deletion removes | `handleGameAccountDelete` in `Pages/GameAccount.js` + `deletePlayerByEmail` / `releasePlayerIdentity`. Orders and entitlements are kept on purpose — say so on the page if that changes |
| Reorder the landing page | the `body` template in `handleGameLanding` — one list, in render order |
| Add a panel action | `Api/TheGodApi.js` switch + the `bad_action` list + UI in `Pages/TheGod.js` |
| Add a panel test | `Pages/TestSite.js` — see §8 |
| Change the Unity client | `Content/UnityKit.js` |
| Add a UI string | the `I18N` object in that file — **all three languages** |
| Change the brand's name in another script, or the misspellings `/about` answers | `CONFIG.BRAND` in `Config.js` — **one block**, read by `Core/Seo.js` (structured data), `Core/SiteNav.js` (the footer line) and `Content/AboutMe.js` (three answers, via `{aliases}` / `{typos}`) |
| Make a game findable under its Persian or Japanese name | `altNames` in that game's `GAME_REGISTRY` entry. Reaches `alternateName` on the `VideoGame` node and the keyword tag on all three of its pages |
| Change what a page tells a crawler it is about | the `keywords` it passes to `seoHead()`. Brand terms are prepended automatically — pass only what the page itself answers |
| Add a structured-data node type | `Core/Seo.js`. A page-level node (`WebPage`) is added by `seoHead()` itself; a page emitting its own passes `webPage: false` |
| Change the date the sitemap reports | `CONFIG.SITEMAP_LASTMOD` — a constant on purpose, see `Docs/Seo.md` |
| Change what a game's search result says | `landingDescription()` in `Pages/GameLanding.js` — composed from name, pitch, platforms and `capabilities`, never from a single field |
| Change what a store page's result says | `storeDescription()` in `Pages/GameStore.js` — names that store's own products |
| Measure how long a title or description LOOKS | `textWidth()` / `clampWidth()` in `Core/Seo.js`. **Never count characters** — a full-width kana is two Latin characters wide and Google truncates by pixels |
| Make a Persian name findable however it is typed | nothing — `persianSpellingVariants()` in `Core/Seo.js` derives all six forms: Arabic-codepoint (ی→ي, ک→ك) × separator (space / ZWNJ / joined), for every Persian alias and game `altNames` entry |
| Change which misspellings `/about` publishes | `CONFIG.BRAND.TYPOS_SHOWN` — three, named not indexed. `MISSPELLINGS` is the full reference list and appears nowhere on the site |
| Test that every spelling still reaches a page | `node Scripts/CheckBrandCoverage.mjs` (add `--remote` for the live site) |
| Change which URL shapes redirect to the canonical one | `normalizeRedirect()` in `Worker.js`. It tests the **destination** only — testing the request too breaks `/en/games/` and does not protect case-sensitive R2 keys |

---

## 12. Known drift (verify before trusting)

1. **`migrations/` is not authoritative.** Files there have been applied to
   different databases at different times. Some were applied to
   `neon-katana-db` by mistake — that database has a full `game_settings` table
   it does not use, including the 0008 columns the licence database lacked.
   Always confirm with `schema.get` or `PRAGMA table_info`.

2. **`game_settings` in `LICENSE_DB` was missing all six 0008 columns**
   (`tagline_fa/en/ja`, `features_json`, `screenshots_json`, `faq_json`) as of
   2026-08-12. That is what made the panel's Game page tab appear to save and
   change nothing. The write path now degrades per column and reports which are
   missing; `/thegod` → SQL → **Repair the schema** adds them. Check whether
   this has been run before diagnosing a related report.

3. **Deep-link scheme — resolved, and worth re-checking after any change.**
   `game_settings.deeplink_scheme` and `GAME_REGISTRY.fallback.deepLinkScheme`
   both hold `com.amircollider.neonkatana` now; they disagreed until 2026-08-12,
   which meant clearing the database row would silently change the scheme. The
   Android package is `com.AmirColliderGames.NeonKatana` and is a different
   string on purpose. Whatever these hold must match the `intent-filter` in the
   shipped APK's `AndroidManifest.xml` exactly; if it does not, Google sign-in
   on Android dead-ends on a blank browser tab with no error anywhere.
   `/thegod` → Variables shows which of the three layers is in force.

4. **`0010_leaderboard_optout.sql` is new** and must be run against each game's
   own database. Until it is, the opt-out checkbox does not render and
   `game.verify` reports the column as missing. Nothing breaks without it.

5. **`0012_player_progress.sql` has NOT been run against `neon-katana-db`.**
   It adds `high_level` and `selected_item` to a game's OWN database.
   `chronoblades-db` was created with both. Neon Katana declares no
   `leaderboard` block, so it needs neither and nothing warns about it — run
   the file only if that game ever starts recording a stage. Running it
   against `LICENSE_DB` is the classic wrong-database mistake and does nothing
   useful.

6. **`0011_landing_languages.sql` is new** and belongs to `LICENSE_DB`, not to a
   game's database. Thirteen columns: the six per-language screenshot/video
   lists and the seven the Google disclosure needs. Until it is run, the Game
   page tab greys out the language strip and the disclosure card, names the
   missing columns, and saves everything else — and the public page keeps
   showing the shared galleries and the standard disclosure, because both
   degrade to exactly what they did before. `/thegod` → SQL →
   **Repair the schema** adds all thirteen, same as the file.
   **Verified applied on 2026-08-13:** `game_settings` in `LICENSE_DB` now has
   all forty columns, 0008 and 0011 included, so items 2 and this one are
   history rather than open faults.

---

## 13. Invariants

- Player id = first 15 chars of the email local part, lowercased
  (`playerIdFromEmail`). **Not injective** — `ali@gmail.com` and
  `ali@yahoo.com` both give `ali`. Every path that keys on a player id also
  checks the row's `email` (`emailMatchesRow`) or the `player_identity` claim.
- A caller may only read or write **their own** player row. Ownership comes from
  the verified `id_token`, never from the path.
- `high_score` only moves up. `total_play_time`, `games_played` and
  `high_level` are written with `MAX(existing, incoming)` — clients send
  running totals and records, not deltas.
- `selected_item` is a plain assignment (equipping goes both ways) **except**
  that an empty value is ignored. There is deliberately no way for a client to
  blank it; empty already means "the game's default" on read.
- Product ids are hard-coded in shipped builds. The database may re-price,
  re-order, re-ribbon or disable a product; it may **not** create one.
- `badge` has three states: `NULL` = no override, `''` = operator chose no
  ribbon, `'best'|'new'|'sale'` = a ribbon. Do not collapse the first two.
- OAuth state is HMAC-signed and expiry-checked (`Games/OAuthState.js`).
- Both panels use `Core/PanelSession.js`: signed cookie with the issue time
  inside the payload, plus login rate limiting in `panel_attempts`.
- Panel cookies are path-scoped (`/thegod`, `/testsite`) so signing into one
  does not hand over the other.
- Anything a player can delete about themselves is keyed on **player id AND
  email**, never the id alone (`deletePlayerByEmail`, `releasePlayerIdentity`).
  Two people can derive one player id, and a self-service delete is the worst
  possible place to conflate "the id matches" with "the row is yours".

---

## 14. Verifying a change without deploying

There is no test suite in the repo. What works:

```bash
# 1. Syntax — catches the most common break.
#    Read from STDIN with --input-type=module. `node --check <file>` is NOT
#    a check for this repository: on a file containing `import`/`export` it
#    returns 0 whatever the file contains, so a broken module passes. That
#    false pass is how a Pages/Leaderboard.js that could not be parsed at
#    all reached the repository on 2026-08-14.
for f in $(find . -name '*.js' -not -path './node_modules/*' -not -path './.git/*'); do
  node --input-type=module --check < "$f" >/dev/null 2>&1 || echo "SYNTAX ERROR: $f"
done

# 2. The inline panel scripts are template literals inside those files.
#    A stray backtick or ${ inside PANEL_JS / dashClientScript silently
#    terminates the template. Extract and check them separately:
node -e "const s=require('fs').readFileSync('Pages/TheGod.js','utf8');
         require('fs').writeFileSync('/tmp/p.js', s.match(/const PANEL_JS = String\.raw\`([\s\S]*)\`\s*\$/)[1])"
node --check /tmp/p.js
```

3. **Render pages server-side.** The handlers are plain functions; import them
   and call them with a fake `env`. A D1 binding can be shimmed over
   `node:sqlite` — it needs only `prepare().bind().first()/.all()/.run()` with
   `meta.changes`.

4. **Exercise the panel API for real** the same way: build the D1 shim with the
   *production* schema (including its gaps), then call
   `handleTheGodApi(url, request, gameId, requestId, GAMES, env)`.

5. **i18n completeness** — evaluate the `I18N` literal and assert every key
   exists in `fa`, `en` and `ja`, and that every `TG.t.<key>` / `t_<kind>` /
   `noteKey` referenced in the code is defined.

6. Read live D1 with the Cloudflare API / MCP rather than guessing:
   `SELECT name FROM pragma_table_info('game_settings')`.

---

## 15. Conventions

- ES modules, 2-space indent, no semicolon-free style — match the file.
- Named exports. No default exports except `Worker.js`.
- Comments explain **why**, in prose, often at length, with the failure that
  motivated the code. Match that density; do not strip it.
- Banner comments `// ====` above each section and each exported function.
- User-facing strings: `fa` (RTL), `en`, `ja`. Never hard-code a visible string
  outside an `I18N` object.
- HTML is built with template literals and **always** escaped with
  `escapeHtml()`. Operator input reaches public pages.
- **Never write a backtick inside one of those template literals** — CSS and
  comments included. A page's stylesheet is a backtick string, so a comment
  that quotes a declaration as `` `width:100%` `` ends the string there and the
  file stops parsing. Quote code in those comments with plain words. Same for
  a literal `${`.
- URLs from operator input are validated to `https?://` (or a leading `/` for
  site-local images) before they reach `src` / `href`.
- Errors degrade: a missing column, an unmigrated database or an unbound
  binding must produce a reduced feature with a clear message, never a 500.
