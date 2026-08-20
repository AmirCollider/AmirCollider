// ==========================================
// Pages/GameStore.js
// Buying something for a game, on the website.
//
// Public entry points (wired in Worker.js ROUTES):
//   GET  /:gameId/store          the shelf
//   POST /:gameId/store/buy      open an invoice
//   GET  /:gameId/store/order    wait for it, then see the outcome
//   GET  /:gameId/store/status   the same thing as JSON, for polling
//   POST /games/webhook          the payment provider calls this
// ==========================================

import { CONFIG } from '../Config.js'
import { createHtmlResponse, createJsonResponse, clientIp } from '../Core/Http.js'
import { logInfo, logWarning, logError } from '../Core/Logging.js'
import { verifyIpnSignature } from '../Commerce/Seal.js'
import { claimWebhook } from '../Commerce/Orders.js'
import { normalizeStatus } from '../Commerce/Provider.js'
import { resolveGame, resolveGames, effectiveProducts, isDownloadable } from '../Games/Registry.js'
import {
  db, getGameOrder, getGameOrderByInvoice, GAME_ORDER_STATE, listEntitlements, claimPlayerIdentity
} from '../Games/Store.js'
import { startPurchase, applyGamePayment, storeReady, readGameToken } from '../Games/Purchase.js'
import { readPlayerSession } from '../Games/Session.js'
import { page, chromeTheme, langHeader, localeFor, gameAccent } from './GameChrome.js'
import { keywordList, textWidth } from '../Core/Seo.js'
import { gameKeywords } from './GameLanding.js'
import { escapeHtml, jsString } from '../Core/Html.js'
import { matchRequestLang } from '../Core/RequestContext.js'

// Its own provider name in the callback ledger, so a game
// purchase and a licence purchase can never de-duplicate each
// other. The event key is payment id plus status, and payment
// ids are unique per provider account - not per shop.
const WEBHOOK_PROVIDER = 'nowpayments-game'


// ==========================================
// i18n
// ==========================================
const I18N = {
  fa: {
    title: 'فروشگاه',
    lede: 'با ارز دیجیتال پرداخت کن — بیت‌کوین، تتر، اتریوم، ترون و ده‌ها ارز دیگر. خرید بلافاصله به حساب بازی‌ات اضافه می‌شود.',

    // The meta description. {game} and {items} are filled in by
    // storeDescription(); the item list is the products this game
    // actually sells, so no two store pages describe themselves
    // the same way.
    metaDesc: 'خرید درون‌برنامه‌ای {game}: {items}. پرداخت با ارز دیجیتال و تحویل آنی به حساب بازی.',
    metaDescEmpty: 'فروشگاه {game}. پرداخت با ارز دیجیتال و تحویل آنی به حساب بازی. در حال حاضر محصولی برای فروش نیست.',

    needSignIn: 'برای خرید اول وارد شو',
    needSignInBody: 'خرید باید به همان حسابی برسد که داخل بازی وارد شده‌ای. با گوگل وارد شو تا مطمئن شویم به دست خودت می‌رسد.',
    signIn: 'ورود با گوگل',

    buy: 'خرید',
    buying: 'در حال ساختن صورتحساب…',
    owned: 'خریداری شده',
    have: 'داری',
    closed: 'فروشگاه این بازی فعلاً بسته است',
    closedBody: 'هیچ محصولی روی این بازی برای فروش گذاشته نشده.',
    off: 'خرید آنلاین روی این نسخه از سایت هنوز فعال نیست.',

    kindConsumable: 'مصرفی',
    kindNonconsumable: 'دائمی',
    kindPass: 'اشتراک',
    badgeBest: 'بهترین ارزش',
    badgeNew: 'جدید',
    badgeSale: 'تخفیف',
    days: 'روز',

    errBusy: 'تعداد درخواست‌ها زیاد بوده. چند دقیقه بعد دوباره امتحان کن.',
    errProvider: 'الان نتوانستیم صورتحساب بسازیم. چند لحظه بعد دوباره امتحان کن — پولی از حسابت کم نشده.',
    errGone: 'این محصول دیگر برای فروش نیست.',
    errAuth: 'جلسه‌ات تمام شده. دوباره وارد شو.',
    errConflict: 'این شناسه‌ی بازیکن به حساب گوگل دیگری تعلق دارد. با پشتیبانی تماس بگیر.',

    howTitle: 'چطور کار می‌کند',
    how: [
      'محصول را انتخاب می‌کنی و به صفحه‌ی امن پرداخت می‌روی.',
      'هر ارزی که داری را انتخاب می‌کنی و مبلغ را می‌فرستی — یا QR را با کیف پولت اسکن می‌کنی.',
      'به‌محض تأیید شبکه، خرید روی حسابت می‌نشیند.',
      'بازی را باز کن — همان‌جاست. لازم نیست کدی وارد کنی.'
    ],
    netTitle: 'کدام شبکه؟',
    netBody: 'تتر (USDT) روی چند شبکه وجود دارد — TRC20، ERC20، BEP20. در صفحه‌ی پرداخت هر کدام را انتخاب کنی، آدرس همان شبکه به تو داده می‌شود. فقط از همان شبکه بفرست.',

    // order page
    orderTitle: 'وضعیت سفارش',
    orderNo: 'شماره سفارش',
    stWaitH: 'منتظر پرداخت تو هستیم',
    stWaitB: 'اگر هنوز پرداخت نکرده‌ای، صفحه‌ی پرداخت را باز کن. این صفحه خودش به‌روز می‌شود.',
    stOpenPay: 'باز کردن صفحه‌ی پرداخت',
    stPaidH: 'پرداختت رسید',
    stPaidB: 'در حال اضافه کردن به حسابت. چند لحظه…',
    stDoneH: 'خرید روی حسابت نشست',
    stDoneB: 'بازی را باز کن — همان‌جاست. اگر بازی باز است، یک بار ببند و دوباره باز کن.',
    stPartialH: 'مبلغ پرداختی کمتر از صورتحساب بود',
    stPartialB: 'چیزی که رسید کمتر از مبلغ صورتحساب است، برای همین خودکار اضافه نشد. سفارشت ثبت شده و بررسی می‌کنیم.',
    stExpiredH: 'این صورتحساب منقضی شد',
    stExpiredB: 'پرداختی روی این سفارش ثبت نشد. اگر پرداخت کرده‌ای و دیر رسیده، به‌محض رسیدن خودکار اضافه می‌شود.',
    stRefundH: 'این پرداخت برگشت خورده',
    stRefundB: 'درگاه پرداخت این سفارش را برگردانده و محصولش از حساب برداشته شده.',
    stFailedH: 'این سفارش کامل نشد',
    stFailedB: 'پرداختی روی این سفارش تأیید نشد.',
    toAccount: 'حساب من',
    toStore: 'بازگشت به فروشگاه',
    notFound: 'چنین سفارشی پیدا نشد. لینک را کامل کپی کن.',
    support: 'کمک می‌خواهم'
  },

  en: {
    title: 'Store',
    lede: 'Pay with whatever you hold — Bitcoin, USDT, Ethereum, Tron and dozens more. What you buy is on your game account the moment it confirms.',
    metaDesc: 'In-app purchases for {game}: {items}. Paid in cryptocurrency, delivered to your game account the moment it confirms.',
    metaDescEmpty: 'The {game} store. Paid in cryptocurrency and delivered to your game account the moment it confirms. Nothing is on sale right now.',

    needSignIn: 'Sign in before you buy',
    needSignInBody: 'A purchase has to reach the account you are signed into in the game. Signing in with Google is how we know it will.',
    signIn: 'Continue with Google',

    buy: 'Buy',
    buying: 'Opening your invoice…',
    owned: 'Owned',
    have: 'You have',
    closed: 'This game’s store is closed',
    closedBody: 'Nothing is on sale for this game at the moment.',
    off: 'Online purchase is not switched on for this deployment yet.',

    kindConsumable: 'Consumable',
    kindNonconsumable: 'Permanent',
    kindPass: 'Pass',
    badgeBest: 'Best value',
    badgeNew: 'New',
    badgeSale: 'Sale',
    days: 'days',

    errBusy: 'That is a lot of attempts. Please try again in a few minutes.',
    errProvider: 'We could not open an invoice just now. Try again in a moment — you have not been charged.',
    errGone: 'That product is no longer on sale.',
    errAuth: 'Your session has expired. Please sign in again.',
    errConflict: 'This player id already belongs to a different Google account. Please contact support.',

    howTitle: 'How it works',
    how: [
      'Pick a product and you land on a secure payment page.',
      'Choose the coin you hold and send the amount — or scan the QR with your wallet.',
      'As soon as the network confirms, the purchase lands on your account.',
      'Open the game — it is already there. There is no code to type in.'
    ],
    netTitle: 'Which network?',
    netBody: 'USDT exists on several networks — TRC20, ERC20, BEP20. Whichever you pick on the payment page, the address you are given belongs to that network. Send only from the same one.',

    orderTitle: 'Order status',
    orderNo: 'Order',
    stWaitH: 'Waiting for your payment',
    stWaitB: 'If you have not paid yet, open the payment page. This page updates itself.',
    stOpenPay: 'Open the payment page',
    stPaidH: 'Your payment came through',
    stPaidB: 'Adding it to your account. One moment…',
    stDoneH: 'It is on your account',
    stDoneB: 'Open the game — it is already there. If the game is running, close and reopen it once.',
    stPartialH: 'Less arrived than the invoice asked for',
    stPartialB: 'The amount received is under the invoice total, so nothing was added automatically. Your order is recorded and we will look at it.',
    stExpiredH: 'This invoice expired',
    stExpiredB: 'No payment was recorded against this order. If you did pay and it arrived late, it lands automatically the moment it does.',
    stRefundH: 'This payment was refunded',
    stRefundB: 'The provider reversed the payment, so the product has been taken back off the account.',
    stFailedH: 'This order did not complete',
    stFailedB: 'No payment was confirmed against this order.',
    toAccount: 'My account',
    toStore: 'Back to the store',
    notFound: 'No such order. Please copy the whole link.',
    support: 'I need help'
  },

  ja: {
    title: 'ストア',
    lede: 'お手持ちの暗号資産でお支払いいただけます（BTC・USDT・ETH・TRX ほか多数）。決済が確定した時点でゲームアカウントに反映されます。',
    metaDesc: '{game} のアプリ内購入: {items}。暗号資産で支払い、決済確定と同時にゲームアカウントへ反映されます。',
    metaDescEmpty: '{game} のストア。暗号資産で支払い、決済確定と同時にゲームアカウントへ反映されます。現在販売中の商品はありません。',

    needSignIn: '購入前にサインイン',
    needSignInBody: '購入はゲームでサインイン中のアカウントに届く必要があります。Google サインインでそれを確認します。',
    signIn: 'Google で続ける',

    buy: '購入',
    buying: '請求書を作成中…',
    owned: '所有済み',
    have: '所持',
    closed: 'このゲームのストアは閉じています',
    closedBody: '現在販売中の商品はありません。',
    off: 'このデプロイではオンライン購入は有効ではありません。',

    kindConsumable: '消費型',
    kindNonconsumable: '永続',
    kindPass: 'パス',
    badgeBest: 'お得',
    badgeNew: '新着',
    badgeSale: 'セール',
    days: '日',

    errBusy: '試行回数が多すぎます。数分後にお試しください。',
    errProvider: '請求書を作成できませんでした。少し後にお試しください。課金はされていません。',
    errGone: 'その商品は販売終了しました。',
    errAuth: 'セッションが切れました。再度サインインしてください。',
    errConflict: 'このプレイヤーIDは別のGoogleアカウントのものです。サポートにご連絡ください。',

    howTitle: 'ご利用の流れ',
    how: [
      '商品を選ぶと安全な決済ページへ移動します。',
      'お持ちのコインを選んで送金、またはウォレットで QR を読み取ります。',
      'ネットワークの承認と同時にアカウントへ反映されます。',
      'ゲームを開けばすでに反映済みです。コード入力はありません。'
    ],
    netTitle: 'ネットワークについて',
    netBody: 'USDT には TRC20・ERC20・BEP20 など複数のネットワークがあります。決済ページで選んだネットワークのアドレスが表示されます。必ず同じネットワークから送金してください。',

    orderTitle: '注文状況',
    orderNo: '注文',
    stWaitH: 'お支払いをお待ちしています',
    stWaitB: 'まだの場合は決済ページを開いてください。このページは自動更新されます。',
    stOpenPay: '決済ページを開く',
    stPaidH: 'お支払いを確認しました',
    stPaidB: 'アカウントへ反映中です。少々お待ちください…',
    stDoneH: 'アカウントに反映されました',
    stDoneB: 'ゲームを開けばすでに反映済みです。起動中の場合は一度閉じて開き直してください。',
    stPartialH: '請求額に満たない入金です',
    stPartialB: '入金額が請求額を下回るため自動反映されていません。注文は記録済みで、確認いたします。',
    stExpiredH: 'この請求書は期限切れです',
    stExpiredB: '入金は記録されていません。遅れて到着した場合は、到着時点で自動的に反映されます。',
    stRefundH: '返金されました',
    stRefundB: '決済事業者により返金されたため、商品はアカウントから取り消されています。',
    stFailedH: 'この注文は完了しませんでした',
    stFailedB: 'この注文に対する支払いは確認されていません。',
    toAccount: 'アカウント',
    toStore: 'ストアへ戻る',
    notFound: '該当する注文がありません。リンク全体をコピーしてください。',
    support: 'サポートに問い合わせる'
  }
}

// ==========================================
// productArt
// The picture on a product card, or the emoji standing in for
// one.
//
// A catalogue of three near-identical knives cannot be told
// apart by 🔪 and 🗡️: the difference between them IS the
// artwork, so a game that ships artwork gets the artwork. The
// emoji is still there underneath - it is what renders while the
// image loads, what renders if it 404s, and what a game with no
// art gets - so nothing regresses for a catalogue of emoji.
//
// The URL is validated the same way every other operator-facing
// image on this site is. A product's `image` comes from
// Config.js today, which is code rather than input, but the
// product row is overridable from the panel and the check costs
// nothing.
// ==========================================
function productArt(product) {
  const emoji = escapeHtml(product.icon || '📦')
  const src = String((product && product.image) || '').trim()
  if (!/^(https?:\/\/|\/)/i.test(src)) return emoji

  // The emoji is the FALLBACK, so it has to disappear the moment
  // there is a picture. Stacking the two and leaving both visible
  // is what the first version did, and it drew a knife on top of
  // a knife emoji.
  //
  // Two mechanisms, because they cover different failures:
  //   :has(img) hides it with no script and no flash, and stops
  //             hiding it the instant onerror removes the image
  //   onload    the same for a browser without :has()
  //
  // Both agree on the rule: the emoji is visible exactly when
  // there is no <img> beside it.
  return '<span class="pic-art"><span class="pic-emoji">' + emoji + '</span>'
    + '<img src="' + escapeHtml(src) + '" alt="" loading="lazy" decoding="async"'
    + ' onload="this.previousElementSibling.hidden=true"'
    + ' onerror="this.remove()"></span>'
}


function pack(lang) {
  return I18N[lang] || I18N.fa
}

function gameIdFrom(url) {
  return url.pathname.split('/').filter(Boolean)[0] || ''
}


function localized(map, lang, fallback = '') {
  if (!map) return fallback
  return map[lang] || map.en || map.fa || fallback
}


// ==========================================
// handleGameStore
// GET /:gameId/store
// ==========================================
// ==========================================
// storeDescription
// What this particular store sells.
//
// Every store page on this Worker used to describe itself with the
// same sentence about cryptocurrency, which made six pages one
// result: a set of pages that differ only in their title is a set
// where Google picks one and files the rest under "Duplicate,
// Google chose a different canonical".
//
// Naming the products fixes that at the source, and it is honest -
// they are the products the page renders directly below. Three of
// them, because a description is not a catalogue and the fourth
// would be truncated anyway.
// ==========================================
// Rendered width, not characters - see textWidth() in Core/Seo.js.
const STORE_DESC_LIMIT = 158

function storeDescription(game, lang, products) {
  const t = pack(lang)
  const names = (products || [])
    .map(product => localized(product.i18n && product.i18n.name, lang, ''))
    .filter(Boolean)

  const separator = lang === 'ja' ? '・' : lang === 'fa' ? '، ' : ', '
  const build = list => String(list.length ? t.metaDesc : t.metaDescEmpty)
    .replace('{game}', game.name)
    .replace('{items}', list.join(separator))

  // As many product names as fit, longest list first - the same
  // rule landingDescription() uses on its feature list, and for the
  // same reason. A hard cut at 158 characters ends a description
  // mid-word, and a search result that ends mid-word reads as a
  // page that lost its own text.
  for (let count = Math.min(names.length, 3); count > 0; count--) {
    const candidate = build(names.slice(0, count))
    if (textWidth(candidate) <= STORE_DESC_LIMIT) return candidate
  }

  return build([])
}


export async function handleGameStore(url, request, gameId, requestId, GAMES, env) {
  const game = await resolveGame(env, GAMES, gameIdFrom(url))
  if (!game) return createJsonResponse({ ok: false, error: 'unknown_game', requestId }, 404)

  const lang = matchRequestLang(url, request)
  const theme = chromeTheme(request)
  const headers = langHeader(url, lang)

  const products = game.capabilities.store ? effectiveProducts(game) : []
  const player = game.capabilities.login ? await readPlayerSession(env, GAMES, request) : null

  const database = db(env)
  const owned = player && database ? await listEntitlements(database, game.id, player.playerId) : []

  return createHtmlResponse(
    renderStore(game, lang, theme, { products, player, owned, ready: storeReady(env) }),
    200, headers
  )
}


// ==========================================
// handleGameStoreBuy
// POST /:gameId/store/buy
// ==========================================
export async function handleGameStoreBuy(url, request, gameId, requestId, GAMES, env) {
  const id = gameIdFrom(url)
  const game = await resolveGame(env, GAMES, id)
  if (!game) return createJsonResponse({ ok: false, error: 'unknown_game', requestId }, 404)

  const lang = matchRequestLang(url, request)
  const t = pack(lang)

  const database = db(env)
  if (!database || !storeReady(env)) {
    return createJsonResponse({ ok: false, error: 'not_configured', message: t.off }, 503)
  }

  const player = await readPlayerSession(env, GAMES, request)
  if (!player) {
    return createJsonResponse({ ok: false, error: 'unauthorized', message: t.errAuth }, 401)
  }

  // Checked before the invoice is opened, not after it is paid.
  // A player id can be derived from two different addresses, and
  // the moment to discover that is while the customer still has
  // their money.
  const claim = await claimPlayerIdentity(database, game.id, player.playerId, player.email, player.sub)
  if (!claim.ok) {
    logWarning('Purchase refused: player id belongs to another account', {
      requestId, gameId: game.id, playerId: player.playerId
    })
    return createJsonResponse({
      ok: false,
      error: 'player_id_conflict',
      message: t.errConflict
    }, 403)
  }

  let body
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const result = await startPurchase(env, database, {
    game,
    productId: String(body.productId || ''),
    player,
    lang,
    ip: clientIp(request),
    origin: url.origin,
    quantity: body.quantity,
    GAMES
  })

  if (!result.ok) {
    const message =
      result.error === 'rate_limited' ? t.errBusy :
      result.error === 'not_for_sale' || result.error === 'unknown_product' ? t.errGone :
      result.error === 'not_configured' || result.error === 'no_store' ? t.off :
      t.errProvider

    return createJsonResponse({ ok: false, error: result.error, message }, result.status || 400)
  }

  logInfo('Game store purchase opened', { requestId, gameId: game.id, orderId: result.orderId })
  return createJsonResponse({ ok: true, payUrl: result.payUrl, statusUrl: result.statusUrl })
}


// ==========================================
// handleGameStoreOrder
// GET /:gameId/store/order?o=<token>
// ==========================================
export async function handleGameStoreOrder(url, request, gameId, requestId, GAMES, env) {
  const id = gameIdFrom(url)
  const game = await resolveGame(env, GAMES, id)
  if (!game) return createJsonResponse({ ok: false, error: 'unknown_game', requestId }, 404)

  const lang = matchRequestLang(url, request)
  const theme = chromeTheme(request)
  const handle = url.searchParams.get('o') || ''

  const database = db(env)
  const order = database ? await resolveOrder(env, GAMES, database, handle, game.id) : null

  return createHtmlResponse(
    renderOrder(game, lang, theme, handle, order),
    order ? 200 : 404,
    langHeader(url, lang)
  )
}


// ==========================================
// handleGameStoreStatus
// GET /:gameId/store/status?o=<token>
//
// The polling endpoint. Answers only what the person holding
// the link already knows - their own order, their own product,
// its state - because the link is all it takes to get here.
// ==========================================
export async function handleGameStoreStatus(url, request, gameId, requestId, GAMES, env) {
  const id = gameIdFrom(url)
  const database = db(env)
  if (!database) return createJsonResponse({ ok: false, error: 'not_configured' }, 503)

  const order = await resolveOrder(env, GAMES, database, url.searchParams.get('o'), id)
  if (!order) return createJsonResponse({ ok: false, error: 'not_found' }, 404)

  return createJsonResponse({
    ok: true,
    status: order.status,
    productId: order.product_id,
    priceUsd: order.price_usd,
    quantity: order.quantity,
    createdAt: order.created_at,
    grantedAt: order.granted_at || null
  }, 200, { 'Cache-Control': 'no-store' })
}


// A handle resolves to an order only if it is signed AND
// belongs to the game whose page is asking. Without the second
// check, a valid token for one game would render inside
// another's chrome - harmless, and exactly the kind of
// harmless that turns into a support question.
async function resolveOrder(env, GAMES, database, handle, gameId) {
  const orderId = await readGameToken(env, GAMES, handle)
  if (!orderId) return null

  const order = await getGameOrder(database, orderId)
  if (!order || (gameId && order.game_id !== gameId)) return null
  return order
}


// ==========================================
// handleGameWebhook
// POST /games/webhook
//
// Four rules, and every one of them is load-bearing:
//
//   • Verify the signature before parsing anything into a
//     decision. This URL is public and the body is attacker-
//     controlled; without the check, posting JSON here is a way
//     to be given a season pass for free.
//
//   • De-duplicate. Providers retry, correctly, and the same
//     "finished" will arrive several times.
//
//   • Answer 200 for anything understood, including events not
//     acted on. A non-200 makes the provider retry, and
//     retrying a callback correctly ignored achieves nothing
//     but load.
//
//   • Never let an exception escape. A 500 here is a callback
//     the provider will re-send, which is fine once and a storm
//     by the twentieth attempt.
// ==========================================
export async function handleGameWebhook(url, request, gameId, requestId, GAMES, env) {
  const database = db(env)
  if (!database) return createJsonResponse({ ok: false, error: 'not_configured' }, 503)

  const secret = env && env.NOWPAYMENTS_IPN_SECRET
  if (!secret) {
    logError('Game IPN received but NOWPAYMENTS_IPN_SECRET is not set', { requestId })
    return createJsonResponse({ ok: false, error: 'not_configured' }, 503)
  }

  const raw = await request.text()
  const presented = request.headers.get('x-nowpayments-sig')

  if (!await verifyIpnSignature(secret, raw, presented)) {
    // A warning, not an error, and without the body. An unsigned
    // POST to a public URL is background noise on the internet;
    // it becomes interesting only if it is frequent, which a
    // counter on this line will show.
    logWarning('Game IPN signature rejected', { requestId })
    return createJsonResponse({ ok: false, error: 'bad_signature' }, 401)
  }

  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    return createJsonResponse({ ok: false, error: 'bad_json' }, 400)
  }

  try {
    const orderId = String(payload.order_id || '')
    const paymentId = String(payload.payment_id || '')
    const providerStatus = String(payload.payment_status || '')

    // Not ours. Both shops share one provider account and one IPN
    // secret, so the licence checkout's callbacks arrive here too
    // whenever a URL is misconfigured. Answering 200 and walking
    // away is correct: the other handler has its own copy.
    if (orderId && !orderId.startsWith('gord_')) {
      return createJsonResponse({ ok: true, ignored: 'not_a_game_order' })
    }

    const eventKey = `${paymentId || 'nopay'}:${providerStatus}`
    const isNew = await claimWebhook(database, WEBHOOK_PROVIDER, eventKey, orderId)
    if (!isNew) return createJsonResponse({ ok: true, duplicate: true })

    const order = orderId
      ? await getGameOrder(database, orderId)
      : await getGameOrderByInvoice(database, payload.invoice_id)

    if (!order) {
      // Money against an order we have no record of. Rare, and
      // serious: it means a row was lost, or a payment was made
      // against an invoice opened outside this Worker.
      logWarning('Game IPN for an unknown order', { requestId, orderId, paymentId })
      return createJsonResponse({ ok: true, unknown: true })
    }

    const merged = await resolveGames(env, GAMES)

    await applyGamePayment(env, database, order, {
      state: normalizeStatus(providerStatus),
      providerStatus,
      paymentId,
      payCurrency: String(payload.pay_currency || ''),
      payAmount: payload.pay_amount != null ? String(payload.pay_amount) : '',
      actuallyPaid: payload.actually_paid != null ? String(payload.actually_paid) : ''
    }, merged)

    logInfo('Game IPN handled', { requestId, orderId: order.id, providerStatus })
    return createJsonResponse({ ok: true })

  } catch (error) {
    logError('Game IPN handling failed', { requestId, error: error.message })
    // 200 on purpose. The reconciler will pick this order up on
    // the next tick, and a 500 buys a retry storm instead.
    return createJsonResponse({ ok: true, deferred: true })
  }
}


// ==========================================
// Views
// ==========================================
function kindLabel(kind, t) {
  return kind === 'consumable' ? t.kindConsumable
    : kind === 'pass' ? t.kindPass
    : t.kindNonconsumable
}

function badgeLabel(badge, t) {
  return badge === 'best' ? t.badgeBest : badge === 'new' ? t.badgeNew : badge === 'sale' ? t.badgeSale : ''
}


function renderStore(game, lang, theme, { products, player, owned, ready }) {
  const t = pack(lang)
  const locale = localeFor(lang)
  const accent = gameAccent(game.color)

  const ownedBy = {}
  for (const row of owned) ownedBy[row.product_id] = row

  const cards = products.map(product => {
    const row = ownedBy[product.id]
    const isOwned = row && product.kind !== 'consumable'
    const balance = row && product.kind === 'consumable' ? row.quantity : 0
    const badge = badgeLabel(product.badge, t)

    return `
      <article class="pcard"${product.badge === 'best' ? ' data-featured="1"' : ''}>
        ${badge ? `<span class="pbadge">${escapeHtml(badge)}</span>` : ''}
        <div class="pic">${productArt(product)}</div>
        <h3 class="pname">${escapeHtml(localized(product.i18n && product.i18n.name, lang, product.id))}</h3>
        <p class="pdesc">${escapeHtml(localized(product.i18n && product.i18n.description, lang, ''))}</p>

        <div class="pmeta">
          <span class="gchip is-dim">${escapeHtml(kindLabel(product.kind, t))}</span>
          ${product.durationDays ? `<span class="gchip is-dim">${Number(product.durationDays)} ${escapeHtml(t.days)}</span>` : ''}
          ${balance > 0 ? `<span class="gchip is-ok">${escapeHtml(t.have)} ${Number(balance).toLocaleString(locale)}</span>` : ''}
        </div>

        <div class="pfoot">
          <span class="pprice" dir="ltr">$${escapeHtml(product.priceUsd)}</span>
          ${isOwned
            ? `<span class="gchip is-ok">✓ ${escapeHtml(t.owned)}</span>`
            : `<button type="button" class="gbtn" data-product="${escapeHtml(product.id)}"
                 onclick="gsBuy(this)"${!player || !ready ? ' disabled' : ''}>${escapeHtml(t.buy)}</button>`}
        </div>
      </article>`
  }).join('')

  const gate = !game.capabilities.store || !products.length
    ? `<div class="gcard"><h2 style="font-size:1.05em;margin-block-end:8px">${escapeHtml(t.closed)}</h2>
         <p style="color:var(--dim);font-size:.92em">${escapeHtml(t.closedBody)}</p></div>`
    : !ready
      ? `<div class="gnote is-warn" style="margin-block-end:18px">${escapeHtml(t.off)}</div>`
      : !player
        ? `<div class="gcard" style="margin-block-end:20px;display:flex;gap:16px;align-items:center;flex-wrap:wrap">
             <span style="font-size:2em">🔐</span>
             <span style="flex:1 1 260px">
               <b style="display:block;margin-block-end:4px">${escapeHtml(t.needSignIn)}</b>
               <span style="color:var(--dim);font-size:.88em;line-height:1.6">${escapeHtml(t.needSignInBody)}</span>
             </span>
             <a class="gbtn" href="/${escapeHtml(game.id)}/account/signin?lang=${escapeHtml(lang)}&next=${encodeURIComponent('/' + game.id + '/store')}">
               ${escapeHtml(t.signIn)}</a>
           </div>`
        : ''

  // ==========================================
  // An h1, not a styled div.
  //
  // This page had no h1 at all - the heading was a div wearing the
  // heading class, on all six store pages. A document with no h1
  // has no stated subject: a crawler falls back to the title tag
  // and a screen reader's heading list opens on "How it works",
  // which is the second section.
  //
  // The game's name is in it now as well, because "Store" is the
  // heading of six different pages on this domain and the one word
  // that tells them apart was only ever in the title tag.
  //
  // .ghead already styles h1, h2 and div identically, so nothing
  // about the page moves.
  // ==========================================
  const body = `
    <h1 class="ghead">${escapeHtml(game.name)} — ${escapeHtml(t.title)}</h1>
    <p class="glede">${escapeHtml(t.lede)}</p>

    ${gate}

    ${products.length ? `<div class="pgrid">${cards}</div>` : ''}

    <div id="gs-error" class="gnote is-err" style="display:none;margin-block-start:18px" role="status"></div>

    ${products.length ? `
    <div class="gcard" style="margin-block-start:26px">
      <h2 style="font-size:1em;margin-block-end:12px">${escapeHtml(t.howTitle)}</h2>
      <ol style="margin:0;padding-inline-start:20px;color:var(--dim);font-size:.9em;line-height:1.95">
        ${t.how.map(line => `<li>${escapeHtml(line)}</li>`).join('')}
      </ol>
      <div class="gnote is-warn" style="margin-block-start:16px">
        <b>${escapeHtml(t.netTitle)}</b><br>${escapeHtml(t.netBody)}
      </div>
    </div>` : ''}

    <style>
      .pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px}
      .pcard{position:relative;display:flex;flex-direction:column;padding:22px 20px;border-radius:var(--radius);
        background:var(--surface);border:1px solid var(--border);
        transition:transform .2s ease,border-color .2s ease,background .2s ease}
      .pcard:hover{transform:translateY(-4px);background:var(--surface-2);
        border-color:color-mix(in srgb,var(--accent) 45%,var(--border))}
      .pcard[data-featured="1"]{border-color:color-mix(in srgb,var(--accent) 55%,var(--border));
        box-shadow:0 12px 34px color-mix(in srgb,var(--accent) 16%,transparent)}
      .pbadge{position:absolute;inset-block-start:12px;inset-inline-end:12px;padding:3px 10px;border-radius:999px;
        font-size:.68em;font-weight:800;color:var(--on-accent);
        background:linear-gradient(135deg,var(--accent),color-mix(in srgb,var(--accent) 45%,#fff))}
      .pic{font-size:2.3em;line-height:1;margin-block-end:12px}

      /* The emoji is the floor and the artwork is drawn over it,
         so a 404 or a slow connection leaves the card looking
         like it did before there was art rather than leaving a
         hole where the product used to be. */
      .pic-art{position:relative;display:inline-grid;place-items:center;min-width:64px;min-height:64px}
      .pic-art img{max-width:100%;max-height:64px;width:auto;height:auto;object-fit:contain;
        filter:drop-shadow(0 6px 14px color-mix(in srgb,var(--accent) 38%,transparent))}
      /* Same cell, so the box does not resize when one replaces
         the other - but only ever one of them is showing. */
      .pic-art > *{grid-area:1/1}
      .pic-art .pic-emoji[hidden]{display:none}
      .pic-art:has(img) .pic-emoji{display:none}
      .pname{font-size:1.02em;font-weight:800;margin-block-end:6px}
      .pdesc{font-size:.85em;line-height:1.6;color:var(--dim);flex:1}
      .pmeta{display:flex;gap:6px;flex-wrap:wrap;margin-block:12px 14px}
      .pfoot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
      .pprice{font-size:1.25em;font-weight:800;color:color-mix(in srgb,var(--accent) 45%,var(--text))}
      .pfoot .gbtn{padding:9px 18px;font-size:.85em}
      @media (prefers-reduced-motion:no-preference){
        .pcard{animation:gRise .45s cubic-bezier(.16,1,.3,1) both}
      }
    </style>`

  const script = `<script>
    var GS = { game: ${jsString(game.id)}, lang: ${jsString(lang)},
               busy: ${jsString(t.buying)}, buy: ${jsString(t.buy)},
               net: ${jsString(t.errProvider)} };

    function gsBuy(button){
      var box = document.getElementById('gs-error');
      box.style.display = 'none';

      var product = button.getAttribute('data-product');
      var label = button.textContent;
      button.disabled = true;
      button.textContent = GS.busy;

      fetch('/' + GS.game + '/store/buy?lang=' + encodeURIComponent(GS.lang), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product })
      })
      .then(function(res){ return res.json().then(function(data){ return { ok: res.ok, data: data }; }); })
      .then(function(result){
        if (result.ok && result.data && result.data.payUrl) {
          window.location.href = result.data.payUrl;
          return;
        }
        button.disabled = false;
        button.textContent = label;
        box.textContent = (result.data && result.data.message) || GS.net;
        box.style.display = 'block';
      })
      .catch(function(){
        button.disabled = false;
        button.textContent = label;
        box.textContent = GS.net;
        box.style.display = 'block';
      });
    }
  </script>`

  return page({
    game, lang, theme, active: 'store',
    title: `${game.name} — ${t.title}`,

    // The game's name in the description as well as the title.
    // "What you can buy in this game" was true of every store page
    // this Worker serves, which made all of them the same result
    // to a search engine - and a set of pages that differ only in
    // their title is a set where one gets indexed.
    description: storeDescription(game, lang, products),
    keywords: keywordList(gameKeywords(game, lang), t.title),
    downloadable: isDownloadable(game),
    body, script
  })
}


function renderOrder(game, lang, theme, handle, order) {
  const t = pack(lang)
  const locale = localeFor(lang)

  if (!order) {
    const body = `
      <div class="ghead">${escapeHtml(t.orderTitle)}</div>
      <div class="gcard">
        <p style="color:var(--dim);font-size:.95em;line-height:1.7">${escapeHtml(t.notFound)}</p>
        <div style="margin-block-start:18px">
          <a class="gbtn" href="/${escapeHtml(game.id)}/store">${escapeHtml(t.toStore)}</a>
        </div>
      </div>`

    return page({
      game, lang, theme, active: 'store',
      title: `${game.name} — ${t.orderTitle}`,
      downloadable: isDownloadable(game),
      body
    })
  }

  const product = effectiveProducts(game).find(item => item.id === order.product_id)
  const productName = product
    ? localized(product.i18n && product.i18n.name, lang, order.product_id)
    : order.product_id

  const states = {
    [GAME_ORDER_STATE.CREATED]: { cls: 'is-warn', mark: '⏳', h: t.stWaitH, b: t.stWaitB },
    [GAME_ORDER_STATE.AWAITING]: { cls: 'is-warn', mark: '⏳', h: t.stWaitH, b: t.stWaitB },
    [GAME_ORDER_STATE.PAID]: { cls: 'is-warn', mark: '⚡', h: t.stPaidH, b: t.stPaidB },
    [GAME_ORDER_STATE.GRANTED]: { cls: 'is-ok', mark: '✅', h: t.stDoneH, b: t.stDoneB },
    [GAME_ORDER_STATE.PARTIAL]: { cls: 'is-warn', mark: '⚠️', h: t.stPartialH, b: t.stPartialB },
    [GAME_ORDER_STATE.EXPIRED]: { cls: 'is-err', mark: '⌛', h: t.stExpiredH, b: t.stExpiredB },
    [GAME_ORDER_STATE.REFUNDED]: { cls: 'is-err', mark: '↩️', h: t.stRefundH, b: t.stRefundB },
    [GAME_ORDER_STATE.FAILED]: { cls: 'is-err', mark: '✕', h: t.stFailedH, b: t.stFailedB }
  }
  const view = states[order.status] || states[GAME_ORDER_STATE.AWAITING]

  // Only these two keep polling. A granted, expired or refunded
  // order is finished, and a page that keeps asking about it is
  // a request every three seconds forever from any tab somebody
  // left open.
  const live = order.status === GAME_ORDER_STATE.AWAITING
            || order.status === GAME_ORDER_STATE.CREATED
            || order.status === GAME_ORDER_STATE.PAID

  const body = `
    <div class="ghead">${escapeHtml(t.orderTitle)}</div>

    <div class="gcard" style="text-align:center;padding:34px 26px">
      <div style="font-size:2.8em;line-height:1;margin-block-end:12px" id="gs-mark">${view.mark}</div>
      <h1 style="font-size:1.2em;margin-block-end:10px" id="gs-title">${escapeHtml(view.h)}</h1>
      <p style="color:var(--dim);font-size:.93em;line-height:1.75;max-width:46ch;margin:0 auto"
         id="gs-body">${escapeHtml(view.b)}</p>

      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-block-start:24px">
        <a class="gbtn" href="/${escapeHtml(game.id)}/account?lang=${escapeHtml(lang)}">${escapeHtml(t.toAccount)}</a>
        <a class="gbtn gbtn--ghost" href="/${escapeHtml(game.id)}/store?lang=${escapeHtml(lang)}">${escapeHtml(t.toStore)}</a>
      </div>
    </div>

    <div class="gcard" style="margin-block-start:16px">
      <div style="display:flex;justify-content:space-between;gap:12px;padding-block:8px;border-block-end:1px solid var(--border)">
        <span style="color:var(--dim);font-size:.86em">${escapeHtml(t.orderNo)}</span>
        <code dir="ltr" style="font-size:.86em">${escapeHtml(order.id)}</code>
      </div>
      <div style="display:flex;justify-content:space-between;gap:12px;padding-block:8px;border-block-end:1px solid var(--border)">
        <span style="color:var(--dim);font-size:.86em">${escapeHtml(productName)}</span>
        <b dir="ltr">$${escapeHtml(order.price_usd)}${order.quantity > 1 ? ' ×' + order.quantity : ''}</b>
      </div>
      <div style="display:flex;justify-content:space-between;gap:12px;padding-block:8px">
        <span style="color:var(--dim);font-size:.86em">${new Date(order.created_at).toLocaleString(locale)}</span>
        <span class="gchip ${view.cls === 'is-ok' ? 'is-ok' : 'is-dim'}" id="gs-state">${escapeHtml(order.status)}</span>
      </div>
      <p style="margin-block-start:14px">
        <a href="mailto:${escapeHtml(CONFIG.SUPPORT_EMAIL)}?subject=${encodeURIComponent(game.name + ' order ' + order.id)}"
           style="color:var(--dim);font-size:.84em">${escapeHtml(t.support)}</a>
      </p>
    </div>`

  const script = live ? `<script>
    var GO = {
      game: ${jsString(game.id)},
      handle: ${jsString(handle)},
      done: ${jsString(t.stDoneH)},
      doneBody: ${jsString(t.stDoneB)}
    };

    // Every three seconds while the order is in flight, and it
    // stops the moment it is not. A page left open on a finished
    // order should cost nothing.
    var timer = setInterval(function(){
      fetch('/' + GO.game + '/store/status?o=' + encodeURIComponent(GO.handle))
        .then(function(res){ return res.json(); })
        .then(function(data){
          if (!data || !data.ok) return;
          document.getElementById('gs-state').textContent = data.status;
          if (data.status === 'granted') {
            clearInterval(timer);
            document.getElementById('gs-mark').textContent = '✅';
            document.getElementById('gs-title').textContent = GO.done;
            document.getElementById('gs-body').textContent = GO.doneBody;
          } else if (data.status !== 'awaiting_payment' && data.status !== 'created' && data.status !== 'paid') {
            clearInterval(timer);
            window.location.reload();
          }
        })
        .catch(function(){});
    }, 3000);
  </script>` : ''

  return page({
    game, lang, theme, active: 'store',
    title: `${game.name} — ${t.orderTitle}`,
    downloadable: isDownloadable(game),
    body, script
  })
}
