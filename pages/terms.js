// ==========================================
// pages/terms.js
// Terms of Service Page Handler
// AmirCollider Games - Worker Proxy
// ==========================================
//
// Responsibilities
//   - Render the per-game Terms of Service with the same chrome,
//     theme tokens and motion language as the rest of the site
//     (dashboard / leaderboard / privacy / health / ping / metrics).
//
// Integration contract (do not break without updating worker.js)
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

import { CONFIG } from '../config.js'
import { getPageHead } from '../shared-styles.js'
import { validateGameId, createHtmlResponse, createErrorPage } from '../utils.js'

const DEFAULT_LANG = 'fa'
const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

// ==========================================
// Route Handler
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

  const headers = {}
  const requestedLang = url && url.searchParams ? url.searchParams.get('lang') : null
  if (requestedLang && I18N[requestedLang]) {
    headers['Set-Cookie'] = `lang=${requestedLang}; Path=/; Max-Age=${LANG_COOKIE_MAX_AGE}; SameSite=Lax`
  }

  return createHtmlResponse(createTermsPage(game, gameId, url.origin, lang, theme), 200, headers)
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
    meta: 'شرایط و قوانین استفاده',
    title: 'شرایط و قوانین استفاده',
    themeToDark: 'حالت تاریک',
    themeToLight: 'حالت روشن',
    brandSub: 'شرایط و قوانین',
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
      '<p>بخش اصلی محتوای بازی شامل کد، طراحی، گرافیک و نام تجاری متعلق به <strong>AmirCollider Games</strong> است و تحت حمایت قوانین مالکیت فکری قرار دارد. با این حال، برخی عناصر مانند موسیقی، جلوه‌های صوتی، برخی منوها و اشیاء ممکن است از منابع Asset استفاده شده باشند یا دارای کپی‌رایت اشخاص ثالث باشند؛ در این موارد نام و اعتبار مالک اصلی ذکر می‌شود.</p>'
      + '<div class="callout callout-info"><p><strong>توجه:</strong> شما مجاز به کپی، تکثیر، توزیع یا ایجاد اثر مشتق از محتوای اصلی بازی بدون اجازه کتبی ما نیستید. محتوای دارای کپی‌رایت ثالث تابع شرایط مالک مربوطه است.</p></div>',
    'sec.purchases.title': 'خریدهای درون‌برنامه‌ای',
    'sec.purchases.body':
      '<p>بازی ممکن است شامل خریدهای درون‌برنامه‌ای با شرایط زیر باشد:</p>'
      + '<ul>'
      + '<li>قیمت‌ها ممکن است بدون اطلاع قبلی تغییر کنند</li>'
      + '<li>استرداد وجه تنها در موارد خاص و طبق قوانین مایکت انجام می‌شود</li>'
      + '<li>تمام خریدها نهایی و غیرقابل استرداد هستند (مگر در موارد استثنایی)</li>'
      + '<li>مسئولیت حفظ امنیت روش پرداخت با شما یا فروشگاه طرف قرارداد است (مانند مایکت، بازار یا پلی‌استور)</li>'
      + '</ul>',
    'sec.liability.title': 'محدودیت مسئولیت',
    'sec.liability.body':
      '<div class="callout callout-warn">'
      + '<p><strong>مهم:</strong> بازی «همان‌گونه که هست» ارائه می‌شود. ما مسئولیتی در قبال خسارات ناشی از استفاده یا عدم استفاده از سرویس نداریم، از جمله:</p>'
      + '<ul>'
      + '<li>خرابی نرم‌افزار <em>(در سریع‌ترین حالت ممکن از طریق آپدیت برطرف می‌شود)</em></li>'
      + '<li>از دست رفتن داده‌ها یا پیشرفت بازی <em>(در صورتی که مشکل از طرف ما نباشد)</em></li>'
      + '<li>خسارات مالی یا غیرمالی <em>(در صورتی که کاربر برخلاف قرارداد عمل کرده باشد)</em></li>'
      + '<li>مشکلات فنی یا قطعی کامل سرویس <em>(در سریع‌ترین حالت ممکن از طریق آپدیت برطرف می‌شود)</em></li>'
      + '</ul></div>',
    'sec.account.title': 'حساب کاربری',
    'sec.account.body':
      '<ul>'
      + '<li><strong>اطلاعات صحیح:</strong> باید اطلاعات دقیق و به‌روز ارائه دهید</li>'
      + '<li><strong>حذف حساب:</strong> شما می‌توانید هر زمان حساب خود را حذف کنید</li>'
      + '<li><strong>تعلیق حساب:</strong> ما می‌توانیم حساب‌های مشکوک را تعلیق یا حذف کنیم</li>'
      + '<li><strong>مسئولیت امنیت:</strong> شما مسئول حفظ امنیت حساب خود هستید و ما نیز متعهد به حفاظت از داده‌های شما هستیم</li>'
      + '</ul>',
    'sec.permissions.title': 'دسترسی‌های مورد نیاز',
    'sec.permissions.body':
      '<p>بازی ممکن است به دسترسی‌های زیر روی دستگاه نیاز داشته باشد:</p>'
      + '<ul>'
      + '<li><strong>حافظه:</strong> برای ذخیره داده‌های بازی روی دستگاه</li>'
      + '<li><strong>اطلاعات دستگاه:</strong> برای بهینه‌سازی عملکرد</li>'
      + '<li><strong>اینترنت:</strong> برای احراز هویت و همگام‌سازی داده‌ها</li>'
      + '</ul>',
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
      '<p>این شرایط و قوانین تحت قوانین جمهوری اسلامی ایران اجرا می‌شود. هرگونه اختلاف ابتدا از طریق مذاکره حل خواهد شد و در صورت عدم توافق، به مراجع قضایی صالح ارجاع می‌شود.</p>',
    'sec.changes.title': 'تغییرات در شرایط',
    'sec.changes.body':
      '<div class="callout callout-info"><p>ما ممکن است این شرایط را هر زمان به‌روزرسانی کنیم. تغییرات از لحظه انتشار لازم‌الاجرا خواهند بود. ادامه استفاده از سرویس پس از هر به‌روزرسانی به‌منزله پذیرش شرایط جدید است.</p></div>',
    'sec.confirm.title': 'تأیید و پذیرش',
    'sec.confirm.body':
      '<div class="callout callout-good">'
      + '<p><strong>با استفاده از بازی، شما تأیید می‌کنید که:</strong></p>'
      + '<ul>'
      + '<li>بالای ۵ سال سن دارید</li>'
      + '<li>این شرایط و قوانین را خوانده و به‌طور کامل فهمیده‌اید</li>'
      + '<li>با تمام شرایط ذکرشده موافقت می‌کنید</li>'
      + '<li>مسئولیت استفاده صحیح از سرویس را طبق این شرایط می‌پذیرید</li>'
      + '</ul></div>',
    'contact.title': 'پشتیبانی و تماس',
    'contact.intro': 'در صورت بروز هرگونه مشکل یا سوال، با ما تماس بگیرید:',
    'contact.game': 'بازی',
    'contact.myket': 'صفحه مایکت',
    'contact.myketLink': 'مشاهده در مایکت',
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
    title: 'Terms of Service',
    themeToDark: 'Dark mode',
    themeToLight: 'Light mode',
    brandSub: 'Terms of service',
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
      '<p>Core content — code, design, graphics, and brand name — belongs to <strong>AmirCollider Games</strong> and is protected under intellectual property law. However, some elements such as music, sound effects, menus, or objects may come from third-party asset packs or carry third-party copyrights; in such cases the original owner\'s credit is duly acknowledged.</p>'
      + '<div class="callout callout-info"><p><strong>Note:</strong> You may not copy, reproduce, distribute, or create derivative works from original game content without our written consent. Third-party content is subject to its respective owner\'s terms.</p></div>',
    'sec.purchases.title': 'In-App Purchases',
    'sec.purchases.body':
      '<p>The game may include in-app purchases subject to the following:</p>'
      + '<ul>'
      + '<li>Prices may change at any time without prior notice</li>'
      + '<li>Refunds are processed only in special cases, per Myket\'s refund policy</li>'
      + '<li>All purchases are considered final and non-refundable (except in exceptional cases)</li>'
      + '<li>Payment security is the responsibility of you or the contracted store (e.g. Myket, Bazaar, or Google Play)</li>'
      + '</ul>',
    'sec.liability.title': 'Limitation of Liability',
    'sec.liability.body':
      '<div class="callout callout-warn">'
      + '<p><strong>Important:</strong> The game is provided "as is". We are not liable for damages arising from use or inability to use the service, including:</p>'
      + '<ul>'
      + '<li>Software malfunction <em>(addressed as quickly as possible via update)</em></li>'
      + '<li>Loss of game data or progress <em>(only where the issue does not originate from our side)</em></li>'
      + '<li>Financial or non-financial damages <em>(where the user has acted in breach of this agreement)</em></li>'
      + '<li>Technical issues or full service outages <em>(resolved in the shortest time possible through an update)</em></li>'
      + '</ul></div>',
    'sec.account.title': 'User Account',
    'sec.account.body':
      '<ul>'
      + '<li><strong>Accurate info:</strong> You must provide accurate and up-to-date information</li>'
      + '<li><strong>Account deletion:</strong> You may request deletion of your account at any time</li>'
      + '<li><strong>Account suspension:</strong> We reserve the right to suspend or delete accounts that appear suspicious</li>'
      + '<li><strong>Security responsibility:</strong> You are responsible for your account security, and we are equally committed to safeguarding your data</li>'
      + '</ul>',
    'sec.permissions.title': 'Required Permissions',
    'sec.permissions.body':
      '<p>The game may require the following device permissions:</p>'
      + '<ul>'
      + '<li><strong>Storage:</strong> For storing game data locally on device</li>'
      + '<li><strong>Device info:</strong> For optimizing performance on your device</li>'
      + '<li><strong>Internet:</strong> For user authentication and cloud data synchronization</li>'
      + '</ul>',
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
      '<p>These terms are governed by the laws of the Islamic Republic of Iran. Any disputes shall first be resolved through mutual negotiation; failing that, the matter will be referred to the appropriate judicial authorities.</p>',
    'sec.changes.title': 'Changes to Terms',
    'sec.changes.body':
      '<div class="callout callout-info"><p>We may update these terms at any time. All changes take effect immediately upon publication. Continued use of the service following any update constitutes acceptance of the revised terms.</p></div>',
    'sec.confirm.title': 'Confirmation & Acceptance',
    'sec.confirm.body':
      '<div class="callout callout-good">'
      + '<p><strong>By using the game, you confirm that:</strong></p>'
      + '<ul>'
      + '<li>You are over 5 years of age</li>'
      + '<li>You have read and fully understood these terms and conditions</li>'
      + '<li>You agree to comply with all of the conditions stated above</li>'
      + '<li>You accept full responsibility for using the service in accordance with these terms</li>'
      + '</ul></div>',
    'contact.title': 'Support & Contact',
    'contact.intro': 'For any issues or questions, please reach out to us:',
    'contact.game': 'Game',
    'contact.myket': 'Myket page',
    'contact.myketLink': 'View on Myket',
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
    title: '利用規約',
    themeToDark: 'ダークモード',
    themeToLight: 'ライトモード',
    brandSub: '利用規約',
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
      '<p>コード、デザイン、グラフィック、ブランド名などの主要なコンテンツは <strong>AmirCollider Games</strong> に帰属し、知的財産権法によって保護されています。ただし、音楽、効果音、一部のメニューやオブジェクトなどの要素は、第三者のアセットパックに由来する場合や第三者の著作権が及ぶ場合があり、その場合は原権利者のクレジットを明記します。</p>'
      + '<div class="callout callout-info"><p><strong>注意：</strong>当社の書面による許可なく、ゲームのオリジナルコンテンツを複製、再配布、または二次的著作物として作成することはできません。第三者のコンテンツは、それぞれの権利者の規約に従います。</p></div>',
    'sec.purchases.title': 'アプリ内購入',
    'sec.purchases.body':
      '<p>本ゲームには、以下の条件に従うアプリ内購入が含まれる場合があります。</p>'
      + '<ul>'
      + '<li>価格は予告なく変更される場合があります</li>'
      + '<li>返金は特別な場合に限り、Myket の返金ポリシーに従って処理されます</li>'
      + '<li>すべての購入は最終的なものであり、原則として返金できません（例外的な場合を除く）</li>'
      + '<li>支払い方法の安全管理は、お客様または契約先ストア（Myket、Bazaar、Google Play など）の責任となります</li>'
      + '</ul>',
    'sec.liability.title': '責任の制限',
    'sec.liability.body':
      '<div class="callout callout-warn">'
      + '<p><strong>重要：</strong>本ゲームは「現状有姿」で提供されます。当社は、サービスの利用または利用不能に起因する損害について、以下を含め一切の責任を負いません。</p>'
      + '<ul>'
      + '<li>ソフトウェアの不具合 <em>（可能な限り迅速にアップデートで対応します）</em></li>'
      + '<li>ゲームデータまたは進行状況の損失 <em>（当社に起因しない場合に限る）</em></li>'
      + '<li>金銭的または非金銭的損害 <em>（お客様が本規約に違反した場合）</em></li>'
      + '<li>技術的な問題またはサービスの全面的な停止 <em>（可能な限り迅速にアップデートで解決します）</em></li>'
      + '</ul></div>',
    'sec.account.title': 'ユーザーアカウント',
    'sec.account.body':
      '<ul>'
      + '<li><strong>正確な情報：</strong>正確かつ最新の情報を提供する必要があります</li>'
      + '<li><strong>アカウントの削除：</strong>いつでもアカウントの削除を請求できます</li>'
      + '<li><strong>アカウントの停止：</strong>当社は不審なアカウントを停止または削除する権利を有します</li>'
      + '<li><strong>セキュリティ責任：</strong>お客様はアカウントの安全管理に責任を負い、当社もお客様のデータ保護に努めます</li>'
      + '</ul>',
    'sec.permissions.title': '必要な権限',
    'sec.permissions.body':
      '<p>本ゲームは、デバイスの以下の権限を必要とする場合があります。</p>'
      + '<ul>'
      + '<li><strong>ストレージ：</strong>ゲームデータをデバイスに保存するため</li>'
      + '<li><strong>デバイス情報：</strong>パフォーマンスを最適化するため</li>'
      + '<li><strong>インターネット：</strong>認証およびデータの同期のため</li>'
      + '</ul>',
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
      '<p>本規約は、イラン・イスラム共和国の法律に準拠します。紛争はまず相互の協議によって解決されるものとし、解決に至らない場合は、適切な司法機関に付託されます。</p>',
    'sec.changes.title': '規約の変更',
    'sec.changes.body':
      '<div class="callout callout-info"><p>当社は、いつでも本規約を更新することがあります。すべての変更は公開時点で効力を生じます。更新後もサービスの利用を継続した場合、改訂された規約に同意したものとみなされます。</p></div>',
    'sec.confirm.title': '確認と承諾',
    'sec.confirm.body':
      '<div class="callout callout-good">'
      + '<p><strong>ゲームを利用することで、お客様は以下を確認したものとします。</strong></p>'
      + '<ul>'
      + '<li>5歳以上であること</li>'
      + '<li>本規約を読み、十分に理解したこと</li>'
      + '<li>上記のすべての条件に従うことに同意すること</li>'
      + '<li>本規約に従ってサービスを利用する全責任を負うこと</li>'
      + '</ul></div>',
    'contact.title': 'サポート・お問い合わせ',
    'contact.intro': 'ご不明な点やお困りのことがございましたら、お問い合わせください。',
    'contact.game': 'ゲーム',
    'contact.myket': 'Myket ページ',
    'contact.myketLink': 'Myket で見る',
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
      <a class="action is-secondary" href="${escapeHtml(baseUrl)}/${escapeHtml(gameId)}/privacy${q}">${icon('lock', 'p-ic')}<span>${escapeHtml(p['btn.privacy'])}</span></a>
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
function createTermsPage(game, gameId, baseUrl, lang, theme) {
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
  <style>${getTermsCSS()}</style>
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
