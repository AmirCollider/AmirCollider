// ==========================================
// Core/Seo.js
// Everything a crawler reads, in one place.
//
// Why this file exists
//   Before it, two pages carried a canonical tag, none carried
//   hreflang, the landing page had no meta description at all, and
//   every canonical that did exist pointed at the workers.dev
//   hostname rather than the domain the site is actually served
//   from. To a search engine that is a different site with the same
//   content - the single most expensive thing a small site can do
//   to itself.
//
// Exports
//   siteOrigin()                     the canonical origin, no slash
//   absoluteUrl(path)                origin + path
//   seoHead({...})                   canonical, hreflang, robots,
//                                    OpenGraph, Twitter, JSON-LD
//   jsonLd(value)                    one <script type=ld+json>
//   organizationLd() / websiteLd()   the site-wide graph nodes
//   personLd() / profilePageLd()     the About page's two nodes
//   breadcrumbLd(trail)              from a SiteNav trail array
//   faqPageLd(entries)               a question-and-answer list
//   howToLd({...})                   an ordered set of install steps
//   softwareApplicationLd({...})     a Unity tool
//   videoGameLd({...})               a game
//   videoObjectLd({...})             a trailer
//   webPageLd({...})                 the document itself; seoHead
//                                    adds one automatically
//   itemListLd({...})                a catalogue, as a list
//   brandKeywords(lang)              the brand's own search terms
//   keywordList(...parts)            de-duplicated keyword merge
//
// The brand's name in other scripts, and the terms it is searched
// for, come from CONFIG.BRAND. Nothing here writes a second copy
// of either - see the note above ALSO_KNOWN_AS. Persian encodings
// are derived by persianSpellingVariants().
//
// Callers pass plain text; everything is escaped here.
// ==========================================

import { CONFIG, LANGUAGES } from '../Config.js'
import { escapeHtml } from './Html.js'
import { resolveLang } from './RequestContext.js'
import { localizedPath } from './Locale.js'


const OG_LOCALE = { fa: 'fa_IR', en: 'en_US', ja: 'ja_JP' }

// The social card. A page may override it; this is what the rest
// of the site shares when it does not.
const DEFAULT_OG_IMAGE = '/assets/AmirColliderLogo.png'

// Everywhere this project also exists. Read from Config so the
// footer, the About page and the structured data cannot drift.
const SAME_AS = Object.values(CONFIG.SOCIAL || {}).filter(Boolean)

// The X handle, derived from the same URL the footer links to
// rather than written out a second time. twitter:site wants the
// @form, and a card that names an account nobody owns is worse
// than a card that names none.
const TWITTER_HANDLE = (() => {
  const url = (CONFIG.SOCIAL && CONFIG.SOCIAL.x) || ''
  const match = /(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})/.exec(url)
  return match ? '@' + match[1] : ''
})()

// The name the site is searched for, in every spelling somebody
// actually types it in.
//
// This used to be three hard-coded English strings here. It is
// CONFIG.BRAND.ALIASES now - the same list the footer prints, the
// About page answers a question about, and every structured-data
// node declares - because the site is trilingual and the three
// strings were not: a Persian reader searching "امیر کلایدر" and a
// Japanese reader searching "アミールコライダー" were both looking for
// a name that appeared nowhere in this site's bytes, in any form a
// machine could match.
//
// Deliberately NOT including CONFIG.BRAND.MISSPELLINGS. That list
// exists and it matters, but `alternateName` means "this thing is
// also called this", and a typo is not another name for something.
// The misspellings are answered in prose on /about instead, which
// is both honest and the form a search engine can actually learn a
// spelling correction from.
// ==========================================
// persianSpellingVariants
// The same Persian word, typed the other ways it gets typed.
//
// This is the gap a first pass over "make the brand findable in
// Persian" misses completely, and it is bigger than the
// misspellings are - because none of it is a mistake. Every form
// below is somebody spelling the name CORRECTLY, on a different
// keyboard or with a different separator, and producing a
// different byte sequence.
//
// TWO transformations, and they compose.
//
// 1. THE ALPHABET IS SHARED, THE CHARACTER SET IS NOT.
//
//      ی  U+06CC  Farsi yeh      ي  U+064A  Arabic yeh
//      ک  U+06A9  Keheh          ك  U+0643  Arabic kaf
//
//    They look identical in almost every font. A Persian speaker
//    on the Windows Arabic layout, on many Android keyboards, or
//    copying from older Persian web content types the Arabic
//    codepoints - so "امیر کلایدر" and "امير كلايدر" are two
//    queries a reader cannot tell apart on screen.
//
// 2. THE SEPARATOR IS INVISIBLE.
//
//    Persian joins compounds with U+200C ZERO WIDTH NON-JOINER,
//    which renders as a hair of space and is a completely
//    different string from a space or from nothing at all. All
//    three forms of a two-part name are ordinary Persian:
//
//      "امیر کلایدر"   space
//      "امیر‌کلایدر"   ZWNJ
//      "امیرکلایدر"   joined
//
// Derived rather than listed, because both are mechanical and a
// hand-written copy of six Persian strings is six strings to keep
// in step. Nothing PRINTS any of these - the footer and /about
// show the spelling the owner uses. They exist so alternateName
// covers every encoding, which is the honest claim: it is one
// name, and Unicode writes it six ways.
//
// Scripts/CheckBrandCoverage.mjs asserts that each derived form
// actually reaches a page.
// ==========================================
const FARSI_YEH = /\u06CC/g
const FARSI_KEHEH = /\u06A9/g
const ZWNJ = '\u200C'

/** Whether a string contains any Perso-Arabic letter at all. */
function isPersian(text) {
  return /[\u0600-\u06FF]/.test(text)
}

export function persianSpellingVariants(names = []) {
  const out = []

  const add = value => {
    if (value && !out.includes(value)) out.push(value)
  }

  for (const name of names) {
    const text = String(name || '')
    if (!isPersian(text)) continue

    // Every separator form of this spelling, then every character
    // set of every separator form. Composing the two is the point:
    // somebody on an Arabic keyboard writing the ZWNJ form is one
    // person, not an edge case.
    const separators = [text]
    if (text.includes(' ')) {
      separators.push(text.replace(/ /g, ZWNJ))
      separators.push(text.replace(/ /g, ''))
    }

    for (const form of separators) {
      add(form)
      const arabic = form.replace(FARSI_YEH, '\u064A').replace(FARSI_KEHEH, '\u0643')
      add(arabic)
    }
  }

  // The inputs themselves are already declared by the caller, so
  // only the forms it does not have are returned.
  return out.filter(value => !names.includes(value))
}


const BRAND_ALIASES = (CONFIG.BRAND && CONFIG.BRAND.ALIASES) || []
const ALSO_KNOWN_AS = [...BRAND_ALIASES, ...persianSpellingVariants(BRAND_ALIASES)]


/**
 * The brand's own search terms for one language.
 *
 * Every page's `keywords` starts from this and appends whatever
 * that page is specifically about, so the brand and its subject
 * travel together on every surface that reads the tag rather than
 * only on the front page.
 */
export function brandKeywords(lang) {
  const code = resolveLang(lang)
  const topics = (CONFIG.BRAND && CONFIG.BRAND.TOPICS && CONFIG.BRAND.TOPICS[code]) || []
  return ['AmirCollider', 'Amir Collider', ...topics]
}


/**
 * De-duplicated, trimmed keyword list.
 *
 * Callers build these by concatenating a brand list, a page list
 * and whatever a game's registry entry declares, so duplicates are
 * the normal case rather than a mistake. Capped, because a long
 * keyword list is the one way this tag can still hurt a page.
 */
export function keywordList(...parts) {
  const seen = new Set()
  const out = []

  for (const value of parts.flat()) {
    const text = String(value == null ? '' : value).trim()
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(text)
  }

  return out.slice(0, KEYWORD_CAP)
}


// ==========================================
// How many keywords, and in which order.
//
// Sixteen, and the page's own terms first. Both numbers are a
// judgement about a tag that is worth very little and can cost
// something, so they are written down rather than guessed at:
//
//   Google has ignored <meta name="keywords"> since 2009 and says
//   so publicly. It cannot help there, at all.
//
//   Bing has said the opposite of helpful - that they look at the
//   tag as a signal FOR SPAM. A long, padded list is therefore not
//   a neutral cost; it is the one way this tag still changes
//   anything, in the wrong direction.
//
//   Yandex and Naver do read it, and Naver is not a rounding error
//   for a page that wants to be found in Japanese.
//
// So: keep it, keep it short, and keep it honest. Sixteen terms
// that a page genuinely answers reads as a description of the
// page. Twenty-four, most of them variations on one name, starts
// to read as a list. The cap was 24 in the first pass over this
// file and it was reached on three pages, which was the signal to
// look at the number rather than at the pages.
//
// The ORDER changed with it. Brand terms used to be prepended,
// which meant a page passing many of its own terms had them
// truncated away by the brand's - and the brand is already in the
// title, the description, and three JSON-LD nodes on every page.
// The page's subject goes first now; the brand fills what is left.
// ==========================================
const KEYWORD_CAP = 16


// ==========================================
// textWidth / clampWidth
// How long a description actually LOOKS.
//
// Google truncates a title and a snippet by PIXEL WIDTH, not by
// character count, and this site writes in three scripts with
// very different widths. Counting characters got Japanese wrong in
// both directions at once: a 66-character Japanese description
// looked "too short" against a Latin floor while actually being
// wider than a 130-character English one, and a Japanese string
// built to a 158-character budget rendered past the cutoff and was
// truncated mid-clause.
//
// A CJK ideograph or kana is a full-width glyph - about twice a
// Latin character - so it counts twice. Persian is written in
// narrow, connected letters that run slightly under Latin width,
// which is close enough to 1 that pretending otherwise would be
// false precision.
//
// This is an approximation of a value only Google can compute
// exactly. It is a much better one than counting characters, and
// being roughly right in three scripts beats being exactly right
// in one.
// ==========================================
const FULL_WIDTH = /[\u3000-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uFF00-\uFF60\uFFE0-\uFFE6]/

export function textWidth(text) {
  let width = 0
  for (const character of String(text || '')) width += FULL_WIDTH.test(character) ? 2 : 1
  return width
}

/**
 * Trim to a rendered width, on a word boundary where one exists.
 *
 * No ellipsis: the string is not visibly truncated anywhere, it is
 * simply short. A trailing "..." in a result Google did NOT
 * truncate reads as a page that lost its own text.
 *
 * Japanese has no spaces, so the word-boundary search finds
 * nothing and the hard cut applies - which is correct for a script
 * that breaks between any two characters.
 */
export function clampWidth(text, limit) {
  const value = String(text || '').trim()
  if (textWidth(value) <= limit) return value

  let out = ''
  let width = 0
  for (const character of value) {
    const next = width + (FULL_WIDTH.test(character) ? 2 : 1)
    if (next > limit) break
    out += character
    width = next
  }

  const space = out.lastIndexOf(' ')
  return (space > limit * 0.6 ? out.slice(0, space) : out).replace(/[\s،,—·・-]+$/, '')
}


/** The canonical origin, without a trailing slash. */
export function siteOrigin() {
  return String(CONFIG.SITE_URL || '').replace(/\/+$/, '')
}

/** An absolute URL on the canonical origin. */
export function absoluteUrl(path = '/') {
  const suffix = String(path || '/')

  // Already absolute, so leave it alone. Almost every caller
  // passes a site-local path, but `image` on videoGameLd() is
  // whatever a game's registry entry names for its logo - and a
  // logo served from a CDN or an R2 custom domain is an ordinary
  // thing for that to be. Prepending the origin to one produced
  // "https://amircollider.comhttps://…" inside the structured
  // data on the dashboard, which is the worst place for it: no
  // page looks broken, and the search engine reading it simply
  // gets an image that does not exist.
  if (/^https?:\/\//i.test(suffix)) return suffix

  return siteOrigin() + (suffix.startsWith('/') ? suffix : '/' + suffix)
}

/**
 * The same page's address in another language.
 *
 * This used to append `?lang=`, and that is the single line that
 * cost this site its multilingual indexing. Every variant it
 * produced canonicalised back to the bare path, so the hreflang
 * cluster named four URLs that were all declared to be one URL -
 * which a search engine resolves by keeping the one and discarding
 * the annotations. See Core/Locale.js.
 */
function langVariant(path, code) {
  const bare = String(path || '/').split('?')[0]
  return absoluteUrl(localizedPath(bare, code))
}


/**
 * One JSON-LD block.
 *
 * `</script>` inside a string value would close the tag early, so
 * the `<` of every tag-looking sequence is escaped. JSON-LD readers
 * unescape < transparently.
 */
export function jsonLd(value) {
  const json = JSON.stringify(value).replace(/</g, '\\u003c')
  return '<script type="application/ld+json">' + json + '</script>'
}


// ==========================================
// Graph nodes
// ==========================================
export function organizationLd(lang) {
  const code = resolveLang(lang)

  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': absoluteUrl('/#organization'),
    name: 'AmirCollider',
    alternateName: ALSO_KNOWN_AS,
    description: CONFIG.SITE_TAGLINE[code] || CONFIG.SITE_TAGLINE.en,
    url: absoluteUrl('/'),

    // An ImageObject rather than a bare URL string. Both are valid
    // schema, and only one of them lets a consumer know the shape
    // of the file before fetching it - which for a logo shown
    // inside a circular frame is the whole question.
    logo: {
      '@type': 'ImageObject',
      '@id': absoluteUrl('/#logo'),
      url: absoluteUrl(CONFIG.AMIR_LOGO),
      contentUrl: absoluteUrl(CONFIG.AMIR_LOGO),
      caption: 'AmirCollider'
    },
    image: { '@id': absoluteUrl('/#logo') },

    email: CONFIG.SUPPORT_EMAIL,
    founder: { '@id': absoluteUrl('/about#person') },
    sameAs: SAME_AS,

    // What this organisation makes, in the crawler's vocabulary
    // rather than in a sentence it has to parse. An Organization
    // node with a name, a logo and a URL is an entity a search
    // engine can store and has no reason to show anybody; these
    // three fields are the difference between "a string this
    // domain uses" and "a game studio that also ships Unity
    // tools", which is the actual question behind every complaint
    // that the site is not understood.
    knowsAbout: (CONFIG.BRAND && CONFIG.BRAND.TOPICS && CONFIG.BRAND.TOPICS[code]) || [],
    knowsLanguage: LANGUAGES.supported.slice(),
    slogan: CONFIG.SITE_TAGLINE[code] || CONFIG.SITE_TAGLINE.en,

    // The one contact route this site actually has. A support
    // email that appears in the footer, on the order-help page and
    // here is one fact said three times; an organisation with no
    // contact point at all reads as a brochure.
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: CONFIG.SUPPORT_EMAIL,
      availableLanguage: LANGUAGES.supported.slice()
    }
  }
}

export function websiteLd(lang) {
  const code = resolveLang(lang)

  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': absoluteUrl('/#website'),
    name: 'AmirCollider',
    alternateName: ALSO_KNOWN_AS,
    description: CONFIG.SITE_TAGLINE[code] || CONFIG.SITE_TAGLINE.en,
    url: absoluteUrl('/'),

    // The language THESE bytes are in, plus the languages the site
    // exists in at all. Both are true and they answer different
    // questions: `inLanguage` is what this document is written in,
    // and a crawler that only ever learns that has no reason to
    // look for the other two.
    inLanguage: code,
    availableLanguage: LANGUAGES.supported.slice(),

    keywords: brandKeywords(code).join(', '),
    publisher: { '@id': absoluteUrl('/#organization') },
    copyrightHolder: { '@id': absoluteUrl('/#organization') }
  }
}


// ==========================================
// personLd
// The human behind the name.
//
// Deliberately thin: an alias, what they do, and where else they
// exist. There is no legal name, no birth date and no location in
// here, because there is none of that anywhere on this site
// either - structured data is a place a fact leaks from long
// after the page that carried it was rewritten.
//
// It exists at all because "AmirCollider" is a person as well as a
// project, and a search engine that only ever sees an Organization
// has nothing to attach a biography to.
// ==========================================
export function personLd(lang, { description = '', path = '/about' } = {}) {
  const code = resolveLang(lang)

  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': absoluteUrl('/about#person'),
    name: 'AmirCollider',

    // The same list the Organization carries. The person and the
    // studio share one name here, so a reader searching the name
    // in Persian should reach both nodes or neither.
    alternateName: ALSO_KNOWN_AS,
    description: description || CONFIG.SITE_TAGLINE[code] || CONFIG.SITE_TAGLINE.en,
    url: absoluteUrl(path),
    image: { '@id': absoluteUrl('/#logo') },
    knowsAbout: ['Unity', 'Game development', 'C#', 'Android games', 'Unity editor extensions'],
    sameAs: SAME_AS,
    worksFor: { '@id': absoluteUrl('/#organization') }
  }
}


/**
 * The About page itself, tied to the person it is about.
 *
 * `@id` stays on the bare path while `url` carries the language
 * prefix: the id names one thing across every translation of the
 * page, and the url names the address these particular bytes came
 * from. Collapsing the two would give the English and Persian
 * pages different ids for the same profile.
 */
export function profilePageLd(lang, path = '/about') {
  const code = resolveLang(lang)

  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    '@id': absoluteUrl(path) + '#profilepage',
    url: absoluteUrl(localizedPath(path, code)),
    inLanguage: code,
    mainEntity: { '@id': absoluteUrl('/about#person') },
    about: { '@id': absoluteUrl('/about#person') },
    isPartOf: { '@id': absoluteUrl('/#website') }
  }
}


/**
 * A question-and-answer list, as Google reads one.
 *
 * Two shapes are accepted, because the two product pages already
 * store their FAQ in two different ones and neither is wrong:
 * `{ q, a }` objects and `[question, answer]` pairs. Normalising
 * here is one function; converting at each call site is a rule
 * somebody has to remember on the day they add the third page.
 */
export function faqPageLd(entries = [], lang) {
  const items = (entries || [])
    .map(entry => {
      if (Array.isArray(entry)) return { q: entry[0], a: entry[1] }
      return entry
    })
    .filter(entry => entry && entry.q && entry.a)

  if (!items.length) return null

  const node = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(entry => ({
      '@type': 'Question',
      name: entry.q,
      acceptedAnswer: { '@type': 'Answer', text: entry.a }
    }))
  }
  if (lang) node.inLanguage = resolveLang(lang)
  return node
}


// ==========================================
// howToLd
// The install steps, as an ordered procedure.
//
// Both Unity tools install the same way - four clicks and a git
// URL in the Package Manager - and "how do I install <package>"
// is a question people type into a search box rather than into
// the documentation they already have open. A HowTo node is how
// that procedure becomes an answer a search engine can show
// instead of a page it has to rank.
//
// Steps are plain strings. A step carrying a URL of its own is
// rare enough here that it is not worth a shape for.
// ==========================================
export function howToLd({ name, description, path, steps = [], lang, tool, supply } = {}) {
  const list = (steps || []).filter(Boolean)
  if (!name || list.length === 0) return null

  const node = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name,
    step: list.map((text, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: String(text).split('.')[0].slice(0, 80),
      text: String(text)
    }))
  }

  if (description) node.description = description
  if (path) node.url = absoluteUrl(path)
  if (lang) node.inLanguage = resolveLang(lang)
  if (tool) node.tool = [{ '@type': 'HowToTool', name: tool }]
  if (supply) node.supply = [{ '@type': 'HowToSupply', name: supply }]
  return node
}

/**
 * BreadcrumbList from the same trail SiteNav renders.
 *
 * `lang` localises the `item` URLs so the trail on an English page
 * names English addresses. Optional, and bare paths when it is
 * omitted - a breadcrumb pointing at the default language is
 * wrong-ish rather than broken, and every caller passing it is
 * better than one caller crashing without it.
 */
export function breadcrumbLd(trail = [], lang = LANGUAGES.default) {
  if (!trail || trail.length === 0) return null
  const code = resolveLang(lang)

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      item: absoluteUrl(localizedPath(item.href || '/', code))
    }))
  }
}

/**
 * A Unity editor extension.
 *
 * `offers` is omitted for a tool with no price rather than sent as
 * zero: a free MIT package and a package that happens to cost
 * nothing today are different claims, and only one of them is true.
 *
 * `featureList` and `keywords` are the two fields that decide what
 * a machine thinks this thing IS. Without them a crawler has one
 * sentence of prose and a product name to go on, and a product
 * name is exactly the wrong evidence when the name is a pun:
 * "DocSnap" read cold is a screenshot tool, and that is precisely
 * what it was being classified as. A feature list is the page
 * telling the crawler what it does in the crawler's own vocabulary
 * rather than hoping the marketing sentence survives the trip.
 *
 * `offers` accepts an array as well as a single price, because a
 * tool with a free tier and two paid ones is three offers and
 * quoting only the cheapest paid one hides the free edition from
 * every surface that reads this.
 */
export function softwareApplicationLd({
  name,
  alternateName,
  description,
  path,
  version,
  price,
  offers,
  currency = 'USD',
  operatingSystem = 'Windows, macOS, Linux',
  repo,
  featureList = [],
  keywords = [],
  downloadUrl,
  installUrl,
  softwareHelp,
  requirements,
  inLanguage = [],
  category = 'DeveloperApplication',
  subCategory = 'Unity Editor Extension',
  license
}) {
  const node = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name,
    description,
    url: absoluteUrl(path),
    applicationCategory: category,
    applicationSubCategory: subCategory,
    operatingSystem,
    softwareVersion: version,
    author: { '@id': absoluteUrl('/#organization') },
    publisher: { '@id': absoluteUrl('/#organization') }
  }

  if (alternateName) node.alternateName = alternateName
  if (repo) node.codeRepository = repo
  if (featureList.length) node.featureList = featureList
  if (keywords.length) node.keywords = keywords.join(', ')
  if (downloadUrl) node.downloadUrl = downloadUrl
  if (installUrl) node.installUrl = installUrl
  if (softwareHelp) node.softwareHelp = { '@type': 'CreativeWork', url: softwareHelp }
  if (requirements) node.softwareRequirements = requirements
  if (inLanguage.length) node.inLanguage = inLanguage
  if (license) node.license = license

  // An explicit list wins; a bare `price` stays supported so the
  // callers that only ever had one number keep working.
  if (Array.isArray(offers) && offers.length) {
    node.offers = offers.map(offer => ({
      '@type': 'Offer',
      name: offer.name,
      price: String(offer.price),
      priceCurrency: offer.currency || currency,
      availability: 'https://schema.org/InStock',
      url: absoluteUrl(offer.url || path)
    }))
  } else if (price != null) {
    node.offers = {
      '@type': 'Offer',
      price: String(price),
      priceCurrency: currency,
      availability: 'https://schema.org/InStock',
      url: absoluteUrl(path)
    }
  }

  return node
}

// ==========================================
// videoGameLd
// A game, described the way a machine reads one.
//
// This node used to carry a name, a sentence, a URL, a platform
// and a genre list, and that is exactly the amount of information
// that produced the complaint this file was reopened for: a
// crawler could tell the domain mentioned something called Neon
// Katana and could not tell what it was, what was in it, what it
// costs, which languages it speaks, or where it is downloaded
// from. Everything below is a fact the page already renders in
// prose - this is the same fact in the vocabulary a search engine
// indexes rather than the one a person reads.
//
//   alternateName  the game's name in other scripts, from
//                  `altNames` in GAME_REGISTRY. A Persian player
//                  searching "نئون کاتانا" matches nothing without
//                  it, however good the rest of the node is.
//   featureList    what is IN the game, as short phrases
//   screenshot     the gallery, as absolute URLs
//   video          the trailer, already a VideoObject
//   sameAs         the store listings, which is what ties this
//                  page and the Myket entry into one thing rather
//                  than two pages about a similarly named game
//   offers         free is a price and has to be said as one;
//                  omitting it reads as "price unknown"
//
// Every one of them is omitted rather than emptied when the game
// has nothing to put in it, because an empty array in structured
// data is a claim that the game has no features.
// ==========================================
export function videoGameLd({
  name,
  alternateName = [],
  description,
  path,
  image,
  platform = 'Android',
  platforms = [],
  downloadUrl,
  sameAs = [],
  genres = [],
  featureList = [],
  screenshots = [],
  video,
  keywords = [],
  identifier,
  version,
  lang,
  free = true,
  available = true,
  id
}) {
  const node = {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name,
    description,
    url: absoluteUrl(path),
    gamePlatform: platforms.length ? platforms : platform,
    operatingSystem: platforms.length ? platforms.join(', ') : platform,
    applicationCategory: 'GameApplication',

    // By reference, not by value. Spelling the publisher out
    // in-line - which both callers used to do - mints a SECOND
    // Organization node on the page beside the one seoHead()
    // already emits, and two Organization nodes with the same name
    // and no shared id is the site telling a crawler there are two
    // publishers with one name.
    author: { '@id': absoluteUrl('/#organization') },
    publisher: { '@id': absoluteUrl('/#organization') }
  }

  // A stable id per game, so the node on the dashboard, the node
  // on /games and the node on the game's own page are understood
  // as three mentions of one game rather than three games.
  if (id) node['@id'] = absoluteUrl('/' + id) + '#game'

  if (image) node.image = absoluteUrl(image)

  // The other-script names, plus every Persian encoding of any of
  // them. Done here rather than at the three call sites so a game
  // declaring altNames in Config.js gets all of them on the
  // dashboard, on /games and on its own page without any of those
  // knowing this exists.
  const altAll = [...alternateName, ...persianSpellingVariants(alternateName)]
  if (altAll.length) node.alternateName = altAll
  if (genres.length) node.genre = genres
  if (featureList.length) node.featureList = featureList
  if (keywords.length) node.keywords = keywords.join(', ')
  if (screenshots.length) node.screenshot = screenshots.map(shot => absoluteUrl(shot))
  if (video) node.video = video
  if (identifier) node.identifier = identifier
  if (version) node.softwareVersion = version
  if (lang) node.inLanguage = resolveLang(lang)
  if (sameAs.length) node.sameAs = sameAs

  if (downloadUrl) {
    node.installUrl = downloadUrl
    node.downloadUrl = downloadUrl
  }

  if (free) {
    node.offers = {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      availability: available
        ? 'https://schema.org/InStock'
        : 'https://schema.org/PreOrder',
      url: absoluteUrl(path)
    }
  }

  return node
}


// ==========================================
// videoObjectLd
// A trailer.
//
// A game page that embeds a YouTube frame is, to a crawler, a page
// with an iframe on it. This is the same video said as a fact:
// what it shows, which game it belongs to, and where the thumbnail
// is. YouTube already indexes the video on its own domain - what
// this adds is that the video and this page are about the same
// thing.
//
// `uploadDate` is omitted rather than guessed. Google warns about
// its absence and ignores a wrong one, and inventing today's date
// for a trailer published last year is the kind of fact that
// outlives the page that carried it.
// ==========================================
export function videoObjectLd({ name, description, embedUrl, thumbnail, lang } = {}) {
  if (!name || !embedUrl) return null

  const node = {
    '@type': 'VideoObject',
    name,
    embedUrl,
    publisher: { '@id': absoluteUrl('/#organization') }
  }

  if (description) node.description = description
  if (thumbnail) node.thumbnailUrl = absoluteUrl(thumbnail)
  if (lang) node.inLanguage = resolveLang(lang)
  return node
}


// ==========================================
// webPageLd
// The page itself.
//
// Every page here emitted an Organization and a WebSite and then
// stopped, which left a crawler holding two nodes about the
// PUBLISHER and none at all about the document in front of it. The
// consequence is not subtle: nothing said what the page was about,
// which language these particular bytes were in, or that the
// breadcrumb trail rendered above belonged to this page rather
// than to the site in general.
//
// seoHead() builds this automatically from what it already knows,
// so no page has to remember to pass one. A caller that emits its
// own page-level node - /about has a ProfilePage - opts out with
// `webPage: false` rather than shipping two.
// ==========================================
export function webPageLd({
  path = '/',
  title,
  description,
  lang,
  image,
  type = 'WebPage',
  hasBreadcrumb = false,
  keywords = []
} = {}) {
  const code = resolveLang(lang)
  const bare = String(path || '/').split('?')[0]
  const canonical = absoluteUrl(localizedPath(bare, code))

  const node = {
    '@context': 'https://schema.org',
    '@type': type,

    // The id carries the language, unlike the Person node's. Two
    // translations of one page are two documents with two
    // addresses and two sets of bytes - the hreflang cluster is
    // what says they are versions of each other, and collapsing
    // their ids here would say something stronger and wrong.
    '@id': canonical + '#webpage',
    url: canonical,
    name: title,
    inLanguage: code,
    isPartOf: { '@id': absoluteUrl('/#website') },
    about: { '@id': absoluteUrl('/#organization') }
  }

  if (description) node.description = description
  if (keywords.length) node.keywords = keywords.join(', ')
  if (image) node.primaryImageOfPage = { '@type': 'ImageObject', url: absoluteUrl(image) }

  // Only when the page actually rendered one. A BreadcrumbList is
  // emitted by the caller, so pointing at one that is not on the
  // page would be a dangling reference.
  if (hasBreadcrumb) node.breadcrumb = { '@id': canonical + '#breadcrumb' }

  return node
}


// ==========================================
// itemListLd
// A catalogue, as a list.
//
// /games, /tools and every leaderboard built this inline, three
// times, with three slightly different shapes. One builder means a
// crawler reads the same structure on all of them, and a fourth
// catalogue page cannot invent a fourth shape by accident.
// ==========================================
export function itemListLd({ name, items = [], lang, ordered = false } = {}) {
  const entries = (items || []).filter(item => item && item.name)
  if (!entries.length) return null

  const node = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: entries.length,
    itemListElement: entries.map((item, index) => {
      const element = {
        '@type': 'ListItem',
        position: item.position || index + 1,
        name: item.name
      }
      if (item.url) element.url = absoluteUrl(item.url)
      if (item.description) element.description = item.description
      if (item.image) element.image = absoluteUrl(item.image)
      return element
    })
  }

  if (ordered) node.itemListOrder = 'https://schema.org/ItemListOrderDescending'
  if (lang) node.inLanguage = resolveLang(lang)
  return node
}


// ==========================================
// seoHead
//
// Everything getPageHead() does not already emit. Kept apart on
// purpose: two <meta name="description"> tags on one page is worse
// than none, so the title and the description stay owned by exactly
// one function.
//
//   path        the canonical path for THIS page ("/tools")
//   title       already-plain text; used for og:title
//   description already-plain text; used for og:description
//   lang        the language the page rendered in
//   type        OpenGraph type, "website" by default
//   image       social card path, absolute or site-relative
//   noindex     true for panels, checkout steps and status pages
//   alternates  false to skip hreflang (a page with no ?lang= form)
//   graph       extra JSON-LD nodes, appended after the site nodes
//   siteName    what og:site_name says. Defaults to the brand, and
//               a game's landing page overrides it with the game -
//               see the note on that tag below.
//   keywords    the terms this page is genuinely about, in the
//               language it rendered in. Google has ignored this
//               tag since 2009 and says so out loud; Bing, Yandex
//               and Naver do not, and Naver is not a rounding error
//               for a page that wants to be found in Japanese. It
//               costs one tag. Only ever pass terms the page
//               actually answers - stuffing it is the one way this
//               tag can still hurt.
// ==========================================
export function seoHead({
  path = '/',
  title = 'AmirCollider',
  description = '',
  lang = LANGUAGES.default,
  type = 'website',
  image = DEFAULT_OG_IMAGE,
  noindex = false,
  alternates = true,
  siteNodes = true,
  siteName = 'AmirCollider',
  keywords = [],
  webPage = true,
  pageType = 'WebPage',
  graph = []
} = {}) {
  const code = resolveLang(lang)

  // The canonical is this page's address IN THE LANGUAGE IT IS
  // RENDERING. Callers pass the bare, language-free path they are
  // conceptually at ('/about'); the prefix is added here, once, so
  // no page has to remember to do it.
  //
  // This is what makes the hreflang block below mean something: the
  // three URLs it names are three different canonicals, so a search
  // engine can hold all three and pick per reader, instead of
  // collapsing them into one and picking the language for everyone.
  const bare = String(path || '/').split('?')[0]
  const canonical = absoluteUrl(localizedPath(bare, code))

  const imageUrl = /^https?:\/\//.test(String(image)) ? String(image) : absoluteUrl(image)

  const robots = noindex
    ? '<meta name="robots" content="noindex, nofollow">'
    : '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">'

  // x-default points at the bare path - the default language's own
  // address - because that is the URL a reader with no matching
  // language should be sent to, and it is a real page rather than a
  // redirector.
  const hreflang = alternates && !noindex
    ? LANGUAGES.supported.map(entry =>
        '<link rel="alternate" hreflang="' + entry + '" href="' + escapeHtml(langVariant(bare, entry)) + '">'
      ).join('\n  ') + '\n  <link rel="alternate" hreflang="x-default" href="'
        + escapeHtml(absoluteUrl(localizedPath(bare, LANGUAGES.default))) + '">'
    : ''

  // The page's own subject first, then the brand's terms. Both are
  // present on every page - the pairing is what matters, since
  // "AmirCollider" beside "Unity editor extension" is an
  // association a search engine can learn and either alone is a
  // word it already knows - but the page's own terms are the ones
  // that must survive the cap. See KEYWORD_CAP.
  const terms = keywordList(keywords, brandKeywords(code))

  // ==========================================
  // The graph.
  //
  // Order is site -> page -> whatever the caller passed, which is
  // also the order a reader of the source would want it in. Two
  // things happen here that no caller has to know about:
  //
  //   1. A BreadcrumbList in the caller's graph gets this page's
  //      own `@id` stamped on it, so the WebPage node below can
  //      point at it. Doing it here rather than in breadcrumbLd()
  //      is what keeps all seventeen existing call sites working
  //      unchanged - breadcrumbLd() is handed a trail and does not
  //      know which page it is on.
  //   2. A WebPage node is added unless the caller emits its own
  //      page-level node. See webPageLd().
  // ==========================================
  let hasBreadcrumb = false

  // A copy, not the caller's object. Every caller today builds its
  // graph fresh, so mutating in place would work - right up until
  // somebody passes a node held in a module constant or a frozen
  // config tree, at which point one page throws in production for
  // a reason nothing in this function would suggest.
  const extra = (graph || []).filter(Boolean).map(node => {
    if (node['@type'] !== 'BreadcrumbList') return node
    hasBreadcrumb = true
    return node['@id'] ? node : { ...node, '@id': canonical + '#breadcrumb' }
  })

  const nodes = []
  if (siteNodes && !noindex) nodes.push(organizationLd(code), websiteLd(code))

  if (webPage && !noindex) {
    nodes.push(webPageLd({
      path: bare,
      title,
      description,
      lang: code,
      image,
      type: pageType,
      hasBreadcrumb,
      keywords: terms
    }))
  }

  for (const node of extra) nodes.push(node)

  const localeAlternates = LANGUAGES.supported
    .filter(entry => entry !== code)
    .map(entry => '<meta property="og:locale:alternate" content="' + OG_LOCALE[entry] + '">')
    .join('\n  ')

  const keywordTag = terms.length
    ? '<meta name="keywords" content="' + escapeHtml(terms.join(', ')) + '">'
    : ''

  // ==========================================
  // The tags themselves.
  //
  // Three of them below are new and worth a line each, because
  // none is obvious from its name:
  //
  //   og:image:alt / twitter:image:alt   A share preview is a
  //     place a screen reader has nothing else to read and an
  //     image crawler has nothing else to caption with. Both get
  //     the page's own title rather than the filename.
  //   twitter:site / twitter:creator     Derived from the X URL in
  //     CONFIG.SOCIAL, so the card credits the account the footer
  //     already links to. Omitted entirely when that URL is not
  //     set - a card naming an account nobody owns is worse than
  //     a card naming none.
  //   content-language                   Redundant beside the
  //     canonical, the hreflang cluster and inLanguage on three
  //     JSON-LD nodes, and read anyway by several smaller crawlers
  //     and most link-preview scrapers. It costs one line.
  //
  // The HTML comment that survives into the output is deliberate:
  // it is read by a person viewing source during an OAuth review.
  // ==========================================
  return `
  ${robots}
  <link rel="canonical" href="${escapeHtml(canonical)}">
  ${keywordTag}
  ${hreflang}
  <meta property="og:type" content="${escapeHtml(type)}">
  <!--
    og:site_name is normally the brand, and on every page here it
    is. A game's landing page is the exception, and the reason is
    not OpenGraph: that page is what an OAuth consent screen
    configures as the application's HOME PAGE, and a verification
    review compares the app name on the consent screen with the
    name the home page gives for itself. Machine-readably, that
    name was "AmirCollider" - the publisher - on a page whose
    subject is one game, and the review came back saying the two
    did not match. It says the game now.
  -->
  <meta property="og:site_name" content="${escapeHtml(siteName)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  ${description ? `<meta property="og:description" content="${escapeHtml(description)}">` : ''}
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${escapeHtml(imageUrl)}">
  <meta property="og:image:alt" content="${escapeHtml(title)}">
  <meta property="og:locale" content="${OG_LOCALE[code] || 'en_US'}">
  ${localeAlternates}
  <meta name="twitter:card" content="summary_large_image">
  ${TWITTER_HANDLE ? `<meta name="twitter:site" content="${escapeHtml(TWITTER_HANDLE)}">` : ''}
  ${TWITTER_HANDLE ? `<meta name="twitter:creator" content="${escapeHtml(TWITTER_HANDLE)}">` : ''}
  <meta name="twitter:title" content="${escapeHtml(title)}">
  ${description ? `<meta name="twitter:description" content="${escapeHtml(description)}">` : ''}
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}">
  <meta name="twitter:image:alt" content="${escapeHtml(title)}">
  <meta name="author" content="AmirCollider">
  <meta name="publisher" content="AmirCollider">
  <meta http-equiv="content-language" content="${escapeHtml(code)}">
  ${nodes.map(node => jsonLd(node)).join('\n  ')}
  `
}
