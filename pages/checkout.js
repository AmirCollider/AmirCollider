// ==========================================
// pages/checkout.js
// Buying Unity DocSnap with cryptocurrency, end to end.
//
// Public entry points (wired in worker.js ROUTES):
//   GET  /checkout          pick a tier, leave an address
//   POST /checkout/create   open an invoice
//   GET  /checkout/pay      wait for it, then see the outcome
//   GET  /checkout/status   the same thing as JSON, for polling
//   POST /checkout/resend   send the key email again
//   POST /checkout/webhook  the payment provider calls this
//
// The whole path is: two form fields, a hosted payment page,
// and an email. Nothing else. No account to create, no
// password, nothing stored that a customer would have to
// come back and manage.
//
// An email address is the only thing collected, and it is
// collected because it is the delivery address - not to
// build a list. It is asked for BEFORE the payment page
// rather than after, which is the one piece of ordering
// that matters here: a crypto payment cannot be reversed
// and cannot be traced back to a person, so an address
// captured after the money moves is an address we do not
// have when somebody closes the tab at the wrong moment.
//
// Trilingual and theme-aware like the rest of the site.
// ==========================================

import { CONFIG } from '../config.js'
import { getPageHead } from '../shared-styles.js'
import { createHtmlResponse, createJsonResponse, logInfo, logWarning, logError } from '../utils.js'
import { supportTemplate, mailtoFor } from '../content/supportTemplates.js'
import { signOrderToken, readOrderToken, verifyIpnSignature } from '../commerce/seal.js'
import {
  db, ORDER_STATE, newOrderId, createOrder, getOrder, getOrderByInvoice,
  markInvoiceOpened, setStatus, logEvent, claimWebhook,
  isOrderRateLimited, recordOrderAttempt
} from '../commerce/orders.js'
import {
  isConfigured as providerConfigured, createInvoice, normalizeStatus
} from '../commerce/provider.js'
import { applyPaymentState, resendLicense, alertAdmin } from '../commerce/fulfilment.js'
import { mailConfigured } from '../commerce/mailer.js'

const DEFAULT_LANG = 'fa'
const LANGS = ['fa', 'en', 'ja']
const PROMISE_MINUTES = CONFIG.COMMERCE.DELIVERY_PROMISE_MINUTES


// ==========================================
// i18n
// ==========================================
const I18N = {
  fa: {
    locale: 'fa-IR', dir: 'rtl', langName: 'فارسی',

    title: 'خرید Unity DocSnap',
    heading: 'خرید با ارز دیجیتال',
    sub: 'با هر ارزی که دوست داری پرداخت کن — بیت‌کوین، تتر (USDT)، اتریوم، ترون و ده‌ها ارز دیگر. کلید لایسنس خودکار به ایمیلت می‌آید.',

    pick: 'کدام نسخه؟',
    oneOff: 'خرید یک‌باره · یک سیستم · بدون اشتراک',

    emailLabel: 'ایمیل شما',
    emailHint: 'کلید لایسنس دقیقاً به همین آدرس فرستاده می‌شود. دقت کن درست باشد.',
    emailPlaceholder: 'you@example.com',
    confirmLabel: 'تکرار ایمیل',
    confirmHint: 'یک بار دیگر بنویس تا مطمئن شویم اشتباه تایپی نشده.',

    payCta: 'پرداخت با ارز دیجیتال',
    working: 'در حال ساختن صورتحساب…',

    stepsTitle: 'چطور کار می‌کند',
    steps: [
      'ایمیلت را وارد می‌کنی و دکمه‌ی پرداخت را می‌زنی.',
      'به صفحه‌ی امن پرداخت می‌روی و ارز دلخواهت را انتخاب می‌کنی (BTC، USDT، ETH، TRX و…).',
      'مبلغ را به آدرس نمایش‌داده‌شده می‌فرستی — یا QR را با کیف پولت اسکن می‌کنی.',
      `به‌محض تأیید شبکه، کلید لایسنس به‌صورت خودکار ساخته و به ایمیلت ارسال می‌شود (معمولاً کمتر از ${PROMISE_MINUTES} دقیقه).`
    ],

    safeTitle: 'اگر چیزی اشتباه پیش برود',
    safeBody: `اگر تا ${PROMISE_MINUTES} دقیقه بعد از پرداخت کلید به ایمیلت نرسید، نگران نباش — سیستم خودش دوباره تلاش می‌کند. اگر باز هم نرسید، از صفحه‌ی «سفارش من» یک ایمیل آماده برای پشتیبانی برمی‌داری و می‌فرستی.`,
    safeCta: 'صفحه‌ی سفارش من',

    tokenTitle: 'کدام شبکه؟',
    tokenBody: 'حواست باشد تتر (USDT) روی چند شبکه وجود دارد — TRC20، ERC20، BEP20. در صفحه‌ی پرداخت هر کدام را انتخاب کنی، آدرس همان شبکه به تو داده می‌شود. فقط از همان شبکه بفرست.',

    errEmail: 'یک آدرس ایمیل معتبر بنویس.',
    errMismatch: 'دو ایمیل یکی نیستند.',
    errTier: 'نسخه را انتخاب کن.',
    errBusy: 'تعداد درخواست‌ها زیاد بوده. چند دقیقه بعد دوباره امتحان کن.',
    errProvider: 'الان نتوانستیم صورتحساب بسازیم. چند لحظه بعد دوباره امتحان کن — پولی از حسابت کم نشده.',
    errOff: 'خرید آنلاین روی این نسخه از سایت هنوز فعال نیست.',

    // --- pay / status page ---
    payTitle: 'وضعیت سفارش',
    orderNo: 'شماره سفارش',

    stWaitingH: 'منتظر پرداخت شما هستیم',
    stWaitingB: 'اگر هنوز پرداخت نکرده‌ای، صفحه‌ی پرداخت را باز کن. این صفحه خودش به‌روز می‌شود — لازم نیست رفرش کنی.',
    stOpenPay: 'باز کردن صفحه‌ی پرداخت',

    stConfirmH: 'پرداخت شما دریافت شد',
    stConfirmB: 'در حال ساختن کلید لایسنس و ارسال آن به ایمیلت. چند لحظه صبر کن…',

    stDoneH: 'کلید لایسنس برایت ارسال شد',
    stDoneB: email => `کلید به <b dir="ltr">${email}</b> فرستاده شد. اگر در Inbox نبود، پوشه‌ی Spam / Junk را هم نگاه کن.`,

    stPartialH: 'مبلغ پرداختی کمتر از صورتحساب بود',
    stPartialB: 'مبلغی که رسید کمتر از مبلغ صورتحساب است، برای همین به‌صورت خودکار کلید صادر نشد. سفارشت ثبت شده و ما بررسی می‌کنیم — از دکمه‌ی زیر برای تماس با پشتیبانی استفاده کن.',

    stExpiredH: 'این صورتحساب منقضی شد',
    stExpiredB: 'پرداختی روی این سفارش ثبت نشد. اگر پرداخت کرده‌ای و دیر رسیده، نگران نباش — به‌محض رسیدن، کلید خودکار ارسال می‌شود. در غیر این صورت می‌توانی سفارش جدیدی بسازی.',
    stExpiredCta: 'ساختن سفارش جدید',

    stRefundH: 'این پرداخت برگشت خورده است',
    stRefundB: 'پرداخت این سفارش توسط درگاه برگشت داده شده و لایسنس آن معتبر نیست.',

    stFailedH: 'این سفارش تکمیل نشد',
    stFailedB: 'پرداختی روی این سفارش تأیید نشد. اگر فکر می‌کنی اشتباهی رخ داده، با پشتیبانی تماس بگیر.',

    maskedKey: 'کلید صادرشده',
    resend: 'دوباره برایم ایمیل کن',
    resendOk: 'ایمیل دوباره فرستاده شد. چند دقیقه صبر کن.',
    resendBusy: 'به‌تازگی چند بار فرستاده شده. یک ساعت دیگر دوباره امتحان کن.',
    resendGone: 'دوره‌ی نگهداری کلید تمام شده و دیگر نمی‌توانیم خودکار بفرستیمش. با پشتیبانی تماس بگیر — شماره‌ی سفارش را داری.',
    resendErr: 'ارسال دوباره ممکن نشد. با پشتیبانی تماس بگیر.',

    helpCta: 'کمک می‌خواهم',
    backProduct: 'بازگشت به Unity DocSnap',
    notFound: 'چنین سفارشی پیدا نشد. لینک را کامل کپی کن، یا از صفحه‌ی «سفارش من» با ایمیلت جست‌وجو کن.'
  },

  en: {
    locale: 'en-US', dir: 'ltr', langName: 'English',

    title: 'Buy Unity DocSnap',
    heading: 'Pay with cryptocurrency',
    sub: 'Pay in whatever you hold — Bitcoin, USDT, Ethereum, Tron and dozens more. Your licence key is generated and emailed automatically.',

    pick: 'Which edition?',
    oneOff: 'One-off purchase · one machine · no subscription',

    emailLabel: 'Your email',
    emailHint: 'The licence key goes to exactly this address. Please check it.',
    emailPlaceholder: 'you@example.com',
    confirmLabel: 'Email again',
    confirmHint: 'Typed twice so a slip cannot send your key somewhere you cannot read it.',

    payCta: 'Pay with crypto',
    working: 'Opening your invoice…',

    stepsTitle: 'How it works',
    steps: [
      'Enter your email and press the pay button.',
      'You land on a secure payment page and pick the coin you want (BTC, USDT, ETH, TRX and more).',
      'Send the amount to the address shown — or scan the QR code with your wallet.',
      `As soon as the network confirms, your key is generated and emailed automatically, usually in well under ${PROMISE_MINUTES} minutes.`
    ],

    safeTitle: 'If something goes wrong',
    safeBody: `If the key has not arrived ${PROMISE_MINUTES} minutes after you paid, don't worry — the system keeps retrying on its own. If it still hasn't, the "my order" page gives you a ready-written email to send us.`,
    safeCta: 'My order page',

    tokenTitle: 'Which network?',
    tokenBody: 'USDT exists on several networks — TRC20, ERC20, BEP20. Whichever you choose on the payment page, the address you are given belongs to that network. Send only from the same one.',

    errEmail: 'Please enter a valid email address.',
    errMismatch: 'The two addresses do not match.',
    errTier: 'Please choose an edition.',
    errBusy: 'That is a lot of attempts. Please try again in a few minutes.',
    errProvider: 'We could not open an invoice just now. Try again in a moment — you have not been charged.',
    errOff: 'Online purchase is not switched on for this deployment yet.',

    payTitle: 'Order status',
    orderNo: 'Order',

    stWaitingH: 'Waiting for your payment',
    stWaitingB: 'If you have not paid yet, open the payment page. This page updates itself — no need to refresh.',
    stOpenPay: 'Open the payment page',

    stConfirmH: 'Your payment came through',
    stConfirmB: 'Generating your licence key and sending it to your inbox. One moment…',

    stDoneH: 'Your licence key is on its way',
    stDoneB: email => `We sent it to <b dir="ltr">${email}</b>. If it is not in your inbox, check the spam or junk folder.`,

    stPartialH: 'Less arrived than the invoice asked for',
    stPartialB: 'The amount received is under the invoice total, so nothing was issued automatically. Your order is recorded and we will look at it — use the button below to reach us.',

    stExpiredH: 'This invoice expired',
    stExpiredB: 'No payment was recorded against this order. If you did pay and it arrived late, don\'t worry — the key is sent automatically the moment it lands. Otherwise you can start a new order.',
    stExpiredCta: 'Start a new order',

    stRefundH: 'This payment was refunded',
    stRefundB: 'The provider reversed the payment for this order, so its licence is no longer valid.',

    stFailedH: 'This order did not complete',
    stFailedB: 'No payment was confirmed against this order. If you think that is wrong, get in touch.',

    maskedKey: 'Key issued',
    resend: 'Email it to me again',
    resendOk: 'Sent again. Give it a couple of minutes.',
    resendBusy: 'That has been sent a few times recently. Try again in an hour.',
    resendGone: 'The retention window for this key has passed, so we cannot resend it automatically. Get in touch — you have the order number.',
    resendErr: 'The resend did not go through. Please get in touch.',

    helpCta: 'I need help',
    backProduct: 'Back to Unity DocSnap',
    notFound: 'No such order. Copy the whole link, or search by your email on the "my order" page.'
  },

  ja: {
    locale: 'ja-JP', dir: 'ltr', langName: '日本語',

    title: 'Unity DocSnap を購入',
    heading: '暗号資産で購入',
    sub: 'ビットコイン、USDT、イーサリアム、Tron など、お手持ちの通貨でお支払いいただけます。ライセンスキーは自動で発行され、メールで届きます。',

    pick: 'エディションを選択',
    oneOff: '買い切り · 1 台まで · サブスクリプションなし',

    emailLabel: 'メールアドレス',
    emailHint: 'ライセンスキーはこのアドレスに送られます。お間違いのないようご確認ください。',
    emailPlaceholder: 'you@example.com',
    confirmLabel: 'メールアドレス(確認)',
    confirmHint: '入力ミスでキーが届かなくならないよう、もう一度ご入力ください。',

    payCta: '暗号資産で支払う',
    working: '請求書を作成しています…',

    stepsTitle: 'ご購入の流れ',
    steps: [
      'メールアドレスを入力し、支払いボタンを押します。',
      '安全な決済ページで、お好きな通貨を選びます(BTC、USDT、ETH、TRX など)。',
      '表示されたアドレスに送金します。QR コードをウォレットで読み取ることもできます。',
      `ネットワークの承認後、ライセンスキーが自動で発行されメールで届きます(通常 ${PROMISE_MINUTES} 分以内)。`
    ],

    safeTitle: '問題が起きた場合',
    safeBody: `お支払いから ${PROMISE_MINUTES} 分経ってもキーが届かない場合でも、システムが自動で再試行します。それでも届かない場合は、「注文ページ」に用意されたメール文面をそのままお送りください。`,
    safeCta: '注文ページ',

    tokenTitle: 'ネットワークにご注意',
    tokenBody: 'USDT には TRC20・ERC20・BEP20 など複数のネットワークがあります。決済ページで選んだネットワークのアドレスが表示されますので、必ず同じネットワークから送金してください。',

    errEmail: '有効なメールアドレスをご入力ください。',
    errMismatch: '2 つのアドレスが一致しません。',
    errTier: 'エディションを選択してください。',
    errBusy: 'リクエストが多すぎます。数分後にもう一度お試しください。',
    errProvider: '請求書を作成できませんでした。少し時間をおいてお試しください。料金は発生していません。',
    errOff: 'この環境ではオンライン購入がまだ有効になっていません。',

    payTitle: '注文状況',
    orderNo: '注文番号',

    stWaitingH: 'お支払いをお待ちしています',
    stWaitingB: 'まだお支払いでない場合は、決済ページを開いてください。このページは自動で更新されます。',
    stOpenPay: '決済ページを開く',

    stConfirmH: 'お支払いを確認しました',
    stConfirmB: 'ライセンスキーを発行し、メールを送信しています。少々お待ちください…',

    stDoneH: 'ライセンスキーを送信しました',
    stDoneB: email => `<b dir="ltr">${email}</b> 宛に送信しました。受信箱に見当たらない場合は、迷惑メールフォルダもご確認ください。`,

    stPartialH: '入金額が請求額を下回っています',
    stPartialB: '受け取った金額が請求額に満たないため、自動発行は行われませんでした。ご注文は記録されており、こちらで確認いたします。下のボタンからご連絡ください。',

    stExpiredH: 'この請求書は期限切れです',
    stExpiredB: 'この注文へのお支払いは記録されていません。お支払い済みで着金が遅れている場合は、着金と同時に自動でキーが送られます。そうでない場合は、新しくご注文いただけます。',
    stExpiredCta: '新しく注文する',

    stRefundH: 'この支払いは返金されました',
    stRefundB: '決済事業者により返金処理が行われたため、この注文のライセンスは無効です。',

    stFailedH: 'この注文は完了しませんでした',
    stFailedB: 'この注文に対する支払いは確認できませんでした。お心当たりがない場合はご連絡ください。',

    maskedKey: '発行済みキー',
    resend: 'もう一度メールで送る',
    resendOk: '再送しました。数分お待ちください。',
    resendBusy: '短時間に複数回送信されています。1 時間ほどおいてお試しください。',
    resendGone: 'キーの保持期間が終了したため、自動での再送はできません。注文番号を添えてご連絡ください。',
    resendErr: '再送できませんでした。ご連絡ください。',

    helpCta: 'ヘルプが必要です',
    backProduct: 'Unity DocSnap に戻る',
    notFound: '該当する注文が見つかりません。リンク全体をコピーするか、「注文ページ」でメールアドレスから検索してください。'
  }
}


// ==========================================
// Request helpers
// ==========================================
function parseCookies(request) {
  const header = request && request.headers ? request.headers.get('Cookie') : ''
  const out = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i === -1) continue
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

function langFromAcceptHeader(request) {
  const header = request && request.headers ? request.headers.get('Accept-Language') : ''
  if (!header) return null
  for (const piece of header.toLowerCase().split(',')) {
    const code = piece.split(';')[0].trim().slice(0, 2)
    if (I18N[code]) return code
  }
  return null
}

function resolveLang(url, request) {
  const cookies = parseCookies(request)
  const fromQuery = url && url.searchParams ? url.searchParams.get('lang') : null
  if (fromQuery && I18N[fromQuery]) return fromQuery
  if (cookies.lang && I18N[cookies.lang]) return cookies.lang
  return langFromAcceptHeader(request) || DEFAULT_LANG
}

function resolveTheme(request) {
  const cookies = parseCookies(request)
  return cookies.theme === 'light' || cookies.theme === 'dark' ? cookies.theme : null
}


// ==========================================
// langFromBody
// The language the page was actually being read in, which
// the browser tells us explicitly.
//
// Preferred over re-deriving it from the request, and that
// distinction is not cosmetic: this value is stored on the
// order and decides which language the licence email is
// written in. A POST to /checkout/create carries no ?lang=,
// and a visitor who arrived on /checkout?lang=ja without
// ever setting a cookie would otherwise have their order
// recorded as the site default - so a Japanese customer
// pays, and receives their key in Persian.
//
// Still validated against the supported set, because it
// arrives from the client and ends up in a template lookup.
// ==========================================
function langFromBody(body, fallback) {
  const asked = body && typeof body.lang === 'string' ? body.lang : ''
  return I18N[asked] ? asked : fallback
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function jsString(value) {
  return JSON.stringify(String(value == null ? '' : value)).replace(/</g, '\\u003c')
}

function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown'
}


// ==========================================
// validEmail
// Deliberately loose.
//
// A strict RFC 5322 pattern rejects addresses that are
// legal and in daily use, and every one of those rejections
// is a customer who cannot buy. The only errors worth
// catching here are the ones that make delivery impossible
// - no @, nothing after it, no dot in the domain, a space -
// because everything subtler is caught by the mail provider
// bouncing, and by the address being typed twice.
// ==========================================
function validEmail(value) {
  const text = String(value || '').trim()
  if (text.length < 6 || text.length > 254) return false
  if (/\s/.test(text)) return false
  return /^[^@]+@[^@.]+(\.[^@.]+)+$/.test(text)
}


// ==========================================
// maskEmail
// "am**@gmail.com".
//
// The status page is opened from a link that may be shared,
// screenshotted into a support thread, or left open on a
// shared machine. Showing the whole address there would
// leak it; showing none of it would break the one job the
// line has, which is letting somebody confirm they typed
// the address they meant to.
// ==========================================
function maskEmail(email) {
  const text = String(email || '')
  const at = text.indexOf('@')
  if (at < 1) return text

  const name = text.slice(0, at)
  const domain = text.slice(at)
  const head = name.slice(0, Math.min(2, name.length))
  return head + '*'.repeat(Math.max(2, name.length - head.length)) + domain
}


// ==========================================
// resolveOrderHandle
// The order behind an ?o= value.
//
// Accepts a signed token or a bare order id, and both are
// safe for the same reason: an order id is twelve bytes
// from the CSPRNG, so it is already an unguessable
// capability and the signature is belt to that's braces.
//
// Both are accepted rather than one because the bare form
// exists in the wild - a customer who copied an id out of a
// receipt, a link that predates the token - and refusing it
// would mean telling somebody holding a valid order number
// that we have never heard of it.
// ==========================================
async function resolveOrderHandle(env, database, handle) {
  if (!handle) return null

  const fromToken = await readOrderToken(env, handle)
  if (fromToken) return getOrder(database, fromToken)

  if (/^ord_[0-9a-f]{24}$/.test(handle)) return getOrder(database, handle)

  return null
}


// ==========================================
// tierList
// The two purchasable tiers, as the page renders them.
// ==========================================
function tierList() {
  return [
    { id: 'plus', ...CONFIG.DOCSNAP.TIERS.plus },
    { id: 'pro', ...CONFIG.DOCSNAP.TIERS.pro }
  ]
}


// ==========================================
// handleCheckoutPage
// The form.
// ==========================================
export async function handleCheckoutPage(url, request, gameId, requestId, GAMES, env) {
  const lang = resolveLang(url, request)
  const theme = resolveTheme(request)

  const requested = url.searchParams.get('tier')
  const tier = requested === 'pro' || requested === 'plus' ? requested : 'plus'

  const ready = providerConfigured(env) && mailConfigured(env) && Boolean(db(env))

  return createHtmlResponse(renderCheckoutPage(lang, theme, tier, ready))
}


// ==========================================
// handleCheckoutCreate
// Opens an invoice and hands back where to pay.
//
// The order row is written before the provider is called
// and is left behind whatever happens afterwards. An order
// stuck at `created` because the provider was unreachable
// is a row the reconciler can see and close; an order that
// was never written is money that might arrive against
// nothing.
// ==========================================
export async function handleCheckoutCreate(url, request, gameId, requestId, GAMES, env) {
  let lang = resolveLang(url, request)
  let t = I18N[lang] || I18N.en

  const database = db(env)
  if (!database || !providerConfigured(env) || !mailConfigured(env)) {
    return createJsonResponse({ ok: false, error: 'not_configured', message: t.errOff }, 503)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return createJsonResponse({ ok: false, error: 'bad_request', message: t.errEmail }, 400)
  }

  // Re-resolved from the body now that we have one: what the page
  // says it is being read in beats what the request headers imply.
  lang = langFromBody(body, lang)
  t = I18N[lang]

  const tier = String(body.tier || '').toLowerCase()
  if (tier !== 'plus' && tier !== 'pro') {
    return createJsonResponse({ ok: false, error: 'bad_tier', message: t.errTier }, 400)
  }

  const email = String(body.email || '').trim()
  if (!validEmail(email)) {
    return createJsonResponse({ ok: false, error: 'bad_email', message: t.errEmail }, 400)
  }

  // The confirmation field is checked here as well as in the
  // browser. A mistyped delivery address is the one input error
  // in this whole flow that cannot be undone after the fact -
  // the money is gone and the key went to somebody else's inbox
  // - so it is not left to client-side validation that a
  // scripted caller skips.
  if (body.emailConfirm !== undefined && String(body.emailConfirm).trim() !== email) {
    return createJsonResponse({ ok: false, error: 'email_mismatch', message: t.errMismatch }, 400)
  }

  const ip = clientIp(request)
  if (await isOrderRateLimited(database, ip)) {
    logWarning('Checkout rate limit hit', { requestId })
    return createJsonResponse({ ok: false, error: 'rate_limited', message: t.errBusy }, 429)
  }
  await recordOrderAttempt(database, ip)

  const priceUsd = CONFIG.DOCSNAP.TIERS[tier].price
  const orderId = newOrderId()

  await createOrder(database, { id: orderId, tier, priceUsd, email, lang })
  await logEvent(database, orderId, 'created', `${tier} $${priceUsd}`)

  const statusToken = await signOrderToken(env, orderId)

  const invoice = await createInvoice(env, {
    orderId,
    statusToken,
    tier,
    priceUsd,
    lang,
    description: `Unity DocSnap ${CONFIG.DOCSNAP.TIERS[tier].name} — one-off licence`,
    siteUrl: CONFIG.SITE_URL
  })

  if (!invoice.ok) {
    await setStatus(database, orderId, ORDER_STATE.FAILED, 'provider: ' + invoice.error)
    await logEvent(database, orderId, 'mail_failed', 'invoice not opened: ' + invoice.error)
    logError('Could not open an invoice', { requestId, orderId, error: invoice.error })

    // A provider outage during a launch is worth being told about
    // immediately - it is the difference between losing an hour of
    // sales and losing a weekend of them.
    await alertAdmin(env, database,
      'Payment provider would not open an invoice',
      [
        `Order ${orderId} (${tier}, $${priceUsd}) could not be opened.`,
        `Provider error: ${invoice.error}`,
        'Customers cannot buy until this clears. Check the NOWPayments API key and account status.'
      ],
      orderId)

    return createJsonResponse({ ok: false, error: 'provider_unavailable', message: t.errProvider }, 502)
  }

  await markInvoiceOpened(database, orderId, invoice.invoiceId)
  await logEvent(database, orderId, 'invoice_opened', String(invoice.invoiceId))
  logInfo('Checkout started', { requestId, orderId, tier })

  return createJsonResponse({
    ok: true,
    orderId,
    payUrl: invoice.payUrl,
    statusUrl: `/checkout/pay?o=${encodeURIComponent(statusToken)}&lang=${encodeURIComponent(lang)}`
  })
}


// ==========================================
// handleCheckoutStatus
// The status page's polling endpoint.
//
// Returns the masked address and the masked key label and
// nothing else that identifies anybody. The page it feeds
// is reachable by anyone holding the link, so it answers
// only what the person who made the purchase already knows.
// ==========================================
export async function handleCheckoutStatus(url, request, gameId, requestId, GAMES, env) {
  const database = db(env)
  if (!database) return createJsonResponse({ ok: false, error: 'not_configured' }, 503)

  const order = await resolveOrderHandle(env, database, url.searchParams.get('o'))
  if (!order) return createJsonResponse({ ok: false, error: 'not_found' }, 404)

  return createJsonResponse({
    ok: true,
    status: order.status,
    tier: order.tier,
    priceUsd: order.price_usd,
    email: maskEmail(order.email),
    keyPublic: order.key_public || '',
    canResend: Boolean(order.key_sealed),
    createdAt: order.created_at,
    deliveredAt: order.delivered_at || null
  })
}


// ==========================================
// handleCheckoutPay
// The page a customer waits on, and comes back to.
//
// Rendered server-side with whatever the order says right
// now, then kept current by polling. Server-rendering the
// first paint matters: this page is opened by somebody who
// has just parted with money, and a spinner that resolves
// after a fetch is a second of not knowing whether anything
// worked.
// ==========================================
export async function handleCheckoutPay(url, request, gameId, requestId, GAMES, env) {
  const lang = resolveLang(url, request)
  const theme = resolveTheme(request)
  const database = db(env)

  const handle = url.searchParams.get('o') || ''
  const order = database ? await resolveOrderHandle(env, database, handle) : null

  return createHtmlResponse(renderPayPage(lang, theme, handle, order), order ? 200 : 404)
}


// ==========================================
// handleCheckoutResend
// Sends the key email again.
// ==========================================
export async function handleCheckoutResend(url, request, gameId, requestId, GAMES, env) {
  const database = db(env)
  if (!database) return createJsonResponse({ ok: false, error: 'not_configured' }, 503)

  let body
  try {
    body = await request.json()
  } catch {
    return createJsonResponse({ ok: false, error: 'bad_request' }, 400)
  }

  const order = await resolveOrderHandle(env, database, body.o)
  if (!order) return createJsonResponse({ ok: false, error: 'not_found' }, 404)

  const result = await resendLicense(env, database, order)
  if (!result.ok) {
    const status = result.error === 'rate_limited' ? 429 : 409
    return createJsonResponse({ ok: false, error: result.error, keyPublic: result.keyPublic || '' }, status)
  }

  logInfo('Licence email resent', { requestId, orderId: order.id, sent: result.sent })
  return createJsonResponse({ ok: true, sent: result.sent })
}


// ==========================================
// handleCheckoutWebhook
// The payment provider telling us what happened.
//
// Four rules, and every one of them is load-bearing:
//
//   • Verify the signature before parsing anything into a
//     decision. This URL is public and the body is
//     attacker-controlled; without the check, posting JSON
//     here is a way to be issued a licence for free.
//
//   • De-duplicate. Providers retry, correctly, and the
//     same "finished" will arrive several times.
//
//   • Answer 200 for anything we have understood, including
//     events we chose not to act on. A non-200 makes the
//     provider retry, and retrying a callback we correctly
//     ignored achieves nothing but load.
//
//   • Never let an exception escape. A 500 here is a
//     callback the provider will re-send, which is fine
//     once and a storm by the twentieth attempt.
// ==========================================
export async function handleCheckoutWebhook(url, request, gameId, requestId, GAMES, env) {
  const database = db(env)
  if (!database) return createJsonResponse({ ok: false, error: 'not_configured' }, 503)

  const secret = env && env.NOWPAYMENTS_IPN_SECRET
  if (!secret) {
    logError('IPN received but NOWPAYMENTS_IPN_SECRET is not set', { requestId })
    return createJsonResponse({ ok: false, error: 'not_configured' }, 503)
  }

  const raw = await request.text()
  const presented = request.headers.get('x-nowpayments-sig')

  if (!await verifyIpnSignature(secret, raw, presented)) {
    // Logged as a warning, not an error, and without the body.
    // An unsigned POST to a public URL is background noise on the
    // internet; it becomes interesting only if it is frequent,
    // which a counter on this line will show.
    logWarning('IPN signature rejected', { requestId })
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

    // The event key is payment plus status, so the same payment
    // moving waiting -> confirming -> finished is three distinct
    // events and a re-delivery of any one of them is not.
    const eventKey = `${paymentId || 'nopay'}:${providerStatus}`
    const isNew = await claimWebhook(database, CONFIG.COMMERCE.PROVIDER, eventKey, orderId)
    if (!isNew) {
      return createJsonResponse({ ok: true, duplicate: true })
    }

    const order = orderId
      ? await getOrder(database, orderId)
      : await getOrderByInvoice(database, payload.invoice_id)

    if (!order) {
      // Money against an order we have no record of. Rare, and
      // serious enough to wake somebody: it means an order row was
      // lost, or a payment was made against an invoice created
      // outside this Worker.
      logWarning('IPN for an unknown order', { requestId, orderId, paymentId })
      await alertAdmin(env, database,
        'Payment for an order we do not have',
        [
          `A ${providerStatus} callback arrived for order_id "${orderId}" (payment ${paymentId}).`,
          'There is no such row in the orders table.',
          'Check the provider dashboard before anybody asks for a refund.'
        ])
      return createJsonResponse({ ok: true, unknown: true })
    }

    await logEvent(database, order.id, 'webhook', `${providerStatus} (${paymentId})`)

    await applyPaymentState(env, database, order, {
      state: normalizeStatus(providerStatus),
      providerStatus,
      paymentId,
      payCurrency: payload.pay_currency ? String(payload.pay_currency) : '',
      payAmount: payload.pay_amount != null ? String(payload.pay_amount) : '',
      actuallyPaid: payload.actually_paid != null ? String(payload.actually_paid) : ''
    })

    return createJsonResponse({ ok: true })

  } catch (error) {
    // Answered 200 on purpose despite the failure. The event is
    // already in webhook_log, so a retry would be dropped as a
    // duplicate and achieve nothing; the reconciler is what
    // recovers this order, and it will.
    logError('IPN handling failed', { requestId, error: error.message })
    return createJsonResponse({ ok: true, deferred: true })
  }
}


// ==========================================
// Rendering
// ==========================================
function shell(lang, theme, { title, body, script }) {
  const p = I18N[lang]
  const themeAttr = theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : ''

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${p.dir}"${themeAttr}>
<head>
  ${getPageHead({ title, amirLogo: CONFIG.AMIR_LOGO, description: escapeHtml(p.sub) })}
  <meta name="robots" content="noindex">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700;800&display=swap" rel="stylesheet">
  <script>
    (function () {
      try {
        var t = localStorage.getItem('ac_theme');
        if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
      } catch (e) {}
    })();
  </script>
  <style>${css()}</style>
</head>
<body>
  <div class="wrap">
    ${topbar(lang)}
    ${body}
    <footer>
      <a href="/unity-docsnap">${escapeHtml(p.backProduct)}</a>
      <span>·</span>
      <a href="/order">${escapeHtml(p.safeCta)}</a>
      <span>·</span>
      <a href="/license">${escapeHtml(p.maskedKey)}</a>
    </footer>
  </div>
  <script>${script || ''}${commonScript()}</script>
</body>
</html>`
}

function topbar(lang) {
  const buttons = LANGS.map(code =>
    '<button type="button" onclick="acLang(\'' + code + '\')" lang="' + code + '"'
    + ' aria-pressed="' + (code === lang ? 'true' : 'false') + '">'
    + escapeHtml(I18N[code].langName) + '</button>'
  ).join('')

  return `
    <div class="topbar">
      <a class="brand" href="/unity-docsnap">
        <img src="${escapeHtml(CONFIG.AMIR_LOGO)}" alt="" onerror="this.style.display='none'">
        <span>Unity DocSnap</span>
      </a>
      <div class="controls">
        <div class="seg" role="group">${buttons}</div>
        <button type="button" class="icon-btn" onclick="acTheme()" aria-label="Theme">◐</button>
      </div>
    </div>`
}


function renderCheckoutPage(lang, theme, tier, ready) {
  const p = I18N[lang]

  const cards = tierList().map(item => `
    <label class="tier ${item.id === tier ? 'is-on' : ''}" data-tier="${item.id}">
      <input type="radio" name="tier" value="${item.id}" ${item.id === tier ? 'checked' : ''}>
      <span class="tier-name">Unity DocSnap ${escapeHtml(item.name)}</span>
      <span class="tier-price" dir="ltr">$${escapeHtml(item.price)}</span>
      <span class="tier-note">${escapeHtml(p.oneOff)}</span>
    </label>`).join('')

  const steps = p.steps.map((step, index) => `
    <li><span class="n">${index + 1}</span><span>${escapeHtml(step)}</span></li>`).join('')

  const body = `
    <header class="head">
      <h1>${escapeHtml(p.heading)}</h1>
      <p class="sub">${escapeHtml(p.sub)}</p>
    </header>

    ${ready ? '' : `<div class="note bad">${escapeHtml(p.errOff)}</div>`}

    <section class="card">
      <h2 class="lbl">${escapeHtml(p.pick)}</h2>
      <div class="tiers">${cards}</div>

      <label class="lbl" for="email">${escapeHtml(p.emailLabel)}</label>
      <input id="email" type="email" inputmode="email" autocomplete="email" spellcheck="false" dir="ltr"
             placeholder="${escapeHtml(p.emailPlaceholder)}" aria-describedby="emailHint">
      <p id="emailHint" class="hint">${escapeHtml(p.emailHint)}</p>

      <label class="lbl" for="email2">${escapeHtml(p.confirmLabel)}</label>
      <input id="email2" type="email" inputmode="email" autocomplete="email" spellcheck="false" dir="ltr"
             placeholder="${escapeHtml(p.emailPlaceholder)}" aria-describedby="email2Hint">
      <p id="email2Hint" class="hint">${escapeHtml(p.confirmHint)}</p>

      <button id="pay" type="button" class="btn wide" ${ready ? '' : 'disabled'}>
        ${escapeHtml(p.payCta)}
      </button>
      <div id="out" class="out" role="status" aria-live="polite"></div>
    </section>

    <section class="card">
      <h2 class="lbl">${escapeHtml(p.stepsTitle)}</h2>
      <ol class="steps">${steps}</ol>
    </section>

    <section class="card warn-card">
      <h2 class="lbl">${escapeHtml(p.tokenTitle)}</h2>
      <p class="muted">${escapeHtml(p.tokenBody)}</p>
    </section>

    <section class="card">
      <h2 class="lbl">${escapeHtml(p.safeTitle)}</h2>
      <p class="muted">${escapeHtml(p.safeBody)}</p>
      <a class="btn ghost" href="/order?lang=${lang}">${escapeHtml(p.safeCta)}</a>
    </section>`

  const script = `
    var L = {
      email: ${jsString(p.errEmail)},
      mismatch: ${jsString(p.errMismatch)},
      working: ${jsString(p.working)},
      generic: ${jsString(p.errProvider)}
    };

    var payEl = document.getElementById('pay');
    var outEl = document.getElementById('out');
    var emailEl = document.getElementById('email');
    var email2El = document.getElementById('email2');

    Array.prototype.forEach.call(document.querySelectorAll('.tier'), function (card) {
      card.addEventListener('click', function () {
        Array.prototype.forEach.call(document.querySelectorAll('.tier'), function (other) {
          other.classList.remove('is-on');
        });
        card.classList.add('is-on');
      });
    });

    function note(kind, text) {
      outEl.innerHTML = '<div class="note ' + kind + '">' + acEsc(text) + '</div>';
    }

    function chosenTier() {
      var picked = document.querySelector('input[name="tier"]:checked');
      return picked ? picked.value : 'plus';
    }

    payEl.addEventListener('click', function () {
      var email = emailEl.value.trim();
      var confirm = email2El.value.trim();

      if (email.indexOf('@') < 1 || email.indexOf('.') < 0) { note('bad', L.email); emailEl.focus(); return; }
      if (email.toLowerCase() !== confirm.toLowerCase()) { note('bad', L.mismatch); email2El.focus(); return; }

      payEl.disabled = true;
      note('', L.working);

      fetch('/checkout/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier: chosenTier(),
          email: email,
          emailConfirm: confirm,
          lang: document.documentElement.lang
        })
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data.ok && data.payUrl) {
            // The status page is put into history BEFORE leaving, so
            // the browser's back button from the payment page lands on
            // "we are waiting for your payment" rather than on a form
            // that would open a second invoice.
            try { history.replaceState({}, '', data.statusUrl); } catch (e) {}
            window.location.href = data.payUrl;
            return;
          }
          payEl.disabled = false;
          note('bad', data.message || L.generic);
        })
        .catch(function () {
          payEl.disabled = false;
          note('bad', L.generic);
        });
    });
  `

  return shell(lang, theme, { title: p.title + ' — AmirCollider', body, script })
}


// ==========================================
// renderPayPage
// The waiting room and the receipt, which are the same page
// in different states.
//
// One page rather than two because the customer does not
// experience them as two things: they pay, they wait, they
// are told it worked. A redirect between those would lose
// the URL they might come back to, which is the URL that
// can resend their key.
// ==========================================
function renderPayPage(lang, theme, handle, order) {
  const p = I18N[lang]

  if (!order) {
    const body = `
      <header class="head"><h1>${escapeHtml(p.payTitle)}</h1></header>
      <section class="card"><div class="note bad">${escapeHtml(p.notFound)}</div>
        <a class="btn ghost" href="/order?lang=${lang}">${escapeHtml(p.safeCta)}</a></section>`
    return shell(lang, theme, { title: p.payTitle, body, script: '' })
  }

  const template = supportTemplate(lang, {
    orderId: order.id,
    tierName: CONFIG.DOCSNAP.TIERS[order.tier] ? CONFIG.DOCSNAP.TIERS[order.tier].name : order.tier,
    priceUsd: order.price_usd,
    email: order.email,
    paidAt: order.paid_at ? new Date(order.paid_at).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '',
    payCurrency: order.pay_currency || '',
    minutes: PROMISE_MINUTES
  })

  const body = `
    <header class="head">
      <h1>${escapeHtml(p.payTitle)}</h1>
      <p class="sub">${escapeHtml(p.orderNo)} <code dir="ltr">${escapeHtml(order.id)}</code></p>
    </header>

    <section class="card">
      <div id="state"></div>
      <div id="extra"></div>
    </section>

    <section class="card">
      <h2 class="lbl">${escapeHtml(p.safeTitle)}</h2>
      <p class="muted">${escapeHtml(p.safeBody)}</p>
      <div class="row">
        <a class="btn ghost" href="${escapeHtml(mailtoFor(CONFIG.SUPPORT_EMAIL, template))}">${escapeHtml(p.helpCta)}</a>
        <a class="btn ghost" href="/order?lang=${lang}">${escapeHtml(p.safeCta)}</a>
      </div>
    </section>`

  const script = `
    var HANDLE = ${jsString(handle)};
    var LANG = ${jsString(lang)};
    var S = {
      waiting:  [${jsString(p.stWaitingH)}, ${jsString(p.stWaitingB)}],
      confirm:  [${jsString(p.stConfirmH)}, ${jsString(p.stConfirmB)}],
      done:     [${jsString(p.stDoneH)}, ''],
      partial:  [${jsString(p.stPartialH)}, ${jsString(p.stPartialB)}],
      expired:  [${jsString(p.stExpiredH)}, ${jsString(p.stExpiredB)}],
      refunded: [${jsString(p.stRefundH)}, ${jsString(p.stRefundB)}],
      failed:   [${jsString(p.stFailedH)}, ${jsString(p.stFailedB)}]
    };
    var T = {
      doneBody: function (email) { return ${jsString(p.stDoneB('__EMAIL__'))}.replace('__EMAIL__', acEsc(email)); },
      maskedKey: ${jsString(p.maskedKey)},
      resend: ${jsString(p.resend)},
      resendOk: ${jsString(p.resendOk)},
      resendBusy: ${jsString(p.resendBusy)},
      resendGone: ${jsString(p.resendGone)},
      resendErr: ${jsString(p.resendErr)},
      newOrder: ${jsString(p.stExpiredCta)}
    };

    var stateEl = document.getElementById('state');
    var extraEl = document.getElementById('extra');

    // Poll on a schedule that opens out. A customer refreshing
    // this page in the first thirty seconds is watching for a
    // confirmation; one who left it open for an hour is not, and
    // hammering the endpoint for them helps nobody.
    var tick = 0;
    function nextDelay() {
      tick++;
      if (tick < 12) return 5000;     // first minute: every 5s
      if (tick < 30) return 15000;    // then every 15s
      return 60000;                   // then once a minute
    }

    function group(status) {
      if (status === 'delivered') return 'done';
      if (status === 'paid' || status === 'issuing' || status === 'issued') return 'confirm';
      if (status === 'partially_paid') return 'partial';
      if (status === 'expired') return 'expired';
      if (status === 'refunded') return 'refunded';
      if (status === 'failed') return 'failed';
      return 'waiting';
    }

    function paint(data) {
      var key = group(data.status);
      var kind = key === 'done' ? 'ok' : (key === 'waiting' || key === 'confirm') ? '' : 'bad';
      var head = S[key][0];
      var text = key === 'done' ? T.doneBody(data.email) : acEsc(S[key][1]);

      var spinner = (key === 'waiting' || key === 'confirm')
        ? '<span class="spin" aria-hidden="true"></span>' : '';

      stateEl.innerHTML =
        '<div class="note ' + kind + '"><b>' + spinner + acEsc(head) + '</b>' +
        (text ? '<div class="note-body">' + text + '</div>' : '') + '</div>';

      var extra = '';

      if (data.keyPublic) {
        extra += '<p class="seat-line">' + acEsc(T.maskedKey) +
                 ': <code dir="ltr">' + acEsc(data.keyPublic) + '</code></p>';
      }
      if (key === 'done' && data.canResend) {
        extra += '<button type="button" id="resend" class="btn ghost">' + acEsc(T.resend) + '</button>';
      }
      if (key === 'expired') {
        extra += '<a class="btn ghost" href="/checkout?tier=' + encodeURIComponent(data.tier) +
                 '&lang=' + encodeURIComponent(LANG) + '">' + acEsc(T.newOrder) + '</a>';
      }
      extraEl.innerHTML = extra;

      var resendEl = document.getElementById('resend');
      if (resendEl) resendEl.addEventListener('click', resend);

      // Delivered is terminal from this page's point of view;
      // there is nothing further to poll for.
      return key !== 'done';
    }

    function resend() {
      var button = document.getElementById('resend');
      button.disabled = true;

      fetch('/checkout/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ o: HANDLE })
      })
        .then(function (res) { return res.json().then(function (d) { return { s: res.status, d: d }; }); })
        .then(function (r) {
          button.disabled = false;
          var message = r.d.ok ? T.resendOk
            : r.d.error === 'rate_limited' ? T.resendBusy
            : r.d.error === 'key_expired' ? T.resendGone
            : T.resendErr;
          button.insertAdjacentHTML('afterend',
            '<div class="note ' + (r.d.ok ? 'ok' : 'bad') + '">' + acEsc(message) + '</div>');
        })
        .catch(function () {
          button.disabled = false;
          button.insertAdjacentHTML('afterend', '<div class="note bad">' + acEsc(T.resendErr) + '</div>');
        });
    }

    function poll() {
      fetch('/checkout/status?o=' + encodeURIComponent(HANDLE))
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (!data.ok) return;
          if (paint(data)) setTimeout(poll, nextDelay());
        })
        .catch(function () {
          // A dropped request is not worth telling the customer
          // about; the next tick will either work or the page has
          // bigger problems than one failed poll.
          setTimeout(poll, nextDelay());
        });
    }

    poll();
  `

  return shell(lang, theme, { title: p.payTitle + ' — Unity DocSnap', body, script })
}


// ==========================================
// commonScript
// The two things every page here needs, appended once.
// ==========================================
function commonScript() {
  return `
    function acEsc(v) {
      return String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function acLang(code) {
      try { localStorage.setItem('ac_lang', code); } catch (e) {}
      document.cookie = 'lang=' + code + ';path=/;max-age=31536000;samesite=lax';
      var u = new URL(window.location.href);
      u.searchParams.set('lang', code);
      window.location.href = u.toString();
    }
    function acTheme() {
      var dark = getComputedStyle(document.documentElement).colorScheme.indexOf('dark') !== -1;
      var next = dark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('ac_theme', next); } catch (e) {}
      document.cookie = 'theme=' + next + ';path=/;max-age=31536000;samesite=lax';
    }
  `
}


// ==========================================
// css
// Shared by the checkout, the status page and the order
// help page, and intentionally the same palette and radii
// as the product page - somebody who clicks Buy should not
// feel they have left the site, because on a page that is
// about to ask for money that feeling is fatal.
// ==========================================
export function css() {
  return `
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    html { scrollbar-width: none; -ms-overflow-style: none; }
    html::-webkit-scrollbar { width: 0; height: 0; display: none; }

    :root {
      --brand: #6c63ff; --brand-2: #a78bfa;
      --ok: #4caf50; --warn: #ff9800; --err: #f44336;
      --radius: 18px;
      --bg-1: #0b0e16; --bg-2: #141a2e;
      --surface: rgba(255,255,255,0.05);
      --surface-2: rgba(255,255,255,0.09);
      --border: rgba(255,255,255,0.12);
      --text: rgba(255,255,255,0.92);
      --text-dim: rgba(255,255,255,0.58);
      color-scheme: dark;
    }
    @media (prefers-color-scheme: light) {
      :root:not([data-theme]) {
        --bg-1: #f4f6fb; --bg-2: #e7ecf7;
        --surface: rgba(255,255,255,0.72); --surface-2: #ffffff;
        --border: rgba(20,22,33,0.12);
        --text: rgba(22,24,33,0.92); --text-dim: rgba(22,24,33,0.58);
        color-scheme: light;
      }
    }
    :root[data-theme="light"] {
      --bg-1: #f4f6fb; --bg-2: #e7ecf7;
      --surface: rgba(255,255,255,0.72); --surface-2: #ffffff;
      --border: rgba(20,22,33,0.12);
      --text: rgba(22,24,33,0.92); --text-dim: rgba(22,24,33,0.58);
      color-scheme: light;
    }
    :root[data-theme="dark"] {
      --bg-1: #0b0e16; --bg-2: #141a2e;
      --surface: rgba(255,255,255,0.05); --surface-2: rgba(255,255,255,0.09);
      --border: rgba(255,255,255,0.12);
      --text: rgba(255,255,255,0.92); --text-dim: rgba(255,255,255,0.58);
      color-scheme: dark;
    }

    body {
      font-family: 'Vazirmatn', 'Segoe UI', 'Hiragino Sans', 'Noto Sans JP', Tahoma, Arial, sans-serif;
      min-height: 100vh; padding: 24px 20px 60px; color: var(--text); line-height: 1.75;
      background:
        radial-gradient(1000px 480px at 80% -10%, color-mix(in srgb, var(--brand) 20%, transparent), transparent 60%),
        linear-gradient(160deg, var(--bg-1), var(--bg-2));
      background-attachment: fixed;
    }
    .wrap { max-width: 660px; margin-inline: auto; }

    .topbar { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; }
    .brand { display: flex; align-items: center; gap: 10px; color: var(--text); text-decoration: none; font-weight: 800; }
    .brand img { width: 32px; height: 32px; border-radius: 10px; object-fit: cover; }
    .controls { display: flex; gap: 10px; align-items: center; }
    .seg { display: inline-flex; gap: 2px; padding: 3px; border-radius: 12px; background: var(--surface); border: 1px solid var(--border); }
    .seg button {
      border: 0; cursor: pointer; padding: 6px 11px; border-radius: 9px; font: inherit;
      font-size: 0.82em; font-weight: 600; color: var(--text-dim); background: transparent;
    }
    .seg button[aria-pressed="true"] { color: #fff; background: linear-gradient(135deg, var(--brand), var(--brand-2)); }
    .icon-btn {
      width: 34px; height: 34px; border-radius: 11px; cursor: pointer; font-size: 1.05em;
      color: var(--text); background: var(--surface); border: 1px solid var(--border);
    }

    .head { margin-block: 30px 22px; }
    .head h1 { font-size: clamp(1.7em, 4.5vw, 2.3em); font-weight: 800; }
    .sub { color: var(--text-dim); margin-block-start: 6px; }
    .sub code { font-size: 0.86em; }

    .card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 22px; margin-block-end: 16px;
    }
    .card.warn-card { border-inline-start: 4px solid var(--warn); }

    .lbl { display: block; font-weight: 800; font-size: 1em; margin-block-end: 10px; }
    .muted { color: var(--text-dim); font-size: 0.94em; }
    .hint { color: var(--text-dim); font-size: 0.84em; margin-block: 6px 16px; }

    .tiers { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-block-end: 22px; }
    @media (max-width: 520px) { .tiers { grid-template-columns: 1fr; } }
    .tier {
      position: relative; display: block; cursor: pointer; padding: 16px;
      border-radius: 14px; border: 1px solid var(--border); background: var(--surface-2);
      transition: border-color 0.16s ease, transform 0.16s ease;
    }
    .tier:hover { transform: translateY(-2px); }
    .tier.is-on { border-color: var(--brand); box-shadow: 0 0 0 1px var(--brand) inset; }
    .tier input { position: absolute; opacity: 0; pointer-events: none; }
    .tier-name { display: block; font-weight: 700; font-size: 0.95em; }
    .tier-price { display: block; font-size: 1.9em; font-weight: 800; line-height: 1.3; }
    .tier-note { display: block; font-size: 0.76em; color: var(--text-dim); }

    input[type="email"], input[type="text"] {
      width: 100%; font: inherit; padding: 12px 14px; border-radius: 12px; color: var(--text);
      background: var(--surface-2); border: 1px solid var(--border);
    }
    input:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }

    .btn, button.btn {
      font: inherit; font-weight: 700; cursor: pointer; text-decoration: none;
      display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      padding: 13px 24px; border: 0; border-radius: 13px; color: #fff;
      background: linear-gradient(135deg, var(--brand), var(--brand-2));
      transition: transform 0.16s ease;
    }
    .btn:hover { transform: translateY(-2px); }
    .btn.wide { width: 100%; }
    .btn.ghost { background: var(--surface-2); color: var(--text); border: 1px solid var(--border); }
    .btn:disabled { opacity: 0.5; cursor: default; transform: none; }

    .row { display: flex; gap: 10px; flex-wrap: wrap; margin-block-start: 12px; }

    .out:empty { display: none; }
    .note {
      padding: 13px 15px; border-radius: 13px; margin-block-start: 14px;
      border: 1px solid var(--border); background: var(--surface-2); font-size: 0.94em;
    }
    .note.ok  { border-color: color-mix(in srgb, var(--ok) 55%, transparent); background: color-mix(in srgb, var(--ok) 10%, var(--surface-2)); }
    .note.bad { border-color: color-mix(in srgb, var(--err) 55%, transparent); background: color-mix(in srgb, var(--err) 8%, var(--surface-2)); }
    .note-body { color: var(--text-dim); font-size: 0.94em; margin-block-start: 6px; }

    .spin {
      display: inline-block; width: 12px; height: 12px; margin-inline-end: 8px; vertical-align: -1px;
      border: 2px solid color-mix(in srgb, var(--brand) 40%, transparent);
      border-top-color: var(--brand); border-radius: 50%;
      animation: acspin 0.8s linear infinite;
    }
    @keyframes acspin { to { transform: rotate(360deg); } }

    .steps { list-style: none; }
    .steps li { display: flex; gap: 12px; align-items: flex-start; margin-block-end: 12px; font-size: 0.94em; }
    .steps .n {
      flex: 0 0 24px; width: 24px; height: 24px; border-radius: 50%; margin-block-start: 3px;
      display: grid; place-items: center; font-size: 0.78em; font-weight: 800; color: #fff;
      background: linear-gradient(135deg, var(--brand), var(--brand-2));
    }

    .seat-line { font-size: 0.9em; color: var(--text-dim); margin-block: 14px 10px; }
    code {
      font-family: 'JetBrains Mono', 'Cascadia Code', 'Courier New', monospace;
      background: var(--surface-2); border: 1px solid var(--border);
      padding: 2px 7px; border-radius: 7px; font-size: 0.9em;
    }

    footer {
      display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;
      margin-block-start: 40px; padding-block-start: 22px;
      border-top: 1px solid var(--border); color: var(--text-dim); font-size: 0.88em;
    }
    footer a { color: var(--text-dim); text-decoration: none; }
    footer a:hover { color: var(--text); }

    a:focus-visible, button:focus-visible { outline: 2px solid var(--brand); outline-offset: 3px; border-radius: 6px; }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { transition-duration: 0.001ms !important; animation-duration: 0.001ms !important; }
      .spin { animation: none; border-top-color: transparent; }
    }
  `
}


// Exported so the order help page renders inside the same
// frame without duplicating any of it.
export { shell as checkoutShell, I18N as CHECKOUT_I18N, resolveLang as resolveCheckoutLang,
         resolveTheme as resolveCheckoutTheme, escapeHtml as checkoutEscape,
         jsString as checkoutJsString, maskEmail, validEmail }
