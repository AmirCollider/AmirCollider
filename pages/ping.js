// ==========================================
// pages/ping.js
// Ping Test Page Handler
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
// Quality Thresholds (ms) & Tier Keys
// ==========================================
const QUALITY = {
  excellentMax: 100,
  goodMax: 300,
  tiers: ['excellent', 'good', 'acceptable']
}

// ==========================================
// Localized UI Strings (fa / en / ja)
// ==========================================
const I18N = {
  fa: {
    title: 'تست پینگ',
    subtitle: 'تأخیر زنده تا شبکه‌ی لبه',
    live: 'زنده',
    measuring: 'در حال اندازه‌گیری…',
    failed: 'بدون پاسخ',
    current: 'فعلی',
    min: 'کمینه',
    avg: 'میانگین',
    max: 'بیشینه',
    jitter: 'نوسان',
    samples: 'نمونه‌ها',
    loss: 'افت',
    quality: 'کیفیت',
    q_excellent: 'عالی',
    q_good: 'خوب',
    q_acceptable: 'قابل‌قبول',
    gameInfo: 'اطلاعات بازی',
    name: 'نام',
    id: 'شناسه',
    status: 'وضعیت',
    online: 'آنلاین',
    details: 'جزئیات',
    timestamp: 'زمان',
    requestId: 'شناسه درخواست',
    jsonResponse: 'پاسخ JSON',
    copy: 'کپی',
    copied: 'کپی شد',
    retest: 'آزمون مجدد',
    pause: 'توقف',
    resume: 'ادامه',
    home: 'صفحه اصلی',
    health: 'بررسی سلامت',
    leaderboard: 'برترین‌ها',
    metrics: 'متریک‌ها',
    testsite: 'سایت تست',
    theme: 'تغییر تم',
    language: 'تغییر زبان'
  },
  en: {
    title: 'Ping Test',
    subtitle: 'Live latency to the edge network',
    live: 'Live',
    measuring: 'Measuring…',
    failed: 'No response',
    current: 'Current',
    min: 'Min',
    avg: 'Average',
    max: 'Max',
    jitter: 'Jitter',
    samples: 'Samples',
    loss: 'Loss',
    quality: 'Quality',
    q_excellent: 'Excellent',
    q_good: 'Good',
    q_acceptable: 'Acceptable',
    gameInfo: 'Game Info',
    name: 'Name',
    id: 'ID',
    status: 'Status',
    online: 'Online',
    details: 'Details',
    timestamp: 'Timestamp',
    requestId: 'Request ID',
    jsonResponse: 'JSON Response',
    copy: 'Copy',
    copied: 'Copied',
    retest: 'Retest',
    pause: 'Pause',
    resume: 'Resume',
    home: 'Home',
    health: 'Health',
    leaderboard: 'Leaderboard',
    metrics: 'Metrics',
    testsite: 'Test Site',
    theme: 'Toggle theme',
    language: 'Change language'
  },
  ja: {
    title: 'Pingテスト',
    subtitle: 'エッジネットワークまでのリアルタイム遅延',
    live: 'ライブ',
    measuring: '測定中…',
    failed: '応答なし',
    current: '現在',
    min: '最小',
    avg: '平均',
    max: '最大',
    jitter: 'ジッター',
    samples: 'サンプル',
    loss: 'ロス',
    quality: '品質',
    q_excellent: '優秀',
    q_good: '良好',
    q_acceptable: '許容',
    gameInfo: 'ゲーム情報',
    name: '名前',
    id: 'ID',
    status: 'ステータス',
    online: 'オンライン',
    details: '詳細',
    timestamp: 'タイムスタンプ',
    requestId: 'リクエストID',
    jsonResponse: 'JSONレスポンス',
    copy: 'コピー',
    copied: 'コピーしました',
    retest: '再テスト',
    pause: '一時停止',
    resume: '再開',
    home: 'ホーム',
    health: 'ヘルスチェック',
    leaderboard: 'リーダーボード',
    metrics: 'メトリクス',
    testsite: 'テストサイト',
    theme: 'テーマ切替',
    language: '言語切替'
  }
}

// ==========================================
// Inline SVG Icon Set (theme-aware via currentColor)
// ==========================================
const ICONS = {
  signal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20h.01"/><path d="M7 20v-4"/><path d="M12 20v-8"/><path d="M17 20V8"/><path d="M22 4v16"/></svg>',
  gauge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 14l4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>',
  activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  game: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="11" x2="10" y2="11"/><line x1="8" y1="9" x2="8" y2="13"/><line x1="15" y1="12" x2="15.01" y2="12"/><line x1="18" y1="10" x2="18.01" y2="10"/><rect x="2" y="6" width="20" height="12" rx="2"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  flask: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v6l-5.5 9.5A2 2 0 0 0 5.2 21h13.6a2 2 0 0 0 1.7-3.5L15 8V2"/><path d="M9 2h6"/><path d="M7.5 14h9"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>'
}

// ==========================================
// Ping Endpoint Handler (HTML + JSON)
// ==========================================
export async function handlePingWithUI(url, request, gameId, requestId, GAMES) {
  const game = validateGameId(gameId, GAMES)
  if (!game) {
    return createJsonResponse({
      error: 'invalid_game',
      message: 'Game not found or not configured',
      available_games: GAMES ? Object.keys(GAMES) : [],
      provided_game_id: gameId,
      requestId
    }, 404)
  }

  const ping = await measureEdgeLatency(url.origin)

  const pingData = {
    status: 'ok',
    game: game.name,
    gameId,
    ping,
    timestamp: new Date().toISOString(),
    quality: classifyQuality(ping),
    requestId
  }

  const acceptHeader = request.headers.get('Accept') || ''
  if (acceptHeader.includes('application/json')) {
    return createJsonResponse(pingData, 200)
  }

  const lang = detectLanguage(url, request)
  return createHtmlResponse(renderPingPage(pingData, game, url.origin, gameId, lang), 200)
}

// ==========================================
// Edge Latency Sample (HEAD round-trip)
// ==========================================
async function measureEdgeLatency(origin) {
  const start = Date.now()
  try {
    await fetch(`${origin}/`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(CONFIG.PING_TIMEOUT_MS)
    })
  } catch (e) {}
  return Date.now() - start
}

// ==========================================
// Quality Classifier (shared thresholds)
// ==========================================
function classifyQuality(ping) {
  if (ping < QUALITY.excellentMax) return 'excellent'
  if (ping < QUALITY.goodMax) return 'good'
  return 'acceptable'
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
// Ping Page Renderer
// ==========================================
function renderPingPage(pingData, game, baseUrl, gameId, lang) {
  const meta = LANG_META[lang]
  const accent = game.color || '#667eea'
  const accentRgb = hexToRgb(accent)
  const amirLogo = CONFIG.AMIR_LOGO
  const gameLogo = game.logo || CONFIG.DEFAULT_GAME_LOGO
  const t = I18N[lang]

  const payload = {
    lang,
    i18n: I18N,
    langMeta: LANG_META,
    quality: QUALITY,
    timeoutMs: CONFIG.PING_TIMEOUT_MS,
    pingUrl: `${baseUrl}/${gameId}/ping`,
    timestamp: pingData.timestamp,
    ping: pingData
  }
  const payloadJson = JSON.stringify(payload).replace(/</g, '\\u003c')

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${meta.dir}" data-theme="">
<head>
  ${getPageHead({ title: `${t.title} - ${esc(game.name)} | AmirCollider`, amirLogo })}
  <style>${pingStyles(accent, accentRgb)}</style>
</head>
<body>
  <div class="pg-bg" aria-hidden="true"></div>

  <main class="pg-shell">
    <header class="pg-topbar">
      <div class="pg-brand">
        <span class="pg-logo"><img src="${esc(amirLogo)}" alt="AmirCollider" onerror="this.style.display='none'"></span>
        <span class="pg-logo pg-logo-game"><img src="${esc(gameLogo)}" alt="${esc(game.name)}" onerror="this.style.display='none'"></span>
        <span class="pg-brand-name">${esc(game.name)}</span>
      </div>
      <div class="pg-controls">
        <div class="pg-lang" role="group" data-i18n-aria="language">
          ${LANGS.map(code => `<button type="button" class="pg-lang-btn" data-lang="${code}">${LANG_META[code].label}</button>`).join('')}
        </div>
        <button type="button" class="pg-icon-btn" id="pg-theme" data-i18n-aria="theme">
          <span class="pg-sun">${ICONS.sun}</span><span class="pg-moon">${ICONS.moon}</span>
        </button>
      </div>
    </header>

    <section class="pg-hero">
      <span class="pg-status">
        <span class="pg-status-dot"></span>
        <span class="pg-status-icon">${ICONS.signal}</span>
        <span data-i18n="live">${esc(t.live)}</span>
      </span>
      <h1 data-i18n="title">${esc(t.title)}</h1>
      <p class="pg-sub" data-i18n="subtitle">${esc(t.subtitle)}</p>
    </section>

    <section class="pg-card pg-readout" data-quality="${esc(pingData.quality)}">
      <div class="pg-meter">
        <div class="pg-meter-value"><span id="pg-current" aria-live="polite">${esc(pingData.ping)}</span><span class="pg-unit">ms</span></div>
        <span class="pg-badge" id="pg-badge" data-i18n="q_${esc(pingData.quality)}">${esc(t['q_' + pingData.quality])}</span>
      </div>
      <svg class="pg-spark" id="pg-spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
        <polygon class="pg-spark-area" id="pg-spark-area" points=""></polygon>
        <polyline class="pg-spark-line" id="pg-spark-line" points=""></polyline>
      </svg>
    </section>

    <section class="pg-stats">
      <div class="pg-stat" style="--d:0"><span class="pg-stat-k" data-i18n="min">${esc(t.min)}</span><span class="pg-stat-v"><b id="pg-min">—</b><i>ms</i></span></div>
      <div class="pg-stat" style="--d:1"><span class="pg-stat-k" data-i18n="avg">${esc(t.avg)}</span><span class="pg-stat-v"><b id="pg-avg">—</b><i>ms</i></span></div>
      <div class="pg-stat" style="--d:2"><span class="pg-stat-k" data-i18n="max">${esc(t.max)}</span><span class="pg-stat-v"><b id="pg-max">—</b><i>ms</i></span></div>
      <div class="pg-stat" style="--d:3"><span class="pg-stat-k" data-i18n="jitter">${esc(t.jitter)}</span><span class="pg-stat-v"><b id="pg-jitter">—</b><i>ms</i></span></div>
      <div class="pg-stat" style="--d:4"><span class="pg-stat-k" data-i18n="samples">${esc(t.samples)}</span><span class="pg-stat-v"><b id="pg-samples">0</b></span></div>
      <div class="pg-stat" style="--d:5"><span class="pg-stat-k" data-i18n="loss">${esc(t.loss)}</span><span class="pg-stat-v"><b id="pg-loss">0</b><i>%</i></span></div>
    </section>

    <section class="pg-actions">
      <button type="button" class="pg-btn pg-btn-primary" id="pg-toggle">
        <span class="pg-ic" id="pg-toggle-icon">${ICONS.pause}</span><span id="pg-toggle-label" data-i18n="pause">${esc(t.pause)}</span>
      </button>
      <button type="button" class="pg-btn" id="pg-retest">
        <span class="pg-ic">${ICONS.refresh}</span><span data-i18n="retest">${esc(t.retest)}</span>
      </button>
    </section>

    <section class="pg-grid">
      <article class="pg-card" style="--d:0">
        <h3><span class="pg-ic">${ICONS.game}</span><span data-i18n="gameInfo">${esc(t.gameInfo)}</span></h3>
        <div class="pg-row"><span data-i18n="name">${esc(t.name)}</span><b>${esc(game.name)}</b></div>
        <div class="pg-row"><span data-i18n="id">${esc(t.id)}</span><b class="pg-mono">${esc(gameId)}</b></div>
        <div class="pg-row"><span data-i18n="status">${esc(t.status)}</span><b class="pg-ok" data-i18n="online">${esc(t.online)}</b></div>
      </article>

      <article class="pg-card" style="--d:1">
        <h3><span class="pg-ic">${ICONS.clock}</span><span data-i18n="details">${esc(t.details)}</span></h3>
        <div class="pg-row"><span data-i18n="timestamp">${esc(t.timestamp)}</span><b id="pg-time">${esc(pingData.timestamp)}</b></div>
        <div class="pg-row"><span data-i18n="requestId">${esc(t.requestId)}</span><b class="pg-mono">${esc(pingData.requestId)}</b></div>
      </article>
    </section>

    <section class="pg-card pg-json">
      <div class="pg-json-head">
        <h3><span class="pg-ic">${ICONS.code}</span><span data-i18n="jsonResponse">${esc(t.jsonResponse)}</span></h3>
        <button type="button" class="pg-copy" id="pg-copy"><span data-i18n="copy">${esc(t.copy)}</span></button>
      </div>
      <pre id="pg-json-body"></pre>
    </section>

    <nav class="pg-nav">
      <a class="pg-btn pg-btn-primary" href="${esc(baseUrl)}"><span class="pg-ic">${ICONS.home}</span><span data-i18n="home">${esc(t.home)}</span></a>
      <a class="pg-btn" href="${esc(baseUrl)}/${esc(gameId)}/health"><span class="pg-ic">${ICONS.heart}</span><span data-i18n="health">${esc(t.health)}</span></a>
      <a class="pg-btn" href="${esc(baseUrl)}/${esc(gameId)}/leaderboard"><span class="pg-ic">${ICONS.trophy}</span><span data-i18n="leaderboard">${esc(t.leaderboard)}</span></a>
      <a class="pg-btn" href="${esc(baseUrl)}/metrics"><span class="pg-ic">${ICONS.chart}</span><span data-i18n="metrics">${esc(t.metrics)}</span></a>
      <a class="pg-btn" href="${esc(baseUrl)}/testsite"><span class="pg-ic">${ICONS.flask}</span><span data-i18n="testsite">${esc(t.testsite)}</span></a>
    </nav>
  </main>

  <script id="pg-data" type="application/json">${payloadJson}</script>
  <script>${pingClientScript()}</script>
</body>
</html>`
}

// ==========================================
// Page Styles (light/dark + RTL/LTR safe)
// ==========================================
function pingStyles(accent, accentRgb) {
  return `
  :root {
    --accent: ${accent};
    --accent-rgb: ${accentRgb};
    --bg: #f4f6fb;
    --surface: #ffffff;
    --surface-2: #f7f9fd;
    --text: #1d2433;
    --muted: #6b7488;
    --border: rgba(20, 28, 45, 0.10);
    --shadow: 0 10px 30px rgba(20, 28, 45, 0.10);
    --ok: #18a558;
    --warn: #e6920a;
    --bad: #e0473b;
    --radius: 16px;
  }
  [data-theme="dark"] {
    --bg: #0e131c;
    --surface: #161e2b;
    --surface-2: #1c2636;
    --text: #e7ecf5;
    --muted: #9aa6bd;
    --border: rgba(255, 255, 255, 0.08);
    --shadow: 0 14px 36px rgba(0, 0, 0, 0.45);
    --ok: #2ecc71;
    --warn: #f5a623;
    --bad: #ff5a4d;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #0e131c; --surface: #161e2b; --surface-2: #1c2636;
      --text: #e7ecf5; --muted: #9aa6bd; --border: rgba(255,255,255,0.08);
      --shadow: 0 14px 36px rgba(0,0,0,0.45); --ok: #2ecc71; --warn: #f5a623; --bad: #ff5a4d;
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

  .pg-bg {
    position: fixed; inset: 0; z-index: -1; pointer-events: none;
    background:
      radial-gradient(60vw 60vw at 85% -10%, rgba(var(--accent-rgb), .16), transparent 60%),
      radial-gradient(55vw 55vw at -10% 110%, rgba(var(--accent-rgb), .12), transparent 60%);
  }

  .pg-shell {
    max-width: 960px;
    margin-inline: auto;
    padding: clamp(18px, 4vw, 40px);
    animation: pgFade .5s ease both;
  }
  @keyframes pgFade { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }

  .pg-topbar {
    display: flex; align-items: center; justify-content: space-between;
    gap: 16px; flex-wrap: wrap; margin-bottom: 28px;
  }
  .pg-brand { display: flex; align-items: center; gap: 10px; }
  .pg-logo {
    width: 38px; height: 38px; border-radius: 50%; overflow: hidden;
    background: var(--surface); border: 1px solid var(--border);
    display: inline-flex; align-items: center; justify-content: center; flex: none;
  }
  .pg-logo img { width: 100%; height: 100%; object-fit: cover; }
  .pg-logo-game { margin-inline-start: -14px; }
  .pg-brand-name { font-weight: 700; font-size: .98rem; }

  .pg-controls { display: flex; align-items: center; gap: 10px; }
  .pg-lang {
    display: inline-flex; background: var(--surface); border: 1px solid var(--border);
    border-radius: 999px; padding: 3px; box-shadow: var(--shadow);
  }
  .pg-lang-btn {
    border: 0; background: transparent; color: var(--muted); cursor: pointer;
    font: inherit; font-size: .82rem; padding: 6px 12px; border-radius: 999px;
    transition: color .2s ease, background .2s ease;
  }
  .pg-lang-btn:hover { color: var(--text); }
  .pg-lang-btn.is-active { color: #fff; background: var(--accent); }

  .pg-icon-btn {
    width: 40px; height: 40px; border-radius: 50%; cursor: pointer;
    background: var(--surface); border: 1px solid var(--border); color: var(--text);
    display: inline-flex; align-items: center; justify-content: center;
    box-shadow: var(--shadow); transition: transform .2s ease, background .2s ease;
  }
  .pg-icon-btn:hover { transform: translateY(-2px); }
  .pg-icon-btn svg { width: 19px; height: 19px; }
  .pg-sun { display: none; } .pg-moon { display: inline-flex; }
  [data-theme="dark"] .pg-sun { display: inline-flex; } [data-theme="dark"] .pg-moon { display: none; }

  .pg-hero { text-align: center; margin: 8px 0 26px; }
  .pg-status {
    display: inline-flex; align-items: center; gap: 8px;
    background: rgba(var(--accent-rgb), .10); color: var(--accent);
    border: 1px solid rgba(var(--accent-rgb), .35);
    padding: 8px 16px; border-radius: 999px; font-weight: 700; font-size: .9rem;
  }
  .pg-status-icon svg { width: 17px; height: 17px; vertical-align: middle; }
  .pg-status-dot {
    width: 9px; height: 9px; border-radius: 50%; background: var(--accent);
    box-shadow: 0 0 0 0 rgba(var(--accent-rgb), .55); animation: pgBeat 1.8s ease-out infinite;
  }
  @keyframes pgBeat {
    0% { box-shadow: 0 0 0 0 rgba(var(--accent-rgb), .5); }
    70% { box-shadow: 0 0 0 10px rgba(var(--accent-rgb), 0); }
    100% { box-shadow: 0 0 0 0 rgba(var(--accent-rgb), 0); }
  }
  .pg-hero h1 { font-size: clamp(1.7rem, 4vw, 2.4rem); margin: 16px 0 6px; letter-spacing: -.01em; }
  .pg-sub { color: var(--muted); }

  .pg-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 20px; box-shadow: var(--shadow);
  }

  .pg-readout { margin-bottom: 16px; overflow: hidden; }
  .pg-meter {
    display: flex; align-items: center; justify-content: space-between;
    gap: 16px; flex-wrap: wrap; margin-bottom: 14px;
  }
  .pg-meter-value {
    display: inline-flex; align-items: baseline; gap: 6px;
    direction: ltr; unicode-bidi: plaintext;
    font-variant-numeric: tabular-nums; font-weight: 800;
    font-size: clamp(2.6rem, 9vw, 4.2rem); line-height: 1; letter-spacing: -.02em;
    color: var(--qc, var(--accent)); transition: color .3s ease;
  }
  .pg-meter-value .pg-unit { font-size: .32em; font-weight: 700; color: var(--muted); }
  #pg-current { transition: opacity .15s ease; }
  .pg-badge {
    align-self: center; padding: 8px 18px; border-radius: 999px;
    font-weight: 700; font-size: .9rem;
    color: var(--qc, var(--accent));
    background: rgba(var(--qc-rgb, var(--accent-rgb)), .12);
    border: 1px solid rgba(var(--qc-rgb, var(--accent-rgb)), .4);
    transition: color .3s ease, background .3s ease, border-color .3s ease;
  }
  .pg-readout[data-quality="excellent"] { --qc: var(--ok); --qc-rgb: 24, 165, 88; }
  .pg-readout[data-quality="good"] { --qc: var(--warn); --qc-rgb: 230, 146, 10; }
  .pg-readout[data-quality="acceptable"] { --qc: var(--bad); --qc-rgb: 224, 71, 59; }
  [data-theme="dark"] .pg-readout[data-quality="excellent"] { --qc-rgb: 46, 204, 113; }
  [data-theme="dark"] .pg-readout[data-quality="good"] { --qc-rgb: 245, 166, 35; }
  [data-theme="dark"] .pg-readout[data-quality="acceptable"] { --qc-rgb: 255, 90, 77; }

  .pg-spark { width: 100%; height: 56px; display: block; }
  .pg-spark-line {
    fill: none; stroke: var(--qc, var(--accent)); stroke-width: 2;
    stroke-linecap: round; stroke-linejoin: round;
    vector-effect: non-scaling-stroke; transition: stroke .3s ease;
  }
  .pg-spark-area { fill: rgba(var(--qc-rgb, var(--accent-rgb)), .12); stroke: none; transition: fill .3s ease; }

  .pg-stats {
    display: grid; gap: 12px; margin-bottom: 16px;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  }
  .pg-stat {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 14px; padding: 14px 16px; box-shadow: var(--shadow);
    display: flex; flex-direction: column; gap: 6px;
    animation: pgRise .5s ease both; animation-delay: calc(var(--d, 0) * 60ms + 120ms);
  }
  @keyframes pgRise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
  .pg-stat-k { color: var(--muted); font-size: .82rem; }
  .pg-stat-v { display: inline-flex; align-items: baseline; gap: 4px; direction: ltr; unicode-bidi: plaintext; }
  .pg-stat-v b { font-size: 1.45rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .pg-stat-v i { font-style: normal; color: var(--muted); font-size: .82rem; }

  .pg-actions { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; margin-bottom: 22px; }

  .pg-grid {
    display: grid; gap: 16px; margin-bottom: 16px;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  }
  .pg-card h3 {
    display: flex; align-items: center; gap: 9px; font-size: 1rem;
    margin-bottom: 14px; padding-inline-start: 12px;
    border-inline-start: 3px solid var(--accent);
  }
  .pg-ic { display: inline-flex; color: var(--accent); }
  .pg-ic svg { width: 18px; height: 18px; }

  .pg-row {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 9px 0; border-bottom: 1px solid var(--border);
  }
  .pg-row:last-child { border-bottom: 0; }
  .pg-row span { color: var(--muted); font-size: .9rem; }
  .pg-row b { font-weight: 600; text-align: end; word-break: break-word; }
  .pg-mono { font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size: .82rem; direction: ltr; unicode-bidi: plaintext; }
  .pg-ok { color: var(--ok); }

  .pg-json { margin-bottom: 22px; }
  .pg-json-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
  .pg-json-head h3 { margin: 0; }
  .pg-copy {
    border: 1px solid var(--border); background: var(--surface-2); color: var(--text);
    font: inherit; font-size: .8rem; padding: 6px 14px; border-radius: 999px; cursor: pointer;
    transition: background .2s ease, color .2s ease;
  }
  .pg-copy:hover { background: var(--accent); color: #fff; border-color: var(--accent); }
  .pg-json pre {
    background: var(--surface-2); border: 1px solid var(--border); border-radius: 12px;
    padding: 16px; overflow-x: auto; direction: ltr; text-align: start;
    font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size: .8rem;
    color: var(--text); line-height: 1.7;
  }

  .pg-nav { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; }
  .pg-btn {
    display: inline-flex; align-items: center; gap: 8px; text-decoration: none;
    background: var(--surface); border: 1px solid var(--border); color: var(--text);
    padding: 11px 20px; border-radius: 12px; font-weight: 600; font-size: .9rem;
    box-shadow: var(--shadow); cursor: pointer; font-family: inherit;
    transition: transform .2s ease, background .2s ease, color .2s ease;
  }
  .pg-btn:hover { transform: translateY(-2px); }
  .pg-btn .pg-ic svg { width: 16px; height: 16px; }
  .pg-btn-primary { background: var(--accent); color: #fff; border-color: transparent; }
  .pg-btn-primary .pg-ic { color: #fff; }

  @media (max-width: 600px) {
    .pg-topbar { justify-content: center; }
    .pg-row b { max-width: 60%; }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation: none !important; transition: none !important; }
  }
  `
}

// ==========================================
// Client Runtime (live ping, i18n, theme)
// ==========================================
function pingClientScript() {
  return `
  (function () {
    var data = JSON.parse(document.getElementById('pg-data').textContent);
    var root = document.documentElement;
    var STORE = { theme: 'hc_theme', lang: 'lang' };
    var MAX_SAMPLES = 24;

    var samples = [];
    var sent = 0, lost = 0;
    var timer = null, inFlight = false, userPaused = false;

    var el = {
      current: document.getElementById('pg-current'),
      badge: document.getElementById('pg-badge'),
      readout: document.querySelector('.pg-readout'),
      min: document.getElementById('pg-min'),
      avg: document.getElementById('pg-avg'),
      max: document.getElementById('pg-max'),
      jitter: document.getElementById('pg-jitter'),
      samples: document.getElementById('pg-samples'),
      loss: document.getElementById('pg-loss'),
      sparkLine: document.getElementById('pg-spark-line'),
      sparkArea: document.getElementById('pg-spark-area'),
      time: document.getElementById('pg-time'),
      toggle: document.getElementById('pg-toggle'),
      toggleIcon: document.getElementById('pg-toggle-icon'),
      toggleLabel: document.getElementById('pg-toggle-label')
    };

    var ICON_PAUSE = el.toggleIcon.innerHTML;
    var ICON_PLAY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>';

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
        return new Intl.DateTimeFormat(data.langMeta[lang].locale, { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(iso));
      } catch (e) { return iso; }
    }

    function classify(ping) {
      if (ping < data.quality.excellentMax) return 'excellent';
      if (ping < data.quality.goodMax) return 'good';
      return 'acceptable';
    }

    function currentLang() { return root.getAttribute('lang') || data.lang; }

    function setText(node, value) { if (node) node.textContent = value; }

    function renderSpark() {
      if (!samples.length) { el.sparkLine.setAttribute('points', ''); el.sparkArea.setAttribute('points', ''); return; }
      var max = Math.max.apply(null, samples);
      var min = Math.min.apply(null, samples);
      var span = Math.max(1, max - min);
      var n = samples.length;
      var pts = samples.map(function (v, i) {
        var x = n === 1 ? 100 : (i / (n - 1)) * 100;
        var y = 30 - ((v - min) / span) * 26 - 2;
        return x.toFixed(2) + ',' + y.toFixed(2);
      });
      el.sparkLine.setAttribute('points', pts.join(' '));
      el.sparkArea.setAttribute('points', '0,32 ' + pts.join(' ') + ' 100,32');
    }

    function renderStats() {
      if (samples.length) {
        var sum = 0, min = Infinity, max = -Infinity, jit = 0;
        for (var i = 0; i < samples.length; i++) {
          var v = samples[i];
          sum += v;
          if (v < min) min = v;
          if (v > max) max = v;
          if (i > 0) jit += Math.abs(v - samples[i - 1]);
        }
        setText(el.min, min);
        setText(el.avg, Math.round(sum / samples.length));
        setText(el.max, max);
        setText(el.jitter, samples.length > 1 ? Math.round(jit / (samples.length - 1)) : 0);
      }
      setText(el.samples, sent);
      setText(el.loss, sent ? Math.round((lost / sent) * 100) : 0);
    }

    function applyQuality(ping) {
      var lang = currentLang();
      var q = classify(ping);
      el.readout.setAttribute('data-quality', q);
      el.badge.setAttribute('data-i18n', 'q_' + q);
      el.badge.textContent = data.i18n[lang]['q_' + q];
    }

    function pushSample(ping) {
      samples.push(ping);
      if (samples.length > MAX_SAMPLES) samples.shift();
      el.current.style.opacity = '0.45';
      setText(el.current, ping);
      requestAnimationFrame(function () { el.current.style.opacity = '1'; });
      applyQuality(ping);
      renderSpark();
      renderStats();
    }

    function markLost() {
      var lang = currentLang();
      el.current.textContent = '—';
      el.badge.removeAttribute('data-i18n');
      el.badge.textContent = data.i18n[lang].failed;
      renderStats();
    }

    function schedule() {
      if (userPaused || document.hidden) return;
      timer = setTimeout(probe, 1500);
    }

    function probe() {
      if (inFlight || userPaused || document.hidden) return;
      inFlight = true;
      sent++;
      var started = performance.now();
      var ctrl = new AbortController();
      var to = setTimeout(function () { ctrl.abort(); }, data.timeoutMs);
      fetch(data.pingUrl + '?_=' + Date.now(), {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        cache: 'no-store',
        signal: ctrl.signal
      }).then(function (res) {
        if (!res.ok) throw new Error('bad status');
        return res.text();
      }).then(function () {
        pushSample(Math.round(performance.now() - started));
      }).catch(function () {
        lost++;
        markLost();
      }).finally(function () {
        clearTimeout(to);
        inFlight = false;
        schedule();
      });
    }

    function setRunning(running) {
      userPaused = !running;
      var lang = currentLang();
      el.toggleIcon.innerHTML = running ? ICON_PAUSE : ICON_PLAY;
      el.toggleLabel.setAttribute('data-i18n', running ? 'pause' : 'resume');
      el.toggleLabel.textContent = data.i18n[lang][running ? 'pause' : 'resume'];
      if (running) { clearTimeout(timer); probe(); }
      else clearTimeout(timer);
    }

    function resetSamples() {
      samples = []; sent = 0; lost = 0;
      el.sparkLine.setAttribute('points', '');
      el.sparkArea.setAttribute('points', '');
      ['min', 'avg', 'max', 'jitter'].forEach(function (k) { setText(el[k], '—'); });
      setText(el.samples, 0); setText(el.loss, 0);
      el.current.textContent = '…';
    }

    function applyLang(lang) {
      var dict = data.i18n[lang];
      var meta = data.langMeta[lang];
      root.setAttribute('lang', lang);
      root.setAttribute('dir', meta.dir);

      document.querySelectorAll('[data-i18n]').forEach(function (node) {
        var key = node.getAttribute('data-i18n');
        if (dict[key] != null) node.textContent = dict[key];
      });
      document.querySelectorAll('[data-i18n-aria]').forEach(function (node) {
        var key = node.getAttribute('data-i18n-aria');
        if (dict[key] != null) node.setAttribute('aria-label', dict[key]);
      });
      document.querySelectorAll('.pg-lang-btn').forEach(function (b) {
        b.classList.toggle('is-active', b.getAttribute('data-lang') === lang);
      });

      if (el.time) el.time.textContent = localizedTime(data.timestamp, lang);
      document.title = dict.title + ' - ' + data.ping.game + ' | AmirCollider';
      write(STORE.lang, lang);
    }

    document.getElementById('pg-json-body').textContent = JSON.stringify(data.ping, null, 2);

    document.getElementById('pg-theme').addEventListener('click', function () {
      applyTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });

    document.querySelectorAll('.pg-lang-btn').forEach(function (b) {
      b.addEventListener('click', function () { applyLang(b.getAttribute('data-lang')); });
    });

    el.toggle.addEventListener('click', function () { setRunning(userPaused); });
    document.getElementById('pg-retest').addEventListener('click', function () {
      resetSamples();
      if (userPaused) setRunning(true); else { clearTimeout(timer); probe(); }
    });

    var copyBtn = document.getElementById('pg-copy');
    copyBtn.addEventListener('click', function () {
      var dict = data.i18n[currentLang()];
      var text = JSON.stringify(data.ping, null, 2);
      var done = function () {
        copyBtn.querySelector('[data-i18n]').textContent = dict.copied;
        setTimeout(function () { copyBtn.querySelector('[data-i18n]').textContent = dict.copy; }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(function () {});
      }
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) clearTimeout(timer);
      else if (!userPaused) probe();
    });

    var savedTheme = read(STORE.theme);
    if (savedTheme) applyTheme(savedTheme);
    else root.setAttribute('data-theme', window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

    var savedLang = read(STORE.lang);
    applyLang(data.i18n[savedLang] ? savedLang : data.lang);

    pushSample(data.ping.ping);
    sent = 1;
    renderStats();
    probe();
  })();
  `
}
