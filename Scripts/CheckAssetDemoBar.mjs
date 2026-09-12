// ==========================================
// Scripts/CheckAssetDemoBar.mjs
// The back-to-the-site bar injected into the published
// DocSnap demo, and the things around it that must NOT
// change: image paths untouched, the year-long cache kept
// everywhere except the injected HTML, and safeKey still
// refusing what it was written to refuse.
//
//   node Scripts/CheckAssetDemoBar.mjs
//
// The R2 binding is a Map. Nothing here touches the network
// or the real bucket.
// ==========================================

import { installHtmlRewriterShim } from './HtmlRewriterShim.mjs'
installHtmlRewriterShim()

import { handleAsset } from '../Api/AssetApi.js'

const store = new Map()
const put = (key, body, contentType) => store.set(key, { body, contentType })
const EXPORT_SHELL =
  '<!doctype html>\n<html lang="ja" dir="ltr" data-theme="light" data-skin="cozy" data-export="stamp-1">'
  + '<head></head><body><div class="ds-shell"><aside class="ds-sidebar">\n'
  + '<a class="ds-site-back" data-site-back href="#" hidden><span>old link</span></a>\n'
  + '<div class="ds-brand">LOGO</div></aside>'
  + '<main class="ds-main"><h1>Demo</h1></main></div></body></html>'
put('demo/docsnap/1.0.3/index.html', EXPORT_SHELL, 'text/html; charset=utf-8')
put('demo/docsnap/0.9.0/no-shell.html', '<html><body><p>old</p></body></html>', 'text/html; charset=utf-8')
put('demo/docsnap/1.0.4/index.html',
    '<html><body><aside class="ds-sidebar"></aside><a class="ds-site-back" data-site-back href="#" hidden>back</a></body></html>',
    'text/html; charset=utf-8')
put('demo/docsnap/1.0.3/theme/app.js', 'console.log(1)', null)          // no stored type
put('demo/docsnap/1.0.3/theme/logo.png', 'PNGDATA', 'image/png')
put('contact/2026-01-01/photo.png', 'PNGDATA', 'image/png')             // untouched path

const env = {
  ASSETS: {
    async get(key) {
      const o = store.get(key)
      if (!o) return null
      return {
        body: o.body,
        httpEtag: '"etag"',
        httpMetadata: o.contentType ? { contentType: o.contentType } : {},
        async text() { return o.body }
      }
    }
  }
}

const get = async (path, headers = {}) => {
  const url = new URL('https://amircollider.com' + path)
  const res = await handleAsset(url, new Request(url, { headers }), null, 'req', {}, env)
  return Object.assign(res, { res })
}

let fails = 0
const ok = (n, c, x = '') => { console.log((c ? 'PASS  ' : 'FAIL  ') + n + (c ? '' : '   ' + x)); if (!c) fails++ }

let r = await get('/assets/demo/docsnap/1.0.3/index.html')
let html = await r.text()
ok('the 1.0.3 demo gets a back bar (default language is fa)',
   html.includes('\u0628\u0627\u0632\u06af\u0634\u062a \u0628\u0647 \u0633\u0627\u06cc\u062a') && html.includes('href="/unity-docsnap"'), html.slice(-220))
ok('the bar goes INSIDE the sidebar, not floating over the page',
   html.indexOf('unity-docsnap') > html.indexOf('<aside class="ds-sidebar">')
   && html.indexOf('unity-docsnap') < html.indexOf('<div class="ds-brand">'), html)
ok('it does not use position:fixed any more', !html.includes('position:fixed'), html)
ok('it borrows the export\'s own theme tokens', html.includes('var(--border'), html)
ok('the original content survives', html.includes('<h1>Demo</h1>'))
ok('the injected page is not cached for a year', !r.headers.get('Cache-Control').includes('31536000'), r.headers.get('Cache-Control'))

r = await get('/assets/demo/docsnap/1.0.3/index.html', { 'Accept-Language': 'fa' })
html = await r.text()
ok('Persian gets the Persian label and the unprefixed path',
   html.includes('بازگشت به سایت') && html.includes('href="/unity-docsnap"'), html.slice(-240))
// It sits in the sidebar's flow now, so it needs no positioning at
// all - which is the point. What still matters is that nothing
// physical crept in: a `left` or a `margin-left` on an element that
// renders in both directions is the bug this placement removed.
ok('no physical left/right anywhere in the injected markup',
   !/(^|[;"\s])(left|right|margin-left|margin-right|padding-left|padding-right)\s*:/.test(html), html)
ok('the chevron points back in Persian (right-to-left)', html.includes('\u203A'), html)

r = await get('/assets/demo/docsnap/1.0.4/index.html', { 'Accept-Language': 'en' })
html = await r.text()
ok('the export\'s own back link is removed, not left beside ours',
   !html.includes('data-site-back'), html)
ok('  and exactly one way out remains', (html.match(/unity-docsnap/g) || []).length === 1, html)

r = await get('/assets/demo/docsnap/1.0.3/index.html', { 'Accept-Language': 'en' })
html = await r.text()
ok('English gets the English label and the /en/ path',
   html.includes('Back to the site') && html.includes('href="/en/unity-docsnap"'), html.slice(-220))
ok('the chevron points back in English (left-to-right)', html.includes('\u2039'), html)

r = await get('/assets/demo/docsnap/0.9.0/no-shell.html')
html = await r.text()
ok('an export with no recognised shell still gets a link, before </body>',
   html.includes('unity-docsnap') && html.indexOf('unity-docsnap') < html.indexOf('</body>'), html)

r = await get('/assets/demo/docsnap/1.0.3/theme/app.js')
ok('a js file with no stored type is served as javascript',
   r.headers.get('Content-Type').startsWith('text/javascript'), r.headers.get('Content-Type'))
ok('a non-html demo file is NOT barred', !(await r.text()).includes('Back to the site'))

r = await get('/assets/demo/docsnap/1.0.3/theme/logo.png')
ok('a demo image is served untouched', r.headers.get('Content-Type') === 'image/png')

// ---- the cache header that caused three of the bug reports ----
//
// The demo is overwritten in place at the same addresses on every
// re-export, so "immutable" was a promise the site could not keep:
// readers held theme/app.js and theme/style.css from a year-long
// cache and mixed them with fresh HTML. The version badge read
// 1.0.1 on a 1.0.4 export, the theme flipped between pages, and
// the back link was missing because the cached script predated it.
{
  const demoPaths = [
    '/assets/demo/docsnap/1.0.3/index.html',
    '/assets/demo/docsnap/1.0.3/theme/app.js',
    '/assets/demo/docsnap/1.0.3/theme/logo.png'
  ]
  for (const path of demoPaths) {
    const res = (await get(path)).res
    const cc = res.headers.get('Cache-Control') || ''
    ok(`demo revalidates: ${path.split('/').pop()}`, cc.includes('must-revalidate') && !cc.includes('immutable'), cc)
    ok(`  and carries a validator`, !!res.headers.get('ETag'), 'no ETag')
  }

  // A non-demo asset is genuinely write-once and keeps its year.
  const other = (await get('/assets/contact/2026-01-01/photo.png')).res
  ok('a dated upload is still immutable', (other.headers.get('Cache-Control') || '').includes('immutable'))

  // Revalidation has to actually save the body, or it is just a
  // slower way of sending the same bytes.
  const first = (await get('/assets/demo/docsnap/1.0.3/theme/app.js')).res
  const tag = first.headers.get('ETag')
  const second = (await get('/assets/demo/docsnap/1.0.3/theme/app.js', { 'If-None-Match': tag })).res
  ok('an unchanged demo file answers 304', second.status === 304, String(second.status))
  ok('  with no body', (await second.text()) === '')

  // And a personalised page must not be handed to the wrong reader.
  const page = (await get('/assets/demo/docsnap/1.0.3/index.html?home=https://amircollider.com/x')).res
  ok('an injected page says it varies by cookie', (page.headers.get('Vary') || '').includes('Cookie'), page.headers.get('Vary'))
  ok('  and is private, not shared', (page.headers.get('Cache-Control') || '').includes('private'))
  const faTag = page.headers.get('ETag')
  const enPage = (await get('/assets/demo/docsnap/1.0.3/index.html?home=https://amircollider.com/x', { 'Accept-Language': 'en' })).res
  ok('  and a different language is a different validator', faTag !== enPage.headers.get('ETag'), faTag)
}

// ---- the demo opens the way the reader was reading the site ----
{
  const entry = '/assets/demo/docsnap/1.0.3/index.html?home=https://amircollider.com/unity-docsnap'
  let h = await (await get(entry, { Cookie: 'lang=fa; theme=dark' })).res.text()
  ok('entering the demo adopts the site language', /<html[^>]*lang="fa"/.test(h), h.slice(0, 140))
  ok('  and its direction', /<html[^>]*dir="rtl"/.test(h), h.slice(0, 140))
  ok('  and its theme', /<html[^>]*data-theme="dark"/.test(h), h.slice(0, 140))
  ok('  and leaves the rest of the tag alone', /data-skin="cozy"/.test(h) && /data-export="stamp-1"/.test(h), h.slice(0, 200))

  h = await (await get(entry, { Cookie: 'lang=en; theme=light' })).res.text()
  ok('a different reader gets their own', /lang="en"/.test(h) && /dir="ltr"/.test(h) && /data-theme="light"/.test(h), h.slice(0, 140))

  // Inside the demo there is no ?home=, and the reader gets the
  // same page anyway. Adopting on arrival ALONE was the second
  // half of the theme-flipping report: the first click fetched a
  // page nobody had touched.
  h = await (await get('/assets/demo/docsnap/1.0.3/index.html', { Cookie: 'lang=fa; theme=dark' })).res.text()
  ok('a page reached by clicking inside the demo gets it too',
     /<html[^>]*lang="fa"/.test(h) && /<html[^>]*data-theme="dark"/.test(h), h.slice(0, 200))
  ok('  and the way out is still there', h.includes('unity-docsnap'))
}

r = await get('/assets/contact/2026-01-01/photo.png')
ok('a path outside the demo prefix is untouched',
   r.status === 200 && r.headers.get('Cache-Control').includes('immutable'))

// %2e%2e is decoded and collapsed by the URL parser itself, before any
// of this code runs, so what reaches the handler is the flattened key
// "demo/etc/passwd" - a perfectly ordinary R2 key that simply is not in
// the bucket. There is no filesystem behind R2 to escape to, so a 404 is
// the right answer and not a miss. The form that DOES survive to safeKey
// is the one below, with an encoded separator.
r = await get('/assets/demo/docsnap/%2e%2e/%2e%2e/etc/passwd')
ok('an encoded traversal reaches nothing (404, key not in bucket)', r.status === 404, String(r.status))
r = await get('/assets/demo%2fdocsnap%2f..%2fsecret.html')
ok('an encoded separator plus .. is refused', r.status === 400, String(r.status))
r = await get('/assets//demo/docsnap/x.html')
ok('an empty segment is refused', r.status === 400, String(r.status))

r = await get('/assets/demo/docsnap/9.9.9/missing.html')
ok('a missing file is still a 404', r.status === 404, String(r.status))

// ---- the feature must never be able to 500 the asset route ----
//
// Before the back bar existed, /assets/ did one thing: hand R2's
// stream to the client. It could not fail in a way that produced a
// 500. A read, a parse and a string splice added three ways it
// could, and the live site found one of them within an hour: the
// demo answered "An unexpected error occurred", which is the whole
// demo gone because of a decoration on it.
//
// Each case below breaks the injection in a different place and
// asserts the reader still gets the page.
{
  const HTML = '<html><body><aside class="ds-sidebar"></aside></body></html>'
  const brokenEnvs = {
    'text() throws': {
      async get() {
        return { body: HTML, httpEtag: '"e"', httpMetadata: { contentType: 'text/html' },
                 async text() { throw new Error('stream exploded') } }
      }
    },
    'text() returns nothing': {
      async get() {
        return { body: HTML, httpEtag: '"e"', httpMetadata: { contentType: 'text/html' },
                 async text() { return null } }
      }
    },
    'the object claims to be enormous': {
      async get() {
        return { body: HTML, size: 99 * 1024 * 1024, httpEtag: '"e"',
                 httpMetadata: { contentType: 'text/html' }, async text() { return HTML } }
      }
    }
  }

  for (const [name, ASSETS] of Object.entries(brokenEnvs)) {
    const u = new URL('https://amircollider.com/assets/demo/docsnap/1.0.3/index.html')
    let res, body = ''
    try {
      res = await handleAsset(u, new Request(u), null, 'req', {}, { ASSETS })
      body = await res.text()
    } catch (e) {
      res = { status: 'THREW: ' + e.message }
    }
    ok(`fails open when ${name}`, res.status === 200, String(res.status))
    ok(`  and the reader still gets the page`, body.includes('ds-sidebar'), body.slice(0, 80))
  }
}

// ---- the cookie that took the demo down ----
//
// This is what the live 500 was. decodeURIComponent throws URIError
// on a malformed percent sequence, and parseCookies called it
// unguarded. Any cookie on the domain is in that header - an
// analytics value like "ga=100%", something an extension wrote,
// something set three years ago - and one stray '%' was enough.
//
// /assets/ had never parsed cookies before the back bar needed the
// reader's language, which is why this surfaced there first and
// nowhere else. The guard is in parseCookies, so every page is
// covered, not just this route.
{
  const HTML = '<html><body><aside class="ds-sidebar"></aside></body></html>'
  const ASSETS = {
    async get() {
      return { body: HTML, httpEtag: '"e"', httpMetadata: { contentType: 'text/html' }, async text() { return HTML } }
    }
  }
  const poison = ['ga=100%', 'x=%2', 'y=%E0%A4%A', 'z=%%', 'ok=fine; lang=fa; bad=50%']
  for (const cookie of poison) {
    const u = new URL('https://amircollider.com/assets/demo/docsnap/1.0.3/index.html')
    let res, body = ''
    try {
      res = await handleAsset(u, new Request(u, { headers: { Cookie: cookie } }), null, 'req', {}, { ASSETS })
      body = await res.text()
    } catch (e) {
      res = { status: 'THREW: ' + e.name }
    }
    ok(`a cookie of "${cookie}" does not break the demo`, res.status === 200, String(res.status))
    ok(`  and the bar is still added`, body.includes('unity-docsnap'), body.slice(0, 80))
  }
}

// ==========================================
// The reader's language and theme, on EVERY page of the demo
//
// Carrying them onto the page the reader ARRIVES at and no
// further was the second half of the theme-flipping report: the
// first click inside the demo fetched a page nobody had
// rewritten, and a dark Persian demo turned into a light English
// one.
//
// What makes this delicate is that the export decides its own
// appearance in two places that must agree - the attributes on
// the html element, which its pre-paint script reads, and two
// constants baked into the body, which app.js reads to write the
// marker that same script checks. Rewrite one and not the other
// and the marker can never match: every choice the reader makes
// with the demo's own switchers is discarded on the next click.
//
// So the invariant asserted here is not "the attribute was
// changed". It is "the attribute and the constant say the same
// thing", on every page, with and without ?home=.
// ==========================================
{
  const shell = (lang, theme) =>
    `<!doctype html>\n<html lang="${lang}" dir="ltr" data-theme="${theme}" data-skin="lite" data-export="stamp-9">`
    + '<head></head><body><div class="ds-shell"><aside class="ds-sidebar"></aside>'
    + '<main class="ds-main"><h1>Demo</h1></main></div>'
    + '<script>window.__DOCSNAP_PREFIX__="";'
    + 'window.__DOCSNAP_LANG__="en";'
    + 'window.__DOCSNAP_LANGS__=["en","ja","fa"];'
    + 'window.__DOCSNAP_RTL__=["fa"];'
    + 'window.__DOCSNAP_THEME__="light";'
    + 'window.__DOCSNAP_SKIN__="lite";'
    + 'window.__DOCSNAP_EXPORT__="stamp-9";</script>'
    + '</body></html>'

  put('demo/docsnap/1.0.4/index.html', shell('en', 'light'), 'text/html; charset=utf-8')
  put('demo/docsnap/1.0.4/files.html', shell('en', 'light'), 'text/html; charset=utf-8')
  // A page from a version that predates the language registry.
  put('demo/docsnap/0.8.0/old.html',
      '<html lang="en" data-theme="light"><body><aside class="ds-sidebar"></aside></body></html>',
      'text/html; charset=utf-8')

  const attr = (html, name) => (html.match(new RegExp('<html[^>]*\\b' + name + '="([^"]*)"')) || [])[1]
  const global = (html, name) => (html.match(new RegExp('window\\.' + name + '\\s*=\\s*"([^"]*)"')) || [])[1]

  for (const [label, path] of [['the page the reader arrives at', '/assets/demo/docsnap/1.0.4/index.html?home=/unity-docsnap'],
                               ['a page they click through to', '/assets/demo/docsnap/1.0.4/files.html']]) {
    const r = await get(path, { Cookie: 'lang=fa; theme=dark' })
    const html = await r.text()
    ok(label + ': takes the site language', attr(html, 'lang') === 'fa', String(attr(html, 'lang')))
    ok(label + ': takes the direction with it', attr(html, 'dir') === 'rtl', String(attr(html, 'dir')))
    ok(label + ': takes the site theme', attr(html, 'data-theme') === 'dark', String(attr(html, 'data-theme')))
    // THE invariant, and the reason the injected script exists at
    // all. The export reads its appearance from two places that
    // must agree: its pre-paint script reads the attributes on
    // the html element, app.js reads the two baked constants and
    // writes the marker that same script checks. Change one and
    // not the other and the marker can never match, and every
    // choice the reader makes with the demo's OWN switchers is
    // thrown away on their next click.
    //
    // The markup is no longer rewritten for this - the page is
    // streamed, so nothing reads it - and a script at the end of
    // the body sets the two constants instead. What is asserted
    // is therefore: the script is there, it carries the same
    // values as the tag, and it is positioned where it wins.
    const injected = html.slice(html.lastIndexOf('<script>(function(){'))
    ok(label + ': the preference script is injected', injected.startsWith('<script>(function(){'), 'not found')
    ok(label + ': it carries the same language as the tag',
       injected.includes('var w="' + attr(html, 'lang') + '"'), injected.slice(0, 90))
    ok(label + ': it carries the same theme as the tag',
       injected.includes(',t="' + attr(html, 'data-theme') + '"'), injected.slice(0, 90))
    ok(label + ': it runs AFTER the export writes its own constants',
       html.lastIndexOf('<script>(function(){') > html.indexOf('window.__DOCSNAP_EXPORT__'),
       'injected too early - the export would overwrite it')
    ok(label + ': it is not deferred, so it runs before app.js',
       !/<script[^>]+defer[^>]*>\(function\(\)\{/.test(html))

    // Nothing in the export's own markup is touched any more.
    ok(label + ': the export stamp is left alone', html.includes('"stamp-9"'))
    ok(label + ': the language registry is left alone',
       html.includes('window.__DOCSNAP_LANGS__=["en","ja","fa"]'), 'the array constant was rewritten')
    ok(label + ': the skin is left alone', global(html, '__DOCSNAP_SKIN__') === 'lite')
    ok(label + ': the export\'s own constants are not rewritten',
       global(html, '__DOCSNAP_LANG__') === 'en' && global(html, '__DOCSNAP_THEME__') === 'light',
       'the markup was edited after all')
  }

  // Two pages of one visit must come out identical, or the marker
  // the export checks changes under the reader mid-demo.
  {
    const a = await (await get('/assets/demo/docsnap/1.0.4/index.html', { Cookie: 'lang=ja; theme=light' })).text()
    const b = await (await get('/assets/demo/docsnap/1.0.4/files.html', { Cookie: 'lang=ja; theme=light' })).text()
    ok('both pages of a visit agree on the language',
       attr(a, 'lang') === attr(b, 'lang') && attr(a, 'lang') === 'ja')
    ok('both pages of a visit agree on the theme',
       attr(a, 'data-theme') === attr(b, 'data-theme') && attr(a, 'data-theme') === 'light')
  }

  // No theme cookie means the reader has expressed no preference.
  // Inventing one here would override the export's own default
  // for no reason.
  {
    const html = await (await get('/assets/demo/docsnap/1.0.4/index.html', { Cookie: 'lang=fa' })).text()
    ok('with no theme cookie the export keeps its own theme', attr(html, 'data-theme') === 'light',
       String(attr(html, 'data-theme')))
    ok('  and the constant keeps it too', global(html, '__DOCSNAP_THEME__') === 'light',
       String(global(html, '__DOCSNAP_THEME__')))
    ok('  while the language is still adopted', attr(html, 'lang') === 'fa', String(attr(html, 'lang')))
  }

  // A language this export does not carry must not be forced onto
  // it - every visible string would stay English with the
  // document claiming otherwise. Only the PAGE knows which
  // languages its export has, so the check moved into the
  // injected script, which puts the export's own language back.
  {
    put('demo/docsnap/1.0.4/en-only.html',
        shell('en', 'light').replace('["en","ja","fa"]', '["en"]'),
        'text/html; charset=utf-8')
    const html = await (await get('/assets/demo/docsnap/1.0.4/en-only.html', { Cookie: 'lang=fa; theme=dark' })).text()
    const injected = html.slice(html.lastIndexOf('<script>(function(){'))
    ok('the injected script checks the export\'s own language list',
       injected.includes('window.__DOCSNAP_LANGS__') && injected.includes('indexOf(w)<0'), injected.slice(0, 120))
    ok('  and puts the export\'s own language back when it has to',
       injected.includes('d.setAttribute("lang",baked)'), injected.slice(0, 160))
    ok('  the theme is still adopted', attr(html, 'data-theme') === 'dark', String(attr(html, 'data-theme')))
    ok('  and the bar is still in the reader\'s language',
       html.includes('\u0628\u0627\u0632\u06af\u0634\u062a \u0628\u0647 \u0633\u0627\u06cc\u062a'), 'bar not in Persian')
  }

  // An older export with no constants at all must still work.
  {
    const r = await get('/assets/demo/docsnap/0.8.0/old.html', { Cookie: 'lang=fa; theme=dark' })
    const html = await r.text()
    ok('a page with no baked constants still gets the tag rewritten', attr(html, 'lang') === 'fa', String(attr(html, 'lang')))
    // The injected script is written for an export that HAS
    // those constants and is harmless on one that does not: it
    // assigns two globals nothing will read. What it must not do
    // is throw, which would take the rest of the page's scripts
    // with it.
    ok('  the injected script is still there and cannot throw',
       html.includes('window.__DOCSNAP_LANGS__') && html.includes('||[]'), html.slice(-200))
    ok('  and it still gets a way back to the site', html.includes('unity-docsnap'))
  }

  // The validator has to move with the body, or a reader
  // revalidates their way into the page built for the language
  // they had yesterday.
  {
    const one = await get('/assets/demo/docsnap/1.0.4/index.html', { Cookie: 'lang=fa; theme=dark' })
    const two = await get('/assets/demo/docsnap/1.0.4/index.html', { Cookie: 'lang=ja; theme=light' })
    ok('the ETag differs between two readers', one.headers.get('ETag') !== two.headers.get('ETag'),
       one.headers.get('ETag'))
    const again = await get('/assets/demo/docsnap/1.0.4/index.html',
                            { Cookie: 'lang=fa; theme=dark', 'If-None-Match': one.headers.get('ETag') })
    ok('the same reader gets a 304', again.status === 304, String(again.status))
    ok('and the answer still says it varies by cookie',
       (one.headers.get('Vary') || '').includes('Cookie'), String(one.headers.get('Vary')))
  }
}


// ==========================================
// `immutable` means the address can never hold other bytes
//
// It is a promise to every cache between here and the reader
// that they need never ask again for a year, and it was being
// made about addresses somebody uploads over: the site logo, a
// screenshot a landing page points at. Replacing one of those is
// the whole point of replacing it, and a year of `immutable`
// means nobody who already loaded it ever sees the new one.
//
// A date in the key is what makes the promise true - an
// attachment is written once under a dated prefix with a UUID
// for a name and can never be written again.
// ==========================================
{
  put('contact/2026-09-11/9f3c0000.png', 'PNGDATA', 'image/png')
  put('mail/2026-09-11/2b710000.jpg', 'JPGDATA', 'image/jpeg')
  put('AmirColliderLogo.png', 'PNGDATA', 'image/png')
  put('screens/neon-hero.png', 'PNGDATA', 'image/png')

  const cc = async (path) => (await get(path)).headers.get('Cache-Control')

  for (const key of ['contact/2026-09-11/9f3c0000.png', 'mail/2026-09-11/2b710000.jpg']) {
    const header = await cc('/assets/' + key)
    ok(key + ': a dated, uuid-named attachment keeps the year',
       header === 'public, max-age=31536000, immutable', String(header))
  }

  for (const key of ['AmirColliderLogo.png', 'screens/neon-hero.png']) {
    const header = await cc('/assets/' + key)
    ok(key + ': an address somebody uploads over does NOT promise a year',
       header === 'public, max-age=3600, must-revalidate', String(header))
  }

  // Cheap to be right: it still revalidates rather than
  // re-downloading.
  {
    const first = await get('/assets/AmirColliderLogo.png')
    const again = await get('/assets/AmirColliderLogo.png', { 'If-None-Match': first.headers.get('ETag') })
    ok('and a replaceable asset still answers 304 when unchanged', again.status === 304, String(again.status))
  }
}


// ==========================================
// The page that is too big — the bug this was rewritten for
//
// This used to read the whole page into a string to add a link
// to it, with a 4 MB cap above which it gave up and served the
// export untouched. A DocSnap Assets page listing a real Unity
// project - every file, with its import settings, its shader
// properties, its Prefab contents - is megabytes of HTML.
//
// So on that ONE page the reader got an export nobody had
// touched: its own baked theme instead of theirs, and no way
// back to the site. Every other page in the same demo behaved,
// which is exactly what made it look like a caching fault and
// not a size limit.
//
// HTMLRewriter streams, so there is no page too large. The
// fixture below is deliberately past the old cap.
// ==========================================
{
  const rows = []
  for (let i = 0; i < 60000; i++) {
    rows.push('<li class="ds-file"><span>Assets/Art/Textures/tex_' + i + '.png</span>'
      + '<span>2048x2048 · sRGB · mipmaps</span></li>')
  }
  const huge = '<!doctype html>\n<html lang="en" dir="ltr" data-theme="light" data-skin="lite" data-export="stamp-big">'
    + '<head></head><body><div class="ds-shell"><aside class="ds-sidebar"></aside>'
    + '<main class="ds-main"><ul>' + rows.join('') + '</ul></main></div>'
    + '<script>window.__DOCSNAP_LANG__="en";window.__DOCSNAP_LANGS__=["en","ja","fa"];'
    + 'window.__DOCSNAP_THEME__="light";window.__DOCSNAP_EXPORT__="stamp-big";<\/script>'
    + '</body></html>'

  put('demo/docsnap/1.0.4/assets/Assets.html', huge, 'text/html; charset=utf-8')
  ok('the fixture is past the cap that used to give up',
     huge.length > 4 * 1024 * 1024, (huge.length / 1024 / 1024).toFixed(1) + ' MB')

  const r = await get('/assets/demo/docsnap/1.0.4/assets/Assets.html', { Cookie: 'lang=fa; theme=dark' })
  const html = await r.text()
  ok('a multi-megabyte Assets page still answers 200', r.status === 200, String(r.status))
  ok('  and takes the reader\'s language', /<html[^>]*lang="fa"/.test(html), html.slice(0, 160))
  ok('  and their direction', /<html[^>]*dir="rtl"/.test(html), html.slice(0, 160))
  ok('  and their theme - this is the one that was reported',
     /<html[^>]*data-theme="dark"/.test(html), html.slice(0, 160))
  ok('  and gets a way back to the site',
     html.includes('\u0628\u0627\u0632\u06af\u0634\u062a \u0628\u0647 \u0633\u0627\u06cc\u062a'), 'no bar')
  ok('  and the preference script', html.includes('var w="fa",t="dark"'), html.slice(-260))
  ok('  and every one of its rows survived intact',
     html.includes('tex_0.png') && html.includes('tex_59999.png')
     && html.split('ds-file').length - 1 === 60000, 'rows lost in the rewrite')
  ok('  and it is still cached per reader', (r.headers.get('Vary') || '').includes('Cookie'),
     String(r.headers.get('Vary')))
}


// ==========================================
// A runtime with no HTMLRewriter still serves the demo
//
// It is part of the Workers runtime and will be there. What must
// never happen is that its absence - or any failure setting the
// rewrite up - turns a demo page into a 500. A page nobody could
// rewrite is still a page; a page nobody could serve is a broken
// link on the product page.
// ==========================================
{
  const real = globalThis.HTMLRewriter
  delete globalThis.HTMLRewriter
  const r = await get('/assets/demo/docsnap/1.0.4/index.html', { Cookie: 'lang=fa; theme=dark' })
  const html = await r.text()
  globalThis.HTMLRewriter = real

  ok('with no HTMLRewriter the page is still served', r.status === 200, String(r.status))
  ok('  untouched rather than half-rewritten',
     html.includes('<h1>Demo</h1>') || html.includes('ds-sidebar'), html.slice(0, 120))
  ok('  and it is not a 500', r.status !== 500)
}


console.log('\nFAILURES: ' + fails)
process.exit(fails ? 1 : 0)
