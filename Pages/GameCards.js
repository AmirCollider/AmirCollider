// ==========================================
// Pages/GameCards.js
// Game Cards HTML Generator
// AmirCollider Games - Worker Proxy


// ==========================================
// Responsibilities
//   - Render the grid of game cards shown on the dashboard.
//   - Stay a pure, side-effect-free view layer: input is data,
//     output is an HTML string. No fetching, no logging, no state.
//
// Integration contract (do not break without updating callers)
//   - Public entry: createGamesCardsHTML(GAMES, baseUrl, options)
//   - Diagnostics call: testHealth(id) / testPing(id) / testMetrics(id)
//     (defined in Pages/Dashboard.js)
//   - Result target: <div class="result-box" id="result-<id>">
//     (styled and driven by Pages/Dashboard.js)
//   - Outer wrapper keeps class "games-grid" so the dashboard grid
//     layout governs positioning.
//
// Extending
//   - Add a game:        add one entry to GAME_REGISTRY in Config.js.
//   - Translate a game:  add game.i18n.description[lang] in Config.js.
//   - Add a UI language: add one entry to CARD_I18N below.
//   - Bespoke card:      register a renderer in CUSTOM_CARD_RENDERERS.
// ==========================================

import { escapeHtml, safeColor } from '../Core/Html.js'
import { dirFor, resolveLang } from '../Core/RequestContext.js'
import { localizedPath } from '../Core/Locale.js'

const DEFAULT_LANG = 'fa'


// ==========================================
// Where a game can be downloaded from
//
// `web` is the odd one out and deliberately included: a browser
// game is not downloaded at all, so its button says "play" and
// points at wherever the game runs.
// ==========================================
const STORES = {
  myket: { logo: '/assets/MyketLogo.png', label: 'myket' },
  googleplay: { logo: '/assets/GooglePlayStoreLogo.png', label: 'googleplay' },
  apk: { logo: '/assets/AndroidAPKLogo.png', label: 'apk' },
  web: { logo: '/assets/WebLogo.png', label: 'web', play: true }
}

function storeMeta(key) {
  return STORES[String(key || '').toLowerCase()] || null
}


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
    accountOpen: 'حساب من',
    accountHintIn: 'وارد شده‌ای',
    store: 'خرید درون‌برنامه‌ای',
    storeHint: 'پرداخت با ارز دیجیتال',
    download: 'دانلود',
    downloadOff: 'دانلود در دسترس نیست',
    downloadFrom: 'دانلود از',
    gamePage: 'صفحه‌ی بازی',
    versions: 'نسخه‌ها',
    myket: 'مایکت',
    googleplay: 'گوگل پلی',
    apk: 'دانلود مستقیم APK',
    web: 'بازی در مرورگر',
    playOn: 'اجرا در',

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
    accountOpen: 'My account',
    accountHintIn: 'signed in',
    store: 'In-app purchases',
    storeHint: 'pay with crypto',
    download: 'Download',
    downloadOff: 'Download unavailable',
    downloadFrom: 'Download on',
    gamePage: 'Game page',
    versions: 'Versions',
    myket: 'Myket',
    googleplay: 'Google Play',
    apk: 'Direct APK',
    web: 'Play in browser',
    playOn: 'Play on',

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
    accountOpen: 'アカウント',
    accountHintIn: 'サインイン済み',
    store: 'アプリ内購入',
    storeHint: '暗号資産で支払い',
    download: 'ダウンロード',
    downloadOff: 'ダウンロード停止中',
    downloadFrom: '入手先',
    gamePage: 'ゲームページ',
    versions: 'バージョン',
    myket: 'Myket',
    googleplay: 'Google Play',
    apk: 'APK 直接ダウンロード',
    web: 'ブラウザーで遊ぶ',
    playOn: 'プレイ',

    leaderboard: 'ランキング',
    privacy: 'プライバシー',
    terms: '利用規約',

    diagnostics: 'サービス確認',
    health: 'ヘルス',
    ping: 'Ping',
    metrics: 'メトリクス'
  }
}


function t(lang, key) {
  const pack = CARD_I18N[resolveLang(lang)]
  return pack[key] !== undefined ? pack[key] : CARD_I18N[DEFAULT_LANG][key]
}


function localizedDescription(game, lang) {
  const byLang = game && game.i18n && game.i18n.description
  if (byLang && byLang[resolveLang(lang)]) return byLang[resolveLang(lang)]
  return game && game.description ? game.description : ''
}


// Reduce an id to a safe slug for use in selectors, hrefs and JS calls.
function safeId(id) {
  return String(id == null ? '' : id).replace(/[^a-zA-Z0-9_-]/g, '')
}


/**
 * One of a game's addresses, in the language the card is rendering
 * in: at('neon-katana', '/store', 'en') -> '/en/neon-katana/store'.
 *
 * A card is the densest cluster of internal links on the site, and
 * before this every one of them pointed at the default language. A
 * reader on the English front page reached an English game card and
 * left it into Persian; a crawler reading that page found no
 * English pages to follow at all, which is most of what "Google
 * only knows the Persian site" was made of.
 */
function at(sid, suffix, lang) {
  return localizedPath('/' + sid + (suffix || ''), lang)
}


// ==========================================
// Reading a game
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
// Config.js - still show its download button.
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
  // Points the way reading goes: flipped under [dir="rtl"] by CSS.
  arrow: '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
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
  chevron: '<polyline points="9 6 15 12 9 18"/>',
  play: '<path d="M8 5.5v13l11-6.5z"/>',
  home: '<path d="M3 9.5 12 3l9 6.5"/><path d="M5 10v10h14V10"/>',
  versions: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>'
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

  /* ---------- motifs ----------
     A few of the game's own objects drifting behind the card.

     Behind is the whole design. The layer is absolutely
     positioned, aria-hidden and pointer-events:none, so it can
     never take a click meant for the download button and a
     screen reader never has to read four fruit out loud. It sits
     under everything: .gc-head and the sections after it are
     already in the normal flow above this absolute layer.

     Two animations at once because the brief is "floating and
     breathing" and those are different motions - one moves the
     glyph, the other changes its size. Different durations per
     motif, set inline from the index, so four of them never fall
     into step and start reading as a pattern.

     Position is inline and deterministic: no randomness, so the
     same card looks the same on every render, which matters
     because this HTML is also what a crawler and a link preview
     see. */
  .gc-motifs {
    position: absolute; inset: 0; overflow: hidden;
    pointer-events: none; z-index: 0;
  }
  .gc-motif {
    position: absolute;
    font-size: 1.9em; line-height: 1;
    opacity: 0.16;
    filter: saturate(1.15);
    will-change: transform;
  }
  /* The content has to win against the layer above.

     An absolutely positioned element paints over in-flow content
     that has no position of its own, so every content block gets
     one - and the three decorative layers are excluded by name
     rather than by listing the seven blocks that are not them.
     Excluded because they are already absolute: giving .gc-bar
     position:relative would drop the top rule into the flow and
     add 3px of height to every card. */
  .gc-card > *:not(.gc-motifs):not(.gc-bar):not(.gc-glow) {
    position: relative; z-index: 1;
  }

  @media (prefers-color-scheme: light) {
    .gc-motif { opacity: 0.20; }
  }
  :root[data-theme="light"] .gc-motif { opacity: 0.20; }
  :root[data-theme="dark"]  .gc-motif { opacity: 0.16; }

  @media (prefers-reduced-motion: no-preference) {
    .gc-motif {
      animation:
        gcDrift  var(--gc-drift, 7s)  ease-in-out infinite,
        gcBreath var(--gc-breath, 4s) ease-in-out infinite;
      animation-delay: var(--gc-delay, 0s), var(--gc-delay, 0s);
    }
  }
  @keyframes gcDrift {
    0%, 100% { transform: translate3d(0, 0, 0) rotate(-6deg); }
    50%      { transform: translate3d(0, -14px, 0) rotate(6deg); }
  }
  @keyframes gcBreath {
    0%, 100% { scale: 1; }
    50%      { scale: 1.16; }
  }

  /* Decoration is a battery cost paid by every card on screen at
     once, and on a narrow card there is less empty space for a
     motif to sit in without crowding the text. */
  @media (max-width: 480px) {
    .gc-motif { font-size: 1.5em; opacity: 0.12; }
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
  .gc-title a { color: inherit; text-decoration: none; }
  .gc-title a:hover { text-decoration: underline; text-underline-offset: 4px; }

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

  /* A chip that goes somewhere looks like it does: it gains the
     text colour of a link, an arrow, and it lifts on hover. The
     arrow is held back until hover on a pointer device so a row of
     five chips is not five arrows; on touch, where there is no
     hover, it is always shown. */
  .gc-cap--link {
    text-decoration: none;
    color: var(--gc-text);
    cursor: pointer;
    transition: transform 0.16s ease, border-color 0.16s ease,
                background 0.16s ease, color 0.16s ease;
  }
  .gc-cap--link:hover, .gc-cap--link:focus-visible {
    transform: translateY(-2px);
    color: color-mix(in srgb, var(--accent) 60%, var(--gc-text));
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    border-color: color-mix(in srgb, var(--accent) 38%, transparent);
  }
  .gc-cap--link:active { transform: translateY(0); }
  .gc-cap-go {
    width: 11px; height: 11px; opacity: 0;
    margin-inline-start: -4px;
    transition: opacity 0.16s ease, margin 0.16s ease;
  }
  [dir="rtl"] .gc-cap-go { transform: scaleX(-1); }
  .gc-cap--link:hover .gc-cap-go,
  .gc-cap--link:focus-visible .gc-cap-go { opacity: 0.75; margin-inline-start: 0; }
  @media (hover: none) {
    .gc-cap-go { opacity: 0.55; margin-inline-start: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .gc-cap--link, .gc-cap-go { transition: none; }
    .gc-cap--link:hover { transform: none; }
  }

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

  /* ---------- store buttons (download / play) ----------
     One button per place the game can be got from. A game with a
     single link renders exactly as it used to; two or more sit in
     a responsive grid so three stores do not become three
     full-width bars pushing the card to twice its height. */
  .gc-stores { display: grid; gap: 10px; margin-block-start: 12px; }
  .gc-stores--many { grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }

  .gc-store {
    display: flex; align-items: center; gap: 12px;
    inline-size: 100%; box-sizing: border-box;
    padding: 13px 18px;
    border-radius: 16px; text-decoration: none; color: #fff;
    font-weight: 700; font-size: 0.95em; letter-spacing: 0.3px;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
    border: 1px solid rgba(99,160,255,0.3);
    box-shadow: 0 4px 20px rgba(15,52,96,0.45), inset 0 1px 0 rgba(255,255,255,0.06);
    transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease;
  }
  /* The primary keeps the accent edge, so "where we would rather
     you got it" survives the others being equally present. */
  .gc-store--primary { border-color: color-mix(in srgb, var(--accent) 55%, transparent); }
  .gc-store:hover  { transform: translateY(-3px); filter: brightness(1.1); }
  .gc-store:active { transform: scale(0.98); }
  .gc-store:focus-visible { outline: 2px solid #90caf9; outline-offset: 2px; }

  .gc-store-logo {
    position: relative;
    width: 36px; height: 36px; flex-shrink: 0;
    border-radius: 10px; overflow: hidden; background: #fff;
    display: flex; align-items: center; justify-content: center; color: #1a1a2e;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.15);
  }
  /* Absolute, so the glyph underneath is the fallback when the
     logo 404s rather than a second flex item beside it. */
  .gc-store-logo img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
  .gc-store-glyph { display: flex; align-items: center; justify-content: center; }
  .gc-store-glyph svg { width: 18px; height: 18px; }

  .gc-store-text { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; min-width: 0; }
  .gc-store-text small { font-size: 0.72em; opacity: 0.65; font-weight: 500; }
  .gc-store-text strong { font-size: 1.05em; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .gc-store-go {
    margin-inline-start: auto;
    width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15);
  }
  .gc-store--off {
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

  /* ---- mobile ----
     The card now carries more than it used to: up to four store
     buttons and five secondary links. Left alone at 360px that
     is a store button per row at half width with a wrapped
     label, which is the thing that looked worst on a phone. */
  @media (max-width: 640px) {
    .gc-card { padding: 22px 18px; }
    .gc-head { gap: 12px; }
    .gc-logo { width: 64px; height: 64px; border-radius: 18px; font-size: 1.6em; }
    .gc-title { font-size: 1.12em; }
    /* One store per row, full width, so the label never wraps. */
    .gc-stores--many { grid-template-columns: 1fr; }
    .gc-store { padding: 12px 15px; }
    .gc-links { gap: 6px; }
    .gc-link { flex: 1 1 calc(50% - 3px); justify-content: center; }
  }

  @media (max-width: 480px) {
    .gc-grid { grid-template-columns: repeat(2, 1fr); }
    .gc-card { padding: 18px 15px; }
    .gc-actions { grid-template-columns: 1fr; }
    .gc-caps { gap: 5px; }
    .gc-cap { font-size: 0.74em; padding: 5px 9px; }
    .gc-link { flex: 1 1 100%; }
  }

  /* Animation on a phone is a battery cost paid by every card on
     screen at once, and the float/glow pair is decorative. */
  @media (max-width: 640px) and (prefers-reduced-motion: no-preference) {
    .gc-logo { animation: none; }
    .gc-bar  { animation: none; }
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
// Motifs
// A few of the game's own objects, drifting behind the card.
//
// The list comes from Config.js (`card.motifs`), because it is a
// fact about the game and not a decision about the view - which
// is what lets a second game have its own without anybody
// touching this file. A game that declares none renders nothing:
// no default set, because a card decorated with somebody else's
// objects is worse than a plain one.
//
// SLOTS is deliberately a fixed table rather than anything
// random. The same card has to produce the same bytes on every
// render - this HTML is what a crawler reads and what a link
// preview screenshots - and the corners are chosen so the glyphs
// sit in the card's empty margins rather than behind the title
// or the buttons, whichever side the layout is written in.
// ==========================================
// All six stay in the top half and away from the reading edge.
//
// That is not decoration-for-its-own-sake: the lower half of a
// card is the download button and the secondary links, both of
// which are painted with their own solid backgrounds, so a motif
// placed there is simply invisible - a slot spent on nothing.
// The head block sits at the reading edge, which leaves the
// opposite corner as the one genuinely empty region on every
// card whatever its height.
const MOTIF_SLOTS = [
  { top: '8%', inlineEnd: '6%', drift: '7.5s', breath: '4.2s', delay: '0s' },
  { top: '30%', inlineEnd: '16%', drift: '9s', breath: '5.1s', delay: '-1.6s' },
  { top: '15%', inlineEnd: '30%', drift: '6.5s', breath: '3.7s', delay: '-3.1s' },
  { top: '45%', inlineEnd: '8%', drift: '8.2s', breath: '4.8s', delay: '-2.3s' },
  { top: '38%', inlineEnd: '36%', drift: '7s', breath: '5.6s', delay: '-4.4s' },
  { top: '22%', inlineEnd: '46%', drift: '9.6s', breath: '4.4s', delay: '-0.9s' }
]

function createMotifs(game) {
  const motifs = ((game && game.card && game.card.motifs) || [])
    .map(motif => String(motif || '').trim())
    .filter(Boolean)
    .slice(0, MOTIF_SLOTS.length)

  if (!motifs.length) return ''

  const glyphs = motifs.map((motif, index) => {
    const slot = MOTIF_SLOTS[index]
    // inset-inline-end rather than right, so the motifs sit in the
    // same visual place relative to the reading direction on the
    // Persian dashboard as on the English one.
    const style = `top:${slot.top};inset-inline-end:${slot.inlineEnd};`
      + `--gc-drift:${slot.drift};--gc-breath:${slot.breath};--gc-delay:${slot.delay}`

    return `<span class="gc-motif" style="${style}">${escapeHtml(motif)}</span>`
  }).join('')

  return `<div class="gc-motifs" aria-hidden="true">${glyphs}</div>`
}


// ==========================================
// Status badge
// One badge, whose wording says what is actually true.
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
// ==========================================
function createCapabilities(game, lang) {
  const capability = caps(game)
  const sid = safeId(game.id)
  const chips = []

  // Every capability that names a real page links to it. These read
  // as buttons, so they were being clicked; a chip saying
  // "Leaderboard" that does nothing when pressed is a broken button,
  // not a label. The two that describe how the game behaves rather
  // than where to go - online and offline play - stay as text,
  // because there is nowhere honest to send anyone.
  if (capability.onlinePlay) {
    chips.push({ ic: 'ping', label: t(lang, 'capOnline'), lead: true })
  } else {
    chips.push({ ic: 'wifiOff', label: t(lang, 'capOffline'), lead: true, title: offlineHint(game, lang) })
  }

  if (capability.login) chips.push({ ic: 'key', label: t(lang, 'capLogin'), href: at(sid, '/account', lang) })
  if (capability.cloudSave) chips.push({ ic: 'cloud', label: t(lang, 'capCloud'), href: at(sid, '/account', lang) })
  if (capability.leaderboard) chips.push({ ic: 'leaderboard', label: t(lang, 'capBoard'), href: at(sid, '/leaderboard', lang) })
  if (capability.store) chips.push({ ic: 'cart', label: t(lang, 'capStore'), href: at(sid, '/store', lang) })

  if (!chips.length) return ''

  return `<div class="gc-caps">${chips.map(chip => {
    const classes = 'gc-cap' + (chip.lead ? ' gc-cap--lead' : '') + (chip.href ? ' gc-cap--link' : '')
    const title = chip.title ? ` title="${escapeHtml(chip.title)}"` : ''
    const body = `${icon(chip.ic)}<span>${escapeHtml(chip.label)}</span>`

    return chip.href
      ? `<a class="${classes}" href="${escapeHtml(chip.href)}"${title}>${body}${icon('arrow', 'gc-cap-go')}</a>`
      : `<span class="${classes}"${title}>${body}</span>`
  }).join('')}</div>`
}


// ==========================================
// Offline explainer
//
// The nuance is kept where it costs nothing: as the title on the
// offline chip itself, for anybody who wonders why an offline
// game has a sign-in button.
// ==========================================
function offlineHint(game, lang) {
  const capability = caps(game)
  if (capability.onlinePlay) return ''
  if (!capability.login && !capability.cloudSave && !capability.store) return ''
  return t(lang, 'offlineNote')
}


// ==========================================
// Primary actions
// The three things a visitor actually came for.
// ==========================================
function createPrimaryActions(game, lang, player) {
  const sid = safeId(game.id)
  const capability = caps(game)
  const actions = []

  if (capability.store) {
    actions.push({
      href: at(sid, '/store', lang),
      ic: 'cart',
      label: t(lang, 'store'),
      hint: t(lang, 'storeHint'),
      primary: true
    })
  }

  if (capability.login) {
    // "Sign in" to somebody already signed in reads as the
    // sign-in having failed. The label and the hint both change,
    // because "with Google" under "My account" is an instruction
    // for something already done.
    const signedIn = Boolean(player && player.playerId)
    actions.push({
      href: at(sid, '/account', lang),
      ic: 'user',
      label: signedIn ? t(lang, 'accountOpen') : t(lang, 'account'),
      hint: signedIn
        ? (player.name || player.email || t(lang, 'accountHintIn'))
        : t(lang, 'accountHint')
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
// Withdrawn renders greyed and labelled, never absent: a button
// that disappears reads as a bug, and one that is visibly
// switched off reads as a decision somebody made.
// ==========================================
function createDownloadButton(game, lang) {
  const sid = safeId(game.id)
  const links = downloadLinks(game)
  const keys = Object.keys(links)
  if (!keys.length) return ''

  const enabled = downloadEnabled(game)

  // The primary first, then the rest in the order the registry
  // listed them. A game with one link looks exactly as it did;
  // a game with three now shows three, rather than picking one
  // and hiding the others behind nothing at all.
  const primary = (game.download && game.download.primary) || keys[0]
  const ordered = keys.includes(primary) ? [primary, ...keys.filter(k => k !== primary)] : keys

  const buttons = ordered.map((key, index) => {
    const meta = storeMeta(key)
    const label = meta ? t(lang, meta.label) : key
    // A browser game is not downloaded, so the verb changes. The
    // withheld state still reads "unavailable" either way.
    const lead = !enabled
      ? t(lang, 'downloadOff')
      : (meta && meta.play ? t(lang, 'playOn') : t(lang, 'downloadFrom'))

    return `
    <a class="gc-store${index === 0 ? ' gc-store--primary' : ''}${enabled ? '' : ' gc-store--off'}"
       href="${enabled ? at(sid, '/download', lang) + `?store=${encodeURIComponent(key)}` : '#'}"
       ${enabled ? '' : 'aria-disabled="true" tabindex="-1"'}>
      <span class="gc-store-logo">${meta
        ? `<img src="${escapeHtml(meta.logo)}" alt="${escapeHtml(label)}" loading="lazy"
             onerror="this.style.display='none'">`
        : ''}<span class="gc-store-glyph">${icon('download')}</span></span>
      <span class="gc-store-text">
        <small>${escapeHtml(lead)}</small>
        <strong>${escapeHtml(label)}</strong>
      </span>
      <span class="gc-store-go">${icon(meta && meta.play ? 'play' : 'download')}</span>
    </a>`
  }).join('')

  return `<div class="gc-stores${ordered.length > 1 ? ' gc-stores--many' : ''}">${buttons}</div>`
}


// ==========================================
// Secondary links
// The pages that have to exist and that nobody opens twice.
// ==========================================
function createSecondaryLinks(game, lang) {
  const sid = safeId(game.id)
  const capability = caps(game)

  const links = [
    // The game's own landing page and its version history. First,
    // because between them they are what somebody deciding
    // whether to install came to read - and until they existed
    // the card's only outward links were a policy page and a
    // leaderboard.
    { href: at(sid, '', lang), ic: 'home', label: t(lang, 'gamePage') },
    { href: at(sid, '/versions', lang), ic: 'versions', label: t(lang, 'versions') },
    capability.leaderboard ? { href: at(sid, '/leaderboard', lang), ic: 'leaderboard', label: t(lang, 'leaderboard') } : null,
    { href: at(sid, '/privacy', lang), ic: 'privacy', label: t(lang, 'privacy') },
    { href: at(sid, '/terms', lang), ic: 'terms', label: t(lang, 'terms') }
  ].filter(Boolean)

  return `<div class="gc-links">${links.map(link =>
    `<a class="gc-link" href="${escapeHtml(link.href)}">${icon(link.ic)}<span>${escapeHtml(link.label)}</span></a>`
  ).join('')}</div>`
}


// ==========================================
// Diagnostics
// The old six-button grid, folded away.
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
function createDefaultGameCard(id, game, baseUrl, lang, index, player) {
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
      ${createMotifs(game)}

      <div class="gc-head">
        <div class="gc-logo">${fallback}${logoImg}</div>
        <div class="gc-meta">
          <h2 class="gc-title"><a href="${at(sid, '', lang)}">${escapeHtml(game.name)}</a></h2>
          <div class="gc-desc">${escapeHtml(localizedDescription(game, lang))}</div>
          <div class="gc-badges">
            ${createStatusBadge(game, lang)}
            ${createTags(game, lang)}
          </div>
        </div>
      </div>

      ${createCapabilities(game, lang)}

      <div class="gc-divider"></div>

      ${createPrimaryActions(game, lang, player)}
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
function createGameCard(id, game, baseUrl, lang, index, player) {
  const renderer = CUSTOM_CARD_RENDERERS[id]
  return renderer
    ? renderer(id, game, baseUrl, lang, index, player)
    : createDefaultGameCard(id, game, baseUrl, lang, index, player)
}


// ==========================================
// Full grid of game cards (public entry)
// options.lang: 'fa' | 'en' | 'ja' (default 'fa')
// ==========================================
export function createGamesCardsHTML(GAMES, baseUrl, options = {}) {
  const lang = resolveLang(options.lang)
  const player = options.player || null
  const cards = Object.entries(GAMES || {})
    .map(([id, game], i) => createGameCard(id, { ...game, id }, baseUrl, lang, i, player))
    .join('')

  return `${getGamesCardsCSS()}
    <div class="games-grid">
      ${cards}
    </div>`
}
