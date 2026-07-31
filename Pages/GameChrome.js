// ==========================================
// Pages/GameChrome.js
// The frame every player-facing game page sits in.
//
// Public exports:
//   escapeHtml(value) / jsString(value)
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
import { escapeHtml, jsString, safeColor } from '../Core/Html.js'
import { dirFor, langCookieHeader, resolveRequestTheme, parseCookies } from '../Core/RequestContext.js'

const LANGS = ['fa', 'en', 'ja']
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
    html{scrollbar-width:none;-ms-overflow-style:none}
    html::-webkit-scrollbar{width:0;height:0;display:none}

    :root{
      --accent:${gameAccent(accent)};
      --brand:#6c63ff;--ok:#4caf50;--warn:#ff9800;--err:#f44336;
      --radius:18px;--maxw:1060px;
      --bg-1:#0b0e16;--bg-2:#141a2e;
      --surface:rgba(255,255,255,.05);--surface-2:rgba(255,255,255,.085);
      --border:rgba(255,255,255,.10);
      --text:rgba(255,255,255,.92);--dim:rgba(255,255,255,.58);
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
      font-family:'Vazirmatn','Segoe UI',Tahoma,Arial,sans-serif;
      min-height:100vh;padding:22px 18px 54px;color:var(--text);
      background:
        radial-gradient(1000px 500px at 80% -10%,color-mix(in srgb,var(--accent) 20%,transparent),transparent 60%),
        radial-gradient(820px 440px at 6% 4%,color-mix(in srgb,var(--brand) 14%,transparent),transparent 60%),
        linear-gradient(160deg,var(--bg-1),var(--bg-2));
      background-attachment:fixed;
    }
    .wrap{max-width:var(--maxw);margin:0 auto}

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
    .gnav a[aria-current="page"]{color:#fff;border-color:transparent;
      background:linear-gradient(135deg,var(--accent),color-mix(in srgb,var(--accent) 50%,#fff))}
    .gnav a.is-off{opacity:.45;pointer-events:none}

    .gseg{display:inline-flex;padding:3px;gap:2px;border-radius:12px;background:var(--surface);border:1px solid var(--border)}
    .gseg button{border:0;cursor:pointer;padding:7px 11px;border-radius:9px;font:inherit;font-size:.8em;
      font-weight:700;color:var(--dim);background:transparent}
    .gseg button[aria-pressed="true"]{color:#fff;background:linear-gradient(135deg,var(--accent),color-mix(in srgb,var(--accent) 50%,#fff))}
    .gicon-btn{width:38px;height:38px;border-radius:11px;cursor:pointer;display:inline-flex;align-items:center;
      justify-content:center;color:var(--text);background:var(--surface);border:1px solid var(--border)}

    /* ---------- generic surfaces ---------- */
    .gcard{padding:24px;border-radius:var(--radius);background:var(--surface);border:1px solid var(--border)}
    .ghead{display:flex;align-items:center;gap:12px;margin:6px 0 18px;font-size:1.25em;font-weight:800}
    .ghead::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,var(--border),transparent)}
    .glede{color:var(--dim);font-size:.92em;line-height:1.7;margin-block-end:18px}

    .gbtn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 20px;
      border:1px solid transparent;border-radius:13px;font:inherit;font-weight:700;font-size:.9em;
      cursor:pointer;text-decoration:none;color:#fff;
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

    footer{margin-block-start:40px;text-align:center;padding:24px;border-radius:var(--radius);
      background:var(--surface);border:1px solid var(--border);color:var(--dim);font-size:.85em}
    footer a{color:color-mix(in srgb,var(--accent) 55%,var(--text));text-decoration:none}

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
        scrollbar-width:none;-webkit-overflow-scrolling:touch;padding-block-end:2px}
      .gnav::-webkit-scrollbar{display:none}
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
export function chromeHead({ title, description = '', accent }) {
  return `
  ${getPageHead({ title: escapeHtml(title), amirLogo: CONFIG.AMIR_LOGO, description: escapeHtml(description) })}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap" rel="stylesheet">
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
  items.push({ key: 'landing', href: `/${game.id}`, label: nav.landing })

  if (game.capabilities.login) {
    items.push({ key: 'account', href: `/${game.id}/account`, label: nav.account })
  }
  if (game.capabilities.store) {
    items.push({ key: 'store', href: `/${game.id}/store`, label: nav.store })
  }
  if (game.capabilities.leaderboard) {
    items.push({ key: 'board', href: `/${game.id}/leaderboard`, label: nav.board })
  }
  items.push({ key: 'versions', href: `/${game.id}/versions`, label: nav.versions })
  items.push({ key: 'download', href: `/${game.id}/download`, label: nav.download, off: !downloadable })

  const links = items.map(item =>
    `<a href="${escapeHtml(item.href)}"${item.key === active ? ' aria-current="page"' : ''}` +
    `${item.off ? ' class="is-off" aria-disabled="true"' : ''}>${escapeHtml(item.label)}</a>`
  ).join('')

  const segs = ['fa', 'en', 'ja'].map(code =>
    `<button type="button" onclick="gcSetLang('${code}')" aria-pressed="${code === lang ? 'true' : 'false'}" lang="${code}">` +
    `${escapeHtml(META[code].label)}</button>`
  ).join('')

  return `
    <div class="gtop">
      <a class="gbrand" href="/${escapeHtml(game.id)}">
        <span class="gbrand-logo">${escapeHtml(game.icon || '🎮')}${game.logo
          ? `<img src="${escapeHtml(game.logo)}" alt="" onerror="this.style.display='none'">` : ''}</span>
        <span>
          <span class="gbrand-name">${escapeHtml(game.name)}</span><br>
          <span class="gbrand-sub">AmirCollider Games</span>
        </span>
      </a>
      <div class="gnav">
        ${links}
        <span class="gseg" role="group">${segs}</span>
        <button type="button" class="gicon-btn" onclick="gcToggleTheme()" aria-label="theme">◐</button>
      </div>
    </div>`
}


export function chromeFoot(game, lang) {
  const nav = NAV[lang] || NAV.fa
  return `
    <footer>
      <a href="/">${escapeHtml(nav.home)}</a> &middot;
      <a href="/${escapeHtml(game.id)}/privacy">privacy</a> &middot;
      <a href="/${escapeHtml(game.id)}/terms">terms</a> &middot;
      <span>v${escapeHtml(CONFIG.VERSION)}</span>
    </footer>`
}


// ==========================================
// chromeScript
// Theme and language, which every page needs and none of them
// should own.
//
// Language reloads rather than swapping strings client-side, so
// the document direction is always set by the server and an
// RTL page can never end up with LTR chrome.
// ==========================================
export function chromeScript() {
  return `<script>
    function gcToggleTheme(){
      var dark = getComputedStyle(document.documentElement).colorScheme.indexOf('dark') !== -1;
      var next = dark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('ac_theme', next); } catch (e) {}
      document.cookie = 'theme=' + next + ';path=/;max-age=31536000;samesite=lax';
    }
    function gcSetLang(code){
      document.cookie = 'lang=' + code + ';path=/;max-age=31536000;samesite=lax';
      var url = new URL(window.location.href);
      url.searchParams.set('lang', code);
      window.location.href = url.toString();
    }
  </script>`
}


// ==========================================
// page
// A whole document, assembled.
// ==========================================
export function page({ game, lang, theme, title, description = '', active, body, script = '', downloadable = true }) {
  const themeAttr = theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : ''

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}" dir="${dirFor(lang)}"${themeAttr}>
<head>
${chromeHead({ title, description, accent: game.color })}
</head>
<body>
  <div class="wrap">
    ${chromeTop(game, lang, active, { downloadable })}
    ${body}
    ${chromeFoot(game, lang)}
  </div>
  ${chromeScript()}
  ${script}
</body>
</html>`
}
