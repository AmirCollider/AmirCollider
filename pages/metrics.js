// ==========================================
// pages/metrics.js
// Metrics Dashboard Page Handler
// AmirCollider Games - Worker Proxy
// ==========================================
//
// Integration contract (do not break without updating callers)
//   - Public entry:  handleMetrics(url, request, gameId, requestId,
//                                  GAMES, env, availableEndpoints)
//   - Accept: application/json  -> stable machine-readable payload
//     (version / worker_type / games / endpoints / security / config /
//      availableEndpoints / timestamp / requestId). Consumed by the
//      dashboard live test and external clients; keep keys stable.
//
// Theme & language
//   - Theme: <html data-theme="light|dark">; absent = follow the OS.
//     Stored in localStorage 'ac_theme' + cookie 'theme' (shared with
//     dashboard/leaderboard) and applied before paint to avoid flicker.
//   - Language: server-resolved from ?lang= -> cookie -> Accept-Language,
//     then switchable client-side with no reload. Layout uses logical
//     properties so RTL/LTR stays correct on instant switch.
//
// Extending
//   - Add a UI language: add one entry to I18N + LANG_META below.
// ==========================================

import { CONFIG } from '../config.js'
import { getPageHead } from '../shared-styles.js'
import { createJsonResponse, createHtmlResponse } from '../utils.js'

const LANGS = ['fa', 'en', 'ja']
const DEFAULT_LANG = 'fa'

// ==========================================
// i18n - page strings (fa / en / ja)
// ==========================================
const I18N = {
  fa: {
    title: 'متریک‌ها',
    subtitle: 'آمار لحظه‌ای سامانه',
    statGames: 'بازی فعال',
    statEndpoints: 'سرویس API',
    statMode: 'حالت Worker',
    sectionConfig: 'پیکربندی',
    sessionMaxAge: 'عمر نشست',
    tokenMaxAge: 'عمر توکن',
    stateExpiry: 'انقضای State',
    autoCopyCode: 'کپی خودکار کد',
    csrf: 'محافظت CSRF',
    enabled: 'فعال',
    disabled: 'غیرفعال',
    unitDays: 'روز',
    unitMinutes: 'دقیقه',
    sectionEndpoints: 'نقاط پایانی API',
    sectionJson: 'پاسخ JSON',
    jsonHint: 'برای دسترسی برنامه‌نویسی، این هدر را بفرستید:',
    copy: 'کپی',
    copied: 'کپی شد',
    requestId: 'شناسه درخواست',
    updatedAt: 'زمان',
    home: 'خانه',
    refresh: 'بازخوانی',
    testsite: 'پنل تست',
    theme: 'تغییر تم',
    language: 'تغییر زبان',
    footerPowered: 'اجرا روی Cloudflare Workers'
  },
  en: {
    title: 'Metrics',
    subtitle: 'Real-time system metrics',
    statGames: 'Active games',
    statEndpoints: 'API endpoints',
    statMode: 'Worker mode',
    sectionConfig: 'Configuration',
    sessionMaxAge: 'Session lifetime',
    tokenMaxAge: 'Token lifetime',
    stateExpiry: 'State expiry',
    autoCopyCode: 'Auto-copy code',
    csrf: 'CSRF protection',
    enabled: 'Enabled',
    disabled: 'Disabled',
    unitDays: 'days',
    unitMinutes: 'min',
    sectionEndpoints: 'API endpoints',
    sectionJson: 'JSON response',
    jsonHint: 'For programmatic access, send this header:',
    copy: 'Copy',
    copied: 'Copied',
    requestId: 'Request ID',
    updatedAt: 'Time',
    home: 'Home',
    refresh: 'Refresh',
    testsite: 'Test panel',
    theme: 'Toggle theme',
    language: 'Change language',
    footerPowered: 'Powered by Cloudflare Workers'
  },
  ja: {
    title: 'メトリクス',
    subtitle: 'リアルタイムのシステムメトリクス',
    statGames: '稼働中ゲーム',
    statEndpoints: 'API サービス',
    statMode: 'ワーカーモード',
    sectionConfig: '設定',
    sessionMaxAge: 'セッション有効期間',
    tokenMaxAge: 'トークン有効期間',
    stateExpiry: 'ステート有効期限',
    autoCopyCode: 'コード自動コピー',
    csrf: 'CSRF 保護',
    enabled: '有効',
    disabled: '無効',
    unitDays: '日',
    unitMinutes: '分',
    sectionEndpoints: 'API エンドポイント',
    sectionJson: 'JSON レスポンス',
    jsonHint: 'プログラムからアクセスするには次のヘッダーを送信してください:',
    copy: 'コピー',
    copied: 'コピーしました',
    requestId: 'リクエストID',
    updatedAt: '時刻',
    home: 'ホーム',
    refresh: '更新',
    testsite: 'テストパネル',
    theme: 'テーマ切替',
    language: '言語切替',
    footerPowered: 'Cloudflare Workers で稼働'
  }
}

// ==========================================
// Language metadata (direction / locale / button label)
// ==========================================
const LANG_META = {
  fa: { dir: 'rtl', locale: 'fa-IR', label: 'فا' },
  en: { dir: 'ltr', locale: 'en-US', label: 'EN' },
  ja: { dir: 'ltr', locale: 'ja-JP', label: '日本' }
}

// ==========================================
// Inline SVG icon set (theme-aware via currentColor)
// ==========================================
const ICONS = {
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="20" x2="6" y2="12"/><line x1="12" y1="20" x2="12" y2="5"/><line x1="18" y1="20" x2="18" y2="14"/></svg>',
  game: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="11" x2="10" y2="11"/><line x1="8" y1="9" x2="8" y2="13"/><line x1="15" y1="12" x2="15.01" y2="12"/><line x1="18" y1="10" x2="18.01" y2="10"/><rect x="2" y="6" width="20" height="12" rx="2"/></svg>',
  route: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
  sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>',
  code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 3l9 6.5"/><path d="M5 10v10h14V10"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>',
  flask: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6"/><path d="M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3"/><line x1="7.5" y1="15" x2="16.5" y2="15"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
}

// ==========================================
// Handler: Metrics
// availableEndpoints is passed in from worker.js to keep this page
// decoupled from the route table.
// ==========================================
export async function handleMetrics(url, request, gameId, requestId, GAMES, _env, availableEndpoints = []) {
  const metricsData = {
    version: CONFIG.VERSION,
    worker_type: 'stateless',
    games: Object.keys(GAMES).length,
    endpoints: availableEndpoints.length,
    security: {
      sessionMaxAge: CONFIG.SESSION_MAX_AGE_MS,
      csrfEnabled: true
    },
    config: {
      stateExpiry: CONFIG.STATE_EXPIRY_MS,
      tokenMaxAge: CONFIG.TOKEN_MAX_AGE_MS,
      sessionMaxAge: CONFIG.SESSION_MAX_AGE_MS,
      autoCopyCode: CONFIG.AUTO_COPY_CODE
    },
    availableEndpoints,
    timestamp: new Date().toISOString(),
    requestId
  }

  const acceptHeader = request.headers.get('Accept') || ''
  if (acceptHeader.includes('application/json')) {
    return createJsonResponse(metricsData, 200)
  }

  const lang = detectLanguage(url, request)
  const theme = themeFromCookie(request)
  const headers = {}

  const requestedLang = url.searchParams.get('lang')
  if (requestedLang && LANGS.includes(requestedLang)) {
    headers['Set-Cookie'] = `lang=${requestedLang}; Path=/; Max-Age=31536000; SameSite=Lax`
  }

  return createHtmlResponse(renderMetricsPage(metricsData, url.origin, GAMES, lang, theme), 200, headers)
}

// ==========================================
// Language Detection (query > cookie > header > default)
// ==========================================
function detectLanguage(url, request) {
  const fromQuery = (url.searchParams.get('lang') || '').toLowerCase()
  if (LANGS.includes(fromQuery)) return fromQuery

  const cookie = request.headers.get('Cookie') || ''
  const match = cookie.match(/(?:^|;\s*)lang=([^;]+)/)
  if (match && LANGS.includes(match[1])) return match[1]

  const accept = (request.headers.get('Accept-Language') || '').toLowerCase()
  for (const code of LANGS) {
    if (accept.includes(code)) return code
  }
  return DEFAULT_LANG
}

// ==========================================
// Theme From Cookie ('light' | 'dark' | null = follow OS)
// ==========================================
function themeFromCookie(request) {
  const cookie = request.headers.get('Cookie') || ''
  const match = cookie.match(/(?:^|;\s*)theme=([^;]+)/)
  return match && (match[1] === 'light' || match[1] === 'dark') ? match[1] : null
}

// ==========================================
// HTML Escape (safe interpolation)
// ==========================================
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ==========================================
// Hex Color To RGB Channels
// ==========================================
function hexToRgb(hex) {
  const clean = String(hex || '').replace('#', '')
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean
  const int = parseInt(full || '667eea', 16)
  return `${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}`
}

// ==========================================
// Page Renderer
// ==========================================
function renderMetricsPage(metricsData, baseUrl, GAMES, lang, theme) {
  const game = GAMES['neon-katana'] || GAMES[Object.keys(GAMES)[0]] || {
    color: '#667eea',
    logo: CONFIG.DEFAULT_GAME_LOGO,
    name: 'AmirCollider Games'
  }

  const accent = game.color || '#667eea'
  const accentRgb = hexToRgb(accent)
  const amirLogo = CONFIG.AMIR_LOGO
  const gameLogo = game.logo || CONFIG.DEFAULT_GAME_LOGO
  const meta = LANG_META[lang] || LANG_META[DEFAULT_LANG]
  const themeAttr = theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : ''
  const dict = I18N[lang] || I18N[DEFAULT_LANG]

  const ms = (v) => Number(v) || 0
  const payload = {
    lang,
    i18n: I18N,
    langMeta: LANG_META,
    data: metricsData,
    config: {
      sessionDays: ms(metricsData.config.sessionMaxAge) / 86400000,
      tokenMinutes: ms(metricsData.config.tokenMaxAge) / 60000,
      stateMinutes: ms(metricsData.config.stateExpiry) / 60000,
      autoCopyCode: !!metricsData.config.autoCopyCode,
      csrf: !!metricsData.security.csrfEnabled
    },
    endpoints: metricsData.availableEndpoints,
    timestamp: metricsData.timestamp
  }
  const payloadJson = JSON.stringify(payload).replace(/</g, '\\u003c')

  const langButtons = LANGS.map(code =>
    `<button type="button" class="mc-lang-btn${code === lang ? ' is-active' : ''}" data-lang="${code}" lang="${code}">${LANG_META[code].label}</button>`
  ).join('')

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${meta.dir}"${themeAttr}>
<head>
  ${getPageHead({
    title: `${esc(dict.title)} - ${esc(game.name)} | AmirCollider`,
    amirLogo,
    description: esc(dict.subtitle)
  })}
  ${themeBootScript()}
  <style>${metricsStyles(accent, accentRgb)}</style>
</head>
<body>
  <div class="mc-bg" aria-hidden="true"></div>

  <main class="mc-shell">
    <header class="mc-topbar">
      <div class="mc-brand">
        <span class="mc-logo"><img src="${esc(amirLogo)}" alt="AmirCollider" onerror="this.style.display='none'"></span>
        <span class="mc-logo mc-logo-game"><img src="${esc(gameLogo)}" alt="${esc(game.name)}" onerror="this.style.display='none'"></span>
        <span class="mc-brand-name">${esc(game.name)}</span>
      </div>
      <div class="mc-controls">
        <div class="mc-lang" role="group" data-i18n-aria="language">${langButtons}</div>
        <button type="button" class="mc-icon-btn" id="mc-theme" data-i18n-aria="theme">
          <span class="mc-sun">${ICONS.sun}</span><span class="mc-moon">${ICONS.moon}</span>
        </button>
      </div>
    </header>

    <section class="mc-hero">
      <span class="mc-badge"><span class="mc-dot"></span><span class="mc-ic">${ICONS.chart}</span>v${esc(metricsData.version)}</span>
      <h1 data-i18n="title">${esc(dict.title)}</h1>
      <p class="mc-sub" data-i18n="subtitle">${esc(dict.subtitle)}</p>
    </section>

    <section class="mc-stats">
      <article class="mc-stat" style="--d:0">
        <span class="mc-stat-ic">${ICONS.game}</span>
        <span class="mc-stat-num" data-count="${esc(metricsData.games)}">${esc(metricsData.games)}</span>
        <span class="mc-stat-label" data-i18n="statGames">${esc(dict.statGames)}</span>
      </article>
      <article class="mc-stat" style="--d:1">
        <span class="mc-stat-ic">${ICONS.route}</span>
        <span class="mc-stat-num" data-count="${esc(metricsData.endpoints)}">${esc(metricsData.endpoints)}</span>
        <span class="mc-stat-label" data-i18n="statEndpoints">${esc(dict.statEndpoints)}</span>
      </article>
      <article class="mc-stat" style="--d:2">
        <span class="mc-stat-ic">${ICONS.bolt}</span>
        <span class="mc-stat-num mc-stat-text">Stateless</span>
        <span class="mc-stat-label" data-i18n="statMode">${esc(dict.statMode)}</span>
      </article>
    </section>

    <section class="mc-card" style="--d:3">
      <h3><span class="mc-ic">${ICONS.sliders}</span><span data-i18n="sectionConfig">${esc(dict.sectionConfig)}</span></h3>
      <div class="mc-rows" id="mc-config"></div>
    </section>

    <section class="mc-card" style="--d:4">
      <h3><span class="mc-ic">${ICONS.route}</span><span data-i18n="sectionEndpoints">${esc(dict.sectionEndpoints)}</span></h3>
      <div class="mc-ep-grid" id="mc-endpoints"></div>
    </section>

    <section class="mc-card" style="--d:5">
      <div class="mc-json-head">
        <h3><span class="mc-ic">${ICONS.code}</span><span data-i18n="sectionJson">${esc(dict.sectionJson)}</span></h3>
        <button type="button" class="mc-copy" id="mc-copy"><span data-i18n="copy">${esc(dict.copy)}</span></button>
      </div>
      <p class="mc-hint"><span data-i18n="jsonHint">${esc(dict.jsonHint)}</span> <code class="mc-code">Accept: application/json</code></p>
      <pre id="mc-json-body"></pre>
      <div class="mc-meta">
        <span><span data-i18n="updatedAt">${esc(dict.updatedAt)}</span>: <b id="mc-time">${esc(metricsData.timestamp)}</b></span>
        <span><span data-i18n="requestId">${esc(dict.requestId)}</span>: <b class="mc-mono">${esc(metricsData.requestId)}</b></span>
      </div>
    </section>

    <nav class="mc-nav">
      <a class="mc-btn mc-btn-primary" href="${esc(baseUrl)}"><span class="mc-ic">${ICONS.home}</span><span data-i18n="home">${esc(dict.home)}</span></a>
      <a class="mc-btn" href="${esc(baseUrl)}/testsite"><span class="mc-ic">${ICONS.flask}</span><span data-i18n="testsite">${esc(dict.testsite)}</span></a>
      <button type="button" class="mc-btn" id="mc-refresh"><span class="mc-ic">${ICONS.refresh}</span><span data-i18n="refresh">${esc(dict.refresh)}</span></button>
    </nav>

    <footer class="mc-footer">
      <div class="mc-f-name">AmirCollider Games</div>
      <div class="mc-f-meta"><span data-i18n="footerPowered">${esc(dict.footerPowered)}</span> &middot; <b>v${esc(metricsData.version)}</b></div>
    </footer>
  </main>

  <script id="mc-data" type="application/json">${payloadJson}</script>
  <script>${metricsClientScript()}</script>
</body>
</html>`
}

// ==========================================
// Theme Boot (applied before paint to avoid flicker)
// ==========================================
function themeBootScript() {
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
// Page Styles (light/dark tokens + RTL/LTR safe via logical properties)
// ==========================================
function metricsStyles(accent, accentRgb) {
  return `
  * { margin: 0; padding: 0; box-sizing: border-box; }

  /* ==========================================
     Hide scrollbars (scrolling stays functional)
     ========================================== */
  html { scrollbar-width: none; -ms-overflow-style: none; }
  html::-webkit-scrollbar { width: 0; height: 0; display: none; }

  :root {
    --accent: ${accent};
    --accent-rgb: ${accentRgb};
    --bg: #f4f6fb;
    --bg-soft: #eef1f8;
    --surface: #ffffff;
    --surface-2: #f7f9fd;
    --text: #1d2433;
    --muted: #6b7488;
    --border: rgba(20, 28, 45, 0.10);
    --shadow: 0 10px 30px rgba(20, 28, 45, 0.10);
    --ok: #18a558;
    --radius: 16px;
  }
  [data-theme="dark"] {
    --bg: #0e131c;
    --bg-soft: #131a26;
    --surface: #161e2b;
    --surface-2: #1b2433;
    --text: #e7ecf5;
    --muted: #97a2b6;
    --border: rgba(255, 255, 255, 0.09);
    --shadow: 0 14px 40px rgba(0, 0, 0, 0.45);
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme]) {
      --bg: #0e131c;
      --bg-soft: #131a26;
      --surface: #161e2b;
      --surface-2: #1b2433;
      --text: #e7ecf5;
      --muted: #97a2b6;
      --border: rgba(255, 255, 255, 0.09);
      --shadow: 0 14px 40px rgba(0, 0, 0, 0.45);
    }
  }

  body {
    font-family: 'Vazirmatn', 'Segoe UI', Tahoma, system-ui, sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  [data-theme] .mc-sun, .mc-sun { display: none; }
  [data-theme="dark"] .mc-sun { display: inline-flex; }
  [data-theme="dark"] .mc-moon { display: none; }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme]) .mc-sun { display: inline-flex; }
    :root:not([data-theme]) .mc-moon { display: none; }
  }

  .mc-bg {
    position: fixed; inset: 0; z-index: -1; pointer-events: none;
    background:
      radial-gradient(620px 360px at 100% -8%, rgba(var(--accent-rgb), 0.16), transparent 70%),
      radial-gradient(560px 320px at 0% 0%, rgba(var(--accent-rgb), 0.08), transparent 72%);
  }

  .mc-shell {
    max-width: 980px;
    margin-inline: auto;
    padding: 28px 20px 64px;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }

  .mc-topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .mc-brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .mc-logo {
    width: 38px; height: 38px; border-radius: 11px; overflow: hidden; flex: none;
    background: var(--surface); border: 1px solid var(--border); box-shadow: var(--shadow);
    display: inline-flex; align-items: center; justify-content: center;
  }
  .mc-logo img { width: 100%; height: 100%; object-fit: cover; }
  .mc-logo-game { margin-inline-start: -14px; }
  .mc-brand-name { font-weight: 700; font-size: .98rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .mc-controls { display: flex; align-items: center; gap: 10px; }
  .mc-lang {
    display: inline-flex; gap: 2px; padding: 4px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 12px; box-shadow: var(--shadow);
  }
  .mc-lang-btn {
    border: 0; cursor: pointer; background: transparent; color: var(--muted);
    font: inherit; font-weight: 600; font-size: .82rem;
    padding: 6px 11px; border-radius: 9px; transition: background .2s ease, color .2s ease;
  }
  .mc-lang-btn:hover { color: var(--text); }
  .mc-lang-btn.is-active { background: var(--accent); color: #fff; }

  .mc-icon-btn {
    width: 40px; height: 40px; border-radius: 12px; cursor: pointer;
    background: var(--surface); border: 1px solid var(--border); color: var(--text);
    box-shadow: var(--shadow); display: inline-flex; align-items: center; justify-content: center;
    transition: transform .2s ease, background .2s ease;
  }
  .mc-icon-btn:hover { transform: translateY(-2px); }
  .mc-icon-btn svg { width: 18px; height: 18px; }

  .mc-hero { text-align: center; padding: 14px 0 4px; }
  .mc-badge {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 6px 14px; border-radius: 999px; font-weight: 700; font-size: .82rem;
    color: var(--accent); background: rgba(var(--accent-rgb), 0.12);
    border: 1px solid rgba(var(--accent-rgb), 0.28);
  }
  .mc-badge .mc-ic svg { width: 15px; height: 15px; }
  .mc-dot {
    width: 8px; height: 8px; border-radius: 50%; background: var(--ok);
    box-shadow: 0 0 0 0 rgba(24, 165, 88, 0.55); animation: mcPulse 2.4s ease-out infinite;
  }
  .mc-hero h1 { font-size: clamp(1.8rem, 4vw, 2.4rem); font-weight: 800; margin-top: 14px; letter-spacing: -.02em; }
  .mc-sub { color: var(--muted); margin-top: 6px; font-size: 1rem; }

  .mc-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  .mc-stat {
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    box-shadow: var(--shadow); padding: 22px 16px; text-align: center;
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    animation: mcRise .5s ease both; animation-delay: calc(var(--d, 0) * 70ms);
    transition: transform .2s ease, border-color .2s ease;
  }
  .mc-stat:hover { transform: translateY(-3px); border-color: rgba(var(--accent-rgb), 0.45); }
  .mc-stat-ic { color: var(--accent); display: inline-flex; }
  .mc-stat-ic svg { width: 26px; height: 26px; }
  .mc-stat-num { font-size: 2rem; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; }
  .mc-stat-text { font-size: 1.35rem; letter-spacing: -.01em; }
  .mc-stat-label { color: var(--muted); font-size: .9rem; }

  .mc-card {
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    box-shadow: var(--shadow); padding: 22px;
    animation: mcRise .5s ease both; animation-delay: calc(var(--d, 0) * 70ms);
  }
  .mc-card h3 { display: flex; align-items: center; gap: 9px; font-size: 1.06rem; font-weight: 700; }
  .mc-card h3 .mc-ic { color: var(--accent); display: inline-flex; }
  .mc-card h3 .mc-ic svg { width: 18px; height: 18px; }

  .mc-rows { margin-top: 14px; display: flex; flex-direction: column; gap: 2px; }
  .mc-row {
    display: flex; align-items: center; justify-content: space-between; gap: 14px;
    padding: 11px 2px; border-bottom: 1px solid var(--border);
  }
  .mc-row:last-child { border-bottom: 0; }
  .mc-row span { color: var(--muted); font-size: .92rem; }
  .mc-row b { font-weight: 700; text-align: end; font-variant-numeric: tabular-nums; }
  .mc-row b.mc-ok { color: var(--ok); }
  .mc-row b.mc-off { color: var(--muted); }

  .mc-ep-grid {
    margin-top: 14px; display: grid; gap: 9px;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  }
  .mc-ep-item {
    background: var(--surface-2); border: 1px solid var(--border); border-radius: 11px;
    border-inline-start: 3px solid var(--accent);
    padding: 11px 13px; font-size: .82rem;
    font-family: ui-monospace, 'SF Mono', Consolas, monospace;
    display: flex; align-items: center; gap: 8px; direction: ltr; text-align: start;
    transition: transform .2s ease, background .2s ease;
  }
  .mc-ep-item:hover { transform: translateY(-2px); background: rgba(var(--accent-rgb), 0.08); }
  .mc-ep-method {
    font-weight: 700; color: var(--accent); flex: none;
    min-width: 44px; font-size: .76rem; letter-spacing: .03em;
  }
  .mc-ep-path { color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .mc-json-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .mc-copy {
    border: 1px solid var(--border); background: var(--surface-2); color: var(--text);
    font: inherit; font-weight: 600; font-size: .82rem; cursor: pointer;
    padding: 7px 14px; border-radius: 10px;
    transition: background .2s ease, color .2s ease, border-color .2s ease;
  }
  .mc-copy:hover { background: var(--accent); color: #fff; border-color: var(--accent); }
  .mc-hint { color: var(--muted); font-size: .86rem; margin-top: 12px; }
  .mc-code {
    font-family: ui-monospace, 'SF Mono', Consolas, monospace; direction: ltr;
    background: var(--surface-2); border: 1px solid var(--border);
    padding: 2px 8px; border-radius: 7px; font-size: .8rem; white-space: nowrap;
  }
  .mc-json-head + .mc-hint { margin-top: 12px; }
  #mc-json-body {
    margin-top: 12px; background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 12px; padding: 16px; overflow-x: auto; max-height: 360px; overflow-y: auto;
    direction: ltr; text-align: start; white-space: pre-wrap; word-break: break-word;
    font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size: .8rem; line-height: 1.7;
  }
  .mc-meta {
    margin-top: 14px; display: flex; flex-wrap: wrap; gap: 8px 22px;
    color: var(--muted); font-size: .82rem;
  }
  .mc-meta b { color: var(--text); }
  .mc-mono { font-family: ui-monospace, 'SF Mono', Consolas, monospace; direction: ltr; }

  .mc-nav { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; }
  .mc-btn {
    display: inline-flex; align-items: center; gap: 8px; cursor: pointer; text-decoration: none;
    background: var(--surface); border: 1px solid var(--border); color: var(--text);
    padding: 11px 20px; border-radius: 12px; font: inherit; font-weight: 600; font-size: .9rem;
    box-shadow: var(--shadow); transition: transform .2s ease, background .2s ease, color .2s ease;
  }
  .mc-btn:hover { transform: translateY(-2px); }
  .mc-btn .mc-ic svg { width: 16px; height: 16px; }
  .mc-btn-primary { background: var(--accent); color: #fff; border-color: transparent; }

  .mc-footer { text-align: center; color: var(--muted); padding-top: 6px; }
  .mc-f-name { font-weight: 700; color: var(--text); }
  .mc-f-meta { font-size: .85rem; margin-top: 4px; }

  :where(button, a):focus-visible {
    outline: 2px solid var(--accent); outline-offset: 2px;
  }

  @keyframes mcRise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes mcPulse {
    0% { box-shadow: 0 0 0 0 rgba(24, 165, 88, 0.55); }
    70% { box-shadow: 0 0 0 9px rgba(24, 165, 88, 0); }
    100% { box-shadow: 0 0 0 0 rgba(24, 165, 88, 0); }
  }

  @media (max-width: 640px) {
    .mc-stats { grid-template-columns: 1fr; }
    .mc-topbar { justify-content: center; }
    .mc-brand-name { display: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation: none !important; transition: none !important; }
  }
  `
}

// ==========================================
// Client Runtime (i18n switch, theme, render)
// Reads only the embedded JSON payload; no server interpolation here.
// ==========================================
function metricsClientScript() {
  return `
  (function () {
    var data = JSON.parse(document.getElementById('mc-data').textContent);
    var root = document.documentElement;

    function read(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
    function write(key, val) {
      try { localStorage.setItem(key, val); } catch (e) {}
      if (key === 'lang') document.cookie = 'lang=' + val + ';path=/;max-age=31536000;SameSite=Lax';
      if (key === 'ac_theme') document.cookie = 'theme=' + val + ';path=/;max-age=31536000;SameSite=Lax';
    }

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    function nf(value, lang) {
      try { return new Intl.NumberFormat(data.langMeta[lang].locale).format(value); }
      catch (e) { return String(value); }
    }

    function localizedTime(iso, lang) {
      try {
        return new Intl.DateTimeFormat(data.langMeta[lang].locale, {
          dateStyle: 'medium', timeStyle: 'medium'
        }).format(new Date(iso));
      } catch (e) { return iso; }
    }

    // ---- theme ----
    function applyTheme(theme) {
      root.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
      write('ac_theme', theme === 'dark' ? 'dark' : 'light');
    }
    function currentTheme() {
      var attr = root.getAttribute('data-theme');
      if (attr === 'dark' || attr === 'light') return attr;
      return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    document.getElementById('mc-theme').addEventListener('click', function () {
      applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
    });

    // ---- config rows (localized numbers + units) ----
    function renderConfig(lang) {
      var dict = data.i18n[lang];
      var c = data.config;
      var rows = [
        { label: dict.sessionMaxAge, value: nf(Math.round(c.sessionDays), lang) + ' ' + dict.unitDays },
        { label: dict.tokenMaxAge, value: nf(Math.round(c.tokenMinutes), lang) + ' ' + dict.unitMinutes },
        { label: dict.stateExpiry, value: nf(Math.round(c.stateMinutes), lang) + ' ' + dict.unitMinutes },
        { label: dict.autoCopyCode, value: c.autoCopyCode ? dict.enabled : dict.disabled, on: c.autoCopyCode, flag: true },
        { label: dict.csrf, value: c.csrf ? dict.enabled : dict.disabled, on: c.csrf, flag: true }
      ];
      document.getElementById('mc-config').innerHTML = rows.map(function (r) {
        var cls = r.flag ? (r.on ? ' mc-ok' : ' mc-off') : '';
        return '<div class="mc-row"><span>' + esc(r.label) + '</span><b class="' + cls.trim() + '">' + esc(r.value) + '</b></div>';
      }).join('');
    }

    // ---- endpoints grid ----
    function renderEndpoints() {
      var list = Array.isArray(data.endpoints) ? data.endpoints : [];
      var host = document.getElementById('mc-endpoints');
      if (!list.length) { host.innerHTML = ''; return; }
      host.innerHTML = list.map(function (ep) {
        var parts = String(ep).trim().split(/\\s+/);
        var method = parts.length > 1 ? parts[0] : '';
        var path = parts.length > 1 ? parts.slice(1).join(' ') : String(ep);
        return '<div class="mc-ep-item">'
          + (method ? '<span class="mc-ep-method">' + esc(method) + '</span>' : '')
          + '<span class="mc-ep-path">' + esc(path) + '</span></div>';
      }).join('');
    }

    // ---- language ----
    function applyLang(lang) {
      var dict = data.i18n[lang];
      var meta = data.langMeta[lang];
      if (!dict || !meta) return;

      root.setAttribute('lang', lang);
      root.setAttribute('dir', meta.dir);

      document.querySelectorAll('[data-i18n]').forEach(function (el) {
        var key = el.getAttribute('data-i18n');
        if (dict[key] != null) el.textContent = dict[key];
      });
      document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
        var key = el.getAttribute('data-i18n-aria');
        if (dict[key] != null) el.setAttribute('aria-label', dict[key]);
      });
      document.querySelectorAll('.mc-lang-btn').forEach(function (b) {
        b.classList.toggle('is-active', b.getAttribute('data-lang') === lang);
      });

      var time = document.getElementById('mc-time');
      if (time) time.textContent = localizedTime(data.timestamp, lang);

      document.title = dict.title + ' | AmirCollider';
      renderConfig(lang);
      write('lang', lang);
    }

    document.querySelectorAll('.mc-lang-btn').forEach(function (b) {
      b.addEventListener('click', function () { applyLang(b.getAttribute('data-lang')); });
    });

    // ---- JSON view + copy ----
    var jsonText = JSON.stringify(data.data, null, 2);
    document.getElementById('mc-json-body').textContent = jsonText;

    var copyBtn = document.getElementById('mc-copy');
    copyBtn.addEventListener('click', function () {
      var lang = root.getAttribute('lang') || data.lang;
      var dict = data.i18n[lang] || data.i18n[data.lang];
      var label = copyBtn.querySelector('[data-i18n]');
      function done() {
        label.textContent = dict.copied;
        setTimeout(function () { label.textContent = dict.copy; }, 1600);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(jsonText).then(done).catch(function () {});
      }
    });

    // ---- refresh ----
    var refreshBtn = document.getElementById('mc-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', function () { location.reload(); });

    // ---- subtle count-up for numeric stats ----
    function countUp() {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      var lang = root.getAttribute('lang') || data.lang;
      document.querySelectorAll('.mc-stat-num[data-count]').forEach(function (node) {
        var raw = node.getAttribute('data-count');
        if (!/^[0-9]+$/.test(raw)) return;
        var end = parseInt(raw, 10), start = null, dur = 650;
        function step(ts) {
          if (start === null) start = ts;
          var pr = Math.min((ts - start) / dur, 1);
          var eased = 1 - Math.pow(1 - pr, 3);
          node.textContent = nf(Math.round(end * eased), lang);
          if (pr < 1) requestAnimationFrame(step); else node.textContent = nf(end, lang);
        }
        requestAnimationFrame(step);
      });
    }

    // ---- boot ----
    renderEndpoints();
    applyLang(data.i18n[data.lang] ? data.lang : '${DEFAULT_LANG}');
    countUp();
  })();
  `
}
