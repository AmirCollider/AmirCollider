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
import { seoHead, breadcrumbLd, personLd, profilePageLd, faqPageLd, keywordList } from '../Core/Seo.js'
import {
  siteNavCss, siteHeader, siteBreadcrumb, siteFooter, siteBackToTop, siteChromeScript,
  socialLinks, NAV_I18N
} from '../Core/SiteNav.js'
import { localizedPath } from '../Core/Locale.js'
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
      --maxw: 940px;

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
    /* A rounded square, not a circle.
       The logo is a square image with its own background painted
       to the edges. Put that inside a circle and you see a square
       inside a circle - two shapes disagreeing, with the corners
       cut off for good measure. The site header solved this the
       same way and for the same reason: the frame matches the
       mark. */
    .ab-avatar {
      width: 104px; height: 104px; border-radius: 28px; margin-inline: auto;
      overflow: hidden; display: grid; place-items: center;
      background: var(--surface-2);
      border: 2px solid color-mix(in srgb, var(--warm) 45%, var(--border));
      box-shadow: 0 12px 34px rgba(0,0,0,0.22);
    }
    .ab-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
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
    .ab-prose p { margin-block-start: 14px; max-width: 74ch; }
    .ab-prose p:first-child { margin-block-start: 0; }

    /* ---------- timeline ----------
       A rail with a card hung off each date, and an icon on the
       rail where the dot used to be. Three lines of loose text
       under a heading read as a footnote; three cards read as a
       record, which is what they are. */
    .ab-time { list-style: none; display: grid; gap: 14px; position: relative;
               padding-inline-start: 56px; }
    .ab-time::before {
      content: ''; position: absolute; inset-block: 18px; inset-inline-start: 21px;
      width: 2px; border-radius: 2px;
      background: linear-gradient(180deg,
        color-mix(in srgb, var(--warm) 60%, transparent),
        color-mix(in srgb, var(--brand) 45%, transparent));
    }
    .ab-time li {
      position: relative; padding: 16px 20px; border-radius: 15px;
      background: var(--surface); border: 1px solid var(--border);
      transition: border-color 0.18s ease, transform 0.18s ease;
    }
    .ab-time li:hover {
      border-color: color-mix(in srgb, var(--warm) 34%, var(--border));
      transform: translateY(-2px);
    }
    .ab-time-ic {
      position: absolute; inset-inline-start: -56px; top: 14px;
      width: 44px; height: 44px; border-radius: 50%;
      display: grid; place-items: center; font-size: 1.15em; line-height: 1;
      background: var(--bg-1);
      border: 2px solid color-mix(in srgb, var(--warm) 45%, var(--border));
    }
    .ab-time .ab-date {
      display: block; font-size: 0.78em; font-weight: 800; letter-spacing: 0.02em;
      color: color-mix(in srgb, var(--warm) 55%, var(--text-dim));
    }
    .ab-time b { display: block; font-size: 1.04em; font-weight: 700; margin-block-start: 2px; }
    .ab-time span.ab-body { display: block; color: var(--text-dim); font-size: 0.92em; }

    @media (max-width: 560px) {
      .ab-time { padding-inline-start: 46px; }
      .ab-time::before { inset-inline-start: 17px; }
      .ab-time-ic { inset-inline-start: -46px; width: 36px; height: 36px; font-size: 1em; }
    }

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

    /* ---------- the accounts ----------
       Named links rather than bare icons, unlike the footer. The
       footer's row is chrome a reader skims; this one is content,
       and a page about a person should say "YouTube" rather than
       make them recognise a glyph. */
    .ab-socials { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
    .ab-social {
      display: flex; align-items: center; gap: 12px;
      padding: 14px 18px; border-radius: 15px; text-decoration: none;
      color: var(--text); background: var(--surface); border: 1px solid var(--border);
      font-weight: 700; font-size: 0.93em;
      transition: transform 0.18s ease, border-color 0.18s ease, color 0.18s ease;
    }
    .ab-social:hover {
      transform: translateY(-2px);
      color: color-mix(in srgb, var(--warm) 55%, var(--text));
      border-color: color-mix(in srgb, var(--warm) 38%, var(--border));
    }
    .ab-social svg { flex: none; }

    /* ---------- the ask ---------- */
    .ab-support {
      display: flex; align-items: flex-start; gap: 15px;
      padding: 20px 22px; border-radius: var(--radius);
      background: linear-gradient(135deg,
        color-mix(in srgb, var(--warm) 12%, var(--surface)),
        color-mix(in srgb, var(--brand) 10%, var(--surface)));
      border: 1px solid color-mix(in srgb, var(--warm) 26%, var(--border));
    }
    .ab-support-ic { font-size: 2em; line-height: 1.2; flex: none; }
    .ab-support p { font-size: 0.95em; }
    .ab-support-cta {
      display: inline-block; margin-block-start: 12px;
      padding: 10px 20px; border-radius: 13px; text-decoration: none;
      font-weight: 800; font-size: 0.9em; color: #fff;
      background: linear-gradient(135deg, var(--warm), color-mix(in srgb, var(--warm) 50%, #ffc46b));
      transition: transform 0.18s ease;
    }
    .ab-support-cta:hover { transform: translateY(-2px); }

    /* ---------- the sign-off ---------- */
    .ab-outro {
      text-align: center; margin-block-start: 8px; padding: 26px 20px;
      border-radius: var(--radius);
      background: var(--surface); border: 1px solid var(--border);
    }
    .ab-outro p { font-size: 1.04em; font-weight: 700; }

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
        <img src="${escapeHtml(CONFIG.AMIR_LOGO)}" alt="" width="104" height="104"
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


// Every narrative section on the page - the opening, the learning
// years, the YouTube story - is this one function with different
// words. They used to be questions with answers under them
// ("after six years, why is your resume so small?"), which is a
// page interrogating its own subject and then defending him. The
// facts did not change; only who is asking.
function renderProse(head, paragraphs) {
  return `
    <section class="ab-sec">
      <h2>${escapeHtml(head)}</h2>
      <div class="ab-prose">
        ${paragraphs.map(line => `<p>${escapeHtml(line)}</p>`).join('')}
      </div>
    </section>`
}


function renderProof(p) {
  const items = p.proof.map(entry => `
    <li>
      <span class="ab-time-ic" aria-hidden="true">${entry.icon}</span>
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


// ==========================================
// Where to find him, and the one thing the page asks for.
//
// An earlier version of this page ended on a single line and
// deliberately had no links at all: everything was already in the
// footer, and a page that has just spent two thousand words being
// a person should not close by asking for something.
//
// That reasoning was right about the closing line and wrong about
// the accounts. `sameAs` in the structured data claims that a
// GitHub profile, a YouTube channel, an Instagram account and an X
// account are all this person - and this is the one page on the
// site that is ABOUT that person, so it is the page where the claim
// belongs in words a reader can also check. The links carry
// `rel="me"`, which is the same claim in the form a machine reads.
//
// The donation link sits under them, phrased as an offer rather
// than a request, and it is one line followed by a link. The outro
// still closes the page on its own.
// ==========================================
function renderFind(p, code) {
  const accounts = socialLinks()
  if (!accounts.length) return ''

  return `
    <section class="ab-sec">
      <h2>${escapeHtml(p.findHead)}</h2>
      <p class="ab-lede">${escapeHtml(p.findLede)}</p>
      <div class="ab-socials">
        ${accounts.map(entry => `
          <a class="ab-social" href="${escapeHtml(entry.href)}" rel="me noopener" target="_blank">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
              <path d="${entry.path}"/>
            </svg>
            <span>${escapeHtml(entry.label)}</span>
          </a>`).join('')}
      </div>
    </section>`
}


function renderSupport(p, code) {
  return `
    <section class="ab-sec">
      <h2>${escapeHtml(p.supportHead)}</h2>
      <div class="ab-support">
        <span class="ab-support-ic" aria-hidden="true">🫙</span>
        <div>
          <p>${escapeHtml(p.supportBody)}</p>
          <a class="ab-support-cta" href="${escapeHtml(localizedPath('/donate', code))}">
            ${escapeHtml(p.supportCta)} &rarr;
          </a>
        </div>
      </div>
    </section>`
}


// One line, and nothing under it.
function renderOutro(p) {
  return `
    <section class="ab-outro">
      <p>${escapeHtml(p.outro)}</p>
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
    breadcrumbLd(trail, resolved),
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

    // This page emits its own page-level node - a ProfilePage,
    // tied to the Person - so seoHead does not add a WebPage
    // beside it. Two page-level nodes for one document is a
    // crawler being asked which of them the page actually is.
    webPage: false,

    // The one page whose subject is the NAME. Every form of it -
    // the spaced one, the Persian one, the Japanese one - is
    // answered in prose in the questions below and declared in the
    // Person and Organization nodes above, and this is the tag
    // that says the page is about that in the first place.
    keywords: keywordList(
      (CONFIG.BRAND && CONFIG.BRAND.ALIASES) || [],
      p.keywords || []
    ),
    graph
  })}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap"></noscript>
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
      ${renderProse(p.storyHead, p.story)}
      ${renderProse(p.learningHead, p.learning)}
      ${renderProof(p)}
      ${renderProse(p.youtubeHead, p.youtube)}
      ${renderQuestions(p.askHead, '', p.ask)}
      ${renderFacts(p)}
      ${renderFind(p, resolved)}
      ${renderSupport(p, resolved)}
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
