// ==========================================
// Pages/GameChrome.js
// The frame every player-facing game page sits in.
//
// Public exports:
//   escapeHtml(value)
//   chromeTheme(request) / langHeader(url, lang)
//   chromeCss(accent)
//   chromeHead(options)
//   chromeTop(game, lang, active)
//   chromeFoot(game, lang)
//   page({ ... })            -> a whole document
//
// The tokens match the dashboard's, so a card on the landing
// page and the page it links to are recognisably the same
// surface.
// ==========================================

import { CONFIG } from '../Config.js'
import { getPageHead } from '../Core/DesignSystem.js'
import { escapeHtml, safeColor, accentInk } from '../Core/Html.js'
import { seoHead, breadcrumbLd } from '../Core/Seo.js'
import { localizedPath } from '../Core/Locale.js'
import {
  siteNavCss, siteHeader, siteBreadcrumb, siteFooter, siteBackToTop, siteChromeScript, NAV_I18N
} from '../Core/SiteNav.js'
import { dirFor, langCookieHeader, resolveRequestTheme, parseCookies } from '../Core/RequestContext.js'

const DEFAULT_LANG = 'fa'

const META = {
  fa: { dir: 'rtl', locale: 'fa-IR', label: 'فارسی' },
  en: { dir: 'ltr', locale: 'en-US', label: 'English' },
  ja: { dir: 'ltr', locale: 'ja-JP', label: '日本語' }
}

const NAV = {
  fa: { landing: 'صفحه‌ی بازی', account: 'حساب من', store: 'فروشگاه', board: 'جدول امتیازات',
        versions: 'نسخه‌ها', download: 'دانلود', home: 'همه‌ی بازی‌ها' },
  en: { landing: 'Game', account: 'My account', store: 'Store', board: 'Leaderboard',
        versions: 'Versions', download: 'Download', home: 'All games' },
  ja: { landing: 'ゲーム', account: 'アカウント', store: 'ストア', board: 'ランキング',
        versions: 'バージョン', download: 'ダウンロード', home: 'ゲーム一覧' }
}


/** The visitor's explicit theme choice, or null for auto. */
export function chromeTheme(request) {
  return resolveRequestTheme(parseCookies(request))
}


/** Headers that persist a language picked from the query string. */
export function langHeader(url, lang) {
  return langCookieHeader(url, lang)
}


export function localeFor(lang) {
  return (META[lang] || META[DEFAULT_LANG]).locale
}


/** The game accent, or the site's default when it is not a hex colour. */
export function gameAccent(value) {
  return safeColor(value, '#6c63ff')
}


// ==========================================
// chromeCss
// One stylesheet for all three pages.
// ==========================================
export function chromeCss(accent) {
  return `
    *{margin:0;padding:0;box-sizing:border-box}

    /* Scrollbars are visible, and thin. Hiding them entirely -
       which this file used to do, on <html> and on the nav strip -
       removes the only signal that a page or a strip has more
       content sideways. On a game page with a screenshot gallery
       that is the difference between a gallery and one picture. */
    html{-webkit-text-size-adjust:100%;scrollbar-width:thin;
      scrollbar-color:var(--border) transparent}
    ::-webkit-scrollbar{width:10px;height:10px}
    ::-webkit-scrollbar-track{background:transparent}
    ::-webkit-scrollbar-thumb{background:var(--border);border-radius:10px;
      border:2px solid transparent;background-clip:content-box}

    :root{
      --accent:${gameAccent(accent)};

      /* The text colour that reads on an accent-filled control.
         Measured from the accent rather than assumed - see
         accentInk() above, and the 1.28:1 that motivated it. */
      --on-accent:${accentInk(accent)};
      --brand:#6c63ff;--ok:#4caf50;--warn:#ff9800;--err:#f44336;
      --radius:18px;--maxw:1060px;
      --bg-1:#0b0e16;--bg-2:#141a2e;
      --surface:rgba(255,255,255,.05);--surface-2:rgba(255,255,255,.085);
      --border:rgba(255,255,255,.10);
      --text:rgba(255,255,255,.92);--dim:rgba(255,255,255,.66);

      /* Named once here and used by every page in this chrome.
         The stack has to carry three scripts: Persian, Latin and
         Japanese. Vazirmatn covers the first two and is fetched
         from Google Fonts, which is not reachable from every
         network these pages are opened on - so the fallbacks are
         real faces rather than a bare "sans-serif". */
      --font-ui:'Vazirmatn','Segoe UI',Roboto,-apple-system,BlinkMacSystemFont,
                'Noto Sans JP','Hiragino Sans','Yu Gothic',Meiryo,
                Tahoma,'Iranian Sans',Arial,sans-serif;
      --font-mono:ui-monospace,'JetBrains Mono','Cascadia Mono','SF Mono',
                  Consolas,'Liberation Mono','Courier New',monospace;
      color-scheme:dark;
    }
    @media (prefers-color-scheme:light){
      :root:not([data-theme]){
        --bg-1:#f4f6fb;--bg-2:#e7ecf7;--surface:rgba(255,255,255,.72);--surface-2:#fff;
        --border:rgba(20,22,33,.10);--text:rgba(22,24,33,.92);--dim:rgba(22,24,33,.56);
        color-scheme:light;
      }
    }
    :root[data-theme="light"]{
      --bg-1:#f4f6fb;--bg-2:#e7ecf7;--surface:rgba(255,255,255,.72);--surface-2:#fff;
      --border:rgba(20,22,33,.10);--text:rgba(22,24,33,.92);--dim:rgba(22,24,33,.56);
      color-scheme:light;
    }
    :root[data-theme="dark"]{
      --bg-1:#0b0e16;--bg-2:#141a2e;--surface:rgba(255,255,255,.05);--surface-2:rgba(255,255,255,.085);
      --border:rgba(255,255,255,.10);--text:rgba(255,255,255,.92);--dim:rgba(255,255,255,.58);
      color-scheme:dark;
    }

    body{
      font-family:var(--font-ui);
      min-height:100vh;padding:22px 18px 54px;color:var(--text);line-height:1.75;
      background:
        radial-gradient(1000px 500px at 80% -10%,color-mix(in srgb,var(--accent) 20%,transparent),transparent 60%),
        radial-gradient(820px 440px at 6% 4%,color-mix(in srgb,var(--brand) 14%,transparent),transparent 60%),
        linear-gradient(160deg,var(--bg-1),var(--bg-2));
      background-attachment:fixed;
      -webkit-font-smoothing:antialiased;
    }
    .wrap{max-width:var(--maxw);margin:0 auto}

    /* An unmarked Latin run inside an RTL paragraph is reordered
       by the browser: a version string, a package name or a URL
       comes out with its pieces in an order nobody typed. These
       two rules make each such run resolve on its own. */
    code,kbd,samp,pre,.mono{direction:ltr;unicode-bidi:isolate;text-align:left;
      font-family:var(--font-mono)}
    .num{direction:ltr;unicode-bidi:isolate;font-variant-numeric:tabular-nums}
    bdi,[dir="ltr"],[dir="auto"]{unicode-bidi:isolate}

    :focus-visible{outline:3px solid color-mix(in srgb,var(--accent) 70%,#fff);
      outline-offset:3px;border-radius:8px}
    ::selection{background:color-mix(in srgb,var(--accent) 40%,transparent)}

    .skip{position:absolute;inset-inline-start:-9999px;top:8px;z-index:99;padding:10px 16px;
      border-radius:10px;background:var(--surface-2);border:1px solid var(--border);
      font-weight:700;text-decoration:none;color:var(--text)}
    .skip:focus{inset-inline-start:8px}

    /* ---------- top bar ---------- */
    .gtop{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-block-end:26px}
    .gbrand{display:flex;align-items:center;gap:13px;min-width:0;text-decoration:none;color:var(--text)}
    /* The image covers the box; the emoji sits underneath as the
       fallback for a logo that 404s. Both as flex items would
       split the 50px between them and show half of each. */
    .gbrand-logo{position:relative;width:50px;height:50px;border-radius:15px;flex-shrink:0;display:flex;
      align-items:center;justify-content:center;font-size:1.5em;background:#fff;color:#1a1c24;overflow:hidden;
      border:2px solid color-mix(in srgb,var(--accent) 50%,transparent)}
    .gbrand-logo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
    .gbrand-name{font-weight:800;font-size:1.02em;line-height:1.2}
    .gbrand-sub{font-size:.78em;color:var(--dim)}

    .gnav{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .gnav a{display:inline-flex;align-items:center;gap:7px;padding:9px 14px;border-radius:12px;
      text-decoration:none;font-weight:700;font-size:.84em;color:var(--dim);
      background:var(--surface);border:1px solid var(--border);
      transition:color .18s ease,border-color .18s ease,transform .18s ease}
    .gnav a:hover{color:var(--text);transform:translateY(-2px)}
    .gnav a[aria-current="page"]{color:var(--on-accent);border-color:transparent;
      background:linear-gradient(135deg,var(--accent),color-mix(in srgb,var(--accent) 50%,#fff))}
    .gnav a.is-off{opacity:.45;pointer-events:none}

    .gseg{display:inline-flex;padding:3px;gap:2px;border-radius:12px;background:var(--surface);border:1px solid var(--border)}
    .gseg button{border:0;cursor:pointer;padding:7px 11px;border-radius:9px;font:inherit;font-size:.8em;
      font-weight:700;color:var(--dim);background:transparent}
    .gseg button[aria-pressed="true"]{color:var(--on-accent);background:linear-gradient(135deg,var(--accent),color-mix(in srgb,var(--accent) 50%,#fff))}
    .gicon-btn{width:38px;height:38px;border-radius:11px;cursor:pointer;display:inline-flex;align-items:center;
      justify-content:center;color:var(--text);background:var(--surface);border:1px solid var(--border)}

    /* ---------- generic surfaces ---------- */
    .gcard{padding:24px;border-radius:var(--radius);background:var(--surface);border:1px solid var(--border)}
    .ghead{display:flex;align-items:center;gap:12px;margin:6px 0 18px;font-size:1.25em;font-weight:800}
    .ghead::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,var(--border),transparent)}
    .glede{color:var(--dim);font-size:.92em;line-height:1.7;margin-block-end:18px}

    .gbtn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 20px;
      border:1px solid transparent;border-radius:13px;font:inherit;font-weight:700;font-size:.9em;
      cursor:pointer;text-decoration:none;color:var(--on-accent);
      background:linear-gradient(135deg,var(--accent),color-mix(in srgb,var(--accent) 50%,#fff));
      transition:transform .16s ease,filter .16s ease}
    .gbtn:hover{transform:translateY(-2px);filter:brightness(1.08)}
    .gbtn:disabled,.gbtn[aria-disabled="true"]{opacity:.5;cursor:not-allowed;transform:none;filter:none}
    .gbtn--ghost{color:var(--text);background:var(--surface);border-color:var(--border)}
    .gbtn--wide{width:100%}

    .gnote{padding:13px 16px;border-radius:13px;font-size:.87em;line-height:1.65;
      background:var(--surface);border:1px solid var(--border);border-inline-start:3px solid var(--dim)}
    .gnote.is-ok{border-inline-start-color:var(--ok)}
    .gnote.is-warn{border-inline-start-color:var(--warn)}
    .gnote.is-err{border-inline-start-color:var(--err)}

    .gchip{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:999px;
      font-size:.76em;font-weight:700;color:color-mix(in srgb,var(--accent) 50%,var(--text));
      background:color-mix(in srgb,var(--accent) 14%,transparent);
      border:1px solid color-mix(in srgb,var(--accent) 32%,transparent)}
    .gchip.is-ok{color:var(--ok);background:rgba(76,175,80,.14);border-color:rgba(76,175,80,.4)}
    .gchip.is-warn{color:var(--warn);background:rgba(255,152,0,.14);border-color:rgba(255,152,0,.4)}
    .gchip.is-dim{color:var(--dim);background:var(--surface);border-color:var(--border)}

    /* The game's own row, above the site footer: the four
       addresses that are about THIS game, in the game's accent. */
    .gfoot-game{margin-block-start:40px;display:flex;flex-wrap:wrap;justify-content:center;
      align-items:center;gap:9px;padding:16px 20px;border-radius:var(--radius);
      background:var(--surface);border:1px solid var(--border);color:var(--dim);font-size:.85em}
    .gfoot-game a{color:color-mix(in srgb,var(--accent) 55%,var(--text));text-decoration:none;font-weight:700}
    .gfoot-game a:hover{text-decoration:underline}

    /* Any <footer> a page renders for itself. The site footer opts
       out - it brings its own surface and its own spacing. */
    footer:not(.ac-foot){margin-block-start:40px;text-align:center;padding:24px;border-radius:var(--radius);
      background:var(--surface);border:1px solid var(--border);color:var(--dim);font-size:.85em}
    footer:not(.ac-foot) a{color:color-mix(in srgb,var(--accent) 55%,var(--text));text-decoration:none}

    /* ---- mobile ----
       The nav gained two more links (the game page and its
       versions), which on a phone turned a single row into a
       block four rows tall above every page. It now scrolls
       horizontally as one strip, which is the same gesture the
       tab bars elsewhere use. */
    @media (max-width:720px){
      body{padding:16px 12px 44px}
      .gtop{gap:10px;margin-block-end:18px}
      .gnav{flex-wrap:nowrap;overflow-x:auto;width:100%;
        scrollbar-width:thin;-webkit-overflow-scrolling:touch;padding-block-end:4px}
      .gnav a{flex:0 0 auto;white-space:nowrap;padding:8px 12px}
      .gseg{flex:0 0 auto}
      .gbrand-logo{width:42px;height:42px;border-radius:13px;font-size:1.25em}
      .gcard{padding:18px}
      .gbtn{padding:12px 16px}
    }

    @media (max-width:420px){
      .ghead{font-size:1.08em}
      .gbtn{width:100%}
    }

    @media (prefers-reduced-motion:no-preference){
      .gtop,.gcard,.ghead{animation:gRise .45s cubic-bezier(.16,1,.3,1) both}
      .gcard{animation-delay:.06s}
    }
    @keyframes gRise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}

    ${siteNavCss()}

    /* The site header spans the viewport; the game pages pad their
       own body, so the bar has to pull back out to the edges to
       sit flush rather than floating in a 22px gutter. */
    .ac-nav{margin-inline:-18px;margin-block:-22px 20px;padding-inline:18px}
    @media (max-width:720px){.ac-nav{margin-inline:-12px;margin-block-start:-16px;padding-inline:12px}}
  `
}


// ==========================================
// chromeHead
// The pre-paint theme script plus the shared <head>.
//
// The theme is applied before first paint from localStorage,
// because a page that renders light and then flips to dark
// looks broken on every single load for anybody who chose dark.
// ==========================================
export function chromeHead({ title, description = '', accent, head = '', seo = '' }) {
  const font = 'https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap'

  return `
  ${getPageHead({ title: escapeHtml(title), amirLogo: CONFIG.AMIR_LOGO, description: escapeHtml(description) })}
  ${seo}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="${font}" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="${font}"></noscript>
  ${head}
  <script>
    (function(){try{var t=localStorage.getItem('ac_theme');
      if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();
  </script>
  <style>${chromeCss(accent)}</style>`
}


// ==========================================
// chromeTop
// Logo, game name, and the four places a player can go.
// ==========================================
export function chromeTop(game, lang, active, { downloadable = true } = {}) {
  const nav = NAV[lang] || NAV.fa
  const items = []

  // The game's own front page comes first: it is the page every
  // other one is a sub-page of, and until it existed the brand
  // link in the corner went to the dashboard, which is a
  // different site's front page as far as a player is concerned.
  items.push({ key: 'landing', href: localizedPath(`/${game.id}`, lang), label: nav.landing })

  if (game.capabilities.login) {
    items.push({ key: 'account', href: localizedPath(`/${game.id}/account`, lang), label: nav.account })
  }
  if (game.capabilities.store) {
    items.push({ key: 'store', href: localizedPath(`/${game.id}/store`, lang), label: nav.store })
  }
  if (game.capabilities.leaderboard) {
    items.push({ key: 'board', href: localizedPath(`/${game.id}/leaderboard`, lang), label: nav.board })
  }
  items.push({ key: 'versions', href: localizedPath(`/${game.id}/versions`, lang), label: nav.versions })
  items.push({ key: 'download', href: localizedPath(`/${game.id}/download`, lang), label: nav.download, off: !downloadable })

  const links = items.map(item =>
    `<a href="${escapeHtml(item.href)}"${item.key === active ? ' aria-current="page"' : ''}` +
    `${item.off ? ' class="is-off" aria-disabled="true"' : ''}>${escapeHtml(item.label)}</a>`
  ).join('')

  // The language picker and the theme toggle used to live here as
  // well. They are in the site header now - one set of controls per
  // page, in the same corner on every page, which is the whole
  // point of having a site header.
  return `
    <div class="gtop">
      <a class="gbrand" href="${escapeHtml(localizedPath(`/${game.id}`, lang))}">
        <span class="gbrand-logo">${escapeHtml(game.icon || '🎮')}${game.logo
          ? `<img src="${escapeHtml(game.logo)}" alt="" onerror="this.style.display='none'">` : ''}</span>
        <span>
          <span class="gbrand-name">${escapeHtml(game.name)}</span><br>
          <span class="gbrand-sub">AmirCollider Games</span>
        </span>
      </a>
      <nav class="gnav" aria-label="${escapeHtml(game.name)}">
        ${links}
      </nav>
    </div>`
}


// ==========================================
// chromeFoot
// The site footer, plus the one row that is about this game.
// ==========================================
export function chromeFoot(game, lang, games = []) {
  const nav = NAV[lang] || NAV.fa
  const list = (games && games.length) ? games : [{ id: game.id, name: game.name }]

  return `
    <div class="gfoot-game">
      <a href="${escapeHtml(localizedPath(`/${game.id}`, lang))}">${escapeHtml(game.name)}</a>
      <span aria-hidden="true">&middot;</span>
      <a href="${escapeHtml(localizedPath(`/${game.id}/privacy`, lang))}">${escapeHtml((NAV_I18N[lang] || NAV_I18N.fa).privacy)}</a>
      <span aria-hidden="true">&middot;</span>
      <a href="${escapeHtml(localizedPath(`/${game.id}/terms`, lang))}">${escapeHtml((NAV_I18N[lang] || NAV_I18N.fa).terms)}</a>
      <span aria-hidden="true">&middot;</span>
      <a href="${escapeHtml(localizedPath('/', lang))}">${escapeHtml(nav.home)}</a>
    </div>
    ${siteFooter({ lang, games: list })}`
}


// ==========================================
// chromeScript
//
// Kept as an export because it is part of this module's published
// surface, and now delegates: theme and language moved to
// Core/SiteNav.js when the site header took over both controls.
// Two copies of a theme toggle is one copy too many - the second
// is the one that quietly stops matching the first.
//
// gcToggleTheme / gcSetLang remain as aliases so a page still
// calling them keeps working.
// ==========================================
export function chromeScript() {
  return `<script>
    function gcToggleTheme(){ if (window.acToggleTheme) window.acToggleTheme(); }
    function gcSetLang(code){ if (window.acSetLang) window.acSetLang(code); }
  </script>`
}


// ==========================================
// page
// A whole document, assembled.
// ==========================================
export function page({
  game, lang, theme, title, description = '', active, body,
  script = '', head = '', downloadable = true, skipLabel = '',
  path = '', games = [], seoGraph = [], noindex = false, ogImage = '',
  siteName = '', keywords = [], pageType = 'WebPage'
}) {
  const themeAttr = theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : ''
  const nav = NAV[lang] || NAV.fa
  const site = NAV_I18N[lang] || NAV_I18N.fa
  const canonicalPath = path || `/${game.id}`

  // Home > Games > <this game> > <this section>. The last hop is
  // omitted on the game's own front page, where it would just
  // repeat the entry before it.
  const trail = [
    { href: '/', label: site.home },
    { href: '/games', label: site.games },
    { href: `/${game.id}`, label: game.name }
  ]
  if (active && active !== 'landing') {
    const label = nav[active] || active
    trail.push({ href: canonicalPath, label })
  }

  const seo = seoHead({
    path: canonicalPath,
    title,
    description,
    lang,
    type: 'website',
    noindex,
    image: ogImage || game.logo || CONFIG.AMIR_LOGO,
    // Only the landing page passes this, and only because an OAuth
    // review reads that page as the application's home page. Every
    // other page here is a section of the site and says so.
    ...(siteName ? { siteName } : {}),

    // A game's pages are the ones most likely to be searched for
    // by a name this site does not otherwise contain - the game's
    // Persian or Japanese spelling. Every one of them passes the
    // same list, built once in Pages/GameLanding.js, so the
    // landing page, the store and the board answer the same query
    // rather than only the first of them.
    keywords,
    pageType,
    graph: [breadcrumbLd(trail, lang), ...(seoGraph || [])]
  })

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}" dir="${dirFor(lang)}"${themeAttr}>
<head>
${chromeHead({ title, description, accent: game.color, head, seo })}
</head>
<body>
  ${skipLabel ? `<a class="skip" href="#main">${escapeHtml(skipLabel)}</a>` : ''}
  ${siteHeader({ lang, active: 'games', accent: gameAccent(game.color) })}
  <div class="wrap">
    ${siteBreadcrumb({ lang, trail })}
    ${chromeTop(game, lang, active, { downloadable })}
    <main id="main">
    ${body}
    </main>
    ${chromeFoot(game, lang, games)}
  </div>
  ${siteBackToTop({ lang })}
  ${siteChromeScript()}
  ${chromeScript()}
  ${script}
</body>
</html>`
}
