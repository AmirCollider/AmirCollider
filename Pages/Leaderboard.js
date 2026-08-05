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
import { chromeTheme, langHeader, page } from './GameChrome.js'

const MIN_LIMIT = 1
const MAX_LIMIT = 1000
const DEFAULT_LIMIT = 100

// The lowest score that puts a player on the board. Above zero, so
// an account that has signed in but never scored is absent rather
// than ranked last with nothing.
const MIN_RANKED_SCORE = 0


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
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>'
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
    .lb-badge{width:58px;height:58px;border-radius:18px;display:grid;place-items:center;color:#fff;
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
    }
    @keyframes lbRise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
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

function renderStats(lang, total, shown, topScore) {
  const p = pack(lang)
  const items = [
    { ic: 'users', value: formatNumber(total, p.locale), label: p.statTotal },
    { ic: 'list', value: formatNumber(shown, p.locale), label: p.statShown },
    { ic: 'spark', value: formatNumber(topScore, p.locale), label: p.statTop }
  ]
  const cells = items.map(it =>
    '<div class="lb-stat"><span class="lb-stat-ic">' + icon(it.ic) + '</span>'
    + '<span class="lb-stat-num">' + escapeHtml(it.value) + '</span>'
    + '<span class="lb-stat-label">' + escapeHtml(it.label) + '</span></div>'
  ).join('')
  return '<div class="lb-stats">' + cells + '</div>'
}

function renderRow(player, index, locale, accent) {
  const tier = rankTier(player.rank)
  const name = player.displayName || player.username || 'Unknown'
  const rankInner = player.rank === 1 ? icon('crown') : escapeHtml(formatNumber(player.rank, locale))
  const fallback = avatarFallback(name, accent)
  const photo = player.photoURL || fallback

  return `
    <div class="lb-row ${tier}" style="--i: ${index};">
      <div class="lb-rank" aria-label="#${player.rank}">${rankInner}</div>
      <img class="lb-avatar" src="${escapeHtml(photo)}" alt="" loading="lazy" decoding="async"
           onerror="this.onerror=null;this.src='${escapeHtml(fallback)}'">
      <div class="lb-who"><div class="lb-name" dir="auto">${escapeHtml(name)}</div></div>
      <div class="lb-score">${escapeHtml(formatNumber(player.highScore, locale))}</div>
    </div>`
}

function renderBoard(players, lang, gameName, accent) {
  const p = pack(lang)
  if (!players.length) {
    return `
      <div class="lb-empty">
        <div class="lb-empty-ic">${icon('trophy')}</div>
        <h2>${escapeHtml(p.emptyTitle)}</h2>
        <p dir="auto">${escapeHtml(fill(p.emptyText, { game: gameName }))}</p>
      </div>`
  }
  const rows = players.map((player, i) => renderRow(player, i, p.locale, accent)).join('')
  return '<div class="lb-board">' + rows + '</div>'
}

function renderActions(lang, game, downloadable) {
  const p = pack(lang)
  const q = '?lang=' + encodeURIComponent(resolveLang(lang))
  const download = downloadable
    ? `<a class="gbtn gbtn--ghost" href="/${escapeHtml(game.id)}/download">
         ${icon('download')}<span>${escapeHtml(p.actionDownload)}</span></a>`
    : ''

  return `
    <div class="lb-actions">
      <a class="gbtn" href="/${escapeHtml(game.id)}${q}">
        ${icon('gamepad')}<span>${escapeHtml(p.actionGame)}</span>
      </a>
      ${download}
      <a class="gbtn gbtn--ghost" href="/${escapeHtml(game.id)}/leaderboard${q}">
        ${icon('refresh')}<span>${escapeHtml(p.actionRefresh)}</span>
      </a>
    </div>`
}


// ==========================================
// Data
//
// Both queries carry the same two filters, so the "ranked players"
// figure and the rows underneath it can never disagree.
//
// Each is tried with the banned_at predicate and retried without
// it, because a game database that has not run migration 0006 does
// not have that column - and a leaderboard that 500s on an old
// schema is worse than one that shows a banned player.
// ==========================================
async function fetchTopPlayers(db, limit, gameId) {
  let results
  try {
    ({ results } = await db.prepare(`
      SELECT username AS displayName, high_score AS highScore,
             profile_pic_url AS photoURL, selected_color AS selectedColor
      FROM players
      WHERE banned_at IS NULL AND high_score > ?
      ORDER BY high_score DESC
      LIMIT ?
    `).bind(MIN_RANKED_SCORE, limit).all())
  } catch {
    ({ results } = await db.prepare(`
      SELECT username AS displayName, high_score AS highScore,
             profile_pic_url AS photoURL, selected_color AS selectedColor
      FROM players
      WHERE high_score > ?
      ORDER BY high_score DESC
      LIMIT ?
    `).bind(MIN_RANKED_SCORE, limit).all())
  }

  return (results || []).map((row, index) => ({
    rank: index + 1,
    username: row.displayName || 'Unknown User',
    displayName: row.displayName || 'Unknown User',
    highScore: row.highScore || 0,
    photoURL: row.photoURL || '',
    selectedColor: row.selectedColor || 'FFFFFF',
    gameId
  }))
}

async function countRankedPlayers(db) {
  const read = async sql => {
    const row = await db.prepare(sql).bind(MIN_RANKED_SCORE).first()
    return Number(row && row.total) || 0
  }
  try {
    return await read('SELECT COUNT(*) AS total FROM players WHERE banned_at IS NULL AND high_score > ?')
  } catch {
    return await read('SELECT COUNT(*) AS total FROM players WHERE high_score > ?')
  }
}


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

  const body = `
    ${renderHero(resolved, game.name)}
    ${renderStats(resolved, total, players.length, topScore)}
    ${renderBoard(players, resolved, game.name, accent)}
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
    seoGraph: [{
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `${p.metaTitle} — ${game.name}`,
      numberOfItems: players.length,
      itemListOrder: 'https://schema.org/ItemListOrderDescending',
      itemListElement: players.slice(0, 10).map(player => ({
        '@type': 'ListItem',
        position: player.rank,
        name: player.displayName
      }))
    }]
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
  const unavailable = (error, message, status) => {
    if (wantsJson) return createJsonResponse({ error, message, requestId }, status)
    const lang = resolveRequestLang(url, request, parseCookies(request))
    return createHtmlResponse(
      createUnavailablePage({ game, lang, theme: chromeTheme(request), games }),
      status
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
    const players = await fetchTopPlayers(db, limit, game.id)
    const total = await countRankedPlayers(db).catch(() => players.length)

    if (wantsJson) {
      return createJsonResponse({
        leaderboard: players,
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
