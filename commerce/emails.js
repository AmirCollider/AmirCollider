// ==========================================
// commerce/emails.js
// Everything the checkout ever sends, in three languages.
//
// Public exports:
//   licenseEmail(lang, data)   the key, to the customer
//   adminAlertEmail(data)      something needs a human
//
// The key email is the product. Somebody paid, and this
// message is the entire thing they receive - so it is
// written to survive being read on a phone, in a spam
// folder, three weeks later, by somebody who has forgotten
// what they bought.
//
// Four rules run through the templates:
//
//   • The key is above everything else. Not below a
//     greeting, not after the receipt. Scrolling for the
//     thing you paid for is a bad first minute with a
//     product.
//
//   • It says what to do next, in the customer's language,
//     with the exact menu path. "Activate in Unity" is not
//     instructions; "Unity DocSnap ▸ Licence & Pro
//     Features" is.
//
//   • It says what to do if something is wrong, in the same
//     message. The one email a customer has when a problem
//     starts is this one, and if the escape route is only
//     on a web page they never visited, they email an
//     address they guess at - or ask for a refund.
//
//   • Plain text is written by hand, not stripped from the
//     HTML. A licence key inside auto-generated text with
//     collapsed whitespace is a support ticket.
//
// The markup is deliberately from 2003: tables, inline
// styles, no custom properties, no flex, no grid. Not
// nostalgia - Outlook's renderer is Word's, Gmail strips
// <style> blocks on forwarded mail, and a layout that
// depends on any of the modern things collapses into an
// unreadable column exactly when a customer forwards their
// receipt to their accounts department.
// ==========================================

import { CONFIG } from '../config.js'

const PROMISE_MINUTES = CONFIG.COMMERCE.DELIVERY_PROMISE_MINUTES


// ==========================================
// escapeHtml
// Local rather than imported from utils, because these
// strings go into email bodies and not into a Response, and
// a shared helper that later grew a Worker-specific
// dependency would drag it into a module that has no
// business needing one.
// ==========================================
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}


// ==========================================
// i18n
// One pack per language, and no string anywhere else in
// this file.
//
// `dir` is carried per language rather than inferred,
// because an RTL email that renders LTR is not a cosmetic
// problem: the licence key is a Latin string inside Persian
// text, and getting the direction wrong is what puts the
// hyphens in the wrong places when somebody copies it.
// ==========================================
const I18N = {
  fa: {
    dir: 'rtl',
    align: 'right',

    subject: tier => `کلید لایسنس Unity DocSnap ${tier} شما`,
    preheader: 'کلید لایسنس شما آماده است.',

    heading: 'خرید شما انجام شد',
    intro: tier => `این کلید لایسنس <b>Unity DocSnap ${tier}</b> شماست. آن را جایی امن نگه دارید.`,

    keyLabel: 'کلید لایسنس',
    tierLabel: 'نسخه',
    orderLabel: 'شماره سفارش',
    paidLabel: 'مبلغ پرداختی',

    howTitle: 'چطور فعالش کنم',
    steps: [
      'یونیتی را باز کن و پروژه‌ات را بارگذاری کن.',
      'از منوی بالا برو به: <b>Unity DocSnap ▸ Licence &amp; Pro Features</b>',
      'کلید بالا را داخل کادر بچسبان و <b>Activate</b> را بزن.',
      'همین. قابلیت‌های نسخه‌ی خریداری‌شده بلافاصله باز می‌شوند.'
    ],

    notesTitle: 'چند نکته',
    notes: [
      'این کلید روی <b>یک سیستم</b> فعال می‌شود. اگر کامپیوترت را عوض کردی، از داخل یونیتی یا از صفحه‌ی لایسنس سایت خودت آزادش کن و روی سیستم جدید فعالش کن — نیازی به تماس با ما نیست.',
      'بعد از یک بار فعال‌سازی، <b>۴۵ روز کاملاً آفلاین</b> کار می‌کند و هر وقت آنلاین شدی خودش بی‌صدا تمدید می‌شود.',
      'خرید یک‌باره است. همه‌ی بروزرسانی‌های ۱.x رایگان‌اند.'
    ],

    manageCta: 'مدیریت لایسنس و سیستم‌ها',

    troubleTitle: 'اگر مشکلی پیش آمد',
    troubleBody: orderId =>
      `اگر کلید کار نکرد یا سؤالی داشتی، به این ایمیل جواب بده و شماره‌ی سفارش <b>${orderId}</b> را بنویس. `
      + 'همچنین می‌توانی از صفحه‌ی زیر وضعیت سفارشت را ببینی و ایمیل کلید را دوباره برای خودت بفرستی:',
    troubleCta: 'صفحه‌ی سفارش من',

    footer: 'این ایمیل به‌صورت خودکار پس از تأیید پرداخت شما ارسال شده است.',
    thanks: 'ممنون که خریدی.'
  },

  en: {
    dir: 'ltr',
    align: 'left',

    subject: tier => `Your Unity DocSnap ${tier} licence key`,
    preheader: 'Your licence key is ready.',

    heading: 'Your purchase is complete',
    intro: tier => `Here is your <b>Unity DocSnap ${tier}</b> licence key. Keep it somewhere safe.`,

    keyLabel: 'Licence key',
    tierLabel: 'Edition',
    orderLabel: 'Order',
    paidLabel: 'Paid',

    howTitle: 'How to activate it',
    steps: [
      'Open Unity and load your project.',
      'From the top menu, go to: <b>Unity DocSnap ▸ Licence &amp; Pro Features</b>',
      'Paste the key above into the box and press <b>Activate</b>.',
      'That is it. Everything in your edition unlocks straight away.'
    ],

    notesTitle: 'A few things worth knowing',
    notes: [
      'This key activates on <b>one machine</b>. Moving to a new computer is self-service — release the old one from inside Unity or from the licence page on the site, then activate the new one. No need to contact us.',
      'After one activation it works <b>fully offline for 45 days</b> and renews itself quietly whenever you happen to be online.',
      'It is a one-off purchase. Every 1.x update is included.'
    ],

    manageCta: 'Manage your licence and devices',

    troubleTitle: 'If something goes wrong',
    troubleBody: orderId =>
      `If the key does not work, or you have any question at all, just reply to this email and quote order <b>${orderId}</b>. `
      + 'You can also check your order and re-send this email to yourself here:',
    troubleCta: 'My order page',

    footer: 'This email was sent automatically once your payment confirmed.',
    thanks: 'Thank you for buying.'
  },

  ja: {
    dir: 'ltr',
    align: 'left',

    subject: tier => `Unity DocSnap ${tier} のライセンスキー`,
    preheader: 'ライセンスキーをお届けします。',

    heading: 'ご購入ありがとうございます',
    intro: tier => `<b>Unity DocSnap ${tier}</b> のライセンスキーです。大切に保管してください。`,

    keyLabel: 'ライセンスキー',
    tierLabel: 'エディション',
    orderLabel: '注文番号',
    paidLabel: 'お支払い',

    howTitle: '有効化の手順',
    steps: [
      'Unity を起動してプロジェクトを開きます。',
      'メニューから <b>Unity DocSnap ▸ Licence &amp; Pro Features</b> を選びます。',
      '上のキーを貼り付けて <b>Activate</b> を押します。',
      '以上です。購入したエディションの機能がすぐに使えるようになります。'
    ],

    notesTitle: 'ご利用にあたって',
    notes: [
      'このキーは <b>1 台</b>で有効化できます。マシンを変更する場合は、Unity 内またはサイトのライセンスページからご自身で解除し、新しいマシンで有効化してください。お問い合わせは不要です。',
      '一度有効化すれば <b>45 日間完全にオフライン</b>で動作し、オンライン時に自動で更新されます。',
      '買い切りです。1.x のアップデートはすべて含まれます。'
    ],

    manageCta: 'ライセンスとデバイスの管理',

    troubleTitle: '問題が起きた場合',
    troubleBody: orderId =>
      `キーが使えない場合やご不明な点がある場合は、このメールに返信し、注文番号 <b>${orderId}</b> をお知らせください。`
      + '以下のページからご注文の状況を確認し、このメールを再送することもできます。',
    troubleCta: '注文ページ',

    footer: 'このメールは、お支払いの確認後に自動送信されています。',
    thanks: 'ご購入ありがとうございました。'
  }
}


function pack(lang) {
  return I18N[lang] || I18N.en
}


// ==========================================
// shell
// The frame every customer email shares.
//
// The preheader span is the grey line a mail client shows
// next to the subject in an inbox list. Left to itself it
// picks up whatever text comes first, which for a message
// laid out in tables is usually something meaningless. It
// is hidden with the display:none / max-height / opacity
// trio rather than one of them because different clients
// respect different ones.
// ==========================================
function shell(p, { preheader, body }) {
  return `<!DOCTYPE html>
<html lang="${p === I18N.fa ? 'fa' : p === I18N.ja ? 'ja' : 'en'}" dir="${p.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>Unity DocSnap</title>
</head>
<body style="margin:0;padding:0;background:#f4f6fb;">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;max-height:0;max-width:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6fb;padding:24px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;
                    border:1px solid #e3e7f2;
                    font-family:'Segoe UI',Tahoma,'Hiragino Sans','Noto Sans JP',Arial,sans-serif;
                    color:#161821;line-height:1.75;direction:${p.dir};text-align:${p.align};">
        <tr>
          <td style="background:linear-gradient(135deg,#6c63ff,#a78bfa);padding:22px 28px;text-align:center;">
            <span style="font-size:26px;">🧋</span>
            <div style="color:#ffffff;font-weight:800;font-size:18px;letter-spacing:0.3px;">Unity DocSnap</div>
          </td>
        </tr>
        <tr><td style="padding:28px;">${body}</td></tr>
        <tr>
          <td style="padding:18px 28px 26px;border-top:1px solid #eef1f8;color:#6b7080;font-size:12px;">
            AmirCollider · <a href="${CONFIG.SITE_URL}" style="color:#6c63ff;text-decoration:none;">${CONFIG.SITE_URL.replace('https://', '')}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}


// ==========================================
// keyBlock
// The licence key, presented as the one thing on the page.
//
// dir="ltr" and a monospace face regardless of the message
// language. The key is a Latin string with hyphens in fixed
// positions, and rendering it inside an RTL paragraph moves
// those hyphens - producing something that looks almost
// right, copies wrong, and fails activation with no visible
// cause.
//
// user-select:all is a small kindness that works in a few
// clients and costs nothing in the rest: one click selects
// the whole key instead of one group of it.
// ==========================================
function keyBlock(p, key) {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:20px 0;border:2px dashed #6c63ff;border-radius:14px;background:#f7f6ff;">
    <tr>
      <td style="padding:18px;text-align:center;">
        <div style="font-size:12px;color:#6b7080;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;">
          ${escapeHtml(p.keyLabel)}
        </div>
        <div dir="ltr" style="font-family:'JetBrains Mono','Cascadia Code','Courier New',monospace;
                              font-size:20px;font-weight:700;letter-spacing:0.10em;color:#161821;
                              word-break:break-all;user-select:all;">
          ${escapeHtml(key)}
        </div>
      </td>
    </tr>
  </table>`
}


// ==========================================
// button
// A call to action that still works when the client refuses
// to draw a background colour.
//
// The border is the same colour as the fill, so a client
// that strips backgrounds leaves an outlined button rather
// than invisible text.
// ==========================================
function button(href, label) {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0;">
    <tr>
      <td style="border-radius:12px;background:#6c63ff;">
        <a href="${escapeHtml(href)}"
           style="display:inline-block;padding:12px 22px;border:1px solid #6c63ff;border-radius:12px;
                  color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;">
          ${escapeHtml(label)}
        </a>
      </td>
    </tr>
  </table>`
}


// ==========================================
// licenseEmail
// The message that delivers a key.
// ==========================================
export function licenseEmail(lang, { key, tier, orderId, priceUsd, statusUrl }) {
  const p = pack(lang)
  const tierName = CONFIG.DOCSNAP.TIERS[tier] ? CONFIG.DOCSNAP.TIERS[tier].name : tier

  const steps = p.steps
    .map((step, index) => `
      <tr>
        <td width="26" valign="top" style="padding:4px 0;color:#6c63ff;font-weight:800;">${index + 1}.</td>
        <td style="padding:4px 0;font-size:14px;">${step}</td>
      </tr>`)
    .join('')

  const notes = p.notes
    .map(note => `<li style="margin:6px 0;font-size:13px;color:#4a4f5e;">${note}</li>`)
    .join('')

  const body = `
    <h1 style="margin:0 0 6px;font-size:21px;font-weight:800;">${escapeHtml(p.heading)}</h1>
    <p style="margin:0;font-size:14px;color:#4a4f5e;">${p.intro(escapeHtml(tierName))}</p>

    ${keyBlock(p, key)}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="font-size:13px;color:#4a4f5e;margin-bottom:22px;">
      <tr>
        <td style="padding:3px 0;">${escapeHtml(p.tierLabel)}</td>
        <td style="padding:3px 0;font-weight:700;color:#161821;">Unity DocSnap ${escapeHtml(tierName)}</td>
      </tr>
      <tr>
        <td style="padding:3px 0;">${escapeHtml(p.orderLabel)}</td>
        <td style="padding:3px 0;font-weight:700;color:#161821;" dir="ltr">${escapeHtml(orderId)}</td>
      </tr>
      <tr>
        <td style="padding:3px 0;">${escapeHtml(p.paidLabel)}</td>
        <td style="padding:3px 0;font-weight:700;color:#161821;" dir="ltr">$${escapeHtml(priceUsd)}</td>
      </tr>
    </table>

    <h2 style="margin:0 0 8px;font-size:15px;font-weight:800;">${escapeHtml(p.howTitle)}</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="margin-bottom:20px;">${steps}</table>

    <h2 style="margin:0 0 6px;font-size:15px;font-weight:800;">${escapeHtml(p.notesTitle)}</h2>
    <ul style="margin:0 0 4px;padding-inline-start:20px;">${notes}</ul>

    ${button(CONFIG.SITE_URL + '/license', p.manageCta)}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="margin-top:18px;border-radius:12px;background:#fff8ec;border:1px solid #ffe0b2;">
      <tr>
        <td style="padding:14px 16px;">
          <div style="font-weight:800;font-size:14px;margin-bottom:5px;">${escapeHtml(p.troubleTitle)}</div>
          <div style="font-size:13px;color:#4a4f5e;">${p.troubleBody(escapeHtml(orderId))}</div>
          <div style="margin-top:8px;">
            <a href="${escapeHtml(statusUrl)}" style="color:#6c63ff;font-weight:700;font-size:13px;text-decoration:none;">
              ${escapeHtml(p.troubleCta)} →
            </a>
          </div>
        </td>
      </tr>
    </table>

    <p style="margin:20px 0 0;font-size:13px;color:#6b7080;">${escapeHtml(p.thanks)}</p>
    <p style="margin:6px 0 0;font-size:12px;color:#9096a6;">${escapeHtml(p.footer)}</p>`

  // The plain-text part, written rather than derived. The key
  // sits alone on its own line with blank lines either side,
  // which is what makes a double-click in a text-only client
  // select exactly it.
  const text = [
    p.heading,
    '',
    p.keyLabel + ':',
    '',
    key,
    '',
    `${p.tierLabel}: Unity DocSnap ${tierName}`,
    `${p.orderLabel}: ${orderId}`,
    `${p.paidLabel}: $${priceUsd}`,
    '',
    p.howTitle,
    ...p.steps.map((step, index) => `${index + 1}. ${stripTags(step)}`),
    '',
    p.notesTitle,
    ...p.notes.map(note => '- ' + stripTags(note)),
    '',
    p.manageCta + ': ' + CONFIG.SITE_URL + '/license',
    '',
    p.troubleTitle,
    stripTags(p.troubleBody(orderId)),
    statusUrl,
    '',
    p.thanks,
    p.footer
  ].join('\n')

  return {
    subject: p.subject(tierName),
    html: shell(p, { preheader: p.preheader, body }),
    text
  }
}


// ==========================================
// stripTags
// The bold markers out of a translated string, for the text
// part.
//
// Only ever runs over strings from the i18n pack above, all
// of which contain nothing but <b> and &amp; — so it does
// not need to be a sanitiser, and pretending otherwise
// would suggest it is safe to point at untrusted input.
// ==========================================
function stripTags(value) {
  return String(value)
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
}


// ==========================================
// orderIndexEmail
// "Here are your orders", sent to an address that asked.
//
// The recovery flow's whole shape hangs on this message
// existing. The alternative - a form that looks an address
// up and prints the answer on screen - would let anybody
// type a stranger's address and learn whether they bought
// this product, and then read their order status. Sending
// the answer to the inbox instead means the form can give
// the same reply to everybody, and only somebody who can
// read that inbox learns anything.
//
// It carries links, not keys. The link opens the order page,
// which has a resend button behind its own rate limit - so a
// mailbox that is being read over somebody's shoulder does
// not itself hand out a licence.
// ==========================================
export function orderIndexEmail(lang, { orders }) {
  const p = pack(lang)
  const strings = INDEX_I18N[lang] || INDEX_I18N.en

  const rows = orders.map(order => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #eef1f8;">
        <div style="font-weight:700;font-size:14px;">Unity DocSnap ${escapeHtml(order.tierName)}</div>
        <div style="font-size:12px;color:#6b7080;" dir="ltr">${escapeHtml(order.id)} · ${escapeHtml(order.when)}</div>
        <div style="font-size:13px;margin-top:4px;">${escapeHtml(strings.statusLabel)}: <b>${escapeHtml(order.statusText)}</b></div>
        <div style="margin-top:6px;">
          <a href="${escapeHtml(order.url)}" style="color:#6c63ff;font-weight:700;font-size:13px;text-decoration:none;">
            ${escapeHtml(strings.open)} →
          </a>
        </div>
      </td>
    </tr>`).join('')

  const body = `
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:800;">${escapeHtml(strings.heading)}</h1>
    <p style="margin:0 0 16px;font-size:14px;color:#4a4f5e;">${escapeHtml(strings.intro)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
    <p style="margin:18px 0 0;font-size:13px;color:#6b7080;">${escapeHtml(strings.footer)}</p>`

  const text = [
    strings.heading,
    '',
    strings.intro,
    '',
    ...orders.flatMap(order => [
      `Unity DocSnap ${order.tierName} — ${order.id} (${order.when})`,
      `${strings.statusLabel}: ${order.statusText}`,
      order.url,
      ''
    ]),
    strings.footer
  ].join('\n')

  return { subject: strings.subject, html: shell(p, { preheader: strings.intro, body }), text }
}


const INDEX_I18N = {
  fa: {
    subject: 'سفارش‌های Unity DocSnap شما',
    heading: 'سفارش‌های شما',
    intro: 'این‌ها سفارش‌هایی هستند که با این آدرس ایمیل ثبت شده‌اند. روی هر کدام بزنی، وضعیتش را می‌بینی و اگر کلیدش صادر شده می‌توانی دوباره برای خودت بفرستی.',
    statusLabel: 'وضعیت',
    open: 'باز کردن صفحه‌ی سفارش',
    footer: 'اگر این درخواست را تو نفرستاده‌ای، این ایمیل را نادیده بگیر — هیچ تغییری در حساب تو داده نشده.'
  },
  en: {
    subject: 'Your Unity DocSnap orders',
    heading: 'Your orders',
    intro: 'These are the orders placed with this email address. Open one to see its status, and to send yourself the licence key again if it has been issued.',
    statusLabel: 'Status',
    open: 'Open the order page',
    footer: 'If you did not ask for this, you can ignore this email — nothing about your orders has changed.'
  },
  ja: {
    subject: 'Unity DocSnap のご注文一覧',
    heading: 'ご注文一覧',
    intro: 'このメールアドレスで登録されたご注文です。開くと状況を確認でき、キーが発行済みであれば再送もできます。',
    statusLabel: '状況',
    open: '注文ページを開く',
    footer: 'お心当たりがない場合は、このメールは破棄してください。ご注文内容に変更はありません。'
  }
}


// ==========================================
// adminAlertEmail
// Something needs a human, in the operator's own language
// of choice - which is English, because it is one person
// and they wrote this.
//
// Deliberately plain. An alert that is nice to look at is
// an alert somebody spent time on instead of fixing the
// thing it is about, and this one has to be legible on a
// phone at an inconvenient hour.
// ==========================================
export function adminAlertEmail({ title, lines, orderId }) {
  const rows = (lines || [])
    .map(line => `<tr><td style="padding:3px 0;font-size:13px;color:#22242e;">${escapeHtml(line)}</td></tr>`)
    .join('')

  const html = `<!DOCTYPE html>
<html lang="en" dir="ltr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:24px;background:#f4f6fb;font-family:'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="max-width:540px;margin:0 auto;background:#fff;border:1px solid #e3e7f2;border-radius:14px;">
    <tr><td style="padding:20px 24px;">
      <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#f44336;font-weight:800;">
        Unity DocSnap checkout
      </div>
      <h1 style="margin:6px 0 14px;font-size:18px;">${escapeHtml(title)}</h1>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
      ${orderId ? `<p style="margin:16px 0 0;font-size:13px;">
        <a href="${CONFIG.SITE_URL}/checkout/pay?o=${encodeURIComponent(orderId)}"
           style="color:#6c63ff;text-decoration:none;font-weight:700;">Open the order page →</a></p>` : ''}
    </td></tr>
  </table>
</body></html>`

  const text = [title, '', ...(lines || [])].join('\n')

  return { subject: `[DocSnap] ${title}`, html, text }
}
