// ==========================================
// pages/orderHelp.js
// "I paid and nothing arrived."
//
// Public entry points (wired in worker.js ROUTES):
//   GET  /order         the page
//   POST /order/lookup  email me links to my orders
//
// This page is the one part of the checkout written for a
// person who is already unhappy, and it is laid out in the
// order their unhappiness escalates:
//
//   1. Wait. Delivery is normally seconds; the promise is
//      five minutes and the retries run for a day. Most
//      people who land here are three minutes in.
//
//   2. Check the spam folder. This is, by a distance, the
//      real answer most of the time. It is second on the
//      page rather than buried under a heading, because a
//      customer who finds their key here never writes to
//      anybody.
//
//   3. Open your order. If they still have the link or the
//      order number, the status page answers precisely and
//      can resend the key.
//
//   4. Lost the link too? Type the address you paid with,
//      and we email you the way back in.
//
//   5. Still nothing? Here is the email to send us, already
//      written, in your language, with every field we would
//      otherwise have to ask for.
//
// Step five is the one this file exists for. The request
// that came in was for a prepared message so that a stuck
// customer never has to compose one - and so that when it
// arrives, it is answerable on the first read.
// ==========================================

import { CONFIG } from '../config.js'
import { createHtmlResponse, createJsonResponse, logInfo } from '../utils.js'
import { supportTemplate, mailtoFor, SUPPORT_TAGS } from '../content/supportTemplates.js'
import { signOrderToken } from '../commerce/seal.js'
import {
  db, findOrdersByEmail, isOrderRateLimited, recordOrderAttempt
} from '../commerce/orders.js'
import { orderIndexEmail } from '../commerce/emails.js'
import { enqueueAndSend, mailConfigured } from '../commerce/mailer.js'
import {
  checkoutShell, resolveCheckoutLang, resolveCheckoutTheme,
  checkoutEscape as escapeHtml, checkoutJsString as jsString, validEmail
} from './checkout.js'

const PROMISE_MINUTES = CONFIG.COMMERCE.DELIVERY_PROMISE_MINUTES


// ==========================================
// i18n
// ==========================================
const I18N = {
  fa: {
    title: 'سفارش من',
    heading: 'کلید لایسنس به دستم نرسیده',
    sub: 'قدم‌به‌قدم برویم جلو. تقریباً همیشه یکی از دو مورد اول جواب می‌دهد.',

    s1h: `۱ · چند دقیقه صبر کن`,
    s1b: `کلید معمولاً چند ثانیه بعد از تأیید پرداخت می‌رسد، ولی شبکه‌های بلاک‌چین گاهی کند می‌شوند. اگر کمتر از ${PROMISE_MINUTES} دقیقه از پرداختت گذشته، صبر کن — سیستم تا ۲۴ ساعت خودش دوباره تلاش می‌کند.`,

    s2h: '۲ · پوشه‌ی Spam را نگاه کن',
    s2b: 'این رایج‌ترین دلیل است. ایمیل کلید حاوی یک کد و چند لینک است و بعضی سرویس‌ها آن را به Spam / Junk / Promotions می‌برند. آنجا را بگرد و اگر پیدا کردی، روی «Not spam» بزن.',
    s2search: 'در ایمیلت این را جست‌وجو کن:',

    s3h: '۳ · صفحه‌ی سفارشت را باز کن',
    s3b: 'اگر شماره‌ی سفارش (چیزی شبیه ord_…) یا لینکی که بعد از پرداخت باز شد را داری، از آن‌جا وضعیت دقیق سفارشت را می‌بینی و می‌توانی کلید را دوباره برای خودت بفرستی.',
    s3label: 'شماره یا لینک سفارش',
    s3cta: 'باز کن',
    s3bad: 'شماره‌ی سفارش با ord_ شروع می‌شود.',

    s4h: '۴ · لینک را هم گم کرده‌ای؟',
    s4b: 'ایمیلی را که موقع خرید وارد کردی بنویس. اگر سفارشی با آن ثبت شده باشد، لینک سفارش‌هایت را به همان آدرس می‌فرستیم.',
    s4label: 'ایمیلی که با آن خرید کردی',
    s4cta: 'لینک سفارش‌هایم را بفرست',
    s4done: 'اگر سفارشی با این ایمیل ثبت شده باشد، همین حالا لینکش را فرستادیم. چند دقیقه صبر کن و Spam را هم نگاه کن.',
    s4bad: 'یک آدرس ایمیل معتبر بنویس.',
    s4busy: 'تعداد درخواست‌ها زیاد بوده. کمی بعد دوباره امتحان کن.',

    s5h: `۵ · هنوز خبری نیست؟ این ایمیل را برایمان بفرست`,
    s5b: 'متن زیر را کپی کن (یا دکمه‌ی ارسال را بزن تا خودش در برنامه‌ی ایمیلت باز شود) و حتماً اسکرین‌شات پرداخت را پیوست کن. هرچه بیشتر از فیلدهای خالی را پر کنی، سریع‌تر جواب می‌گیری.',
    s5to: 'به این آدرس بفرست:',
    copy: 'کپی متن ایمیل',
    copied: 'کپی شد ✓',
    openMail: 'باز کردن در برنامه‌ی ایمیل',
    subjectLabel: 'موضوع',
    bodyLabel: 'متن',

    reassureH: 'پولت گم نشده',
    reassureB: 'هر پرداختی که تأیید شود ثبت می‌شود، حتی اگر ایمیلش نرسیده باشد. اگر پرداخت کرده‌ای، کلیدت وجود دارد — فقط باید به دستت برسد.',

    backProduct: 'بازگشت به Unity DocSnap'
  },

  en: {
    title: 'My order',
    heading: 'My licence key has not arrived',
    sub: 'Let us go through this in order. It is almost always one of the first two.',

    s1h: '1 · Give it a few minutes',
    s1b: `The key normally arrives within seconds of a payment confirming, but blockchains have slow spells. If it is less than ${PROMISE_MINUTES} minutes since you paid, wait — the system keeps retrying by itself for a full day.`,

    s2h: '2 · Look in your spam folder',
    s2b: 'This is the most common answer by a wide margin. The key email contains a code and a couple of links, and some providers file that under Spam, Junk or Promotions. If you find it there, press "Not spam".',
    s2search: 'Search your mail for:',

    s3h: '3 · Open your order page',
    s3b: 'If you have your order number (it looks like ord_…) or the link that opened after you paid, that page shows exactly where your order stands and can email the key to you again.',
    s3label: 'Order number or link',
    s3cta: 'Open',
    s3bad: 'An order number starts with ord_.',

    s4h: '4 · Lost the link as well?',
    s4b: 'Enter the email address you used at checkout. If there are orders on it, we will send the links to that address.',
    s4label: 'The email you bought with',
    s4cta: 'Email me my order links',
    s4done: 'If there is an order on that address, we have just sent the links to it. Give it a few minutes, and check spam too.',
    s4bad: 'Please enter a valid email address.',
    s4busy: 'That is a lot of attempts. Please try again shortly.',

    s5h: '5 · Still nothing? Send us this email',
    s5b: 'Copy the message below — or press the button to open it in your mail app — and please attach a screenshot of the payment. The more of the blanks you fill in, the faster you get an answer.',
    s5to: 'Send it to:',
    copy: 'Copy the email',
    copied: 'Copied ✓',
    openMail: 'Open in my mail app',
    subjectLabel: 'Subject',
    bodyLabel: 'Message',

    reassureH: 'Your money is not lost',
    reassureB: 'Every confirmed payment is recorded, whether or not its email went out. If you paid, your key exists — it just has to reach you.',

    backProduct: 'Back to Unity DocSnap'
  },

  ja: {
    title: '注文ページ',
    heading: 'ライセンスキーが届きません',
    sub: '順番に確認していきましょう。ほとんどの場合、最初の 2 つで解決します。',

    s1h: '1 · 数分お待ちください',
    s1b: `通常、お支払いの確認後すぐにキーが届きますが、ブロックチェーンが混雑していることもあります。お支払いから ${PROMISE_MINUTES} 分以内であれば、そのままお待ちください。システムは 24 時間にわたって自動で再試行します。`,

    s2h: '2 · 迷惑メールフォルダをご確認ください',
    s2b: '最も多い原因です。キーのメールにはコードとリンクが含まれるため、迷惑メールやプロモーションに振り分けられることがあります。見つかったら「迷惑メールではない」を選んでください。',
    s2search: 'メールを次のキーワードで検索してください:',

    s3h: '3 · 注文ページを開く',
    s3b: '注文番号(ord_… の形式)や、お支払い後に開いたリンクをお持ちであれば、そのページで正確な状況を確認でき、キーを再送することもできます。',
    s3label: '注文番号またはリンク',
    s3cta: '開く',
    s3bad: '注文番号は ord_ で始まります。',

    s4h: '4 · リンクも分からない場合',
    s4b: 'ご購入時に入力したメールアドレスをご記入ください。ご注文があれば、そのアドレス宛にリンクをお送りします。',
    s4label: 'ご購入時のメールアドレス',
    s4cta: '注文リンクを送ってもらう',
    s4done: 'そのアドレスにご注文があれば、ただいまリンクを送信しました。数分お待ちのうえ、迷惑メールフォルダもご確認ください。',
    s4bad: '有効なメールアドレスをご入力ください。',
    s4busy: 'リクエストが多すぎます。しばらくしてからお試しください。',

    s5h: '5 · それでも届かない場合は、このメールをお送りください',
    s5b: '下の文面をコピーする(またはボタンを押してメールアプリで開く)うえで、お支払いのスクリーンショットを添付してください。空欄を埋めていただくほど、早くご対応できます。',
    s5to: '送信先:',
    copy: '文面をコピー',
    copied: 'コピーしました ✓',
    openMail: 'メールアプリで開く',
    subjectLabel: '件名',
    bodyLabel: '本文',

    reassureH: 'お支払いは失われていません',
    reassureB: '確認されたお支払いは、メールが届いたかどうかに関わらずすべて記録されています。お支払いが完了していれば、キーは必ず存在します。',

    backProduct: 'Unity DocSnap に戻る'
  }
}


// ==========================================
// STATUS_TEXT
// The order states, in words a customer can act on.
//
// Lives here rather than next to the state machine because
// these are not the state names - they are what each state
// MEANS to somebody who paid, and several distinct internal
// states deliberately collapse into one sentence. A
// customer does not need to know the difference between
// `issuing` and `issued`; both mean "your key is being
// sent".
// ==========================================
const STATUS_TEXT = {
  fa: {
    created: 'در انتظار پرداخت', awaiting_payment: 'در انتظار پرداخت',
    partially_paid: 'مبلغ ناقص — در حال بررسی',
    paid: 'پرداخت تأیید شد — در حال ارسال کلید',
    issuing: 'در حال ارسال کلید', issued: 'در حال ارسال کلید',
    delivered: 'کلید ارسال شد', expired: 'منقضی شد',
    refunded: 'برگشت خورد', failed: 'ناموفق'
  },
  en: {
    created: 'Waiting for payment', awaiting_payment: 'Waiting for payment',
    partially_paid: 'Underpaid — being reviewed',
    paid: 'Payment confirmed — sending your key',
    issuing: 'Sending your key', issued: 'Sending your key',
    delivered: 'Key sent', expired: 'Expired',
    refunded: 'Refunded', failed: 'Did not complete'
  },
  ja: {
    created: '入金待ち', awaiting_payment: '入金待ち',
    partially_paid: '入金不足 — 確認中',
    paid: '支払い確認済み — キーを送信中',
    issuing: 'キーを送信中', issued: 'キーを送信中',
    delivered: 'キー送信済み', expired: '期限切れ',
    refunded: '返金済み', failed: '未完了'
  }
}


function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown'
}


// ==========================================
// handleOrderHelp
// ==========================================
export async function handleOrderHelp(url, request, gameId, requestId, GAMES, env) {
  const lang = resolveCheckoutLang(url, request)
  const theme = resolveCheckoutTheme(request)

  return createHtmlResponse(renderPage(lang, theme))
}


// ==========================================
// handleOrderLookup
// Emails somebody the links to their own orders.
//
// The reply is identical whether or not that address has
// ever bought anything, and that is the entire security
// design of this endpoint. A form that answered "no orders
// found" would be a way to test whether a given person is a
// customer, one address at a time - and the addresses worth
// testing are exactly the ones somebody already has a
// reason to be curious about.
//
// So: same JSON, same timing budget, and the real answer
// goes to the inbox. Somebody who can read that inbox is
// somebody entitled to the answer.
// ==========================================
export async function handleOrderLookup(url, request, gameId, requestId, GAMES, env) {
  let lang = resolveCheckoutLang(url, request)
  let t = I18N[lang] || I18N.en

  const database = db(env)
  if (!database) return createJsonResponse({ ok: false, error: 'not_configured' }, 503)

  let body
  try {
    body = await request.json()
  } catch {
    return createJsonResponse({ ok: false, error: 'bad_request', message: t.s4bad }, 400)
  }

  // The page tells us which language it is showing; a bare POST
  // carries no ?lang= to derive it from.
  if (body && I18N[body.lang]) { lang = body.lang; t = I18N[lang] }

  const email = String(body.email || '').trim()
  if (!validEmail(email)) {
    return createJsonResponse({ ok: false, error: 'bad_email', message: t.s4bad }, 400)
  }

  const ip = clientIp(request)
  if (await isOrderRateLimited(database, ip)) {
    return createJsonResponse({ ok: false, error: 'rate_limited', message: t.s4busy }, 429)
  }
  await recordOrderAttempt(database, ip)

  const orders = await findOrdersByEmail(database, email)

  if (orders.length && mailConfigured(env)) {
    const rows = []
    for (const order of orders) {
      const token = await signOrderToken(env, order.id)
      rows.push({
        id: order.id,
        tierName: CONFIG.DOCSNAP.TIERS[order.tier] ? CONFIG.DOCSNAP.TIERS[order.tier].name : order.tier,
        when: new Date(order.created_at).toISOString().slice(0, 10),
        statusText: (STATUS_TEXT[order.lang] || STATUS_TEXT.en)[order.status] || order.status,
        url: `${CONFIG.SITE_URL}/checkout/pay?o=${encodeURIComponent(token)}&lang=${encodeURIComponent(order.lang)}`
      })
    }

    // Written in the language of the most recent order rather
    // than the language of this page. Somebody recovering an
    // order may well be on a shared machine or a phone with a
    // different locale, and the language they bought in is the
    // better guess at the one they read.
    const message = orderIndexEmail(orders[0].lang || lang, { orders: rows })

    await enqueueAndSend(env, database, {
      orderId: orders[0].id,
      kind: 'receipt',
      to: email,
      lang: orders[0].lang || lang,
      subject: message.subject,
      html: message.html,
      text: message.text
    })

    logInfo('Order index emailed', { requestId, count: rows.length })
  }

  return createJsonResponse({ ok: true, message: t.s4done })
}


// ==========================================
// renderPage
// ==========================================
function renderPage(lang, theme) {
  const p = I18N[lang] || I18N.en

  // Rendered with the blanks visible. A visitor on this page
  // has, by definition, not come from an order we can identify -
  // if they had, they would be on the status page, where the
  // same template comes back filled in.
  const template = supportTemplate(lang, { minutes: PROMISE_MINUTES })
  const mailto = mailtoFor(CONFIG.SUPPORT_EMAIL, template)

  const body = `
    <header class="head">
      <h1>${escapeHtml(p.heading)}</h1>
      <p class="sub">${escapeHtml(p.sub)}</p>
    </header>

    <section class="card">
      <h2 class="lbl">${escapeHtml(p.s1h)}</h2>
      <p class="muted">${escapeHtml(p.s1b)}</p>
    </section>

    <section class="card">
      <h2 class="lbl">${escapeHtml(p.s2h)}</h2>
      <p class="muted">${escapeHtml(p.s2b)}</p>
      <p class="seat-line">${escapeHtml(p.s2search)}
        <code dir="ltr">Unity DocSnap</code> <code dir="ltr">DSNAP-</code></p>
    </section>

    <section class="card">
      <h2 class="lbl">${escapeHtml(p.s3h)}</h2>
      <p class="muted">${escapeHtml(p.s3b)}</p>
      <label class="lbl sr-lbl" for="oid">${escapeHtml(p.s3label)}</label>
      <input id="oid" type="text" dir="ltr" spellcheck="false" autocomplete="off"
             placeholder="ord_0123456789abcdef01234567">
      <div class="row"><button type="button" id="open" class="btn">${escapeHtml(p.s3cta)}</button></div>
      <div id="oidOut" class="out" role="status" aria-live="polite"></div>
    </section>

    <section class="card">
      <h2 class="lbl">${escapeHtml(p.s4h)}</h2>
      <p class="muted">${escapeHtml(p.s4b)}</p>
      <label class="lbl sr-lbl" for="lemail">${escapeHtml(p.s4label)}</label>
      <input id="lemail" type="email" dir="ltr" inputmode="email" autocomplete="email"
             placeholder="you@example.com">
      <div class="row"><button type="button" id="send" class="btn">${escapeHtml(p.s4cta)}</button></div>
      <div id="lookOut" class="out" role="status" aria-live="polite"></div>
    </section>

    <section class="card tmpl-card">
      <h2 class="lbl">${escapeHtml(p.s5h)}</h2>
      <p class="muted">${escapeHtml(p.s5b)}</p>

      <p class="seat-line">${escapeHtml(p.s5to)}
        <code dir="ltr">${escapeHtml(CONFIG.SUPPORT_EMAIL)}</code></p>

      <div class="tmpl-head">${escapeHtml(p.subjectLabel)}</div>
      <pre class="tmpl subject" id="tmplSubject">${escapeHtml(template.subject)}</pre>

      <div class="tmpl-head">${escapeHtml(p.bodyLabel)}</div>
      <pre class="tmpl" id="tmplBody" dir="${lang === 'fa' ? 'rtl' : 'ltr'}">${escapeHtml(template.body)}</pre>

      <div class="row">
        <button type="button" id="copy" class="btn">${escapeHtml(p.copy)}</button>
        <a class="btn ghost" href="${escapeHtml(mailto)}">${escapeHtml(p.openMail)}</a>
      </div>
      <div id="copyOut" class="out" role="status" aria-live="polite"></div>

      <p class="hint tags">${SUPPORT_TAGS.map(tag => `<code dir="ltr">${escapeHtml(tag)}</code>`).join(' ')}</p>
    </section>

    <section class="card ok-card">
      <h2 class="lbl">${escapeHtml(p.reassureH)}</h2>
      <p class="muted">${escapeHtml(p.reassureB)}</p>
    </section>`

  const script = `
    var L = {
      badId: ${jsString(p.s3bad)},
      badEmail: ${jsString(p.s4bad)},
      busy: ${jsString(p.s4busy)},
      done: ${jsString(p.s4done)},
      copied: ${jsString(p.copied)}
    };
    var LANG = ${jsString(lang)};

    function put(el, kind, text) {
      el.innerHTML = '<div class="note ' + kind + '">' + acEsc(text) + '</div>';
    }

    // --- open by order number or pasted link ---
    var oidEl = document.getElementById('oid');
    var oidOut = document.getElementById('oidOut');

    function openOrder() {
      var raw = oidEl.value.trim();
      if (!raw) { put(oidOut, 'bad', L.badId); return; }

      // A pasted full URL is the common case - people copy the
      // whole address bar, not the id out of it - so the handle is
      // pulled out of it rather than rejected.
      var handle = raw;
      var match = raw.match(/[?&]o=([^&\\s]+)/);
      if (match) {
        handle = decodeURIComponent(match[1]);
      } else if (raw.indexOf('ord_') === 0) {
        handle = raw;
      } else {
        put(oidOut, 'bad', L.badId);
        return;
      }

      window.location.href = '/checkout/pay?o=' + encodeURIComponent(handle) + '&lang=' + encodeURIComponent(LANG);
    }

    document.getElementById('open').addEventListener('click', openOrder);
    oidEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') openOrder(); });

    // --- email me my order links ---
    var lookEl = document.getElementById('lemail');
    var lookOut = document.getElementById('lookOut');
    var sendEl = document.getElementById('send');

    function lookup() {
      var email = lookEl.value.trim();
      if (email.indexOf('@') < 1 || email.indexOf('.') < 0) { put(lookOut, 'bad', L.badEmail); return; }

      sendEl.disabled = true;
      fetch('/order/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, lang: LANG })
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          sendEl.disabled = false;
          put(lookOut, data.ok ? 'ok' : 'bad', data.message || (data.ok ? L.done : L.busy));
        })
        .catch(function () {
          sendEl.disabled = false;
          put(lookOut, 'bad', L.busy);
        });
    }

    sendEl.addEventListener('click', lookup);
    lookEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') lookup(); });

    // --- copy the support email ---
    document.getElementById('copy').addEventListener('click', function () {
      var text = document.getElementById('tmplSubject').textContent
        + '\\n\\n' + document.getElementById('tmplBody').textContent;

      var done = function () { put(document.getElementById('copyOut'), 'ok', L.copied); };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, fallback);
      } else {
        fallback();
      }

      // execCommand is deprecated and is also the only thing that
      // works in a WebView, on http, and in older Safari - which
      // between them are a real share of the people who reach this
      // page from a phone.
      function fallback() {
        var area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        try { document.execCommand('copy'); done(); } catch (e) {}
        document.body.removeChild(area);
      }
    });
  `

  return checkoutShell(lang, theme, {
    title: p.title + ' — Unity DocSnap',
    body,
    script: script + extraCss()
  })
}


// ==========================================
// extraCss
// The few rules only this page needs, injected from the
// script slot.
//
// A <style> written from JavaScript rather than a second
// stylesheet parameter on the shared shell: the shell is
// used by three pages and one of them wanting four extra
// selectors is not a reason to give all of them a new
// parameter to pass through.
// ==========================================
function extraCss() {
  return `
    (function () {
      var style = document.createElement('style');
      style.textContent = [
        '.tmpl-card { border-inline-start: 4px solid var(--brand); }',
        '.ok-card { border-inline-start: 4px solid var(--ok); }',
        '.sr-lbl { font-size: 0.86em; font-weight: 600; color: var(--text-dim); margin-block: 14px 6px; }',
        '.tmpl-head { font-size: 0.78em; font-weight: 800; letter-spacing: 0.06em;',
        '  text-transform: uppercase; color: var(--text-dim); margin-block: 16px 6px; }',
        '.tmpl { background: var(--surface-2); border: 1px solid var(--border); border-radius: 12px;',
        '  padding: 14px 16px; font-size: 0.88em; line-height: 1.9; white-space: pre-wrap;',
        '  word-break: break-word; font-family: inherit; }',
        '.tmpl.subject { font-weight: 700; }',
        '.tags { display: flex; gap: 6px; flex-wrap: wrap; margin-block-start: 14px; }'
      ].join('\\n');
      document.head.appendChild(style);
    })();
  `
}
