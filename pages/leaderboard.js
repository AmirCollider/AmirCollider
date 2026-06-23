// ==========================================
// pages/leaderboard.js
// Leaderboard Page Handler
// AmirCollider Games - Worker Proxy
// ==========================================
//
// Responsibilities
//   - Read the per-game leaderboard from the game's D1 binding and serve
//     it as either machine JSON (Accept: application/json) or a rendered
//     HTML page (browsers).
//   - Own its own page chrome: theme tokens, layout, podium/rows and the
//     small client runtime (theme + language + count-up).
//
// Integration contract (do not break without updating callers)
//   - Public entry:  handleLeaderboardUnified(url, request, gameId,
//                                              requestId, GAMES, envVars)
//     (worker.js invokes every handler with this exact argument order.)
//   - JSON shape stays stable for the Android client, Telegram bot and
//     the /testsite panel:
//       { leaderboard: [{ rank, username, displayName, highScore,
//                         photoURL, selectedColor, gameId }],
//         total, limit, returned, requestId, timestamp }
//   - "limit" is echoed back exactly as parsed so /leaderboard/:limit
//     consumers can assert on it.
//
// Theme & language
//   - Theme: <html data-theme="light|dark">; absent attribute = follow OS.
//   - Language: server-resolved from ?lang= -> cookie -> Accept-Language.
//   - Layout direction is intentionally fixed to RTL for every language;
//     UI strings localize, but the site keeps its native right-to-left
//     feel. Variable-direction text uses dir="auto", numbers use dir="ltr".
//
// Extending
//   - Add a UI language: add one entry to LB_I18N.
//   - Change rank styling: edit rankTier() and the .rank-* CSS rules.
// ==========================================

import { CONFIG } from '../config.js'
import { getPageHead } from '../shared-styles.js'
import { validateGameId, createJsonResponse, createHtmlResponse, logError } from '../utils.js'

const DEFAULT_LANG = 'fa'
const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365
const MIN_LIMIT = 1
const MAX_LIMIT = 1000
const DEFAULT_LIMIT = 100

// ==========================================
// i18n - leaderboard chrome strings (fa / en / ja)
// ==========================================
const LB_I18N = {
  fa: {
    locale: 'fa-IR',
    langName: 'فارسی',
    metaTitle: 'جدول امتیازات',
    metaDesc: 'برترین بازیکنان {game} - جدول امتیازات و رتبه‌بندی',
    heading: 'جدول امتیازات',
    subtitle: 'برترین بازیکنان {game}',
    statTotal: 'مجموع بازیکنان',
    statShown: 'نمایش داده‌شده',
    statLimit: 'سقف نمایش',
    rankColumn: 'رتبه',
    emptyTitle: 'هنوز رکوردی ثبت نشده است',
    emptyText: 'اولین کسی باشید که در {game} امتیاز می‌گیرد.',
    actionHome: 'صفحه اصلی',
    actionRefresh: 'بروزرسانی',
    footerPowered: 'اجرا شده روی Cloudflare Workers'
  },
  en: {
    locale: 'en-US',
    langName: 'English',
    metaTitle: 'Leaderboard',
    metaDesc: 'Top players of {game} - scores and ranking',
    heading: 'Leaderboard',
    subtitle: 'Top players of {game}',
    statTotal: 'Total players',
    statShown: 'Showing',
    statLimit: 'Display cap',
    rankColumn: 'Rank',
    emptyTitle: 'No scores yet',
    emptyText: 'Be the first to set a score in {game}.',
    actionHome: 'Home',
    actionRefresh: 'Refresh',
    footerPowered: 'Powered by Cloudflare Workers'
  },
  ja: {
    locale: 'ja-JP',
    langName: '日本語',
    metaTitle: 'リーダーボード',
    metaDesc: '{game} のトッププレイヤー - スコアとランキング',
    heading: 'リーダーボード',
    subtitle: '{game} のトッププレイヤー',
    statTotal: '総プレイヤー数',
    statShown: '表示中',
    statLimit: '表示上限',
    rankColumn: '順位',
    emptyTitle: 'まだスコアがありません',
    emptyText: '{game} で最初のスコアを記録しましょう。',
    actionHome: 'ホーム',
    actionRefresh: '更新',
    footerPowered: 'Cloudflare Workers で稼働'
  }
}

// ==========================================
// i18n helpers
// ==========================================
function resolveLang(lang) {
  return LB_I18N[lang] ? lang : DEFAULT_LANG
}

function pack(lang) {
  return LB_I18N[resolveLang(lang)]
}

function fill(template, values) {
  return String(template).replace(/\{(\w+)\}/g, (m, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : m
  )
}

// ==========================================
// Request helpers (language & theme resolution)
// ==========================================
function parseCookies(request) {
  const header = request && request.headers ? request.headers.get('Cookie') : ''
  const out = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i === -1) continue
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

function langFromAcceptHeader(request) {
  const header = request && request.headers ? request.headers.get('Accept-Language') : ''
  if (!header) return null
  for (const piece of header.toLowerCase().split(',')) {
    const code = piece.split(';')[0].trim().slice(0, 2)
    if (LB_I18N[code]) return code
  }
  return null
}

// Priority: explicit ?lang= -> stored cookie -> browser preference -> default.
function resolveRequestLang(url, request, cookies) {
  const fromQuery = url && url.searchParams ? url.searchParams.get('lang') : null
  if (fromQuery && LB_I18N[fromQuery]) return fromQuery
  if (cookies.lang && LB_I18N[cookies.lang]) return cookies.lang
  return langFromAcceptHeader(request) || DEFAULT_LANG
}

// Returns 'light' | 'dark' | null (null = auto / follow OS).
function resolveRequestTheme(cookies) {
  return cookies.theme === 'light' || cookies.theme === 'dark' ? cookies.theme : null
}

// ==========================================
// Output-safety helper
// ==========================================
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ==========================================
// SVG icon set (stroke uses currentColor)
// ==========================================
const ICONS = {
  trophy: '<path d="M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 0-3 3"/><path d="M12 13v4M8 21h8M9 21v-2h6v2"/>',
  crown: '<path d="M3 7l4 4 5-7 5 7 4-4-2 12H5z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>',
  contrast: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor" stroke="none"/>'
}

function icon(name, cls) {
  return '<svg class="' + (cls || 'lb-ic') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
    + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + (ICONS[name] || '') + '</svg>'
}

// ==========================================
// Rank presentation
// Tier drives the gold/silver/bronze styling; #1 shows a crown.
// ==========================================
function rankTier(rank) {
  if (rank === 1) return 'gold'
  if (rank === 2) return 'silver'
  if (rank === 3) return 'bronze'
  return 'plain'
}

function formatNumber(value, locale) {
  const n = Number(value) || 0
  try {
    return n.toLocaleString(locale)
  } catch (e) {
    return String(n)
  }
}

function avatarFallback(name) {
  const initial = (name || '?').trim().charAt(0) || '?'
  return 'https://placehold.co/64?text=' + encodeURIComponent(initial)
}

// ==========================================
// Stylesheet
// Theme via tokens; layout uses logical properties; motion is gated
// behind prefers-reduced-motion.
// ==========================================
function getLeaderboardCSS() {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --brand: #6c63ff;
      --brand-2: #a78bfa;
      --gold-1: #ffd76a; --gold-2: #f0a93a;
      --silver-1: #e6ecf5; --silver-2: #aab6c8;
      --bronze-1: #e6a96b; --bronze-2: #b9743a;
      --ok: #4caf50;
      --radius: 18px;
      --maxw: 1040px;

      --bg-1: #0b0e16;
      --bg-2: #141a2e;
      --surface: rgba(255,255,255,0.045);
      --surface-2: rgba(255,255,255,0.08);
      --border: rgba(255,255,255,0.10);
      --text: rgba(255,255,255,0.92);
      --text-dim: rgba(255,255,255,0.58);
      color-scheme: dark;
    }

    /* Auto theme: follow the OS only when no explicit choice is set. */
    @media (prefers-color-scheme: light) {
      :root:not([data-theme]) {
        --bg-1: #f4f6fb; --bg-2: #e7ecf7;
        --surface: rgba(255,255,255,0.70);
        --surface-2: #ffffff;
        --border: rgba(20,22,33,0.10);
        --text: rgba(22,24,33,0.92);
        --text-dim: rgba(22,24,33,0.56);
        color-scheme: light;
      }
    }

    :root[data-theme="light"] {
      --bg-1: #f4f6fb; --bg-2: #e7ecf7;
      --surface: rgba(255,255,255,0.70);
      --surface-2: #ffffff;
      --border: rgba(20,22,33,0.10);
      --text: rgba(22,24,33,0.92);
      --text-dim: rgba(22,24,33,0.56);
      color-scheme: light;
    }
    :root[data-theme="dark"] {
      --bg-1: #0b0e16; --bg-2: #141a2e;
      --surface: rgba(255,255,255,0.045);
      --surface-2: rgba(255,255,255,0.08);
      --border: rgba(255,255,255,0.10);
      --text: rgba(255,255,255,0.92);
      --text-dim: rgba(255,255,255,0.58);
      color-scheme: dark;
    }

    body {
      font-family: 'Vazirmatn', 'Segoe UI', Tahoma, Arial, sans-serif;
      min-height: 100vh;
      padding: 24px 20px 56px;
      color: var(--text);
      background:
        radial-gradient(1100px 520px at 78% -8%, color-mix(in srgb, var(--brand) 22%, transparent), transparent 60%),
        radial-gradient(900px 480px at 8% 6%, color-mix(in srgb, var(--brand-2) 16%, transparent), transparent 60%),
        linear-gradient(160deg, var(--bg-1), var(--bg-2));
      background-attachment: fixed;
    }

    .wrap { max-width: var(--maxw); margin: 0 auto; }

    /* ---------- top bar ---------- */
    .topbar {
      display: flex; align-items: center; justify-content: space-between;
      gap: 16px; flex-wrap: wrap; margin-block-end: 26px;
    }
    .brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
    .brand-logo {
      width: 52px; height: 52px; border-radius: 15px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      background: var(--surface-2); border: 1px solid var(--border);
      overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,0.18);
    }
    .brand-logo img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .brand-name { font-weight: 800; font-size: 1.05em; line-height: 1.2; }
    .brand-sub  { font-size: 0.8em; color: var(--text-dim); }

    .controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .seg {
      display: inline-flex; padding: 3px; gap: 2px; border-radius: 12px;
      background: var(--surface); border: 1px solid var(--border);
    }
    .seg button {
      border: 0; cursor: pointer; padding: 7px 12px; border-radius: 9px;
      font: inherit; font-size: 0.82em; font-weight: 600;
      color: var(--text-dim); background: transparent;
      transition: color 0.18s ease, background 0.18s ease;
    }
    .seg button:hover { color: var(--text); }
    .seg button[aria-pressed="true"] {
      color: #fff;
      background: linear-gradient(135deg, var(--brand), var(--brand-2));
      box-shadow: 0 4px 14px color-mix(in srgb, var(--brand) 40%, transparent);
    }
    .icon-btn {
      width: 40px; height: 40px; border-radius: 11px; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center;
      color: var(--text); background: var(--surface); border: 1px solid var(--border);
      transition: transform 0.18s ease, background 0.18s ease;
    }
    .icon-btn:hover { transform: translateY(-2px); background: var(--surface-2); }
    .icon-btn:active { transform: scale(0.95); }
    .lb-ic { width: 18px; height: 18px; }
    .seg button:focus-visible,
    .icon-btn:focus-visible,
    .action:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }

    /* ---------- hero ---------- */
    .hero {
      text-align: center; margin: 14px 0 26px;
      display: flex; flex-direction: column; align-items: center; gap: 10px;
    }
    .hero-badge {
      width: 60px; height: 60px; border-radius: 18px;
      display: flex; align-items: center; justify-content: center;
      color: #fff; background: linear-gradient(135deg, var(--gold-1), var(--gold-2));
      box-shadow: 0 12px 30px color-mix(in srgb, var(--gold-2) 45%, transparent);
    }
    .hero-badge svg { width: 30px; height: 30px; }
    .hero h1 {
      font-size: clamp(1.8em, 4.5vw, 2.6em); font-weight: 800; line-height: 1.15;
      background: linear-gradient(135deg, var(--text), color-mix(in srgb, var(--brand) 55%, var(--text)));
      -webkit-background-clip: text; background-clip: text; color: transparent;
    }
    .hero p { color: var(--text-dim); font-size: 1em; }

    /* ---------- stats ---------- */
    .stats {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 12px; margin: 4px 0 30px;
    }
    .stat {
      padding: 18px 16px; border-radius: var(--radius); text-align: center;
      background: var(--surface); border: 1px solid var(--border);
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
    }
    .stat:hover {
      transform: translateY(-4px);
      border-color: color-mix(in srgb, var(--brand) 45%, var(--border));
      background: var(--surface-2);
    }
    .stat-ic { color: color-mix(in srgb, var(--brand) 55%, var(--text)); }
    .stat-ic svg { width: 20px; height: 20px; }
    .stat-num {
      font-size: 1.9em; font-weight: 800; line-height: 1;
      color: color-mix(in srgb, var(--brand) 40%, var(--text));
    }
    .stat-label { font-size: 0.82em; color: var(--text-dim); }

    /* ---------- player rows ---------- */
    .board { display: flex; flex-direction: column; gap: 12px; }
    .row {
      display: flex; align-items: center; gap: 16px;
      padding: 14px 18px; border-radius: var(--radius);
      background: var(--surface); border: 1px solid var(--border);
      transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
    }
    .row:hover {
      transform: translateY(-3px);
      border-color: color-mix(in srgb, var(--brand) 35%, var(--border));
      background: var(--surface-2);
    }

    .rank {
      width: 46px; height: 46px; flex-shrink: 0; border-radius: 13px;
      display: flex; align-items: center; justify-content: center;
      font-weight: 800; font-size: 1.05em; color: var(--text);
      background: var(--surface-2); border: 1px solid var(--border);
    }
    .rank svg { width: 22px; height: 22px; }
    .row.gold   .rank { color: #1c1606; background: linear-gradient(135deg, var(--gold-1), var(--gold-2)); border-color: transparent; }
    .row.silver .rank { color: #1b1f27; background: linear-gradient(135deg, var(--silver-1), var(--silver-2)); border-color: transparent; }
    .row.bronze .rank { color: #1f1407; background: linear-gradient(135deg, var(--bronze-1), var(--bronze-2)); border-color: transparent; }
    .row.gold, .row.silver, .row.bronze {
      border-color: color-mix(in srgb, var(--brand) 22%, var(--border));
    }

    .avatar {
      width: 48px; height: 48px; flex-shrink: 0; border-radius: 50%;
      object-fit: cover; background: var(--surface-2);
      border: 2px solid var(--border);
    }
    .row.gold   .avatar { border-color: var(--gold-2); }
    .row.silver .avatar { border-color: var(--silver-2); }
    .row.bronze .avatar { border-color: var(--bronze-2); }

    .who { flex: 1; min-width: 0; }
    .name {
      font-weight: 700; font-size: 1.05em;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .score {
      flex-shrink: 0; font-weight: 800; font-size: 1.25em;
      color: color-mix(in srgb, var(--brand) 35%, var(--text));
      font-variant-numeric: tabular-nums;
    }

    /* ---------- empty state ---------- */
    .empty {
      text-align: center; padding: 56px 24px; border-radius: var(--radius);
      background: var(--surface); border: 1px solid var(--border);
    }
    .empty-ic {
      width: 72px; height: 72px; margin: 0 auto 18px; border-radius: 20px;
      display: flex; align-items: center; justify-content: center;
      color: color-mix(in srgb, var(--brand) 55%, var(--text));
      background: color-mix(in srgb, var(--brand) 12%, transparent);
      border: 1px solid color-mix(in srgb, var(--brand) 28%, transparent);
    }
    .empty-ic svg { width: 34px; height: 34px; }
    .empty h2 { font-size: 1.3em; font-weight: 800; margin-block-end: 8px; }
    .empty p { color: var(--text-dim); }

    /* ---------- actions ---------- */
    .actions { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; margin: 30px 0 26px; }
    .action {
      display: inline-flex; align-items: center; gap: 9px;
      padding: 12px 22px; border-radius: 13px; text-decoration: none;
      font-weight: 700; font-size: 0.92em; color: var(--text);
      background: var(--surface); border: 1px solid var(--border);
      transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
    }
    .action:hover {
      transform: translateY(-2px); background: var(--surface-2);
      border-color: color-mix(in srgb, var(--brand) 40%, var(--border));
    }
    .action svg { width: 18px; height: 18px; color: color-mix(in srgb, var(--brand) 55%, var(--text)); }
    .action.primary {
      color: #fff; border-color: transparent;
      background: linear-gradient(135deg, var(--brand), var(--brand-2));
    }
    .action.primary svg { color: #fff; }

    /* ---------- footer ---------- */
    footer {
      text-align: center; padding: 22px; border-radius: var(--radius);
      background: var(--surface); border: 1px solid var(--border); color: var(--text-dim);
    }
    footer .f-name { color: var(--text); font-weight: 800; }
    footer .f-meta { margin-block-start: 6px; font-size: 0.85em; }
    footer .f-meta b { color: color-mix(in srgb, var(--brand) 45%, var(--text)); }

    @media (max-width: 480px) {
      .row { padding: 12px 14px; gap: 12px; }
      .rank { width: 40px; height: 40px; }
      .avatar { width: 42px; height: 42px; }
      .score { font-size: 1.1em; }
      .seg button { padding: 6px 9px; }
    }

    /* ---------- motion (off when the user prefers reduced motion) ---------- */
    @media (prefers-reduced-motion: no-preference) {
      .topbar, .hero, .stats, .actions, footer { animation: lbRise 0.5s cubic-bezier(0.16,1,0.3,1) both; }
      .hero  { animation-delay: 0.05s; }
      .stats { animation-delay: 0.10s; }
      .row {
        animation: lbRise 0.45s cubic-bezier(0.16,1,0.3,1) both;
        animation-delay: calc(0.04s * var(--i, 0) + 0.12s);
      }
      .row.gold .rank svg { animation: lbGlow 2.4s ease-in-out infinite; }
    }
    @keyframes lbRise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes lbGlow { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
  `
}

// ==========================================
// Pre-paint theme bootstrap
// Applies the stored theme before first paint to avoid a flash.
// ==========================================
function getThemeBootScript() {
  return `<script>
    (function () {
      try {
        var t = localStorage.getItem('ac_theme');
        if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
      } catch (e) {}
    })();
  </script>`
}

// ==========================================
// Partial: top bar (brand + language seg + theme toggle)
// ==========================================
function renderTopbar(lang) {
  const cur = resolveLang(lang)
  const amirLogo = CONFIG.AMIR_LOGO
  const langs = [['fa', LB_I18N.fa.langName], ['en', LB_I18N.en.langName], ['ja', LB_I18N.ja.langName]]

  const segButtons = langs.map(([code, label]) =>
    '<button type="button" data-lang="' + code + '" aria-pressed="' + (code === cur ? 'true' : 'false') + '"'
    + ' onclick="acSetLang(\'' + code + '\')" lang="' + code + '">' + escapeHtml(label) + '</button>'
  ).join('')

  return `
    <div class="topbar">
      <div class="brand">
        <span class="brand-logo">
          <img src="${escapeHtml(amirLogo)}" alt="AmirCollider" onerror="this.style.display='none'">
        </span>
        <span>
          <span class="brand-name">AmirCollider</span><br>
          <span class="brand-sub">${escapeHtml(pack(cur).metaTitle)}</span>
        </span>
      </div>
      <div class="controls">
        <div class="seg" role="group" aria-label="${escapeHtml(pack(cur).langName)}">${segButtons}</div>
        <button type="button" id="themeBtn" class="icon-btn" onclick="acToggleTheme()" aria-label="theme">${icon('contrast')}</button>
      </div>
    </div>`
}

// ==========================================
// Partial: hero (trophy badge + heading + subtitle)
// ==========================================
function renderHero(lang, gameName) {
  const p = pack(lang)
  return `
    <div class="hero">
      <span class="hero-badge">${icon('trophy')}</span>
      <h1>${escapeHtml(p.heading)}</h1>
      <p dir="auto">${escapeHtml(fill(p.subtitle, { game: gameName }))}</p>
    </div>`
}

// ==========================================
// Partial: stats bar (data-driven; count-up on the numbers)
// ==========================================
function renderStats(lang, total, shown, limit) {
  const p = pack(lang)
  const items = [
    { ic: 'users', value: total, label: p.statTotal },
    { ic: 'list', value: shown, label: p.statShown },
    { ic: 'target', value: limit, label: p.statLimit }
  ]
  const cells = items.map(it =>
    '<div class="stat"><span class="stat-ic">' + icon(it.ic) + '</span>'
    + '<span class="stat-num" data-count="' + escapeHtml(String(it.value)) + '">'
    + escapeHtml(formatNumber(it.value, p.locale)) + '</span>'
    + '<span class="stat-label">' + escapeHtml(it.label) + '</span></div>'
  ).join('')
  return '<div class="stats">' + cells + '</div>'
}

// ==========================================
// Partial: a single player row
// ==========================================
function renderRow(player, index, locale) {
  const tier = rankTier(player.rank)
  const name = player.displayName || player.username || 'Unknown'
  const rankInner = player.rank === 1 ? icon('crown') : escapeHtml(formatNumber(player.rank, locale))
  const photo = player.photoURL || avatarFallback(name)

  return `
    <div class="row ${tier}" style="--i: ${index};">
      <div class="rank" aria-label="rank ${player.rank}">${rankInner}</div>
      <img class="avatar" src="${escapeHtml(photo)}" alt=""
           onerror="this.onerror=null;this.src='${escapeHtml(avatarFallback(name))}'">
      <div class="who"><div class="name" dir="auto">${escapeHtml(name)}</div></div>
      <div class="score" dir="ltr">${escapeHtml(formatNumber(player.highScore, locale))}</div>
    </div>`
}

// ==========================================
// Partial: board (rows) or empty state
// ==========================================
function renderBoard(players, lang, gameName) {
  const p = pack(lang)
  if (!players.length) {
    return `
      <div class="empty">
        <div class="empty-ic">${icon('trophy')}</div>
        <h2>${escapeHtml(p.emptyTitle)}</h2>
        <p dir="auto">${escapeHtml(fill(p.emptyText, { game: gameName }))}</p>
      </div>`
  }
  const rows = players.map((player, i) => renderRow(player, i, p.locale)).join('')
  return '<div class="board">' + rows + '</div>'
}

// ==========================================
// Partial: action buttons (lang preserved on navigation)
// ==========================================
function renderActions(lang, baseUrl, gameId) {
  const p = pack(lang)
  const q = '?lang=' + encodeURIComponent(resolveLang(lang))
  return `
    <div class="actions">
      <a class="action primary" href="${escapeHtml(baseUrl + '/' + gameId + '/leaderboard' + q)}">
        ${icon('refresh')}<span>${escapeHtml(p.actionRefresh)}</span>
      </a>
      <a class="action" href="${escapeHtml(baseUrl + '/' + q)}">
        ${icon('home')}<span>${escapeHtml(p.actionHome)}</span>
      </a>
    </div>`
}

// ==========================================
// Client runtime
// Theme toggle, language switch (server-driven reload) and a subtle
// count-up. No backticks/${} inside the body other than injected data.
// ==========================================
function getClientScript(baseUrl, lang) {
  const injected = 'var AC = ' + JSON.stringify({ baseUrl, lang: resolveLang(lang) }) + ';'

  const body = `
    function acThemeIsDark() {
      return getComputedStyle(document.documentElement).colorScheme.indexOf('dark') !== -1;
    }
    function acToggleTheme() {
      var next = acThemeIsDark() ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('ac_theme', next); } catch (e) {}
      document.cookie = 'theme=' + next + ';path=/;max-age=31536000;samesite=lax';
    }
    window.acToggleTheme = acToggleTheme;

    function acSetLang(code) {
      try { localStorage.setItem('ac_lang', code); } catch (e) {}
      document.cookie = 'lang=' + code + ';path=/;max-age=31536000;samesite=lax';
      var u = new URL(window.location.href);
      u.searchParams.set('lang', code);
      window.location.href = u.toString();
    }
    window.acSetLang = acSetLang;

    function acCountUp() {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      var nodes = document.querySelectorAll('.stat-num[data-count]');
      Array.prototype.forEach.call(nodes, function (node) {
        var raw = node.getAttribute('data-count');
        if (!/^[0-9]+$/.test(raw)) return;
        var end = parseInt(raw, 10), start = null, dur = 700, shown = node.textContent;
        var loc = AC.lang === 'fa' ? 'fa-IR' : AC.lang === 'ja' ? 'ja-JP' : 'en-US';
        function step(ts) {
          if (start === null) start = ts;
          var pr = Math.min((ts - start) / dur, 1);
          var eased = 1 - Math.pow(1 - pr, 3);
          node.textContent = Math.round(end * eased).toLocaleString(loc);
          if (pr < 1) requestAnimationFrame(step); else node.textContent = shown;
        }
        requestAnimationFrame(step);
      });
    }

    acCountUp();
  `

  return '<script>\n' + injected + '\n' + body + '\n</script>'
}

// ==========================================
// Page: full leaderboard document (handles empty state internally)
// Layout direction is fixed to RTL for every language by design.
// ==========================================
function createLeaderboardPage({ players, game, baseUrl, total, limit, lang, theme, gameId }) {
  const resolved = resolveLang(lang)
  const p = pack(resolved)
  const amirLogo = CONFIG.AMIR_LOGO
  const themeAttr = theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : ''
  const title = `${p.metaTitle} - ${game.name} | AmirCollider`
  const desc = fill(p.metaDesc, { game: game.name })

  return `<!DOCTYPE html>
<html dir="rtl" lang="${resolved}"${themeAttr}>
<head>
  ${getPageHead({ title, amirLogo, description: desc })}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  ${getThemeBootScript()}
  <style>${getLeaderboardCSS()}</style>
</head>
<body>
  <div class="wrap">
    ${renderTopbar(resolved)}
    ${renderHero(resolved, game.name)}
    ${renderStats(resolved, total, players.length, limit)}
    ${renderBoard(players, resolved, game.name)}
    ${renderActions(resolved, baseUrl, gameId)}
    <footer>
      <div class="f-name">AmirCollider Games</div>
      <div class="f-meta">${escapeHtml(p.footerPowered)} &middot; <b>v${escapeHtml(CONFIG.VERSION)}</b></div>
    </footer>
  </div>
  ${getClientScript(baseUrl, resolved)}
</body>
</html>`
}

// ==========================================
// Data: read the top players from the game's D1 binding
// ==========================================
async function fetchTopPlayers(db, limit, gameId) {
  const { results } = await db.prepare(`
    SELECT username AS displayName, high_score AS highScore,
           profile_pic_url AS photoURL, selected_color AS selectedColor
    FROM players
    ORDER BY high_score DESC
    LIMIT ?
  `).bind(limit).all()

  return (results || []).map((row, index) => ({
    rank: index + 1,
    username: row.displayName || 'Unknown User',
    displayName: row.displayName || 'Unknown User',
    highScore: row.highScore || 0,
    photoURL: row.photoURL || '',
    selectedColor: row.selectedColor || 'FFFFFF',
    gameId
  }))
}

// ==========================================
// Helper: parse the trailing /:limit segment (clamped)
// ==========================================
function parseLimit(url) {
  const parts = url.pathname.split('/').filter(Boolean)
  const parsed = parseInt(parts[parts.length - 1], 10)
  if (!Number.isNaN(parsed) && parsed >= MIN_LIMIT && parsed <= MAX_LIMIT) return parsed
  return DEFAULT_LIMIT
}

// ==========================================
// Handler: Unified Leaderboard (JSON or HTML by Accept header)
// ==========================================
export async function handleLeaderboardUnified(url, request, gameId, requestId, GAMES, envVars) {
  const game = validateGameId(gameId, GAMES)
  if (!game) {
    return createJsonResponse({ error: 'invalid_game', message: 'Game configuration not found', requestId }, 400)
  }

  if (!game.d1Binding) {
    return createJsonResponse({ error: 'no_database', message: 'No database configured for this game', requestId }, 500)
  }

  const db = envVars[game.d1Binding]
  if (!db) {
    return createJsonResponse({ error: 'db_not_bound', message: `D1 binding "${game.d1Binding}" not found`, requestId }, 500)
  }

  const limit = parseLimit(url)
  const wantsJson = (request.headers.get('Accept') || '').includes('application/json')

  try {
    const players = await fetchTopPlayers(db, limit, gameId)

    if (wantsJson) {
      return createJsonResponse({
        leaderboard: players,
        total: players.length,
        limit,
        returned: players.length,
        requestId,
        timestamp: new Date().toISOString()
      }, 200)
    }

    const cookies = parseCookies(request)
    const lang = resolveRequestLang(url, request, cookies)
    const theme = resolveRequestTheme(cookies)

    const headers = {}
    const requestedLang = url.searchParams ? url.searchParams.get('lang') : null
    if (requestedLang && LB_I18N[requestedLang]) {
      headers['Set-Cookie'] = `lang=${requestedLang}; Path=/; Max-Age=${LANG_COOKIE_MAX_AGE}; SameSite=Lax`
    }

    const html = createLeaderboardPage({
      players, game, baseUrl: url.origin, total: players.length, limit, lang, theme, gameId
    })
    return createHtmlResponse(html, 200, headers)

  } catch (error) {
    logError('Leaderboard handler error', { requestId, gameId, error: error.message })
    return createJsonResponse({ error: 'server_error', message: 'Failed to load leaderboard', requestId }, 500)
  }
}
