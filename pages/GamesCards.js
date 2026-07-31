// ==========================================
// pages/GamesCards.js
// Game Cards HTML Generator
// AmirCollider Games - Worker Proxy
// ==========================================
//
// Responsibilities
//   - Render the grid of game cards shown on the dashboard.
//   - Stay a pure, side-effect-free view layer: input is data,
//     output is an HTML string. No fetching, no logging, no state.
//
// Integration contract (do not break without updating callers)
//   - Public entry: createGamesCardsHTML(GAMES, baseUrl, options)
//   - Diagnostics call: testHealth(id) / testPing(id) / testMetrics(id)
//     (defined in pages/dashboard.js)
//   - Result target: <div class="result-box" id="result-<id>">
//     (styled and driven by pages/dashboard.js)
//   - Outer wrapper keeps class "games-grid" so the dashboard grid
//     layout governs positioning.
//
// ------------------------------------------------------------
// WHAT CHANGED, AND WHY
// ------------------------------------------------------------
// The card used to be six equal buttons: health, ping, metrics,
// privacy, terms, leaderboard. Every one of them answers a
// question a developer has and nobody else does, and three of
// them are meaningless for a game that plays offline and only
// reaches the network to sign in.
//
// So the card now leads with what a visitor came for - sign in,
// buy something, download it - and the diagnostics are folded
// into a collapsed panel underneath. They are still one click
// away, they are simply no longer the first thing the page says
// about a game.
//
// What appears is driven by game.capabilities, so an offline
// game stops advertising a ping test by saying `onlinePlay:
// false` in config.js rather than by anybody editing this file.
// The download button reflects the database's offline switch:
// withdrawn means greyed and labelled, never missing, because a
// button that vanishes reads as a bug and a greyed one reads as
// a decision.
//
// Extending
//   - Add a game:        add one entry to GAME_REGISTRY in config.js.
//   - Translate a game:  add game.i18n.description[lang] in config.js.
//   - Add a UI language: add one entry to CARD_I18N below.
//   - Bespoke card:      register a renderer in CUSTOM_CARD_RENDERERS.
// ==========================================

const MYKET_LOGO_URL = '/assets/MyketLogo.png'
const DEFAULT_LANG = 'fa'

// ==========================================
// i18n - card UI strings (fa / en / ja)
// ==========================================
const CARD_I18N = {
  fa: {
    // status
    live: 'فعال',
    maintenance: 'دانلود موقتاً برداشته شده',
    soon: 'به‌زودی',

    // capabilities
    capOffline: 'قابل بازی بدون اینترنت',
    capOnline: 'بازی آنلاین',
    capLogin: 'ورود با گوگل',
    capCloud: 'ذخیره‌ی ابری',
    capBoard: 'جدول امتیازات',
    capStore: 'خرید درون‌برنامه‌ای',

    // the offline explainer
    offlineNote: 'این بازی آفلاین اجرا می‌شود. اینترنت فقط برای ورود به حساب، ذخیره‌ی ابری و خرید لازم است.',

    // primary actions
    account: 'ورود به حساب',
    accountHint: 'با حساب گوگل',
    store: 'خرید درون‌برنامه‌ای',
    storeHint: 'پرداخت با ارز دیجیتال',
    download: 'دانلود',
    downloadOff: 'دانلود در دسترس نیست',
    downloadFrom: 'دانلود از',
    myket: 'مایکت',

    // secondary
    leaderboard: 'جدول امتیازات',
    privacy: 'حریم خصوصی',
    terms: 'شرایط استفاده',

    // diagnostics
    diagnostics: 'بررسی سرویس‌ها',
    health: 'سلامت',
    ping: 'پینگ',
    metrics: 'متریک‌ها'
  },

  en: {
    live: 'Live',
    maintenance: 'Download withdrawn',
    soon: 'Coming soon',

    capOffline: 'Plays offline',
    capOnline: 'Online play',
    capLogin: 'Google sign-in',
    capCloud: 'Cloud save',
    capBoard: 'Leaderboard',
    capStore: 'In-app purchases',

    offlineNote: 'This game runs offline. The network is only needed to sign in, sync your save and buy things.',

    account: 'Sign in',
    accountHint: 'with Google',
    store: 'In-app purchases',
    storeHint: 'pay with crypto',
    download: 'Download',
    downloadOff: 'Download unavailable',
    downloadFrom: 'Download on',
    myket: 'Myket',

    leaderboard: 'Leaderboard',
    privacy: 'Privacy',
    terms: 'Terms',

    diagnostics: 'Service checks',
    health: 'Health',
    ping: 'Ping',
    metrics: 'Metrics'
  },

  ja: {
    live: '稼働中',
    maintenance: 'ダウンロード停止中',
    soon: '近日公開',

    capOffline: 'オフラインで遊べる',
    capOnline: 'オンラインプレイ',
    capLogin: 'Google サインイン',
    capCloud: 'クラウドセーブ',
    capBoard: 'ランキング',
    capStore: 'アプリ内購入',

    offlineNote: 'このゲームはオフラインで動作します。ネットワークはサインイン・セーブ同期・購入にのみ必要です。',

    account: 'サインイン',
    accountHint: 'Google アカウント',
    store: 'アプリ内購入',
    storeHint: '暗号資産で支払い',
    download: 'ダウンロード',
    downloadOff: 'ダウンロード停止中',
    downloadFrom: '入手先',
    myket: 'Myket',

    leaderboard: 'ランキング',
    privacy: 'プライバシー',
    terms: '利用規約',

    diagnostics: 'サービス確認',
    health: 'ヘルス',
    ping: 'Ping',
    metrics: 'メトリクス'
  }
}

// ==========================================
// i18n helpers
// ==========================================
function resolveLang(lang) {
  return CARD_I18N[lang] ? lang : DEFAULT_LANG
}

function t(lang, key) {
  const pack = CARD_I18N[resolveLang(lang)]
  return pack[key] !== undefined ? pack[key] : CARD_I18N[DEFAULT_LANG][key]
}

function dirFor(lang) {
  return resolveLang(lang) === 'fa' ? 'rtl' : 'ltr'
}

function localizedDescription(game, lang) {
  const byLang = game && game.i18n && game.i18n.description
  if (byLang && byLang[resolveLang(lang)]) return byLang[resolveLang(lang)]
  return game && game.description ? game.description : ''
}

// ==========================================
// Output-safety helpers
// ==========================================
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Reduce an id to a safe slug for use in selectors, hrefs and JS calls.
function safeId(id) {
  return String(id == null ? '' : id).replace(/[^a-zA-Z0-9_-]/g, '')
}

// A colour is interpolated into a style attribute, which is the
// one place HTML escaping is not enough - a value that is not a
// hex colour has no business being there at all.
function safeColor(value, fallback) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || '')) ? value : fallback
}


// ==========================================
// Reading a game
//
// Cards are rendered from either the raw registry or the merged
// registry (games/registry.js), depending on which page is
// asking. These readers make the difference invisible: a game
// with no capabilities block behaves like a plain one with a
// download link, which is what every game was before this
// existed.
// ==========================================
function caps(game) {
  return (game && game.capabilities) || {}
}

function statusOf(game) {
  return (game && game.status) || 'live'
}

function downloadLinks(game) {
  const download = (game && game.download) || {}
  const links = download.links || {}
  if (!Object.keys(links).length && game && game.myketUrl) return { myket: game.myketUrl }
  return links
}

// Enabled unless the merge layer said otherwise. Reading it as
// "not explicitly false" rather than "=== true" is what lets an
// unmerged registry game - one rendered straight from
// config.js - still show its download button.
function downloadEnabled(game) {
  const download = (game && game.download) || {}
  if (download.enabled === false) return false
  if (statusOf(game) === 'soon') return false
  return Object.keys(downloadLinks(game)).length > 0
}


// ==========================================
// SVG icon set (stroke uses currentColor)
// ==========================================
const ICONS = {
  health: '<path d="M3 12h4l2-7 4 14 2-7h4"/>',
  ping: '<path d="M4 13a9 9 0 0 1 16 0"/><path d="M7.5 14.5a5.5 5.5 0 0 1 9 0"/><circle cx="12" cy="16" r="1.4"/>',
  metrics: '<line x1="6" y1="20" x2="6" y2="12"/><line x1="12" y1="20" x2="12" y2="5"/><line x1="18" y1="20" x2="18" y2="14"/>',
  privacy: '<path d="M12 3l7 3v5c0 4.6-3 7.7-7 9-4-1.3-7-4.4-7-9V6z"/>',
  terms: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><line x1="9.5" y1="12.5" x2="15" y2="12.5"/><line x1="9.5" y1="16" x2="15" y2="16"/>',
  leaderboard: '<path d="M8 4h8v4a4 4 0 0 1-8 0z"/><path d="M8 6H5v1a3 3 0 0 0 3 3"/><path d="M16 6h3v1a3 3 0 0 1-3 3"/><rect x="10" y="14" width="4" height="3"/><line x1="8" y1="20" x2="16" y2="20"/>',
  download: '<path d="M12 4v10"/><path d="M8 11l4 4 4-4"/><path d="M5 19h14"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.6 12.4a1.5 1.5 0 0 0 1.5 1.2h8.3a1.5 1.5 0 0 0 1.5-1.2L21 7H6"/>',
  wifiOff: '<path d="M2 2l20 20"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M5 12.5a10 10 0 0 1 3.5-2.3"/><path d="M19 12.5a10 10 0 0 0-6-2.4"/><circle cx="12" cy="20" r="1"/>',
  cloud: '<path d="M7 18a4 4 0 0 1 0-8 5.5 5.5 0 0 1 10.5 1.5A3.5 3.5 0 0 1 17 18z"/>',
  key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9"/><path d="M18 12v3"/><path d="M15.5 12v2.5"/>',
  chevron: '<polyline points="9 6 15 12 9 18"/>'
}

function icon(name, cls) {
  return `<svg class="${cls || 'gc-ic'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`
}


// ==========================================
// Shared stylesheet (emitted once per grid)
// Theme via tokens; RTL/LTR via logical properties;
// motion gated by prefers-reduced-motion.
// ==========================================
function getGamesCardsCSS() {
  return `
<style id="gc-styles">
  .gc-card {
    --gc-surface: rgba(255,255,255,0.045);
    --gc-surface-2: rgba(0,0,0,0.30);
    --gc-border: rgba(255,255,255,0.12);
    --gc-text: rgba(255,255,255,0.94);
    --gc-text-dim: rgba(255,255,255,0.60);
    --gc-radius: 20px;

    position: relative;
    overflow: hidden;
    border-radius: var(--gc-radius);
    padding: 26px;
    color: var(--gc-text);
    background:
      linear-gradient(160deg,
        color-mix(in srgb, var(--accent) 14%, transparent) 0%,
        var(--gc-surface-2) 55%,
        color-mix(in srgb, var(--accent) 8%, transparent) 100%);
    border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--gc-border));
    box-shadow: 0 18px 44px rgba(0,0,0,0.28);
    backdrop-filter: blur(8px);
  }

  /* OS preference drives the theme by default. */
  @media (prefers-color-scheme: light) {
    .gc-card {
      --gc-surface-2: rgba(255,255,255,0.72);
      --gc-border: rgba(0,0,0,0.10);
      --gc-text: rgba(22,24,33,0.94);
      --gc-text-dim: rgba(22,24,33,0.60);
      box-shadow: 0 18px 40px rgba(0,0,0,0.10);
    }
  }

  /* Explicit page toggle always wins (higher specificity). */
  :root[data-theme="dark"] .gc-card,
  .gc-card[data-theme="dark"] {
    --gc-surface-2: rgba(0,0,0,0.30);
    --gc-border: rgba(255,255,255,0.12);
    --gc-text: rgba(255,255,255,0.94);
    --gc-text-dim: rgba(255,255,255,0.60);
    box-shadow: 0 18px 44px rgba(0,0,0,0.28);
  }
  :root[data-theme="light"] .gc-card,
  .gc-card[data-theme="light"] {
    --gc-surface-2: rgba(255,255,255,0.72);
    --gc-border: rgba(0,0,0,0.10);
    --gc-text: rgba(22,24,33,0.94);
    --gc-text-dim: rgba(22,24,33,0.60);
    box-shadow: 0 18px 40px rgba(0,0,0,0.10);
  }

  .gc-bar {
    position: absolute; inset-block-start: 0; inset-inline: 0;
    height: 3px;
    background: linear-gradient(90deg, transparent,
      var(--accent), color-mix(in srgb, var(--accent) 40%, #fff),
      var(--accent), transparent);
    background-size: 200% 100%;
  }

  .gc-glow {
    position: absolute; inset-block-start: -48px; inset-inline-start: -48px;
    width: 220px; height: 220px; pointer-events: none;
    background: radial-gradient(circle,
      color-mix(in srgb, var(--accent) 18%, transparent) 0%, transparent 70%);
  }

  .gc-head {
    display: flex; align-items: center; gap: 16px;
    margin-block-start: 8px;
  }

  .gc-logo {
    position: relative;
    width: 86px; height: 86px;
    border-radius: 22px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 2.1em; line-height: 1;
    background: linear-gradient(135deg, #fff, #f3f5fa);
    color: #1a1c24;
    border: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
    overflow: hidden;
  }
  .gc-logo-img {
    position: absolute; inset: 0;
    width: 100%; height: 100%; object-fit: cover; display: block;
  }

  .gc-meta { flex: 1; min-width: 0; }
  .gc-title {
    margin: 0 0 6px;
    font-size: 1.3em; font-weight: 700; letter-spacing: 0.3px;
    color: color-mix(in srgb, var(--accent) 32%, var(--gc-text));
    text-shadow: 0 2px 12px color-mix(in srgb, var(--accent) 35%, transparent);
  }
  .gc-desc {
    font-size: 0.9em; line-height: 1.55;
    color: var(--gc-text-dim);
  }

  .gc-badges {
    display: flex; flex-wrap: wrap; gap: 8px;
    margin-block-start: 12px;
  }
  .gc-status {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 4px 13px; border-radius: 20px;
    font-size: 0.78em; font-weight: 700;
    color: #6ddc7a;
    background: rgba(76,175,80,0.16);
    border: 1px solid rgba(76,175,80,0.42);
  }
  .gc-status--warn {
    color: #ffc061;
    background: rgba(255,152,0,0.16);
    border-color: rgba(255,152,0,0.45);
  }
  .gc-status--soon {
    color: #8fb8ff;
    background: rgba(47,109,246,0.16);
    border-color: rgba(47,109,246,0.42);
  }
  .gc-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: #4caf50; box-shadow: 0 0 0 0 rgba(76,175,80,0.6);
  }
  .gc-status--warn .gc-dot { background: #ff9800; }
  .gc-status--soon .gc-dot { background: #2f6df6; }

  .gc-tag {
    padding: 4px 13px; border-radius: 20px;
    font-size: 0.78em; font-weight: 700;
    color: color-mix(in srgb, var(--accent) 50%, #fff);
    background: color-mix(in srgb, var(--accent) 20%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  }

  /* ---------- capability chips ---------- */
  .gc-caps {
    display: flex; flex-wrap: wrap; gap: 7px;
    margin-block-start: 16px;
  }
  .gc-cap {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 5px 11px; border-radius: 10px;
    font-size: 0.75em; font-weight: 600;
    color: var(--gc-text-dim);
    background: var(--gc-surface);
    border: 1px solid var(--gc-border);
  }
  .gc-cap svg { width: 13px; height: 13px; }
  .gc-cap--lead {
    color: color-mix(in srgb, var(--accent) 55%, var(--gc-text));
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    border-color: color-mix(in srgb, var(--accent) 30%, transparent);
  }

  .gc-offline-note {
    display: flex; align-items: flex-start; gap: 10px;
    margin-block-start: 14px; padding: 11px 14px;
    border-radius: 13px;
    font-size: 0.8em; line-height: 1.6;
    color: var(--gc-text-dim);
    background: var(--gc-surface);
    border: 1px solid var(--gc-border);
    border-inline-start: 3px solid color-mix(in srgb, var(--accent) 55%, transparent);
  }
  .gc-offline-note svg { width: 16px; height: 16px; flex-shrink: 0; margin-block-start: 2px; }

  .gc-divider {
    height: 1px; margin: 18px 0 16px;
    background: linear-gradient(90deg, transparent,
      color-mix(in srgb, var(--accent) 35%, transparent), transparent);
  }

  /* ---------- primary actions ---------- */
  .gc-actions {
    display: grid; gap: 10px;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }
  .gc-act {
    display: flex; align-items: center; gap: 11px;
    inline-size: 100%; box-sizing: border-box;
    padding: 14px 16px; border-radius: 15px;
    text-decoration: none; cursor: pointer;
    font: inherit; text-align: start;
    color: var(--gc-text);
    background: var(--gc-surface);
    border: 1px solid var(--gc-border);
    transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
  }
  .gc-act:hover {
    transform: translateY(-2px);
    border-color: color-mix(in srgb, var(--accent) 50%, var(--gc-border));
  }
  .gc-act:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .gc-act-ic {
    width: 38px; height: 38px; border-radius: 12px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    color: color-mix(in srgb, var(--accent) 60%, var(--gc-text));
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 26%, transparent);
  }
  .gc-act-ic svg { width: 18px; height: 18px; }
  .gc-act-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .gc-act-text b { font-size: 0.88em; font-weight: 700; }
  .gc-act-text small { font-size: 0.74em; opacity: 0.62; }

  .gc-act--primary {
    color: #fff;
    background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 48%, #fff));
    border-color: transparent;
    box-shadow: 0 6px 20px color-mix(in srgb, var(--accent) 32%, transparent);
  }
  .gc-act--primary .gc-act-ic {
    color: #fff;
    background: rgba(255,255,255,0.18);
    border-color: rgba(255,255,255,0.24);
  }
  .gc-act--primary .gc-act-text small { opacity: 0.8; }

  .gc-act--off {
    opacity: 0.5; cursor: not-allowed; pointer-events: none;
  }

  /* ---------- store button (download) ---------- */
  .gc-myket {
    display: flex; align-items: center; gap: 12px;
    inline-size: 100%; box-sizing: border-box;
    margin-block-start: 12px; padding: 13px 18px;
    border-radius: 16px; text-decoration: none; color: #fff;
    font-weight: 700; font-size: 0.95em; letter-spacing: 0.3px;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
    border: 1px solid rgba(99,160,255,0.3);
    box-shadow: 0 4px 20px rgba(15,52,96,0.45), inset 0 1px 0 rgba(255,255,255,0.06);
    transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease;
  }
  .gc-myket:hover  { transform: translateY(-3px); filter: brightness(1.1); }
  .gc-myket:active { transform: scale(0.98); }
  .gc-myket:focus-visible { outline: 2px solid #90caf9; outline-offset: 2px; }
  .gc-myket-logo {
    width: 36px; height: 36px; flex-shrink: 0;
    border-radius: 10px; overflow: hidden; background: #fff;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.15);
  }
  .gc-myket-logo img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .gc-myket-text { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; }
  .gc-myket-text small { font-size: 0.72em; opacity: 0.65; font-weight: 500; }
  .gc-myket-text strong { font-size: 1.05em; font-weight: 800; }
  .gc-myket-dl {
    margin-inline-start: auto;
    width: 32px; height: 32px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15);
  }
  .gc-myket--off {
    filter: grayscale(0.8); opacity: 0.55;
    cursor: not-allowed; pointer-events: none;
  }

  /* ---------- secondary links ---------- */
  .gc-links {
    display: flex; flex-wrap: wrap; gap: 8px;
    margin-block-start: 14px;
  }
  .gc-link {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 13px; border-radius: 11px;
    font-size: 0.78em; font-weight: 600; text-decoration: none;
    color: var(--gc-text-dim);
    background: var(--gc-surface);
    border: 1px solid var(--gc-border);
    transition: color 0.16s ease, border-color 0.16s ease;
  }
  .gc-link:hover { color: var(--gc-text); border-color: color-mix(in srgb, var(--accent) 45%, var(--gc-border)); }
  .gc-link svg { width: 14px; height: 14px; }

  /* ---------- diagnostics (collapsed) ---------- */
  .gc-diag { margin-block-start: 16px; }
  .gc-diag > summary {
    display: flex; align-items: center; gap: 8px;
    padding: 9px 13px; border-radius: 11px; cursor: pointer;
    font-size: 0.78em; font-weight: 700; list-style: none;
    color: var(--gc-text-dim);
    background: var(--gc-surface);
    border: 1px solid var(--gc-border);
  }
  .gc-diag > summary::-webkit-details-marker { display: none; }
  .gc-diag > summary svg { width: 14px; height: 14px; transition: transform 0.2s ease; }
  .gc-diag[open] > summary svg { transform: rotate(90deg); }
  [dir="rtl"] .gc-diag > summary svg { transform: rotate(180deg); }
  [dir="rtl"] .gc-diag[open] > summary svg { transform: rotate(90deg); }
  .gc-diag > summary:hover { color: var(--gc-text); }

  .gc-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px;
    margin-block-start: 10px;
  }
  .gc-btn {
    display: flex; align-items: center; justify-content: center; gap: 7px;
    inline-size: 100%; box-sizing: border-box;
    padding: 10px 8px; border-radius: 11px;
    font-size: 0.79em; font-weight: 600; letter-spacing: 0.2px;
    color: #fff; text-decoration: none; cursor: pointer;
    border: 1px solid transparent;
    transition: transform 0.15s ease, filter 0.15s ease;
    white-space: nowrap;
  }
  .gc-btn:hover  { transform: translateY(-2px); filter: brightness(1.1); }
  .gc-btn:active { transform: scale(0.97); }
  .gc-btn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
  .gc-ic { width: 16px; height: 16px; flex-shrink: 0; }

  .gc-btn--health  { background: linear-gradient(135deg, #00b09b, #096f5f); }
  .gc-btn--ping    { background: linear-gradient(135deg, #6c63ff, #3b35c7); }
  .gc-btn--metrics { background: linear-gradient(135deg, #f7971e, #c4720a); }

  .result-box {
    margin-block-start: 12px;
    font-family: 'Courier New', monospace; font-size: 0.82em;
    line-height: 1.6; direction: ltr; text-align: left;
    word-break: break-all;
  }

  @media (max-width: 480px) {
    .gc-grid { grid-template-columns: repeat(2, 1fr); }
    .gc-card { padding: 22px; }
    .gc-actions { grid-template-columns: 1fr; }
  }

  @media (prefers-reduced-motion: no-preference) {
    .gc-card { animation: gcRise 0.55s cubic-bezier(0.16,1,0.3,1) both; animation-delay: calc(var(--i, 0) * 80ms); }
    .gc-bar  { animation: gcShimmer 2.4s linear infinite; }
    .gc-logo { animation: gcFloat 3.6s ease-in-out infinite, gcGlow 3s ease-in-out infinite; }
    .gc-dot  { animation: gcPulse 1.8s ease-in-out infinite; }
  }

  @keyframes gcRise   { from { opacity: 0; transform: translateY(26px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes gcShimmer{ from { background-position: 200% 0; } to { background-position: -200% 0; } }
  @keyframes gcFloat  { 0%,100% { transform: translateY(0) rotate(-1deg); } 50% { transform: translateY(-6px) rotate(1deg); } }
  @keyframes gcGlow {
    0%,100% { box-shadow: 0 0 16px 2px color-mix(in srgb, var(--accent) 35%, transparent); }
    50%     { box-shadow: 0 0 30px 6px color-mix(in srgb, var(--accent) 55%, transparent); }
  }
  @keyframes gcPulse  { 0%,100% { box-shadow: 0 0 0 0 rgba(76,175,80,0.6); } 50% { box-shadow: 0 0 0 5px rgba(76,175,80,0); } }
</style>`
}


// ==========================================
// Status badge
// One badge, whose wording says what is actually true.
//
// A game in maintenance is not "inactive": its sign-in works,
// its store works, its leaderboard works. Only the download is
// withheld, and the badge says exactly that rather than
// implying the whole game is down.
// ==========================================
function createStatusBadge(game, lang) {
  const status = statusOf(game)

  if (status === 'soon') {
    return `<span class="gc-status gc-status--soon"><span class="gc-dot"></span>${escapeHtml(t(lang, 'soon'))}</span>`
  }
  if (status === 'maintenance' || !downloadEnabled(game)) {
    return `<span class="gc-status gc-status--warn"><span class="gc-dot"></span>${escapeHtml(t(lang, 'maintenance'))}</span>`
  }
  return `<span class="gc-status"><span class="gc-dot"></span>${escapeHtml(t(lang, 'live'))}</span>`
}


// ==========================================
// Capability chips
// What the game does, in the visitor's terms.
//
// "Plays offline" leads when it is true, because it is the one
// fact on this card that changes whether somebody on a bad
// connection bothers - and it is the fact the old card had no
// way to express at all.
// ==========================================
function createCapabilities(game, lang) {
  const capability = caps(game)
  const chips = []

  if (capability.onlinePlay) {
    chips.push({ ic: 'ping', label: t(lang, 'capOnline'), lead: true })
  } else {
    chips.push({ ic: 'wifiOff', label: t(lang, 'capOffline'), lead: true })
  }

  if (capability.login) chips.push({ ic: 'key', label: t(lang, 'capLogin') })
  if (capability.cloudSave) chips.push({ ic: 'cloud', label: t(lang, 'capCloud') })
  if (capability.leaderboard) chips.push({ ic: 'leaderboard', label: t(lang, 'capBoard') })
  if (capability.store) chips.push({ ic: 'cart', label: t(lang, 'capStore') })

  if (!chips.length) return ''

  return `<div class="gc-caps">${chips.map(chip =>
    `<span class="gc-cap${chip.lead ? ' gc-cap--lead' : ''}">${icon(chip.ic)}<span>${escapeHtml(chip.label)}</span></span>`
  ).join('')}</div>`
}


// ==========================================
// Offline explainer
// Shown only for a game that plays offline AND still wants the
// network for something. Saying "plays offline" and then
// offering a sign-in button is a contradiction on the face of
// it; this is the sentence that resolves it.
// ==========================================
function createOfflineNote(game, lang) {
  const capability = caps(game)
  if (capability.onlinePlay) return ''
  if (!capability.login && !capability.cloudSave && !capability.store) return ''

  return `
    <div class="gc-offline-note">
      ${icon('wifiOff')}
      <span>${escapeHtml(t(lang, 'offlineNote'))}</span>
    </div>`
}


// ==========================================
// Primary actions
// The three things a visitor actually came for.
//
// Rendered as one grid so they size together, and only the ones
// the game has. The store button is the primary one when it
// exists, because it is the only one of the three that is not
// available anywhere else.
// ==========================================
function createPrimaryActions(game, lang) {
  const sid = safeId(game.id)
  const capability = caps(game)
  const actions = []

  if (capability.store) {
    actions.push({
      href: `/${sid}/store`,
      ic: 'cart',
      label: t(lang, 'store'),
      hint: t(lang, 'storeHint'),
      primary: true
    })
  }

  if (capability.login) {
    actions.push({
      href: `/${sid}/account`,
      ic: 'user',
      label: t(lang, 'account'),
      hint: t(lang, 'accountHint')
    })
  }

  if (!actions.length) return ''

  return `<div class="gc-actions">${actions.map(action => `
    <a class="gc-act${action.primary ? ' gc-act--primary' : ''}" href="${escapeHtml(action.href)}">
      <span class="gc-act-ic">${icon(action.ic)}</span>
      <span class="gc-act-text">
        <b>${escapeHtml(action.label)}</b>
        <small>${escapeHtml(action.hint)}</small>
      </span>
    </a>`).join('')}</div>`
}


// ==========================================
// Download button
//
// Always points at /{game}/download rather than at the store
// directly, so the offline switch is enforced in one place. A
// link straight to Myket would keep working after the download
// was withdrawn, which is the whole thing the switch exists to
// prevent.
//
// Withdrawn renders greyed and labelled, never absent: a button
// that disappears reads as a bug, and one that is visibly
// switched off reads as a decision somebody made.
// ==========================================
function createDownloadButton(game, lang) {
  const sid = safeId(game.id)
  const links = downloadLinks(game)
  if (!Object.keys(links).length) return ''

  const enabled = downloadEnabled(game)
  const primary = (game.download && game.download.primary) || Object.keys(links)[0]
  const isMyket = primary === 'myket'

  return `
    <a class="gc-myket${enabled ? '' : ' gc-myket--off'}"
       href="${enabled ? `/${sid}/download` : '#'}"
       ${enabled ? '' : 'aria-disabled="true" tabindex="-1"'}>
      <span class="gc-myket-logo">${isMyket
        ? `<img src="${escapeHtml(MYKET_LOGO_URL)}" alt="Myket">`
        : `<span style="display:flex;align-items:center;justify-content:center;height:100%;color:#1a1a2e">${icon('download')}</span>`}</span>
      <span class="gc-myket-text">
        <small>${escapeHtml(enabled ? t(lang, 'downloadFrom') : t(lang, 'downloadOff'))}</small>
        <strong>${escapeHtml(isMyket ? t(lang, 'myket') : primary || t(lang, 'download'))}</strong>
      </span>
      <span class="gc-myket-dl">${icon('download')}</span>
    </a>`
}


// ==========================================
// Secondary links
// The pages that have to exist and that nobody opens twice.
// ==========================================
function createSecondaryLinks(game, lang) {
  const sid = safeId(game.id)
  const capability = caps(game)

  const links = [
    capability.leaderboard ? { href: `/${sid}/leaderboard`, ic: 'leaderboard', label: t(lang, 'leaderboard') } : null,
    { href: `/${sid}/privacy`, ic: 'privacy', label: t(lang, 'privacy') },
    { href: `/${sid}/terms`, ic: 'terms', label: t(lang, 'terms') }
  ].filter(Boolean)

  return `<div class="gc-links">${links.map(link =>
    `<a class="gc-link" href="${escapeHtml(link.href)}">${icon(link.ic)}<span>${escapeHtml(link.label)}</span></a>`
  ).join('')}</div>`
}


// ==========================================
// Diagnostics
// The old six-button grid, folded away.
//
// Collapsed rather than removed, because it is genuinely useful
// and its audience is one person. A <details> element does the
// whole job with no JavaScript, keeps the buttons focusable and
// findable, and costs one line of markup.
//
// Ping and metrics are only offered when the game has online
// services at all. For an offline game they are a test of this
// Worker rather than of the game, and the dashboard's own
// metrics link already covers that.
// ==========================================
function createDiagnostics(game, baseUrl, lang) {
  const sid = safeId(game.id)
  const capability = caps(game)

  const buttons = [
    { cls: 'health', action: `testHealth('${sid}')`, ic: 'health', label: t(lang, 'health') }
  ]

  if (capability.onlinePlay || capability.cloudSave || capability.leaderboard) {
    buttons.push({ cls: 'ping', action: `testPing('${sid}')`, ic: 'ping', label: t(lang, 'ping') })
    buttons.push({ cls: 'metrics', action: `testMetrics('${sid}')`, ic: 'metrics', label: t(lang, 'metrics') })
  }

  const html = buttons.map(button =>
    `<button type="button" class="gc-btn gc-btn--${button.cls}" aria-label="${escapeHtml(button.label)}"` +
    ` onclick="${button.action}">${icon(button.ic)}<span>${escapeHtml(button.label)}</span></button>`
  ).join('')

  return `
    <details class="gc-diag">
      <summary>${icon('chevron')}<span>${escapeHtml(t(lang, 'diagnostics'))}</span></summary>
      <div class="gc-grid">${html}</div>
      <div class="result-box" id="result-${sid}" role="status" aria-live="polite"></div>
    </details>`
}


// ==========================================
// Optional data-driven tags (per game, i18n-aware)
// ==========================================
function createTags(game, lang) {
  const tags = game && Array.isArray(game.tags) ? game.tags : []
  return tags.map(tag => {
    const text = (tag && typeof tag === 'object') ? (tag[resolveLang(lang)] || tag[DEFAULT_LANG] || '') : tag
    return text ? `<span class="gc-tag">${escapeHtml(text)}</span>` : ''
  }).join('')
}


// ==========================================
// Default accent-driven card
// Themed entirely from game.color; works for any game.
// ==========================================
function createDefaultGameCard(id, game, baseUrl, lang, index) {
  const sid = safeId(id)
  const accent = safeColor(game.color, '#667eea')
  const fallback = escapeHtml(game.icon || '')
  const logoSrc = game.logo ? escapeHtml(game.logo) : ''
  const logoImg = logoSrc
    ? `<img class="gc-logo-img" src="${logoSrc}" alt="${escapeHtml(game.name)}" onerror="this.style.display='none'">`
    : ''

  return `
    <article class="gc-card" dir="${dirFor(lang)}" lang="${escapeHtml(resolveLang(lang))}" style="--accent: ${accent}; --i: ${Number(index) || 0};">
      <div class="gc-bar"></div>
      <div class="gc-glow"></div>

      <div class="gc-head">
        <div class="gc-logo">${fallback}${logoImg}</div>
        <div class="gc-meta">
          <h2 class="gc-title">${escapeHtml(game.name)}</h2>
          <div class="gc-desc">${escapeHtml(localizedDescription(game, lang))}</div>
          <div class="gc-badges">
            ${createStatusBadge(game, lang)}
            ${createTags(game, lang)}
          </div>
        </div>
      </div>

      ${createCapabilities(game, lang)}
      ${createOfflineNote(game, lang)}

      <div class="gc-divider"></div>

      ${createPrimaryActions(game, lang)}
      ${createDownloadButton(game, lang)}
      ${createSecondaryLinks(game, lang)}
      ${createDiagnostics(game, baseUrl, lang)}
    </article>`
}


// ==========================================
// Registry of bespoke renderers
// Register only when a game needs a fully custom layout.
// Signature: (id, game, baseUrl, lang, index) => string
// ==========================================
const CUSTOM_CARD_RENDERERS = {}


// ==========================================
// Build one card (bespoke or default)
// ==========================================
function createGameCard(id, game, baseUrl, lang, index) {
  const renderer = CUSTOM_CARD_RENDERERS[id]
  return renderer
    ? renderer(id, game, baseUrl, lang, index)
    : createDefaultGameCard(id, game, baseUrl, lang, index)
}


// ==========================================
// Full grid of game cards (public entry)
// options.lang: 'fa' | 'en' | 'ja' (default 'fa')
// ==========================================
export function createGamesCardsHTML(GAMES, baseUrl, options = {}) {
  const lang = resolveLang(options.lang)
  const cards = Object.entries(GAMES || {})
    .map(([id, game], i) => createGameCard(id, { ...game, id }, baseUrl, lang, i))
    .join('')

  return `${getGamesCardsCSS()}
    <div class="games-grid">
      ${cards}
    </div>`
}
