// ==========================================
// Pages/Tools.js
// The tools catalogue: every Unity tool on this shelf,
// one card each.
//
// Responsibilities
//   - Render /tools from Content/ToolsCatalog.js. This page
//     knows nothing about which tools exist; adding one is an
//     entry in the catalogue and nothing here changes.
//
// Integration contract (do not break without updating callers)
//   - Public entry: handleTools(url, request, gameId, requestId,
//                               GAMES, env, availableEndpoints)
//   - Route: GET /tools  (registered in Worker.js ROUTES)
//
// Why a page and not just the dashboard section
//
// Theme & language
//   - Theme: <html data-theme="light|dark">; "auto" follows the OS.
//   - Language: ?lang= -> cookie -> Accept-Language, with a reload
//     on switch so RTL/LTR is always correct.
// ==========================================

import { CONFIG } from '../Config.js'
import { getPageHead } from '../Core/DesignSystem.js'
import { createHtmlResponse } from '../Core/Http.js'
import { toolsFor } from '../Content/ToolsCatalog.js'

import { escapeHtml, safeColor } from '../Core/Html.js'
import { chromeScript, themeBootScript } from '../Core/PageChrome.js'
import { langCookieHeader, parseCookies, resolveLang, resolveRequestLang, resolveRequestTheme } from '../Core/RequestContext.js'


// ==========================================
// i18n - page chrome only. Everything about a
// specific tool comes from the catalogue.
// ==========================================
const I18N = {
  fa: {
    locale: 'fa-IR',
    dir: 'rtl',
    langName: 'فارسی',
    title: 'ابزارها',
    subtitle: 'افزونه‌های یونیتی از AmirCollider',
    lede: 'ابزارهایی که برای پروژه‌های خودم ساختم و بعد دیدم به درد بقیه هم می‌خورن. هرکدوم مستقل نصب می‌شن و به هم کاری ندارن.',
    themeToLight: 'حالت روشن',
    themeToDark: 'حالت تاریک',
    back: 'بازگشت به خانه',
    countLabel: 'ابزار',
    free: 'رایگان',
    freemium: 'رایگان + نسخه‌ی پولی',
    whatItDoes: 'چه‌کار می‌کند',
    openRepo: 'گیت‌هاب',
    footerTagline: 'ابزارهای یونیتی و سامانه‌ی پروکسی AmirCollider.',
    footerPowered: 'اجرا شده روی Cloudflare Workers'
  },
  en: {
    locale: 'en-US',
    dir: 'ltr',
    langName: 'English',
    title: 'Tools',
    subtitle: 'Unity extensions by AmirCollider',
    lede: 'Tools built for my own projects that turned out to be useful to other people too. Each installs on its own and none of them depend on the others.',
    themeToLight: 'Light mode',
    themeToDark: 'Dark mode',
    back: 'Back to home',
    countLabel: 'tools',
    free: 'Free',
    freemium: 'Free + paid editions',
    whatItDoes: 'What it does',
    openRepo: 'GitHub',
    footerTagline: 'Unity tools and the AmirCollider proxy.',
    footerPowered: 'Powered by Cloudflare Workers'
  },
  ja: {
    locale: 'ja-JP',
    dir: 'ltr',
    langName: '日本語',
    title: 'ツール',
    subtitle: 'AmirCollider の Unity 拡張',
    lede: '自分のプロジェクトのために作り、他の方にも役立つと分かったツールです。それぞれ独立して導入でき、相互の依存はありません。',
    themeToLight: 'ライトモード',
    themeToDark: 'ダークモード',
    back: 'ホームに戻る',
    countLabel: 'ツール',
    free: '無料',
    freemium: '無料版 + 有料版',
    whatItDoes: 'できること',
    openRepo: 'GitHub',
    footerTagline: 'AmirCollider の Unity ツールとプロキシ。',
    footerPowered: 'Cloudflare Workers で稼働'
  }
}


function pack(lang) {
  return I18N[resolveLang(lang)]
}


// ==========================================
// SVG icon set (stroke uses currentColor)
// ==========================================
const ICONS = {
  contrast: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor" stroke="none"/>',
  home: '<path d="M3 9.5 12 3l9 6.5"/><path d="M5 10v10h14V10"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  github: '<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9a3.4 3.4 0 0 0-.9-2.6c3-.3 6.2-1.5 6.2-6.7A5.2 5.2 0 0 0 20 5.1a4.9 4.9 0 0 0-.1-3.6s-1.1-.3-3.6 1.4a12.3 12.3 0 0 0-6.6 0C7.2 1.2 6.1 1.5 6.1 1.5A4.9 4.9 0 0 0 6 5.1a5.2 5.2 0 0 0-1.4 3.7c0 5.2 3.2 6.4 6.2 6.7a3.4 3.4 0 0 0-.9 2.5V22"/>'
}

function icon(name, cls) {
  return '<svg class="' + (cls || 'd-ic') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
    + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + (ICONS[name] || '') + '</svg>'
}


// ==========================================
// Stylesheet
// Theme via tokens; RTL/LTR via logical properties.
// ==========================================
function getToolsCSS() {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }

    html { scrollbar-width: none; -ms-overflow-style: none; }
    html::-webkit-scrollbar { width: 0; height: 0; display: none; }

    :root {
      --brand: #6c63ff;
      --radius: 18px;
      --maxw: 940px;

      --bg-1: #0b0e16;
      --bg-2: #141a2e;
      --surface: rgba(255,255,255,0.045);
      --surface-2: rgba(255,255,255,0.08);
      --border: rgba(255,255,255,0.10);
      --text: rgba(255,255,255,0.92);
      --text-dim: rgba(255,255,255,0.58);
      color-scheme: dark;
    }

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
      font-family: 'Vazirmatn', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
      background: radial-gradient(1100px 600px at 50% -10%, var(--bg-2), var(--bg-1));
      background-attachment: fixed;
      color: var(--text);
      min-height: 100vh;
      line-height: 1.7;
      -webkit-font-smoothing: antialiased;
    }

    .wrap { max-width: var(--maxw); margin-inline: auto; padding: 26px 20px 60px; }

    /* ---------- topbar ---------- */
    .topbar {
      display: flex; align-items: center; justify-content: space-between;
      gap: 14px; flex-wrap: wrap; margin-block-end: 30px;
    }
    .brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .brand-logo {
      width: 42px; height: 42px; border-radius: 12px; overflow: hidden;
      display: grid; place-items: center;
      background: var(--surface); border: 1px solid var(--border); flex: none;
    }
    .brand-logo img { width: 100%; height: 100%; object-fit: cover; }
    .brand-name { font-weight: 800; }
    .brand-sub { font-size: 0.82em; color: var(--text-dim); }

    .controls { display: flex; align-items: center; gap: 10px; }
    .seg {
      display: inline-flex; padding: 3px; gap: 2px; border-radius: 999px;
      background: var(--surface); border: 1px solid var(--border);
    }
    .seg button {
      appearance: none; border: 0; cursor: pointer; font: inherit;
      padding: 6px 12px; border-radius: 999px; font-size: 0.82em; font-weight: 600;
      background: transparent; color: var(--text-dim);
    }
    .seg button[aria-pressed="true"] { background: var(--surface-2); color: var(--text); }
    .icon-btn {
      appearance: none; cursor: pointer; width: 38px; height: 38px;
      display: grid; place-items: center; border-radius: 12px;
      background: var(--surface); border: 1px solid var(--border); color: var(--text);
    }
    .icon-btn svg { width: 19px; height: 19px; }

    /* ---------- hero ---------- */
    .hero { text-align: center; margin-block-end: 34px; }
    .hero h1 { font-size: clamp(1.9em, 5vw, 2.7em); font-weight: 800; letter-spacing: -0.02em; }
    .hero p { color: var(--text-dim); max-width: 60ch; margin-inline: auto; margin-block-start: 10px; }

    /* ---------- cards ----------
       Each card gets its tool's own accent through a
       --tool custom property set inline, so the whole
       card themes from one value. */
    .tools { display: grid; gap: 20px; }

    .tool {
      display: block; text-decoration: none; color: var(--text);
      border-radius: var(--radius); overflow: hidden;
      background: var(--surface);
      border: 1px solid color-mix(in srgb, var(--tool) 28%, var(--border));
      transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
    }
    .tool:hover {
      transform: translateY(-4px);
      background: var(--surface-2);
      border-color: color-mix(in srgb, var(--tool) 55%, var(--border));
    }
    .tool-stripe { height: 4px; background: linear-gradient(90deg, var(--tool), var(--tool-2)); }
    .tool-body { padding: 22px; }

    .tool-head { display: flex; align-items: flex-start; gap: 14px; flex-wrap: wrap; }
    .tool-mark { font-size: 2em; line-height: 1.2; }
    .tool-titles { flex: 1 1 240px; min-width: 0; }
    .tool-name { font-size: 1.25em; font-weight: 800; }
    .tool-version { font-size: 0.78em; color: var(--text-dim); font-weight: 600; }
    .tool-tagline { color: color-mix(in srgb, var(--tool) 50%, var(--text)); font-weight: 600; margin-block-start: 2px; }

    .tool-desc { color: var(--text-dim); font-size: 0.94em; margin-block: 14px; }

    .tool-highlights { list-style: none; display: grid; gap: 7px; margin-block-end: 16px; }
    .tool-highlights li { display: flex; align-items: flex-start; gap: 9px; font-size: 0.9em; }
    .tool-highlights svg {
      width: 17px; height: 17px; flex: none; margin-block-start: 4px;
      color: color-mix(in srgb, var(--tool) 60%, var(--text));
    }

    .tool-foot { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .tool-tags { display: flex; gap: 8px; flex-wrap: wrap; flex: 1 1 auto; }
    .tool-tag {
      font-size: 0.78em; font-weight: 700; padding: 3px 11px; border-radius: 999px;
      color: var(--text-dim); background: var(--surface-2); border: 1px solid var(--border);
    }
    .tool-tag.is-free {
      color: color-mix(in srgb, var(--tool) 55%, var(--text));
      background: color-mix(in srgb, var(--tool) 14%, transparent);
      border-color: color-mix(in srgb, var(--tool) 38%, transparent);
    }
    .tool-tag.is-paid {
      color: color-mix(in srgb, var(--tool-2) 60%, var(--text));
      background: color-mix(in srgb, var(--tool-2) 14%, transparent);
      border-color: color-mix(in srgb, var(--tool-2) 38%, transparent);
    }
    .tool-cta {
      font-weight: 700; font-size: 0.92em;
      color: color-mix(in srgb, var(--tool) 58%, var(--text));
    }

    /* ---------- nav & footer ---------- */
    .nav { display: flex; justify-content: center; margin-block: 34px 26px; }
    .back-link {
      display: inline-flex; align-items: center; gap: 9px;
      padding: 11px 18px; border-radius: 13px; text-decoration: none;
      font-weight: 600; font-size: 0.9em; color: var(--text);
      background: var(--surface); border: 1px solid var(--border);
    }
    .back-link svg { width: 18px; height: 18px; }

    footer { text-align: center; color: var(--text-dim); font-size: 0.85em; }
    .f-name { font-weight: 800; color: var(--text); margin-block-end: 6px; }

    @media (max-width: 560px) {
      .tool-body { padding: 18px; }
    }

    @media (prefers-reduced-motion: no-preference) {
      .topbar, .hero, .tools, .nav, footer { animation: tRise 0.5s cubic-bezier(0.16,1,0.3,1) both; }
      .hero  { animation-delay: 0.05s; }
      .tools { animation-delay: 0.10s; }
      .nav   { animation-delay: 0.14s; }
    }
    @keyframes tRise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
  `
}


// ==========================================
// Partials
// ==========================================
function renderTopbar(lang, amirLogo) {
  const p = pack(lang)
  const cur = resolveLang(lang)
  const langs = [['fa', I18N.fa.langName], ['en', I18N.en.langName], ['ja', I18N.ja.langName]]

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

function renderHero(lang, count) {
  const p = pack(lang)
  return `
    <div class="hero">
      <h1>${escapeHtml(p.title)}</h1>
      <p>${escapeHtml(p.lede)}</p>
      <p><b>${escapeHtml(String(count))}</b> ${escapeHtml(p.countLabel)}</p>
    </div>`
}

function renderTools(lang) {
  const p = pack(lang)

  const cards = toolsFor(resolveLang(lang)).map(tool => {
    const accent = safeColor(tool.accent, '#6c63ff')
    const accentSoft = safeColor(tool.accentSoft, accent)

    const tags = tool.tags.map(tag => {
      const cls = tag.kind === 'free' ? ' is-free' : tag.kind === 'paid' ? ' is-paid' : ''
      return '<span class="tool-tag' + cls + '">' + escapeHtml(tag.label) + '</span>'
    }).join('')

    const highlights = tool.highlights.map(item =>
      '<li>' + icon('check') + '<span>' + escapeHtml(item) + '</span></li>'
    ).join('')

    return `
      <a class="tool" href="${escapeHtml(tool.href)}"
         style="--tool: ${accent}; --tool-2: ${accentSoft}">
        <span class="tool-stripe"></span>
        <span class="tool-body">
          <span class="tool-head">
            <span class="tool-mark" aria-hidden="true">${tool.mark}</span>
            <span class="tool-titles">
              <span class="tool-name">${escapeHtml(tool.name)}</span>
              <span class="tool-version"> v${escapeHtml(tool.version)}</span>
              <span class="tool-tagline">${escapeHtml(tool.tagline)}</span>
            </span>
          </span>
          <span class="tool-desc">${escapeHtml(tool.description)}</span>
          <ul class="tool-highlights">${highlights}</ul>
          <span class="tool-foot">
            <span class="tool-tags">${tags}</span>
            <span class="tool-cta">${escapeHtml(tool.cta)} &rarr;</span>
          </span>
        </span>
      </a>`
  }).join('')

  return `<div class="tools" aria-label="${escapeHtml(p.title)}">${cards}</div>`
}

function renderNav(lang) {
  const p = pack(lang)
  return `
    <div class="nav">
      <a class="back-link" href="/">${icon('home')}<span>${escapeHtml(p.back)}</span></a>
    </div>`
}

function renderFooter(lang, version) {
  const p = pack(lang)
  return `
    <footer>
      <div class="f-name">AmirCollider</div>
      <div class="f-meta">${escapeHtml(p.footerTagline)}</div>
      <div class="f-meta">${escapeHtml(p.footerPowered)} &middot; <b>v${escapeHtml(version)}</b></div>
    </footer>`
}


// ==========================================
// Page
// ==========================================
function createToolsPage(lang, theme) {
  const amirLogo = CONFIG.AMIR_LOGO
  const resolved = resolveLang(lang)
  const p = pack(resolved)
  const themeAttr = theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : ''
  const tools = toolsFor(resolved)

  return `<!DOCTYPE html>
<html dir="${p.dir}" lang="${resolved}"${themeAttr}>
<head>
  ${getPageHead({
    title: `${p.title} — AmirCollider`,
    amirLogo,
    description: escapeHtml(p.lede)
  })}
  <link rel="canonical" href="${CONFIG.SITE_URL}/tools">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  ${themeBootScript()}
  <style>${getToolsCSS()}</style>
</head>
<body>
  <div class="wrap">
    ${renderTopbar(resolved, amirLogo)}
    ${renderHero(resolved, tools.length)}
    ${renderTools(resolved)}
    ${renderNav(resolved)}
    ${renderFooter(resolved, CONFIG.VERSION)}
  </div>
  ${chromeScript()}
</body>
</html>`
}


// ==========================================
// Handler
// ==========================================
export async function handleTools(url, request, gameId, requestId, GAMES, _env, availableEndpoints = []) {
  const cookies = parseCookies(request)
  const lang = resolveRequestLang(url, request, cookies)
  const theme = resolveRequestTheme(cookies)

  const headers = langCookieHeader(url, lang)

  return createHtmlResponse(createToolsPage(lang, theme), 200, headers)
}
