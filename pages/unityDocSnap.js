// ==========================================
// pages/unityDocSnap.js
// The Unity DocSnap product page: what the tool does,
// what each of the three editions includes, and the buy
// buttons.
//
// Public entry:
//   handleUnityDocSnap(url, request, gameId, requestId, GAMES, env)
//
// Served at /unity-docsnap (and /docsnap), and linked from
// several places inside the Unity Editor itself, so it is
// the page a person lands on at the exact moment they
// wanted a locked feature. That shapes the whole layout:
//
//   • What the tool DOES comes before what it costs.
//     Somebody arriving from the Editor already has it
//     installed; somebody arriving cold has never seen it,
//     and a price above an unexplained product is a bounce.
//
//   • The comparison table is honest in every direction. It
//     gives what Free keeps the same weight as what the paid
//     tiers add, because a table that only shows locks reads
//     as a crippled demo - and the free edition genuinely is
//     the whole exporter.
//
//   • Plus is presented as a real product, not as a
//     discount on Pro. Its entire reason to exist is the
//     person who wants the AI summaries and the Changes page
//     and nothing else, and who would look at a single
//     $49.99 price and buy nothing at all. If the page makes
//     Plus feel like the sad column, that person still buys
//     nothing.
//
//   • "One-off" sits next to every price. The single most
//     common question about a paid dev tool is whether it is
//     a subscription.
//
// Trilingual and theme-aware like every other page here:
// language resolves ?lang= -> cookie -> Accept-Language, and
// switching reloads so RTL/LTR is always correct.
// ==========================================

import { CONFIG } from '../config.js'
import { getPageHead } from '../shared-styles.js'
import { createHtmlResponse } from '../utils.js'
import {
  VIDEOS as VIDEOS_ALL, VIDEO_LANGS, videosFor, totalSecondsFor, formatDuration
} from '../content/docsnapVideos.js'

const DEFAULT_LANG = 'fa'
const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

const PLUS = CONFIG.DOCSNAP.TIERS.plus
const PRO = CONFIG.DOCSNAP.TIERS.pro
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
    ctaFree: 'رایگان شروع کن',
    ctaPrices: 'قیمت‌ها را ببین',
    priceNote: 'خرید یک‌باره · یک سیستم · بدون اشتراک ماهانه',

    sectionWhat: 'چه‌کار می‌کند',
    sectionVideos: 'ببین چطور کار می‌کند',
    sectionCompare: 'مقایسه‌ی نسخه‌ها',
    sectionSpotlight: 'چیزی که بیشترین آدم برایش پول می‌دهد',
    sectionPricing: 'قیمت',
    sectionFaq: 'سؤال‌های پرتکرار',

    videoLede: (count, total) =>
      `${count} کلیپ کوتاه، در مجموع ${total} — هر کدام یک کار را نشان می‌دهد، بدون مقدمه.`,
    videoLangLabel: 'زبان ویدیو',
    videoOnlyEn: 'این کلیپ فقط به انگلیسی ضبط شده است.',
    videoNoSupport: 'مرورگرت این ویدیو را پخش نمی‌کند.',
    videoDownload: 'دانلود فایل ویدیو',
    videoOf: (index, count) => `کلیپ ${index} از ${count}`,
    videoNoteTitle: 'یک نکته‌ی مهم',
    videoNoteBody: 'همه‌ی قابلیت‌هایی که در این ویدیوها می‌بینی داخل ابزار وجود دارند. اما ابزار مرتب بروزرسانی می‌شود، پس ممکن است مسیر دسترسی به بعضی از آن‌ها یا ظاهرشان با چیزی که در ویدیو نشان داده شده کمی فرق داشته باشد.',

    colFeature: 'قابلیت',
    colFree: 'رایگان',

    freeHeading: 'نسخه‌ی رایگان کامل است',
    freeBody: 'کل اکسپورتر توی نسخه‌ی رایگان است: همه‌ی سین‌ها، همه‌ی کامپوننت‌ها، همه‌ی فیلدهای سریالایزشده، گزارش سلامت پروژه، صفحه‌ی پکیج‌ها، جست‌وجو، هر دو ظاهر و هر سه زبان. هیچ کدی هم نمی‌خواهد — نصب کن و کار کن.',

    spotlightTitle: 'یک فایل، کل پروژه، آماده‌ی دستیار هوش مصنوعی',
    spotlightBody: 'کنار سایت HTML، یک پوشه‌ی summary/ نوشته می‌شود: خلاصه‌ی کوتاه و ساختارمند هر سین و هر پوشه، هم مارک‌داون هم جیسون. و ai-bundle.md همه‌شان را می‌کند یک سند. یعنی به‌جای چهل تا اسکرین‌شات یا نصف ساعت توضیح دادن، یک پیست.',
    spotlightTier: 'این و صفحه‌ی تغییرات، هر دو توی نسخه‌ی Plus هستند — ' + '$' + PLUS.price + '.',

    tierFreeName: 'رایگان',
    tierFreePitch: 'کل اکسپورتر. بدون کد، بدون حساب کاربری، بدون اینترنت.',
    tierFreeCta: 'دانلود از گیت‌هاب',

    tierPlusName: 'Plus',
    tierPlusPitch: 'همان دو خروجی‌ای که بیشتر آدم‌ها دقیقاً برای همان‌ها می‌آیند.',
    tierPlusFor: 'مناسب کسی که خروجی AI و دیدن تغییرات را می‌خواهد و کاری با CI و بک‌آپ ندارد.',

    tierProName: 'Pro',
    tierProPitch: 'همه‌چیز: اتوماسیون، بک‌آپ، تاریخچه‌ی نامحدود، وایت‌لیبل.',
    tierProFor: 'مناسب تیم‌ها و کسی که مستنداتش باید روی هر مرج خودکار ساخته شود.',

    buyCta: 'خرید',
    everythingInFree: 'هرچه در رایگان هست، به‌علاوه:',
    everythingInPlus: 'هرچه در Plus هست، به‌علاوه:',
    buyFine: 'کد فوراً بعد از پرداخت تحویل داده می‌شود. روی یک سیستم فعال می‌شود و هر وقت خواستی خودت می‌توانی آزادش کنی و ببری روی سیستم دیگر.',
    haveKey: 'کد دارم',
    orderHelp: 'سفارشم نرسیده',
    popular: 'محبوب‌ترین',

    faq: [
      ['اشتراک ماهانه است؟',
       'نه. یک بار می‌خری و مال خودت است. بروزرسانی‌های ۱.x رایگان است.'],
      ['فرق Plus و Pro دقیقاً چیست؟',
       'نسخه‌ی Plus دو تا قابلیت دارد: خروجی آماده‌ی هوش مصنوعی و صفحه‌ی تغییرات. نسخه‌ی Pro علاوه بر این‌ها تاریخچه‌ی نامحدود نسخه‌ها، بروزرسانی افزایشی، اتوماسیون CI، کپی فایل‌ها، بک‌آپ کل پروژه و لوگوی اختصاصی را هم دارد. اگر فقط آن دو تا را می‌خواهی، Plus دقیقاً برای تو ساخته شده.'],
      ['بعداً می‌توانم از Plus به Pro ارتقا بدهم؟',
       'بله — کد Pro را جدا می‌خری و همان را توی یونیتی وارد می‌کنی. کد Plus قبلی‌ات را هم می‌توانی روی سیستم دیگری نگه داری.'],
      ['روی چند سیستم کار می‌کند؟',
       'هر کد روی یک سیستم فعال می‌شود. اگر سیستمت را عوض کردی، از داخل خود یونیتی یا از صفحه‌ی لایسنس همین سایت آزادش کن و روی سیستم جدید فعالش کن — بدون ایمیل زدن به کسی.'],
      ['اگر اینترنت نداشته باشم چه؟',
       'بعد از یک بار فعال‌سازی، ۴۵ روز کاملاً آفلاین کار می‌کند و هر وقت آنلاین شدی خودش بی‌صدا تمدید می‌شود. هیچ چک لایسنسی سر راه اکسپورت نیست.'],
      ['نسخه‌ی رایگان چیزی از پروژه‌ام را جایی می‌فرستد؟',
       'نه. نسخه‌ی رایگان اصلاً به اینترنت وصل نمی‌شود. نسخه‌های پولی هم فقط موقع فعال‌سازی و تمدید یک درخواست می‌فرستند که فقط شامل کد لایسنس، یک شناسه‌ی هش‌شده‌ی سیستم و شماره‌ی نسخه است — هیچ‌چیزی از پروژه‌ات.'],
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
    ctaFree: 'Start free',
    ctaPrices: 'See pricing',
    priceNote: 'One-off purchase · one machine · no subscription',

    sectionWhat: 'What it does',
    sectionVideos: 'See it work',
    sectionCompare: 'Compare the editions',
    sectionSpotlight: 'What most people pay for',
    sectionPricing: 'Pricing',
    sectionFaq: 'Common questions',

    videoLede: (count, total) =>
      `${count} short clips, ${total} in total — each one shows a single thing, with no preamble.`,
    videoLangLabel: 'Video language',
    videoOnlyEn: 'This clip was only recorded in English.',
    videoNoSupport: 'Your browser cannot play this video.',
    videoDownload: 'Download the video file',
    videoOf: (index, count) => `Clip ${index} of ${count}`,
    videoNoteTitle: 'One thing worth knowing',
    videoNoteBody: 'Everything shown in these clips is in the tool. It does keep being updated, though — so where you reach a feature from, and what it looks like on screen, may differ from the recording.',

    colFeature: 'Feature',
    colFree: 'Free',

    freeHeading: 'The free edition is the whole exporter',
    freeBody: 'Every Scene, every Component, every serialized field, the project health report, the packages page, search, both skins and all three languages — all in Free, and it needs no key at all. Install it and export.',

    spotlightTitle: 'One file, your whole project, ready for an AI assistant',
    spotlightBody: 'Alongside the HTML site you get a summary/ folder: a short, structured summary of every Scene and folder in both Markdown and JSON. ai-bundle.md concatenates all of them into one document — so handing a whole project to an assistant is one paste instead of forty screenshots or half an hour of explaining.',
    spotlightTier: 'This and the Changes page are both in Plus — $' + PLUS.price + '.',

    tierFreeName: 'Free',
    tierFreePitch: 'The whole exporter. No key, no account, no network.',
    tierFreeCta: 'Download on GitHub',

    tierPlusName: 'Plus',
    tierPlusPitch: 'The two outputs most people came here for.',
    tierPlusFor: 'For somebody who wants the AI summaries and the Changes page, and has no use for CI or backups.',

    tierProName: 'Pro',
    tierProPitch: 'Everything: automation, backups, unlimited history, white-label.',
    tierProFor: 'For teams, and for anyone whose docs should rebuild themselves on every merge.',

    buyCta: 'Buy',
    everythingInFree: 'Everything in Free, plus:',
    everythingInPlus: 'Everything in Plus, plus:',
    buyFine: 'Your key is delivered the moment payment clears. It activates on one machine, and you can release it yourself any time to move to another.',
    haveKey: 'I have a key',
    orderHelp: 'My order has not arrived',
    popular: 'Most popular',

    faq: [
      ['Is it a subscription?',
       'No. Buy once, keep it. All 1.x updates are included.'],
      ['What exactly is the difference between Plus and Pro?',
       'Plus is two features: the AI-ready summaries and the Changes page. Pro adds unlimited version history, incremental updates, CI automation, file copies, whole-project backups and a custom logo on top. If those two are all you want, Plus is built for exactly you.'],
      ['Can I upgrade from Plus to Pro later?',
       'Yes — buy a Pro key and enter it in Unity. Your Plus key is unaffected and can stay on another machine.'],
      ['How many machines?',
       'One machine per key. Moving to a new computer is self-service — release the old machine from inside Unity or from the licence page on this site, then activate the new one. No email to anybody.'],
      ['What if I am offline?',
       'After one activation it works fully offline for 45 days and renews itself quietly whenever you happen to be online. There is never a licence check in front of an export.'],
      ['Does anything leave my project?',
       'No. The free edition never touches the network at all. The paid editions send one request when activating or renewing, containing only the licence key, a hashed machine identifier and the package version — nothing about your project.'],
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
    ctaFree: '無料ではじめる',
    ctaPrices: '価格を見る',
    priceNote: '買い切り · 1 台まで · サブスクリプションなし',

    sectionWhat: 'できること',
    sectionVideos: '動作を見る',
    sectionCompare: 'エディション比較',
    sectionSpotlight: '最も選ばれている理由',
    sectionPricing: '価格',
    sectionFaq: 'よくある質問',

    videoLede: (count, total) =>
      `短いクリップ ${count} 本、合計 ${total}。前置きなしで 1 本につき 1 つの機能を紹介します。`,
    videoLangLabel: '動画の言語',
    videoOnlyEn: 'このクリップは英語版のみです。',
    videoNoSupport: 'お使いのブラウザではこの動画を再生できません。',
    videoDownload: '動画ファイルをダウンロード',
    videoOf: (index, count) => `${count} 本中 ${index} 本目`,
    videoNoteTitle: 'ご注意ください',
    videoNoteBody: 'これらの動画で紹介している機能は、すべて製品に含まれています。ただし更新を重ねているため、機能へのアクセス方法や画面の見た目が動画と異なる場合があります。',

    colFeature: '機能',
    colFree: '無料版',

    freeHeading: '無料版でエクスポーターのすべてが使えます',
    freeBody: 'すべてのシーン、コンポーネント、シリアライズフィールド、プロジェクトのヘルスレポート、パッケージページ、検索、2 つのスキン、3 言語 — すべて無料版に含まれます。キーも不要で、インストールすればすぐ使えます。',

    spotlightTitle: '1 ファイルで、プロジェクト全体を AI に渡せる',
    spotlightBody: 'HTML サイトに加えて summary/ フォルダを出力します。各シーンとフォルダの短く構造化された要約を Markdown と JSON の両方で書き出し、ai-bundle.md がそれらを 1 つの文書にまとめます。スクリーンショットを何十枚も送ったり 30 分かけて説明したりする代わりに、1 回の貼り付けで済みます。',
    spotlightTier: 'これと変更ページは、どちらも Plus($' + PLUS.price + ')に含まれます。',

    tierFreeName: '無料版',
    tierFreePitch: 'エクスポーターのすべて。キーもアカウントもネットワークも不要。',
    tierFreeCta: 'GitHub からダウンロード',

    tierPlusName: 'Plus',
    tierPlusPitch: '多くの方が求めている 2 つの出力。',
    tierPlusFor: 'AI サマリーと変更ページが必要で、CI やバックアップは使わない方に。',

    tierProName: 'Pro',
    tierProPitch: 'すべて。自動化、バックアップ、無制限の履歴、ホワイトラベル。',
    tierProFor: 'チーム、そしてマージのたびにドキュメントを自動生成したい方に。',

    buyCta: '購入',
    everythingInFree: '無料版のすべてに加えて:',
    everythingInPlus: 'Plus のすべてに加えて:',
    buyFine: '決済完了と同時にキーが届きます。1 台で有効化でき、別のマシンへはいつでも自分で移せます。',
    haveKey: 'キーを持っています',
    orderHelp: '注文が届かない',
    popular: '人気',

    faq: [
      ['サブスクリプションですか?',
       'いいえ。買い切りです。1.x のアップデートはすべて含まれます。'],
      ['Plus と Pro の違いは何ですか?',
       'Plus は 2 つの機能です。AI 向けサマリーと変更ページ。Pro はそれに加えて、無制限のバージョン履歴、差分更新、CI 自動化、ファイル本体のコピー、プロジェクト全体のバックアップ、自社ロゴが利用できます。前者の 2 つだけをお求めなら Plus が最適です。'],
      ['あとから Plus を Pro にアップグレードできますか?',
       'はい。Pro のキーを購入して Unity に入力してください。Plus のキーはそのまま残り、別のマシンで使い続けられます。'],
      ['何台まで使えますか?',
       'キー 1 つにつき 1 台です。買い替え時は Unity 内またはこのサイトのライセンスページから自分で解除し、新しいマシンで有効化できます。問い合わせは不要です。'],
      ['オフラインでも使えますか?',
       '一度有効化すれば 45 日間完全にオフラインで動作し、オンラインになったタイミングで自動的に更新されます。エクスポートの前にライセンス確認が入ることはありません。'],
      ['プロジェクトの情報は送信されますか?',
       'いいえ。無料版はネットワークに一切接続しません。有料版も有効化と更新のときにライセンスキー、ハッシュ化されたマシン識別子、パッケージのバージョンだけを送信します。プロジェクトの情報は一切含まれません。'],
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
// DocSnapUpgradePitch.Lines in the Unity package - somebody
// who read the panel inside the Editor and then clicked
// through should find the same list in the same order, not
// a rearranged one they have to re-read.
//
// Each of `free` / `plus` / `pro` is a tri-state: true
// (included), false (not in this tier), or a per-language
// string (included, with a caveat worth stating).
//
// Written out per tier rather than derived from a single
// "minimum tier" field, because two rows genuinely differ in
// kind rather than in degree - the version cap is a number
// that changes, not a tick that appears - and a table that
// could only say yes or no would have to lie about them.
// ==========================================
const ROWS = [
  {
    free: true, plus: true, pro: true,
    label: {
      fa: 'سایت آفلاین کامل — سلسله‌مراتب، اینسپکتور، رفرنس‌ها',
      en: 'The full offline site — hierarchy, Inspector, references',
      ja: 'オフラインサイト一式 — 階層、インスペクター、参照'
    }
  },
  {
    free: true, plus: true, pro: true,
    label: {
      fa: 'گزارش سلامت پروژه (اسکریپت‌های گم‌شده، رفرنس‌های شکسته)',
      en: 'Project health report (missing scripts, broken references)',
      ja: 'プロジェクトのヘルスレポート(欠落スクリプト、壊れた参照)'
    }
  },
  {
    free: true, plus: true, pro: true,
    label: {
      fa: 'جست‌وجو، صفحه‌ی پکیج‌ها، تم روشن/تاریک، هر دو ظاهر، سه زبان',
      en: 'Search, packages page, light/dark, both skins, three languages',
      ja: '検索、パッケージページ、ライト/ダーク、2 つのスキン、3 言語'
    }
  },
  {
    free: false, plus: true, pro: true, star: true,
    label: {
      fa: '🤖 خروجی آماده‌ی AI — ‎summary/‎ و ai-bundle.md',
      en: '🤖 AI-ready summaries — summary/ and ai-bundle.md',
      ja: '🤖 AI 向けサマリー — summary/ と ai-bundle.md'
    }
  },
  {
    free: false, plus: true, pro: true, star: true,
    label: {
      fa: '🔁 صفحه‌ی تغییرات — دیف بین دو خروجی',
      en: '🔁 Changes page — diff between two exports',
      ja: '🔁 変更ページ — 2 つのエクスポートの差分'
    }
  },
  {
    // Not a feature - a consequence of paying anything at all.
    // Given its own row precisely because somebody scanning the
    // Plus column needs to see that it is not a lesser tier that
    // still stamps "free edition" on their work.
    free: false, plus: true, pro: true,
    label: {
      fa: 'بدون خط «نسخه‌ی رایگان» توی فوتر خروجی',
      en: 'No “free edition” line in the exported footer',
      ja: 'エクスポートのフッターに「無料版」表記なし'
    }
  },
  {
    free: { fa: '۳ اسنپ‌شات', en: '3 snapshots', ja: '3 件まで' },
    plus: { fa: '۵ اسنپ‌شات', en: '5 snapshots', ja: '5 件まで' },
    pro: true,
    label: {
      fa: '📚 تاریخچه‌ی نسخه‌ها',
      en: '📚 Version history',
      ja: '📚 バージョン履歴'
    }
  },
  {
    free: false, plus: false, pro: true,
    label: {
      fa: '⚡ بروزرسانی افزایشی — فقط سین‌های تغییرکرده دوباره اسکن می‌شوند',
      en: '⚡ Incremental updates — only changed Scenes are re-scanned',
      ja: '⚡ 差分更新 — 変更されたシーンだけを再スキャン'
    }
  },
  {
    free: false, plus: false, pro: true,
    label: {
      fa: '🤖 اتوماسیون CI — ‎DocSnapAPI و ‎-executeMethod',
      en: '🤖 CI automation — DocSnapAPI and -executeMethod',
      ja: '🤖 CI 自動化 — DocSnapAPI と -executeMethod'
    }
  },
  {
    free: false, plus: false, pro: true,
    label: {
      fa: '📁 کپی خود فایل‌ها در source-files/',
      en: '📁 Real file copies in source-files/',
      ja: '📁 ファイル本体を source-files/ にコピー'
    }
  },
  {
    free: false, plus: false, pro: true,
    label: {
      fa: '📦 بک‌آپ ‎.unitypackage از کل پروژه',
      en: '📦 Whole-project .unitypackage backup',
      ja: '📦 プロジェクト全体の .unitypackage バックアップ'
    }
  },
  {
    free: false, plus: false, pro: true,
    label: {
      fa: '✨ لوگوی خودت توی سایدبار',
      en: '✨ Your own logo in the sidebar',
      ja: '✨ サイドバーに自社ロゴ'
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

// ==========================================
// renderHero
// The two calls to action are "start free" and "see
// pricing", not "buy".
//
// Nobody buys a documentation tool they have never run, and
// a buy button above the fold on a product the reader
// cannot picture yet converts worse than the free download
// that turns them into somebody with an opinion about it.
// The prices are two clicks away, and the Editor itself
// will bring them back.
// ==========================================
function renderHero(p) {
  return `
    <header class="hero">
      <div class="logo">🧋</div>
      <h1>${escapeHtml(p.title)}</h1>
      <p class="tagline">${escapeHtml(p.tagline)}</p>
      <p class="lede">${escapeHtml(p.lede)}</p>
      <div class="cta">
        <a class="btn" href="${escapeHtml(REPO_URL)}" rel="noopener">${escapeHtml(p.ctaFree)}</a>
        <a class="btn ghost" href="#pricing">${escapeHtml(p.ctaPrices)}</a>
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
// renderVideos
// The demo clips, as a player with a playlist beside it.
//
// Placed straight after "what it does" and before any
// price, for the same reason the buy buttons are two clicks
// down: this is a tool nobody has seen, and two and a half
// minutes of watching it work is worth more than any
// paragraph on this page.
//
// A playlist rather than a grid of ten embedded players.
// Ten <video> elements each fetch their own metadata on
// load, which is ten range requests before the visitor has
// asked for anything - and on a phone that is the whole
// section costing megabytes to sit still. One player with
// preload="none" costs nothing until something is clicked.
//
// The clip language is its own control, seeded from the
// page language but free to differ. Somebody reading in
// Persian may well want the English recordings, and the
// tenth clip only exists there - so the two are not tied
// together.
// ==========================================
function renderVideos(p, lang) {
  // The clip language starts as the page language when
  // recordings exist in it, and falls back to English rather
  // than to an empty section.
  const startLang = VIDEO_LANGS.indexOf(lang) !== -1 ? lang : 'en'
  const clips = videosFor(startLang)

  const langButtons = VIDEO_LANGS.map(code => `
    <button type="button" data-vlang="${code}" lang="${code}"
            aria-pressed="${code === startLang ? 'true' : 'false'}">
      ${escapeHtml(I18N[code].langName)}
    </button>`).join('')

  const items = clips.map((clip, index) => `
    <li>
      <button type="button" class="vitem${index === 0 ? ' is-on' : ''}" data-id="${clip.id}"
              aria-current="${index === 0 ? 'true' : 'false'}">
        <span class="vnum">${String(clip.id).padStart(2, '0')}</span>
        <span class="vtext">
          <b>${escapeHtml(clip.title[lang])}</b>
          <small>${escapeHtml(clip.blurb[lang])}</small>
        </span>
        <span class="vdur" dir="ltr">${formatDuration(clip.seconds)}</span>
      </button>
    </li>`).join('')

  const first = clips[0]

  return `
    <h2 class="section" id="videos">${escapeHtml(p.sectionVideos)}</h2>

    <div class="vhead">
      <p class="vlede" id="vLede">${escapeHtml(p.videoLede(clips.length, formatDuration(totalSecondsFor(startLang))))}</p>
      <div class="vlang">
        <span class="vlang-label">${escapeHtml(p.videoLangLabel)}</span>
        <div class="seg" role="group" aria-label="${escapeHtml(p.videoLangLabel)}">${langButtons}</div>
      </div>
    </div>

    <div class="vplayer">
      <div class="vstage">
        <video id="vEl" controls preload="none" playsinline
               src="/video/${startLang}/${first.id}"
               aria-describedby="vTitle">
          <p>${escapeHtml(p.videoNoSupport)}
             <a id="vDl" href="/video/${startLang}/${first.id}">${escapeHtml(p.videoDownload)}</a></p>
        </video>
        <div class="vnow">
          <b id="vTitle">${escapeHtml(first.title[lang])}</b>
          <small id="vBlurb">${escapeHtml(first.blurb[lang])}</small>
          <span class="vcount" id="vCount">${escapeHtml(p.videoOf(1, clips.length))}</span>
        </div>
      </div>
      <ol class="vlist" id="vList">${items}</ol>
    </div>

    <div class="card vnote">
      <h3>${escapeHtml(p.videoNoteTitle)}</h3>
      <p>${escapeHtml(p.videoNoteBody)}</p>
    </div>`
}


// ==========================================
// videoData
// The catalogue the player needs, as one script tag.
//
// Split into two shapes on purpose. `byLang` is which clips
// EXIST in each recording language, and `meta` is what each
// clip is CALLED in the language the reader is reading -
// two independent axes that a single nested object would
// have made three times the size by repeating every title
// once per language.
// ==========================================
function videoData(lang) {
  const byLang = {}
  for (const code of VIDEO_LANGS) {
    byLang[code] = {
      ids: videosFor(code).map(clip => clip.id),
      total: formatDuration(totalSecondsFor(code))
    }
  }

  const meta = {}
  for (const clip of VIDEOS_ALL) {
    meta[clip.id] = {
      t: clip.title[lang],
      b: clip.blurb[lang],
      d: formatDuration(clip.seconds)
    }
  }

  return { byLang, meta }
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
  const cell = (value, extraClass) => {
    const cls = extraClass ? ' ' + extraClass : ''
    if (value === true) return `<td class="yes${cls}">✓</td>`
    if (value === false) return `<td class="no${cls}">—</td>`
    return `<td class="partial${cls}">${escapeHtml(value[lang])}</td>`
  }

  const rows = ROWS.map(row => `
    <tr${row.star ? ' class="star"' : ''}>
      <th scope="row">${escapeHtml(row.label[lang])}</th>
      ${cell(row.free)}
      ${cell(row.plus, 'col-plus')}
      ${cell(row.pro)}
    </tr>`).join('')

  return `
    <h2 class="section">${escapeHtml(p.sectionCompare)}</h2>
    <div class="table-scroll">
      <table class="compare">
        <thead>
          <tr>
            <th scope="col">${escapeHtml(p.colFeature)}</th>
            <th scope="col">${escapeHtml(p.colFree)}<span class="th-price">$0</span></th>
            <th scope="col" class="col-plus">${escapeHtml(p.tierPlusName)}<span class="th-price">$${escapeHtml(PLUS.price)}</span></th>
            <th scope="col">${escapeHtml(p.tierProName)}<span class="th-price">$${escapeHtml(PRO.price)}</span></th>
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
// It is the feature that is hardest to picture from a table
// row and the one most people upgrade for, so it gets shown
// rather than described. The line underneath naming Plus
// and its price is the whole reason the middle tier can be
// sold: a reader who has just decided they want this needs
// to learn, in the same breath, that it does not cost
// $49.99.
// ==========================================
function renderSpotlight(p) {
  return `
    <h2 class="section">${escapeHtml(p.sectionSpotlight)}</h2>
    <div class="spotlight">
      <div>
        <h3>${escapeHtml(p.spotlightTitle)}</h3>
        <p>${escapeHtml(p.spotlightBody)}</p>
        <p class="spot-tier">${escapeHtml(p.spotlightTier)}</p>
      </div>
      <pre class="tree" dir="ltr"><code>summary/
├── ai-bundle.md          <span class="c">← everything below, in one paste</span>
├── scene-MainMenu.md
├── scene-MainMenu.json
├── folder-Art_Textures.md
└── folder-Art_Textures.json</code></pre>
    </div>`
}

// ==========================================
// renderPricing
// Three cards, cheapest first, with Plus marked.
//
// Plus carries the "most popular" flag and the accent
// border, and that is a deliberate choice rather than a
// guess about what will sell most. It is the tier that is
// easiest to overlook - readers anchor on the free column
// and the expensive one - and it is also the one that
// converts somebody who would otherwise buy nothing. The
// flag exists to stop the middle column being scanned past.
//
// Each card lists what it ADDS over the tier to its left,
// not everything it contains. A card repeating all twelve
// rows is a card nobody finishes reading, and the
// comparison table directly above already holds the full
// picture.
// ==========================================
function renderPricing(p, lang) {
  const listFor = predicate => ROWS.filter(predicate)
    .map(r => '<li>' + escapeHtml(r.label[lang]) + '</li>').join('')

  // What Plus adds over Free, and what Pro adds over Plus.
  const plusAdds = listFor(r => r.free === false && r.plus === true)
  const proAdds = listFor(r => r.plus !== true && r.pro === true)

  return `
    <h2 class="section" id="pricing">${escapeHtml(p.sectionPricing)}</h2>
    <div class="tiers">

      <div class="tier">
        <h3>${escapeHtml(p.tierFreeName)}</h3>
        <div class="price"><span class="cur">$</span>0</div>
        <p class="tier-pitch">${escapeHtml(p.tierFreePitch)}</p>
        <a class="btn ghost wide" href="${escapeHtml(REPO_URL)}" rel="noopener">${escapeHtml(p.tierFreeCta)}</a>
        <p class="tier-for">${escapeHtml(p.freeBody)}</p>
      </div>

      <div class="tier is-featured">
        <span class="ribbon">${escapeHtml(p.popular)}</span>
        <h3>${escapeHtml(p.tierPlusName)}</h3>
        <div class="price"><span class="cur">$</span>${escapeHtml(PLUS.price)}</div>
        <p class="tier-pitch">${escapeHtml(p.tierPlusPitch)}</p>
        <p class="plus-label">${escapeHtml(p.everythingInFree)}</p>
        <ul class="incl">${plusAdds}</ul>
        <a class="btn wide" href="${escapeHtml(PLUS.buyUrl)}" rel="noopener">${escapeHtml(p.buyCta)} — $${escapeHtml(PLUS.price)}</a>
        <p class="tier-for">${escapeHtml(p.tierPlusFor)}</p>
      </div>

      <div class="tier">
        <h3>${escapeHtml(p.tierProName)}</h3>
        <div class="price"><span class="cur">$</span>${escapeHtml(PRO.price)}</div>
        <p class="tier-pitch">${escapeHtml(p.tierProPitch)}</p>
        <p class="plus-label">${escapeHtml(p.everythingInPlus)}</p>
        <ul class="incl">${proAdds}</ul>
        <a class="btn wide" href="${escapeHtml(PRO.buyUrl)}" rel="noopener">${escapeHtml(p.buyCta)} — $${escapeHtml(PRO.price)}</a>
        <p class="tier-for">${escapeHtml(p.tierProFor)}</p>
      </div>

    </div>
    <p class="fine center">${escapeHtml(p.buyFine)}</p>
    <p class="center"><a class="quiet" href="/license">${escapeHtml(p.haveKey)} →</a></p>`
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
    ${renderVideos(p, lang)}
    ${renderSpotlight(p)}
    ${renderCompare(p, lang)}
    ${renderPricing(p, lang)}
    ${renderFaq(p)}
    <footer>
      <a href="/">${escapeHtml(p.footerBack)}</a>
      <span>·</span>
      <a href="${escapeHtml(REPO_URL)}" rel="noopener">GitHub</a>
      <span>·</span>
      <a href="/license">${escapeHtml(p.haveKey)}</a>
      <span>·</span>
      <a href="/order">${escapeHtml(p.orderHelp)}</a>
    </footer>
  </div>
  <script>${script(lang, p)}</script>
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
      --radius: 18px; --maxw: 1040px;
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
    .center { text-align: center; }

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
    .btn.wide { width: 100%; justify-content: center; margin-block: 10px; }

    /* ---------- sections ---------- */
    .section {
      display: flex; align-items: center; gap: 12px;
      font-size: 1.35em; font-weight: 800; margin-block: 46px 20px; scroll-margin-top: 20px;
    }
    .section::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, var(--border), transparent); }
    [dir="rtl"] .section::after { background: linear-gradient(270deg, var(--border), transparent); }

    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
    .card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 22px;
    }
    .card-ic { font-size: 1.7em; line-height: 1; margin-block-end: 10px; }
    .card h3 { font-size: 1.05em; font-weight: 700; margin-block-end: 6px; }
    .card p { font-size: 0.93em; color: var(--text-dim); }

    /* ---------- videos ---------- */
    .vhead {
      display: flex; align-items: center; justify-content: space-between;
      gap: 14px; flex-wrap: wrap; margin-block-end: 16px;
    }
    .vlede { color: var(--text-dim); font-size: 0.94em; }
    .vlang { display: flex; align-items: center; gap: 10px; }
    .vlang-label { font-size: 0.8em; color: var(--text-dim); font-weight: 600; }

    /* Player left, playlist right on a desktop; stacked on a
       phone, where a side-by-side split would leave the video
       too small to read a Unity Inspector in. */
    .vplayer { display: grid; grid-template-columns: 1.55fr 1fr; gap: 16px; align-items: start; }
    @media (max-width: 820px) { .vplayer { grid-template-columns: 1fr; } }

    .vstage {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); overflow: hidden;
    }
    .vstage video {
      display: block; width: 100%; aspect-ratio: 16 / 9; background: #05070d;
    }
    .vstage video p { color: var(--text-dim); padding: 20px; font-size: 0.9em; }
    .vnow { padding: 14px 16px; }
    .vnow b { display: block; font-size: 1em; font-weight: 700; }
    .vnow small { display: block; color: var(--text-dim); font-size: 0.87em; margin-block-start: 3px; }
    .vcount { display: block; font-size: 0.76em; color: var(--text-dim); margin-block-start: 8px; }

    /* The playlist scrolls inside itself so ten clips cannot
       make the section taller than the player beside it. */
    .vlist {
      list-style: none; max-height: 420px; overflow-y: auto;
      border: 1px solid var(--border); border-radius: var(--radius);
      background: var(--surface); padding: 6px;
      scrollbar-width: thin;
    }
    @media (max-width: 820px) { .vlist { max-height: 320px; } }

    .vitem {
      display: flex; align-items: center; gap: 11px; width: 100%; text-align: start;
      padding: 9px 10px; border: 0; border-radius: 12px; cursor: pointer;
      font: inherit; color: var(--text); background: transparent;
      transition: background 0.15s ease;
    }
    .vitem:hover { background: var(--surface-2); }
    .vitem.is-on { background: color-mix(in srgb, var(--brand) 16%, transparent); }

    .vnum {
      flex: 0 0 26px; width: 26px; height: 26px; border-radius: 8px;
      display: grid; place-items: center; font-size: 0.72em; font-weight: 800;
      color: var(--text-dim); background: var(--surface-2); border: 1px solid var(--border);
    }
    .vitem.is-on .vnum {
      color: #fff; border-color: transparent;
      background: linear-gradient(135deg, var(--brand), var(--brand-2));
    }
    .vtext { flex: 1 1 auto; min-width: 0; }
    .vtext b { display: block; font-size: 0.88em; font-weight: 700; line-height: 1.45; }
    .vtext small {
      display: block; color: var(--text-dim); font-size: 0.78em; line-height: 1.5;
      /* Two lines, then an ellipsis. A blurb that wraps to four
         turns the playlist into a wall and hides the clips
         below it. */
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .vdur { flex: 0 0 auto; font-size: 0.76em; color: var(--text-dim); font-variant-numeric: tabular-nums; }

    /* The "recordings age, the tool doesn't stand still" note.
       Under the player rather than above it: it only makes sense
       to somebody who has watched something, and above the
       player it reads as an apology before the pitch. */
    .vnote { margin-block-start: 16px; border-inline-start: 4px solid var(--gold); }
    .vnote h3 { font-size: 1em; font-weight: 700; margin-block-end: 6px; }

    /* ---------- comparison ---------- */
    /* The table scrolls inside its own box so a long feature
       label can never make the page itself scroll sideways. */
    .table-scroll { overflow-x: auto; border-radius: var(--radius); border: 1px solid var(--border); }
    .compare { width: 100%; border-collapse: collapse; background: var(--surface); min-width: 620px; }
    .compare th, .compare td { padding: 13px 14px; text-align: start; border-bottom: 1px solid var(--border); }
    .compare thead th { font-size: 0.85em; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.04em; }
    .compare thead th .th-price { display: block; font-size: 0.95em; text-transform: none; color: var(--text); font-weight: 800; }
    .compare tbody th { font-weight: 600; font-size: 0.95em; }
    .compare td { text-align: center; width: 96px; font-weight: 700; }
    .compare tr:last-child th, .compare tr:last-child td { border-bottom: 0; }
    .compare .yes { color: var(--ok); }
    .compare .no { color: var(--text-dim); }
    .compare .partial { color: var(--text-dim); font-size: 0.82em; font-weight: 600; }
    .compare tr.star { background: color-mix(in srgb, var(--gold) 10%, transparent); }
    .compare tr.star th { font-weight: 800; }
    /* The Plus column is tinted the whole way down so the eye can
       follow it. Without it, a middle column in a three-column
       table is the one nobody reads. */
    .compare .col-plus,
    .compare thead th.col-plus { background: color-mix(in srgb, var(--brand) 9%, transparent); }

    .free-note { margin-block-start: 16px; border-inline-start: 4px solid var(--ok); }

    /* ---------- spotlight ---------- */
    .spotlight {
      display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: center;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 26px;
    }
    .spotlight h3 { font-size: 1.15em; margin-block-end: 8px; }
    .spotlight p { color: var(--text-dim); font-size: 0.95em; }
    .spot-tier {
      margin-block-start: 12px; font-weight: 700;
      color: color-mix(in srgb, var(--brand) 55%, var(--text)) !important;
    }
    .tree {
      background: var(--surface-2); border: 1px solid var(--border); border-radius: 12px;
      padding: 16px; overflow-x: auto; font-size: 0.82em; line-height: 1.7;
      font-family: 'JetBrains Mono', 'Cascadia Code', 'Courier New', monospace;
    }
    .tree .c { color: var(--text-dim); }
    @media (max-width: 720px) { .spotlight { grid-template-columns: 1fr; } }

    /* ---------- pricing ---------- */
    .tiers { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; align-items: start; }
    @media (max-width: 860px) { .tiers { grid-template-columns: 1fr; } }

    .tier {
      position: relative; text-align: center;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: calc(var(--radius) + 4px); padding: 26px 22px;
    }
    .tier.is-featured {
      border-color: color-mix(in srgb, var(--brand) 50%, var(--border));
      box-shadow: 0 20px 60px color-mix(in srgb, var(--brand) 16%, transparent);
    }
    .ribbon {
      position: absolute; inset-block-start: -11px; inset-inline-start: 50%;
      transform: translateX(-50%); white-space: nowrap;
      padding: 3px 14px; border-radius: 999px; font-size: 0.75em; font-weight: 800; color: #fff;
      background: linear-gradient(135deg, var(--brand), var(--brand-2));
    }
    [dir="rtl"] .ribbon { transform: translateX(50%); }
    .tier h3 { font-size: 1.15em; font-weight: 800; }
    .tier .price { font-size: 2.7em; font-weight: 800; line-height: 1.1; margin-block: 4px; }
    .tier .price .cur { font-size: 0.42em; vertical-align: super; opacity: 0.7; }
    .tier-pitch { font-size: 0.92em; color: var(--text-dim); min-height: 3em; }
    .plus-label { font-weight: 700; font-size: 0.86em; margin-block: 14px 8px; text-align: start; }
    .incl { list-style: none; text-align: start; margin-block-end: 6px; }
    .incl li { padding-inline-start: 24px; position: relative; font-size: 0.88em; margin-block: 5px; }
    .incl li::before { content: '✓'; position: absolute; inset-inline-start: 0; color: var(--ok); font-weight: 800; }
    .tier-for { font-size: 0.82em; color: var(--text-dim); text-align: start; }
    .quiet { color: var(--text-dim); font-size: 0.9em; text-decoration: none; }
    .quiet:hover { color: var(--text); }

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

// ==========================================
// script
// Language and theme switching, plus the video player.
//
// The player is the only stateful thing on this page, and
// it is deliberately about forty lines of plain DOM work
// rather than anything cleverer. It has to run before any
// framework would have finished loading, on a page whose
// whole argument is that it renders instantly.
// ==========================================
function script(lang, p) {
  const data = videoData(lang)

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

    (function () {
      var BY_LANG = ${JSON.stringify(data.byLang)};
      var META = ${JSON.stringify(data.meta)};
      var TXT = {
        lede: ${JSON.stringify(p.videoLede('__N__', '__T__'))},
        of: ${JSON.stringify(p.videoOf('__I__', '__N__'))}
      };

      var video = document.getElementById('vEl');
      if (!video) return;

      var list = document.getElementById('vList');
      var titleEl = document.getElementById('vTitle');
      var blurbEl = document.getElementById('vBlurb');
      var countEl = document.getElementById('vCount');
      var ledeEl = document.getElementById('vLede');
      var downloadEl = document.getElementById('vDl');

      var vlang = ${JSON.stringify(VIDEO_LANGS.indexOf(lang) !== -1 ? lang : 'en')};
      var current = BY_LANG[vlang].ids[0];

      function esc(v) {
        return String(v == null ? '' : v)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      }

      function pad(n) { return n < 10 ? '0' + n : String(n); }

      // Loading a clip is a src swap plus load(), not a new
      // <video>. Replacing the element would lose the user's
      // volume and fullscreen state between clips, which on a
      // ten-item playlist means re-muting nine times.
      function select(id, autoplay) {
        current = id;
        var meta = META[id];

        video.src = '/video/' + vlang + '/' + id;
        video.load();
        if (autoplay) {
          var playing = video.play();
          // Autoplay with sound is refused by every browser unless
          // the page has been interacted with. It HAS been - the
          // user clicked a playlist item - but the promise is still
          // rejected in some configurations, and an unhandled
          // rejection in the console is noise nobody needs.
          if (playing && playing.catch) playing.catch(function () {});
        }

        titleEl.textContent = meta.t;
        blurbEl.textContent = meta.b;
        if (downloadEl) downloadEl.href = '/video/' + vlang + '/' + id;

        var ids = BY_LANG[vlang].ids;
        countEl.textContent = TXT.of
          .replace('__I__', String(ids.indexOf(id) + 1))
          .replace('__N__', String(ids.length));

        Array.prototype.forEach.call(list.querySelectorAll('.vitem'), function (button) {
          var on = Number(button.getAttribute('data-id')) === id;
          button.classList.toggle('is-on', on);
          button.setAttribute('aria-current', on ? 'true' : 'false');
        });
      }

      function paintList() {
        var ids = BY_LANG[vlang].ids;

        list.innerHTML = ids.map(function (id) {
          var meta = META[id];
          return '<li><button type="button" class="vitem" data-id="' + id + '" aria-current="false">'
            + '<span class="vnum">' + pad(id) + '</span>'
            + '<span class="vtext"><b>' + esc(meta.t) + '</b><small>' + esc(meta.b) + '</small></span>'
            + '<span class="vdur" dir="ltr">' + meta.d + '</span>'
            + '</button></li>';
        }).join('');

        ledeEl.textContent = TXT.lede
          .replace('__N__', String(ids.length))
          .replace('__T__', BY_LANG[vlang].total);

        bind();
      }

      function bind() {
        Array.prototype.forEach.call(list.querySelectorAll('.vitem'), function (button) {
          button.addEventListener('click', function () {
            select(Number(button.getAttribute('data-id')), true);
          });
        });
      }

      // Switching the clip language keeps the clip you were on
      // when that clip exists in the new language, and falls back
      // to the first one when it does not - which is only the
      // tenth, the English-only tour. Jumping back to clip one on
      // every language change would punish exactly the person
      // who is comparing the same clip in two languages.
      Array.prototype.forEach.call(document.querySelectorAll('[data-vlang]'), function (button) {
        button.addEventListener('click', function () {
          var next = button.getAttribute('data-vlang');
          if (next === vlang) return;

          vlang = next;
          Array.prototype.forEach.call(document.querySelectorAll('[data-vlang]'), function (other) {
            other.setAttribute('aria-pressed', other === button ? 'true' : 'false');
          });

          paintList();
          var ids = BY_LANG[vlang].ids;
          select(ids.indexOf(current) !== -1 ? current : ids[0], false);
        });
      });

      // Autoplay the next clip when one finishes. Fourteen
      // seconds is short enough that stopping after each one
      // turns a two-minute tour into ten decisions.
      video.addEventListener('ended', function () {
        var ids = BY_LANG[vlang].ids;
        var at = ids.indexOf(current);
        if (at !== -1 && at + 1 < ids.length) select(ids[at + 1], true);
      });

      bind();
    })();
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
