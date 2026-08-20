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

import { CONFIG, LANGUAGES } from '../Config.js'
import { getPageHead } from '../Core/DesignSystem.js'
import { createHtmlResponse } from '../Core/Http.js'
import { toolsFor } from '../Content/ToolsCatalog.js'

import { escapeHtml, safeColor } from '../Core/Html.js'
import { themeBootScript } from '../Core/PageChrome.js'
import { seoHead, breadcrumbLd, softwareApplicationLd, itemListLd, keywordList } from '../Core/Seo.js'
import { localizedPath } from '../Core/Locale.js'
import {
  siteNavCss, siteHeader, siteBreadcrumb, siteFooter, siteBackToTop, siteChromeScript, NAV_I18N
} from '../Core/SiteNav.js'
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

    // The words a person types when they want one of these, as
    // opposed to the words this page uses to describe them.
    keywords: ['افزونه یونیتی', 'ابزار یونیتی', 'Unity Editor', 'مستندسازی پروژه یونیتی', 'TextMeshPro', 'پکیج منیجر یونیتی'],

    // Its own string rather than the lede. The lede is written to
    // be read on the page and says nothing about WHAT the tools
    // are - which on a search result is the only question. This
    // names both of them, because two product names are the two
    // queries this page can realistically win.
    metaDesc: 'افزونه‌های ادیتور یونیتی از AmirCollider: Unity DocSnap برای مستندسازی خودکار پروژه، و Unity DirectTMP برای درست‌شدن متن فارسی و عربی در TextMeshPro.',
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
    keywords: ['Unity editor extension', 'Unity tools', 'Unity documentation generator', 'TextMeshPro', 'Unity Package Manager', 'Unity asset'],
    metaDesc: 'Unity editor extensions by AmirCollider: Unity DocSnap, which documents a whole project automatically, and Unity DirectTMP, which fixes right-to-left text.',
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
    keywords: ['Unity エディタ拡張', 'Unity ツール', 'Unity ドキュメント生成', 'TextMeshPro', 'Unity Package Manager', 'Unity アセット'],
    metaDesc: 'AmirCollider の Unity エディタ拡張。プロジェクトのドキュメントを自動生成する Unity DocSnap と、TextMeshPro の右から左の表示を直す Unity DirectTMP。',
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
// toolAliases
// The other way somebody writes a tool's name.
//
// "Unity DocSnap", "UnityDocSnap" and "Unity Doc Snap" are three
// queries and one product. The two product pages already declare
// their own aliases by hand; this derives the same two forms for
// the catalogue, so a tool added to Content/ToolsCatalog.js is
// findable under both spellings without anybody remembering to
// write a list.
// ==========================================
function toolAliases(name) {
  const text = String(name || '').trim()
  if (!text) return []

  const squashed = text.replace(/\s+/g, '')
  const spaced = text.replace(/([a-z])([A-Z])/g, '$1 $2')

  return [squashed, spaced].filter(entry => entry && entry !== text)
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
      padding-inline: 20px;
      -webkit-font-smoothing: antialiased;
    }

    .wrap { max-width: var(--maxw); margin-inline: auto; padding-block-end: 60px; }

    /* The gutter lives on <body>, so the header pulls back out to
       the viewport edges and puts the same gutter back inside - and
       its contents land exactly above the cards. */
    .ac-nav { margin-inline: -20px; padding-inline: 20px; margin-block-end: 24px; }
    [id] { scroll-margin-top: 24px; }

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

    @media (max-width: 560px) {
      .tool-body { padding: 18px; }
    }

    @media (prefers-reduced-motion: no-preference) {
      .hero, .tools { animation: tRise 0.5s cubic-bezier(0.16,1,0.3,1) both; }
      .hero  { animation-delay: 0.05s; }
      .tools { animation-delay: 0.10s; }
    }
    @keyframes tRise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
  `
}


// ==========================================
// Partials
//
// The header and the footer come from Core/SiteNav.js. This page
// used to build its own, which is how it ended up as the one page
// on the site whose brand mark was not a link home - the exact
// complaint that started this rewrite.
// ==========================================
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
      <a class="tool" href="${escapeHtml(localizedPath(tool.href, lang))}"
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


// ==========================================
// Page
// ==========================================
function createToolsPage(lang, theme) {
  const amirLogo = CONFIG.AMIR_LOGO
  const resolved = resolveLang(lang)
  const p = pack(resolved)
  const site = NAV_I18N[resolved]
  const themeAttr = theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : ''
  const tools = toolsFor(resolved)

  const trail = [
    { href: '/', label: site.home },
    { href: '/tools', label: p.title }
  ]

  // One SoftwareApplication node per tool, plus the list itself.
  // A crawler that reads this knows the page is a catalogue and
  // what each entry costs, without inferring either from prose.
  const graph = [
    breadcrumbLd(trail, resolved),

    // Entries with a sentence and a mark on them, not bare names.
    // See the same change on /games: a list a crawler has to open
    // every entry of to learn anything is a list it does not open.
    itemListLd({
      name: `${p.title} — AmirCollider`,
      lang: resolved,
      items: tools.map(tool => ({
        name: tool.name,
        url: tool.href,
        description: tool.description
      }))
    }),

    ...tools.map(tool => softwareApplicationLd({
      name: tool.name,

      // The compound name and the spaced one, for the same reason
      // the brand carries both: "Unity DocSnap" and "UnityDocSnap"
      // are two queries, and a product page that answers one of
      // them answers half the people looking for it.
      alternateName: toolAliases(tool.name),
      description: tool.description,
      path: tool.href,
      version: tool.version,
      price: tool.pricing === 'free' ? '0' : null,
      repo: tool.repo,

      // What each tool DOES, in the crawler's own vocabulary. The
      // catalogue already stores these as the highlights the card
      // renders, so this is the page's own bullet list said twice
      // rather than a second set of claims to keep in step.
      featureList: (tool.highlights || []).filter(Boolean),
      keywords: keywordList(tool.name, toolAliases(tool.name), 'Unity',
        'Unity editor extension', p.keywords || []),
      inLanguage: LANGUAGES.supported.slice()
    }))
  ]

  const keywords = keywordList(p.keywords || [], tools.flatMap(tool => [tool.name, ...toolAliases(tool.name)]))

  return `<!DOCTYPE html>
<html dir="${p.dir}" lang="${resolved}"${themeAttr}>
<head>
  ${getPageHead({
    title: `${p.title} — Unity Extensions by AmirCollider`,
    amirLogo,
    description: p.metaDesc
  })}
  ${seoHead({
    path: '/tools',
    title: `${p.title} — Unity Extensions by AmirCollider`,
    description: p.metaDesc,
    lang: resolved,
    pageType: 'CollectionPage',
    keywords,
    graph
  })}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap"></noscript>
  ${themeBootScript()}
  <style>${siteNavCss()}${getToolsCSS()}</style>
</head>
<body>
  ${siteHeader({ lang: resolved, active: 'tools' })}
  <div class="wrap">
    ${siteBreadcrumb({ lang: resolved, trail })}
    <main id="main">
      ${renderHero(resolved, tools.length)}
      ${renderTools(resolved)}
    </main>
    ${siteFooter({ lang: resolved })}
  </div>
  ${siteBackToTop({ lang })}
  ${siteChromeScript()}
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
