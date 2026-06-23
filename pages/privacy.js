// ==========================================
// pages/privacy.js
// Privacy Policy Page Handler
// AmirCollider Games - Worker Proxy
// ==========================================
//
// Responsibilities
//   - Render the per-game privacy policy with the same chrome,
//     theme tokens and motion language as the rest of the site
//     (dashboard / leaderboard / health / ping / metrics).
//
// Integration contract (do not break without updating worker.js)
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

import { CONFIG } from '../config.js'
import { getPageHead } from '../shared-styles.js'
import { validateGameId, createHtmlResponse, createErrorPage } from '../utils.js'

const DEFAULT_LANG = 'fa'
const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

// ==========================================
// Route Handler
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

  const headers = {}
  const requestedLang = url && url.searchParams ? url.searchParams.get('lang') : null
  if (requestedLang && I18N[requestedLang]) {
    headers['Set-Cookie'] = `lang=${requestedLang}; Path=/; Max-Age=${LANG_COOKIE_MAX_AGE}; SameSite=Lax`
  }

  return createHtmlResponse(createPrivacyPage(game, gameId, url.origin, lang, theme), 200, headers)
}

// ==========================================
// Request Helpers (language & theme resolution)
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

// Priority: explicit ?lang= -> stored cookie -> browser preference -> default.
function resolveRequestLang(url, request, cookies) {
  const fromQuery = url && url.searchParams ? url.searchParams.get('lang') : null
  if (fromQuery && I18N[fromQuery]) return fromQuery
  if (cookies.lang && I18N[cookies.lang]) return cookies.lang
  return langFromAcceptHeader(request) || DEFAULT_LANG
}

// Returns 'light' | 'dark' | null (null = auto / follow OS).
function resolveRequestTheme(cookies) {
  return cookies.theme === 'light' || cookies.theme === 'dark' ? cookies.theme : null
}

// ==========================================
// i18n Helpers
// ==========================================
function resolveLang(lang) {
  return I18N[lang] ? lang : DEFAULT_LANG
}

function pack(lang) {
  return I18N[resolveLang(lang)]
}

function dirFor(lang) {
  return resolveLang(lang) === 'fa' ? 'rtl' : 'ltr'
}

// ==========================================
// Output-safety Helper
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
// Date Helpers (CF Workers safe, no Intl locale dependency)
// ==========================================
function getJalaliDate(date = new Date()) {
  const gy = date.getFullYear()
  const gm = date.getMonth() + 1
  const gd = date.getDate()

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

function getEnglishDate(date = new Date()) {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function getJapaneseDate(date = new Date()) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

function localizedDate(lang, date = new Date()) {
  if (lang === 'en') return getEnglishDate(date)
  if (lang === 'ja') return getJapaneseDate(date)
  return getJalaliDate(date)
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
const SECTION_ORDER = [
  { key: 'intro',    ic: 'doc' },
  { key: 'collect',  ic: 'clipboard' },
  { key: 'usage',    ic: 'chart' },
  { key: 'security', ic: 'shield' },
  { key: 'sharing',  ic: 'lock' },
  { key: 'cookies',  ic: 'cookie' },
  { key: 'rights',   ic: 'user' },
  { key: 'children', ic: 'heart' },
  { key: 'intl',     ic: 'globe' },
  { key: 'changes',  ic: 'refresh' }
]

const LANGUAGES = [
  { code: 'fa', label: 'فارسی' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' }
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
    title: 'سیاست حفظ حریم خصوصی',
    themeToDark: 'حالت تاریک',
    themeToLight: 'حالت روشن',
    brandSub: 'سیاست حریم خصوصی',
    'sec.intro.title': 'مقدمه',
    'sec.intro.body':
      '<p>ما در <strong>AmirCollider Games</strong> به حریم خصوصی شما اهمیت می‌دهیم. این سند توضیح می‌دهد چه اطلاعاتی از شما جمع‌آوری می‌شود و چگونه از آن استفاده می‌کنیم.</p>'
      + '<div class="callout callout-good"><p><strong>تعهد ما:</strong> ما هرگز اطلاعات شخصی شما را بدون رضایت شما به اشخاص ثالث نمی‌فروشیم.</p></div>',
    'sec.collect.title': 'اطلاعات جمع‌آوری شده',
    'sec.collect.body':
      '<p>هنگام استفاده از سرویس احراز هویت ما، اطلاعات زیر را دریافت می‌کنیم:</p>'
      + '<ul>'
      + '<li><strong>آدرس ایمیل:</strong> آدرس ایمیل گوگل شما</li>'
      + '<li><strong>عکس پروفایل:</strong> عکس پروفایل گوگل شما</li>'
      + '<li><strong>نام:</strong> نامی که در حساب گوگل شما ثبت شده است</li>'
      + '<li><strong>آمار بازی:</strong> امتیازات، سطح و دستاوردهای شما</li>'
      + '</ul>',
    'sec.usage.title': 'نحوه استفاده از اطلاعات',
    'sec.usage.body':
      '<p>ما از اطلاعات شما برای موارد زیر استفاده می‌کنیم:</p>'
      + '<ul>'
      + '<li>تحلیل و بهبود خدمات</li>'
      + '<li>نمایش امتیاز شما در جدول برترین‌ها</li>'
      + '<li>ذخیره پیشرفت و امتیازات بازی</li>'
      + '<li>بهبود تجربه کاربری و عملکرد بازی</li>'
      + '<li>احراز هویت و مدیریت حساب کاربری</li>'
      + '<li>ارسال اطلاعیه‌های مهم در صورت نیاز</li>'
      + '</ul>',
    'sec.security.title': 'امنیت اطلاعات',
    'sec.security.body':
      '<p>ما از پروتکل‌های امنیتی استاندارد برای محافظت از اطلاعات شما استفاده می‌کنیم:</p>'
      + '<ul>'
      + '<li><strong>پایش مستمر:</strong> نظارت ۲۴ ساعته بر امنیت سیستم</li>'
      + '<li><strong>محدودیت دسترسی:</strong> تنها کارکنان مجاز به داده‌ها دسترسی دارند</li>'
      + '<li><strong>رمزگذاری اتصالات:</strong> انتقال تمام داده‌ها با پروتکل HTTPS/TLS رمزگذاری می‌شود</li>'
      + '<li><strong>پایگاه داده Cloudflare D1:</strong> ذخیره‌سازی امن داده‌ها با پایگاه داده Cloudflare D1</li>'
      + '</ul>',
    'sec.sharing.title': 'عدم اشتراک‌گذاری اطلاعات',
    'sec.sharing.body':
      '<div class="callout callout-warn">'
      + '<p><strong>مهم:</strong> ما هرگز اطلاعات شخصی شما را به اشخاص ثالث نمی‌فروشیم یا به اشتراک نمی‌گذاریم. تنها در موارد محدود زیر ممکن است اطلاعاتی افشا شود:</p>'
      + '<ul>'
      + '<li><strong>الزام قانونی:</strong> در صورتی که قانون یا یک دستور قانونی معتبر آن را ایجاب کند</li>'
      + '<li><strong>جلوگیری از سوءاستفاده:</strong> برای حفاظت از امنیت و یکپارچگی خدمات</li>'
      + '<li><strong>با رضایت شما:</strong> هنگامی که خودتان به‌صراحت اجازه دهید</li>'
      + '</ul>'
      + '</div>',
    'sec.cookies.title': 'کوکی‌ها و ذخیره‌سازی محلی',
    'sec.cookies.body':
      '<p>ما از کوکی‌ها برای حفظ نشست شما استفاده می‌کنیم. این کوکی‌ها:</p>'
      + '<ul>'
      + '<li>به مدت ۷ روز معتبر هستند</li>'
      + '<li>هر زمان که بخواهید قابل حذف هستند</li>'
      + '<li>هیچ اطلاعات حساسی ذخیره نمی‌کنند</li>'
      + '<li>تنها برای احراز هویت استفاده می‌شوند</li>'
      + '</ul>',
    'sec.rights.title': 'حقوق شما',
    'sec.rights.body':
      '<p>شما حق دارید:</p>'
      + '<ul>'
      + '<li><strong>حذف:</strong> حساب خود را به‌طور کامل حذف کنید</li>'
      + '<li><strong>انصراف:</strong> هر زمان از خدمات ما انصراف دهید</li>'
      + '<li><strong>انتقال داده:</strong> یک نسخه از داده‌های خود را دریافت کنید</li>'
      + '<li><strong>اصلاح:</strong> اطلاعات نادرست را اصلاح کنید</li>'
      + '<li><strong>محدودیت:</strong> پردازش داده‌های خود را محدود کنید</li>'
      + '<li><strong>دسترسی:</strong> به تمام اطلاعاتی که از شما داریم دسترسی داشته باشید</li>'
      + '</ul>',
    'sec.children.title': 'کودکان',
    'sec.children.body':
      '<p>بازی ما برای کاربران بالای <strong>۵ سال</strong> طراحی شده است. ما عمداً اطلاعات کودکان زیر ۵ سال را جمع‌آوری نمی‌کنیم. اگر متوجه شویم کودکی زیر ۵ سال ثبت‌نام کرده است، حساب او را فوراً حذف خواهیم کرد.</p>',
    'sec.intl.title': 'انتقال بین‌المللی داده',
    'sec.intl.body':
      '<p>اطلاعات شما ممکن است روی سرورهایی در کشورهای مختلف ذخیره شود. ما اطمینان می‌دهیم تمام انتقال‌های داده مطابق با استانداردهای بین‌المللی حفاظت از داده انجام می‌شود.</p>',
    'sec.changes.title': 'تغییرات در سیاست',
    'sec.changes.body':
      '<div class="callout callout-info"><p>ممکن است این سیاست را در هر زمان به‌روزرسانی کنیم. تغییرات مهم از طریق ایمیل یا اعلان درون‌بازی به اطلاع شما خواهد رسید. ادامه استفاده از سرویس پس از هر به‌روزرسانی به‌منزله پذیرش سیاست جدید است.</p></div>',
    'contact.title': 'تماس با ما',
    'contact.intro': 'در صورت هرگونه سوال درباره این سیاست، با ما تماس بگیرید:',
    'contact.game': 'بازی',
    'contact.myket': 'صفحه مایکت',
    'contact.myketLink': 'مشاهده در مایکت',
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
    title: 'Privacy Policy',
    themeToDark: 'Dark mode',
    themeToLight: 'Light mode',
    brandSub: 'Privacy policy',
    'sec.intro.title': 'Introduction',
    'sec.intro.body':
      '<p>At <strong>AmirCollider Games</strong>, we take your privacy seriously. This document explains what information we collect from you and how we use it.</p>'
      + '<div class="callout callout-good"><p><strong>Our commitment:</strong> We will never sell your personal information to third parties without your consent.</p></div>',
    'sec.collect.title': 'Information We Collect',
    'sec.collect.body':
      '<p>When you use our authentication service, we receive the following information:</p>'
      + '<ul>'
      + '<li><strong>Email address:</strong> Your Google account email address</li>'
      + '<li><strong>Profile photo:</strong> Your Google account profile photo</li>'
      + '<li><strong>Name:</strong> The name associated with your Google account</li>'
      + '<li><strong>Game stats:</strong> Your scores, level, and achievements</li>'
      + '</ul>',
    'sec.usage.title': 'How We Use Your Information',
    'sec.usage.body':
      '<p>We use your information for the following purposes:</p>'
      + '<ul>'
      + '<li>Analyzing and improving our services</li>'
      + '<li>Displaying your score on leaderboards</li>'
      + '<li>Saving your game progress and scores</li>'
      + '<li>Improving user experience and game performance</li>'
      + '<li>User authentication and account management</li>'
      + '<li>Sending important notifications when necessary</li>'
      + '</ul>',
    'sec.security.title': 'Data Security',
    'sec.security.body':
      '<p>We use industry-standard security protocols to protect your information:</p>'
      + '<ul>'
      + '<li><strong>Continuous monitoring:</strong> 24/7 monitoring of system security</li>'
      + '<li><strong>Access control:</strong> Only authorized personnel can access your data</li>'
      + '<li><strong>Connection encryption:</strong> All data is encrypted in transit using HTTPS/TLS</li>'
      + '<li><strong>Cloudflare D1 database:</strong> Secure data storage powered by Cloudflare D1</li>'
      + '</ul>',
    'sec.sharing.title': 'No Data Sharing',
    'sec.sharing.body':
      '<div class="callout callout-warn">'
      + '<p><strong>Important:</strong> We never sell or share your personal data with third parties. Information may only be disclosed in the following limited cases:</p>'
      + '<ul>'
      + '<li><strong>Legal compliance:</strong> When required by law or a valid legal request</li>'
      + '<li><strong>Abuse prevention:</strong> To protect the security and integrity of our services</li>'
      + '<li><strong>With your consent:</strong> When you explicitly authorize it</li>'
      + '</ul>'
      + '</div>',
    'sec.cookies.title': 'Cookies & Local Storage',
    'sec.cookies.body':
      '<p>We use cookies to maintain your session. These cookies:</p>'
      + '<ul>'
      + '<li>Remain valid for 7 days</li>'
      + '<li>Can be deleted by you at any time</li>'
      + '<li>Do not store any sensitive personal information</li>'
      + '<li>Are used exclusively for authentication</li>'
      + '</ul>',
    'sec.rights.title': 'Your Rights',
    'sec.rights.body':
      '<p>You have the right to:</p>'
      + '<ul>'
      + '<li><strong>Deletion:</strong> Delete your account entirely</li>'
      + '<li><strong>Opt-out:</strong> Opt out of our services at any time</li>'
      + '<li><strong>Portability:</strong> Receive a copy of your personal data</li>'
      + '<li><strong>Correction:</strong> Correct any inaccurate information</li>'
      + '<li><strong>Restriction:</strong> Restrict the processing of your data</li>'
      + '<li><strong>Access:</strong> Access all information we hold about you</li>'
      + '</ul>',
    'sec.children.title': 'Children',
    'sec.children.body':
      '<p>Our game is designed for users over the age of <strong>5</strong>. We do not knowingly collect data from children under 5. If we discover that a child under 5 has registered, we will immediately delete their account.</p>',
    'sec.intl.title': 'International Data Transfer',
    'sec.intl.body':
      '<p>Your data may be stored on servers located in different countries. We ensure all data transfers comply with international data protection standards.</p>',
    'sec.changes.title': 'Policy Changes',
    'sec.changes.body':
      '<div class="callout callout-info"><p>We may update this policy at any time. Important changes will be communicated via email or in-game notification. Continued use of the service after any update constitutes acceptance of the revised policy.</p></div>',
    'contact.title': 'Contact Us',
    'contact.intro': 'For any questions about this policy, please reach out to us:',
    'contact.game': 'Game',
    'contact.myket': 'Myket page',
    'contact.myketLink': 'View on Myket',
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
    title: 'プライバシーポリシー',
    themeToDark: 'ダークモード',
    themeToLight: 'ライトモード',
    brandSub: 'プライバシーポリシー',
    'sec.intro.title': 'はじめに',
    'sec.intro.body':
      '<p><strong>AmirCollider Games</strong>は、お客様のプライバシーを重視しています。本ポリシーでは、収集する情報とその利用方法について説明します。</p>'
      + '<div class="callout callout-good"><p><strong>お約束：</strong>お客様の同意なく、個人情報を第三者に販売することは決してありません。</p></div>',
    'sec.collect.title': '収集する情報',
    'sec.collect.body':
      '<p>認証サービスをご利用の際、当社は以下の情報を取得します。</p>'
      + '<ul>'
      + '<li><strong>メールアドレス：</strong>Googleアカウントのメールアドレス</li>'
      + '<li><strong>プロフィール写真：</strong>Googleアカウントのプロフィール写真</li>'
      + '<li><strong>お名前：</strong>Googleアカウントに登録された名前</li>'
      + '<li><strong>ゲーム統計：</strong>スコア、レベル、実績</li>'
      + '</ul>',
    'sec.usage.title': '情報の利用方法',
    'sec.usage.body':
      '<p>当社は以下の目的でお客様の情報を利用します。</p>'
      + '<ul>'
      + '<li>サービスの分析と改善</li>'
      + '<li>リーダーボードへのスコア表示</li>'
      + '<li>ゲームの進行状況とスコアの保存</li>'
      + '<li>ユーザー体験とゲーム性能の向上</li>'
      + '<li>認証およびアカウント管理</li>'
      + '<li>必要な場合の重要なお知らせの送信</li>'
      + '</ul>',
    'sec.security.title': 'データセキュリティ',
    'sec.security.body':
      '<p>当社は、お客様の情報を保護するために業界標準のセキュリティ対策を講じています。</p>'
      + '<ul>'
      + '<li><strong>常時監視：</strong>システムセキュリティを24時間体制で監視</li>'
      + '<li><strong>アクセス制限：</strong>権限を持つ担当者のみがデータにアクセス可能</li>'
      + '<li><strong>通信の暗号化：</strong>すべてのデータはHTTPS/TLSで暗号化して送信</li>'
      + '<li><strong>Cloudflare D1：</strong>Cloudflare D1データベースによる安全なデータ保管</li>'
      + '</ul>',
    'sec.sharing.title': 'データの非共有',
    'sec.sharing.body':
      '<div class="callout callout-warn">'
      + '<p><strong>重要：</strong>当社はお客様の個人情報を第三者に販売・共有しません。以下の限られた場合にのみ情報を開示することがあります。</p>'
      + '<ul>'
      + '<li><strong>法令の遵守：</strong>法律または正当な法的手続きにより求められた場合</li>'
      + '<li><strong>不正利用の防止：</strong>サービスの安全性と健全性を保護するため</li>'
      + '<li><strong>お客様の同意：</strong>お客様が明示的に許可した場合</li>'
      + '</ul>'
      + '</div>',
    'sec.cookies.title': 'Cookieとローカルストレージ',
    'sec.cookies.body':
      '<p>当社はセッションを維持するためにCookieを使用します。これらのCookieは：</p>'
      + '<ul>'
      + '<li>7日間有効です</li>'
      + '<li>いつでも削除できます</li>'
      + '<li>機密性の高い個人情報は保存しません</li>'
      + '<li>認証目的のみに使用されます</li>'
      + '</ul>',
    'sec.rights.title': 'お客様の権利',
    'sec.rights.body':
      '<p>お客様には以下の権利があります。</p>'
      + '<ul>'
      + '<li><strong>削除：</strong>アカウントを完全に削除する</li>'
      + '<li><strong>オプトアウト：</strong>いつでもサービスの利用を停止する</li>'
      + '<li><strong>データポータビリティ：</strong>個人データの写しを受け取る</li>'
      + '<li><strong>訂正：</strong>誤った情報を訂正する</li>'
      + '<li><strong>制限：</strong>個人データの処理を制限する</li>'
      + '<li><strong>アクセス：</strong>当社が保有する情報にアクセスする</li>'
      + '</ul>',
    'sec.children.title': '子どもについて',
    'sec.children.body':
      '<p>当ゲームは<strong>5歳</strong>以上の利用者を対象としています。当社は5歳未満の子どもの情報を意図的に収集しません。5歳未満の子どもが登録していると判明した場合、直ちにそのアカウントを削除します。</p>',
    'sec.intl.title': '国際的なデータ移転',
    'sec.intl.body':
      '<p>お客様のデータは、さまざまな国に所在するサーバーに保管される場合があります。当社は、すべてのデータ移転が国際的なデータ保護基準に準拠して行われることを保証します。</p>',
    'sec.changes.title': 'ポリシーの変更',
    'sec.changes.body':
      '<div class="callout callout-info"><p>当社は本ポリシーをいつでも更新することがあります。重要な変更は、メールまたはゲーム内通知でお知らせします。更新後も継続してサービスをご利用された場合、改定後のポリシーに同意したものとみなされます。</p></div>',
    'contact.title': 'お問い合わせ',
    'contact.intro': '本ポリシーに関するご質問は、以下までご連絡ください。',
    'contact.game': 'ゲーム',
    'contact.myket': 'Myketページ',
    'contact.myketLink': 'Myketで見る',
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
    .logo-orb img { width: 100%; height: 100%; object-fit: contain; padding: 14px; display: block; }
    .logo-orb.is-game img { object-fit: cover; padding: 0; }
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
// Pre-paint Theme Bootstrap
// Applies the stored theme before first paint to avoid a flash.
// ==========================================
function getThemeBootScript() {
  return `<script>
    (function () {
      try {
        var t = localStorage.getItem('ac_theme');
        if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
      } catch (e) {}
    })();
  </script>`
}

// ==========================================
// Partials
// ==========================================
function renderTopbar(lang, amirLogo) {
  const p = pack(lang)
  const cur = resolveLang(lang)

  const segLinks = LANGUAGES.map(l =>
    '<a href="?lang=' + l.code + '" data-lang="' + l.code + '" lang="' + l.code + '"'
    + ' aria-current="' + (l.code === cur ? 'true' : 'false') + '"'
    + ' onclick="return acSetLang(\'' + l.code + '\')">' + escapeHtml(l.label) + '</a>'
  ).join('')

  return `
    <div class="topbar">
      <div class="brand">
        <span class="brand-logo">
          <img src="${escapeHtml(amirLogo)}" alt="AmirCollider" onerror="this.style.display='none'">
        </span>
        <span>
          <span class="brand-name">AmirCollider</span><br>
          <span class="brand-sub">${escapeHtml(p.brandSub)}</span>
        </span>
      </div>
      <div class="controls">
        <div class="seg" role="group" aria-label="${escapeHtml(p.langName)}">${segLinks}</div>
        <button type="button" id="themeBtn" class="icon-btn" onclick="acToggleTheme()"
                aria-label="${escapeHtml(p.themeToDark)}">${icon('contrast')}</button>
      </div>
    </div>`
}

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
            <img src="${escapeHtml(gameLogo)}" alt="${escapeHtml(game.name)}"
                 onerror="this.onerror=null;this.src='${escapeHtml(CONFIG.DEFAULT_GAME_LOGO)}'">
          </span>
          <span>${escapeHtml(game.name)}</span>
        </div>
      </div>
      <h1>${escapeHtml(p.title)}</h1>
      <span class="pill"><span class="game-icon">${escapeHtml(game.icon)}</span>${escapeHtml(game.name)}</span>
    </div>`
}

function renderSections(lang) {
  const p = pack(lang)
  return `
    <div class="policy">
      ${SECTION_ORDER.map(sec => `
      <section class="panel">
        <h2><span class="sec-ic">${icon(sec.ic, 'p-ic')}</span><span>${escapeHtml(p['sec.' + sec.key + '.title'])}</span></h2>
        <div>${p['sec.' + sec.key + '.body']}</div>
      </section>`).join('')}
      ${renderContact(lang)}
    </div>`
}

function renderContact(lang) {
  const p = pack(lang)
  const game = CONTEXT.game
  const baseUrl = CONTEXT.baseUrl
  return `
      <section class="panel">
        <h2><span class="sec-ic">${icon('mail', 'p-ic')}</span><span>${escapeHtml(p['contact.title'])}</span></h2>
        <p>${escapeHtml(p['contact.intro'])}</p>
        <ul class="contact-list">
          <li><span class="c-ic">${icon('user', 'p-ic')}</span><span class="c-key">${escapeHtml(p['contact.game'])}</span><span class="c-val">${escapeHtml(game.name)}</span></li>
          <li><span class="c-ic">${icon('external', 'p-ic')}</span><span class="c-key">${escapeHtml(p['contact.myket'])}</span><span class="c-val"><a href="${escapeHtml(game.myketUrl)}" target="_blank" rel="noopener">${escapeHtml(p['contact.myketLink'])}</a></span></li>
          <li><span class="c-ic">${icon('mail', 'p-ic')}</span><span class="c-key">${escapeHtml(p['contact.email'])}</span><span class="c-val"><a href="mailto:${escapeHtml(CONFIG.SUPPORT_EMAIL)}">${escapeHtml(CONFIG.SUPPORT_EMAIL)}</a></span></li>
          <li><span class="c-ic">${icon('globe', 'p-ic')}</span><span class="c-key">${escapeHtml(p['contact.web'])}</span><span class="c-val"><a href="${escapeHtml(baseUrl)}">${escapeHtml(baseUrl)}</a></span></li>
        </ul>
      </section>`
}

function renderMeta(lang) {
  const p = pack(lang)
  return `
    <div class="meta">
      <div class="m-row">${escapeHtml(p['footer.updated'])} <b>${escapeHtml(localizedDate(lang))}</b></div>
      <span class="version-badge">${escapeHtml(p['footer.version'])} ${escapeHtml(CONFIG.VERSION)}</span>
      <div class="m-note">${escapeHtml(p['footer.validity'])}</div>
    </div>`
}

function renderActions(lang, gameId, baseUrl) {
  const p = pack(lang)
  const q = '?lang=' + resolveLang(lang)
  return `
    <div class="actions">
      <a class="action" href="${escapeHtml(baseUrl)}/${q}">${icon('home', 'p-ic')}<span>${escapeHtml(p['btn.home'])}</span></a>
      <a class="action is-secondary" href="${escapeHtml(baseUrl)}/${escapeHtml(gameId)}/terms${q}">${icon('doc', 'p-ic')}<span>${escapeHtml(p['btn.terms'])}</span></a>
    </div>`
}

// ==========================================
// Client Runtime
// Theme toggle (persisted) + language switch (server reload so
// RTL/LTR is always resolved on the server, never on the client).
// ==========================================
function getClientScript() {
  return `<script>
    (function () {
      function acById(id) { return document.getElementById(id); }

      function acThemeIsDark() {
        return getComputedStyle(document.documentElement).colorScheme.indexOf('dark') !== -1;
      }

      function acToggleTheme() {
        var next = acThemeIsDark() ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        try { localStorage.setItem('ac_theme', next); } catch (e) {}
        document.cookie = 'theme=' + next + ';path=/;max-age=31536000;samesite=lax';
        var btn = acById('themeBtn');
        if (btn) btn.setAttribute('aria-label', next === 'dark' ? 'Light mode' : 'Dark mode');
      }
      window.acToggleTheme = acToggleTheme;

      function acSetLang(code) {
        try { localStorage.setItem('ac_lang', code); } catch (e) {}
        document.cookie = 'lang=' + code + ';path=/;max-age=31536000;samesite=lax';
        var u = new URL(window.location.href);
        u.searchParams.set('lang', code);
        window.location.href = u.toString();
        return false;
      }
      window.acSetLang = acSetLang;
    })();
  </script>`
}

// ==========================================
// Render Context (shared with contact partial)
// ==========================================
let CONTEXT = { game: null, baseUrl: '' }

// ==========================================
// Page Template
// ==========================================
function createPrivacyPage(game, gameId, baseUrl, lang, theme) {
  CONTEXT = { game, baseUrl }

  const amirLogo = CONFIG.AMIR_LOGO
  const gameLogo = game.logo || CONFIG.DEFAULT_GAME_LOGO
  const resolved = resolveLang(lang)
  const dir = dirFor(resolved)
  const themeAttr = theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : ''
  const p = pack(resolved)

  return `<!DOCTYPE html>
<html dir="${dir}" lang="${resolved}"${themeAttr}>
<head>
  ${getPageHead({
    title: `${p.meta} - ${game.name}`,
    amirLogo,
    description: `${p.meta} ${game.name} - AmirCollider Games`
  })}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  ${getThemeBootScript()}
  <style>${getPrivacyCSS()}</style>
</head>
<body>
  <div class="wrap">
    ${renderTopbar(resolved, amirLogo)}
    ${renderHero(resolved, game, amirLogo, gameLogo)}
    ${renderSections(resolved)}
    ${renderMeta(resolved)}
    ${renderActions(resolved, gameId, baseUrl)}
  </div>
  ${getClientScript()}
</body>
</html>`
}
