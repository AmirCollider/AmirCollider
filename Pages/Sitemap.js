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
import { localizedPath, isLangRoutable } from '../Core/Locale.js'


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
    { loc: '/', priority: '1.0', changefreq: 'weekly', image: CONFIG.AMIR_LOGO, title: 'AmirCollider' },
    { loc: '/about', priority: '0.9', changefreq: 'monthly', image: CONFIG.AMIR_LOGO, title: 'AmirCollider' },
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

    // The game's own logo travels with its landing page. An image
    // a crawler finds in a sitemap next to the page it belongs to
    // is an image it can attribute; the same file discovered by
    // parsing an <img> tag is a file on a CDN. For a game whose
    // whole identity is one piece of key art, that is the
    // difference between the art appearing beside the search
    // result and not.
    paths.push({
      loc: '/' + game.id,
      priority: '0.9',
      changefreq: 'weekly',
      image: game.logo,
      title: game.name
    })

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
  // ==========================================
  // The per-game pages a crawler should skip.
  //
  // Generated from the registry rather than listed, for the same
  // reason the sitemap is: a game added in Config.js has to be
  // covered on the next deploy without anybody editing a second
  // list, and a per-game page missed here is a thin duplicate of
  // the same page under another game's name.
  //
  //   /account  needs a signed-in player. To a crawler it is a
  //             sign-in prompt, and one per game.
  //   /health   /ping   diagnostics. Both already render noindex,
  //             and both are worth not spending a crawl on at all
  //             - a status endpoint fetched on a schedule is the
  //             kind of URL a crawler decides to fetch often.
  //
  // The DOWNLOAD endpoint is deliberately NOT here. It redirects
  // to the store listing, and a crawler that follows it is a
  // crawler learning that this page and that listing are about one
  // game - which is exactly the association `sameAs` in the
  // structured data is also trying to make.
  // ==========================================
  const perGame = Object.values(GAMES || {})
    .filter(game => game && game.id)
    .flatMap(game => [
      '/' + game.id + '/account',
      '/' + game.id + '/health',
      '/' + game.id + '/ping',

      // The leaderboard's second form. /:gameId/leaderboard/:limit
      // is a route, so /neon-katana/leaderboard/5, /6, /7 and every
      // integer after it are real pages that render. Each declares
      // the bare board as its canonical, so none of them can be
      // indexed - but a crawler has to FETCH a URL to read its
      // canonical, and an unbounded family of them is an unbounded
      // amount of crawling spent to learn nothing. The trailing
      // slash is what draws the line: the board itself stays
      // crawlable and stays in the sitemap.
      '/' + game.id + '/leaderboard/'
    ])

  // ==========================================
  // Every disallowed path, once per language it can appear under.
  //
  // This is the bug that a first pass at this file could not see,
  // because it is invisible from inside robots.txt: the rules are
  // plain path prefixes, and half this site's URLs carry a
  // language prefix in front of that path. "Disallow: /donate/"
  // does not match "/en/donate/thanks". Neither did any of the
  // per-game rules above match "/en/neon-katana/account" - which
  // is a real page, rendering a sign-in prompt, once per game per
  // language.
  //
  // Only lang-routable paths are expanded. The panels, the
  // checkout, the machine API and robots.txt itself are in
  // NO_LANG_ROUTING (Core/Locale.js) and exist at exactly one
  // address, so expanding those would emit rules for URLs that
  // 301 away - noise in a file whose whole value is being read
  // literally.
  // ==========================================
  const prefixes = LANGUAGES.supported.filter(code => code !== LANGUAGES.default)

  const expand = path => isLangRoutable(path)
    ? [path, ...prefixes.map(code => '/' + code + path)]
    : [path]

  const disallow = [...DISALLOW, ...perGame].flatMap(expand)

  const lines = [
    'User-agent: *',
    ...disallow.map(path => 'Disallow: ' + path),

    // Said out loud rather than left to the default. Nothing above
    // disallows the asset prefix, so an image crawler was already
    // free to fetch it - but Googlebot-Image reads this file
    // looking for a rule about itself, and an explicit Allow is
    // the difference between "not forbidden" and "invited".
    'Allow: /assets/',
    'Allow: /icon.svg',
    'Allow: /favicon.ico',
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
  // A constant, not today. See the note on CONFIG.SITEMAP_LASTMOD:
  // a sitemap that reports every page as having changed today, and
  // again tomorrow, is a sitemap whose dates a crawler stops
  // reading - on the pages where the date was real as well.
  const lastmod = CONFIG.SITEMAP_LASTMOD

  const entries = indexablePaths(GAMES).flatMap(entry => {
    const alternates = LANGUAGES.supported.map(code =>
      '    <xhtml:link rel="alternate" hreflang="' + code + '" href="'
      + xmlEscape(absoluteUrl(localizedPath(entry.loc, code))) + '"/>'
    ).join('\n')

    const xDefault = '    <xhtml:link rel="alternate" hreflang="x-default" href="'
      + xmlEscape(absoluteUrl(localizedPath(entry.loc, LANGUAGES.default))) + '"/>'

    // The page's own key art, if it has any. Emitted per language
    // entry rather than once, because each language entry is its
    // own URL and an image element belongs to the URL it is inside
    // - a crawler reading the Japanese entry has no way to reach
    // an image declared on the Persian one.
    const image = entry.image
      ? [
          '    <image:image>',
          '      <image:loc>' + xmlEscape(absoluteUrl(entry.image)) + '</image:loc>',
          entry.title ? '      <image:title>' + xmlEscape(entry.title) + '</image:title>' : '',
          '    </image:image>'
        ].filter(Boolean).join('\n')
      : ''

    return LANGUAGES.supported.map(code => [
      '  <url>',
      '    <loc>' + xmlEscape(absoluteUrl(localizedPath(entry.loc, code))) + '</loc>',
      alternates,
      xDefault,
      '    <lastmod>' + lastmod + '</lastmod>',
      '    <changefreq>' + entry.changefreq + '</changefreq>',
      '    <priority>' + entry.priority + '</priority>',
      image,
      '  </url>'
    ].filter(Boolean).join('\n'))
  }).join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
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
