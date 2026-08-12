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

### One address per language

**This is the change that mattered most, and it is worth understanding
before touching anything near it.**

Every language now has its own URL:

| Language | Address |
|---|---|
| Persian (default) | `/about` |
| English | `/en/about` |
| Japanese | `/ja/about` |

`Core/Locale.js` owns the rule; `Worker.js` applies it.

**What it replaced, and why that was fatal.** The language used to live
in `?lang=`. So `/`, `/?lang=fa`, `/?lang=en` and `/?lang=ja` were four
addresses that all declared `/` as their canonical. A search engine
resolves an hreflang cluster whose members all point at one member by
keeping that member and discarding the annotations — so the site had
exactly **one indexable address per page**, not three.

And the language of that one address was decided by `Accept-Language`.
Googlebot sends no `Accept-Language` header, and `LANGUAGES.default` is
`fa`. Every page Google has ever indexed of this site is therefore the
Persian one. That is the mechanism behind "searching the brand from a
non-Persian IP finds nothing" and behind the English and Japanese
content never appearing anywhere.

**The rule that makes it work:** a bare path is *always* the default
language. Not "the default unless a cookie says otherwise" — always.
One URL, one language, one set of bytes, for every visitor and every
crawler. A human who prefers another language is redirected to that
language's own URL with a **302** (the preference belongs to the
visitor, not to the address); Googlebot, sending neither a cookie nor
an `Accept-Language` header, never sees that redirect.

**Every old address still resolves:**

| Request | Response |
|---|---|
| `/about?lang=en` | `301` → `/en/about` |
| `/fa/about` | `301` → `/about` |
| `/en/assets/x.png` | `301` → `/assets/x.png` |
| `/en/checkout` | `301` → `/checkout?lang=en` |
| `/about` + a reader who prefers English | `302` → `/en/about` |

Query strings other than `lang` are preserved throughout — the
checkout's signed order handle arrives as one.

**What is deliberately exempt** (`NO_LANG_ROUTING` in `Core/Locale.js`):
the machine surface (`/assets/`, `/oauth/`, `/database/`, `/games/{id}/…`)
because shipped Android builds call it and some do not follow redirects
at all; and the transactional surface (`/checkout`, `/order`, `/license`)
because the payment provider holds a `success_url` carrying `?lang=` for
the life of an invoice. Those pages are `noindex` and disallowed in
`robots.txt`, so nothing is lost.

> Adding a language: one entry in `LANGUAGES.supported`. Everything
> below — canonicals, hreflang, the sitemap, the switcher — follows.
>
> A **two-letter game id** would collide with a language prefix.
> `splitLangPath` guards against it by checking `LANGUAGES.supported`
> rather than the shape alone, so such a game keeps working — but do
> not name a game `fa`, `en` or `ja`.

### Internal links follow the page's language

`localizedPath()` is applied to every site-relative href: the header,
the footer, breadcrumbs, game cards, tool cards, the product pages and
the policy pages. A reader on the English front page used to leave it
into Persian on the first click, and — more expensively — a crawler
reading that page found **no English pages to follow at all**.

### Per-page metadata

`Core/Seo.js` renders, for every page:

- `<link rel="canonical">` — the page's own address **in the language it
  is rendering**. Callers pass the bare path (`/about`); the prefix is
  added once, inside `seoHead()`, so no page has to remember to do it.
- `hreflang` for `fa`, `en`, `ja` plus `x-default` — now naming three
  genuinely different canonicals, which is what makes the cluster real
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

Three routes, one logo object in R2.

`GET /icon.svg` (`Pages/Icon.js`) reads `CONFIG.AMIR_LOGO` out of R2 and
serves it inside an SVG that does two things:

1. paints `CONFIG.ICON_BG` across the **whole** canvas, and
2. places the artwork inside the middle **70%**.

Step 2 alone was the previous version, and it was not enough. Google
draws a favicon inside a circle; the logo is a square that paints its
own background to its own edges; insetting it inside a *transparent*
canvas produced a small square sitting inside a ring — two shapes
disagreeing, which is exactly what the search result showed. A circle
can only ever crop the outermost band, so that band has to be something
worth cropping. With the backdrop painted first, what the circle takes
is a ring of solid colour and what it leaves is a round mark.

> **Set `CONFIG.ICON_BG` to the logo's own background colour.** Whatever
> colour the PNG paints its corners is the value that makes the seam
> between artwork and backdrop invisible; anything else leaves a faint
> square edge visible inside the circle.

`GET /favicon.ico` serves the logo's own bytes as a PNG. A browser asks
for that address whether the document links to an icon or not, and so do
several crawlers — Google's favicon fetcher among them. There was no
route for it, so all of them got the 404 page: an HTML document served
where an image was expected, which is on its own enough to leave a tab
blank.

`GET /site.webmanifest` describes the icon to an Android launcher,
including `purpose: "maskable"` — which tells the launcher the icon
already carries its own safe area and it should not add padding of its
own on top.

> Replacing the logo is still one object in R2. Nothing else has to
> change, in code or in the bucket.

### Structured data

| Node | Where |
|---|---|
| `Organization`, `WebSite` | every indexable page |
| `Person` | `/` and `/about`, under one shared `@id` |
| `ProfilePage`, `FAQPage` | `/about` |
| `BreadcrumbList` | every page with breadcrumbs |
| `VideoGame` | landing page, `/games`, each game's pages |
| `SoftwareApplication` | landing page, `/tools`, each tool's page |
| `ItemList` | `/games`, `/tools`, each leaderboard |
| `FAQPage` | `/about`, each game's landing page |

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

The sitemap lists every page **once per language**, at its own address,
each carrying the full reciprocal set of alternates — 48 URLs where
there used to be 16. It previously listed one entry per page with three
`?lang=` alternates hanging off it, which was the sitemap faithfully
describing the bug: those three addresses all canonicalised back to the
bare path, so the English and Japanese versions of this site were never
submitted anywhere.

Disallowed for crawlers: `/thegod`, `/testsite`, `/checkout`, `/order`,
`/license`, `/oauth/`, `/auth/`, `/database/`, `/profile/`, `/games/`,
`/video/`.

### Games have an address, not an anchor

`/games` (`Pages/Games.js`) is a catalogue page whose whole subject is
the games, listed from `GAME_REGISTRY`. It exists because `/tools` did
and nothing answered to it: the games were reachable at `/#games`, an
anchor on the dashboard, and an anchor cannot be submitted to a
sitemap, cannot be linked to as a subject and cannot rank.

That imbalance had a visible cost. This domain carried six pages about
Unity tools and none about games, and search engines — and the
assistants built on them — reported accordingly that AmirCollider
makes Unity tools and has never released a game. It was not a ranking
problem. The site was being read correctly.

It sits at `/games` with no trailing slash. The machine-facing routes
are `/games/{id}/manifest` and friends, which always carry a second
segment; `matchRoute` tries every static route before any dynamic one,
and `robots.txt` disallows `/games/` **with** the slash — so the API
stays out of the index and the page stays in it.

### A game's landing page carries its own content

Every block on a game landing page used to be a database field, so a
game whose `/thegod` row had not been filled in rendered a logo, one
line and a download button. `GAME_REGISTRY` may now carry a baseline
for the tagline, the about text, the features, the devices and the
FAQ; `Games/Registry.js` merges the database over it field by field,
so the panel still wins wherever it has an opinion.

That is what makes a game page substantial with an empty database —
and substance is the actual fix for a crawler that could not tell the
site had games on it.

### The front page has a paragraph, on purpose

Google's result for this domain read:

> قابل بازی بدون اینترنت ورود با گوگل ذخیره‌ی ابری جدول امتیازات خرید
> درون‌برنامه‌ای. خرید درون‌برنامه‌ای پرداخت با ارز دیجیتال ورود به حساب
> با حساب گوگل.

That is not a description of anything. It is the capability chips off
the first game card, read left to right (`Pages/GameCards.js`).

A search engine writes its own snippet when the page gives it nothing
better, and this page gave it nothing better: a one-word heading, a
six-word tagline, four stat tiles of digits, and cards made almost
entirely of two-word labels. The `<meta name="description">` was correct
the whole time and was ignored — a description with no matching prose on
the page is a claim a snippet generator has no reason to trust.

`renderHero()` now emits a `lede` paragraph: one paragraph, in the
reader's language, above everything else, saying the same thing as the
meta description without being a copy of it.

> If the snippet ever goes wrong again, this is the first thing to look
> at — not the meta tag.

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
   indexing*. Repeat for `/games`, `/about`, `/tools`, `/donate`,
   `/unity-docsnap`, `/unity-directtmp`, `/neon-katana` — and then for
   the **`/en/` form of each of them**, which is the half of the site
   Google has never seen. `/en`, `/en/about` and `/en/neon-katana` are
   the three worth doing first.
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
  Three things now say they are one name: the `alternateName` entries in
  the structured data, a question on `/about` that answers it in prose
  ("Is it AmirCollider or Amir Collider?"), and that question's presence
  in the page's `FAQPage` markup. The association is still something
  Google decides over time, and the off-site links above are what make
  it decide sooner. Spell it **AmirCollider** everywhere you write it
  yourself; the spaced form is for the people typing it.
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
  `<h1>`, the `<title>` (`Neon Katana — Android game · AmirCollider`),
  the `application-name` meta tag, `og:site_name` and the first line
  of the *What this app is* section all carry the game's name exactly
  as `GAME_REGISTRY` spells it — which is also what the consent screen
  has to say.

  `og:site_name` is the odd one there, and deliberately so. On every
  other page of this site it is the brand, because that is what the
  tag means. On a game's landing page it is the game: that page is
  what the consent screen configures as the application's *home page*,
  and the only machine-readable name it gave for itself used to be
  "AmirCollider" — the publisher — on a page whose subject is one
  game.
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
- **A data deletion route.** Privacy policy → *Your rights* →
  *Deletion*, and the self-service button on `/:gameId/account`.

  > This used to be a section of its own — *Account and data
  > deletion*, with the email route and a 30-day promise — removed
  > at the owner's request in favour of the one line in *Your
  > rights*. Google's review looks for a deletion route by name, so
  > this is the sentence to strengthen first if a verification ever
  > comes back asking for one.
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
| Which languages exist | `LANGUAGES.supported` |
| Which paths take no language prefix | `NO_LANG_ROUTING` in `Core/Locale.js` |
| The icon's backdrop colour | `CONFIG.ICON_BG` |
| The front page's opening paragraph | `lede` in `DASH_I18N` (`Pages/Dashboard.js`) |
| The social accounts | `CONFIG.SOCIAL` |
| The donation amounts and bounds | `CONFIG.DONATE` |
| What a game says it is for | `i18n.purpose` in `GAME_REGISTRY` |
| A game page's baseline content | `landing` in `GAME_REGISTRY` |
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
