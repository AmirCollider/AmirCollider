// ==========================================
// Pages/NotFound.js
// The page a visitor gets when nothing matched.
//
// It used to be a JSON body. For a shipped client that is exactly
// right; for a person who mistyped a URL or followed a stale link
// it is a dead end with no way out - and it was the single most
// common way to arrive at this site with no navigation on screen.
//
// So: content negotiation. A browser gets a real page with the
// site's header, its footer and a short list of somewhere to go.
// Anything asking for JSON still gets JSON, byte for byte what it
// got before.
//
// Public entries
//   wantsHtml(request)                      does this caller render?
//   createNotFoundPage({ lang, theme, ... })
//   handleNotFound(url, request, requestId, games)
// ==========================================

import { CONFIG } from '../Config.js'
import { getPageHead } from '../Core/DesignSystem.js'
import { createHtmlResponse, create404Response } from '../Core/Http.js'
import { escapeHtml } from '../Core/Html.js'
import { seoHead } from '../Core/Seo.js'
import { themeBootScript } from '../Core/PageChrome.js'
import { siteNavCss, siteHeader, siteFooter, siteBackToTop, siteChromeScript } from '../Core/SiteNav.js'
import {
  dirFor, parseCookies, resolveLang, resolveRequestLang, resolveRequestTheme, themeAttribute
} from '../Core/RequestContext.js'


const I18N = {
  fa: {
    title: 'صفحه پیدا نشد',
    code: 'خطای ۴۰۴',
    lede: 'این آدرس روی این سایت وجود ندارد. شاید لینک قدیمی شده یا در تایپ آدرس اشتباهی رخ داده است.',
    suggest: 'شاید دنبال یکی از این‌ها بودید:',
    home: 'صفحه‌ی اصلی',
    tools: 'ابزارهای یونیتی',
    games: 'بازی‌ها',
    notes: 'یادداشت‌های انتشار',
    pathLabel: 'آدرس درخواستی'
  },
  en: {
    title: 'Page not found',
    code: 'Error 404',
    lede: 'That address does not exist on this site. The link may be out of date, or there may be a typo in the URL.',
    suggest: 'You might be looking for:',
    home: 'Home',
    tools: 'Unity tools',
    games: 'Games',
    notes: 'Release notes',
    pathLabel: 'Requested address'
  },
  ja: {
    title: 'ページが見つかりません',
    code: 'エラー 404',
    lede: 'このアドレスはこのサイトに存在しません。リンクが古いか、URL に入力ミスがある可能性があります。',
    suggest: 'お探しのものはこちらでしょうか:',
    home: 'ホーム',
    tools: 'Unity ツール',
    games: 'ゲーム',
    notes: 'リリースノート',
    pathLabel: 'リクエストされたアドレス'
  }
}


/**
 * Whether this caller renders HTML.
 *
 * A shipped game client sends Accept: application/json and must
 * keep getting JSON; a browser sends text/html and gets a page.
 * The order of the test matters: browsers list a wildcard in their
 * Accept header too, so an explicit application/json has to be
 * checked first or every JSON caller would be handed a page.
 */
export function wantsHtml(request) {
  const accept = (request && request.headers ? request.headers.get('Accept') : '') || ''
  if (accept.includes('application/json')) return false
  return accept.includes('text/html')
}


function css() {
  return `
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    html { -webkit-text-size-adjust: 100%; }

    :root {
      --brand: #6c63ff; --accent: #6c63ff;
      --radius: 18px; --maxw: 960px;
      --bg-1: #0b0e16; --bg-2: #141a2e;
      --surface: rgba(255,255,255,0.05);
      --surface-2: rgba(255,255,255,0.09);
      --border: rgba(255,255,255,0.12);
      --text: rgba(255,255,255,0.92);
      --text-dim: rgba(255,255,255,0.58);
      color-scheme: dark;
    }
    @media (prefers-color-scheme: light) {
      :root:not([data-theme]) {
        --bg-1: #f4f6fb; --bg-2: #e7ecf7;
        --surface: rgba(255,255,255,0.72); --surface-2: #ffffff;
        --border: rgba(20,22,33,0.10);
        --text: rgba(22,24,33,0.92); --text-dim: rgba(22,24,33,0.56);
        color-scheme: light;
      }
    }
    :root[data-theme="light"] {
      --bg-1: #f4f6fb; --bg-2: #e7ecf7;
      --surface: rgba(255,255,255,0.72); --surface-2: #ffffff;
      --border: rgba(20,22,33,0.10);
      --text: rgba(22,24,33,0.92); --text-dim: rgba(22,24,33,0.56);
      color-scheme: light;
    }
    :root[data-theme="dark"] {
      --bg-1: #0b0e16; --bg-2: #141a2e;
      --surface: rgba(255,255,255,0.05); --surface-2: rgba(255,255,255,0.09);
      --border: rgba(255,255,255,0.12);
      --text: rgba(255,255,255,0.92); --text-dim: rgba(255,255,255,0.58);
      color-scheme: dark;
    }

    body {
      font-family: 'Vazirmatn', 'Segoe UI', Tahoma, Arial, sans-serif;
      min-height: 100vh; color: var(--text); line-height: 1.75;
      padding-block-end: 40px; padding-inline: 20px;
      background:
        radial-gradient(1000px 500px at 78% -10%, color-mix(in srgb, var(--brand) 20%, transparent), transparent 60%),
        linear-gradient(160deg, var(--bg-1), var(--bg-2));
      background-attachment: fixed;
    }
    .wrap { max-width: var(--maxw); margin-inline: auto; }

    /* The gutter is on <body>; the header puts the same gutter back
       inside itself so its contents line up with the panel below. */
    .ac-nav { margin-inline: -20px; padding-inline: 20px; }

    .nf {
      margin-block: 40px; padding: 42px 30px; text-align: center;
      border-radius: calc(var(--radius) + 4px);
      background: var(--surface); border: 1px solid var(--border);
    }
    .nf-code {
      display: inline-block; padding: 5px 14px; border-radius: 999px;
      font-size: 0.8em; font-weight: 800; letter-spacing: 0.06em;
      color: color-mix(in srgb, var(--brand) 55%, var(--text));
      background: color-mix(in srgb, var(--brand) 14%, transparent);
      border: 1px solid color-mix(in srgb, var(--brand) 34%, transparent);
    }
    .nf h1 { font-size: clamp(1.7em, 5vw, 2.5em); font-weight: 800; margin-block: 16px 10px; }
    .nf p { color: var(--text-dim); max-width: 56ch; margin-inline: auto; }
    .nf-path {
      display: inline-block; margin-block-start: 18px; padding: 8px 14px;
      border-radius: 10px; font-size: 0.85em; direction: ltr; unicode-bidi: isolate;
      font-family: ui-monospace, 'JetBrains Mono', Consolas, monospace;
      background: var(--surface-2); border: 1px solid var(--border); color: var(--text-dim);
      max-width: 100%; overflow-wrap: anywhere;
    }

    .nf-suggest { margin-block-start: 30px; }
    .nf-suggest h2 {
      font-size: 0.9em; font-weight: 700; color: var(--text-dim);
      margin-block-end: 14px; border: 0; padding: 0;
    }
    .nf-links { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
    .nf-links a {
      display: inline-flex; align-items: center; padding: 11px 20px; border-radius: 12px;
      font-weight: 700; font-size: 0.9em; text-decoration: none; color: var(--text);
      background: var(--surface-2); border: 1px solid var(--border);
      transition: transform 0.18s ease, border-color 0.18s ease;
    }
    .nf-links a:hover {
      transform: translateY(-2px);
      border-color: color-mix(in srgb, var(--brand) 45%, var(--border));
    }
    .nf-links a:first-child {
      color: #fff; border-color: transparent;
      background: linear-gradient(135deg, var(--brand), color-mix(in srgb, var(--brand) 55%, #fff));
    }
    @media (prefers-reduced-motion: reduce) { .nf-links a { transition: none; } }
  `
}


export function createNotFoundPage({ lang, theme, path = '', games = [] }) {
  const code = resolveLang(lang)
  const p = I18N[code]

  const links = [
    { href: '/', label: p.home },
    { href: '/games', label: p.games },
    { href: '/tools', label: p.tools },
    { href: '/release-notes', label: p.notes }
  ].map(link =>
    '<a href="' + escapeHtml(link.href) + '">' + escapeHtml(link.label) + '</a>'
  ).join('')

  return `<!DOCTYPE html>
<html lang="${code}" dir="${dirFor(code)}"${themeAttribute(theme)}>
<head>
  ${getPageHead({
    title: `${p.title} — AmirCollider`,
    amirLogo: CONFIG.AMIR_LOGO,
    description: p.lede
  })}
  ${seoHead({ path: '/404', title: p.title, description: p.lede, lang: code, noindex: true })}
  ${themeBootScript()}
  <style>${siteNavCss()}${css()}</style>
</head>
<body>
  ${siteHeader({ lang: code })}
  <div class="wrap">
    <main id="main" class="nf">
      <span class="nf-code">${escapeHtml(p.code)}</span>
      <h1>${escapeHtml(p.title)}</h1>
      <p>${escapeHtml(p.lede)}</p>
      ${path ? `<div class="nf-path" title="${escapeHtml(p.pathLabel)}">${escapeHtml(path)}</div>` : ''}
      <div class="nf-suggest">
        <h2>${escapeHtml(p.suggest)}</h2>
        <div class="nf-links">${links}</div>
      </div>
    </main>
    ${siteFooter({ lang: code, games })}
  </div>
  ${siteBackToTop({ lang })}
  ${siteChromeScript()}
</body>
</html>`
}


/**
 * The 404 for any route that did not match.
 *
 * JSON for API callers (unchanged), HTML for browsers. Both carry
 * status 404, so a crawler is told the truth either way.
 */
export function handleNotFound(url, request, requestId, games = []) {
  if (!wantsHtml(request)) return create404Response(requestId)

  const cookies = parseCookies(request)
  const lang = resolveRequestLang(url, request, cookies)
  const theme = resolveRequestTheme(cookies)

  return createHtmlResponse(
    createNotFoundPage({ lang, theme, path: url.pathname, games }),
    404
  )
}
