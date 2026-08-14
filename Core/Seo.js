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

// The name the site is searched for, in every spelling somebody
// actually types it in. "AmirCollider" is one word and always has
// been, but half the people looking for it type two - and a search
// engine will not split a compound word on your behalf unless you
// tell it the split form is the same name.
const ALSO_KNOWN_AS = ['Amir Collider', 'AmirCollider Games', 'amircollider']


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
    sameAs: SAME_AS
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
    inLanguage: code,
    publisher: { '@id': absoluteUrl('/#organization') }
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
    alternateName: ['Amir Collider', 'amircollider'],
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

/** A game. `downloadUrl` is the store link players actually use. */
export function videoGameLd({ name, description, path, image, platform = 'Android', downloadUrl, genres = [] }) {
  const node = {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name,
    description,
    url: absoluteUrl(path),
    gamePlatform: platform,
    operatingSystem: platform,
    applicationCategory: 'GameApplication',
    author: { '@id': absoluteUrl('/#organization') },
    publisher: { '@id': absoluteUrl('/#organization') }
  }
  if (image) node.image = absoluteUrl(image)
  if (genres.length) node.genre = genres
  if (downloadUrl) node.installUrl = downloadUrl
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

  const nodes = []
  if (siteNodes && !noindex) nodes.push(organizationLd(code), websiteLd(code))
  for (const node of graph || []) if (node) nodes.push(node)

  const localeAlternates = LANGUAGES.supported
    .filter(entry => entry !== code)
    .map(entry => '<meta property="og:locale:alternate" content="' + OG_LOCALE[entry] + '">')
    .join('\n  ')

  const keywordTag = keywords && keywords.length
    ? '<meta name="keywords" content="' + escapeHtml(keywords.join(', ')) + '">'
    : ''

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
  <meta property="og:locale" content="${OG_LOCALE[code] || 'en_US'}">
  ${localeAlternates}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  ${description ? `<meta name="twitter:description" content="${escapeHtml(description)}">` : ''}
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}">
  <meta name="author" content="AmirCollider">
  ${nodes.map(node => jsonLd(node)).join('\n  ')}
  `
}
