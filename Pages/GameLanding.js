// ==========================================
// Pages/GameLanding.js
// A game's own front page, and its version history.
//
// Public entry points (wired in Worker.js ROUTES):
//   GET /:gameId            the landing page
//   GET /:gameId/versions   what shipped, and when
//
// Both use the shared chrome in GameChrome.js, so a visitor
// moving between the landing page, the store and the account
// page is moving around one site rather than through three.
//
// ------------------------------------------------------------
// WHAT A LANDING PAGE HAS TO DO
// ------------------------------------------------------------
// This page used to render a logo, a one-line description and a
// row of buttons - a correct page, and an empty one. A landing
// page answers four questions in order, and a visitor who has to
// scroll to find any of them has already left:
//
//   what is this      the hero: art, name, one-line pitch
//   why would I care  the feature strip, then the screenshots
//   show me           the gallery and the trailers
//   where do I get it every store the game is on, as its own
//                     button, plus the size of the ask (device
//                     requirements) and the answers to the
//                     questions that come before an install
//
// Every one of those is DATA, edited in TheGod's "Game page"
// tab. A game whose operator has filled none of it in still gets
// a correct page - just a shorter one, built from what the card
// already knows. That degradation is deliberate and is why every
// block below returns '' rather than a placeholder.
//
// The <head> matters as much as the body here: a link to a game
// pasted into Telegram or WhatsApp is a preview card, and a page
// with no OpenGraph tags is a grey rectangle with a URL in it.
// ==========================================

import { createHtmlResponse, createJsonResponse } from '../Core/Http.js'
import { logInfo } from '../Core/Logging.js'
import {
  resolveGame, isDownloadable, effectiveProducts, landingVideo
} from '../Games/Registry.js'
import { db, listVersions } from '../Games/Store.js'
import { chromeTheme, langHeader, page, localeFor } from './GameChrome.js'
import { escapeHtml } from '../Core/Html.js'
import { matchRequestLang } from '../Core/RequestContext.js'
import { CONFIG } from '../Config.js'


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


// ==========================================
// Where the game can be had
//
// One button per store rather than one "Get the game" button, so
// a player who has Myket and not Play is not sent to a chooser
// page to find that out. `play: true` marks the odd one out: a
// browser game is not downloaded, so its button says "play".
//
// Every href points at /{game}/download?store={key} rather than
// at the store directly. That is what makes withdrawing a build
// withdraw it everywhere at once, including from links people
// have already shared.
// ==========================================
const STORES = {
  myket: { logo: '/assets/MyketLogo.png' },
  googleplay: { logo: '/assets/GooglePlayStoreLogo.png' },
  apk: { logo: '/assets/AndroidAPKLogo.png' },
  web: { logo: '/assets/WebLogo.png', play: true }
}

const STORE_NAMES = {
  fa: { myket: 'مایکت', googleplay: 'گوگل پلی', apk: 'دانلود مستقیم', web: 'بازی در مرورگر' },
  en: { myket: 'Myket', googleplay: 'Google Play', apk: 'Direct APK', web: 'Play in browser' },
  ja: { myket: 'Myket', googleplay: 'Google Play', apk: 'APK 直接', web: 'ブラウザーで遊ぶ' }
}


const I18N = {
  fa: {
    play: 'بازی کن',
    get: 'دریافت بازی',
    getFrom: 'از کجا بگیرم',
    about: 'درباره‌ی بازی',
    features: 'چه چیزی در انتظار توست',
    shots: 'تصاویر بازی',
    videos: 'ویدیوها',
    devices: 'روی چه دستگاه‌هایی اجرا می‌شود',
    faq: 'پرسش‌های پرتکرار',
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
    latest: 'آخرین نسخه',
    skip: 'رفتن به محتوا',
    free: 'رایگان',
    signIn: 'ورود با گوگل',
    cloud: 'ذخیره‌ی ابری',
    offline: 'بدون نیاز به اینترنت',
    online: 'بازی آنلاین'
  },
  en: {
    play: 'Play',
    get: 'Get the game',
    getFrom: 'Where to get it',
    about: 'About',
    features: 'What you get',
    shots: 'Screenshots',
    videos: 'Videos',
    devices: 'Runs on',
    faq: 'Frequently asked',
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
    latest: 'Latest',
    skip: 'Skip to content',
    free: 'Free',
    signIn: 'Google sign-in',
    cloud: 'Cloud save',
    offline: 'Plays offline',
    online: 'Online play'
  },
  ja: {
    play: 'プレイ',
    get: 'ゲームを入手',
    getFrom: '入手先',
    about: 'ゲームについて',
    features: '特徴',
    shots: 'スクリーンショット',
    videos: '動画',
    devices: '対応デバイス',
    faq: 'よくある質問',
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
    latest: '最新',
    skip: '本文へスキップ',
    free: '無料',
    signIn: 'Google サインイン',
    cloud: 'クラウドセーブ',
    offline: 'オフライン対応',
    online: 'オンラインプレイ'
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
  return `<ul class="ln-notes">${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
}


function pickLang(map, lang) {
  if (!map) return ''
  return map[lang] || map.en || map.fa || map.ja || ''
}


// An absolute URL for a path that may already be one. Used for
// OpenGraph, which is read by servers rather than browsers and
// therefore cannot resolve a relative path.
function absolute(origin, path) {
  const value = String(path || '')
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  return String(origin).replace(/\/+$/, '') + (value.startsWith('/') ? value : '/' + value)
}


// A list from the landing blob, defended against a row written
// by something other than the panel. Every one of these arrays
// is JSON in a text column, so "an array of the right shape" is
// an assumption rather than a guarantee.
function rows(value, limit) {
  return (Array.isArray(value) ? value : []).slice(0, limit).filter(row => row && typeof row === 'object')
}


// ==========================================
// landingCss
// Everything specific to these two pages.
//
// The shared chrome supplies the shell, the tokens, the top bar
// and the footer. This is only what a landing page needs on top
// of it.
// ==========================================
function landingCss() {
  return `
    .ln-hero{position:relative;overflow:hidden;border-radius:var(--radius);
      border:1px solid var(--border);background:var(--surface);margin-block-end:20px}
    .ln-hero-art{position:absolute;inset:0;background-size:cover;background-position:center;
      opacity:.34;filter:saturate(1.1)}
    .ln-hero::after{content:'';position:absolute;inset:0;pointer-events:none;
      background:linear-gradient(180deg,transparent,color-mix(in srgb,var(--bg-1) 92%,transparent))}
    .ln-hero-in{position:relative;z-index:1;display:flex;align-items:center;gap:22px;
      flex-wrap:wrap;padding:36px 26px}
    .ln-logo{position:relative;width:108px;height:108px;border-radius:26px;flex-shrink:0;
      display:flex;align-items:center;justify-content:center;font-size:2.7em;
      background:#fff;color:#1a1c24;overflow:hidden;
      border:2px solid color-mix(in srgb,var(--accent) 55%,transparent)}
    .ln-logo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
    .ln-head{flex:1;min-width:240px}
    .ln-title{font-size:2.1em;font-weight:800;line-height:1.15;margin-block-end:10px}
    .ln-tag{color:var(--text);font-size:1.08em;line-height:1.65;max-width:56ch;font-weight:600}
    .ln-sub{color:var(--dim);font-size:.96em;line-height:1.7;max-width:60ch;margin-block-start:8px}
    .ln-badges{display:flex;flex-wrap:wrap;gap:8px;margin-block-start:16px}

    /* ---------- where to get it ---------- */
    .ln-cta{display:flex;flex-wrap:wrap;gap:10px;margin-block-start:18px}
    /* auto-FILL rather than auto-fit: a game published in one
       place should get one button the size of a button, not one
       button stretched across the whole card. */
    .ln-get{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;
      margin-block-end:16px}
    .ln-store{display:flex;align-items:center;gap:12px;padding:13px 16px;border-radius:14px;
      text-decoration:none;color:var(--text);background:var(--surface-2);border:1px solid var(--border);
      transition:transform .16s ease,border-color .16s ease}
    .ln-store:hover{transform:translateY(-2px);border-color:var(--accent)}
    .ln-store.is-primary{border-color:color-mix(in srgb,var(--accent) 60%,transparent);
      background:color-mix(in srgb,var(--accent) 14%,var(--surface-2))}
    .ln-store img{width:30px;height:30px;object-fit:contain;flex-shrink:0}
    .ln-store b{display:block;font-size:.95em;font-weight:700}
    .ln-store span{display:block;font-size:.78em;color:var(--dim)}

    .ln-sec{margin-block-end:20px}
    .ln-about{white-space:pre-wrap;line-height:1.95;color:var(--text);font-size:1em;max-width:72ch}

    /* ---------- features ---------- */
    .ln-feats{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
    .ln-feat{display:flex;align-items:flex-start;gap:12px;padding:16px;border-radius:14px;
      background:var(--surface-2);border:1px solid var(--border)}
    .ln-feat-icon{font-size:1.5em;line-height:1;flex-shrink:0}
    .ln-feat span{font-size:.95em;line-height:1.65;font-weight:600}

    /* ---------- screenshots ----------
       A scroll-snapping strip rather than a grid: phone
       screenshots are tall, and six of them in a grid is a screen
       and a half of scrolling before the download button. */
    .ln-shots{display:flex;gap:12px;overflow-x:auto;padding-block-end:10px;
      scroll-snap-type:x mandatory;scrollbar-width:thin}
    .ln-shot{flex:0 0 auto;scroll-snap-align:start;max-width:min(78vw,340px)}
    .ln-shot img{display:block;width:100%;height:auto;border-radius:14px;
      border:1px solid var(--border);background:var(--surface-2)}
    .ln-shot figcaption{margin-block-start:8px;font-size:.84em;color:var(--dim);line-height:1.6}

    .ln-videos{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}
    .ln-video{position:relative;padding-block-end:56.25%;border-radius:14px;overflow:hidden;
      border:1px solid var(--border);background:#000}
    .ln-video iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
    .ln-video-link{display:flex;align-items:center;gap:10px;padding:14px 16px;border-radius:14px;
      text-decoration:none;color:var(--text);background:var(--surface);border:1px solid var(--border)}

    .ln-devices{display:flex;flex-wrap:wrap;gap:10px}
    .ln-device{display:inline-flex;align-items:center;gap:9px;padding:10px 15px;border-radius:13px;
      font-size:.9em;font-weight:600;background:var(--surface-2);border:1px solid var(--border)}
    .ln-device svg{width:19px;height:19px;color:color-mix(in srgb,var(--accent) 60%,var(--text))}

    .ln-prods{display:flex;flex-wrap:wrap;gap:8px}
    .ln-prod{display:inline-flex;align-items:center;gap:7px;padding:9px 14px;border-radius:11px;
      font-size:.9em;background:var(--surface-2);border:1px solid var(--border)}
    .ln-prod b{font-weight:700}
    .ln-prod span{color:var(--dim);direction:ltr;unicode-bidi:isolate}

    /* ---------- FAQ ----------
       <details> rather than a script: closed by default, opens
       with a click or Enter, and the browser's own find-in-page
       reaches inside a closed one. */
    .ln-faq{display:flex;flex-direction:column;gap:10px}
    .ln-faq details{border-radius:13px;background:var(--surface-2);border:1px solid var(--border);
      overflow:hidden}
    .ln-faq summary{cursor:pointer;padding:14px 16px;font-weight:700;font-size:.97em;
      list-style:none;display:flex;align-items:center;justify-content:space-between;gap:12px}
    .ln-faq summary::-webkit-details-marker{display:none}
    .ln-faq summary::after{content:'+';font-size:1.2em;color:var(--dim);flex-shrink:0}
    .ln-faq details[open] summary::after{content:'−'}
    .ln-faq p{padding:0 16px 16px;color:var(--dim);line-height:1.9;font-size:.94em;white-space:pre-wrap}

    /* ---------- versions ---------- */
    .ln-rel{padding:20px;border-radius:var(--radius);background:var(--surface);
      border:1px solid var(--border);margin-block-end:14px}
    .ln-rel-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-block-end:10px}
    .ln-rel-v{font-size:1.15em;font-weight:800;direction:ltr;unicode-bidi:isolate}
    .ln-rel-date{color:var(--dim);font-size:.86em}
    .ln-notes{margin-block-start:8px;padding-inline-start:20px;line-height:1.95;
      color:var(--dim);font-size:.95em}
    .ln-notes li{margin-block-end:4px}

    @media (max-width:640px){
      .ln-hero-in{padding:24px 18px;gap:16px}
      .ln-logo{width:78px;height:78px;border-radius:20px;font-size:1.9em}
      .ln-title{font-size:1.55em}
      .ln-cta .gbtn{flex:1 1 100%}
      .ln-get{grid-template-columns:1fr}
    }
  `
}


// ==========================================
// heroBlock
// Art, name, pitch, badges. The first screen.
// ==========================================
function heroBlock(game, lang, currentVersion) {
  const d = dict(lang)
  const hero = game.landing.hero
  const badges = []

  if (currentVersion) {
    badges.push(`<span class="gchip is-ok">${escapeHtml(d.latest)} <bdi>v${escapeHtml(currentVersion.version)}</bdi></span>`)
  }
  if (game.status === 'soon') badges.push(`<span class="gchip is-warn">${escapeHtml(d.soon)}</span>`)
  else if (!isDownloadable(game)) badges.push(`<span class="gchip is-warn">${escapeHtml(d.withdrawn)}</span>`)

  for (const tag of game.tags || []) {
    const label = pickLang(tag, lang)
    if (label) badges.push(`<span class="gchip is-dim">${escapeHtml(label)}</span>`)
  }

  // The capabilities a player cares about, phrased as promises
  // rather than as feature names. "Plays offline" is the answer
  // to a question people actually ask before installing.
  if (game.capabilities.onlinePlay) badges.push(`<span class="gchip is-dim">${escapeHtml(d.online)}</span>`)
  else badges.push(`<span class="gchip is-dim">${escapeHtml(d.offline)}</span>`)
  if (game.capabilities.cloudSave) badges.push(`<span class="gchip is-dim">${escapeHtml(d.cloud)}</span>`)

  const tagline = pickLang(game.landing.tagline, lang)
  const description = pickLang(game.i18n && game.i18n.description, lang) || game.description || ''

  return `
    <section class="ln-hero">
      ${hero ? `<div class="ln-hero-art" style="background-image:url('${escapeHtml(hero)}')"></div>` : ''}
      <div class="ln-hero-in">
        <span class="ln-logo">${escapeHtml(game.icon || '🎮')}${game.logo
          ? `<img src="${escapeHtml(game.logo)}" alt="" onerror="this.style.display='none'">` : ''}</span>
        <div class="ln-head">
          <h1 class="ln-title">${escapeHtml(game.name)}</h1>
          <p class="ln-tag" dir="auto">${escapeHtml(tagline || description)}</p>
          ${tagline && description && tagline !== description
            ? `<p class="ln-sub" dir="auto">${escapeHtml(description)}</p>` : ''}
          ${badges.length ? `<div class="ln-badges">${badges.join('')}</div>` : ''}
        </div>
      </div>
    </section>`
}


// ==========================================
// getBlock
// One button per place the game can be had.
//
// Every link goes through /{game}/download?store={key}, so the
// offline switch governs all of them and a withdrawn build is
// withdrawn from links people already shared.
// ==========================================
function getBlock(game, lang) {
  const d = dict(lang)
  const names = STORE_NAMES[lang] || STORE_NAMES.fa
  const links = (game.download && game.download.links) || {}
  const keys = Object.keys(links)

  const extras = []
  if (game.capabilities.store) {
    extras.push(`<a class="gbtn gbtn--ghost" href="/${escapeHtml(game.id)}/store">${escapeHtml(d.store)}</a>`)
  }
  if (game.capabilities.leaderboard) {
    extras.push(`<a class="gbtn gbtn--ghost" href="/${escapeHtml(game.id)}/leaderboard">${escapeHtml(d.board)}</a>`)
  }
  if (game.capabilities.login) {
    extras.push(`<a class="gbtn gbtn--ghost" href="/${escapeHtml(game.id)}/account">${escapeHtml(d.account)}</a>`)
  }
  extras.push(`<a class="gbtn gbtn--ghost" href="/${escapeHtml(game.id)}/versions">${escapeHtml(d.versionsLink)}</a>`)

  // A game with nothing to download still gets its other links -
  // the store, the leaderboard, the account page all work while a
  // build is withheld, which is the whole point of the switch
  // being about the download alone.
  if (!isDownloadable(game) || !keys.length) {
    return `<section class="gcard ln-sec">
        <div class="gnote is-warn" style="margin-block-end:16px">
          ${escapeHtml(game.status === 'soon' ? d.soon : d.withdrawn)}
        </div>
        <div class="ln-cta">${extras.join('')}</div>
      </section>`
  }

  const primary = game.download.primary
  const ordered = keys.slice().sort((a, b) => (a === primary ? -1 : b === primary ? 1 : 0))

  const buttons = ordered.map(key => {
    const meta = STORES[String(key).toLowerCase()] || {}
    const label = names[key] || key
    const verb = meta.play ? d.play : d.get

    return `<a class="ln-store${key === primary ? ' is-primary' : ''}"
      href="/${escapeHtml(game.id)}/download?store=${encodeURIComponent(key)}" rel="noopener">
      ${meta.logo
        ? `<img src="${escapeHtml(meta.logo)}" alt="" loading="lazy" onerror="this.style.display='none'">`
        : '<span aria-hidden="true" style="font-size:1.5em">⬇</span>'}
      <span style="min-width:0">
        <b>${escapeHtml(label)}</b>
        <span>${escapeHtml(verb)}</span>
      </span>
    </a>`
  }).join('')

  return `<section class="gcard ln-sec">
      <h2 class="ghead">${escapeHtml(d.getFrom)}</h2>
      <div class="ln-get">${buttons}</div>
      <div class="ln-cta">${extras.join('')}</div>
    </section>`
}


function featuresBlock(game, lang) {
  const d = dict(lang)
  const features = rows(game.landing.features, 8)
    .map(feature => {
      const label = pickLang(feature, lang)
      if (!label) return ''
      return `<div class="ln-feat">
        <span class="ln-feat-icon" aria-hidden="true">${escapeHtml(feature.icon || '•')}</span>
        <span dir="auto">${escapeHtml(label)}</span>
      </div>`
    }).filter(Boolean).join('')

  if (!features) return ''

  return `<section class="gcard ln-sec">
      <h2 class="ghead">${escapeHtml(d.features)}</h2>
      <div class="ln-feats">${features}</div>
    </section>`
}


function shotsBlock(game, lang) {
  const d = dict(lang)
  const shots = rows(game.landing.screenshots, 12)
    .map(shot => {
      const url = String(shot.url || '')
      if (!/^(https?:\/\/|\/)/i.test(url)) return ''
      const caption = String(shot.caption || '')

      // The caption doubles as alt text. An empty alt on a
      // screenshot is correct when the image is decoration and
      // wrong here, where it is the thing being sold.
      return `<figure class="ln-shot">
        <img src="${escapeHtml(url)}" alt="${escapeHtml(caption)}" loading="lazy" decoding="async">
        ${caption ? `<figcaption dir="auto">${escapeHtml(caption)}</figcaption>` : ''}
      </figure>`
    }).filter(Boolean).join('')

  if (!shots) return ''

  return `<section class="gcard ln-sec">
      <h2 class="ghead">${escapeHtml(d.shots)}</h2>
      <div class="ln-shots">${shots}</div>
    </section>`
}


function videosBlock(game, lang) {
  const d = dict(lang)
  const videos = rows(game.landing.videos, 8)

  const items = videos.map(entry => {
    const url = typeof entry === 'string' ? entry : (entry && entry.url)
    const title = (entry && entry.title) || d.watch
    const parsed = landingVideo(url)

    // Only a URL this side BUILT goes into an iframe src. An
    // unrecognised host is rendered as a link, deliberately: an
    // iframe pointed at operator input is arbitrary third-party
    // script inside our frame.
    if (parsed) {
      return `<div class="ln-video"><iframe src="${escapeHtml(parsed.embed)}" title="${escapeHtml(title)}"
        loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`
    }
    if (!url) return ''
    return `<a class="ln-video-link" href="${escapeHtml(url)}" target="_blank" rel="noopener nofollow">
      ▶ <span dir="auto">${escapeHtml(title)}</span></a>`
  }).filter(Boolean).join('')

  if (!items) return ''
  return `<section class="gcard ln-sec">
      <h2 class="ghead">${escapeHtml(d.videos)}</h2>
      <div class="ln-videos">${items}</div>
    </section>`
}


function devicesBlock(game, lang) {
  const d = dict(lang)
  const devices = rows(game.landing.devices, 12)
  if (!devices.length) return ''

  const items = devices.map(entry => {
    const kind = (entry && entry.kind) || 'generic'
    const label = (entry && entry.label) || kind
    return `<span class="ln-device">${deviceIcon(kind)}<span dir="auto">${escapeHtml(label)}</span></span>`
  }).join('')

  return `<section class="gcard ln-sec">
      <h2 class="ghead">${escapeHtml(d.devices)}</h2>
      <div class="ln-devices">${items}</div>
    </section>`
}


function aboutBlock(game, lang) {
  const d = dict(lang)
  const about = game.landing.about[lang] || game.landing.about.en || game.landing.about.fa
  if (!about) return ''

  return `<section class="gcard ln-sec">
      <h2 class="ghead">${escapeHtml(d.about)}</h2>
      <div class="ln-about" dir="auto">${escapeHtml(about)}</div>
    </section>`
}


function productsBlock(game, lang) {
  const d = dict(lang)
  if (!game.capabilities.store) return ''

  const products = effectiveProducts(game).slice(0, 8)
  if (!products.length) return ''

  const items = products.map(product => {
    const name = pickLang(product.i18n && product.i18n.name, lang) || product.id
    return `<span class="ln-prod">${escapeHtml(product.icon || '')}<b dir="auto">${escapeHtml(name)}</b>
      <span>$${escapeHtml(product.priceUsd)}</span></span>`
  }).join('')

  return `<section class="gcard ln-sec">
      <h2 class="ghead">${escapeHtml(d.products)}</h2>
      <div class="ln-prods">${items}</div>
      <div style="margin-block-start:14px">
        <a class="gbtn" href="/${escapeHtml(game.id)}/store">${escapeHtml(d.store)}</a>
      </div>
    </section>`
}


function faqBlock(game, lang) {
  const d = dict(lang)
  const items = rows(game.landing.faq, 12).map(entry => {
    const question = pickLang(entry.q, lang)
    const answer = pickLang(entry.a, lang)
    if (!question || !answer) return ''

    return `<details>
      <summary dir="auto">${escapeHtml(question)}</summary>
      <p dir="auto">${escapeHtml(answer)}</p>
    </details>`
  }).filter(Boolean).join('')

  if (!items) return ''

  return `<section class="gcard ln-sec">
      <h2 class="ghead">${escapeHtml(d.faq)}</h2>
      <div class="ln-faq">${items}</div>
    </section>`
}


// ==========================================
// socialHead
// The tags a link preview reads.
//
// A game link pasted into Telegram, WhatsApp or X is fetched by
// a server, not a browser: it never runs the page's script and
// never resolves a relative path. So every URL here is absolute
// and everything it needs is in the markup.
//
// The JSON-LD block is for search engines and says the one thing
// the prose cannot: that this page is about a game, which one,
// what it costs and which platforms it runs on.
// ==========================================
function socialHead(game, lang, origin, description, currentVersion) {
  const url = absolute(origin, '/' + game.id)
  const image = absolute(origin, game.landing.hero || game.logo || CONFIG.DEFAULT_GAME_LOGO)
  const title = `${game.name} — AmirCollider`

  const platforms = Object.keys((game.download && game.download.links) || {})
    .map(key => (key === 'web' ? 'Web browser' : key === 'apk' || key === 'myket' || key === 'googleplay' ? 'Android' : key))
  const unique = [...new Set(platforms)]

  const structured = {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: game.name,
    url,
    description,
    inLanguage: lang,
    applicationCategory: 'GameApplication',
    operatingSystem: unique.length ? unique.join(', ') : 'Android',
    ...(image ? { image } : {}),
    ...(currentVersion ? { softwareVersion: currentVersion.version } : {}),
    publisher: { '@type': 'Organization', name: 'AmirCollider', url: absolute(origin, '/') },
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      availability: isDownloadable(game)
        ? 'https://schema.org/InStock'
        : 'https://schema.org/PreOrder'
    }
  }

  // The same escaping rule the panel uses for inline data: the
  // HTML parser ends a script at the first "</script>" wherever
  // it appears, including inside a JSON string.
  const json = JSON.stringify(structured).replace(/</g, '\\u003c')

  return `
  <link rel="canonical" href="${escapeHtml(url)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="AmirCollider">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(url)}">
  ${image ? `<meta property="og:image" content="${escapeHtml(image)}">` : ''}
  <meta property="og:locale" content="${escapeHtml(localeFor(lang).replace('-', '_'))}">
  <meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  ${image ? `<meta name="twitter:image" content="${escapeHtml(image)}">` : ''}
  <meta name="theme-color" content="${escapeHtml(game.color || '#6c63ff')}">
  <script type="application/ld+json">${json}</script>`
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

  const lang = matchRequestLang(url, request)
  const theme = chromeTheme(request)
  const d = dict(lang)

  const database = db(env)
  const versions = database ? await listVersions(database, game.id, 1) : []
  const current = versions[0] || null

  logInfo('Game landing page', { requestId, gameId: game.id })

  // The pitch, in order of preference: the tagline written for
  // this page, then the card's description. It is the page's
  // <meta description> and its link preview, so an empty one is
  // a grey rectangle in every chat app the link is shared in.
  const description = pickLang(game.landing.tagline, lang)
    || pickLang(game.i18n && game.i18n.description, lang)
    || game.description
    || game.name

  const body = `
    <style>${landingCss()}</style>
    ${heroBlock(game, lang, current)}
    ${getBlock(game, lang)}
    ${featuresBlock(game, lang)}
    ${shotsBlock(game, lang)}
    ${videosBlock(game, lang)}
    ${aboutBlock(game, lang)}
    ${devicesBlock(game, lang)}
    ${productsBlock(game, lang)}
    ${faqBlock(game, lang)}`

  return createHtmlResponse(page({
    game, lang, theme,
    title: `${game.name} — AmirCollider`,
    description,
    head: socialHead(game, lang, url.origin, description, current),
    active: 'landing',
    downloadable: isDownloadable(game),
    skipLabel: d.skip,
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

  const lang = matchRequestLang(url, request)
  const theme = chromeTheme(request)
  const d = dict(lang)

  const database = db(env)
  const versions = database ? await listVersions(database, game.id, 60) : []

  const releases = versions.map((row, index) => {
    const notes = notesList(row[`notes_${lang}`] || row.notes_en || row.notes_fa)
    // A release with its own download link uses it; everything
    // else falls back to the game's current link, which the
    // offline switch still governs.
    const href = row.download_url || (isDownloadable(game) ? `/${game.id}/download` : '')

    return `
      <article class="ln-rel">
        <div class="ln-rel-top">
          <span class="ln-rel-v">v${escapeHtml(row.version)}</span>
          ${index === 0 ? `<span class="gchip is-ok">${escapeHtml(d.current)}</span>` : ''}
          <span class="ln-rel-date">${escapeHtml(d.released)}: ${escapeHtml(localDate(row.released_at, lang))}</span>
          ${href
            ? `<a class="gbtn gbtn--ghost" style="padding:6px 12px;font-size:.82em"
                 href="${escapeHtml(href)}" rel="noopener">${escapeHtml(d.get)}</a>` : ''}
        </div>
        ${notes || `<div class="glede" style="margin:0">${escapeHtml(d.changes)}: —</div>`}
      </article>`
  }).join('')

  const empty = `
    <div class="gcard">
      <div class="ghead">${escapeHtml(d.versions)}</div>
      <p class="glede">${escapeHtml(d.noVersions)}</p>
      <p class="glede" style="margin:0">${escapeHtml(d.noVersionsHint)}</p>
    </div>`

  const body = `
    <style>${landingCss()}</style>
    <div class="gcard" style="margin-block-end:18px">
      <h1 class="ghead" style="margin-block-start:0">${escapeHtml(game.name)} — ${escapeHtml(d.versions)}</h1>
      <p class="glede" style="margin:0">
        <a href="/${escapeHtml(game.id)}">${escapeHtml(d.backToGame)}</a>
      </p>
    </div>
    ${releases || empty}`

  return createHtmlResponse(page({
    game, lang, theme,
    title: `${d.versions} — ${game.name}`,
    description: `${game.name} — ${d.versions}`,
    active: 'versions',
    downloadable: isDownloadable(game),
    skipLabel: d.skip,
    body
  }), 200, langHeader(url, lang))
}
