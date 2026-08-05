// ==========================================
// Pages/UnityDirectTmp.js
// The Unity DirectTMP product page: what the tool does,
// what it costs (nothing), and how to install it.
//
// Public entry:
//   handleUnityDirectTmp(url, request, gameId, requestId, GAMES, env)
//
//   • The problem comes before the product. Somebody arriving
//     cold does not know what tofu is, and "hand TextMeshPro
//     the font file itself" means nothing until you have seen
//     the row of empty boxes it prevents. So the page opens
//     with □□□□□ rendered as literal boxes, next to the same
//     text set properly.
//
//   • The Editor-font feature gets its own section rather than
//     a bullet. It is the thing 1.0 added, it is the thing no
//     other TextMeshPro package does, and it is the thing
//     somebody with a Persian or Japanese project searches for
//     without knowing it exists.
//
//   • "Free" is stated where a price would be, not buried in a
//     licence line. A developer looking at a Unity tool page
//     assumes a price until told otherwise, and the assumption
//     costs the click.
//
//   • The install snippet is one copyable line. The Package
//     Manager git-URL flow is four clicks and one paste, and
//     the paste is the part a page can actually help with.
//
// Trilingual and theme-aware like every other page here.
// ==========================================

import { CONFIG } from '../Config.js'
import { getPageHead } from '../Core/DesignSystem.js'
import { createHtmlResponse } from '../Core/Http.js'
import { otherTools } from '../Content/ToolsCatalog.js'

import { escapeHtml } from '../Core/Html.js'
import { chromeScript, themeBootScript } from '../Core/PageChrome.js'
import { seoHead, breadcrumbLd, softwareApplicationLd } from '../Core/Seo.js'
import { siteNavCss, siteBreadcrumb, siteFooter, NAV_I18N } from '../Core/SiteNav.js'
import { langCookieHeader, parseCookies, resolveLang, resolveRequestLang, resolveRequestTheme } from '../Core/RequestContext.js'

const REPO_URL = CONFIG.DIRECTTMP.REPO_URL
const GIT_URL = CONFIG.DIRECTTMP.GIT_URL
const VERSION = CONFIG.DIRECTTMP.VERSION


// ==========================================
// The Inkwell palette.
// ==========================================
const INK = '#14808C'
const INK_DEEP = '#0B5A63'
const BRASS = '#F0A73E'
const PAPER = '#FBF6EC'
const BLUSH = '#E8927C'
const NIGHT = '#1B1725'


// ==========================================
// i18n
// One pack per language. Every string the page renders is
// here; nothing is written inline in the markup.
// ==========================================
const I18N = {
  fa: {
    locale: 'fa-IR',
    dir: 'rtl',
    langName: 'فارسی',

    title: 'Unity DirectTMP',
    tagline: 'فایل فونت رو مستقیم بده به TextMeshPro — هر زبونی، همون‌جوری که هست.',
    lede: 'به‌جای فونت‌اسِت SDF از پیش پخته‌شده، خودِ فایل .ttf یا .otf رو به TextMeshPro می‌ده. گلیف‌ها همون لحظه‌ای که قراره کشیده بشن از فایل ساخته می‌شن، پس فارسی، عربی، ژاپنی، چینی و کره‌ای بدون هیچ تنظیمی رندر می‌شن.',
    priceBadge: 'رایگان · MIT · بدون کد لایسنس',
    ctaInstall: 'نصبش کن',
    ctaRepo: 'گیت‌هاب',

    problemTitle: 'مشکل، در یک تصویر',
    problemBody: 'یه فونت پیدا می‌کنی، می‌ندازیش توی یونیتی، یه ساعت توی Font Asset Creator رِنج کاراکترها رو انتخاب می‌کنی — و همین که یه بازیکن اسم خودش رو فارسی تایپ می‌کنه، این رو می‌بینی:',
    problemBad: 'سلام دنیا',
    problemGood: 'سلام دنیا',
    problemBadLabel: 'با فونت‌اسِت پخته‌شده',
    problemGoodLabel: 'با DirectTMP',
    problemAfter: 'فایل فونت از قبل دقیقاً می‌دونه چه گلیف‌هایی داره. DirectTMP فقط دست از این برداشته که وانمود کنه نمی‌دونه.',

    editorTitle: 'و روی خودِ یونیتی هم اثر می‌ذاره',
    editorBadge: 'تازه در ۱.۰',
    editorBody: 'یه GameObject رو «敵スポーナー» اسم بذار یا یه پوشه رو «فونت‌ها» — یونیتی درست ذخیره‌ش می‌کنه و بعد تا ابد بهت مربع خالی نشون می‌ده. اسست سالمه؛ رابط خودِ یونیتی با فونت خودِ یونیتی کشیده می‌شه و هیچ پکیج TextMeshPro ای تا حالا بهش دست نزده بود.',
    editorBody2: 'از مسیر Unity DirectTMP ▸ Editor Font می‌تونی نوار منو، Hierarchy، Inspector، پنجره‌ی Project و Console رو با فونتی که خودت انتخاب می‌کنی بکشی.',
    editorSafety: 'هیچ‌چیزی روی نصب یونیتی نوشته نمی‌شه. تغییر فقط توی حافظه‌ی همون سشن زندگی می‌کنه، پس بستن یونیتی همیشه همه‌چیز رو برمی‌گردونه — و فونتی که نتونه حروف لاتین و عدد رو بکشه اصلاً اعمال نمی‌شه، چون اون‌وقت خودِ گزینه‌ی «برگردون» هم مربع خالی می‌شد.',

    featuresTitle: 'چه‌کار می‌کند',
    catalogTitle: 'کاتالوگ فونت',
    catalogBody: 'همه‌ی فونت‌های پروژه و همه‌ی فونت‌های نصب‌شده روی سیستم توی یه لیست، و هر فایل مستقیم خونده می‌شه تا حقیقتش رو بگه: اسم خانواده‌ای که سازنده‌ی فونت نوشته، تعداد واقعی گلیف‌ها، و اینکه دقیقاً چه خط‌هایی رو می‌تونه بنویسه.',
    catalogAmber: 'سبز یعنی پوشش کامل، کهربایی یعنی ناقص. همون کهربایی نکته‌ی اصلیه: فونتی که عربی داره ولی پ گ چ ژ نداره نمی‌تونه فارسی بنویسه، و یه فلگ ساده‌ی «از عربی پشتیبانی می‌کند» با خیال راحت بهت می‌گه می‌تونه.',

    installTitle: 'نصب',
    installStep1: 'برو به Window ← Package Manager',
    installStep2: 'کلیک کن روی + ← Add package from git URL…',
    installStep3: 'این آدرس رو بچسبون و Add رو بزن:',
    copy: 'کپی',
    copied: 'کپی شد',

    requirementsTitle: 'پیش‌نیازها',
    reqUnity: 'یونیتی 2021.3 LTS به بعد (یونیتی ۶ هم پشتیبانی می‌شه)',
    reqTmp: 'TextMeshPro 3.0 به بعد — همراه خودِ یونیتی میاد',
    reqNone: 'بدون هیچ وابستگی دیگه‌ای به کتابخونه‌ی شخص‌ثالث',
    reqCost: 'بدون هزینه، بدون کد لایسنس، بدون حساب کاربری، بدون درخواست شبکه',

    faqTitle: 'سؤال‌های پرتکرار',
    faq: [
      {
        q: 'واقعاً رایگانه؟ گیرش کجاست؟',
        a: 'گیری نداره. لایسنس MIT، کل سورس روی گیت‌هاب، بدون تله‌ی نسخه‌ی پولی و بدون تلمتری. اگه به کارت اومد، یه ستاره روی ریپازیتوری تنها هزینه‌شه.'
      },
      {
        q: 'عوض کردن فونت ادیتور خطرناک نیست؟',
        a: 'برای همینه که فونتی که نتونه رابط خود ادیتور رو بکشه اصلاً اعمال نمی‌شه، نه اینکه فقط هشدار بگیره. تغییر هم فقط توی حافظه‌ی همون سشنه: چیزی روی نصب یونیتی نوشته نمی‌شه و بستن برنامه همیشه همه‌چیز رو برمی‌گردونه.'
      },
      {
        q: 'روی پرفورمنس بازی اثر می‌ذاره؟',
        a: 'هر گلیف فقط یه بار ساخته می‌شه و بعدش کَش می‌مونه؛ هزینه‌ش بار اوله، نه هر فریم. فونت‌ها هم بر اساس (فایل + سایز + حالت رندر) کش می‌شن، پس صفحه‌ای با ۲۰۰ لیبل که همه یه فونت دارن فقط یه اطلس می‌سازه. برای متن‌های سنگین CJK هم Preload هست.'
      },
      {
        q: 'حروف فارسی به هم می‌چسبن؟',
        a: 'گلیف‌ها رندر می‌شن، ولی شکل‌دهی و اتصال حروف (Shaping) هنوز توی نقشه‌ی راهه. فعلاً برای متن‌های آماده‌ی از قبل شکل‌داده‌شده یا همراه یه کتابخونه‌ی RTL کار می‌کنه.'
      },
      {
        q: 'باید فونت رو توی بیلد بذارم؟',
        a: 'اگه فونت همراه بازی ارسال می‌شه، بله — و بررسی لایسنس فونت با خودته، چون قرار دادن یه .ttf داخل بیلد یعنی بازنشر. ویژگی فونتِ ادیتور اما چیزی رو بازنشر نمی‌کنه؛ فقط ادیتور رو به فونتی که از قبل روی سیستمته وصل می‌کنه.'
      }
    ],

    alsoTitle: 'از همین قفسه',
    back: 'همه‌ی ابزارها',
    themeToLight: 'حالت روشن',
    themeToDark: 'حالت تاریک',
    footerTagline: 'ابزارهای یونیتی و سامانه‌ی پروکسی AmirCollider.',
    footerPowered: 'اجرا شده روی Cloudflare Workers'
  },

  en: {
    locale: 'en-US',
    dir: 'ltr',
    langName: 'English',

    title: 'Unity DirectTMP',
    tagline: 'Hand TextMeshPro the font file itself — and every language just works.',
    lede: 'It gives TextMeshPro the .ttf or .otf itself instead of a pre-baked SDF font asset. Glyphs are rasterized from the file the moment they are first drawn, so Persian, Arabic, Japanese, Chinese and Korean render with nothing to configure.',
    priceBadge: 'Free · MIT · no licence key',
    ctaInstall: 'Install it',
    ctaRepo: 'GitHub',

    problemTitle: 'The problem, in one picture',
    problemBody: 'You find a font, drop it into Unity, spend an hour in the Font Asset Creator picking character ranges — and the moment a player types their own name in Persian, you get this:',
    problemBad: 'سلام دنیا',
    problemGood: 'سلام دنیا',
    problemBadLabel: 'with a baked font asset',
    problemGoodLabel: 'with DirectTMP',
    problemAfter: 'The font file already knows exactly which glyphs it has. DirectTMP just stops pretending it does not.',

    editorTitle: 'And it works on Unity itself',
    editorBadge: 'New in 1.0',
    editorBody: 'Name a GameObject 敵スポーナー or a folder فونت‌ها, and Unity will store it correctly and then show you empty boxes forever. The asset is fine; Unity’s own interface is drawn with Unity’s own font, and nothing in a TextMeshPro package has ever touched it.',
    editorBody2: 'Unity DirectTMP ▸ Editor Font points the menu bar, the Hierarchy, the Inspector, the Project window and the Console at a font of your choosing.',
    editorSafety: 'Nothing is written to your Unity installation. The change lives in memory for the session, so quitting Unity always restores the default — and a font that cannot draw Latin letters and digits is refused rather than applied, because otherwise the Revert command itself would be a row of empty boxes.',

    featuresTitle: 'What it does',
    catalogTitle: 'The Font Catalog',
    catalogBody: 'Every font in the project and every font installed on the machine in one list, each file read directly to tell you the truth about it: the family name the foundry wrote, the real glyph count, and exactly which writing systems it can set.',
    catalogAmber: 'Green is full coverage, amber is partial. The amber is the point: a font with Arabic but without پ گ چ ژ cannot set Persian, and a plain "supports Arabic" flag will happily tell you it can.',

    installTitle: 'Install',
    installStep1: 'Open Window → Package Manager',
    installStep2: 'Click + → Add package from git URL…',
    installStep3: 'Paste this and press Add:',
    copy: 'Copy',
    copied: 'Copied',

    requirementsTitle: 'Requirements',
    reqUnity: 'Unity 2021.3 LTS or newer (Unity 6 supported)',
    reqTmp: 'TextMeshPro 3.0+ — bundled with Unity itself',
    reqNone: 'No other third-party dependencies',
    reqCost: 'No cost, no licence key, no account, no network requests',

    faqTitle: 'Frequently asked',
    faq: [
      {
        q: 'It is really free? What is the catch?',
        a: 'There is no catch. MIT licensed, the whole source is on GitHub, there is no paid tier waiting to appear and no telemetry. If it saves you an afternoon, a star on the repo is the whole price.'
      },
      {
        q: 'Is changing the Editor font risky?',
        a: 'That is exactly why a font which cannot draw the Editor’s own interface is refused rather than warned about. And the change is memory-only: nothing is written to your Unity installation, so quitting Unity always restores everything.'
      },
      {
        q: 'What does it cost at runtime?',
        a: 'Each glyph is rasterized once and then cached — the cost lands on first use, never per frame. Fonts are cached per (file + sampling size + render mode), so a screen with 200 labels sharing one font builds exactly one atlas. For a wall of brand-new CJK text there is Preload.'
      },
      {
        q: 'Does Persian text join up properly?',
        a: 'Glyphs render, but contextual shaping — the joining forms — is still on the roadmap. Today it works for text that is already shaped, or alongside an RTL shaping library.'
      },
      {
        q: 'Do I have to ship the font in my build?',
        a: 'If the font ships with your game, yes — and checking its licence is still yours to do, because putting a .ttf inside a build is redistribution. The Editor-font feature redistributes nothing: it only points the Editor at a font already on your machine.'
      }
    ],

    alsoTitle: 'Also on this shelf',
    back: 'All tools',
    themeToLight: 'Light mode',
    themeToDark: 'Dark mode',
    footerTagline: 'Unity tools and the AmirCollider proxy.',
    footerPowered: 'Powered by Cloudflare Workers'
  },

  ja: {
    locale: 'ja-JP',
    dir: 'ltr',
    langName: '日本語',

    title: 'Unity DirectTMP',
    tagline: 'フォントファイルをそのまま TextMeshPro へ。どんな言語も、そのまま表示されます。',
    lede: '焼き込み済みの SDF フォントアセットではなく、.ttf / .otf そのものを TextMeshPro に渡します。グリフは最初に描画された瞬間にファイルから生成されるため、日本語・中国語・韓国語・ペルシャ語・アラビア語が設定なしで表示されます。',
    priceBadge: '無料 · MIT · ライセンスキー不要',
    ctaInstall: '導入する',
    ctaRepo: 'GitHub',

    problemTitle: '問題を 1 枚の絵で',
    problemBody: 'フォントを見つけて Unity に入れ、Font Asset Creator で 1 時間かけて文字範囲を選ぶ——それでもプレイヤーが自分の名前を日本語で入力した瞬間、こうなります:',
    problemBad: 'こんにちは世界',
    problemGood: 'こんにちは世界',
    problemBadLabel: '焼き込み済みフォントアセット',
    problemGoodLabel: 'DirectTMP',
    problemAfter: 'どのグリフを持っているかは、フォントファイル自身がとっくに知っています。DirectTMP は、それを知らないふりをするのをやめただけです。',

    editorTitle: 'Unity 自身にも効きます',
    editorBadge: '1.0 の新機能',
    editorBody: 'GameObject に「敵スポーナー」と名前を付けたり、フォルダーを「فونت‌ها」と名付けたりすると、Unity はそれを正しく保存したうえで豆腐を表示し続けます。アセットは正常で、Unity 自身の UI が Unity のフォントで描画されているだけです。',
    editorBody2: 'Unity DirectTMP ▸ Editor Font から、メニューバー・Hierarchy・Inspector・Project ウィンドウ・Console を、選んだフォントで描画できます。',
    editorSafety: 'Unity のインストール先には一切書き込みません。変更はセッション中のメモリ上だけに存在するため、Unity を終了すれば必ず既定に戻ります。ラテン文字や数字を描画できないフォントは、警告ではなく適用そのものを拒否します——そうでなければ「元に戻す」項目自体が豆腐になるからです。',

    featuresTitle: 'できること',
    catalogTitle: 'フォントカタログ',
    catalogBody: 'プロジェクト内と この PC のすべてのフォントを一覧し、各ファイルを直接読んで実態を表示します。フォント制作者が書き込んだファミリー名、実際のグリフ数、そして対応している文字体系。',
    catalogAmber: '緑は完全収録、琥珀は一部収録です。この琥珀が肝心で、アラビア文字を持っていても پ گ چ ژ を持たないフォントはペルシャ語を組めませんが、「アラビア文字対応」という単純なフラグは平然と「対応」と答えます。',

    installTitle: '導入',
    installStep1: 'Window → Package Manager を開く',
    installStep2: '+ → Add package from git URL… をクリック',
    installStep3: 'これを貼り付けて Add:',
    copy: 'コピー',
    copied: 'コピーしました',

    requirementsTitle: '必要環境',
    reqUnity: 'Unity 2021.3 LTS 以降(Unity 6 対応)',
    reqTmp: 'TextMeshPro 3.0 以降 — Unity に同梱',
    reqNone: 'その他のサードパーティ依存なし',
    reqCost: '無料・ライセンスキー不要・アカウント不要・通信なし',

    faqTitle: 'よくある質問',
    faq: [
      {
        q: '本当に無料ですか?',
        a: '無料です。MIT ライセンスで、ソースはすべて GitHub にあります。あとから有料版が出てくることも、テレメトリもありません。役に立ったら、リポジトリへの ⭐ が唯一の対価です。'
      },
      {
        q: 'エディタのフォントを変えるのは危険では?',
        a: 'だからこそ、エディタの UI を描画できないフォントは警告ではなく適用を拒否します。変更はメモリ上だけで、Unity のインストール先には何も書き込まないため、終了すれば必ず元に戻ります。'
      },
      {
        q: '実行時のコストは?',
        a: '各グリフのラスタライズは 1 回きりで、その後はキャッシュされます。フォントは(ファイル + サイズ + レンダーモード)ごとにキャッシュされるため、同じフォントのラベルが 200 個ある画面でもアトラスは 1 枚です。大量の CJK テキストには Preload があります。'
      },
      {
        q: 'アラビア文字の接続形は?',
        a: 'グリフは表示されますが、接続形へのシェーピングはロードマップ上です。現状は整形済みのテキスト、または RTL シェーピングライブラリと併用してご利用ください。'
      },
      {
        q: 'フォントをビルドに同梱する必要は?',
        a: 'ゲームと一緒に配布するなら必要です。ビルドに .ttf を含めることは再配布にあたるため、ライセンスの確認はご自身でお願いします。エディタのフォント機能は何も再配布せず、すでに PC にあるフォントを参照するだけです。'
      }
    ],

    alsoTitle: '同じ棚から',
    back: 'すべてのツール',
    themeToLight: 'ライトモード',
    themeToDark: 'ダークモード',
    footerTagline: 'AmirCollider の Unity ツールとプロキシ。',
    footerPowered: 'Cloudflare Workers で稼働'
  }
}


// ==========================================
// The feature grid.
// ==========================================
const FEATURES = [
  {
    mark: '🅰️',
    fa: ['فایل فونت رو بده، نه فونت‌اسِت رو', 'یه .ttf یا .otf رو بکش روی کامپوننت، تموم. کارهای SDF بی‌سروصدا پشت صحنه انجام می‌شه.'],
    en: ['Point at a font file, not a font asset', 'Drag a .ttf or .otf onto the component and you are done. The SDF side is handled quietly in the background.'],
    ja: ['指定するのはフォントアセットではなくファイル', '.ttf / .otf をコンポーネントにドラッグするだけ。SDF まわりは裏側で処理されます。']
  },
  {
    mark: '🌏',
    fa: ['هر خطی که فونت داره، همون لحظه', 'فونتی که ۲۰٬۰۰۰ کانجی داره، واقعاً ۲۰٬۰۰۰ کانجی داره. دیگه هیچ‌وقت لازم نیست لیست کاراکترها رو دستی بنویسی.'],
    en: ['Every script the font supports, instantly', 'A font that covers 20,000 kanji covers 20,000 kanji. You never enumerate a character set again.'],
    ja: ['フォントが持つ文字は、すべてそのまま', '2 万字の漢字を含むフォントなら 2 万字そのまま使えます。文字セットの列挙はもう不要です。']
  },
  {
    mark: '🔗',
    fa: ['زنجیره‌ی فال‌بک با ترتیب خودت', 'یه فونت لاتین، یه CJK و یه فونت نماد رو پشت سر هم بچین؛ برای هر کاراکتر اولین فونتی که اون رو داره انتخاب می‌شه.'],
    en: ['Fallback chains, ordered by you', 'Line up a Latin UI font, a CJK font and a symbol font; the first one that actually has a given character supplies it.'],
    ja: ['順序を自分で決めるフォールバック', '欧文 UI・CJK・記号フォントを並べれば、その文字を持つ最初のフォントが 1 文字ごとに選ばれます。']
  },
  {
    mark: '💾',
    fa: ['لود فونت در زمان اجرا', 'از StreamingAssets، از persistentDataPath، از یه byte[] دانلودشده، یا از فونت‌های نصب‌شده‌ی خود کاربر.'],
    en: ['Load fonts at runtime', 'From StreamingAssets, persistentDataPath, a downloaded byte[], or the player’s own installed fonts.'],
    ja: ['実行時のフォント読み込み', 'StreamingAssets、persistentDataPath、ダウンロードした byte[]、OS のインストール済みフォントから。']
  },
  {
    mark: '♻️',
    fa: ['کش می‌شه، دوباره ساخته نمی‌شه', 'یه صفحه با ۲۰۰ لیبل که همه یه فونت دارن، فقط و فقط یه اطلس می‌سازه.'],
    en: ['Cached, not rebuilt', 'A screen with 200 labels sharing one font builds exactly one atlas.'],
    ja: ['作り直さず、キャッシュする', '同じフォントのラベルが 200 個ある画面でも、アトラスは 1 枚だけです。']
  },
  {
    mark: '🩺',
    fa: ['بررسی سلامت که خودش رو توضیح می‌ده', 'می‌گه چی کار می‌کنه، چی کار نمی‌کنه و چرا؛ هرچی رو بشه با یه کلیک درست می‌کنه و کل گزارش رو برای ثبت باگ کپی می‌کنه.'],
    en: ['A health check that explains itself', 'It says what works, what does not and why, fixes what it can in one click, and copies the whole report for a bug report.'],
    ja: ['理由まで説明する動作チェック', '何が動き何が動かないかとその理由を示し、直せるものはワンクリックで直し、レポート全体をコピーします。']
  }
]


function pack(lang) {
  return I18N[resolveLang(lang)]
}

function featureFor(feature, lang) {
  const pair = feature[resolveLang(lang)] || feature.en
  return { mark: feature.mark, title: pair[0], body: pair[1] }
}


// A string that will sit inside a single-quoted JavaScript
// literal in an inline handler. Escaping for HTML is not
// enough there - a quote or a backslash breaks out of the
// literal rather than out of the attribute.
function escapeJs(value) {
  return String(value == null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r?\n/g, '\\n')
    .replace(/</g, '\\u003c')
}


// ==========================================
// SVG icon set
// ==========================================
const ICONS = {
  contrast: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor" stroke="none"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  download: '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/>'
}

function icon(name, cls) {
  return '<svg class="' + (cls || 'd-ic') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
    + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + (ICONS[name] || '') + '</svg>'
}


// ==========================================
// Inky
// ==========================================
function inky(size) {
  return `
  <svg class="inky" width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="Inky, the Unity DirectTMP mascot">
    <g class="inky-bubbles">
      <circle cx="23.5" cy="15.5" r="8.8" fill="${PAPER}" stroke="${NIGHT}" stroke-width="2.4"/>
      <text x="23.5" y="19.4" text-anchor="middle" font-size="10" font-weight="700" fill="${NIGHT}">A</text>
      <circle cx="50" cy="9.5" r="7.6" fill="${PAPER}" stroke="${NIGHT}" stroke-width="2.2"/>
      <text x="50" y="13.2" text-anchor="middle" font-size="9" fill="${NIGHT}">&#12354;</text>
      <circle cx="76" cy="18" r="6.4" fill="${PAPER}" stroke="${NIGHT}" stroke-width="2"/>
      <text x="76" y="21.4" text-anchor="middle" font-size="9" fill="${NIGHT}">&#1587;</text>
    </g>
    <path d="M52 59 L79 30" stroke="${NIGHT}" stroke-width="11" stroke-linecap="round"/>
    <path d="M52 59 L79 30" stroke="${BRASS}" stroke-width="7" stroke-linecap="round"/>
    <path d="M74 35 L84 25 L79 39 Z" fill="${BRASS}" stroke="${NIGHT}" stroke-width="2.2" stroke-linejoin="round"/>
    <circle cx="79.5" cy="30.5" r="1.9" fill="${NIGHT}"/>
    <path d="M22 55 h56 a9 9 0 0 1 9 9 v14 a9 9 0 0 1 -9 9 h-56 a9 9 0 0 1 -9 -9 v-14 a9 9 0 0 1 9 -9 z"
          fill="${INK}" stroke="${NIGHT}" stroke-width="3.2" stroke-linejoin="round"/>
    <rect x="13" y="66" width="74" height="9" fill="${PAPER}" opacity="0.94"/>
    <ellipse cx="50" cy="53" rx="21.5" ry="6" fill="${INK_DEEP}" stroke="${NIGHT}" stroke-width="3"/>
    <ellipse cx="50" cy="52" rx="15" ry="3" fill="${INK}" opacity="0.55"/>
    <circle cx="41" cy="82" r="2.9" fill="${NIGHT}"/>
    <circle cx="59" cy="82" r="2.9" fill="${NIGHT}"/>
    <circle cx="40.1" cy="81.1" r="0.95" fill="${PAPER}"/>
    <circle cx="58.1" cy="81.1" r="0.95" fill="${PAPER}"/>
    <ellipse cx="33.5" cy="85" rx="3.6" ry="2.4" fill="${BLUSH}" opacity="0.65"/>
    <ellipse cx="66.5" cy="85" rx="3.6" ry="2.4" fill="${BLUSH}" opacity="0.65"/>
    <path d="M45.5 86.5 Q50 90.5 54.5 86.5" stroke="${NIGHT}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  </svg>`
}


// ==========================================
// Stylesheet
//
// The site's token layer, with the accent swapped for the
// tool's own teal so the page reads as the product rather
// than as the site.
// ==========================================
function getCSS() {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }

    html { scrollbar-width: none; -ms-overflow-style: none; scroll-behavior: smooth; }
    html::-webkit-scrollbar { width: 0; height: 0; display: none; }

    :root {
      --ink: ${INK};
      --ink-deep: ${INK_DEEP};
      --brass: ${BRASS};
      --paper: ${PAPER};
      --blush: ${BLUSH};

      --radius: 18px;
      --maxw: 940px;

      --bg-1: #0d1416;
      --bg-2: #0f2226;
      --surface: rgba(255,255,255,0.045);
      --surface-2: rgba(255,255,255,0.085);
      --border: rgba(255,255,255,0.11);
      --text: rgba(255,255,255,0.92);
      --text-dim: rgba(255,255,255,0.60);
      --accent: #2aa7b4;
      color-scheme: dark;
    }

    @media (prefers-color-scheme: light) {
      :root:not([data-theme]) {
        --bg-1: ${PAPER};
        --bg-2: #f0e9dc;
        --surface: rgba(255,255,255,0.78);
        --surface-2: #ffffff;
        --border: rgba(27,23,37,0.12);
        --text: rgba(27,23,37,0.92);
        --text-dim: rgba(27,23,37,0.60);
        --accent: ${INK};
        color-scheme: light;
      }
    }

    :root[data-theme="light"] {
      --bg-1: ${PAPER};
      --bg-2: #f0e9dc;
      --surface: rgba(255,255,255,0.78);
      --surface-2: #ffffff;
      --border: rgba(27,23,37,0.12);
      --text: rgba(27,23,37,0.92);
      --text-dim: rgba(27,23,37,0.60);
      --accent: ${INK};
      color-scheme: light;
    }
    :root[data-theme="dark"] {
      --bg-1: #0d1416;
      --bg-2: #0f2226;
      --surface: rgba(255,255,255,0.045);
      --surface-2: rgba(255,255,255,0.085);
      --border: rgba(255,255,255,0.11);
      --text: rgba(255,255,255,0.92);
      --text-dim: rgba(255,255,255,0.60);
      --accent: #2aa7b4;
      color-scheme: dark;
    }

    body {
      font-family: 'Vazirmatn', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
      background: radial-gradient(1100px 620px at 50% -10%, var(--bg-2), var(--bg-1));
      background-attachment: fixed;
      color: var(--text);
      min-height: 100vh;
      line-height: 1.75;
      -webkit-font-smoothing: antialiased;
    }

    .wrap { max-width: var(--maxw); margin-inline: auto; padding: 26px 20px 60px; }

    /* ---------- topbar ---------- */
    .topbar {
      display: flex; align-items: center; justify-content: space-between;
      gap: 14px; flex-wrap: wrap; margin-block-end: 26px;
    }
    .brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .brand-logo {
      width: 42px; height: 42px; border-radius: 12px; overflow: hidden;
      display: grid; place-items: center;
      background: var(--surface); border: 1px solid var(--border); flex: none;
    }
    .brand-logo img { width: 100%; height: 100%; object-fit: cover; }
    .brand-name { font-weight: 800; }
    .brand-sub { font-size: 0.82em; color: var(--text-dim); }
    .controls { display: flex; align-items: center; gap: 10px; }
    .seg {
      display: inline-flex; padding: 3px; gap: 2px; border-radius: 999px;
      background: var(--surface); border: 1px solid var(--border);
    }
    .seg button {
      appearance: none; border: 0; cursor: pointer; font: inherit;
      padding: 6px 12px; border-radius: 999px; font-size: 0.82em; font-weight: 600;
      background: transparent; color: var(--text-dim);
    }
    .seg button[aria-pressed="true"] { background: var(--surface-2); color: var(--text); }
    .icon-btn {
      appearance: none; cursor: pointer; width: 38px; height: 38px;
      display: grid; place-items: center; border-radius: 12px;
      background: var(--surface); border: 1px solid var(--border); color: var(--text);
    }
    .icon-btn svg { width: 19px; height: 19px; }

    /* ---------- hero ---------- */
    .hero { text-align: center; margin-block-end: 40px; }
    .inky { display: block; margin-inline: auto; margin-block-end: 6px; }
    .hero h1 { font-size: clamp(2em, 6vw, 3em); font-weight: 800; letter-spacing: -0.02em; }
    .hero .tagline {
      font-size: 1.08em; font-weight: 600; margin-block-start: 6px;
      color: color-mix(in srgb, var(--accent) 62%, var(--text));
    }
    .hero .lede { color: var(--text-dim); max-width: 62ch; margin-inline: auto; margin-block-start: 12px; }

    .price-badge {
      display: inline-flex; align-items: center; gap: 8px; margin-block-start: 16px;
      padding: 7px 16px; border-radius: 999px; font-weight: 700; font-size: 0.88em;
      color: color-mix(in srgb, var(--accent) 60%, var(--text));
      background: color-mix(in srgb, var(--accent) 13%, transparent);
      border: 1px solid color-mix(in srgb, var(--accent) 36%, transparent);
    }

    .cta-row { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-block-start: 20px; }
    .btn {
      display: inline-flex; align-items: center; gap: 9px;
      padding: 12px 22px; border-radius: 13px; text-decoration: none;
      font-weight: 700; font-size: 0.94em; border: 1px solid var(--border);
      background: var(--surface); color: var(--text);
      transition: transform 0.18s ease, border-color 0.18s ease;
    }
    .btn:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--accent) 46%, var(--border)); }
    .btn svg { width: 18px; height: 18px; }
    .btn-primary {
      background: linear-gradient(135deg, var(--ink), var(--ink-deep));
      border-color: transparent; color: #fff;
    }

    /* ---------- sections ---------- */
    section { margin-block-end: 46px; }
    .section-title {
      font-size: 1.35em; font-weight: 800; margin-block-end: 6px;
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    }
    .section-lede { color: var(--text-dim); margin-block-end: 18px; }
    .badge-new {
      font-size: 0.6em; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase;
      padding: 3px 10px; border-radius: 999px; color: #24170a;
      background: var(--brass);
    }

    .panel {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 22px;
    }
    .panel + .panel { margin-block-start: 14px; }
    .panel p + p { margin-block-start: 12px; }

    .note {
      border-inline-start: 3px solid color-mix(in srgb, var(--accent) 65%, transparent);
      padding-inline-start: 14px; color: var(--text-dim); font-size: 0.93em;
    }

    /* ---------- the tofu demo ----------
       The point of the whole page, so it is a real
       comparison rather than a screenshot: the same string
       twice, once in a font stack that cannot draw it. */
    .tofu-demo { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-block: 18px; }
    .tofu-card {
      background: var(--surface-2); border: 1px solid var(--border);
      border-radius: 14px; padding: 18px; text-align: center;
    }
    .tofu-card.is-bad { border-color: color-mix(in srgb, var(--blush) 42%, var(--border)); }
    .tofu-card.is-good { border-color: color-mix(in srgb, var(--accent) 48%, var(--border)); }
    .tofu-sample { font-size: 1.7em; font-weight: 700; line-height: 1.5; direction: rtl; }
    .tofu-card.is-bad .tofu-sample {
      color: color-mix(in srgb, var(--blush) 70%, var(--text));
      letter-spacing: 0.06em;
    }
    .tofu-label { font-size: 0.8em; color: var(--text-dim); margin-block-start: 8px; }

    /* ---------- feature grid ---------- */
    .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; }
    .feature {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 20px;
      transition: transform 0.18s ease, border-color 0.18s ease;
    }
    .feature:hover { transform: translateY(-3px); border-color: color-mix(in srgb, var(--accent) 40%, var(--border)); }
    .feature-mark { font-size: 1.6em; line-height: 1.2; }
    .feature h3 { font-size: 1.02em; font-weight: 700; margin-block: 8px 5px; }
    .feature p { font-size: 0.9em; color: var(--text-dim); }

    /* ---------- coverage badges ---------- */
    .badges { display: flex; flex-wrap: wrap; gap: 8px; margin-block-start: 14px; }
    .cov {
      font-size: 0.8em; font-weight: 700; padding: 4px 12px; border-radius: 999px;
      border: 1px solid transparent;
    }
    .cov.full {
      color: color-mix(in srgb, var(--accent) 62%, var(--text));
      background: color-mix(in srgb, var(--accent) 14%, transparent);
      border-color: color-mix(in srgb, var(--accent) 38%, transparent);
    }
    .cov.part {
      color: color-mix(in srgb, var(--brass) 70%, var(--text));
      background: color-mix(in srgb, var(--brass) 16%, transparent);
      border-color: color-mix(in srgb, var(--brass) 42%, transparent);
    }
    .cov.none { color: var(--text-dim); background: var(--surface-2); border-color: var(--border); }

    /* ---------- install ---------- */
    .steps { list-style: none; counter-reset: step; display: grid; gap: 12px; }
    .steps li { display: flex; align-items: flex-start; gap: 12px; }
    .steps li::before {
      counter-increment: step; content: counter(step);
      flex: none; width: 26px; height: 26px; border-radius: 50%;
      display: grid; place-items: center; font-size: 0.8em; font-weight: 800;
      color: #fff; background: var(--ink);
    }
    .copy-row {
      display: flex; align-items: stretch; gap: 8px; margin-block-start: 8px; flex-wrap: wrap;
    }
    .copy-url {
      flex: 1 1 300px; min-width: 0; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.86em; padding: 11px 14px; border-radius: 11px; direction: ltr; text-align: start;
      background: var(--surface-2); border: 1px solid var(--border); color: var(--text);
      overflow-x: auto; white-space: nowrap;
    }
    .copy-btn {
      appearance: none; cursor: pointer; font: inherit; font-weight: 700; font-size: 0.86em;
      padding: 11px 18px; border-radius: 11px; border: 1px solid transparent;
      background: var(--ink); color: #fff;
    }

    /* ---------- requirements ---------- */
    .reqs { list-style: none; display: grid; gap: 9px; }
    .reqs li { display: flex; align-items: flex-start; gap: 10px; font-size: 0.94em; }
    .reqs svg {
      width: 18px; height: 18px; flex: none; margin-block-start: 5px;
      color: color-mix(in srgb, var(--accent) 62%, var(--text));
    }

    /* ---------- faq ---------- */
    details.faq {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 14px; padding: 14px 18px;
    }
    details.faq + details.faq { margin-block-start: 10px; }
    details.faq summary {
      cursor: pointer; font-weight: 700; list-style: none;
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
    }
    details.faq summary::-webkit-details-marker { display: none; }
    details.faq summary::after { content: '+'; font-weight: 800; color: var(--text-dim); }
    details.faq[open] summary::after { content: '−'; }
    details.faq p { color: var(--text-dim); font-size: 0.93em; margin-block-start: 10px; }

    /* ---------- also on this shelf ---------- */
    .shelf { display: grid; gap: 12px; }
    .shelf a {
      display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
      padding: 18px; border-radius: var(--radius); text-decoration: none; color: var(--text);
      background: var(--surface); border: 1px solid var(--border);
      transition: transform 0.18s ease, border-color 0.18s ease;
    }
    .shelf a:hover { transform: translateY(-3px); border-color: color-mix(in srgb, var(--accent) 40%, var(--border)); }
    .shelf-mark { font-size: 1.8em; }
    .shelf-body { flex: 1 1 240px; min-width: 0; }
    .shelf-name { font-weight: 800; }
    .shelf-desc { font-size: 0.88em; color: var(--text-dim); }
    .shelf-cta { font-weight: 700; font-size: 0.9em; color: color-mix(in srgb, var(--accent) 58%, var(--text)); }

    /* ---------- nav & footer ---------- */
    .nav { display: flex; justify-content: center; margin-block: 30px 24px; }
    .back-link {
      display: inline-flex; align-items: center; gap: 9px;
      padding: 11px 18px; border-radius: 13px; text-decoration: none;
      font-weight: 600; font-size: 0.9em; color: var(--text);
      background: var(--surface); border: 1px solid var(--border);
    }
    .back-link svg { width: 18px; height: 18px; }

    /* The brand mark in the corner is a link home now, so it needs
       to stop looking like body text when it is hovered. */
    .brand { text-decoration: none; color: inherit; transition: opacity 0.18s ease; }
    .brand:hover { opacity: 0.82; }

    @media (max-width: 620px) {
      .tofu-demo { grid-template-columns: 1fr; }
    }

    @media (prefers-reduced-motion: no-preference) {
      .topbar, .hero, section { animation: uRise 0.5s cubic-bezier(0.16,1,0.3,1) both; }
      .hero { animation-delay: 0.05s; }
      .inky { animation: uFloat 4.5s ease-in-out infinite; }
    }
    @keyframes uRise  { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes uFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
  `
}


// ==========================================
// Partials
// ==========================================
function renderTopbar(lang, amirLogo) {
  const p = pack(lang)
  const cur = resolveLang(lang)
  const langs = [['fa', I18N.fa.langName], ['en', I18N.en.langName], ['ja', I18N.ja.langName]]

  const segButtons = langs.map(([code, label]) =>
    '<button type="button" aria-pressed="' + (code === cur ? 'true' : 'false') + '"'
    + ' onclick="acSetLang(\'' + code + '\')" lang="' + code + '">' + escapeHtml(label) + '</button>'
  ).join('')

  return `
    <div class="topbar">
      <a class="brand" href="/" aria-label="AmirCollider">
        <span class="brand-logo">
          <img src="${escapeHtml(amirLogo)}" alt="" onerror="this.style.display='none'">
        </span>
        <span>
          <span class="brand-name">AmirCollider</span><br>
          <span class="brand-sub">Unity DirectTMP v${escapeHtml(VERSION)}</span>
        </span>
      </a>
      <div class="controls">
        <div class="seg" role="group" aria-label="${escapeHtml(p.langName)}">${segButtons}</div>
        <button type="button" id="themeBtn" class="icon-btn" onclick="acToggleTheme()"
                aria-label="${escapeHtml(p.themeToDark)}">${icon('contrast')}</button>
      </div>
    </div>`
}

function renderHero(lang) {
  const p = pack(lang)
  return `
    <div class="hero">
      ${inky(120)}
      <h1>${escapeHtml(p.title)}</h1>
      <div class="tagline">${escapeHtml(p.tagline)}</div>
      <p class="lede">${escapeHtml(p.lede)}</p>
      <div class="price-badge">${escapeHtml(p.priceBadge)}</div>
      <div class="cta-row">
        <a class="btn btn-primary" href="#install">${icon('download')}<span>${escapeHtml(p.ctaInstall)}</span></a>
        <a class="btn" href="${escapeHtml(REPO_URL)}" rel="noopener">${escapeHtml(p.ctaRepo)}</a>
      </div>
    </div>`
}

// The tofu comparison.
function renderProblem(lang) {
  const p = pack(lang)
  const boxes = Array.from(p.problemBad.replace(/\s/g, '')).map(() => '□').join('')

  return `
    <section id="problem">
      <h2 class="section-title">${escapeHtml(p.problemTitle)}</h2>
      <p class="section-lede">${escapeHtml(p.problemBody)}</p>
      <div class="tofu-demo">
        <div class="tofu-card is-bad">
          <div class="tofu-sample" aria-label="${escapeHtml(p.problemBadLabel)}">${escapeHtml(boxes)}</div>
          <div class="tofu-label">${escapeHtml(p.problemBadLabel)}</div>
        </div>
        <div class="tofu-card is-good">
          <div class="tofu-sample">${escapeHtml(p.problemGood)}</div>
          <div class="tofu-label">${escapeHtml(p.problemGoodLabel)}</div>
        </div>
      </div>
      <p class="note">${escapeHtml(p.problemAfter)}</p>
    </section>`
}

function renderEditorFont(lang) {
  const p = pack(lang)
  return `
    <section id="editor-font">
      <h2 class="section-title">
        <span>${escapeHtml(p.editorTitle)}</span>
        <span class="badge-new">${escapeHtml(p.editorBadge)}</span>
      </h2>
      <div class="panel">
        <p>${escapeHtml(p.editorBody)}</p>
        <p>${escapeHtml(p.editorBody2)}</p>
        <p class="note">${escapeHtml(p.editorSafety)}</p>
      </div>
    </section>`
}

function renderCatalog(lang) {
  const p = pack(lang)

  // A miniature of the real badge row, using the same three
  // states the tool uses. It is the fastest way to explain
  // what "partial" means without a screenshot.
  const badges = [
    ['full', 'Latin'], ['full', 'Cyrillic'], ['full', 'Kana'], ['full', 'Han'],
    ['part', 'Arabic script ~'], ['none', 'Hebrew'], ['none', 'Thai']
  ].map(([kind, label]) => '<span class="cov ' + kind + '">' + escapeHtml(label) + '</span>').join('')

  return `
    <section id="catalog">
      <h2 class="section-title">${escapeHtml(p.catalogTitle)}</h2>
      <div class="panel">
        <p>${escapeHtml(p.catalogBody)}</p>
        <div class="badges">${badges}</div>
        <p class="note">${escapeHtml(p.catalogAmber)}</p>
      </div>
    </section>`
}

function renderFeatures(lang) {
  const p = pack(lang)
  const cards = FEATURES.map(raw => {
    const f = featureFor(raw, lang)
    return `
      <div class="feature">
        <div class="feature-mark" aria-hidden="true">${f.mark}</div>
        <h3>${escapeHtml(f.title)}</h3>
        <p>${escapeHtml(f.body)}</p>
      </div>`
  }).join('')

  return `
    <section id="features">
      <h2 class="section-title">${escapeHtml(p.featuresTitle)}</h2>
      <div class="features">${cards}</div>
    </section>`
}

function renderInstall(lang) {
  const p = pack(lang)
  return `
    <section id="install">
      <h2 class="section-title">${escapeHtml(p.installTitle)}</h2>
      <div class="panel">
        <ol class="steps">
          <li><span>${escapeHtml(p.installStep1)}</span></li>
          <li><span>${escapeHtml(p.installStep2)}</span></li>
          <li>
            <span>
              ${escapeHtml(p.installStep3)}
              <span class="copy-row">
                <code class="copy-url" id="gitUrl">${escapeHtml(GIT_URL)}</code>
                <button type="button" class="copy-btn" id="copyBtn"
                        data-copied="${escapeHtml(p.copied)}"
                        onclick="acCopy('${escapeJs(GIT_URL)}')">${escapeHtml(p.copy)}</button>
              </span>
            </span>
          </li>
        </ol>
      </div>
    </section>`
}

function renderRequirements(lang) {
  const p = pack(lang)
  const items = [p.reqUnity, p.reqTmp, p.reqNone, p.reqCost]
    .map(item => '<li>' + icon('check') + '<span>' + escapeHtml(item) + '</span></li>')
    .join('')

  return `
    <section id="requirements">
      <h2 class="section-title">${escapeHtml(p.requirementsTitle)}</h2>
      <div class="panel"><ul class="reqs">${items}</ul></div>
    </section>`
}

function renderFaq(lang) {
  const p = pack(lang)
  const items = p.faq.map(entry => `
    <details class="faq">
      <summary>${escapeHtml(entry.q)}</summary>
      <p>${escapeHtml(entry.a)}</p>
    </details>`).join('')

  return `
    <section id="faq">
      <h2 class="section-title">${escapeHtml(p.faqTitle)}</h2>
      ${items}
    </section>`
}

// The rest of the shelf, read from the catalogue rather than
// hard-coded - so a third tool appears here the moment it is
// added, and never has to be remembered.
function renderShelf(lang) {
  const p = pack(lang)
  const resolved = resolveLang(lang)
  const neighbours = otherTools('unity-directtmp')
  if (neighbours.length === 0) return ''

  const cards = neighbours.map(tool => {
    const tagline = tool.i18n.tagline[resolved] || tool.i18n.tagline.en
    const cta = tool.i18n.cta[resolved] || tool.i18n.cta.en
    return `
      <a href="${escapeHtml(tool.href)}">
        <span class="shelf-mark" aria-hidden="true">${tool.mark}</span>
        <span class="shelf-body">
          <span class="shelf-name">${escapeHtml(tool.name)}</span><br>
          <span class="shelf-desc">${escapeHtml(tagline)}</span>
        </span>
        <span class="shelf-cta">${escapeHtml(cta)} &rarr;</span>
      </a>`
  }).join('')

  return `
    <section id="shelf">
      <h2 class="section-title">${escapeHtml(p.alsoTitle)}</h2>
      <div class="shelf">${cards}</div>
    </section>`
}


// ==========================================
// Page
// ==========================================
function createPage(lang, theme) {
  const amirLogo = CONFIG.AMIR_LOGO
  const resolved = resolveLang(lang)
  const p = pack(resolved)
  const site = NAV_I18N[resolved]
  const themeAttr = theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : ''
  const title = `${p.title} — ${p.tagline}`
  const trail = [
    { href: '/', label: site.home },
    { href: '/tools', label: site.tools },
    { href: '/unity-directtmp', label: 'Unity DirectTMP' }
  ]

  return `<!DOCTYPE html>
<html dir="${p.dir}" lang="${resolved}"${themeAttr}>
<head>
  ${getPageHead({ title, amirLogo, description: p.lede })}
  ${seoHead({
    path: '/unity-directtmp',
    title,
    description: p.lede,
    lang: resolved,
    type: 'product',
    graph: [
      breadcrumbLd(trail),
      softwareApplicationLd({
        name: 'Unity DirectTMP',
        description: p.lede,
        path: '/unity-directtmp',
        version: CONFIG.DIRECTTMP.VERSION,
        price: '0',
        repo: CONFIG.DIRECTTMP.REPO_URL
      })
    ]
  })}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  ${themeBootScript()}
  <style>${siteNavCss()}${getCSS()}</style>
</head>
<body>
  <div class="wrap">
    ${renderTopbar(resolved, amirLogo)}
    ${siteBreadcrumb({ lang: resolved, trail })}
    <main id="main">
      ${renderHero(resolved)}
      ${renderProblem(resolved)}
      ${renderEditorFont(resolved)}
      ${renderCatalog(resolved)}
      ${renderFeatures(resolved)}
      ${renderInstall(resolved)}
      ${renderRequirements(resolved)}
      ${renderFaq(resolved)}
      ${renderShelf(resolved)}
    </main>
    ${siteFooter({ lang: resolved })}
  </div>
  ${chromeScript()}
  ${copyUrlScript()}
</body>
</html>`
}


// ==========================================
// copyUrlScript
// The one behaviour this page has beyond the shared chrome:
// copying the git URL of the package.
//
// The clipboard API needs a secure context and a user gesture,
// and refuses in a few embedded browsers even with both. The
// fallback selects the URL so a person can copy it themselves,
// rather than pressing a button that silently does nothing.
// ==========================================
function copyUrlScript() {
  return `<script>
    (function () {
      function acSelectUrl() {
        var el = document.getElementById('gitUrl');
        if (!el || !window.getSelection || !document.createRange) return;
        var range = document.createRange();
        range.selectNodeContents(el);
        var selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }

      window.acCopy = function (text) {
        var btn = document.getElementById('copyBtn');
        var done = function () {
          if (!btn) return;
          var original = btn.textContent;
          btn.textContent = btn.getAttribute('data-copied') || 'Copied';
          setTimeout(function () { btn.textContent = original; }, 1600);
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, acSelectUrl);
        } else {
          acSelectUrl();
        }
      };
    })();
  </script>`
}


// ==========================================
// Handler
// ==========================================
export async function handleUnityDirectTmp(url, request, gameId, requestId, GAMES, _env, availableEndpoints = []) {
  const cookies = parseCookies(request)
  const lang = resolveRequestLang(url, request, cookies)
  const theme = resolveRequestTheme(cookies)

  const headers = langCookieHeader(url, lang)

  return createHtmlResponse(createPage(lang, theme), 200, headers)
}
