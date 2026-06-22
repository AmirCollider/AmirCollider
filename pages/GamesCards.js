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
//   - Test buttons call: testHealth(id) / testPing(id) / testMetrics(id)
//     (defined in pages/dashboard.js)
//   - Result target: <div class="result-box" id="result-<id>">
//     (styled and driven by pages/dashboard.js)
//   - Outer wrapper keeps class "games-grid" so the dashboard grid
//     layout governs positioning.
//
// Extending
//   - Add a game:        add one entry to getGamesConfig() in config.js.
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
    servicesTitle: 'تست سرویس‌ها',
    health: 'بررسی سلامت',
    ping: 'تست پینگ',
    metrics: 'متریک‌ها',
    privacy: 'حریم خصوصی',
    terms: 'شرایط استفاده',
    leaderboard: 'جدول امتیازات',
    active: 'فعال',
    downloadFrom: 'دانلود رایگان از',
    myket: 'مایکت'
  },
  en: {
    servicesTitle: 'Service tests',
    health: 'Health check',
    ping: 'Ping test',
    metrics: 'Metrics',
    privacy: 'Privacy',
    terms: 'Terms',
    leaderboard: 'Leaderboard',
    active: 'Active',
    downloadFrom: 'Free download on',
    myket: 'Myket'
  },
  ja: {
    servicesTitle: 'サービステスト',
    health: 'ヘルスチェック',
    ping: 'Pingテスト',
    metrics: 'メトリクス',
    privacy: 'プライバシー',
    terms: '利用規約',
    leaderboard: 'リーダーボード',
    active: '稼働中',
    downloadFrom: '無料ダウンロード',
    myket: 'Myket'
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
  download: '<path d="M12 4v10"/><path d="M8 11l4 4 4-4"/><path d="M5 19h14"/>'
}

function icon(name) {
  return `<svg class="gc-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`
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
  .gc-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: #4caf50; box-shadow: 0 0 0 0 rgba(76,175,80,0.6);
  }
  .gc-tag {
    padding: 4px 13px; border-radius: 20px;
    font-size: 0.78em; font-weight: 700;
    color: color-mix(in srgb, var(--accent) 50%, #fff);
    background: color-mix(in srgb, var(--accent) 20%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  }

  .gc-divider {
    height: 1px; margin: 18px 0 16px;
    background: linear-gradient(90deg, transparent,
      color-mix(in srgb, var(--accent) 35%, transparent), transparent);
  }

  .gc-svc-title {
    display: flex; align-items: center; gap: 8px;
    margin-block-end: 12px; padding-block-end: 10px;
    border-bottom: 1px solid var(--gc-border);
  }
  .gc-svc-title span {
    padding: 4px 10px; border-radius: 8px;
    font-size: 0.8em; font-weight: 700; letter-spacing: 0.3px;
    color: var(--gc-text);
    background: var(--gc-surface);
    border: 1px solid var(--gc-border);
  }

  .gc-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px;
  }

  .gc-btn {
    display: flex; align-items: center; justify-content: center; gap: 7px;
    inline-size: 100%; box-sizing: border-box;
    padding: 11px 8px; border-radius: 12px;
    font-size: 0.82em; font-weight: 600; letter-spacing: 0.2px;
    color: #fff; text-decoration: none; cursor: pointer;
    border: 1px solid transparent;
    transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
    white-space: nowrap;
  }
  .gc-btn:hover  { transform: translateY(-2px); filter: brightness(1.1); }
  .gc-btn:active { transform: scale(0.97); }
  .gc-btn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
  .gc-ic { width: 16px; height: 16px; flex-shrink: 0; }

  .gc-btn--health      { background: linear-gradient(135deg, #00b09b, #096f5f); box-shadow: 0 3px 12px rgba(0,176,155,0.32); }
  .gc-btn--ping        { background: linear-gradient(135deg, #6c63ff, #3b35c7); box-shadow: 0 3px 12px rgba(108,99,255,0.32); }
  .gc-btn--metrics     { background: linear-gradient(135deg, #f7971e, #c4720a); box-shadow: 0 3px 12px rgba(247,151,30,0.32); }
  .gc-btn--privacy     { background: linear-gradient(135deg, #43a047, #1b5e20); box-shadow: 0 3px 12px rgba(67,160,71,0.32); }
  .gc-btn--terms       { background: linear-gradient(135deg, #1e88e5, #0d47a1); box-shadow: 0 3px 12px rgba(30,136,229,0.32); }
  .gc-btn--leaderboard { background: linear-gradient(135deg, #f9a825, #e65100); box-shadow: 0 3px 12px rgba(249,168,37,0.36); }

  .gc-myket {
    display: flex; align-items: center; gap: 12px;
    inline-size: 100%; box-sizing: border-box;
    margin-block-start: 18px; padding: 13px 18px;
    border-radius: 16px; text-decoration: none; color: #fff;
    font-weight: 700; font-size: 0.95em; letter-spacing: 0.3px;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
    border: 1px solid rgba(99,160,255,0.3);
    box-shadow: 0 4px 20px rgba(15,52,96,0.45), inset 0 1px 0 rgba(255,255,255,0.06);
    transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease;
  }
  .gc-myket:hover  { transform: translateY(-3px); filter: brightness(1.1); box-shadow: 0 8px 30px rgba(15,52,96,0.6), inset 0 1px 0 rgba(255,255,255,0.1); }
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

  .result-box {
    margin-block-start: 14px;
    font-family: 'Courier New', monospace; font-size: 0.82em;
    line-height: 1.6; direction: ltr; text-align: left;
    word-break: break-all;
  }

  @media (max-width: 480px) {
    .gc-grid { grid-template-columns: repeat(2, 1fr); }
    .gc-card { padding: 22px; }
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
// Service test buttons (shared by all cards)
// ==========================================
function createServiceButtons(id, baseUrl, lang) {
  const sid = safeId(id)
  const base = escapeHtml(baseUrl)

  const buttons = [
    { cls: 'health',      kind: 'action', action: `testHealth('${sid}')`,  ic: 'health',      label: t(lang, 'health') },
    { cls: 'ping',        kind: 'action', action: `testPing('${sid}')`,    ic: 'ping',        label: t(lang, 'ping') },
    { cls: 'metrics',     kind: 'action', action: `testMetrics('${sid}')`, ic: 'metrics',     label: t(lang, 'metrics') },
    { cls: 'privacy',     kind: 'link',   href: `${base}/${sid}/privacy`,     ic: 'privacy',     label: t(lang, 'privacy') },
    { cls: 'terms',       kind: 'link',   href: `${base}/${sid}/terms`,       ic: 'terms',       label: t(lang, 'terms') },
    { cls: 'leaderboard', kind: 'link',   href: `${base}/${sid}/leaderboard`, ic: 'leaderboard', label: t(lang, 'leaderboard') }
  ]

  const html = buttons.map(b => {
    const inner = `${icon(b.ic)}<span>${escapeHtml(b.label)}</span>`
    if (b.kind === 'action') {
      return `<button type="button" class="gc-btn gc-btn--${b.cls}" aria-label="${escapeHtml(b.label)}" onclick="${b.action}">${inner}</button>`
    }
    return `<a class="gc-btn gc-btn--${b.cls}" href="${b.href}" aria-label="${escapeHtml(b.label)}">${inner}</a>`
  }).join('')

  return `
    <div style="margin-block-start: 6px;">
      <div class="gc-svc-title"><span>${escapeHtml(t(lang, 'servicesTitle'))}</span></div>
      <div class="gc-grid">${html}</div>
      <div class="result-box" id="result-${sid}" role="status" aria-live="polite"></div>
    </div>`
}

// ==========================================
// Myket store button (only when a URL exists)
// ==========================================
function createMyketButton(game, lang) {
  if (!game || !game.myketUrl) return ''
  return `
    <a class="gc-myket" href="${escapeHtml(game.myketUrl)}" target="_blank" rel="noopener noreferrer">
      <span class="gc-myket-logo"><img src="${escapeHtml(MYKET_LOGO_URL)}" alt="Myket"></span>
      <span class="gc-myket-text">
        <small>${escapeHtml(t(lang, 'downloadFrom'))}</small>
        <strong>${escapeHtml(t(lang, 'myket'))}</strong>
      </span>
      <span class="gc-myket-dl">${icon('download')}</span>
    </a>`
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
  const accent = escapeHtml(game.color || '#667eea')
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
            <span class="gc-status"><span class="gc-dot"></span>${escapeHtml(t(lang, 'active'))}</span>
            ${createTags(game, lang)}
          </div>
        </div>
      </div>

      <div class="gc-divider"></div>

      ${createServiceButtons(sid, baseUrl, lang)}
      ${createMyketButton(game, lang)}
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
    .map(([id, game], i) => createGameCard(id, game, baseUrl, lang, i))
    .join('')

  return `${getGamesCardsCSS()}
    <div class="games-grid">
      ${cards}
    </div>`
}
