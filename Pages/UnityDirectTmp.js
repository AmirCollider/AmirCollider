// ==========================================
// Pages/UnityDirectTmp.js
// The Unity DirectTMP product page: what the tool fixes,
// what it costs (nothing), how to install it, and what it
// deliberately does not do.
//
// Public entry:
//   handleUnityDirectTmp(url, request, gameId, requestId, GAMES, env)
//
// ---------------------------------------------------------------
// Why this page was rewritten, 2026-08-14
//
// It described a product that no longer exists. The page led on
// "Editor Font — New in 1.0" and gave a whole section to the Font
// Catalog and its coverage badges. Version 2.0.0 removed both, along
// with nine other windows and about 18,000 lines: read the Removed
// block of that release. The page was selling eleven things the
// package had deliberately stopped doing.
//
// Worse, its FAQ answered "Does Persian text join up properly?" with
// "contextual shaping is still on the roadmap". That has been the
// package's headline feature since 2.0.0 - joined shapes read out of
// the font's own GSUB table and diffed glyph-for-glyph against
// HarfBuzz across five faces. The one page on the internet whose job
// is to say the tool fixes Persian was telling every reader, and
// every crawler, that it does not.
//
// That is also the whole SEO story here. Somebody with this problem
// searches for the SYMPTOM - "unity persian text not joining",
// "مشکل فارسی در یونیتی", "Unity 日本語 豆腐" - never for a package
// name they have never heard. So the symptoms are on the page, in
// the words people actually type, in all three languages, as real
// content rather than as a keyword list. The specimen block renders
// the three broken states from actual text so the page proves the
// claim instead of asserting it.
//
// Every factual claim below is traceable to the shipping package:
// README.md, package.json and CHANGELOG.md of UnityDirectTMP 2.1.13.
// The honest-limits section exists because a tool page that only
// lists wins is a tool page nobody believes twice.
// ---------------------------------------------------------------
//
// Trilingual and theme-aware like every other page here.
// ==========================================

import { CONFIG } from '../Config.js'
import { getPageHead } from '../Core/DesignSystem.js'
import { createHtmlResponse } from '../Core/Http.js'
import { otherTools } from '../Content/ToolsCatalog.js'
import {
  VIDEOS, VIDEO_LANGS, PUBLISHED as VIDEOS_PUBLISHED,
  videoUrl, urlMap, totalSeconds, formatDuration, isoDuration
} from '../Content/DirectTmpVideos.js'

import { escapeHtml } from '../Core/Html.js'
import { chromeScript, themeBootScript } from '../Core/PageChrome.js'
import { seoHead, breadcrumbLd, softwareApplicationLd, faqPageLd, howToLd, videoObjectLd } from '../Core/Seo.js'
import { localizedPath } from '../Core/Locale.js'
import { siteNavCss, siteBreadcrumb, siteFooter, siteBackToTop, NAV_I18N } from '../Core/SiteNav.js'
import { langCookieHeader, parseCookies, resolveLang, resolveRequestLang, resolveRequestTheme } from '../Core/RequestContext.js'

const REPO_URL = CONFIG.DIRECTTMP.REPO_URL
const GIT_URL = CONFIG.DIRECTTMP.GIT_URL
const VERSION = CONFIG.DIRECTTMP.VERSION


// ==========================================
// The Inkwell palette.
// The same six values as DirectTMPConstants.cs and the README
// badges, so the package and the page that sells it are
// recognisably one product.
// ==========================================
const INK = '#14808C'
const INK_DEEP = '#0B5A63'
const BRASS = '#F0A73E'
const PAPER = '#FBF6EC'
const BLUSH = '#E8927C'
const NIGHT = '#1B1725'


// ==========================================
// The specimen
//
// One Persian sentence, rendered four ways, is the entire
// argument of this page. It is a specimen rather than UI text,
// so it is NOT translated - the Japanese reader is being shown
// what Persian does, and translating the sample would destroy
// the thing being demonstrated. The labels around it are
// translated; the sample is not.
//
// The three broken states are produced from the same string
// rather than screenshotted, which means they cannot go stale
// and they survive at any zoom level in any theme:
//
//   tofu      every character replaced with U+25A1, which is
//             literally what a font with no glyph for it draws
//   unjoined  a zero-width non-joiner between every character,
//             which stops the browser's own shaper from joining
//             exactly the way a missing GSUB lookup does
//   reversed  unjoined, plus CSS bidi-override, which forces
//             memory order onto the screen left-to-right - the
//             precise failure somebody means by "my Persian
//             comes out backwards"
// ==========================================
const SPECIMEN_FA = 'سلام، دنیا'
const SPECIMEN_MIX = '日本語 · 中文 · 한국어 · Кириллица · ไทย · 😀'
const ZWNJ = '‌'

function tofu(text) {
  return Array.from(String(text))
    .map(character => (/\s/.test(character) ? ' ' : '□'))
    .join('')
}

function unjoined(text) {
  return Array.from(String(text)).join(ZWNJ)
}


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
    tagline: 'حل مشکل متن فارسی و عربی در یونیتی — حروف چسبیده، ترتیب راست‌به‌چپ.',

    // See the note on the same two fields in Pages/UnityDocSnap.js.
    metaTitle: 'Unity DirectTMP — حل مشکل متن فارسی و عربی در یونیتی',
    metaDesc: 'Unity DirectTMP متن فارسی، عربی و اردو را در TextMeshPro با حروف چسبیده و ترتیب درست نشان می‌دهد. کافی است .ttf را روی لیبل بگذاری. رایگان و متن‌باز.',
    lede: 'یک افزونه‌ی رایگان و متن‌باز برای یونیتی که مشکل نمایش متن راست‌به‌چپ را در TextMeshPro حل می‌کند: فارسی، عربی و اردو با حروف چسبیده و به ترتیب درست خوانده می‌شوند. فقط کافی است فایل .ttf یا .otf را روی لیبل بگذاری — نه Font Asset Creator، نه انتخاب رِنج کاراکتر. ژاپنی، چینی، کره‌ای، سیریلیک، تایلندی و ایموجی هم بدون هیچ تنظیمی کار می‌کنند.',

    // The one-line answer to "what IS this", for the machine
    // summary and for the reader who scanned nothing else.
    whatis: 'یک پکیج یونیتی (نصب از Package Manager) برای درست‌کردن متن چندزبانه در TextMeshPro.',

    priceBadge: 'رایگان · متن‌باز · لایسنس MIT · بدون کد لایسنس',
    badgeUnity: 'یونیتی ۲۰۲۱.۳ به بالا',
    badgeVersion: 'نسخه‌ی ' + VERSION,
    ctaInstall: 'نصبش کن',
    ctaRepo: 'سورس روی گیت‌هاب',

    // ---- symptoms ----
    symptomsEyebrow: 'اگر این‌ها برایت آشناست',
    symptomsTitle: 'مشکلی که این افزونه حل می‌کند',
    symptomsLede: 'اگر توی یونیتی دنبال حل یکی از این‌ها بوده‌ای، همین صفحه جواب است:',
    symptoms: [
      'متن فارسی در یونیتی به‌صورت مربع خالی (□□□) نشان داده می‌شود',
      'حروف فارسی به هم نمی‌چسبند و جدا جدا در می‌آیند: س ل ا م',
      'جمله‌ی فارسی برعکس و از چپ به راست خوانده می‌شود',
      'توی Font Asset Creator رِنج کاراکتر انتخاب می‌کنی و باز هم یک حرف کم می‌آید',
      'اسم بازیکن وقتی فارسی تایپ می‌شود خراب در می‌آید',
      'متن ژاپنی، چینی یا کره‌ای اصلاً نمایش داده نمی‌شود',
      'OutLine را روی یک لیبل تنظیم می‌کنی و روی همه‌ی لیبل‌های آن فونت می‌افتد'
    ],

    // ---- specimen ----
    specEyebrow: 'قبل و بعد',
    specTitle: 'همین یک جمله، چهار جور',
    specLede: 'این‌ها اسکرین‌شات نیستند؛ همین الان توی مرورگرت از روی یک رشته‌ی متن ساخته شده‌اند. سه حالت اول دقیقاً همان چیزی است که یونیتی بدون این افزونه نشان می‌دهد.',
    specTofuLabel: 'فونت گلیف را ندارد',
    specTofuNote: 'همان مربع‌های خالی. برای ژاپنی و چینی هم دقیقاً همین اتفاق می‌افتد.',
    specUnjoinedLabel: 'گلیف هست، ولی حروف نمی‌چسبند',
    specUnjoinedNote: 'فونت‌های مدرن فارسی فرم‌های نمایشی قدیمی را ندارند، پس کلمه بدون جوین می‌ماند.',
    specReversedLabel: 'و ترتیب هم برعکس است',
    specReversedNote: 'ترتیب حافظه به‌جای ترتیب خواندن — همان «فارسیم برعکس شده».',
    specGoodLabel: 'با Unity DirectTMP',
    specGoodNote: 'شکل‌های چسبیده از جدول GSUB خودِ فونت خوانده می‌شوند و ترتیب راست‌به‌چپ اعمال می‌شود.',
    specMixLabel: 'و بقیه‌ی خط‌ها، بدون هیچ تنظیمی',

    // ---- features ----
    featuresEyebrow: 'چه‌کار می‌کند',
    featuresTitle: 'شش کاری که واقعاً انجام می‌دهد',

    // ---- usage ----
    usageEyebrow: 'استفاده',
    usageTitle: 'سه قدم، بعدش تمام',
    usageStep1: 'لیبل TextMeshPro خودت را انتخاب کن.',
    usageStep2: 'Add Component ▸ Unity DirectTMP ▸ Direct Font',
    usageStep3: 'یک فایل .ttf یا .otf داخل فیلد Font بینداز.',
    usageAfter: 'تمام. یک کامپوننت، یک لیبل، یک فونت — هیچ‌چیزی روی کل پروژه اعمال نمی‌شود و دو لیبل با دو فونت مختلف هیچ کاری به هم ندارند.',
    usageBulk: 'یک UI کامل داری؟ Canvas را انتخاب کن و Unity DirectTMP ▸ Add Direct Font to Selection را بزن — همه‌ی لیبل‌های زیرش را انجام می‌دهد.',
    usageCodeTitle: 'یا از داخل کد',

    fieldsTitle: 'فیلدهای کامپوننت',
    fieldsColName: 'فیلد',
    fieldsColWhat: 'کارش چیست',

    // ---- videos ----
    videosEyebrow: 'ویدیو',
    videosTitle: 'ببین که کار می‌کند',
    videoLede: (count, total) =>
      `${count} کلیپ کوتاه، در مجموع ${total} — هر کدام یک کار را نشان می‌دهد، بدون مقدمه.`,
    videoLangLabel: 'زبان ویدیو',
    videoNoSupport: 'مرورگرت این ویدیو را پخش نمی‌کند.',
    videoDownload: 'دانلود فایل ویدیو',
    videoOf: (index, count) => `کلیپ ${index} از ${count}`,
    videoNoteTitle: 'یک نکته‌ی مهم',
    videoNoteBody: 'همه‌ی قابلیت‌هایی که در این ویدیوها می‌بینی داخل ابزار وجود دارند. اما ابزار مرتب بروزرسانی می‌شود، پس ممکن است مسیر دسترسی به بعضی از آن‌ها یا ظاهرشان با چیزی که در ویدیو نشان داده شده کمی فرق داشته باشد.',

    // ---- install ----
    installEyebrow: 'نصب',
    installTitle: 'از Package Manager، در چهار کلیک',
    installStep1: 'برو به Window ← Package Manager',
    installStep2: 'کلیک کن روی + ← Add package from git URL…',
    installStep3: 'این آدرس را بچسبان و Add را بزن:',
    installStep4: 'تمام — یونیتی خودش کامپایل می‌کند و منوی Unity DirectTMP اضافه می‌شود.',
    copy: 'کپی',
    copied: 'کپی شد',

    // ---- limits ----
    limitsEyebrow: 'صادقانه',
    limitsTitle: 'کارهایی که انجام نمی‌دهد',
    limitsLede: 'اینها را این‌جا می‌نویسیم چون بهتر است قبل از نصب بدانی تا بعدش:',
    limits: [
      'حروف‌چینی نستعلیق ندارد — شکل چسبیده‌ی استاندارد را می‌گیری، نه جایگزین‌های زمینه‌ای.',
      'جای‌گذاری علامت‌ها (GPOS) ندارد — حرکات سر جای پیش‌فرض فونت می‌نشینند.',
      'یک تگ Rich Text در وسط یک جمله‌ی راست‌به‌چپ آن را به دو بخش تقسیم می‌کند که هرکدام ترتیب درستی دارند ولی نسبت به هم چپ‌به‌راست چیده می‌شوند. تگ دور کل عبارت هیچ مشکلی ندارد.',
      'فونت را برایت لایسنس نمی‌کند: اگر فونت را داخل بیلد می‌فرستی، بررسی لایسنسش با خودت است.'
    ],

    // ---- requirements ----
    reqEyebrow: 'پیش‌نیازها',
    reqTitle: 'چه چیزی لازم دارد',
    reqUnity: 'یونیتی ۲۰۲۱.۳ LTS به بعد — یونیتی ۶ هم پشتیبانی می‌شود',
    reqTmp: 'TextMeshPro — همراه خودِ یونیتی می‌آید',
    reqNone: 'هیچ وابستگی دیگری به کتابخانه‌ی شخص‌ثالث ندارد',
    reqCost: 'بدون هزینه، بدون کد لایسنس، بدون حساب کاربری، بدون درخواست شبکه',

    troubleTitle: 'اگر فونتی چیزی نشان نداد',
    troubleBody: 'خودِ Inspector کامپوننت دلیلش را می‌گوید. تقریباً همیشه یکی از این چهارتاست: وارد نشدن TMP Essential Resources، خاموش بودن Include Font Data در ایمپورتر فونت، Dynamic نبودن حالت Character آن، یا نبودن شیدر distance-field.',

    // ---- faq ----
    faqTitle: 'سؤال‌های پرتکرار',
    faq: [
      {
        q: 'واقعاً حروف فارسی را به هم می‌چسباند؟',
        a: 'بله. شکل‌های چسبیده از جدول GSUB خودِ فونت خوانده می‌شود و خروجی گلیف‌به‌گلیف با HarfBuzz — موتور پشت کروم، فایرفاکس، اندروید و مک‌اواس — روی پنج فونت و یک مجموعه‌ی متن فارسی، عربی و اردو مقایسه شده است. ترتیب راست‌به‌چپ هم اعمال می‌شود، شامل خط‌های شکسته‌شده.'
      },
      {
        q: 'پس دیگر به پلاگین RTL جداگانه نیاز ندارم؟',
        a: 'نه. کارِ شکل‌دهی و ترتیب همین‌جا انجام می‌شود، آن هم داخل ITextPreprocessor خودِ TextMeshPro — یعنی چیزی در label.text نوشته نمی‌شود و مقداری که ست کرده‌ای دقیقاً همان برمی‌گردد.'
      },
      {
        q: 'با چه فونت‌هایی کار می‌کند؟',
        a: 'با فونت‌های مدرن OpenType: وزیرمتن، ساحل، شبنم، ایران‌سنس و نوتو سنس عربی همگی تست شده‌اند. نسخه‌های قدیمی‌تر که فرم‌های نمایشی یونیکد را دارند هم کار می‌کنند — چون کلاسِ اتصال هر حرف از یونیکد گرفته می‌شود نه از فونت، یک گلیف غایب دیگر نمی‌تواند شکل حرف کنارش را خراب کند.'
      },
      {
        q: 'واقعاً رایگان است؟ گیرش کجاست؟',
        a: 'گیری ندارد. لایسنس MIT، کل سورس روی گیت‌هاب، بدون نسخه‌ی پولی در راه، بدون تلمتری و بدون هیچ درخواست شبکه‌ای. اگر به کارت آمد، یک ستاره روی ریپازیتوری تنها هزینه‌اش است.'
      },
      {
        q: 'روی پرفورمنس بازی اثر می‌گذارد؟',
        a: 'هر گلیف فقط یک بار رَستر می‌شود و بعد کَش می‌ماند؛ هزینه‌اش بار اول است، نه هر فریم. برای متنی که اصلاً خط عربی ندارد، مرحله‌ی جوین و ترتیب هیچ هزینه‌ای ندارد چون اجرا نمی‌شود. برای حجم زیاد متن CJK هم Preload هست.'
      },
      {
        q: 'چرا OutLine روی یک لیبل، روی همه می‌افتد؟',
        a: 'چون در TextMeshPro همه‌ی لیبل‌هایی که یک فونت‌اَسِت دارند یک متریال مشترک دارند — این ایراد چیزی نیست، تعریف متریال مشترک است. فیلد Own material به این لیبل متریال خودش را می‌دهد، و Outline ▸ Width روی خودِ کامپوننت ذخیره می‌شود، پس بعد از کامپایل دوباره و در بیلد هم سر جایش می‌ماند.'
      },
      {
        q: 'باید فونت را داخل بیلد بگذارم؟',
        a: 'اگر فونت همراه بازی ارسال می‌شود بله — و بررسی لایسنس فونت با خودت است، چون قرار دادن یک .ttf داخل بیلد یعنی بازنشر. منوی Unity DirectTMP ▸ Bake Fonts For Build برای همین کار است.'
      },
      {
        q: 'چند تا زبان روی یک لیبل؟',
        a: 'به هر تعداد. فیلدهای Persian / Arabic و 日本語 / 中文 / 한국어 و English / Latin را پر کن؛ هر بار متن عوض شود تشخیص داده می‌شود متن واقعاً در چه خطی است — با شمردن کاراکترها، پس «Unity ۱۲۳ سلام دنیا» فارسی حساب می‌شود، نه انگلیسی — و فونت مربوطه استفاده می‌شود. هرکدام خالی بماند از فیلد Font استفاده می‌کند.'
      }
    ],

    alsoTitle: 'از همین قفسه',
    back: 'همه‌ی ابزارها',
    themeToLight: 'حالت روشن',
    themeToDark: 'حالت تاریک',
    langGroup: 'زبان صفحه'
  },

  en: {
    locale: 'en-US',
    dir: 'ltr',
    langName: 'English',

    title: 'Unity DirectTMP',
    tagline: 'Fix Persian and Arabic text in Unity — letters joined, right-to-left, correct.',
    metaTitle: 'Unity DirectTMP — Fix Persian and Arabic text in Unity',
    metaDesc: 'Unity DirectTMP fixes right-to-left text in TextMeshPro: Persian, Arabic and Urdu, letters joined and in reading order. Drop in a .ttf. Free, MIT, open source.',
    lede: 'A free, open-source Unity package that fixes right-to-left text in TextMeshPro: Persian, Arabic and Urdu come out with their letters joined and in reading order. Drop a .ttf or .otf on a label — no Font Asset Creator, no character ranges to pick. Japanese, Chinese, Korean, Cyrillic, Thai and emoji work with nothing to configure.',

    whatis: 'A Unity package (installed from the Package Manager) that fixes multilingual text in TextMeshPro.',

    priceBadge: 'Free · Open source · MIT licence · no licence key',
    badgeUnity: 'Unity 2021.3+',
    badgeVersion: 'Version ' + VERSION,
    ctaInstall: 'Install it',
    ctaRepo: 'Source on GitHub',

    symptomsEyebrow: 'If any of this sounds familiar',
    symptomsTitle: 'The problem this package solves',
    symptomsLede: 'If you have searched Unity for a fix to any of these, this page is the answer:',
    symptoms: [
      'Your Persian or Arabic text renders as empty boxes (□□□) in Unity',
      'The letters do not join — you get s a l a m instead of a word',
      'The Persian sentence reads backwards, left to right',
      'You picked character ranges in the Font Asset Creator and a glyph is still missing',
      'A player types their own name and TextMeshPro breaks',
      'Japanese, Chinese or Korean text does not show up at all',
      'You set an outline on one label and it appeared on every label using that font'
    ],

    specEyebrow: 'Before and after',
    specTitle: 'One sentence, four ways',
    specLede: 'These are not screenshots. Your browser is drawing them right now from one string. The first three are exactly what Unity gives you without this package.',
    specTofuLabel: 'The font has no glyph',
    specTofuNote: 'The empty boxes. Japanese and Chinese fail in precisely the same way.',
    specUnjoinedLabel: 'Glyphs, but the letters do not join',
    specUnjoinedNote: 'Modern Persian faces carry no legacy presentation forms, so the word is left unshaped.',
    specReversedLabel: 'And the order is backwards too',
    specReversedNote: 'Memory order put on screen instead of reading order — the "my Persian came out reversed" bug.',
    specGoodLabel: 'With Unity DirectTMP',
    specGoodNote: 'Joined shapes read from the font’s own GSUB table, with right-to-left order applied.',
    specMixLabel: 'And every other script, with nothing to configure',

    featuresEyebrow: 'What it does',
    featuresTitle: 'Six things it actually does',

    usageEyebrow: 'Using it',
    usageTitle: 'Three steps, then you are done',
    usageStep1: 'Select your TextMeshPro label.',
    usageStep2: 'Add Component ▸ Unity DirectTMP ▸ Direct Font',
    usageStep3: 'Drop a .ttf or .otf into the Font field.',
    usageAfter: 'That is it. One component, one label, one font — nothing is applied project-wide, and two labels with two different fonts never interfere.',
    usageBulk: 'Have a whole UI to convert? Select the Canvas and use Unity DirectTMP ▸ Add Direct Font to Selection — it does every label underneath it.',
    usageCodeTitle: 'Or from code',

    fieldsTitle: 'The component’s fields',
    fieldsColName: 'Field',
    fieldsColWhat: 'What it does',

    videosEyebrow: 'Video',
    videosTitle: 'See it work',
    videoLede: (count, total) =>
      `${count} short clips, ${total} in total — each one shows a single thing, with no preamble.`,
    videoLangLabel: 'Video language',
    videoNoSupport: 'Your browser cannot play this video.',
    videoDownload: 'Download the video file',
    videoOf: (index, count) => `Clip ${index} of ${count}`,
    videoNoteTitle: 'One thing worth knowing',
    videoNoteBody: 'Everything shown in these clips is in the tool. It does keep being updated, though — so where you reach a feature from, and what it looks like on screen, may differ from the recording.',

    installEyebrow: 'Install',
    installTitle: 'From the Package Manager, in four clicks',
    installStep1: 'Open Window → Package Manager',
    installStep2: 'Click + → Add package from git URL…',
    installStep3: 'Paste this and press Add:',
    installStep4: 'Done — Unity compiles it and a Unity DirectTMP menu appears.',
    copy: 'Copy',
    copied: 'Copied',

    limitsEyebrow: 'Honestly',
    limitsTitle: 'What it does not do',
    limitsLede: 'Written down here because it is better to know before you install than after:',
    limits: [
      'No Nastaliq typesetting — you get the standard joined shape, not contextual alternates.',
      'No mark positioning (GPOS) — harakat sit at the font’s default advance.',
      'A rich-text tag placed mid-sentence inside a right-to-left line splits it into two correctly-ordered runs laid out left-to-right relative to each other. A tag around a whole phrase is fine.',
      'It does not licence the font for you: if the font ships inside your build, checking its licence is still yours to do.'
    ],

    reqEyebrow: 'Requirements',
    reqTitle: 'What it needs',
    reqUnity: 'Unity 2021.3 LTS or newer — Unity 6 supported',
    reqTmp: 'TextMeshPro — bundled with Unity itself',
    reqNone: 'No other third-party dependencies',
    reqCost: 'No cost, no licence key, no account, no network requests',

    troubleTitle: 'If a font produces nothing',
    troubleBody: 'The component’s own Inspector names the reason. It is almost always one of four: TMP Essential Resources not imported, Include Font Data switched off on the font importer, its Character mode not set to Dynamic, or a missing distance-field shader.',

    faqTitle: 'Frequently asked',
    faq: [
      {
        q: 'Does it really join Persian and Arabic letters?',
        a: 'Yes. Joined shapes are read from the font’s own GSUB table, and the output is diffed glyph-for-glyph against HarfBuzz — the engine behind Chrome, Firefox, Android and macOS — across five fonts and a Persian, Arabic and Urdu corpus. Right-to-left order is applied too, including across wrapped lines.'
      },
      {
        q: 'So I do not need a separate RTL plugin?',
        a: 'No. Shaping and reordering happen here, inside TextMeshPro’s own ITextPreprocessor — which means nothing is ever written back into label.text, and reading it gives back exactly the string you set.'
      },
      {
        q: 'Which fonts work?',
        a: 'Modern OpenType faces: Vazirmatn, Sahel, Shabnam, IRANSans and Noto Sans Arabic are all tested. Older faces that do carry the Unicode presentation forms work too — and because a letter’s joining class comes from Unicode rather than from the font, one missing glyph can no longer change the shape of the letter beside it.'
      },
      {
        q: 'It is really free? What is the catch?',
        a: 'There is no catch. MIT licensed, the whole source is on GitHub, there is no paid tier waiting to appear, no telemetry and no network request of any kind. If it saves you an afternoon, a star on the repo is the whole price.'
      },
      {
        q: 'What does it cost at runtime?',
        a: 'Each glyph is rasterized once and then cached — the cost lands on first use, never per frame. For text with no Arabic script in it the joining and reordering pass costs nothing, because it does not run. For a wall of brand-new CJK text there is Preload.'
      },
      {
        q: 'Why does an outline on one label appear on all of them?',
        a: 'Because in TextMeshPro every label sharing a font asset shares one material — that is what a shared material is, not a bug in anything. The Own material field gives this label its own, and Outline ▸ Width is stored on the component itself, so it survives a recompile, play mode and the build.'
      },
      {
        q: 'Do I have to ship the font in my build?',
        a: 'If the font ships with your game, yes — and checking its licence is still yours to do, because putting a .ttf inside a build is redistribution. Unity DirectTMP ▸ Bake Fonts For Build is there for exactly that step.'
      },
      {
        q: 'How many languages on one label?',
        a: 'As many as you have fonts for. Fill in the Persian / Arabic, 日本語 / 中文 / 한국어 and English / Latin fields; each time the text changes, the script it is actually in is worked out by counting characters — so "Unity ۱۲۳ سلام دنیا" is Persian, not English — and the matching font is used. Any field left empty falls back to Font.'
      }
    ],

    alsoTitle: 'Also on this shelf',
    back: 'All tools',
    themeToLight: 'Light mode',
    themeToDark: 'Dark mode',
    langGroup: 'Page language'
  },

  ja: {
    locale: 'ja-JP',
    dir: 'ltr',
    langName: '日本語',

    title: 'Unity DirectTMP',
    tagline: 'Unity の文字化け(豆腐)とアラビア語表示を直す、TextMeshPro 用パッケージ。',
    metaTitle: 'Unity DirectTMP — Unity の文字化けと RTL 表示を直す',
    metaDesc: 'Unity DirectTMP は TextMeshPro の豆腐(□)を解消し、ペルシャ語・アラビア語の文字連結と右から左の表示を修正します。.ttf を渡すだけ。無料・MIT・オープンソース。',
    lede: '無料・オープンソースの Unity パッケージです。ラベルに .ttf / .otf を渡すだけで、そのファイルから直接描画します。Font Asset Creator も文字範囲の指定も不要なので、日本語・中国語・韓国語の豆腐(□)が消えます。さらにペルシャ語・アラビア語・ウルドゥー語は、文字が正しく連結され、右から左の語順で表示されます。キリル文字・タイ文字・絵文字も設定なしで使えます。',

    whatis: 'TextMeshPro の多言語表示を直す Unity パッケージ(Package Manager からインストール)。',

    priceBadge: '無料 · オープンソース · MIT ライセンス · ライセンスキー不要',
    badgeUnity: 'Unity 2021.3 以降',
    badgeVersion: 'バージョン ' + VERSION,
    ctaInstall: '導入する',
    ctaRepo: 'GitHub のソース',

    symptomsEyebrow: '心当たりがあれば',
    symptomsTitle: 'このパッケージが解決する問題',
    symptomsLede: '次のどれかを Unity で検索したことがあるなら、このページが答えです。',
    symptoms: [
      '日本語・中国語・韓国語が □□□(豆腐)になって表示されない',
      'Font Asset Creator で文字範囲を選んでも、まだ足りない文字が出てくる',
      'プレイヤーが入力した名前が表示できない',
      'アラビア語・ペルシャ語の文字がつながらず、1 文字ずつ離れて出る',
      '右から左に読む文章が逆順になる',
      '1 つのラベルに付けたアウトラインが、同じフォントの全ラベルに付いてしまう',
      '絵文字や記号だけがフォントから抜け落ちる'
    ],

    specEyebrow: 'ビフォー・アフター',
    specTitle: '同じ一文を、4 通りで',
    specLede: 'これはスクリーンショットではありません。1 つの文字列から、いまブラウザが描画しています。最初の 3 つが、このパッケージなしの Unity で起きることそのものです。',
    specTofuLabel: 'フォントにグリフがない',
    specTofuNote: 'いわゆる豆腐です。日本語や中国語もまったく同じ理由で同じ結果になります。',
    specUnjoinedLabel: 'グリフはあるが、文字がつながらない',
    specUnjoinedNote: '現代のペルシャ語書体は旧来の表示形を持たないため、単語が未整形のまま残ります。',
    specReversedLabel: 'しかも語順が逆',
    specReversedNote: '読み順ではなくメモリ上の順序がそのまま画面に出た状態です。',
    specGoodLabel: 'Unity DirectTMP を使うと',
    specGoodNote: 'フォント自身の GSUB テーブルから連結形を読み出し、右から左の語順を適用します。',
    specMixLabel: 'その他の文字体系も、設定なしで',

    featuresEyebrow: 'できること',
    featuresTitle: '実際にできる 6 つのこと',

    usageEyebrow: '使い方',
    usageTitle: '3 ステップで完了',
    usageStep1: 'TextMeshPro のラベルを選択します。',
    usageStep2: 'Add Component ▸ Unity DirectTMP ▸ Direct Font',
    usageStep3: 'Font フィールドに .ttf / .otf をドロップします。',
    usageAfter: '以上です。1 コンポーネント・1 ラベル・1 フォント。プロジェクト全体には何も適用されず、別のフォントを使う 2 つのラベルが干渉することもありません。',
    usageBulk: 'UI 全体をまとめて変換したい場合は、Canvas を選択して Unity DirectTMP ▸ Add Direct Font to Selection を実行すると、配下のすべてのラベルに適用されます。',
    usageCodeTitle: 'コードから使う場合',

    fieldsTitle: 'コンポーネントのフィールド',
    fieldsColName: 'フィールド',
    fieldsColWhat: '役割',

    videosEyebrow: '動画',
    videosTitle: '動作をご覧ください',
    videoLede: (count, total) =>
      `短いクリップ ${count} 本、合計 ${total}。前置きなしで 1 本につき 1 つの機能を紹介します。`,
    videoLangLabel: '動画の言語',
    videoNoSupport: 'お使いのブラウザではこの動画を再生できません。',
    videoDownload: '動画ファイルをダウンロード',
    videoOf: (index, count) => `${count} 本中 ${index} 本目`,
    videoNoteTitle: 'ご注意ください',
    videoNoteBody: 'これらの動画で紹介している機能は、すべて製品に含まれています。ただし更新を重ねているため、機能へのアクセス方法や画面の見た目が動画と異なる場合があります。',

    installEyebrow: '導入',
    installTitle: 'Package Manager から 4 クリック',
    installStep1: 'Window → Package Manager を開く',
    installStep2: '+ → Add package from git URL… をクリック',
    installStep3: 'これを貼り付けて Add:',
    installStep4: '完了です。Unity がコンパイルし、Unity DirectTMP メニューが追加されます。',
    copy: 'コピー',
    copied: 'コピーしました',

    limitsEyebrow: '正直なところ',
    limitsTitle: 'できないこと',
    limitsLede: 'インストールしたあとに気づくより先に知っていただきたいので、ここに書いておきます。',
    limits: [
      'ナスタアリーク体の組版には対応しません。標準の連結形は得られますが、文脈依存の異体字は適用されません。',
      'マーク位置決め(GPOS)には対応しません。ハラカートはフォント既定の送り位置に置かれます。',
      '右から左の行の途中にリッチテキストタグを置くと、それぞれ正しい語順の 2 つの連なりに分割され、両者は左から右に並びます。フレーズ全体を囲む場合は問題ありません。',
      'フォントのライセンスは代行しません。ビルドにフォントを同梱する場合、ライセンスの確認はご自身でお願いします。'
    ],

    reqEyebrow: '必要環境',
    reqTitle: '必要なもの',
    reqUnity: 'Unity 2021.3 LTS 以降 — Unity 6 対応',
    reqTmp: 'TextMeshPro — Unity に同梱',
    reqNone: 'その他のサードパーティ依存はありません',
    reqCost: '無料・ライセンスキー不要・アカウント不要・通信なし',

    troubleTitle: '何も表示されないときは',
    troubleBody: 'コンポーネントの Inspector が理由を表示します。ほとんどの場合、次の 4 つのいずれかです。TMP Essential Resources が未インポート、フォントインポーターの Include Font Data が無効、Character モードが Dynamic になっていない、distance-field シェーダーが見つからない。',

    faqTitle: 'よくある質問',
    faq: [
      {
        q: 'ペルシャ語・アラビア語の文字は本当につながりますか?',
        a: 'はい。連結形はフォント自身の GSUB テーブルから読み出しており、その出力を HarfBuzz(Chrome・Firefox・Android・macOS のテキストエンジン)とグリフ単位で比較検証しています。5 種類のフォントと、ペルシャ語・アラビア語・ウルドゥー語のコーパスで一致を確認済みです。折り返し後の行も含めて右から左の語順が適用されます。'
      },
      {
        q: '別途 RTL プラグインは必要ですか?',
        a: '不要です。整形と並べ替えは TextMeshPro 自身の ITextPreprocessor の中で行われるため、label.text に書き戻すことは一切なく、設定した文字列がそのまま読み出せます。'
      },
      {
        q: 'どのフォントで動きますか?',
        a: '現代的な OpenType 書体で動作します。Vazirmatn、Sahel、Shabnam、IRANSans、Noto Sans Arabic はいずれも検証済みです。Unicode の表示形を持つ古い書体でも動作します。文字の接続クラスはフォントではなく Unicode から判断するため、グリフが 1 つ欠けても隣の文字の形が崩れることはありません。'
      },
      {
        q: '本当に無料ですか?',
        a: '無料です。MIT ライセンスで、ソースはすべて GitHub にあります。あとから有料版が出ることも、テレメトリも、いかなる通信もありません。お役に立てたら、リポジトリへの ⭐ が唯一の対価です。'
      },
      {
        q: '実行時のコストは?',
        a: '各グリフのラスタライズは 1 回きりで、その後はキャッシュされます。コストがかかるのは初回だけで、毎フレームではありません。アラビア文字を含まないテキストでは整形と並べ替えの処理は実行されないためコストはゼロです。大量の CJK テキストには Preload があります。'
      },
      {
        q: 'なぜ 1 つのラベルのアウトラインが全部に付くのですか?',
        a: 'TextMeshPro では同じフォントアセットを使うラベルがマテリアルを共有するためです。これは共有マテリアルの仕様であり、不具合ではありません。Own material フィールドでそのラベル専用のマテリアルを持たせられます。Outline ▸ Width はコンポーネント自体に保存されるため、再コンパイル後も Play Mode でもビルドでも保持されます。'
      },
      {
        q: 'フォントをビルドに同梱する必要はありますか?',
        a: 'ゲームと一緒に配布するなら必要です。ビルドに .ttf を含めることは再配布にあたるため、ライセンスの確認はご自身でお願いします。Unity DirectTMP ▸ Bake Fonts For Build がその工程のために用意されています。'
      },
      {
        q: '1 つのラベルで何言語まで使えますか?',
        a: 'フォントがある分だけ使えます。Persian / Arabic、日本語 / 中文 / 한국어、English / Latin の各フィールドを埋めてください。テキストが変わるたびに、文字数を数えて実際の文字体系を判定し(そのため「Unity ۱۲۳ سلام دنیا」は英語ではなくペルシャ語と判定されます)、対応するフォントが使われます。空欄のフィールドは Font にフォールバックします。'
      }
    ],

    alsoTitle: '同じ棚から',
    back: 'すべてのツール',
    themeToLight: 'ライトモード',
    themeToDark: 'ダークモード',
    langGroup: 'ページの言語'
  }
}


// ==========================================
// The feature grid
//
// Rewritten against UnityDirectTMP 2.1.13. The previous six
// described the 1.x package: a fallback-chain editor, a font
// catalog and a health-check window, none of which survived
// 2.0.0. These six are the ones in the shipping README under
// "Why people keep it", plus the two the component adds.
// ==========================================
const FEATURES = [
  {
    mark: '🩺',
    fa: ['فارسیِ واقعاً خوانا', 'شکل‌های چسبیده از جدول GSUB خودِ فونت خوانده می‌شود و گلیف‌به‌گلیف با HarfBuzz تست شده — همان موتوری که کروم و اندروید استفاده می‌کنند.'],
    en: ['Persian that actually reads', 'Joined shapes come from the font’s own GSUB table, verified glyph-for-glyph against HarfBuzz — the same engine Chrome and Android use.'],
    ja: ['本当に読めるペルシャ語', '連結形はフォント自身の GSUB から読み出し、Chrome や Android と同じ HarfBuzz とグリフ単位で照合済みです。']
  },
  {
    mark: '🅰️',
    fa: ['فایل فونت را بده، نه فونت‌اَسِت را', 'یک .ttf یا .otf را روی کامپوننت بینداز، تمام. نه Font Asset Creator، نه انتخاب رِنج کاراکتر — کارهای SDF بی‌سروصدا پشت صحنه انجام می‌شود.'],
    en: ['Point at a font file, not a font asset', 'Drag a .ttf or .otf onto the component and you are done. No Font Asset Creator, no character ranges — the SDF side is handled quietly in the background.'],
    ja: ['指定するのはフォントアセットではなくファイル', '.ttf / .otf をコンポーネントにドラッグするだけ。Font Asset Creator も文字範囲指定も不要で、SDF まわりは裏側で処理されます。']
  },
  {
    mark: '🌏',
    fa: ['یک فونت برای هر زبان، روی یک لیبل', 'فیلدهای فارسی، CJK و لاتین را پر کن؛ هر بار متن عوض شود با شمردن کاراکترها تشخیص داده می‌شود متن واقعاً در چه خطی است و فونت مربوطه استفاده می‌شود.'],
    en: ['A font per language, on one label', 'Fill in the Persian, CJK and Latin fields; each time the text changes, the script it is actually in is detected by counting characters and the matching font is used.'],
    ja: ['1 つのラベルに、言語ごとのフォント', 'ペルシャ語・CJK・ラテン各フィールドを設定すれば、テキストが変わるたびに文字数から実際の文字体系を判定し、対応するフォントが使われます。']
  },
  {
    mark: '🎨',
    fa: ['OutLine ای که فقط مال یک لیبل است', 'در TextMeshPro لیبل‌های هم‌فونت یک متریال مشترک دارند. Own material به این لیبل متریال خودش را می‌دهد و مقدار OutLine روی خودِ کامپوننت می‌ماند — پس در بیلد هم سر جایش است.'],
    en: ['An outline that belongs to one label', 'In TextMeshPro, labels sharing a font share one material. Own material gives this label its own, and the outline value is kept on the component — so it survives into the build.'],
    ja: ['そのラベルだけのアウトライン', 'TextMeshPro では同じフォントのラベルがマテリアルを共有します。Own material で専用マテリアルを持たせ、アウトライン値はコンポーネントに保存されるためビルドでも保持されます。']
  },
  {
    mark: '🧩',
    fa: ['بقیه‌ی خط‌ها، مجانی', 'ژاپنی، چینی، کره‌ای، سیریلیک، یونانی، تایلندی، ایموجی و نمادها: هیچ تنظیمی ندارند. اگر فونت گلیف را داشته باشد، تو هم داری.'],
    en: ['Every other script, free', 'Japanese, Chinese, Korean, Cyrillic, Greek, Thai, emoji and symbols: nothing to configure. If the font has the glyph, you get it.'],
    ja: ['その他の文字体系も、そのまま', '日本語・中国語・韓国語・キリル文字・ギリシャ文字・タイ文字・絵文字・記号は設定不要です。フォントにグリフがあれば、そのまま使えます。']
  },
  {
    mark: '🤝',
    fa: ['مؤدب', 'تگ‌های Rich Text هرگز شکل‌دهی یا جابه‌جا نمی‌شوند و چیزی در label.text نوشته نمی‌شود — مقداری که ست کرده‌ای دقیقاً همان برمی‌گردد.'],
    en: ['Polite', 'Rich-text tags are never shaped or reordered, and label.text is never written to — reading it gives back exactly the string you set.'],
    ja: ['行儀がよい', 'リッチテキストタグが整形・並べ替えされることはなく、label.text に書き戻すこともありません。設定した文字列がそのまま読み出せます。']
  }
]


// ==========================================
// The component's fields
//
// The same table as the shipping README. It is on the page
// because "what do these fields do" is the question somebody
// asks with the Inspector already open, and sending them to
// GitHub for it is a page that did not answer.
// ==========================================
const FIELDS = [
  {
    name: 'Font',
    fa: 'فایل فونت. تنها فیلدی که واقعاً لازم داری.',
    en: 'The font file. The only one you actually need.',
    ja: 'フォントファイル。実際に必要なのはこれだけです。'
  },
  {
    name: 'Persian / Arabic',
    fa: 'وقتی متن بیشتر فارسی، عربی یا اردو باشد. خالی = همان Font.',
    en: 'Used when the text is mostly Persian, Arabic or Urdu. Empty = use Font.',
    ja: 'テキストが主にペルシャ語・アラビア語・ウルドゥー語のときに使用。空欄なら Font を使用。'
  },
  {
    name: '日本語 / 中文 / 한국어',
    fa: 'وقتی متن بیشتر ژاپنی، چینی یا کره‌ای باشد. خالی = همان Font.',
    en: 'Used when the text is mostly Japanese, Chinese or Korean. Empty = use Font.',
    ja: 'テキストが主に日本語・中国語・韓国語のときに使用。空欄なら Font を使用。'
  },
  {
    name: 'English / Latin',
    fa: 'وقتی متن بیشتر انگلیسی یا لاتین باشد. خالی = همان Font.',
    en: 'Used when the text is mostly English or another Latin language. Empty = use Font.',
    ja: 'テキストが主に英語などのラテン文字のときに使用。空欄なら Font を使用。'
  },
  {
    name: 'Outline ▸ Width',
    fa: 'ضخامت OutLine دور حروف همین لیبل. صفر یعنی بدون OutLine.',
    en: 'How thick an outline is drawn around this label’s letters. 0 is no outline.',
    ja: 'このラベルの文字に描くアウトラインの太さ。0 でアウトラインなし。'
  },
  {
    name: 'Outline ▸ Colour',
    fa: 'رنگ همان OutLine.',
    en: 'The colour of that outline.',
    ja: 'そのアウトラインの色。'
  },
  {
    name: 'Own material',
    fa: 'متریال مخصوص همین لیبل، تا هرچه رویش تنظیم شود مال خودش بماند.',
    en: 'Gives this label its own material, so anything set on it stays its own.',
    ja: 'このラベル専用のマテリアルを与え、設定した内容がそのラベルだけに留まるようにします。'
  },
  {
    name: 'Join Persian / Arabic',
    fa: 'چسبیدن حروف و ترتیب راست‌به‌چپ. برای متن بدون خط عربی هیچ هزینه‌ای ندارد.',
    en: 'Letter joining and right-to-left reading order. Free for text with no Arabic script.',
    ja: '文字の連結と右から左の語順。アラビア文字を含まないテキストではコストはかかりません。'
  },
  {
    name: 'Fix wrapped lines',
    fa: 'ترتیب درست خط‌های شکسته‌شده در متن راست‌به‌چپ.',
    en: 'Keeps wrapped right-to-left lines in the correct order.',
    ja: '折り返された右から左の行を正しい順序に保ちます。'
  }
]


// The API snippet. Straight out of the shipping README, so a
// reader who copies it gets the same four calls the package
// documents rather than a paraphrase of them.
const CODE_SAMPLE = [
  'DirectTMP.Apply(label, myFont);              // same thing the component does',
  'DirectTMP.Outline(label, 0.2f, Color.black); // an outline on this label only',
  'label.font = DirectTMP.Load(myFont);         // just the font asset',
  'label.font = DirectTMP.LoadFromFile(path);   // a .ttf on disk, at runtime'
].join('\n')


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
  check: '<path d="M20 6 9 17l-5-5"/>',
  download: '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/>',
  github: '<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9a3.4 3.4 0 0 0-.9-2.6c3-.3 6.2-1.5 6.2-6.7A5.2 5.2 0 0 0 20 5.8a4.9 4.9 0 0 0-.1-3.6s-1.1-.3-3.6 1.4a12.4 12.4 0 0 0-6.6 0C7.2 1.9 6.1 2.2 6.1 2.2A4.9 4.9 0 0 0 6 5.8a5.2 5.2 0 0 0-1.4 3.6c0 5.2 3.2 6.4 6.2 6.7a3.4 3.4 0 0 0-.9 2.6V22"/>',
  alert: '<path d="M12 9v4"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="9"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>'
}

function icon(name, cls) {
  return '<svg class="' + (cls || 'd-ic') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
    + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + (ICONS[name] || '') + '</svg>'
}


// ==========================================
// Inky, the package's mascot.
// Traced from Docs~/mascot.svg in the repository.
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
// The site's token layer with the accent swapped for the
// package's own teal, so the page reads as the product rather
// than as the site.
//
// Two rules here are load-bearing rather than decorative:
//
//   .spec-line is direction-neutral and each specimen row sets
//   its own dir attribute. The previous version hard-coded
//   direction:rtl on the sample, which quietly mangled the
//   Japanese page - the sample there is not right-to-left text
//   and was being laid out as though it were.
//
//   .spec-reversed uses unicode-bidi:bidi-override to force
//   memory order onto the screen. That is not a styling choice;
//   it is the only honest way to reproduce the reversed-text bug
//   in a browser that would otherwise fix it for us.
//
// No backtick and no dollar-brace may appear anywhere in this
// string, comments included - see CLAUDE.md. Declarations are
// quoted in plain words below for exactly that reason.
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

      --radius: 20px;
      --radius-sm: 13px;
      --maxw: 1000px;

      --bg-1: #071110;
      --bg-2: #0f2b2e;
      --surface: rgba(47,179,192,0.058);
      --surface-2: rgba(47,179,192,0.105);
      --surface-3: rgba(47,179,192,0.032);
      --border: rgba(47,179,192,0.19);
      --border-soft: rgba(47,179,192,0.11);
      --text: rgba(255,255,255,0.95);
      --text-dim: rgba(255,255,255,0.70);
      --text-faint: rgba(255,255,255,0.50);
      --accent: #2fb3c0;
      --shadow: 0 18px 44px rgba(0,0,0,0.42);
      color-scheme: dark;
    }

    @media (prefers-color-scheme: light) {
      :root:not([data-theme]) {
        --bg-1: ${PAPER};
        --bg-2: #e6dfd0;
        --surface: rgba(255,255,255,0.82);
        --surface-2: #ffffff;
        --surface-3: rgba(11,90,99,0.035);
        --border: rgba(11,90,99,0.17);
        --border-soft: rgba(11,90,99,0.09);
        --text: rgba(16,18,20,0.95);
        --text-dim: rgba(16,18,20,0.68);
        --text-faint: rgba(16,18,20,0.48);
        --accent: ${INK};
        --shadow: 0 18px 40px rgba(11,90,99,0.12);
        color-scheme: light;
      }
    }

    :root[data-theme="light"] {
      --bg-1: ${PAPER};
      --bg-2: #e6dfd0;
      --surface: rgba(255,255,255,0.82);
      --surface-2: #ffffff;
      --surface-3: rgba(11,90,99,0.035);
      --border: rgba(11,90,99,0.17);
      --border-soft: rgba(11,90,99,0.09);
      --text: rgba(16,18,20,0.95);
      --text-dim: rgba(16,18,20,0.68);
      --text-faint: rgba(16,18,20,0.48);
      --accent: ${INK};
      --shadow: 0 18px 40px rgba(11,90,99,0.12);
      color-scheme: light;
    }
    :root[data-theme="dark"] {
      --bg-1: #071110;
      --bg-2: #0f2b2e;
      --surface: rgba(47,179,192,0.058);
      --surface-2: rgba(47,179,192,0.105);
      --surface-3: rgba(47,179,192,0.032);
      --border: rgba(47,179,192,0.19);
      --border-soft: rgba(47,179,192,0.11);
      --text: rgba(255,255,255,0.95);
      --text-dim: rgba(255,255,255,0.70);
      --text-faint: rgba(255,255,255,0.50);
      --accent: #2fb3c0;
      --shadow: 0 18px 44px rgba(0,0,0,0.42);
      color-scheme: dark;
    }

    body {
      font-family: 'Vazirmatn', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg-1);
      color: var(--text);
      min-height: 100vh;
      line-height: 1.8;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
    }

    /* The glow behind the hero. A fixed pseudo-element rather than a
       body background so it does not travel with the scroll and does
       not repaint the whole page on every frame. */
    body::before {
      content: '';
      position: fixed;
      inset-block-start: -30vh;
      inset-inline-start: 50%;
      transform: translateX(-50%);
      width: min(1200px, 160vw);
      height: 90vh;
      background: radial-gradient(closest-side, var(--bg-2), transparent 72%);
      pointer-events: none;
      z-index: -1;
    }

    /* The brass counterweight, low on the page.

       The package has two colours, not one: teal is the ink and
       brass is what the badges and the mascot's highlights are
       drawn in. With only the teal glow the page read as a plain
       dark rectangle with a slightly blue top - the second colour
       is what makes it read as a theme rather than as a default.
       Fixed and pointer-transparent for the same reasons as the
       layer above. */
    body::after {
      content: '';
      position: fixed;
      inset-block-end: -42vh;
      inset-inline-start: 50%;
      transform: translateX(-50%);
      width: min(1000px, 150vw);
      height: 72vh;
      background: radial-gradient(closest-side,
        color-mix(in srgb, var(--brass) 7%, transparent), transparent 72%);
      pointer-events: none;
      z-index: -1;
    }

    .wrap { max-width: var(--maxw); margin-inline: auto; padding: 26px 20px 72px; }

    /* ---------- topbar ---------- */
    .topbar {
      display: flex; align-items: center; justify-content: space-between;
      gap: 14px; flex-wrap: wrap; margin-block-end: 22px;
    }
    .brand {
      display: flex; align-items: center; gap: 12px; min-width: 0;
      text-decoration: none; color: inherit; transition: opacity 0.18s ease;
    }
    .brand:hover { opacity: 0.82; }
    .brand-logo {
      width: 42px; height: 42px; border-radius: 12px; overflow: hidden;
      display: grid; place-items: center;
      background: var(--surface); border: 1px solid var(--border); flex: none;
    }
    .brand-logo img { width: 100%; height: 100%; object-fit: cover; }
    .brand-name { font-weight: 800; line-height: 1.3; }
    .brand-sub { font-size: 0.8em; color: var(--text-dim); line-height: 1.3; }
    .controls { display: flex; align-items: center; gap: 10px; }
    .seg {
      display: inline-flex; padding: 3px; gap: 2px; border-radius: 999px;
      background: var(--surface); border: 1px solid var(--border);
    }
    .seg button,
    .seg a {
      appearance: none; border: 0; cursor: pointer; font: inherit;
      padding: 6px 12px; border-radius: 999px; font-size: 0.82em; font-weight: 600;
      background: transparent; color: var(--text-dim);
      transition: background 0.18s ease, color 0.18s ease;
    }
    .seg a { text-decoration: none; display: inline-block; line-height: 1.5; }
    .seg button:hover,
    .seg a:hover { color: var(--text); text-decoration: none; }
    .seg button[aria-pressed="true"],
    .seg a[aria-pressed="true"] { background: var(--surface-2); color: var(--text); }
    .icon-btn {
      appearance: none; cursor: pointer; width: 38px; height: 38px;
      display: grid; place-items: center; border-radius: 12px;
      background: var(--surface); border: 1px solid var(--border); color: var(--text);
      transition: border-color 0.18s ease;
    }
    .icon-btn:hover { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); }
    .icon-btn svg { width: 19px; height: 19px; }

    /* ---------- hero ---------- */
    .hero { text-align: center; padding-block: 6px 46px; position: relative; }

    /* The blot Inky sits in. Without it the mascot floats on flat
       background and the top of the page has nothing in it but
       text; with it the hero reads as ink on a surface, which is
       the whole idea the package is named for. */
    .hero::before {
      content: '';
      position: absolute;
      inset-block-start: -4%;
      inset-inline-start: 50%;
      transform: translateX(-50%);
      width: min(340px, 68vw);
      aspect-ratio: 1;
      background: radial-gradient(closest-side,
        color-mix(in srgb, var(--accent) 15%, transparent), transparent 70%);
      pointer-events: none;
      z-index: -1;
    }
    .inky { display: block; margin-inline: auto; margin-block-end: 4px; position: relative; }
    .hero h1 {
      font-size: clamp(2.1em, 6.4vw, 3.3em); font-weight: 800;
      letter-spacing: -0.022em; line-height: 1.18;
    }
    .hero .tagline {
      font-size: clamp(1.02em, 2.5vw, 1.2em); font-weight: 700;
      margin-block-start: 10px; max-width: 44ch; margin-inline: auto;
      color: color-mix(in srgb, var(--accent) 66%, var(--text));
      text-wrap: balance;
    }
    .hero .lede {
      color: var(--text-dim); max-width: 64ch;
      margin-inline: auto; margin-block-start: 14px; font-size: 0.99em;
    }

    .badge-row {
      display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;
      margin-block-start: 18px;
    }
    .pill {
      display: inline-flex; align-items: center; gap: 7px;
      padding: 6px 14px; border-radius: 999px; font-weight: 700; font-size: 0.82em;
      color: var(--text-dim); background: var(--surface); border: 1px solid var(--border);
    }
    .pill.is-key {
      color: color-mix(in srgb, var(--accent) 62%, var(--text));
      background: color-mix(in srgb, var(--accent) 13%, transparent);
      border-color: color-mix(in srgb, var(--accent) 36%, transparent);
    }

    .cta-row { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-block-start: 22px; }
    .btn {
      display: inline-flex; align-items: center; gap: 9px;
      padding: 13px 24px; border-radius: var(--radius-sm); text-decoration: none;
      font-weight: 700; font-size: 0.95em; border: 1px solid var(--border);
      background: var(--surface); color: var(--text);
      transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
    }
    .btn:hover {
      transform: translateY(-2px);
      border-color: color-mix(in srgb, var(--accent) 46%, var(--border));
    }
    .btn svg { width: 18px; height: 18px; flex: none; }
    .btn-primary {
      background: linear-gradient(135deg, var(--ink), var(--ink-deep));
      border-color: transparent; color: #fff;
      box-shadow: 0 10px 26px color-mix(in srgb, var(--ink) 34%, transparent);
    }
    .btn-primary:hover { box-shadow: 0 15px 34px color-mix(in srgb, var(--ink) 44%, transparent); }

    /* The one-sentence machine-readable answer to "what is this".
       Small, quiet, and directly under the buttons, because the
       reader who needs it is the one who has not decided to read
       anything longer. */
    .whatis {
      margin-block-start: 20px; font-size: 0.86em; color: var(--text-faint);
      max-width: 56ch; margin-inline: auto;
    }

    /* ---------- sections ---------- */
    section { margin-block-end: 56px; scroll-margin-block-start: 20px; }
    /* Every section is introduced by this, so it is the cheapest
       place to put the brand: teal was already the colour of half
       the page furniture, and having the eyebrow in it too meant
       the brass never appeared at all outside the badge row. */
    .eyebrow {
      display: inline-flex; align-items: center; gap: 9px;
      font-size: 0.74em; font-weight: 800;
      letter-spacing: 0.11em; text-transform: uppercase;
      color: color-mix(in srgb, var(--brass) 78%, var(--text));
      margin-block-end: 7px;
    }
    .eyebrow::before {
      content: ''; flex: none; width: 20px; height: 2px; border-radius: 2px;
      background: linear-gradient(to right, var(--accent), var(--brass));
    }
    .section-title {
      font-size: clamp(1.35em, 3.4vw, 1.7em); font-weight: 800;
      letter-spacing: -0.014em; line-height: 1.3;
    }
    .section-lede { color: var(--text-dim); margin-block-start: 9px; max-width: 68ch; }

    .panel {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 24px; margin-block-start: 18px;
    }
    .panel p + p { margin-block-start: 12px; }

    .note {
      border-inline-start: 3px solid color-mix(in srgb, var(--accent) 65%, transparent);
      padding-inline-start: 14px; color: var(--text-dim); font-size: 0.93em;
    }

    /* ---------- symptoms ----------
       The list is the SEO surface and the comprehension surface at
       once: these are the sentences people type into a search box,
       so they are real body text with a check beside each one. */
    .symptoms { list-style: none; display: grid; gap: 10px; margin-block-start: 18px; }
    .symptoms li {
      display: flex; align-items: flex-start; gap: 12px;
      background: var(--surface); border: 1px solid var(--border-soft);
      border-radius: var(--radius-sm); padding: 13px 16px;
      font-size: 0.94em;
      transition: border-color 0.18s ease, transform 0.18s ease;
    }
    .symptoms li:hover {
      border-color: color-mix(in srgb, var(--accent) 34%, var(--border));
      transform: translateX(0);
    }
    .symptom-mark {
      flex: none; width: 22px; height: 22px; border-radius: 7px;
      display: grid; place-items: center; font-size: 0.78em; font-weight: 800;
      margin-block-start: 4px;
      color: color-mix(in srgb, var(--blush) 78%, var(--text));
      background: color-mix(in srgb, var(--blush) 18%, transparent);
      border: 1px solid color-mix(in srgb, var(--blush) 38%, transparent);
    }

    /* ---------- the specimen ---------- */
    .spec { display: grid; gap: 12px; margin-block-start: 20px; }
    .spec-row {
      background: var(--surface-2); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 18px 20px;
      display: grid; gap: 4px;
    }
    .spec-row.is-bad { border-color: color-mix(in srgb, var(--blush) 40%, var(--border)); }
    .spec-row.is-good {
      border-color: color-mix(in srgb, var(--accent) 52%, var(--border));
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 22%, transparent);
    }
    .spec-head {
      display: flex; align-items: center; gap: 9px; flex-wrap: wrap;
      font-size: 0.78em; font-weight: 800; letter-spacing: 0.04em;
      text-transform: uppercase; color: var(--text-faint);
    }
    .spec-row.is-good .spec-head { color: color-mix(in srgb, var(--accent) 70%, var(--text)); }
    .spec-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; flex: none; }

    /* Direction-neutral on purpose. Each row carries its own dir
       attribute, because one of these rows must be laid out in
       memory order to show the bug and the others must not.

       Centred for one reason: the four rows are a comparison, and
       with each row aligned to its own start edge the right-to-left
       samples sat hard right while the reversed one sat hard left,
       so the four lines a reader is meant to compare never shared
       a starting point. Centring is what makes them one column. */
    .spec-line {
      font-size: clamp(1.5em, 4.6vw, 2.05em); font-weight: 700;
      line-height: 1.65; margin-block: 6px 2px;
      word-break: break-word; text-align: center;
    }
    .spec-row.is-bad .spec-line { color: color-mix(in srgb, var(--blush) 66%, var(--text)); }
    .spec-tofu { letter-spacing: 0.08em; }
    .spec-reversed { direction: ltr; unicode-bidi: bidi-override; }
    .spec-note { font-size: 0.86em; color: var(--text-dim); }

    .spec-mixed {
      background: var(--surface); border: 1px dashed var(--border);
      border-radius: var(--radius); padding: 16px 20px; text-align: center;
    }
    .spec-mixed .spec-line { font-size: clamp(1.05em, 3vw, 1.4em); }

    /* ---------- feature grid ---------- */
    .features {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(min(272px, 100%), 1fr));
      gap: 14px; margin-block-start: 20px;
    }
    .feature {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 22px;
      transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
    }
    .feature:hover {
      transform: translateY(-3px);
      border-color: color-mix(in srgb, var(--accent) 42%, var(--border));
      box-shadow: var(--shadow);
    }
    .feature-mark { font-size: 1.7em; line-height: 1.2; }
    .feature h3 { font-size: 1.04em; font-weight: 800; margin-block: 9px 6px; }
    .feature p { font-size: 0.91em; color: var(--text-dim); }

    /* ---------- steps ---------- */
    .steps { list-style: none; counter-reset: step; display: grid; gap: 14px; }

    /* See the same pair on the DocSnap page. A grid item and a
       flex item both start at min-width: auto, which floors them
       at the git URL box's flex-basis - 320px here, on a 320px
       phone, inside a padded column. That floor is what gave this
       page 131px of sideways scroll. */
    .steps li { display: flex; align-items: flex-start; gap: 13px; min-width: 0; }
    .steps li > * { min-width: 0; }
    .steps li::before {
      counter-increment: step; content: counter(step);
      flex: none; width: 27px; height: 27px; border-radius: 50%;
      display: grid; place-items: center; font-size: 0.8em; font-weight: 800;
      color: #fff; background: var(--ink); margin-block-start: 3px;
    }
    .steps b { font-weight: 700; }

    .copy-row { display: flex; align-items: stretch; gap: 8px; margin-block-start: 10px; flex-wrap: wrap; min-width: 0; max-width: 100%; }
    .copy-url {
      /* Bounded by the container, so the basis stops being a floor
         the page has to grow to satisfy. */
      flex: 1 1 min(100%, 320px); min-width: 0;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.86em; padding: 12px 15px; border-radius: var(--radius-sm);
      direction: ltr; text-align: start;
      background: var(--surface-3); border: 1px solid var(--border); color: var(--text);
      overflow-x: auto; white-space: nowrap;
    }
    .copy-btn {
      appearance: none; cursor: pointer; font: inherit; font-weight: 700; font-size: 0.86em;
      padding: 12px 20px; border-radius: var(--radius-sm); border: 1px solid transparent;
      background: var(--ink); color: #fff; flex: none;
      transition: filter 0.18s ease;
    }
    .copy-btn:hover { filter: brightness(1.1); }

    pre.code {
      margin-block-start: 12px; padding: 16px 18px; border-radius: var(--radius-sm);
      background: var(--surface-3); border: 1px solid var(--border);
      overflow-x: auto; direction: ltr; text-align: start;
    }
    pre.code code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.83em; line-height: 1.85; color: var(--text-dim); white-space: pre;
    }

    /* ---------- fields table ---------- */
    .table-scroll { overflow-x: auto; margin-block-start: 18px; border-radius: var(--radius); }
    table.fields {
      width: 100%; border-collapse: collapse; min-width: 460px;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); overflow: hidden;
    }
    table.fields th, table.fields td {
      padding: 12px 16px; text-align: start; vertical-align: top;
      border-block-end: 1px solid var(--border-soft); font-size: 0.9em;
    }
    table.fields thead th {
      font-size: 0.74em; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--text-faint); background: var(--surface-3);
    }
    table.fields tbody tr:last-child th, table.fields tbody tr:last-child td { border-block-end: 0; }
    table.fields tbody th {
      font-weight: 700; white-space: nowrap; direction: ltr;
      color: color-mix(in srgb, var(--accent) 58%, var(--text));
    }
    table.fields td { color: var(--text-dim); }

    /* ---------- limits ---------- */
    .limits { list-style: none; display: grid; gap: 11px; }
    .limits li { display: flex; align-items: flex-start; gap: 11px; font-size: 0.93em; color: var(--text-dim); }
    .limits svg {
      width: 18px; height: 18px; flex: none; margin-block-start: 6px;
      color: color-mix(in srgb, var(--brass) 76%, var(--text));
    }

    /* ---------- requirements ---------- */
    .reqs { list-style: none; display: grid; gap: 10px; }
    .reqs li { display: flex; align-items: flex-start; gap: 11px; font-size: 0.94em; }
    .reqs svg {
      width: 18px; height: 18px; flex: none; margin-block-start: 6px;
      color: color-mix(in srgb, var(--accent) 64%, var(--text));
    }

    /* ---------- faq ---------- */
    details.faq {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius-sm); padding: 15px 19px;
      transition: border-color 0.18s ease;
    }
    details.faq[open] { border-color: color-mix(in srgb, var(--accent) 34%, var(--border)); }
    details.faq + details.faq { margin-block-start: 10px; }
    details.faq:first-of-type { margin-block-start: 18px; }
    details.faq summary {
      cursor: pointer; font-weight: 700; list-style: none;
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
    }
    details.faq summary::-webkit-details-marker { display: none; }
    details.faq summary::after { content: '+'; font-weight: 800; color: var(--text-faint); flex: none; }
    details.faq[open] summary::after { content: '−'; }
    details.faq p { color: var(--text-dim); font-size: 0.93em; margin-block-start: 11px; }

    /* ---------- also on this shelf ---------- */
    .shelf { display: grid; gap: 12px; margin-block-start: 18px; }
    .shelf a {
      display: flex; align-items: center; gap: 15px; flex-wrap: wrap;
      padding: 19px; border-radius: var(--radius); text-decoration: none; color: var(--text);
      background: var(--surface); border: 1px solid var(--border);
      transition: transform 0.18s ease, border-color 0.18s ease;
    }
    .shelf a:hover { transform: translateY(-3px); border-color: color-mix(in srgb, var(--accent) 42%, var(--border)); }
    .shelf-mark { font-size: 1.9em; flex: none; }
    .shelf-body { flex: 1 1 240px; min-width: 0; }
    .shelf-name { font-weight: 800; }
    .shelf-desc { font-size: 0.88em; color: var(--text-dim); }
    .shelf-cta { font-weight: 700; font-size: 0.9em; color: color-mix(in srgb, var(--accent) 60%, var(--text)); }

    /* ---------- videos ----------
       The stage and the playlist sit side by side while there is
       room and stack below 900px, which is where a 16 by 9 video
       next to a 300px list stops leaving either of them usable.

       The playlist scrolls inside its own box rather than
       stretching the section: nine rows is taller than the
       player, and a list that sets the section height leaves a
       column of empty space beside the video on every screen
       wide enough to show both. */
    .dvhead {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
      gap: 12px; margin-block-end: 16px;
    }
    .dvlede { color: var(--text-dim); font-size: 0.93em; flex: 1 1 320px; }
    .dvlang { display: flex; align-items: center; gap: 10px; flex: none; }
    .dvlang-label { font-size: 0.82em; color: var(--text-faint); }

    .dvplayer { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 16px; align-items: start; }
    @media (max-width: 900px) { .dvplayer { grid-template-columns: minmax(0, 1fr); } }

    .dvstage {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow);
    }
    .dvstage video {
      display: block; width: 100%; aspect-ratio: 16 / 9;
      background: var(--bg-1); object-fit: contain;
    }
    .dvnow { padding: 14px 17px; border-block-start: 1px solid var(--border-soft); }
    .dvnow b { display: block; font-weight: 800; font-size: 0.98em; line-height: 1.5; }
    .dvnow small { display: block; color: var(--text-dim); font-size: 0.85em; line-height: 1.7; margin-block-start: 5px; }
    .dvcount {
      display: inline-block; margin-block-start: 9px; font-size: 0.76em;
      color: var(--text-faint); letter-spacing: 0.02em;
    }

    .dvlist {
      list-style: none; margin: 0; padding: 0;
      max-height: 520px; overflow-y: auto; overscroll-behavior: contain;
      border: 1px solid var(--border); border-radius: var(--radius);
      background: var(--surface-3);
    }
    .dvlist li + li { border-block-start: 1px solid var(--border-soft); }
    .dvitem {
      display: flex; align-items: flex-start; gap: 11px;
      padding: 12px 13px; text-decoration: none; color: var(--text);
      transition: background 0.16s ease;
    }
    .dvitem:hover { text-decoration: none; background: var(--surface-2); }
    .dvitem.is-on { background: color-mix(in srgb, var(--ink) 22%, transparent); }
    .dvnum {
      flex: none; font-size: 0.72em; font-weight: 800; letter-spacing: 0.04em;
      color: var(--text-faint); padding-block-start: 3px; font-variant-numeric: tabular-nums;
    }
    .dvitem.is-on .dvnum { color: var(--brass); }
    .dvtext { flex: 1 1 auto; min-width: 0; }
    .dvtext b { display: block; font-weight: 700; font-size: 0.87em; line-height: 1.5; }
    .dvtext small { display: block; color: var(--text-dim); font-size: 0.78em; line-height: 1.6; margin-block-start: 3px; }
    .dvdur {
      flex: none; font-size: 0.74em; color: var(--text-faint);
      padding-block-start: 3px; font-variant-numeric: tabular-nums;
    }

    .dvnote { margin-block-start: 16px; border-inline-start: 3px solid var(--brass); }
    .dvnote h3 { font-size: 0.95em; font-weight: 800; margin-block-end: 7px; }
    .dvnote p { color: var(--text-dim); font-size: 0.88em; line-height: 1.85; }

    /* ---------- nav ---------- */
    .nav { display: flex; justify-content: center; margin-block: 8px 26px; }
    .back-link {
      display: inline-flex; align-items: center; gap: 9px;
      padding: 11px 19px; border-radius: var(--radius-sm); text-decoration: none;
      font-weight: 600; font-size: 0.9em; color: var(--text);
      background: var(--surface); border: 1px solid var(--border);
      transition: border-color 0.18s ease;
    }
    .back-link:hover { border-color: color-mix(in srgb, var(--accent) 42%, var(--border)); }
    .back-link svg { width: 17px; height: 17px; }

    @media (max-width: 560px) {
      .wrap { padding-inline: 16px; }
      .panel { padding: 18px; }
      .spec-row { padding: 15px 16px; }
    }

    @media (prefers-reduced-motion: no-preference) {
      .topbar, .hero, section { animation: uRise 0.55s cubic-bezier(0.16,1,0.3,1) both; }
      .hero { animation-delay: 0.04s; }
      .inky { animation: uFloat 4.5s ease-in-out infinite; }
    }
    @keyframes uRise  { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
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

  // Links, not buttons - see Core/SiteNav.js. Same bug, same fix:
  // without an href, the English and Japanese DirectTMP pages had
  // no internal link anywhere pointing at them.
  const segButtons = langs.map(([code, label]) =>
    '<a href="' + escapeHtml(localizedPath('/unity-directtmp', code)) + '"'
    + ' aria-pressed="' + (code === cur ? 'true' : 'false') + '"'
    + (code === cur ? ' aria-current="true"' : '')
    + ' hreflang="' + code + '"'
    + ' onclick="return acSetLang(\'' + code + '\', event)" lang="' + code + '">'
    + escapeHtml(label) + '</a>'
  ).join('')

  return `
    <div class="topbar">
      <a class="brand" href="${escapeHtml(localizedPath('/', lang))}" aria-label="AmirCollider">
        <span class="brand-logo">
          <img src="${escapeHtml(amirLogo)}" alt="" onerror="this.style.display='none'">
        </span>
        <span>
          <span class="brand-name">AmirCollider</span><br>
          <span class="brand-sub">Unity DirectTMP v${escapeHtml(VERSION)}</span>
        </span>
      </a>
      <div class="controls">
        <div class="seg" role="group" aria-label="${escapeHtml(p.langGroup)}">${segButtons}</div>
        <button type="button" id="themeBtn" class="icon-btn" onclick="acToggleTheme()"
                data-to-light="${escapeHtml(p.themeToLight)}"
                data-to-dark="${escapeHtml(p.themeToDark)}"
                aria-label="${escapeHtml(p.themeToDark)}">${icon('contrast')}</button>
      </div>
    </div>`
}

function renderHero(lang) {
  const p = pack(lang)
  return `
    <div class="hero">
      ${inky(122)}
      <h1>${escapeHtml(p.title)}</h1>
      <p class="tagline">${escapeHtml(p.tagline)}</p>
      <p class="lede">${escapeHtml(p.lede)}</p>
      <div class="badge-row">
        <span class="pill is-key">${escapeHtml(p.priceBadge)}</span>
        <span class="pill">${escapeHtml(p.badgeUnity)}</span>
        <span class="pill">${escapeHtml(p.badgeVersion)}</span>
      </div>
      <div class="cta-row">
        <a class="btn btn-primary" href="#install">${icon('download')}<span>${escapeHtml(p.ctaInstall)}</span></a>
        <a class="btn" href="${escapeHtml(REPO_URL)}" rel="noopener">${icon('github')}<span>${escapeHtml(p.ctaRepo)}</span></a>
      </div>
      <p class="whatis">${escapeHtml(p.whatis)}</p>
    </div>`
}


// ==========================================
// renderSymptoms
//
// The section that makes this page findable, and the one that
// makes it understandable. Somebody with this bug does not know
// the package exists and would never search its name; they
// search the symptom. Every line here is a sentence somebody
// actually types, written as content rather than as a keyword
// list - which is also why it is the first thing under the hero.
// ==========================================
function renderSymptoms(lang) {
  const p = pack(lang)
  const items = p.symptoms.map(text => `
    <li>
      <span class="symptom-mark" aria-hidden="true">□</span>
      <span>${escapeHtml(text)}</span>
    </li>`).join('')

  return `
    <section id="problem">
      <span class="eyebrow">${escapeHtml(p.symptomsEyebrow)}</span>
      <h2 class="section-title">${escapeHtml(p.symptomsTitle)}</h2>
      <p class="section-lede">${escapeHtml(p.symptomsLede)}</p>
      <ul class="symptoms">${items}</ul>
    </section>`
}


// ==========================================
// renderSpecimen
//
// The proof. Four renderings of one Persian string, produced in
// the browser from that string rather than photographed, so the
// demonstration cannot go stale and reads correctly at any zoom
// in either theme.
//
// Each row carries its OWN dir attribute. The good row and the
// unjoined row are right-to-left text and are marked as such;
// the reversed row is deliberately laid out in memory order by
// CSS, which is the bug being shown; the tofu row is boxes and
// has no direction worth arguing about.
// ==========================================
function renderSpecimen(lang) {
  const p = pack(lang)

  // `isPersian` tags the row's language for a screen reader and for
  // font selection. It is set on the three rows that hold the Persian
  // specimen and not on the tofu row, which is boxes rather than
  // Persian and should not be announced as a Persian string.
  const row = ({ kind, isPersian, label, note, text, dir, lineCls }) => `
    <div class="spec-row ${kind}">
      <div class="spec-head"><span class="spec-dot" aria-hidden="true"></span>${escapeHtml(label)}</div>
      <div class="spec-line ${lineCls || ''}"${dir ? ' dir="' + dir + '"' : ''}${isPersian ? ' lang="fa"' : ''}>${escapeHtml(text)}</div>
      <div class="spec-note">${escapeHtml(note)}</div>
    </div>`

  return `
    <section id="specimen">
      <span class="eyebrow">${escapeHtml(p.specEyebrow)}</span>
      <h2 class="section-title">${escapeHtml(p.specTitle)}</h2>
      <p class="section-lede">${escapeHtml(p.specLede)}</p>

      <div class="spec">
        ${row({
          kind: 'is-bad', label: p.specTofuLabel, note: p.specTofuNote,
          text: tofu(SPECIMEN_FA), lineCls: 'spec-tofu'
        })}
        ${row({
          kind: 'is-bad', label: p.specUnjoinedLabel, note: p.specUnjoinedNote,
          text: unjoined(SPECIMEN_FA), dir: 'rtl', isPersian: true
        })}
        ${row({
          kind: 'is-bad', label: p.specReversedLabel, note: p.specReversedNote,
          text: unjoined(SPECIMEN_FA), lineCls: 'spec-reversed', isPersian: true
        })}
        ${row({
          kind: 'is-good', label: p.specGoodLabel, note: p.specGoodNote,
          text: SPECIMEN_FA, dir: 'rtl', isPersian: true
        })}
      </div>

      <div class="spec-mixed">
        <div class="spec-line" dir="ltr">${escapeHtml(SPECIMEN_MIX)}</div>
        <div class="spec-note">${escapeHtml(p.specMixLabel)}</div>
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
      <span class="eyebrow">${escapeHtml(p.featuresEyebrow)}</span>
      <h2 class="section-title">${escapeHtml(p.featuresTitle)}</h2>
      <div class="features">${cards}</div>
    </section>`
}


// ==========================================
// renderUsage
// Three steps, the bulk shortcut, the API, and the field table.
// This is the section that answers "and then what", which the
// previous page never did at all.
// ==========================================
function renderUsage(lang) {
  const p = pack(lang)
  const resolved = resolveLang(lang)

  const rows = FIELDS.map(field => `
    <tr>
      <th scope="row">${escapeHtml(field.name)}</th>
      <td>${escapeHtml(field[resolved] || field.en)}</td>
    </tr>`).join('')

  return `
    <section id="usage">
      <span class="eyebrow">${escapeHtml(p.usageEyebrow)}</span>
      <h2 class="section-title">${escapeHtml(p.usageTitle)}</h2>
      <div class="panel">
        <ol class="steps">
          <li><span>${escapeHtml(p.usageStep1)}</span></li>
          <li><span><b>${escapeHtml(p.usageStep2)}</b></span></li>
          <li><span>${escapeHtml(p.usageStep3)}</span></li>
        </ol>
        <p style="margin-block-start:16px">${escapeHtml(p.usageAfter)}</p>
        <p class="note" style="margin-block-start:12px">${escapeHtml(p.usageBulk)}</p>
      </div>

      <div class="panel">
        <h3 class="section-title" style="font-size:1.06em">${escapeHtml(p.usageCodeTitle)}</h3>
        <pre class="code"><code>${escapeHtml(CODE_SAMPLE)}</code></pre>
      </div>

      <h3 class="section-title" style="font-size:1.1em; margin-block-start:26px">${escapeHtml(p.fieldsTitle)}</h3>
      <div class="table-scroll">
        <table class="fields">
          <thead>
            <tr>
              <th scope="col">${escapeHtml(p.fieldsColName)}</th>
              <th scope="col">${escapeHtml(p.fieldsColWhat)}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`
}


// ==========================================
// The poster frame
//
// A video element with nothing loaded paints its own background,
// which on this page is a flat grey rectangle where the picture
// should be until somebody presses play. It reads as a broken
// embed rather than as a video.
//
// There is no poster image to point at - the clips are bare MP4s
// on the download host and nothing generates a thumbnail for
// them - so the frame is taken from the clip itself. A media
// fragment asks the browser to seek to that timestamp, and
// preload of metadata gives it permission to fetch the little it
// needs to decode there, which is a range request and not the
// whole clip.
//
// A tenth of a second rather than zero: some encoders put a
// black frame at exactly 0, and Safari treats a bare fragment of
// t=0 as no fragment at all and paints nothing.
// ==========================================
const POSTER_FRAGMENT = '#t=0.1'


// ==========================================
// renderVideos
// The demo clips, as a player with a playlist beside it.
//
// The clip language and the PAGE language are two different
// things and are deliberately not tied together. A Persian
// reader comparing the English narration against the Persian one
// should not have the interface change under them, so the
// playlist titles stay in the page language and only the file
// being played follows the switcher.
// ==========================================
function renderVideos(lang) {
  const p = pack(lang)
  const resolved = resolveLang(lang)
  const startLang = VIDEO_LANGS.indexOf(resolved) !== -1 ? resolved : 'en'

  const langButtons = VIDEO_LANGS.map(code => `
    <button type="button" data-dvlang="${code}" lang="${code}"
            aria-pressed="${code === startLang ? 'true' : 'false'}">
      ${escapeHtml(pack(code).langName || code.toUpperCase())}
    </button>`).join('')

  // Anchors, not buttons, and the href is the clip's own address.
  //
  // This is the difference between nine videos a crawler can
  // follow and one: everything past the first clip would
  // otherwise exist only as a string inside the player script,
  // reachable only by running it. As anchors they are nine real
  // links, the player still intercepts a plain left click, and a
  // reader with no JavaScript gets the file rather than a dead
  // button.
  const items = VIDEOS.map((clip, index) => `
    <li>
      <a class="dvitem${index === 0 ? ' is-on' : ''}" data-id="${clip.id}"
         href="${escapeHtml(videoUrl(startLang, clip))}"
         aria-current="${index === 0 ? 'true' : 'false'}">
        <span class="dvnum">${String(clip.id).padStart(2, '0')}</span>
        <span class="dvtext">
          <b>${escapeHtml(clip.title[resolved])}</b>
          <small>${escapeHtml(clip.blurb[resolved])}</small>
        </span>
        <span class="dvdur" dir="ltr">${formatDuration(clip.seconds)}</span>
      </a>
    </li>`).join('')

  const first = VIDEOS[0]

  return `
    <section id="videos">
      <span class="eyebrow">${escapeHtml(p.videosEyebrow)}</span>
      <h2 class="section-title">${escapeHtml(p.videosTitle)}</h2>

      <div class="dvhead">
        <p class="dvlede">${escapeHtml(p.videoLede(VIDEOS.length, formatDuration(totalSeconds())))}</p>
        <div class="dvlang">
          <span class="dvlang-label">${escapeHtml(p.videoLangLabel)}</span>
          <div class="seg" role="group" aria-label="${escapeHtml(p.videoLangLabel)}">${langButtons}</div>
        </div>
      </div>

      <div class="dvplayer">
        <div class="dvstage">
          <video id="dvEl" controls preload="metadata" playsinline
                 src="${escapeHtml(videoUrl(startLang, first) + POSTER_FRAGMENT)}"
                 aria-describedby="dvTitle">
            <p>${escapeHtml(p.videoNoSupport)}
               <a id="dvDl" href="${escapeHtml(videoUrl(startLang, first))}">${escapeHtml(p.videoDownload)}</a></p>
          </video>
          <div class="dvnow">
            <b id="dvTitle">${escapeHtml(first.title[resolved])}</b>
            <small id="dvBlurb">${escapeHtml(first.blurb[resolved])}</small>
            <span class="dvcount" id="dvCount">${escapeHtml(p.videoOf(1, VIDEOS.length))}</span>
          </div>
        </div>
        <ol class="dvlist" id="dvList">${items}</ol>
      </div>

      <div class="panel dvnote">
        <h3>${escapeHtml(p.videoNoteTitle)}</h3>
        <p>${escapeHtml(p.videoNoteBody)}</p>
      </div>
    </section>`
}


// ==========================================
// videoGraph
// Every clip in this language, as structured data.
//
// One VideoObject per clip rather than one for the section, and
// all nine declared in the markup whatever the player happens to
// be showing - because a crawler runs no JavaScript and would
// otherwise find a page with nine videos on it that declares
// one.
//
// contentUrl is the file on the download host, absolute. That is
// the field that decides whether a self-hosted clip can be
// indexed at all: a video the crawler cannot fetch is not
// indexed, whatever else the node says.
// ==========================================
function videoGraph(lang) {
  const resolved = resolveLang(lang)
  const clipLang = VIDEO_LANGS.indexOf(resolved) !== -1 ? resolved : 'en'

  return VIDEOS.map(clip => videoObjectLd({
    name: clip.title[resolved],
    description: clip.blurb[resolved],
    contentUrl: videoUrl(clipLang, clip),
    lang: resolved,
    uploadDate: VIDEOS_PUBLISHED,
    durationSeconds: clip.seconds
  })).filter(Boolean)
}


// ==========================================
// videoScript
// The player.
//
// Simpler than the DocSnap page's equivalent, because there is
// nothing to resolve at runtime: every address is built on the
// server by Content/DirectTmpVideos.js and handed over as a map,
// so switching clip or language is a lookup rather than a guess
// at a storage key.
// ==========================================
function videoScript(lang) {
  const resolved = resolveLang(lang)
  const p = pack(lang)
  const startLang = VIDEO_LANGS.indexOf(resolved) !== -1 ? resolved : 'en'

  const meta = {}
  for (const clip of VIDEOS) {
    meta[clip.id] = { t: clip.title[resolved], b: clip.blurb[resolved] }
  }

  return `<script>
    (function () {
      var URLS = ${JSON.stringify(urlMap())};
      var META = ${JSON.stringify(meta)};
      var IDS = ${JSON.stringify(VIDEOS.map(clip => clip.id))};
      var OF = ${JSON.stringify(p.videoOf('__I__', '__N__'))};
      var POSTER = ${JSON.stringify(POSTER_FRAGMENT)};

      var video = document.getElementById('dvEl');
      if (!video) return;

      var list = document.getElementById('dvList');
      var titleEl = document.getElementById('dvTitle');
      var blurbEl = document.getElementById('dvBlurb');
      var countEl = document.getElementById('dvCount');
      var dlEl = document.getElementById('dvDl');

      var vlang = ${JSON.stringify(startLang)};
      var current = IDS[0];

      // Loading a clip is a src swap plus load(), never a new
      // video element. Replacing the element would throw away the
      // volume and fullscreen the reader has already set, which
      // on a nine-item playlist means re-muting eight times.
      function select(id, autoplay) {
        current = id;
        var url = URLS[vlang][id];

        video.src = url + POSTER;
        video.load();
        if (autoplay) {
          var playing = video.play();
          // Autoplay is refused by some configurations even after
          // a click, and an unhandled rejection in the console is
          // noise nobody needs.
          if (playing && playing.catch) playing.catch(function () {});
        }

        if (titleEl) titleEl.textContent = META[id].t;
        if (blurbEl) blurbEl.textContent = META[id].b;
        if (dlEl) dlEl.href = url;
        if (countEl) {
          countEl.textContent = OF
            .replace('__I__', String(IDS.indexOf(id) + 1))
            .replace('__N__', String(IDS.length));
        }

        Array.prototype.forEach.call(list.querySelectorAll('.dvitem'), function (link) {
          var on = Number(link.getAttribute('data-id')) === id;
          link.classList.toggle('is-on', on);
          link.setAttribute('aria-current', on ? 'true' : 'false');
          // The href follows the clip language, so the link a
          // reader copies is the clip they are looking at.
          link.setAttribute('href', URLS[vlang][link.getAttribute('data-id')]);
        });
      }

      Array.prototype.forEach.call(list.querySelectorAll('.dvitem'), function (link) {
        link.addEventListener('click', function (event) {
          // The href is real and is what a crawler and a reader
          // without JavaScript follow. With the player running,
          // staying on the page is the better answer - but only
          // for a plain left click. A middle click or ctrl-click
          // means "open the file separately" and is left alone.
          if (event.defaultPrevented) return;
          if (event.button !== 0 || event.metaKey || event.ctrlKey
              || event.shiftKey || event.altKey) return;
          event.preventDefault();
          select(Number(link.getAttribute('data-id')), true);
        });
      });

      // Switching the clip language keeps the clip you were on,
      // because every clip exists in all three. Jumping back to
      // the first one would punish exactly the person who is
      // comparing one clip across two languages.
      Array.prototype.forEach.call(document.querySelectorAll('[data-dvlang]'), function (button) {
        button.addEventListener('click', function () {
          var next = button.getAttribute('data-dvlang');
          if (next === vlang) return;
          vlang = next;
          Array.prototype.forEach.call(document.querySelectorAll('[data-dvlang]'), function (other) {
            other.setAttribute('aria-pressed', other === button ? 'true' : 'false');
          });
          select(current, false);
        });
      });
    })();
  </script>`
}


function renderInstall(lang) {
  const p = pack(lang)
  return `
    <section id="install">
      <span class="eyebrow">${escapeHtml(p.installEyebrow)}</span>
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
          <li><span>${escapeHtml(p.installStep4)}</span></li>
        </ol>
      </div>
    </section>`
}


// ==========================================
// renderLimits
//
// What it does not do, on the page rather than in a footnote.
// A tool page that only lists wins is a tool page nobody
// believes twice, and every line here is one the README already
// states - so a reader who installs on the strength of this page
// finds the same limits waiting, which is the whole point.
// ==========================================
function renderLimits(lang) {
  const p = pack(lang)
  const items = p.limits
    .map(text => '<li>' + icon('alert') + '<span>' + escapeHtml(text) + '</span></li>')
    .join('')

  return `
    <section id="limits">
      <span class="eyebrow">${escapeHtml(p.limitsEyebrow)}</span>
      <h2 class="section-title">${escapeHtml(p.limitsTitle)}</h2>
      <p class="section-lede">${escapeHtml(p.limitsLede)}</p>
      <div class="panel"><ul class="limits">${items}</ul></div>
    </section>`
}


function renderRequirements(lang) {
  const p = pack(lang)
  const items = [p.reqUnity, p.reqTmp, p.reqNone, p.reqCost]
    .map(item => '<li>' + icon('check') + '<span>' + escapeHtml(item) + '</span></li>')
    .join('')

  return `
    <section id="requirements">
      <span class="eyebrow">${escapeHtml(p.reqEyebrow)}</span>
      <h2 class="section-title">${escapeHtml(p.reqTitle)}</h2>
      <div class="panel">
        <ul class="reqs">${items}</ul>
      </div>
      <div class="panel">
        <h3 class="section-title" style="font-size:1.02em">${escapeHtml(p.troubleTitle)}</h3>
        <p style="margin-block-start:10px; color:var(--text-dim); font-size:0.93em">${escapeHtml(p.troubleBody)}</p>
      </div>
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
      <span class="eyebrow">FAQ</span>
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
      <a href="${escapeHtml(localizedPath(tool.href, lang))}">
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
      <div class="nav">
        <a class="back-link" href="${escapeHtml(localizedPath('/tools', lang))}">
          ${icon('arrow')}<span>${escapeHtml(p.back)}</span>
        </a>
      </div>
    </section>`
}


// ==========================================
// Search metadata
//
// The terms below are the ones this page genuinely answers, in
// the language it renders in. They are NOT a wish list: every
// one of them has a matching section of real content above, and
// a term without one belongs in neither place.
//
// This is what was missing before. The page carried a canonical,
// hreflang and a SoftwareApplication node with a one-line
// description - and nothing that told a crawler the thing it was
// looking at is the answer to "why is my Persian text broken in
// Unity". A crawler cannot infer that from a product name.
// ==========================================
const KEYWORDS = {
  fa: [
    'مشکل فارسی در یونیتی', 'حل مشکل RTL یونیتی', 'فارسی نویسی در یونیتی',
    'متن راست به چپ یونیتی', 'حروف فارسی به هم نمی‌چسبند', 'مربع خالی یونیتی',
    'فونت فارسی یونیتی', 'TextMeshPro فارسی', 'یونیتی متن عربی',
    'نمایش فارسی TextMeshPro', 'افزونه فارسی یونیتی', 'Unity DirectTMP'
  ],
  en: [
    'Unity RTL fix', 'Unity Persian text', 'Unity Arabic text not joining',
    'TextMeshPro Arabic', 'TextMeshPro Persian font', 'Unity right to left text',
    'Unity tofu boxes', 'Unity missing glyphs', 'Unity dynamic font TTF',
    'Unity Arabic shaping', 'Unity bidi', 'Unity DirectTMP'
  ],
  ja: [
    'Unity 日本語 文字化け', 'Unity 豆腐 文字', 'TextMeshPro 日本語 フォント',
    'Unity フォント 動的', 'Unity アラビア語 表示', 'Unity 右から左 テキスト',
    'TextMeshPro 中国語', 'Unity 多言語 フォント', 'Unity DirectTMP'
  ]
}

// What the tool does, in the vocabulary a machine indexes rather
// than the vocabulary a headline is written in.
const FEATURE_LIST = {
  fa: [
    'شکل‌دهی و اتصال حروف فارسی، عربی و اردو از روی جدول GSUB خودِ فونت',
    'ترتیب راست‌به‌چپ (bidi)، شامل خط‌های شکسته‌شده',
    'استفاده‌ی مستقیم از فایل .ttf و .otf بدون Font Asset Creator',
    'یک فونت جدا برای هر زبان روی یک لیبل',
    'OutLine مخصوص یک لیبل با متریال اختصاصی',
    'پشتیبانی از ژاپنی، چینی، کره‌ای، سیریلیک، یونانی، تایلندی و ایموجی',
    'بارگذاری فونت در زمان اجرا از فایل یا آرایه‌ی بایت'
  ],
  en: [
    'Arabic, Persian and Urdu letter shaping read from the font’s own GSUB table',
    'Right-to-left (bidi) reordering, including across wrapped lines',
    'Use a .ttf or .otf directly, with no Font Asset Creator step',
    'A different font per language on a single label',
    'Per-label outline through an owned material',
    'Japanese, Chinese, Korean, Cyrillic, Greek, Thai and emoji support',
    'Runtime font loading from a file path or a byte array'
  ],
  ja: [
    'フォント自身の GSUB テーブルから読み出すアラビア文字・ペルシャ語・ウルドゥー語の整形',
    '折り返し行を含む右から左(bidi)の並べ替え',
    'Font Asset Creator を使わず .ttf / .otf を直接利用',
    '1 つのラベルで言語ごとに異なるフォント',
    '専用マテリアルによるラベル単位のアウトライン',
    '日本語・中国語・韓国語・キリル文字・ギリシャ文字・タイ文字・絵文字に対応',
    'ファイルパスやバイト配列からの実行時フォント読み込み'
  ]
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

  // The title carries the symptom, not just the product name. A
  // result reading "Unity DirectTMP - Unity tools" tells somebody
  // searching for broken Persian text nothing at all; this one is
  // the answer to their query in the fifty characters they read.
  const title = p.metaTitle

  const trail = [
    { href: '/', label: site.home },
    { href: '/tools', label: site.tools },
    { href: '/unity-directtmp', label: 'Unity DirectTMP' }
  ]

  const installSteps = [p.installStep1, p.installStep2, p.installStep3 + ' ' + GIT_URL, p.installStep4]

  return `<!DOCTYPE html>
<html dir="${p.dir}" lang="${resolved}"${themeAttr}>
<head>
  ${getPageHead({ title, amirLogo, description: p.metaDesc })}
  ${seoHead({
    path: '/unity-directtmp',
    title,
    description: p.metaDesc,
    lang: resolved,
    type: 'product',
    keywords: KEYWORDS[resolved] || KEYWORDS.en,
    // The share card, when one has been uploaded. Omitting the key
    // entirely (rather than passing null) is what lets seoHead keep
    // its own default: a null would override the fallback with
    // nothing and emit an empty og:image, which is worse than the
    // logo. See CARD_URL in Config.js.
    ...(CONFIG.DIRECTTMP.CARD_URL ? { image: CONFIG.DIRECTTMP.CARD_URL } : {}),
    graph: [
      breadcrumbLd(trail, resolved),
      softwareApplicationLd({
        name: 'Unity DirectTMP',
        alternateName: ['DirectTMP', 'Unity Direct TMP'],
        description: p.lede,
        path: '/unity-directtmp',
        version: VERSION,
        price: '0',
        repo: REPO_URL,
        downloadUrl: REPO_URL,
        installUrl: GIT_URL,
        softwareHelp: REPO_URL + '#readme',
        featureList: FEATURE_LIST[resolved] || FEATURE_LIST.en,
        keywords: KEYWORDS[resolved] || KEYWORDS.en,
        requirements: 'Unity 2021.3 LTS or newer, TextMeshPro',
        inLanguage: ['fa', 'en', 'ja'],
        license: 'https://opensource.org/licenses/MIT'
      }),
      howToLd({
        name: p.installTitle,
        description: p.installEyebrow,
        path: '/unity-directtmp',
        lang: resolved,
        tool: 'Unity Package Manager',
        steps: installSteps
      }),
      faqPageLd(p.faq, resolved),
      ...videoGraph(resolved)
    ]
  })}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap"></noscript>
  ${themeBootScript()}
  <style>${siteNavCss()}${getCSS()}</style>
</head>
<body>
  <div class="wrap">
    ${renderTopbar(resolved, amirLogo)}
    ${siteBreadcrumb({ lang: resolved, trail })}
    <main id="main">
      ${renderHero(resolved)}
      ${renderSymptoms(resolved)}
      ${renderSpecimen(resolved)}
      ${renderFeatures(resolved)}
      ${renderVideos(resolved)}
      ${renderUsage(resolved)}
      ${renderInstall(resolved)}
      ${renderLimits(resolved)}
      ${renderRequirements(resolved)}
      ${renderFaq(resolved)}
      ${renderShelf(resolved)}
    </main>
    ${siteFooter({ lang: resolved })}
  </div>
  ${siteBackToTop({ lang: resolved })}
  ${chromeScript()}
  ${copyUrlScript()}
  ${videoScript(resolved)}
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
