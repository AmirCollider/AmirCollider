// ==========================================
// pages/unityDocSnap.js
// The Unity DocSnap product page: what the tool does,
// what Free includes, what Pro adds, and the buy button.
//
// Public entry:
//   handleUnityDocSnap(url, request, gameId, requestId, GAMES, env)
//
// Served at /unity-docsnap (and /docsnap), and linked from
// three places inside the Unity Editor itself, so it is the
// page a person lands on at the exact moment they wanted a
// locked feature. That shapes the whole layout:
//
//   • What the tool DOES comes before what it costs.
//     Somebody arriving from the Editor already has it
//     installed; somebody arriving cold has never seen it,
//     and a price above an unexplained product is a bounce.
//
//   • The comparison table is honest in both directions. It
//     lists what Free keeps as prominently as what Pro adds,
//     because a table that only shows locks reads as a
//     crippled demo - and the free edition genuinely is the
//     whole exporter.
//
//   • One price, stated plainly, with "one-off" next to it.
//     The single most common question about a paid dev tool
//     is whether it is a subscription.
//
// Trilingual and theme-aware like every other page here:
// language resolves ?lang= -> cookie -> Accept-Language, and
// switching reloads so RTL/LTR is always correct.
// ==========================================

import { CONFIG } from '../config.js'
import { getPageHead } from '../shared-styles.js'
import { createHtmlResponse } from '../utils.js'

const DEFAULT_LANG = 'fa'
const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

const PRICE = CONFIG.DOCSNAP.PRICE_USD
const BUY_URL = CONFIG.DOCSNAP.BUY_URL
const REPO_URL = CONFIG.DOCSNAP.REPO_URL


// ==========================================
// i18n
// One pack per language. Every string the page renders is
// here; nothing is written inline in the markup, so adding
// a language is one object and translating is one file.
// ==========================================
const I18N = {
  fa: {
    locale: 'fa-IR',
    dir: 'rtl',
    langName: 'فارسی',

    title: 'Unity DocSnap',
    tagline: 'کل پروژه‌ی یونیتی‌ات را بکن یک وب‌سایت آفلاین — برای آدم‌ها و برای هوش مصنوعی.',
    lede: 'هر سین را می‌گردد — هر گیم‌آبجکت، هر کامپوننت، هر فیلد، هر رفرنس — و هر پوشه‌ی اسست را با تنظیمات ایمپورتش، و همه را می‌پزد توی یک سایت HTML تمیز که با دابل‌کلیک باز می‌شود. بدون سرور، بدون بیلد.',
    ctaBuy: 'خرید Pro',
    ctaFree: 'نسخه‌ی رایگان را بگیر',
    priceNote: 'خرید یک‌باره · یک سیستم · بدون اشتراک ماهانه',

    sectionWhat: 'چه‌کار می‌کند',
    sectionCompare: 'رایگان یا Pro',
    sectionSpotlight: 'برگ برنده‌ی Pro',
    sectionPricing: 'قیمت',
    sectionFaq: 'سؤال‌های پرتکرار',

    colFeature: 'قابلیت',
    colFree: 'رایگان',
    colPro: 'Pro',

    freeHeading: 'نسخه‌ی رایگان کامل است',
    freeBody: 'کل اکسپورتر توی نسخه‌ی رایگان است: همه‌ی سین‌ها، همه‌ی کامپوننت‌ها، همه‌ی فیلدهای سریالایزشده، گزارش سلامت پروژه، صفحه‌ی پکیج‌ها، جست‌وجو، هر دو ظاهر و هر سه زبان. هیچ کدی هم نمی‌خواهد — نصب کن و کار کن.',

    spotlightTitle: 'یک فایل، کل پروژه، آماده‌ی دستیار هوش مصنوعی',
    spotlightBody: 'نسخه‌ی Pro کنار سایت HTML، یک پوشه‌ی summary/ می‌نویسد: خلاصه‌ی کوتاه و ساختارمند هر سین و هر پوشه، هم مارک‌داون هم جیسون. و ai-bundle.md همه‌شان را می‌کند یک سند. یعنی به‌جای چهل تا اسکرین‌شات یا نصف ساعت توضیح دادن، یک پیست.',

    buyTitle: 'Unity DocSnap Pro',
    buyEvery: 'هرچه در نسخه‌ی رایگان هست، به‌علاوه:',
    buyCta: 'خرید — ' + '$' + PRICE,
    buyFine: 'کد فوراً بعد از پرداخت تحویل داده می‌شود. روی یک سیستم فعال می‌شود و هر وقت خواستی خودت می‌توانی آزادش کنی و ببری روی سیستم دیگر.',
    haveKey: 'کد دارم',

    faq: [
      ['اشتراک ماهانه است؟',
       'نه. یک بار می‌خری و مال خودت است. بروزرسانی‌های ۱.x رایگان است.'],
      ['روی چند سیستم کار می‌کند؟',
       'هر کد روی یک سیستم فعال می‌شود. اگر سیستمت را عوض کردی، از داخل خود یونیتی یا از صفحه‌ی لایسنس همین سایت آزادش کن و روی سیستم جدید فعالش کن — بدون ایمیل زدن به کسی.'],
      ['اگر اینترنت نداشته باشم چه؟',
       'بعد از یک بار فعال‌سازی، ۴۵ روز کاملاً آفلاین کار می‌کند و هر وقت آنلاین شدی خودش بی‌صدا تمدید می‌شود. هیچ چک لایسنسی سر راه اکسپورت نیست.'],
      ['نسخه‌ی رایگان چیزی از پروژه‌ام را جایی می‌فرستد؟',
       'نه. نسخه‌ی رایگان اصلاً به اینترنت وصل نمی‌شود. نسخه‌ی Pro هم فقط موقع فعال‌سازی و تمدید یک درخواست می‌فرستد که فقط شامل کد لایسنس، یک شناسه‌ی هش‌شده‌ی سیستم و شماره‌ی نسخه است — هیچ‌چیزی از پروژه‌ات.'],
      ['روی CI کار می‌کند؟',
       'بله، با نسخه‌ی Pro: هم DocSnapAPI از C# و هم ‎-executeMethod از خط فرمان، با خروجی غیرصفر وقتی اکسپورت شکست بخورد.'],
      ['چه نسخه‌ای از یونیتی؟',
       'یونیتی ۲۰۲۱.۳ به بالا، شامل Unity 6. بدون هیچ وابستگی جانبی، و کاملاً Editor-only — نه چیزی به بیلدت اضافه می‌کند نه هزینه‌ی رانتایم دارد.']
    ],

    footerBack: 'بازگشت به AmirCollider'
  },

  en: {
    locale: 'en-US',
    dir: 'ltr',
    langName: 'English',

    title: 'Unity DocSnap',
    tagline: 'Snap your whole Unity project into an offline website — for humans and AI alike.',
    lede: 'It walks every Scene — every GameObject, every Component, every field, every reference — and every Asset folder with its import settings, then bakes all of it into a clean HTML site you open by double-clicking. No server, no build step.',
    ctaBuy: 'Get Pro',
    ctaFree: 'Get the free edition',
    priceNote: 'One-off purchase · one machine · no subscription',

    sectionWhat: 'What it does',
    sectionCompare: 'Free or Pro',
    sectionSpotlight: 'The Pro headline',
    sectionPricing: 'Pricing',
    sectionFaq: 'Common questions',

    colFeature: 'Feature',
    colFree: 'Free',
    colPro: 'Pro',

    freeHeading: 'The free edition is the whole exporter',
    freeBody: 'Every Scene, every Component, every serialized field, the project health report, the packages page, search, both skins and all three languages — all in Free, and it needs no key at all. Install it and export.',

    spotlightTitle: 'One file, your whole project, ready for an AI assistant',
    spotlightBody: 'Alongside the HTML site, Pro writes a summary/ folder: a short, structured summary of every Scene and folder in both Markdown and JSON. ai-bundle.md concatenates all of them into one document — so handing a whole project to an assistant is one paste instead of forty screenshots or half an hour of explaining.',

    buyTitle: 'Unity DocSnap Pro',
    buyEvery: 'Everything in Free, plus:',
    buyCta: 'Buy — $' + PRICE,
    buyFine: 'Your key is delivered the moment payment clears. It activates on one machine, and you can release it yourself any time to move to another.',
    haveKey: 'I have a key',

    faq: [
      ['Is it a subscription?',
       'No. Buy once, keep it. All 1.x updates are included.'],
      ['How many machines?',
       'One machine per key. Moving to a new computer is self-service — release the old machine from inside Unity or from the licence page on this site, then activate the new one. No email to anybody.'],
      ['What if I am offline?',
       'After one activation it works fully offline for 45 days and renews itself quietly whenever you happen to be online. There is never a licence check in front of an export.'],
      ['Does anything leave my project?',
       'No. The free edition never touches the network at all. Pro sends one request when activating or renewing, containing only the licence key, a hashed machine identifier and the package version — nothing about your project.'],
      ['Does it run in CI?',
       'Yes, with Pro: DocSnapAPI from C# and -executeMethod from a command line, with a non-zero exit when an export fails.'],
      ['Which Unity versions?',
       'Unity 2021.3 LTS and newer, including Unity 6. No third-party dependencies, and entirely Editor-only — it adds nothing to your build and costs nothing at runtime.']
    ],

    footerBack: 'Back to AmirCollider'
  },

  ja: {
    locale: 'ja-JP',
    dir: 'ltr',
    langName: '日本語',

    title: 'Unity DocSnap',
    tagline: 'Unity プロジェクト全体を、オフラインの Web サイトに。人にも AI にも読める形で。',
    lede: 'すべてのシーン(GameObject、コンポーネント、フィールド、参照)と、すべてのアセットフォルダのインポート設定を走査し、ダブルクリックで開ける HTML サイトに焼き込みます。サーバーもビルド手順も不要です。',
    ctaBuy: 'Pro を購入',
    ctaFree: '無料版を入手',
    priceNote: '買い切り · 1 台まで · サブスクリプションなし',

    sectionWhat: 'できること',
    sectionCompare: '無料版と Pro',
    sectionSpotlight: 'Pro の目玉',
    sectionPricing: '価格',
    sectionFaq: 'よくある質問',

    colFeature: '機能',
    colFree: '無料版',
    colPro: 'Pro',

    freeHeading: '無料版でエクスポーターのすべてが使えます',
    freeBody: 'すべてのシーン、コンポーネント、シリアライズフィールド、プロジェクトのヘルスレポート、パッケージページ、検索、2 つのスキン、3 言語 — すべて無料版に含まれます。キーも不要で、インストールすればすぐ使えます。',

    spotlightTitle: '1 ファイルで、プロジェクト全体を AI に渡せる',
    spotlightBody: 'Pro は HTML サイトに加えて summary/ フォルダを出力します。各シーンとフォルダの短く構造化された要約を Markdown と JSON の両方で書き出し、ai-bundle.md がそれらを 1 つの文書にまとめます。スクリーンショットを何十枚も送ったり 30 分かけて説明したりする代わりに、1 回の貼り付けで済みます。',

    buyTitle: 'Unity DocSnap Pro',
    buyEvery: '無料版のすべてに加えて:',
    buyCta: '購入 — $' + PRICE,
    buyFine: '決済完了と同時にキーが届きます。1 台で有効化でき、別のマシンへはいつでも自分で移せます。',
    haveKey: 'キーを持っています',

    faq: [
      ['サブスクリプションですか?',
       'いいえ。買い切りです。1.x のアップデートはすべて含まれます。'],
      ['何台まで使えますか?',
       'キー 1 つにつき 1 台です。買い替え時は Unity 内またはこのサイトのライセンスページから自分で解除し、新しいマシンで有効化できます。問い合わせは不要です。'],
      ['オフラインでも使えますか?',
       '一度有効化すれば 45 日間完全にオフラインで動作し、オンラインになったタイミングで自動的に更新されます。エクスポートの前にライセンス確認が入ることはありません。'],
      ['プロジェクトの情報は送信されますか?',
       'いいえ。無料版はネットワークに一切接続しません。Pro も有効化と更新のときにライセンスキー、ハッシュ化されたマシン識別子、パッケージのバージョンだけを送信します。プロジェクトの情報は一切含まれません。'],
      ['CI で使えますか?',
       'はい、Pro でご利用いただけます。C# からの DocSnapAPI と、コマンドラインからの -executeMethod に対応し、失敗時は非ゼロで終了します。'],
      ['対応する Unity のバージョンは?',
       'Unity 2021.3 LTS 以降(Unity 6 を含む)。サードパーティ依存はなく、完全に Editor 専用なので、ビルドサイズもランタイムコストも増えません。']
    ],

    footerBack: 'AmirCollider に戻る'
  }
}


// ==========================================
// Feature rows
// The comparison table as data, in one place, so the page
// and the tool cannot drift apart. Order matches
// DocSnapProPitch.Lines in the Unity package - somebody
// who read the panel inside the Editor and then clicked
// through should find the same list in the same order,
// not a rearranged one they have to re-read.
//
// `free` is a tri-state: true (included), false (Pro only),
// or a string (included, with a caveat worth stating).
// ==========================================
const ROWS = [
  {
    free: true, pro: true,
    label: {
      fa: 'سایت آفلاین کامل — سلسله‌مراتب، اینسپکتور، رفرنس‌ها',
      en: 'The full offline site — hierarchy, Inspector, references',
      ja: 'オフラインサイト一式 — 階層、インスペクター、参照'
    }
  },
  {
    free: true, pro: true,
    label: {
      fa: 'گزارش سلامت پروژه (اسکریپت‌های گم‌شده، رفرنس‌های شکسته)',
      en: 'Project health report (missing scripts, broken references)',
      ja: 'プロジェクトのヘルスレポート(欠落スクリプト、壊れた参照)'
    }
  },
  {
    free: true, pro: true,
    label: {
      fa: 'جست‌وجو، صفحه‌ی پکیج‌ها، تم روشن/تاریک، هر دو ظاهر، سه زبان',
      en: 'Search, packages page, light/dark, both skins, three languages',
      ja: '検索、パッケージページ、ライト/ダーク、2 つのスキン、3 言語'
    }
  },
  {
    free: false, pro: true, star: true,
    label: {
      fa: '🤖 خروجی آماده‌ی AI — ‎summary/‎ و ai-bundle.md',
      en: '🤖 AI-ready summaries — summary/ and ai-bundle.md',
      ja: '🤖 AI 向けサマリー — summary/ と ai-bundle.md'
    }
  },
  {
    free: false, pro: true,
    label: {
      fa: '🔁 صفحه‌ی تغییرات — دیف بین دو خروجی',
      en: '🔁 Changes page — diff between two exports',
      ja: '🔁 変更ページ — 2 つのエクスポートの差分'
    }
  },
  {
    free: { fa: '۳ اسنپ‌شات', en: '3 snapshots', ja: '3 件まで' }, pro: true,
    label: {
      fa: '📚 تاریخچه‌ی نسخه‌ها',
      en: '📚 Version history',
      ja: '📚 バージョン履歴'
    }
  },
  {
    free: false, pro: true,
    label: {
      fa: '⚡ بروزرسانی افزایشی — فقط سین‌های تغییرکرده دوباره اسکن می‌شوند',
      en: '⚡ Incremental updates — only changed Scenes are re-scanned',
      ja: '⚡ 差分更新 — 変更されたシーンだけを再スキャン'
    }
  },
  {
    free: false, pro: true,
    label: {
      fa: '🤖 اتوماسیون CI — ‎DocSnapAPI و ‎-executeMethod',
      en: '🤖 CI automation — DocSnapAPI and -executeMethod',
      ja: '🤖 CI 自動化 — DocSnapAPI と -executeMethod'
    }
  },
  {
    free: false, pro: true,
    label: {
      fa: '📁 کپی خود فایل‌ها در source-files/',
      en: '📁 Real file copies in source-files/',
      ja: '📁 ファイル本体を source-files/ にコピー'
    }
  },
  {
    free: false, pro: true,
    label: {
      fa: '📦 بک‌آپ ‎.unitypackage از کل پروژه',
      en: '📦 Whole-project .unitypackage backup',
      ja: '📦 プロジェクト全体の .unitypackage バックアップ'
    }
  },
  {
    free: false, pro: true,
    label: {
      fa: '✨ لوگوی خودت، بدون بَج «نسخه‌ی رایگان»',
      en: '✨ Your own logo, no “free edition” badge',
      ja: '✨ 自社ロゴ、「無料版」バッジなし'
    }
  }
]


// ==========================================
// What-it-does cards
// The product itself, before any mention of editions. A
// reader arriving cold needs this; a reader arriving from
// the Editor scrolls past it in a second.
// ==========================================
const WHAT = [
  {
    icon: '🌳',
    title: { fa: 'کل سلسله‌مراتب', en: 'The whole hierarchy', ja: '階層のすべて' },
    body: {
      fa: 'هر گیم‌آبجکت، دقیقاً همان‌طور که توی پنجره‌ی Hierarchy نشسته، با تگ و لایه و وضعیت فعال بودنش.',
      en: 'Every GameObject, nested exactly as it sits in the Hierarchy window, with its tag, layer and active state.',
      ja: 'Hierarchy ウィンドウと同じ入れ子構造で、タグ・レイヤー・アクティブ状態まで含めて出力します。'
    }
  },
  {
    icon: '🔗',
    title: { fa: 'رفرنس‌های واقعی', en: 'Real connections', ja: '実際のつながり' },
    body: {
      fa: 'وقتی یک اسکریپت به یک آبجکت یا پریفب رفرنس می‌دهد، توی خروجی یک لینک قابل کلیک می‌شود — پس می‌شود دنبال کرد که سین چطور سیم‌کشی شده.',
      en: 'When a script references another GameObject or Prefab, that becomes a clickable link — so you can trace exactly how a Scene is wired.',
      ja: 'スクリプトが他の GameObject や Prefab を参照していると、出力ではクリック可能なリンクになり、シーンの配線をたどれます。'
    }
  },
  {
    icon: '🩺',
    title: { fa: 'و می‌گوید کجا خراب است', en: 'And where it is broken', ja: '壊れている箇所も分かる' },
    body: {
      fa: 'هر اسکریپت گم‌شده و هر رفرنس شکسته، با مسیر دقیق آبجکت و نام فیلدی که رویش نشسته — و جدا کرده که کدامش تقصیر خودت است و کدامش مال پکیج‌ها.',
      en: 'Every missing script and broken reference, with the exact object path and the field holding it — and separated so you can see which are yours to fix.',
      ja: '欠落したスクリプトや壊れた参照を、オブジェクトのパスと該当フィールドまで特定。自分の担当分とパッケージ由来を分けて表示します。'
    }
  },
  {
    icon: '🧩',
    title: { fa: 'صفر هزینه‌ی رانتایم', en: 'Zero runtime cost', ja: 'ランタイムコストゼロ' },
    body: {
      fa: 'کاملاً داخل یک اسمبلی Editor زندگی می‌کند. نه چیزی به بیلدت اضافه می‌کند، نه وابستگی جانبی دارد.',
      en: 'Lives entirely inside an Editor assembly. Nothing is added to your build, and there are no third-party dependencies.',
      ja: '完全に Editor アセンブリ内で完結します。ビルドには何も追加されず、サードパーティ依存もありません。'
    }
  }
]


// ==========================================
// Request helpers
// Same resolution order as the dashboard, so a language
// chosen there is still in force here.
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

function resolveLang(url, request, cookies) {
  const fromQuery = url && url.searchParams ? url.searchParams.get('lang') : null
  if (fromQuery && I18N[fromQuery]) return fromQuery
  if (cookies.lang && I18N[cookies.lang]) return cookies.lang
  return langFromAcceptHeader(request) || DEFAULT_LANG
}

function resolveTheme(cookies) {
  return cookies.theme === 'light' || cookies.theme === 'dark' ? cookies.theme : null
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}


// ==========================================
// Partials
// ==========================================
function renderTopbar(lang) {
  const buttons = Object.keys(I18N).map(code =>
    '<button type="button" onclick="dsLang(\'' + code + '\')" lang="' + code + '"'
    + ' aria-pressed="' + (code === lang ? 'true' : 'false') + '">'
    + escapeHtml(I18N[code].langName) + '</button>'
  ).join('')

  return `
    <div class="topbar">
      <a class="brand" href="/">
        <img src="${escapeHtml(CONFIG.AMIR_LOGO)}" alt="" onerror="this.style.display='none'">
        <span>AmirCollider</span>
      </a>
      <div class="controls">
        <div class="seg" role="group">${buttons}</div>
        <button type="button" class="icon-btn" onclick="dsTheme()" aria-label="Theme">◐</button>
      </div>
    </div>`
}

function renderHero(p) {
  return `
    <header class="hero">
      <div class="logo">🧋</div>
      <h1>${escapeHtml(p.title)}</h1>
      <p class="tagline">${escapeHtml(p.tagline)}</p>
      <p class="lede">${escapeHtml(p.lede)}</p>
      <div class="cta">
        <a class="btn" href="${escapeHtml(BUY_URL)}" rel="noopener">${escapeHtml(p.ctaBuy)} — $${escapeHtml(PRICE)}</a>
        <a class="btn ghost" href="${escapeHtml(REPO_URL)}" rel="noopener">${escapeHtml(p.ctaFree)}</a>
      </div>
      <p class="fine">${escapeHtml(p.priceNote)}</p>
    </header>`
}

function renderWhat(p, lang) {
  const cards = WHAT.map(item => `
    <div class="card">
      <div class="card-ic">${item.icon}</div>
      <h3>${escapeHtml(item.title[lang])}</h3>
      <p>${escapeHtml(item.body[lang])}</p>
    </div>`).join('')

  return `
    <h2 class="section">${escapeHtml(p.sectionWhat)}</h2>
    <div class="grid">${cards}</div>`
}

// ==========================================
// renderCompare
// The table, plus the paragraph under it that says what
// Free keeps.
//
// That paragraph is not decoration. A column of crosses is
// the single most discouraging thing a comparison table can
// do to a free tier, and this free tier is genuinely the
// whole exporter - somebody who closes the page believing
// otherwise never installs it, and somebody who never
// installs it never buys.
// ==========================================
function renderCompare(p, lang) {
  const cell = value => {
    if (value === true) return '<td class="yes">✓</td>'
    if (value === false) return '<td class="no">—</td>'
    return '<td class="partial">' + escapeHtml(value[lang]) + '</td>'
  }

  const rows = ROWS.map(row => `
    <tr${row.star ? ' class="star"' : ''}>
      <th scope="row">${escapeHtml(row.label[lang])}</th>
      ${cell(row.free)}
      ${cell(row.pro)}
    </tr>`).join('')

  return `
    <h2 class="section">${escapeHtml(p.sectionCompare)}</h2>
    <div class="table-scroll">
      <table class="compare">
        <thead>
          <tr>
            <th scope="col">${escapeHtml(p.colFeature)}</th>
            <th scope="col">${escapeHtml(p.colFree)}</th>
            <th scope="col">${escapeHtml(p.colPro)}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="card free-note">
      <h3>${escapeHtml(p.freeHeading)}</h3>
      <p>${escapeHtml(p.freeBody)}</p>
    </div>`
}

// ==========================================
// renderSpotlight
// The AI outputs, given their own block with a sample of
// the actual folder.
//
// It is the one Pro feature that is hard to picture from a
// table row, and it is the reason most people upgrade, so
// it gets shown rather than described. The tree is real
// output, which is why it is worth the space.
// ==========================================
function renderSpotlight(p) {
  return `
    <h2 class="section">${escapeHtml(p.sectionSpotlight)}</h2>
    <div class="spotlight">
      <div>
        <h3>${escapeHtml(p.spotlightTitle)}</h3>
        <p>${escapeHtml(p.spotlightBody)}</p>
      </div>
      <pre class="tree" dir="ltr"><code>summary/
├── ai-bundle.md          <span class="c">← everything below, in one paste</span>
├── scene-MainMenu.md
├── scene-MainMenu.json
├── folder-Art_Textures.md
└── folder-Art_Textures.json</code></pre>
    </div>`
}

function renderPricing(p, lang) {
  const included = ROWS.filter(r => r.free === false)
    .map(r => '<li>' + escapeHtml(r.label[lang]) + '</li>').join('')

  return `
    <h2 class="section">${escapeHtml(p.sectionPricing)}</h2>
    <div class="price-card">
      <div class="price-head">
        <h3>${escapeHtml(p.buyTitle)}</h3>
        <div class="price"><span class="cur">$</span>${escapeHtml(PRICE)}</div>
        <p class="fine">${escapeHtml(p.priceNote)}</p>
      </div>
      <p class="plus">${escapeHtml(p.buyEvery)}</p>
      <ul class="incl">${included}</ul>
      <a class="btn wide" href="${escapeHtml(BUY_URL)}" rel="noopener">${escapeHtml(p.buyCta)}</a>
      <p class="fine">${escapeHtml(p.buyFine)}</p>
      <a class="quiet" href="/license">${escapeHtml(p.haveKey)} →</a>
    </div>`
}

function renderFaq(p) {
  const items = p.faq.map(([q, a]) => `
    <details class="faq">
      <summary>${escapeHtml(q)}</summary>
      <p>${escapeHtml(a)}</p>
    </details>`).join('')

  return `
    <h2 class="section">${escapeHtml(p.sectionFaq)}</h2>
    ${items}`
}


// ==========================================
// Page
// ==========================================
function renderPage(lang, theme) {
  const p = I18N[lang]
  const themeAttr = theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : ''

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${p.dir}"${themeAttr}>
<head>
  ${getPageHead({
    title: p.title + ' — ' + p.tagline,
    amirLogo: CONFIG.AMIR_LOGO,
    description: escapeHtml(p.lede)
  })}
  <link rel="canonical" href="${CONFIG.SITE_URL}/unity-docsnap">
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
    ${renderTopbar(lang)}
    ${renderHero(p)}
    ${renderWhat(p, lang)}
    ${renderCompare(p, lang)}
    ${renderSpotlight(p)}
    ${renderPricing(p, lang)}
    ${renderFaq(p)}
    <footer>
      <a href="/">${escapeHtml(p.footerBack)}</a>
      <span>·</span>
      <a href="${escapeHtml(REPO_URL)}" rel="noopener">GitHub</a>
      <span>·</span>
      <a href="/license">${escapeHtml(p.haveKey)}</a>
    </footer>
  </div>
  <script>${script()}</script>
</body>
</html>`
}


function css() {
  return `
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    html { scrollbar-width: none; -ms-overflow-style: none; scroll-behavior: smooth; }
    html::-webkit-scrollbar { width: 0; height: 0; display: none; }

    :root {
      --brand: #6c63ff; --brand-2: #a78bfa;
      --ok: #4caf50; --gold: #ffb703;
      --radius: 18px; --maxw: 940px;
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
        radial-gradient(1100px 520px at 78% -8%, color-mix(in srgb, var(--brand) 22%, transparent), transparent 60%),
        radial-gradient(900px 480px at 8% 6%, color-mix(in srgb, var(--brand-2) 16%, transparent), transparent 60%),
        linear-gradient(160deg, var(--bg-1), var(--bg-2));
      background-attachment: fixed;
    }
    .wrap { max-width: var(--maxw); margin-inline: auto; }

    /* ---------- top bar ---------- */
    .topbar { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; }
    .brand { display: flex; align-items: center; gap: 10px; color: var(--text); text-decoration: none; font-weight: 800; }
    .brand img { width: 34px; height: 34px; border-radius: 10px; object-fit: cover; }
    .controls { display: flex; gap: 10px; align-items: center; }
    .seg { display: inline-flex; gap: 2px; padding: 3px; border-radius: 12px; background: var(--surface); border: 1px solid var(--border); }
    .seg button {
      border: 0; cursor: pointer; padding: 6px 11px; border-radius: 9px; font: inherit;
      font-size: 0.82em; font-weight: 600; color: var(--text-dim); background: transparent;
    }
    .seg button[aria-pressed="true"] {
      color: #fff; background: linear-gradient(135deg, var(--brand), var(--brand-2));
    }
    .icon-btn {
      width: 36px; height: 36px; border-radius: 11px; cursor: pointer; font-size: 1.1em;
      color: var(--text); background: var(--surface); border: 1px solid var(--border);
    }

    /* ---------- hero ---------- */
    .hero { text-align: center; padding-block: 44px 30px; }
    .hero .logo { font-size: 3.2em; line-height: 1; }
    .hero h1 {
      font-size: clamp(2.1em, 6vw, 3.2em); font-weight: 800; margin-block: 10px 6px;
      background: linear-gradient(135deg, var(--text), color-mix(in srgb, var(--brand) 60%, var(--text)));
      -webkit-background-clip: text; background-clip: text; color: transparent;
    }
    .tagline { font-size: 1.12em; font-weight: 600; }
    .lede { color: var(--text-dim); max-width: 640px; margin: 12px auto 0; }
    .cta { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-block-start: 24px; }
    .fine { color: var(--text-dim); font-size: 0.85em; margin-block-start: 12px; }

    .btn {
      display: inline-flex; align-items: center; gap: 8px; text-decoration: none;
      padding: 14px 28px; border-radius: 13px; font-weight: 700; color: #fff;
      background: linear-gradient(135deg, var(--brand), var(--brand-2));
      box-shadow: 0 8px 24px color-mix(in srgb, var(--brand) 34%, transparent);
      transition: transform 0.18s ease, box-shadow 0.18s ease;
    }
    .btn:hover { transform: translateY(-3px); box-shadow: 0 14px 34px color-mix(in srgb, var(--brand) 44%, transparent); }
    .btn.ghost {
      background: var(--surface); color: var(--text); border: 1px solid var(--border); box-shadow: none;
    }
    .btn.wide { width: 100%; justify-content: center; margin-block: 8px; }

    /* ---------- sections ---------- */
    .section {
      display: flex; align-items: center; gap: 12px;
      font-size: 1.35em; font-weight: 800; margin-block: 46px 20px;
    }
    .section::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, var(--border), transparent); }
    [dir="rtl"] .section::after { background: linear-gradient(270deg, var(--border), transparent); }

    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px; }
    .card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 22px;
    }
    .card-ic { font-size: 1.7em; line-height: 1; margin-block-end: 10px; }
    .card h3 { font-size: 1.05em; font-weight: 700; margin-block-end: 6px; }
    .card p { font-size: 0.93em; color: var(--text-dim); }

    /* ---------- comparison ---------- */
    /* The table scrolls inside its own box so a long feature
       label can never make the page itself scroll sideways. */
    .table-scroll { overflow-x: auto; border-radius: var(--radius); border: 1px solid var(--border); }
    .compare { width: 100%; border-collapse: collapse; background: var(--surface); min-width: 480px; }
    .compare th, .compare td { padding: 13px 16px; text-align: start; border-bottom: 1px solid var(--border); }
    .compare thead th { font-size: 0.85em; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.04em; }
    .compare tbody th { font-weight: 600; font-size: 0.95em; }
    .compare td { text-align: center; width: 110px; font-weight: 700; }
    .compare tr:last-child th, .compare tr:last-child td { border-bottom: 0; }
    .compare .yes { color: var(--ok); }
    .compare .no { color: var(--text-dim); }
    .compare .partial { color: var(--text-dim); font-size: 0.85em; font-weight: 600; }
    .compare tr.star { background: color-mix(in srgb, var(--gold) 10%, transparent); }
    .compare tr.star th { font-weight: 800; }

    .free-note { margin-block-start: 16px; border-inline-start: 4px solid var(--ok); }

    /* ---------- spotlight ---------- */
    .spotlight {
      display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: center;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 26px;
    }
    .spotlight h3 { font-size: 1.15em; margin-block-end: 8px; }
    .spotlight p { color: var(--text-dim); font-size: 0.95em; }
    .tree {
      background: var(--surface-2); border: 1px solid var(--border); border-radius: 12px;
      padding: 16px; overflow-x: auto; font-size: 0.82em; line-height: 1.7;
      font-family: 'JetBrains Mono', 'Cascadia Code', 'Courier New', monospace;
    }
    .tree .c { color: var(--text-dim); }
    @media (max-width: 720px) { .spotlight { grid-template-columns: 1fr; } }

    /* ---------- pricing ---------- */
    .price-card {
      background: var(--surface); border: 1px solid color-mix(in srgb, var(--brand) 40%, var(--border));
      border-radius: calc(var(--radius) + 4px); padding: 30px; text-align: center;
      box-shadow: 0 20px 60px color-mix(in srgb, var(--brand) 14%, transparent);
    }
    .price-head h3 { font-size: 1.2em; font-weight: 800; }
    .price { font-size: 3.2em; font-weight: 800; line-height: 1.1; margin-block: 6px; }
    .price .cur { font-size: 0.45em; vertical-align: super; opacity: 0.7; }
    .plus { font-weight: 700; margin-block: 20px 10px; }
    .incl { list-style: none; text-align: start; display: inline-block; margin-block-end: 10px; }
    .incl li { padding-inline-start: 26px; position: relative; font-size: 0.94em; }
    .incl li::before { content: '✓'; position: absolute; inset-inline-start: 0; color: var(--ok); font-weight: 800; }
    .quiet { display: inline-block; margin-block-start: 8px; color: var(--text-dim); font-size: 0.9em; }

    /* ---------- faq ---------- */
    .faq {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 14px; padding: 14px 18px; margin-block-end: 10px;
    }
    .faq summary { cursor: pointer; font-weight: 700; list-style: none; }
    .faq summary::-webkit-details-marker { display: none; }
    .faq summary::after { content: '＋'; float: inline-end; color: var(--text-dim); }
    .faq[open] summary::after { content: '−'; }
    .faq p { color: var(--text-dim); font-size: 0.94em; margin-block-start: 10px; }

    footer {
      display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;
      margin-block-start: 48px; padding-block-start: 24px;
      border-top: 1px solid var(--border); color: var(--text-dim); font-size: 0.9em;
    }
    footer a { color: var(--text-dim); text-decoration: none; }
    footer a:hover { color: var(--text); }

    a:focus-visible, button:focus-visible, summary:focus-visible {
      outline: 2px solid var(--brand); outline-offset: 3px; border-radius: 6px;
    }

    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      *, *::before, *::after { transition-duration: 0.001ms !important; animation-duration: 0.001ms !important; }
    }
  `
}

function script() {
  return `
    function dsLang(code) {
      try { localStorage.setItem('ac_lang', code); } catch (e) {}
      document.cookie = 'lang=' + code + ';path=/;max-age=31536000;samesite=lax';
      window.location.search = '?lang=' + encodeURIComponent(code);
    }
    function dsTheme() {
      var dark = getComputedStyle(document.documentElement).colorScheme.indexOf('dark') !== -1;
      var next = dark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('ac_theme', next); } catch (e) {}
      document.cookie = 'theme=' + next + ';path=/;max-age=31536000;samesite=lax';
    }
  `
}


// ==========================================
// handleUnityDocSnap
// ==========================================
export async function handleUnityDocSnap(url, request) {
  const cookies = parseCookies(request)
  const lang = resolveLang(url, request, cookies)
  const theme = resolveTheme(cookies)

  const headers = {}
  const requested = url && url.searchParams ? url.searchParams.get('lang') : null
  if (requested && I18N[requested]) {
    headers['Set-Cookie'] = `lang=${requested}; Path=/; Max-Age=${LANG_COOKIE_MAX_AGE}; SameSite=Lax`
  }

  return createHtmlResponse(renderPage(lang, theme), 200, headers)
}
