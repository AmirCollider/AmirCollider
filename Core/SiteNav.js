// ==========================================
// Core/SiteNav.js
// The one navigation surface every page on this site shares.
//
// Before this file existed each page owned its own top bar, and a
// few owned none at all: /tools rendered a brand mark that was not
// a link, /neon-katana/leaderboard had no route back to the game it
// belonged to, and a visitor who landed on a policy page from a
// search result had no way to reach anything else. Five pages, five
// different headers, no footer worth the name - which is what makes
// a site read as five sites.
//
// Exports
//   siteNavCss()                      the stylesheet for header,
//                                     breadcrumbs, footer and the
//                                     back-to-top button
//   siteHeader({ lang, active, ... }) the top bar
//   siteBreadcrumb({ lang, trail })   the trail under the header
//   siteFooter({ lang, games })       the full site footer
//   siteBackToTop({ lang })           the floating scroll-up button
//   siteChromeScript()                theme, language and scroll
//                                     runtime; render it once, last
//   NAV_I18N                          the strings, for callers that
//                                     need one of them inline
//
// Design contract
//   - Every class is prefixed `ac-`, so dropping this into a page
//     that already has `.topbar` / `.brand` / `.seg` rules cannot
//     collide with them.
//   - Colours are read from whatever tokens the host page defines
//     (--surface / --border / --text / --accent ...) with a literal
//     fallback for each, so the chrome themes itself correctly on a
//     page whose stylesheet names things differently.
//   - No physical direction anywhere: the same markup is correct in
//     RTL (fa) and LTR (en/ja).
// ==========================================

import { CONFIG } from '../Config.js'
import { escapeHtml } from './Html.js'
import { resolveLang } from './RequestContext.js'


// ==========================================
// Strings
// ==========================================
export const NAV_I18N = {
  fa: {
    langName: 'فارسی',
    dir: 'rtl',
    brandSub: 'بازی‌ها و ابزارهای یونیتی',
    backToTop: 'بازگشت به بالای صفحه',
    home: 'خانه',
    games: 'بازی‌ها',
    tools: 'ابزارها',
    about: 'درباره‌ی من',
    releaseNotes: 'یادداشت‌های انتشار',
    docsnap: 'Unity DocSnap',
    directtmp: 'Unity DirectTMP',
    metrics: 'متریک‌ها',
    license: 'مدیریت لایسنس',
    orderHelp: 'پیگیری سفارش',
    privacy: 'حریم خصوصی',
    terms: 'شرایط استفاده',
    support: 'پشتیبانی',
    themeToLight: 'حالت روشن',
    themeToDark: 'حالت تاریک',
    menu: 'منو',
    skip: 'رفتن به محتوای اصلی',
    breadcrumb: 'مسیر صفحه',
    colSite: 'سایت',
    colProducts: 'محصولات',
    colLegal: 'قوانین و پشتیبانی',
    tagline: 'بازی‌های اندروید، کامپیوتر و تحت‌وب، به‌همراه افزونه‌های ادیتور یونیتی — ساخته‌ی AmirCollider.',
    poweredBy: 'اجرا شده روی Cloudflare Workers',
    rights: 'همه‌ی حقوق محفوظ است.',
    backToGame: 'بازگشت به صفحه‌ی بازی'
  },
  en: {
    langName: 'English',
    dir: 'ltr',
    brandSub: 'Games & Unity tools',
    backToTop: 'Back to top',
    home: 'Home',
    games: 'Games',
    tools: 'Tools',
    about: 'About',
    releaseNotes: 'Release notes',
    docsnap: 'Unity DocSnap',
    directtmp: 'Unity DirectTMP',
    metrics: 'Metrics',
    license: 'Manage licence',
    orderHelp: 'Order help',
    privacy: 'Privacy',
    terms: 'Terms',
    support: 'Support',
    themeToLight: 'Light mode',
    themeToDark: 'Dark mode',
    menu: 'Menu',
    skip: 'Skip to main content',
    breadcrumb: 'Breadcrumb',
    colSite: 'Site',
    colProducts: 'Products',
    colLegal: 'Legal & support',
    tagline: 'Games for Android, PC and the web, plus Unity editor extensions — built by AmirCollider.',
    poweredBy: 'Powered by Cloudflare Workers',
    rights: 'All rights reserved.',
    backToGame: 'Back to the game page'
  },
  ja: {
    langName: '日本語',
    dir: 'ltr',
    brandSub: 'ゲームと Unity ツール',
    backToTop: 'ページ上部へ戻る',
    home: 'ホーム',
    games: 'ゲーム',
    tools: 'ツール',
    about: '自己紹介',
    releaseNotes: 'リリースノート',
    docsnap: 'Unity DocSnap',
    directtmp: 'Unity DirectTMP',
    metrics: 'メトリクス',
    license: 'ライセンス管理',
    orderHelp: '注文サポート',
    privacy: 'プライバシー',
    terms: '利用規約',
    support: 'サポート',
    themeToLight: 'ライトモード',
    themeToDark: 'ダークモード',
    menu: 'メニュー',
    skip: 'メインコンテンツへ',
    breadcrumb: 'パンくずリスト',
    colSite: 'サイト',
    colProducts: '製品',
    colLegal: '規約とサポート',
    tagline: 'AmirCollider による Android・PC・ウェブ向けゲームと、Unity エディタ拡張。',
    poweredBy: 'Cloudflare Workers で稼働',
    rights: 'All rights reserved.',
    backToGame: 'ゲームページに戻る'
  }
}

function pack(lang) {
  return NAV_I18N[resolveLang(lang)]
}


// ==========================================
// The primary navigation.
//
// Six entries and no more. A header that lists everything is a
// header nobody reads; the long tail lives in the footer, which is
// where a visitor looks for it.
//
// About is the newest of the six and the only one that is not a
// product. It earns the place because it answers the question a
// stranger arrives with - who made this - which nothing else on
// the site did: there was no page about the person behind the
// name at all, so a search for it found the tools and stopped.
// ==========================================
function primaryItems(lang) {
  const p = pack(lang)
  return [
    { key: 'home', href: '/', label: p.home },
    { key: 'games', href: '/#games', label: p.games },
    { key: 'tools', href: '/tools', label: p.tools },
    { key: 'docsnap', href: '/unity-docsnap', label: p.docsnap },
    { key: 'directtmp', href: '/unity-directtmp', label: p.directtmp },
    { key: 'about', href: '/about', label: p.about }
  ]
}


// ==========================================
// Stylesheet
//
// Every colour is `var(--page-token, literal)`: the chrome adopts
// the host page's palette when it has one and still renders
// correctly when it does not.
// ==========================================
export function siteNavCss() {
  return `
    .ac-nav, .ac-crumbs, .ac-foot {
      --acn-fg: var(--text, rgba(255,255,255,0.92));
      --acn-dim: var(--text-dim, var(--dim, rgba(255,255,255,0.58)));
      --acn-surface: var(--surface, rgba(255,255,255,0.05));
      --acn-surface-2: var(--surface-2, rgba(255,255,255,0.09));
      --acn-border: var(--border, rgba(255,255,255,0.12));
      --acn-accent: var(--accent, var(--brand, #6c63ff));
      --acn-bg: var(--bg-1, #0b0e16);
      --acn-radius: 13px;
      --acn-maxw: var(--maxw, 1280px);
      font-family: inherit;
      color: var(--acn-fg);
      box-sizing: border-box;
    }
    .ac-nav *, .ac-crumbs *, .ac-foot * { box-sizing: border-box; }

    /* ---------- skip link ---------- */
    .ac-skip {
      position: absolute; inset-inline-start: -9999px; top: 8px; z-index: 120;
      padding: 10px 18px; border-radius: 10px; font-weight: 700; text-decoration: none;
      background: var(--surface-2, #16192a); color: var(--text, #fff);
      border: 1px solid var(--border, rgba(255,255,255,0.14));
    }
    .ac-skip:focus { inset-inline-start: 12px; }

    /* ---------- header ----------
       No surface of its own, and not sticky. A bar with a filled
       background and a bottom rule reads as a lid on the page; the
       product pages never had one and are the better model. It sits
       at the top of the document and scrolls away with everything
       else, so nothing follows the reader down the page. */
    .ac-nav {
      position: static;
      margin-block-end: 22px;
      background: transparent;
      border: 0;
    }
    /* The bar spans the viewport; its contents line up with the
       page. The inline gutter is the host page's job - it pulls the
       bar out to the edges with a negative margin equal to its own
       body padding and puts that padding back here - so this rule
       adds none of its own and the two always agree. */
    .ac-nav-in {
      max-width: var(--acn-maxw); margin-inline: auto;
      display: flex; align-items: center; gap: 14px;
      padding-block: 10px; min-height: 60px;
    }

    .ac-brand {
      display: inline-flex; align-items: center; gap: 11px;
      text-decoration: none; color: var(--acn-fg); min-width: 0; flex: 0 0 auto;
      border-radius: var(--acn-radius); padding: 4px;
      transition: opacity 0.18s ease;
    }
    .ac-brand:hover { opacity: 0.82; }
    /* A rounded square, and big enough to read. Circular was tried
       and is wrong here: the mark is small at this size to begin
       with, and clipping its corners took away the last of what
       made it legible. The circle belongs to the policy-page
       lockup, where the brand sits beside a game's round logo and
       has room to be one. */
    .ac-brand-logo {
      width: 46px; height: 46px; border-radius: 13px; flex: none; overflow: hidden;
      display: grid; place-items: center;
      background: var(--acn-surface-2); border: 1px solid var(--acn-border);
    }
    .ac-brand-logo img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .ac-brand-text { display: flex; flex-direction: column; line-height: 1.15; min-width: 0; }
    .ac-brand-name { font-weight: 800; font-size: 0.98em; letter-spacing: 0.2px; }
    .ac-brand-sub { font-size: 0.72em; color: var(--acn-dim); white-space: nowrap; }

    .ac-links {
      display: flex; align-items: center; gap: 4px;
      flex: 1 1 auto; min-width: 0; overflow-x: auto;
      scrollbar-width: none; -ms-overflow-style: none;
    }
    .ac-links::-webkit-scrollbar { height: 0; display: none; }
    .ac-links a {
      display: inline-flex; align-items: center; gap: 7px; flex: 0 0 auto;
      padding: 8px 13px; border-radius: 10px; white-space: nowrap;
      text-decoration: none; font-weight: 600; font-size: 0.85em;
      color: var(--acn-dim); border: 1px solid transparent;
      transition: color 0.18s ease, background 0.18s ease, border-color 0.18s ease;
    }
    .ac-links a:hover { color: var(--acn-fg); background: var(--acn-surface); }
    .ac-links a[aria-current="page"] {
      color: var(--acn-fg);
      background: color-mix(in srgb, var(--acn-accent) 16%, transparent);
      border-color: color-mix(in srgb, var(--acn-accent) 38%, transparent);
    }

    .ac-ctl { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
    .ac-seg {
      display: inline-flex; padding: 3px; gap: 2px; border-radius: 11px;
      background: var(--acn-surface); border: 1px solid var(--acn-border);
    }
    .ac-seg button {
      appearance: none; border: 0; cursor: pointer; font: inherit;
      padding: 6px 9px; border-radius: 8px; font-size: 0.74em; font-weight: 800;
      letter-spacing: 0.04em;
      background: transparent; color: var(--acn-dim);
      transition: color 0.18s ease, background 0.18s ease;
    }
    .ac-seg button:hover { color: var(--acn-fg); }
    .ac-seg button[aria-pressed="true"] {
      color: #fff;
      background: linear-gradient(135deg, var(--acn-accent), color-mix(in srgb, var(--acn-accent) 55%, #fff));
    }
    .ac-theme-btn {
      appearance: none; width: 36px; height: 36px; border-radius: 11px; cursor: pointer;
      display: grid; place-items: center; color: var(--acn-fg);
      background: var(--acn-surface); border: 1px solid var(--acn-border);
      transition: background 0.18s ease, transform 0.18s ease;
    }
    .ac-theme-btn:hover { background: var(--acn-surface-2); transform: translateY(-1px); }
    .ac-theme-btn svg { width: 18px; height: 18px; }

    .ac-nav a:focus-visible,
    .ac-nav button:focus-visible,
    .ac-crumbs a:focus-visible,
    .ac-foot a:focus-visible {
      outline: 2px solid var(--acn-accent); outline-offset: 2px; border-radius: 8px;
    }

    /* ---------- breadcrumbs ---------- */
    .ac-crumbs {
      max-width: var(--acn-maxw); margin-inline: auto;
      display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
      margin-block-end: 20px; font-size: 0.82em; color: var(--acn-dim);
    }
    .ac-crumbs a { color: var(--acn-dim); text-decoration: none; }
    .ac-crumbs a:hover { color: var(--acn-fg); text-decoration: underline; }
    .ac-crumbs .ac-crumb-sep { opacity: 0.5; }
    /* Flipped in RTL so the arrow always points the way reading goes. */
    [dir="rtl"] .ac-crumbs .ac-crumb-sep { transform: scaleX(-1); display: inline-block; }
    .ac-crumbs [aria-current="page"] { color: var(--acn-fg); font-weight: 700; }

    /* ---------- footer ---------- */
    .ac-foot {
      max-width: var(--acn-maxw); margin-inline: auto;
      margin-block-start: 46px; padding: 30px 24px 22px;
      border-radius: calc(var(--acn-radius) + 5px);
      background: var(--acn-surface); border: 1px solid var(--acn-border);
    }
    .ac-foot-grid {
      display: grid; gap: 26px;
      grid-template-columns: minmax(220px, 1.4fr) repeat(auto-fit, minmax(150px, 1fr));
    }
    .ac-foot-brand { display: flex; flex-direction: column; gap: 10px; }
    .ac-foot-mark { display: inline-flex; align-items: center; gap: 11px; text-decoration: none; color: var(--acn-fg); }
    .ac-foot-mark img {
      width: 44px; height: 44px; border-radius: 13px; object-fit: cover;
      background: var(--acn-surface-2); border: 1px solid var(--acn-border);
    }
    .ac-foot-mark b { font-size: 1.02em; font-weight: 800; }
    .ac-foot-tagline { color: var(--acn-dim); font-size: 0.86em; line-height: 1.7; max-width: 42ch; }

    .ac-foot-col h2 {
      font-size: 0.78em; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--acn-dim); margin-block-end: 12px; border: 0; padding: 0;
    }
    .ac-foot-col ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    .ac-foot-col a {
      color: var(--acn-fg); opacity: 0.82; text-decoration: none; font-size: 0.87em;
      transition: opacity 0.18s ease, color 0.18s ease;
    }
    .ac-foot-col a:hover { opacity: 1; color: color-mix(in srgb, var(--acn-accent) 55%, var(--acn-fg)); }

    .ac-foot-bottom {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
      gap: 10px; margin-block-start: 26px; padding-block-start: 18px;
      border-block-start: 1px solid var(--acn-border);
      color: var(--acn-dim); font-size: 0.8em;
    }
    .ac-foot-bottom b { color: color-mix(in srgb, var(--acn-accent) 45%, var(--acn-fg)); }
    .ac-foot-bottom .ac-foot-legal { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .ac-foot-bottom .ac-foot-legal a { color: var(--acn-dim); text-decoration: none; }
    .ac-foot-bottom .ac-foot-legal a:hover { color: var(--acn-fg); text-decoration: underline; }

    @media (max-width: 900px) {
      .ac-nav-in { flex-wrap: wrap; gap: 10px; padding-block: 10px; }
      .ac-links { order: 3; width: 100%; padding-block-end: 2px; }
      .ac-ctl { margin-inline-start: auto; }
    }
    @media (max-width: 560px) {
      .ac-brand-sub { display: none; }
      .ac-foot { padding: 24px 18px 18px; }
      .ac-foot-grid { grid-template-columns: 1fr 1fr; }
      .ac-foot-brand { grid-column: 1 / -1; }
    }

    /* ---------- back to top ----------
       Physically bottom-right in both writing directions. A logical
       property would put it bottom-left in Persian, and "bottom
       right" is where a reader of any of these three languages
       reaches for it.

       Hidden until there is something to scroll back from, and
       hidden entirely from assistive tech while it is - a button
       that does nothing yet should not be announced. */
    .ac-top {
      position: fixed; bottom: 22px; right: 22px; z-index: 90;
      width: 46px; height: 46px; border-radius: 50%; cursor: pointer;
      display: grid; place-items: center;
      color: var(--text, #fff);
      background: var(--surface-2, rgba(255,255,255,0.09));
      border: 1px solid var(--border, rgba(255,255,255,0.14));
      box-shadow: 0 10px 26px rgba(0, 0, 0, 0.28);
      backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
      opacity: 0; visibility: hidden; transform: translateY(10px);
      transition: opacity 0.22s ease, transform 0.22s ease, visibility 0.22s;
    }
    .ac-top.is-on { opacity: 1; visibility: visible; transform: translateY(0); }
    .ac-top:hover {
      transform: translateY(-3px);
      border-color: color-mix(in srgb, var(--accent, var(--brand, #6c63ff)) 45%, var(--border, transparent));
      color: color-mix(in srgb, var(--accent, var(--brand, #6c63ff)) 60%, var(--text, #fff));
    }
    .ac-top svg { width: 20px; height: 20px; }
    .ac-top:focus-visible {
      outline: 2px solid var(--accent, var(--brand, #6c63ff)); outline-offset: 3px;
    }
    @media (max-width: 560px) { .ac-top { bottom: 16px; right: 16px; width: 42px; height: 42px; } }

    @media (prefers-reduced-motion: reduce) {
      .ac-nav *, .ac-foot *, .ac-top { transition: none !important; }
    }
  `
}


// ==========================================
// Back-to-top
//
// Markup only; siteChromeScript() wires the behaviour. Rendered
// last in <body> so it is out of the tab order until the content
// has been passed.
// ==========================================
export function siteBackToTop({ lang } = {}) {
  const p = pack(lang)
  return `
    <button type="button" id="acTopBtn" class="ac-top" hidden
            aria-label="${escapeHtml(p.backToTop)}" title="${escapeHtml(p.backToTop)}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>
      </svg>
    </button>`
}


// ==========================================
// Header
//
// `active` is one of the primaryItems keys, or '' on a page that is
// not one of them (a policy page, a checkout step). `extra` takes
// page-specific links - a game's leaderboard puts its own game
// there, so the route back is one click and not a guess.
// ==========================================
export function siteHeader({ lang, active = '', extra = [], accent = '' } = {}) {
  const code = resolveLang(lang)
  const p = pack(code)

  const items = primaryItems(code).concat(
    (extra || []).filter(item => item && item.href && item.label)
  )

  const links = items.map(item =>
    '<a href="' + escapeHtml(item.href) + '"'
    + (item.key && item.key === active ? ' aria-current="page"' : '')
    + '>' + escapeHtml(item.label) + '</a>'
  ).join('')

  // Two-letter codes rather than the language's own name. "فارسی
  // English 日本語" is 200px of a bar that also has to hold five
  // links, and on a page whose content column is 940px wide that
  // was the difference between the last link fitting and being
  // clipped mid-word. The full name is still announced, via the
  // title and the accessible label.
  const segs = ['fa', 'en', 'ja'].map(entry =>
    '<button type="button" data-ac-lang="' + entry + '" lang="' + entry + '"'
    + ' aria-pressed="' + (entry === code ? 'true' : 'false') + '"'
    + ' title="' + escapeHtml(NAV_I18N[entry].langName) + '"'
    + ' aria-label="' + escapeHtml(NAV_I18N[entry].langName) + '"'
    + ' onclick="acSetLang(\'' + entry + '\')">'
    + entry.toUpperCase() + '</button>'
  ).join('')

  const accentStyle = accent ? ' style="--acn-accent: ' + escapeHtml(accent) + '"' : ''

  return `
    <a class="ac-skip" href="#main">${escapeHtml(p.skip)}</a>
    <header class="ac-nav"${accentStyle}>
      <div class="ac-nav-in">
        <a class="ac-brand" href="/" aria-label="AmirCollider">
          <span class="ac-brand-logo">
            <img src="${escapeHtml(CONFIG.AMIR_LOGO)}" alt="" width="46" height="46"
                 onerror="this.style.display='none'">
          </span>
          <span class="ac-brand-text">
            <span class="ac-brand-name">AmirCollider</span>
            <span class="ac-brand-sub">${escapeHtml(p.brandSub)}</span>
          </span>
        </a>
        <nav class="ac-links" aria-label="${escapeHtml(p.menu)}">${links}</nav>
        <div class="ac-ctl">
          <div class="ac-seg" role="group" aria-label="${escapeHtml(p.langName)}">${segs}</div>
          <button type="button" id="acThemeBtn" class="ac-theme-btn" onclick="acToggleTheme()"
                  aria-label="${escapeHtml(p.themeToDark)}"
                  data-to-light="${escapeHtml(p.themeToLight)}"
                  data-to-dark="${escapeHtml(p.themeToDark)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9"/>
              <path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor" stroke="none"/>
            </svg>
          </button>
        </div>
      </div>
    </header>`
}


// ==========================================
// Breadcrumbs
//
// `trail` is [{ href, label }]; the last entry renders as the
// current page and is not a link. The matching BreadcrumbList
// JSON-LD is emitted by Core/Seo.js from the same array.
// ==========================================
export function siteBreadcrumb({ lang, trail = [] } = {}) {
  if (!trail || trail.length === 0) return ''
  const p = pack(lang)

  const parts = trail.map((item, index) => {
    const last = index === trail.length - 1
    const node = last || !item.href
      ? '<span aria-current="page">' + escapeHtml(item.label) + '</span>'
      : '<a href="' + escapeHtml(item.href) + '">' + escapeHtml(item.label) + '</a>'
    const sep = last ? '' : '<span class="ac-crumb-sep" aria-hidden="true">›</span>'
    return node + sep
  }).join('')

  return `<nav class="ac-crumbs" aria-label="${escapeHtml(p.breadcrumb)}">${parts}</nav>`
}


// ==========================================
// Footer
//
// The long tail: every route a visitor might want and none of them
// more than one click away, on every page. `games` is optional -
// when a caller has the games map it is listed by name, and when it
// does not the column simply omits those rows rather than guessing.
// ==========================================
export function siteFooter({ lang, games = [] } = {}) {
  const code = resolveLang(lang)
  const p = pack(code)
  const year = new Date().getUTCFullYear()

  const gameLinks = (games || [])
    .filter(game => game && game.id && game.name)
    .map(game => ({ href: '/' + game.id, label: game.name }))

  const columns = [
    {
      title: p.colSite,
      links: [
        { href: '/', label: p.home },
        { href: '/about', label: p.about },
        { href: '/#games', label: p.games },
        { href: '/tools', label: p.tools },
        { href: '/release-notes', label: p.releaseNotes },
        { href: '/metrics', label: p.metrics }
      ]
    },
    {
      title: p.colProducts,
      links: [
        { href: '/unity-docsnap', label: p.docsnap },
        { href: '/unity-directtmp', label: p.directtmp },
        ...gameLinks
      ]
    },
    {
      title: p.colLegal,
      links: [
        { href: '/privacy', label: p.privacy },
        { href: '/terms', label: p.terms },
        { href: '/license', label: p.license },
        { href: '/order', label: p.orderHelp },
        { href: 'mailto:' + CONFIG.SUPPORT_EMAIL, label: p.support }
      ]
    }
  ]

  const cols = columns.map(column => `
      <div class="ac-foot-col">
        <h2>${escapeHtml(column.title)}</h2>
        <ul>${column.links.map(link =>
          '<li><a href="' + escapeHtml(link.href) + '">' + escapeHtml(link.label) + '</a></li>'
        ).join('')}</ul>
      </div>`).join('')

  return `
    <footer class="ac-foot">
      <div class="ac-foot-grid">
        <div class="ac-foot-brand">
          <a class="ac-foot-mark" href="/">
            <img src="${escapeHtml(CONFIG.AMIR_LOGO)}" alt="" width="44" height="44"
                 onerror="this.style.display='none'">
            <b>AmirCollider</b>
          </a>
          <p class="ac-foot-tagline">${escapeHtml(p.tagline)}</p>
        </div>
        ${cols}
      </div>
      <div class="ac-foot-bottom">
        <span>&copy; ${year} AmirCollider. ${escapeHtml(p.rights)}</span>
        <span class="ac-foot-legal">
          <a href="/privacy">${escapeHtml(p.privacy)}</a>
          <span aria-hidden="true">&middot;</span>
          <a href="/terms">${escapeHtml(p.terms)}</a>
          <span aria-hidden="true">&middot;</span>
          <span>${escapeHtml(p.poweredBy)} &middot; <b>v${escapeHtml(CONFIG.VERSION)}</b></span>
        </span>
      </div>
    </footer>`
}


// ==========================================
// Client runtime
//
// Theme and language, defined once for the whole site. Both are
// idempotent and both are safe to load on a page that also ships
// its own copy: the last definition wins and they behave the same.
//
// Language reloads rather than swapping strings, because the
// document's `dir` is decided by the server and a client-side swap
// would leave an RTL page wearing LTR chrome.
// ==========================================
export function siteChromeScript() {
  return `<script>
    (function () {
      function isDark() {
        return getComputedStyle(document.documentElement).colorScheme.indexOf('dark') !== -1;
      }

      function applyLabel() {
        var btn = document.getElementById('acThemeBtn');
        if (!btn) return;
        var key = isDark() ? 'data-to-light' : 'data-to-dark';
        var label = btn.getAttribute(key);
        if (label) btn.setAttribute('aria-label', label);
      }

      window.acToggleTheme = function () {
        var next = isDark() ? 'light' : 'dark';
        var commit = function () {
          document.documentElement.setAttribute('data-theme', next);
          applyLabel();
        };
        var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (document.startViewTransition && !reduce) document.startViewTransition(commit);
        else commit();
        try { localStorage.setItem('ac_theme', next); } catch (e) {}
        document.cookie = 'theme=' + next + ';path=/;max-age=31536000;samesite=lax';
      };

      window.acSetLang = function (code) {
        try { localStorage.setItem('ac_lang', code); } catch (e) {}
        document.cookie = 'lang=' + code + ';path=/;max-age=31536000;samesite=lax';
        var url = new URL(window.location.href);
        url.searchParams.set('lang', code);
        window.location.href = url.toString();
        return false;
      };

      // Back to top. The button carries [hidden] from the server so
      // a visitor with no JavaScript never sees a control that
      // cannot work; the first thing this does is take that off.
      var top = document.getElementById('acTopBtn');
      if (top) {
        top.hidden = false;
        var ticking = false;
        var sync = function () {
          ticking = false;
          var y = window.pageYOffset || document.documentElement.scrollTop || 0;
          top.classList.toggle('is-on', y > 320);
        };
        window.addEventListener('scroll', function () {
          if (ticking) return;
          ticking = true;
          window.requestAnimationFrame(sync);
        }, { passive: true });
        top.addEventListener('click', function () {
          var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
          // Send focus back where the page starts, so a keyboard
          // visitor lands at the top rather than staying parked on
          // a button that has just scrolled out of sight.
          var first = document.querySelector('.ac-brand') || document.body;
          if (first && first.focus) first.focus({ preventScroll: true });
        });
        sync();
      }

      applyLabel();
    })();
  </script>`
}
