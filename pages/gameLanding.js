// ==========================================
// pages/gameLanding.js
// A game's own front page, and its version history.
//
// Public entry points (wired in worker.js ROUTES):
//   GET /:gameId            the landing page
//   GET /:gameId/versions   what shipped, and when
//
// ------------------------------------------------------------
// WHY THESE EXIST
// ------------------------------------------------------------
// Until now a game had a store, a leaderboard, an account page
// and a policy page - four pages for somebody who has already
// decided - and nothing at all for somebody who has not. The
// only pitch a game got was three lines on a dashboard card.
//
// So /{game} is the page you would send a stranger: the logo,
// the pitch, the trailers, which devices it runs on, and the
// buttons to actually get it. And /{game}/versions is the page
// an existing player opens when the game asks them to update -
// what is current, when it shipped, what changed.
//
// Both are built from the merged registry, so everything on them
// is editable in the TheGod panel without a deploy. A game with
// no landing row still gets a complete page; it is simply the
// short version, built from what the card already knew.
//
// Both use the shared chrome in gameChrome.js, so a visitor
// moving between the landing page, the store and the account
// page is moving around one site rather than through three.
// ==========================================

import { CONFIG } from '../config.js'
import { createHtmlResponse, createJsonResponse, logInfo } from '../utils.js'
import {
  resolveGame, isDownloadable, downloadUrl, effectiveProducts, landingVideo
} from '../games/registry.js'
import { db, listVersions } from '../games/store.js'
import {
  esc, chromeLang, chromeTheme, langHeader, page, localeFor, safeColor
} from './gameChrome.js'


// ==========================================
// Which devices a game runs on
//
// `kind` picks the glyph and `label` is whatever the operator
// typed, because "Android 8+" and "Android 8 یا بالاتر" are the
// same fact in two languages and neither belongs in code.
//
// An unknown kind renders the generic glyph rather than nothing,
// so a device nobody anticipated still shows up on the page.
// ==========================================
const DEVICE_ICONS = {
  android: '<rect x="6" y="3" width="12" height="18" rx="2"/><line x1="10" y1="18.5" x2="14" y2="18.5"/>',
  ios: '<rect x="6" y="3" width="12" height="18" rx="2"/><line x1="10" y1="18.5" x2="14" y2="18.5"/>',
  windows: '<rect x="3" y="5" width="18" height="12" rx="1"/><line x1="8" y1="20" x2="16" y2="20"/>',
  web: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18"/>',
  vr: '<rect x="2" y="8" width="20" height="8" rx="3"/><path d="M9 16l1.5 2h3L15 16"/>',
  generic: '<rect x="4" y="4" width="16" height="16" rx="3"/>'
}

function deviceIcon(kind) {
  const path = DEVICE_ICONS[String(kind || '').toLowerCase()] || DEVICE_ICONS.generic
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`
}


const I18N = {
  fa: {
    play: 'بازی کن',
    get: 'دریافت بازی',
    about: 'درباره‌ی بازی',
    videos: 'ویدیوها',
    devices: 'روی چه دستگاه‌هایی اجرا می‌شود',
    versions: 'نسخه‌ها',
    versionsLink: 'تاریخچه‌ی نسخه‌ها',
    current: 'نسخه‌ی فعلی',
    released: 'تاریخ انتشار',
    changes: 'تغییرات این نسخه',
    noVersions: 'هنوز نسخه‌ای ثبت نشده است.',
    noVersionsHint: 'وقتی نسخه‌ای منتشر شود، این‌جا با تاریخ و فهرست تغییراتش نمایش داده می‌شود.',
    watch: 'تماشای ویدیو',
    store: 'فروشگاه',
    board: 'جدول امتیازات',
    account: 'حساب من',
    products: 'چه چیزهایی می‌شود خرید',
    soon: 'این بازی هنوز منتشر نشده است.',
    withdrawn: 'دانلود این بازی موقتاً برداشته شده است.',
    backToGame: 'بازگشت به صفحه‌ی بازی',
    latest: 'آخرین نسخه'
  },
  en: {
    play: 'Play',
    get: 'Get the game',
    about: 'About',
    videos: 'Videos',
    devices: 'Runs on',
    versions: 'Versions',
    versionsLink: 'Version history',
    current: 'Current version',
    released: 'Released',
    changes: 'What changed',
    noVersions: 'No version has been published yet.',
    noVersionsHint: 'Once a release is recorded it appears here with its date and its list of changes.',
    watch: 'Watch',
    store: 'Store',
    board: 'Leaderboard',
    account: 'My account',
    products: 'What you can buy',
    soon: 'This game is not out yet.',
    withdrawn: 'The download for this game has been withdrawn for now.',
    backToGame: 'Back to the game page',
    latest: 'Latest'
  },
  ja: {
    play: 'プレイ',
    get: 'ゲームを入手',
    about: 'ゲームについて',
    videos: '動画',
    devices: '対応デバイス',
    versions: 'バージョン',
    versionsLink: 'バージョン履歴',
    current: '現在のバージョン',
    released: 'リリース日',
    changes: '変更点',
    noVersions: 'まだバージョンが登録されていません。',
    noVersionsHint: 'リリースが記録されると、日付と変更点の一覧がここに表示されます。',
    watch: '再生',
    store: 'ストア',
    board: 'ランキング',
    account: 'アカウント',
    products: '購入できるもの',
    soon: 'このゲームはまだ公開されていません。',
    withdrawn: 'このゲームのダウンロードは現在停止しています。',
    backToGame: 'ゲームページに戻る',
    latest: '最新'
  }
}

function dict(lang) {
  return I18N[lang] || I18N.fa
}


// The first path segment. Shared by both handlers because both
// are mounted directly under the game id.
function gameIdFrom(url) {
  return url.pathname.split('/').filter(Boolean)[0] || ''
}


function localDate(ms, lang) {
  const value = Number(ms)
  if (!value) return ''
  try {
    return new Intl.DateTimeFormat(localeFor(lang), { dateStyle: 'medium' }).format(new Date(value))
  } catch {
    return new Date(value).toISOString().slice(0, 10)
  }
}


// Release notes are stored one item per line. Rendered as a list
// rather than a paragraph, and escaped: this is operator input
// going onto a public page.
function notesList(raw) {
  const items = String(raw || '')
    .split('\n')
    .map(line => line.replace(/^[-*•\s]+/, '').trim())
    .filter(Boolean)

  if (!items.length) return ''
  return `<ul class="ln-notes">${items.map(item => `<li>${esc(item)}</li>`).join('')}</ul>`
}


function pickLang(map, lang) {
  if (!map) return ''
  return map[lang] || map.en || map.fa || map.ja || ''
}


// ==========================================
// landingCss
// Everything specific to these two pages.
//
// The shared chrome supplies the shell, the tokens, the top bar
// and the footer. This is only what a landing page needs on top
// of it, which is why it is short.
// ==========================================
function landingCss() {
  return `
    .ln-hero{position:relative;overflow:hidden;border-radius:var(--radius);
      border:1px solid var(--border);background:var(--surface);margin-block-end:20px}
    .ln-hero-art{position:absolute;inset:0;background-size:cover;background-position:center;
      opacity:.32;filter:saturate(1.1)}
    .ln-hero::after{content:'';position:absolute;inset:0;
      background:linear-gradient(180deg,transparent,color-mix(in srgb,var(--bg-1) 92%,transparent))}
    .ln-hero-in{position:relative;z-index:1;display:flex;align-items:center;gap:20px;
      flex-wrap:wrap;padding:34px 26px}
    .ln-logo{position:relative;width:104px;height:104px;border-radius:26px;flex-shrink:0;
      display:flex;align-items:center;justify-content:center;font-size:2.6em;
      background:#fff;color:#1a1c24;overflow:hidden;
      border:2px solid color-mix(in srgb,var(--accent) 55%,transparent)}
    .ln-logo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
    .ln-head{flex:1;min-width:220px}
    .ln-title{font-size:1.9em;font-weight:800;line-height:1.15;margin-block-end:8px}
    .ln-tag{color:var(--dim);font-size:.98em;line-height:1.7;max-width:56ch}
    .ln-badges{display:flex;flex-wrap:wrap;gap:8px;margin-block-start:14px}

    .ln-cta{display:flex;flex-wrap:wrap;gap:10px;margin-block-start:18px}

    .ln-sec{margin-block-end:20px}
    .ln-about{white-space:pre-wrap;line-height:1.9;color:var(--dim);font-size:.95em}

    .ln-videos{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}
    .ln-video{position:relative;padding-block-end:56.25%;border-radius:14px;overflow:hidden;
      border:1px solid var(--border);background:#000}
    .ln-video iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
    .ln-video-link{display:flex;align-items:center;gap:10px;padding:14px 16px;border-radius:14px;
      text-decoration:none;color:var(--text);background:var(--surface);border:1px solid var(--border)}

    .ln-devices{display:flex;flex-wrap:wrap;gap:10px}
    .ln-device{display:inline-flex;align-items:center;gap:9px;padding:10px 15px;border-radius:13px;
      font-size:.87em;font-weight:600;background:var(--surface);border:1px solid var(--border)}
    .ln-device svg{width:19px;height:19px;color:color-mix(in srgb,var(--accent) 60%,var(--text))}

    .ln-prods{display:flex;flex-wrap:wrap;gap:8px}
    .ln-prod{display:inline-flex;align-items:center;gap:7px;padding:8px 13px;border-radius:11px;
      font-size:.84em;background:var(--surface);border:1px solid var(--border)}
    .ln-prod b{font-weight:700}
    .ln-prod span{color:var(--dim)}

    /* ---------- versions ---------- */
    .ln-rel{padding:20px;border-radius:var(--radius);background:var(--surface);
      border:1px solid var(--border);margin-block-end:14px}
    .ln-rel-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-block-end:10px}
    .ln-rel-v{font-size:1.15em;font-weight:800;direction:ltr}
    .ln-rel-date{color:var(--dim);font-size:.84em}
    .ln-notes{margin-block-start:8px;padding-inline-start:20px;line-height:1.9;
      color:var(--dim);font-size:.92em}
    .ln-notes li{margin-block-end:4px}

    @media (max-width:640px){
      .ln-hero-in{padding:24px 18px;gap:16px}
      .ln-logo{width:76px;height:76px;border-radius:20px;font-size:1.9em}
      .ln-title{font-size:1.45em}
      .ln-cta .gbtn{flex:1 1 100%}
    }
  `
}


function heroBlock(game, lang, t, currentVersion) {
  const d = dict(lang)
  const hero = game.landing.hero
  const badges = []

  if (currentVersion) {
    badges.push(`<span class="gchip is-ok">${esc(d.latest)} v${esc(currentVersion.version)}</span>`)
  }
  if (game.status === 'soon') badges.push(`<span class="gchip is-warn">${esc(d.soon)}</span>`)
  else if (!isDownloadable(game)) badges.push(`<span class="gchip is-warn">${esc(d.withdrawn)}</span>`)

  for (const tag of game.tags || []) {
    const label = pickLang(tag, lang)
    if (label) badges.push(`<span class="gchip is-dim">${esc(label)}</span>`)
  }

  const cta = []
  if (isDownloadable(game)) {
    cta.push(`<a class="gbtn" href="/${esc(game.id)}/download">${esc(d.get)}</a>`)
  }
  if (game.capabilities.store) {
    cta.push(`<a class="gbtn gbtn--ghost" href="/${esc(game.id)}/store">${esc(d.store)}</a>`)
  }
  if (game.capabilities.leaderboard) {
    cta.push(`<a class="gbtn gbtn--ghost" href="/${esc(game.id)}/leaderboard">${esc(d.board)}</a>`)
  }
  cta.push(`<a class="gbtn gbtn--ghost" href="/${esc(game.id)}/versions">${esc(d.versionsLink)}</a>`)

  return `
    <section class="ln-hero">
      ${hero ? `<div class="ln-hero-art" style="background-image:url('${esc(hero)}')"></div>` : ''}
      <div class="ln-hero-in">
        <span class="ln-logo">${esc(game.icon || '🎮')}${game.logo
          ? `<img src="${esc(game.logo)}" alt="" onerror="this.style.display='none'">` : ''}</span>
        <div class="ln-head">
          <h1 class="ln-title">${esc(game.name)}</h1>
          <p class="ln-tag">${esc(pickLang(game.i18n && game.i18n.description, lang) || game.description || '')}</p>
          ${badges.length ? `<div class="ln-badges">${badges.join('')}</div>` : ''}
        </div>
      </div>
      <div class="ln-hero-in" style="padding-block-start:0">
        <div class="ln-cta">${cta.join('')}</div>
      </div>
    </section>`
}


function videosBlock(game, lang) {
  const d = dict(lang)
  const videos = (game.landing.videos || []).slice(0, 8)
  if (!videos.length) return ''

  const items = videos.map(entry => {
    const url = typeof entry === 'string' ? entry : (entry && entry.url)
    const title = (entry && entry.title) || d.watch
    const parsed = landingVideo(url)

    // Only a URL this side BUILT goes into an iframe src. An
    // unrecognised host is rendered as a link, deliberately: an
    // iframe pointed at operator input is arbitrary third-party
    // script inside our frame.
    if (parsed) {
      return `<div class="ln-video"><iframe src="${esc(parsed.embed)}" title="${esc(title)}"
        loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`
    }
    if (!url) return ''
    return `<a class="ln-video-link" href="${esc(url)}" target="_blank" rel="noopener nofollow">
      ▶ <span>${esc(title)}</span></a>`
  }).filter(Boolean).join('')

  if (!items) return ''
  return `<section class="gcard ln-sec">
      <h2 class="ghead">${esc(d.videos)}</h2>
      <div class="ln-videos">${items}</div>
    </section>`
}


function devicesBlock(game, lang) {
  const d = dict(lang)
  const devices = (game.landing.devices || []).slice(0, 12)
  if (!devices.length) return ''

  const items = devices.map(entry => {
    const kind = (entry && entry.kind) || 'generic'
    const label = (entry && entry.label) || kind
    return `<span class="ln-device">${deviceIcon(kind)}<span>${esc(label)}</span></span>`
  }).join('')

  return `<section class="gcard ln-sec">
      <h2 class="ghead">${esc(d.devices)}</h2>
      <div class="ln-devices">${items}</div>
    </section>`
}


function aboutBlock(game, lang) {
  const d = dict(lang)
  const about = game.landing.about[lang] || game.landing.about.en || game.landing.about.fa
  if (!about) return ''

  return `<section class="gcard ln-sec">
      <h2 class="ghead">${esc(d.about)}</h2>
      <div class="ln-about">${esc(about)}</div>
    </section>`
}


function productsBlock(game, lang) {
  const d = dict(lang)
  if (!game.capabilities.store) return ''

  const products = effectiveProducts(game).slice(0, 8)
  if (!products.length) return ''

  const items = products.map(product => {
    const name = pickLang(product.i18n && product.i18n.name, lang) || product.id
    return `<span class="ln-prod">${esc(product.icon || '')}<b>${esc(name)}</b>
      <span>$${esc(product.priceUsd)}</span></span>`
  }).join('')

  return `<section class="gcard ln-sec">
      <h2 class="ghead">${esc(d.products)}</h2>
      <div class="ln-prods">${items}</div>
      <div style="margin-block-start:14px">
        <a class="gbtn" href="/${esc(game.id)}/store">${esc(d.store)}</a>
      </div>
    </section>`
}


// ==========================================
// handleGameLanding
// GET /:gameId
// ==========================================
export async function handleGameLanding(url, request, gameId, requestId, GAMES, env) {
  const id = gameIdFrom(url)
  const game = await resolveGame(env, GAMES, id)
  if (!game) {
    return createJsonResponse({ ok: false, error: 'unknown_game', requestId }, 404)
  }

  const lang = chromeLang(url, request)
  const theme = chromeTheme(request)
  const d = dict(lang)

  const database = db(env)
  const versions = database ? await listVersions(database, game.id, 1) : []
  const current = versions[0] || null

  logInfo('Game landing page', { requestId, gameId: game.id })

  const body = `
    <style>${landingCss()}</style>
    ${heroBlock(game, lang, d, current)}
    ${aboutBlock(game, lang)}
    ${videosBlock(game, lang)}
    ${devicesBlock(game, lang)}
    ${productsBlock(game, lang)}`

  return createHtmlResponse(page({
    game, lang, theme,
    title: `${game.name} — AmirCollider`,
    description: pickLang(game.i18n && game.i18n.description, lang) || game.description || '',
    active: 'landing',
    downloadable: isDownloadable(game),
    body
  }), 200, langHeader(url, lang))
}


// ==========================================
// handleGameVersions
// GET /:gameId/versions
//
// The newest release first, which is both the ordering the query
// returns and the one the page wants: somebody arriving here was
// asked to update, and the thing they came to read is at the top.
// ==========================================
export async function handleGameVersions(url, request, gameId, requestId, GAMES, env) {
  const id = gameIdFrom(url)
  const game = await resolveGame(env, GAMES, id)
  if (!game) {
    return createJsonResponse({ ok: false, error: 'unknown_game', requestId }, 404)
  }

  const lang = chromeLang(url, request)
  const theme = chromeTheme(request)
  const d = dict(lang)

  const database = db(env)
  const versions = database ? await listVersions(database, game.id, 60) : []

  const releases = versions.map((row, index) => {
    const notes = notesList(row[`notes_${lang}`] || row.notes_en || row.notes_fa)
    return `
      <article class="ln-rel">
        <div class="ln-rel-top">
          <span class="ln-rel-v">v${esc(row.version)}</span>
          ${index === 0 ? `<span class="gchip is-ok">${esc(d.current)}</span>` : ''}
          <span class="ln-rel-date">${esc(d.released)}: ${esc(localDate(row.released_at, lang))}</span>
          ${row.download_url
            ? `<a class="gbtn gbtn--ghost" style="padding:6px 12px;font-size:.8em"
                 href="${esc(row.download_url)}" rel="noopener">${esc(d.get)}</a>` : ''}
        </div>
        ${notes || `<div class="glede" style="margin:0">${esc(d.changes)}: —</div>`}
      </article>`
  }).join('')

  const empty = `
    <div class="gcard">
      <div class="ghead">${esc(d.versions)}</div>
      <p class="glede">${esc(d.noVersions)}</p>
      <p class="glede" style="margin:0">${esc(d.noVersionsHint)}</p>
    </div>`

  const body = `
    <style>${landingCss()}</style>
    <div class="gcard" style="margin-block-end:18px">
      <h1 class="ghead" style="margin-block-start:0">${esc(game.name)} — ${esc(d.versions)}</h1>
      <p class="glede" style="margin:0">
        <a href="/${esc(game.id)}">${esc(d.backToGame)}</a>
      </p>
    </div>
    ${releases || empty}`

  return createHtmlResponse(page({
    game, lang, theme,
    title: `${d.versions} — ${game.name}`,
    description: `${game.name} — ${d.versions}`,
    active: 'versions',
    downloadable: isDownloadable(game),
    body
  }), 200, langHeader(url, lang))
}
