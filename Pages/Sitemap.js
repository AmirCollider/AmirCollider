// ==========================================
// Pages/Sitemap.js
// robots.txt and sitemap.xml.
//
// Search Console will ask for both the first time the property is
// added, and without them a crawler has to discover every page by
// following links - which on a site whose pages did not link to
// each other meant most of them were never found at all.
//
// The sitemap is generated from the same registry the site renders
// from, so a game added in Config.js appears here on the next
// deploy without anybody remembering to edit a list.
//
// Public entries
//   handleRobots(url, request, gameId, requestId, GAMES)
//   handleSitemap(url, request, gameId, requestId, GAMES)
// ==========================================

import { CONFIG, LANGUAGES, GAME_STATUS } from '../Config.js'
import { absoluteUrl, siteOrigin } from '../Core/Seo.js'
import { localizedPath } from '../Core/Locale.js'


// Paths a crawler must never index: operator panels, anything that
// takes a credential, the machine API surface, and the checkout -
// where an indexed step is a stale invoice in somebody's results.
const DISALLOW = [
  '/thegod',
  '/testsite',
  '/checkout',
  '/order',
  '/license',
  '/oauth/',
  '/auth/',
  '/database/',
  '/profile/',
  '/games/',
  '/video/',

  // The donation flow's inner steps, not the page itself. The
  // trailing slash is what draws that line: '/donate' is a page
  // with something to say and belongs in the index, '/donate/thanks'
  // is a receipt.
  '/donate/'
]


function xmlEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}


/**
 * Every indexable path, with a crawl priority.
 *
 * A game that is not live is left out entirely rather than listed
 * at a low priority: submitting a page that says "coming soon" is
 * asking to be indexed for a thing that does not exist yet.
 */
export function indexablePaths(games = {}) {
  const paths = [
    { loc: '/', priority: '1.0', changefreq: 'weekly' },
    { loc: '/about', priority: '0.9', changefreq: 'monthly' },
    { loc: '/games', priority: '0.9', changefreq: 'weekly' },
    { loc: '/tools', priority: '0.9', changefreq: 'weekly' },
    { loc: '/unity-docsnap', priority: '0.9', changefreq: 'weekly' },
    { loc: '/unity-directtmp', priority: '0.9', changefreq: 'weekly' },
    { loc: '/donate', priority: '0.6', changefreq: 'monthly' },
    { loc: '/release-notes', priority: '0.6', changefreq: 'weekly' },
    { loc: '/privacy', priority: '0.4', changefreq: 'yearly' },
    { loc: '/terms', priority: '0.4', changefreq: 'yearly' }
  ]

  for (const game of Object.values(games || {})) {
    if (!game || !game.id) continue
    if (game.status === GAME_STATUS.SOON) continue

    paths.push({ loc: '/' + game.id, priority: '0.9', changefreq: 'weekly' })
    paths.push({ loc: '/' + game.id + '/versions', priority: '0.5', changefreq: 'weekly' })
    if (game.capabilities && game.capabilities.leaderboard) {
      paths.push({ loc: '/' + game.id + '/leaderboard', priority: '0.7', changefreq: 'daily' })
    }
    if (game.capabilities && game.capabilities.store) {
      paths.push({ loc: '/' + game.id + '/store', priority: '0.6', changefreq: 'weekly' })
    }
    paths.push({ loc: '/' + game.id + '/privacy', priority: '0.3', changefreq: 'yearly' })
    paths.push({ loc: '/' + game.id + '/terms', priority: '0.3', changefreq: 'yearly' })
  }

  return paths
}


// ==========================================
// robots.txt
// ==========================================
export function handleRobots(url, request, gameId, requestId, GAMES) {
  const lines = [
    'User-agent: *',
    ...DISALLOW.map(path => 'Disallow: ' + path),
    'Allow: /',
    '',
    'Sitemap: ' + absoluteUrl('/sitemap.xml'),
    'Host: ' + siteOrigin().replace(/^https?:\/\//, '')
  ]

  return new Response(lines.join('\n') + '\n', {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  })
}


// ==========================================
// sitemap.xml
//
// Every page appears once PER LANGUAGE, at its own address, and
// each of those entries carries the full set of alternates
// including itself.
//
// It used to list one entry per page - the bare path - with three
// `?lang=` alternates hanging off it. That was the sitemap
// faithfully describing the bug: those three addresses all declared
// the bare path as their canonical, so the cluster named one page
// three times and Google kept the one. The English and Japanese
// versions of this site were never submitted anywhere, which is a
// large part of why they were never indexed.
//
// Reciprocity is the rule an hreflang cluster is validated against:
// if /about names /en/about as its English alternate, /en/about
// must name /about as its Persian one, and both must name
// themselves. Generating all of them from one loop is what makes
// that true by construction rather than by proofreading.
// ==========================================
export function handleSitemap(url, request, gameId, requestId, GAMES) {
  const lastmod = new Date().toISOString().slice(0, 10)

  const entries = indexablePaths(GAMES).flatMap(entry => {
    const alternates = LANGUAGES.supported.map(code =>
      '    <xhtml:link rel="alternate" hreflang="' + code + '" href="'
      + xmlEscape(absoluteUrl(localizedPath(entry.loc, code))) + '"/>'
    ).join('\n')

    const xDefault = '    <xhtml:link rel="alternate" hreflang="x-default" href="'
      + xmlEscape(absoluteUrl(localizedPath(entry.loc, LANGUAGES.default))) + '"/>'

    return LANGUAGES.supported.map(code => [
      '  <url>',
      '    <loc>' + xmlEscape(absoluteUrl(localizedPath(entry.loc, code))) + '</loc>',
      alternates,
      xDefault,
      '    <lastmod>' + lastmod + '</lastmod>',
      '    <changefreq>' + entry.changefreq + '</changefreq>',
      '    <priority>' + entry.priority + '</priority>',
      '  </url>'
    ].join('\n'))
  }).join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries}
</urlset>
`

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Sitemap-Version': CONFIG.VERSION
    }
  })
}
