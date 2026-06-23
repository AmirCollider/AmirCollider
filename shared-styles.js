// ==========================================
// OAuth Proxy v6.7.3 - Secure Version
// AmirCollider Games - Shared Styles & HTML Helpers
// ==========================================
//
// Single styling foundation for every server-rendered page.
//
// Public exports (do not break without updating callers):
//   getSharedCSS(gameColor, accentColor) -> string  (utils.js, worker.js)
//   getLogosHTML(amirLogo, gameLogo, gameName) -> string  (worker.js)
//   getPageHead({ title, amirLogo, description }) -> string  (pages/*, utils.js)
//
// Design language (kept consistent with the token system the pages use):
//   Theme:      <html data-theme="light|dark">; absent attribute = follow OS.
//   Direction:  set <html dir="rtl|ltr"> per language; styles use logical
//               properties only, so fa (RTL) and en/ja (LTR) both stay correct.
//   Tokens:     --brand / --accent / --surface / --text / --border / --radius ...
//   Motion:     subtle and once-off; fully disabled under reduced-motion.
//
// Callers are responsible for passing already-safe (escaped) title/description.
// ==========================================


// ==========================================
// Color Helpers
// Parse caller-supplied hex colors into the values the token layer needs.
// Returns safe fallbacks instead of throwing on malformed input.
// ==========================================
function parseHex(hex) {
  let h = String(hex == null ? '' : hex).trim().replace(/^#/, '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16)
  }
}

function rgbTriplet(hex, fallback) {
  const c = parseHex(hex)
  return c ? `${c.r}, ${c.g}, ${c.b}` : fallback
}

function lighten(hex, amount, fallback) {
  const c = parseHex(hex)
  if (!c) return fallback
  const mix = v => Math.max(0, Math.min(255, Math.round(v + (255 - v) * amount)))
  const hx = v => mix(v).toString(16).padStart(2, '0')
  return `#${hx(c.r)}${hx(c.g)}${hx(c.b)}`
}


// ==========================================
// Tokens
// Light / dark / auto palette. The default (no data-theme) is dark; the OS
// preference is honoured only while the user has made no explicit choice.
// ==========================================
function cssTokens(brand, brand2, accent, brandRgb, accentRgb) {
  return `
    :root {
      --brand: ${brand};
      --brand-2: ${brand2};
      --brand-rgb: ${brandRgb};
      --accent: ${accent};
      --accent-rgb: ${accentRgb};

      --ok: #4caf50;   --ok-rgb: 76, 175, 80;
      --warn: #ff9800; --warn-rgb: 255, 152, 0;
      --err: #f44336;  --err-rgb: 244, 67, 54;
      --info: #2196f3; --info-rgb: 33, 150, 243;

      --radius: 18px;
      --maxw: 900px;
      --shadow: 0 24px 60px rgba(0, 0, 0, 0.35);

      --bg-1: #0b0e16;
      --bg-2: #141a2e;
      --surface: rgba(255, 255, 255, 0.05);
      --surface-2: rgba(255, 255, 255, 0.09);
      --border: rgba(255, 255, 255, 0.12);
      --text: rgba(255, 255, 255, 0.92);
      --text-dim: rgba(255, 255, 255, 0.62);
      --muted: rgba(255, 255, 255, 0.42);
      color-scheme: dark;
    }

    @media (prefers-color-scheme: light) {
      :root:not([data-theme]) {
        --bg-1: #f4f6fb;
        --bg-2: #e7ecf7;
        --surface: rgba(255, 255, 255, 0.72);
        --surface-2: #ffffff;
        --border: rgba(20, 22, 33, 0.12);
        --text: rgba(22, 24, 33, 0.92);
        --text-dim: rgba(22, 24, 33, 0.60);
        --muted: rgba(22, 24, 33, 0.45);
        --shadow: 0 20px 48px rgba(20, 22, 33, 0.16);
        color-scheme: light;
      }
    }

    :root[data-theme="light"] {
      --bg-1: #f4f6fb;
      --bg-2: #e7ecf7;
      --surface: rgba(255, 255, 255, 0.72);
      --surface-2: #ffffff;
      --border: rgba(20, 22, 33, 0.12);
      --text: rgba(22, 24, 33, 0.92);
      --text-dim: rgba(22, 24, 33, 0.60);
      --muted: rgba(22, 24, 33, 0.45);
      --shadow: 0 20px 48px rgba(20, 22, 33, 0.16);
      color-scheme: light;
    }

    :root[data-theme="dark"] {
      --bg-1: #0b0e16;
      --bg-2: #141a2e;
      --surface: rgba(255, 255, 255, 0.05);
      --surface-2: rgba(255, 255, 255, 0.09);
      --border: rgba(255, 255, 255, 0.12);
      --text: rgba(255, 255, 255, 0.92);
      --text-dim: rgba(255, 255, 255, 0.62);
      --muted: rgba(255, 255, 255, 0.42);
      --shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
      color-scheme: dark;
    }
  `
}


// ==========================================
// Base & Reset
// Box model, tri-lingual font stack (Persian / Latin / Japanese fallbacks),
// and the themed page background.
// ==========================================
function cssBase() {
  return `
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    html { -webkit-text-size-adjust: 100%; }

    body {
      font-family: 'Vazirmatn', 'Segoe UI', 'Hiragino Sans', 'Noto Sans JP',
                   'Yu Gothic', Meiryo, Tahoma, Arial, sans-serif;
      min-height: 100vh;
      padding: 40px 20px;
      color: var(--text);
      background:
        radial-gradient(1100px 520px at 78% -8%, rgba(var(--brand-rgb), 0.22), transparent 60%),
        radial-gradient(900px 480px at 8% 6%, rgba(var(--accent-rgb), 0.14), transparent 60%),
        linear-gradient(160deg, var(--bg-1), var(--bg-2));
      background-attachment: fixed;
      line-height: 1.7;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }

    a { color: var(--accent); }

    :focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 3px;
      border-radius: 6px;
    }

    ::selection { background: rgba(var(--accent-rgb), 0.35); color: var(--text); }
  `
}


// ==========================================
// Layout
// Page container and the logo header. No physical direction is hard-coded,
// so the same markup is symmetric in RTL and LTR.
// ==========================================
function cssLayout() {
  return `
    .container {
      max-width: var(--maxw);
      margin-inline: auto;
      background: var(--surface);
      backdrop-filter: blur(22px);
      -webkit-backdrop-filter: blur(22px);
      padding: clamp(28px, 4vw, 50px);
      border: 1px solid var(--border);
      border-radius: calc(var(--radius) + 7px);
      box-shadow: var(--shadow);
      animation: fadeIn 0.55s ease both;
    }

    .header-logos {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 40px;
      margin-block-end: 30px;
    }

    .logo-container {
      text-align: center;
      animation: logoFloat 3s ease-in-out infinite;
    }
    .logo-container:nth-child(2) { animation-delay: 1.5s; }

    .logo-circle {
      width: 120px;
      height: 120px;
      border-radius: 50%;
      border: 4px solid var(--surface-2);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
      background: var(--surface-2);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      margin-inline: auto;
      transition: transform 0.3s ease, box-shadow 0.3s ease;
    }

    .logo-circle:hover {
      transform: scale(1.08);
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.38);
    }

    .logo-circle img {
      width: 120%;
      height: 120%;
      object-fit: cover;
      object-position: center;
    }

    .logo-container:first-child .logo-circle img {
      object-fit: contain;
      padding: 10px;
    }

    .logo-label {
      margin-block-start: 12px;
      font-size: 0.95em;
      font-weight: 700;
      color: var(--text);
      opacity: 0.95;
    }
  `
}


// ==========================================
// Typography
// Headings and body copy. Logical spacing keeps the accent rule on the
// correct (leading) side in both writing directions.
// ==========================================
function cssTypography() {
  return `
    h1 {
      font-size: clamp(1.9em, 5vw, 2.5em);
      font-weight: 800;
      margin-block-end: 20px;
      text-align: center;
      color: var(--text);
      letter-spacing: -0.01em;
    }

    h2 {
      font-size: clamp(1.4em, 3vw, 1.8em);
      font-weight: 700;
      margin-block: 35px 20px;
      color: var(--accent);
      border-inline-start: 5px solid var(--accent);
      padding-inline-start: 15px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    h3 {
      font-size: 1.3em;
      font-weight: 700;
      margin-block-end: 15px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    p { margin-block: 15px; font-size: 1.05em; color: var(--text); }

    ul { padding-inline-start: 30px; }
    li { margin-block: 12px; position: relative; }

    .last-update {
      text-align: center;
      margin-block-start: 40px;
      padding-block-start: 30px;
      border-top: 1px solid var(--border);
      color: var(--text-dim);
      font-size: 0.9em;
    }
  `
}


// ==========================================
// Components
// Reusable cards, status boxes, buttons and badges shared by every page.
// All translucency is driven by RGB tokens so it survives a theme switch.
// ==========================================
function cssComponents() {
  return `
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-block: 30px;
    }

    .info-card {
      background: var(--surface-2);
      padding: 20px;
      border-radius: var(--radius);
      border: 1px solid var(--border);
      border-inline-start: 4px solid var(--accent);
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding-block: 10px;
      border-bottom: 1px solid var(--border);
    }
    .info-row:last-child { border-bottom: none; }

    .json-box {
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
      margin-block: 20px;
      font-family: 'JetBrains Mono', 'Cascadia Code', 'Courier New', monospace;
      font-size: 0.9em;
      overflow-x: auto;
      direction: ltr;
      text-align: start;
    }

    .highlight-box,
    .warning-box,
    .contact-info {
      border-radius: var(--radius);
      padding: 20px;
      margin-block: 20px;
      border: 1px solid;
    }

    .highlight-box {
      background: rgba(var(--ok-rgb), 0.16);
      border-color: rgba(var(--ok-rgb), 0.55);
    }
    .warning-box {
      background: rgba(var(--warn-rgb), 0.16);
      border-color: rgba(var(--warn-rgb), 0.55);
    }
    .contact-info {
      background: rgba(var(--info-rgb), 0.16);
      border-color: rgba(var(--info-rgb), 0.55);
      padding: 25px;
      margin-block: 30px;
    }

    .contact-info a {
      color: var(--accent);
      font-weight: 700;
      text-decoration: none;
      transition: color 0.2s ease;
    }
    .contact-info a:hover { text-decoration: underline; }

    .btn-container {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 15px;
      margin-block-start: 30px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 15px 40px;
      border: none;
      border-radius: 12px;
      font: inherit;
      font-weight: 700;
      color: #fff;
      text-decoration: none;
      cursor: pointer;
      background: linear-gradient(135deg, var(--accent), ${'color-mix(in srgb, var(--accent) 70%, #ffffff)'});
      box-shadow: 0 6px 18px rgba(var(--accent-rgb), 0.35);
      transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
    }
    .btn:hover { transform: translateY(-3px); box-shadow: 0 12px 30px rgba(var(--accent-rgb), 0.45); }
    .btn:active { transform: translateY(-1px); filter: brightness(0.97); }

    .btn-secondary {
      background: linear-gradient(135deg, var(--brand), var(--brand-2));
      box-shadow: 0 6px 18px rgba(var(--brand-rgb), 0.35);
    }
    .btn-secondary:hover { box-shadow: 0 12px 30px rgba(var(--brand-rgb), 0.45); }

    .version-badge {
      display: inline-block;
      padding: 6px 15px;
      border-radius: 20px;
      font-size: 0.85em;
      font-weight: 700;
      color: var(--accent);
      background: rgba(var(--accent-rgb), 0.18);
      border: 1px solid rgba(var(--accent-rgb), 0.55);
      margin-block-start: 10px;
    }
  `
}


// ==========================================
// Animations
// Small, once-off motion that signals life without being noisy. Every
// animation and transition is removed under prefers-reduced-motion.
// ==========================================
function cssAnimations() {
  return `
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(18px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    @keyframes logoFloat {
      0%, 100% { transform: translateY(0); }
      50%      { transform: translateY(-9px); }
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.001ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.001ms !important;
        scroll-behavior: auto !important;
      }
    }
  `
}


// ==========================================
// Responsive
// Compact spacing and a stacked logo header on narrow viewports.
// ==========================================
function cssResponsive() {
  return `
    @media (max-width: 768px) {
      body { padding: 24px 16px; }
      .header-logos { flex-direction: column; gap: 25px; }
      .logo-circle { width: 100px; height: 100px; }
    }
  `
}


// ==========================================
// getSharedCSS
// Composes the full stylesheet from the modular sections above. Accepts the
// per-game brand color and an accent color; both fall back to safe defaults.
// ==========================================
export function getSharedCSS(gameColor = '#667eea', accentColor = '#4caf50') {
  const brand = parseHex(gameColor) ? gameColor : '#667eea'
  const accent = parseHex(accentColor) ? accentColor : '#4caf50'
  const brand2 = lighten(brand, 0.24, '#8a9bf0')
  const brandRgb = rgbTriplet(brand, '102, 126, 234')
  const accentRgb = rgbTriplet(accent, '76, 175, 80')

  return [
    cssTokens(brand, brand2, accent, brandRgb, accentRgb),
    cssBase(),
    cssLayout(),
    cssTypography(),
    cssComponents(),
    cssAnimations(),
    cssResponsive()
  ].join('\n')
}


// ==========================================
// getLogosHTML
// Renders the AmirCollider + game logo header. Order is fixed in markup
// (brand first) and stays correct in both RTL and LTR.
// ==========================================
export function getLogosHTML(amirLogo, gameLogo, gameName) {
  return `
    <div class="header-logos">
      <div class="logo-container">
        <div class="logo-circle">
          <img src="${amirLogo}" alt="AmirCollider Logo" loading="lazy" decoding="async"
               onerror="this.onerror=null;this.src='/assets/AmirColliderLogo.png';">
        </div>
        <div class="logo-label">AmirCollider</div>
      </div>
      <div class="logo-container">
        <div class="logo-circle">
          <img src="${gameLogo}" alt="${gameName} Logo" loading="lazy" decoding="async"
               onerror="this.onerror=null;this.src='/assets/DefaultGameLogo.png';">
        </div>
        <div class="logo-label">${gameName}</div>
      </div>
    </div>
  `
}


// ==========================================
// getPageHead
// Document <head> fragment: charset, viewport, theme metadata, title and
// icons. Native UI follows the active theme via color-scheme / theme-color.
// ==========================================
export function getPageHead({ title, amirLogo, description = '' }) {
  return `
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="color-scheme" content="light dark">
  <meta name="theme-color" content="#f4f6fb" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#0b0e16" media="(prefers-color-scheme: dark)">
  <meta name="format-detection" content="telephone=no">
  <meta name="google-site-verification" content="uFvaRQchIco-iyGmdsNknLK7mL5Asxg47GjaOQmhf0Q" />
  <title>${title}</title>
  <link rel="icon" href="${amirLogo}" type="image/png">
  <link rel="shortcut icon" href="${amirLogo}" type="image/png">
  <link rel="apple-touch-icon" href="${amirLogo}">
  ${description ? `<meta name="description" content="${description}">` : ''}
  `
}
