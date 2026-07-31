// ==========================================
// pages/gameApi.js
// The endpoints a game client talks to, and the download link
// the offline switch controls.
//
// Public entry points (wired in worker.js ROUTES):
//   GET  /games/:gameId/manifest             what state is this game in
//   GET  /games/:gameId/products             the catalogue, priced
//   GET  /games/:gameId/entitlements         what this player owns
//   POST /games/:gameId/entitlements/consume spend a consumable
//   GET  /:gameId/download                   the download link, gated
//
// The first two are public and cacheable; everything in them is
// already visible on the game's own web page. The last two need
// the player, proved by either a Google id_token in an
// Authorization header (a game) or the site session cookie (a
// browser).
//
// ------------------------------------------------------------
// WHY A MANIFEST ENDPOINT EXISTS AT ALL
// ------------------------------------------------------------
// Everything an operator changes in the /thegod panel - the
// download withdrawn, a product taken off sale, a minimum
// version raised - is invisible to a build that is already on
// somebody's phone. Without one call at boot, the only way a
// player learns their game changed is by hitting the thing that
// changed and getting an error.
// ==========================================

import { createJsonResponse, createHtmlResponse, logInfo, logWarning } from '../utils.js'
import { getPageHead } from '../shared-styles.js'
import { CONFIG, getGameProduct } from '../config.js'
import { resolveGame, gameManifest, isDownloadable, downloadUrl } from '../games/registry.js'
import { db, listEntitlements, consumeEntitlement } from '../games/store.js'
import { requirePlayer } from '../games/session.js'

const LANGS = ['fa', 'en', 'ja']
const DEFAULT_LANG = 'fa'


function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function langFrom(url, request) {
  const query = (url.searchParams.get('lang') || '').toLowerCase()
  if (LANGS.includes(query)) return query

  const cookie = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)lang=([^;]+)/)
  if (cookie && LANGS.includes(cookie[1])) return cookie[1]

  const accept = (request.headers.get('Accept-Language') || '').toLowerCase()
  for (const code of LANGS) if (accept.includes(code)) return code
  return DEFAULT_LANG
}

function gameIdFromPath(url, prefix) {
  const parts = url.pathname.split('/').filter(Boolean)
  return prefix ? (parts[1] || '') : (parts[0] || '')
}

function notFound(requestId) {
  return createJsonResponse({
    ok: false, error: 'unknown_game',
    message: 'No game with that id. Games are defined in GAME_REGISTRY in config.js.',
    requestId
  }, 404)
}


// ==========================================
// handleGameManifest
// GET /games/:gameId/manifest
//
// Cached for a minute at the edge. A shipped build calls this
// at boot and the answer changes when an operator presses save
// - a minute of staleness is invisible to a player and removes
// a database read from every cold start of every install.
// ==========================================
export async function handleGameManifest(url, request, gameId, requestId, GAMES, env) {
  const id = gameIdFromPath(url, true)
  const game = await resolveGame(env, GAMES, id)
  if (!game) return notFound(requestId)

  return createJsonResponse(gameManifest(game, url.origin), 200, {
    'Cache-Control': 'public, max-age=60'
  })
}


// ==========================================
// handleGameProducts
// GET /games/:gameId/products
//
// The catalogue only, for a client that wants to draw a shop
// without the rest of the manifest. Products withdrawn in the
// panel are already gone from this list, so a client that
// renders everything it is given renders the right thing.
// ==========================================
export async function handleGameProducts(url, request, gameId, requestId, GAMES, env) {
  const id = gameIdFromPath(url, true)
  const game = await resolveGame(env, GAMES, id)
  if (!game) return notFound(requestId)

  if (!game.capabilities.store) {
    return createJsonResponse({ ok: true, gameId: game.id, products: [] }, 200)
  }

  const manifest = gameManifest(game, url.origin)
  return createJsonResponse({
    ok: true,
    gameId: game.id,
    currency: 'usd',
    products: manifest.products
  }, 200, { 'Cache-Control': 'public, max-age=60' })
}


// ==========================================
// handleGameEntitlements
// GET /games/:gameId/entitlements
//
// The authoritative answer to "what does this player own?".
//
// Never cached, at any layer. A player who has just bought
// something and is looking at the shop is the exact case a
// cache gets wrong, and it is the only case anybody notices.
//
// `owned` is computed here rather than left to the client: a
// non-consumable is owned when a row exists, a consumable when
// the balance is above zero, and a pass when it has not
// expired. Three different rules is three chances for a client
// to implement one of them differently.
// ==========================================
export async function handleGameEntitlements(url, request, gameId, requestId, GAMES, env) {
  const id = gameIdFromPath(url, true)
  const game = await resolveGame(env, GAMES, id)
  if (!game) return notFound(requestId)

  const database = db(env)
  if (!database) {
    return createJsonResponse({ ok: false, error: 'not_configured' }, 503)
  }

  const player = await requirePlayer(env, GAMES, request)
  if (!player) {
    return createJsonResponse({
      ok: false, error: 'unauthorized',
      message: 'Send Authorization: Bearer <google id_token>, or sign in at /' + game.id + '/account.'
    }, 401)
  }

  const rows = await listEntitlements(database, game.id, player.playerId)

  return createJsonResponse({
    ok: true,
    gameId: game.id,
    playerId: player.playerId,
    entitlements: rows.map(row => {
      const product = getGameProduct(game, row.product_id)
      return {
        productId: row.product_id,
        sku: (product && product.sku) || '',
        kind: row.kind,
        quantity: row.quantity,
        lifetime: row.lifetime,
        source: row.source,
        expiresAt: row.expires_at || 0,
        owned: row.kind === 'consumable' ? row.quantity > 0 : true,
        grant: (product && product.grant) || null
      }
    })
  }, 200, { 'Cache-Control': 'no-store' })
}


// ==========================================
// handleGameConsume
// POST /games/:gameId/entitlements/consume
//
// Spending is a conditional UPDATE in the store layer - "take
// this much if there is this much" - so two devices spending
// the last hundred shards at the same moment cannot both
// succeed. The client is told what is left rather than being
// trusted to work it out.
//
// Refuses anything that is not a consumable. Spending a skin is
// not a thing, and a client that asks to has a bug worth
// surfacing rather than silently absorbing.
// ==========================================
export async function handleGameConsume(url, request, gameId, requestId, GAMES, env) {
  const id = gameIdFromPath(url, true)
  const game = await resolveGame(env, GAMES, id)
  if (!game) return notFound(requestId)

  const database = db(env)
  if (!database) return createJsonResponse({ ok: false, error: 'not_configured' }, 503)

  const player = await requirePlayer(env, GAMES, request)
  if (!player) {
    return createJsonResponse({ ok: false, error: 'unauthorized' }, 401)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return createJsonResponse({ ok: false, error: 'bad_request' }, 400)
  }

  const productId = String(body.productId || '')
  const amount = Math.max(Number(body.amount) || 1, 1)

  const product = getGameProduct(game, productId)
  if (!product) {
    return createJsonResponse({ ok: false, error: 'unknown_product' }, 404)
  }
  if (product.kind !== 'consumable') {
    return createJsonResponse({
      ok: false, error: 'not_consumable',
      message: 'Only a consumable can be spent. This one is owned outright.'
    }, 409)
  }

  const result = await consumeEntitlement(database, game.id, player.playerId, productId, amount)
  if (!result.ok) {
    return createJsonResponse({
      ok: false, error: 'insufficient',
      message: 'Not enough of that product on this account.'
    }, 409)
  }

  logInfo('Entitlement consumed', {
    requestId, gameId: game.id, productId, amount, playerId: player.playerId
  })

  return createJsonResponse({ ok: true, productId, spent: amount, remaining: result.remaining }, 200, {
    'Cache-Control': 'no-store'
  })
}


// ==========================================
// handleGameDownload
// GET /:gameId/download
//
// The offline switch, made real.
//
// A greyed-out button on a card is a suggestion; anybody who
// saved the store link still gets the build. This is the path
// every download link on the site points at, so withdrawing a
// download withdraws it everywhere at once - including from
// links people have already shared.
//
// It answers with a page rather than a 404 because the game has
// not gone anywhere. Somebody who followed a friend's link
// should read "not right now" and still be able to reach the
// leaderboard and the store.
// ==========================================
export async function handleGameDownload(url, request, gameId, requestId, GAMES, env) {
  const id = gameIdFromPath(url, false)
  const game = await resolveGame(env, GAMES, id)
  if (!game) return notFound(requestId)

  const lang = langFrom(url, request)

  if (isDownloadable(game)) {
    // ?store=<key> picks WHICH link, now that a game may be
    // published in several places and the card renders a button
    // for each. The key is looked up in the game's own links
    // rather than trusted: a query parameter that could name a
    // destination would make this endpoint an open redirect with
    // the site's name on it.
    const asked = String(url.searchParams.get('store') || '')
    const links = (game.download && game.download.links) || {}
    const target = (asked && links[asked]) || downloadUrl(game)

    logInfo('Download redirect', { requestId, gameId: game.id, store: asked && links[asked] ? asked : 'primary' })
    return Response.redirect(target, 302)
  }

  logWarning('Download requested while withheld', { requestId, gameId: game.id, status: game.status })
  return createHtmlResponse(renderUnavailable(game, lang, url.origin), 200)
}


// ==========================================
// Unavailable page
// Small, honest, and still a way onward.
// ==========================================
const UNAVAILABLE_I18N = {
  fa: {
    dir: 'rtl',
    soonTitle: 'هنوز منتشر نشده',
    soonBody: 'این بازی هنوز بیرون نیامده. صفحه‌اش این‌جا می‌ماند و به‌محض انتشار، همین لینک دانلود می‌شود.',
    offTitle: 'دانلود موقتاً در دسترس نیست',
    offBody: 'نسخه‌ی دانلود فعلاً برداشته شده. بازی سر جایش است — ورود به حساب، خریدها و جدول امتیازات همه کار می‌کنند.',
    back: 'بازگشت به بازی‌ها',
    account: 'حساب کاربری',
    store: 'فروشگاه',
    board: 'جدول امتیازات'
  },
  en: {
    dir: 'ltr',
    soonTitle: 'Not out yet',
    soonBody: 'This game has not been released. Its page stays here, and this link becomes the download the moment it ships.',
    offTitle: 'The download is not available right now',
    offBody: 'The build has been withdrawn for the moment. The game itself is unaffected — signing in, purchases and the leaderboard all still work.',
    back: 'Back to the games',
    account: 'Account',
    store: 'Store',
    board: 'Leaderboard'
  },
  ja: {
    dir: 'ltr',
    soonTitle: 'まだ公開されていません',
    soonBody: 'このゲームは未リリースです。ページはこのまま残り、公開と同時にこのリンクがダウンロードになります。',
    offTitle: 'ダウンロードは現在利用できません',
    offBody: 'ビルドを一時的に取り下げています。ログイン・購入・ランキングはこれまでどおり動作します。',
    back: 'ゲーム一覧へ戻る',
    account: 'アカウント',
    store: 'ストア',
    board: 'リーダーボード'
  }
}

function renderUnavailable(game, lang, origin) {
  const t = UNAVAILABLE_I18N[lang] || UNAVAILABLE_I18N.fa
  const soon = game.status === 'soon'
  const accent = /^#[0-9a-fA-F]{6}$/.test(game.color || '') ? game.color : '#6c63ff'

  const links = [
    game.capabilities.login ? { href: `/${game.id}/account`, label: t.account } : null,
    game.capabilities.store ? { href: `/${game.id}/store`, label: t.store } : null,
    game.capabilities.leaderboard ? { href: `/${game.id}/leaderboard`, label: t.board } : null
  ].filter(Boolean)

  return `<!DOCTYPE html>
<html lang="${esc(lang)}" dir="${t.dir}">
<head>
  ${getPageHead({ title: `${esc(game.name)} — ${esc(soon ? t.soonTitle : t.offTitle)}`, amirLogo: CONFIG.AMIR_LOGO })}
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    :root{color-scheme:light dark;--accent:${accent};--bg:#0b0e16;--surface:rgba(255,255,255,.05);
      --border:rgba(255,255,255,.1);--text:rgba(255,255,255,.92);--dim:rgba(255,255,255,.58)}
    @media (prefers-color-scheme: light){:root{--bg:#f4f6fb;--surface:rgba(255,255,255,.75);
      --border:rgba(20,22,33,.1);--text:rgba(22,24,33,.92);--dim:rgba(22,24,33,.56)}}
    body{font-family:'Vazirmatn','Segoe UI',Tahoma,Arial,sans-serif;min-height:100vh;display:flex;
      align-items:center;justify-content:center;padding:24px;color:var(--text);
      background:radial-gradient(900px 480px at 70% -10%,color-mix(in srgb,var(--accent) 20%,transparent),transparent 60%),var(--bg)}
    .card{max-width:520px;width:100%;padding:36px 30px;border-radius:22px;text-align:center;
      background:var(--surface);border:1px solid var(--border);backdrop-filter:blur(10px)}
    .logo{position:relative;width:88px;height:88px;margin:0 auto 18px;border-radius:24px;display:flex;
      align-items:center;justify-content:center;font-size:2.4em;background:#fff;color:#1a1c24;overflow:hidden;
      border:2px solid color-mix(in srgb,var(--accent) 55%,transparent)}
    /* Out of flow, so the emoji underneath is a fallback rather
       than a second flex item sharing the box with the image. */
    .logo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
    h1{font-size:1.35em;margin-bottom:10px}
    .name{font-size:.9em;color:var(--dim);margin-bottom:20px}
    p{line-height:1.7;color:var(--dim);font-size:.95em}
    .links{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:24px}
    a{display:inline-flex;align-items:center;padding:10px 18px;border-radius:12px;text-decoration:none;
      font-weight:700;font-size:.88em;color:var(--text);background:var(--surface);border:1px solid var(--border)}
    a:hover{border-color:color-mix(in srgb,var(--accent) 50%,var(--border))}
    a.primary{color:#fff;background:linear-gradient(135deg,var(--accent),color-mix(in srgb,var(--accent) 55%,#fff));border-color:transparent}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">${esc(game.icon || '🎮')}${game.logo ? `<img src="${esc(game.logo)}" alt="" onerror="this.style.display='none'">` : ''}</div>
    <div class="name">${esc(game.name)}</div>
    <h1>${esc(soon ? t.soonTitle : t.offTitle)}</h1>
    <p>${esc(soon ? t.soonBody : t.offBody)}</p>
    <div class="links">
      ${links.map(link => `<a href="${esc(link.href)}">${esc(link.label)}</a>`).join('')}
      <a class="primary" href="/">${esc(t.back)}</a>
    </div>
  </div>
</body>
</html>`
}
