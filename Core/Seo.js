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
//   breadcrumbLd(trail)              from a SiteNav trail array
//   softwareApplicationLd({...})     a Unity tool
//   videoGameLd({...})               a game
//
// Callers pass plain text; everything is escaped here.
// ==========================================

import { CONFIG, LANGUAGES } from '../Config.js'
import { escapeHtml } from './Html.js'
import { resolveLang } from './RequestContext.js'


const OG_LOCALE = { fa: 'fa_IR', en: 'en_US', ja: 'ja_JP' }

// The social card. A page may override it; this is what the rest
// of the site shares when it does not.
const DEFAULT_OG_IMAGE = '/assets/AmirColliderLogo.png'

const GITHUB_ORG = 'https://github.com/AmirCollider'


/** The canonical origin, without a trailing slash. */
export function siteOrigin() {
  return String(CONFIG.SITE_URL || '').replace(/\/+$/, '')
}

/** An absolute URL on the canonical origin. */
export function absoluteUrl(path = '/') {
  const suffix = String(path || '/')
  return siteOrigin() + (suffix.startsWith('/') ? suffix : '/' + suffix)
}

/** The same path carrying an explicit ?lang=, for hreflang. */
function langVariant(path, code) {
  const [bare, query = ''] = String(path || '/').split('?')
  const params = new URLSearchParams(query)
  params.set('lang', code)
  return absoluteUrl(bare + '?' + params.toString())
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
export function organizationLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': absoluteUrl('/#organization'),
    name: 'AmirCollider',
    alternateName: ['Amir Collider', 'AmirCollider Games'],
    url: absoluteUrl('/'),
    logo: absoluteUrl(CONFIG.AMIR_LOGO),
    email: CONFIG.SUPPORT_EMAIL,
    sameAs: [GITHUB_ORG]
  }
}

export function websiteLd(lang) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': absoluteUrl('/#website'),
    name: 'AmirCollider',
    alternateName: 'AmirCollider Games',
    url: absoluteUrl('/'),
    inLanguage: resolveLang(lang),
    publisher: { '@id': absoluteUrl('/#organization') }
  }
}

/** BreadcrumbList from the same trail SiteNav renders. */
export function breadcrumbLd(trail = []) {
  if (!trail || trail.length === 0) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      item: absoluteUrl(item.href || '/')
    }))
  }
}

/**
 * A Unity editor extension.
 *
 * `offers` is omitted for a tool with no price rather than sent as
 * zero: a free MIT package and a package that happens to cost
 * nothing today are different claims, and only one of them is true.
 */
export function softwareApplicationLd({ name, description, path, version, price, currency = 'USD', operatingSystem = 'Windows, macOS, Linux', repo }) {
  const node = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name,
    description,
    url: absoluteUrl(path),
    applicationCategory: 'DeveloperApplication',
    applicationSubCategory: 'Unity Editor Extension',
    operatingSystem,
    softwareVersion: version,
    author: { '@id': absoluteUrl('/#organization') },
    publisher: { '@id': absoluteUrl('/#organization') }
  }
  if (repo) node.codeRepository = repo
  if (price != null) {
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
  graph = []
} = {}) {
  const code = resolveLang(lang)
  const canonical = absoluteUrl(path)
  const imageUrl = /^https?:\/\//.test(String(image)) ? String(image) : absoluteUrl(image)

  const robots = noindex
    ? '<meta name="robots" content="noindex, nofollow">'
    : '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">'

  const hreflang = alternates && !noindex
    ? LANGUAGES.supported.map(entry =>
        '<link rel="alternate" hreflang="' + entry + '" href="' + escapeHtml(langVariant(path, entry)) + '">'
      ).join('\n  ') + '\n  <link rel="alternate" hreflang="x-default" href="' + escapeHtml(canonical) + '">'
    : ''

  const nodes = []
  if (siteNodes && !noindex) nodes.push(organizationLd(), websiteLd(code))
  for (const node of graph || []) if (node) nodes.push(node)

  const localeAlternates = LANGUAGES.supported
    .filter(entry => entry !== code)
    .map(entry => '<meta property="og:locale:alternate" content="' + OG_LOCALE[entry] + '">')
    .join('\n  ')

  return `
  ${robots}
  <link rel="canonical" href="${escapeHtml(canonical)}">
  ${hreflang}
  <meta property="og:type" content="${escapeHtml(type)}">
  <meta property="og:site_name" content="AmirCollider">
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
