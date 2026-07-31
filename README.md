<div align="center">

<img src="https://raw.githubusercontent.com/AmirCollider/AmirCollider/main/assets/banner.png" alt="AmirCollider" width="100%" />

# AmirCollider

**Indie game developer · Edge & backend engineer**

Unity / Android games, and the serverless platform that runs behind them.

[amircollider.com](https://amircollider.com/) · [@amir.collider](https://www.instagram.com/amir.collider/)

</div>

---

## What this repository is

The source of [amircollider.com](https://amircollider.com/) — a single
Cloudflare Worker with no origin server. It is the whole platform behind the
games and the Unity tools:

- **Google OAuth proxy** for web, desktop and Android clients
- **Player data API** — profiles, cloud saves, leaderboards, moderation
- **A game storefront** — catalogue, crypto checkout, entitlements
- **A licence server** for the paid Unity editor extension
- **Server-rendered pages**, every one of them in Persian, English and
  Japanese, with light / dark / auto theming and correct RTL–LTR layout
- **Two operator panels** — `/testsite` for the checkout, `/thegod` for the
  games

Everything is rendered at the edge. There is no build step, no bundler and no
client framework: the Worker ships plain ES modules and the pages ship the
small amount of JavaScript they actually need.

---

## Layout

```
Worker.js               entry point: routing, headers, the cron
Config.js               the only place a game, a price or a constant is defined

Core/                   what every module shares
  DesignSystem.js         the stylesheet and <head> for every page
  Html.js                 escaping for markup, script and style contexts
  Http.js                 response builders, client IP, constant-time compare
  Logging.js              structured JSON logs and request ids
  ErrorPage.js            the localized failure page
  RequestContext.js       language and theme resolution
  PageChrome.js           the theme-boot and chrome scripts
  GoogleOAuth.js          every call this Worker makes to Google

Api/                    machine-facing endpoints
  OAuthApi.js             sign-in, callback, token exchange, refresh
  AuthApi.js              token validation, player existence
  PlayerDataApi.js        /database/get | set | patch
  GameApi.js              manifest, products, entitlements, download
  TheGodApi.js            the operator panel's single endpoint
  AssetApi.js             R2 objects

Pages/                  everything a browser renders
Games/                  the game platform: registry, store, sessions, purchases
Commerce/               the licence checkout: orders, provider, fulfilment, mail
Licensing/              licence keys, offline tokens, activation records
Content/                authored data: catalogues, templates, the Unity kit

Docs/                   Games.md · Checkout.md · Licensing.md
migrations/             D1 schema, applied with wrangler
assets/                 images served from this repository
Scripts/                one-off operator scripts
```

Two directories keep their lowercase names on purpose. `migrations/` follows
Cloudflare's numbered-migration convention and D1 tracks those filenames, so
renaming them would re-run applied migrations. `assets/` is linked from
outside this repository by raw URL.

---

## Routes

| Path | What it is |
| --- | --- |
| `/` | the dashboard: games, tools, live status |
| `/{game}` `/{game}/versions` | a game's landing page and release history |
| `/{game}/account` `/{game}/store` | the player's account and the storefront |
| `/{game}/leaderboard` `/{game}/health` `/{game}/ping` | public game surfaces |
| `/{game}/privacy` `/{game}/terms` | policies, per game |
| `/oauth/auth` `/oauth/callback` `/oauth/token` `/auth/*` | the sign-in contract |
| `/database/get|set|patch/...` | the player data API |
| `/games/{id}/manifest|products|entitlements` | what a shipped build calls |
| `/tools` `/unity-docsnap` `/unity-directtmp` | the Unity extensions |
| `/checkout` `/license` `/order` | buying and activating a licence |
| `/metrics` `/release-notes` | status and changelog |
| `/testsite` `/thegod` | the operator panels |

The full table is `ROUTES` in [`Worker.js`](Worker.js).

---

## Running it

```bash
npm install -g wrangler
wrangler dev            # http://localhost:8787
wrangler deploy
```

Bindings live in [`wrangler.jsonc`](wrangler.jsonc): two D1 databases and one
R2 bucket. Schema:

```bash
wrangler d1 execute amircollider-licenses --remote --file=migrations/0001_licenses.sql
wrangler d1 execute neon-katana-db        --remote --file=migrations/neon-katana.sql
```

Secrets are set with `wrangler secret put`. The Worker refuses to start
without the Google web client id and client secret of any game that claims
the `login` capability — see `validateEnvironment` in
[`Config.js`](Config.js). Everything else degrades rather than crashes: a
missing payment key disables the checkout, a missing mail key disables
delivery, and the pages keep working.

---

## Adding a game

One entry in `GAME_REGISTRY` in [`Config.js`](Config.js), a D1 binding in
`wrangler.jsonc`, and the schema. The `/thegod` panel generates all three for
you and asks you to paste and deploy them. Everything an operator changes
afterwards — name, logo, description, download switch, prices — is a database
override applied on top, so no deploy is needed for it.

Full walkthrough: [`Docs/Games.md`](Docs/Games.md).

---

## Documentation

| Document | Covers |
| --- | --- |
| [`Docs/Games.md`](Docs/Games.md) | the game platform, storefront and panel |
| [`Docs/Checkout.md`](Docs/Checkout.md) | the crypto checkout, end to end |
| [`Docs/Licensing.md`](Docs/Licensing.md) | key format, activation, seats |

---

<div align="center">
<sub>© AmirCollider · Unity, Cloudflare Workers, and a lot of attention to detail.</sub>
</div>
