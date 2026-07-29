// ==========================================
// content/supportTemplates.js
// The email a customer sends us when their key did not
// arrive, written for them in advance, in three languages.
//
// Public exports:
//   supportTemplate(lang, facts)   -> { subject, body, hashtags }
//   mailtoFor(address, template)   -> a mailto: URL
//   SUPPORT_TAGS
//
// This exists because of what the alternative looks like.
// Somebody has paid, waited, and received nothing; they are
// now composing an email while annoyed, and what arrives is
// "I bought your thing and it didn't work" from an address
// that is not the one they paid with, with no order id.
// Answering it takes three round trips over two days, and
// the first of those round trips is us asking questions that
// read, to them, like we are stalling.
//
// A prefilled template turns that into one message that
// contains everything needed to find the order in a single
// query. The customer writes nothing and waits once.
//
// The facts are interpolated from the order when the page
// knows it, and left as visible blanks when it does not - a
// blank a person can see and fill in is better than a
// silently missing line, because they can tell it is
// missing.
// ==========================================


// ==========================================
// SUPPORT_TAGS
// The literal strings that make these findable in a mailbox.
//
// A hashtag rather than a subject convention, because a
// subject line gets rewritten by mail clients, translated by
// the customer, and truncated by phones. A token in the body
// survives all three and turns "find every stuck DocSnap
// order" into one search.
// ==========================================
export const SUPPORT_TAGS = ['#UnityDocSnap', '#LicenseNotReceived', '#PaidOrder']


// ==========================================
// blank
// A placeholder a human can see.
//
// Underscores rather than an empty string or a silent
// omission: somebody skim-reading their own draft before
// sending will notice a row of underscores and fill it in,
// and will not notice a line that is not there.
// ==========================================
const BLANK = '________'

function value(input) {
  const text = String(input == null ? '' : input).trim()
  return text || BLANK
}


// ==========================================
// i18n
//
// Every version says the same four things in the same order,
// because that order is what makes the message answerable:
//
//   1. What was bought, and that it was paid for.
//   2. The identifiers that find the order.
//   3. That the promised window has passed.
//   4. A reminder to attach proof of payment.
//
// The screenshot line is a line in the body rather than a
// note on the page above it. A note on the page is read
// before the template is copied and forgotten by the time
// the email is composed; a line inside the draft is still
// there when they press send.
// ==========================================
const I18N = {
  fa: {
    subject: orderId => `لایسنس دریافت نشد — سفارش ${orderId}`,

    build: facts => [
      'سلام،',
      '',
      'من از سایت شما لایسنس Unity DocSnap خریداری کردم و پول را پرداخت کردم،',
      `اما بعد از ${facts.minutes} دقیقه هنوز کلید لایسنس به ایمیلم ارسال نشده است.`,
      '',
      'مشخصات سفارش:',
      `• شماره سفارش: ${value(facts.orderId)}`,
      `• نسخه: ${value(facts.tierName)}`,
      `• مبلغ: ${value(facts.priceUsd ? '$' + facts.priceUsd : '')}`,
      `• ایمیلی که هنگام خرید وارد کردم: ${value(facts.email)}`,
      `• تاریخ و ساعت پرداخت: ${value(facts.paidAt)}`,
      `• ارزی که با آن پرداخت کردم: ${value(facts.payCurrency)}`,
      `• شناسه تراکنش (TxID / Hash): ${value(facts.txId)}`,
      '',
      '📎 اسکرین‌شات پرداخت را به این ایمیل پیوست کرده‌ام.',
      '',
      'ممنون می‌شوم بررسی کنید و کلید را برایم ارسال کنید.',
      '',
      'با تشکر',
      '',
      SUPPORT_TAGS.join(' ')
    ].join('\n')
  },

  en: {
    subject: orderId => `Licence not received — order ${orderId}`,

    build: facts => [
      'Hello,',
      '',
      'I bought a Unity DocSnap licence on your site and completed the payment,',
      `but after ${facts.minutes} minutes the licence key still has not arrived in my inbox.`,
      '',
      'Order details:',
      `• Order ID: ${value(facts.orderId)}`,
      `• Edition: ${value(facts.tierName)}`,
      `• Amount: ${value(facts.priceUsd ? '$' + facts.priceUsd : '')}`,
      `• Email I used at checkout: ${value(facts.email)}`,
      `• Date and time of payment: ${value(facts.paidAt)}`,
      `• Currency I paid with: ${value(facts.payCurrency)}`,
      `• Transaction ID (TxID / hash): ${value(facts.txId)}`,
      '',
      '📎 I have attached a screenshot of the payment to this email.',
      '',
      'Could you please look into it and send me the key?',
      '',
      'Thank you',
      '',
      SUPPORT_TAGS.join(' ')
    ].join('\n')
  },

  ja: {
    subject: orderId => `ライセンスが届きません — 注文 ${orderId}`,

    build: facts => [
      'お世話になっております。',
      '',
      'そちらのサイトで Unity DocSnap のライセンスを購入し、支払いを完了しましたが、',
      `${facts.minutes} 分経ってもライセンスキーがメールに届いていません。`,
      '',
      '注文の詳細:',
      `• 注文番号: ${value(facts.orderId)}`,
      `• エディション: ${value(facts.tierName)}`,
      `• 金額: ${value(facts.priceUsd ? '$' + facts.priceUsd : '')}`,
      `• 購入時に入力したメールアドレス: ${value(facts.email)}`,
      `• 支払い日時: ${value(facts.paidAt)}`,
      `• 支払いに使用した通貨: ${value(facts.payCurrency)}`,
      `• トランザクション ID (TxID / ハッシュ): ${value(facts.txId)}`,
      '',
      '📎 支払いのスクリーンショットをこのメールに添付しています。',
      '',
      'ご確認のうえ、キーをお送りいただけますでしょうか。',
      '',
      'よろしくお願いいたします。',
      '',
      SUPPORT_TAGS.join(' ')
    ].join('\n')
  }
}


// ==========================================
// supportTemplate
// The message, filled in as far as we can fill it.
//
// The subject carries the order id when there is one,
// because a subject line that already contains the
// identifier means the reply can be found by searching for
// it later - including by the customer, six months on, when
// they want the same key on a new laptop.
// ==========================================
export function supportTemplate(lang, facts = {}) {
  const pack = I18N[lang] || I18N.en
  const filled = { minutes: 5, ...facts }

  return {
    subject: pack.subject(facts.orderId || BLANK),
    body: pack.build(filled),
    hashtags: SUPPORT_TAGS
  }
}


// ==========================================
// mailtoFor
// The template as a link that opens a composed draft.
//
// encodeURIComponent on both parts, which is what turns the
// newlines into something every mail client agrees about.
// Without it the body arrives as one paragraph and the
// bullet list - the part that makes the message answerable -
// is gone.
// ==========================================
export function mailtoFor(address, template) {
  return 'mailto:' + encodeURIComponent(address)
    + '?subject=' + encodeURIComponent(template.subject)
    + '&body=' + encodeURIComponent(template.body)
}
