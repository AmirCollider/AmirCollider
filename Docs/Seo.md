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

A **game landing page** adds `application-name` (the game's own name,
so the page and the OAuth consent screen can be read as naming the
same application) and `theme-color`. It does not emit its own
canonical or OpenGraph tags — `page()` in `Pages/GameChrome.js` already
does, and for a while both did, which left every game page carrying two
canonical links.

### The favicon

`GET /icon.svg` (`Pages/Icon.js`) reads `CONFIG.AMIR_LOGO` out of R2 and
serves it back inside an SVG with a **safe area** around it: the artwork
sits in the middle 70% of the square, so any surface that crops the icon
to a circle — Google's mobile results, some bookmark bars — takes the
padding and not the logo's corners.

It is generated rather than uploaded, so there is no second image file
to re-export whenever the logo changes. Every failure path (no R2
binding, object missing, object implausibly large) redirects to the raw
PNG, which is also what the `<link rel="icon" type="image/png">` above
it points at — a browser with no SVG favicon support never sees the
SVG line at all.

> Replacing the logo is still one object in R2. Nothing else has to
> change, in code or in the bucket.

### Structured data

| Node | Where |
|---|---|
| `Organization`, `WebSite` | every indexable page |
| `Person` | `/` and `/about`, under one shared `@id` |
| `ProfilePage`, `FAQPage` | `/about` |
| `BreadcrumbList` | every page with breadcrumbs |
| `VideoGame` | landing page (one per game), each game's pages |
| `SoftwareApplication` | landing page, `/tools`, each tool's page |
| `ItemList` | `/tools`, each leaderboard |

`Organization.founder` points at the `Person` node by `@id`, and the
`Person` node is emitted on the front page as well as on `/about` —
a reference whose target only ever appears on one inner page is one a
crawler may never resolve.

`Organization.logo` is an `ImageObject` rather than a bare URL, and
both it and `Organization.image` share the `/#logo` id, so the mark is
one thing said once.

The `alternateName` lists carry **`Amir Collider`** (spaced) and
`amircollider` as well as the compound spelling. A search engine does
not split a compound word on your behalf, and roughly half the people
looking for the name type it as two words.

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
   indexing*. Repeat for `/about`, `/tools`, `/unity-docsnap`,
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
- *AmirCollider* and *Amir Collider* are also two different queries.
  The `alternateName` entries tell Google they name one thing, but the
  association is something it decides over time — the off-site links
  above are what make it decide sooner. Spell it **AmirCollider**
  everywhere you write it yourself; the spaced form is for the people
  typing it, not for the site to imitate.
- Give it time. A new domain takes weeks to settle regardless of what
  the markup says.

---

## 3. Google Cloud Console — OAuth consent screen

For a game like Neon Katana to sign players in without a warning
screen, the consent screen needs URLs on a verified domain that
actually load. These are ready:

One OAuth client is registered **per game**, so its home page should
be that game's own page rather than the site's front door — the
consent screen names one application, and the page it points at has to
be about that application:

| Field | URL |
|---|---|
| Application home page | `https://amircollider.com/neon-katana` |
| Privacy policy | `https://amircollider.com/neon-katana/privacy` |
| Terms of service | `https://amircollider.com/neon-katana/terms` |

The site-wide `/privacy` and `/terms` answer too, and are the right
choice for a client that is not about one particular game.

### What the reviewer checks, and where it is

- **The page names the same application as the consent screen.** The
  `<h1>`, the `<title>`, the `application-name` meta tag and the first
  line of the *What this app is* section all carry the game's name
  exactly as `GAME_REGISTRY` spells it — which is also what the
  consent screen has to say.
- **The home page explains what the app is for.** `purposeBlock()` in
  `Pages/GameLanding.js`, rendered from `i18n.purpose` in
  `Config.js`. It is the one section of a landing page that is **not**
  database-driven and cannot be emptied from the `/thegod` panel;
  everything else there degrades to nothing when its row is blank,
  which is right for a trailer and was how a page with nothing to say
  about itself reached a reviewer in the first place.
- **What Google sign-in is used for.** The same section's second half,
  built from the game's `capabilities` flags, naming the three scopes
  and every use they are put to, with links to the game's privacy
  policy and terms.
- **A reviewer who does not read the page's language.** A page
  rendering in Persian or Japanese also carries the English paragraph.
  Language itself resolves `?lang=` → cookie → `Accept-Language`, so a
  reviewer whose browser asks for English gets English.

  > A request with **no** `Accept-Language` at all still gets
  > `LANGUAGES.default`, which is `fa`. If a review ever comes back
  > confused by that, `https://amircollider.com/neon-katana?lang=en`
  > is a legitimate value for the home-page field.

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
- **App name and logo in Cloud Console must match what the site
  shows.** The name is the one thing a review will reject outright for
  mismatching, and it is compared against the page the *Application
  home page* field points at. For Neon Katana that name is exactly
  `Neon Katana` — the `name` field of its `GAME_REGISTRY` entry — and
  not `AmirCollider`, which is the publisher. The logo is
  `/assets/AmirColliderLogo.png`.
- Once the review passes, changing a game's `name` in `GAME_REGISTRY`
  without changing it on the consent screen puts the two out of step
  again.

---

## 4. Changing any of this later

| To change | Edit |
|---|---|
| The canonical domain | `CONFIG.SITE_URL` |
| What a game says it is for | `i18n.purpose` in `GAME_REGISTRY` |
| The biography on `/about` | `Content/AboutMe.js` |
| The accounts in `sameAs` | `CONFIG.SOCIAL` |
| The favicon's safe area | `SAFE` in `Pages/Icon.js` |
| Which hostnames redirect | `CONFIG.ALT_HOSTS` |
| Which paths crawlers avoid | `DISALLOW` in `Pages/Sitemap.js` |
| Which pages are in the sitemap | `indexablePaths()` in `Pages/Sitemap.js` |
| The nav links every page shows | `primaryItems()` in `Core/SiteNav.js` |
| The footer columns | `siteFooter()` in `Core/SiteNav.js` |

Adding a game to `GAME_REGISTRY` gives it sitemap entries, structured
data, breadcrumbs, policy pages and footer links with no further edits.
