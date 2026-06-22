// ==========================================
// pages/health.js
// Health Check Page Handler
// AmirCollider Games - Edge Proxy
// ==========================================

import { CONFIG } from '../config.js'
import { getPageHead } from '../shared-styles.js'
import { validateGameId, createJsonResponse, createHtmlResponse } from '../utils.js'

// ==========================================
// Supported Languages & Direction Map
// ==========================================
const LANGS = ['fa', 'en', 'ja']

const LANG_META = {
  fa: { dir: 'rtl', locale: 'fa-IR', label: 'فارسی' },
  en: { dir: 'ltr', locale: 'en-US', label: 'English' },
  ja: { dir: 'ltr', locale: 'ja-JP', label: '日本語' }
}

// ==========================================
// Localized UI Strings (fa / en / ja)
// ==========================================
const I18N = {
  fa: {
    title: 'بررسی سلامت',
    healthy: 'سالم',
    running: 'پروکسی در حال اجراست',
    gameInfo: 'اطلاعات بازی',
    name: 'نام',
    id: 'شناسه',
    icon: 'آیکون',
    systemInfo: 'اطلاعات سیستم',
    version: 'نسخه',
    timestamp: 'زمان',
    requestId: 'شناسه درخواست',
    security: 'امنیت',
    sessionAge: 'مدت نشست',
    secureHeaders: 'هدرهای امن',
    enabled: 'فعال',
    endpoints: 'مسیرها',
    jsonResponse: 'پاسخ JSON',
    copy: 'کپی',
    copied: 'کپی شد',
    home: 'صفحه اصلی',
    ping: 'تست پینگ',
    metrics: 'متریک‌ها',
    leaderboard: 'برترین‌ها',
    testsite: 'سایت تست',
    theme: 'تغییر تم',
    language: 'تغییر زبان',
    grp_oauth: 'احراز هویت OAuth',
    grp_auth: 'مدیریت توکن',
    grp_database: 'پایگاه داده',
    grp_profile: 'پروفایل کاربر',
    grp_leaderboard: 'جدول برترین‌ها',
    grp_system: 'سیستم'
  },
  en: {
    title: 'Health Check',
    healthy: 'Healthy',
    running: 'Proxy is running',
    gameInfo: 'Game Info',
    name: 'Name',
    id: 'ID',
    icon: 'Icon',
    systemInfo: 'System Info',
    version: 'Version',
    timestamp: 'Timestamp',
    requestId: 'Request ID',
    security: 'Security',
    sessionAge: 'Session Age',
    secureHeaders: 'Secure Headers',
    enabled: 'Enabled',
    endpoints: 'Endpoints',
    jsonResponse: 'JSON Response',
    copy: 'Copy',
    copied: 'Copied',
    home: 'Home',
    ping: 'Ping Test',
    metrics: 'Metrics',
    leaderboard: 'Leaderboard',
    testsite: 'Test Site',
    theme: 'Toggle theme',
    language: 'Change language',
    grp_oauth: 'OAuth',
    grp_auth: 'Token',
    grp_database: 'Database',
    grp_profile: 'Profile',
    grp_leaderboard: 'Leaderboard',
    grp_system: 'System'
  },
  ja: {
    title: 'ヘルスチェック',
    healthy: '正常',
    running: 'プロキシは稼働中です',
    gameInfo: 'ゲーム情報',
    name: '名前',
    id: 'ID',
    icon: 'アイコン',
    systemInfo: 'システム情報',
    version: 'バージョン',
    timestamp: 'タイムスタンプ',
    requestId: 'リクエストID',
    security: 'セキュリティ',
    sessionAge: 'セッション有効期間',
    secureHeaders: 'セキュアヘッダー',
    enabled: '有効',
    endpoints: 'エンドポイント',
    jsonResponse: 'JSONレスポンス',
    copy: 'コピー',
    copied: 'コピーしました',
    home: 'ホーム',
    ping: 'Pingテスト',
    metrics: 'メトリクス',
    leaderboard: 'リーダーボード',
    testsite: 'テストサイト',
    theme: 'テーマ切替',
    language: '言語切替',
    grp_oauth: 'OAuth',
    grp_auth: 'トークン',
    grp_database: 'データベース',
    grp_profile: 'プロフィール',
    grp_leaderboard: 'リーダーボード',
    grp_system: 'システム'
  }
}

// ==========================================
// Inline SVG Icon Set (theme-aware via currentColor)
// ==========================================
const ICONS = {
  pulse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  game: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="11" x2="10" y2="11"/><line x1="8" y1="9" x2="8" y2="13"/><line x1="15" y1="12" x2="15.01" y2="12"/><line x1="18" y1="10" x2="18.01" y2="10"/><rect x="2" y="6" width="20" height="12" rx="2"/></svg>',
  cpu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
  route: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="3"/><circle cx="18" cy="5" r="3"/><path d="M9 19h6a3 3 0 0 0 3-3V8"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  signal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20h.01"/><path d="M7 20v-4"/><path d="M12 20v-8"/><path d="M17 20V8"/><path d="M22 4v16"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>',
  flask: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v6l-5.5 9.5A2 2 0 0 0 5.2 21h13.6a2 2 0 0 0 1.7-3.5L15 8V2"/><path d="M9 2h6"/><path d="M7.5 14h9"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z"/></svg>'
}

// ==========================================
// Health Endpoint Handler (HTML + JSON)
// ==========================================
export async function handleHealthWithUI(url, request, gameId, requestId, GAMES) {
  let game = validateGameId(gameId, GAMES)

  if (!game) {
    game = {
      name: 'AmirCollider Games',
      icon: '',
      color: '#f44336',
      logo: CONFIG.AMIR_LOGO
    }
  }

  const healthData = {
    status: 'healthy',
    message: 'OAuth Proxy is running',
    timestamp: new Date().toISOString(),
    version: CONFIG.VERSION,
    game: {
      id: gameId,
      name: game.name,
      icon: game.icon,
      description: game.description ?? null
    },
    worker_url: url.origin,
    security: {
      sessionMaxAge: `${CONFIG.SESSION_MAX_AGE_MS / 1000 / 60 / 60 / 24} days`,
      secureHeaders: 'enabled'
    },
    endpoints: {
      oauth: ['GET /oauth/auth', 'GET /oauth/callback', 'POST /oauth/token'],
      auth: ['POST /auth/refresh', 'POST /auth/validate', 'POST /auth/check'],
      database: ['GET /database/get/{path}', 'POST /database/set/{path}', 'PUT /database/set/{path}'],
      profile: ['GET /profile/{uid}'],
      leaderboard: ['GET /{gameId}/leaderboard', 'GET /{gameId}/leaderboard/{limit}'],
      system: ['GET /health', 'GET /ping', 'GET /metrics']
    },
    requestId
  }

  const acceptHeader = request.headers.get('Accept') || ''
  if (acceptHeader.includes('application/json')) {
    return createJsonResponse(healthData, 200)
  }

  const lang = detectLanguage(url, request)
  return createHtmlResponse(renderHealthPage(healthData, game, url.origin, gameId, lang), 200)
}

// ==========================================
// Language Detection (query > cookie > header)
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
  return 'fa'
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
// Health Page Renderer
// ==========================================
function renderHealthPage(healthData, game, baseUrl, gameId, lang) {
  const meta = LANG_META[lang]
  const accent = game.color || '#667eea'
  const accentRgb = hexToRgb(accent)
  const amirLogo = CONFIG.AMIR_LOGO
  const gameLogo = game.logo || CONFIG.DEFAULT_GAME_LOGO

  const payload = {
    lang,
    i18n: I18N,
    langMeta: LANG_META,
    timestamp: healthData.timestamp,
    health: healthData,
    endpointGroups: Object.entries(healthData.endpoints).map(([key, paths]) => ({ key, paths }))
  }

  const payloadJson = JSON.stringify(payload).replace(/</g, '\\u003c')

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${meta.dir}" data-theme="">
<head>
  ${getPageHead({ title: `${I18N[lang].title} - ${esc(game.name)} | AmirCollider`, amirLogo })}
  <style>${healthStyles(accent, accentRgb)}</style>
</head>
<body>
  <div class="hc-bg" aria-hidden="true"></div>

  <main class="hc-shell">
    <header class="hc-topbar">
      <div class="hc-brand">
        <span class="hc-logo"><img src="${esc(amirLogo)}" alt="AmirCollider" onerror="this.style.display='none'"></span>
        <span class="hc-logo hc-logo-game"><img src="${esc(gameLogo)}" alt="${esc(game.name)}" onerror="this.style.display='none'"></span>
        <span class="hc-brand-name">${esc(game.name)}</span>
      </div>
      <div class="hc-controls">
        <div class="hc-lang" role="group" data-i18n-aria="language">
          ${LANGS.map(code => `<button type="button" class="hc-lang-btn" data-lang="${code}">${LANG_META[code].label}</button>`).join('')}
        </div>
        <button type="button" class="hc-icon-btn" id="hc-theme" data-i18n-aria="theme">
          <span class="hc-sun">${ICONS.sun}</span><span class="hc-moon">${ICONS.moon}</span>
        </button>
      </div>
    </header>

    <section class="hc-hero">
      <span class="hc-status">
        <span class="hc-status-dot"></span>
        <span class="hc-status-icon">${ICONS.pulse}</span>
        <span data-i18n="healthy">${esc(I18N[lang].healthy)}</span>
      </span>
      <h1 data-i18n="title">${esc(I18N[lang].title)}</h1>
      <p class="hc-sub" data-i18n="running">${esc(I18N[lang].running)}</p>
    </section>

    <section class="hc-grid">
      <article class="hc-card" style="--d:0">
        <h3><span class="hc-ic">${ICONS.game}</span><span data-i18n="gameInfo">${esc(I18N[lang].gameInfo)}</span></h3>
        <div class="hc-row"><span data-i18n="name">${esc(I18N[lang].name)}</span><b>${esc(game.name)}</b></div>
        <div class="hc-row"><span data-i18n="id">${esc(I18N[lang].id)}</span><b>${esc(gameId)}</b></div>
        <div class="hc-row"><span data-i18n="icon">${esc(I18N[lang].icon)}</span><b>${esc(game.icon)}</b></div>
      </article>

      <article class="hc-card" style="--d:1">
        <h3><span class="hc-ic">${ICONS.cpu}</span><span data-i18n="systemInfo">${esc(I18N[lang].systemInfo)}</span></h3>
        <div class="hc-row"><span data-i18n="version">${esc(I18N[lang].version)}</span><b>${esc(healthData.version)}</b></div>
        <div class="hc-row"><span data-i18n="timestamp">${esc(I18N[lang].timestamp)}</span><b id="hc-time">${esc(healthData.timestamp)}</b></div>
        <div class="hc-row"><span data-i18n="requestId">${esc(I18N[lang].requestId)}</span><b class="hc-mono">${esc(healthData.requestId)}</b></div>
      </article>

      <article class="hc-card" style="--d:2">
        <h3><span class="hc-ic">${ICONS.shield}</span><span data-i18n="security">${esc(I18N[lang].security)}</span></h3>
        <div class="hc-row"><span data-i18n="sessionAge">${esc(I18N[lang].sessionAge)}</span><b>${esc(healthData.security.sessionMaxAge)}</b></div>
        <div class="hc-row"><span data-i18n="secureHeaders">${esc(I18N[lang].secureHeaders)}</span><b class="hc-ok" data-i18n="enabled">${esc(I18N[lang].enabled)}</b></div>
      </article>
    </section>

    <section class="hc-card hc-endpoints">
      <h3><span class="hc-ic">${ICONS.route}</span><span data-i18n="endpoints">${esc(I18N[lang].endpoints)}</span></h3>
      <div class="hc-ep-grid" id="hc-endpoints"></div>
    </section>

    <section class="hc-card hc-json">
      <div class="hc-json-head">
        <h3><span class="hc-ic">${ICONS.code}</span><span data-i18n="jsonResponse">${esc(I18N[lang].jsonResponse)}</span></h3>
        <button type="button" class="hc-copy" id="hc-copy"><span data-i18n="copy">${esc(I18N[lang].copy)}</span></button>
      </div>
      <pre id="hc-json-body"></pre>
    </section>

    <nav class="hc-nav">
      <a class="hc-btn hc-btn-primary" href="${esc(baseUrl)}"><span class="hc-ic">${ICONS.home}</span><span data-i18n="home">${esc(I18N[lang].home)}</span></a>
      <a class="hc-btn" href="${esc(baseUrl)}/${esc(gameId)}/ping"><span class="hc-ic">${ICONS.signal}</span><span data-i18n="ping">${esc(I18N[lang].ping)}</span></a>
      <a class="hc-btn" href="${esc(baseUrl)}/${esc(gameId)}/leaderboard"><span class="hc-ic">${ICONS.trophy}</span><span data-i18n="leaderboard">${esc(I18N[lang].leaderboard)}</span></a>
      <a class="hc-btn" href="${esc(baseUrl)}/metrics"><span class="hc-ic">${ICONS.chart}</span><span data-i18n="metrics">${esc(I18N[lang].metrics)}</span></a>
      <a class="hc-btn" href="${esc(baseUrl)}/testsite"><span class="hc-ic">${ICONS.flask}</span><span data-i18n="testsite">${esc(I18N[lang].testsite)}</span></a>
    </nav>
  </main>

  <script id="hc-data" type="application/json">${payloadJson}</script>
  <script>${healthClientScript()}</script>
</body>
</html>`
}

// ==========================================
// Page Styles (light/dark + RTL/LTR safe)
// ==========================================
function healthStyles(accent, accentRgb) {
  return `
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
    --surface-2: #1c2636;
    --text: #e7ecf5;
    --muted: #9aa6bd;
    --border: rgba(255, 255, 255, 0.08);
    --shadow: 0 14px 36px rgba(0, 0, 0, 0.45);
    --ok: #2ecc71;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #0e131c; --bg-soft: #131a26; --surface: #161e2b; --surface-2: #1c2636;
      --text: #e7ecf5; --muted: #9aa6bd; --border: rgba(255,255,255,0.08);
      --shadow: 0 14px 36px rgba(0,0,0,0.45); --ok: #2ecc71;
    }
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    font-family: 'Vazirmatn', 'Segoe UI', system-ui, -apple-system, 'Hiragino Sans', 'Noto Sans JP', Tahoma, sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    line-height: 1.6;
    transition: background .35s ease, color .35s ease;
  }

  .hc-bg {
    position: fixed; inset: 0; z-index: -1; pointer-events: none;
    background:
      radial-gradient(60vw 60vw at 85% -10%, rgba(var(--accent-rgb), .16), transparent 60%),
      radial-gradient(55vw 55vw at -10% 110%, rgba(var(--accent-rgb), .12), transparent 60%);
  }

  .hc-shell {
    max-width: 960px;
    margin-inline: auto;
    padding: clamp(18px, 4vw, 40px);
    animation: hcFade .5s ease both;
  }
  @keyframes hcFade { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }

  .hc-topbar {
    display: flex; align-items: center; justify-content: space-between;
    gap: 16px; flex-wrap: wrap; margin-bottom: 28px;
  }
  .hc-brand { display: flex; align-items: center; gap: 10px; }
  .hc-logo {
    width: 38px; height: 38px; border-radius: 50%; overflow: hidden;
    background: var(--surface); border: 1px solid var(--border);
    display: inline-flex; align-items: center; justify-content: center; flex: none;
  }
  .hc-logo img { width: 100%; height: 100%; object-fit: cover; }
  .hc-logo-game { margin-inline-start: -14px; }
  .hc-brand-name { font-weight: 700; font-size: .98rem; }

  .hc-controls { display: flex; align-items: center; gap: 10px; }
  .hc-lang {
    display: inline-flex; background: var(--surface); border: 1px solid var(--border);
    border-radius: 999px; padding: 3px; box-shadow: var(--shadow);
  }
  .hc-lang-btn {
    border: 0; background: transparent; color: var(--muted); cursor: pointer;
    font: inherit; font-size: .82rem; padding: 6px 12px; border-radius: 999px;
    transition: color .2s ease, background .2s ease;
  }
  .hc-lang-btn:hover { color: var(--text); }
  .hc-lang-btn.is-active { color: #fff; background: var(--accent); }

  .hc-icon-btn {
    width: 40px; height: 40px; border-radius: 50%; cursor: pointer;
    background: var(--surface); border: 1px solid var(--border); color: var(--text);
    display: inline-flex; align-items: center; justify-content: center;
    box-shadow: var(--shadow); transition: transform .2s ease, background .2s ease;
  }
  .hc-icon-btn:hover { transform: translateY(-2px); }
  .hc-icon-btn svg { width: 19px; height: 19px; }
  .hc-sun { display: none; } .hc-moon { display: inline-flex; }
  [data-theme="dark"] .hc-sun { display: inline-flex; } [data-theme="dark"] .hc-moon { display: none; }

  .hc-hero { text-align: center; margin: 8px 0 30px; }
  .hc-status {
    display: inline-flex; align-items: center; gap: 8px;
    background: rgba(var(--accent-rgb), .10); color: var(--ok);
    border: 1px solid rgba(var(--accent-rgb), .35);
    padding: 8px 16px; border-radius: 999px; font-weight: 700; font-size: .9rem;
  }
  .hc-status-icon svg { width: 17px; height: 17px; vertical-align: middle; }
  .hc-status-dot {
    width: 9px; height: 9px; border-radius: 50%; background: var(--ok);
    box-shadow: 0 0 0 0 rgba(var(--accent-rgb), .55); animation: hcBeat 1.8s ease-out infinite;
  }
  @keyframes hcBeat {
    0% { box-shadow: 0 0 0 0 rgba(var(--accent-rgb), .5); }
    70% { box-shadow: 0 0 0 10px rgba(var(--accent-rgb), 0); }
    100% { box-shadow: 0 0 0 0 rgba(var(--accent-rgb), 0); }
  }
  .hc-hero h1 { font-size: clamp(1.7rem, 4vw, 2.4rem); margin: 16px 0 6px; letter-spacing: -.01em; }
  .hc-sub { color: var(--muted); }

  .hc-grid {
    display: grid; gap: 16px; margin-bottom: 16px;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  }
  .hc-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 20px; box-shadow: var(--shadow);
    animation: hcRise .5s ease both; animation-delay: calc(var(--d, 0) * 80ms + 120ms);
  }
  @keyframes hcRise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
  .hc-card h3 {
    display: flex; align-items: center; gap: 9px; font-size: 1rem;
    margin-bottom: 14px; padding-inline-start: 12px;
    border-inline-start: 3px solid var(--accent);
  }
  .hc-ic { display: inline-flex; color: var(--accent); }
  .hc-ic svg { width: 18px; height: 18px; }

  .hc-row {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 9px 0; border-bottom: 1px solid var(--border);
  }
  .hc-row:last-child { border-bottom: 0; }
  .hc-row span { color: var(--muted); font-size: .9rem; }
  .hc-row b { font-weight: 600; text-align: end; word-break: break-word; }
  .hc-mono { font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size: .82rem; }
  .hc-ok { color: var(--ok); }

  .hc-endpoints { margin-bottom: 16px; }
  .hc-ep-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  .hc-ep-group { background: var(--surface-2); border: 1px solid var(--border); border-radius: 12px; padding: 14px; }
  .hc-ep-title { font-size: .82rem; color: var(--accent); font-weight: 700; margin-bottom: 8px; }
  .hc-ep-item {
    font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size: .78rem;
    color: var(--muted); padding: 4px 0; direction: ltr; text-align: start; unicode-bidi: plaintext;
  }

  .hc-json { margin-bottom: 22px; }
  .hc-json-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
  .hc-json-head h3 { margin: 0; }
  .hc-copy {
    border: 1px solid var(--border); background: var(--surface-2); color: var(--text);
    font: inherit; font-size: .8rem; padding: 6px 14px; border-radius: 999px; cursor: pointer;
    transition: background .2s ease, color .2s ease;
  }
  .hc-copy:hover { background: var(--accent); color: #fff; border-color: var(--accent); }
  .hc-json pre {
    background: var(--surface-2); border: 1px solid var(--border); border-radius: 12px;
    padding: 16px; overflow-x: auto; direction: ltr; text-align: start;
    font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size: .8rem;
    color: var(--text); line-height: 1.7;
  }

  .hc-nav { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; }
  .hc-btn {
    display: inline-flex; align-items: center; gap: 8px; text-decoration: none;
    background: var(--surface); border: 1px solid var(--border); color: var(--text);
    padding: 11px 20px; border-radius: 12px; font-weight: 600; font-size: .9rem;
    box-shadow: var(--shadow); transition: transform .2s ease, background .2s ease, color .2s ease;
  }
  .hc-btn:hover { transform: translateY(-2px); }
  .hc-btn .hc-ic svg { width: 16px; height: 16px; }
  .hc-btn-primary { background: var(--accent); color: #fff; border-color: transparent; }
  .hc-btn-primary .hc-ic { color: #fff; }

  @media (max-width: 600px) {
    .hc-topbar { justify-content: center; }
    .hc-row b { max-width: 60%; }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation: none !important; transition: none !important; }
  }
  `
}

// ==========================================
// Client Runtime (i18n switch, theme, render)
// ==========================================
function healthClientScript() {
  return `
  (function () {
    var data = JSON.parse(document.getElementById('hc-data').textContent);
    var root = document.documentElement;
    var STORE = { theme: 'hc_theme', lang: 'lang' };

    function read(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
    function write(key, val) {
      try { localStorage.setItem(key, val); } catch (e) {}
      if (key === STORE.lang) document.cookie = 'lang=' + val + ';path=/;max-age=31536000;SameSite=Lax';
    }

    function applyTheme(theme) {
      root.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
      write(STORE.theme, theme);
    }

    function localizedTime(iso, lang) {
      try {
        return new Intl.DateTimeFormat(data.langMeta[lang].locale, {
          dateStyle: 'medium', timeStyle: 'medium'
        }).format(new Date(iso));
      } catch (e) { return iso; }
    }

    function renderEndpoints(lang) {
      var dict = data.i18n[lang];
      var host = document.getElementById('hc-endpoints');
      host.innerHTML = data.endpointGroups.map(function (g) {
        var title = dict['grp_' + g.key] || g.key;
        var items = g.paths.map(function (p) {
          return '<div class="hc-ep-item">' + escapeHtml(p) + '</div>';
        }).join('');
        return '<div class="hc-ep-group"><div class="hc-ep-title">' + escapeHtml(title) + '</div>' + items + '</div>';
      }).join('');
    }

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    function applyLang(lang) {
      var dict = data.i18n[lang];
      var meta = data.langMeta[lang];
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
      document.querySelectorAll('.hc-lang-btn').forEach(function (b) {
        b.classList.toggle('is-active', b.getAttribute('data-lang') === lang);
      });

      var t = document.getElementById('hc-time');
      if (t) t.textContent = localizedTime(data.timestamp, lang);

      document.title = dict.title + ' - ' + data.health.game.name + ' | AmirCollider';
      renderEndpoints(lang);
      write(STORE.lang, lang);
    }

    document.getElementById('hc-json-body').textContent =
      JSON.stringify(data.health, null, 2);

    document.getElementById('hc-theme').addEventListener('click', function () {
      applyTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });

    document.querySelectorAll('.hc-lang-btn').forEach(function (b) {
      b.addEventListener('click', function () { applyLang(b.getAttribute('data-lang')); });
    });

    var copyBtn = document.getElementById('hc-copy');
    copyBtn.addEventListener('click', function () {
      var lang = root.getAttribute('lang') || data.lang;
      var dict = data.i18n[lang];
      var text = JSON.stringify(data.health, null, 2);
      var done = function () {
        copyBtn.querySelector('[data-i18n]').textContent = dict.copied;
        setTimeout(function () { copyBtn.querySelector('[data-i18n]').textContent = dict.copy; }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(function () {});
      }
    });

    var savedTheme = read(STORE.theme);
    if (savedTheme) {
      applyTheme(savedTheme);
    } else {
      root.setAttribute('data-theme',
        window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    }

    var savedLang = read(STORE.lang);
    applyLang(data.i18n[savedLang] ? savedLang : data.lang);
  })();
  `
}
