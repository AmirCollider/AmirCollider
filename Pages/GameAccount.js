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
import { db, listEntitlements, releasePlayerIdentity } from '../Games/Store.js'
import {
  playerDb, getGamePlayer, setUsername, setLeaderboardOptOut, deletePlayerByEmail
} from '../Games/Players.js'
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

    boardPrivacyLabel: 'حریم خصوصی جدول امتیازات',
    boardHideLabel: 'من را در جدول امتیازات نشان نده',
    boardHideHint: 'با روشن کردن این گزینه، به‌طور کامل از جدول امتیازات عمومی حذف می‌شوی: نه امتیازت، '
                 + 'نه نامت و نه تصویرت جایی دیده نمی‌شود و رتبه‌ای هم به اسمت خالی نمی‌ماند — انگار اصلاً '
                 + 'در جدول وجود نداری.',
    boardHideKeeps: 'هیچ چیز دیگری عوض نمی‌شود: امتیازت مثل همیشه ثبت می‌شود، در همین صفحه می‌بینی‌اش، '
                  + 'خریدها و ذخیره‌ی ابری‌ات دست‌نخورده می‌مانند، و هر وقت خواستی با خاموش کردن همین گزینه '
                  + 'دقیقاً با همان امتیاز به جدول برمی‌گردی.',
    boardHiddenNow: 'الان در جدول امتیازات دیده نمی‌شوی.',
    boardShownNow: 'الان با امتیازت در جدول امتیازات دیده می‌شوی.',
    boardUnavailable: 'این قابلیت روی پایگاه‌داده‌ی این بازی هنوز فعال نیست.',
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

    dangerTitle: 'حذف حساب',
    dangerLede: 'حساب بازیکن‌ات و همه‌ی چیزهایی که به آن بسته است، از روی سرور پاک می‌شود.',
    dangerGone: 'این‌ها برای همیشه پاک می‌شوند و برگشتی ندارند:',
    dangerGoneList: [
      'نام کاربری و تصویر پروفایلت',
      'بالاترین امتیاز، تعداد بازی‌ها و مدت بازی',
      'ذخیره‌ی ابری و هر چیزی که بازی روی سرور نگه داشته',
      'حضورت در جدول امتیازات'
    ],
    dangerKept: 'این‌ها می‌مانند:',
    dangerKeptList: [
      'سوابق پرداخت‌هایت — یک سند مالی است و پاک کردنش یعنی اگر شش هفته بعد سؤالی درباره‌ی یک پرداخت پیش بیاید، جوابی برایش نیست.',
      'چیزهایی که خریده‌ای. اگر دوباره با همان حساب گوگل وارد شوی، همان خریدها سر جایشان هستند — یعنی برای چیزی که یک بار پول داده‌ای، دوباره پول نمی‌دهی.'
    ],
    dangerGoogle: 'دسترسی این برنامه به حساب گوگلت جدا از این است و با این دکمه پس گرفته نمی‌شود. آن را از myaccount.google.com/permissions بردار.',
    dangerConfirm: 'می‌دانم که امتیاز، نام و ذخیره‌ی ابری‌ام برای همیشه پاک می‌شود.',
    dangerButton: 'حساب من را پاک کن',
    dangerNeedConfirm: 'برای ادامه باید تیک تأیید را بزنی.',
    dangerDone: 'حساب بازیکن‌ات پاک شد. اگر دوباره وارد شوی، یک حساب تازه ساخته می‌شود.',
    dangerFailed: 'حذف انجام نشد. کمی بعد دوباره امتحان کن؛ چیزی پاک نشده است.',
    dangerRestart: 'دوباره از اول شروع می‌کنی — با ورود دوباره، یک حساب خالی ساخته می‌شود.',

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

    boardPrivacyLabel: 'Leaderboard privacy',
    boardHideLabel: 'Keep me off the leaderboard',
    boardHideHint: 'Turn this on and you are removed from the public leaderboard completely — not your '
                 + 'score, not your name, not your picture, and no gap in the ranking where you used to '
                 + 'be. As far as the board is concerned you are not there.',
    boardHideKeeps: 'Nothing else changes. Your score is still recorded and still shown on this page, '
                  + 'your purchases and cloud save are untouched, and turning this back off puts you '
                  + 'straight back at whatever rank that score earns.',
    boardHiddenNow: 'You are currently hidden from the leaderboard.',
    boardShownNow: 'You currently appear on the leaderboard with your score.',
    boardUnavailable: 'This game\'s database does not support this yet.',
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

    dangerTitle: 'Delete your account',
    dangerLede: 'Your player account, and everything attached to it, is removed from the server.',
    dangerGone: 'These go, permanently, and cannot be brought back:',
    dangerGoneList: [
      'your username and profile picture',
      'your high score, your run count and your play time',
      'your cloud save and anything else the game keeps on the server',
      'your place on the leaderboard'
    ],
    dangerKept: 'These stay:',
    dangerKeptList: [
      'Your payment records. They are a financial document, and deleting them means that if a question about a payment comes up six weeks later there is nothing left to answer it with.',
      'What you have bought. Sign in again with the same Google account and your purchases are still there — you never pay twice for something you already paid for.'
    ],
    dangerGoogle: 'This app\'s access to your Google account is separate and this button does not withdraw it. Remove that at myaccount.google.com/permissions.',
    dangerConfirm: 'I understand my score, my name and my cloud save are deleted for good.',
    dangerButton: 'Delete my account',
    dangerNeedConfirm: 'Tick the confirmation box to continue.',
    dangerDone: 'Your player account has been deleted. Signing in again creates a fresh one.',
    dangerFailed: 'The deletion did not go through. Try again shortly — nothing has been removed.',
    dangerRestart: 'You start over — signing in again creates an empty account.',

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

    boardPrivacyLabel: 'ランキングの公開設定',
    boardHideLabel: 'ランキングに表示しない',
    boardHideKeeps: '他は何も変わりません。スコアはこれまでどおり記録され、このページでは確認できます。'
                  + '購入内容とクラウドセーブもそのままで、この設定を戻せばスコアに応じた順位にそのまま復帰します。',
    boardHideHint: 'オンにすると、公開ランキングから完全に外れます。スコアも名前も画像も表示されず、'
                 + '順位に空きが残ることもありません。ランキング上は存在しない扱いになります。',
    boardHiddenNow: '現在、ランキングには表示されていません。',
    boardShownNow: '現在、スコアとともにランキングに表示されています。',
    boardUnavailable: 'このゲームのデータベースはまだこの機能に対応していません。',
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

    dangerTitle: 'アカウントの削除',
    dangerLede: 'プレイヤーアカウントと、それに紐づくものがサーバーから削除されます。',
    dangerGone: '以下は完全に削除され、元に戻せません：',
    dangerGoneList: [
      'ユーザー名とプロフィール画像',
      'ハイスコア・プレイ回数・プレイ時間',
      'クラウドセーブなど、ゲームがサーバーに保存している内容',
      'ランキングへの掲載'
    ],
    dangerKept: '以下は残ります：',
    dangerKeptList: [
      '購入記録。これは会計上の記録であり、削除してしまうと数週間後に支払いについて問い合わせがあったとき、回答する材料が残りません。',
      '購入した内容。同じ Google アカウントで再度サインインすれば購入は残っています。一度支払ったものに二度払うことはありません。'
    ],
    dangerGoogle: '本アプリの Google アカウントへのアクセスは別扱いで、このボタンでは取り消されません。myaccount.google.com/permissions から解除してください。',
    dangerConfirm: 'スコア・名前・クラウドセーブが完全に削除されることを理解しています。',
    dangerButton: 'アカウントを削除する',
    dangerNeedConfirm: '続けるには確認のチェックを入れてください。',
    dangerDone: 'プレイヤーアカウントを削除しました。再度サインインすると新しいアカウントが作成されます。',
    dangerFailed: '削除できませんでした。しばらくしてからもう一度お試しください。何も削除されていません。',
    dangerRestart: '最初からのやり直しになります。再サインインで空のアカウントが作成されます。',

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

  // Somebody who has just deleted their account lands here with no
  // session, so this is the only place the confirmation can be
  // shown. Without it the delete button appears to sign them out
  // and nothing else, which reads as a failure.
  const deleted = url.searchParams.get('deleted') === '1'

  if (!player) {
    return createHtmlResponse(renderSignIn(game, lang, theme, failed, deleted), 200, headers)
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
  const deleteError = url.searchParams.get('delete_error') || ''

  return createHtmlResponse(
    renderAccount(game, lang, theme, player, owned, record, { saved, nameError, deleteError }),
    200, headers
  )
}


// ==========================================
// handleGameAccountDelete
// POST /:gameId/account/delete
//
// A player deleting their own record.
//
// POST, and never GET: a prefetching extension, a crawler
// following links or a link pasted into a chat that unfurls it
// would otherwise delete somebody's account for them. The same
// reason /account/logout is a POST, with far more at stake.
//
// What goes: the players row — username, picture, high score,
// run count, play time, cloud save — and the player_identity
// claim, which holds an email address and is therefore personal
// data too.
//
// What stays: game_orders. An order is a financial record, and
// deleting the money along with the account is how a chargeback
// six weeks later becomes unanswerable — the same rule the
// panel's own delete follows. Entitlements stay with it, so
// somebody who deletes and signs in again is not asked to buy
// what they already paid for. The page says all of this above
// the button rather than leaving it to be discovered.
//
// The session is cleared either way. Leaving somebody signed in
// as a row that no longer exists means the next page they open
// silently creates it again.
// ==========================================
export async function handleGameAccountDelete(url, request, gameId, requestId, GAMES, env) {
  const id = gameIdFrom(url)
  const game = await resolveGame(env, GAMES, id)
  if (!game) return createJsonResponse({ ok: false, error: 'unknown_game', requestId }, 404)

  const player = await readPlayerSession(env, GAMES, request)
  if (!player) return Response.redirect(`${url.origin}/${id}/account`, 302)

  const back = state => `${url.origin}/${id}/account${state}`

  let form
  try {
    form = new URLSearchParams(await request.text())
  } catch {
    return Response.redirect(back('?delete_error=1'), 302)
  }

  // The checkbox is `required` in the markup, which stops the
  // ordinary submit. This is the same check on the server, for
  // everything that is not an ordinary submit.
  if (form.get('confirm') !== '1') {
    return Response.redirect(back('?delete_error=confirm'), 302)
  }

  const database = playerDb(env, game)
  if (!database) return Response.redirect(back('?delete_error=1'), 302)

  // Keyed on the address as well as the id. A player id is
  // fifteen characters of an email's local part and two people
  // can derive the same one, so "the id matches" is not "the row
  // is yours" — and this is the worst possible place to conflate
  // them.
  const removed = await deletePlayerByEmail(database, player.playerId, player.email)
  if (!removed.ok) {
    logError('Player account deletion failed', {
      requestId, gameId: id, playerId: player.playerId, reason: removed.reason
    })
    return Response.redirect(back('?delete_error=1'), 302)
  }

  // The identity claim, which is the other place the address is
  // stored. Best-effort: a deployment that has not run 0009 has
  // no claims table, and the row above is already gone.
  const licence = db(env)
  if (licence) await releasePlayerIdentity(licence, game.id, player.playerId, player.email)

  logInfo('Player deleted their own account', {
    requestId, gameId: id, playerId: player.playerId, removed: removed.removed
  })

  return new Response(null, {
    status: 302,
    headers: { 'Location': back('?deleted=1'), 'Set-Cookie': clearPlayerSession() }
  })
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

  // ==========================================
  // The leaderboard opt-out.
  //
  // Only written when the form said it carried the field. An
  // unchecked checkbox is absent from a POST body, which is
  // indistinguishable from a form that never rendered one - and
  // treating those the same would put a hidden player back on the
  // public board the first time they corrected a typo in their
  // name from a build of this page that predates the switch.
  //
  // A refusal here is not fatal. The column may be missing on a
  // game database that has not run 0010, in which case there is
  // no board privacy to set and the rest of the form is still
  // what the player asked for.
  if (form.get('has_board_privacy') === '1') {
    const hidden = form.get('board_hidden') === '1'
    const written = await setLeaderboardOptOut(database, player.playerId, hidden)
    if (!written.ok) {
      logWarning('Leaderboard opt-out not saved', {
        requestId, gameId: id, playerId: player.playerId, reason: written.reason
      })
    } else {
      logInfo('Player set their leaderboard visibility', {
        requestId, gameId: id, playerId: player.playerId, hidden
      })
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
function renderSignIn(game, lang, theme, failed, deleted) {
  const t = pack(lang)

  const body = `
    <div class="ghead">${escapeHtml(t.title)}</div>
    <p class="glede">${escapeHtml(t.lede)}</p>

    ${deleted ? `<div class="gnote is-ok" style="margin-block-end:18px">
      ${escapeHtml(t.dangerDone)}
    </div>` : ''}

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

  // ==========================================
  // The leaderboard opt-out.
  //
  // Rendered inside the profile form rather than as a form of its
  // own, so it is saved by the same button as the name and the
  // picture and there is no second "save" to miss.
  //
  // The hidden `has_board_privacy` field is what tells the handler
  // that an unchecked box means "shown" rather than "the browser
  // did not send this field at all" - an unchecked checkbox is
  // simply absent from a form post, which is indistinguishable
  // from a form that never had one.
  //
  // Only rendered when the game's database actually has the
  // column. A switch that cannot be saved is worse than no switch:
  // it is a promise about a public page.
  const boardPrivacy = !game.capabilities.leaderboard ? '' : (
    record && Object.prototype.hasOwnProperty.call(record, 'leaderboard_opt_out')
      ? `
        <div class="acc-privacy">
          <span class="acc-privacy-head">${escapeHtml(t.boardPrivacyLabel)}</span>
          <input type="hidden" name="has_board_privacy" value="1">
          <label class="acc-check">
            <input type="checkbox" name="board_hidden" value="1"
                   ${Number(record.leaderboard_opt_out) === 1 ? 'checked' : ''}>
            <span>${escapeHtml(t.boardHideLabel)}</span>
          </label>
          <small>${escapeHtml(t.boardHideHint)}</small>
          <small>${escapeHtml(t.boardHideKeeps)}</small>
          <small class="acc-privacy-now">${escapeHtml(
            Number(record.leaderboard_opt_out) === 1 ? t.boardHiddenNow : t.boardShownNow)}</small>
        </div>`
      : `
        <div class="acc-privacy">
          <span class="acc-privacy-head">${escapeHtml(t.boardPrivacyLabel)}</span>
          <small>${escapeHtml(t.boardUnavailable)}</small>
        </div>`
  )

  // ==========================================
  // Deleting the account.
  //
  // Last on the page, behind a <details> that is closed by
  // default, behind a checkbox that has to be ticked, and posting
  // to its own route. Four small frictions, because this is the
  // one control here that cannot be undone and the three above it
  // are all "change my mind later" edits.
  //
  // The copy says what goes AND what stays, in that order. A
  // delete button that only lists what it destroys is the one
  // people press and then write in about, because "you said you
  // deleted everything, why do you still have my email on an
  // invoice?" is a fair question and the answer has to be on the
  // page before the button, not in a reply afterwards.
  //
  // <details> rather than a modal: no script, works with the
  // keyboard, and the browser's own find-in-page reaches inside a
  // closed one.
  const deleteBlock = `
    <div class="ghead" style="margin-block-start:26px">${escapeHtml(t.dangerTitle)}</div>
    <div class="gcard">
      ${flash.deleteError
        ? `<div class="gnote is-err" style="margin-block-end:14px">${escapeHtml(
            flash.deleteError === 'confirm' ? t.dangerNeedConfirm : t.dangerFailed)}</div>` : ''}

      <p style="color:var(--dim);font-size:.92em;line-height:1.8;margin-block-end:6px">
        ${escapeHtml(t.dangerLede)}
      </p>

      <details class="acc-danger">
        <summary>${escapeHtml(t.dangerButton)}</summary>

        <p class="acc-danger-head">${escapeHtml(t.dangerGone)}</p>
        <ul class="acc-danger-list is-gone">
          ${t.dangerGoneList.map(line => `<li>${escapeHtml(line)}</li>`).join('')}
        </ul>

        <p class="acc-danger-head">${escapeHtml(t.dangerKept)}</p>
        <ul class="acc-danger-list">
          ${t.dangerKeptList.map(line => `<li>${escapeHtml(line)}</li>`).join('')}
        </ul>

        <p class="acc-danger-note">${escapeHtml(t.dangerGoogle)}</p>
        <p class="acc-danger-note">${escapeHtml(t.dangerRestart)}</p>

        <form method="POST" action="/${escapeHtml(game.id)}/account/delete" style="margin-block-start:16px">
          <label class="acc-check" style="margin-block-end:14px">
            <input type="checkbox" name="confirm" value="1" required>
            <span>${escapeHtml(t.dangerConfirm)}</span>
          </label>
          <button type="submit" class="gbtn gbtn--danger">${escapeHtml(t.dangerButton)}</button>
        </form>
      </details>
    </div>`

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

        ${boardPrivacy}

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

      /* The board opt-out. Set apart from the two text fields
         above it because it is a different kind of decision: those
         change how you appear, this one decides whether you appear
         at all. */
      .acc-privacy{padding:16px;border-radius:14px;background:var(--surface-2);
        border:1px solid var(--border)}
      .acc-privacy-head{display:block;font-size:.8em;font-weight:700;color:var(--dim);
        margin-block-end:10px}
      .acc-privacy small{display:block;font-size:.78em;color:var(--dim);line-height:1.75;
        margin-block-start:8px}
      .acc-privacy-now{font-weight:700}
      .acc-check{display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:.92em;
        font-weight:600;line-height:1.5}
      .acc-check input{inline-size:18px;block-size:18px;margin:1px 0 0;flex-shrink:0;
        accent-color:var(--accent);cursor:pointer}

      /* Deleting the account. Red, closed by default, and it does
         not borrow the accent colour — this is the one control on
         the page that is not a preference. */
      .acc-danger summary{cursor:pointer;padding:11px 16px;border-radius:12px;font-weight:700;
        font-size:.92em;list-style:none;display:inline-flex;align-items:center;gap:8px;
        color:var(--err,#e5484d);background:color-mix(in srgb,var(--err,#e5484d) 10%,transparent);
        border:1px solid color-mix(in srgb,var(--err,#e5484d) 40%,transparent)}
      .acc-danger summary::-webkit-details-marker{display:none}
      .acc-danger summary::before{content:'⚠';font-size:1.05em}
      .acc-danger[open] summary{margin-block-end:16px}
      .acc-danger-head{font-size:.86em;font-weight:700;margin-block:14px 6px}
      .acc-danger-list{margin:0;padding-inline-start:20px;color:var(--dim);font-size:.86em;
        line-height:1.85}
      .acc-danger-list.is-gone{color:var(--err,#e5484d)}
      .acc-danger-list li{margin-block-end:5px}
      .acc-danger-note{font-size:.82em;color:var(--dim);line-height:1.8;margin-block-start:12px}
      .gbtn--danger{background:var(--err,#e5484d);border-color:transparent;color:#fff}

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
    </div>

    ${deleteBlock}`

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
