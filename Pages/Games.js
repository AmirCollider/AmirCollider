// ==========================================
// Pages/Games.js
// The games catalogue: every game on this site, one card each.
//
// Public entry (wired in Worker.js ROUTES):
//   GET /games
//
// ------------------------------------------------------------
// WHY THIS PAGE EXISTS
// ------------------------------------------------------------
// Because /tools did, and nothing answered to it.
//
// The Unity extensions had a catalogue page of their own, two
// product pages under it and a shelf linking them together. The
// games had a section on the dashboard reachable at "/#games" -
// an anchor, not an address. An anchor cannot be submitted to a
// sitemap, cannot be linked to as a subject, cannot rank, and to
// anything reading this domain to work out what its author does,
// simply is not there.
//
// The result was exactly what you would predict, and it is what
// prompted this file: search engines - and the assistants built
// on them - reported that AmirCollider makes Unity tools and has
// never released a game. That is not a ranking problem to be
// tuned. It is the site having six pages about tools, zero about
// games, and being read accurately.
//
// So: one address whose entire subject is the games, listed from
// the same registry every other page renders from. A game added
// to GAME_REGISTRY appears here on the next deploy.
//
// Trilingual and theme-aware like the rest of the site.
// ==========================================

import { CONFIG, GAME_STATUS } from '../Config.js'
import { getPageHead } from '../Core/DesignSystem.js'
import { createHtmlResponse } from '../Core/Http.js'
import { resolveGames, isDownloadable, gamePlatforms } from '../Games/Registry.js'

import { escapeHtml, safeColor } from '../Core/Html.js'
import { themeBootScript } from '../Core/PageChrome.js'
import { seoHead, breadcrumbLd, videoGameLd, itemListLd, keywordList } from '../Core/Seo.js'
import { localizedPath } from '../Core/Locale.js'
import {
  siteNavCss, siteHeader, siteBreadcrumb, siteFooter, siteBackToTop, siteChromeScript, NAV_I18N
} from '../Core/SiteNav.js'
import { langCookieHeader, parseCookies, resolveLang, resolveRequestLang, resolveRequestTheme } from '../Core/RequestContext.js'


// ==========================================
// i18n - page chrome only. Everything about a specific game
// comes from the registry and its database overrides.
// ==========================================
const I18N = {
  fa: {
    dir: 'rtl',
    title: 'بازی‌ها',
    metaTitle: 'بازی‌های AmirCollider — بازی‌های اندروید مستقل',
    lede: 'بازی‌هایی که AmirCollider می‌سازد و منتشر می‌کند. هرکدام صفحه‌ی خودش، فروشگاه خودش و جدول امتیازات خودش را دارد.',
    metaDesc: 'فهرست کامل بازی‌هایی که AmirCollider ساخته و منتشر کرده است — از جمله Neon Katana، بازی اکشن اندرویدی با کاتانا.',

    // What this page answers, in the words a person types. Merged
    // with the brand's own terms inside seoHead(), and with every
    // game's name in every script it is written in.
    keywords: ['بازی‌های AmirCollider', 'بازی اندروید رایگان', 'بازی اکشن اندروید', 'بازی ایرانی اندروید', 'دانلود بازی اندروید'],
    countLabel: 'بازی',
    open: 'صفحه‌ی بازی',
    statusLive: 'منتشر شده',
    statusSoon: 'به‌زودی',
    statusMaintenance: 'در حال تعمیر',
    capOffline: 'بدون نیاز به اینترنت',
    capLogin: 'ورود با گوگل',
    capCloud: 'ذخیره‌ی ابری',
    capBoard: 'جدول امتیازات',
    capStore: 'فروشگاه درون‌بازی',
    empty: 'هنوز بازی‌ای منتشر نشده است.',
    toolsHead: 'دنبال ابزارها می‌گردی؟',
    toolsBody: 'افزونه‌های یونیتی جای دیگری‌اند.',
    toolsCta: 'رفتن به ابزارها'
  },
  en: {
    dir: 'ltr',
    title: 'Games',
    metaTitle: 'AmirCollider Games — Android games by an indie developer',
    lede: 'The games AmirCollider builds and publishes. Each one has its own page, its own storefront and its own leaderboard.',
    metaDesc: 'Every game AmirCollider has built and published — including Neon Katana, an Android action game fought with a katana.',
    keywords: ['AmirCollider games', 'free Android games', 'indie Android action game', 'katana game', 'download Android game'],
    countLabel: 'games',
    open: 'Game page',
    statusLive: 'Released',
    statusSoon: 'Coming soon',
    statusMaintenance: 'Under maintenance',
    capOffline: 'Plays offline',
    capLogin: 'Google sign-in',
    capCloud: 'Cloud save',
    capBoard: 'Leaderboard',
    capStore: 'In-game store',
    empty: 'No game has been published yet.',
    toolsHead: 'Looking for the tools?',
    toolsBody: 'The Unity extensions live somewhere else.',
    toolsCta: 'Go to Tools'
  },
  ja: {
    dir: 'ltr',
    title: 'ゲーム',
    metaTitle: 'AmirCollider のゲーム — Android 向けインディーゲーム',
    lede: 'AmirCollider が開発・公開しているゲームです。それぞれに専用ページ、ストア、ランキングがあります。',
    metaDesc: 'AmirCollider が制作・公開したゲームの一覧。カタナで戦う Android アクションゲーム Neon Katana を含みます。',
    keywords: ['AmirCollider ゲーム', '無料 Android ゲーム', 'インディー アクションゲーム', 'カタナ ゲーム', 'Android ゲーム ダウンロード'],
    countLabel: 'タイトル',
    open: 'ゲームページ',
    statusLive: '公開中',
    statusSoon: '近日公開',
    statusMaintenance: 'メンテナンス中',
    capOffline: 'オフライン対応',
    capLogin: 'Google サインイン',
    capCloud: 'クラウドセーブ',
    capBoard: 'ランキング',
    capStore: 'ゲーム内ストア',
    empty: 'まだ公開されたゲームはありません。',
    toolsHead: 'ツールをお探しですか?',
    toolsBody: 'Unity 拡張は別のページにあります。',
    toolsCta: 'ツールへ'
  }
}

function pack(lang) {
  return I18N[resolveLang(lang)]
}


function pickLang(map, lang) {
  if (!map) return ''
  return map[lang] || map.en || map.fa || map.ja || ''
}


// ==========================================
// Stylesheet
// The same tokens /tools uses, so the two catalogues read as one
// pair rather than as two pages that happen to list things.
// ==========================================
function gamesCss() {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }

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
        --bg-1: #f4f6fb; --bg-2: #e7ecf7;
        --surface: rgba(255,255,255,0.70); --surface-2: #ffffff;
        --border: rgba(20,22,33,0.10);
        --text: rgba(22,24,33,0.92); --text-dim: rgba(22,24,33,0.56);
        color-scheme: light;
      }
    }
    :root[data-theme="light"] {
      --bg-1: #f4f6fb; --bg-2: #e7ecf7;
      --surface: rgba(255,255,255,0.70); --surface-2: #ffffff;
      --border: rgba(20,22,33,0.10);
      --text: rgba(22,24,33,0.92); --text-dim: rgba(22,24,33,0.56);
      color-scheme: light;
    }
    :root[data-theme="dark"] {
      --bg-1: #0b0e16; --bg-2: #141a2e;
      --surface: rgba(255,255,255,0.045); --surface-2: rgba(255,255,255,0.08);
      --border: rgba(255,255,255,0.10);
      --text: rgba(255,255,255,0.92); --text-dim: rgba(255,255,255,0.58);
      color-scheme: dark;
    }

    body {
      font-family: 'Vazirmatn', system-ui, -apple-system, 'Segoe UI', Roboto,
                   'Noto Sans JP', 'Hiragino Sans', Meiryo, sans-serif;
      background: radial-gradient(1100px 600px at 50% -10%, var(--bg-2), var(--bg-1));
      background-attachment: fixed;
      color: var(--text); min-height: 100vh; line-height: 1.75;
      padding-inline: 20px; -webkit-font-smoothing: antialiased;
    }
    .wrap { max-width: var(--maxw); margin-inline: auto; padding-block-end: 60px; }
    .ac-nav { margin-inline: -20px; padding-inline: 20px; margin-block-end: 24px; }
    bdi, [dir="ltr"], [dir="auto"] { unicode-bidi: isolate; }

    .hero { text-align: center; margin-block-end: 32px; }
    .hero h1 { font-size: clamp(1.9em, 5vw, 2.7em); font-weight: 800; letter-spacing: -0.02em; }
    .hero p { color: var(--text-dim); max-width: 62ch; margin-inline: auto; margin-block-start: 10px; }

    .games { display: grid; gap: 20px; }

    /* Each card themes from its game's own accent, set inline as
       one custom property - the same trick /tools uses per tool. */
    .game {
      display: block; text-decoration: none; color: var(--text);
      border-radius: var(--radius); overflow: hidden; background: var(--surface);
      border: 1px solid color-mix(in srgb, var(--gc) 28%, var(--border));
      transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
    }
    .game:hover {
      transform: translateY(-4px); background: var(--surface-2);
      border-color: color-mix(in srgb, var(--gc) 55%, var(--border));
    }
    .game-stripe { height: 4px; background: linear-gradient(90deg, var(--gc), transparent); }
    .game-body { padding: 22px; display: flex; gap: 18px; flex-wrap: wrap; }

    .game-logo {
      position: relative; width: 84px; height: 84px; border-radius: 20px; flex: none;
      display: grid; place-items: center; font-size: 2.1em; overflow: hidden;
      background: #fff; color: #1a1c24;
      border: 2px solid color-mix(in srgb, var(--gc) 50%, transparent);
    }
    .game-logo img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }

    /* Every line of a card is a <span> - a card is one <a>, and the
       parts of it are not links of their own - so each one has to
       be told to be a line. Left inline they run together into a
       single paragraph of name, platform and pitch. */
    .game-main { flex: 1 1 260px; min-width: 0; }
    .game-main > span { display: block; }
    .game-name { font-size: 1.3em; font-weight: 800; line-height: 1.3; }
    .game-kind { font-size: 0.82em; color: var(--text-dim); font-weight: 600; }
    .game-tag {
      color: color-mix(in srgb, var(--gc) 50%, var(--text));
      font-weight: 600; margin-block-start: 6px; line-height: 1.6;
    }
    .game-desc { color: var(--text-dim); font-size: 0.93em; margin-block-start: 6px; }

    /* More specific than the "> span" rule above, which would
       otherwise make this a block and stack the chips vertically. */
    .game-main > span.game-chips {
      display: flex; flex-wrap: wrap; gap: 7px; margin-block-start: 14px;
    }
    .chip {
      font-size: 0.76em; font-weight: 700; padding: 3px 11px; border-radius: 999px;
      color: var(--text-dim); background: var(--surface-2); border: 1px solid var(--border);
    }
    .chip.is-live {
      color: #4caf50; background: rgba(76,175,80,0.13); border-color: rgba(76,175,80,0.38);
    }
    .chip.is-warn {
      color: #ff9800; background: rgba(255,152,0,0.13); border-color: rgba(255,152,0,0.38);
    }

    .game-cta {
      display: block; margin-block-start: 14px; font-weight: 700; font-size: 0.92em;
      color: color-mix(in srgb, var(--gc) 58%, var(--text));
    }

    .aside {
      margin-block-start: 26px; padding: 20px 22px; border-radius: var(--radius);
      background: var(--surface); border: 1px solid var(--border);
      display: flex; align-items: center; justify-content: space-between;
      gap: 14px; flex-wrap: wrap;
    }
    .aside b { display: block; font-size: 1.02em; }
    .aside span { color: var(--text-dim); font-size: 0.9em; }
    .aside a {
      padding: 10px 18px; border-radius: 12px; text-decoration: none; font-weight: 700;
      font-size: 0.9em; color: #fff;
      background: linear-gradient(135deg, var(--brand), color-mix(in srgb, var(--brand) 55%, #fff));
    }

    .empty {
      padding: 30px; border-radius: var(--radius); text-align: center; color: var(--text-dim);
      background: var(--surface); border: 1px solid var(--border);
    }

    @media (max-width: 560px) { .game-body { padding: 18px; gap: 14px; } }

    @media (prefers-reduced-motion: no-preference) {
      .hero, .games { animation: gRise 0.5s cubic-bezier(0.16,1,0.3,1) both; }
      .games { animation-delay: 0.08s; }
    }
    @keyframes gRise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
  `
}


// ==========================================
// One card
//
// Everything on it is a fact the registry already holds, so a
// card cannot claim a capability the game does not have: the
// chips are the same flags that decide whether the store and the
// leaderboard pages exist at all.
// ==========================================
function gameCard(game, lang) {
  const p = pack(lang)
  const accent = safeColor(game.color, '#6c63ff')
  const platform = gamePlatforms(game)
  const kind = platform.kind === 'web' ? 'Web' : platform.kind === 'both' ? 'Android · Web' : 'Android'

  const tagline = pickLang(game.landing && game.landing.tagline, lang)
  const description = pickLang(game.i18n && game.i18n.description, lang) || game.description || ''

  const chips = []
  if (game.status === GAME_STATUS.SOON) {
    chips.push(`<span class="chip is-warn">${escapeHtml(p.statusSoon)}</span>`)
  } else if (game.status === GAME_STATUS.MAINTENANCE) {
    chips.push(`<span class="chip is-warn">${escapeHtml(p.statusMaintenance)}</span>`)
  } else if (isDownloadable(game)) {
    chips.push(`<span class="chip is-live">${escapeHtml(p.statusLive)}</span>`)
  }

  if (!game.capabilities.onlinePlay) chips.push(`<span class="chip">${escapeHtml(p.capOffline)}</span>`)
  if (game.capabilities.login) chips.push(`<span class="chip">${escapeHtml(p.capLogin)}</span>`)
  if (game.capabilities.cloudSave) chips.push(`<span class="chip">${escapeHtml(p.capCloud)}</span>`)
  if (game.capabilities.leaderboard) chips.push(`<span class="chip">${escapeHtml(p.capBoard)}</span>`)
  if (game.capabilities.store) chips.push(`<span class="chip">${escapeHtml(p.capStore)}</span>`)

  return `
    <a class="game" href="${escapeHtml(localizedPath('/' + game.id, lang))}" style="--gc: ${accent}">
      <span class="game-stripe"></span>
      <span class="game-body">
        <span class="game-logo">${escapeHtml(game.icon || '🎮')}${game.logo
          ? `<img src="${escapeHtml(game.logo)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}</span>
        <span class="game-main">
          <span class="game-name">${escapeHtml(game.name)}</span>
          <span class="game-kind" dir="ltr">${escapeHtml(kind)}</span>
          ${tagline ? `<span class="game-tag" dir="auto">${escapeHtml(tagline)}</span>` : ''}
          ${description && description !== tagline
            ? `<span class="game-desc" dir="auto">${escapeHtml(description)}</span>` : ''}
          <span class="game-chips">${chips.join('')}</span>
          <span class="game-cta">${escapeHtml(p.open)} &rarr;</span>
        </span>
      </span>
    </a>`
}


// ==========================================
// Page
// ==========================================
function createGamesPage(games, lang, theme) {
  const resolved = resolveLang(lang)
  const p = pack(resolved)
  const site = NAV_I18N[resolved]
  const themeAttr = theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : ''

  const trail = [
    { href: '/', label: site.home },
    { href: '/games', label: p.title }
  ]

  // One VideoGame node per game plus the list itself, which is the
  // same shape /tools emits for its tools. A crawler reading this
  // page knows it is a catalogue, how many entries it has, and
  // that every entry is a game.
  const describe = game => pickLang(game.landing && game.landing.tagline, resolved)
    || pickLang(game.i18n && game.i18n.description, resolved)
    || game.description

  const graph = [
    breadcrumbLd(trail, resolved),

    // The list entries carry a sentence and a picture now, not
    // just a name and a URL. A catalogue whose ListItems are bare
    // names is a catalogue a search engine has to open every entry
    // of to learn anything, and it will not.
    itemListLd({
      name: p.metaTitle,
      lang: resolved,
      items: games.map(game => ({
        name: game.name,
        url: '/' + game.id,
        description: describe(game),
        image: game.logo
      }))
    }),

    ...games.map(game => videoGameLd({
      id: game.id,
      name: game.name,

      // The same alternate names the game's own page declares.
      // Both pages describe one game, so both have to be
      // findable by the name a Persian or Japanese reader types -
      // and this is the page that lists ALL of them.
      alternateName: game.altNames || [],
      description: describe(game),
      path: '/' + game.id,
      image: game.logo,
      downloadUrl: game.myketUrl,
      sameAs: game.myketUrl ? [game.myketUrl] : [],
      identifier: game.package || '',
      lang: resolved,
      genres: (game.tags || []).map(tag => tag[resolved] || tag.en).filter(Boolean),
      keywords: keywordList(game.name, game.altNames || [],
        (game.tags || []).map(tag => tag[resolved] || tag.en))
    }))
  ]

  // What this page answers: every game's name in every script it
  // is written in, plus the words somebody uses when they are
  // looking for a catalogue rather than a specific title.
  const keywords = keywordList(
    p.keywords || [],
    games.flatMap(game => [game.name, ...(game.altNames || [])])
  )

  const cards = games.length
    ? `<div class="games">${games.map(game => gameCard(game, resolved)).join('')}</div>`
    : `<div class="empty">${escapeHtml(p.empty)}</div>`

  return `<!DOCTYPE html>
<html dir="${p.dir}" lang="${resolved}"${themeAttr}>
<head>
  ${getPageHead({ title: p.metaTitle, amirLogo: CONFIG.AMIR_LOGO, description: p.metaDesc })}
  ${seoHead({
    path: '/games',
    title: p.metaTitle,
    description: p.metaDesc,
    lang: resolved,
    // A CollectionPage rather than a WebPage: this page's subject
    // is the set, and saying so is what turns "a page that
    // mentions two games" into "the list of this studio's games".
    pageType: 'CollectionPage',
    keywords,
    graph
  })}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap"></noscript>
  ${themeBootScript()}
  <style>${siteNavCss()}${gamesCss()}</style>
</head>
<body>
  ${siteHeader({ lang: resolved, active: 'games' })}
  <div class="wrap">
    ${siteBreadcrumb({ lang: resolved, trail })}
    <main id="main">
      <div class="hero">
        <h1>${escapeHtml(p.title)}</h1>
        <p>${escapeHtml(p.lede)}</p>
        <p><b>${escapeHtml(String(games.length))}</b> ${escapeHtml(p.countLabel)}</p>
      </div>
      ${cards}
      <div class="aside">
        <span>
          <b>${escapeHtml(p.toolsHead)}</b>
          <span>${escapeHtml(p.toolsBody)}</span>
        </span>
        <a href="${escapeHtml(localizedPath('/tools', resolved))}">${escapeHtml(p.toolsCta)}</a>
      </div>
    </main>
    ${siteFooter({ lang: resolved, games })}
  </div>
  ${siteBackToTop({ lang: resolved })}
  ${siteChromeScript()}
</body>
</html>`
}


// ==========================================
// Handler
// ==========================================
export async function handleGamesIndex(url, request, gameId, requestId, GAMES, env) {
  const cookies = parseCookies(request)
  const lang = resolveRequestLang(url, request, cookies)
  const theme = resolveRequestTheme(cookies)

  const merged = await resolveGames(env, GAMES)
  const games = Object.values(merged)

  return createHtmlResponse(createGamesPage(games, lang, theme), 200, langCookieHeader(url, lang))
}
