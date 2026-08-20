// ==========================================
// Pages/UnityDocSnap.js
// The Unity DocSnap product page: what the tool does,
// what each of the three editions includes, and the buy
// buttons.
//
// Public entry:
//   handleUnityDocSnap(url, request, gameId, requestId, GAMES, env)
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
//   • The page wears the tool's own Cozy skin rather than the
//     site's default violet. Somebody who has seen an export
//     recognises the cream, the blush pink and the boba cup
//     before they read a word, and somebody who has not gets
//     shown what the thing they are buying looks like instead
//     of being told about it.
//
// Trilingual and theme-aware like every other page here:
// language resolves ?lang= -> cookie -> Accept-Language, and
// switching reloads so RTL/LTR is always correct.
// ==========================================

import { CONFIG } from '../Config.js'
import { getPageHead } from '../Core/DesignSystem.js'
import { createHtmlResponse } from '../Core/Http.js'
import {
  VIDEOS as VIDEOS_ALL, VIDEO_LANGS, videosFor, totalSecondsFor, formatDuration
} from '../Content/DocSnapVideos.js'
import { otherTools } from '../Content/ToolsCatalog.js'

import { escapeHtml } from '../Core/Html.js'
import { chromeScript, themeBootScript } from '../Core/PageChrome.js'
import { seoHead, breadcrumbLd, softwareApplicationLd, faqPageLd, howToLd } from '../Core/Seo.js'
import { localizedPath } from '../Core/Locale.js'
import { siteNavCss, siteBreadcrumb, siteFooter, NAV_I18N } from '../Core/SiteNav.js'
import { langCookieHeader, parseCookies, resolveRequestLang, resolveRequestTheme } from '../Core/RequestContext.js'

const PLUS = CONFIG.DOCSNAP.TIERS.plus
const PRO = CONFIG.DOCSNAP.TIERS.pro
const REPO_URL = CONFIG.DOCSNAP.REPO_URL
const GIT_URL = CONFIG.DOCSNAP.GIT_URL
const VERSION = CONFIG.DOCSNAP.VERSION


// A string that will sit inside a single-quoted JavaScript literal
// in an inline handler. Escaping for HTML is not enough there - a
// quote or a backslash breaks out of the literal rather than out of
// the attribute.
function escapeJs(value) {
  return String(value == null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r?\n/g, '\\n')
    .replace(/</g, '\\u003c')
}


// ==========================================
// The Cozy palette
//
// Lifted from the skin the tool actually ships
// (Editor/UnityDocSnap/Site~/style.css, :root[data-skin=cozy])
// so the page somebody buys from and the site the exporter
// writes are recognisably the same product, rather than two
// unrelated shades of purple.
//
// The warmth lives in the surfaces, the borders and the
// accents — never in the ink. That is the one rule the skin
// itself had to learn: pastel body text is a page you squint
// at, so the text stays dark plum and only the paper is sweet.
// ==========================================
const LAV = '#7a52b8'          // the violet accent
const LAV_SOFT = '#9c78d8'
const LAV_LIGHT = '#c9b8f0'    // the same accent, for dark rooms
const CORAL = '#ff7593'        // the pink the mascot is drawn in
const CORAL_SOFT = '#ff9fb4'
const CORAL_LIGHT = '#ff9db0'
const HONEY = '#ffd166'        // the straw topper
const MINT = '#2b7a3c'
const MINT_LIGHT = '#8fd98c'

const CREAM = '#fffaf3'
const PEACH = '#fff3e6'
const BLUSH = '#ffe6f1'
const INK = '#2b1d35'          // the darkest thing on a cozy page
const NIGHT = '#1c1922'
const COCOA = '#4a2f38'        // the pearls


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
    tagline: 'مستندسازی خودکار پروژه‌ی یونیتی — کل پروژه، توی یک وب‌سایت آفلاین.',

    // The <title> and the meta description are their OWN strings
    // now. They used to be title + tagline and the whole lede,
    // which produced an 82-character title and a 408-character
    // description - both cut off by Google well before their
    // point, and the description cut mid-clause. The lede is good
    // page prose and stays exactly as it is; these two are
    // written to the length a result actually shows.
    metaTitle: 'Unity DocSnap — مستندسازی خودکار پروژه‌ی یونیتی',
    metaDesc: 'Unity DocSnap هر سین، گیم‌آبجکت، کامپوننت و فیلد پروژه‌ی یونیتی را می‌گردد و همه را در یک وب‌سایت HTML آفلاین می‌پزد. نسخه‌ی رایگان بدون حساب کاربری.',
    lede: 'یک ابزار مستندسازی برای یونیتی. هر سین را می‌گردد — هر گیم‌آبجکت، هر کامپوننت، هر فیلد سریالایزشده، هر رفرنس — و هر پوشه‌ی اسست را با تنظیمات ایمپورتش، و همه را می‌پزد توی یک وب‌سایت HTML آفلاین که با دابل‌کلیک باز می‌شود. بدون سرور، بدون بیلد، بدون اینترنت. هم برای اینکه خودت یادت بماند چه ساخته‌ای، هم به‌عنوان یک بک‌آپ خوانا از ساختار پروژه، هم برای اینکه کل پروژه را یک‌جا بدهی دست یک دستیار هوش مصنوعی.',

    // The one-line answer to "what IS this". Deliberately uses the
    // category noun rather than the product name.
    whatis: 'یک افزونه‌ی یونیتی (نصب از Package Manager) که از پروژه‌ات مستندات HTML آفلاین می‌سازد.',

    ctaFree: 'رایگان شروع کن',
    ctaPrices: 'قیمت‌ها را ببین',
    priceNote: 'خرید یک‌باره · یک سیستم · بدون اشتراک ماهانه',

    sectionWhat: 'چه‌کار می‌کند',
    sectionIs: 'دقیقاً چه هست و چه نیست',
    sectionVideos: 'ببین چطور کار می‌کند',
    sectionCompare: 'مقایسه‌ی نسخه‌ها',
    sectionSpotlight: 'چیزی که بیشترین آدم برایش پول می‌دهد',
    sectionInstall: 'نصب و دانلود',
    sectionPricing: 'قیمت',
    sectionFaq: 'سؤال‌های پرتکرار',

    isLede: 'اسم ابزار باعث سوءتفاهم می‌شود، پس صریح می‌نویسیم:',
    isTitle: 'چه هست',
    isList: [
      'یک مستندساز: داده‌های واقعی پروژه را می‌خواند — سین‌ها، کامپوننت‌ها، فیلدهای سریالایزشده، رفرنس‌ها، تنظیمات ایمپورت — و از روی آن‌ها یک سایت می‌سازد.',
      'یک عکس لحظه‌ای از ساختار پروژه، که نگهش می‌داری و بعداً با خروجی جدیدتر مقایسه‌اش می‌کنی.',
      'یک راه برای دادن کل پروژه به یک دستیار هوش مصنوعی، در یک فایل.',
      'کاملاً Editor-only و آفلاین: نه چیزی به بیلدت اضافه می‌کند، نه نسخه‌ی رایگانش اصلاً به شبکه وصل می‌شود.'
    ],
    isNotTitle: 'چه نیست',
    isNotList: [
      'ابزار اسکرین‌شات نیست. هیچ‌وقت از پنجره‌های یونیتی عکس نمی‌گیرد. (می‌تواند از تصاویر پروژه‌ات پیش‌نمایش PNG کوچک بسازد — گزینه‌ای که می‌شود خاموشش کرد.)',
      'ضبط‌کننده‌ی ویدیو یا گیم‌پلی نیست.',
      'سیستم کنترل نسخه نیست و جای Git را نمی‌گیرد.',
      'مستندساز API مثل Doxygen نیست؛ چیزی که مستند می‌کند محتوای سین‌ها و اسست‌هاست، نه سطح API کد سی‌شارپت.'
    ],

    installLede: 'نسخه‌ی رایگان هیچ کدی نمی‌خواهد. همین آدرس را توی Package Manager بچسبان و تمام.',
    installStep1: 'برو به Window ← Package Manager',
    installStep2: 'کلیک کن روی + ← Add package from git URL…',
    installStep3: 'این آدرس را بچسبان و Add را بزن:',
    installStep4: 'تمام — منوی Unity DocSnap بالای یونیتی اضافه می‌شود.',
    installAlt: 'یا ریپازیتوری را دانلود کن و پوشه‌ی Editor/UnityDocSnap را (همراه زیرپوشه‌ی ~Site) داخل Assets پروژه‌ات کپی کن.',
    copy: 'کپی',
    copied: 'کپی شد',

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
       'نسخه‌ی Plus دو تا قابلیت دارد: خروجی آماده‌ی هوش مصنوعی و صفحه‌ی تغییرات. نسخه‌ی Pro علاوه بر این‌ها تاریخچه‌ی نامحدود نسخه‌ها، بروزرسانی افزایشی، اتوماسیون CI، کپی فایل‌ها، بک‌آپ کل پروژه، مدیریت و حذف اسنپ‌شات‌ها و لوگوی اختصاصی را هم دارد. اگر فقط آن دو تا را می‌خواهی، Plus دقیقاً برای تو ساخته شده.'],
      ['بعداً می‌توانم از Plus به Pro ارتقا بدهم؟',
       'بله — کد Pro را جدا می‌خری و همان را توی یونیتی وارد می‌کنی. کد Plus قبلی‌ات را هم می‌توانی روی سیستم دیگری نگه داری.'],
      ['روی چند سیستم کار می‌کند؟',
       'هر کد روی یک سیستم فعال می‌شود. اگر سیستمت را عوض کردی، از داخل خود یونیتی یا از صفحه‌ی لایسنس همین سایت آزادش کن و روی سیستم جدید فعالش کن — بدون ایمیل زدن به کسی.'],
      ['اگر اینترنت نداشته باشم چه؟',
       'بعد از یک بار فعال‌سازی، ۴۵ روز کاملاً آفلاین کار می‌کند و هر وقت آنلاین شدی خودش بی‌صدا تمدید می‌شود. هیچ چک لایسنسی سر راه اکسپورت نیست.'],
      ['نسخه‌ی رایگان چیزی از پروژه‌ام را جایی می‌فرستد؟',
       'نه. نسخه‌ی رایگان اصلاً به اینترنت وصل نمی‌شود. نسخه‌های پولی هم فقط موقع فعال‌سازی و تمدید یک درخواست می‌فرستند که فقط شامل کد لایسنس، یک شناسه‌ی هش‌شده‌ی سیستم و شماره‌ی نسخه است — هیچ‌چیزی از پروژه‌ات.'],
      ['می‌توانم خروجی‌های قدیمی را پاک کنم؟',
       'در نسخه‌ی رایگان و Plus نه. سقف اسنپ‌شات‌ها (۳ و ۵ تا) در یک رجیستری شمرده می‌شود، و پاک‌کردن دستی پوشه‌ی خروجی آن شمارش را صفر نمی‌کند — وگرنه سقف فقط یک دست‌انداز بود، نه یک محدودیت. نسخه‌ی Pro اصلاً سقف ندارد، پس داخل پنجره‌ی Export بخش «Manage snapshots» را دارد: هر نسخه را جداگانه و با یک تأیید که اسمش را می‌گوید حذف می‌کنی، و وقتی هیچ اسنپ‌شاتی نماند می‌شود کش خروجی را هم پاک کرد — فقط چیزهایی که خود DocSnap آن‌جا نوشته؛ خود پوشه و هر چیز دیگری که داخلش باشد دست‌نخورده می‌ماند.'],
      ['روی CI کار می‌کند؟',
       'بله، با نسخه‌ی Pro: هم DocSnapAPI از C# و هم ‎-executeMethod از خط فرمان، با خروجی غیرصفر وقتی اکسپورت شکست بخورد.'],
      ['چه نسخه‌ای از یونیتی؟',
       'یونیتی ۲۰۲۱.۳ به بالا، شامل Unity 6. بدون هیچ وابستگی جانبی، و کاملاً Editor-only — نه چیزی به بیلدت اضافه می‌کند نه هزینه‌ی رانتایم دارد.']
    ],

    themeToLight: 'حالت روشن',
    themeToDark: 'حالت تاریک',
    mascotAlt: 'ماسکوت بوبای Unity DocSnap',
    footerBack: 'بازگشت به AmirCollider'
  },

  en: {
    locale: 'en-US',
    dir: 'ltr',
    langName: 'English',

    title: 'Unity DocSnap',
    tagline: 'Automatic Unity project documentation — your whole project as an offline website.',
    metaTitle: 'Unity DocSnap — Automatic Unity project documentation',
    metaDesc: 'Unity DocSnap walks every Scene, GameObject, Component and serialized field in a Unity project and bakes it into an offline HTML site. Free edition, no account.',
    lede: 'A documentation generator for Unity. It walks every Scene — every GameObject, every Component, every serialized field, every reference — and every Asset folder with its import settings, then bakes all of it into an offline HTML website you open by double-clicking. No server, no build step, no internet. Read it to remember what you built, keep it as a legible backup of how the project is put together, or hand the whole thing to an AI assistant at once.',

    // The one-line answer to "what IS this". Deliberately uses the
    // category noun rather than the product name.
    whatis: 'A Unity Editor extension (installed from the Package Manager) that generates offline HTML documentation of your project.',

    ctaFree: 'Start free',
    ctaPrices: 'See pricing',
    priceNote: 'One-off purchase · one machine · no subscription',

    sectionWhat: 'What it does',
    sectionIs: 'What it is, and what it is not',
    sectionVideos: 'See it work',
    sectionCompare: 'Compare the editions',
    sectionSpotlight: 'What most people pay for',
    sectionInstall: 'Install and download',
    sectionPricing: 'Pricing',
    sectionFaq: 'Common questions',

    isLede: 'The name invites one particular misunderstanding, so plainly:',
    isTitle: 'What it is',
    isList: [
      'A documentation generator: it reads your project’s real data — Scenes, Components, serialized fields, references, import settings — and builds a website out of it.',
      'A snapshot of how the project is structured, which you keep and later diff against a newer export.',
      'A way to hand an AI assistant your whole project in a single file.',
      'Entirely Editor-only and offline: nothing is added to your build, and the free edition never touches the network at all.'
    ],
    isNotTitle: 'What it is not',
    isNotList: [
      'It is not a screenshot tool. It never photographs your Editor windows. (It can write small PNG previews of your image assets — an option you can switch off.)',
      'It is not a video or gameplay recorder.',
      'It is not version control, and it does not replace Git.',
      'It is not an API documentation generator like Doxygen — it documents what is inside your Scenes and Assets, not your C# API surface.'
    ],

    installLede: 'The free edition needs no key at all. Paste this into the Package Manager and you are done.',
    installStep1: 'Open Window → Package Manager',
    installStep2: 'Click + → Add package from git URL…',
    installStep3: 'Paste this and press Add:',
    installStep4: 'Done — a Unity DocSnap menu appears in Unity’s top menu bar.',
    installAlt: 'Or download the repository and copy the Editor/UnityDocSnap folder — including its Site~ sub-folder — into your project’s Assets folder.',
    copy: 'Copy',
    copied: 'Copied',

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
       'Plus is two features: the AI-ready summaries and the Changes page. Pro adds unlimited version history, incremental updates, CI automation, file copies, whole-project backups, snapshot management and a custom logo on top. If those two are all you want, Plus is built for exactly you.'],
      ['Can I upgrade from Plus to Pro later?',
       'Yes — buy a Pro key and enter it in Unity. Your Plus key is unaffected and can stay on another machine.'],
      ['How many machines?',
       'One machine per key. Moving to a new computer is self-service — release the old machine from inside Unity or from the licence page on this site, then activate the new one. No email to anybody.'],
      ['What if I am offline?',
       'After one activation it works fully offline for 45 days and renews itself quietly whenever you happen to be online. There is never a licence check in front of an export.'],
      ['Does anything leave my project?',
       'No. The free edition never touches the network at all. The paid editions send one request when activating or renewing, containing only the licence key, a hashed machine identifier and the package version — nothing about your project.'],
      ['Can I delete old exports?',
       'Not on Free or Plus. The snapshot caps (3 and 5) are counted in a registry, and emptying the output folder by hand does not reset that count — otherwise the cap would be a speed bump rather than a limit. Pro has no cap at all, so it gets a Manage snapshots section in the Export window: delete any version one at a time, with a confirmation naming it, and once no snapshots are left you can clear the output cache too — only what DocSnap wrote there. The folder itself, and anything else inside it, is left alone.'],
      ['Does it run in CI?',
       'Yes, with Pro: DocSnapAPI from C# and -executeMethod from a command line, with a non-zero exit when an export fails.'],
      ['Which Unity versions?',
       'Unity 2021.3 LTS and newer, including Unity 6. No third-party dependencies, and entirely Editor-only — it adds nothing to your build and costs nothing at runtime.']
    ],

    themeToLight: 'Light mode',
    themeToDark: 'Dark mode',
    mascotAlt: 'The Unity DocSnap boba mascot',
    footerBack: 'Back to AmirCollider'
  },

  ja: {
    locale: 'ja-JP',
    dir: 'ltr',
    langName: '日本語',

    title: 'Unity DocSnap',
    tagline: 'Unity プロジェクトのドキュメントを自動生成 — まるごとオフライン Web サイトに。',
    metaTitle: 'Unity DocSnap — Unity プロジェクトの自動ドキュメント生成',
    metaDesc: 'Unity DocSnap は Unity プロジェクトのシーン・GameObject・コンポーネント・フィールドを走査し、オフライン HTML サイトに書き出します。無料版はアカウント不要。',
    lede: 'Unity 用のドキュメント生成ツールです。すべてのシーン(GameObject、コンポーネント、シリアライズ済みフィールド、参照)と、すべてのアセットフォルダのインポート設定を走査し、ダブルクリックで開けるオフライン HTML サイトに書き出します。サーバーもビルド手順もインターネットも不要です。自分が何を作ったか思い出すためにも、プロジェクト構成の読めるバックアップとしても、AI アシスタントにまるごと渡すためにも使えます。',

    // The one-line answer to "what IS this". Deliberately uses the
    // category noun rather than the product name.
    whatis: 'プロジェクトのオフライン HTML ドキュメントを生成する Unity エディタ拡張(Package Manager からインストール)。',

    ctaFree: '無料ではじめる',
    ctaPrices: '価格を見る',
    priceNote: '買い切り · 1 台まで · サブスクリプションなし',

    sectionWhat: 'できること',
    sectionIs: '何であって、何ではないか',
    sectionVideos: '動作を見る',
    sectionCompare: 'エディション比較',
    sectionSpotlight: '最も選ばれている理由',
    sectionInstall: '導入とダウンロード',
    sectionPricing: '価格',
    sectionFaq: 'よくある質問',

    isLede: '名前から誤解されやすいので、はっきり書いておきます。',
    isTitle: 'これは',
    isList: [
      'ドキュメント生成ツールです。シーン、コンポーネント、シリアライズ済みフィールド、参照、インポート設定といった実データを読み取り、Web サイトとして書き出します。',
      'プロジェクト構成のスナップショットです。保存しておき、後日のエクスポートとの差分を取れます。',
      'AI アシスタントにプロジェクト全体を 1 ファイルで渡す手段です。',
      '完全にエディタ専用かつオフラインです。ビルドには何も追加されず、無料版はネットワークに一切接続しません。'
    ],
    isNotTitle: 'これではありません',
    isNotList: [
      'スクリーンショットツールではありません。エディタのウィンドウを撮影することは一切ありません(画像アセットの小さな PNG プレビューは生成できますが、オフにできます)。',
      '動画やゲームプレイの録画ツールではありません。',
      'バージョン管理システムではなく、Git の代わりにもなりません。',
      'Doxygen のような API ドキュメント生成ツールではありません。文書化するのはシーンとアセットの中身であり、C# の API ではありません。'
    ],

    installLede: '無料版にキーは不要です。この URL を Package Manager に貼り付けるだけで使えます。',
    installStep1: 'Window → Package Manager を開く',
    installStep2: '+ → Add package from git URL… をクリック',
    installStep3: 'これを貼り付けて Add:',
    installStep4: '完了です。Unity のメニューバーに Unity DocSnap が追加されます。',
    installAlt: 'または、リポジトリをダウンロードし、Editor/UnityDocSnap フォルダを(Site~ サブフォルダを含めて)プロジェクトの Assets フォルダにコピーしてください。',
    copy: 'コピー',
    copied: 'コピーしました',

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
       'Plus は 2 つの機能です。AI 向けサマリーと変更ページ。Pro はそれに加えて、無制限のバージョン履歴、差分更新、CI 自動化、ファイル本体のコピー、プロジェクト全体のバックアップ、スナップショット管理、自社ロゴが利用できます。前者の 2 つだけをお求めなら Plus が最適です。'],
      ['あとから Plus を Pro にアップグレードできますか?',
       'はい。Pro のキーを購入して Unity に入力してください。Plus のキーはそのまま残り、別のマシンで使い続けられます。'],
      ['何台まで使えますか?',
       'キー 1 つにつき 1 台です。買い替え時は Unity 内またはこのサイトのライセンスページから自分で解除し、新しいマシンで有効化できます。問い合わせは不要です。'],
      ['オフラインでも使えますか?',
       '一度有効化すれば 45 日間完全にオフラインで動作し、オンラインになったタイミングで自動的に更新されます。エクスポートの前にライセンス確認が入ることはありません。'],
      ['プロジェクトの情報は送信されますか?',
       'いいえ。無料版はネットワークに一切接続しません。有料版も有効化と更新のときにライセンスキー、ハッシュ化されたマシン識別子、パッケージのバージョンだけを送信します。プロジェクトの情報は一切含まれません。'],
      ['古いエクスポートを削除できますか?',
       '無料版と Plus ではできません。スナップショットの上限(3 件・5 件)はレジストリで数えているため、出力フォルダを手動で空にしてもカウントは戻りません。戻ってしまうと上限が上限でなくなるからです。Pro には上限がないので、Export ウィンドウに「Manage snapshots」が追加されます。バージョン名を示す確認つきで 1 件ずつ削除でき、スナップショットがなくなれば出力キャッシュも消去できます。消えるのは DocSnap が書き込んだものだけで、フォルダ自体とその中の他のファイルはそのまま残ります。'],
      ['CI で使えますか?',
       'はい、Pro でご利用いただけます。C# からの DocSnapAPI と、コマンドラインからの -executeMethod に対応し、失敗時は非ゼロで終了します。'],
      ['対応する Unity のバージョンは?',
       'Unity 2021.3 LTS 以降(Unity 6 を含む)。サードパーティ依存はなく、完全に Editor 専用なので、ビルドサイズもランタイムコストも増えません。']
    ],

    themeToLight: 'ライトモード',
    themeToDark: 'ダークモード',
    mascotAlt: 'Unity DocSnap のボバマスコット',
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
    // Pro only, and the reason is the cap rather than the deleting.
    // Free and Plus count their snapshots in a registry, so
    // emptying the output folder by hand does not reset the count -
    // otherwise the cap would be a speed bump rather than a limit.
    // Pro has no cap, so there is nothing there for a delete button
    // to undermine, and it becomes what it should be: house-keeping
    // for the edition that accumulates enough exports to want some
    // gone.
    free: false, plus: false, pro: true,
    label: {
      fa: '🧹 مدیریت اسنپ‌شات‌ها — حذف نسخه و پاک‌کردن کش خروجی',
      en: '🧹 Manage snapshots — delete a version, clear the output cache',
      ja: '🧹 スナップショット管理 — バージョンの削除と出力キャッシュの消去'
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
// The mascot
//
// The same cup the exported site draws in its sidebar, down
// to the pearls and the sparkle - traced from
// Editor/UnityDocSnap/Site~/logo.svg rather than approximated,
// because a mascot that is nearly right is worse than no
// mascot at all.
//
// Inline rather than an <img> so it inherits the page's
// colours, and so the three moving parts (the cup, the pearls
// drifting inside it, the sparkle) are addressable by CSS
// instead of being baked into a file.
// ==========================================
function boba(size, alt) {
  return `
  <span class="mascot">
    <svg class="ds-logo" width="${size}" height="${size}" viewBox="0 0 100 100"
         role="img" aria-label="${escapeHtml(alt)}">
      <polygon points="62,10 84,32 68,30 66,15" fill="${HONEY}" stroke="#33223f" stroke-width="2.5" stroke-linejoin="round"/>
      <line x1="59" y1="34" x2="72" y2="12" stroke="#33223f" stroke-width="4.5" stroke-linecap="round"/>
      <line x1="59" y1="34" x2="72" y2="12" stroke="#ff6f90" stroke-width="3" stroke-linecap="round"/>
      <rect x="53" y="30" width="7" height="7" rx="2" transform="rotate(45 56.5 33.5)" fill="#fff"/>
      <polygon points="30,38 70,38 62,86 38,86" fill="#ffcfe2" stroke="#33223f" stroke-width="3.2" stroke-linejoin="round"/>
      <g class="ds-boba">
        <circle cx="42" cy="74" r="4" fill="${COCOA}" stroke="#33223f" stroke-width="1.4"/>
        <circle cx="52" cy="78" r="4.4" fill="${COCOA}" stroke="#33223f" stroke-width="1.4"/>
        <circle cx="61" cy="73" r="3.8" fill="${COCOA}" stroke="#33223f" stroke-width="1.4"/>
      </g>
      <rect x="26" y="26" width="48" height="14" rx="7" fill="#ff9fb8" stroke="#33223f" stroke-width="3.2"/>
      <ellipse cx="50" cy="32" rx="4" ry="3" fill="#33223f"/>
      <circle cx="39" cy="52" r="3.6" fill="#33223f"/>
      <circle cx="61" cy="52" r="3.6" fill="#33223f"/>
      <circle cx="37.5" cy="50.5" r="1.2" fill="#fff"/>
      <circle cx="59.5" cy="50.5" r="1.2" fill="#fff"/>
      <ellipse cx="33" cy="58" rx="4.5" ry="3.2" fill="#ff6f90" opacity=".7"/>
      <ellipse cx="67" cy="58" rx="4.5" ry="3.2" fill="#ff6f90" opacity=".7"/>
      <path d="M45 58 Q50 63 55 58" stroke="#33223f" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <polygon class="ds-sparkle" points="16,64 19,71 26,72 19,76 18,83 13,78 6,79 10,72 8,65 15,68"
               fill="#a07be0" stroke="#33223f" stroke-width="1.6" stroke-linejoin="round"/>
      <polygon class="ds-sparkle ds-sparkle-2" points="86,52 88,57 93,58 88,61 87,66 84,62 79,63 82,58 81,53 85,55"
               fill="${CORAL}" stroke="#33223f" stroke-width="1.4" stroke-linejoin="round"/>
    </svg>
  </span>`
}


// ==========================================
// SVG icon set
// ==========================================
const ICONS = {
  contrast: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor" stroke="none"/>',
  download: '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/>',
  tag: '<path d="M3 11V5a2 2 0 0 1 2-2h6l10 10-8 8z"/><circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none"/>'
}

function icon(name) {
  return '<svg class="d-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
    + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + (ICONS[name] || '') + '</svg>'
}


// ==========================================
// Partials
// ==========================================
function renderTopbar(lang) {
  const p = I18N[lang]
  const buttons = Object.keys(I18N).map(code =>
    '<button type="button" onclick="acSetLang(\'' + code + '\')" lang="' + code + '"'
    + ' aria-pressed="' + (code === lang ? 'true' : 'false') + '">'
    + escapeHtml(I18N[code].langName) + '</button>'
  ).join('')

  return `
    <div class="topbar">
      <a class="brand" href="${escapeHtml(localizedPath('/', lang))}">
        <img src="${escapeHtml(CONFIG.AMIR_LOGO)}" alt="" onerror="this.style.display='none'">
        <span class="brand-text">
          <span class="brand-name">AmirCollider</span>
          <span class="brand-sub">Unity DocSnap v${escapeHtml(VERSION)}</span>
        </span>
      </a>
      <div class="controls">
        <div class="seg" role="group">${buttons}</div>
        <button type="button" id="themeBtn" class="icon-btn" onclick="acToggleTheme()"
                data-to-light="${escapeHtml(p.themeToLight)}"
                data-to-dark="${escapeHtml(p.themeToDark)}"
                aria-label="${escapeHtml(p.themeToDark)}">${icon('contrast')}</button>
      </div>
    </div>`
}


// ==========================================
// renderHero
// The two calls to action are "start free" and "see
// pricing", not "buy".
// ==========================================
function renderHero(p) {
  return `
    <header class="hero">
      ${boba(132, p.mascotAlt)}
      <h1>${escapeHtml(p.title)}</h1>
      <p class="tagline">${escapeHtml(p.tagline)}</p>
      <p class="lede">${escapeHtml(p.lede)}</p>
      <div class="cta">
        <a class="btn" href="${escapeHtml(REPO_URL)}" rel="noopener">${icon('download')}<span>${escapeHtml(p.ctaFree)}</span></a>
        <a class="btn ghost" href="#pricing">${icon('tag')}<span>${escapeHtml(p.ctaPrices)}</span></a>
      </div>
      <p class="fine">${escapeHtml(p.priceNote)}</p>
    </header>`
}

function renderWhat(p, lang) {
  const cards = WHAT.map((item, index) => `
    <div class="card lift" style="--i:${index}">
      <div class="card-ic">${item.icon}</div>
      <h3>${escapeHtml(item.title[lang])}</h3>
      <p>${escapeHtml(item.body[lang])}</p>
    </div>`).join('')

  return `
    <section class="sec reveal">
      <h2 class="section">${escapeHtml(p.sectionWhat)}</h2>
      <div class="grid stagger">${cards}</div>
    </section>`
}


// ==========================================
// renderIsIsNot
//
// The section that exists because of a real, observed failure:
// handed this page's URL, a search engine classified Unity
// DocSnap as a tool for taking automatic screenshots of the
// Unity Editor. That reading is not unreasonable from the
// outside - the product is called DocSnap, the tagline said
// "snap", and the version history calls its exports snapshots.
// Three separate nudges toward a camera, and nothing anywhere
// on the page saying the word "documentation" in a sentence a
// machine could take as a definition.
//
// So the definition is now written out, and the wrong reading
// is denied by name. A crawler that reads one block of this
// page reads this one; a human who is not sure what they are
// looking at gets the same answer in the same place.
//
// The parenthetical about PNG previews is deliberate. Thumbnails
// ARE written by default, and a flat "it produces no images"
// would be the kind of tidy claim somebody disproves ten minutes
// after installing - which costs more trust than the ambiguity
// it was meant to buy.
// ==========================================
function renderIsIsNot(p) {
  const yes = p.isList
    .map(item => '<li>' + escapeHtml(item) + '</li>').join('')
  const no = p.isNotList
    .map(item => '<li>' + escapeHtml(item) + '</li>').join('')

  return `
    <section class="sec reveal">
      <h2 class="section">${escapeHtml(p.sectionIs)}</h2>
      <p class="fine">${escapeHtml(p.isLede)}</p>
      <div class="isgrid stagger">
        <div class="card is-yes lift">
          <h3><span aria-hidden="true">✓</span> ${escapeHtml(p.isTitle)}</h3>
          <ul class="islist">${yes}</ul>
        </div>
        <div class="card is-no lift">
          <h3><span aria-hidden="true">✕</span> ${escapeHtml(p.isNotTitle)}</h3>
          <ul class="islist">${no}</ul>
        </div>
      </div>
    </section>`
}


// ==========================================
// renderInstall
//
// The download link this page did not have. It linked to the
// repository three times and never once printed the string the
// Package Manager actually wants - and pasting the browser URL
// into that dialog fails with an unhelpful error, so "there is a
// GitHub link, work it out" was not a route anybody completed.
//
// Placed before pricing on purpose: the free edition is the whole
// exporter, so the first thing a reader should be able to do is
// install it. A price above an unexplained download is a bounce,
// and a price above an IMPOSSIBLE download is worse.
// ==========================================
function renderInstall(p) {
  return `
    <section class="sec reveal">
      <h2 class="section" id="install">${escapeHtml(p.sectionInstall)}</h2>
      <p class="fine">${escapeHtml(p.installLede)}</p>
      <div class="card install-card">
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
        <p class="fine install-alt">${escapeHtml(p.installAlt)}</p>
        <a class="btn ghost" href="${escapeHtml(REPO_URL)}" rel="noopener">
          ${icon('download')}<span>${escapeHtml(p.tierFreeCta)}</span>
        </a>
      </div>
    </section>`
}


// ==========================================
// The poster frame
//
// A <video> with nothing loaded paints its background - which on
// a card that is otherwise cream and blush is a flat grey
// rectangle where the picture should be, on every clip, until
// somebody presses play. It reads as a broken embed rather than
// as a video.
//
// There is no poster image to point at: the clips live in R2 as
// bare MP4s and nothing generates a thumbnail for them. So the
// frame is taken from the clip itself. A media fragment asks the
// browser to seek to that timestamp, and `preload="metadata"`
// gives it permission to fetch the little it needs to decode
// there - which is a range request over a file that already
// serves them, not the whole clip.
//
// A tenth of a second rather than zero: some encoders put a
// black or near-black frame at exactly 0, and Safari treats a
// bare "#t=0" as "no fragment at all" and paints nothing.
// ==========================================
const POSTER_FRAGMENT = '#t=0.1'


// ==========================================
// renderVideos
// The demo clips, as a player with a playlist beside it.
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
    <section class="sec reveal">
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
          <video id="vEl" controls preload="metadata" playsinline
                 src="/video/${startLang}/${first.id}${POSTER_FRAGMENT}"
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
      </div>
    </section>`
}


// ==========================================
// videoData
// The catalogue the player needs, as one script tag.
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
    <section class="sec reveal">
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
      </div>
    </section>`
}


// ==========================================
// renderSpotlight
// The AI outputs, given their own block with a sample of
// the actual folder.
// ==========================================
function renderSpotlight(p) {
  return `
    <section class="sec reveal">
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
      </div>
    </section>`
}


// ==========================================
// renderPricing
// Three cards, cheapest first, with Plus marked.
// ==========================================
function renderPricing(p, lang) {
  const listFor = predicate => ROWS.filter(predicate)
    .map(r => '<li>' + escapeHtml(r.label[lang]) + '</li>').join('')

  // What Plus adds over Free, and what Pro adds over Plus.
  const plusAdds = listFor(r => r.free === false && r.plus === true)
  const proAdds = listFor(r => r.plus !== true && r.pro === true)

  return `
    <section class="sec reveal">
      <h2 class="section" id="pricing">${escapeHtml(p.sectionPricing)}</h2>
      <div class="tiers stagger">

        <div class="tier lift" style="--i:0">
          <h3>${escapeHtml(p.tierFreeName)}</h3>
          <div class="price"><span class="cur">$</span>0</div>
          <p class="tier-pitch">${escapeHtml(p.tierFreePitch)}</p>
          <a class="btn ghost wide" href="${escapeHtml(REPO_URL)}" rel="noopener">${escapeHtml(p.tierFreeCta)}</a>
          <p class="tier-for">${escapeHtml(p.freeBody)}</p>
        </div>

        <div class="tier is-featured lift" style="--i:1">
          <span class="ribbon">${escapeHtml(p.popular)}</span>
          <h3>${escapeHtml(p.tierPlusName)}</h3>
          <div class="price"><span class="cur">$</span>${escapeHtml(PLUS.price)}</div>
          <p class="tier-pitch">${escapeHtml(p.tierPlusPitch)}</p>
          <p class="plus-label">${escapeHtml(p.everythingInFree)}</p>
          <ul class="incl">${plusAdds}</ul>
          <a class="btn wide" href="${escapeHtml(PLUS.buyUrl)}" rel="noopener">${escapeHtml(p.buyCta)} — $${escapeHtml(PLUS.price)}</a>
          <p class="tier-for">${escapeHtml(p.tierPlusFor)}</p>
        </div>

        <div class="tier lift" style="--i:2">
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
      <p class="center"><a class="quiet" href="/license">${escapeHtml(p.haveKey)} →</a></p>
    </section>`
}

function renderFaq(p) {
  const items = p.faq.map(([q, a]) => `
    <details class="faq">
      <summary>${escapeHtml(q)}</summary>
      <p>${escapeHtml(a)}</p>
    </details>`).join('')

  return `
    <section class="sec reveal">
      <h2 class="section">${escapeHtml(p.sectionFaq)}</h2>
      ${items}
    </section>`
}


// ==========================================
// The rest of the shelf
//
// Read from Content/ToolsCatalog.js rather than hard-coded,
// so a third tool appears here the moment it is added and
// never has to be remembered.
// ==========================================
function renderShelf(lang) {
  const neighbours = otherTools('unity-docsnap')
  if (neighbours.length === 0) return ''

  const heading = { fa: 'از همین قفسه', en: 'Also on this shelf', ja: '同じ棚から' }

  const cards = neighbours.map(tool => {
    const tagline = tool.i18n.tagline[lang] || tool.i18n.tagline.en
    const cta = tool.i18n.cta[lang] || tool.i18n.cta.en
    return `
      <a class="shelf-item lift" href="${escapeHtml(localizedPath(tool.href, lang))}">
        <span class="shelf-mark" aria-hidden="true">${tool.mark}</span>
        <span class="shelf-body">
          <b>${escapeHtml(tool.name)}</b><br>
          <span class="shelf-desc">${escapeHtml(tagline)}</span>
        </span>
        <span class="shelf-cta">${escapeHtml(cta)} &rarr;</span>
      </a>`
  }).join('')

  return `
    <section class="sec reveal">
      <h2 class="section">${escapeHtml(heading[lang] || heading.en)}</h2>
      <div class="shelf">${cards}</div>
    </section>`
}


// ==========================================
// Search metadata
//
// Every term below has a matching section of real content on the
// page. That rule is what keeps this list honest, and it is also
// what makes it work: a term with nothing behind it is a term the
// page loses on anyway.
//
// The list leans hard on two words the page previously never said
// in a form a machine could use - DOCUMENTATION and BACKUP. The
// product is called DocSnap, its tagline said "snap", and its
// version history calls exports snapshots; read cold, all three
// point at a camera, and a search engine duly filed this as a tool
// for taking screenshots of the Unity Editor. The fix is not a
// cleverer sentence, it is naming the category outright, here and
// in featureList and in the is/is-not section.
// ==========================================
const KEYWORDS = {
  fa: [
    'مستندسازی پروژه یونیتی', 'مستند سازی پروژه', 'بک آپ پروژه یونیتی',
    'داکیومنت پروژه یونیتی', 'ابزار مستندسازی یونیتی', 'خروجی HTML پروژه یونیتی',
    'لیست گیم آبجکت های سین', 'گزارش سلامت پروژه یونیتی', 'اسکریپت گم شده یونیتی',
    'دادن پروژه یونیتی به هوش مصنوعی', 'افزونه ادیتور یونیتی', 'Unity DocSnap'
  ],
  en: [
    'Unity project documentation', 'Unity documentation generator', 'Unity project backup',
    'document Unity scenes', 'export Unity hierarchy', 'Unity scene documentation tool',
    'Unity missing scripts report', 'Unity broken references', 'offline HTML project docs',
    'give Unity project to AI', 'Unity editor extension', 'Unity DocSnap'
  ],
  ja: [
    'Unity ドキュメント 自動生成', 'Unity プロジェクト ドキュメント', 'Unity プロジェクト バックアップ',
    'Unity シーン 一覧 出力', 'Unity 階層 エクスポート', 'Unity 欠落スクリプト 検出',
    'Unity 壊れた参照', 'オフライン HTML ドキュメント', 'Unity プロジェクトを AI に渡す',
    'Unity エディタ拡張', 'Unity DocSnap'
  ]
}

// What the tool does, in the vocabulary a machine indexes rather
// than the vocabulary a headline is written in.
const FEATURE_LIST = {
  fa: [
    'مستندسازی خودکار همه‌ی سین‌ها: سلسله‌مراتب کامل، هر کامپوننت و هر فیلد سریالایزشده',
    'تبدیل رفرنس‌ها به لینک قابل کلیک بین آبجکت‌ها و اسست‌ها',
    'خروجی وب‌سایت HTML آفلاین و خودکفا، بدون سرور و بدون بیلد',
    'گزارش سلامت پروژه: اسکریپت‌های گم‌شده و رفرنس‌های شکسته با مسیر دقیق',
    'مستندسازی تنظیمات ایمپورت پوشه‌های اسست',
    'جست‌وجوی تمام‌متن و صفحه‌ی پکیج‌ها',
    'خلاصه‌ی ساختارمند مارک‌داون و جیسون برای دستیارهای هوش مصنوعی',
    'صفحه‌ی تغییرات بین دو خروجی',
    'بک‌آپ ‎.unitypackage از کل پروژه',
    'اتوماسیون CI از طریق DocSnapAPI و ‎-executeMethod'
  ],
  en: [
    'Automatic documentation of every Scene: full hierarchy, every Component, every serialized field',
    'References turned into clickable links between objects and assets',
    'Self-contained offline HTML website output, with no server and no build step',
    'Project health report: missing scripts and broken references with their exact paths',
    'Documents the import settings of every Asset folder',
    'Full-text search and a packages page',
    'Structured Markdown and JSON summaries for AI assistants',
    'A Changes page diffing two exports',
    'Whole-project .unitypackage backup',
    'CI automation through DocSnapAPI and -executeMethod'
  ],
  ja: [
    'すべてのシーンを自動文書化:完全な階層、全コンポーネント、全シリアライズ済みフィールド',
    'オブジェクトとアセットの間の参照をクリック可能なリンクに変換',
    'サーバーもビルド手順も不要な自己完結型オフライン HTML サイトを出力',
    'プロジェクトのヘルスレポート:欠落スクリプトと壊れた参照を正確なパス付きで表示',
    'アセットフォルダのインポート設定を文書化',
    '全文検索とパッケージページ',
    'AI アシスタント向けの構造化された Markdown / JSON 要約',
    '2 つのエクスポートを比較する変更ページ',
    'プロジェクト全体の .unitypackage バックアップ',
    'DocSnapAPI と -executeMethod による CI 自動化'
  ]
}


// ==========================================
// Page
// ==========================================
function renderPage(lang, theme) {
  const p = I18N[lang]
  const site = NAV_I18N[lang] || NAV_I18N.fa
  const themeAttr = theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : ''
  const title = p.metaTitle
  const trail = [
    { href: '/', label: site.home },
    { href: '/tools', label: site.tools },
    { href: '/unity-docsnap', label: 'Unity DocSnap' }
  ]

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${p.dir}"${themeAttr}>
<head>
  ${getPageHead({
    title,
    amirLogo: CONFIG.AMIR_LOGO,
    description: p.metaDesc
  })}
  ${seoHead({
    path: '/unity-docsnap',
    title,
    description: p.metaDesc,
    lang,
    type: 'product',
    keywords: KEYWORDS[lang] || KEYWORDS.en,
    graph: [
      breadcrumbLd(trail, lang),
      softwareApplicationLd({
        name: 'Unity DocSnap',
        alternateName: ['DocSnap', 'Unity Doc Snap'],
        description: p.lede,
        path: '/unity-docsnap',
        version: VERSION,

        // All three editions, cheapest first. Quoting only the Plus
        // price - which is what this node used to do - hid the fact
        // that the whole exporter is free, on the one surface where
        // a reader cannot see the pricing table.
        offers: [
          { name: p.tierFreeName, price: '0', url: '/unity-docsnap' },
          { name: p.tierPlusName, price: PLUS.price, url: PLUS.buyUrl },
          { name: p.tierProName, price: PRO.price, url: PRO.buyUrl }
        ],

        repo: REPO_URL,
        downloadUrl: REPO_URL,
        installUrl: GIT_URL,
        softwareHelp: REPO_URL + '#readme',
        featureList: FEATURE_LIST[lang] || FEATURE_LIST.en,
        keywords: KEYWORDS[lang] || KEYWORDS.en,
        requirements: 'Unity 2021.3 LTS or newer',
        inLanguage: ['fa', 'en', 'ja'],

        // The category noun, said to the crawler in its own field
        // rather than hoped for out of the prose.
        subCategory: 'Unity Editor Extension, Documentation Generator'
      }),
      howToLd({
        name: p.sectionInstall,
        description: p.installLede,
        path: '/unity-docsnap',
        lang,
        tool: 'Unity Package Manager',
        steps: [p.installStep1, p.installStep2, p.installStep3 + ' ' + GIT_URL, p.installStep4]
      }),
      faqPageLd(p.faq, lang)
    ]
  })}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Quicksand:wght@400;500;600;700&family=Space+Mono&family=Vazirmatn:wght@400;600;700;800&display=swap" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Quicksand:wght@400;500;600;700&family=Space+Mono&family=Vazirmatn:wght@400;600;700;800&display=swap"></noscript>
  ${themeBootScript()}
  <script>document.documentElement.classList.add('js');</script>
  <style>${siteNavCss()}${css()}</style>
</head>
<body>
  <div class="pearls" aria-hidden="true">
    <span style="--x:8%;  --s:16px; --d:26s; --t:0s"></span>
    <span style="--x:22%; --s:10px; --d:34s; --t:-6s"></span>
    <span style="--x:38%; --s:13px; --d:29s; --t:-14s"></span>
    <span style="--x:57%; --s:9px;  --d:38s; --t:-3s"></span>
    <span style="--x:71%; --s:15px; --d:31s; --t:-19s"></span>
    <span style="--x:86%; --s:11px; --d:27s; --t:-11s"></span>
    <span style="--x:94%; --s:8px;  --d:36s; --t:-23s"></span>
  </div>
  <div class="wrap">
    ${renderTopbar(lang)}
    ${siteBreadcrumb({ lang, trail })}
    <main id="main">
      ${renderHero(p)}
      ${renderWhat(p, lang)}
      ${renderIsIsNot(p)}
      ${renderVideos(p, lang)}
      ${renderSpotlight(p)}
      ${renderCompare(p, lang)}
      ${renderInstall(p)}
      ${renderPricing(p, lang)}
      ${renderFaq(p)}
      ${renderShelf(lang)}
    </main>
    <div class="ds-links reveal">
      <a href="${escapeHtml(REPO_URL)}" rel="noopener">GitHub</a>
      <span>·</span>
      <a href="/license">${escapeHtml(p.haveKey)}</a>
      <span>·</span>
      <a href="/order">${escapeHtml(p.orderHelp)}</a>
    </div>
    ${siteFooter({ lang })}
  </div>
  ${chromeScript()}
  <script>${script(lang, p)}</script>
</body>
</html>`
}


// ==========================================
// css
//
// The Cozy skin, ported from the exporter to the page that
// sells it. Three things carry the identity: cream and blush
// surfaces with dark plum ink, the rounded display face, and
// motion that never stops entirely — the cup bobs, the pearls
// drift, the sections arrive as you reach them.
//
// Every animation here is transform and opacity only, so the
// whole page is a compositor job and nothing below triggers
// layout. All of it is behind prefers-reduced-motion, and the
// reveal-on-scroll layer is additionally behind an `html.js`
// class, so a visitor without JavaScript gets the page with
// everything already visible rather than a blank column.
// ==========================================
function css() {
  return `
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    html { scrollbar-width: none; -ms-overflow-style: none; scroll-behavior: smooth; }
    html::-webkit-scrollbar { width: 0; height: 0; display: none; }

    /* ==========================================
       Tokens
       The values are the cozy skin's own, lifted from
       :root[data-skin=cozy] in the exporter's stylesheet.
       Dark is the default, as on every page of this site;
       the OS preference decides only while the visitor has
       made no choice, and data-theme always wins.
       ========================================== */
    :root {
      --lav: ${LAV_LIGHT};
      --coral: ${CORAL_LIGHT};
      --gold: ${HONEY};
      --ok: ${MINT_LIGHT};

      --radius: 20px;
      --radius-sm: 14px;
      --maxw: 1040px;

      --bg-1: ${NIGHT};
      --bg-2: #241f2d;
      --surface: #241f2d;
      --surface-2: #2a2533;
      --surface-3: #362e42;
      --border: #38313f;
      --border-strong: #4b4155;
      --text: #f4f0f9;
      --text-dim: #c0b5cf;

      --shadow: 0 4px 14px rgba(0, 0, 0, .4);
      --shadow-pop: 0 14px 34px rgba(0, 0, 0, .55);

      /* The rounded display face is most of what makes this
         skin read as itself, so it is loaded first and used
         on every heading rather than on two of them. */
      --font-body: 'Quicksand', 'Vazirmatn', system-ui, -apple-system, 'Segoe UI', sans-serif;
      --font-display: 'Baloo 2', 'Vazirmatn', 'Quicksand', system-ui, sans-serif;
      --font-mono: 'Space Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;

      color-scheme: dark;
    }

    /* Quicksand has no Persian and no kana. Rather than let
       the browser fall through to whatever it likes, each
       language names the rounded face it actually has. */
    :root:lang(fa) {
      --font-body: 'Vazirmatn', 'Quicksand', system-ui, sans-serif;
      --font-display: 'Vazirmatn', 'Baloo 2', system-ui, sans-serif;
    }
    :root:lang(ja) {
      --font-body: 'Hiragino Maru Gothic ProN', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', 'Meiryo', 'Quicksand', system-ui, sans-serif;
      --font-display: 'Hiragino Maru Gothic ProN', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', 'Meiryo', 'Baloo 2', system-ui, sans-serif;
    }

    /* The pastel half of the skin. The warmth stays in the
       surfaces, the borders and the accents; the ink is the
       darkest thing on the page, which is the one lesson the
       skin itself had to learn. */
    @media (prefers-color-scheme: light) {
      :root:not([data-theme]) {
        --lav: ${LAV};
        --coral: ${CORAL};
        --ok: ${MINT};
        --bg-1: ${CREAM};
        --bg-2: ${BLUSH};
        --surface: #ffffff;
        --surface-2: ${PEACH};
        --surface-3: ${BLUSH};
        --border: #f3e2ea;
        --border-strong: #f0c8dc;
        --text: ${INK};
        --text-dim: #5f4c6c;
        --shadow: 0 4px 14px rgba(177, 156, 217, .18);
        --shadow-pop: 0 14px 34px rgba(255, 143, 163, .28);
        color-scheme: light;
      }
    }
    :root[data-theme="light"] {
      --lav: ${LAV};
      --coral: ${CORAL};
      --ok: ${MINT};
      --bg-1: ${CREAM};
      --bg-2: ${BLUSH};
      --surface: #ffffff;
      --surface-2: ${PEACH};
      --surface-3: ${BLUSH};
      --border: #f3e2ea;
      --border-strong: #f0c8dc;
      --text: ${INK};
      --text-dim: #5f4c6c;
      --shadow: 0 4px 14px rgba(177, 156, 217, .18);
      --shadow-pop: 0 14px 34px rgba(255, 143, 163, .28);
      color-scheme: light;
    }
    :root[data-theme="dark"] {
      --lav: ${LAV_LIGHT};
      --coral: ${CORAL_LIGHT};
      --ok: ${MINT_LIGHT};
      --bg-1: ${NIGHT};
      --bg-2: #241f2d;
      --surface: #241f2d;
      --surface-2: #2a2533;
      --surface-3: #362e42;
      --border: #38313f;
      --border-strong: #4b4155;
      --text: #f4f0f9;
      --text-dim: #c0b5cf;
      --shadow: 0 4px 14px rgba(0, 0, 0, .4);
      --shadow-pop: 0 14px 34px rgba(0, 0, 0, .55);
      color-scheme: dark;
    }

    body {
      font-family: var(--font-body);
      min-height: 100vh; padding: 24px 20px 60px;
      color: var(--text); line-height: 1.75;
      background: linear-gradient(168deg, var(--bg-1), var(--bg-2));
      background-attachment: fixed;
      overflow-x: hidden;
      -webkit-font-smoothing: antialiased;
    }

    /* The wash lives on its own fixed layer rather than on the
       body's background, so it can drift for the whole visit
       without repainting a single word of text. */
    body::before {
      content: ''; position: fixed; inset: -22vmax; z-index: -2; pointer-events: none;
      background:
        radial-gradient(42vmax 30vmax at 76% 10%, color-mix(in srgb, var(--coral) 34%, transparent), transparent 62%),
        radial-gradient(38vmax 28vmax at 12% 2%, color-mix(in srgb, var(--lav) 32%, transparent), transparent 60%),
        radial-gradient(36vmax 26vmax at 52% 98%, color-mix(in srgb, var(--gold) 16%, transparent), transparent 62%);
    }

    /* Pearls, rising the way they settle in the cup. Seven of
       them, transform-only, and invisible until the animation
       runs — so under reduced motion they simply are not there
       rather than sitting frozen mid-air. */
    .pearls { position: fixed; inset: 0; z-index: -1; overflow: hidden; pointer-events: none; }
    .pearls span {
      position: absolute; inset-block-end: -14vh; inset-inline-start: var(--x);
      width: var(--s); height: var(--s); border-radius: 50%; opacity: 0;
      background: radial-gradient(circle at 32% 28%, color-mix(in srgb, var(--coral) 78%, #fff), ${COCOA});
    }

    .wrap { max-width: var(--maxw); margin-inline: auto; }

    /* ---------- top bar ---------- */
    .topbar { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; }
    .brand { display: flex; align-items: center; gap: 11px; color: var(--text); text-decoration: none; }
    .brand img {
      width: 38px; height: 38px; border-radius: 13px; object-fit: cover;
      box-shadow: var(--shadow); transition: transform .22s cubic-bezier(.34,1.56,.64,1);
    }
    .brand:hover img { transform: rotate(-6deg) scale(1.06); }
    .brand-text { display: grid; line-height: 1.32; min-width: 0; }
    .brand-name { font-family: var(--font-display); font-weight: 800; }
    .brand-sub { font-size: 0.76em; font-weight: 600; color: var(--text-dim); }

    .controls { display: flex; gap: 10px; align-items: center; }

    /* Pills, everywhere. The cozy skin has no square control. */
    .seg {
      display: inline-flex; gap: 2px; padding: 3px; border-radius: 999px;
      background: var(--surface); border: 1px solid var(--border-strong);
    }
    .seg button {
      border: 0; cursor: pointer; padding: 6px 13px; border-radius: 999px; font: inherit;
      font-size: 0.82em; font-weight: 700; color: var(--text-dim); background: transparent;
      transition: color .16s ease, background .16s ease;
    }
    .seg button:hover { color: var(--text); }
    /* Filled, not merely a paler shade of the bar it sits in.
       Coral is the language answer in the tool too, so the
       control a reader already knows behaves the same here. */
    .seg button[aria-pressed="true"] {
      color: #fff; background: linear-gradient(135deg, ${CORAL}, ${CORAL_SOFT});
      box-shadow: 0 3px 10px rgba(255, 117, 147, .4);
    }
    .icon-btn {
      width: 38px; height: 38px; display: grid; place-items: center; border-radius: 999px;
      cursor: pointer; color: var(--text); background: var(--surface); border: 1px solid var(--border-strong);
      transition: transform .22s cubic-bezier(.34,1.56,.64,1), box-shadow .18s ease;
    }
    .icon-btn:hover { transform: rotate(-14deg) scale(1.08); box-shadow: var(--shadow-pop); }
    .icon-btn svg { width: 19px; height: 19px; }
    .d-ic { width: 18px; height: 18px; flex: none; }

    /* ---------- hero ---------- */
    .hero { text-align: center; padding-block: 34px 26px; }
    .mascot { position: relative; display: inline-block; }
    .mascot::before {
      content: ''; position: absolute; inset: -16%; border-radius: 50%; z-index: -1;
      background: radial-gradient(circle, color-mix(in srgb, var(--coral) 36%, transparent), transparent 68%);
    }
    .ds-logo { display: block; }

    .hero h1 {
      font-family: var(--font-display);
      font-size: clamp(2.1em, 6vw, 3.3em); font-weight: 800; letter-spacing: -0.01em;
      margin-block: 8px 4px;
      background: linear-gradient(110deg, var(--lav), var(--coral) 46%, var(--lav) 86%);
      background-size: 240% 100%;
      -webkit-background-clip: text; background-clip: text; color: transparent;
    }
    .tagline {
      font-family: var(--font-display); font-size: 1.14em; font-weight: 700;
      color: color-mix(in srgb, var(--lav) 52%, var(--text));
    }
    .lede { color: var(--text-dim); max-width: 640px; margin: 12px auto 0; }
    .cta { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-block-start: 24px; }
    .fine { color: var(--text-dim); font-size: 0.85em; margin-block-start: 12px; }
    .center { text-align: center; }

    /* ---------- buttons ---------- */
    /* The violet fill is fixed rather than themed: it is the
       tool's ink, it carries white text at both ends of the
       day, and a button that changes colour with the room is
       one more thing to check. */
    .btn {
      position: relative; overflow: hidden;
      display: inline-flex; align-items: center; justify-content: center; gap: 9px;
      text-decoration: none; padding: 13px 26px; border-radius: 999px;
      font-family: var(--font-display); font-weight: 700; color: #fff;
      background: linear-gradient(135deg, ${LAV}, ${LAV_SOFT});
      border: 1px solid transparent;
      box-shadow: 0 8px 22px rgba(122, 82, 184, .34);
      transition: transform .18s ease, box-shadow .18s ease;
    }
    .btn:hover { transform: translateY(-3px); box-shadow: 0 14px 32px rgba(122, 82, 184, .44); }
    .btn:active { transform: translateY(-1px) scale(0.985); }
    .btn.ghost {
      background: var(--surface); color: var(--text);
      border-color: var(--border-strong); box-shadow: var(--shadow);
    }
    .btn.ghost:hover { box-shadow: var(--shadow-pop); }
    .btn.wide { width: 100%; margin-block: 10px; }
    /* A single pass of light across the fill on hover. One
       pseudo-element, transform only, and it runs once rather
       than looping - a button that shimmers forever reads as
       a broken GIF. */
    .btn::after {
      content: ''; position: absolute; inset-block: -50%; inset-inline-start: -60%; width: 42%;
      background: linear-gradient(100deg, transparent, rgba(255, 255, 255, .42), transparent);
      transform: translateX(-140%) skewX(-16deg); opacity: 0; pointer-events: none;
    }

    /* ---------- sections ---------- */
    .section {
      font-family: var(--font-display);
      display: flex; align-items: center; gap: 12px;
      font-size: 1.42em; font-weight: 700; margin-block: 48px 20px; scroll-margin-top: 20px;
    }
    .section::after {
      content: ''; flex: 1; height: 2px; border-radius: 2px;
      background: linear-gradient(90deg, var(--border-strong), transparent);
      transform-origin: 0 50%;
    }
    [dir="rtl"] .section::after {
      background: linear-gradient(270deg, var(--border-strong), transparent);
      transform-origin: 100% 50%;
    }

    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
    .card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 22px; box-shadow: var(--shadow);
    }
    .card-ic {
      font-size: 1.8em; line-height: 1; margin-block-end: 10px; display: inline-block;
      transition: transform .3s cubic-bezier(.34,1.56,.64,1);
    }
    .card:hover .card-ic { transform: rotate(-9deg) scale(1.14); }
    .card h3 { font-family: var(--font-display); font-size: 1.06em; font-weight: 700; margin-block-end: 6px; }
    .card p { font-size: 0.93em; color: var(--text-dim); }

    /* Lift on hover, confined to the handful of things a
       reader points at deliberately. */
    .lift { transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
    .lift:hover { transform: translateY(-4px); box-shadow: var(--shadow-pop); border-color: var(--border-strong); }

    /* ---------- videos ---------- */
    .vhead {
      display: flex; align-items: center; justify-content: space-between;
      gap: 14px; flex-wrap: wrap; margin-block-end: 16px;
    }
    .vlede { color: var(--text-dim); font-size: 0.94em; }
    .vlang { display: flex; align-items: center; gap: 10px; }
    .vlang-label { font-size: 0.8em; color: var(--text-dim); font-weight: 700; }

    /* Player left, playlist right on a desktop; stacked on a
       phone, where a side-by-side split would leave the video
       too small to read a Unity Inspector in. */
    .vplayer { display: grid; grid-template-columns: 1.55fr 1fr; gap: 16px; align-items: start; }
    @media (max-width: 820px) { .vplayer { grid-template-columns: 1fr; } }

    .vstage {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow);
    }
    .vstage video { display: block; width: 100%; aspect-ratio: 16 / 9; background: #05070d; }
    .vstage video p { color: var(--text-dim); padding: 20px; font-size: 0.9em; }
    .vnow { padding: 14px 16px; }
    .vnow b { display: block; font-family: var(--font-display); font-size: 1.02em; font-weight: 700; }
    .vnow small { display: block; color: var(--text-dim); font-size: 0.87em; margin-block-start: 3px; }
    .vcount { display: block; font-size: 0.76em; color: var(--text-dim); margin-block-start: 8px; }

    /* The playlist scrolls inside itself so ten clips cannot
       make the section taller than the player beside it. */
    .vlist {
      list-style: none; max-height: 420px; overflow-y: auto;
      border: 1px solid var(--border); border-radius: var(--radius);
      background: var(--surface); padding: 6px; box-shadow: var(--shadow);
      scrollbar-width: thin;
    }
    @media (max-width: 820px) { .vlist { max-height: 320px; } }

    .vitem {
      display: flex; align-items: center; gap: 11px; width: 100%; text-align: start;
      padding: 9px 10px; border: 0; border-radius: 999px; cursor: pointer;
      font: inherit; color: var(--text); background: transparent;
      transition: background .15s ease, transform .15s ease;
    }
    .vitem:hover { background: var(--surface-2); transform: translateX(2px); }
    [dir="rtl"] .vitem:hover { transform: translateX(-2px); }
    .vitem.is-on { background: color-mix(in srgb, var(--lav) 18%, transparent); }

    .vnum {
      flex: 0 0 26px; width: 26px; height: 26px; border-radius: 50%;
      display: grid; place-items: center; font-size: 0.72em; font-weight: 800;
      color: var(--text-dim); background: var(--surface-2); border: 1px solid var(--border);
    }
    .vitem.is-on .vnum {
      color: #fff; border-color: transparent;
      background: linear-gradient(135deg, ${CORAL}, ${CORAL_SOFT});
      box-shadow: 0 3px 10px rgba(255, 117, 147, .38);
    }
    .vtext { flex: 1 1 auto; min-width: 0; }
    .vtext b { display: block; font-size: 0.88em; font-weight: 700; line-height: 1.45; }
    .vtext small {
      color: var(--text-dim); font-size: 0.78em; line-height: 1.5;
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

    /* ---------- comparison ---------- */
    /* The table scrolls inside its own box so a long feature
       label can never make the page itself scroll sideways. */
    .table-scroll {
      overflow-x: auto; border-radius: var(--radius);
      border: 1px solid var(--border); box-shadow: var(--shadow);
    }
    .compare { width: 100%; border-collapse: collapse; background: var(--surface); min-width: 620px; }
    .compare th, .compare td { padding: 13px 14px; text-align: start; border-bottom: 1px dashed var(--border-strong); }
    .compare thead th {
      font-family: var(--font-display); font-size: 0.85em; color: var(--text-dim);
      text-transform: uppercase; letter-spacing: 0.04em;
      background: linear-gradient(120deg, var(--surface-3), var(--surface-2));
    }
    .compare thead th .th-price {
      display: block; font-size: 1.05em; text-transform: none; color: var(--text); font-weight: 800;
    }
    .compare tbody th { font-weight: 600; font-size: 0.95em; }
    .compare tbody tr { transition: background .15s ease; }
    .compare tbody tr:hover { background: color-mix(in srgb, var(--lav) 8%, transparent); }
    .compare td { text-align: center; width: 96px; font-weight: 700; }
    .compare tr:last-child th, .compare tr:last-child td { border-bottom: 0; }
    .compare .yes { color: var(--ok); }
    .compare .no { color: var(--text-dim); }
    .compare .partial { color: var(--text-dim); font-size: 0.82em; font-weight: 600; }
    .compare tr.star { background: color-mix(in srgb, var(--gold) 14%, transparent); }
    .compare tr.star th { font-weight: 800; }
    /* The Plus column is tinted the whole way down so the eye can
       follow it. Without it, a middle column in a three-column
       table is the one nobody reads. */
    .compare .col-plus,
    .compare thead th.col-plus { background: color-mix(in srgb, var(--lav) 12%, transparent); }

    .free-note { margin-block-start: 16px; border-inline-start: 4px solid var(--ok); }

    /* ---------- spotlight ---------- */
    .spotlight {
      display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: center;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 26px; box-shadow: var(--shadow);
    }
    .spotlight h3 { font-family: var(--font-display); font-size: 1.18em; font-weight: 700; margin-block-end: 8px; }
    .spotlight p { color: var(--text-dim); font-size: 0.95em; }
    .spot-tier {
      margin-block-start: 12px; font-weight: 700;
      color: color-mix(in srgb, var(--lav) 62%, var(--text));
    }
    .tree {
      background: var(--surface-2); border: 1px dashed var(--border-strong); border-radius: var(--radius-sm);
      padding: 16px; overflow-x: auto; font-size: 0.82em; line-height: 1.7;
      font-family: var(--font-mono);
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
      box-shadow: var(--shadow);
    }
    .tier.is-featured {
      border-color: color-mix(in srgb, var(--lav) 55%, var(--border));
      box-shadow: 0 20px 60px color-mix(in srgb, var(--lav) 20%, transparent);
    }
    .ribbon {
      position: absolute; inset-block-start: -12px; inset-inline-start: 50%;
      transform: translateX(-50%); white-space: nowrap;
      padding: 4px 15px; border-radius: 999px; font-size: 0.75em; font-weight: 800; color: #fff;
      font-family: var(--font-display);
      background: linear-gradient(135deg, ${CORAL}, ${CORAL_SOFT});
      box-shadow: 0 4px 14px rgba(255, 117, 147, .42);
    }
    [dir="rtl"] .ribbon { transform: translateX(50%); }
    .tier h3 { font-family: var(--font-display); font-size: 1.2em; font-weight: 800; }
    .tier .price { font-family: var(--font-display); font-size: 2.8em; font-weight: 800; line-height: 1.1; margin-block: 4px; }
    .tier .price .cur { font-size: 0.42em; vertical-align: super; opacity: 0.7; }
    .tier-pitch { font-size: 0.92em; color: var(--text-dim); min-height: 3em; }
    .plus-label { font-weight: 700; font-size: 0.86em; margin-block: 14px 8px; text-align: start; }
    .incl { list-style: none; text-align: start; margin-block-end: 6px; }
    .incl li { padding-inline-start: 24px; position: relative; font-size: 0.88em; margin-block: 5px; }
    .incl li::before { content: '✓'; position: absolute; inset-inline-start: 0; color: var(--ok); font-weight: 800; }
    .tier-for { font-size: 0.82em; color: var(--text-dim); text-align: start; }
    .quiet { color: var(--text-dim); font-size: 0.9em; text-decoration: none; }
    .quiet:hover { color: var(--text); }

    /* ---------- what it is / is not ----------
       Two columns of the same weight. The denial is not a footnote
       in small grey text: it is half the block, because the wrong
       reading of this product is the one a stranger arrives with. */
    .isgrid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
      margin-block-start: 16px;
    }
    @media (max-width: 760px) { .isgrid { grid-template-columns: 1fr; } }
    .isgrid .card h3 {
      display: flex; align-items: center; gap: 9px;
      font-family: var(--font-display); font-size: 1.05em; font-weight: 800;
      margin-block-end: 10px;
    }
    .card.is-yes { border-color: color-mix(in srgb, var(--ok) 42%, var(--border)); }
    .card.is-yes h3 { color: color-mix(in srgb, var(--ok) 72%, var(--text)); }
    .card.is-no { border-color: color-mix(in srgb, var(--coral) 40%, var(--border)); }
    .card.is-no h3 { color: color-mix(in srgb, var(--coral) 74%, var(--text)); }
    .islist { list-style: none; display: grid; gap: 9px; }
    .islist li {
      position: relative; padding-inline-start: 16px;
      font-size: 0.9em; color: var(--text-dim); line-height: 1.7;
    }
    .islist li::before {
      content: ''; position: absolute; inset-inline-start: 0; inset-block-start: 11px;
      width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: 0.4;
    }

    /* ---------- install ---------- */
    .install-card { margin-block-start: 16px; }
    .steps { list-style: none; counter-reset: step; display: grid; gap: 13px; }
    .steps li { display: flex; align-items: flex-start; gap: 12px; }
    .steps li::before {
      counter-increment: step; content: counter(step);
      flex: none; width: 26px; height: 26px; border-radius: 50%;
      display: grid; place-items: center; font-size: 0.8em; font-weight: 800;
      color: #fff; margin-block-start: 3px;
      background: linear-gradient(135deg, ${LAV}, ${LAV_SOFT});
    }
    .copy-row { display: flex; align-items: stretch; gap: 8px; margin-block-start: 10px; flex-wrap: wrap; }
    .copy-url {
      flex: 1 1 300px; min-width: 0; font-family: var(--font-mono);
      font-size: 0.84em; padding: 11px 14px; border-radius: var(--radius-sm);
      direction: ltr; text-align: start;
      background: var(--surface-2); border: 1px solid var(--border); color: var(--text);
      overflow-x: auto; white-space: nowrap;
    }
    .copy-btn {
      appearance: none; cursor: pointer; font: inherit; font-weight: 700; font-size: 0.85em;
      padding: 11px 19px; border-radius: var(--radius-sm); border: 1px solid transparent;
      color: #fff; flex: none;
      background: linear-gradient(135deg, ${LAV}, ${LAV_SOFT});
      transition: filter .18s ease;
    }
    .copy-btn:hover { filter: brightness(1.08); }
    .install-alt { margin-block: 16px 14px; }

    /* ---------- faq ---------- */
    .faq {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius-sm); padding: 14px 18px; margin-block-end: 10px;
      box-shadow: var(--shadow);
      transition: border-color .18s ease, box-shadow .18s ease;
    }
    .faq:hover { border-color: var(--border-strong); box-shadow: var(--shadow-pop); }
    .faq summary {
      cursor: pointer; font-family: var(--font-display); font-weight: 700; list-style: none;
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
    }
    .faq summary::-webkit-details-marker { display: none; }
    .faq summary::after {
      content: '＋'; color: var(--coral); font-weight: 800;
      transition: transform .25s cubic-bezier(.34,1.56,.64,1);
    }
    .faq[open] summary::after { content: '−'; transform: rotate(180deg); }
    .faq p { color: var(--text-dim); font-size: 0.94em; margin-block-start: 10px; }

    /* ---------- the rest of the shelf ---------- */
    .shelf { display: grid; gap: 12px; margin-block-end: 30px; }
    .shelf-item {
      display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
      padding: 18px; border-radius: var(--radius); text-decoration: none; color: var(--text);
      background: var(--surface); border: 1px solid var(--border); box-shadow: var(--shadow);
    }
    .shelf-mark { font-size: 1.8em; line-height: 1; transition: transform .3s cubic-bezier(.34,1.56,.64,1); }
    .shelf-item:hover .shelf-mark { transform: rotate(-9deg) scale(1.14); }
    .shelf-body { flex: 1 1 240px; min-width: 0; }
    .shelf-body b { font-family: var(--font-display); }
    .shelf-desc { font-size: 0.88em; color: var(--text-dim); }
    .shelf-cta { font-weight: 700; font-size: 0.9em; color: color-mix(in srgb, var(--lav) 62%, var(--text)); }

    /* ---------- footer ---------- */
    /* Dashed, which is how the original skin separated things
       that are only loosely related. This row is the product's own
       three links; the site footer underneath it carries the rest
       of the site and is styled by Core/SiteNav.js. */
    .ds-links {
      display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;
      margin-block-start: 48px; padding-block-start: 24px;
      border-top: 2px dashed var(--border-strong); color: var(--text-dim); font-size: 0.9em;
    }
    .ds-links a { color: var(--text-dim); text-decoration: none; transition: color .15s ease; }
    .ds-links a:hover { color: var(--coral); }

    /* The shared footer borrows this skin's own accent rather than
       arriving in the site's default violet. */
    .ac-foot { --acn-accent: var(--lav); --acn-surface: var(--surface-2); }
    [id] { scroll-margin-top: 24px; }

    a:focus-visible, button:focus-visible, summary:focus-visible {
      outline: 2px solid var(--coral); outline-offset: 3px; border-radius: 999px;
    }

    /* ==========================================
       Motion
       All of it lives in one block behind
       prefers-reduced-motion, so "less motion" is a single
       switch rather than a property somebody has to remember
       to override in twelve places.
       ========================================== */
    @keyframes ds-bob {
      0%, 100% { transform: translateY(0) rotate(-1.5deg); }
      50%      { transform: translateY(-4px) rotate(1.5deg); }
    }
    @keyframes ds-boba-drift {
      0%, 100% { transform: translateY(0); }
      50%      { transform: translateY(-2.5px); }
    }
    @keyframes ds-twinkle {
      0%, 100% { opacity: .45; transform: scale(.9) rotate(0deg); }
      50%      { opacity: 1;   transform: scale(1.12) rotate(18deg); }
    }
    @keyframes ds-halo {
      0%, 100% { opacity: .55; transform: scale(1); }
      50%      { opacity: .9;  transform: scale(1.09); }
    }
    @keyframes ds-rise {
      from { opacity: 0; transform: translateY(18px); }
      to   { opacity: 1; transform: none; }
    }
    @keyframes ds-pop {
      from { opacity: 0; transform: translateY(16px) scale(.985); }
      to   { opacity: 1; transform: none; }
    }
    @keyframes ds-rule {
      from { transform: scaleX(0); }
      to   { transform: scaleX(1); }
    }
    @keyframes ds-shimmer {
      0%, 100% { background-position: 0% 50%; }
      50%      { background-position: 100% 50%; }
    }
    @keyframes ds-sheen {
      0%   { transform: translateX(-140%) skewX(-16deg); opacity: .9; }
      100% { transform: translateX(420%) skewX(-16deg); opacity: 0; }
    }
    @keyframes ds-wash {
      0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
      50%      { transform: translate3d(-2.5%, 2%, 0) scale(1.06); }
    }
    @keyframes ds-pearl {
      0%   { opacity: 0; transform: translate3d(0, 0, 0); }
      12%  { opacity: .5; }
      88%  { opacity: .45; }
      100% { opacity: 0; transform: translate3d(14px, -118vh, 0); }
    }
    @keyframes ds-featured {
      0%, 100% { box-shadow: 0 18px 46px color-mix(in srgb, var(--lav) 18%, transparent); }
      50%      { box-shadow: 0 26px 64px color-mix(in srgb, var(--coral) 28%, transparent); }
    }
    @keyframes ds-faq {
      from { opacity: 0; transform: translateY(-6px); }
      to   { opacity: 1; transform: none; }
    }

    @media (prefers-reduced-motion: no-preference) {
      body::before { animation: ds-wash 26s ease-in-out infinite; will-change: transform; }
      .pearls span { animation: ds-pearl var(--d, 30s) linear var(--t, 0s) infinite; will-change: transform; }

      /* The mascot: a slow bob, the pearls drifting inside the
         cup, and two sparkles twinkling off each other's beat.
         One element each, transform and opacity only. */
      .ds-logo { animation: ds-bob 4.5s ease-in-out infinite; transform-origin: 50% 70%; will-change: transform; }
      .ds-logo .ds-boba { animation: ds-boba-drift 3.2s ease-in-out infinite; transform-origin: 50% 78%; }
      .ds-logo .ds-sparkle { animation: ds-twinkle 2.6s ease-in-out infinite; transform-origin: 16px 74px; }
      .ds-logo .ds-sparkle-2 { animation-duration: 3.4s; animation-delay: -1.1s; transform-origin: 86px 59px; }
      .mascot::before { animation: ds-halo 5.5s ease-in-out infinite; }

      /* The hero arrives in one wave rather than all at once. */
      .hero .mascot  { animation: ds-rise .6s cubic-bezier(.16,1,.3,1) both; }
      .hero h1       { animation: ds-rise .6s cubic-bezier(.16,1,.3,1) .06s both, ds-shimmer 11s ease-in-out 1.2s infinite; }
      .hero .tagline { animation: ds-rise .6s cubic-bezier(.16,1,.3,1) .12s both; }
      .hero .lede    { animation: ds-rise .6s cubic-bezier(.16,1,.3,1) .18s both; }
      .hero .cta     { animation: ds-rise .6s cubic-bezier(.16,1,.3,1) .24s both; }
      .hero .fine    { animation: ds-rise .6s cubic-bezier(.16,1,.3,1) .30s both; }

      .btn:hover::after { animation: ds-sheen .75s ease; }
      .tier.is-featured { animation: ds-featured 6s ease-in-out infinite; }
      .faq[open] p { animation: ds-faq .3s ease both; }

      /* Reveal on scroll.
         Behind an html.js class as well as behind this query: the
         class is set by an inline script in <head>, so a
         visitor with JavaScript off never gets the hidden
         state that only JavaScript can undo. */
      html.js .reveal { opacity: 0; transform: translateY(24px); }
      html.js .reveal.is-in {
        opacity: 1; transform: none;
        transition: opacity .55s cubic-bezier(.16,1,.3,1), transform .55s cubic-bezier(.16,1,.3,1);
      }
      html.js .sec.is-in .section::after { animation: ds-rule .8s cubic-bezier(.16,1,.3,1) both; }
      html.js .stagger > * { opacity: 0; }
      html.js .sec.is-in .stagger > * {
        animation: ds-pop .55s cubic-bezier(.16,1,.3,1) both;
        animation-delay: calc(var(--i, 0) * 90ms + 100ms);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      *, *::before, *::after { transition-duration: 0.001ms !important; animation-duration: 0.001ms !important; }
    }
  `
}


// ==========================================
// script
// The reveal-on-scroll pass and the video player. Language
// and theme switching come from the shared chrome, so this
// page toggles them exactly the way every other page does.
// ==========================================
function script(lang, p) {
  const data = videoData(lang)

  return `
    // ==========================================
    // Copy the package URL
    //
    // The clipboard API needs a secure context and a user gesture,
    // and refuses in a few embedded browsers even with both. The
    // fallback selects the URL so a person can copy it themselves,
    // rather than pressing a button that silently does nothing.
    // ==========================================
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

    // ==========================================
    // Reveal on scroll
    //
    // Sections arrive as the reader reaches them, once each -
    // the observer stops watching an element the moment it has
    // landed, so scrolling back up does not replay the page.
    //
    // Everything is revealed outright when IntersectionObserver
    // is missing: the hidden state is a CSS rule only JavaScript
    // can undo, and a page that stays blank is worse than a page
    // that never animates.
    // ==========================================
    (function () {
      var targets = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
      if (!targets.length) return;

      var show = function (el) { el.classList.add('is-in'); };
      var flush = function () { targets.forEach(show); targets = []; };

      if (!('IntersectionObserver' in window)) { flush(); return; }

      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          show(entry.target);
          observer.unobserve(entry.target);
        });
      }, { rootMargin: '0px 0px -56px 0px', threshold: 0 });

      targets.forEach(function (el) {
        // Anything already on screen at load - on a short window
        // that is the first section - is shown without waiting for
        // a scroll that may never come.
        if (el.getBoundingClientRect().top < (window.innerHeight || 0)) show(el);
        else observer.observe(el);
      });

      // The last element on the page can be shorter than the
      // observer's bottom margin, which leaves it sitting in a band
      // the root never covers - the footer was invisible for
      // exactly that reason. Reaching the end of the document is an
      // unambiguous "you can see it now", so it reveals whatever is
      // left and the listener retires.
      var onScroll = function () {
        var atEnd = window.innerHeight + window.pageYOffset
          >= document.documentElement.scrollHeight - 4;
        if (!atEnd) return;
        flush();
        observer.disconnect();
        window.removeEventListener('scroll', onScroll);
      };
      window.addEventListener('scroll', onScroll, { passive: true });
    })();

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

        // The same media fragment the server-rendered element
        // carries, so a clip switched into the player shows a frame
        // rather than a grey box while it waits to be played.
        video.src = '/video/' + vlang + '/' + id + ${JSON.stringify(POSTER_FRAGMENT)};
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
  const lang = resolveRequestLang(url, request, cookies)
  const theme = resolveRequestTheme(cookies)

  const headers = langCookieHeader(url, lang)

  return createHtmlResponse(renderPage(lang, theme), 200, headers)
}
