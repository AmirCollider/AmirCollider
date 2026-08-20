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
  resolveGame, isDownloadable, effectiveProducts, landingVideo, gamePlatforms
} from '../Games/Registry.js'
import { db, listVersions } from '../Games/Store.js'
import { googleDisclosureFor, POLICY_LABELS } from '../Content/GoogleDisclosure.js'
import { chromeTheme, langHeader, page, localeFor } from './GameChrome.js'
import { escapeHtml } from '../Core/Html.js'
import {
  videoGameLd, videoObjectLd, faqPageLd, keywordList, persianSpellingVariants,
  textWidth, clampWidth
} from '../Core/Seo.js'
import { matchRequestLang } from '../Core/RequestContext.js'
import { localizedPath } from '../Core/Locale.js'
import { CONFIG, LANGUAGES } from '../Config.js'


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
    versionsDesc: 'تاریخچه‌ی کامل نسخه‌های {game}: هر نسخه با تاریخ انتشار و فهرست تغییراتش. آخرین نسخه {version} است.',
    versionsDescEmpty: 'تاریخچه‌ی نسخه‌های {game}. هنوز نسخه‌ای ثبت نشده؛ هر انتشار تازه با تاریخ و فهرست تغییراتش این‌جا می‌آید.',

    // The pieces the meta description is built from. See
    // landingDescription() - each is a clause, not a sentence, so
    // a game that lacks a capability simply drops its clause.
    descOn: 'برای {platforms}',
    descBy: 'ساخته‌ی AmirCollider.',
    descFree: 'رایگان',
    platAndroid: 'اندروید',
    platWeb: 'مرورگر',
    capOffline: 'بدون نیاز به اینترنت',
    capLogin: 'ورود با گوگل',
    capCloud: 'ذخیره‌ی ابری',
    capBoard: 'جدول امتیازات',
    capStore: 'خرید درون‌برنامه‌ای',
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
    online: 'بازی آنلاین',

    titleKind: { android: 'بازی اندرویدی', web: 'بازی تحت‌وب', both: 'بازی اندرویدی و تحت‌وب' }
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
    versionsDesc: 'The full release history of {game}: every version with its release date and its list of changes. The latest version is {version}.',
    versionsDescEmpty: 'The release history of {game}. No version has been recorded yet; each new release will appear here with its date and its list of changes.',
    descOn: 'for {platforms}',
    descBy: 'Made by AmirCollider.',
    descFree: 'Free',
    platAndroid: 'Android',
    platWeb: 'the browser',
    capOffline: 'plays offline',
    capLogin: 'Google sign-in',
    capCloud: 'cloud saves',
    capBoard: 'leaderboard',
    capStore: 'in-app purchases',
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
    online: 'Online play',

    titleKind: { android: 'Android game', web: 'browser game', both: 'Android and browser game' }
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
    versionsDesc: '{game} のリリース履歴。各バージョンのリリース日と変更点の一覧です。最新バージョンは {version} です。',
    versionsDescEmpty: '{game} のリリース履歴。まだバージョンが登録されていません。新しいリリースは日付と変更点とともにここに表示されます。',
    descOn: '{platforms}向け',
    descBy: '制作: AmirCollider。',
    descFree: '無料',
    platAndroid: 'Android',
    platWeb: 'ブラウザ',
    capOffline: 'オフライン対応',
    capLogin: 'Google サインイン',
    capCloud: 'クラウドセーブ',
    capBoard: 'ランキング',
    capStore: 'アプリ内購入',
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
    online: 'オンラインプレイ',

    titleKind: { android: 'Android ゲーム', web: 'ブラウザゲーム', both: 'Android・ブラウザゲーム' }
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
  return pickLangCoded(map, lang).text
}


// ==========================================
// Which language a string actually came from, and which way it
// runs.
//
// pickLang() falls back - the Persian page shows the English
// tagline when nobody wrote a Persian one - so "the page is in
// Persian" is not the same statement as "this paragraph is". The
// coded version answers the second one, which is the only one a
// dir attribute can be built from.
//
// This exists because `dir="auto"` was wrong here, and wrong in
// a way that looks like a rendering bug rather than a
// specification working as designed. `auto` reads the FIRST
// STRONG character and lets it decide the whole block. An
// operator's Persian description that opens with an emoji and a
// Latin brand name -
//
//   ⚔️ **Chrono Blades – یک پرتاب، یک فرصت…
//
// - has no strong character until the "C", so the browser
// concluded the paragraph was English and laid the Persian out
// left to right. Which is the ordinary way to write a game
// description, so this was going to happen to every game.
//
// The language of the FIELD is the fact we actually have, and it
// cannot be fooled by what the operator typed into it.
// ==========================================
function pickLangCoded(map, lang) {
  if (!map) return { text: '', code: lang }
  for (const code of [lang, 'en', 'fa', 'ja']) {
    if (map[code]) return { text: map[code], code }
  }
  return { text: '', code: lang }
}

function dirOf(code) {
  const meta = LANGUAGES.meta[code]
  return (meta && meta.dir) || 'ltr'
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


// ==========================================
// landingDescription
// The sentence a search result shows for a game.
//
// This was the worst thing on the site and it took a crawl to see
// it. The description resolved to the tagline, then to the card's
// one-liner, and for a game whose panel row is empty that is what
// a search engine got:
//
//   <meta name="description" content="Neon action sword game">
//
// Twenty-two characters, on the most important page this domain
// has. Google's advice for a short description is not to lengthen
// it - it is that a description has to say something the title has
// not already said, and "Neon action sword game" on a page titled
// "Neon Katana - Android game" says nothing at all. A snippet
// generator handed that writes its own from the page, which is how
// the front page ended up quoting its own capability chips.
//
// So this composes one, out of facts the page ALREADY RENDERS and
// nothing else:
//
//   the name, and its other-script name if the registry has one
//   the pitch - tagline, or the card's line, whichever exists
//   which platforms, derived from the download links
//   what the game does with a network, from `capabilities`
//   who made it
//
// Every clause is dropped when its fact is absent, so a game with
// no store never claims purchases and a browser-only game is never
// called an Android game. That is the same guarantee the Google
// disclosure block gives, for the same reason: a description that
// promises a feature the game does not have is worse than a short
// one.
//
// Capped at 158 characters on a word boundary. Google renders
// roughly 155-160 before it truncates, and a description cut
// mid-word by the search engine reads as a broken page.
// ==========================================
// Rendered width, not characters. See textWidth() in Core/Seo.js:
// a Japanese description built to 158 CHARACTERS renders at about
// 250 and is truncated mid-clause, because every kana counts twice.
const DESC_LIMIT = 158

function landingDescription(game, lang, pitch) {
  const d = dict(lang)
  const platforms = gamePlatforms(game)
  const capability = game.capabilities || {}

  const places = []
  if (platforms.android) places.push(d.platAndroid)
  if (platforms.web) places.push(d.platWeb)

  const features = []
  if (!capability.onlinePlay) features.push(d.capOffline)
  if (capability.login) features.push(d.capLogin)
  if (capability.cloudSave) features.push(d.capCloud)
  if (capability.leaderboard) features.push(d.capBoard)
  if (capability.store) features.push(d.capStore)

  // The name, with the other-script name beside it - in THIS
  // page's script, not whichever one the registry happens to list
  // first. Handing a Japanese reader "(نئون کاتانا)" is worse than
  // handing them nothing: it is the highest-value position in the
  // whole string, and it went to a script they cannot read.
  const alt = altNameFor(game, lang)
  const head = alt ? game.name + ' (' + alt + ')' : game.name

  const parts = [head]
  if (pitch && pitch !== game.name) parts.push(pitch.replace(/[.。]\s*$/, ''))
  if (places.length) parts.push(fillDesc(d.descOn, { platforms: joinList(places, lang) }))

  // ==========================================
  // Assembled longest-first, then dropped from the middle.
  //
  // The attribution is the clause a description cannot lose - it
  // is the whole reason a page about one game helps the brand at
  // all - and it was the clause a plain clamp() cut off every
  // time, because it is last. So the feature list is tried, and if
  // the result does not fit it is dropped and the attribution
  // stays. The pitch and the name are never dropped; if a game's
  // tagline alone runs past the limit, that is an operator writing
  // a paragraph into a one-line field and clamp() says so by
  // trimming it.
  // ==========================================
  const head2 = parts.join(' — ')
  const tail = d.descBy
  const gap = lang === 'ja' ? '' : ' '

  const build = list => head2
    + (list.length ? sentenceEnd(lang) + gap + capitalise(joinList(list, lang), lang) : '')
    + sentenceEnd(lang) + gap + tail

  // As many features as fit, dropped one at a time from the end.
  // All-or-nothing was the first version of this and it left a
  // Persian description at 87 characters with seventy going spare -
  // which is a description that fits and still under-answers,
  // because "بدون نیاز به اینترنت" is a reason somebody installs a
  // game and there was room to say it. The order they are dropped
  // in is the order they were added above: the least interesting
  // claim goes first.
  for (let count = features.length; count > 0; count--) {
    const candidate = build(features.slice(0, count))
    if (textWidth(candidate) <= DESC_LIMIT) return candidate
  }

  const bare = build([])
  if (textWidth(bare) <= DESC_LIMIT) return bare

  return clampWidth(head2, DESC_LIMIT - textWidth(tail) - 2) + sentenceEnd(lang) + gap + tail
}


// ==========================================
// altNameFor
// The game's name in the script the reader is reading in.
//
// `altNames` is an unordered list of spellings; which one belongs
// on a Japanese page is decided by the characters in it, not by
// its position. Detecting the script beats adding a keyed object
// to the registry, because the answer is already in the string and
// a key is one more thing to get wrong when a third spelling is
// added.
//
// Returns nothing for a Latin-script page: the Latin name is
// already the heading, and "Neon Katana (NeonKatana)" is a
// description wasting its best characters on a space.
// ==========================================
const SCRIPT_TESTS = {
  fa: /[\u0600-\u06FF]/,
  ja: /[\u3040-\u30FF\u4E00-\u9FFF]/
}

function altNameFor(game, lang) {
  const test = SCRIPT_TESTS[lang]
  if (!test) return ''
  return (game.altNames || []).find(name => test.test(name)) || ''
}


function fillDesc(template, values) {
  return Object.entries(values).reduce(
    (out, [key, value]) => out.replace('{' + key + '}', value),
    String(template || '')
  )
}

/** The list separator each language actually writes. */
function joinList(items, lang) {
  if (lang === 'ja') return items.join('・')
  if (lang === 'fa') return items.join('، ')
  return items.join(', ')
}

function sentenceEnd(lang) {
  return lang === 'ja' ? '。' : '.'
}

/** Sentence case, for the one language that has it. */
function capitalise(text, lang) {
  if (lang !== 'en' || !text) return text
  return text.charAt(0).toUpperCase() + text.slice(1)
}



// ==========================================
// fillVersionsDesc
// The changelog page's meta description.
//
// It used to be "<game> - Versions", which is a label rather than
// a description: a search result carrying it told a reader nothing
// they did not already know from the title, and a snippet
// generator with nothing to work from writes its own. This one
// names the game, says what the page holds, and quotes the newest
// release - which is the fact somebody searching "what changed in
// <game>" actually came for.
// ==========================================
function fillVersionsDesc(d, game, latest) {
  return String(d.versionsDesc || '')
    .replace('{game}', game.name)
    .replace('{version}', 'v' + (latest && latest.version ? latest.version : ''))
}


// A list from the landing blob, defended against a row written
// by something other than the panel. Every one of these arrays
// is JSON in a text column, so "an array of the right shape" is
// an assumption rather than a guarantee.
function rows(value, limit) {
  return (Array.isArray(value) ? value : []).slice(0, limit).filter(row => row && typeof row === 'object')
}


// ==========================================
// langRows
// A list that may have been written per language.
//
// Screenshots and trailers are the two sections where the same
// game is genuinely a different picture in each language: a
// text-heavy game shot in Persian is unreadable on the English
// page, and a Japanese trailer is the wrong video to put in front
// of a Persian visitor. Both are edited per language in the panel
// now, on top of one shared list.
//
// The rule is REPLACE, not merge. A language with its own list
// gets exactly that list; a language with an empty one gets the
// shared list. Merging two galleries of different lengths would
// produce an order nobody chose, and an operator who filled in
// three Japanese screenshots meant those three.
// ==========================================
function langRows(byLang, shared, lang, limit) {
  const own = (byLang && byLang[lang]) || []
  return rows(Array.isArray(own) && own.length ? own : shared, limit)
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
    /* ==========================================
       The game's name in the reader's own script.

       Inside the h1 rather than beside it, and that is the point:
       it is the same name, so it belongs to the same heading. A
       Persian reader searching "نئون کاتانا" now finds that string
       rendered on the page rather than only asserted in JSON-LD -
       which matters for two separate reasons. It is what a
       Persian speaker was looking for, and Google's structured
       data policy asks that markup describe content a user can
       actually see: alternateName on the VideoGame node is now
       backed by text on the page instead of being a claim only a
       crawler can check.

       Nothing renders on an English page - see altNameFor() - so
       the Latin heading never repeats itself.
       ========================================== */
    .ln-alt { display:block; font-size:.5em; font-weight:600; opacity:.72; margin-block-start:4px; }
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

    /* ---------- what Google sign-in is used for ----------
       Deliberately plain. This block is read by two audiences who
       want the same thing from it - somebody deciding whether to
       sign in, and a reviewer checking that the page discloses what
       the scopes are for - and neither is served by styling that
       makes it look like marketing. */
    /* pre-wrap because the text is edited in a textarea now: a
       line break somebody typed is a line break they meant. */
    .ln-google p{color:var(--dim);font-size:.94em;line-height:1.85;white-space:pre-wrap}
    .ln-google ul{margin:12px 0;padding-inline-start:20px;line-height:1.85;font-size:.94em}
    .ln-google li{margin-block-end:6px}
    .ln-google .ln-policy{display:flex;flex-wrap:wrap;gap:8px;margin-block-start:14px}

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

  // Both carry the language they were actually written in, not
  // the language of the page: pickLang falls back, so a Persian
  // page can be showing an English tagline, and a paragraph laid
  // out in the wrong direction is worse than one in the wrong
  // language.
  const tagline = pickLangCoded(game.landing.tagline, lang)
  const description = pickLangCoded(game.i18n && game.i18n.description, lang)
  if (!description.text && game.description) {
    // The bare `description` on a registry entry is the English
    // one-liner, so it is labelled as such rather than as the
    // page's language.
    description.text = game.description
    description.code = 'en'
  }

  const lede = tagline.text ? tagline : description

  return `
    <section class="ln-hero">
      ${hero ? `<div class="ln-hero-art" style="background-image:url('${escapeHtml(hero)}')"></div>` : ''}
      <div class="ln-hero-in">
        <span class="ln-logo">${escapeHtml(game.icon || '🎮')}${game.logo
          ? `<img src="${escapeHtml(game.logo)}" alt="" onerror="this.style.display='none'">` : ''}</span>
        <div class="ln-head">
          <h1 class="ln-title">${escapeHtml(game.name)}${altNameFor(game, lang)
            ? `<span class="ln-alt" lang="${escapeHtml(lang)}">${escapeHtml(altNameFor(game, lang))}</span>` : ''}</h1>
          <p class="ln-tag" dir="${dirOf(lede.code)}">${escapeHtml(lede.text)}</p>
          ${tagline.text && description.text && tagline.text !== description.text
            ? `<p class="ln-sub" dir="${dirOf(description.code)}">${escapeHtml(description.text)}</p>` : ''}
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
    extras.push(`<a class="gbtn gbtn--ghost" href="${escapeHtml(localizedPath(`/${game.id}/store`, lang))}">${escapeHtml(d.store)}</a>`)
  }
  if (game.capabilities.leaderboard) {
    extras.push(`<a class="gbtn gbtn--ghost" href="${escapeHtml(localizedPath(`/${game.id}/leaderboard`, lang))}">${escapeHtml(d.board)}</a>`)
  }
  if (game.capabilities.login) {
    extras.push(`<a class="gbtn gbtn--ghost" href="${escapeHtml(localizedPath(`/${game.id}/account`, lang))}">${escapeHtml(d.account)}</a>`)
  }
  extras.push(`<a class="gbtn gbtn--ghost" href="${escapeHtml(localizedPath(`/${game.id}/versions`, lang))}">${escapeHtml(d.versionsLink)}</a>`)

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
      href="${escapeHtml(localizedPath(`/${game.id}/download`, lang))}?store=${encodeURIComponent(key)}" rel="noopener">
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


// ==========================================
// disclosureHtml
// One block of plain text as paragraphs and a bullet list.
//
// The disclosure is stored and edited as TEXT - blank lines
// separate paragraphs, a line starting with "- ", "* " or "• " is
// a bullet - and this is the whole parser. It runs over the
// default copy and over an operator's own text alike, which is
// the point: what the panel shows in the box is exactly what the
// page renders, so editing the default is copy, paste, change a
// word, rather than guessing at markup that is not there.
//
// Nothing here interprets HTML. Every line goes through
// escapeHtml() before it reaches the document, because this is
// operator input on a public page.
// ==========================================
function disclosureHtml(text, dir = 'auto') {
  const out = []
  let paragraph = []
  let bullets = []

  const flushParagraph = () => {
    if (!paragraph.length) return
    out.push(`<p dir="${dir}">${escapeHtml(paragraph.join('\n'))}</p>`)
    paragraph = []
  }
  const flushBullets = () => {
    if (!bullets.length) return
    out.push(`<ul dir="${dir}">${bullets.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`)
    bullets = []
  }

  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim()
    if (!line) { flushBullets(); flushParagraph(); continue }

    const bullet = line.match(/^[-*•]\s+(.+)$/)
    if (bullet) { flushParagraph(); bullets.push(bullet[1].trim()); continue }

    flushBullets()
    paragraph.push(line)
  }

  flushBullets()
  flushParagraph()
  return out.join('')
}


// ==========================================
// googleBlock
// What a Google account is used for in this game.
//
// This used to be the tail of a larger "what this app is"
// section that also printed a generated sentence naming the game
// and a paragraph from Config.js. Both of those were removed:
// this page is written in the panel now, and a section that
// appeared on it without anybody adding it - and that no screen
// could edit - is the opposite of that.
//
// The Google half was the last thing on the page still holding
// its own words. It stayed outside the panel because it is not
// marketing copy - it is the disclosure an OAuth review looks
// for: which scopes are requested, what each one is actually used
// for, and how to withdraw access - and deriving it from the same
// `capabilities` flags that decide whether the account, store and
// leaderboard pages exist meant it could not drift from what the
// game really does.
//
// That derivation is still where the text comes from. What
// changed is who can edit it: the words now live in
// Content/GoogleDisclosure.js, the panel shows them as the
// baseline behind three empty boxes, and a game may be given its
// own heading and body or have the section switched off outright.
// The generated default is still what an untouched game renders,
// so nothing about this section moved by anybody not editing it.
//
// Two things are still not settings. A game with no sign-in
// renders nothing here whatever the row says, because there is
// nothing to disclose; and the two policy links stay, because
// they name pages that exist regardless of what the text above
// them says.
// ==========================================
function googleBlock(game, lang) {
  if (!game.capabilities.login) return ''

  const disclosure = googleDisclosureFor(game, lang)
  if (!disclosure.enabled) return ''

  // googleDisclosureFor() resolves this per language and falls
  // back to that language's own default rather than to another
  // language's stored text, so what comes back is always in
  // `lang` - which makes the page's direction the right one, with
  // no guessing from the first character.
  const dir = dirOf(lang)
  const body = disclosureHtml(disclosure.body, dir)
  if (!disclosure.head && !body) return ''

  const labels = POLICY_LABELS[lang] || POLICY_LABELS.fa

  return `<section class="gcard ln-sec">
      ${disclosure.head ? `<h2 class="ghead" dir="${dir}">${escapeHtml(disclosure.head)}</h2>` : ''}
      <div class="ln-google">
        ${body}
        <div class="ln-policy">
          <a class="gbtn gbtn--ghost" style="padding:8px 14px;font-size:.84em"
             href="${escapeHtml(localizedPath(`/${game.id}/privacy`, lang))}">${escapeHtml(labels.privacy)}</a>
          <a class="gbtn gbtn--ghost" style="padding:8px 14px;font-size:.84em"
             href="${escapeHtml(localizedPath(`/${game.id}/terms`, lang))}">${escapeHtml(labels.terms)}</a>
        </div>
      </div>
    </section>`
}


function featuresBlock(game, lang) {
  const d = dict(lang)
  const features = rows(game.landing.features, 8)
    .map(feature => {
      const label = pickLangCoded(feature, lang)
      if (!label.text) return ''
      return `<div class="ln-feat">
        <span class="ln-feat-icon" aria-hidden="true">${escapeHtml(feature.icon || '•')}</span>
        <span dir="${dirOf(label.code)}">${escapeHtml(label.text)}</span>
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
  const shots = langRows(game.landing.screenshotsByLang, game.landing.screenshots, lang, 12)
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
  const videos = langRows(game.landing.videosByLang, game.landing.videos, lang, 8)

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
  const about = pickLangCoded(game.landing.about, lang)
  if (!about.text) return ''

  return `<section class="gcard ln-sec">
      <h2 class="ghead">${escapeHtml(d.about)}</h2>
      <div class="ln-about" dir="${dirOf(about.code)}">${escapeHtml(about.text)}</div>
    </section>`
}


function productsBlock(game, lang) {
  const d = dict(lang)
  if (!game.capabilities.store) return ''

  const products = effectiveProducts(game).slice(0, 8)
  if (!products.length) return ''

  const items = products.map(product => {
    const name = pickLangCoded(product.i18n && product.i18n.name, lang)
    return `<span class="ln-prod">${escapeHtml(product.icon || '')}<b dir="${dirOf(name.code)}">${escapeHtml(name.text || product.id)}</b>
      <span>$${escapeHtml(product.priceUsd)}</span></span>`
  }).join('')

  return `<section class="gcard ln-sec">
      <h2 class="ghead">${escapeHtml(d.products)}</h2>
      <div class="ln-prods">${items}</div>
      <div style="margin-block-start:14px">
        <a class="gbtn" href="${escapeHtml(localizedPath(`/${game.id}/store`, lang))}">${escapeHtml(d.store)}</a>
      </div>
    </section>`
}


// ==========================================
// faqLd
// The same questions the FAQ block renders, as structured data.
//
// Built from the same array the section is built from, so the two
// cannot say different things - which is the one kind of FAQ
// markup a search engine treats as a violation rather than as
// noise.
// ==========================================
function faqLd(game, lang) {
  // Built through the shared helper rather than by hand, so this
  // page's FAQ markup and the About page's are the same shape -
  // and so `inLanguage` is set, which a hand-written copy here was
  // missing. An FAQ block with no declared language on a page that
  // exists in three is a set of answers a search engine cannot
  // safely show to anybody.
  return faqPageLd(
    rows(game.landing.faq, 12)
      .map(entry => ({ q: pickLang(entry.q, lang), a: pickLang(entry.a, lang) })),
    lang
  )
}


function faqBlock(game, lang) {
  const d = dict(lang)
  const items = rows(game.landing.faq, 12).map(entry => {
    const question = pickLangCoded(entry.q, lang)
    const answer = pickLangCoded(entry.a, lang)
    if (!question.text || !answer.text) return ''

    return `<details>
      <summary dir="${dirOf(question.code)}">${escapeHtml(question.text)}</summary>
      <p dir="${dirOf(answer.code)}">${escapeHtml(answer.text)}</p>
    </details>`
  }).filter(Boolean).join('')

  if (!items) return ''

  return `<section class="gcard ln-sec">
      <h2 class="ghead">${escapeHtml(d.faq)}</h2>
      <div class="ln-faq">${items}</div>
    </section>`
}


// ==========================================
// gameLd
// What a search engine is told this page is about: a game,
// which one, what it costs and which platforms it runs on.
//
// Returned as a node rather than as markup, because page() feeds
// it to Core/Seo.js along with the breadcrumb - which is also
// where the canonical, the hreflang set and the OpenGraph tags
// come from. This file used to emit its own copy of all of
// those beside the ones page() was already emitting, so every
// game page shipped two canonical links and two og:title tags
// that agreed with each other by accident and would not have
// stayed that way. Two canonicals is the expensive one: a
// crawler that finds a second one is entitled to ignore both.
// ==========================================
function gameLd(game, lang, origin, description, currentVersion) {
  const platforms = Object.keys((game.download && game.download.links) || {})
    .map(key => (key === 'web' ? 'Web browser' : key === 'apk' || key === 'myket' || key === 'googleplay' ? 'Android' : key))
  const unique = [...new Set(platforms)]

  // Everything below is read from the SAME data the body renders
  // a few lines further down, and that is the point of doing it
  // here rather than writing a second description for machines: a
  // page whose markup says one thing and whose prose says another
  // is a page a search engine has a reason to distrust, and this
  // page's prose is operator input that changes without a deploy.
  const features = rows(game.landing.features, 8)
    .map(feature => pickLang(feature, lang))
    .filter(Boolean)

  const screenshots = langRows(game.landing.screenshotsByLang, game.landing.screenshots, lang, 12)
    .map(shot => String(shot.url || ''))
    .filter(url => /^(https?:\/\/|\/)/i.test(url))
    .map(url => absolute(origin, url))

  // The first trailer only. A VideoObject list on a landing page
  // is a list of videos a search engine may show INSTEAD of the
  // page, and the second and third trailers are not what somebody
  // searching the game's name wanted.
  const firstVideo = langRows(game.landing.videosByLang, game.landing.videos, lang, 8)
    .map(entry => (typeof entry === 'string' ? { url: entry } : entry || {}))
    .find(entry => landingVideo(entry.url))

  const video = firstVideo
    ? videoObjectLd({
        name: firstVideo.title || game.name,
        description,
        embedUrl: landingVideo(firstVideo.url).embed,
        thumbnail: game.landing.hero || game.logo || CONFIG.DEFAULT_GAME_LOGO,
        lang
      })
    : null

  // Where else this exact game exists. A store listing and this
  // page are two documents about one game, and `sameAs` is the
  // only thing on either of them that says so - without it they
  // are two similarly named products as far as a crawler is
  // concerned, and the store listing is the one with the links.
  const storeLinks = Object.values((game.download && game.download.links) || {})
    .map(link => String(link || ''))
    .filter(link => /^https?:\/\//i.test(link))

  return videoGameLd({
    id: game.id,
    name: game.name,

    // The name in the scripts this site's own readers use. See
    // altNames in GAME_REGISTRY - this is the field that decides
    // whether a Persian search for the game finds the game.
    alternateName: game.altNames || [],

    description,
    path: '/' + game.id,
    image: game.landing.hero || game.logo || CONFIG.DEFAULT_GAME_LOGO,
    platforms: unique.length ? unique : ['Android'],
    genres: (game.tags || []).map(tag => pickLang(tag, lang)).filter(Boolean),
    featureList: features,
    screenshots,
    video,
    keywords: gameKeywords(game, lang),
    sameAs: storeLinks,
    identifier: game.package || '',
    version: currentVersion ? currentVersion.version : '',
    downloadUrl: isDownloadable(game) ? absolute(origin, '/' + game.id + '/download') : '',
    lang,
    available: isDownloadable(game)
  })
}


// ==========================================
// gameKeywords
// What THIS game is searched for.
//
// The name in every script it is written in, its tags in the
// page's language, its platforms, and the publisher - which is
// the pairing that matters most here. Somebody who has heard of
// the game and not the studio, and somebody who has heard of the
// studio and not the game, are two different searches, and a page
// that names both is the only place either of them can be joined
// up.
//
// Read by the landing page, the store page and the leaderboard,
// so all three of a game's public pages answer the same queries.
// ==========================================
export function gameKeywords(game, lang) {
  const tags = (game.tags || []).map(tag => pickLang(tag, lang)).filter(Boolean)
  const platforms = gamePlatforms(game)
  const alt = game.altNames || []

  return keywordList(
    game.name,
    alt,

    // The same name typed on an Arabic keyboard layout. See
    // persianSpellingVariants() - "نئون کاتانا" and "نئون كاتانا"
    // look identical and are different strings.
    persianSpellingVariants(alt),
    tags,
    platforms.android ? ['Android'] : [],
    platforms.web ? ['browser game'] : [],
    'AmirCollider'
  )
}


// ==========================================
// gameHead
// The two tags page() has no opinion about.
//
// `application-name` is here for one reason: Google's OAuth
// verification compares the name configured on the consent
// screen with the name this page claims for itself, and until
// now the only machine-readable name on it was og:site_name,
// which is the SITE - "AmirCollider" - and not the app.
// ==========================================
function gameHead(game) {
  return `
  <meta name="application-name" content="${escapeHtml(game.name)}">
  <meta name="apple-mobile-web-app-title" content="${escapeHtml(game.name)}">
  <meta name="theme-color" content="${escapeHtml(game.color || '#6c63ff')}">`
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
  const pitch = pickLang(game.landing.tagline, lang)
    || pickLang(game.i18n && game.i18n.description, lang)
    || game.description
    || ''

  // The pitch alone used to BE the description. See
  // landingDescription() for why twenty-two characters on this page
  // was the most expensive thing on the site.
  const description = landingDescription(game, lang, pitch)

  // ==========================================
  // The order of the page.
  //
  // "Where to get it" is LAST, under the FAQ. It used to sit
  // third, directly under the hero, which put the download button
  // above every reason to press it - the features, the
  // screenshots, the trailer and the answers to the questions
  // people ask before they install. A visitor who has read all of
  // that is the one ready to decide, so the decision belongs at
  // the point they reach it.
  //
  // Nothing is lost by moving it: the hero's own buttons, the top
  // navigation and the dashboard card all still link straight to
  // the download for anybody who arrived already decided.
  //
  // Every block between the hero and the Google disclosure
  // renders '' when the panel has nothing in it, so a page with
  // an empty settings row is the hero, the sign-in disclosure and
  // the download - and nothing that nobody wrote.
  // ==========================================
  const body = `
    <style>${landingCss()}</style>
    ${heroBlock(game, lang, current)}
    ${featuresBlock(game, lang)}
    ${shotsBlock(game, lang)}
    ${videosBlock(game, lang)}
    ${aboutBlock(game, lang)}
    ${devicesBlock(game, lang)}
    ${productsBlock(game, lang)}
    ${faqBlock(game, lang)}
    ${googleBlock(game, lang)}
    ${getBlock(game, lang)}`

  // "Neon Katana — Android game by AmirCollider" rather than
  // "Neon Katana — AmirCollider". The title is the first thing a
  // person reads in a result and the first string a review reads
  // off the page, and both of them want the same two facts from
  // it: which application this is, and what kind of thing it is.
  const kind = d.titleKind[gamePlatforms(game).kind] || d.titleKind.android
  const title = `${game.name} — ${kind} · AmirCollider`

  return createHtmlResponse(page({
    game, lang, theme,
    title,
    description,
    head: gameHead(game),
    siteName: game.name,
    keywords: gameKeywords(game, lang),
    seoGraph: [
      gameLd(game, lang, url.origin, description, current),
      faqLd(game, lang)
    ],
    ogImage: game.landing.hero || game.logo || CONFIG.DEFAULT_GAME_LOGO,
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
        <a href="${escapeHtml(localizedPath(`/${game.id}`, lang))}">${escapeHtml(d.backToGame)}</a>
      </p>
    </div>
    ${releases || empty}`

  return createHtmlResponse(page({
    game, lang, theme,
    title: `${d.versions} — ${game.name}`,

    // "Neon Katana - versions" said nothing a person searching
    // would recognise as an answer. This page IS the changelog, so
    // its description says so and names the newest release, which
    // is the fact somebody arriving from "what changed in <game>"
    // came for.
    description: versions.length
      ? fillVersionsDesc(d, game, versions[0])
      : fillDesc(d.versionsDescEmpty, { game: game.name }),
    keywords: keywordList(gameKeywords(game, lang), d.versions),
    active: 'versions',
    downloadable: isDownloadable(game),
    skipLabel: d.skip,
    body
  }), 200, langHeader(url, lang))
}
