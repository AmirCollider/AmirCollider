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

import { handleAsset } from '../Api/AssetApi.js'

const store = new Map()
const put = (key, body, contentType) => store.set(key, { body, contentType })
put('demo/docsnap/1.0.3/index.html',
    '<html><body><div class="ds-shell"><aside class="ds-sidebar">\n<div class="ds-brand">LOGO</div></aside>'
    + '<main class="ds-main"><h1>Demo</h1></main></div></body></html>', 'text/html; charset=utf-8')
put('demo/docsnap/0.9.0/no-shell.html', '<html><body><p>old</p></body></html>', 'text/html; charset=utf-8')
put('demo/docsnap/1.0.4/index.html', '<html><body><a data-site-back href="#">back</a></body></html>', 'text/html; charset=utf-8')
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

const get = (path, headers = {}) => {
  const url = new URL('https://amircollider.com' + path)
  return handleAsset(url, new Request(url, { headers }), null, 'req', {}, env)
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

r = await get('/assets/demo/docsnap/1.0.4/index.html')
html = await r.text()
ok('an export with its OWN back link is not double-barred',
   html.includes('data-site-back') && !html.includes('Back to the site'), html)

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
ok('a demo image is untouched and still immutable',
   r.headers.get('Content-Type') === 'image/png' && r.headers.get('Cache-Control').includes('immutable'))

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

console.log('\nFAILURES: ' + fails)
process.exit(fails ? 1 : 0)
