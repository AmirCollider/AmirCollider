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

### The name, in every form somebody types it

**This is the second thing that mattered most, and it is the whole
reason `CONFIG.BRAND` exists.**

"AmirCollider" is one Latin word. That is one of five or six
strings a person looking for this site will actually put in a
search box, and a search engine derives none of the others on its
own:

- It will not split a compound word for you. *Amir Collider* and
  *AmirCollider* are two different queries.
- **It will not transliterate for you.** A Persian reader types
  *امیر کلایدر*; a Japanese reader types *アミールコライダー*. Before
  this, neither string appeared anywhere in this site's bytes — in
  any form, on any page, in any tag. A trilingual site was
  findable under one script.
- It will not spell-correct a brand it has not learned yet.
  Correction is learned from seeing the wrong form near the right
  one; on a young domain it has seen neither.

> **The Persian spelling is «امیر کلایدر» — kolayder, not
> koolayder.** Two passes of this work had it wrong, with
> `امیرکولایدر` published as the primary spelling and the *correct*
> form sitting in the misspellings list. The reason the wrong guess
> looked right: Persian transliterates the physics term *collider*
> as کولایدر, so anyone reasoning from the word rather than from
> the person lands there. It is a personal handle, not the physics
> term. `Scripts/CheckBrandCoverage.mjs` exists partly so this
> class of mistake cannot survive another pass.

`CONFIG.BRAND` holds four lists, deliberately kept apart because
confusing them is how a site gets classified as keyword-stuffing:

| List | What it is | Where it is used |
|---|---|---|
| `SCRIPTS` | one form per script (`en` / `fa` / `ja`) | **printed** in the footer of every page, reader's own language first |
| `ALIASES` | genuine alternate names — the spaced form, both Persian forms, both Japanese forms | `alternateName` on `Organization`, `WebSite` and `Person`; `/about`'s keywords |
| `TYPOS_SHOWN` | the **three** misspellings actually published | filled into the `/about` question and answer |
| `MISSPELLINGS` | the full reference list | nowhere on the site — see below |
| `TOPICS` | what the name is *about*, per language | `knowsAbout`, and the keyword tag on every page |

### Persian is written six ways, and none of them is a mistake

`persianSpellingVariants()` in `Core/Seo.js` derives the rest from
the two listed forms. Two transformations, and they compose:

**The alphabet is shared; the character set is not.**

| Persian | | Arabic |
|---|---|---|
| `ی` U+06CC Farsi yeh | ↔ | `ي` U+064A Arabic yeh |
| `ک` U+06A9 Keheh | ↔ | `ك` U+0643 Arabic kaf |

They are visually identical in almost every font and are different
strings. A Persian speaker on the Windows Arabic layout, on many
Android keyboards, or copying from older Persian web content types
the Arabic codepoints.

**The separator is invisible.** Persian joins compounds with U+200C
ZERO WIDTH NON-JOINER, which renders as a hair of space and is a
different string from both a space and nothing:

```
امیر کلایدر     space
امیر‌کلایدر     ZWNJ
امیرکلایدر     joined
```

Two listed forms × three separators × two character sets, deduped,
gives the six the `alternateName` list carries. Game `altNames` go
through the same function, so `نئون کاتانا` reaches the page under
five spellings.

### Testing it: `Scripts/CheckBrandCoverage.mjs`

```
node Scripts/CheckBrandCoverage.mjs            # against the code
node Scripts/CheckBrandCoverage.mjs --remote   # against the live site
```

It generates every written form of the brand, both games and both
tools, fetches all 66 indexable pages, and asks of each form
whether anything on the site matches it. Three tiers, and the
distinction between them is the whole point:

| Tier | Expectation | Why |
|---|---|---|
| **MUST** | present | correct spellings, every encoding. A miss is a reader who typed the name properly and found nothing |
| **SHOULD** | present | the three misspellings answered in prose on `/about` |
| **LEARNED** | **absent** | every other misspelling. Publishing them would be keyword stuffing; a search engine generalises its spelling correction from the three in the SHOULD tier |

Its first run found three things: a fourth misspelling that had
leaked into the English `/about` question and was not in
`TYPOS_SHOWN`, and two bugs in its own matcher — a plain substring
test reports `Amir Collide` and `アミールコライダ` as "leaked" because
each is a *prefix* of the correct name. It matches on a word
boundary now.

A misspelling is deliberately **not** an `alternateName`: that
field means "this thing is also called this", and a typo is not
another name for something. Written out as an answer to "what if I
spell it wrong", the same list is honest, is a real answer, and is
the form a search engine can learn a correction from.

> Editing any of this is one edit, in `CONFIG.BRAND`. The footer,
> the structured data, the keyword tags and the three `/about`
> answers all read from it — the answers carry `{aliases}` and
> `{typos}`, filled in by `aboutFor()` in `Content/AboutMe.js`.

**Games have the same problem one level down.** `altNames` in a
`GAME_REGISTRY` entry holds the game's name in the other scripts
(`نئون کاتانا`, `ネオンカタナ`). It reaches `alternateName` on the
`VideoGame` node and the keyword tag on all three of that game's
pages. The Latin name stays *the* name everywhere it is rendered —
it is what the store listing, the APK and the OAuth consent screen
say, and none of those may drift.

### Per-page keywords

`seoHead()` prepends `brandKeywords(lang)` to whatever a page
passes, always, and de-duplicates case-insensitively at a cap of
24 terms (`keywordList()`). So every page says who it belongs to,
and a page that passes its own subject says both — which is the
pairing that matters: *AmirCollider* beside *Unity editor
extension* is an association a search engine can learn; either one
alone is a word it already knows.

Google has ignored `<meta name="keywords">` since 2009 and says so
out loud. Bing, Yandex and Naver do not, and Naver is not a
rounding error for a page that wants to be found in Japanese. It
costs one tag. **Only ever pass terms the page actually answers** —
stuffing it is the one way this tag can still hurt.

### Structured data

| Node | Where |
|---|---|
| `Organization`, `WebSite` | every indexable page |
| `WebPage` | every indexable page — added by `seoHead()` itself |
| `CollectionPage` | `/games`, `/tools` (instead of `WebPage`) |
| `Person` | `/` and `/about`, under one shared `@id` |
| `ProfilePage`, `FAQPage` | `/about` |
| `BreadcrumbList` | every page with breadcrumbs |
| `VideoGame` | landing page, `/games`, `/` |
| `SoftwareApplication` | `/`, `/tools`, each tool's page |
| `VideoObject` | a game landing page with a trailer |
| `ItemList` | `/`, `/games`, `/tools`, each leaderboard |
| `FAQPage` | `/about`, each game's landing page |

**A page-level node is new and it is the one that was missing.**
Every page emitted an `Organization` and a `WebSite` and then
stopped — two nodes about the *publisher* and none at all about
the document in front of the crawler. Nothing said what the page
was about, which language its bytes were in, or that the
breadcrumb trail rendered above belonged to this page rather than
to the site in general. `seoHead()` now builds one from what it
already knows, so no page has to remember. A page that emits its
own (`/about`, a `ProfilePage`) opts out with `webPage: false`
rather than shipping two.

**The `VideoGame` node carries the page's own content.** It used
to be a name, a sentence, a URL, a platform and a genre list —
exactly enough for a crawler to know the domain mentioned
something called Neon Katana and not what it was. It now reads
`featureList`, `screenshot`, `video`, `keywords`, `alternateName`,
`sameAs` (the store listings), `identifier`, `softwareVersion` and
`offers` out of the same merged registry-and-database record the
body renders from — so the markup cannot say something the page
does not.

**Publishers are referenced by `@id`, never spelled out.** The
game nodes used to write an inline `{"@type": "Organization",
"name": "AmirCollider"}`, which minted a *second* Organization
beside the one `seoHead()` emits — two publishers with one name,
as far as a crawler is concerned.

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
`/video/` — plus, generated per game from the registry,
`/{game}/account`, `/{game}/health` and `/{game}/ping`. The download
endpoint is deliberately **not** disallowed: a crawler that follows
`/{game}/download` to the store listing is a crawler learning that
this page and that listing are about one game, which is the same
association `sameAs` is making in the structured data.

`Allow:` names `/assets/`, `/icon.svg` and `/favicon.ico`
explicitly. Nothing forbade them before, but Googlebot-Image reads
this file looking for a rule about itself, and an explicit allow is
the difference between *not forbidden* and *invited*.

**`lastmod` is `CONFIG.SITEMAP_LASTMOD`, not today.** It used to be
`new Date()` — today, on all 66 URLs, every time the file was
fetched. That is not a small inaccuracy: `lastmod` is a hint a
crawler decides whether to *trust*, and a sitemap claiming the
privacy policy changed today, and again tomorrow, is a sitemap
whose dates get ignored on the pages where the date was real.
Update the constant in the commit that changes something a reader
would notice. A date in the future makes Google drop the tag
entirely.

**Game logos ride along.** The front page, `/about` and every game
landing page carry an `<image:image>` entry. An image found in a
sitemap beside the page it belongs to is an image a crawler can
attribute; the same file discovered by parsing an `<img>` tag is a
file on a CDN — and for a game whose whole identity is one piece
of key art, that is the difference between the art appearing beside
the search result and not.

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

### What a result actually says

A crawl of all 66 indexable URLs found that the pages this domain
most wants to rank were the ones describing themselves worst:

| Page | Description before |
|---|---|
| `/neon-katana` | `Neon action sword game` — 22 characters |
| `/chronoblades` | `One knife, one spinning target…` — 60 |
| `/{game}/versions` | `Neon Katana — Versions` — the title, again |
| `/{game}/store` | one sentence about cryptocurrency, identical on all six |
| `/release-notes` | `OAuth proxy for AmirCollider games.` — describes neither the page nor, any more, the site |
| `/unity-docsnap` | the entire opening paragraph — **455 characters** |

Two different failures with one cause: no page had a string written
to be a *description*. Some reused the visible lede, some reused
the title, and the game pages fell through to a card's one-liner.

They are composed now, from facts the page already renders:

- **`landingDescription()`** in `Pages/GameLanding.js` builds a
  game's from its name (plus its other-script name), its pitch, the
  platforms derived from its download links, and its `capabilities`
  flags. Every clause is dropped when its fact is absent, so a game
  with no store never claims purchases.
- **`storeDescription()`** in `Pages/GameStore.js` names the
  products that store actually sells, which is what stopped six
  store pages being one result.
- The tool pages and the policy pages have their own `metaTitle` /
  `metaDesc` strings, separate from the prose they had been
  borrowing.

**Length is measured in rendered width, not characters**
(`textWidth()` in `Core/Seo.js`). Google truncates by pixel width,
and a full-width kana is about two Latin characters — so a budget
counted in characters got Japanese wrong in *both* directions at
once: the audit flagged a 66-character Japanese description as too
short while it was in fact rendering wider than a 130-character
English one, and a Japanese string built to a 158-character budget
was being truncated mid-clause. Where a composed description runs
long, clauses are dropped one at a time from the end so it always
ends on a complete sentence — the attribution is never the clause
that goes.

**A missing `<h1>`** — the six game store pages had none at all; the
heading was a `div` wearing the heading class. A document with no
`h1` has no stated subject, and a screen reader's heading list
opened on the second section.

### One address per page

A probe of the live routes found three shapes that answered **404**
and should not have:

| Request | Was | Now |
|---|---|---|
| `/about/` | 404 | `301` → `/about` |
| `/About` | 404 | `301` → `/about` |
| `//about` | 404 | `301` → `/about` |
| `/games/` | 404 | `301` → `/games` |
| `/EN/About/` | 404 | `301` → `/en/about`, **one hop** |

A trailing slash is on half the links people paste; a capital is
what a person types when the name is a brand. Each was a dead end
for the reader and a link whose authority reached nothing.
`normalizeRedirect()` in `Worker.js` handles all of them, before
language routing so `/EN/About/` resolves in a single redirect
rather than three.

**What it deliberately does not touch** matters more than the rule.
Only paths that take a language prefix are normalised, and the test
is on the **destination**, not the request. R2 object keys are
case-sensitive, so lower-casing `/assets/NeonKatanaLogo.png` would
turn every image on the site into a 404 — the normalised form still
starts with `/assets/`, which is not a language-routable path, so
the redirect is refused. The same exclusion covers the machine API
that shipped Android builds call, and both operator panels.

Testing the *request* as well was the first version of this rule
and it was wrong twice: it broke `/en/games/` into a three-redirect
chain, and it was not buying the protection it appeared to.

### Google's policies, and where this site stands against them

Every choice below was checked against Google Search's own
published guidance rather than against general SEO advice, because
several of the obvious moves here are the ones the spam policies
name. This section is the record of what was checked, including the
two places where the first pass over this work got it wrong.

**Keyword stuffing** — the spam policy names *"lists or groups of
keywords, out of context"* as the pattern. The first version of the
misspellings answer on `/about` dropped all fourteen entries of
`CONFIG.BRAND.MISSPELLINGS` into one line separated by middots.
That is exactly that shape, regardless of intent. It is three
misspellings now, each inside a sentence explaining *why* it is a
common mistake — which is a real answer, and is also the better
signal: a search engine learns a spelling correction from the wrong
form appearing beside the right one in ordinary prose. The other
eleven stay in `Config.js` as a reference list and are published
nowhere.

**Hidden text** — the footer's three-script brand line was
originally dimmed twice (a dim token *and* `opacity: 0.75`), which
took it under readable contrast. Low-contrast text carrying brand
keywords is the textbook hidden-text pattern and is also an
accessibility failure. It is ordinary footer text now.

**Misleading structured data** — `alternateName` means *"this thing
is also called this."* Three kinds of entry were removed after a
second pass: casing variants (`amircollider`, `AMIRCOLLIDER` —
search is case-insensitive, so these only pad the list), a
hyphenation nobody uses, and `AmirCollider Studio`, which was
invented and appears on no listing or profile anywhere. Misspellings
are deliberately **not** in this field either — a typo is not
another name for something.

**Structured data must describe visible content** — every field the
`VideoGame` node carries is rendered on the page it is on:
`featureList` is the feature strip, `screenshot` is the gallery,
`video` is the embedded trailer. `alternateName` was the one
exception, asserting a Persian and Japanese name that appeared
nowhere a reader could see it. Those names are now rendered inside
the game's `<h1>` in the reader's own script, so the markup is
backed by text on the page.

**`<meta name="keywords">`** — Google has ignored it since 2009 and
says so publicly, so it cannot help there. Bing has said they look
at it *as a spam signal*, which means a padded list is not a
neutral cost — it is the one way this tag still changes anything,
in the wrong direction. Yandex and Naver do read it. So it stays,
capped at **16 terms**, with the page's own subject first. See
`KEYWORD_CAP` in `Core/Seo.js`.

**Locale-adaptive serving** — Google's guidance is that automatic
language redirection is acceptable when every version has its own
crawlable URL and the visitor can override it. Both hold here. The
one thing that was missing is `Vary: Accept-Language`, now sent on
the preference-based `302` — and only on that redirect, since it is
the only response that reads a request header. Googlebot sends no
`Accept-Language` and never sees it.

**`503` rather than `500`** — Google documents `503` as the code for
temporary unavailability and treats it as *keep this URL, come back
later*; a `500` says the page is broken, and a page that is broken
twice is dropped. The leaderboard is in `sitemap.xml` at
`changefreq=daily`, so it is fetched often — it answers `503` with
`Retry-After` to browsers and crawlers now. The **JSON** status is
unchanged, because shipped Unity builds switch on it.

**Rich results that no longer exist** — worth knowing before anyone
expects them in the search result:

| Markup | Status |
|---|---|
| `FAQPage` | Since **August 2023** Google shows FAQ rich results only for well-known authoritative government and health sites. This site will not get them. |
| `HowTo` | The rich result was **removed from Search entirely**. `howToLd()` on `/unity-directtmp` produces no visual result at all. |

Both are kept anyway, and neither is a policy problem: they are
valid schema, they cost a few hundred bytes, and they still
describe the page to anything that reads structured data for
*understanding* rather than for drawing a box — which now includes
the assistants that answer questions about this site. Just do not
wait for a rich result that is not coming.

**Not done, on purpose** — no `aggregateRating` or `review` markup
anywhere. There are no ratings and no reviews; inventing them is a
structured-data violation with a manual action attached, and it is
the single most common way a small site gets penalised.

### Checking all of it after a deploy

`/testsite` → **Search visibility**. Six checks, all read-only GETs of
public pages: `robots.txt`, `sitemap.xml`, the front page's canonical
host, its hreflang links, its JSON-LD (parsed, not counted), and
whether the brand's Persian and Japanese spellings are actually in the
page's bytes.

Everything in that group is written for a failure that returns **200**.
A canonical naming the wrong host, a robots.txt that stopped pointing
at the sitemap, a hreflang cluster that lost a language, a footer
refactor that dropped the brand line — all of them render a perfectly
normal page and are invisible until three months of indexing have gone
somewhere else.

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
- *AmirCollider*, *Amir Collider*, *امیر کلایدر* and *アミールコライダー*
  are four different queries and one name. Five things now say so: the
  `alternateName` entries on `Organization`, `WebSite` and `Person`; the
  footer line that prints the name in all three scripts on **every**
  page; three questions on `/about` that answer it in prose (the
  spacing, the other scripts, and the misspellings) and their presence
  in that page's `FAQPage` markup; the keyword tag; and `/about`'s meta
  description, which now carries the Persian and Japanese forms beside
  the Latin one. The association is still something Google decides over
  time, and the off-site links above are what make it decide sooner.
  Spell it **AmirCollider** everywhere you write it yourself; the other
  forms are for the people typing them.
- The same applies to a **game's** name. `altNames` in `GAME_REGISTRY`
  is what makes *نئون کاتانا* and *ネオンカタナ* reach Neon Katana's page.
  If a game is announced in Persian or Japanese anywhere off-site, spell
  it there exactly as `altNames` spells it here.
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
| The brand's name in another script | `CONFIG.BRAND.SCRIPTS` (footer) and `CONFIG.BRAND.ALIASES` (markup) |
| Which misspellings `/about` answers | `CONFIG.BRAND.MISSPELLINGS` |
| What the brand is *about* | `CONFIG.BRAND.TOPICS` — per language |
| A game's name in another script | `altNames` in its `GAME_REGISTRY` entry |
| One page's keywords | the `keywords` it passes to `seoHead()` |
| The date the sitemap reports | `CONFIG.SITEMAP_LASTMOD` |
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
