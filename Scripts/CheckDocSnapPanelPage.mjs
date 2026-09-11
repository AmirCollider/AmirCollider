// ==========================================
// Scripts/CheckDocSnapPanelPage.mjs
// The brand panel's PAGE, in all three languages.
//
//   node Scripts/CheckDocSnapPanelPage.mjs
//
// Renders it server-side the way CLAUDE.md §14 item 3
// describes, and asserts the things that are easy to lose in
// an edit and invisible until somebody switches language: a
// complete string pack, the right direction, no English
// leaking onto a Persian page, and an inline script that
// actually parses.
// ==========================================
import { handleDocSnapPanel } from '../Pages/DocSnapPanel.js'

let fails = 0
const ok = (n, c, x = '') => { console.log((c ? 'PASS  ' : 'FAIL  ') + n + (c ? '' : '   ' + x)); if (!c) fails++ }

const render = async (path, headers = {}) => {
  const url = new URL('https://amircollider.com' + path)
  const res = await handleDocSnapPanel(url, new Request(url, { headers }))
  return { res, html: await res.text() }
}

// ---- every language renders, in its own direction ----
const cases = [
  { path: '/unity-docsnap/panel', lang: 'fa', dir: 'rtl', word: 'پنل برند', crumb: 'پنل برند' },
  { path: '/unity-docsnap/panel?lang=en', lang: 'en', dir: 'ltr', word: 'Brand panel', crumb: 'Brand panel' },
  { path: '/unity-docsnap/panel?lang=ja', lang: 'ja', dir: 'ltr', word: 'ブランドパネル', crumb: 'ブランドパネル' }
]

for (const c of cases) {
  const { res, html } = await render(c.path)
  ok(`${c.lang}: renders 200`, res.status === 200, String(res.status))
  ok(`${c.lang}: html lang and dir are right`,
     html.includes(`<html lang="${c.lang}" dir="${c.dir}">`), html.slice(0, 200))
  ok(`${c.lang}: the heading is in that language`, html.includes(c.word))
  ok(`${c.lang}: it is on the site chrome, not bare`,
     html.includes('ac-nav') || html.includes('<header'), 'no site header found')
  ok(`${c.lang}: it carries the DocSnap violet`, html.includes('#7a52b8'))
  ok(`${c.lang}: it is noindex`, html.includes('noindex'))
  ok(`${c.lang}: nothing unreplaced`, !html.includes('undefined<') && !html.includes('[object Object]'))
}

// ---- a Persian reader must not meet English UI ----
{
  const { html } = await render('/unity-docsnap/panel')
  const body = html.slice(html.indexOf('<main'), html.indexOf('</main>'))
  const strays = ['Save</button>', 'Download brand file', 'New profile', 'Nothing locked', 'Licence key<']
  ok('fa: no English control labels leak into the page',
     !strays.some(s => body.includes(s)), strays.filter(s => body.includes(s)).join(', '))
}

// ---- the string packs must be complete and identical in shape ----
{
  const src = await import('node:fs').then(fs => fs.readFileSync(new URL('../Pages/DocSnapPanel.js', import.meta.url), 'utf8'))
  const packs = {}
  for (const code of ['fa', 'en', 'ja']) {
    const at = src.indexOf(`\n  ${code}: {`)
    const end = src.indexOf('\n  }', at)
    packs[code] = new Set([...src.slice(at, end).matchAll(/^\s{4}(\w+):/gm)].map(m => m[1]))
  }
  for (const code of ['en', 'ja']) {
    const missing = [...packs.fa].filter(k => !packs[code].has(k))
    const extra = [...packs[code]].filter(k => !packs.fa.has(k))
    ok(`${code}: the pack has every key fa has`, missing.length === 0, missing.join(', '))
    ok(`${code}: the pack has no keys fa lacks`, extra.length === 0, extra.join(', '))
  }
  ok('every pack has at least 50 strings', packs.fa.size >= 50, String(packs.fa.size))
}

// ---- the browser half must get its strings, and parse ----
for (const code of ['fa', 'en', 'ja']) {
  const { html } = await render('/unity-docsnap/panel?lang=' + code)
  const json = html.match(/<script id="dpStrings" type="application\/json">([\s\S]*?)<\/script>/)
  ok(`${code}: the client string block is present`, !!json)
  if (json) {
    const parsed = JSON.parse(json[1].replace(/\\u003c/g, '<'))
    const empties = Object.entries(parsed.t).filter(([, v]) => !v).map(([k]) => k)
    ok(`${code}: every client string is filled in`, empties.length === 0, empties.join(', '))
    ok(`${code}: the refusal sentences are there`, !!parsed.t.err_unknown_key && !!parsed.t.err_needs_pro)
  }
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1])
  const mine = blocks[blocks.length - 1]
  ok(`${code}: the inline script parses`, (() => {
    try { new Function(mine); return true } catch { return false }
  })())
}

// ---- layout rules this repository holds everything to ----
{
  const { html } = await render('/unity-docsnap/panel')
  // The PHYSICAL form is the banned one: `left: -9999px` is free in a
  // left-to-right document and scrolls a right-to-left page nearly ten
  // thousand pixels sideways, because that edge is the inline END
  // there. The shared skip link uses `inset-inline-start`, which lands
  // off the inline start in both directions and is correct - CLAUDE.md
  // names it as the one exception, so the check has to tell them apart.
  ok('no PHYSICAL left/right offscreen trick (the logical skip link is fine)',
     !/(^|[;{\s])(left|right)\s*:\s*-9999px/.test(html),
     (html.match(/(left|right)\s*:\s*-9999px/g) || []).join(', '))
  const css = html.slice(html.indexOf('.dp {'), html.indexOf('</style>'))
  ok('the panel stylesheet uses logical properties, not physical ones',
     !/(^|[;{\s])(margin-left|margin-right|padding-left|padding-right|[^-]\bleft|[^-]\bright)\s*:/.test(css),
     (css.match(/(margin|padding)-(left|right)\s*:/g) || []).join(', '))
}

// ---- the native file control must never reach the reader ----
// The browser draws it in the BROWSER's language, always
// left-to-right, so an English "Choose File / No file chosen" used
// to sit backwards in the middle of a Persian page.
for (const code of ['fa', 'en', 'ja']) {
  const { html } = await render('/unity-docsnap/panel?lang=' + code)
  ok(`${code}: the file input is clipped, not shown`, html.includes('class="dp-vh" type="file"'), 'raw file input visible')
  ok(`${code}: it is clipped, not pushed off-screen`, html.includes('clip-path: inset(50%)'))
  ok(`${code}: our own label stands in for it`, /class="dp-btn ghost">[^<]+</.test(html))
}

console.log('\nFAILURES: ' + fails)
process.exit(fails ? 1 : 0)
