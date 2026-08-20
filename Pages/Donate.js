// ==========================================
// Pages/Donate.js
// A tip jar, with whatever number the donor types in it.
//
// Public entries (wired in Worker.js ROUTES):
//   GET  /donate          the page
//   POST /donate/create   opens an invoice, hands over to the provider
//   GET  /donate/thanks   where the provider sends them back
//
// ------------------------------------------------------------
// WHY THIS IS NOT THE CHECKOUT
// ------------------------------------------------------------
// The licence checkout (Pages/Checkout.js) is elaborate for one
// reason: something is owed at the end of it. A key has to be
// generated, sealed, emailed, retried on a mail failure, kept
// retrievable for thirty days and reconciled by cron if the
// provider's callback never arrives. Every table and every retry
// schedule in that file exists because a customer paid for a thing
// and does not have it yet.
//
// A donation owes nothing. Nobody is waiting for delivery, there is
// no entitlement to restore and no support ticket that begins "it
// never arrived". So this route creates an invoice, hands the donor
// to the provider's hosted page, and stops - no order row, no
// webhook, no reconciliation. The provider's own dashboard is the
// record, and it is the only record that matters here.
//
// That is a deliberate trade and not an omission. The site cannot
// tell you afterwards who donated or how much, because it never
// asked and never wrote it down.
//
// ------------------------------------------------------------
// THE AMOUNT
// ------------------------------------------------------------
// Free-entry, with presets as a starting point rather than a menu.
// It is validated on the way in - a number, inside
// CONFIG.DONATE.MIN_USD..MAX_USD, rounded to cents - because the
// value goes straight into an invoice, and "whatever the donor
// typed" is a string from the open internet like any other.
// ==========================================

import { CONFIG } from '../Config.js'
import { getPageHead } from '../Core/DesignSystem.js'
import { createHtmlResponse, clientIp } from '../Core/Http.js'
import { escapeHtml } from '../Core/Html.js'
import { logInfo, logWarning } from '../Core/Logging.js'
import { localizedPath } from '../Core/Locale.js'
import { themeBootScript } from '../Core/PageChrome.js'
import { createInvoice, isConfigured } from '../Commerce/Provider.js'
import { seoHead, breadcrumbLd, faqPageLd } from '../Core/Seo.js'
import {
  siteNavCss, siteHeader, siteBreadcrumb, siteFooter, siteBackToTop, siteChromeScript, NAV_I18N
} from '../Core/SiteNav.js'
import {
  langCookieHeader, parseCookies, resolveLang, resolveRequestLang, resolveRequestTheme, dirFor
} from '../Core/RequestContext.js'


// ==========================================
// Strings
// ==========================================
const I18N = {
  fa: {
    metaTitle: 'حمایت مالی از AmirCollider — هر مبلغی که دوست داری',
    metaDesc: 'اگر بازی‌ها یا افزونه‌های یونیتی AmirCollider به کارت آمده‌اند، می‌توانی با هر مبلغی که دوست داری حمایت کنی. پرداخت با ارز دیجیتال، بدون ثبت‌نام و بدون اشتراک.',
    keywords: ['حمایت از توسعه‌دهنده', 'دونیت ارز دیجیتال', 'حمایت مالی بازی‌ساز مستقل'],
    breadcrumb: 'حمایت مالی',

    hi: 'سلام! 👋',
    title: 'اگر دوست داشتی، یک قهوه مهمانم کن',
    intro: 'همه‌چیزِ این‌جا رایگان است و قرار هم نیست تغییر کند. اگر یکی از بازی‌ها یا افزونه‌ها به کارت آمده و دوست داشتی جبران کنی، این صفحه برای همان است — با هر مبلغی که خودت دوست داری، حتی خیلی کم.',

    amountHead: 'چقدر؟',
    amountHint: 'یکی از این‌ها را بزن یا خودت عدد بنویس.',
    customLabel: 'مبلغ دلخواه (دلار)',
    noteLabel: 'یک پیام کوتاه (اختیاری)',
    notePlaceholder: 'مثلاً: دمت گرم بابت DirectTMP!',
    noteHint: 'فقط خودم می‌بینمش. اگر چیزی ننویسی هم کاملاً اوکی است.',
    cta: 'ادامه به پرداخت',
    ctaHint: 'به صفحه‌ی امن پرداخت می‌روی و آن‌جا ارز دلخواهت را انتخاب می‌کنی.',

    whyHead: 'این پول کجا می‌رود؟',
    why: [
      { icon: '🌐', text: 'هزینه‌ی دامنه و سرویس‌هایی که همین سایت روی آن‌ها بالاست.' },
      { icon: '🎮', text: 'ساخت بازی بعدی — و وقتی که به‌جای کار دیگری صرفش می‌کنم.' },
      { icon: '🧰', text: 'نگه‌داشتن افزونه‌های یونیتی به‌روز و رایگان برای همه.' },
      { icon: '☕', text: 'و بله، قهوه. صادقانه بگویم مقدار قابل‌توجهی‌اش قهوه است.' }
    ],

    faqHead: 'چند تا سؤال',
    faq: [
      {
        q: 'حتماً باید حمایت کنم تا از بازی‌ها یا ابزارها استفاده کنم؟',
        a: 'نه. هیچ‌چیزی این‌جا پشت حمایت مالی قفل نیست و نخواهد بود. این صفحه فقط برای کسی است که خودش دوست دارد.'
      },
      {
        q: 'چطور پرداخت می‌کنم؟',
        a: 'با ارز دیجیتال. بعد از زدن دکمه به صفحه‌ی امن ارائه‌دهنده‌ی پرداخت می‌روی و آن‌جا بین ارزهای مختلف انتخاب می‌کنی. لازم نیست حسابی بسازی.'
      },
      {
        q: 'چیزی در ازایش می‌گیرم؟',
        a: 'نه، و این عمدی است. حمایت مالی این‌جا خرید نیست؛ چیزی تحویل داده نمی‌شود و امتیاز ویژه‌ای هم فعال نمی‌شود.'
      },
      {
        q: 'اطلاعاتم ذخیره می‌شود؟',
        a: 'این سایت هیچ‌چیزی از حمایت مالی ذخیره نمی‌کند — نه نام، نه ایمیل، نه مبلغ. پرداخت کاملاً سمت ارائه‌دهنده انجام می‌شود.'
      },
      {
        q: 'می‌شود پسش گرفت؟',
        a: 'تراکنش‌های ارز دیجیتال برگشت‌پذیر نیستند، پس لطفاً قبل از تأیید مبلغ را یک بار نگاه کن. اگر اشتباهی پیش آمد به من ایمیل بزن؛ قول نمی‌دهم اما تلاشم را می‌کنم.'
      }
    ],

    otherHead: 'راه‌های دیگرِ حمایت که یک ریال هم خرج ندارند',
    other: [
      'به دوستی که بازی‌ساز است درباره‌ی افزونه‌ها بگو.',
      'به مخزن گیت‌هاب یک ستاره بده.',
      'اگر باگی دیدی خبرم کن — واقعاً کمک بزرگی است.',
      'در شبکه‌های اجتماعی دنبالم کن؛ همان هم دلگرم‌کننده است.'
    ],

    thanksTitle: 'ممنون! 🎉',
    thanksBody: 'اگر پرداخت را کامل کرده باشی، همین‌الان رسیده — یا تا چند دقیقه‌ی دیگر می‌رسد. لازم نیست کار دیگری بکنی.',
    thanksNote: 'اگر منصرف شدی هم هیچ اشکالی ندارد و هیچ اتفاقی نیفتاده.',
    backHome: 'بازگشت به خانه',
    backAbout: 'درباره‌ی من',

    errHead: 'یک لحظه…',
    errAmount: 'مبلغ باید عددی بین {min} و {max} دلار باشد.',
    errUnavailable: 'پرداخت همین حالا در دسترس نیست. کمی بعد دوباره امتحان کن — یا مستقیم به من ایمیل بزن.',
    errBusy: 'کمی زیادی سریع پشت هم تلاش شد. چند دقیقه صبر کن و دوباره امتحان کن.',

    handoffTitle: 'داری به صفحه‌ی پرداخت می‌روی…',
    handoffBody: 'یک لحظه صبر کن. اگر خودبه‌خود منتقل نشدی، روی دکمه‌ی زیر بزن.',
    handoffCta: 'رفتن به صفحه‌ی پرداخت',
    tryAgain: 'دوباره امتحان کن'
  },

  en: {
    metaTitle: 'Support AmirCollider — donate any amount you like',
    metaDesc: 'If a game or Unity extension from AmirCollider has been useful to you, chip in whatever you like. Paid in cryptocurrency, no sign-up and no subscription.',
    keywords: ['support an indie developer', 'crypto donation', 'donate to a game developer'],
    breadcrumb: 'Donate',

    hi: 'Hi there! 👋',
    title: 'Buy me a coffee, if you feel like it',
    intro: 'Everything here is free, and that is not going to change. If one of the games or the Unity extensions has been useful to you and you feel like giving something back, this page is for exactly that — any amount you like, however small.',

    amountHead: 'How much?',
    amountHint: 'Pick one of these, or type your own number.',
    customLabel: 'Your own amount (USD)',
    noteLabel: 'A short message (optional)',
    notePlaceholder: 'e.g. thanks for DirectTMP!',
    noteHint: 'Only I see it. Leaving it empty is completely fine.',
    cta: 'Continue to payment',
    ctaHint: 'You will be taken to a secure payment page where you pick the currency you want to pay in.',

    whyHead: 'Where does it go?',
    why: [
      { icon: '🌐', text: 'The domain and the services this site actually runs on.' },
      { icon: '🎮', text: 'Making the next game — and the hours spent on it instead of on other work.' },
      { icon: '🧰', text: 'Keeping the Unity extensions maintained and free for everybody.' },
      { icon: '☕', text: 'And yes, coffee. Honestly, a meaningful share of it is coffee.' }
    ],

    faqHead: 'A few questions',
    faq: [
      {
        q: 'Do I have to donate to use the games or the tools?',
        a: 'No. Nothing here is locked behind a donation and nothing ever will be. This page is only for people who want to.'
      },
      {
        q: 'How do I pay?',
        a: 'With cryptocurrency. After you press the button you go to the payment provider’s secure page and choose which currency to pay in there. You do not need to create an account.'
      },
      {
        q: 'Do I get anything for it?',
        a: 'No, and that is deliberate. A donation here is not a purchase: nothing is delivered and no perk is unlocked.'
      },
      {
        q: 'Is my information stored?',
        a: 'This site stores nothing about a donation — no name, no email, no amount. The payment happens entirely on the provider’s side.'
      },
      {
        q: 'Can I get it back?',
        a: 'Cryptocurrency transactions cannot be reversed, so please check the amount once before you confirm. If something goes wrong, email me — no promises, but I will try.'
      }
    ],

    otherHead: 'Ways to help that cost nothing at all',
    other: [
      'Tell a friend who makes games about the extensions.',
      'Star the repository on GitHub.',
      'Report a bug if you find one — that genuinely helps more than you would think.',
      'Follow along on social media; that is encouraging on its own.'
    ],

    thanksTitle: 'Thank you! 🎉',
    thanksBody: 'If you completed the payment it has either arrived already or will within a few minutes. There is nothing else you need to do.',
    thanksNote: 'And if you changed your mind, that is completely fine — nothing happened.',
    backHome: 'Back to the home page',
    backAbout: 'About me',

    errHead: 'One moment…',
    errAmount: 'The amount has to be a number between ${min} and ${max}.',
    errUnavailable: 'Payments are not available right now. Try again shortly — or just email me directly.',
    errBusy: 'That was a lot of attempts in a row. Give it a few minutes and try again.',

    handoffTitle: 'Taking you to the payment page…',
    handoffBody: 'One moment. If nothing happens on its own, use the button below.',
    handoffCta: 'Go to the payment page',
    tryAgain: 'Try again'
  },

  ja: {
    metaTitle: 'AmirCollider を支援する — 金額はお好きなだけ',
    metaDesc: 'AmirCollider のゲームや Unity 拡張が役に立ったなら、好きな金額で支援できます。暗号資産で支払い、登録も定期購入も不要です。',
    keywords: ['インディー開発者を支援', '暗号資産で寄付', 'ゲーム開発者に寄付'],
    breadcrumb: '支援する',

    hi: 'こんにちは! 👋',
    title: 'よかったら、コーヒーを一杯',
    intro: 'ここにあるものはすべて無料で、これからも変わりません。ゲームや Unity 拡張が役に立って、何か返したいと思ってくれたなら、このページはそのためのものです。金額はいくらでも、少額でもかまいません。',

    amountHead: '金額は?',
    amountHint: '下から選ぶか、自分で入力してください。',
    customLabel: '任意の金額 (USD)',
    noteLabel: '短いメッセージ (任意)',
    notePlaceholder: '例: DirectTMP ありがとう!',
    noteHint: '私だけが見ます。空のままでもまったく問題ありません。',
    cta: '支払いに進む',
    ctaHint: '安全な決済ページに移動し、そこで支払う通貨を選びます。',

    whyHead: '何に使われますか?',
    why: [
      { icon: '🌐', text: 'ドメイン代と、このサイトが実際に動いているサービスの費用。' },
      { icon: '🎮', text: '次のゲームの制作 — そこに充てる時間そのもの。' },
      { icon: '🧰', text: 'Unity 拡張を無料のまま保守しつづけること。' },
      { icon: '☕', text: 'そしてコーヒー。正直に言うと、かなりの割合がコーヒーです。' }
    ],

    faqHead: 'いくつかの質問',
    faq: [
      {
        q: 'ゲームやツールを使うのに支援は必要ですか?',
        a: 'いいえ。支援の有無で制限されるものはありませんし、今後もありません。このページは、そうしたい人のためだけのものです。'
      },
      {
        q: 'どうやって支払いますか?',
        a: '暗号資産です。ボタンを押すと決済プロバイダーの安全なページに移動し、そこで支払う通貨を選びます。アカウント作成は不要です。'
      },
      {
        q: '見返りはありますか?',
        a: 'ありません。意図的にそうしています。ここでの支援は購入ではなく、何も配布されず、特典も解放されません。'
      },
      {
        q: '個人情報は保存されますか?',
        a: 'このサイトは支援について何も保存しません — 名前もメールも金額もです。決済はすべてプロバイダー側で行われます。'
      },
      {
        q: '返金できますか?',
        a: '暗号資産の取引は取り消せないので、確定前に金額をもう一度確認してください。問題が起きた場合はメールをください。確約はできませんが、できるかぎり対応します。'
      }
    ],

    otherHead: 'お金のかからない支援のしかた',
    other: [
      'ゲームを作っている友人に拡張のことを教える。',
      'GitHub のリポジトリにスターを付ける。',
      'バグを見つけたら報告する — これは本当に助かります。',
      'SNS でフォローする。それだけでも励みになります。'
    ],

    thanksTitle: 'ありがとうございます! 🎉',
    thanksBody: '支払いが完了していれば、すでに届いているか、数分以内に届きます。ほかに必要な操作はありません。',
    thanksNote: '気が変わった場合もまったく問題ありません。何も起きていません。',
    backHome: 'ホームに戻る',
    backAbout: '自己紹介',

    errHead: 'ちょっと待ってください…',
    errAmount: '金額は {min} から {max} ドルのあいだの数値である必要があります。',
    errUnavailable: '現在、支払いを利用できません。しばらくしてからもう一度お試しください。直接メールでも構いません。',
    errBusy: '短時間に試行が集中しました。数分おいてからもう一度お試しください。',

    handoffTitle: '決済ページに移動しています…',
    handoffBody: '少々お待ちください。自動で移動しない場合は下のボタンを押してください。',
    handoffCta: '決済ページへ',
    tryAgain: 'もう一度試す'
  }
}

function pack(lang) {
  return I18N[resolveLang(lang)]
}


// ==========================================
// Rate limiting
//
// A Map in the isolate, not a table.
//
// The two shops on this Worker rate-limit through D1, because an
// order there is a row that has to exist anyway - the limit is a
// COUNT over records that were being written regardless. A donation
// writes nothing, so the same approach would mean adding a table, a
// migration and a binding for the sole purpose of counting.
//
// What this catches is a loop from one source hitting one isolate,
// which is the shape abuse actually takes here. What it does not
// catch is a distributed one, or the same caller landing in a
// different isolate - Cloudflare runs many, and this counter is not
// shared between them.
//
// That asymmetry is acceptable for this endpoint and would not be
// for the others: the worst outcome here is junk invoices in the
// provider's dashboard, and no money, no key and no entitlement is
// ever on the wrong side of it. If that stops being true, this
// becomes a table.
// ==========================================
const attempts = new Map()

function rateLimited(ip) {
  const now = Date.now()
  const window = CONFIG.DONATE.RATE_WINDOW_MS
  const seen = (attempts.get(ip) || []).filter(at => now - at < window)

  // Bounded so a long-lived isolate cannot accumulate one entry per
  // address that has ever reached it.
  if (attempts.size > 5000) attempts.clear()

  if (seen.length >= CONFIG.DONATE.RATE_LIMIT) {
    attempts.set(ip, seen)
    return true
  }

  seen.push(now)
  attempts.set(ip, seen)
  return false
}


/**
 * The donated amount, or null.
 *
 * Rejects anything that is not a finite number in range, and rounds
 * to cents rather than trusting the input's precision - an invoice
 * opened for 4.999999999 is a rounding argument with a payment
 * provider nobody wants to have.
 */
function parseAmount(raw) {
  const value = Number(String(raw == null ? '' : raw).trim().replace(/,/g, ''))
  if (!Number.isFinite(value)) return null

  const cents = Math.round(value * 100)
  const min = Math.round(CONFIG.DONATE.MIN_USD * 100)
  const max = Math.round(CONFIG.DONATE.MAX_USD * 100)
  if (cents < min || cents > max) return null

  return (cents / 100).toFixed(2)
}


/** The donor's note, trimmed to something an invoice can carry. */
function parseNote(raw) {
  return String(raw == null ? '' : raw)
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, CONFIG.DONATE.MAX_NOTE)
}


// ==========================================
// Stylesheet
//
// Warmer and rounder than the rest of the site on purpose. This is
// the one page that asks for something, and a page that asks should
// not look like an invoice - the checkout already does, correctly,
// because that one IS an invoice.
// ==========================================
function donateCss() {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --brand: #6c63ff;
      --warm: #ff8fb1;
      --sun: #ffc46b;
      --radius: 22px;
      --maxw: 880px;

      --bg-1: #0b0e16;
      --bg-2: #17142b;
      --surface: rgba(255,255,255,0.05);
      --surface-2: rgba(255,255,255,0.09);
      --border: rgba(255,255,255,0.11);
      --text: rgba(255,255,255,0.93);
      --text-dim: rgba(255,255,255,0.62);
      color-scheme: dark;
    }
    @media (prefers-color-scheme: light) {
      :root:not([data-theme]) {
        --bg-1: #fff9fb; --bg-2: #f0f0fd;
        --surface: rgba(255,255,255,0.78); --surface-2: #ffffff;
        --border: rgba(20,22,33,0.10);
        --text: rgba(22,24,33,0.92); --text-dim: rgba(22,24,33,0.58);
        color-scheme: light;
      }
    }
    :root[data-theme="light"] {
      --bg-1: #fff9fb; --bg-2: #f0f0fd;
      --surface: rgba(255,255,255,0.78); --surface-2: #ffffff;
      --border: rgba(20,22,33,0.10);
      --text: rgba(22,24,33,0.92); --text-dim: rgba(22,24,33,0.58);
      color-scheme: light;
    }
    :root[data-theme="dark"] {
      --bg-1: #0b0e16; --bg-2: #17142b;
      --surface: rgba(255,255,255,0.05); --surface-2: rgba(255,255,255,0.09);
      --border: rgba(255,255,255,0.11);
      --text: rgba(255,255,255,0.93); --text-dim: rgba(255,255,255,0.62);
      color-scheme: dark;
    }

    body {
      font-family: 'Vazirmatn', system-ui, -apple-system, 'Segoe UI', Roboto,
                   'Noto Sans JP', 'Hiragino Sans', Meiryo, sans-serif;
      color: var(--text); min-height: 100vh; line-height: 1.9;
      padding-inline: 20px; -webkit-font-smoothing: antialiased;
      background:
        radial-gradient(760px 460px at 85% -6%, color-mix(in srgb, var(--sun) 22%, transparent), transparent 60%),
        radial-gradient(820px 500px at 8% 0%, color-mix(in srgb, var(--warm) 24%, transparent), transparent 62%),
        linear-gradient(165deg, var(--bg-1), var(--bg-2));
      background-attachment: fixed;
    }
    .wrap { max-width: var(--maxw); margin-inline: auto; padding-block-end: 56px; }
    .ac-nav { margin-inline: -20px; padding-inline: 20px; }
    bdi, [dir="ltr"] { unicode-bidi: isolate; }

    /* ---------- hero ---------- */
    .dn-hero { text-align: center; padding-block: 8px 26px; }
    .dn-jar {
      width: 96px; height: 96px; margin-inline: auto; border-radius: 32px;
      display: grid; place-items: center; font-size: 3em; line-height: 1;
      background: linear-gradient(150deg,
        color-mix(in srgb, var(--warm) 30%, var(--surface-2)),
        color-mix(in srgb, var(--sun) 26%, var(--surface-2)));
      border: 2px solid color-mix(in srgb, var(--warm) 40%, var(--border));
      box-shadow: 0 16px 40px rgba(0,0,0,0.20);
    }
    @media (prefers-reduced-motion: no-preference) {
      .dn-jar { animation: dnBob 3.4s ease-in-out infinite; }
      @keyframes dnBob { 0%,100% { transform: translateY(0) rotate(-2deg); } 50% { transform: translateY(-7px) rotate(2deg); } }
    }
    .dn-hi { display: block; color: var(--text-dim); font-weight: 700; margin-block-start: 16px; }
    .dn-hero h1 {
      font-size: clamp(1.6em, 4.6vw, 2.3em); font-weight: 800; line-height: 1.35;
      margin-block-start: 4px;
    }
    .dn-intro { color: var(--text-dim); max-width: 56ch; margin-inline: auto; margin-block-start: 12px; }

    /* ---------- the card ---------- */
    .dn-card {
      padding: 26px 26px 24px; border-radius: var(--radius); margin-block-end: 30px;
      background: linear-gradient(140deg,
        color-mix(in srgb, var(--warm) 10%, var(--surface)),
        color-mix(in srgb, var(--brand) 9%, var(--surface)));
      border: 1px solid color-mix(in srgb, var(--warm) 24%, var(--border));
      box-shadow: 0 18px 44px rgba(0,0,0,0.14);
    }
    .dn-card h2 { font-size: 1.14em; font-weight: 800; }
    .dn-sub { color: var(--text-dim); font-size: 0.9em; margin-block-end: 16px; }

    .dn-presets { display: flex; flex-wrap: wrap; gap: 10px; margin-block-end: 18px; }
    .dn-chip {
      appearance: none; cursor: pointer; font: inherit; font-weight: 800;
      padding: 11px 20px; border-radius: 16px; font-size: 1.02em;
      color: var(--text); background: var(--surface-2);
      border: 1.5px solid var(--border);
      transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
    }
    .dn-chip:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--warm) 45%, var(--border)); }
    .dn-chip[aria-pressed="true"] {
      color: #fff; border-color: transparent;
      background: linear-gradient(135deg, var(--warm), var(--sun));
      box-shadow: 0 8px 20px color-mix(in srgb, var(--warm) 34%, transparent);
    }

    .dn-field { margin-block-end: 16px; }
    .dn-field label { display: block; font-weight: 700; font-size: 0.9em; margin-block-end: 7px; }
    .dn-money { position: relative; display: flex; align-items: center; }
    .dn-money .dn-cur {
      position: absolute; inset-inline-start: 16px; font-weight: 800; color: var(--text-dim);
      pointer-events: none;
    }
    .dn-card input[type="number"], .dn-card input[type="text"] {
      width: 100%; font: inherit; color: var(--text);
      padding: 13px 16px; border-radius: 15px;
      background: var(--surface-2); border: 1.5px solid var(--border);
      transition: border-color 0.16s ease;
    }
    .dn-card input[type="number"] { padding-inline-start: 40px; font-weight: 800; font-size: 1.1em; }
    .dn-card input:focus { outline: none; border-color: color-mix(in srgb, var(--warm) 55%, var(--border)); }
    .dn-card input::placeholder { color: var(--text-dim); font-weight: 400; }
    .dn-hint { color: var(--text-dim); font-size: 0.82em; margin-block-start: 6px; }

    .dn-go {
      width: 100%; appearance: none; cursor: pointer; font: inherit;
      font-weight: 800; font-size: 1.06em; color: #fff;
      padding: 15px 22px; border-radius: 17px; border: 0;
      background: linear-gradient(135deg, var(--warm), var(--sun));
      box-shadow: 0 12px 28px color-mix(in srgb, var(--warm) 32%, transparent);
      transition: transform 0.16s ease, box-shadow 0.16s ease;
    }
    .dn-go:hover { transform: translateY(-2px); box-shadow: 0 16px 34px color-mix(in srgb, var(--warm) 40%, transparent); }
    .dn-go:active { transform: translateY(0); }
    .dn-golegend { text-align: center; color: var(--text-dim); font-size: 0.82em; margin-block-start: 11px; }

    /* ---------- error ---------- */
    .dn-err {
      display: flex; gap: 12px; align-items: flex-start;
      padding: 15px 18px; border-radius: 15px; margin-block-end: 18px;
      background: color-mix(in srgb, #ff6b6b 12%, var(--surface));
      border: 1px solid color-mix(in srgb, #ff6b6b 34%, var(--border));
    }
    .dn-err b { display: block; font-size: 0.95em; }
    .dn-err p { color: var(--text-dim); font-size: 0.9em; }

    /* ---------- sections ---------- */
    .dn-sec { margin-block-end: 34px; }
    .dn-sec > h2 {
      font-size: 1.2em; font-weight: 800; margin-block-end: 14px;
      display: flex; align-items: center; gap: 12px;
    }
    .dn-sec > h2::after {
      content: ''; flex: 1; height: 1px;
      background: linear-gradient(90deg, var(--border), transparent);
    }
    [dir="rtl"] .dn-sec > h2::after { background: linear-gradient(270deg, var(--border), transparent); }

    .dn-why { display: grid; gap: 11px; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
    .dn-why div {
      display: flex; align-items: flex-start; gap: 13px;
      padding: 16px 18px; border-radius: 16px;
      background: var(--surface); border: 1px solid var(--border);
    }
    .dn-why span { font-size: 1.35em; line-height: 1.5; flex: none; }
    .dn-why p { font-size: 0.92em; }

    .dn-qa { display: grid; gap: 12px; }
    .dn-q {
      padding: 18px 20px; border-radius: 17px;
      background: var(--surface); border: 1px solid var(--border);
      transition: border-color 0.18s ease, transform 0.18s ease;
    }
    .dn-q:hover { border-color: color-mix(in srgb, var(--warm) 30%, var(--border)); transform: translateY(-2px); }
    .dn-q h3 { font-size: 1em; font-weight: 800; line-height: 1.7; }
    .dn-q p { color: var(--text-dim); font-size: 0.93em; margin-block-start: 6px; }

    .dn-other { list-style: none; display: grid; gap: 9px; }
    .dn-other li {
      display: flex; align-items: flex-start; gap: 11px;
      padding: 13px 17px; border-radius: 14px; font-size: 0.93em;
      background: var(--surface); border: 1px solid var(--border);
    }
    .dn-other li::before { content: '💛'; flex: none; }

    /* ---------- thanks ---------- */
    .dn-thanks { text-align: center; padding-block: 40px 20px; }
    .dn-thanks h1 { font-size: clamp(1.7em, 5vw, 2.4em); font-weight: 800; margin-block-start: 18px; }
    .dn-thanks p { color: var(--text-dim); max-width: 52ch; margin-inline: auto; margin-block-start: 12px; }
    .dn-back { display: flex; flex-wrap: wrap; gap: 11px; justify-content: center; margin-block-start: 26px; }
    .dn-back a {
      padding: 12px 22px; border-radius: 15px; text-decoration: none; font-weight: 700; font-size: 0.93em;
      color: var(--text); background: var(--surface-2); border: 1px solid var(--border);
      transition: transform 0.16s ease, border-color 0.16s ease;
    }
    .dn-back a:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--warm) 45%, var(--border)); }

    @media (max-width: 560px) {
      .dn-card { padding: 20px 18px; }
      .dn-jar { width: 80px; height: 80px; font-size: 2.5em; border-radius: 26px; }
    }
    @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
  `
}


// ==========================================
// The form
// ==========================================
function renderForm(p, code, { error = '', amount = '' } = {}) {
  const presets = CONFIG.DONATE.PRESETS_USD
  const selected = amount || String(CONFIG.DONATE.DEFAULT_USD)

  const chips = presets.map(value =>
    '<button type="button" class="dn-chip" data-amount="' + value + '"'
    + ' aria-pressed="' + (String(value) === String(selected) ? 'true' : 'false') + '">'
    + '$' + escapeHtml(String(value)) + '</button>'
  ).join('')

  const errorBox = error ? `
      <div class="dn-err" role="alert">
        <span aria-hidden="true">💔</span>
        <div><b>${escapeHtml(p.errHead)}</b><p>${escapeHtml(error)}</p></div>
      </div>` : ''

  return `
    <section class="dn-card">
      ${errorBox}
      <h2>${escapeHtml(p.amountHead)}</h2>
      <p class="dn-sub">${escapeHtml(p.amountHint)}</p>

      <form method="POST" action="${escapeHtml(localizedPath('/donate/create', code))}">
        <div class="dn-presets" id="dnPresets">${chips}</div>

        <div class="dn-field">
          <label for="dnAmount">${escapeHtml(p.customLabel)}</label>
          <div class="dn-money">
            <span class="dn-cur" aria-hidden="true">$</span>
            <input type="number" id="dnAmount" name="amount" inputmode="decimal"
                   min="${CONFIG.DONATE.MIN_USD}" max="${CONFIG.DONATE.MAX_USD}" step="0.01"
                   value="${escapeHtml(selected)}" required>
          </div>
        </div>

        <div class="dn-field">
          <label for="dnNote">${escapeHtml(p.noteLabel)}</label>
          <input type="text" id="dnNote" name="note" maxlength="${CONFIG.DONATE.MAX_NOTE}"
                 placeholder="${escapeHtml(p.notePlaceholder)}">
          <p class="dn-hint">${escapeHtml(p.noteHint)}</p>
        </div>

        <button type="submit" class="dn-go">${escapeHtml(p.cta)} &rarr;</button>
        <p class="dn-golegend">${escapeHtml(p.ctaHint)}</p>
      </form>
    </section>`
}


function renderWhy(p) {
  const items = p.why.map(entry =>
    '<div><span aria-hidden="true">' + entry.icon + '</span><p>' + escapeHtml(entry.text) + '</p></div>'
  ).join('')
  return `<section class="dn-sec"><h2>${escapeHtml(p.whyHead)}</h2><div class="dn-why">${items}</div></section>`
}


function renderFaq(p) {
  const items = p.faq.map(entry =>
    '<article class="dn-q"><h3>' + escapeHtml(entry.q) + '</h3><p>' + escapeHtml(entry.a) + '</p></article>'
  ).join('')
  return `<section class="dn-sec"><h2>${escapeHtml(p.faqHead)}</h2><div class="dn-qa">${items}</div></section>`
}


function renderOther(p) {
  const items = p.other.map(text => '<li>' + escapeHtml(text) + '</li>').join('')
  return `<section class="dn-sec"><h2>${escapeHtml(p.otherHead)}</h2><ul class="dn-other">${items}</ul></section>`
}


// The presets and the number field are two views of one value, so
// each writes to the other. No framework and no fetch: the form is
// an ordinary POST and works with this script blocked entirely.
function donateScript() {
  return `<script>
    (function () {
      var input = document.getElementById('dnAmount');
      var box = document.getElementById('dnPresets');
      if (!input || !box) return;

      var chips = box.querySelectorAll('.dn-chip');

      function sync() {
        Array.prototype.forEach.call(chips, function (chip) {
          var same = Number(chip.getAttribute('data-amount')) === Number(input.value);
          chip.setAttribute('aria-pressed', same ? 'true' : 'false');
        });
      }

      Array.prototype.forEach.call(chips, function (chip) {
        chip.addEventListener('click', function () {
          input.value = chip.getAttribute('data-amount');
          sync();
        });
      });

      input.addEventListener('input', sync);
      sync();
    })();
  </script>`
}


// ==========================================
// Page
// ==========================================
function createDonatePage(lang, theme, { error = '', amount = '' } = {}) {
  const code = resolveLang(lang)
  const p = pack(code)
  const site = NAV_I18N[code]
  const themeAttr = theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : ''

  const trail = [
    { href: '/', label: site.home },
    { href: '/donate', label: p.breadcrumb }
  ]

  const graph = [
    breadcrumbLd(trail, code),
    faqPageLd(p.faq.map(entry => ({ q: entry.q, a: entry.a })))
  ]

  return `<!DOCTYPE html>
<html dir="${dirFor(code)}" lang="${code}"${themeAttr}>
<head>
  ${getPageHead({ title: p.metaTitle, amirLogo: CONFIG.AMIR_LOGO, description: p.metaDesc })}
  ${seoHead({
    path: '/donate',
    title: p.metaTitle,
    description: p.metaDesc,
    lang: code,
    keywords: p.keywords || [],
    graph
  })}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap"></noscript>
  ${themeBootScript()}
  <style>${siteNavCss()}${donateCss()}</style>
</head>
<body>
  ${siteHeader({ lang: code, accent: '#ff8fb1' })}
  <div class="wrap">
    ${siteBreadcrumb({ lang: code, trail })}
    <main id="main">
      <header class="dn-hero">
        <div class="dn-jar" aria-hidden="true">🫙</div>
        <span class="dn-hi">${escapeHtml(p.hi)}</span>
        <h1>${escapeHtml(p.title)}</h1>
        <p class="dn-intro">${escapeHtml(p.intro)}</p>
      </header>
      ${renderForm(p, code, { error, amount })}
      ${renderWhy(p)}
      ${renderFaq(p)}
      ${renderOther(p)}
    </main>
    ${siteFooter({ lang: code })}
  </div>
  ${siteBackToTop({ lang: code })}
  ${donateScript()}
  ${siteChromeScript()}
</body>
</html>`
}


// ==========================================
// The handoff
//
// A page, not a 303, and the reason is this site's own
// Content-Security-Policy: `form-action 'self'`.
//
// That directive governs where a form may submit. Browsers
// currently check only the address the form posts to and not where
// that address then redirects - so a 303 from here to the payment
// provider does work today, in every browser, by the grace of an
// unfinished corner of the spec. The spec's own position is that
// redirects should be checked, and the day a browser implements
// that is the day every donation stops at a blank page.
//
// The licence checkout never had this problem because it hands
// over from JavaScript, which `form-action` does not govern. This
// does the same thing and adds the part that page cannot have: a
// real link, so the handoff still completes with scripting off.
// ==========================================
function createHandoffPage(lang, theme, payUrl) {
  const code = resolveLang(lang)
  const p = pack(code)
  const themeAttr = theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : ''

  return `<!DOCTYPE html>
<html dir="${dirFor(code)}" lang="${code}"${themeAttr}>
<head>
  ${getPageHead({ title: p.handoffTitle + ' — AmirCollider', amirLogo: CONFIG.AMIR_LOGO })}
  <meta name="robots" content="noindex, nofollow">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap"></noscript>
  ${themeBootScript()}
  <style>${siteNavCss()}${donateCss()}</style>
</head>
<body>
  <div class="wrap">
    <main id="main" class="dn-thanks">
      <div class="dn-jar" aria-hidden="true">🔐</div>
      <h1>${escapeHtml(p.handoffTitle)}</h1>
      <p>${escapeHtml(p.handoffBody)}</p>
      <div class="dn-back">
        <a href="${escapeHtml(payUrl)}" rel="noopener">${escapeHtml(p.handoffCta)} &rarr;</a>
      </div>
    </main>
  </div>
  <script>
    (function () {
      // Replace rather than assign: the back button should return
      // to the donate page, not to this one, which would bounce
      // the donor straight back out again.
      window.location.replace(${JSON.stringify(payUrl)});
    })();
  </script>
</body>
</html>`
}


function createThanksPage(lang, theme) {
  const code = resolveLang(lang)
  const p = pack(code)
  const themeAttr = theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : ''

  return `<!DOCTYPE html>
<html dir="${dirFor(code)}" lang="${code}"${themeAttr}>
<head>
  ${getPageHead({ title: p.thanksTitle + ' — AmirCollider', amirLogo: CONFIG.AMIR_LOGO })}
  ${seoHead({
    path: '/donate/thanks',
    title: p.thanksTitle,
    lang: code,
    noindex: true,
    alternates: false
  })}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap"></noscript>
  ${themeBootScript()}
  <style>${siteNavCss()}${donateCss()}</style>
</head>
<body>
  ${siteHeader({ lang: code, accent: '#ff8fb1' })}
  <div class="wrap">
    <main id="main" class="dn-thanks">
      <div class="dn-jar" aria-hidden="true">🎁</div>
      <h1>${escapeHtml(p.thanksTitle)}</h1>
      <p>${escapeHtml(p.thanksBody)}</p>
      <p>${escapeHtml(p.thanksNote)}</p>
      <div class="dn-back">
        <a href="${escapeHtml(localizedPath('/', code))}">${escapeHtml(p.backHome)}</a>
        <a href="${escapeHtml(localizedPath('/about', code))}">${escapeHtml(p.backAbout)}</a>
      </div>
    </main>
    ${siteFooter({ lang: code })}
  </div>
  ${siteChromeScript()}
</body>
</html>`
}


// ==========================================
// Handlers
// ==========================================
export async function handleDonate(url, request) {
  const cookies = parseCookies(request)
  const lang = resolveRequestLang(url, request, cookies)
  const theme = resolveRequestTheme(cookies)

  return createHtmlResponse(createDonatePage(lang, theme), 200, langCookieHeader(url, lang))
}


export async function handleDonateThanks(url, request) {
  const cookies = parseCookies(request)
  const lang = resolveRequestLang(url, request, cookies)
  const theme = resolveRequestTheme(cookies)

  return createHtmlResponse(createThanksPage(lang, theme), 200, langCookieHeader(url, lang))
}


// ==========================================
// POST /donate/create
//
// Validate, open an invoice, hand over. Every refusal re-renders
// the page with the message attached and the amount the donor
// typed still in the field - a form that clears itself on an error
// is a form people give up on.
//
// The redirect is a 303: the browser must follow it with a GET, or
// the donor's back button replays a POST at the payment provider.
// ==========================================
export async function handleDonateCreate(url, request, gameId, requestId, GAMES, env) {
  const cookies = parseCookies(request)
  const lang = resolveRequestLang(url, request, cookies)
  const theme = resolveRequestTheme(cookies)
  const p = pack(lang)

  const refuse = (message, amount = '') => createHtmlResponse(
    createDonatePage(lang, theme, { error: message, amount }),
    // 200, not 4xx. This is a re-rendered form, and a browser that
    // is told the page failed treats the history entry differently.
    200,
    langCookieHeader(url, lang)
  )

  let form
  try {
    form = await request.formData()
  } catch {
    return refuse(p.errAmount.replace('{min}', CONFIG.DONATE.MIN_USD).replace('{max}', CONFIG.DONATE.MAX_USD))
  }

  const raw = form.get('amount')
  const amount = parseAmount(raw)
  if (!amount) {
    return refuse(
      p.errAmount.replace('{min}', CONFIG.DONATE.MIN_USD).replace('{max}', CONFIG.DONATE.MAX_USD),
      String(raw || '')
    )
  }

  if (rateLimited(clientIp(request))) {
    logWarning('Donation rate limited', { requestId })
    return refuse(p.errBusy, amount)
  }

  if (!isConfigured(env)) {
    logWarning('Donation attempted with no payment provider configured', { requestId })
    return refuse(p.errUnavailable, amount)
  }

  const note = parseNote(form.get('note'))
  const code = resolveLang(lang)

  // The order id is the only thing tying this invoice to anything,
  // and it exists purely so the provider's dashboard is readable.
  // Nothing on this side ever looks it up.
  const orderId = 'donation-' + Date.now().toString(36) + '-'
    + Math.random().toString(36).slice(2, 8)

  const invoice = await createInvoice(env, {
    orderId,
    statusToken: '',
    tier: 'donation',
    priceUsd: amount,
    lang: code,
    description: note ? 'Donation to AmirCollider — ' + note : 'Donation to AmirCollider',
    siteUrl: CONFIG.SITE_URL,
    // Nothing here consumes a callback, so the provider is not
    // given one. An IPN endpoint that only logs is an unauthenticated
    // POST route kept alive for no reason.
    webhookPath: '',
    // Passed whole rather than as a path, because the checkout's
    // default carries a signed order handle in the query and a
    // donation has no order to hand back.
    successUrl: CONFIG.SITE_URL + localizedPath('/donate/thanks', code),
    cancelUrl: CONFIG.SITE_URL + localizedPath('/donate', code)
  })

  if (!invoice.ok) {
    logWarning('Donation invoice could not be opened', { requestId, error: invoice.error })
    return refuse(p.errUnavailable, amount)
  }

  logInfo('Donation invoice opened', { requestId, orderId, amount })

  return createHtmlResponse(
    createHandoffPage(lang, theme, invoice.payUrl),
    200,
    { 'Cache-Control': 'no-store', ...langCookieHeader(url, lang) }
  )
}
