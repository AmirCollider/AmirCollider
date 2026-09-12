// ==========================================
// Scripts/CheckEveryPage.mjs
// Every GET route on this site, in all three languages,
// rendered through Worker.js itself.
//
//   node Scripts/CheckEveryPage.mjs
//   node Scripts/CheckEveryPage.mjs --verbose
//
// This exists because three separate bugs reached the live
// site that no check in this repository could have caught:
//
//   * `escapeHtml` used and never imported. A ReferenceError
//     at render time. `node --input-type=module --check`
//     passes on it, because it is not a syntax error.
//   * a malformed cookie 500-ing a page, because
//     decodeURIComponent throws on `%` and nobody had put a
//     try around it.
//   * a page that was English in all three languages.
//
// All three are invisible to every static check and obvious
// the moment the handler is actually CALLED. So this calls
// all of them, through the real router - so the canonical
// redirect, the language redirect, the route table and the
// security headers are exercised too - against the fake
// environment in Scripts/FakeEnv.mjs.
//
// The route list is READ OUT OF Worker.js. A route added
// without a thought for Japanese is swept the day it is
// added, with nothing to remember.
// ==========================================
import { readFileSync } from 'node:fs'
import worker from '../Worker.js'
import { CONFIG } from '../Config.js'
import { isLangRoutable } from '../Core/Locale.js'
import { issuePanelCookie } from '../Core/PanelSession.js'
import { makeEnv } from './FakeEnv.mjs'

const VERBOSE = process.argv.includes('--verbose')

// Core/Logging.js writes a structured line per request to the
// console, which is right in production and is fifty pages of
// noise here. Anything that is not one of those lines still
// gets through - a warning the Worker prints is exactly what
// this script is looking for.
const say = console.log.bind(console)
const quiet = (...args) => {
  const first = typeof args[0] === 'string' ? args[0] : ''
  if (first.startsWith('{"level":"INFO"') || first.startsWith('{"level":"DEBUG"')) return
  say(...args)
}
console.log = quiet

let fails = 0
const notes = []
const ok = (n, c, x = '') => {
  if (c && !VERBOSE) return
  console.log((c ? 'PASS  ' : 'FAIL  ') + n + (c ? '' : '   ' + x))
  if (!c) fails++
}
const bad = (n, x) => ok(n, false, x)

// ==========================================
// The routes, read out of the table rather than listed here
// ==========================================
const SRC = readFileSync(new URL('../Worker.js', import.meta.url), 'utf8')
const table = SRC.slice(SRC.indexOf('const ROUTES = ['), SRC.indexOf('\n]\n', SRC.indexOf('const ROUTES = [')))

const routes = []
for (const m of table.matchAll(/\{\s*path:\s*(?:'([^']+)'|CONFIG\.MAIL\.PATH(?:\s*\+\s*'([^']*)')?)\s*,\s*method:\s*'GET'([^}]*)\}/g)) {
  const path = m[1] !== undefined ? m[1] : CONFIG.MAIL.PATH + (m[2] || '')
  routes.push({ path, prefix: /prefix:\s*true/.test(m[3]), dynamic: /dynamic:\s*true/.test(m[3]) })
}

// Prefix routes need a key after the prefix, and what a
// sensible key is differs per route. They have their own
// checks (Scripts/CheckAssetDemoBar.mjs); a bucket miss here
// would only assert that 404 still works.
const SKIP_PREFIX = new Set(['/assets/', '/video/', '/profile/', '/database/get/'])

// One representative game. Sweeping both doubles the run and
// tests the same code with a different registry row; the
// second game is covered by Scripts/CheckBrandCoverage.mjs.
const GAME = 'neon-katana'

const paths = []
for (const route of routes) {
  if (route.prefix) {
    if (SKIP_PREFIX.has(route.path)) continue
    paths.push(route.path + 'x')
    continue
  }
  paths.push(route.path.replace(':gameId', GAME).replace('/:limit', '/10'))
}

// A couple of shapes the table does not name but a visitor
// reaches: the 404 document, and the OAuth entry point with
// nothing behind it.
paths.push('/definitely-not-a-page')

const LANGS = [
  { code: 'fa', dir: 'rtl', prefix: '' },
  { code: 'en', dir: 'ltr', prefix: '/en' },
  { code: 'ja', dir: 'ltr', prefix: '/ja' }
]

const warnings = []
const env = makeEnv({ seed: true, warnings })
for (const w of warnings) { notes.push('migration: ' + w) }

const ctx = { waitUntil: (p) => { if (p && p.catch) p.catch(() => {}) }, passThroughOnException: () => {} }

// ==========================================
// langUrl
// Two shapes, because the site has two.
//
// Most pages live at /en/about: a path segment, so each
// language has its own indexable address. The transactional
// and machine surfaces are listed in NO_LANG_ROUTING and take
// `?lang=` instead - a payment provider holds a success_url
// for the life of an invoice and rewriting it would strand a
// customer returning tomorrow. Asking for the wrong shape
// gets a 301 and sweeps nothing, which is how /license,
// /checkout and /order went unchecked in the first draft of
// this script.
// ==========================================
function langUrl(path, lang) {
  const base = 'https://amircollider.com'
  if (!lang.prefix) return base + path
  if (isLangRoutable(path)) return base + (path === '/' ? lang.prefix : lang.prefix + path)
  return base + path + (path.includes('?') ? '&' : '?') + 'lang=' + lang.code
}

async function fetchPage(path, lang, headers = {}) {
  const url = langUrl(path, lang)
  const request = new Request(url, {
    headers: { 'Accept-Language': lang.code === 'fa' ? 'fa,en;q=0.8' : lang.code, ...headers }
  })
  try {
    const res = await worker.fetch(request, env, ctx)
    const type = res.headers.get('Content-Type') || ''
    const body = res.status === 204 ? '' : await res.text()
    return { res, body, type, url }
  } catch (e) {
    return { error: e, url }
  }
}

const textOf = (html) => {
  const at = html.indexOf('<main')
  const end = html.indexOf('</main>')
  const region = at >= 0 && end > at ? html.slice(at, end) : html
  return region.replace(/<script[\s\S]*?<\/script>/g, ' ')
               .replace(/<style[\s\S]*?<\/style>/g, ' ')
               .replace(/<[^>]+>/g, ' ')
               .replace(/\s+/g, ' ').trim()
}

console.log('Sweeping ' + paths.length + ' GET routes x 3 languages through Worker.fetch\n')

const seen = {}
for (const path of paths) {
  for (const lang of LANGS) {
    const label = `${path} [${lang.code}]`
    const r = await fetchPage(path, lang)

    // ---- 1. it must not throw ----
    // A ReferenceError here is the bug class that has escaped
    // three times. There is no such thing as an acceptable one.
    if (r.error) { bad(label + ': threw', r.error.stack.split('\n').slice(0, 3).join(' | ')); continue }
    ok(label + ': did not throw', true)

    const { res, body, type } = r

    // ---- 2. never a 500 ----
    // CLAUDE.md: "errors degrade ... never a 500". A missing
    // column, an unbound binding and a malformed cookie are all
    // supposed to produce a reduced page.
    ok(label + ': not a server error', res.status < 500,
       res.status + ' ' + body.replace(/\s+/g, ' ').slice(0, 200))

    // A redirect is a legitimate answer; there is no document to
    // look at.
    if (res.status >= 300 && res.status < 400) continue
    if (!type.includes('text/html')) continue
    if (res.status !== 200) continue

    // ---- 3. the document says which language it is ----
    const head = body.slice(0, 400)
    const declared = (head.match(/<html[^>]*\blang="([^"]+)"/) || [])[1]
    const direction = (head.match(/<html[^>]*\bdir="([^"]+)"/) || [])[1]
    ok(label + ': declares the requested language', declared === lang.code, 'got ' + declared)
    ok(label + ': declares the matching direction', direction === lang.dir, 'got ' + direction)

    // ---- 4. nothing unreplaced reached the reader ----
    const leaks = ['undefined<', '>undefined<', '[object Object]', 'NaN<', '${', 'null<']
      .filter(s => body.includes(s))
    ok(label + ': nothing unreplaced in the document', leaks.length === 0, leaks.join(' '))

    // ---- 5. the offscreen trick that scrolls a Persian page ----
    ok(label + ': no physical -9999px',
       !/(^|[;{\s])(left|right)\s*:\s*-9999px/.test(body),
       (body.match(/(left|right)\s*:\s*-9999px/g) || []).join(', '))

    // ---- 6. it is actually a document ----
    ok(label + ': has a title', /<title>[^<]{3,}<\/title>/.test(body), head.slice(0, 120))

    // ---- 7. every inline script parses ----
    // The panels' client halves are template literals inside a
    // .js file. One stray backtick - in a CSS comment, in a
    // regular expression - terminates the template early and
    // ships a page whose script is half a statement. CLAUDE.md
    // §14 describes extracting them by hand, one file at a
    // time; this does it for every page at once, on what the
    // browser is actually sent.
    const scripts = [...body.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*\btype="application)[^>]*>([\s\S]*?)<\/script>/g)]
    scripts.forEach(([, code], i) => {
      if (!code.trim()) return
      let error = null
      try { new Function(code) } catch (e) { error = e.message }
      ok(label + ': inline script ' + (i + 1) + ' of ' + scripts.length + ' parses', !error,
         error + ' :: ' + code.trim().slice(0, 120))
    })

    // ---- 8. every JSON block parses ----
    // Structured data and the panels' string packs both ride in
    // a <script type="application/..."> block. A broken one is
    // silent in the browser: no error, no structured data, and
    // in a panel, no translated strings.
    const json = [...body.matchAll(/<script[^>]*type="application\/(?:ld\+json|json)"[^>]*>([\s\S]*?)<\/script>/g)]
    json.forEach(([, code], i) => {
      let error = null
      try { JSON.parse(code) } catch (e) { error = e.message }
      ok(label + ': JSON block ' + (i + 1) + ' of ' + json.length + ' parses', !error,
         error + ' :: ' + code.trim().slice(0, 120))
    })

    seen[path] = seen[path] || {}
    seen[path][lang.code] = textOf(body)
  }
}

// ==========================================
// The English-only page
// A page whose visible text is byte-identical in Persian and
// English is a page somebody wrote in one language. That was
// true of /license until 6.9.1 and nothing in this repository
// noticed.
//
// Compared on the text of <main> only: the header, the footer
// and the breadcrumb are translated by shared code and would
// mask a page body that is not.
// ==========================================
console.log('')
for (const [path, langs] of Object.entries(seen)) {
  if (!langs.fa || !langs.en) continue
  if (langs.fa.length < 40) continue        // nothing to translate
  ok(path + ': the page body is translated, not English everywhere',
     langs.fa !== langs.en,
     'fa and en render identical text: ' + langs.fa.slice(0, 110))
  if (langs.ja) {
    ok(path + ': Japanese is not a copy of English',
       langs.ja !== langs.en,
       'ja and en render identical text')
  }
}

// ==========================================
// Every POST route, sent nonsense
//
// A GET sweep proves the pages render. It says nothing about
// the thirty endpoints behind them, and those are where an
// unguarded destructure lives: `const { key } = body` on a
// body that parsed to null is a TypeError, and a TypeError in
// a handler is a 500 where "you sent nothing" was the honest
// answer.
//
// Four bodies, because they fail in different places: none at
// all, text that is not JSON, JSON that is not an object, and
// an object with nothing in it. None of them is authorised to
// do anything, so nothing here writes.
// ==========================================
console.log('')
{
  const posts = []
  for (const m of table.matchAll(/\{\s*path:\s*(?:'([^']+)'|CONFIG\.MAIL\.PATH(?:\s*\+\s*'([^']*)')?)\s*,\s*method:\s*'POST'([^}]*)\}/g)) {
    const path = m[1] !== undefined ? m[1] : CONFIG.MAIL.PATH + (m[2] || '')
    posts.push(path.replace(':gameId', GAME))
  }
  console.log('Sending four malformed bodies to each of ' + posts.length + ' POST routes\n')

  const bodies = [
    ['no body at all', undefined],
    ['text that is not JSON', 'not json at all {'],
    ['JSON that is not an object', 'null'],
    ['an empty object', '{}']
  ]

  for (const path of posts) {
    for (const [what, body] of bodies) {
      const url = 'https://amircollider.com' + path
      const label = `POST ${path} (${what})`
      let res, text = ''
      try {
        res = await worker.fetch(new Request(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body
        }), env, ctx)
        text = await res.text()
      } catch (e) {
        bad(label + ': threw', e.stack.split('\n').slice(0, 3).join(' | '))
        continue
      }
      ok(label + ': did not throw', true)
      // 503 is a legitimate answer here and not a fault: this
      // environment has no payment provider key, and CLAUDE.md
      // asks for a reduced feature with a clear message rather
      // than a failure. 500 and 502 are the ones that mean a
      // handler fell over.
      ok(label + ': the handler did not fall over', res.status !== 500 && res.status !== 502,
         res.status + ' ' + text.replace(/\s+/g, ' ').slice(0, 200))
      // A refusal has to say something. A bare 400 with an empty
      // body is a support ticket.
      if (res.status >= 400 && res.status < 500) {
        ok(label + ': the refusal says why', text.length > 10, JSON.stringify(text).slice(0, 80))
      }
    }
  }
}


// ==========================================
// The three panels, signed in
//
// Signed out they render a login form, which is a different
// and much smaller page. What is behind them is where the
// stray backtick is most likely to be: TheGod is 4,300 lines
// and its client half is one template literal, and a template
// that terminates early ships a panel whose script is half a
// statement.
//
// The cookie is minted here with the fake environment's own
// password, so this signs into a panel that exists only in
// this process.
// ==========================================
console.log('')
{
  const panels = [
    { path: '/thegod', name: 'amir_thegod_auth', secret: env.TheGodPassword },
    { path: '/testsite', name: 'amir_testsite_auth', secret: env.TestSitePassword },
    { path: CONFIG.MAIL.PATH, name: 'amir_mail_auth', secret: env.TheEmailPassword }
  ]
  for (const panel of panels) {
    const setCookie = await issuePanelCookie(panel.name, panel.path, panel.secret, 60 * 60 * 1000)
    const cookie = setCookie.split(';')[0]
    for (const lang of LANGS) {
      const label = `${panel.path} signed in [${lang.code}]`
      const r = await fetchPage(panel.path, lang, { Cookie: cookie })
      if (r.error) { bad(label + ': threw', r.error.stack.split('\n').slice(0, 3).join(' | ')); continue }
      ok(label + ': did not throw', true)
      ok(label + ': not a server error', r.res.status < 500,
         r.res.status + ' ' + r.body.replace(/\s+/g, ' ').slice(0, 200))
      ok(label + ': the cookie was accepted', r.res.status === 200 && !/name="password"/.test(r.body),
         r.res.status + ' — still the login form?')
      if (r.res.status !== 200) continue

      const scripts = [...r.body.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*\btype="application)[^>]*>([\s\S]*?)<\/script>/g)]
      ok(label + ': the panel ships its client half', scripts.length > 0, 'no inline script at all')
      scripts.forEach(([, code], i) => {
        if (!code.trim()) return
        let error = null
        try { new Function(code) } catch (e) { error = e.message }
        ok(label + ': inline script ' + (i + 1) + ' parses', !error,
           error + ' :: ' + code.trim().slice(0, 140))
      })
      const leaks = ['undefined<', '[object Object]', '${'].filter(x => r.body.includes(x))
      ok(label + ': nothing unreplaced', leaks.length === 0, leaks.join(' '))
    }
  }
}


// ==========================================
// ...and the panels' APIs still answer a real call
//
// The sweep above proves nothing an endpoint is FOR: it only
// proves it refuses nonsense politely. A guard that refuses
// everything would pass it. So one genuine, authorised,
// read-only call to each panel API, which is what tightening
// the body reader could plausibly have broken.
// ==========================================
console.log('')
{
  const calls = [
    { path: '/thegod/api', name: 'amir_thegod_auth', secret: env.TheGodPassword,
      body: { action: 'overview' }, expect: (d) => !d.error },
    { path: CONFIG.MAIL.PATH + '/api', name: 'amir_mail_auth', secret: env.TheEmailPassword,
      body: { action: 'status' }, expect: (d) => !d.error }
  ]
  for (const call of calls) {
    const setCookie = await issuePanelCookie(call.name, call.path.replace(/\/api$/, ''), call.secret, 60 * 60 * 1000)
    const url = 'https://amircollider.com' + call.path
    const res = await worker.fetch(new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: setCookie.split(';')[0] },
      body: JSON.stringify(call.body)
    }), env, ctx)
    const text = await res.text()
    let data = null
    try { data = JSON.parse(text) } catch { /* reported below */ }
    ok(`POST ${call.path} {${call.body.action}}: answers 200`, res.status === 200,
       res.status + ' ' + text.replace(/\s+/g, ' ').slice(0, 200))
    ok(`POST ${call.path} {${call.body.action}}: answers JSON`, !!data, text.slice(0, 120))
    if (data) {
      ok(`POST ${call.path} {${call.body.action}}: and not an error`, call.expect(data),
         JSON.stringify(data).slice(0, 200))
    }
  }

  // The same call with a body of the four bytes `null` must be
  // refused, not crashed - this is the bug the shared reader was
  // written for, and it is only interesting AFTER the cookie is
  // accepted.
  {
    const setCookie = await issuePanelCookie('amir_thegod_auth', '/thegod', env.TheGodPassword, 60 * 60 * 1000)
    const res = await worker.fetch(new Request('https://amircollider.com/thegod/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: setCookie.split(';')[0] },
      body: 'null'
    }), env, ctx)
    const text = await res.text()
    ok('POST /thegod/api with a body of `null`, authorised, is refused not crashed',
       res.status >= 400 && res.status < 500, res.status + ' ' + text.replace(/\s+/g, ' ').slice(0, 160))
  }
}


// ==========================================
// The page that is written in one language
//
// Comparing fa against en catches a page that was never
// translated at all. It does NOT catch the half-translated
// one: a page whose headings come from a pack and whose body
// comes from a catalogue still differs between languages
// while reading as English to a Persian visitor.
//
// So the second measure is the script the page is actually
// WRITTEN IN. Of every letter in the body of a Persian page,
// what share is Persian? Across this whole site the answer is
// between 0.57 (/metrics, which is mostly numbers and metric
// names) and 1.00. A page rendered from the English pack
// scores near zero, and there is no honest page anywhere near
// the line.
//
// Latin inside a Persian page is normal and expected - the
// brand, the product names, a package id - which is why this
// is a ratio and not a ban.
// ==========================================
const share = (text, re) => {
  const own = (text.match(re) || []).length
  const latin = (text.match(/[A-Za-z]/g) || []).length
  return own / (own + latin || 1)
}
const PERSIAN = /[\u0600-\u06FF]/g
const JAPANESE = /[\u3040-\u30FF\u4E00-\u9FFF]/g

// ==========================================
// englishRun
// The longest run of consecutive Latin words in a page that
// should not be in English.
//
// The ratio above misses the half-translated page: /tools
// rendered from the English pack still scores 0.76 Persian,
// because its tool cards come from a catalogue and are
// translated correctly. A SENTENCE, though, is unmistakable.
//
// Measured across every page of this site, the longest honest
// run is seven words - a line of C# on the DirectTMP page.
// Product names, a package id and a policy's proper name are
// two to six. Ten is a sentence somebody wrote in English and
// left on a page that is not.
// ==========================================
const WORD = /^[A-Za-z][A-Za-z'\u2019.,:;!?()\-]*$/
function englishRun(text) {
  const words = text.split(' ')
  let best = 0, at = 0, run = 0, start = 0
  for (let i = 0; i < words.length; i++) {
    if (WORD.test(words[i]) && words[i].length > 1) {
      if (run === 0) { start = i }
      run++
      if (run > best) { best = run; at = start }
    } else {
      run = 0
    }
  }
  return { length: best, text: words.slice(at, at + best).join(' ') }
}

console.log('')
for (const [path, langs] of Object.entries(seen)) {
  if (langs.fa && langs.fa.length >= 120) {
    const r = share(langs.fa, PERSIAN)
    ok(path + ': the Persian page is written in Persian', r >= 0.40,
       'only ' + r.toFixed(2) + ' of its letters are Persian: ' + langs.fa.slice(0, 110))
    const run = englishRun(langs.fa)
    ok(path + ': no English sentence on the Persian page', run.length < 10,
       run.length + ' Latin words in a row: ' + run.text.slice(0, 120))
  }
  if (langs.ja && langs.ja.length >= 120) {
    const r = share(langs.ja, JAPANESE)
    ok(path + ': the Japanese page is written in Japanese', r >= 0.25,
       'only ' + r.toFixed(2) + ' of its letters are Japanese: ' + langs.ja.slice(0, 110))
    const run = englishRun(langs.ja)
    ok(path + ': no English sentence on the Japanese page', run.length < 10,
       run.length + ' Latin words in a row: ' + run.text.slice(0, 120))
  }
}

// ==========================================
// What a cache may do with a page
//
// Every HTML document used to leave with no Cache-Control at
// all, which is not "do not cache" - it is "work it out
// yourself". A browser with no instruction will hand a page back
// on a Back navigation, and the page it hands back can be the
// one written for whoever was signed in before: on a shared
// computer, somebody else's account page after they signed out.
// ==========================================
console.log('')
{
  const header = async (path, cookie) => {
    const r = await fetchPage(path, LANGS[0], cookie ? { Cookie: cookie } : {})
    return { cc: r.res.headers.get('Cache-Control') || '', vary: r.res.headers.get('Vary') || '' }
  }

  // A page written for one reader is never written to disk.
  for (const path of ['/neon-katana/account', '/license', '/checkout', '/order',
                      '/unity-docsnap/panel', '/thegod/login', CONFIG.MAIL.PATH + '/login']) {
    const h = await header(path)
    ok(path + ': is never stored', h.cc === 'no-store', h.cc || '(no header at all)')
    ok(path + ': says it varies by cookie', h.vary.includes('Cookie'), h.vary || '(none)')
  }

  // ...and so is any page at all, once somebody is signed in.
  for (const path of ['/', '/neon-katana', '/neon-katana/leaderboard']) {
    const anon = await header(path)
    ok(path + ': is cacheable for a stranger',
       anon.cc === 'public, max-age=0, must-revalidate', anon.cc || '(no header at all)')
    const signedIn = await header(path, 'ac_player=someones.session')
    ok(path + ': is NOT cacheable for somebody signed in',
       signedIn.cc === 'no-store', signedIn.cc)
  }

  // A handler that made its own decision keeps it.
  {
    const r = await fetchPage('/robots.txt', LANGS[0])
    ok('/robots.txt keeps the header its handler chose',
       (r.res.headers.get('Cache-Control') || '').includes('max-age=3600'),
       String(r.res.headers.get('Cache-Control')))
  }
}


// ==========================================
// The header must not cut a link in half
//
// `.ac-links` was one line with `overflow-x: auto` and the
// scrollbar hidden. On a phone that is right - a thumb swipes
// it. On a laptop it is a trap: "Unity DirectTMP" read "Unity
// Di" at every desktop width, on every page, in Persian and in
// English, and a mouse cannot scroll a horizontal strip that
// shows no scrollbar.
//
// The scroll is now scoped to the phone layout, where the strip
// is its own full-width row. Asserted on the CSS the page
// actually ships, because the failure is invisible to anything
// that only reads the markup.
// ==========================================
console.log('')
{
  const { body } = await fetchPage('/license', LANGS[1])
  const css = body.slice(body.indexOf('.ac-links {'), body.indexOf('.ac-ctl {'))
  ok('the header links wrap rather than clip', /flex-wrap:\s*wrap/.test(css), css.slice(0, 200))
  ok('nothing scrolls them sideways outside the phone layout',
     !/overflow-x:\s*auto/.test(css), css.slice(0, 200))
  const phone = body.slice(body.indexOf('@media (max-width: 900px)'), body.indexOf('@media (max-width: 560px)'))
  ok('the phone layout still gets its swipeable strip',
     /\.ac-links\s*\{[^}]*overflow-x:\s*auto/.test(phone), phone.slice(0, 260))
}


// ==========================================
// The malformed cookie
// One page is enough to prove the guard: parseCookies is
// shared, and it threw for every page that read a cookie.
// ==========================================
console.log('')
for (const cookie of ['ga=100%', 'amir_lang=%E0%A4%A', 'x=%', 'amir_theme=%zz; amir_lang=fa']) {
  const r = await fetchPage('/', LANGS[0], { Cookie: cookie })
  ok('a malformed cookie does not break the front page: ' + cookie,
     !r.error && r.res.status < 500,
     r.error ? r.error.message : String(r.res.status))
}

if (notes.length) {
  console.log('\nNOTES (not failures)')
  for (const n of notes) { console.log('  ' + n) }
}

console.log('\nFAILURES: ' + fails)
process.exit(fails ? 1 : 0)
