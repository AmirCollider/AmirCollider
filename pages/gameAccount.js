// ==========================================
// pages/gameAccount.js
// Signing a player into the WEBSITE, with the same Google
// account they use in the game.
//
// Public entry points (wired in worker.js ROUTES):
//   GET  /:gameId/account          the page
//   GET  /:gameId/account/signin   off to Google
//   POST /:gameId/account/logout   forget the session
//
// And one export worker.js calls from the shared OAuth
// callback:
//   completeSiteSignIn(url, request, stateData, code, GAMES, env)
//
// ------------------------------------------------------------
// WHY THE SITE NEEDS A SIGN-IN AT ALL
// ------------------------------------------------------------
// Because the store does. Somebody buying 6,500 shards in a
// browser has to be the same person the game will hand them to,
// and an email typed into a form is not proof of that - it is a
// support ticket waiting for the moment somebody mistypes their
// own address.
//
// Signing in with Google settles it: the player id derived here
// is the same one the game derives from its id_token, so a
// purchase made on a laptop is in the player's account before
// they have put the laptop down.
//
// ------------------------------------------------------------
// WHY IT ROUTES THROUGH /oauth/callback
// ------------------------------------------------------------
// Because that path is already registered with Google as an
// authorized redirect URI, and adding a second one means an
// operator editing the Google Cloud console before this page
// works. The state carries purpose:'site', the callback reads
// it, and the two flows share one registered URI and one
// signing secret.
// ==========================================

import { createHtmlResponse, createJsonResponse, logInfo, logWarning, logError } from '../utils.js'
import { resolveGame, isDownloadable, effectiveProducts } from '../games/registry.js'
import { db, listEntitlements } from '../games/store.js'
import {
  readPlayerSession, issuePlayerSession, clearPlayerSession, verifyGoogleIdToken
} from '../games/session.js'
import { encodeState, getStateSecret } from '../games/oauthState.js'
import {
  esc, page, chromeLang, chromeTheme, langHeader, localeFor
} from './gameChrome.js'


// ==========================================
// i18n
// ==========================================
const I18N = {
  fa: {
    title: 'حساب کاربری',
    lede: 'با همان حساب گوگلی وارد شو که داخل بازی استفاده می‌کنی. هر چیزی که این‌جا بخری، دفعه‌ی بعد که بازی را باز کنی سر جایش است.',

    signInTitle: 'ورود با حساب گوگل',
    signInBody: 'برای دیدن خریدها و خرید از سایت، اول وارد شو. رمزی وارد نمی‌کنی — گوگل هویتت را تأیید می‌کند و ما فقط ایمیل و نامت را می‌بینیم.',
    signInCta: 'ورود با گوگل',

    whyTitle: 'چرا ورود لازم است؟',
    why: [
      'خریدی که این‌جا انجام می‌دهی باید به همان حسابی برسد که داخل بازی وارد شده‌ای.',
      'شناسه‌ی بازیکن از روی ایمیل ساخته می‌شود — دقیقاً همان چیزی که خود بازی می‌سازد.',
      'رمز عبوری در کار نیست و ما هیچ رمزی نمی‌بینیم و ذخیره نمی‌کنیم.'
    ],

    hello: 'خوش آمدی',
    playerId: 'شناسه‌ی بازیکن',
    email: 'ایمیل',
    signOut: 'خروج از حساب',

    ownedTitle: 'خریدهای تو',
    ownedEmpty: 'هنوز چیزی نخریده‌ای. فروشگاه را ببین.',
    ownedNote: 'این‌ها همان چیزهایی هستند که بازی هم می‌بیند — چه از داخل بازی خریده باشی چه از این‌جا.',
    qty: 'موجودی',
    lifetime: 'مجموع خریداری‌شده',
    until: 'تا',
    forever: 'همیشگی',
    sourceWeb: 'خرید از سایت',
    sourceGrant: 'اهدایی',
    sourceApp: 'خرید داخل بازی',

    toStore: 'رفتن به فروشگاه',
    toBoard: 'جدول امتیازات',

    failTitle: 'ورود کامل نشد',
    failBody: 'گوگل ما را برگرداند اما چیزی که لازم بود همراهش نبود. یک بار دیگر امتحان کن.',
    tryAgain: 'تلاش دوباره',

    offTitle: 'ورود روی این نسخه فعال نیست',
    offBody: 'این بازی روی این استقرار ورود با گوگل ندارد.'
  },

  en: {
    title: 'Your account',
    lede: 'Sign in with the same Google account you use inside the game. Anything you buy here is already yours the next time you open it.',

    signInTitle: 'Sign in with Google',
    signInBody: 'Sign in to see your purchases and buy from the site. There is no password to type — Google confirms who you are, and we only ever see your name and email.',
    signInCta: 'Continue with Google',

    whyTitle: 'Why sign in?',
    why: [
      'A purchase made here has to reach the same account you are signed into in the game.',
      'The player id is derived from your email — exactly as the game derives it.',
      'There is no password involved, so there is none for us to see or store.'
    ],

    hello: 'Signed in as',
    playerId: 'Player id',
    email: 'Email',
    signOut: 'Sign out',

    ownedTitle: 'What you own',
    ownedEmpty: 'Nothing yet. Have a look at the store.',
    ownedNote: 'This is the same list the game sees — whether you bought it in the game or here.',
    qty: 'Balance',
    lifetime: 'Bought in total',
    until: 'until',
    forever: 'Yours for good',
    sourceWeb: 'bought on the site',
    sourceGrant: 'granted',
    sourceApp: 'bought in the game',

    toStore: 'Go to the store',
    toBoard: 'Leaderboard',

    failTitle: 'Sign-in did not finish',
    failBody: 'Google sent us back without what we needed. Please try once more.',
    tryAgain: 'Try again',

    offTitle: 'Sign-in is not switched on',
    offBody: 'This game does not have Google sign-in on this deployment.'
  },

  ja: {
    title: 'アカウント',
    lede: 'ゲーム内と同じ Google アカウントでサインインしてください。ここで購入したものは、次にゲームを開いたときにはもう手元にあります。',

    signInTitle: 'Google でサインイン',
    signInBody: '購入履歴の確認とサイトでの購入にはサインインが必要です。パスワードの入力はありません。Google が本人確認を行い、当方は名前とメールのみを受け取ります。',
    signInCta: 'Google で続ける',

    whyTitle: 'なぜサインインが必要か',
    why: [
      'ここでの購入は、ゲーム内でサインインしているのと同じアカウントに届く必要があります。',
      'プレイヤー ID はメールから導出されます — ゲームと同じ方法です。',
      'パスワードは使いません。したがって当方が見ることも保存することもありません。'
    ],

    hello: 'サインイン中',
    playerId: 'プレイヤー ID',
    email: 'メール',
    signOut: 'サインアウト',

    ownedTitle: '所有アイテム',
    ownedEmpty: 'まだ何もありません。ストアをご覧ください。',
    ownedNote: 'ゲームが参照するリストと同じです。ゲーム内購入もサイト購入も同じ場所に入ります。',
    qty: '残高',
    lifetime: '購入総数',
    until: '有効期限',
    forever: '永久所有',
    sourceWeb: 'サイトで購入',
    sourceGrant: '付与',
    sourceApp: 'ゲーム内で購入',

    toStore: 'ストアへ',
    toBoard: 'ランキング',

    failTitle: 'サインインが完了しませんでした',
    failBody: 'Google からの応答に必要な情報がありませんでした。もう一度お試しください。',
    tryAgain: 'もう一度',

    offTitle: 'サインインは有効ではありません',
    offBody: 'このデプロイではこのゲームの Google サインインは利用できません。'
  }
}

function pack(lang) {
  return I18N[lang] || I18N.fa
}

function gameIdFrom(url) {
  return url.pathname.split('/').filter(Boolean)[0] || ''
}


// ==========================================
// safeReturn
// Where to send somebody after they sign in.
//
// Same-origin paths only, and "//" is rejected as well as
// "http://" - a browser reads //evil.example as a protocol-
// relative URL to another host, which is the oldest open-
// redirect in the book and the one people forget.
// ==========================================
function safeReturn(value, fallback) {
  const raw = String(value || '')
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback
  return raw
}


// ==========================================
// handleGameAccount
// GET /:gameId/account
// ==========================================
export async function handleGameAccount(url, request, gameId, requestId, GAMES, env) {
  const game = await resolveGame(env, GAMES, gameIdFrom(url))
  if (!game) return createJsonResponse({ ok: false, error: 'unknown_game', requestId }, 404)

  const lang = chromeLang(url, request)
  const theme = chromeTheme(request)
  const headers = langHeader(url, lang)

  if (!game.capabilities.login) {
    return createHtmlResponse(renderClosed(game, lang, theme), 200, headers)
  }

  const player = await readPlayerSession(env, GAMES, request)
  const failed = url.searchParams.get('error') === '1'

  if (!player) {
    return createHtmlResponse(renderSignIn(game, lang, theme, failed), 200, headers)
  }

  const database = db(env)
  const owned = database ? await listEntitlements(database, game.id, player.playerId) : []

  return createHtmlResponse(renderAccount(game, lang, theme, player, owned), 200, headers)
}


// ==========================================
// handleGameAccountSignIn
// GET /:gameId/account/signin
//
// Redirects straight to Google rather than rendering an
// interstitial. The player already pressed a button that said
// "continue with Google"; a second page saying "redirecting…"
// is a page nobody reads and a click nobody wanted.
// ==========================================
export async function handleGameAccountSignIn(url, request, gameId, requestId, GAMES, env) {
  const id = url.pathname.split('/').filter(Boolean)[0] || ''
  const game = await resolveGame(env, GAMES, id)
  if (!game) return createJsonResponse({ ok: false, error: 'unknown_game', requestId }, 404)

  if (!game.capabilities.login || !game.oauth.web) {
    logWarning('Site sign-in attempted without an OAuth client', { requestId, gameId: id })
    return Response.redirect(`${url.origin}/${id}/account?error=1`, 302)
  }

  const lang = chromeLang(url, request)
  const returnTo = safeReturn(url.searchParams.get('next'), `/${id}/account`)

  const state = await encodeState({
    // The field the shared callback branches on. Absent means
    // the old behaviour - a game asking for a code - so every
    // existing client is unaffected by this path existing.
    purpose: 'site',
    gameId: id,
    language: lang,
    returnTo,
    isAndroid: false,
    platform: 'web',
    requestId,
    timestamp: Date.now()
  }, getStateSecret(GAMES, env))

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', game.oauth.web)
  authUrl.searchParams.set('redirect_uri', `${url.origin}/oauth/callback`)
  authUrl.searchParams.set('response_type', 'code')
  // Identity only. No offline access and no refresh token: this
  // is a browser session that lasts a week and is re-established
  // with one click, so asking for a credential that never
  // expires would be asking for more than the job needs.
  authUrl.searchParams.set('scope', 'openid profile email')
  authUrl.searchParams.set('prompt', 'select_account')
  authUrl.searchParams.set('hl', lang)
  authUrl.searchParams.set('state', state)

  return Response.redirect(authUrl.toString(), 302)
}


// ==========================================
// completeSiteSignIn
// The half of the callback that belongs to this page.
//
// Called by worker.js when a verified state says purpose:'site'.
// Exchanges the code for tokens, verifies the id_token with
// Google, and sets the session cookie.
//
// Every failure lands back on the account page with ?error=1
// rather than an error document. Somebody halfway through
// buying something wants the button again, not a stack trace.
// ==========================================
export async function completeSiteSignIn(url, request, stateData, code, GAMES, env) {
  const gameId = String(stateData.gameId || '')
  const game = GAMES[gameId]
  const back = safeReturn(stateData.returnTo, `/${gameId}/account`)

  if (!game || !game.oauth.web || !game.oauth.secret) {
    logError('Site sign-in without OAuth configuration', { gameId })
    return Response.redirect(`${url.origin}/${gameId}/account?error=1`, 302)
  }

  let tokens
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: game.oauth.web,
        client_secret: game.oauth.secret,
        redirect_uri: `${url.origin}/oauth/callback`,
        grant_type: 'authorization_code'
      }).toString()
    })

    if (!response.ok) {
      // The upstream body is deliberately not read into the log:
      // it can carry our own client identifiers, and the status
      // is what actually distinguishes the failures worth acting
      // on.
      logWarning('Site sign-in token exchange refused', { gameId, status: response.status })
      return Response.redirect(`${url.origin}/${gameId}/account?error=1`, 302)
    }

    tokens = await response.json()
  } catch (error) {
    logError('Site sign-in token exchange failed', { gameId, error: error.message })
    return Response.redirect(`${url.origin}/${gameId}/account?error=1`, 302)
  }

  // Verified with Google rather than merely decoded. The token
  // arrived over a channel we trust, but "the bytes parsed" and
  // "Google says this is current" are different claims, and the
  // session about to be minted lasts a week.
  const player = await verifyGoogleIdToken(tokens && tokens.id_token)
  if (!player) {
    logWarning('Site sign-in produced no usable identity', { gameId })
    return Response.redirect(`${url.origin}/${gameId}/account?error=1`, 302)
  }

  const cookie = await issuePlayerSession(env, GAMES, { ...player, gameId })
  if (!cookie) {
    logError('Site session could not be signed — no secret available', { gameId })
    return Response.redirect(`${url.origin}/${gameId}/account?error=1`, 302)
  }

  logInfo('Player signed in on the site', { gameId, playerId: player.playerId })

  return new Response(null, {
    status: 302,
    headers: { 'Location': `${url.origin}${back}`, 'Set-Cookie': cookie }
  })
}


// ==========================================
// handleGameAccountLogout
// POST /:gameId/account/logout
//
// POST rather than GET, so a prefetching browser extension or a
// crawler following links cannot sign somebody out.
// ==========================================
export async function handleGameAccountLogout(url, request, gameId, requestId, GAMES, env) {
  const id = url.pathname.split('/').filter(Boolean)[0] || ''
  return new Response(null, {
    status: 302,
    headers: { 'Location': `${url.origin}/${id}/account`, 'Set-Cookie': clearPlayerSession() }
  })
}


// ==========================================
// Views
// ==========================================
function renderSignIn(game, lang, theme, failed) {
  const t = pack(lang)

  const body = `
    <div class="ghead">${esc(t.title)}</div>
    <p class="glede">${esc(t.lede)}</p>

    ${failed ? `<div class="gnote is-err" style="margin-block-end:18px">
      <b>${esc(t.failTitle)}</b><br>${esc(t.failBody)}
    </div>` : ''}

    <div class="gcard" style="text-align:center;padding:38px 26px">
      <div style="font-size:2.6em;line-height:1;margin-block-end:14px">🔐</div>
      <h1 style="font-size:1.2em;margin-block-end:10px">${esc(t.signInTitle)}</h1>
      <p style="color:var(--dim);font-size:.92em;line-height:1.7;max-width:44ch;margin:0 auto 24px">
        ${esc(t.signInBody)}
      </p>
      <a class="gbtn" href="/${esc(game.id)}/account/signin?lang=${esc(lang)}">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path fill="#fff" d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.66 4.1-5.35 4.1a5.9 5.9 0 0 1 0-11.8c1.68 0 2.8.72 3.45 1.33l2.35-2.27C16.3 3.9 14.35 3 12 3a9 9 0 1 0 0 18c5.2 0 8.64-3.65 8.64-8.79 0-.59-.06-1.04-.29-1.51z"/>
        </svg>
        <span>${esc(t.signInCta)}</span>
      </a>
    </div>

    <div class="gcard" style="margin-block-start:16px">
      <h2 style="font-size:1em;margin-block-end:12px">${esc(t.whyTitle)}</h2>
      <ul style="margin:0;padding-inline-start:20px;color:var(--dim);font-size:.9em;line-height:1.9">
        ${t.why.map(line => `<li>${esc(line)}</li>`).join('')}
      </ul>
    </div>`

  return page({
    game, lang, theme, active: 'account',
    title: `${game.name} — ${t.title}`,
    description: t.lede,
    downloadable: isDownloadable(game),
    body
  })
}


function renderAccount(game, lang, theme, player, owned) {
  const t = pack(lang)
  const locale = localeFor(lang)

  const sourceLabel = source =>
    source === 'grant' ? t.sourceGrant : source === 'in-app' ? t.sourceApp : t.sourceWeb

  const catalogue = effectiveProducts(game)
  const nameOf = productId => {
    const product = catalogue.find(item => item.id === productId)
    const names = product && product.i18n && product.i18n.name
    return (names && (names[lang] || names.en)) || productId
  }
  const iconOf = productId => {
    const product = catalogue.find(item => item.id === productId)
    return (product && product.icon) || '📦'
  }

  const rows = owned.map(row => {
    const expiry = row.expires_at
      ? `${esc(t.until)} ${new Date(row.expires_at).toLocaleDateString(locale)}`
      : t.forever

    const amount = row.kind === 'consumable'
      ? `<b style="font-size:1.15em">${Number(row.quantity).toLocaleString(locale)}</b>
         <span style="color:var(--dim);font-size:.82em"> ${esc(t.qty)}</span>`
      : `<span class="gchip is-ok">✓ ${esc(expiry)}</span>`

    return `
      <div style="display:flex;align-items:center;gap:14px;padding:15px 0;border-block-end:1px solid var(--border)">
        <span style="font-size:1.7em;line-height:1">${esc(iconOf(row.product_id))}</span>
        <span style="flex:1;min-width:0">
          <b style="display:block">${esc(nameOf(row.product_id))}</b>
          <span style="color:var(--dim);font-size:.8em">
            ${esc(sourceLabel(row.source))}
            ${row.kind === 'consumable' ? ` · ${esc(t.lifetime)}: ${Number(row.lifetime).toLocaleString(locale)}` : ''}
          </span>
        </span>
        <span style="text-align:end">${amount}</span>
      </div>`
  }).join('')

  const body = `
    <div class="ghead">${esc(t.title)}</div>

    <div class="gcard" style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
      <span style="width:62px;height:62px;border-radius:50%;overflow:hidden;flex-shrink:0;
        background:var(--surface-2);border:2px solid color-mix(in srgb,var(--accent) 45%,transparent);
        display:flex;align-items:center;justify-content:center;font-size:1.5em">
        ${player.picture
          ? `<img src="${esc(player.picture)}" alt="" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`
          : '🙂'}
      </span>
      <span style="flex:1 1 220px;min-width:0">
        <span style="color:var(--dim);font-size:.8em">${esc(t.hello)}</span>
        <b style="display:block;font-size:1.1em">${esc(player.name || player.email)}</b>
        <span style="color:var(--dim);font-size:.82em;word-break:break-all" dir="ltr">${esc(player.email)}</span>
      </span>
      <span style="text-align:end">
        <span style="color:var(--dim);font-size:.78em;display:block">${esc(t.playerId)}</span>
        <code dir="ltr" style="font-size:.95em;font-weight:700">${esc(player.playerId)}</code>
      </span>
      <form method="POST" action="/${esc(game.id)}/account/logout" style="flex-basis:100%;text-align:end">
        <button type="submit" class="gbtn gbtn--ghost">${esc(t.signOut)}</button>
      </form>
    </div>

    <div class="ghead" style="margin-block-start:26px">${esc(t.ownedTitle)}</div>
    <div class="gcard">
      ${owned.length
        ? rows + `<p style="color:var(--dim);font-size:.84em;line-height:1.7;margin-block-start:14px">${esc(t.ownedNote)}</p>`
        : `<p style="color:var(--dim);font-size:.92em">${esc(t.ownedEmpty)}</p>`}

      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-block-start:18px">
        ${game.capabilities.store
          ? `<a class="gbtn" href="/${esc(game.id)}/store?lang=${esc(lang)}">${esc(t.toStore)}</a>` : ''}
        ${game.capabilities.leaderboard
          ? `<a class="gbtn gbtn--ghost" href="/${esc(game.id)}/leaderboard">${esc(t.toBoard)}</a>` : ''}
      </div>
    </div>`

  return page({
    game, lang, theme, active: 'account',
    title: `${game.name} — ${t.title}`,
    downloadable: isDownloadable(game),
    body
  })
}


function renderClosed(game, lang, theme) {
  const t = pack(lang)
  const body = `
    <div class="ghead">${esc(t.title)}</div>
    <div class="gcard">
      <h1 style="font-size:1.1em;margin-block-end:10px">${esc(t.offTitle)}</h1>
      <p style="color:var(--dim);font-size:.92em;line-height:1.7">${esc(t.offBody)}</p>
    </div>`

  return page({
    game, lang, theme, active: 'account',
    title: `${game.name} — ${t.title}`,
    downloadable: isDownloadable(game),
    body
  })
}
