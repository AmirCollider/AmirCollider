// ==========================================
// Pages/Terms.js
// Terms of Service Page Handler
// AmirCollider Games - Worker Proxy


// ==========================================
// Responsibilities
//   - Render the per-game Terms of Service with the same chrome,
//     theme tokens and motion language as the rest of the site
//     (dashboard / leaderboard / privacy / health / ping / metrics).
//
// Integration contract (do not break without updating Worker.js)
//   - Public entry: handleTermsWithGame(url, request, gameId,
//                                       requestId, GAMES)
//
// Theme & language
//   - Theme: <html data-theme="light|dark">; absent = auto (follows OS).
//     Stored in localStorage('ac_theme') + cookie('theme'); a pre-paint
//     boot script applies it before first paint to avoid a flash.
//   - Language: server-resolved (?lang= -> cookie -> Accept-Language).
//     Switching reloads with ?lang=xx so RTL/LTR is always correct on
//     the server and the floating controls never re-flip on the client.
//
// Extending
//   - Add a language: add one entry to I18N (and to LANGUAGES).
//   - Add / reorder a section: edit SECTION_ORDER; content lives in I18N.
// ==========================================

import { CONFIG, validateGameId } from '../Config.js'
import { getPageHead } from '../Core/DesignSystem.js'
import { createErrorPage } from '../Core/ErrorPage.js'
import { createHtmlResponse } from '../Core/Http.js'
import { escapeHtml, sortListItems } from '../Core/Html.js'
import { themeBootScript } from '../Core/PageChrome.js'
import { seoHead, breadcrumbLd, keywordList } from '../Core/Seo.js'
import { localizedPath } from '../Core/Locale.js'
import {
  siteNavCss, siteHeader, siteBreadcrumb, siteFooter, siteBackToTop, siteChromeScript, NAV_I18N
} from '../Core/SiteNav.js'
import { dirFor, langCookieHeader, parseCookies, resolveLang, resolveRequestLang, resolveRequestTheme } from '../Core/RequestContext.js'


// ==========================================
// Route Handler
//
// Answers at /terms (the site-wide address Google Play and the
// OAuth consent screen are given) and at /:gameId/terms (what
// shipped builds link to). Canonical follows the request.
// ==========================================
export async function handleTermsWithGame(url, request, gameId, requestId, GAMES) {
  const game = validateGameId(gameId, GAMES)

  if (!game) {
    return createHtmlResponse(createErrorPage('بازی یافت نشد', {
      name: 'AmirCollider Games',
      icon: '🎮',
      color: '#667eea',
      logo: CONFIG.AMIR_LOGO
    }), 404)
  }

  const cookies = parseCookies(request)
  const lang = resolveRequestLang(url, request, cookies)
  const theme = resolveRequestTheme(cookies)

  const headers = langCookieHeader(url, lang)

  return createHtmlResponse(
    createTermsPage(game, game.id, url.origin, lang, theme, {
      path: url.pathname,
      games: Object.values(GAMES || {})
    }),
    200,
    headers
  )
}


function pack(lang) {
  return I18N[resolveLang(lang)]
}


// ==========================================
// Last Updated — a fact about the text, not a reading of the clock
//
// The footer used to call localizedDate(lang) with its default
// argument, and that default was new Date(). So the page told every
// visitor these terms had last been revised on the day they happened
// to open it: on 12 August it said 12 August, on the 13th it said
// the 13th, and not one word of the document had changed in between.
// That is worse than printing no date at all. The date is the only
// handle a reader has on "has this changed since I agreed to it?",
// and terms of use are exactly the kind of document a reader is
// entitled to check that question against.
//
// So the date is data now, and only a human moves it. Bump it in the
// same commit that changes the wording of THIS page. Privacy.js
// keeps its own copy on purpose: the two documents are revised
// independently, and a single shared constant would silently re-date
// whichever one had not changed.
//
// [year, month, day] — Gregorian, month 1-12, day 1-31.
// ==========================================
const LAST_UPDATED = [2026, 8, 12]


// ==========================================
// Date Helpers (CF Workers safe, no Intl locale dependency)
//
// Every renderer below takes that plain [y, m, d] triple rather than
// a Date, deliberately. A Date is a point in time and each getter on
// it resolves in the runtime's timezone, so "12 August" built as a
// Date and read back west of Greenwich is 11 August — a published
// date has no time and no zone, and it never acquires one here.
// ==========================================
function getJalaliDate([gy, gm, gd]) {
  const gy2 = gy - 1600
  const gm2 = gm - 1
  const gd2 = gd - 1
  const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

  let gDayNo = 365 * gy2
    + Math.floor((gy2 + 3) / 4)
    - Math.floor((gy2 + 99) / 100)
    + Math.floor((gy2 + 399) / 400)

  const gDays = [31, isLeap(gy) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  for (let i = 0; i < gm2; i++) gDayNo += gDays[i]
  gDayNo += gd2

  let jDayNo = gDayNo - 79
  const jNp = Math.floor(jDayNo / 12053)
  jDayNo %= 12053

  let jy = 979 + 33 * jNp + 4 * Math.floor(jDayNo / 1461)
  jDayNo %= 1461

  if (jDayNo >= 366) {
    jy += Math.floor((jDayNo - 1) / 365)
    jDayNo = (jDayNo - 1) % 365
  }

  const jDays = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29]
  let jm = 0
  for (; jm < 11 && jDayNo >= jDays[jm]; jm++) jDayNo -= jDays[jm]
  const jd = jDayNo + 1

  const months = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
                  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']
  const toFa = (n) => String(n).replace(/\d/g, (x) => '۰۱۲۳۴۵۶۷۸۹'[x])

  return `${toFa(jd)} ${months[jm]} ${toFa(jy)}`
}

function getEnglishDate([gy, gm, gd]) {
  // Written out instead of handed to toLocaleDateString: Intl would
  // format the day in the runtime's timezone, and twelve month names
  // that will never change are not worth a locale dependency.
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December']

  return `${months[gm - 1]} ${gd}, ${gy}`
}

function getJapaneseDate([gy, gm, gd]) {
  return `${gy}年${gm}月${gd}日`
}

function localizedDate(lang, ymd = LAST_UPDATED) {
  if (lang === 'en') return getEnglishDate(ymd)
  if (lang === 'ja') return getJapaneseDate(ymd)
  return getJalaliDate(ymd)
}

// The machine-readable twin of the line above, for <time datetime>.
// It is built from the same three numbers, so the words a reader
// sees and the date a crawler parses can never drift apart.
function isoDate([gy, gm, gd] = LAST_UPDATED) {
  const pad = (n) => String(n).padStart(2, '0')

  return `${gy}-${pad(gm)}-${pad(gd)}`
}


// ==========================================
// SVG Icon Set (stroke uses currentColor)
// ==========================================
const ICONS = {
  contrast: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor" stroke="none"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  gamepad: '<rect x="2" y="7" width="20" height="11" rx="4"/><path d="M6 11v3"/><path d="M4.5 12.5h3"/><circle cx="16" cy="11" r="1" fill="currentColor" stroke="none"/><circle cx="18.5" cy="14" r="1" fill="currentColor" stroke="none"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10"/><path d="M14.5 9.3a2.7 2 0 0 0-2.5-1.3c-1.4 0-2.5.8-2.5 1.9s1.1 1.7 2.5 1.9 2.5.8 2.5 1.9-1.1 1.9-2.5 1.9a2.7 2 0 0 1-2.5-1.3"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  lock: '<rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  device: '<rect x="6" y="3" width="12" height="18" rx="3"/><path d="M11 18h2"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 4v5h-5"/>',
  scale: '<path d="M12 3v18"/><path d="M7 7h10"/><path d="M8 21h8"/><path d="M7 7l-3 6a3 3 0 0 0 6 0z"/><path d="M17 7l-3 6a3 3 0 0 0 6 0z"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  badge: '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>'
}

function icon(name, cls) {
  return '<svg class="' + (cls || 'p-ic') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
    + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + (ICONS[name] || '') + '</svg>'
}


// ==========================================
// Section Order (data-driven; reorder or remove here)
// ==========================================
const SECTION_ORDER = [
  { key: 'acceptance',     ic: 'doc' },
  { key: 'license',        ic: 'check' },
  { key: 'prohibited',     ic: 'ban' },
  { key: 'ownership',      ic: 'gamepad' },
  { key: 'purchases',      ic: 'coin' },
  { key: 'liability',      ic: 'alert' },
  { key: 'account',        ic: 'lock' },
  { key: 'permissions',    ic: 'device' },
  { key: 'service',        ic: 'refresh' },
  { key: 'law',            ic: 'scale' },
  { key: 'changes',        ic: 'edit' },
  { key: 'confirm',        ic: 'badge' }
]

// ==========================================
// Content Dictionary (single source of truth)
// Keys ending in *.body hold trusted authored HTML.
// ==========================================
const I18N = {
  fa: {
    locale: 'fa-IR',
    langName: 'فارسی',
    meta: 'شرایط و قوانین استفاده',

    // See the note on the same field in Pages/Privacy.js: the
    // description used to be the title repeated, which made every
    // policy page on this Worker look like the same page.
    metaDesc: 'شرایط استفاده از {subject}: قوانین حساب کاربری، خریدهای درون‌برنامه‌ای و بازپرداخت، رفتار قابل قبول، مالکیت محتوا و شرایط تعلیق یا حذف حساب.',
    title: 'شرایط و قوانین استفاده',
    themeToDark: 'حالت تاریک',
    themeToLight: 'حالت روشن',
    brandSub: 'شرایط و قوانین',
    brandAll: 'همه‌ی بازی‌ها و ابزارها',
    'sec.acceptance.title': 'پذیرش شرایط',
    'sec.acceptance.body':
      '<div class="callout callout-good"><p>با استفاده از بازی و سرویس‌های ما، شما موافقت می‌کنید که تمام شرایط و قوانین زیر را بپذیرید. اگر با این شرایط موافق نیستید، لطفاً از سرویس استفاده نکنید.</p></div>',
    'sec.license.title': 'مجوز استفاده',
    'sec.license.body':
      '<p>ما به شما مجوز محدود، غیرانحصاری و قابل لغو برای استفاده شخصی و غیرتجاری از بازی می‌دهیم. این مجوز شامل موارد زیر می‌شود:</p>'
      + '<ul>'
      + '<li>بازی کردن و استفاده از تمامی امکانات قانونی</li>'
      + '<li>دانلود و نصب بازی روی دستگاه‌های شخصی</li>'
      + '<li>ذخیره پیشرفت و امتیازات خود</li>'
      + '<li>مشارکت در جداول امتیازات</li>'
      + '</ul>',
    'sec.prohibited.title': 'رفتارهای ممنوع',
    'sec.prohibited.body':
      '<div class="callout callout-warn">'
      + '<p><strong>هشدار:</strong> هنگام استفاده از سرویس، نباید:</p>'
      + '<ul>'
      + '<li><strong>ایجاد حساب جعلی:</strong> ساخت چندین حساب برای سوء‌استفاده</li>'
      + '<li><strong>حمله سایبری:</strong> تلاش برای نفوذ یا آسیب رساندن به سرورها</li>'
      + '<li><strong>هک یا چیت:</strong> استفاده از هک، چیت یا ابزارهای غیرمجاز</li>'
      + '<li><strong>سرقت حساب:</strong> سرقت یا سوء‌استفاده از حساب کاربری دیگران</li>'
      + '<li><strong>سوء‌استفاده از اشکالات:</strong> سوء‌استفاده عمدی از باگ‌ها و اشکالات بازی</li>'
      + '<li><strong>معکوس‌مهندسی:</strong> معکوس‌مهندسی یا دیکامپایل بازی به هر شکل</li>'
      + '<li><strong>محتوای نامناسب:</strong> انتشار محتوای توهین‌آمیز، مستهجن یا نامناسب</li>'
      + '</ul></div>',
    'sec.ownership.title': 'مالکیت محتوا',
    'sec.ownership.body':
      '<p>کد، طراحی، گرافیک و نام تجاری بازی متعلق به <strong>AmirCollider</strong> است.</p>'
      + '<ul>'
      + '<li>ابزارهای به‌کاررفته در ساخت بازی یا رایگان‌اند یا به‌صورت قانونی تهیه شده‌اند</li>'
      + '<li>انتشار مجدد خودِ بازی به نام یا با هویت شخص دیگری مجاز نیست</li>'
      + '<li>ممکن است بعضی ایده‌ها و مکانیزم‌های بازی از بازی‌های دیگر الهام گرفته شده باشند، اما هیچ‌کدام غیرقانونی نیستند</li>'
      + '<li>تمام صداها و Assetهای به‌کاررفته آزادند و کپی‌رایتی روی آن‌ها وجود ندارد؛ می‌توانید ویدیوی بازی را در یوتیوب یا هر جای دیگری منتشر کنید</li>'
      + '</ul>',
    'sec.purchases.title': 'خریدهای درون‌برنامه‌ای',
    'sec.purchases.body':
      '<p>بازی ممکن است شامل خریدهای درون‌برنامه‌ای با شرایط زیر باشد:</p>'
      + '<ul>'
      + '<li>تمام خریدها نهایی هستند و استرداد وجه انجام نمی‌شود</li>'
      + '<li>قیمت‌ها ممکن است بدون اطلاع قبلی تغییر کنند</li>'
      + '<li>پرداخت از طریق درگاه پرداخت رمزارز انجام می‌شود و امنیت کیف پول و روش پرداخت با خود شماست</li>'
      + '</ul>',
    'sec.liability.title': 'محدودیت مسئولیت',
    'sec.liability.body':
      '<div class="callout callout-warn">'
      + '<p><strong>مهم:</strong> بازی «همان‌گونه که هست» ارائه می‌شود. ما مسئولیتی در قبال خسارات ناشی از استفاده یا عدم استفاده از سرویس نداریم، از جمله:</p>'
      + '<ul>'
      + '<li>خرابی نرم‌افزار</li>'
      + '<li>خسارات مالی یا غیرمالی</li>'
      + '<li>مشکلات فنی یا قطعی سرویس</li>'
      + '<li>از دست رفتن داده‌ها یا پیشرفت بازی</li>'
      + '</ul></div>',
    'sec.account.title': 'حساب کاربری',
    'sec.account.body':
      '<ul>'
      + '<li><strong>اطلاعات صحیح:</strong> باید اطلاعات دقیق و به‌روز ارائه دهید</li>'
      + '<li><strong>حذف حساب:</strong> هر زمان بخواهید می‌توانید حساب خود را حذف کنید</li>'
      + '<li><strong>تعلیق حساب:</strong> حساب‌های مشکوک ممکن است تعلیق یا حذف شوند</li>'
      + '<li><strong>مسئولیت امنیت:</strong> حفظ امنیت حساب و دستگاه شما بر عهده‌ی خودتان است</li>'
      + '</ul>',
    'sec.permissions.title': 'دسترسی‌های مورد نیاز',
    'sec.permissions.body':
      '<p>هر بازی دسترسی‌های خودش را دارد و این دسترسی‌ها از یک بازی به بازی دیگر فرق می‌کند. فهرست دقیق آن‌ها پیش از نصب، در همان جایی که بازی را از آن دریافت می‌کنید نمایش داده می‌شود و هر بازی تنها همان دسترسی‌هایی را می‌خواهد که برای اجرای خودش لازم است.</p>',
    'sec.service.title': 'تغییرات در سرویس',
    'sec.service.body':
      '<p>ما حق داریم هر زمان سرویس را تغییر دهیم، به‌روزرسانی کنیم یا متوقف کنیم. این شامل موارد زیر است:</p>'
      + '<ul>'
      + '<li>تغییر در مکانیزم‌های اصلی بازی</li>'
      + '<li>اضافه یا حذف ویژگی‌ها</li>'
      + '<li>اصلاح اشکالات و بهبود عملکرد</li>'
      + '<li>تغییر قیمت خریدهای درون‌برنامه‌ای</li>'
      + '</ul>',
    'sec.law.title': 'قانون حاکم',
    'sec.law.body':
      '<p>این شرایط دقیقاً همان‌گونه که در این صفحه نوشته شده اجرا می‌شود. هرگونه اختلاف ابتدا از طریق مذاکره حل می‌شود و اگر رسیدگی رسمی الزامی شود، قوانین ایالات متحده‌ی آمریکا مبنا قرار می‌گیرد.</p>',
    'sec.changes.title': 'تغییرات در شرایط',
    'sec.changes.body':
      '<div class="callout callout-info"><p>ما ممکن است این شرایط را هر زمان به‌روزرسانی کنیم. تغییرات از لحظه انتشار لازم‌الاجرا خواهند بود. ادامه استفاده از سرویس پس از هر به‌روزرسانی به‌منزله پذیرش شرایط جدید است.</p></div>',
    'sec.confirm.title': 'تأیید و پذیرش',
    'sec.confirm.body':
      '<div class="callout callout-good">'
      + '<p><strong>با استفاده از بازی، شما تأیید می‌کنید که:</strong></p>'
      + '<ul>'
      + '<li>با تمام شرایط ذکرشده موافقت می‌کنید</li>'
      + '<li>شرایط سنی اعلام‌شده برای آن بازی را دارید</li>'
      + '<li>این شرایط و قوانین را خوانده و به‌طور کامل فهمیده‌اید</li>'
      + '<li>مسئولیت استفاده صحیح از سرویس را طبق این شرایط می‌پذیرید</li>'
      + '</ul></div>',
    'contact.title': 'پشتیبانی و تماس',
    'contact.intro': 'در صورت بروز هرگونه مشکل یا سوال، با ما تماس بگیرید:',
    'contact.game': 'بازی',
    'contact.gamePage': 'صفحه بازی',
    'contact.gamePageLink': 'مشاهده صفحه بازی',
    'contact.email': 'ایمیل پشتیبانی',
    'contact.web': 'وب‌سایت',
    'footer.updated': 'آخرین به‌روزرسانی:',
    'footer.version': 'نسخه',
    'footer.validity': 'این سند از لحظه انتشار معتبر است و برای همه کاربران لازم‌الاجرا می‌باشد.',
    'btn.home': 'بازگشت به صفحه اصلی',
    'btn.privacy': 'حریم خصوصی'
  },

  en: {
    locale: 'en-US',
    langName: 'English',
    meta: 'Terms of Service',
    metaDesc: 'The terms of service for {subject}: account rules, in-app purchases and refunds, acceptable use, and when an account can be suspended or removed.',
    title: 'Terms of Service',
    themeToDark: 'Dark mode',
    themeToLight: 'Light mode',
    brandSub: 'Terms of service',
    brandAll: 'All games & tools',
    'sec.acceptance.title': 'Acceptance of Terms',
    'sec.acceptance.body':
      '<div class="callout callout-good"><p>By using our game and services, you agree to all the terms listed below. If you do not agree, please refrain from using the service.</p></div>',
    'sec.license.title': 'License of Use',
    'sec.license.body':
      '<p>We grant you a limited, non-exclusive, revocable license for personal, non-commercial use of the game. This includes:</p>'
      + '<ul>'
      + '<li>Playing the game and using all legitimate features</li>'
      + '<li>Downloading and installing the game on personal devices</li>'
      + '<li>Saving your progress and scores</li>'
      + '<li>Participating in leaderboards</li>'
      + '</ul>',
    'sec.prohibited.title': 'Prohibited Behaviors',
    'sec.prohibited.body':
      '<div class="callout callout-warn">'
      + '<p><strong>Warning:</strong> When using the service, you must not:</p>'
      + '<ul>'
      + '<li><strong>Fake accounts:</strong> Creating multiple accounts to abuse the system</li>'
      + '<li><strong>Cyber attack:</strong> Attempting to breach or damage our servers</li>'
      + '<li><strong>Hacking or cheating:</strong> Using hacks, cheats, or any unauthorized tools</li>'
      + '<li><strong>Account theft:</strong> Stealing or misusing another user\'s account</li>'
      + '<li><strong>Bug exploitation:</strong> Intentionally exploiting bugs or glitches in the game</li>'
      + '<li><strong>Reverse engineering:</strong> Reverse engineering or decompiling the game in any form</li>'
      + '<li><strong>Inappropriate content:</strong> Publishing offensive, obscene, or otherwise inappropriate content</li>'
      + '</ul></div>',
    'sec.ownership.title': 'Content Ownership',
    'sec.ownership.body':
      '<p>The game\'s code, design, graphics and brand name belong to <strong>AmirCollider</strong>.</p>'
      + '<ul>'
      + '<li>The tools used to build the games are either free or legally licensed</li>'
      + '<li>Republishing the game itself under someone else\'s name or identity is not allowed</li>'
      + '<li>Some ideas and mechanics may be inspired by other games, but none of them are unlawful</li>'
      + '<li>All sounds and assets used are free of copyright; you are welcome to publish gameplay footage on YouTube or anywhere else</li>'
      + '</ul>',
    'sec.purchases.title': 'In-App Purchases',
    'sec.purchases.body':
      '<p>The game may include in-app purchases subject to the following:</p>'
      + '<ul>'
      + '<li>All purchases are final and are not refunded</li>'
      + '<li>Prices may change at any time without prior notice</li>'
      + '<li>Payment goes through a crypto payment gateway, and the security of your wallet and payment method is your own</li>'
      + '</ul>',
    'sec.liability.title': 'Limitation of Liability',
    'sec.liability.body':
      '<div class="callout callout-warn">'
      + '<p><strong>Important:</strong> The game is provided "as is". We are not liable for damages arising from use or inability to use the service, including:</p>'
      + '<ul>'
      + '<li>Software malfunction</li>'
      + '<li>Loss of game data or progress</li>'
      + '<li>Financial or non-financial damages</li>'
      + '<li>Technical issues or service outages</li>'
      + '</ul></div>',
    'sec.account.title': 'User Account',
    'sec.account.body':
      '<ul>'
      + '<li><strong>Accurate info:</strong> You must provide accurate and up-to-date information</li>'
      + '<li><strong>Account deletion:</strong> You may delete your account whenever you like</li>'
      + '<li><strong>Account suspension:</strong> Accounts that appear suspicious may be suspended or deleted</li>'
      + '<li><strong>Security responsibility:</strong> Keeping your account and your device secure is your own responsibility</li>'
      + '</ul>',
    'sec.permissions.title': 'Required Permissions',
    'sec.permissions.body':
      '<p>Every game asks for its own permissions, and they differ from one game to the next. The exact list is shown before installation, wherever you obtain the game from, and a game asks only for what it needs in order to run.</p>',
    'sec.service.title': 'Changes to Service',
    'sec.service.body':
      '<p>We reserve the right to modify, update, or discontinue the service at any time. This includes:</p>'
      + '<ul>'
      + '<li>Changes to core game mechanics</li>'
      + '<li>Adding or removing existing features</li>'
      + '<li>Bug fixes and overall performance improvements</li>'
      + '<li>Adjusting the prices of any in-app purchases</li>'
      + '</ul>',
    'sec.law.title': 'Governing Law',
    'sec.law.body':
      '<p>These terms apply exactly as they are written on this page. Any dispute is first resolved through negotiation; if formal proceedings become unavoidable, the laws of the United States of America apply.</p>',
    'sec.changes.title': 'Changes to Terms',
    'sec.changes.body':
      '<div class="callout callout-info"><p>We may update these terms at any time. All changes take effect immediately upon publication. Continued use of the service following any update constitutes acceptance of the revised terms.</p></div>',
    'sec.confirm.title': 'Confirmation & Acceptance',
    'sec.confirm.body':
      '<div class="callout callout-good">'
      + '<p><strong>By using the game, you confirm that:</strong></p>'
      + '<ul>'
      + '<li>You meet the age rating stated for that game</li>'
      + '<li>You agree to comply with all of the conditions stated above</li>'
      + '<li>You have read and fully understood these terms and conditions</li>'
      + '<li>You accept full responsibility for using the service in accordance with these terms</li>'
      + '</ul></div>',
    'contact.title': 'Support & Contact',
    'contact.intro': 'For any issues or questions, please reach out to us:',
    'contact.game': 'Game',
    'contact.gamePage': 'Game page',
    'contact.gamePageLink': 'View game page',
    'contact.email': 'Support email',
    'contact.web': 'Website',
    'footer.updated': 'Last updated:',
    'footer.version': 'Version',
    'footer.validity': 'This document is valid from the moment of publication and is binding on all users.',
    'btn.home': 'Back to Home',
    'btn.privacy': 'Privacy Policy'
  },

  ja: {
    locale: 'ja-JP',
    langName: '日本語',
    meta: '利用規約',
    metaDesc: '{subject} の利用規約。アカウントの規則、アプリ内購入と返金、禁止事項、アカウントの停止・削除の条件について。',
    title: '利用規約',
    themeToDark: 'ダークモード',
    themeToLight: 'ライトモード',
    brandSub: '利用規約',
    brandAll: 'すべてのゲームとツール',
    'sec.acceptance.title': '規約への同意',
    'sec.acceptance.body':
      '<div class="callout callout-good"><p>当社のゲームおよびサービスをご利用いただくことで、お客様は以下のすべての規約に同意したものとみなされます。これらの規約に同意されない場合は、サービスのご利用をお控えください。</p></div>',
    'sec.license.title': '利用ライセンス',
    'sec.license.body':
      '<p>当社は、お客様に対し、個人的かつ非商用目的でゲームを利用するための、限定的・非独占的・取消可能なライセンスを付与します。これには以下が含まれます。</p>'
      + '<ul>'
      + '<li>ゲームのプレイおよびすべての正当な機能の利用</li>'
      + '<li>個人所有のデバイスへのゲームのダウンロードおよびインストール</li>'
      + '<li>進行状況およびスコアの保存</li>'
      + '<li>リーダーボードへの参加</li>'
      + '</ul>',
    'sec.prohibited.title': '禁止行為',
    'sec.prohibited.body':
      '<div class="callout callout-warn">'
      + '<p><strong>警告：</strong>サービスのご利用にあたり、以下の行為を行ってはなりません。</p>'
      + '<ul>'
      + '<li><strong>偽アカウント：</strong>システムを悪用するための複数アカウントの作成</li>'
      + '<li><strong>サイバー攻撃：</strong>サーバーへの侵入や損害を与える試み</li>'
      + '<li><strong>ハッキング・チート：</strong>ハッキング、チート、または不正なツールの使用</li>'
      + '<li><strong>アカウントの窃取：</strong>他人のアカウントの窃取または不正利用</li>'
      + '<li><strong>バグの悪用：</strong>ゲーム内のバグや不具合の意図的な悪用</li>'
      + '<li><strong>リバースエンジニアリング：</strong>いかなる形式であれゲームのリバースエンジニアリングや逆コンパイル</li>'
      + '<li><strong>不適切なコンテンツ：</strong>侮辱的・わいせつ・その他不適切なコンテンツの公開</li>'
      + '</ul></div>',
    'sec.ownership.title': 'コンテンツの所有権',
    'sec.ownership.body':
      '<p>ゲームのコード、デザイン、グラフィック、ブランド名は <strong>AmirCollider</strong> に帰属します。</p>'
      + '<ul>'
      + '<li>ゲーム制作に使用したツールは、無償のものか正規に取得したものです</li>'
      + '<li>ゲームそのものを他者の名義で再配布することは認められません</li>'
      + '<li>一部のアイデアやゲームメカニクスは他のゲームから着想を得ている場合がありますが、違法なものは一つもありません</li>'
      + '<li>使用しているサウンドとアセットはすべて著作権フリーです。YouTube などでのプレイ動画の公開は自由に行えます</li>'
      + '</ul>',
    'sec.purchases.title': 'アプリ内購入',
    'sec.purchases.body':
      '<p>本ゲームには、以下の条件に従うアプリ内購入が含まれる場合があります。</p>'
      + '<ul>'
      + '<li>価格は予告なく変更される場合があります</li>'
      + '<li>すべての購入は最終的なものであり、返金は行われません</li>'
      + '<li>支払いは暗号資産の決済ゲートウェイを通じて行われ、ウォレットおよび支払い方法の安全管理はお客様の責任となります</li>'
      + '</ul>',
    'sec.liability.title': '責任の制限',
    'sec.liability.body':
      '<div class="callout callout-warn">'
      + '<p><strong>重要：</strong>本ゲームは「現状有姿」で提供されます。当社は、サービスの利用または利用不能に起因する損害について、以下を含め一切の責任を負いません。</p>'
      + '<ul>'
      + '<li>ソフトウェアの不具合</li>'
      + '<li>金銭的または非金銭的損害</li>'
      + '<li>ゲームデータまたは進行状況の損失</li>'
      + '<li>技術的な問題またはサービスの停止</li>'
      + '</ul></div>',
    'sec.account.title': 'ユーザーアカウント',
    'sec.account.body':
      '<ul>'
      + '<li><strong>正確な情報：</strong>正確かつ最新の情報を提供する必要があります</li>'
      + '<li><strong>アカウントの削除：</strong>いつでもアカウントを削除できます</li>'
      + '<li><strong>アカウントの停止：</strong>不審なアカウントは停止または削除される場合があります</li>'
      + '<li><strong>セキュリティ責任：</strong>アカウントおよびデバイスの安全管理はお客様の責任です</li>'
      + '</ul>',
    'sec.permissions.title': '必要な権限',
    'sec.permissions.body':
      '<p>必要な権限はゲームごとに異なります。正確な一覧はインストール前に、ゲームを入手する場所に表示されます。各ゲームは、動作に必要な権限のみを要求します。</p>',
    'sec.service.title': 'サービスの変更',
    'sec.service.body':
      '<p>当社は、いつでもサービスを変更、更新、または終了する権利を有します。これには以下が含まれます。</p>'
      + '<ul>'
      + '<li>ゲームの基本的な仕組みの変更</li>'
      + '<li>機能の追加または削除</li>'
      + '<li>バグ修正および全体的なパフォーマンスの向上</li>'
      + '<li>アプリ内購入の価格の調整</li>'
      + '</ul>',
    'sec.law.title': '準拠法',
    'sec.law.body':
      '<p>本規約は、このページに記載されているとおりに適用されます。紛争はまず協議によって解決するものとし、正式な手続きが避けられない場合は、アメリカ合衆国の法律が適用されます。</p>',
    'sec.changes.title': '規約の変更',
    'sec.changes.body':
      '<div class="callout callout-info"><p>当社は、いつでも本規約を更新することがあります。すべての変更は公開時点で効力を生じます。更新後もサービスの利用を継続した場合、改訂された規約に同意したものとみなされます。</p></div>',
    'sec.confirm.title': '確認と承諾',
    'sec.confirm.body':
      '<div class="callout callout-good">'
      + '<p><strong>ゲームを利用することで、お客様は以下を確認したものとします。</strong></p>'
      + '<ul>'
      + '<li>本規約を読み、十分に理解したこと</li>'
      + '<li>そのゲームの対象年齢を満たしていること</li>'
      + '<li>上記のすべての条件に従うことに同意すること</li>'
      + '<li>本規約に従ってサービスを利用する全責任を負うこと</li>'
      + '</ul></div>',
    'contact.title': 'サポート・お問い合わせ',
    'contact.intro': 'ご不明な点やお困りのことがございましたら、お問い合わせください。',
    'contact.game': 'ゲーム',
    'contact.gamePage': 'ゲームページ',
    'contact.gamePageLink': 'ゲームページを見る',
    'contact.email': 'サポートメール',
    'contact.web': 'ウェブサイト',
    'footer.updated': '最終更新日：',
    'footer.version': 'バージョン',
    'footer.validity': '本書は公開時点から有効であり、すべてのユーザーに対して拘束力を持ちます。',
    'btn.home': 'ホームに戻る',
    'btn.privacy': 'プライバシーポリシー'
  }
}


// ==========================================
// Page CSS (theme tokens, layout, motion)
// ==========================================
function getTermsCSS() {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }

    /* ==========================================
       Hide scrollbars (scrolling stays functional)
       ========================================== */
    html { scrollbar-width: none; -ms-overflow-style: none; }
    html::-webkit-scrollbar { width: 0; height: 0; display: none; }

    :root {
      --brand: #6c63ff;
      --brand-2: #a78bfa;
      --ok: #4caf50;
      --warn: #ff9800;
      --err: #f44336;
      --radius: 18px;
      --maxw: 900px;

      --bg-1: #0b0e16;
      --bg-2: #141a2e;
      --surface: rgba(255,255,255,0.045);
      --surface-2: rgba(255,255,255,0.08);
      --border: rgba(255,255,255,0.10);
      --text: rgba(255,255,255,0.92);
      --text-dim: rgba(255,255,255,0.58);
      color-scheme: dark;
    }

    /* Auto theme: follow the OS only when no explicit choice is set. */
    @media (prefers-color-scheme: light) {
      :root:not([data-theme]) {
        --bg-1: #f4f6fb;
        --bg-2: #e7ecf7;
        --surface: rgba(255,255,255,0.70);
        --surface-2: #ffffff;
        --border: rgba(20,22,33,0.10);
        --text: rgba(22,24,33,0.92);
        --text-dim: rgba(22,24,33,0.56);
        color-scheme: light;
      }
    }

    /* Explicit page toggle always wins. */
    :root[data-theme="light"] {
      --bg-1: #f4f6fb;
      --bg-2: #e7ecf7;
      --surface: rgba(255,255,255,0.70);
      --surface-2: #ffffff;
      --border: rgba(20,22,33,0.10);
      --text: rgba(22,24,33,0.92);
      --text-dim: rgba(22,24,33,0.56);
      color-scheme: light;
    }
    :root[data-theme="dark"] {
      --bg-1: #0b0e16;
      --bg-2: #141a2e;
      --surface: rgba(255,255,255,0.045);
      --surface-2: rgba(255,255,255,0.08);
      --border: rgba(255,255,255,0.10);
      --text: rgba(255,255,255,0.92);
      --text-dim: rgba(255,255,255,0.58);
      color-scheme: dark;
    }

    body {
      font-family: 'Vazirmatn', 'Segoe UI', Tahoma, Arial, sans-serif;
      min-height: 100vh;
      padding: 24px 20px 56px;
      color: var(--text);
      line-height: 1.85;
      background:
        radial-gradient(1100px 520px at 78% -8%, color-mix(in srgb, var(--brand) 22%, transparent), transparent 60%),
        radial-gradient(900px 480px at 8% 6%, color-mix(in srgb, var(--brand-2) 16%, transparent), transparent 60%),
        linear-gradient(160deg, var(--bg-1), var(--bg-2));
      background-attachment: fixed;
    }

    .wrap { max-width: var(--maxw); margin: 0 auto; }

    /* The header spans the body's full width and puts the body's
       own gutter back inside itself, so its contents line up with
       the panels below. */
    .ac-nav { margin: -24px -20px 24px; padding-inline: 20px; }
    [id] { scroll-margin-top: 24px; }

    /* ---------- top bar (brand + controls) ---------- */
    .topbar {
      display: flex; align-items: center; justify-content: space-between;
      gap: 16px; flex-wrap: wrap; margin-block-end: 26px;
    }
    .brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
    .brand-logo {
      width: 52px; height: 52px; border-radius: 15px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      background: var(--surface-2); border: 1px solid var(--border);
      overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,0.18);
    }
    .brand-logo img { width: 100%; height: 100%; object-fit: contain; padding: 7px; display: block; }
    .brand-name { font-weight: 800; font-size: 1.05em; letter-spacing: 0.2px; line-height: 1.2; }
    .brand-sub  { font-size: 0.8em; color: var(--text-dim); }

    .controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .seg {
      display: inline-flex; padding: 3px; gap: 2px; border-radius: 12px;
      background: var(--surface); border: 1px solid var(--border);
    }
    .seg a {
      border: 0; cursor: pointer; padding: 7px 12px; border-radius: 9px;
      font: inherit; font-size: 0.82em; font-weight: 600; text-decoration: none;
      color: var(--text-dim); background: transparent;
      transition: color 0.18s ease, background 0.18s ease;
    }
    .seg a:hover { color: var(--text); }
    .seg a[aria-current="true"] {
      color: #fff;
      background: linear-gradient(135deg, var(--brand), var(--brand-2));
      box-shadow: 0 4px 14px color-mix(in srgb, var(--brand) 40%, transparent);
    }
    .icon-btn {
      width: 40px; height: 40px; border-radius: 11px; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center;
      color: var(--text); background: var(--surface); border: 1px solid var(--border);
      transition: transform 0.18s ease, background 0.18s ease;
    }
    .icon-btn:hover { transform: translateY(-2px); background: var(--surface-2); }
    .icon-btn:active { transform: scale(0.95); }
    .p-ic { width: 18px; height: 18px; }
    .seg a:focus-visible,
    .icon-btn:focus-visible,
    .action:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }

    /* ---------- hero ---------- */
    .hero { text-align: center; margin: 14px 0 30px; }
    .logo-lockup {
      display: flex; align-items: center; justify-content: center;
      gap: 26px; margin-block-end: 22px;
    }
    .logo-orb {
      width: 96px; height: 96px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      background: var(--surface-2); border: 1px solid var(--border);
      box-shadow: 0 14px 38px rgba(0,0,0,0.28); overflow: hidden;
      transition: transform 0.25s ease;
    }
    .logo-orb:hover { transform: translateY(-4px) scale(1.03); }
    /* Both marks fill their circle. Fitting the mark inside padding
       left the AmirCollider artwork - which carries its own opaque
       square background - sitting as a visible square inside a round
       frame, so the shape a reader saw was the square, not the
       circle. */
    .logo-orb img { width: 100%; height: 100%; object-fit: cover; padding: 0; display: block; }
    .logo-cell { text-align: center; }
    .logo-cell span { display: block; margin-block-start: 9px; font-size: 0.82em; font-weight: 700; color: var(--text-dim); }
    .logo-sep { width: 1px; height: 56px; background: linear-gradient(180deg, transparent, var(--border), transparent); }

    .hero h1 {
      font-size: clamp(1.9em, 5vw, 2.7em); font-weight: 800; letter-spacing: 0.3px;
      background: linear-gradient(135deg, var(--text), color-mix(in srgb, var(--brand) 55%, var(--text)));
      -webkit-background-clip: text; background-clip: text; color: transparent;
    }
    .pill {
      display: inline-flex; align-items: center; gap: 8px; margin-block-start: 14px;
      padding: 7px 16px; border-radius: 20px; font-size: 0.9em; font-weight: 700;
      color: color-mix(in srgb, var(--brand) 45%, var(--text));
      background: color-mix(in srgb, var(--brand) 14%, transparent);
      border: 1px solid color-mix(in srgb, var(--brand) 38%, transparent);
    }
    .pill .game-icon { font-size: 1.15em; line-height: 1; }

    /* ---------- terms sections ---------- */
    .policy { display: flex; flex-direction: column; gap: 18px; }
    .panel {
      padding: 24px 26px; border-radius: var(--radius);
      background: var(--surface); border: 1px solid var(--border);
      transition: border-color 0.2s ease, background 0.2s ease;
    }
    .panel:hover { border-color: color-mix(in srgb, var(--brand) 32%, var(--border)); }
    .panel > h2 {
      display: flex; align-items: center; gap: 12px;
      font-size: 1.3em; font-weight: 800; line-height: 1.3; margin-block-end: 12px;
    }
    .panel > h2 .sec-ic {
      width: 38px; height: 38px; border-radius: 11px; flex-shrink: 0;
      display: inline-flex; align-items: center; justify-content: center;
      color: color-mix(in srgb, var(--brand) 60%, var(--text));
      background: color-mix(in srgb, var(--brand) 14%, transparent);
      border: 1px solid color-mix(in srgb, var(--brand) 30%, transparent);
    }
    .panel > h2 .sec-ic svg { width: 20px; height: 20px; }

    .panel p { margin: 10px 0; color: var(--text); }
    .panel strong { color: color-mix(in srgb, var(--brand) 30%, var(--text)); font-weight: 700; }
    .panel em { font-style: normal; color: var(--text-dim); font-size: 0.92em; }

    .panel ul { list-style: none; margin: 12px 0; padding-inline-start: 24px; }
    .panel li { position: relative; margin: 9px 0; color: var(--text); }
    .panel li::before {
      content: ''; position: absolute; inset-inline-start: -20px; inset-block-start: 0.72em;
      width: 7px; height: 7px; border-radius: 50%;
      background: color-mix(in srgb, var(--brand) 65%, var(--text));
    }

    /* ---------- callouts ---------- */
    .callout {
      margin: 14px 0 4px; padding: 16px 18px; border-radius: 14px;
      background: var(--surface-2); border: 1px solid var(--border);
      border-inline-start: 3px solid var(--text-dim);
    }
    .callout p { margin: 0; }
    .callout ul { margin-block-start: 10px; }
    .callout-good { border-inline-start-color: var(--ok); background: color-mix(in srgb, var(--ok) 12%, var(--surface-2)); }
    .callout-warn { border-inline-start-color: var(--warn); background: color-mix(in srgb, var(--warn) 12%, var(--surface-2)); }
    .callout-info { border-inline-start-color: var(--brand); background: color-mix(in srgb, var(--brand) 12%, var(--surface-2)); }
    .callout-good strong { color: color-mix(in srgb, var(--ok) 40%, var(--text)); }
    .callout-warn strong { color: color-mix(in srgb, var(--warn) 42%, var(--text)); }

    /* ---------- contact ---------- */
    .contact-list { list-style: none; display: flex; flex-direction: column; gap: 4px; margin-block-start: 14px; }
    .contact-list li { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-block-end: 1px solid var(--border); }
    .contact-list li:last-child { border-block-end: 0; }
    .contact-list .c-ic { color: color-mix(in srgb, var(--brand) 55%, var(--text)); flex-shrink: 0; }
    .contact-list .c-key { color: var(--text-dim); font-weight: 600; }
    .contact-list .c-val { margin-inline-start: auto; font-weight: 600; text-align: end; }
    a { color: color-mix(in srgb, var(--brand) 55%, var(--text)); text-decoration: none; font-weight: 600; }
    a:hover { text-decoration: underline; }

    /* ---------- meta / footer ---------- */
    .meta {
      margin-block-start: 6px; padding: 22px 26px; border-radius: var(--radius);
      background: var(--surface); border: 1px solid var(--border); text-align: center; color: var(--text-dim);
    }
    .meta .m-row { font-size: 0.92em; }
    .meta .m-row b { color: var(--text); }
    .version-badge {
      display: inline-flex; align-items: center; gap: 6px; margin-block-start: 12px;
      padding: 6px 14px; border-radius: 20px; font-size: 0.82em; font-weight: 700;
      color: color-mix(in srgb, var(--brand) 45%, var(--text));
      background: color-mix(in srgb, var(--brand) 14%, transparent);
      border: 1px solid color-mix(in srgb, var(--brand) 34%, transparent);
    }
    .meta .m-note { margin-block-start: 12px; font-size: 0.85em; }

    /* ---------- actions ---------- */
    .actions { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; margin-block-start: 26px; }
    .action {
      display: inline-flex; align-items: center; gap: 9px;
      padding: 12px 22px; border-radius: 13px; text-decoration: none;
      font-weight: 700; font-size: 0.92em; color: #fff;
      background: linear-gradient(135deg, var(--brand), var(--brand-2));
      box-shadow: 0 8px 22px color-mix(in srgb, var(--brand) 34%, transparent);
      transition: transform 0.18s ease, box-shadow 0.18s ease;
    }
    .action:hover { transform: translateY(-2px); text-decoration: none; }
    .action svg { width: 18px; height: 18px; }
    .action.is-secondary {
      color: var(--text); background: var(--surface); border: 1px solid var(--border); box-shadow: none;
    }
    .action.is-secondary:hover { background: var(--surface-2); border-color: color-mix(in srgb, var(--brand) 40%, var(--border)); }
    .action.is-secondary svg { color: color-mix(in srgb, var(--brand) 55%, var(--text)); }

    @media (max-width: 560px) {
      .logo-lockup { gap: 16px; }
      .logo-orb { width: 78px; height: 78px; }
      .contact-list li { flex-wrap: wrap; }
      .contact-list .c-val { margin-inline-start: 0; text-align: start; }
      .seg a { padding: 6px 9px; }
    }

    /* ---------- motion (off when the user prefers reduced motion) ---------- */
    @media (prefers-reduced-motion: no-preference) {
      .topbar, .hero, .panel, .meta, .actions {
        animation: pRise 0.5s cubic-bezier(0.16,1,0.3,1) both;
      }
      .hero  { animation-delay: 0.04s; }
      .panel { animation-delay: 0.08s; }
      .meta  { animation-delay: 0.12s; }
      .logo-orb { animation: pFloat 4s ease-in-out infinite; }
      .logo-cell:last-child .logo-orb { animation-delay: 1.4s; }
    }
    @keyframes pRise  { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes pFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
  `
}


// ==========================================
// Partials
//
// The top bar and footer come from Core/SiteNav.js.
// ==========================================
function renderHero(lang, game, amirLogo, gameLogo) {
  const p = pack(lang)
  return `
    <div class="hero">
      <div class="logo-lockup">
        <div class="logo-cell">
          <span class="logo-orb">
            <img src="${escapeHtml(amirLogo)}" alt="AmirCollider"
                 onerror="this.onerror=null;this.src='${escapeHtml(CONFIG.AMIR_LOGO)}'">
          </span>
          <span>AmirCollider</span>
        </div>
        <div class="logo-sep" aria-hidden="true"></div>
        <div class="logo-cell">
          <span class="logo-orb is-game">
            <img src="${escapeHtml(gameLogo)}" alt=""
                 onerror="this.onerror=null;this.src='${escapeHtml(CONFIG.DEFAULT_GAME_LOGO)}'">
          </span>
          <span>${escapeHtml(CONTEXT.siteLevel ? p.brandAll : game.name)}</span>
        </div>
      </div>
      <h1>${escapeHtml(p.title)}</h1>
      ${CONTEXT.siteLevel ? '' : `<span class="pill"><span class="game-icon">${escapeHtml(game.icon)}</span>${escapeHtml(game.name)}</span>`}
    </div>`
}

// Every bullet list on this page is reordered shortest line first
// by sortListItems(). The content dictionaries above are therefore
// authored for meaning, not for shape - do not spend time hand-
// sorting them, and do not be surprised when the rendered order
// differs from the source order.
function renderSections(lang) {
  const p = pack(lang)
  return `
    <div class="policy">
      ${SECTION_ORDER.map(sec => `
      <section class="panel">
        <h2><span class="sec-ic">${icon(sec.ic, 'p-ic')}</span><span>${escapeHtml(p['sec.' + sec.key + '.title'])}</span></h2>
        <div>${sortListItems(p['sec.' + sec.key + '.body'])}</div>
      </section>`).join('')}
      ${renderContact(lang)}
    </div>`
}

function renderContact(lang) {
  const p = pack(lang)
  const game = CONTEXT.game
  const baseUrl = CONTEXT.baseUrl

  // The site-wide page is not about a game, so the two rows that
  // name one are left out rather than filled with the first game
  // in the registry - which is what made /privacy read as Neon
  // Katana's policy to anyone who reached it from the footer.
  //
  // The second row used to be the game's Myket listing. It points
  // at the game's own page here instead: the store a build came
  // from is one of several and changes, while the game's page on
  // this site is the address that is always right and always
  // carries the current download links.
  const gameRows = CONTEXT.siteLevel ? '' : `
          <li><span class="c-ic">${icon('user', 'p-ic')}</span><span class="c-key">${escapeHtml(p['contact.game'])}</span><span class="c-val">${escapeHtml(game.name)}</span></li>
          <li><span class="c-ic">${icon('external', 'p-ic')}</span><span class="c-key">${escapeHtml(p['contact.gamePage'])}</span><span class="c-val"><a href="${escapeHtml(baseUrl + localizedPath('/' + game.id, lang))}">${escapeHtml(p['contact.gamePageLink'])}</a></span></li>`

  return `
      <section class="panel">
        <h2><span class="sec-ic">${icon('mail', 'p-ic')}</span><span>${escapeHtml(p['contact.title'])}</span></h2>
        <p>${escapeHtml(p['contact.intro'])}</p>
        <ul class="contact-list">
          ${gameRows}
          <li><span class="c-ic">${icon('mail', 'p-ic')}</span><span class="c-key">${escapeHtml(p['contact.email'])}</span><span class="c-val"><a href="mailto:${escapeHtml(CONFIG.SUPPORT_EMAIL)}">${escapeHtml(CONFIG.SUPPORT_EMAIL)}</a></span></li>
          <li><span class="c-ic">${icon('globe', 'p-ic')}</span><span class="c-key">${escapeHtml(p['contact.web'])}</span><span class="c-val"><a href="${escapeHtml(baseUrl)}">${escapeHtml(baseUrl)}</a></span></li>
        </ul>
      </section>`
}

function renderMeta(lang) {
  const p = pack(lang)
  return `
    <div class="meta">
      <div class="m-row">${escapeHtml(p['footer.updated'])} <b><time datetime="${isoDate()}">${escapeHtml(localizedDate(lang))}</time></b></div>
      <span class="version-badge">${escapeHtml(p['footer.version'])} ${escapeHtml(CONFIG.VERSION)}</span>
      <div class="m-note">${escapeHtml(p['footer.validity'])}</div>
    </div>`
}

// The two sibling links used to append `?lang=` so a reader who had
// chosen a language kept it across the hop. localizedPath() carries
// it in the path instead, which is the same promise made at an
// address a search engine can index. These pages ARE indexed - they
// are the ones an OAuth review and a store listing link to - so the
// query form mattered here more than anywhere else it survived.
function renderActions(lang, gameId, baseUrl) {
  const p = pack(lang)
  // A visitor who arrived at the site-wide page is sent to the
  // site-wide sibling, not into a game they never chose.
  const sibling = CONTEXT.siteLevel ? '/privacy' : '/' + gameId + '/privacy'
  const home = escapeHtml(baseUrl + localizedPath('/', lang))
  const other = escapeHtml(baseUrl + localizedPath(sibling, lang))
  return `
    <div class="actions">
      <a class="action" href="${home}">${icon('home', 'p-ic')}<span>${escapeHtml(p['btn.home'])}</span></a>
      <a class="action is-secondary" href="${other}">${icon('lock', 'p-ic')}<span>${escapeHtml(p['btn.privacy'])}</span></a>
    </div>`
}


// ==========================================
// Render Context (shared with contact partial)
// ==========================================
let CONTEXT = { game: null, baseUrl: '', siteLevel: false }


// ==========================================
// Page Template
// ==========================================
function createTermsPage(game, gameId, baseUrl, lang, theme, { path = '/terms', games = [] } = {}) {
  const siteLevel = path === '/terms'
  CONTEXT = { game, baseUrl, siteLevel }

  const amirLogo = CONFIG.AMIR_LOGO
  // On the site-wide page the second mark is the neutral default,
  // never the first game in the registry.
  const gameLogo = siteLevel ? CONFIG.DEFAULT_GAME_LOGO : (game.logo || CONFIG.DEFAULT_GAME_LOGO)
  const resolved = resolveLang(lang)
  const dir = dirFor(resolved)
  const themeAttr = theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : ''
  const p = pack(resolved)
  const site = NAV_I18N[resolved]

  const perGame = !siteLevel
  const title = perGame ? `${p.meta} — ${game.name} | AmirCollider` : `${p.meta} — AmirCollider`
  const description = String(p.metaDesc || '')
    .replace('{subject}', perGame ? game.name : 'AmirCollider')

  const keywords = keywordList(
    p.meta,
    perGame ? [game.name, ...(game.altNames || [])] : [],
    'terms of service',
    'in-app purchases',
    'refunds'
  )

  const trail = perGame
    ? [
        { href: '/', label: site.home },
        { href: `/${game.id}`, label: game.name },
        { href: path, label: site.terms }
      ]
    : [
        { href: '/', label: site.home },
        { href: '/terms', label: site.terms }
      ]

  return `<!DOCTYPE html>
<html dir="${dir}" lang="${resolved}"${themeAttr}>
<head>
  ${getPageHead({ title, amirLogo, description })}
  ${seoHead({
    path,
    title,
    description,
    lang: resolved,
    keywords,
    graph: [breadcrumbLd(trail, resolved)]
  })}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap"></noscript>
  ${themeBootScript()}
  <style>${siteNavCss()}${getTermsCSS()}</style>
</head>
<body>
  ${siteHeader({ lang: resolved })}
  <div class="wrap">
    ${siteBreadcrumb({ lang: resolved, trail })}
    <main id="main">
      ${renderHero(resolved, game, amirLogo, gameLogo)}
      ${renderSections(resolved)}
      ${renderMeta(resolved)}
      ${renderActions(resolved, gameId, baseUrl)}
    </main>
    ${siteFooter({ lang: resolved, games })}
  </div>
  ${siteBackToTop({ lang })}
  ${siteChromeScript()}
</body>
</html>`
}
