// ==========================================
// Pages/Leaderboard.js
// Leaderboard Page Handler
// AmirCollider Games - Worker Proxy


// ==========================================
// Responsibilities
//   - Read the per-game leaderboard from the game's D1 binding and serve
//     it as either machine JSON (Accept: application/json) or a rendered
//     HTML page (browsers).
//
// Integration contract (do not break without updating callers)
//   - Public entry:  handleLeaderboardUnified(url, request, gameId,
//                                              requestId, GAMES, envVars)
//     (Worker.js invokes every handler with this exact argument order.)
//   - JSON shape stays stable for the Android client, Telegram bot and
//     the /testsite panel:
//       { leaderboard: [{ rank, username, displayName, highScore,
//                         photoURL, selectedColor, gameId }],
//         total, limit, returned, requestId, timestamp }
//   - "limit" is echoed back exactly as parsed so /leaderboard/:limit
//     consumers can assert on it.
//   - "total" is now the number of ranked players in the whole table,
//     not the number returned. It used to be a copy of "returned",
//     which made the "total players" figure on the page a restatement
//     of the row count directly underneath it. "returned" is
//     unchanged, so a caller that wanted the page size still has it.
//
// Two things this page does differently from the version before it
//
//   1. It is a page OF ITS GAME. It renders inside Pages/GameChrome,
//      so it carries the game's accent colour, the game's navigation
//      (game page / account / store / versions / download) and the
//      site header above that. It used to be a standalone document
//      painted in the site's default violet with no route back to the
//      game it was a leaderboard for - reachable, and then a dead end.
//
//   2. Only ranked players appear. A player with no score is not last
//      on the leaderboard, they are not on it: a signed-in account
//      that has never finished a run says nothing about who is
//      winning, and a hundred of them push the actual competition off
//      the first screen.
//
// Theme & language
//   - Theme: <html data-theme="light|dark">; absent attribute = follow OS.
//   - Language: server-resolved from ?lang= -> cookie -> Accept-Language.
//
// Extending
//   - Add a UI language: add one entry to LB_I18N.
//   - Change rank styling: edit rankTier() and the .lb-row-* CSS rules.
// ==========================================

import { validateGameId } from '../Config.js'
import { createJsonResponse, createHtmlResponse } from '../Core/Http.js'
import { logError } from '../Core/Logging.js'
import { escapeHtml } from '../Core/Html.js'
import { parseCookies, resolveLang, resolveRequestLang } from '../Core/RequestContext.js'
import { localizedPath } from '../Core/Locale.js'
import { readBoard } from '../Games/PlayerRecord.js'
import { chromeTheme, langHeader, page } from './GameChrome.js'
import { itemListLd, keywordList } from '../Core/Seo.js'
import { gameKeywords } from './GameLanding.js'

const MIN_LIMIT = 1
const MAX_LIMIT = 1000
const DEFAULT_LIMIT = 100


// ==========================================
// i18n - leaderboard chrome strings (fa / en / ja)
// ==========================================
const LB_I18N = {
  fa: {
    locale: 'fa-IR',
    metaTitle: 'جدول امتیازات',
    metaDesc: 'جدول امتیازات {game} — برترین بازیکنان، رتبه‌بندی زنده و بالاترین رکوردها.',
    heading: 'جدول امتیازات',
    subtitle: 'برترین بازیکنان {game}',
    statTotal: 'بازیکنان دارای امتیاز',
    statShown: 'نمایش داده‌شده',
    statTop: 'بالاترین امتیاز',
    statTopLevel: 'بالاترین مرحله',
    scoreLabel: 'امتیاز',
    emptyTitle: 'هنوز رکوردی ثبت نشده است',
    emptyText: 'اولین کسی باشید که در {game} امتیاز می‌گیرد.',
    actionGame: 'صفحه‌ی بازی',
    actionDownload: 'دانلود بازی',
    actionRefresh: 'بروزرسانی',
    note: 'فقط بازیکنانی که دست‌کم یک امتیاز ثبت کرده‌اند در این جدول دیده می‌شوند.',
    errorTitle: 'جدول امتیازات در دسترس نیست',
    errorText: 'همین حالا نتوانستیم رکوردها را بخوانیم. کمی بعد دوباره امتحان کنید؛ امتیازهای ثبت‌شده جایی نرفته‌اند.',
    skip: 'رفتن به محتوای اصلی'
  },
  en: {
    locale: 'en-US',
    metaTitle: 'Leaderboard',
    metaDesc: '{game} leaderboard — top players, live ranking and the highest scores recorded.',
    heading: 'Leaderboard',
    subtitle: 'Top players of {game}',
    statTotal: 'Ranked players',
    statShown: 'Showing',
    statTop: 'Highest score',
    statTopLevel: 'Highest level',
    scoreLabel: 'Score',
    emptyTitle: 'No scores yet',
    emptyText: 'Be the first to set a score in {game}.',
    actionGame: 'Game page',
    actionDownload: 'Download the game',
    actionRefresh: 'Refresh',
    note: 'Only players who have recorded at least one score appear on this board.',
    errorTitle: 'The leaderboard is unavailable',
    errorText: 'We could not read the scores just now. Try again shortly — nothing that was recorded has been lost.',
    skip: 'Skip to main content'
  },
  ja: {
    locale: 'ja-JP',
    metaTitle: 'リーダーボード',
    metaDesc: '{game} のリーダーボード — トッププレイヤー、ライブランキング、最高スコア。',
    heading: 'リーダーボード',
    subtitle: '{game} のトッププレイヤー',
    statTotal: 'ランク入りプレイヤー',
    statShown: '表示中',
    statTop: '最高スコア',
    statTopLevel: '最高ステージ',
    scoreLabel: 'スコア',
    emptyTitle: 'まだスコアがありません',
    emptyText: '{game} で最初のスコアを記録しましょう。',
    actionGame: 'ゲームページ',
    actionDownload: 'ゲームをダウンロード',
    actionRefresh: '更新',
    note: '1 回以上スコアを記録したプレイヤーのみがこのボードに表示されます。',
    errorTitle: 'リーダーボードを表示できません',
    errorText: '今はスコアを読み込めませんでした。しばらくしてからもう一度お試しください。記録されたスコアが失われることはありません。',
    skip: 'メインコンテンツへ'
  }
}


function pack(lang) {
  return LB_I18N[resolveLang(lang)]
}

function fill(template, values) {
  return String(template).replace(/\{(\w+)\}/g, (m, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : m
  )
}


// ==========================================
// SVG icon set (stroke uses currentColor)
// ==========================================
const ICONS = {
  trophy: '<path d="M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 0-3 3"/><path d="M12 13v4M8 21h8M9 21v-2h6v2"/>',
  crown: '<path d="M3 7l4 4 5-7 5 7 4-4-2 12H5z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  gamepad: '<line x1="6" y1="11" x2="10" y2="11"/><line x1="8" y1="9" x2="8" y2="13"/><line x1="15" y1="12" x2="15.01" y2="12"/><line x1="18" y1="10" x2="18.01" y2="10"/><rect x="2" y="6" width="20" height="12" rx="2"/>',
  download: '<path d="M12 3v12"/><path d="M7 11l5 5 5-5"/><path d="M5 21h14"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>'
}

function icon(name, cls) {
  return '<svg class="' + (cls || 'lb-ic') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
    + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + (ICONS[name] || '') + '</svg>'
}


// ==========================================
// Rank presentation
// Tier drives the gold/silver/bronze styling; #1 shows a crown.
// ==========================================
function rankTier(rank) {
  if (rank === 1) return 'is-gold'
  if (rank === 2) return 'is-silver'
  if (rank === 3) return 'is-bronze'
  return ''
}

function formatNumber(value, locale) {
  const n = Number(value) || 0
  try {
    return n.toLocaleString(locale)
  } catch {
    return String(n)
  }
}


/**
 * The avatar shown for a player with no profile photo.
 *
 * A data URI rather than the placehold.co request this used to
 * make: a leaderboard of a hundred players without photos was a
 * hundred requests to a third party, each one carrying the page's
 * Referer, and a blank row apiece whenever that third party was
 * slow or unreachable. This renders offline and instantly.
 */
function avatarFallback(name, accent) {
  const initial = String(name || '?').trim().charAt(0).toUpperCase() || '?'
  const safe = initial.replace(/[<>&"']/g, '')
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
    + '<rect width="64" height="64" rx="32" fill="' + accent + '" opacity="0.22"/>'
    + '<text x="32" y="43" font-family="system-ui,sans-serif" font-size="30" font-weight="700"'
    + ' text-anchor="middle" fill="' + accent + '">' + safe + '</text></svg>'
  return 'data:image/svg+xml,' + encodeURIComponent(svg)
}


// ==========================================
// Stylesheet
//
// Only what is specific to a leaderboard. Colours, fonts, spacing,
// the header, the footer and the responsive rules all come from
// GameChrome, which is what makes this page look like the game's
// other pages instead of like a different site.
// ==========================================
function leaderboardCss() {
  return `
    .lb-ic{width:18px;height:18px;flex:none}
    .lb-hero{text-align:center;display:flex;flex-direction:column;align-items:center;gap:10px;margin-block:6px 26px}
    .lb-badge{width:58px;height:58px;border-radius:18px;display:grid;place-items:center;color:var(--on-accent);
      background:linear-gradient(135deg,var(--accent),color-mix(in srgb,var(--accent) 45%,#fff));
      box-shadow:0 12px 30px color-mix(in srgb,var(--accent) 40%,transparent)}
    .lb-badge svg{width:29px;height:29px}
    .lb-hero h1{font-size:clamp(1.7em,4.5vw,2.4em);font-weight:800;line-height:1.2}
    .lb-hero p{color:var(--dim)}

    .lb-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-block-end:24px}
    .lb-stat{padding:18px 16px;border-radius:var(--radius);text-align:center;
      background:var(--surface);border:1px solid var(--border);
      display:flex;flex-direction:column;align-items:center;gap:6px;
      transition:transform .2s ease,border-color .2s ease}
    .lb-stat:hover{transform:translateY(-3px);border-color:color-mix(in srgb,var(--accent) 42%,var(--border))}
    .lb-stat-ic{color:color-mix(in srgb,var(--accent) 60%,var(--text))}
    .lb-stat-ic svg{width:20px;height:20px}
    .lb-stat-num{font-size:1.8em;font-weight:800;line-height:1;font-variant-numeric:tabular-nums;
      direction:ltr;unicode-bidi:isolate;color:color-mix(in srgb,var(--accent) 38%,var(--text))}
    .lb-stat-label{font-size:.8em;color:var(--dim)}

    .lb-board{display:flex;flex-direction:column;gap:11px}
    .lb-row{display:flex;align-items:center;gap:15px;padding:13px 17px;border-radius:var(--radius);
      background:var(--surface);border:1px solid var(--border);
      transition:transform .18s ease,border-color .18s ease,background .18s ease}
    .lb-row:hover{transform:translateY(-2px);background:var(--surface-2);
      border-color:color-mix(in srgb,var(--accent) 34%,var(--border))}

    .lb-rank{width:44px;height:44px;flex:none;border-radius:13px;display:grid;place-items:center;
      font-weight:800;font-size:1.02em;color:var(--text);direction:ltr;
      background:var(--surface-2);border:1px solid var(--border)}
    .lb-rank svg{width:21px;height:21px}
    .lb-row.is-gold   .lb-rank{color:#1c1606;background:linear-gradient(135deg,#ffd76a,#f0a93a);border-color:transparent}
    .lb-row.is-silver .lb-rank{color:#1b1f27;background:linear-gradient(135deg,#e6ecf5,#aab6c8);border-color:transparent}
    .lb-row.is-bronze .lb-rank{color:#1f1407;background:linear-gradient(135deg,#e6a96b,#b9743a);border-color:transparent}
    .lb-row.is-gold,.lb-row.is-silver,.lb-row.is-bronze{
      border-color:color-mix(in srgb,var(--accent) 24%,var(--border))}

    .lb-avatar{width:46px;height:46px;flex:none;border-radius:50%;object-fit:cover;
      background:var(--surface-2);border:2px solid var(--border)}
    .lb-row.is-gold   .lb-avatar{border-color:#f0a93a}
    .lb-row.is-silver .lb-avatar{border-color:#aab6c8}
    .lb-row.is-bronze .lb-avatar{border-color:#b9743a}

    .lb-who{flex:1;min-width:0}
    .lb-name{font-weight:700;font-size:1.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .lb-score{flex:none;font-weight:800;font-size:1.2em;direction:ltr;unicode-bidi:isolate;
      font-variant-numeric:tabular-nums;color:color-mix(in srgb,var(--accent) 40%,var(--text))}

    /* ---------- the numbers, and the thing being held ----------

       A row for a game that records a stage as well as a score
       carries three things on its trailing edge, in the order a
       reader wants them: WHAT they were holding, HOW FAR they
       got, and HOW MANY points that was worth. The score keeps
       the largest type because it is still the sort key and the
       ranking has to look like it means something.

       Every rule below applies only to a game that declares
       these in GAME_REGISTRY. A board without them renders the
       markup it always did and none of this matches. */
    .lb-meta{display:flex;align-items:center;gap:14px;flex:none}

    /* ---------- how big the held thing is drawn ----------

       The knife art is tall and narrow - 73 by 376 - so the size of
       this box is not a detail. A picture that escapes it does not
       come out a little too big, it comes out five times the height
       of the row and draws across the rows above and below.

       BOTH axes are absolute lengths, and that is the whole fix.
       This rule used to size the picture in percentages of its
       wrapper (width:100%;height:100% inside a 42px box), which
       reads as equivalent and is not: the wrapper is a grid whose
       item is centred rather than stretched, so the percentage
       HEIGHT resolved to auto while the percentage width resolved to
       42px - and an auto height on a replaced element comes from its
       own aspect ratio. 42px wide, 216px tall, measured in Chromium,
       not deduced. The width looked right the whole time, which is
       why the rule read as correct.

       max-width / max-height repeat the same length so no future
       rule can grow one axis without the other, and overflow:clip
       makes the wrapper the hard limit whatever any of them do: a
       leaderboard row is a place where a picture may be missing or
       ugly, and is not a place where a picture may be 216px tall.

       The glow moved from the picture to the wrapper for that clip.
       A filter is applied to what an element paints AFTER its own
       overflow has clipped it, so a shadow declared out here still
       spreads past the 42px edge while the picture inside cannot -
       the containment costs nothing visible. It also means the light
       stops turning with the blade: the offset is now the row's, not
       the picture's, so a spinning knife is lit from above through
       the whole turn instead of carrying its shadow around with it.

       The size lives on one custom property so the mobile rule below
       restates one number instead of six. */
    .lb-item{--lb-item:42px;width:var(--lb-item);height:var(--lb-item);flex:none;
      display:grid;place-items:center;overflow:clip;
      filter:drop-shadow(0 5px 12px color-mix(in srgb,var(--accent) 40%,transparent))}
    .lb-item img{width:var(--lb-item);height:var(--lb-item);
      max-width:var(--lb-item);max-height:var(--lb-item);object-fit:contain;display:block}


    .lb-level{flex:none;text-align:center;min-width:46px;line-height:1.15}
    .lb-level-num{display:block;font-weight:800;font-size:1.02em;direction:ltr;unicode-bidi:isolate;
      font-variant-numeric:tabular-nums;color:var(--text)}
    .lb-level-tag{display:block;font-size:.68em;color:var(--dim);white-space:nowrap}

    /* The score gets the same two-line treatment once it has a
       neighbour, so the two numbers read as a pair rather than
       as one number and one unlabelled figure beside it. A board
       with no level keeps the single-line .lb-score exactly as
       it was. */
    .lb-row.has-meta .lb-score{text-align:center;min-width:64px;line-height:1.15}
    .lb-row.has-meta .lb-score b{display:block;font-size:1em;font-weight:800}
    .lb-row.has-meta .lb-score span{display:block;font-size:.68em;color:var(--dim);
      font-weight:600;white-space:nowrap}

    @media (max-width:520px){
      .lb-meta{gap:9px}
      .lb-item{--lb-item:32px}
      .lb-level{min-width:34px}
      .lb-row.has-meta .lb-score{min-width:52px}
      .lb-level-tag,.lb-row.has-meta .lb-score span{font-size:.62em}
    }

    .lb-empty{text-align:center;padding:52px 24px;border-radius:var(--radius);
      background:var(--surface);border:1px solid var(--border)}
    .lb-empty-ic{width:68px;height:68px;margin:0 auto 16px;border-radius:20px;display:grid;place-items:center;
      color:color-mix(in srgb,var(--accent) 58%,var(--text));
      background:color-mix(in srgb,var(--accent) 12%,transparent);
      border:1px solid color-mix(in srgb,var(--accent) 28%,transparent)}
    .lb-empty-ic svg{width:32px;height:32px}
    .lb-empty h2{font-size:1.25em;font-weight:800;margin-block-end:8px}
    .lb-empty p{color:var(--dim)}

    .lb-note{margin-block-start:18px;font-size:.82em;color:var(--dim);text-align:center}
    .lb-actions{display:flex;flex-wrap:wrap;gap:11px;justify-content:center;margin-block-start:26px}

    @media (max-width:480px){
      .lb-row{padding:11px 13px;gap:11px}
      .lb-rank{width:38px;height:38px}
      .lb-avatar{width:40px;height:40px}
      .lb-score{font-size:1.05em}
    }

    @media (prefers-reduced-motion:no-preference){
      .lb-row{animation:lbRise .42s cubic-bezier(.16,1,.3,1) both;animation-delay:calc(.035s * var(--i,0) + .1s)}

      /* Two animations rather than one, on two elements rather
         than one, because both would be animating the transform
         property and the second declaration would simply win.
         The wrapper rises and falls; the picture inside turns. */
      .lb-item.is-spin{animation:lbBob 3.4s ease-in-out infinite;
        animation-delay:calc(.18s * var(--i,0))}

      /* A turning picture sweeps a circle as wide as its longest side, so a
         blade that exactly fills the box spends most of the turn outside it,
         over the score beside it and the row above. Scaled to fit that
         circle inside the box instead: 1/root-2, rounded down.

         Inside this media query rather than beside the size rules, because
         it is the rotation that needs the room. A reader who asked not to be
         animated gets a still knife at full size. */
      .lb-item.is-spin img{animation:lbSpin 7s linear infinite;
        width:calc(var(--lb-item) * .7);height:calc(var(--lb-item) * .7);
        max-width:calc(var(--lb-item) * .7);max-height:calc(var(--lb-item) * .7)}
    }
    @keyframes lbRise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
    @keyframes lbBob{0%,100%{transform:translateY(-2px)}50%{transform:translateY(2px)}}
    @keyframes lbSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
  `
}


// ==========================================
// Partials
// ==========================================
function renderHero(lang, gameName) {
  const p = pack(lang)
  return `
    <div class="lb-hero">
      <span class="lb-badge">${icon('trophy')}</span>
      <h1>${escapeHtml(p.heading)}</h1>
      <p dir="auto">${escapeHtml(fill(p.subtitle, { game: gameName }))}</p>
    </div>`
}

function renderStats(lang, total, shown, topScore, board, topLevel) {
  const p = pack(lang)
  const items = [
    { ic: 'users', value: formatNumber(total, p.locale), label: p.statTotal },
    { ic: 'list', value: formatNumber(shown, p.locale), label: p.statShown },
    { ic: 'spark', value: formatNumber(topScore, p.locale), label: p.statTop }
  ]

  // A fourth tile only for a game that records a stage. The grid
  // is auto-fit, so three and four both lay out without a rule
  // of their own.
  if (board && board.level) {
    items.push({ ic: 'layers', value: formatNumber(topLevel, p.locale), label: p.statTopLevel })
  }

  const cells = items.map(it =>
    '<div class="lb-stat"><span class="lb-stat-ic">' + icon(it.ic) + '</span>'
    + '<span class="lb-stat-num">' + escapeHtml(it.value) + '</span>'
    + '<span class="lb-stat-label">' + escapeHtml(it.label) + '</span></div>'
  ).join('')
  return '<div class="lb-stats">' + cells + '</div>'
}


// ==========================================
// The equipped item, as one picture
//
// Everything about it is declared by the game: which keys exist,
// what each one is called in three languages, whether it turns.
// This function knows only how to draw one, which is why adding
// a fourth knife is a registry edit and not a page edit.
//
// A key with no option (renamed item, an old build) has already
// been resolved to the game's default by readBoard(), so what
// arrives here is always drawable or empty - and empty renders
// nothing at all rather than a broken image with a reserved gap
// beside every name.
//
// The alt text is the item's own name because the picture IS
// information here: it is what the player bought, and a reader
// on a screen reader is owed the same row as everybody else.
// ==========================================
function renderItem(board, key, lang) {
  const item = board && board.item
  if (!item) return ''

  const option = item.options[key]
  if (!option) return ''

  const label = option.i18n[lang] || option.i18n.en || key

  return `<span class="lb-item${item.spin ? ' is-spin' : ''}">
      <img src="${escapeHtml(option.image)}" alt="${escapeHtml(label)}" title="${escapeHtml(label)}"
           loading="lazy" decoding="async"
           onerror="this.closest('.lb-item').style.display='none'">
    </span>`
}

function renderRow(player, index, lang, accent, board) {
  const p = pack(lang)
  const locale = p.locale
  const tier = rankTier(player.rank)
  const name = player.displayName || player.username || 'Unknown'
  const rankInner = player.rank === 1 ? icon('crown') : escapeHtml(formatNumber(player.rank, locale))
  const fallback = avatarFallback(name, accent)
  const photo = player.photoURL || fallback

  const level = board && board.level
    ? `<div class="lb-level">
         <span class="lb-level-num">${escapeHtml(formatNumber(player.highLevel, locale))}</span>
         <span class="lb-level-tag">${escapeHtml(board.level.i18n[lang] || board.level.i18n.en)}</span>
       </div>`
    : ''

  const hasMeta = Boolean((board && board.level) || (board && board.item))

  // The score is the one figure that changes shape: on its own
  // it stays the big unlabelled number it has always been, and
  // beside a stage it grows a caption so the pair reads as two
  // named quantities instead of one number and one orphan.
  const score = hasMeta
    ? `<div class="lb-score">
         <b>${escapeHtml(formatNumber(player.highScore, locale))}</b>
         <span>${escapeHtml(p.scoreLabel)}</span>
       </div>`
    : `<div class="lb-score">${escapeHtml(formatNumber(player.highScore, locale))}</div>`

  const meta = hasMeta
    ? `<div class="lb-meta">${renderItem(board, player.selectedItem, lang)}${level}${score}</div>`
    : score

  return `
    <div class="lb-row ${tier}${hasMeta ? ' has-meta' : ''}" style="--i: ${index};">
      <div class="lb-rank" aria-label="#${player.rank}">${rankInner}</div>
      <img class="lb-avatar" src="${escapeHtml(photo)}" alt="" loading="lazy" decoding="async"
           onerror="this.onerror=null;this.src='${escapeHtml(fallback)}'">
      <div class="lb-who"><div class="lb-name" dir="auto">${escapeHtml(name)}</div></div>
      ${meta}
    </div>`
}

function renderBoard(players, lang, gameName, accent, board) {
  const p = pack(lang)
  if (!players.length) {
    return `
      <div class="lb-empty">
        <div class="lb-empty-ic">${icon('trophy')}</div>
        <h2>${escapeHtml(p.emptyTitle)}</h2>
        <p dir="auto">${escapeHtml(fill(p.emptyText, { game: gameName }))}</p>
      </div>`
  }
  const rows = players.map((player, i) => renderRow(player, i, lang, accent, board)).join('')
  return '<div class="lb-board">' + rows + '</div>'
}

// These three links used to append `?lang=` by hand so that the
// language survived the click. The language is in the path now, so
// carrying it is what localizedPath() already does - and the
// hand-built query was the last place on a public page that still
// produced one.
function renderActions(lang, game, downloadable) {
  const p = pack(lang)
  const at = suffix => escapeHtml(localizedPath('/' + game.id + suffix, lang))

  const download = downloadable
    ? `<a class="gbtn gbtn--ghost" href="${at('/download')}">
         ${icon('download')}<span>${escapeHtml(p.actionDownload)}</span></a>`
    : ''

  return `
    <div class="lb-actions">
      <a class="gbtn" href="${at('')}">
        ${icon('gamepad')}<span>${escapeHtml(p.actionGame)}</span>
      </a>
      ${download}
      <a class="gbtn gbtn--ghost" href="${at('/leaderboard')}">
        ${icon('refresh')}<span>${escapeHtml(p.actionRefresh)}</span>
      </a>
    </div>`
}


// ==========================================
// Data
//
// One function, readBoard() in Games/PlayerRecord.js, answers
// all three questions this page has: who is on the board, what
// each row says, and how many there are in total. The rows and
// the count carry the same filter, so the "ranked players"
// figure and the list underneath it can never disagree - and it
// is the SAME function Api/PlayerDataApi.js calls, so this page
// and the copy of the board the game client reads cannot either.
//
// Every optional part is probed rather than assumed: a game
// database that has not run 0006 has no banned_at, one that has
// not run 0010 has no leaderboard_opt_out, and one that has not
// run 0012 has no high_level or selected_item. A leaderboard
// that 500s on an older schema is worse than one that shows a
// banned player, so an absent column drops its condition or its
// column and the board still renders.
//
// A player who has opted out is not ranked and then hidden -
// they are not in the query at all. That is what keeps the ranks
// contiguous and leaves nothing to infer a hidden player from.
// ==========================================


// ==========================================
// Helper: parse the trailing /:limit segment (clamped)
// ==========================================
function parseLimit(url) {
  const parts = url.pathname.split('/').filter(Boolean)
  const parsed = parseInt(parts[parts.length - 1], 10)
  if (!Number.isNaN(parsed) && parsed >= MIN_LIMIT && parsed <= MAX_LIMIT) return parsed
  return DEFAULT_LIMIT
}


// ==========================================
// Page
// ==========================================
function createLeaderboardPage({ players, game, total, limit, lang, theme, games }) {
  const resolved = resolveLang(lang)
  const p = pack(resolved)
  const accent = /^#[0-9a-fA-F]{6}$/.test(String(game.color || '')) ? game.color : '#6c63ff'
  const topScore = players.length ? players[0].highScore : 0
  const downloadable = Boolean(game.download && game.download.primary)

  // What this game's board carries beyond a name and a score, as
  // declared in GAME_REGISTRY. Null-safe for a game whose entry
  // predates the block, which renders the board every game had.
  const board = game.leaderboard || null

  // The highest stage anybody has reached, which is NOT the top
  // row's: the board is sorted by score, and the player who got
  // furthest is not always the one who scored most. Read across
  // every row that is on the page rather than taken from the
  // first, because a headline figure that contradicts the list
  // below it is worse than no figure.
  const topLevel = board && board.level
    ? players.reduce((best, player) => Math.max(best, Number(player.highLevel) || 0), 0)
    : 0

  const body = `
    ${renderHero(resolved, game.name)}
    ${renderStats(resolved, total, players.length, topScore, board, topLevel)}
    ${renderBoard(players, resolved, game.name, accent, board)}
    <p class="lb-note">${escapeHtml(p.note)}</p>
    ${renderActions(resolved, game, downloadable)}`

  return page({
    game,
    games,
    lang: resolved,
    theme,
    title: `${p.metaTitle} — ${game.name} | AmirCollider`,
    description: fill(p.metaDesc, { game: game.name }),
    active: 'board',
    path: `/${game.id}/leaderboard`,
    skipLabel: p.skip,
    downloadable,
    head: `<style>${leaderboardCss()}</style>`,
    body,
    keywords: keywordList(gameKeywords(game, resolved), p.metaTitle),
    seoGraph: [itemListLd({
      name: `${p.metaTitle} — ${game.name}`,
      lang: resolved,
      ordered: true,
      items: players.slice(0, 10).map(player => ({
        position: player.rank,
        name: player.displayName
      }))
    })]
  })
}


// ==========================================
// Page: the board could not be read
//
// A browser used to get the raw JSON error for this - which is the
// dead end this rewrite exists to remove. The page still answers
// with the failing status, so a crawler and a monitor both see the
// truth; what changes is that a person sees a sentence and a way
// out instead of a brace.
// ==========================================
function createUnavailablePage({ game, lang, theme, games }) {
  const resolved = resolveLang(lang)
  const p = pack(resolved)
  const downloadable = Boolean(game.download && game.download.primary)

  const body = `
    ${renderHero(resolved, game.name)}
    <div class="lb-empty">
      <div class="lb-empty-ic">${icon('trophy')}</div>
      <h2>${escapeHtml(p.errorTitle)}</h2>
      <p dir="auto">${escapeHtml(p.errorText)}</p>
    </div>
    ${renderActions(resolved, game, downloadable)}`

  return page({
    game,
    games,
    lang: resolved,
    theme,
    title: `${p.metaTitle} — ${game.name} | AmirCollider`,
    description: fill(p.metaDesc, { game: game.name }),
    active: 'board',
    path: `/${game.id}/leaderboard`,
    skipLabel: p.skip,
    downloadable,
    noindex: true,
    head: `<style>${leaderboardCss()}</style>`,
    body
  })
}


// ==========================================
// Handler: Unified Leaderboard (JSON or HTML by Accept header)
// ==========================================
export async function handleLeaderboardUnified(url, request, gameId, requestId, GAMES, envVars) {
  const wantsJson = (request.headers.get('Accept') || '').includes('application/json')

  const game = validateGameId(gameId, GAMES)
  if (!game) {
    return createJsonResponse({ error: 'invalid_game', message: 'Game configuration not found', requestId }, 400)
  }

  const games = Object.values(GAMES || {})

  // ==========================================
  // What a crawler gets when the board cannot be read.
  //
  // The JSON status is unchanged: shipped Unity builds read this
  // endpoint and a status code is the kind of thing a client
  // switches on, so it stays exactly what it has always been.
  //
  // The HTML answer is a different audience and gets a different
  // code. This URL is in sitemap.xml at changefreq=daily, so a
  // crawler fetches it often; a 500 tells that crawler the page is
  // BROKEN, and a page that is broken twice is a page it drops. A
  // 503 with Retry-After says the opposite - temporarily away, come
  // back - which is what an unbound binding or a slow D1 actually
  // is. Google documents 503 as the correct code for exactly this
  // and treats it as "keep the URL, try later".
  //
  // The page also carries noindex (see createUnavailablePage), and
  // that is belt and braces rather than the main mechanism: a
  // crawler does not index the body of a 5xx at all, and does not
  // act on a noindex it finds in one. What the meta tag actually
  // buys is the day this path regresses to answering 200 - on that
  // day the fallback page still does not enter the index.
  //
  // The 503 is what protects the URL. A noindex served on a 200
  // would remove a good page permanently, and getting it back
  // takes weeks.
  // ==========================================
  const unavailable = (error, message, status) => {
    if (wantsJson) return createJsonResponse({ error, message, requestId }, status)
    const lang = resolveRequestLang(url, request, parseCookies(request))
    return createHtmlResponse(
      createUnavailablePage({ game, lang, theme: chromeTheme(request), games }),
      503,
      { 'Retry-After': '3600', 'Cache-Control': 'no-store' }
    )
  }

  if (!game.d1Binding) {
    return unavailable('no_database', 'No database configured for this game', 500)
  }

  const db = envVars[game.d1Binding]
  if (!db) {
    return unavailable('db_not_bound', `D1 binding "${game.d1Binding}" not found`, 500)
  }

  const limit = parseLimit(url)

  try {
    const { rows: players, total } = await readBoard(db, {
      board: game.leaderboard || null,
      limit,
      withTotal: true
    })

    if (wantsJson) {
      return createJsonResponse({
        // gameId has been on every row of this endpoint's JSON
        // since it existed and shipped clients read it, so it is
        // attached here rather than inside readBoard() - the
        // game's own copy of the board at
        // /database/get/games/:id/leaderboard has never carried
        // it, and giving one shared query two output shapes is
        // how the two boards drifted apart the first time.
        leaderboard: players.map(player => ({ ...player, gameId: game.id })),
        total,
        limit,
        returned: players.length,
        requestId,
        timestamp: new Date().toISOString()
      }, 200)
    }

    const lang = resolveRequestLang(url, request, parseCookies(request))
    const theme = chromeTheme(request)
    const headers = langHeader(url, lang)

    const html = createLeaderboardPage({
      players, game, total, limit, lang, theme, games: Object.values(GAMES || {})
    })
    return createHtmlResponse(html, 200, headers)

  } catch (error) {
    logError('Leaderboard handler error', { requestId, gameId, error: error.message })
    return unavailable('server_error', 'Failed to load leaderboard', 500)
  }
}
