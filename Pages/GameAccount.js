// ==========================================
// Pages/GameAccount.js
// Signing a player into the WEBSITE, with the same Google
// account they use in the game.
//
// Public entry points (wired in Worker.js ROUTES):
//   GET  /:gameId/account          the page
//   GET  /:gameId/account/signin   off to Google
//   POST /:gameId/account/logout   forget the session
//
// And one export Worker.js calls from the shared OAuth
// callback:
//   completeSiteSignIn(url, request, stateData, code, GAMES, env)
// ==========================================

import { createHtmlResponse, createJsonResponse } from '../Core/Http.js'
import { logInfo, logWarning, logError } from '../Core/Logging.js'
import { resolveGame, isDownloadable, effectiveProducts } from '../Games/Registry.js'
import { db, listEntitlements } from '../Games/Store.js'
import { playerDb, getGamePlayer, setUsername } from '../Games/Players.js'
import { ensurePlayerRow } from '../Games/PlayerRecord.js'
import { emailMatchesRow } from '../Core/PlayerIdentity.js'
import {
  readPlayerSession, issuePlayerSession, clearPlayerSession, verifyGoogleIdToken
} from '../Games/Session.js'
import { encodeState, getStateSecret } from '../Games/OAuthState.js'
import { page, chromeTheme, langHeader, localeFor } from './GameChrome.js'
import { escapeHtml } from '../Core/Html.js'
import { matchRequestLang } from '../Core/RequestContext.js'


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

    statsTitle: 'آمار تو',
    statScore: 'بالاترین امتیاز',
    statRuns: 'تعداد بازی',
    statPlayTime: 'مدت بازی',
    statJoined: 'تاریخ عضویت',
    statLastSeen: 'آخرین ورود',
    hoursShort: 'س',
    minutesShort: 'د',

    profileTitle: 'پروفایل',
    usernameLabel: 'نام کاربری',
    usernameHint: '۳ تا ۱۲ نویسه، فقط حروف انگلیسی و عدد. همین نام در جدول امتیازات دیده می‌شود.',
    avatarLabel: 'آدرس تصویر پروفایل',
    avatarHint: 'فقط آدرس https. خالی بگذاری، تصویری نشان داده نمی‌شود.',
    saveProfile: 'ذخیره',
    avatarFromGoogle: 'برگرداندن تصویر گوگل',
    profileSaved: 'ذخیره شد.',
    nameTaken: 'این نام کاربری قبلاً گرفته شده. یکی دیگر انتخاب کن.',
    nameBad: 'نام کاربری باید ۳ تا ۱۲ نویسه و فقط حروف انگلیسی و عدد باشد. آدرس تصویر هم باید با https شروع شود.',
    nameConflict: 'این شناسه‌ی بازیکن به حساب گوگل دیگری تعلق دارد. برای جدا کردن رکورد با پشتیبانی تماس بگیر.',

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

    statsTitle: 'Your stats',
    statScore: 'High score',
    statRuns: 'Runs',
    statPlayTime: 'Play time',
    statJoined: 'Joined',
    statLastSeen: 'Last seen',
    hoursShort: 'h',
    minutesShort: 'm',

    profileTitle: 'Profile',
    usernameLabel: 'Username',
    usernameHint: '3 to 12 characters, English letters and digits. This is the name on the leaderboard.',
    avatarLabel: 'Profile picture URL',
    avatarHint: 'https addresses only. Leave it empty for no picture.',
    saveProfile: 'Save',
    avatarFromGoogle: 'Use my Google picture',
    profileSaved: 'Saved.',
    nameTaken: 'That username is already taken. Pick another.',
    nameBad: 'A username is 3 to 12 characters, English letters and digits. A picture URL must start with https.',
    nameConflict: 'This player id already belongs to a different Google account. Contact support so the record can be separated.',

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

    statsTitle: 'あなたの記録',
    statScore: 'ハイスコア',
    statRuns: 'プレイ回数',
    statPlayTime: 'プレイ時間',
    statJoined: '登録日',
    statLastSeen: '最終ログイン',
    hoursShort: '時間',
    minutesShort: '分',

    profileTitle: 'プロフィール',
    usernameLabel: 'ユーザー名',
    usernameHint: '3〜12 文字、英数字のみ。ランキングに表示される名前です。',
    avatarLabel: 'プロフィール画像の URL',
    avatarHint: 'https のアドレスのみ。空欄なら画像は表示されません。',
    saveProfile: '保存',
    avatarFromGoogle: 'Google の画像に戻す',
    profileSaved: '保存しました。',
    nameTaken: 'そのユーザー名は既に使われています。',
    nameBad: 'ユーザー名は 3〜12 文字の英数字です。画像 URL は https で始まる必要があります。',
    nameConflict: 'このプレイヤー ID は別の Google アカウントのものです。記録を分けるにはサポートにご連絡ください。',

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

  const lang = matchRequestLang(url, request)
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

  // The stats half of the page. It lives in the GAME's database,
  // not the licence database - which is why the account page had
  // no join date, no score and no play time until now: it was
  // only ever reading the table that holds purchases.
  //
  // The row is created here if this player has never had one.
  //
  // "Null is a fine answer" is what this used to say, and it was
  // not: the stats block and the profile form are both rendered
  // `record ? ... : ''`, so a player with no row was shown an
  // account page with no account on it — no name to set, no
  // avatar to set, nothing. Signing in on the site is a sign-in,
  // and the schema has always said the row is made at first
  // sign-in; it was simply only ever made by the game.
  //
  // Also covers the sessions already out there, which were minted
  // by a build that created nothing. They last a week, so waiting
  // for them to expire is not a fix.
  const gameDatabase = playerDb(env, game)

  if (gameDatabase) await ensurePlayerRow(gameDatabase, player.playerId, player)

  const found = gameDatabase ? await getGamePlayer(gameDatabase, player.playerId) : null

  // A row whose email is somebody else's is not this player's row,
  // however well the derived id matches — see the note on the
  // profile handler. Treated as no row at all: the stats shown
  // would be another person's, and the form beside them would
  // edit that person's name.
  const record = emailMatchesRow(found, player.email) ? found : null

  const saved = url.searchParams.get('saved') === '1'
  const nameError = url.searchParams.get('name_error') || ''

  return createHtmlResponse(
    renderAccount(game, lang, theme, player, owned, record, { saved, nameError }),
    200, headers
  )
}


// ==========================================
// handleGameAccountProfile
// POST /:gameId/account/profile
//
// A player editing their own record: the name on the
// leaderboard, and the picture beside it.
//
// Username goes through the same setUsername() the panel uses,
// so a name typed here is held to the rule the game client is
// held to, and cannot collide with somebody else's.
// ==========================================
export async function handleGameAccountProfile(url, request, gameId, requestId, GAMES, env) {
  const id = gameIdFrom(url)
  const game = await resolveGame(env, GAMES, id)
  if (!game) return createJsonResponse({ ok: false, error: 'unknown_game', requestId }, 404)

  const player = await readPlayerSession(env, GAMES, request)
  if (!player) return Response.redirect(`${url.origin}/${id}/account`, 302)

  const database = playerDb(env, game)
  if (!database) return Response.redirect(`${url.origin}/${id}/account`, 302)

  let form
  try {
    form = new URLSearchParams(await request.text())
  } catch {
    return Response.redirect(`${url.origin}/${id}/account`, 302)
  }

  const back = state => `${url.origin}/${id}/account${state}`

  // Name first: if it is refused, nothing else is written either,
  // so the player is not told "saved" about a form that half
  // applied.
  const username = String(form.get('username') || '').trim()

  await ensurePlayerRow(database, player.playerId, player)

  const current = await getGamePlayer(database, player.playerId)

  // ==========================================
  // Is this row actually theirs?
  //
  // Deriving a player id from an address is not injective —
  // fifteen characters of the local part means ali@gmail.com and
  // ali@yahoo.com are both "ali". The game's data API has refused
  // that case since Core/PlayerIdentity.js was written; this page
  // never asked. So the second person to sign in on the SITE with
  // a colliding address could rename the first one, and replace
  // the avatar shown beside their score on the public board.
  //
  // Same rule, same helper, same answer as the game gets.
  // ==========================================
  if (!emailMatchesRow(current, player.email)) {
    logWarning('Site profile edit refused: player id belongs to another account', {
      requestId, gameId: id, playerId: player.playerId
    })
    return Response.redirect(back('?name_error=conflict'), 302)
  }

  if (username && username !== (current && current.username)) {
    const named = await setUsername(database, player.playerId, username)
    if (!named.ok) {
      logWarning('Player rejected their own rename', { requestId, gameId: id, reason: named.reason })
      return Response.redirect(back(`?name_error=${named.reason === 'taken' ? 'taken' : 'bad'}`), 302)
    }
  }

  // The picture. "Reset" puts back whatever Google gave us at
  // sign-in, which is the value the account already had before
  // anybody typed in this box.
  const reset = form.get('avatar_reset') === '1'
  const avatar = String(form.get('avatar') || '').trim()
  const next = reset ? String(player.picture || '') : avatar

  // https only, and only when it is a URL at all. This string
  // ends up in an <img src> on the leaderboard, where every
  // other player will load it.
  const acceptable = !next || /^https:\/\/[^\s"'<>]+$/i.test(next)
  if (!acceptable) return Response.redirect(back('?name_error=bad'), 302)

  try {
    await database.prepare('UPDATE players SET profile_pic_url = ? WHERE player_id = ?')
      .bind(next.slice(0, 300) || null, player.playerId).run()
  } catch (error) {
    logError('Profile picture not saved', { requestId, gameId: id, error: error.message })
    return Response.redirect(back(''), 302)
  }

  logInfo('Player updated their profile', { requestId, gameId: id, playerId: player.playerId })
  return Response.redirect(back('?saved=1'), 302)
}


// ==========================================
// handleGameAccountSignIn
// GET /:gameId/account/signin
// ==========================================
export async function handleGameAccountSignIn(url, request, gameId, requestId, GAMES, env) {
  const id = url.pathname.split('/').filter(Boolean)[0] || ''
  const game = await resolveGame(env, GAMES, id)
  if (!game) return createJsonResponse({ ok: false, error: 'unknown_game', requestId }, 404)

  if (!game.capabilities.login || !game.oauth.web) {
    logWarning('Site sign-in attempted without an OAuth client', { requestId, gameId: id })
    return Response.redirect(`${url.origin}/${id}/account?error=1`, 302)
  }

  const lang = matchRequestLang(url, request)
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
// Called by Worker.js when a verified state says purpose:'site'.
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
  const player = await verifyGoogleIdToken(tokens && tokens.id_token, game)
  if (!player) {
    logWarning('Site sign-in produced no usable identity', { gameId })
    return Response.redirect(`${url.origin}/${gameId}/account?error=1`, 302)
  }

  const cookie = await issuePlayerSession(env, GAMES, { ...player, gameId })
  if (!cookie) {
    logError('Site session could not be signed — no secret available', { gameId })
    return Response.redirect(`${url.origin}/${gameId}/account?error=1`, 302)
  }

  // ==========================================
  // The row, which this half of sign-in never made.
  //
  // Only the game client's requests ever created one. So somebody
  // who came to the site first - to buy something, or to claim a
  // username before their friends did - got a session, a welcome
  // and an account page with no stats block and no profile form
  // on it at all, because both are rendered `record ? ... : ''`.
  // There was no way to set a name. Then playing the game created
  // the row properly, and anything they had managed to submit in
  // the meantime had gone nowhere.
  //
  // Failure is not fatal here: the session is already valid, and
  // the account page ensures the row again on its way in.
  // ==========================================
  await ensurePlayerRow(playerDb(env, game), player.playerId, player)

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
    <div class="ghead">${escapeHtml(t.title)}</div>
    <p class="glede">${escapeHtml(t.lede)}</p>

    ${failed ? `<div class="gnote is-err" style="margin-block-end:18px">
      <b>${escapeHtml(t.failTitle)}</b><br>${escapeHtml(t.failBody)}
    </div>` : ''}

    <div class="gcard" style="text-align:center;padding:38px 26px">
      <div style="font-size:2.6em;line-height:1;margin-block-end:14px">🔐</div>
      <h1 style="font-size:1.2em;margin-block-end:10px">${escapeHtml(t.signInTitle)}</h1>
      <p style="color:var(--dim);font-size:.92em;line-height:1.7;max-width:44ch;margin:0 auto 24px">
        ${escapeHtml(t.signInBody)}
      </p>
      <a class="gbtn" href="/${escapeHtml(game.id)}/account/signin?lang=${escapeHtml(lang)}">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path fill="#fff" d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.66 4.1-5.35 4.1a5.9 5.9 0 0 1 0-11.8c1.68 0 2.8.72 3.45 1.33l2.35-2.27C16.3 3.9 14.35 3 12 3a9 9 0 1 0 0 18c5.2 0 8.64-3.65 8.64-8.79 0-.59-.06-1.04-.29-1.51z"/>
        </svg>
        <span>${escapeHtml(t.signInCta)}</span>
      </a>
    </div>

    <div class="gcard" style="margin-block-start:16px">
      <h2 style="font-size:1em;margin-block-end:12px">${escapeHtml(t.whyTitle)}</h2>
      <ul style="margin:0;padding-inline-start:20px;color:var(--dim);font-size:.9em;line-height:1.9">
        ${t.why.map(line => `<li>${escapeHtml(line)}</li>`).join('')}
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


function renderAccount(game, lang, theme, player, owned, record, flash = {}) {
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
      ? `${escapeHtml(t.until)} ${new Date(row.expires_at).toLocaleDateString(locale)}`
      : t.forever

    const amount = row.kind === 'consumable'
      ? `<b style="font-size:1.15em">${Number(row.quantity).toLocaleString(locale)}</b>
         <span style="color:var(--dim);font-size:.82em"> ${escapeHtml(t.qty)}</span>`
      : `<span class="gchip is-ok">✓ ${escapeHtml(expiry)}</span>`

    return `
      <div style="display:flex;align-items:center;gap:14px;padding:15px 0;border-block-end:1px solid var(--border)">
        <span style="font-size:1.7em;line-height:1">${escapeHtml(iconOf(row.product_id))}</span>
        <span style="flex:1;min-width:0">
          <b style="display:block">${escapeHtml(nameOf(row.product_id))}</b>
          <span style="color:var(--dim);font-size:.8em">
            ${escapeHtml(sourceLabel(row.source))}
            ${row.kind === 'consumable' ? ` · ${escapeHtml(t.lifetime)}: ${Number(row.lifetime).toLocaleString(locale)}` : ''}
          </span>
        </span>
        <span style="text-align:end">${amount}</span>
      </div>`
  }).join('')

  // Stats and the profile form.
  const stat = (value, label) => `
    <div class="acc-stat"><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></div>`

  const playTime = seconds => {
    const total = Number(seconds) || 0
    if (!total) return '—'
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    return h ? `${h}${t.hoursShort} ${m}${t.minutesShort}` : `${m}${t.minutesShort}`
  }

  const asDate = ms => (Number(ms) ? new Date(Number(ms)).toLocaleDateString(locale) : '—')

  const statsBlock = record ? `
    <div class="ghead" style="margin-block-start:26px">${escapeHtml(t.statsTitle)}</div>
    <div class="gcard">
      <div class="acc-stats">
        ${stat(Number(record.high_score || 0).toLocaleString(locale), t.statScore)}
        ${stat(Number(record.games_played || 0).toLocaleString(locale), t.statRuns)}
        ${stat(playTime(record.total_play_time), t.statPlayTime)}
        ${stat(asDate(record.created_at), t.statJoined)}
        ${stat(asDate(record.last_login), t.statLastSeen)}
      </div>
      ${game.capabilities.leaderboard
        ? `<div style="margin-block-start:14px">
             <a class="gbtn gbtn--ghost" href="/${escapeHtml(game.id)}/leaderboard">${escapeHtml(t.toBoard)}</a>
           </div>` : ''}
    </div>` : ''

  const profileBlock = record ? `
    <div class="ghead" style="margin-block-start:26px">${escapeHtml(t.profileTitle)}</div>
    <div class="gcard">
      ${flash.saved ? `<div class="gnote is-ok" style="margin-block-end:14px">${escapeHtml(t.profileSaved)}</div>` : ''}
      ${flash.nameError
        ? `<div class="gnote is-err" style="margin-block-end:14px">${escapeHtml(
            flash.nameError === 'taken' ? t.nameTaken
            : flash.nameError === 'conflict' ? t.nameConflict
            : t.nameBad)}</div>` : ''}

      <form method="POST" action="/${escapeHtml(game.id)}/account/profile" class="acc-form">
        <label class="acc-field">
          <span>${escapeHtml(t.usernameLabel)}</span>
          <input type="text" name="username" dir="ltr" maxlength="12"
                 value="${escapeHtml(record.username || '')}" placeholder="Player123">
          <small>${escapeHtml(t.usernameHint)}</small>
        </label>

        <label class="acc-field">
          <span>${escapeHtml(t.avatarLabel)}</span>
          <input type="url" name="avatar" dir="ltr" maxlength="300"
                 value="${escapeHtml(record.profile_pic_url || '')}" placeholder="https://…">
          <small>${escapeHtml(t.avatarHint)}</small>
        </label>

        <div class="acc-actions">
          <button type="submit" class="gbtn">${escapeHtml(t.saveProfile)}</button>
          <button type="submit" name="avatar_reset" value="1" class="gbtn gbtn--ghost">${escapeHtml(t.avatarFromGoogle)}</button>
        </div>
      </form>
    </div>` : ''

  const body = `
    <style>
      .acc-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px}
      .acc-stat{padding:14px 16px;border-radius:14px;background:var(--surface-2);border:1px solid var(--border)}
      .acc-stat b{display:block;font-size:1.25em;font-weight:800;margin-block-end:3px}
      .acc-stat span{font-size:.76em;color:var(--dim)}
      .acc-form{display:grid;gap:16px}
      .acc-field{display:block}
      .acc-field>span{display:block;font-size:.8em;font-weight:700;color:var(--dim);margin-block-end:6px}
      .acc-field input{width:100%;padding:11px 14px;border-radius:12px;font:inherit;font-size:.9em;
        color:var(--text);background:var(--surface-2);border:1px solid var(--border);outline:none}
      .acc-field input:focus{border-color:var(--accent)}
      .acc-field small{display:block;font-size:.76em;color:var(--dim);margin-block-start:5px;line-height:1.6}
      .acc-actions{display:flex;gap:10px;flex-wrap:wrap}
      @media (max-width:640px){ .acc-actions .gbtn{flex:1 1 100%} }
    </style>
    <div class="ghead">${escapeHtml(t.title)}</div>

    <div class="gcard" style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
      <span style="width:62px;height:62px;border-radius:50%;overflow:hidden;flex-shrink:0;
        background:var(--surface-2);border:2px solid color-mix(in srgb,var(--accent) 45%,transparent);
        display:flex;align-items:center;justify-content:center;font-size:1.5em">
        ${player.picture
          ? `<img src="${escapeHtml(player.picture)}" alt="" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`
          : '🙂'}
      </span>
      <span style="flex:1 1 220px;min-width:0">
        <span style="color:var(--dim);font-size:.8em">${escapeHtml(t.hello)}</span>
        <b style="display:block;font-size:1.1em">${escapeHtml(player.name || player.email)}</b>
        <span style="color:var(--dim);font-size:.82em;word-break:break-all" dir="ltr">${escapeHtml(player.email)}</span>
      </span>
      <span style="text-align:end">
        <span style="color:var(--dim);font-size:.78em;display:block">${escapeHtml(t.playerId)}</span>
        <code dir="ltr" style="font-size:.95em;font-weight:700">${escapeHtml(player.playerId)}</code>
      </span>
      <form method="POST" action="/${escapeHtml(game.id)}/account/logout" style="flex-basis:100%;text-align:end">
        <button type="submit" class="gbtn gbtn--ghost">${escapeHtml(t.signOut)}</button>
      </form>
    </div>

    ${statsBlock}
    ${profileBlock}

    <div class="ghead" style="margin-block-start:26px">${escapeHtml(t.ownedTitle)}</div>
    <div class="gcard">
      ${owned.length
        ? rows + `<p style="color:var(--dim);font-size:.84em;line-height:1.7;margin-block-start:14px">${escapeHtml(t.ownedNote)}</p>`
        : `<p style="color:var(--dim);font-size:.92em">${escapeHtml(t.ownedEmpty)}</p>`}

      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-block-start:18px">
        ${game.capabilities.store
          ? `<a class="gbtn" href="/${escapeHtml(game.id)}/store?lang=${escapeHtml(lang)}">${escapeHtml(t.toStore)}</a>` : ''}
        ${game.capabilities.leaderboard
          ? `<a class="gbtn gbtn--ghost" href="/${escapeHtml(game.id)}/leaderboard">${escapeHtml(t.toBoard)}</a>` : ''}
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
    <div class="ghead">${escapeHtml(t.title)}</div>
    <div class="gcard">
      <h1 style="font-size:1.1em;margin-block-end:10px">${escapeHtml(t.offTitle)}</h1>
      <p style="color:var(--dim);font-size:.92em;line-height:1.7">${escapeHtml(t.offBody)}</p>
    </div>`

  return page({
    game, lang, theme, active: 'account',
    title: `${game.name} — ${t.title}`,
    downloadable: isDownloadable(game),
    body
  })
}
