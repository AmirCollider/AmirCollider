// ==========================================
// Pages/Dashboard.js
// Main Dashboard Page Handler
// AmirCollider Games - Worker Proxy


// ==========================================
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
//   - Language: server-resolved. It lives in the PATH (`/en/`, `/ja/`,
//     and the bare path for the default) rather than in a query
//     string - see Core/Locale.js for why that distinction decided
//     whether this site was indexable in more than one language.
//     Switching reloads so RTL/LTR is always correct (chrome and SSR
//     cards switch together, no client re-flow bugs).
//
// Extending
//   - Add a UI language: add one entry to DASH_I18N below.
//   - Add a stat / highlight / system link: edit the data arrays in
//     their respective section; the renderers are data-driven.
// ==========================================

import { CONFIG } from '../Config.js'
import { getPageHead } from '../Core/DesignSystem.js'
import { createHtmlResponse } from '../Core/Http.js'
import { createGamesCardsHTML } from './GameCards.js'
import { readPlayerSession } from '../Games/Session.js'
import { toolsFor } from '../Content/ToolsCatalog.js'
import { localizedPath } from '../Core/Locale.js'
import { resolveGames } from '../Games/Registry.js'

import { escapeHtml, safeColor } from '../Core/Html.js'
import { themeBootScript } from '../Core/PageChrome.js'
import { seoHead, videoGameLd, softwareApplicationLd, personLd, itemListLd, keywordList } from '../Core/Seo.js'
import { siteNavCss, siteHeader, siteFooter, siteBackToTop, siteChromeScript } from '../Core/SiteNav.js'
import { dirFor, langCookieHeader, parseCookies, resolveLang, resolveRequestLang, resolveRequestTheme } from '../Core/RequestContext.js'


// ==========================================
// i18n - dashboard chrome strings (fa / en / ja)
// ==========================================
const DASH_I18N = {
  fa: {
    locale: 'fa-IR',
    // The <h1> and the <title> of the site's front page. It used to
    // say "AmirCollider proxy / OAuth authentication management",
    // which describes the plumbing rather than the site: nobody
    // searching for Neon Katana or Unity DocSnap types either of
    // those words, and the one page with the authority to rank for
    // the brand was spending it on an implementation detail.
    title: 'AmirCollider',
    tagline: 'بازی‌های اندروید، کامپیوتر و تحت‌وب — و افزونه‌های یونیتی',
    metaTitle: 'AmirCollider — بازی‌های اندروید و کامپیوتر، و ابزارهای یونیتی',
    metaDesc: 'AmirCollider سازنده‌ی بازی‌های اندروید، کامپیوتر و تحت‌وب مانند Neon Katana، و افزونه‌های ادیتور یونیتی مانند Unity DocSnap و Unity DirectTMP است.',

    // The front page's own terms. Every game name and tool name is
    // appended automatically where the graph is built, and the
    // brand's names are prepended inside seoHead().
    keywords: ['بازی‌ساز مستقل', 'ساخت بازی با یونیتی', 'بازی اندروید رایگان', 'افزونه یونیتی', 'استودیو بازی‌سازی'],
    // The one paragraph of prose above the fold. See renderHero().
    lede: 'من AmirCollider هستم؛ بازی می‌سازم و برای ساختنشان ابزار می‌نویسم. هرچه ساخته‌ام این‌جاست: بازی‌هایی مثل Neon Katana برای اندروید، و افزونه‌هایی برای ادیتور یونیتی مثل Unity DocSnap و Unity DirectTMP که کارهای تکراری ساخت بازی را کوتاه‌تر می‌کنند. همه‌چیز رایگان قابل امتحان است و کدهای بیشترشان باز است.',
    subtitle: 'سامانه مدیریت احراز هویت OAuth',
    langName: 'فارسی',
    themeToLight: 'حالت روشن',
    themeToDark: 'حالت تاریک',
    statVersion: 'نسخه',
    statGames: 'بازی فعال',
    statEndpoints: 'سرویس API',
    statLanguages: 'زبان',
    statEdge: 'شبکه جهانی',
    statEdgeValue: 'جهانی',
    sectionGames: 'بازی‌های فعال',
    sectionHighlights: 'ویژگی‌های کلیدی',
    hlMultilang: 'سه‌زبانه',
    hlMultilangDesc: 'پشتیبانی کامل فارسی، انگلیسی و ژاپنی با چیدمان درست راست‌چین و چپ‌چین.',
    hlTheme: 'روشن و تاریک',
    hlThemeDesc: 'تم خودکار بر پایه سیستم، با امکان تغییر دستی و ماندگاری انتخاب.',
    hlEdge: 'اجرا روی لبه شبکه',
    hlEdgeDesc: 'اجرا روی شبکه جهانی Cloudflare برای پاسخ‌دهی سریع و پایدار.',
    sectionTools: 'ابزارها',
    toolsAll: 'همه‌ی ابزارها',
    navMetrics: 'متریک‌ها',
    navTestPanel: 'پنل تست',
    navReleaseNotes: 'یادداشت‌های انتشار',
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
    title: 'AmirCollider',
    tagline: 'Games for Android, PC and the web — and Unity editor extensions',
    metaTitle: 'AmirCollider — Android and PC games, and Unity editor tools',
    metaDesc: 'AmirCollider builds games for Android, PC and the web such as Neon Katana, and Unity editor extensions such as Unity DocSnap and Unity DirectTMP.',
    keywords: ['indie game developer', 'Unity game development', 'free Android games', 'Unity editor extension', 'game studio'],
    lede: 'I am AmirCollider — I make games, and I write the tools I need to make them. Everything I have built lives here: games such as Neon Katana for Android, and Unity editor extensions such as Unity DocSnap and Unity DirectTMP that take the repetition out of building them. All of it is free to try, and most of it is open source.',
    subtitle: 'OAuth authentication management',
    langName: 'English',
    themeToLight: 'Light mode',
    themeToDark: 'Dark mode',
    statVersion: 'Version',
    statGames: 'Active games',
    statEndpoints: 'API services',
    statLanguages: 'Languages',
    statEdge: 'Edge network',
    statEdgeValue: 'Global',
    sectionGames: 'Active games',
    sectionHighlights: 'Key features',
    hlMultilang: 'Trilingual',
    hlMultilangDesc: 'Full Persian, English and Japanese support with correct RTL and LTR layout.',
    hlTheme: 'Light & dark',
    hlThemeDesc: 'Theme follows your system by default, with a manual toggle that remembers your choice.',
    hlEdge: 'Runs at the edge',
    hlEdgeDesc: 'Served from Cloudflare’s global network for fast, reliable responses.',
    sectionTools: 'Tools',
    toolsAll: 'All tools',
    navMetrics: 'Metrics',
    navTestPanel: 'Test panel',
    navReleaseNotes: 'Release notes',
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
    title: 'AmirCollider',
    tagline: 'Android・PC・ウェブ向けゲームと Unity エディタ拡張',
    metaTitle: 'AmirCollider — Android ゲームと Unity エディタ拡張',
    metaDesc: 'AmirCollider は Neon Katana などの Android・PC・ウェブ向けゲームと、Unity DocSnap・Unity DirectTMP などの Unity エディタ拡張を開発しています。',
    keywords: ['インディーゲーム開発者', 'Unity ゲーム開発', '無料 Android ゲーム', 'Unity エディタ拡張', 'ゲームスタジオ'],
    lede: 'AmirCollider です。ゲームを作り、そのために必要なツールも自分で書いています。ここに置いてあるのは、Android 向けの Neon Katana のようなゲームと、制作の繰り返し作業を減らす Unity DocSnap・Unity DirectTMP のような Unity エディタ拡張です。どれも無料で試せて、ほとんどはソースを公開しています。',
    subtitle: 'OAuth 認証管理システム',
    langName: '日本語',
    themeToLight: 'ライトモード',
    themeToDark: 'ダークモード',
    statVersion: 'バージョン',
    statGames: '稼働中ゲーム',
    statEndpoints: 'API サービス',
    statLanguages: '言語',
    statEdge: 'エッジ配信',
    statEdgeValue: 'グローバル',
    sectionGames: '稼働中のゲーム',
    sectionHighlights: '主な特徴',
    hlMultilang: '3 言語対応',
    hlMultilangDesc: 'ペルシャ語・英語・日本語に完全対応し、RTL と LTR を正しく表示します。',
    hlTheme: 'ライト & ダーク',
    hlThemeDesc: '既定では OS に追従し、手動切り替えと設定の保存にも対応します。',
    hlEdge: 'エッジで実行',
    hlEdgeDesc: 'Cloudflare のグローバルネットワークで高速かつ安定して配信します。',
    sectionTools: 'ツール',
    toolsAll: 'すべてのツール',
    navMetrics: 'メトリクス',
    navTestPanel: 'テストパネル',
    navReleaseNotes: 'リリースノート',
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


function pack(lang) {
  return DASH_I18N[resolveLang(lang)]
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
// SVG icon set (stroke uses currentColor)
// ==========================================
const ICONS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  metrics: '<line x1="6" y1="20" x2="6" y2="12"/><line x1="12" y1="20" x2="12" y2="5"/><line x1="18" y1="20" x2="18" y2="14"/>',
  beaker: '<path d="M9 3h6"/><path d="M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3"/><line x1="7.5" y1="15" x2="16.5" y2="15"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/>',
  contrast: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor" stroke="none"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  notes: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>',
  tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
  gamepad: '<line x1="6" y1="11" x2="10" y2="11"/><line x1="8" y1="9" x2="8" y2="13"/><line x1="15" y1="12" x2="15.01" y2="12"/><line x1="18" y1="10" x2="18.01" y2="10"/><rect x="2" y="6" width="20" height="12" rx="2"/>',
  route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>'
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

    /* ==========================================
       Hide scrollbars (scrolling stays functional)
       ========================================== */
    html { scrollbar-width: none; -ms-overflow-style: none; }
    html::-webkit-scrollbar { width: 0; height: 0; display: none; }

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

   /* ---------- smooth theme transition (light <-> dark) ---------- */
    @media (prefers-reduced-motion: no-preference) {
      body,
      .seg, .icon-btn, .stat, .section-title, .pill,
      .result-box, .syslink, footer {
        transition:
          background-color 0.35s ease,
          color 0.35s ease,
          border-color 0.35s ease,
          box-shadow 0.35s ease;
      }
      ::view-transition-old(root),
      ::view-transition-new(root) {
        animation-duration: 0.4s;
        animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
      }
    }

    .wrap { max-width: var(--maxw); margin: 0 auto; }

    /* The header spans the viewport. The body pads itself, so the
       bar pulls back out to the edges and puts that padding back
       inside, rather than floating in a gutter. */
    .ac-nav { margin: -24px -20px 24px; padding-inline: 20px; }
    [id] { scroll-margin-top: 24px; }

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
    /* The paragraph a search engine quotes. Held to a readable
       measure and centred with the rest of the hero; everything
       about it is ordinary except that it is the only run of prose
       above the fold, which is the entire point of it. */
    .hero .lede {
      max-width: 62ch; margin-inline: auto; margin-block-start: 14px;
      font-size: 1em; line-height: 1.9; color: var(--text-dim);
    }
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
      display: flex; flex-direction: column; align-items: center; gap: 9px;
      transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
    }
    .stat-ic { display: inline-flex; color: color-mix(in srgb, var(--brand) 55%, var(--text)); }
    .stat-ic svg { width: 22px; height: 22px; }
    .stat:hover {
      transform: translateY(-4px);
      border-color: color-mix(in srgb, var(--brand) 45%, var(--border));
      background: var(--surface-2);
    }
    .stat-num {
      font-size: 2.3em; font-weight: 800; line-height: 1;
      color: color-mix(in srgb, var(--brand) 40%, var(--text));
    }
    .stat-label { font-size: 0.86em; color: var(--text-dim); }

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

    /* ---------- tools (the editor extensions) ----------
       Each card sets --tool / --tool-2 inline to its own
       brand colour, so two products by one author keep two
       identities instead of both being painted in the site's
       violet. --brand is the fallback for a card that somehow
       arrives without one. */
    .tools-strip { display: grid; gap: 14px; margin-block-end: 14px; }

    .tool-card {
      display: flex; align-items: center; gap: 18px; flex-wrap: wrap;
      padding: 22px; text-decoration: none; color: var(--text);
      border-radius: var(--radius); background: var(--surface);
      border: 1px solid color-mix(in srgb, var(--tool, var(--brand)) 30%, var(--border));
      transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
    }
    .tool-card:hover {
      transform: translateY(-4px); background: var(--surface-2);
      border-color: color-mix(in srgb, var(--tool, var(--brand)) 55%, var(--border));
    }
    .tool-ic { font-size: 2.2em; line-height: 1; }
    .tool-body { flex: 1 1 260px; min-width: 0; }
    .tool-name { display: block; font-weight: 800; font-size: 1.05em; }
    .tool-desc { display: block; font-size: 0.9em; color: var(--text-dim); margin-block: 4px 10px; }
    .tool-tags { display: flex; gap: 8px; flex-wrap: wrap; }
    .tool-tag {
      font-size: 0.78em; font-weight: 700; padding: 3px 10px; border-radius: 999px;
      color: color-mix(in srgb, var(--tool, var(--brand)) 55%, var(--text));
      background: color-mix(in srgb, var(--tool, var(--brand)) 12%, transparent);
      border: 1px solid color-mix(in srgb, var(--tool, var(--brand)) 32%, transparent);
    }
    .tool-tag.is-pro {
      color: color-mix(in srgb, var(--tool-2, var(--brand)) 58%, var(--text));
      background: color-mix(in srgb, var(--tool-2, var(--brand)) 14%, transparent);
      border-color: color-mix(in srgb, var(--tool-2, var(--brand)) 38%, transparent);
    }
    .tool-cta { font-weight: 700; font-size: 0.9em; color: color-mix(in srgb, var(--tool, var(--brand)) 55%, var(--text)); }

    .tools-more { text-align: center; margin-block-end: 44px; }
    .tools-more a {
      font-size: 0.88em; font-weight: 700; text-decoration: none;
      color: color-mix(in srgb, var(--brand) 55%, var(--text));
    }

    /* ---------- system links ---------- */
    .syslinks { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin-block-end: 44px; }
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

    /* The footer is Core/SiteNav.js's now and brings its own
       styling; the rule that used to live here would have centred
       its four columns into one stack. */

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
      .tools-strip, .tools-more { animation: dRise 0.5s cubic-bezier(0.16,1,0.3,1) both; animation-delay: 0.20s; }
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
// Partials
//
// The top bar and the footer this file used to build itself now
// come from Core/SiteNav.js, which every other page also renders -
// so the brand mark, the language picker and the theme toggle are
// in the same place, in the same style, on all of them.
// ==========================================
// ==========================================
// renderHero
//
// The lede is not decoration, and it is the fix for a specific,
// visible failure.
//
// Google's result for this domain used to read:
//
//   "قابل بازی بدون اینترنت ورود با گوگل ذخیره‌ی ابری جدول
//    امتیازات خرید درون‌برنامه‌ای. خرید درون‌برنامه‌ای پرداخت با
//    ارز دیجیتال ورود به حساب با حساب گوگل."
//
// which is not a description of anything. It is the capability
// chips off the first game card, read left to right (Pages/GameCards.js).
//
// A search engine writes its own snippet when the page gives it
// nothing better, and this page gave it nothing better: a one-word
// heading, a six-word tagline, four stat tiles of digits, and then
// cards made almost entirely of two-word labels. The
// `<meta name="description">` was correct the whole time and was
// ignored, because a description with no matching prose on the page
// is a claim a snippet generator has no reason to trust.
//
// So the page now says, in one paragraph, in the reader's language,
// what it is. It sits above everything else, it is the only run of
// continuous text in the hero, and it says the same thing as the
// meta description without being a copy of it.
// ==========================================
function renderHero(lang, version) {
  const p = pack(lang)
  return `
    <div class="hero">
      <h1>${escapeHtml(p.title)}</h1>
      <p>${escapeHtml(p.tagline)}</p>
      <p class="lede">${escapeHtml(p.lede)}</p>
      <span class="pill"><span class="dot"></span>v${escapeHtml(version)}</span>
    </div>`
}

function renderStats(lang, gamesCount, routesCount) {
  const p = pack(lang)
  const major = String(CONFIG.VERSION.split('.').slice(0, 2).join('.'))
  const stats = [
    { ic: 'tag', value: major, label: p.statVersion },
    { ic: 'gamepad', value: String(gamesCount), label: p.statGames },
    { ic: 'route', value: String(routesCount), label: p.statEndpoints },
    { ic: 'globe', value: p.statEdgeValue, label: p.statEdge }
  ]
  const cells = stats.map(s =>
    '<div class="stat"><span class="stat-ic">' + icon(s.ic) + '</span>'
    + '<span class="stat-num" data-count="' + escapeHtml(s.value) + '">'
    + escapeHtml(s.value) + '</span>'
    + '<span class="stat-label">' + escapeHtml(s.label) + '</span></div>'
  ).join('')
  return '<div class="stats">' + cells + '</div>'
}


// ==========================================
// renderTools
// The Unity editor extensions, on the landing page.
// ==========================================
function renderTools(lang) {
  const p = pack(lang)

  const cards = toolsFor(resolveLang(lang)).map(tool => {
    const accent = safeColor(tool.accent, '#6c63ff')
    const accentSoft = safeColor(tool.accentSoft, accent)

    const tags = tool.tags.map(tag => {
      const cls = tag.kind === 'paid' ? ' is-pro' : ''
      return '<span class="tool-tag' + cls + '">' + escapeHtml(tag.label) + '</span>'
    }).join('')

    return `
      <a class="tool-card" href="${escapeHtml(localizedPath(tool.href, lang))}"
         style="--tool: ${accent}; --tool-2: ${accentSoft}">
        <span class="tool-ic" aria-hidden="true">${tool.mark}</span>
        <span class="tool-body">
          <span class="tool-name">${escapeHtml(tool.name)}</span>
          <span class="tool-desc">${escapeHtml(tool.description)}</span>
          <span class="tool-tags">${tags}</span>
        </span>
        <span class="tool-cta">${escapeHtml(tool.cta)} &rarr;</span>
      </a>`
  }).join('')

  return `
    <h2 class="section-title" id="tools">${escapeHtml(p.sectionTools)}</h2>
    <div class="tools-strip">${cards}</div>
    <div class="tools-more">
      <a href="${escapeHtml(localizedPath('/tools', lang))}">${escapeHtml(p.toolsAll)} &rarr;</a>
    </div>`
}


function renderSystemLinks(lang) {
  const p = pack(lang)
  const links = [
    { href: '/metrics', ic: 'metrics', label: p.navMetrics },
    { href: '/release-notes', ic: 'notes', label: p.navReleaseNotes }
  ]
  return '<div class="syslinks">' + links.map(l =>
    '<a class="syslink" href="' + escapeHtml(localizedPath(l.href, lang)) + '">'
    + icon(l.ic) + '<span>' + escapeHtml(l.label) + '</span></a>'
  ).join('') + '</div>'
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

    // Theme and language live in Core/SiteNav.js now: they are the
    // same two functions on every page, and having a second copy
    // here meant a fix to one of them silently missed this page.

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

    acCountUp();
  `

  return '<script>\n' + injected + '\n' + body + '\n</script>'
}


// ==========================================
// Page: Dashboard
// ==========================================
function createDashboardPage(GAMES, baseUrl, routesCount, lang, theme, player = null) {
  const amirLogo = CONFIG.AMIR_LOGO
  const resolved = resolveLang(lang)
  const dir = dirFor(resolved)
  const p = pack(resolved)
  const themeAttr = theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : ''
  const games = Object.values(GAMES)
  const tools = toolsFor(resolved)

  // The landing page carries the structured data for everything it
  // links to. One page describing the whole catalogue is what lets
  // a search engine connect the brand to the products.
  const graph = [
    // The same node /about carries, under the same @id. The
    // Organization on every page names this person as its founder,
    // and a reference whose target is only ever defined on one
    // other page is a reference a crawler may simply never resolve
    // - the front page is the one it is guaranteed to read.
    //
    // Structured data only. Nothing about this is visible on the
    // page, which is deliberate: the front page's own words are
    // its heading and its tagline, and that is all it needs.
    personLd(resolved),

    ...games.map(game => videoGameLd({
      id: game.id,
      name: game.name,

      // The game's name in the scripts it is searched in. The
      // front page is the one page on this site a crawler is
      // guaranteed to read, so it is the worst place for a game to
      // be nameable in one script only.
      alternateName: game.altNames || [],
      description: (game.i18n && game.i18n.description && game.i18n.description[resolved]) || game.description,
      path: '/' + game.id,
      image: game.logo,
      downloadUrl: game.myketUrl,
      sameAs: game.myketUrl ? [game.myketUrl] : [],
      identifier: game.package || '',
      lang: resolved,
      genres: (game.tags || []).map(tag => tag[resolved] || tag.en).filter(Boolean),
      keywords: keywordList(game.name, game.altNames || [],
        (game.tags || []).map(tag => tag[resolved] || tag.en))
    })),

    // ==========================================
    // The two Unity tools.
    //
    // These descriptions used to be one English sentence each,
    // hard-coded here and nowhere else - which meant the front
    // page told a crawler something about DocSnap that neither the
    // catalogue nor the product page said, in a language two
    // thirds of this site's readers do not read. Worse, the
    // sentence was wrong in the specific way the product page
    // exists to correct: "shareable snapshots" reads as a
    // screenshot tool, and being classified as one is the exact
    // problem the KEYWORDS block in Pages/UnityDocSnap.js was
    // written for.
    //
    // Read from Content/ToolsCatalog.js now, in the page's own
    // language, so all three surfaces say one thing.
    // ==========================================
    ...tools.map(tool => softwareApplicationLd({
      name: tool.name,
      description: tool.description,
      path: tool.href,
      version: tool.version,
      price: tool.pricing === 'free' ? '0' : null,
      repo: tool.repo,
      featureList: (tool.highlights || []).filter(Boolean),
      keywords: keywordList(tool.name, 'Unity', 'Unity editor extension')
    })),

    // The catalogue itself, as one list. The front page links to
    // every product this site has; saying so as a list is what
    // lets a crawler read it as a catalogue rather than as a page
    // that happens to carry several links.
    itemListLd({
      name: p.metaTitle,
      lang: resolved,
      items: [
        ...games.map(game => ({
          name: game.name,
          url: '/' + game.id,
          description: (game.i18n && game.i18n.description && game.i18n.description[resolved]) || game.description,
          image: game.logo
        })),
        ...tools.map(tool => ({ name: tool.name, url: tool.href, description: tool.description }))
      ]
    })
  ]

  // The front page answers the broadest query this site gets -
  // the brand's own name - so what it adds here is everything the
  // brand MAKES, by name, in every script those names are written
  // in. seoHead() prepends the brand terms themselves.
  // The brand leads on the front page and nowhere else. Every
  // other page's own subject comes first (see KEYWORD_CAP in
  // Core/Seo.js) - but this page's subject IS the brand, and with
  // two games and two tools to name, the sixteen-term cap was
  // reached before the brand's own terms were appended at all.
  const keywords = keywordList(
    'AmirCollider',
    'Amir Collider',
    p.keywords || [],
    games.flatMap(game => [game.name, ...(game.altNames || [])]),
    tools.map(tool => tool.name)
  )

  return `<!DOCTYPE html>
<html dir="${dir}" lang="${resolved}"${themeAttr}>
<head>
  ${getPageHead({ title: p.metaTitle, amirLogo, description: p.metaDesc })}
  ${seoHead({
    path: '/',
    title: p.metaTitle,
    description: p.metaDesc,
    lang: resolved,
    keywords,
    graph
  })}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap"></noscript>
  ${themeBootScript()}
  <style>${siteNavCss()}${getDashboardCSS()}</style>
</head>
<body>
  ${siteHeader({ lang: resolved, active: 'home' })}
  <div class="wrap">
    <main id="main">
      ${renderHero(resolved, CONFIG.VERSION)}
      ${renderStats(resolved, Object.keys(GAMES).length, routesCount)}

      <h2 class="section-title" id="games">${escapeHtml(p.sectionGames)}</h2>
      ${createGamesCardsHTML(GAMES, baseUrl, { lang: resolved, player })}

      ${renderTools(resolved)}

      ${renderSystemLinks(resolved)}
    </main>
    ${siteFooter({ lang: resolved, games })}
  </div>

  ${getClientScript(baseUrl, resolved)}
  ${siteBackToTop({ lang })}
  ${siteChromeScript()}
</body>
</html>`
}


// ==========================================
// Handler: Dashboard
// routesCount comes from Worker.js (availableEndpoints) to keep this
// page decoupled from the route table.
// ==========================================
export async function handleDashboard(url, request, gameId, requestId, GAMES, env, availableEndpoints = []) {
  const cookies = parseCookies(request)
  const lang = resolveRequestLang(url, request, cookies)
  const theme = resolveRequestTheme(cookies)

  // Persist an explicit ?lang= choice so plain visits to "/" keep it.
  const headers = langCookieHeader(url, lang)

  const games = await resolveGames(env, GAMES)

  // Whether this visitor is already signed in.
  //
  // Without it the card's button said "Sign in" to somebody who
  // had signed in ten seconds earlier and was looking at their
  // own session - which reads as the sign-in having failed. The
  // session is site-wide, so one read answers it for every card.
  const player = await readPlayerSession(env, GAMES, request).catch(() => null)

  return createHtmlResponse(
    createDashboardPage(games, url.origin, availableEndpoints.length, lang, theme, player),
    200,
    headers
  )
}
