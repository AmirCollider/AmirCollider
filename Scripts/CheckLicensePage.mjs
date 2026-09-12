// ==========================================
// Scripts/CheckLicensePage.mjs
// The licence page, in all three languages.
//
//   node Scripts/CheckLicensePage.mjs
//
// This page was English-only until 6.9.1, on a bare white
// document with no site chrome, and the one thing a Pro
// customer opens it for - the place to set a logo and a footer
// line - was a sentence at the bottom. Everything asserted here
// is something that was wrong, or something an edit can quietly
// break again:
//
//   * a complete string pack per language, same shape
//   * the right direction, and no English control leaking
//     into a Persian or Japanese page
//   * every T.<key> the browser script reads is actually SENT
//     to the browser. A missing one is `undefined` in the page
//     and passes every syntax check there is.
//   * every refusal CODE the endpoints behind this page can
//     return has a sentence in all three packs - read out of
//     the source, so adding a new fail() without its three
//     strings fails here rather than in front of a customer
//   * the inline script parses
// ==========================================
import { readFileSync } from 'node:fs'
import { handleLicensePage } from '../Pages/License.js'

let fails = 0
const ok = (n, c, x = '') => { console.log((c ? 'PASS  ' : 'FAIL  ') + n + (c ? '' : '   ' + x)); if (!c) fails++ }

const SRC = readFileSync(new URL('../Pages/License.js', import.meta.url), 'utf8')

const render = async (path, headers = {}) => {
  const url = new URL('https://amircollider.com' + path)
  const res = await handleLicensePage(url, new Request(url, { headers }))
  return { res, html: await res.text() }
}

const strings = (html) => {
  const m = html.match(/<script id="lcStrings" type="application\/json">([\s\S]*?)<\/script>/)
  return m ? JSON.parse(m[1].replace(/\\u003c/g, '<')) : null
}

// ---- every language renders, in its own direction ----
const cases = [
  { path: '/license', lang: 'fa', dir: 'rtl', word: 'لایسنس تو', locale: 'fa-IR' },
  { path: '/license?lang=en', lang: 'en', dir: 'ltr', word: 'Your licence', locale: 'en-GB' },
  { path: '/license?lang=ja', lang: 'ja', dir: 'ltr', word: 'ライセンス', locale: 'ja-JP' }
]

for (const c of cases) {
  const { res, html } = await render(c.path)
  ok(`${c.lang}: renders 200`, res.status === 200, String(res.status))
  ok(`${c.lang}: html lang and dir are right`,
     html.includes(`<html lang="${c.lang}" dir="${c.dir}">`), html.slice(0, 160))
  ok(`${c.lang}: the heading is in that language`, html.includes(c.word))
  ok(`${c.lang}: it is on the site chrome, not a bare document`,
     html.includes('ac-nav') && html.includes('ac-foot'), 'no site header/footer')
  ok(`${c.lang}: there is a breadcrumb back to the product`,
     html.includes('href="/unity-docsnap"'), 'no route back')
  ok(`${c.lang}: it carries the DocSnap violet`, html.includes('#7a52b8'))
  ok(`${c.lang}: it is noindex`, html.includes('noindex'))
  ok(`${c.lang}: nothing unreplaced`,
     !html.includes('undefined<') && !html.includes('[object Object]') && !html.includes('${'))

  // The reason this page exists for somebody holding a Pro key.
  // It was a line of prose and nobody found it.
  ok(`${c.lang}: the brand panel is a card with its own button`,
     html.includes('lc-feature') && html.includes('href="/unity-docsnap/panel"'), 'panel CTA missing')

  const s = strings(html)
  ok(`${c.lang}: the client string block is present`, !!s)
  if (s) {
    ok(`${c.lang}: dates will be written in that language`, s.locale === c.locale, String(s.locale))
    const empty = Object.entries(s.t).filter(([, v]) => !v).map(([k]) => k)
    ok(`${c.lang}: every client string is filled in`, empty.length === 0, empty.join(', '))
  }
}

// ---- a Persian or Japanese reader must not meet English UI ----
for (const lang of ['fa', 'ja']) {
  const { html } = await render('/license' + (lang === 'fa' ? '' : '?lang=' + lang))
  const body = html.slice(html.indexOf('<main'), html.indexOf('</main>'))
  const strays = ['Your licence', 'Licence key<', '>Check<', 'Release<', 'Unnamed machine',
                  "Don't have a key yet", 'Open the brand panel', 'Compare all three']
  const found = strays.filter(s => body.includes(s))
  ok(`${lang}: no English control labels leak into the page`, found.length === 0, found.join(', '))
}

// ---- the packs must be complete and identical in shape ----
{
  const packs = {}
  const at0 = SRC.indexOf('const PAGE_I18N = {')
  const end0 = SRC.indexOf('\n}\n', at0)
  const region = SRC.slice(at0, end0)
  for (const code of ['fa', 'en', 'ja']) {
    const at = region.indexOf(`\n  ${code}: {`)
    const end = region.indexOf('\n  }', at)
    packs[code] = new Set([...region.slice(at, end).matchAll(/^\s{4}(\w+):/gm)].map(m => m[1]))
  }
  for (const code of ['en', 'ja']) {
    const missing = [...packs.fa].filter(k => !packs[code].has(k))
    const extra = [...packs[code]].filter(k => !packs.fa.has(k))
    ok(`${code}: the pack has every key fa has`, missing.length === 0, missing.join(', '))
    ok(`${code}: the pack has no keys fa lacks`, extra.length === 0, extra.join(', '))
  }
  ok('the pack is not a stub', packs.fa.size >= 25, String(packs.fa.size))

  // ---- every T.<key> the browser reads must be SENT to it ----
  // This is the bug class that has escaped `node --check` three
  // times now: a name that exists nowhere, which is only
  // `undefined` at the moment a customer looks at it.
  const script = SRC.slice(SRC.indexOf('function licenseScript()'))
  const used = new Set([...script.matchAll(/\bT\.(\w+)/g)].map(m => m[1]))
  for (const m of script.matchAll(/\bT\['(\w+)'\s*\+\s*\w+\]/g)) { used.add('__dynamic__' + m[1]) }
  const sent = new Set(Object.keys(strings((await render('/license')).html).t))
  const orphan = [...used].filter(k => !k.startsWith('__') && !sent.has(k))
  ok('every string the script reads is sent to the browser', orphan.length === 0, orphan.join(', '))
  const unused = [...sent].filter(k => !used.has(k) && !k.startsWith('err_'))
  ok('nothing is sent to the browser that the script never reads', unused.length === 0, unused.join(', '))
}

// ---- every refusal the endpoints can emit has three sentences ----
// Read out of resolveKeyRequest itself: the two endpoints this
// page calls share it, so a new fail() there without its three
// strings shows a customer T.err_generic - or nothing at all.
{
  const at = SRC.indexOf('async function resolveKeyRequest(')
  const end = SRC.indexOf('\n}\n', at)
  const codes = [...new Set([...SRC.slice(at, end).matchAll(/fail\('(\w+)'/g)].map(m => m[1]))]
  ok('resolveKeyRequest was found and emits codes', codes.length >= 5, codes.join(', '))
  const s = strings((await render('/license')).html)
  const missing = codes.filter(c => !s.t['err_' + c])
  ok('every refusal code has a translated sentence', missing.length === 0, missing.join(', '))
  // ...and the two the fetch layer itself invents.
  ok('the two client-side refusals are there', !!s.t.err_generic && !!s.t.err_network)
}

// ---- the inline script parses ----
for (const lang of ['fa', 'en', 'ja']) {
  const { html } = await render('/license?lang=' + lang)
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1])
  const mine = blocks[blocks.length - 1]
  ok(`${lang}: the inline script parses`, (() => {
    try { new Function(mine); return true } catch (e) { return false }
  })())
}

// ---- layout rules this repository holds everything to ----
{
  const { html } = await render('/license')
  // The PHYSICAL offset is the banned one: it is free in a
  // left-to-right document and scrolls a right-to-left page
  // nearly ten thousand pixels sideways. The shared skip link
  // uses the logical `inset-inline-start` and is correct.
  ok('no PHYSICAL left/right offscreen trick',
     !/(^|[;{\s])(left|right)\s*:\s*-9999px/.test(html),
     (html.match(/(left|right)\s*:\s*-9999px/g) || []).join(', '))
  const css = SRC.slice(SRC.indexOf('function licenseCss()'), SRC.indexOf('function licenseScript()'))
  ok('the page stylesheet uses logical properties, not physical ones',
     !/(margin|padding|border)-(left|right)\s*:/.test(css),
     (css.match(/(margin|padding|border)-(left|right)\s*:/g) || []).join(', '))
  // A machine id and a version number inside a Persian sentence
  // reorder into nonsense without this.
  ok('the device line is bidi-isolated', css.includes('unicode-bidi: plaintext'))
  // A licence key is Latin and must stay Latin whichever way the
  // page runs.
  ok('the key field is forced left-to-right', html.includes('dir="ltr"'))
}

console.log('\nFAILURES: ' + fails)
process.exit(fails ? 1 : 0)
