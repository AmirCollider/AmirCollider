// ==========================================
// pages/dashboard.js
// Main Dashboard Page Handler
// AmirCollider Games - Worker Proxy
// ==========================================
//
// Responsibilities
//   - Render the landing dashboard: hero, live stats, game cards,
//     highlights, system links and footer.
//   - Own the page chrome (theme tokens, layout, animations) and the
//     client runtime that drives the per-card service tests.
//
// Integration contract (do not break without updating callers)
//   - Public entry:  handleDashboard(url, request, gameId, requestId,
//                                    GAMES, env, availableEndpoints)
//   - Cards come from createGamesCardsHTML(GAMES, baseUrl, { lang }).
//   - This file defines the globals the cards call:
//       testHealth(id) / testPing(id) / testMetrics(id)
//     each targeting <div class="result-box" id="result-<id>">.
//
// Theme & language
//   - Theme: <html data-theme="light|dark">; "auto" follows the OS.
//     GamesCards.js reads the same attribute, so cards stay in sync.
//   - Language: server-resolved from ?lang= -> cookie -> Accept-Language.
//     Switching reloads with ?lang=xx so RTL/LTR is always correct
//     (chrome and SSR cards switch together, no client re-flow bugs).
//
// Extending
//   - Add a UI language: add one entry to DASH_I18N below.
//   - Add a stat / highlight / system link: edit the data arrays in
//     their respective section; the renderers are data-driven.
// ==========================================

import { CONFIG } from '../config.js'
import { getPageHead } from '../shared-styles.js'
import { createHtmlResponse } from '../utils.js'
import { createGamesCardsHTML } from './GamesCards.js'

const DEFAULT_LANG = 'fa'
const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

// ==========================================
// i18n - dashboard chrome strings (fa / en / ja)
// ==========================================
const DASH_I18N = {
  fa: {
    locale: 'fa-IR',
    title: 'پروکسی AmirCollider',
    subtitle: 'سامانه مدیریت احراز هویت OAuth',
    langName: 'فارسی',
    themeToLight: 'حالت روشن',
    themeToDark: 'حالت تاریک',
    statVersion: 'نسخه',
    statGames: 'بازی فعال',
    statEndpoints: 'سرویس API',
    statLanguages: 'زبان',
    sectionGames: 'بازی‌های فعال',
    sectionHighlights: 'ویژگی‌های کلیدی',
    hlMultilang: 'سه‌زبانه',
    hlMultilangDesc: 'پشتیبانی کامل فارسی، انگلیسی و ژاپنی با چیدمان درست راست‌چین و چپ‌چین.',
    hlTheme: 'روشن و تاریک',
    hlThemeDesc: 'تم خودکار بر پایه سیستم، با امکان تغییر دستی و ماندگاری انتخاب.',
    hlEdge: 'اجرا روی لبه شبکه',
    hlEdgeDesc: 'اجرا روی شبکه جهانی Cloudflare برای پاسخ‌دهی سریع و پایدار.',
    navMetrics: 'متریک‌ها',
    navTestPanel: 'پنل تست',
    footerTagline: 'سامانه پروکسی OAuth برای بازی‌های AmirCollider.',
    footerPowered: 'اجرا شده روی Cloudflare Workers',
    // service test runtime
    rTesting: 'در حال بررسی…',
    rServiceUp: 'سرویس فعال است',
    rPingResult: 'نتیجه تست پینگ',
    rMetrics: 'متریک‌های سیستم',
    rConnError: 'خطا در ارتباط',
    rPing: 'پینگ',
    rGame: 'بازی',
    rTime: 'زمان',
    rVersion: 'نسخه',
    rQuality: 'کیفیت',
    rGames: 'تعداد بازی‌ها',
    rEndpoints: 'تعداد سرویس‌ها',
    rViewFull: 'مشاهده صفحه کامل',
    rUnknown: 'نامشخص',
    qExcellent: 'عالی',
    qGood: 'خوب',
    qAcceptable: 'قابل قبول'
  },
  en: {
    locale: 'en-US',
    title: 'AmirCollider Proxy',
    subtitle: 'OAuth authentication management',
    langName: 'English',
    themeToLight: 'Light mode',
    themeToDark: 'Dark mode',
    statVersion: 'Version',
    statGames: 'Active games',
    statEndpoints: 'API services',
    statLanguages: 'Languages',
    sectionGames: 'Active games',
    sectionHighlights: 'Key features',
    hlMultilang: 'Trilingual',
    hlMultilangDesc: 'Full Persian, English and Japanese support with correct RTL and LTR layout.',
    hlTheme: 'Light & dark',
    hlThemeDesc: 'Theme follows your system by default, with a manual toggle that remembers your choice.',
    hlEdge: 'Runs at the edge',
    hlEdgeDesc: 'Served from Cloudflare’s global network for fast, reliable responses.',
    navMetrics: 'Metrics',
    navTestPanel: 'Test panel',
    footerTagline: 'OAuth proxy for AmirCollider games.',
    footerPowered: 'Powered by Cloudflare Workers',
    rTesting: 'Checking…',
    rServiceUp: 'Service is up',
    rPingResult: 'Ping test result',
    rMetrics: 'System metrics',
    rConnError: 'Connection error',
    rPing: 'Ping',
    rGame: 'Game',
    rTime: 'Time',
    rVersion: 'Version',
    rQuality: 'Quality',
    rGames: 'Games',
    rEndpoints: 'Endpoints',
    rViewFull: 'Open full page',
    rUnknown: 'Unknown',
    qExcellent: 'Excellent',
    qGood: 'Good',
    qAcceptable: 'Acceptable'
  },
  ja: {
    locale: 'ja-JP',
    title: 'AmirCollider プロキシ',
    subtitle: 'OAuth 認証管理システム',
    langName: '日本語',
    themeToLight: 'ライトモード',
    themeToDark: 'ダークモード',
    statVersion: 'バージョン',
    statGames: '稼働中ゲーム',
    statEndpoints: 'API サービス',
    statLanguages: '言語',
    sectionGames: '稼働中のゲーム',
    sectionHighlights: '主な特徴',
    hlMultilang: '3 言語対応',
    hlMultilangDesc: 'ペルシャ語・英語・日本語に完全対応し、RTL と LTR を正しく表示します。',
    hlTheme: 'ライト & ダーク',
    hlThemeDesc: '既定では OS に追従し、手動切り替えと設定の保存にも対応します。',
    hlEdge: 'エッジで実行',
    hlEdgeDesc: 'Cloudflare のグローバルネットワークで高速かつ安定して配信します。',
    navMetrics: 'メトリクス',
    navTestPanel: 'テストパネル',
    footerTagline: 'AmirCollider ゲーム向けの OAuth プロキシ。',
    footerPowered: 'Cloudflare Workers で稼働',
    rTesting: '確認中…',
    rServiceUp: 'サービス稼働中',
    rPingResult: 'Ping テスト結果',
    rMetrics: 'システムメトリクス',
    rConnError: '接続エラー',
    rPing: 'Ping',
    rGame: 'ゲーム',
    rTime: '時刻',
    rVersion: 'バージョン',
    rQuality: '品質',
    rGames: 'ゲーム数',
    rEndpoints: 'サービス数',
    rViewFull: '詳細ページを開く',
    rUnknown: '不明',
    qExcellent: '優秀',
    qGood: '良好',
    qAcceptable: '許容範囲'
  }
}

// ==========================================
// i18n helpers
// ==========================================
function resolveLang(lang) {
  return DASH_I18N[lang] ? lang : DEFAULT_LANG
}

function pack(lang) {
  return DASH_I18N[resolveLang(lang)]
}

function dirFor(lang) {
  return resolveLang(lang) === 'fa' ? 'rtl' : 'ltr'
}

// Subset shipped to the client to localize live test output.
function clientStrings(lang) {
  const p = pack(lang)
  return {
    locale: p.locale,
    testing: p.rTesting,
    serviceUp: p.rServiceUp,
    pingResult: p.rPingResult,
    metrics: p.rMetrics,
    connError: p.rConnError,
    ping: p.rPing,
    game: p.rGame,
    time: p.rTime,
    version: p.rVersion,
    quality: p.rQuality,
    games: p.rGames,
    endpoints: p.rEndpoints,
    viewFull: p.rViewFull,
    unknown: p.rUnknown,
    q: { excellent: p.qExcellent, good: p.qGood, acceptable: p.qAcceptable }
  }
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
    if (DASH_I18N[code]) return code
  }
  return null
}

// Priority: explicit ?lang= -> stored cookie -> browser preference -> default.
function resolveRequestLang(url, request, cookies) {
  const fromQuery = url && url.searchParams ? url.searchParams.get('lang') : null
  if (fromQuery && DASH_I18N[fromQuery]) return fromQuery
  if (cookies.lang && DASH_I18N[cookies.lang]) return cookies.lang
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
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  metrics: '<line x1="6" y1="20" x2="6" y2="12"/><line x1="12" y1="20" x2="12" y2="5"/><line x1="18" y1="20" x2="18" y2="14"/>',
  beaker: '<path d="M9 3h6"/><path d="M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3"/><line x1="7.5" y1="15" x2="16.5" y2="15"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/>',
  contrast: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor" stroke="none"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'
}

function icon(name, cls) {
  return '<svg class="' + (cls || 'd-ic') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
    + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + (ICONS[name] || '') + '</svg>'
}

// ==========================================
// Stylesheet
// Theme via tokens; RTL/LTR via logical properties;
// motion gated behind prefers-reduced-motion.
// ==========================================
function getDashboardCSS() {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --brand: #6c63ff;
      --brand-2: #a78bfa;
      --ok: #4caf50;
      --warn: #ff9800;
      --err: #f44336;
      --radius: 18px;
      --maxw: 1280px;

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
        --bg-1: #f4f6fb;
        --bg-2: #e7ecf7;
        --surface: rgba(255,255,255,0.70);
        --surface-2: #ffffff;
        --border: rgba(20,22,33,0.10);
        --text: rgba(22,24,33,0.92);
        --text-dim: rgba(22,24,33,0.56);
        color-scheme: light;
      }
    }

    /* Explicit page toggle always wins. */
    :root[data-theme="light"] {
      --bg-1: #f4f6fb;
      --bg-2: #e7ecf7;
      --surface: rgba(255,255,255,0.70);
      --surface-2: #ffffff;
      --border: rgba(20,22,33,0.10);
      --text: rgba(22,24,33,0.92);
      --text-dim: rgba(22,24,33,0.56);
      color-scheme: light;
    }
    :root[data-theme="dark"] {
      --bg-1: #0b0e16;
      --bg-2: #141a2e;
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
      gap: 16px; flex-wrap: wrap; margin-block-end: 28px;
    }
    .brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
    .brand-logo {
      width: 52px; height: 52px; border-radius: 15px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      background: var(--surface-2); border: 1px solid var(--border);
      overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,0.18);
    }
    .brand-logo img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .brand-name { font-weight: 800; font-size: 1.05em; letter-spacing: 0.2px; line-height: 1.2; }
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
    .d-ic { width: 18px; height: 18px; }
    .seg button:focus-visible,
    .icon-btn:focus-visible,
    .syslink:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }

    /* ---------- hero ---------- */
    .hero { text-align: center; margin: 18px 0 30px; }
    .hero h1 {
      font-size: clamp(2em, 5vw, 3em); font-weight: 800; letter-spacing: 0.3px;
      background: linear-gradient(135deg, var(--text), color-mix(in srgb, var(--brand) 55%, var(--text)));
      -webkit-background-clip: text; background-clip: text; color: transparent;
    }
    .hero p { margin-block-start: 8px; color: var(--text-dim); font-size: 1.02em; }
    .pill {
      display: inline-flex; align-items: center; gap: 8px; margin-block-start: 16px;
      padding: 7px 16px; border-radius: 20px; font-size: 0.85em; font-weight: 700;
      color: color-mix(in srgb, var(--brand) 45%, var(--text));
      background: color-mix(in srgb, var(--brand) 14%, transparent);
      border: 1px solid color-mix(in srgb, var(--brand) 38%, transparent);
    }
    .pill .dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--ok); box-shadow: 0 0 0 0 color-mix(in srgb, var(--ok) 60%, transparent);
    }

    /* ---------- stats ---------- */
    .stats {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 14px; margin: 6px 0 38px;
    }
    .stat {
      padding: 22px 18px; border-radius: var(--radius); text-align: center;
      background: var(--surface); border: 1px solid var(--border);
      transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
    }
    .stat:hover {
      transform: translateY(-4px);
      border-color: color-mix(in srgb, var(--brand) 45%, var(--border));
      background: var(--surface-2);
    }
    .stat-num {
      font-size: 2.3em; font-weight: 800; line-height: 1;
      color: color-mix(in srgb, var(--brand) 40%, var(--text));
    }
    .stat-label { margin-block-start: 8px; font-size: 0.86em; color: var(--text-dim); }

    /* ---------- section titles ---------- */
    .section-title {
      display: flex; align-items: center; gap: 12px;
      margin: 8px 0 18px; font-size: 1.35em; font-weight: 800;
    }
    .section-title::after {
      content: ''; flex: 1; height: 1px;
      background: linear-gradient(90deg, var(--border), transparent);
    }

    .games-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
      gap: 22px; margin-block-end: 44px;
    }

    /* ---------- highlights ---------- */
    .highlights {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px; margin-block-end: 44px;
    }
    .hl {
      padding: 22px; border-radius: var(--radius);
      background: var(--surface); border: 1px solid var(--border);
      transition: transform 0.2s ease, border-color 0.2s ease;
    }
    .hl:hover {
      transform: translateY(-4px);
      border-color: color-mix(in srgb, var(--brand) 40%, var(--border));
    }
    .hl-ic {
      width: 42px; height: 42px; border-radius: 12px;
      display: flex; align-items: center; justify-content: center;
      color: color-mix(in srgb, var(--brand) 60%, var(--text));
      background: color-mix(in srgb, var(--brand) 14%, transparent);
      border: 1px solid color-mix(in srgb, var(--brand) 30%, transparent);
      margin-block-end: 14px;
    }
    .hl-ic svg { width: 22px; height: 22px; }
    .hl h3 { font-size: 1.05em; font-weight: 700; margin-block-end: 6px; }
    .hl p  { font-size: 0.9em; line-height: 1.6; color: var(--text-dim); }

    /* ---------- system links ---------- */
    .syslinks { display: flex; flex-wrap: wrap; gap: 12px; margin-block-end: 44px; }
    .syslink {
      display: inline-flex; align-items: center; gap: 9px;
      padding: 11px 18px; border-radius: 13px; text-decoration: none;
      font-weight: 600; font-size: 0.9em; color: var(--text);
      background: var(--surface); border: 1px solid var(--border);
      transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
    }
    .syslink:hover {
      transform: translateY(-2px); background: var(--surface-2);
      border-color: color-mix(in srgb, var(--brand) 40%, var(--border));
    }
    .syslink svg { width: 18px; height: 18px; color: color-mix(in srgb, var(--brand) 55%, var(--text)); }

    /* ---------- service test output ---------- */
    .result-box.is-busy,
    .result-box.is-ok,
    .result-box.is-warn,
    .result-box.is-err {
      padding: 13px 15px; border-radius: 12px;
      background: var(--surface-2); border: 1px solid var(--border);
      border-inline-start: 3px solid var(--text-dim);
    }
    .result-box:empty { display: none; }
    .result-box.is-ok   { border-inline-start-color: var(--ok); }
    .result-box.is-warn { border-inline-start-color: var(--warn); }
    .result-box.is-err  { border-inline-start-color: var(--err); }
    .result-box .r-head { font-weight: 700; margin-block-end: 6px; display: flex; align-items: center; gap: 8px; }
    .result-box .r-head .r-dot { width: 9px; height: 9px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
    .result-box.is-ok   .r-head { color: var(--ok); }
    .result-box.is-warn .r-head { color: var(--warn); }
    .result-box.is-err  .r-head { color: var(--err); }
    .result-box .r-row { display: flex; gap: 8px; padding: 1px 0; color: var(--text); }
    .result-box .r-key { color: var(--text-dim); }
    .result-box .r-link {
      display: inline-block; margin-block-start: 8px; text-decoration: none; font-weight: 600;
      color: color-mix(in srgb, var(--brand) 55%, var(--text));
    }
    .result-box .r-link:hover { text-decoration: underline; }
    .spinner {
      width: 15px; height: 15px; border-radius: 50%; display: inline-block;
      border: 2px solid var(--border); border-top-color: var(--brand);
      vertical-align: -2px; margin-inline-end: 7px;
    }

    /* ---------- footer ---------- */
    footer {
      text-align: center; padding: 28px; border-radius: var(--radius);
      background: var(--surface); border: 1px solid var(--border); color: var(--text-dim);
    }
    footer .f-name { color: var(--text); font-weight: 800; font-size: 1.05em; }
    footer .f-meta { margin-block-start: 6px; font-size: 0.85em; }
    footer .f-meta b { color: color-mix(in srgb, var(--brand) 45%, var(--text)); }

    @media (max-width: 480px) {
      .games-grid { grid-template-columns: 1fr; }
      .seg button { padding: 6px 9px; }
    }

    /* ---------- motion (off when the user prefers reduced motion) ---------- */
    @media (prefers-reduced-motion: no-preference) {
      .topbar, .hero, .stats, .highlights, .syslinks, footer { animation: dRise 0.5s cubic-bezier(0.16,1,0.3,1) both; }
      .hero      { animation-delay: 0.05s; }
      .stats     { animation-delay: 0.10s; }
      .section-title, .games-grid { animation: dRise 0.5s cubic-bezier(0.16,1,0.3,1) both; animation-delay: 0.14s; }
      .highlights{ animation-delay: 0.18s; }
      .syslinks  { animation-delay: 0.22s; }
      .pill .dot { animation: dPulse 1.9s ease-in-out infinite; }
      .spinner   { animation: dSpin 0.7s linear infinite; }
    }
    @keyframes dRise  { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes dPulse { 0%,100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--ok) 60%, transparent); } 50% { box-shadow: 0 0 0 5px color-mix(in srgb, var(--ok) 0%, transparent); } }
    @keyframes dSpin  { to { transform: rotate(360deg); } }
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
// Partials
// ==========================================
function renderTopbar(lang, amirLogo) {
  const p = pack(lang)
  const cur = resolveLang(lang)
  const langs = [['fa', DASH_I18N.fa.langName], ['en', DASH_I18N.en.langName], ['ja', DASH_I18N.ja.langName]]

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
          <span class="brand-sub">${escapeHtml(p.subtitle)}</span>
        </span>
      </div>
      <div class="controls">
        <div class="seg" role="group" aria-label="${escapeHtml(p.langName)}">${segButtons}</div>
        <button type="button" id="themeBtn" class="icon-btn" onclick="acToggleTheme()"
                aria-label="${escapeHtml(p.themeToDark)}">${icon('contrast')}</button>
      </div>
    </div>`
}

function renderHero(lang, version) {
  const p = pack(lang)
  return `
    <div class="hero">
      <h1>${escapeHtml(p.title)}</h1>
      <p>${escapeHtml(p.subtitle)}</p>
      <span class="pill"><span class="dot"></span>v${escapeHtml(version)}</span>
    </div>`
}

function renderStats(lang, gamesCount, routesCount) {
  const p = pack(lang)
  const major = String(CONFIG.VERSION.split('.').slice(0, 2).join('.'))
  const stats = [
    { value: major, label: p.statVersion },
    { value: String(gamesCount), label: p.statGames },
    { value: String(routesCount), label: p.statEndpoints },
    { value: '3', label: p.statLanguages }
  ]
  const cells = stats.map(s =>
    '<div class="stat"><div class="stat-num" data-count="' + escapeHtml(s.value) + '">'
    + escapeHtml(s.value) + '</div><div class="stat-label">' + escapeHtml(s.label) + '</div></div>'
  ).join('')
  return '<div class="stats">' + cells + '</div>'
}

function renderHighlights(lang) {
  const p = pack(lang)
  const items = [
    { ic: 'globe', title: p.hlMultilang, desc: p.hlMultilangDesc },
    { ic: 'contrast', title: p.hlTheme, desc: p.hlThemeDesc },
    { ic: 'bolt', title: p.hlEdge, desc: p.hlEdgeDesc }
  ]
  const cards = items.map(it =>
    '<div class="hl"><div class="hl-ic">' + icon(it.ic) + '</div>'
    + '<h3>' + escapeHtml(it.title) + '</h3><p>' + escapeHtml(it.desc) + '</p></div>'
  ).join('')
  return `
    <div class="section-title">${escapeHtml(p.sectionHighlights)}</div>
    <div class="highlights">${cards}</div>`
}

function renderSystemLinks(lang) {
  const p = pack(lang)
  const links = [
    { href: '/metrics', ic: 'metrics', label: p.navMetrics },
    { href: '/testsite', ic: 'beaker', label: p.navTestPanel }
  ]
  return '<div class="syslinks">' + links.map(l =>
    '<a class="syslink" href="' + escapeHtml(l.href) + '">' + icon(l.ic) + '<span>' + escapeHtml(l.label) + '</span></a>'
  ).join('') + '</div>'
}

function renderFooter(lang, version) {
  const p = pack(lang)
  return `
    <footer>
      <div class="f-name">AmirCollider Games</div>
      <div class="f-meta">${escapeHtml(p.footerTagline)}</div>
      <div class="f-meta">${escapeHtml(p.footerPowered)} &middot; <b>v${escapeHtml(version)}</b></div>
    </footer>`
}

// ==========================================
// Client runtime
// One fetch+render path drives all three service tests (DRY).
// No backticks/${} inside this block other than the injected data.
// ==========================================
function getClientScript(baseUrl, lang) {
  const injected = 'var AC = '
    + JSON.stringify({ baseUrl: baseUrl, lang: resolveLang(lang), t: clientStrings(lang) })
    + ';'

  const body = `
    function acById(id) { return document.getElementById(id); }

    function acEsc(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ---- theme ----
    function acApplyThemeLabel() {
      var btn = acById('themeBtn');
      if (!btn) return;
      var dark = getComputedStyle(document.documentElement).colorScheme.indexOf('dark') !== -1;
      btn.setAttribute('aria-label', dark ? 'Light mode' : 'Dark mode');
    }
    function acToggleTheme() {
      var cur = document.documentElement.getAttribute('data-theme');
      var dark = getComputedStyle(document.documentElement).colorScheme.indexOf('dark') !== -1;
      var next = dark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('ac_theme', next); } catch (e) {}
      document.cookie = 'theme=' + next + ';path=/;max-age=31536000;samesite=lax';
      acApplyThemeLabel();
    }
    window.acToggleTheme = acToggleTheme;

    // ---- language (server-driven; reloads so RTL/LTR stays correct) ----
    function acSetLang(code) {
      try { localStorage.setItem('ac_lang', code); } catch (e) {}
      document.cookie = 'lang=' + code + ';path=/;max-age=31536000;samesite=lax';
      window.location.href = AC.baseUrl + '/?lang=' + encodeURIComponent(code);
    }
    window.acSetLang = acSetLang;

    // ---- localized helpers ----
    function acLocalTime(ts) {
      try { return new Date(ts).toLocaleTimeString(AC.t.locale); }
      catch (e) { return String(ts || ''); }
    }
    function acQuality(key) {
      return (AC.t.q && AC.t.q[key]) ? AC.t.q[key] : AC.t.unknown;
    }
    function acRow(key, value) {
      return '<div class="r-row"><span class="r-key">' + acEsc(key) + ':</span>'
        + '<span dir="auto">' + acEsc(value) + '</span></div>';
    }
    function acHead(text) {
      return '<div class="r-head"><span class="r-dot"></span><span dir="auto">' + acEsc(text) + '</span></div>';
    }
    function acFullLink(href) {
      return '<a class="r-link" href="' + acEsc(href) + '" target="_blank" rel="noopener">'
        + acEsc(AC.t.viewFull) + '</a>';
    }
    function acClassForPing(ms) {
      return ms > 500 ? 'is-err' : ms > 200 ? 'is-warn' : 'is-ok';
    }

    function acBusy(box) {
      box.className = 'result-box is-busy';
      box.innerHTML = '<span class="spinner"></span><span dir="auto">' + acEsc(AC.t.testing) + '</span>';
    }
    function acError(box, message) {
      box.className = 'result-box is-err';
      box.innerHTML = acHead(AC.t.connError) + '<div class="r-row" dir="auto">' + acEsc(message) + '</div>';
    }

    // ---- one path for all three tests ----
    function acRunTest(gameId, kind) {
      var box = acById('result-' + gameId);
      if (!box) return;
      acBusy(box);

      var path = kind === 'metrics' ? '/metrics' : '/' + gameId + '/' + kind;
      var started = (window.performance && performance.now) ? performance.now() : Date.now();

      fetch(AC.baseUrl + path, { headers: { 'Accept': 'application/json' } })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function (data) {
          var elapsed = Math.round(((window.performance && performance.now) ? performance.now() : Date.now()) - started);
          acRender(box, kind, data, elapsed, gameId);
        })
        .catch(function (err) { acError(box, err && err.message ? err.message : String(err)); });
    }

    function acRender(box, kind, data, elapsed, gameId) {
      var html = '';
      var cls = 'is-ok';

      if (kind === 'health') {
        var name = (data && data.game && data.game.name) ? data.game.name : AC.t.unknown;
        cls = acClassForPing(elapsed);
        html = acHead(AC.t.serviceUp)
          + acRow(AC.t.ping, elapsed + 'ms')
          + acRow(AC.t.game, name)
          + acRow(AC.t.time, acLocalTime(data && data.timestamp))
          + acRow(AC.t.version, (data && data.version) || AC.t.unknown)
          + acFullLink(AC.baseUrl + '/' + gameId + '/health');

      } else if (kind === 'ping') {
        var ms = (data && typeof data.ping !== 'undefined') ? data.ping : elapsed;
        cls = acClassForPing(ms);
        html = acHead(AC.t.pingResult)
          + acRow(AC.t.ping, ms + 'ms')
          + acRow(AC.t.quality, acQuality(data && data.quality))
          + acRow(AC.t.game, (data && data.game) || AC.t.unknown)
          + acFullLink(AC.baseUrl + '/' + gameId + '/ping');

      } else {
        cls = 'is-ok';
        html = acHead(AC.t.metrics)
          + acRow(AC.t.version, (data && data.version) || AC.t.unknown)
          + acRow(AC.t.games, (data && data.games != null) ? data.games : AC.t.unknown)
          + acRow(AC.t.endpoints, (data && data.endpoints != null) ? data.endpoints : AC.t.unknown)
          + acFullLink(AC.baseUrl + '/metrics');
      }

      box.className = 'result-box ' + cls;
      box.innerHTML = html;
    }

    window.testHealth  = function (id) { acRunTest(id, 'health'); };
    window.testPing    = function (id) { acRunTest(id, 'ping'); };
    window.testMetrics = function (id) { acRunTest(id, 'metrics'); };

    // ---- subtle count-up for stat numbers ----
    function acCountUp() {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      var nodes = document.querySelectorAll('.stat-num[data-count]');
      Array.prototype.forEach.call(nodes, function (node) {
        var target = node.getAttribute('data-count');
        if (!/^[0-9.]+$/.test(target)) return;
        var end = parseFloat(target);
        var decimals = (target.indexOf('.') !== -1) ? target.split('.')[1].length : 0;
        var start = null, dur = 750;
        function step(ts) {
          if (start === null) start = ts;
          var p = Math.min((ts - start) / dur, 1);
          var eased = 1 - Math.pow(1 - p, 3);
          node.textContent = (end * eased).toFixed(decimals);
          if (p < 1) requestAnimationFrame(step); else node.textContent = target;
        }
        node.textContent = (0).toFixed(decimals);
        requestAnimationFrame(step);
      });
    }

    acApplyThemeLabel();
    acCountUp();
  `

  return '<script>\n' + injected + '\n' + body + '\n</script>'
}

// ==========================================
// Page: Dashboard
// ==========================================
function createDashboardPage(GAMES, baseUrl, routesCount, lang, theme) {
  const amirLogo = CONFIG.AMIR_LOGO
  const resolved = resolveLang(lang)
  const dir = dirFor(resolved)
  const themeAttr = theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : ''

  return `<!DOCTYPE html>
<html dir="${dir}" lang="${resolved}"${themeAttr}>
<head>
  ${getPageHead({ title: `${pack(resolved).title} - v${CONFIG.VERSION}`, amirLogo })}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  ${getThemeBootScript()}
  <style>${getDashboardCSS()}</style>
</head>
<body>
  <div class="wrap">
    ${renderTopbar(resolved, amirLogo)}
    ${renderHero(resolved, CONFIG.VERSION)}
    ${renderStats(resolved, Object.keys(GAMES).length, routesCount)}

    <div class="section-title">${escapeHtml(pack(resolved).sectionGames)}</div>
    ${createGamesCardsHTML(GAMES, baseUrl, { lang: resolved })}

    ${renderHighlights(resolved)}
    ${renderSystemLinks(resolved)}
    ${renderFooter(resolved, CONFIG.VERSION)}
  </div>

  ${getClientScript(baseUrl, resolved)}
</body>
</html>`
}

// ==========================================
// Handler: Dashboard
// routesCount comes from worker.js (availableEndpoints) to keep this
// page decoupled from the route table.
// ==========================================
export async function handleDashboard(url, request, gameId, requestId, GAMES, _env, availableEndpoints = []) {
  const cookies = parseCookies(request)
  const lang = resolveRequestLang(url, request, cookies)
  const theme = resolveRequestTheme(cookies)

  const headers = {}
  // Persist an explicit ?lang= choice so plain visits to "/" keep it.
  const requestedLang = url && url.searchParams ? url.searchParams.get('lang') : null
  if (requestedLang && DASH_I18N[requestedLang]) {
    headers['Set-Cookie'] = `lang=${requestedLang}; Path=/; Max-Age=${LANG_COOKIE_MAX_AGE}; SameSite=Lax`
  }

  return createHtmlResponse(
    createDashboardPage(GAMES, url.origin, availableEndpoints.length, lang, theme),
    200,
    headers
  )
}
