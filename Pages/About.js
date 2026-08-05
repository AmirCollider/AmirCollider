// ==========================================
// Pages/About.js
// Who is behind all of this.
//
// Public entry (wired in Worker.js ROUTES):
//   GET /about
//
// ------------------------------------------------------------
// WHY THIS PAGE EXISTS
// ------------------------------------------------------------
// Two reasons, and they turned out to be the same reason.
//
// The first is for people. A stranger who lands on a Unity
// extension or a game page has no way to find out who made it.
// The site listed products and nothing else, so "who is this" was
// a question with no page to answer it.
//
// The second is for search engines, which had exactly the same
// problem and dealt with it the way they always do - by inventing
// an answer out of whatever text was nearest. A search for the
// name returned the tools and stopped, because the tools were the
// only thing on the domain that described a subject rather than a
// transaction. A page ABOUT the subject, with a Person node
// attached to it, is what gives a crawler something to hang the
// name on.
//
// ------------------------------------------------------------
// WHAT IT IS NOT
// ------------------------------------------------------------
// Not a portfolio, not a pitch, and not anonymous-but-guessable.
// The first thing the page does is ask the reader to keep a real
// name out of it, so nothing further down - no caption, no
// structured data, no meta tag - carries one either. See
// Content/AboutMe.js, which holds every word on the page and says
// the same thing at greater length.
//
// Trilingual and theme-aware like the rest of the site: language
// resolves ?lang= -> cookie -> Accept-Language, and switching
// reloads so RTL/LTR is always correct.
// ==========================================

import { CONFIG } from '../Config.js'
import { getPageHead } from '../Core/DesignSystem.js'
import { createHtmlResponse } from '../Core/Http.js'
import { aboutFor, aboutFaq } from '../Content/AboutMe.js'

import { escapeHtml } from '../Core/Html.js'
import { themeBootScript } from '../Core/PageChrome.js'
import { seoHead, breadcrumbLd, personLd, profilePageLd, faqPageLd } from '../Core/Seo.js'
import {
  siteNavCss, siteHeader, siteBreadcrumb, siteFooter, siteBackToTop, siteChromeScript, NAV_I18N
} from '../Core/SiteNav.js'
import { langCookieHeader, parseCookies, resolveLang, resolveRequestLang, resolveRequestTheme } from '../Core/RequestContext.js'


// ==========================================
// Stylesheet
//
// The same tokens every other page on this site uses, with one
// addition: a warm second accent. The rest of the site is violet
// and cool, which is right for a dashboard and slightly wrong for
// a page whose entire job is to sound like a person. The warmth
// is confined to the accents - the ink stays the site's ink,
// because pastel body text is a page you squint at.
// ==========================================
function aboutCss() {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --brand: #6c63ff;
      --warm: #ff7ea8;
      --radius: 18px;
      --maxw: 860px;

      --bg-1: #0b0e16;
      --bg-2: #141a2e;
      --surface: rgba(255,255,255,0.045);
      --surface-2: rgba(255,255,255,0.08);
      --border: rgba(255,255,255,0.10);
      --text: rgba(255,255,255,0.92);
      --text-dim: rgba(255,255,255,0.60);
      color-scheme: dark;
    }

    @media (prefers-color-scheme: light) {
      :root:not([data-theme]) {
        --bg-1: #fbf7f9;
        --bg-2: #eef0fb;
        --surface: rgba(255,255,255,0.74);
        --surface-2: #ffffff;
        --border: rgba(20,22,33,0.10);
        --text: rgba(22,24,33,0.92);
        --text-dim: rgba(22,24,33,0.58);
        color-scheme: light;
      }
    }
    :root[data-theme="light"] {
      --bg-1: #fbf7f9;
      --bg-2: #eef0fb;
      --surface: rgba(255,255,255,0.74);
      --surface-2: #ffffff;
      --border: rgba(20,22,33,0.10);
      --text: rgba(22,24,33,0.92);
      --text-dim: rgba(22,24,33,0.58);
      color-scheme: light;
    }
    :root[data-theme="dark"] {
      --bg-1: #0b0e16;
      --bg-2: #141a2e;
      --surface: rgba(255,255,255,0.045);
      --surface-2: rgba(255,255,255,0.08);
      --border: rgba(255,255,255,0.10);
      --text: rgba(255,255,255,0.92);
      --text-dim: rgba(255,255,255,0.60);
      color-scheme: dark;
    }

    body {
      font-family: 'Vazirmatn', system-ui, -apple-system, 'Segoe UI', Roboto,
                   'Noto Sans JP', 'Hiragino Sans', Meiryo, sans-serif;
      color: var(--text);
      min-height: 100vh;
      line-height: 1.9;
      padding-inline: 20px;
      -webkit-font-smoothing: antialiased;
      background:
        radial-gradient(900px 520px at 82% -8%, color-mix(in srgb, var(--warm) 20%, transparent), transparent 62%),
        radial-gradient(820px 460px at 6% 2%, color-mix(in srgb, var(--brand) 18%, transparent), transparent 60%),
        linear-gradient(165deg, var(--bg-1), var(--bg-2));
      background-attachment: fixed;
    }
    .wrap { max-width: var(--maxw); margin-inline: auto; padding-block-end: 56px; }
    .ac-nav { margin-inline: -20px; padding-inline: 20px; margin-block-end: 22px; }
    [id] { scroll-margin-top: 24px; }

    /* An unmarked Latin run inside an RTL paragraph is reordered by
       the browser - and this page is full of them: a handle, a
       hostname, two engine names. */
    bdi, [dir="ltr"], [dir="auto"] { unicode-bidi: isolate; }

    /* ---------- hero ---------- */
    .ab-hero { text-align: center; padding-block: 12px 30px; }
    .ab-avatar {
      width: 96px; height: 96px; border-radius: 50%; margin-inline: auto;
      overflow: hidden; display: grid; place-items: center;
      background: var(--surface-2);
      border: 2px solid color-mix(in srgb, var(--warm) 45%, var(--border));
      box-shadow: 0 12px 34px rgba(0,0,0,0.22);
    }
    /* The avatar is round and the logo is square, which is the same
       crop that costs the favicon its corners - so the mark is
       inset here rather than covering the circle. Contained rather
       than covered, so a logo of any aspect ratio stays itself. */
    .ab-avatar img { width: 74%; height: 74%; object-fit: contain; display: block; }
    .ab-hero h1 {
      font-size: clamp(1.75em, 5vw, 2.5em); font-weight: 800; line-height: 1.25;
      letter-spacing: -0.01em; margin-block-start: 18px;
    }
    .ab-role {
      display: inline-block; margin-block-start: 10px; padding: 5px 15px; border-radius: 999px;
      font-size: 0.82em; font-weight: 700; line-height: 1.7;
      color: color-mix(in srgb, var(--warm) 55%, var(--text));
      background: color-mix(in srgb, var(--warm) 12%, transparent);
      border: 1px solid color-mix(in srgb, var(--warm) 32%, transparent);
    }
    .ab-intro {
      color: var(--text-dim); max-width: 56ch; margin-inline: auto;
      margin-block-start: 14px; font-size: 0.98em;
    }

    /* ---------- the request ----------
       First block on the page and the only one with a filled
       surface of its own, because it is the one thing the page
       asks for rather than tells. */
    .ab-note {
      padding: 22px 24px; border-radius: var(--radius); margin-block-end: 34px;
      background: linear-gradient(135deg,
        color-mix(in srgb, var(--warm) 13%, var(--surface)),
        color-mix(in srgb, var(--brand) 11%, var(--surface)));
      border: 1px solid color-mix(in srgb, var(--warm) 26%, var(--border));
    }
    .ab-note h2 { font-size: 1.02em; font-weight: 800; margin-block-end: 8px; }
    .ab-note p { font-size: 0.97em; }
    .ab-note .ab-aside {
      margin-block-start: 12px; padding-inline-start: 14px; font-size: 0.9em;
      color: var(--text-dim);
      border-inline-start: 2px solid color-mix(in srgb, var(--warm) 40%, var(--border));
    }

    /* ---------- sections ---------- */
    .ab-sec { margin-block-end: 38px; }
    .ab-sec > h2 {
      font-size: 1.28em; font-weight: 800; margin-block-end: 6px; line-height: 1.5;
      display: flex; align-items: center; gap: 12px;
    }
    .ab-sec > h2::after {
      content: ''; flex: 1; height: 1px;
      background: linear-gradient(90deg, var(--border), transparent);
    }
    [dir="rtl"] .ab-sec > h2::after {
      background: linear-gradient(270deg, var(--border), transparent);
    }
    .ab-lede { color: var(--text-dim); font-size: 0.94em; margin-block-end: 16px; }
    .ab-prose p { margin-block-start: 14px; }
    .ab-prose p:first-child { margin-block-start: 0; }

    /* ---------- timeline ----------
       Three dates and a rule down the side. Deliberately small:
       it is a paper trail, not an achievement wall, and drawing
       it like a career ladder would say something the page
       spends a paragraph explaining is not true. */
    .ab-time { list-style: none; position: relative; padding-inline-start: 26px; }
    .ab-time::before {
      content: ''; position: absolute; inset-block: 8px; inset-inline-start: 5px;
      width: 2px; border-radius: 2px;
      background: linear-gradient(180deg,
        color-mix(in srgb, var(--warm) 55%, transparent),
        color-mix(in srgb, var(--brand) 45%, transparent));
    }
    .ab-time li { position: relative; padding-block: 6px 16px; }
    .ab-time li::before {
      content: ''; position: absolute; inset-inline-start: -26px; top: 15px;
      width: 12px; height: 12px; border-radius: 50%;
      background: var(--bg-1);
      border: 2px solid color-mix(in srgb, var(--warm) 60%, var(--border));
    }
    .ab-time .ab-date {
      display: block; font-size: 0.78em; font-weight: 800; letter-spacing: 0.02em;
      color: color-mix(in srgb, var(--warm) 55%, var(--text-dim));
    }
    .ab-time b { display: block; font-size: 1.02em; font-weight: 700; }
    .ab-time span.ab-body { display: block; color: var(--text-dim); font-size: 0.92em; }

    .ab-hint {
      margin-block-start: 14px; padding: 13px 16px; border-radius: 13px;
      font-size: 0.89em; color: var(--text-dim); line-height: 1.8;
      background: var(--surface); border: 1px solid var(--border);
    }

    /* ---------- questions ----------
       Open, not folded away. A collapsed answer reads as
       something being kept back, which is the opposite of what
       this section is for. */
    .ab-qa { display: grid; gap: 14px; }
    .ab-q {
      padding: 20px 22px; border-radius: var(--radius);
      background: var(--surface); border: 1px solid var(--border);
      transition: border-color 0.18s ease, transform 0.18s ease;
    }
    .ab-q:hover {
      border-color: color-mix(in srgb, var(--warm) 32%, var(--border));
      transform: translateY(-2px);
    }
    .ab-q h3 {
      font-size: 1.03em; font-weight: 800; line-height: 1.7;
      display: flex; align-items: flex-start; gap: 11px;
    }
    .ab-q h3::before {
      content: '؟'; flex: none; width: 26px; height: 26px; border-radius: 50%;
      display: grid; place-items: center; font-size: 0.82em; margin-block-start: 4px;
      color: color-mix(in srgb, var(--warm) 60%, var(--text));
      background: color-mix(in srgb, var(--warm) 14%, transparent);
      border: 1px solid color-mix(in srgb, var(--warm) 30%, transparent);
    }
    [dir="ltr"] .ab-q h3::before { content: '?'; }
    .ab-q p { color: var(--text-dim); font-size: 0.95em; margin-block-start: 8px; }

    /* ---------- facts ----------
       Two columns at most. Three fitted, and the four cards are
       nowhere near the same length - a one-line fact next to a
       four-line one, then a lone card on a second row. Two wider
       columns pair them off evenly. */
    .ab-facts { display: grid; gap: 13px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
    .ab-fact {
      display: flex; align-items: flex-start; gap: 13px;
      padding: 17px 19px; border-radius: 15px;
      background: var(--surface); border: 1px solid var(--border);
    }
    .ab-fact span.ab-ic { font-size: 1.4em; line-height: 1.4; flex: none; }
    .ab-fact p { font-size: 0.93em; line-height: 1.8; }

    /* ---------- this site, and the sign-off ---------- */
    .ab-chips { display: flex; flex-wrap: wrap; gap: 9px; margin-block-start: 16px; }
    .ab-chip {
      display: inline-flex; align-items: center; gap: 7px;
      padding: 9px 16px; border-radius: 999px; text-decoration: none;
      font-size: 0.88em; font-weight: 700; color: var(--text);
      background: var(--surface-2); border: 1px solid var(--border);
      transition: transform 0.16s ease, border-color 0.16s ease;
    }
    .ab-chip:hover {
      transform: translateY(-2px);
      border-color: color-mix(in srgb, var(--warm) 45%, var(--border));
    }

    .ab-outro {
      text-align: center; margin-block-start: 8px; padding: 26px 20px;
      border-radius: var(--radius);
      background: var(--surface); border: 1px solid var(--border);
    }
    .ab-outro p { font-size: 1.04em; font-weight: 700; }
    .ab-outro .ab-chips { justify-content: center; }

    @media (max-width: 560px) {
      body { line-height: 1.85; }
      .ab-note, .ab-q { padding: 17px 18px; }
      .ab-avatar { width: 82px; height: 82px; }
    }

    @media (prefers-reduced-motion: no-preference) {
      .ab-hero, .ab-note, .ab-sec, .ab-outro {
        animation: abRise 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
      }
      .ab-note { animation-delay: 0.05s; }
      .ab-sec  { animation-delay: 0.08s; }
    }
    @keyframes abRise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
  `
}


// ==========================================
// Partials
// ==========================================
function renderHero(p) {
  return `
    <header class="ab-hero">
      <div class="ab-avatar">
        <img src="${escapeHtml(CONFIG.AMIR_LOGO)}" alt="" width="96" height="96"
             onerror="this.style.display='none'">
      </div>
      <h1>${escapeHtml(p.hello)}</h1>
      <p><span class="ab-role">${escapeHtml(p.role)}</span></p>
      <p class="ab-intro">${escapeHtml(p.intro)}</p>
    </header>`
}


function renderRequest(p) {
  return `
    <section class="ab-note">
      <h2>${escapeHtml(p.privacyTitle)}</h2>
      <p>${escapeHtml(p.privacyBody)}</p>
      <p class="ab-aside">${escapeHtml(p.privacyAside)}</p>
    </section>`
}


function renderStory(p) {
  return `
    <section class="ab-sec">
      <h2>${escapeHtml(p.storyHead)}</h2>
      <div class="ab-prose">
        ${p.story.map(line => `<p>${escapeHtml(line)}</p>`).join('')}
      </div>
    </section>`
}


function renderProof(p) {
  const items = p.proof.map(entry => `
    <li>
      <span class="ab-date" dir="auto">${escapeHtml(entry.date)}</span>
      <b>${escapeHtml(entry.title)}</b>
      <span class="ab-body">${escapeHtml(entry.body)}</span>
    </li>`).join('')

  return `
    <section class="ab-sec">
      <h2>${escapeHtml(p.proofHead)}</h2>
      <p class="ab-lede">${escapeHtml(p.proofLede)}</p>
      <ol class="ab-time">${items}</ol>
      <p class="ab-hint">${escapeHtml(p.proofNote)}</p>
    </section>`
}


function renderQuestions(head, lede, entries) {
  const items = entries.map(entry => `
    <article class="ab-q">
      <h3>${escapeHtml(entry.q)}</h3>
      <p>${escapeHtml(entry.a)}</p>
    </article>`).join('')

  return `
    <section class="ab-sec">
      <h2>${escapeHtml(head)}</h2>
      ${lede ? `<p class="ab-lede">${escapeHtml(lede)}</p>` : ''}
      <div class="ab-qa">${items}</div>
    </section>`
}


function renderFacts(p) {
  const items = p.facts.map(fact => `
    <div class="ab-fact">
      <span class="ab-ic" aria-hidden="true">${fact.icon}</span>
      <p>${escapeHtml(fact.text)}</p>
    </div>`).join('')

  return `
    <section class="ab-sec">
      <h2>${escapeHtml(p.factsHead)}</h2>
      <div class="ab-facts">${items}</div>
    </section>`
}


function renderSite(p) {
  const chips = p.siteLinks.map(link =>
    `<a class="ab-chip" href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`
  ).join('')

  return `
    <section class="ab-sec">
      <h2>${escapeHtml(p.siteHead)}</h2>
      <div class="ab-prose"><p>${escapeHtml(p.siteBody)}</p></div>
      <div class="ab-chips">${chips}</div>
    </section>`
}


function renderOutro(p) {
  const social = [
    { href: CONFIG.SOCIAL.github, label: 'GitHub' },
    { href: CONFIG.SOCIAL.instagram, label: 'Instagram' },
    { href: 'mailto:' + CONFIG.SUPPORT_EMAIL, label: p.email }
  ].filter(link => link.href)

  const chips = social.map(link =>
    `<a class="ab-chip" href="${escapeHtml(link.href)}" rel="me noopener">${escapeHtml(link.label)}</a>`
  ).join('')

  return `
    <section class="ab-outro">
      <p>${escapeHtml(p.outro)}</p>
      <p class="ab-lede" style="margin:6px 0 0">${escapeHtml(p.contactHead)}</p>
      <div class="ab-chips">${chips}</div>
    </section>`
}


// ==========================================
// Page
// ==========================================
function createAboutPage(lang, theme) {
  const resolved = resolveLang(lang)
  const p = aboutFor(resolved)
  const site = NAV_I18N[resolved]
  const themeAttr = theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : ''

  const trail = [
    { href: '/', label: site.home },
    { href: '/about', label: p.breadcrumb }
  ]

  // Person, then the page that is about them, then the questions.
  // The Person node carries the same @id the Organization's
  // `founder` points at, which is what joins the two into one
  // graph rather than two unrelated claims on the same domain.
  const graph = [
    breadcrumbLd(trail),
    personLd(resolved, { description: p.metaDesc }),
    profilePageLd(resolved),
    faqPageLd(aboutFaq(resolved))
  ]

  return `<!DOCTYPE html>
<html dir="${p.dir}" lang="${resolved}"${themeAttr}>
<head>
  ${getPageHead({ title: p.metaTitle, amirLogo: CONFIG.AMIR_LOGO, description: p.metaDesc })}
  ${seoHead({
    path: '/about',
    title: p.metaTitle,
    description: p.metaDesc,
    lang: resolved,
    type: 'profile',
    graph
  })}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  ${themeBootScript()}
  <style>${siteNavCss()}${aboutCss()}</style>
</head>
<body>
  ${siteHeader({ lang: resolved, active: 'about' })}
  <div class="wrap">
    ${siteBreadcrumb({ lang: resolved, trail })}
    <main id="main">
      ${renderHero(p)}
      ${renderRequest(p)}
      ${renderStory(p)}
      ${renderProof(p)}
      ${renderQuestions(p.fairHead, p.fairLede, p.fair)}
      ${renderQuestions(p.moreHead, '', p.more)}
      ${renderFacts(p)}
      ${renderSite(p)}
      ${renderOutro(p)}
    </main>
    ${siteFooter({ lang: resolved })}
  </div>
  ${siteBackToTop({ lang: resolved })}
  ${siteChromeScript()}
</body>
</html>`
}


// ==========================================
// Handler
// ==========================================
export async function handleAbout(url, request) {
  const cookies = parseCookies(request)
  const lang = resolveRequestLang(url, request, cookies)
  const theme = resolveRequestTheme(cookies)

  return createHtmlResponse(createAboutPage(lang, theme), 200, langCookieHeader(url, lang))
}
