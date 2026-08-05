# SEO, Search Console and Google Cloud

What the Worker already does, and the handful of things that still
have to be done by hand in a browser.

---

## 1. What is in the code

### One canonical address

`CONFIG.SITE_URL` is `https://amircollider.com`. Every canonical tag,
every `og:url`, every sitemap entry and every absolute link in an
email is built from it.

`CONFIG.ALT_HOSTS` lists the hostnames that are *not* canonical
(`amircollider.n95pluss.workers.dev`, `www.amircollider.com`). A **GET
or HEAD page request** arriving on one of them gets a `301` to the
same path on the canonical host. API prefixes are exempt
(`CANONICAL_EXEMPT` in `Worker.js`) so a shipped Android build that
calls `/database/`, `/auth/` or `/games/` on the workers.dev hostname
keeps working exactly as before.

> Adding a new hostname to the Worker later? Add it to `ALT_HOSTS`, or
> it will serve a second copy of the whole site.

### Per-page metadata

`Core/Seo.js` renders, for every page:

- `<link rel="canonical">` — the page's own path on the canonical host
- `hreflang` for `fa`, `en`, `ja` plus `x-default`
- `robots` — `index, follow, max-image-preview:large` by default,
  `noindex, nofollow` where the page passes `noindex: true`
- OpenGraph and Twitter Card tags, with `og:image`
- JSON-LD

`Core/DesignSystem.js → getPageHead()` owns `<title>` and
`<meta name="description">`. `seoHead()` deliberately does not emit
either, so a page can never end up with two of them.

### Structured data

| Node | Where |
|---|---|
| `Organization`, `WebSite` | every indexable page |
| `BreadcrumbList` | every page with breadcrumbs |
| `VideoGame` | landing page (one per game), each game's pages |
| `SoftwareApplication` | landing page, `/tools`, each tool's page |
| `ItemList` | `/tools`, each leaderboard |

### robots.txt and sitemap.xml

`Pages/Sitemap.js`. Both are generated from `GAME_REGISTRY`, so a game
added in `Config.js` appears in the sitemap on the next deploy.

Disallowed for crawlers: `/thegod`, `/testsite`, `/checkout`, `/order`,
`/license`, `/oauth/`, `/auth/`, `/database/`, `/profile/`, `/games/`,
`/video/`.

### noindex pages

Diagnostics and anything transactional: `/metrics`, `/:game/health`,
`/:game/ping`, `/license`, the checkout steps, and the 404 page. They
are thin or duplicated across games, and indexing them spends the
site's authority on pages nobody searches for.

---

## 2. Google Search Console — first-time setup

Domain verification is already in place: `getPageHead()` emits the
`google-site-verification` meta tag on every page. That verifies the
**URL-prefix** property `https://amircollider.com/`.

1. Open <https://search.google.com/search-console> → **Add property**.
2. Prefer the **Domain** property (`amircollider.com`) — it covers
   `http`, `https`, `www` and every subdomain in one. It needs a DNS
   TXT record, which is a two-minute change in the Cloudflare dashboard
   under **DNS → Records**. If you would rather not touch DNS, choose
   **URL prefix** with `https://amircollider.com/` and the existing
   meta tag verifies it with no further work.
3. **Sitemaps** → submit `sitemap.xml`.
4. **URL Inspection** → paste `https://amircollider.com/` → *Request
   indexing*. Repeat for `/tools`, `/unity-docsnap`,
   `/unity-directtmp`, `/neon-katana`.
5. Come back after a week and read **Pages** for anything reported as
   *Duplicate, Google chose a different canonical* — that is the one
   error class this setup is designed to prevent, and it is worth
   confirming it did.

### Ranking for the brand terms

Ranking first for *AmirCollider*, *Neon Katana*, *Unity DocSnap* and
*Unity DirectTMP* is realistic because they are brand terms with
almost no competition — the site just has to be the obvious answer.
The code side of that is done. What is left is off-site, and no
deployment can do it:

- Link `https://amircollider.com` from the **GitHub repositories**
  (`UnityDocSnap`, `UnityDirectTMP`, and the org profile) — the repo
  homepage field and the README both.
- Link it from the **Myket listing** for Neon Katana.
- Keep the product names spelled exactly the same everywhere. "Unity
  DocSnap" and "UnityDocSnap" are two different queries.
- Give it time. A new domain takes weeks to settle regardless of what
  the markup says.

---

## 3. Google Cloud Console — OAuth consent screen

For a game like Neon Katana to sign players in without a warning
screen, the consent screen needs URLs on a verified domain that
actually load. These are ready:

| Field | URL |
|---|---|
| Application home page | `https://amircollider.com/` |
| Privacy policy | `https://amircollider.com/privacy` |
| Terms of service | `https://amircollider.com/terms` |

Per-game addresses also answer, and are the better choice for the Play
Console listing of a specific game:

- `https://amircollider.com/neon-katana/privacy`
- `https://amircollider.com/neon-katana/terms`

### What the reviewer checks, and where it is

- **Home page on the same domain, describing the app, linking to the
  privacy policy.** The landing page does; the footer links to
  `/privacy` and `/terms` from every page on the site.
- **Scopes named explicitly.** Privacy policy → *Google account data
  and the Google API Services Policy*, which lists `openid`, `email`
  and `profile` and says what each is used for.
- **The Limited Use statement.** Same section, verbatim, linking to
  the Google API Services User Data Policy.
- **A data deletion route.** Privacy policy → *Account and data
  deletion*: email `SUPPORT_EMAIL` with the subject "Delete my
  account", carried out within 30 days.
- **Domain ownership.** Verified in Search Console (step 2 above).
  Cloud Console reads that verification.

### Before submitting

- The authorised redirect URIs in the OAuth client must include the
  canonical domain: `https://amircollider.com/oauth/callback`. If only
  the workers.dev URI is registered, add the new one — do **not**
  remove the old one until every shipped build has been updated,
  because an APK already in players' hands still uses it.
- App name and logo in Cloudflare Console must match what the site
  shows. The logo is `/assets/AmirColliderLogo.png`.

---

## 4. Changing any of this later

| To change | Edit |
|---|---|
| The canonical domain | `CONFIG.SITE_URL` |
| Which hostnames redirect | `CONFIG.ALT_HOSTS` |
| Which paths crawlers avoid | `DISALLOW` in `Pages/Sitemap.js` |
| Which pages are in the sitemap | `indexablePaths()` in `Pages/Sitemap.js` |
| The nav links every page shows | `primaryItems()` in `Core/SiteNav.js` |
| The footer columns | `siteFooter()` in `Core/SiteNav.js` |

Adding a game to `GAME_REGISTRY` gives it sitemap entries, structured
data, breadcrumbs, policy pages and footer links with no further edits.
