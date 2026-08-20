// ==========================================
// Pages/Privacy.js
// Privacy Policy Page Handler
// AmirCollider Games - Worker Proxy


// ==========================================
// Responsibilities
//   - Render the per-game privacy policy with the same chrome,
//     theme tokens and motion language as the rest of the site
//     (dashboard / leaderboard / health / ping / metrics).
//
// Integration contract (do not break without updating Worker.js)
//   - Public entry: handlePrivacyPolicyWithGame(url, request, gameId,
//                                               requestId, GAMES)
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
// Answers at two addresses: /privacy, which is the site-wide policy
// URL that Google's OAuth consent screen and Play Console are given,
// and /:gameId/privacy, which is what shipped builds link to. The
// canonical tag is whichever one was actually requested, so the two
// do not compete for the same words.
// ==========================================
export async function handlePrivacyPolicyWithGame(url, request, gameId, requestId, GAMES) {
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
    createPrivacyPage(game, game.id, url.origin, lang, theme, {
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
// visitor the policy had last been revised on the day they happened
// to open it: on 12 August it said 12 August, on the 13th it said
// the 13th, and not one word of the document had changed in between.
// That is worse than printing no date at all. The date is the only
// handle a reader has on "has this changed since I agreed to it?",
// and the Google OAuth reviewer, the Play listing and anyone who
// keeps a copy of what they consented to all read it that way.
//
// So the date is data now, and only a human moves it. Bump it in the
// same commit that changes the wording of THIS page. Terms.js keeps
// its own copy on purpose: the two documents are revised
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
  clipboard: '<rect x="8" y="3" width="8" height="4" rx="1"/><path d="M9 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3"/>',
  chart: '<line x1="6" y1="20" x2="6" y2="12"/><line x1="12" y1="20" x2="12" y2="5"/><line x1="18" y1="20" x2="18" y2="14"/>',
  shield: '<path d="M12 3l8 3v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6z"/>',
  lock: '<rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  cookie: '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="14" cy="14" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="9" r="1" fill="currentColor" stroke="none"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/>',
  heart: '<path d="M12 20s-7-4.5-9.5-9A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 9.5 5C19 15.5 12 20 12 20z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 4v5h-5"/>',
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
// `googledata` is not decoration. Google's OAuth verification
// reviews this page against the API Services User Data Policy and
// looks for an explicit statement of which scopes are requested,
// what is done with what they return, and the Limited Use wording
// verbatim. A policy missing that section is a policy that fails
// review, which is why it survives even though it repeats a little
// of `collect` - it is written for a reviewer, not for a player,
// and its opening line says so.
//
// The standalone "account and data deletion" section that used to
// sit between `sharing` and `cookies` was removed at the owner's
// request. The deletion route itself did not go anywhere: it is a
// line in `rights` and a real button on /:gameId/account. Google's
// review also looks for a deletion route by name, so if a review
// ever comes back asking for one, the shortest fix is to say more
// in `rights` rather than to bring the whole section back.
const SECTION_ORDER = [
  { key: 'intro',      ic: 'doc' },
  { key: 'collect',    ic: 'clipboard' },
  { key: 'googledata', ic: 'shield' },
  { key: 'usage',      ic: 'chart' },
  { key: 'security',   ic: 'shield' },
  { key: 'sharing',    ic: 'lock' },
  { key: 'cookies',    ic: 'cookie' },
  { key: 'rights',     ic: 'user' },
  { key: 'children',   ic: 'heart' },
  { key: 'intl',       ic: 'globe' },
  { key: 'changes',    ic: 'refresh' }
]

// ==========================================
// Content Dictionary (single source of truth)
// Keys ending in *.body hold trusted authored HTML.
// ==========================================
const I18N = {
  fa: {
    locale: 'fa-IR',
    langName: 'فارسی',
    meta: 'سیاست حفظ حریم خصوصی',

    // The meta description, with {subject} standing in for either
    // a game's name or the site's. It used to be the page's title
    // said twice - "سیاست حفظ حریم خصوصی — Neon Katana" - which is
    // a label, not a description, and left every policy page on
    // this Worker looking like the same page to a search engine.
    // This one says what the policy actually covers, which is also
    // what a Google OAuth reviewer is looking for.
    metaDesc: 'سیاست حریم خصوصی {subject}: چه داده‌هایی جمع می‌شود، ورود با گوگل و scopeهای openid و email و profile، ذخیره‌ی ابری، و راه حذف حساب.',
    title: 'سیاست حفظ حریم خصوصی',
    themeToDark: 'حالت تاریک',
    themeToLight: 'حالت روشن',
    brandSub: 'سیاست حریم خصوصی',
    brandAll: 'همه‌ی بازی‌ها و ابزارها',
    'sec.intro.title': 'مقدمه',
    'sec.intro.body':
      '<p>این سند توضیح می‌دهد <strong>AmirCollider</strong> چه اطلاعاتی از شما دریافت می‌کند و آن‌ها را برای چه کاری به کار می‌برد.</p>',
    'sec.collect.title': 'اطلاعات جمع‌آوری شده از حساب Gmail',
    'sec.collect.body':
      '<p>این بخش فقط درباره‌ی بازی‌هایی است که سیستم ورود دارند و با «ورود با گوگل» کار می‌کنند. بازی‌هایی که سیستم ورود ندارند، هیچ اطلاعاتی از حساب گوگل شما دریافت نمی‌کنند.</p>'
      + '<p>هنگام ورود، این موارد را از حساب گوگل شما دریافت می‌کنیم:</p>'
      + '<ul>'
      + '<li><strong>نام:</strong> نام نمایشی حساب گوگل شما</li>'
      + '<li><strong>ایمیل:</strong> آدرس ایمیل حساب گوگل شما</li>'
      + '<li><strong>عکس پروفایل:</strong> تصویر حساب گوگل شما</li>'
      + '</ul>',
    'sec.googledata.title': 'داده‌های حساب گوگل و سیاست Google API Services',
    'sec.googledata.body':
      '<p>این بخش مخصوص الزامات خود گوگل است و برای بررسی سرویس در Google API Services نوشته شده. دامنه‌های دسترسی درخواستی همان‌هایی هستند که در بخش بالا آمد: <code>openid</code>، <code>email</code> و <code>profile</code>.</p>'
      + '<div class="callout callout-good">'
      + '<p><strong>Limited Use:</strong> استفاده و انتقال اطلاعات دریافت‌شده از Google APIs توسط این سرویس، از '
      + '<a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener">Google API Services User Data Policy</a> '
      + 'از جمله الزامات Limited Use پیروی می‌کند.</p>'
      + '</div>'
      + '<ul>'
      + '<li>این داده‌ها به شخص ثالث منتقل نمی‌شوند.</li>'
      + '<li>این داده‌ها برای تبلیغات یا تبلیغات هدفمند به کار نمی‌روند.</li>'
      + '<li>این داده‌ها برای آموزش مدل‌های هوش مصنوعی یا یادگیری ماشین استفاده نمی‌شوند.</li>'
      + '<li>ما به محتوای Gmail، Drive، مخاطبین یا تقویم شما دسترسی نداریم و درخواست هم نمی‌کنیم.</li>'
      + '<li>هیچ انسانی این داده‌ها را نمی‌خواند، مگر با اجازه‌ی شما، برای امنیت، یا در صورت الزام قانونی.</li>'
      + '</ul>',
    'sec.usage.title': 'نحوه استفاده از اطلاعات',
    'sec.usage.body':
      '<p>از این اطلاعات برای موارد زیر استفاده می‌شود:</p>'
      + '<ul>'
      + '<li>ذخیره پیشرفت و امتیازات بازی</li>'
      + '<li>نمایش امتیاز شما در جدول برترین‌ها</li>'
      + '<li>احراز هویت و مدیریت حساب کاربری</li>'
      + '</ul>',
    'sec.security.title': 'امنیت اطلاعات',
    'sec.security.body':
      '<p>ارتباط با سرور روی HTTPS/TLS رمزگذاری می‌شود و داده‌ها در پایگاه داده‌ی Cloudflare D1 نگهداری می‌شوند.</p>'
      + '<p>هیچ سرویسی روی اینترنت کاملاً امن نیست و امنیت مطلق داده‌ها تضمین نمی‌شود.</p>',
    'sec.sharing.title': 'عدم اشتراک‌گذاری اطلاعات',
    'sec.sharing.body':
      '<div class="callout callout-warn">'
      + '<p>ما اطلاعات شما را با هیچ شخص ثالثی به اشتراک نمی‌گذاریم. تنها استثنا، درخواست رسمی و قانونی مقامات دولتی ایالات متحده‌ی آمریکاست.</p>'
      + '<p>اطلاعات شما به مقامات دولتی هیچ کشور دیگری تحویل داده نمی‌شود.</p>'
      + '</div>',
    'sec.cookies.title': 'کوکی‌ها',
    'sec.cookies.body':
      '<p>کوکی‌ها فقط برای نگه داشتن وضعیت ورود شما و به خاطر سپردن زبان و حالت نمایش سایت به کار می‌روند. هیچ اطلاعات حساسی در آن‌ها ذخیره نمی‌شود و هر زمان بخواهید می‌توانید از مرورگر خودتان پاکشان کنید.</p>',
    'sec.rights.title': 'حقوق شما',
    'sec.rights.body':
      '<p>هر زمان بخواهید می‌توانید:</p>'
      + '<ul>'
      + '<li><strong>اصلاح:</strong> اطلاعات نادرست را اصلاح کنید</li>'
      + '<li><strong>حذف:</strong> حساب خود را به‌طور کامل حذف کنید</li>'
      + '<li><strong>دسترسی:</strong> اطلاعاتی که از شما داریم را ببینید</li>'
      + '</ul>',
    'sec.children.title': 'کودکان',
    'sec.children.body':
      '<p>هر بازی رده‌ی سنی خودش را دارد و همان چیزی است که در صفحه‌ی آن بازی و در جایی که بازی از آن دریافت شده اعلام می‌شود. حسابی که با محدودیت سنی آن بازی مغایرت داشته باشد حذف می‌شود.</p>',
    'sec.intl.title': 'انتقال بین‌المللی داده',
    'sec.intl.body':
      '<p>این سرویس روی زیرساخت Cloudflare اجرا می‌شود، بنابراین اطلاعات شما ممکن است روی سرورهایی در کشورهای مختلف ذخیره یا پردازش شود.</p>',
    'sec.changes.title': 'تغییرات در سیاست',
    'sec.changes.body':
      '<div class="callout callout-info"><p>ممکن است این سیاست به‌روزرسانی شود. نسخه‌ی معتبر همیشه همین صفحه است و ادامه‌ی استفاده از سرویس پس از هر به‌روزرسانی به‌منزله‌ی پذیرش آن است.</p></div>',
    'contact.title': 'تماس با ما',
    'contact.intro': 'در صورت هرگونه سوال درباره این سیاست، با ما تماس بگیرید:',
    'contact.game': 'بازی',
    'contact.gamePage': 'صفحه بازی',
    'contact.gamePageLink': 'مشاهده صفحه بازی',
    'contact.email': 'ایمیل پشتیبانی',
    'contact.web': 'وب‌سایت',
    'footer.updated': 'آخرین به‌روزرسانی:',
    'footer.version': 'نسخه',
    'footer.validity': 'این سند از لحظه انتشار معتبر است و برای همه کاربران لازم‌الاجرا می‌باشد.',
    'btn.home': 'بازگشت به صفحه اصلی',
    'btn.terms': 'شرایط و قوانین'
  },

  en: {
    locale: 'en-US',
    langName: 'English',
    meta: 'Privacy Policy',
    metaDesc: 'The privacy policy for {subject}: what data is collected, Google sign-in and the openid, email and profile scopes, and how to delete your account.',
    title: 'Privacy Policy',
    themeToDark: 'Dark mode',
    themeToLight: 'Light mode',
    brandSub: 'Privacy policy',
    brandAll: 'All games & tools',
    'sec.intro.title': 'Introduction',
    'sec.intro.body':
      '<p>This document explains what information <strong>AmirCollider</strong> receives from you and what it is used for.</p>',
    'sec.collect.title': 'Information Collected from Your Gmail Account',
    'sec.collect.body':
      '<p>This section covers only the games that have a sign-in system and use "Sign in with Google". Games without a sign-in system receive nothing from your Google account.</p>'
      + '<p>When you sign in, we receive the following from your Google account:</p>'
      + '<ul>'
      + '<li><strong>Name:</strong> your Google account display name</li>'
      + '<li><strong>Email:</strong> your Google account email address</li>'
      + '<li><strong>Profile photo:</strong> your Google account picture</li>'
      + '</ul>',
    'sec.googledata.title': 'Google Account Data and the Google API Services Policy',
    'sec.googledata.body':
      '<p>This section exists for Google\'s own requirements and is written for review under Google API Services. The scopes requested are the ones named above: <code>openid</code>, <code>email</code> and <code>profile</code>.</p>'
      + '<div class="callout callout-good">'
      + '<p><strong>Limited Use:</strong> This application\'s use and transfer of information received from Google APIs adheres to the '
      + '<a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener">Google API Services User Data Policy</a>, '
      + 'including the Limited Use requirements.</p>'
      + '</div>'
      + '<ul>'
      + '<li>This data is not transferred to third parties.</li>'
      + '<li>This data is not used for advertising or ad targeting.</li>'
      + '<li>This data is not used to train artificial intelligence or machine learning models.</li>'
      + '<li>We do not request or receive access to your Gmail, Drive, Contacts or Calendar content.</li>'
      + '<li>No human reads this data, except with your permission, for security purposes, or where the law requires it.</li>'
      + '</ul>',
    'sec.usage.title': 'How We Use Your Information',
    'sec.usage.body':
      '<p>This information is used for:</p>'
      + '<ul>'
      + '<li>Saving your game progress and scores</li>'
      + '<li>Showing your score on the leaderboard</li>'
      + '<li>Authentication and account management</li>'
      + '</ul>',
    'sec.security.title': 'Data Security',
    'sec.security.body':
      '<p>Traffic to the server is encrypted with HTTPS/TLS, and data is kept in a Cloudflare D1 database.</p>'
      + '<p>No service on the internet is completely secure, and absolute security cannot be guaranteed.</p>',
    'sec.sharing.title': 'No Data Sharing',
    'sec.sharing.body':
      '<div class="callout callout-warn">'
      + '<p>We do not share your information with any third party. The only exception is a formal, lawful request from United States government authorities.</p>'
      + '<p>Your information is not handed over to the government authorities of any other country.</p>'
      + '</div>',
    'sec.cookies.title': 'Cookies',
    'sec.cookies.body':
      '<p>Cookies are used only to keep you signed in and to remember your language and theme. Nothing sensitive is stored in them, and you can clear them from your browser whenever you like.</p>',
    'sec.rights.title': 'Your Rights',
    'sec.rights.body':
      '<p>Whenever you like, you can:</p>'
      + '<ul>'
      + '<li><strong>Access:</strong> see the information we hold about you</li>'
      + '<li><strong>Correction:</strong> correct anything that is inaccurate</li>'
      + '<li><strong>Deletion:</strong> delete your account entirely</li>'
      + '</ul>',
    'sec.children.title': 'Children',
    'sec.children.body':
      '<p>Every game has its own age rating, stated on that game\'s page and wherever the game was obtained from. An account that does not match that game\'s age limit is deleted.</p>',
    'sec.intl.title': 'International Data Transfer',
    'sec.intl.body':
      '<p>This service runs on Cloudflare infrastructure, so your data may be stored or processed on servers in different countries.</p>',
    'sec.changes.title': 'Policy Changes',
    'sec.changes.body':
      '<div class="callout callout-info"><p>This policy may be updated. The version on this page is always the current one, and continued use of the service after an update means you accept it.</p></div>',
    'contact.title': 'Contact Us',
    'contact.intro': 'For any questions about this policy, please reach out to us:',
    'contact.game': 'Game',
    'contact.gamePage': 'Game page',
    'contact.gamePageLink': 'View game page',
    'contact.email': 'Support email',
    'contact.web': 'Website',
    'footer.updated': 'Last updated:',
    'footer.version': 'Version',
    'footer.validity': 'This document is valid from the moment of publication and is binding on all users.',
    'btn.home': 'Back to Home',
    'btn.terms': 'Terms of Service'
  },

  ja: {
    locale: 'ja-JP',
    langName: '日本語',
    meta: 'プライバシーポリシー',
    metaDesc: '{subject} のプライバシーポリシー。収集するデータ、Google サインインの各スコープ、クラウドセーブ、アカウントとデータの削除方法について。',
    title: 'プライバシーポリシー',
    themeToDark: 'ダークモード',
    themeToLight: 'ライトモード',
    brandSub: 'プライバシーポリシー',
    brandAll: 'すべてのゲームとツール',
    'sec.intro.title': 'はじめに',
    'sec.intro.body':
      '<p>本ポリシーでは、<strong>AmirCollider</strong> がお客様から受け取る情報と、その用途について説明します。</p>',
    'sec.collect.title': 'Gmail アカウントから収集する情報',
    'sec.collect.body':
      '<p>本セクションは、ログイン機能があり「Google でログイン」を使用するゲームにのみ該当します。ログイン機能のないゲームでは、Google アカウントから情報を取得することはありません。</p>'
      + '<p>ログイン時、Google アカウントから以下を受け取ります。</p>'
      + '<ul>'
      + '<li><strong>お名前：</strong>Google アカウントの表示名</li>'
      + '<li><strong>メール：</strong>Google アカウントのメールアドレス</li>'
      + '<li><strong>プロフィール写真：</strong>Google アカウントの画像</li>'
      + '</ul>',
    'sec.googledata.title': 'Google アカウントデータと Google API サービスポリシー',
    'sec.googledata.body':
      '<p>本セクションは Google 自身の要件のためのもので、Google API サービスの審査に向けて記載しています。要求するスコープは上記と同じく <code>openid</code>、<code>email</code>、<code>profile</code> です。</p>'
      + '<div class="callout callout-good">'
      + '<p><strong>限定的な使用：</strong>本アプリケーションによる Google API から受け取った情報の使用および転送は、'
      + '<a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener">Google API サービスのユーザーデータに関するポリシー</a>'
      + '（限定的な使用の要件を含む）に準拠します。</p>'
      + '</div>'
      + '<ul>'
      + '<li>このデータを第三者に移転することはありません。</li>'
      + '<li>このデータを広告や広告ターゲティングに使用することはありません。</li>'
      + '<li>このデータを AI・機械学習モデルの学習に使用することはありません。</li>'
      + '<li>Gmail、Drive、連絡先、カレンダーの内容へのアクセスは要求も取得もしていません。</li>'
      + '<li>お客様の許可、セキュリティ上の必要、法令による要求がある場合を除き、人がこのデータを読むことはありません。</li>'
      + '</ul>',
    'sec.usage.title': '情報の利用方法',
    'sec.usage.body':
      '<p>この情報は以下の目的で利用します。</p>'
      + '<ul>'
      + '<li>ゲームの進行状況とスコアの保存</li>'
      + '<li>リーダーボードへのスコア表示</li>'
      + '<li>認証およびアカウント管理</li>'
      + '</ul>',
    'sec.security.title': 'データセキュリティ',
    'sec.security.body':
      '<p>サーバーとの通信は HTTPS/TLS で暗号化され、データは Cloudflare D1 データベースに保管されます。</p>'
      + '<p>インターネット上のサービスに完全な安全はなく、絶対的な安全性を保証するものではありません。</p>',
    'sec.sharing.title': 'データの非共有',
    'sec.sharing.body':
      '<div class="callout callout-warn">'
      + '<p>当社はお客様の情報をいかなる第三者とも共有しません。唯一の例外は、アメリカ合衆国政府当局からの正式かつ適法な要請です。</p>'
      + '<p>他のいかなる国の政府当局にも、お客様の情報を引き渡すことはありません。</p>'
      + '</div>',
    'sec.cookies.title': 'Cookie',
    'sec.cookies.body':
      '<p>Cookie は、ログイン状態の維持と、言語および表示テーマの記憶のためだけに使用します。機密性の高い情報は保存されず、いつでもブラウザから削除できます。</p>',
    'sec.rights.title': 'お客様の権利',
    'sec.rights.body':
      '<p>お客様はいつでも次のことができます。</p>'
      + '<ul>'
      + '<li><strong>訂正：</strong>誤った情報を訂正する</li>'
      + '<li><strong>削除：</strong>アカウントを完全に削除する</li>'
      + '<li><strong>アクセス：</strong>当社が保有する情報を確認する</li>'
      + '</ul>',
    'sec.children.title': '子どもについて',
    'sec.children.body':
      '<p>各ゲームには対象年齢があり、そのゲームのページおよび入手元に表示されています。そのゲームの年齢制限に合致しないアカウントは削除されます。</p>',
    'sec.intl.title': '国際的なデータ移転',
    'sec.intl.body':
      '<p>本サービスは Cloudflare の基盤上で動作するため、お客様のデータはさまざまな国のサーバーに保管または処理される場合があります。</p>',
    'sec.changes.title': 'ポリシーの変更',
    'sec.changes.body':
      '<div class="callout callout-info"><p>本ポリシーは更新されることがあります。常にこのページの内容が有効であり、更新後も継続してご利用された場合は同意したものとみなされます。</p></div>',
    'contact.title': 'お問い合わせ',
    'contact.intro': '本ポリシーに関するご質問は、以下までご連絡ください。',
    'contact.game': 'ゲーム',
    'contact.gamePage': 'ゲームページ',
    'contact.gamePageLink': 'ゲームページを見る',
    'contact.email': 'サポートメール',
    'contact.web': 'ウェブサイト',
    'footer.updated': '最終更新：',
    'footer.version': 'バージョン',
    'footer.validity': '本ポリシーは公開時点から有効であり、すべての利用者に適用されます。',
    'btn.home': 'ホームに戻る',
    'btn.terms': '利用規約'
  }
}


// ==========================================
// Stylesheet
// Theme via tokens; RTL/LTR via logical properties;
// motion gated behind prefers-reduced-motion.
// ==========================================
function getPrivacyCSS() {
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

    /* ---------- policy sections ---------- */
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
// The top bar and footer come from Core/SiteNav.js, so this page
// looks like - and navigates like - every other page on the site.
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
  const sibling = CONTEXT.siteLevel ? '/terms' : '/' + gameId + '/terms'
  const home = escapeHtml(baseUrl + localizedPath('/', lang))
  const other = escapeHtml(baseUrl + localizedPath(sibling, lang))
  return `
    <div class="actions">
      <a class="action" href="${home}">${icon('home', 'p-ic')}<span>${escapeHtml(p['btn.home'])}</span></a>
      <a class="action is-secondary" href="${other}">${icon('doc', 'p-ic')}<span>${escapeHtml(p['btn.terms'])}</span></a>
    </div>`
}


// ==========================================
// Render Context (shared with contact partial)
// ==========================================
let CONTEXT = { game: null, baseUrl: '', siteLevel: false }


// ==========================================
// Page Template
// ==========================================
function createPrivacyPage(game, gameId, baseUrl, lang, theme, { path = '/privacy', games = [] } = {}) {
  const siteLevel = path === '/privacy'
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
    'privacy policy',
    'Google sign-in',
    'openid email profile'
  )

  const trail = perGame
    ? [
        { href: '/', label: site.home },
        { href: `/${game.id}`, label: game.name },
        { href: path, label: site.privacy }
      ]
    : [
        { href: '/', label: site.home },
        { href: '/privacy', label: site.privacy }
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
  <style>${siteNavCss()}${getPrivacyCSS()}</style>
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
