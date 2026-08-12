// ==========================================
// Pages/TheGod.js
// TheGod — the panel that runs the games.
//
// Public entry points (wired in Worker.js ROUTES):
//   GET  /thegod           the panel      (auth required)
//   GET  /thegod/login
//   POST /thegod/login
//   POST /thegod/logout
//
// And one export the API half uses:
//   isTheGodSession(request, env)
//
// Everything about a game that is a decision rather than a
// deploy:
//
//   • its name, logo, colour, description and tags
//   • whether the download link works        (the offline switch)
//   • its Android deep-link scheme           (no longer a secret)
//   • which products are on sale, and for how much
//   • the purchases people made, through NOWPayments
//   • what a given player owns, and putting that right
//   • the SQL a new game's database needs
//   • the code a new game needs, ready to paste
//   • the Unity files that talk to all of it
//
// Create a game. Delete a game. Rename a product id. Run SQL.
// Show a secret's value, or change one.
// ==========================================

import { CONFIG } from '../Config.js'
import { getPageHead } from '../Core/DesignSystem.js'
import { createHtmlResponse, clientIp, timingSafeEqual } from '../Core/Http.js'
import { logWarning } from '../Core/Logging.js'
import { resolveGames, isDownloadable } from '../Games/Registry.js'
import { db } from '../Games/Store.js'
import { storeReady } from '../Games/Purchase.js'
import { isConfigured as providerConfigured, isSandbox } from '../Commerce/Provider.js'

import { langCookieHeader, matchRequestLang, themeFromCookie } from '../Core/RequestContext.js'
import {
  panelPassword, issuePanelCookie, clearPanelCookie, readPanelSession,
  isRateLimited, recordAttempt, clearAttempts
} from '../Core/PanelSession.js'
import { escapeHtml } from '../Core/Html.js'

const AUTH_COOKIE = 'amir_thegod_auth'
const COOKIE_PATH = '/thegod'
const SESSION_MAX_AGE_MS = 4 * 60 * 60 * 1000

const LANGS = ['fa', 'en', 'ja']
const DEFAULT_LANG = 'fa'
const META = {
  fa: { dir: 'rtl', locale: 'fa-IR', label: 'فا' },
  en: { dir: 'ltr', locale: 'en-US', label: 'EN' },
  ja: { dir: 'ltr', locale: 'ja-JP', label: '日本' }
}


// ==========================================
// The session
//
// Cookie signing lives in Core/PanelSession.js now. It used to be
// written out here and again in Pages/TestSite.js - the same
// function twice, with the same flaw in both: the signature
// covered a random token and nothing else, so a cookie's expiry
// was Max-Age alone. Max-Age is advice to a browser, and whoever
// steals a cookie is not using that browser. The issue time is
// inside the signed payload now and checked server-side.
//
// This panel also has its own password. It shared TestSitePassword
// with the rehearsal panel, which put the credential you hand
// somebody to try a checkout in front of the screens that set
// prices and ban players.
// ==========================================
function theGodPassword(env) {
  return panelPassword(env, 'thegod')
}


export { isAuthenticated as isTheGodSession }

function isAuthenticated(request, env) {
  return readPanelSession(request, AUTH_COOKIE, theGodPassword(env), SESSION_MAX_AGE_MS)
}


// ==========================================
// Handlers
// ==========================================
export async function handleTheGod(url, request, gameId, requestId, GAMES, env) {
  if (!(await isAuthenticated(request, env))) {
    return Response.redirect(`${url.origin}/thegod/login`, 302)
  }

  const lang = matchRequestLang(url, request)
  const theme = themeFromCookie(request)

  // Fresh, always. The panel is where changes are made, and an
  // operator who presses save and sees the old value has no way
  // to tell a cache from a failed write.
  const games = await resolveGames(env, GAMES, { fresh: true })

  const health = {
    database: Boolean(db(env)),
    provider: providerConfigured(env),
    sandbox: providerConfigured(env) && isSandbox(env),
    store: storeReady(env),
    adminToken: Boolean(env && env.DOCSNAP_ADMIN_TOKEN)
  }

  return createHtmlResponse(renderPanel(games, lang, theme, health, url.origin), 200, langCookieHeader(url, lang))
}


export async function handleTheGodLogin(url, request, gameId, requestId, GAMES, env) {
  if (await isAuthenticated(request, env)) {
    return Response.redirect(`${url.origin}/thegod`, 302)
  }

  const lang = matchRequestLang(url, request)
  const theme = themeFromCookie(request)
  const error = url.searchParams.get('error')

  return createHtmlResponse(renderLogin(lang, theme, error), 200, langCookieHeader(url, lang))
}


export async function handleTheGodLoginPost(url, request, gameId, requestId, GAMES, env) {
  const secret = theGodPassword(env)
  const database = db(env)
  const ip = clientIp(request)

  // Counted before the password is looked at, so a guess costs an
  // attempt whether or not it was close. One password stands
  // between this endpoint and every game, price and player record
  // on the deployment, and until now nothing stopped anyone from
  // asking as fast as the edge could answer.
  if (await isRateLimited(database, 'thegod', ip)) {
    logWarning('TheGod login rate limited', { requestId })
    return Response.redirect(`${url.origin}/thegod/login?error=2`, 302)
  }

  let password = ''
  try {
    const params = new URLSearchParams(await request.text())
    password = params.get('password') || ''
  } catch {
    await recordAttempt(database, 'thegod', ip)
    return Response.redirect(`${url.origin}/thegod/login?error=1`, 302)
  }

  // timingSafeEqual rather than !==, for the same reason the
  // cookie check has always used it.
  if (!secret || !timingSafeEqual(password, secret)) {
    await recordAttempt(database, 'thegod', ip)
    logWarning('TheGod login refused', { requestId })
    return Response.redirect(`${url.origin}/thegod/login?error=1`, 302)
  }

  await clearAttempts(database, 'thegod', ip)

  return new Response(null, {
    status: 302,
    headers: {
      'Location': `${url.origin}/thegod`,
      'Set-Cookie': await issuePanelCookie(AUTH_COOKIE, COOKIE_PATH, secret, SESSION_MAX_AGE_MS)
    }
  })
}


export async function handleTheGodLogout(url, request, gameId, requestId, GAMES, env) {
  return new Response(null, {
    status: 302,
    headers: {
      'Location': `${url.origin}/thegod/login`,
      'Set-Cookie': clearPanelCookie(AUTH_COOKIE, COOKIE_PATH)
    }
  })
}



// Data going into an inline <script>. JSON.stringify is not
// enough on its own: the HTML parser ends the script at the
// first "</script>" wherever it appears, including inside a
// string literal.
function jsonBlob(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}


// ==========================================
// Bidi isolation for the Persian interface
//
// This is the fix for the most visible thing wrong with this
// panel, and it is worth spelling out because the cause is not
// obvious from looking at the code.
//
// The Persian UI is an RTL paragraph. Inside one, a filename
// like "0003_games.sql" is not one run to the browser: the
// digits resolve to a number, the letters resolve to Latin, and
// the underscore between them is a NEUTRAL. By rule N1 of the
// bidi algorithm a neutral between a number and a letter takes
// the paragraph direction - RTL - which splits the string into
// three pieces at different embedding levels and lays them out
// right to left. The reader sees "games.sql_0003".
//
// It is not a font problem and it is not a typo in the
// translation: the string in the source is correct and the
// screen is wrong. Wrapping each technical run in an isolate
// (U+2068 … U+2069) tells the browser to resolve that run on its
// own and treat the result as a single neutral object, which is
// exactly what it is.
//
// Isolates rather than <bdi> elements on purpose: half of these
// strings end up in window.confirm(), in a toast's textContent
// and in title attributes, none of which render markup. A
// character works in all of them.
// ==========================================
const FIRST_STRONG_ISOLATE = '⁨'
const POP_DIRECTIONAL_ISOLATE = '⁩'

function isolateTechnicalRuns(text) {
  return String(text).replace(/[A-Za-z0-9][A-Za-z0-9._+/@:-]*/g, run =>
    /[A-Za-z]/.test(run) ? FIRST_STRONG_ISOLATE + run + POP_DIRECTIONAL_ISOLATE : run)
}

// The dictionary as the page should use it. Only for an RTL
// language: an LTR paragraph has no reordering to prevent, and
// isolating every word of the English copy would be two invisible
// characters per word for no effect at all.
//
// `dir` is skipped because it is not a label - it is interpolated
// into a dir="" attribute, and an isolated "rtl" is not a
// direction any browser recognises.
function localizedDict(lang) {
  const dict = I18N[lang] || I18N.fa
  if (dict.dir !== 'rtl') return dict

  const out = {}
  for (const [key, value] of Object.entries(dict)) {
    out[key] = key === 'dir' || typeof value !== 'string' ? value : isolateTechnicalRuns(value)
  }
  return out
}


// ==========================================
// i18n
// ==========================================
const I18N = {
  fa: {
    dir: 'rtl',
    brand: 'TheGod',
    tagline: 'مدیریت بازی‌ها، فروشگاه و کد',

    loginTitle: 'ورود به پنل TheGod',
    loginSub: 'با همان رمز پنل تست',
    loginPassword: 'رمز عبور',
    loginPlaceholder: 'رمز عبور را وارد کن',
    loginButton: 'ورود',
    loginError: 'رمز عبور اشتباه است',
    loginBlocked: 'تلاش‌های ناموفق زیاد بوده. یک ربع دیگر دوباره امتحان کن.',
    showPassword: 'نمایش رمز',
    logout: 'خروج',

    tabGames: 'بازی‌ها',
    tabStore: 'فروشگاه',
    tabOrders: 'پرداخت‌ها',
    tabPlayers: 'بازیکن‌ها',
    tabSql: 'ساخت SQL',
    tabEnv: 'متغیرها',
    tabNew: 'بازی جدید',
    tabUnity: 'کد یونیتی',

    // health
    hDatabase: 'پایگاه‌داده',
    hProvider: 'درگاه پرداخت',
    hStore: 'فروشگاه',
    hSandbox: 'حالت آزمایشی',
    hOn: 'فعال',
    hOff: 'غیرفعال',
    hSandboxWarn: 'به سندباکس NOWPayments وصل است — هیچ پولی واقعی نیست.',
    hDbWarn: 'LICENSE_DB وصل نشده. تغییرات ذخیره نمی‌شود؛ سایت با مقادیر کد کار می‌کند.',
    hNoMigration: 'اگر ذخیره خطا داد، مهاجرت 0003_games.sql را اجرا کن.',

    // games tab
    gamesLede: 'بازی‌ها داخل کد تعریف می‌شوند (GAME_REGISTRY در config.js). این‌جا فقط چیزهایی را عوض می‌کنی که برای تغییرشان نباید دوباره deploy کنی.',
    fromCode: 'از روی کد',
    edited: 'تغییر داده شده',
    edit: 'ویرایش',
    save: 'ذخیره',
    saving: 'در حال ذخیره…',
    saved: 'ذخیره شد',
    reset: 'برگشت به مقدار کد',
    resetAsk: 'همه‌ی تغییرهای این بازی برداشته شود و به همان چیزی که در کد نوشته شده برگردد؟',
    cancel: 'انصراف',

    fName: 'نام نمایشی',
    fLogo: 'آدرس لوگو',
    fColor: 'رنگ اصلی',
    fStatus: 'وضعیت',
    fDescFa: 'توضیح (فارسی)',
    fDescEn: 'توضیح (انگلیسی)',
    fDescJa: 'توضیح (ژاپنی)',
    fMinVersion: 'حداقل نسخه‌ی بازی',
    fNote: 'یادداشت داخلی',
    fDownload: 'لینک‌های دانلود',
    fDownloadHint: 'یک خط برای هر فروشگاه، به شکل  نام=آدرس',
    fDownloadKnown: 'این چهار نام لوگو و عنوان مخصوص خودشان را می‌گیرند:',
    fDownloadOther: 'هر نام دیگری هم کار می‌کند، ولی با آیکون دانلود ساده و خودِ همان نام نمایش داده می‌شود.',
    fDeepLink: 'اسکیم دیپ‌لینک اندروید',
    fDeepLinkHint: 'همان چیزی که در AndroidManifest بیلد ثبت شده. بعد از ورود با گوگل، بازیکن با '
                 + 'آدرس «اسکیم://host» به بازی برمی‌گردد. خالی بگذاری، از مقدار داخل config.js استفاده می‌شود.',
    fDeepLinkBad: 'اسکیم فقط حروف انگلیسی، عدد و نویسه‌های + - . — بدون فاصله و بدون //:',

    purge: 'پاک کردن ردیف‌های دیتابیس',
    purgeAsk: 'همه‌ی ردیف‌های این بازی در game_settings و game_product_overrides پاک شود؟\n\n'
            + 'بازی حذف نمی‌شود (بازی داخل config.js است) و سفارش‌ها و داشته‌های بازیکن‌ها هم دست نمی‌خورد. '
            + 'فقط تغییرهایی که روی کد اعمال شده بود برداشته می‌شود و بازی دقیقاً همان می‌شود که در کد نوشته شده. '
            + 'با اولین «ذخیره»، ردیف تازه و تمیز ساخته می‌شود.',
    purgeDone: 'ردیف‌ها پاک شدند. بازی الان دقیقاً از روی config.js خوانده می‌شود.',
    purgeHint: 'اگر ردیف تنظیمات پر از NULL شده و می‌خواهی از اول بسازیش، این دکمه پاکش می‌کند. '
             + 'ساختن دوباره کار جداگانه‌ای ندارد: ویرایش کن و ذخیره بزن.',

    stLive: 'منتشر شده',
    stMaintenance: 'دانلود برداشته شده',
    stSoon: 'به‌زودی',

    downloadOn: 'لینک دانلود فعال است',
    downloadOff: 'لینک دانلود برداشته شده',
    downloadToggle: 'وضعیت لینک دانلود',
    downloadHint: 'خاموش کردنش فقط دانلود را برمی‌دارد. صفحه‌ی بازی، ورود، خرید و جدول امتیازات همه سر جایشان می‌مانند.',

    capabilities: 'قابلیت‌ها',
    capOnline: 'بازی آنلاین',
    capLogin: 'ورود با گوگل',
    capCloud: 'ذخیره‌ی ابری',
    capBoard: 'جدول امتیازات',
    capStore: 'خرید درون‌برنامه‌ای',
    capNote: 'قابلیت‌ها در کد تعریف می‌شوند، نه این‌جا — چون هر کدام به یک اتصال یا secret وابسته است.',

    open: 'پیش‌نمایش صفحه‌ها',
    openHint: 'صفحه‌هایی که این تنظیمات روی آن‌ها اثر می‌گذارد. در تب تازه باز می‌شوند.',
    openLanding: 'صفحه‌ی بازی',
    openStore: 'فروشگاه',
    openBoard: 'جدول امتیازات',
    openVersions: 'نسخه‌ها',

    // store tab
    storeLede: 'محصول‌ها هم داخل کد تعریف می‌شوند، چون شناسه‌شان را بیلد منتشرشده حفظ کرده. این‌جا می‌توانی قیمت را عوض کنی، محصولی را از فروش برداری یا ترتیبشان را تغییر دهی.',
    pEnabled: 'برای فروش',
    pPrice: 'قیمت (دلار)',
    pBadge: 'برچسب',
    pOrder: 'ترتیب',
    pKind: 'نوع',
    pGrant: 'چه می‌دهد',
    pNone: 'این بازی محصولی ندارد. برای اضافه کردن، یک ورودی به store.products در config.js اضافه کن.',
    badgeNone: 'بدون برچسب',
    badgeBest: 'بهترین ارزش',
    badgeNew: 'جدید',
    badgeSale: 'تخفیف',

    // orders tab
    ordersLede: 'خریدهایی که از سایت انجام شده. پرداخت از طریق NOWPayments است؛ همان حسابی که برای فروش لایسنس استفاده می‌شود.',
    oTotal: 'کل سفارش‌ها',
    oGranted: 'تحویل‌شده',
    oOpen: 'در انتظار پرداخت',
    oPartial: 'ناقص',
    oRevenue: 'درآمد',
    oSearch: 'جست‌وجو (شماره سفارش، ایمیل، شناسه‌ی بازیکن)',
    oStatus: 'وضعیت',
    oAny: 'همه',
    oLoad: 'نمایش سفارش‌ها',
    oNone: 'سفارشی با این فیلترها نیست.',
    oGrant: 'تحویل دستی',
    oGrantAsk: 'این سفارش پرداخت‌شده به‌صورت دستی تحویل داده شود؟',
    oProviderPanel: 'پنل NOWPayments',
    oProviderHint: 'صورتحساب‌ها، پرداخت‌ها و برداشت‌ها در داشبورد خود NOWPayments است. این‌جا فقط سمت ما را می‌بینی.',
    oNotConfigured: 'کلید NOWPayments تنظیم نشده. تا وقتی NOWPAYMENTS_API_KEY و NOWPAYMENTS_IPN_SECRET را نگذاری، خرید غیرفعال است.',

    // players tab
    playersLede: 'هر کسی که چیزی خریده. می‌توانی ببینی چه دارد، چیزی به او بدهی، یا چیزی را پس بگیری.',
    plSearch: 'ایمیل یا شناسه‌ی بازیکن',
    plState: 'وضعیت',
    plAny: 'همه',
    plActive: 'عادی',
    plRestricted: 'محدود',
    plBanned: 'مسدود',
    plPlayer: 'بازیکن',
    plScore: 'بالاترین امتیاز',
    plRuns: 'تعداد بازی',
    plPlayTime: 'مدت بازی',
    plHours: 'س',
    plMinutes: 'د',
    plJoined: 'تاریخ عضویت',
    plLastSeen: 'آخرین ورود',
    plEmail: 'ایمیل',
    plId: 'شناسه',
    plBoard: 'جدول امتیازات',
    plBoardShown: 'در جدول دیده می‌شود',
    plBoardHidden: 'خودش را پنهان کرده',
    plBoardHiddenWhy: 'این تصمیم خودِ بازیکن است (از صفحه‌ی حساب) و از این‌جا عوض نمی‌شود.',
    plTotal: 'کل بازیکن‌ها',
    plManage: 'مدیریت',
    plRename: 'تغییر نام کاربری',
    plRenameHint: '۳ تا ۱۲ نویسه، فقط حروف انگلیسی و عدد. نام تکراری پذیرفته نمی‌شود.',
    plModeration: 'محدودیت و مسدودسازی',
    plBan: 'مسدود کردن',
    plUnban: 'رفع مسدودی',
    plRestrict7: 'محدودیت ۷ روزه',
    plRestrict30: 'محدودیت ۳۰ روزه',
    plLift: 'برداشتن محدودیت',
    plBanAsk: 'این حساب مسدود شود؟\n\nثبت امتیاز جدیدش رد می‌شود و از جدول امتیازات حذف می‌شود. خریدهایش دست‌نخورده می‌ماند و هر وقت بخواهی می‌توانی برگردانی.',
    plBanEffect: 'مسدود یا محدود که باشد، ثبت امتیاز جدیدش رد می‌شود و از جدول امتیازات کنار گذاشته می‌شود. حسابش پاک نمی‌شود و خریدهایش سر جایشان می‌مانند.',
    plBannedAt: 'تاریخ مسدودی',
    plUntil: 'تا تاریخ',
    plNote: 'یادداشت داخلی',
    plNoteHint: 'فقط برای خودت. بازیکن این را نمی‌بیند. با خارج شدن از فیلد ذخیره می‌شود.',
    plReasonHint: 'مثلاً: امتیاز غیرواقعی',
    plOwnsNone: 'هنوز چیزی ندارد.',
    plDanger: 'حذف حساب',
    plDelete: 'حذف کامل حساب',
    plDeleteHint: 'ردیف بازیکن از دیتابیس بازی پاک می‌شود: نام کاربری، امتیاز، مدت بازی و آمارش. سفارش‌هایش پاک نمی‌شود چون سند مالی است. این کار برگشت‌پذیر نیست.',
    plDeleteAsk: 'حساب این بازیکن برای همیشه پاک شود؟\n\nامتیاز و آمارش از بین می‌رود. سفارش‌هایش باقی می‌ماند. این کار برگشت‌پذیر نیست.',
    plNoModeration: 'دیتابیس این بازی هنوز ستون‌های مسدودسازی را ندارد. برای فعال شدن این بخش، فایل migrations/0006_player_moderation.sql را روی دیتابیس همین بازی اجرا کن.',
    plFind: 'جست‌وجو',
    plNone: 'بازیکنی پیدا نشد.',
    plOrders: 'سفارش',
    plSpent: 'خرج کرده',
    plOwns: 'دارد',
    plGrant: 'اهدا',
    plRevoke: 'پس گرفتن',
    plRevokeAsk: 'این محصول از حساب بازیکن برداشته شود؟',
    plQuantity: 'تعداد',
    plReason: 'دلیل (در تاریخچه ثبت می‌شود)',
    plHistory: 'تاریخچه',

    // sql tab
    sqlLede: 'هر بازی به دیتابیس D1 خودش نیاز دارد، با همان ستون‌هایی که Worker با نام می‌خواند. این‌جا فایل مهاجرتش ساخته می‌شود.',
    sqlGame: 'برای کدام بازی؟',
    sqlNewId: 'یا یک شناسه‌ی جدید بنویس',
    sqlPurchases: 'جدول آینه‌ی خریدها',
    sqlSessions: 'جدول جلسه‌های بازی',
    sqlSeed: 'یک ردیف نمونه',
    sqlBuild: 'ساختن SQL',
    sqlSettings: 'SQL تنظیمات فعلی',
    sqlPurge: 'SQL پاک کردن ردیف‌ها',
    sqlNoRun: 'ساختن SQL این‌جا هیچ چیزی را اجرا نمی‌کند — فقط متن می‌سازد و خودت با wrangler اجرایش می‌کنی. '
            + 'تنها استثناء دکمه‌ی «تعمیر ساختار جدول» است که در همین صفحه گفته می‌شود و کارش را همان‌جا انجام می‌دهد.',

    sqlWhat: 'هر دکمه چه چیزی می‌سازد',
    sqlWhatSchema: 'ساختار جدول — این پایگاه‌داده واقعاً چه ستون‌هایی دارد. اول این را ببین؛ اگر ستونی کم باشد، هر چه در تب «صفحه‌ی بازی» بنویسی ذخیره نمی‌شود.',
    sqlWhatBuild: 'ساختن SQL — فایل مهاجرت برای دیتابیس شخصی یک بازیِ تازه. برای بازی‌های موجود لازم نیست.',
    sqlWhatSettings: 'SQL تنظیمات فعلی — دقیقاً همان چیزی که همین الآن در ردیف game_settings این بازی ذخیره شده، به شکل یک دستور قابل اجرا روی یک استقرار دیگر.',
    sqlWhatPurge: 'SQL پاک کردن — دستوری که همه‌ی تغییرهای ذخیره‌شده‌ی این بازی را برمی‌دارد تا دوباره از روی Config.js خوانده شود.',

    sqlSchema: 'ساختار جدول',
    sqlSchemaTitle: 'ساختار جدول‌ها روی این استقرار',
    sqlSchemaLede: 'این‌ها ستون‌هایی هستند که همین الآن واقعاً در پایگاه‌داده وجود دارند — نه آن‌چه فایل‌های migrations می‌گویند. '
                 + 'اگر این دو با هم فرق داشته باشند، چیزی که اهمیت دارد همین فهرست است.',
    sqlSchemaTable: 'جدول',
    sqlSchemaColumn: 'ستون',
    sqlSchemaFrom: 'از کدام مهاجرت',
    sqlSchemaOk: 'کامل است — هر ستونی که پنل می‌نویسد در این پایگاه‌داده وجود دارد.',
    sqlSchemaMissing: 'ستون کم دارد',
    sqlSchemaMissingWhy: 'پنل نمی‌تواند این ستون‌ها را بنویسد. هر چیزی که در فیلدهای مربوط به آن‌ها وارد کنی، بی‌صدا از بین می‌رود.',
    sqlSchemaRepair: 'تعمیر ساختار جدول',
    sqlSchemaRepairAsk: 'ستون‌های کم‌بود به جدول game_settings اضافه شوند؟\n\n'
                      + 'برای هر ستون یک ALTER TABLE ADD COLUMN اجرا می‌شود. همه‌ی این ستون‌ها nullable هستند و مقدار پیش‌فرض ندارند، '
                      + 'پس هیچ ردیفی بازنویسی نمی‌شود، هیچ داده‌ای جابه‌جا یا حذف نمی‌شود و چیزی هم لازم نیست دوباره پر شود.\n\n'
                      + 'این تنها جای پنل است که خودش SQL اجرا می‌کند.',
    sqlSchemaRepaired: 'ستون اضافه شد',
    sqlSchemaNothing: 'چیزی برای اضافه کردن نبود — ساختار از قبل کامل بود.',
    sqlSchemaPresent: 'موجود',
    sqlSchemaAbsent: 'ناموجود',
    sqlSchemaLicence: 'پایگاه‌داده‌ی لایسنس (LICENSE_DB) — تنظیمات، قیمت‌ها و صفحه‌ی بازی',
    sqlSchemaPlayer: 'پایگاه‌داده‌ی خود بازی — بازیکن‌ها، امتیازها و ذخیره‌ی ابری',
    sqlSchemaUnbound: 'این اتصال روی این استقرار وصل نشده، پس چیزی برای خواندن نیست.',
    sqlSchemaFeature: 'قابلیت',
    sqlSchemaRow: 'ردیف ذخیره‌شده، بدون هیچ تغییری',
    sqlSchemaRowLede: 'خروجی خام SELECT * از ردیف این بازی. اگر SQL پایین با این جدول فرق داشت، مشکل از تولیدکننده‌ی SQL است نه از داده.',
    sqlNoRow: 'برای این بازی هنوز هیچ ردیفی در game_settings ساخته نشده. یعنی همه چیز از روی Config.js خوانده می‌شود.',
    copy: 'کپی',
    copied: 'کپی شد',
    download: 'دانلود فایل',

    // env tab
    envLede: 'هر چیزی که این Worker از «Variables and secrets» می‌خواند، و این‌که هر کدام تنظیم شده یا نه. '
           + 'مقدار secretها این‌جا نشان داده نمی‌شود — فقط این‌که وجود دارند و چند نویسه‌اند.',
    envReload: 'خواندن دوباره',
    envSet: 'تنظیم شده',
    envMissing: 'تنظیم نشده',
    envChars: 'نویسه',
    envHidden: 'مقدارش نشان داده نمی‌شود',
    envBindingTitle: 'اتصال‌ها (wrangler.jsonc)',
    envBindingHint: 'این‌ها در «Variables and secrets» نیستند؛ در wrangler.jsonc تعریف می‌شوند و با deploy فعال می‌شوند.',
    envSharedTitle: 'متغیرهای مشترک سایت',
    envGameTitle: 'متغیرهای این بازی',
    envPublicTag: 'عمومی',
    envSecretTag: 'محرمانه',
    envPublicWhy: 'این مقدار همین حالا هم در آدرس صفحه‌ی ورود گوگل یا داخل فایل APK دیده می‌شود.',
    envSecretSafe: 'ردیف‌های «عمومی» چیزهایی‌اند که هر بازدیدکننده‌ی سایت از قبل می‌بیند — Client ID در آدرس صفحه‌ی ورود گوگل، و اسکیم دیپ‌لینک داخل فایل APK. ردیف «محرمانه» هیچ‌وقت به مرورگر فرستاده نمی‌شود؛ فقط طولش شمرده می‌شود تا بفهمی موقع paste چیز اضافه‌ای وارد نشده باشد.',
    envOptional: 'اختیاری',
    envRequired: 'لازم',

    envRedirectTitle: 'آدرس بازگشت گوگل (redirect URI)',
    envRedirectLede: 'اگر موقع ورود به بازی خطای «Error 400: redirect_uri_mismatch» می‌گیری، مشکل از این Worker '
                   + 'و از secretها نیست. گوگل آدرس بازگشت را با فهرستی که خودش دارد مقایسه می‌کند، و این آدرس در آن فهرست نیست.',
    envRedirectFix: 'در Google Cloud Console → APIs & Services → Credentials → همان OAuth client از نوع Web → '
                  + 'بخش «Authorized redirect URIs» → آدرس زیر را اضافه کن → Save. '
                  + 'برای هر دامنه‌ای که سایت روی آن بالا می‌آید یک خط جدا لازم است (هم amircollider.com و هم آدرس workers.dev).',
    envRedirectNow: 'آدرسی که همین حالا برای این دامنه فرستاده می‌شود',
    envRedirectWait: 'بعد از Save گاهی چند دقیقه طول می‌کشد تا گوگل تغییر را اعمال کند.',
    envRedirectOrigins: 'یادت باشد این صفحه فقط دامنه‌ای را می‌بیند که الان با آن باز شده. اگر سایت روی چند دامنه جواب می‌دهد، '
                      + 'هر کدام را جدا باز کن و آدرسش را هم اضافه کن.',

    envDeepTitle: 'اسکیم دیپ‌لینک',
    envDeepNotSecret: 'اسکیم دیپ‌لینک secret نیست: همین رشته داخل AndroidManifest هر APK منتشرشده هست و هر کسی '
                    + 'می‌تواند ببیندش. حالا می‌توانی از تب «بازی‌ها» تغییرش بدهی و متغیر NEON_KATANA_DEEPLINK_SCHEME را '
                    + 'با خیال راحت از Cloudflare پاک کنی — مقدار پشتیبانش داخل config.js همیشه هست.',
    envDeepEffective: 'مقدار فعلی',
    envDeepFrom: 'از کجا می‌آید',
    envDeepFromPanel: 'از پنل (دیتابیس)',
    envDeepFromEnv: 'از متغیر Cloudflare',
    envDeepFromCode: 'از config.js',
    envDeepMigration: 'برای ذخیره‌ی این مقدار در دیتابیس باید migrations/0004_deeplink.sql را اجرا کرده باشی.',

    // new game tab
    newLede: 'بازی جدید باید داخل کد اضافه شود، نه دیتابیس. این فرم کدش را می‌نویسد؛ تو paste می‌کنی و deploy.',
    newWhy: 'چرا در کد؟ چون یک بازی یعنی یک اتصال D1، چهار secret گوگل، یک deep link و یک package اندروید. ردیفی در دیتابیس که ادعا کند بازی است، روی داشبورد کارت نشان می‌دهد و یک نفر را هم نمی‌تواند وارد کند.',
    nId: 'شناسه (در آدرس‌ها)',
    nName: 'نام بازی',
    nIcon: 'آیکون (اموجی)',
    nColor: 'رنگ',
    nPackage: 'نام package اندروید',
    nMyket: 'لینک مایکت',
    nGooglePlay: 'لینک گوگل پلی',
    nApk: 'لینک مستقیم APK',
    nWeb: 'آدرس بازی تحت وب',
    nDownloads: 'روش‌های دانلود',
    nDownloadsHint: 'هر کدام را که داشته باشی همان‌قدر دکمه روی کارت بازی ساخته می‌شود. خالی بگذاری، آن دکمه اصلاً نمایش داده نمی‌شود. پس هم «فقط یک روش» و هم «چند روش» با همین یک فرم درست می‌شود.',
    nPrimary: 'روش اصلی',
    nPrimaryAuto: 'خودکار (اولین موردی که پر کرده‌ای)',
    nPrimaryHint: 'دکمه‌ی اصلی اول می‌آید و حاشیه‌ی رنگی می‌گیرد. بقیه هم نمایش داده می‌شوند، فقط بعد از آن.',
    nDescFa: 'توضیح فارسی',
    nDescEn: 'توضیح انگلیسی',
    nDescJa: 'توضیح ژاپنی',
    nBuild: 'ساختن کد',
    nBuildHint: 'همین حالا هم می‌توانی بزنی. هر چیزی که پر نکنی مقدار پیش‌فرض معقولی می‌گیرد و بعداً بدون deploy از همین پنل قابل تغییر است.',
    nSteps: 'مراحل، به ترتیب',
    nIdTaken: 'این شناسه از قبل وجود دارد.',
    nIdBad: 'شناسه فقط حروف کوچک انگلیسی، عدد و خط تیره.',
    nIdHint: 'در آدرس بازی، نام دیتابیس و نام متغیرها استفاده می‌شود. بعداً عوض کردنش یعنی عوض کردن آدرس عمومی بازی.',
    nIdFixed: 'شناسه اصلاح شد به',

    nEssentials: 'چیزهایی که حتماً لازم است',
    nEssentialsHint: 'فقط همین سه مورد. بقیه‌ی فیلدها مقدار پیش‌فرض دارند و همه‌شان بعداً از همین پنل و بدون deploy عوض می‌شوند.',
    nMore: 'تنظیمات بیشتر — همه اختیاری',
    nMoreHint: 'هیچ‌کدام از این‌ها برای ساختن کد لازم نیست. اگر الآن پرشان کنی، داخل کدِ تولیدشده می‌آیند؛ '
             + 'اگر نه، بعد از deploy از تب‌های «بازی‌ها» و «صفحه‌ی بازی» تنظیمشان می‌کنی.',
    nLook: 'ظاهر کارت بازی',
    nMotifs: 'المان‌های شناور کارت',
    nMotifsHint: 'چند اموجی از خود بازی، جدا از هم با فاصله — مثل 🍎 🍑 🍉 برای بازی‌ای که در آن چیزی بریده می‌شود. '
               + 'پشت کارت به‌صورت شناور و در حال تنفس نمایش داده می‌شوند. حداکثر ۶ تا. خالی بگذاری، هیچ چیزی اضافه نمی‌شود.',
    nDescs: 'توضیح کوتاه بازی',
    nDescsHint: 'یک جمله. روی کارت داشبورد و به‌عنوان توضیح صفحه در نتایج جست‌وجو استفاده می‌شود. بعداً از تب «بازی‌ها» قابل تغییر است.',
    nCapsHint: 'هر قابلیت یک بخش از سایت را روشن می‌کند. این‌ها در کد ثبت می‌شوند چون هرکدام به یک اتصال یا secret وابسته‌اند و از پنل عوض نمی‌شوند.',

    nPreview: 'چه چیزی ساخته می‌شود',
    nPreviewEmpty: 'یک شناسه بنویس تا این‌جا ببینی چه چیزهایی از رویش ساخته می‌شود.',
    nPreviewUrl: 'آدرس صفحه‌ی بازی',
    nPreviewBinding: 'نام اتصال D1',
    nPreviewDatabase: 'نام دیتابیس',
    nPreviewConstants: 'فایل ثابت‌های یونیتی',
    nPreviewSecrets: 'متغیرهایی که باید ست شوند',

    nVerify: 'بررسی سلامت',
    nVerifyLede: 'بعد از اینکه مراحل بالا را انجام دادی و deploy کردی، این را بزن. تا قبل از deploy این بازی هنوز وجود ندارد و جواب مفیدی نمی‌گیری.',
    vfRun: 'بررسی کن',
    vfLede: 'هر چیزی که همین الآن روی این استقرار یا درست است یا نیست: اتصال‌ها، جدول‌ها، secretها، لینک‌ها و صفحه‌ی بازی. هر ردیف می‌گوید اگر درست نیست باید چه کار کنی.',
    vfFailed: 'مورد ایراد جدی دارد',
    vfWarned: 'مورد هشدار دارد',
    vfAllGood: 'همه چیز سر جایش است.',
    vfPages: 'صفحه‌هایی که می‌توانی خودت باز کنی و ببینی',

    // unity tab
    unityLede: 'کیت کامل یونیتی برای وصل شدن این بازی به Worker: فایل ثابت‌ها، لایه‌ی شبکه، ورود با گوگل، '
             + 'AndroidManifest، link.xml، راهنمای گوگل و یک نمونه‌ی کامل. مقدارها همین حالا برای همین بازی پر شده‌اند.',
    unityGame: 'برای کدام بازی؟',
    unityCount: 'فایل',
    unityPlatformAndroid: 'بازی اندرویدی — AndroidManifest و link.xml هم ساخته شده‌اند.',
    unityPlatformWeb: 'بازی تحت وب — دیپ‌لینک و AndroidManifest برای این بازی معنایی ندارد و ساخته نشده.',
    unityPlatformBoth: 'هم اندروید و هم وب — فایل‌های اندروید هم ساخته شده‌اند.',
    unityOrder: 'اول فایل ثابت‌ها را اضافه کن؛ بقیه به آن اشاره می‌کنند.',
    unityAll: 'دانلود همه (به‌صورت یک فایل)',

    // games tab — tags
    fTags: 'برچسب‌ها',
    fTagsHint: 'هر خط یک برچسب، به شکل  فارسی | English | 日本語 . خالی بگذاری، برچسب‌های داخل کد استفاده می‌شوند.',

    // game page tab
    tabPage: 'صفحه‌ی بازی',
    pgLede: 'محتوای صفحه‌ی عمومی بازی — همان چیزی که بازدیدکننده روی نشانی خود بازی می‌بیند. '
          + 'هیچ‌کدام از این‌ها deploy نمی‌خواهد.',
    pgOpen: 'دیدن صفحه',
    pgHero: 'تصویر بالای صفحه (بنر)',
    pgHeroHint: 'آدرس یک تصویر پهن. خالی باشد، پس‌زمینه از رنگ اصلی بازی ساخته می‌شود.',
    pgTagline: 'یک‌خطی معرفی',
    pgTaglineHint: 'زیر اسم بازی می‌آید، و در پیش‌نمایش لینک (تلگرام، واتساپ، توییتر) هم همین نشان داده می‌شود.',
    pgAbout: 'توضیح بلند',
    pgAboutHint: 'چند پاراگراف. خط‌های خالی حفظ می‌شوند.',
    pgFeatures: 'ویژگی‌ها',
    pgFeaturesHint: 'سه تا شش مورد؛ هرکدام یک آیکون و یک عبارت کوتاه. این بخش بالای صفحه و قبل از متن بلند می‌آید.',
    pgScreens: 'تصاویر بازی',
    pgScreensHint: 'گالری اسکرین‌شات. توضیح هر تصویر به‌عنوان متن جایگزین (alt) هم استفاده می‌شود.',
    pgVideos: 'ویدیوها',
    pgVideosHint: 'لینک یوتیوب یا آپارات داخل صفحه پخش می‌شود؛ هر آدرس دیگری فقط به‌صورت لینک می‌آید.',
    pgDevices: 'روی چه دستگاه‌هایی اجرا می‌شود',
    pgDevicesHint: 'نوع دستگاه آیکون را انتخاب می‌کند؛ متن همان چیزی است که بازدیدکننده می‌خواند.',
    pgFaq: 'پرسش‌های پرتکرار',
    pgFaqHint: 'همان چیزهایی که قبل از نصب پرسیده می‌شود: حجم، اینترنت، خرید، حساب.',
    pgAdd: 'افزودن',
    pgRemove: 'حذف این ردیف',
    pgIcon: 'آیکون',
    pgUrl: 'آدرس',
    pgTitle: 'عنوان',
    pgCaption: 'توضیح تصویر',
    pgKind: 'نوع دستگاه',
    pgLabel: 'متن نمایشی',
    pgQuestion: 'پرسش',
    pgAnswer: 'پاسخ',
    pgEmpty: 'هنوز موردی اضافه نشده.',
    pgMigration: 'برای ذخیره‌ی این بخش‌ها باید migrations/0008_landing_extra.sql را اجرا کرده باشی.',
    pgPreviewImage: 'پیش‌نمایش',

    pgMerge: 'هر بخش این صفحه دو منبع دارد: مقدار پایه که در Config.js نوشته شده، و مقداری که تو این‌جا ذخیره می‌کنی و روی آن می‌نشیند. '
           + 'خالی بودن یک فیلد یعنی «همان مقدار کد استفاده شود» — نه «این بخش خالی است». '
           + 'برچسب کنار هر عنوان می‌گوید همین حالا کدام‌یک روی صفحه‌ی عمومی دیده می‌شود.',
    pgFromCode: 'از روی کد',
    pgFromDb: 'ذخیره‌شده',
    pgFromCodeShows: 'همین حالا صفحه این را نشان می‌دهد:',
    pgFromCodeEmpty: 'در کد هم چیزی برای این بخش نوشته نشده، پس روی صفحه‌ی عمومی دیده نمی‌شود.',
    pgFromCodeRows: 'مورد در کد',
    pgCodeRowsNote: 'مورد از Config.js نمایش داده می‌شود. تا وقتی این‌جا چیزی اضافه نکنی همان‌ها می‌مانند؛ '
                  + 'اولین ردیفی که این‌جا بسازی، جای کل فهرست کد را می‌گیرد.',
    pgBlocked: 'قابل ذخیره نیست',
    pgBlockedHint: 'ستون این بخش در پایگاه‌داده وجود ندارد، پس هر چیزی این‌جا بنویسی ذخیره نمی‌شود. '
                 + 'در تب «ساخت SQL» دکمه‌ی «تعمیر ساختار جدول» را بزن.',
    pgRepairHere: 'در تب «ساخت SQL» دکمه‌ی «تعمیر ساختار جدول» را بزن و بعد دوباره این‌جا ذخیره کن.',
    pgReload: 'خواندن دوباره از پایگاه‌داده',
    pgSaveHint: 'بعد از ذخیره، همین صفحه از روی چیزی که واقعاً در پایگاه‌داده نوشته شد دوباره ساخته می‌شود — '
              + 'برچسب‌ها را نگاه کن تا ببینی کدام بخش‌ها ذخیره شدند.',

    // versions
    vsTitle: 'نسخه‌ها',
    vsLede: 'هر انتشار یک ردیف. جدیدترین تاریخ یعنی «نسخه‌ی فعلی» — روی صفحه‌ی بازی و روی کارت داشبورد.',
    vsVersion: 'شماره‌ی نسخه',
    vsDate: 'تاریخ انتشار',
    vsNotes: 'تغییرات این نسخه',
    vsNotesHint: 'هر خط یک مورد.',
    vsDownload: 'لینک دانلود این نسخه (اختیاری)',
    vsDownloadHint: 'خالی بگذاری، از لینک‌های دانلود خود بازی استفاده می‌شود.',
    vsAdd: 'ثبت نسخه',
    vsEdit: 'ویرایش',
    vsDelete: 'حذف',
    vsDeleteAsk: 'این نسخه از تاریخچه حذف شود؟',
    vsNone: 'هنوز نسخه‌ای ثبت نشده.',
    vsCurrent: 'نسخه‌ی فعلی',
    vsBadVersion: 'شماره‌ی نسخه فقط حروف انگلیسی، عدد و . - + _',
    vsClear: 'فرم خالی',

    // new game — platform
    nPlatform: 'این بازی کجا اجرا می‌شود؟',
    nPlatformAndroid: 'اندروید (APK)',
    nPlatformWeb: 'تحت وب (مرورگر)',
    nPlatformBoth: 'هر دو',
    nPlatformHint: 'انتخابت تعیین می‌کند چه چیزی پرسیده شود و چه فایل‌هایی ساخته شود. بازی تحت وب نه package '
                 + 'اندروید دارد، نه دیپ‌لینک، نه AndroidManifest و نه کلاینت اندرویدِ گوگل.',
    nWebNote: 'بازی تحت وب: فقط آدرس بازی لازم است. سه گزینه‌ی دیگر برای این بازی معنایی ندارند، پرسیده نمی‌شوند و در کد هم نمی‌آیند.',
    nAndroidNote: 'بازی اندرویدی: هر لینکی که پر کنی یک دکمه روی کارت بازی می‌شود. AndroidManifest و اسکیم دیپ‌لینک هم ساخته می‌شوند.',
    nBothNote: 'هر دو: هم لینک‌های اندروید و هم آدرس نسخه‌ی تحت وب پرسیده می‌شود.',
    nWebNeeded: 'برای بازی تحت وب، آدرس بازی لازم است.',

    // a11y / view
    skip: 'رفتن به محتوا',
    textSize: 'اندازه‌ی متن',
    textSmall: 'کوچک',
    textNormal: 'عادی',
    textLarge: 'بزرگ',
    themeToggle: 'روشن یا تاریک',
    langLabel: 'زبان پنل',
    tabsLabel: 'بخش‌های پنل',

    // misc
    loading: 'در حال بارگذاری…',
    failed: 'انجام نشد',
    noDb: 'برای این کار LICENSE_DB لازم است.',
    never: 'هیچ‌وقت'
  },

  en: {
    dir: 'ltr',
    brand: 'TheGod',
    tagline: 'Games, storefront and code',

    loginTitle: 'TheGod panel',
    loginSub: 'Same password as the test panel',
    loginPassword: 'Password',
    loginPlaceholder: 'Enter your password',
    loginButton: 'Sign in',
    loginError: 'Incorrect password',
    loginBlocked: 'Too many failed attempts. Try again in fifteen minutes.',
    showPassword: 'Show password',
    logout: 'Log out',

    tabGames: 'Games',
    tabStore: 'Storefront',
    tabOrders: 'Payments',
    tabPlayers: 'Players',
    tabSql: 'SQL builder',
    tabEnv: 'Environment',
    tabNew: 'New game',
    tabUnity: 'Unity code',

    hDatabase: 'Database',
    hProvider: 'Payments',
    hStore: 'Storefront',
    hSandbox: 'Sandbox',
    hOn: 'on',
    hOff: 'off',
    hSandboxWarn: 'Pointed at the NOWPayments sandbox — none of this money is real.',
    hDbWarn: 'LICENSE_DB is not bound. Nothing here can be saved; the site runs on the values in code.',
    hNoMigration: 'If a save fails, run the 0003_games.sql migration.',

    gamesLede: 'Games are defined in code (GAME_REGISTRY in config.js). This screen changes only the things that should not need a deploy.',
    fromCode: 'from code',
    edited: 'edited',
    edit: 'Edit',
    save: 'Save',
    saving: 'Saving…',
    saved: 'Saved',
    reset: 'Back to the coded values',
    resetAsk: 'Drop every override for this game and go back to exactly what the code says?',
    cancel: 'Cancel',

    fName: 'Display name',
    fLogo: 'Logo URL',
    fColor: 'Accent colour',
    fStatus: 'Status',
    fDescFa: 'Description (Persian)',
    fDescEn: 'Description (English)',
    fDescJa: 'Description (Japanese)',
    fMinVersion: 'Minimum client version',
    fNote: 'Internal note',
    fDownload: 'Download links',
    fDownloadHint: 'One per line, as  name=url',
    fDownloadKnown: 'These four names get their own logo and label:',
    fDownloadOther: 'Any other name still works — it renders with a plain download icon and the name you typed.',
    fDeepLink: 'Android deep-link scheme',
    fDeepLinkHint: 'The scheme the build registered in its AndroidManifest. After a Google sign-in the player '
                 + 'is handed back to the game at "scheme://host". Leave it empty to use the value in config.js.',
    fDeepLinkBad: 'A scheme is letters, digits and + - . — no spaces, no "://".',

    purge: 'Delete the database rows',
    purgeAsk: 'Delete every row this game has in game_settings and game_product_overrides?\n\n'
            + 'The game itself is NOT deleted — games live in config.js — and orders and player entitlements '
            + 'are untouched. This only removes the changes layered on top of the code, so the game becomes '
            + 'exactly what config.js says. The next save writes a fresh, clean row.',
    purgeDone: 'Rows deleted. This game now reads straight from config.js.',
    purgeHint: 'If the settings row has filled up with NULLs and you would rather start again, this removes it. '
             + 'Rebuilding is not a separate step: edit the fields and press save.',

    stLive: 'Live',
    stMaintenance: 'Download withdrawn',
    stSoon: 'Coming soon',

    downloadOn: 'The download link works',
    downloadOff: 'The download link is withdrawn',
    downloadToggle: 'Download link',
    downloadHint: 'Turning it off withdraws the download only. The game page, sign-in, purchases and the leaderboard all stay exactly as they are.',

    capabilities: 'Capabilities',
    capOnline: 'Online play',
    capLogin: 'Google sign-in',
    capCloud: 'Cloud save',
    capBoard: 'Leaderboard',
    capStore: 'In-app purchases',
    capNote: 'Capabilities are set in code, not here — each one depends on a binding or a secret.',

    open: 'Preview the pages',
    openHint: 'The pages these settings actually affect. They open in a new tab.',
    openLanding: 'Game page',
    openStore: 'Store',
    openBoard: 'Leaderboard',
    openVersions: 'Versions',

    storeLede: 'Products are defined in code too, because a shipped build already hard-codes their ids. Here you can re-price one, take it off sale, or change the order.',
    pEnabled: 'On sale',
    pPrice: 'Price (USD)',
    pBadge: 'Ribbon',
    pOrder: 'Order',
    pKind: 'Kind',
    pGrant: 'Grants',
    pNone: 'This game has no products. Add an entry to store.products in config.js.',
    badgeNone: 'No ribbon',
    badgeBest: 'Best value',
    badgeNew: 'New',
    badgeSale: 'Sale',

    ordersLede: 'Purchases made on the site. Payment runs through NOWPayments — the same account the licence checkout uses.',
    oTotal: 'Orders',
    oGranted: 'Delivered',
    oOpen: 'Awaiting payment',
    oPartial: 'Underpaid',
    oRevenue: 'Revenue',
    oSearch: 'Search (order id, email, player id)',
    oStatus: 'Status',
    oAny: 'Any',
    oLoad: 'Show orders',
    oNone: 'No order matched those filters.',
    oGrant: 'Deliver by hand',
    oGrantAsk: 'Deliver this paid order manually?',
    oProviderPanel: 'NOWPayments dashboard',
    oProviderHint: 'Invoices, payments and withdrawals live in the NOWPayments dashboard itself. This screen is our side of it.',
    oNotConfigured: 'No NOWPayments key is set. Purchases stay off until NOWPAYMENTS_API_KEY and NOWPAYMENTS_IPN_SECRET exist.',

    playersLede: 'Everybody who has bought something. See what they own, give them something, or take it back.',
    plSearch: 'Email or player id',
    plState: 'State',
    plAny: 'Any',
    plActive: 'Active',
    plRestricted: 'Restricted',
    plBanned: 'Banned',
    plPlayer: 'Player',
    plScore: 'High score',
    plRuns: 'Runs',
    plPlayTime: 'Play time',
    plHours: 'h',
    plMinutes: 'm',
    plJoined: 'Joined',
    plLastSeen: 'Last seen',
    plEmail: 'Email',
    plId: 'Player id',
    plBoard: 'Leaderboard',
    plBoardShown: 'On the board',
    plBoardHidden: 'Hidden by choice',
    plBoardHiddenWhy: 'The player set this on their own account page. It is not changed from here.',
    plTotal: 'Players',
    plManage: 'Manage',
    plRename: 'Change username',
    plRenameHint: '3 to 12 characters, English letters and digits. A name in use is refused.',
    plModeration: 'Restrict & ban',
    plBan: 'Ban',
    plUnban: 'Lift the ban',
    plRestrict7: 'Restrict 7 days',
    plRestrict30: 'Restrict 30 days',
    plLift: 'Lift the restriction',
    plBanAsk: 'Ban this account?\n\nNew score submissions are refused and it drops off the leaderboard. Its purchases are untouched, and you can lift this at any time.',
    plBanEffect: 'While banned or restricted, new score submissions are refused and the account is left off the leaderboard. The account is not deleted and its purchases stay.',
    plBannedAt: 'Banned on',
    plUntil: 'Until',
    plNote: 'Internal note',
    plNoteHint: 'For you only — the player never sees it. Saved when you leave the field.',
    plReasonHint: 'e.g. impossible score',
    plOwnsNone: 'Owns nothing yet.',
    plDanger: 'Delete the account',
    plDelete: 'Delete this account',
    plDeleteHint: 'Removes the player row from the game database: username, score, play time and stats. Orders are NOT removed — they are a financial record. This cannot be undone.',
    plDeleteAsk: 'Permanently delete this player?\n\nTheir score and stats are gone. Their orders remain. This cannot be undone.',
    plNoModeration: 'This game database has no moderation columns yet. Run migrations/0006_player_moderation.sql against this game\'s own database to enable this section.',
    plFind: 'Search',
    plNone: 'No player matched.',
    plOrders: 'orders',
    plSpent: 'spent',
    plOwns: 'Owns',
    plGrant: 'Grant',
    plRevoke: 'Revoke',
    plRevokeAsk: 'Take this product off the player’s account?',
    plQuantity: 'Quantity',
    plReason: 'Reason (kept in the history)',
    plHistory: 'History',

    sqlLede: 'Every game needs its own D1 database, with the exact columns the Worker reads by name. This writes that migration.',
    sqlGame: 'Which game?',
    sqlNewId: 'or type a new id',
    sqlPurchases: 'Purchase mirror table',
    sqlSessions: 'Play sessions table',
    sqlSeed: 'One sample row',
    sqlBuild: 'Build the SQL',
    sqlSettings: 'SQL for the current settings',
    sqlPurge: 'SQL to delete the rows',
    sqlNoRun: 'Generating SQL here executes nothing — it writes text, and you run it with wrangler yourself. '
            + 'The one exception is the "Repair the schema" button, which says so where it is and does its work there.',

    sqlWhat: 'What each button produces',
    sqlWhatSchema: 'Schema — the columns this database actually has. Start here: if a column is missing, nothing you type into the Game page tab is kept.',
    sqlWhatBuild: 'Build the SQL — the migration for a NEW game\'s own database. Existing games do not need it.',
    sqlWhatSettings: 'Current settings — exactly what is stored in this game\'s game_settings row right now, as a statement you can run on another deployment.',
    sqlWhatPurge: 'Delete the rows — removes every stored override for this game so it reads straight from Config.js again.',

    sqlSchema: 'Schema',
    sqlSchemaTitle: 'What these tables look like on this deployment',
    sqlSchemaLede: 'These are the columns that actually exist right now — not what the files in migrations/ say. '
                 + 'When the two disagree, this list is the one that matters.',
    sqlSchemaTable: 'Table',
    sqlSchemaColumn: 'Column',
    sqlSchemaFrom: 'From',
    sqlSchemaOk: 'Current — every column the panel writes exists in this database.',
    sqlSchemaMissing: 'columns missing',
    sqlSchemaMissingWhy: 'The panel cannot write these. Anything typed into the fields they hold is silently lost.',
    sqlSchemaRepair: 'Repair the schema',
    sqlSchemaRepairAsk: 'Add the missing columns to game_settings?\n\n'
                      + 'One ALTER TABLE ADD COLUMN per column. Every one of them is nullable with no default, so '
                      + 'no row is rewritten, nothing that is already stored moves or is deleted, and nothing needs '
                      + 'a backfill.\n\n'
                      + 'This is the only place in the panel that runs SQL itself.',
    sqlSchemaRepaired: 'columns added',
    sqlSchemaNothing: 'Nothing to add — the schema was already current.',
    sqlSchemaPresent: 'present',
    sqlSchemaAbsent: 'missing',
    sqlSchemaLicence: 'Licence database (LICENSE_DB) — settings, prices and the game page',
    sqlSchemaPlayer: 'The game\'s own database — players, scores and cloud saves',
    sqlSchemaUnbound: 'This binding is not wired up on this deployment, so there is nothing to read.',
    sqlSchemaFeature: 'Feature',
    sqlSchemaRow: 'The stored row, untouched',
    sqlSchemaRowLede: 'The raw SELECT * for this game. If the SQL below disagrees with this table, the generator is wrong and the data is not.',
    sqlNoRow: 'There is no game_settings row for this game yet, which means everything is coming from Config.js.',
    copy: 'Copy',
    copied: 'Copied',
    download: 'Download file',

    envLede: 'Everything this Worker reads out of "Variables and secrets", and whether each one is set. '
           + 'No secret value is shown here — only that it exists and how long it is.',
    envReload: 'Read again',
    envSet: 'set',
    envMissing: 'not set',
    envChars: 'chars',
    envHidden: 'value not shown',
    envBindingTitle: 'Bindings (wrangler.jsonc)',
    envBindingHint: 'These are not in "Variables and secrets" — they live in wrangler.jsonc and take effect on deploy.',
    envSharedTitle: 'Site-wide variables',
    envGameTitle: 'This game’s variables',
    envPublicTag: 'public',
    envSecretTag: 'secret',
    envPublicWhy: 'This value is already visible in the Google sign-in URL, or inside the APK.',
    envSecretSafe: 'The "public" rows are things every visitor already sees — the client ID travels in the Google sign-in URL, and the deep-link scheme ships inside the APK. The "secret" row is never sent to the browser; only its length is counted, so you can tell a clean paste from one with something extra in it.',
    envOptional: 'optional',
    envRequired: 'required',

    envRedirectTitle: 'Google redirect URI',
    envRedirectLede: 'If signing in fails with "Error 400: redirect_uri_mismatch", the problem is not this Worker '
                   + 'and not a secret. Google compares the redirect address against a list it keeps, and this '
                   + 'address is not on that list.',
    envRedirectFix: 'Google Cloud Console → APIs & Services → Credentials → the Web OAuth client → '
                  + '"Authorized redirect URIs" → add the line below → Save. Every hostname the site answers on '
                  + 'needs its own line (both amircollider.com and the workers.dev address).',
    envRedirectNow: 'What this deployment sends for this hostname',
    envRedirectWait: 'Google can take a few minutes to apply the change after you save.',
    envRedirectOrigins: 'This screen only sees the hostname you opened it with. If the site answers on more than one, '
                      + 'open each one and add its address too.',

    envDeepTitle: 'Deep-link scheme',
    envDeepNotSecret: 'A deep-link scheme is not a secret: the same string is in the AndroidManifest of every '
                    + 'published APK, where anyone can read it. You can now change it in the Games tab and delete '
                    + 'NEON_KATANA_DEEPLINK_SCHEME from Cloudflare — the fallback in config.js is always there.',
    envDeepEffective: 'In use now',
    envDeepFrom: 'Coming from',
    envDeepFromPanel: 'the panel (database)',
    envDeepFromEnv: 'a Cloudflare variable',
    envDeepFromCode: 'config.js',
    envDeepMigration: 'Saving this to the database needs migrations/0004_deeplink.sql to have been run.',

    newLede: 'A new game has to be added in code, not in the database. This writes that code; you paste it and deploy.',
    newWhy: 'Why in code? Because a game is a D1 binding, four Google secrets, a deep link and an Android package. A row claiming to be a game would draw a card on the dashboard and be unable to sign a single player in.',
    nId: 'Id (used in URLs)',
    nName: 'Game name',
    nIcon: 'Icon (emoji)',
    nColor: 'Colour',
    nPackage: 'Android package',
    nMyket: 'Myket link',
    nGooglePlay: 'Google Play link',
    nApk: 'Direct APK link',
    nWeb: 'Browser game URL',
    nDownloads: 'Download methods',
    nDownloadsHint: 'Each one you fill in becomes a button on the game card. Leave a box empty and that button is not rendered — so "one method only" and "several methods" are the same form.',
    nPrimary: 'Primary method',
    nPrimaryAuto: 'Automatic (the first one you filled in)',
    nPrimaryHint: 'The primary button comes first and gets the accent edge. The others are still shown, just after it.',
    nDescFa: 'Persian description',
    nDescEn: 'English description',
    nDescJa: 'Japanese description',
    nBuild: 'Write the code',
    nBuildHint: 'You can press this now. Anything left blank gets a sensible default, and every one of those is editable from this panel later without a deploy.',
    nIdHint: 'Used in the game\'s URL, its database name and its variable names. Changing it later changes the game\'s public address.',
    nIdFixed: 'id corrected to',

    nEssentials: 'What is actually required',
    nEssentialsHint: 'These three, and nothing else. Every other field has a default, and all of them are editable from this panel later without a deploy.',
    nMore: 'More settings — all optional',
    nMoreHint: 'None of this is needed to generate the code. Fill it in now and it lands in the generated source; '
             + 'leave it and you set it after the deploy from the Games and Game page tabs.',
    nLook: 'How the card looks',
    nMotifs: 'Floating card motifs',
    nMotifsHint: 'A few emoji from the game itself, separated by spaces — 🍎 🍑 🍉 for a game where you cut things. '
               + 'They drift and breathe behind the card on the dashboard. Six at most. Leave it empty and nothing is added.',
    nDescs: 'One-line description',
    nDescsHint: 'One sentence. Used on the dashboard card and as the page description in search results. Editable later from the Games tab.',
    nCapsHint: 'Each capability switches on a part of the site. They live in code because each one depends on a binding or a secret, so the panel cannot change them.',

    nPreview: 'What this will produce',
    nPreviewEmpty: 'Type an id to see what gets derived from it.',
    nPreviewUrl: 'Game page address',
    nPreviewBinding: 'D1 binding name',
    nPreviewDatabase: 'Database name',
    nPreviewConstants: 'Unity constants file',
    nPreviewSecrets: 'Secrets you will have to set',

    nVerify: 'Health check',
    nVerifyLede: 'Press this after you have done the steps above and deployed. Before the deploy the game does not exist yet, so it has nothing useful to report.',
    vfRun: 'Run the check',
    vfLede: 'Everything that is either true or false right now on this deployment: bindings, tables, secrets, links and the game page. Each row says what to do when it is not.',
    vfFailed: 'things are genuinely broken',
    vfWarned: 'things are worth a look',
    vfAllGood: 'Everything is in place.',
    vfPages: 'Pages you can open and look at yourself',
    nSteps: 'The steps, in order',
    nIdTaken: 'That id already exists.',
    nIdBad: 'Lowercase letters, digits and hyphens only.',

    unityLede: 'The whole Unity kit for this game: the constants file, the network layer, Google sign-in, '
             + 'the AndroidManifest, link.xml, the Google console walkthrough and a worked example. '
             + 'Every value is already filled in for the game you pick.',
    unityGame: 'Which game?',
    unityCount: 'files',
    unityPlatformAndroid: 'An Android game — the AndroidManifest and link.xml are generated too.',
    unityPlatformWeb: 'A browser game — a deep link and an AndroidManifest mean nothing here, so neither is generated.',
    unityPlatformBoth: 'Android and browser — the Android files are generated as well.',
    unityOrder: 'Add the constants file first; everything else references it by name.',
    unityAll: 'Download everything (one file)',

    fTags: 'Tags',
    fTagsHint: 'One per line, as  فارسی | English | 日本語 . Leave it empty to use the tags in code.',

    tabPage: 'Game page',
    pgLede: 'What the game\'s own public page says — the page a visitor lands on at its address. '
          + 'None of this needs a deploy.',
    pgOpen: 'Open the page',
    pgHero: 'Header image (banner)',
    pgHeroHint: 'A wide image. Empty falls back to a header built from the game\'s accent colour.',
    pgTagline: 'One-line pitch',
    pgTaglineHint: 'Sits under the game\'s name, and is what a link preview shows in Telegram, WhatsApp and X.',
    pgAbout: 'The long description',
    pgAboutHint: 'A few paragraphs. Blank lines are kept.',
    pgFeatures: 'Features',
    pgFeaturesHint: 'Three to six of them, each an icon and a short phrase. They sit above the fold, before the long text.',
    pgScreens: 'Screenshots',
    pgScreensHint: 'The gallery. A caption doubles as the image\'s alt text, which is the reason to write one.',
    pgVideos: 'Videos',
    pgVideosHint: 'A YouTube or Aparat link plays in the page; any other address renders as a link.',
    pgDevices: 'Runs on',
    pgDevicesHint: 'The kind picks the icon; the label is what a visitor actually reads.',
    pgFaq: 'Frequently asked',
    pgFaqHint: 'The questions asked before anybody installs anything: size, internet, purchases, accounts.',
    pgAdd: 'Add',
    pgRemove: 'Remove this row',
    pgIcon: 'Icon',
    pgUrl: 'URL',
    pgTitle: 'Title',
    pgCaption: 'Caption',
    pgKind: 'Device kind',
    pgLabel: 'Label',
    pgQuestion: 'Question',
    pgAnswer: 'Answer',
    pgEmpty: 'Nothing added yet.',
    pgMigration: 'Saving these sections needs migrations/0008_landing_extra.sql to have been run.',

    pgMerge: 'Every section here has two sources: the baseline written in Config.js, and whatever you save here on top of it. '
           + 'An empty field means "use what the code says" — not "this section is empty". '
           + 'The badge beside each heading tells you which of the two the public page is showing right now.',
    pgFromCode: 'from code',
    pgFromDb: 'saved here',
    pgFromCodeShows: 'The page currently shows:',
    pgFromCodeEmpty: 'The code has nothing for this either, so the section does not appear on the public page.',
    pgFromCodeRows: 'in code',
    pgCodeRowsNote: 'entries are coming from Config.js. They stay until you add something here — '
                  + 'the first row you create replaces the whole code list, not just part of it.',
    pgBlocked: 'cannot be saved',
    pgBlockedHint: 'This section has no column in the database, so nothing typed here is kept. '
                 + 'Press "Repair the schema" on the SQL tab.',
    pgRepairHere: 'Press "Repair the schema" on the SQL tab, then save this screen again.',
    pgReload: 'Re-read from the database',
    pgSaveHint: 'After a save this screen is rebuilt from what actually reached the database — '
              + 'read the badges to see which sections were stored.',
    pgPreviewImage: 'Preview',

    vsTitle: 'Versions',
    vsLede: 'One row per release. The newest date is "the current version" — on the game\'s page and on its dashboard card.',
    vsVersion: 'Version',
    vsDate: 'Released',
    vsNotes: 'What changed',
    vsNotesHint: 'One item per line.',
    vsDownload: 'Download link for this release (optional)',
    vsDownloadHint: 'Empty uses the game\'s own download links.',
    vsAdd: 'Publish this version',
    vsEdit: 'Edit',
    vsDelete: 'Delete',
    vsDeleteAsk: 'Remove this version from the history?',
    vsNone: 'No version has been published yet.',
    vsCurrent: 'Current',
    vsBadVersion: 'A version is letters, digits and . - + _',
    vsClear: 'Clear the form',

    nPlatform: 'Where does this game run?',
    nPlatformAndroid: 'Android (APK)',
    nPlatformWeb: 'Browser',
    nPlatformBoth: 'Both',
    nPlatformHint: 'Your answer decides what is asked for and what is generated. A browser game has no Android '
                 + 'package, no deep link, no AndroidManifest and no Android Google client.',
    nWebNote: 'Browser game: the game\'s URL is all that is needed. The other three boxes mean nothing here, so they are not asked for and never reach the code.',
    nAndroidNote: 'Android game: every link you fill in becomes a button on the game card. The AndroidManifest and the deep-link scheme are generated too.',
    nBothNote: 'Both: the Android store links and the browser URL are asked for.',
    nWebNeeded: 'A browser game needs its URL.',

    skip: 'Skip to content',
    textSize: 'Text size',
    textSmall: 'Small',
    textNormal: 'Normal',
    textLarge: 'Large',
    themeToggle: 'Light or dark',
    langLabel: 'Panel language',
    tabsLabel: 'Panel sections',

    loading: 'Loading…',
    failed: 'That did not work',
    noDb: 'That needs LICENSE_DB.',
    never: 'never'
  },

  ja: {
    dir: 'ltr',
    brand: 'TheGod',
    tagline: 'ゲーム・ストア・コード管理',

    loginTitle: 'TheGod パネル',
    loginSub: 'テストパネルと同じパスワード',
    loginPassword: 'パスワード',
    loginPlaceholder: 'パスワードを入力',
    loginButton: 'サインイン',
    loginError: 'パスワードが正しくありません',
    loginBlocked: 'ログインの失敗が多すぎます。15分後にもう一度お試しください。',
    showPassword: 'パスワードを表示',
    logout: 'ログアウト',

    tabGames: 'ゲーム',
    tabStore: 'ストア',
    tabOrders: '決済',
    tabPlayers: 'プレイヤー',
    tabSql: 'SQL 生成',
    tabEnv: '環境変数',
    tabNew: '新規ゲーム',
    tabUnity: 'Unity コード',

    hDatabase: 'データベース',
    hProvider: '決済',
    hStore: 'ストア',
    hSandbox: 'サンドボックス',
    hOn: '有効',
    hOff: '無効',
    hSandboxWarn: 'NOWPayments のサンドボックスに接続中 — 実際の入金はありません。',
    hDbWarn: 'LICENSE_DB が未バインドです。保存はできませんが、サイトはコードの値で動作します。',
    hNoMigration: '保存に失敗する場合は 0003_games.sql を適用してください。',

    gamesLede: 'ゲームはコード（config.js の GAME_REGISTRY）で定義されます。ここではデプロイ不要で変えるべき項目だけを変更します。',
    fromCode: 'コード由来',
    edited: '変更あり',
    edit: '編集',
    save: '保存',
    saving: '保存中…',
    saved: '保存しました',
    reset: 'コードの値に戻す',
    resetAsk: 'このゲームの上書きをすべて破棄し、コードの内容に戻しますか?',
    cancel: 'キャンセル',

    fName: '表示名',
    fLogo: 'ロゴ URL',
    fColor: 'アクセント色',
    fStatus: '状態',
    fDescFa: '説明（ペルシャ語）',
    fDescEn: '説明（英語）',
    fDescJa: '説明（日本語）',
    fMinVersion: '最低クライアントバージョン',
    fNote: '内部メモ',
    fDownload: 'ダウンロードリンク',
    fDownloadHint: '1 行につき  名前=URL',
    fDownloadKnown: 'この 4 つの名前は専用のロゴとラベルが付きます：',
    fDownloadOther: '他の名前も使えますが、汎用のダウンロードアイコンと入力した名前で表示されます。',
    fDeepLink: 'Android ディープリンクのスキーム',
    fDeepLinkHint: 'ビルドが AndroidManifest に登録したスキームです。Google サインイン後、プレイヤーは '
                 + '「scheme://host」でゲームに戻ります。空欄なら config.js の値が使われます。',
    fDeepLinkBad: 'スキームは英字・数字・+ - . のみ。空白や "://" は使えません。',

    purge: 'データベースの行を削除',
    purgeAsk: 'このゲームの game_settings と game_product_overrides の行をすべて削除しますか？\n\n'
            + 'ゲーム自体は削除されません（ゲームは config.js にあります）。注文とプレイヤーの所有物にも影響しません。'
            + 'コードの上に重ねた変更だけが消え、ゲームは config.js のとおりになります。次に保存すると新しい行が作られます。',
    purgeDone: '行を削除しました。このゲームは config.js をそのまま読んでいます。',
    purgeHint: '設定行が NULL だらけになって作り直したい場合は、これで削除できます。作り直しは別作業ではありません。'
             + '編集して保存を押すだけです。',

    stLive: '公開中',
    stMaintenance: 'ダウンロード停止',
    stSoon: '近日公開',

    downloadOn: 'ダウンロードリンクは有効です',
    downloadOff: 'ダウンロードリンクを停止しています',
    downloadToggle: 'ダウンロードリンク',
    downloadHint: 'オフにするとダウンロードのみ停止します。ページ・ログイン・購入・ランキングはそのままです。',

    capabilities: '機能',
    capOnline: 'オンラインプレイ',
    capLogin: 'Google サインイン',
    capCloud: 'クラウドセーブ',
    capBoard: 'ランキング',
    capStore: 'アプリ内購入',
    capNote: '機能はここではなくコードで設定します。各機能はバインディングやシークレットに依存するためです。',

    open: 'ページをプレビュー',
    openHint: 'この設定が反映されるページです。新しいタブで開きます。',
    openLanding: 'ゲームページ',
    openStore: 'ストア',
    openBoard: 'ランキング',
    openVersions: 'バージョン',

    storeLede: '商品もコードで定義します。配布済みビルドが ID を保持しているためです。ここでは価格変更・販売停止・並び替えができます。',
    pEnabled: '販売中',
    pPrice: '価格（USD）',
    pBadge: 'リボン',
    pOrder: '並び順',
    pKind: '種類',
    pGrant: '付与内容',
    pNone: 'このゲームには商品がありません。config.js の store.products に追加してください。',
    badgeNone: 'なし',
    badgeBest: 'お得',
    badgeNew: '新着',
    badgeSale: 'セール',

    ordersLede: 'サイトでの購入履歴です。決済はライセンス販売と同じ NOWPayments アカウントを使用します。',
    oTotal: '注文数',
    oGranted: '付与済み',
    oOpen: '支払い待ち',
    oPartial: '不足入金',
    oRevenue: '売上',
    oSearch: '検索（注文 ID・メール・プレイヤー ID）',
    oStatus: '状態',
    oAny: 'すべて',
    oLoad: '注文を表示',
    oNone: '条件に一致する注文はありません。',
    oGrant: '手動で付与',
    oGrantAsk: 'この支払い済み注文を手動で付与しますか?',
    oProviderPanel: 'NOWPayments ダッシュボード',
    oProviderHint: '請求書・入金・出金は NOWPayments 側のダッシュボードにあります。この画面は当方側の記録です。',
    oNotConfigured: 'NOWPayments のキーが未設定です。NOWPAYMENTS_API_KEY と NOWPAYMENTS_IPN_SECRET を設定するまで購入は無効です。',

    playersLede: '購入したことのある人の一覧です。所有物の確認、付与、取り消しができます。',
    plSearch: 'メールまたはプレイヤー ID',
    plState: '状態',
    plAny: 'すべて',
    plActive: '通常',
    plRestricted: '制限中',
    plBanned: 'BAN',
    plPlayer: 'プレイヤー',
    plScore: 'ハイスコア',
    plRuns: 'プレイ回数',
    plPlayTime: 'プレイ時間',
    plHours: '時間',
    plMinutes: '分',
    plJoined: '登録日',
    plLastSeen: '最終ログイン',
    plEmail: 'メール',
    plId: 'プレイヤー ID',
    plBoard: 'ランキング',
    plBoardShown: 'ランキングに表示',
    plBoardHidden: '本人が非表示に設定',
    plBoardHiddenWhy: 'プレイヤー自身がアカウントページで設定したものです。ここからは変更しません。',
    plTotal: 'プレイヤー数',
    plManage: '管理',
    plRename: 'ユーザー名を変更',
    plRenameHint: '3〜12 文字、英数字のみ。使用中の名前は拒否されます。',
    plModeration: '制限と BAN',
    plBan: 'BAN する',
    plUnban: 'BAN を解除',
    plRestrict7: '7 日間制限',
    plRestrict30: '30 日間制限',
    plLift: '制限を解除',
    plBanAsk: 'このアカウントを BAN しますか？\n\n新しいスコア送信は拒否され、ランキングから外れます。購入履歴はそのままで、いつでも解除できます。',
    plBanEffect: 'BAN または制限中は、新しいスコア送信が拒否されランキングから除外されます。アカウントは削除されず、購入履歴も残ります。',
    plBannedAt: 'BAN 日時',
    plUntil: '期限',
    plNote: '内部メモ',
    plNoteHint: '自分用です。プレイヤーには見えません。フォーカスを外すと保存されます。',
    plReasonHint: '例：不正なスコア',
    plOwnsNone: 'まだ何も所有していません。',
    plDanger: 'アカウントを削除',
    plDelete: 'このアカウントを削除',
    plDeleteHint: 'ゲームデータベースからプレイヤー行を削除します（ユーザー名・スコア・プレイ時間・統計）。注文は財務記録のため削除されません。元に戻せません。',
    plDeleteAsk: 'このプレイヤーを完全に削除しますか？\n\nスコアと統計は失われます。注文は残ります。元に戻せません。',
    plNoModeration: 'このゲームのデータベースにはまだモデレーション用の列がありません。migrations/0006_player_moderation.sql をこのゲームのデータベースに対して実行してください。',
    plFind: '検索',
    plNone: '該当するプレイヤーはいません。',
    plOrders: '件の注文',
    plSpent: '支出',
    plOwns: '所有',
    plGrant: '付与',
    plRevoke: '取り消し',
    plRevokeAsk: 'この商品をプレイヤーのアカウントから取り消しますか?',
    plQuantity: '数量',
    plReason: '理由（履歴に残ります）',
    plHistory: '履歴',

    sqlLede: '各ゲームには専用の D1 データベースが必要で、Worker が名前で読む列が決まっています。その移行 SQL を生成します。',
    sqlGame: '対象のゲーム',
    sqlNewId: 'または新しい ID を入力',
    sqlPurchases: '購入ミラーテーブル',
    sqlSessions: 'プレイセッションテーブル',
    sqlSeed: 'サンプル行を 1 件',
    sqlBuild: 'SQL を生成',
    sqlSettings: '現在の設定の SQL',
    sqlPurge: '行を削除する SQL',
    sqlNoRun: 'ここでの SQL 生成は何も実行しません。テキストを作るだけで、実行は wrangler でご自身が行います。'
            + '例外は「スキーマを修復」ボタンだけで、その場で明示したうえで実際に実行します。',

    sqlWhat: '各ボタンが生成するもの',
    sqlWhatSchema: 'スキーマ — このデータベースに実際に存在する列。まずここを確認してください。列が欠けていると、「ゲームページ」タブに入力した内容は保存されません。',
    sqlWhatBuild: 'SQL を生成 — 新しいゲーム専用データベースの移行 SQL。既存のゲームには不要です。',
    sqlWhatSettings: '現在の設定 — このゲームの game_settings 行に今まさに保存されている内容を、別のデプロイでも実行できる文として出力します。',
    sqlWhatPurge: '行を削除 — このゲームの保存済みの上書きをすべて取り除き、再び Config.js の内容で表示されるようにします。',

    sqlSchema: 'スキーマ',
    sqlSchemaTitle: 'このデプロイでのテーブル構造',
    sqlSchemaLede: 'migrations/ のファイルではなく、今このデータベースに実際に存在する列の一覧です。'
                 + '両者が食い違う場合は、この一覧が正です。',
    sqlSchemaTable: 'テーブル',
    sqlSchemaColumn: '列',
    sqlSchemaFrom: '追加元',
    sqlSchemaOk: '最新です。パネルが書き込むすべての列がこのデータベースに存在します。',
    sqlSchemaMissing: '列が不足',
    sqlSchemaMissingWhy: 'パネルはこれらの列に書き込めません。対応するフィールドに入力した内容は黙って失われます。',
    sqlSchemaRepair: 'スキーマを修復',
    sqlSchemaRepairAsk: '不足している列を game_settings に追加しますか?\n\n'
                      + '列ごとに ALTER TABLE ADD COLUMN を 1 文ずつ実行します。すべて nullable でデフォルト値なしのため、'
                      + '既存の行は書き換えられず、保存済みのデータが移動・削除されることも、埋め直しが必要になることもありません。\n\n'
                      + 'パネルが自ら SQL を実行するのはここだけです。',
    sqlSchemaRepaired: '列を追加しました',
    sqlSchemaNothing: '追加するものはありません。スキーマはすでに最新でした。',
    sqlSchemaPresent: 'あり',
    sqlSchemaAbsent: 'なし',
    sqlSchemaLicence: 'ライセンス DB (LICENSE_DB) — 設定・価格・ゲームページ',
    sqlSchemaPlayer: 'ゲーム専用 DB — プレイヤー・スコア・クラウドセーブ',
    sqlSchemaUnbound: 'このバインディングはこのデプロイに接続されていないため、読み取れる情報はありません。',
    sqlSchemaFeature: '機能',
    sqlSchemaRow: '保存されている行（そのまま）',
    sqlSchemaRowLede: 'このゲームの SELECT * の生の結果です。下の SQL がこの表と食い違う場合、誤っているのは生成側でデータではありません。',
    sqlNoRow: 'このゲームの game_settings 行はまだありません。つまりすべて Config.js から読まれています。',
    copy: 'コピー',
    copied: 'コピーしました',
    download: 'ファイルを保存',

    envLede: 'この Worker が「Variables and secrets」から読む値と、それぞれ設定済みかどうかの一覧です。'
           + 'シークレットの中身は表示しません。存在と文字数だけです。',
    envReload: '再読み込み',
    envSet: '設定済み',
    envMissing: '未設定',
    envChars: '文字',
    envHidden: '値は表示しません',
    envBindingTitle: 'バインディング（wrangler.jsonc）',
    envBindingHint: 'これらは「Variables and secrets」ではなく wrangler.jsonc で定義し、デプロイで有効になります。',
    envSharedTitle: 'サイト共通の変数',
    envGameTitle: 'このゲームの変数',
    envPublicTag: '公開',
    envSecretTag: '秘密',
    envPublicWhy: 'この値は Google サインインの URL や APK の中で既に見えています。',
    envSecretSafe: '「公開」の行は、訪問者が既に目にしている値です。クライアント ID は Google サインインの URL に含まれ、ディープリンクのスキームは APK に入っています。「秘密」の行はブラウザーに送られません。文字数だけを数えているので、余計なものが混ざった貼り付けを見分けられます。',
    envOptional: '任意',
    envRequired: '必須',

    envRedirectTitle: 'Google のリダイレクト URI',
    envRedirectLede: '「Error 400: redirect_uri_mismatch」が出る場合、原因はこの Worker でもシークレットでもありません。'
                   + 'Google が自分の持つ一覧と照合していて、この URL がその一覧に無いということです。',
    envRedirectFix: 'Google Cloud Console → APIs & Services → Credentials → Web タイプの OAuth クライアント → '
                  + '「Authorized redirect URIs」→ 下の 1 行を追加 → 保存。サイトが応答するホスト名ごとに 1 行必要です'
                  + '（amircollider.com と workers.dev の両方）。',
    envRedirectNow: 'このホスト名で実際に送信される URL',
    envRedirectWait: '保存後、Google に反映されるまで数分かかることがあります。',
    envRedirectOrigins: 'この画面は今開いているホスト名しか見えません。複数のドメインで動く場合は、それぞれ開いて追加してください。',

    envDeepTitle: 'ディープリンクのスキーム',
    envDeepNotSecret: 'ディープリンクのスキームはシークレットではありません。同じ文字列が公開済み APK の '
                    + 'AndroidManifest に入っていて誰でも読めます。これからは「ゲーム」タブで変更でき、'
                    + 'NEON_KATANA_DEEPLINK_SCHEME は Cloudflare から削除して構いません。config.js の既定値が常にあります。',
    envDeepEffective: '現在の値',
    envDeepFrom: '取得元',
    envDeepFromPanel: 'パネル（データベース）',
    envDeepFromEnv: 'Cloudflare の変数',
    envDeepFromCode: 'config.js',
    envDeepMigration: 'この値をデータベースに保存するには migrations/0004_deeplink.sql の実行が必要です。',

    newLede: '新しいゲームはデータベースではなくコードに追加します。ここでそのコードを生成しますので、貼り付けてデプロイしてください。',
    newWhy: 'なぜコードなのか。ゲームとは D1 バインディング、4 つの Google シークレット、ディープリンク、Android パッケージだからです。行だけ作ってもカードが表示されるだけで、誰もログインできません。',
    nId: 'ID（URL で使用）',
    nName: 'ゲーム名',
    nIcon: 'アイコン（絵文字）',
    nColor: '色',
    nPackage: 'Android パッケージ',
    nMyket: 'Myket リンク',
    nGooglePlay: 'Google Play リンク',
    nApk: 'APK 直リンク',
    nWeb: 'ブラウザーゲームの URL',
    nDownloads: '配信方法',
    nDownloadsHint: '入力した数だけゲームカードにボタンが並びます。空欄の項目はボタンが表示されません。「1 つだけ」も「複数」も同じフォームで設定できます。',
    nPrimary: '主な配信方法',
    nPrimaryAuto: '自動（最初に入力したもの）',
    nPrimaryHint: '主なボタンが先頭に来てアクセント枠が付きます。他のボタンもその後ろに表示されます。',
    nDescFa: 'ペルシャ語の説明',
    nDescEn: '英語の説明',
    nDescJa: '日本語の説明',
    nBuild: 'コードを生成',
    nBuildHint: '今すぐ押して構いません。未入力の項目には妥当な既定値が入り、いずれも後からデプロイなしでこのパネルから変更できます。',
    nIdHint: 'ゲームの URL、データベース名、変数名に使われます。後から変更するとゲームの公開アドレスも変わります。',
    nIdFixed: 'ID を修正しました：',

    nEssentials: '本当に必要な項目',
    nEssentialsHint: 'この 3 つだけです。他の項目には既定値があり、いずれも後からデプロイなしでこのパネルから変更できます。',
    nMore: 'その他の設定 — すべて任意',
    nMoreHint: 'コード生成にはどれも不要です。今入力すれば生成されるソースに含まれ、'
             + '入力しなければデプロイ後に「ゲーム」「ゲームページ」タブから設定します。',
    nLook: 'カードの見た目',
    nMotifs: 'カードに浮かぶモチーフ',
    nMotifsHint: 'ゲームに登場するものを絵文字で、スペース区切りで数個 — 何かを斬るゲームなら 🍎 🍑 🍉 など。'
               + 'ダッシュボードのカード背面でふわふわと呼吸するように動きます。最大 6 個。空欄なら何も追加されません。',
    nDescs: '一行の説明',
    nDescsHint: '一文で。ダッシュボードのカードと検索結果のページ説明に使われます。後から「ゲーム」タブで変更できます。',
    nCapsHint: '各機能はサイトの一部を有効にします。それぞれバインディングやシークレットに依存するためコード側で定義され、パネルからは変更できません。',

    nPreview: '生成されるもの',
    nPreviewEmpty: 'ID を入力すると、そこから導出される内容がここに表示されます。',
    nPreviewUrl: 'ゲームページのアドレス',
    nPreviewBinding: 'D1 バインディング名',
    nPreviewDatabase: 'データベース名',
    nPreviewConstants: 'Unity 定数ファイル',
    nPreviewSecrets: '設定が必要なシークレット',

    nVerify: 'ヘルスチェック',
    nVerifyLede: '上の手順を実行してデプロイしたあとに押してください。デプロイ前はゲームがまだ存在しないため、有用な結果は得られません。',
    vfRun: 'チェックを実行',
    vfLede: 'このデプロイで今まさに成立しているか否かがはっきりする項目：バインディング、テーブル、シークレット、リンク、ゲームページ。各行に対処方法も表示されます。',
    vfFailed: '件に重大な問題があります',
    vfWarned: '件は確認をおすすめします',
    vfAllGood: 'すべて揃っています。',
    vfPages: '自分で開いて確認できるページ',
    nSteps: '手順（順番どおりに）',
    nIdTaken: 'その ID は既に存在します。',
    nIdBad: '小文字英字・数字・ハイフンのみ。',

    unityLede: 'このゲーム用の Unity キット一式：定数ファイル、ネットワーク層、Google サインイン、'
             + 'AndroidManifest、link.xml、Google コンソール手順、実装例。値は選択したゲーム用に設定済みです。',
    unityGame: '対象のゲーム',
    unityCount: 'ファイル',
    unityPlatformAndroid: 'Android ゲーム — AndroidManifest と link.xml も生成されます。',
    unityPlatformWeb: 'ブラウザーゲーム — ディープリンクと AndroidManifest は不要なため生成されません。',
    unityPlatformBoth: 'Android とブラウザーの両方 — Android 用ファイルも生成されます。',
    unityOrder: '最初に定数ファイルを追加してください。他のすべてがこれを参照します。',
    unityAll: 'すべてダウンロード（1 ファイル）',

    fTags: 'タグ',
    fTagsHint: '1 行 1 タグ、  فارسی | English | 日本語  の形式。空ならコードのタグを使います。',

    tabPage: 'ゲームページ',
    pgLede: 'ゲーム自身の公開ページの内容です。デプロイは不要です。',
    pgOpen: 'ページを開く',
    pgHero: 'ヘッダー画像（バナー）',
    pgHeroHint: '横長の画像 URL。空ならアクセント色から生成されたヘッダーになります。',
    pgTagline: '1 行のキャッチコピー',
    pgTaglineHint: 'ゲーム名の下に表示され、リンクプレビュー（Telegram・WhatsApp・X）にも使われます。',
    pgAbout: '長い説明',
    pgAboutHint: '数段落。空行は保持されます。',
    pgFeatures: '特徴',
    pgFeaturesHint: '3〜6 件。アイコンと短い語句。長文より上に表示されます。',
    pgScreens: 'スクリーンショット',
    pgScreensHint: 'ギャラリーです。キャプションは alt テキストとしても使われます。',
    pgVideos: '動画',
    pgVideosHint: 'YouTube と Aparat はページ内で再生され、他の URL はリンクとして表示されます。',
    pgDevices: '対応デバイス',
    pgDevicesHint: '種類がアイコンを決め、ラベルが実際に読まれる文字です。',
    pgFaq: 'よくある質問',
    pgFaqHint: 'インストール前に聞かれること：容量、通信、購入、アカウント。',
    pgAdd: '追加',
    pgRemove: 'この行を削除',
    pgIcon: 'アイコン',
    pgUrl: 'URL',
    pgTitle: 'タイトル',
    pgCaption: 'キャプション',
    pgKind: 'デバイス種別',
    pgLabel: 'ラベル',
    pgQuestion: '質問',
    pgAnswer: '回答',
    pgEmpty: 'まだ何も追加されていません。',
    pgMigration: 'これらの保存には migrations/0008_landing_extra.sql の実行が必要です。',

    pgMerge: 'このページの各セクションには 2 つの供給元があります。Config.js に書かれたベースラインと、ここで保存してその上に重ねる値です。'
           + 'フィールドが空なのは「このセクションが空」ではなく「コードの値を使う」という意味です。'
           + '各見出し横のバッジが、公開ページに今どちらが表示されているかを示します。',
    pgFromCode: 'コード由来',
    pgFromDb: 'ここで保存',
    pgFromCodeShows: '現在ページに表示されている内容：',
    pgFromCodeEmpty: 'コード側にも内容がないため、公開ページには表示されません。',
    pgFromCodeRows: '件（コード）',
    pgCodeRowsNote: '件が Config.js から表示されています。ここに追加するまではそのままです。'
                  + 'ここで 1 行でも作成すると、コード側のリスト全体が置き換わります。',
    pgBlocked: '保存できません',
    pgBlockedHint: 'このセクションの列がデータベースに存在しないため、入力しても保存されません。'
                 + 'SQL タブの「スキーマを修復」を実行してください。',
    pgRepairHere: 'SQL タブの「スキーマを修復」を実行してから、この画面をもう一度保存してください。',
    pgReload: 'データベースから再読み込み',
    pgSaveHint: '保存後、この画面は実際にデータベースへ書き込まれた内容から再構築されます。'
              + 'バッジを見れば、どのセクションが保存されたか分かります。',
    pgPreviewImage: 'プレビュー',

    vsTitle: 'バージョン',
    vsLede: 'リリースごとに 1 行。最新の日付が「現在のバージョン」です。',
    vsVersion: 'バージョン',
    vsDate: 'リリース日',
    vsNotes: '変更点',
    vsNotesHint: '1 行 1 項目。',
    vsDownload: 'このリリースのダウンロード URL（任意）',
    vsDownloadHint: '空ならゲーム自身のダウンロードリンクを使います。',
    vsAdd: 'このバージョンを公開',
    vsEdit: '編集',
    vsDelete: '削除',
    vsDeleteAsk: 'この バージョンを履歴から削除しますか？',
    vsNone: 'まだバージョンがありません。',
    vsCurrent: '現在',
    vsBadVersion: 'バージョンは英数字と . - + _ のみ',
    vsClear: 'フォームをクリア',

    nPlatform: 'このゲームはどこで動きますか？',
    nPlatformAndroid: 'Android（APK）',
    nPlatformWeb: 'ブラウザー',
    nPlatformBoth: '両方',
    nPlatformHint: '選択によって入力項目と生成ファイルが変わります。ブラウザーゲームには Android パッケージも '
                 + 'ディープリンクも AndroidManifest も Android クライアントもありません。',
    nWebNote: 'ブラウザーゲーム：必要なのは URL だけです。他の 3 項目は意味を持たないため入力もコード生成もされません。',
    nAndroidNote: 'Android ゲーム：入力したリンクの数だけカードにボタンが並びます。AndroidManifest とスキームも生成されます。',
    nBothNote: '両方：Android のストアリンクとブラウザー URL の両方を入力します。',
    nWebNeeded: 'ブラウザーゲームには URL が必要です。',

    skip: '本文へスキップ',
    textSize: '文字サイズ',
    textSmall: '小',
    textNormal: '標準',
    textLarge: '大',
    themeToggle: 'ライト / ダーク',
    langLabel: 'パネルの言語',
    tabsLabel: 'パネルのセクション',

    loading: '読み込み中…',
    failed: '実行できませんでした',
    noDb: 'これには LICENSE_DB が必要です。',
    never: 'なし'
  }
}


// ==========================================
// Stylesheet
// Shares the token names the rest of the site uses, so the
// panel is recognisably the same product rather than an admin
// tool bolted to the side of it.
//
// ------------------------------------------------------------
// THE THREE THINGS THAT MADE IT UNREADABLE
// ------------------------------------------------------------
// 1. Bidi. The panel's default language is Persian, so <html>
//    is dir="rtl" - and an unmarked Latin run inside RTL text is
//    reordered by the browser. "NEON_KATANA_DB (required)"
//    renders as "(required) NEON_KATANA_DB", a URL ending in a
//    slash grows one at the front, and a version like 1.2.10
//    comes out backwards. Every identifier, key, URL, price and
//    version below is therefore isolated: `unicode-bidi:isolate`
//    plus `direction:ltr`, which tells the browser this run is
//    its own paragraph and stops the reordering at its edges.
//
// 2. Size. Everything was expressed as a fraction of 1em on a
//    16px root: .76em hints, .78em code, .72em chips. That is
//    11-12px of Latin text inside a Persian face at a weight
//    chosen for headings. The scale below starts at .82em and
//    the whole panel is multiplied by --ui-scale, which the text
//    size control in the header sets and localStorage keeps.
//
// 3. Scrollbars. The old rule hid them outright - on <html> and
//    on every strip that scrolls. A table wider than its box
//    then had no indication that it scrolled at all, which is
//    "I cannot get to it" rather than "it looks untidy". They
//    are back, styled thin, in both themes.
//
// The font is the fourth: Vazirmatn is fetched from Google
// Fonts, which is not reachable everywhere this panel is opened.
// The stack below therefore names real fallbacks for all three
// scripts rather than ending at sans-serif, and the panel is
// designed to be legible when the download never lands.
// ==========================================
function panelCss() {
  return `
    *{margin:0;padding:0;box-sizing:border-box}

    :root{
      --brand:#7c4dff;--brand-2:#b39dff;
      --ok:#0f8a4a;--warn:#b56a00;--err:#c62828;--info:#1b5fd9;
      --radius:16px;--maxw:1180px;

      --bg:#f4f6fc;--bg-2:#e9ecf8;--surface:#fff;--surface-2:#f4f6fc;
      --text:#161c29;--dim:#525c72;--border:rgba(20,28,45,.16);
      --shadow:0 10px 30px rgba(20,28,45,.09);
      --focus:#1b5fd9;
      --code-bg:#0f1524;--code-fg:#e4ebfa;

      /* Persian first, then a Latin UI face, then Japanese, then
         a Persian-capable fallback that every Windows install
         has had for twenty years. Ending at sans-serif alone is
         what produces the mismatched-glyph look when the web
         font does not arrive. */
      --font-ui:'Vazirmatn','Segoe UI',Roboto,-apple-system,BlinkMacSystemFont,
                'Noto Sans JP','Hiragino Sans','Yu Gothic',Meiryo,
                Tahoma,'Iranian Sans',Arial,sans-serif;
      --font-mono:ui-monospace,'JetBrains Mono','Cascadia Mono','SF Mono',
                  Consolas,'Liberation Mono','Courier New',monospace;

      color-scheme:light;
    }

    :root[data-theme="dark"]{
      --bg:#0b0f18;--bg-2:#111827;--surface:#151d2b;--surface-2:#1b2436;
      --text:#eef2fa;--dim:#a6b2c9;--border:rgba(255,255,255,.14);
      --shadow:0 14px 36px rgba(0,0,0,.45);
      --ok:#3ecf7e;--warn:#f0a92e;--err:#ff6b6b;--info:#6ba4ff;
      --focus:#8fb4ff;
      color-scheme:dark;
    }
    @media (prefers-color-scheme:dark){
      :root:not([data-theme="light"]){
        --bg:#0b0f18;--bg-2:#111827;--surface:#151d2b;--surface-2:#1b2436;
        --text:#eef2fa;--dim:#a6b2c9;--border:rgba(255,255,255,.14);
        --shadow:0 14px 36px rgba(0,0,0,.45);
        --ok:#3ecf7e;--warn:#f0a92e;--err:#ff6b6b;--info:#6ba4ff;
        --focus:#8fb4ff;
        color-scheme:dark;
      }
    }

    /* The text size control writes --ui-scale on <html>. Every
       size in this sheet is relative to the root, so one number
       moves the whole panel rather than 60 declarations. */
    html{
      font-size:calc(16px * var(--ui-scale,1));
      -webkit-text-size-adjust:100%;
      scrollbar-width:thin;
      scrollbar-color:var(--border) transparent;
    }
    ::-webkit-scrollbar{width:10px;height:10px}
    ::-webkit-scrollbar-track{background:transparent}
    ::-webkit-scrollbar-thumb{background:var(--border);border-radius:10px;
      border:2px solid transparent;background-clip:content-box}
    ::-webkit-scrollbar-thumb:hover{background:var(--dim);background-clip:content-box}

    body{font-family:var(--font-ui);min-height:100vh;line-height:1.75;
      padding:20px 16px 60px;color:var(--text);
      background:radial-gradient(900px 480px at 82% -10%,rgba(124,77,255,.14),transparent 62%),
                 linear-gradient(170deg,var(--bg),var(--bg-2));background-attachment:fixed;
      -webkit-font-smoothing:antialiased}
    .wrap{max-width:var(--maxw);margin:0 auto}

    /* ---- bidi isolation ----
       The single most important block in this file. See the note
       at the top: without it, every Latin identifier inside the
       Persian UI is rendered in an order nobody typed. */
    code,kbd,samp,pre,.mono,.ltr{
      direction:ltr;unicode-bidi:isolate;text-align:left;
      font-family:var(--font-mono);font-variant-ligatures:none}
    code,kbd,samp{font-size:.94em;word-break:break-word}
    .num{direction:ltr;unicode-bidi:isolate;font-variant-numeric:tabular-nums}
    [dir="ltr"]{unicode-bidi:isolate}
    input[dir="ltr"],textarea[dir="ltr"]{direction:ltr;text-align:left;font-family:var(--font-mono)}
    a[href^="http"],.url{unicode-bidi:isolate}

    /* ---- focus ----
       Two rules rather than one: the ring, and a guarantee it is
       not clipped by the rounded card it sits inside. */
    :focus-visible{outline:3px solid var(--focus);outline-offset:2px;border-radius:8px}
    .tabs button:focus-visible,.seg button:focus-visible{outline-offset:-2px}

    ::selection{background:rgba(124,77,255,.28)}

    .skip{position:absolute;inset-inline-start:-9999px;top:8px;z-index:99;
      padding:10px 16px;border-radius:10px;background:var(--surface);
      border:1px solid var(--border);font-weight:700;text-decoration:none;color:var(--text)}
    .skip:focus{inset-inline-start:8px}

    /* ---- top ---- */
    .top{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-block-end:20px}
    .logo{display:flex;align-items:center;gap:12px}
    .logo-mark{width:48px;height:48px;border-radius:14px;display:flex;align-items:center;justify-content:center;
      font-size:1.5em;color:#fff;background:linear-gradient(135deg,var(--brand),var(--brand-2));
      box-shadow:0 8px 22px rgba(124,77,255,.36)}
    .logo b{display:block;font-size:1.16em;font-weight:800;letter-spacing:.3px}
    .logo>span>span{font-size:.86em;color:var(--dim)}
    .top-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap}

    .seg{display:inline-flex;padding:3px;gap:2px;border-radius:11px;background:var(--surface);border:1px solid var(--border)}
    .seg button{border:0;cursor:pointer;padding:8px 12px;border-radius:8px;font:inherit;font-size:.85em;
      font-weight:700;color:var(--dim);background:transparent;min-height:34px}
    .seg button:hover{color:var(--text)}
    .seg button[aria-pressed="true"]{color:#fff;background:linear-gradient(135deg,var(--brand),var(--brand-2))}
    .ibtn{min-width:40px;height:40px;border-radius:10px;cursor:pointer;display:inline-flex;align-items:center;
      justify-content:center;color:var(--text);background:var(--surface);border:1px solid var(--border);font-size:1.05em}
    .ibtn:hover{border-color:var(--brand)}

    /* ---- health strip ---- */
    .health{display:flex;gap:8px;flex-wrap:wrap;margin-block-end:16px}
    .hpill{display:inline-flex;align-items:center;gap:7px;padding:7px 14px;border-radius:999px;font-size:.85em;
      font-weight:700;background:var(--surface);border:1px solid var(--border);color:var(--dim)}
    .hdot{width:9px;height:9px;border-radius:50%;background:var(--err);flex-shrink:0}
    .hpill.is-on{color:var(--text)}
    .hpill.is-on .hdot{background:var(--ok)}
    .hpill.is-warn{color:var(--warn);border-color:color-mix(in srgb,var(--warn) 45%,transparent)}
    .hpill.is-warn .hdot{background:var(--warn)}

    /* ---- tabs ----
       Sticky, because this panel is long and the tab you are in
       is the thing you lose track of first. */
    .tabs{position:sticky;top:0;z-index:20;display:flex;gap:6px;flex-wrap:wrap;margin-block-end:18px;padding:6px;
      border-radius:14px;background:color-mix(in srgb,var(--surface) 92%,transparent);
      border:1px solid var(--border);box-shadow:var(--shadow);backdrop-filter:blur(10px)}
    .tabs button{border:0;cursor:pointer;padding:11px 16px;border-radius:10px;font:inherit;font-size:.92em;
      font-weight:700;color:var(--dim);background:transparent;min-height:42px;
      transition:color .16s ease,background .16s ease}
    .tabs button:hover{color:var(--text);background:var(--surface-2)}
    .tabs button[aria-selected="true"]{color:#fff;background:linear-gradient(135deg,var(--brand),var(--brand-2))}

    .panel{display:none}
    .panel.is-active{display:block}
    .panel:focus{outline:none}

    /* ---- generic ---- */
    .card{padding:22px;border-radius:var(--radius);background:var(--surface);border:1px solid var(--border);
      box-shadow:var(--shadow);margin-block-end:16px}
    .lede{color:var(--dim);font-size:.95em;line-height:1.85;margin-block-end:16px;max-width:78ch}
    h2.sec{font-size:1.12em;font-weight:800;margin-block-end:12px;display:flex;align-items:center;gap:9px;flex-wrap:wrap}
    h3.sub{font-size:1em;font-weight:800;margin-block:20px 10px;color:var(--text);
      padding-block-end:6px;border-block-end:1px solid var(--border)}

    .grid{display:grid;gap:14px}
    .grid.two{grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
    .grid.three{grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}
    .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}

    label.f{display:block;margin-block-end:14px}
    label.f>span{display:block;font-size:.86em;font-weight:700;color:var(--text);margin-block-end:6px}
    input[type=text],input[type=password],input[type=number],input[type=date],input[type=url],select,textarea{
      width:100%;padding:11px 13px;border-radius:11px;font:inherit;font-size:.95em;line-height:1.6;
      color:var(--text);background:var(--surface-2);border:1px solid var(--border);outline:none;min-height:42px}
    input:focus,select:focus,textarea:focus{border-color:var(--brand);box-shadow:0 0 0 3px rgba(124,77,255,.2)}
    input::placeholder,textarea::placeholder{color:var(--dim);opacity:.8}
    textarea{min-height:84px;resize:vertical}
    input[type=color]{width:56px;height:42px;padding:2px;border-radius:10px;border:1px solid var(--border);background:var(--surface-2)}
    .hint{font-size:.85em;color:var(--dim);margin-block-start:5px;line-height:1.7;max-width:78ch}

    .btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:11px 18px;border-radius:11px;
      border:1px solid transparent;font:inherit;font-size:.92em;font-weight:700;cursor:pointer;text-decoration:none;
      color:#fff;background:linear-gradient(135deg,var(--brand),var(--brand-2));min-height:42px;
      transition:transform .15s ease,filter .15s ease}
    .btn:hover{transform:translateY(-1px);filter:brightness(1.07)}
    .btn:disabled{opacity:.55;cursor:not-allowed;transform:none}
    .btn.ghost{color:var(--text);background:var(--surface-2);border-color:var(--border)}
    .btn.ghost:hover{border-color:var(--brand)}
    .btn.danger{background:linear-gradient(135deg,#c62828,#ef5350)}
    .btn.small{padding:8px 13px;font-size:.86em;min-height:36px}

    .chip{display:inline-flex;align-items:center;gap:5px;padding:4px 11px;border-radius:999px;font-size:.8em;
      font-weight:700;color:var(--dim);background:var(--surface-2);border:1px solid var(--border)}
    .chip.ok{color:var(--ok);background:color-mix(in srgb,var(--ok) 14%,transparent);
      border-color:color-mix(in srgb,var(--ok) 40%,transparent)}
    .chip.warn{color:var(--warn);background:color-mix(in srgb,var(--warn) 14%,transparent);
      border-color:color-mix(in srgb,var(--warn) 40%,transparent)}
    .chip.err{color:var(--err);background:color-mix(in srgb,var(--err) 14%,transparent);
      border-color:color-mix(in srgb,var(--err) 40%,transparent)}
    .chip.info{color:var(--info);background:color-mix(in srgb,var(--info) 14%,transparent);
      border-color:color-mix(in srgb,var(--info) 40%,transparent)}

    .note{padding:13px 16px;border-radius:12px;font-size:.92em;line-height:1.8;background:var(--surface-2);
      border:1px solid var(--border);border-inline-start:4px solid var(--dim);margin-block-end:14px}
    .note.ok{border-inline-start-color:var(--ok)}
    .note.warn{border-inline-start-color:var(--warn)}
    .note.err{border-inline-start-color:var(--err)}
    .note.info{border-inline-start-color:var(--info)}

    /* ---- game cards ---- */
    .gcards{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
    .gcard{padding:18px;border-radius:var(--radius);background:var(--surface);border:1px solid var(--border);
      box-shadow:var(--shadow);cursor:pointer;transition:transform .18s ease,border-color .18s ease}
    .gcard:hover{transform:translateY(-3px);border-color:var(--brand)}
    .gcard[aria-selected="true"]{border-color:var(--brand);box-shadow:0 0 0 3px rgba(124,77,255,.22)}
    .gcard-top{display:flex;align-items:center;gap:12px;margin-block-end:12px}
    /* The emoji is the fallback UNDER the logo, not a sibling
       beside it. As flex items the two shared the 52px box, so a
       game with both showed its emoji next to a squeezed sliver
       of its logo. Taking the image out of flow lets it cover the
       box, and the emoji is what remains visible when the file
       404s and onerror hides it. */
    .gcard-logo{position:relative;width:52px;height:52px;border-radius:15px;flex-shrink:0;display:flex;
      align-items:center;justify-content:center;font-size:1.5em;background:#fff;overflow:hidden;
      border:2px solid var(--border)}
    .gcard-logo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
    .gcard-name{display:block;font-weight:800;font-size:1.05em}
    .gcard-id{display:block;font-size:.82em;color:var(--dim);direction:ltr;unicode-bidi:isolate}
    .gcard-chips{display:flex;gap:6px;flex-wrap:wrap}

    /* ---- tables ---- */
    .tbl{width:100%;border-collapse:collapse;font-size:.92em}
    .tbl th{text-align:start;font-size:.86em;color:var(--dim);font-weight:700;padding:9px 10px;
      border-block-end:1px solid var(--border);white-space:nowrap}
    .tbl td{padding:11px 10px;border-block-end:1px solid var(--border);vertical-align:middle}
    .tbl tr:last-child td{border-block-end:0}
    .scroll{overflow-x:auto;overscroll-behavior-x:contain}

    /* ---- code output ---- */
    .code{position:relative;margin-block-end:14px}
    .code pre{padding:16px;border-radius:12px;background:var(--code-bg);color:var(--code-fg);
      font-family:var(--font-mono);font-size:.86em;line-height:1.7;overflow:auto;
      direction:ltr;unicode-bidi:isolate;text-align:left;max-height:520px;tab-size:2}
    .code pre::-webkit-scrollbar-thumb{background:rgba(255,255,255,.22);background-clip:content-box}
    .code-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;
      margin-block-end:8px}
    .code-name{font-size:.92em;font-weight:800;direction:ltr;unicode-bidi:isolate}
    .code-hint{font-size:.86em;color:var(--dim);line-height:1.7;margin-block-end:8px}

    .steps{counter-reset:s;list-style:none;margin:0;padding:0}
    .steps li{position:relative;padding:0 0 18px 0;margin-inline-start:32px}
    .steps li::before{counter-increment:s;content:counter(s);position:absolute;inset-inline-start:-32px;
      width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;
      font-size:.8em;font-weight:800;color:#fff;background:var(--brand)}
    .steps b{display:block;font-size:.98em;margin-block-end:6px}
    .steps pre{padding:11px 13px;border-radius:10px;background:var(--code-bg);color:var(--code-fg);
      font-family:var(--font-mono);font-size:.85em;line-height:1.65;overflow-x:auto;
      direction:ltr;unicode-bidi:isolate;text-align:left}
    .steps .hint{margin-block-start:6px}

    /* The "what each button produces" list on the SQL tab, and
       the field-origin badges on the Game page tab. */
    .sqlwhat{margin:0;padding-inline-start:20px;line-height:1.9;font-size:.9em;color:var(--dim)}
    .sqlwhat li{margin-block-end:8px}
    .sqlwhat b{color:var(--text)}

    /* Where a field's value is coming from right now: the code
       baseline, or a row somebody saved on top of it. Small and
       quiet - it belongs beside a label, not instead of one. */
    .origin{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:999px;
      font-size:.74em;font-weight:700;vertical-align:middle;margin-inline-start:8px;
      background:var(--surface-2);border:1px solid var(--border);color:var(--dim)}
    .origin.db{color:var(--brand);border-color:color-mix(in srgb,var(--brand) 40%,transparent);
      background:color-mix(in srgb,var(--brand) 12%,transparent)}
    .origin.blocked{color:var(--err);border-color:color-mix(in srgb,var(--err) 45%,transparent);
      background:color-mix(in srgb,var(--err) 12%,transparent)}

    /* A landing section whose column does not exist. Dimmed
       rather than removed: knowing the section EXISTS and cannot
       be saved yet is the useful state. */
    .blocked-sec{opacity:.55}
    .blocked-sec input,.blocked-sec textarea,.blocked-sec select,.blocked-sec button{
      pointer-events:none}

    /* game.verify */
    .vf{display:flex;flex-direction:column;gap:8px}
    .vf-row{display:flex;align-items:flex-start;gap:11px;padding:11px 13px;border-radius:12px;
      background:var(--surface-2);border:1px solid var(--border)}
    .vf-row.is-error{border-color:color-mix(in srgb,var(--err) 45%,transparent)}
    .vf-row.is-warn{border-color:color-mix(in srgb,var(--warn) 45%,transparent)}
    .vf-mark{font-size:1.05em;line-height:1.5;flex-shrink:0}
    .vf-body{min-width:0;flex:1}
    .vf-body b{display:block;font-size:.92em;margin-block-end:3px}
    .vf-body span{display:block;font-size:.83em;color:var(--dim);line-height:1.7}

    .switch{display:inline-flex;align-items:center;gap:10px;cursor:pointer;font-size:.92em;font-weight:700;
      min-height:38px}
    .switch input{width:0;height:0;opacity:0;position:absolute}
    .track{width:46px;height:26px;border-radius:999px;background:var(--surface-2);border:1px solid var(--border);
      position:relative;transition:background .18s ease;flex-shrink:0}
    .track::after{content:'';position:absolute;inset-block-start:3px;inset-inline-start:3px;width:18px;height:18px;
      border-radius:50%;background:var(--dim);transition:transform .18s ease,background .18s ease}
    .switch input:checked+.track{background:color-mix(in srgb,var(--ok) 24%,transparent);
      border-color:color-mix(in srgb,var(--ok) 55%,transparent)}
    .switch input:checked+.track::after{background:var(--ok);transform:translateX(20px)}
    [dir="rtl"] .switch input:checked+.track::after{transform:translateX(-20px)}
    .switch input:focus-visible+.track{outline:3px solid var(--focus);outline-offset:2px}

    .toast{position:fixed;inset-block-end:22px;inset-inline-start:50%;transform:translateX(-50%);
      padding:12px 22px;border-radius:12px;font-size:.94em;font-weight:700;color:#fff;background:#0f8a4a;
      box-shadow:0 10px 30px rgba(0,0,0,.24);opacity:0;pointer-events:none;transition:opacity .2s ease;z-index:50;
      max-width:min(92vw,540px);text-align:center;line-height:1.6}
    .toast.show{opacity:1}
    .toast.bad{background:#c62828}

    .plrow{display:flex;align-items:center;gap:10px}
    .plavatar{position:relative;width:34px;height:34px;border-radius:50%;flex-shrink:0;overflow:hidden;
      display:flex;align-items:center;justify-content:center;font-size:1em;
      background:var(--surface-2);border:1px solid var(--border)}
    .plavatar img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
    .plstats{display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:10px;margin-block:14px}
    .plstat{padding:13px 15px;border-radius:12px;background:var(--surface-2);border:1px solid var(--border)}
    .plstat b{display:block;font-size:1.2em;font-weight:800;margin-block-end:2px}
    .plstat span{font-size:.84em;color:var(--dim)}

    .storekeys{display:flex;flex-wrap:wrap;gap:6px;margin-block:8px}
    .storekeys code{cursor:pointer;padding:5px 10px;border-radius:8px;font-size:.85em;
      color:var(--info);background:color-mix(in srgb,var(--info) 12%,transparent);
      border:1px solid color-mix(in srgb,var(--info) 36%,transparent);
      transition:background .15s ease,transform .15s ease}
    .storekeys code:hover{background:color-mix(in srgb,var(--info) 22%,transparent);transform:translateY(-1px)}

    /* ---- repeating rows (features, screenshots, videos, FAQ) ----
       Every list on the game-page tab is the same shape: a stack
       of bordered rows with a remove button, and one add button
       under them. One set of rules rather than five. */
    .rep{display:flex;flex-direction:column;gap:12px;margin-block-end:12px}
    .rep-row{padding:14px;border-radius:13px;background:var(--surface-2);border:1px solid var(--border)}
    .rep-row .grid{margin-block-end:0}
    .rep-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-block-end:10px}
    .rep-num{font-size:.85em;font-weight:800;color:var(--dim)}
    .rep-row label.f{margin-block-end:10px}
    .rep-row label.f:last-child{margin-block-end:0}
    .thumb{width:100%;max-width:340px;aspect-ratio:16/9;object-fit:cover;border-radius:10px;
      border:1px solid var(--border);background:var(--surface);display:block;margin-block-start:8px}

    .empty{padding:28px;text-align:center;color:var(--dim);font-size:.95em}
    .muted{color:var(--dim)}
    .stack{display:flex;flex-direction:column;gap:8px}

    /* ---- mobile ----
       The panel is the densest surface on the site. The problems
       were concrete: the tab strip overflowed rather than
       wrapping, action rows put four half-width buttons on a
       360px screen, and the tables set their own width so the
       page scrolled sideways instead of the table doing it. */
    @media (max-width:720px){
      body{padding:14px 12px 44px}
      .top{gap:10px}
      .logo-mark{width:42px;height:42px;font-size:1.3em}

      .tabs{gap:4px;padding:5px;overflow-x:auto;flex-wrap:nowrap;
        scrollbar-width:thin;-webkit-overflow-scrolling:touch}
      .tabs button{padding:10px 13px;font-size:.88em;white-space:nowrap;flex:0 0 auto}

      .card{padding:16px}
      .grid.two,.grid.three{grid-template-columns:1fr}
      .gcards{grid-template-columns:1fr}

      /* A row of buttons becomes a column of full-width ones.
         Four 48%-wide buttons on a narrow screen is four labels
         that wrap to two lines each. */
      .row>.btn,.row>.btn.small{flex:1 1 100%}
      .row>.btn.ghost.small{flex:1 1 auto}

      /* The table scrolls inside its own box; the page never
         scrolls sideways. */
      .tbl{min-width:520px}
      .tbl td,.tbl th{padding:9px 8px}

      .plstats{grid-template-columns:repeat(2,1fr)}
      .code pre{font-size:.8em;max-height:380px}
    }

    @media (max-width:400px){
      .plstats{grid-template-columns:1fr}
      .seg button{padding:7px 9px;font-size:.82em}
    }

    @media (prefers-reduced-motion:no-preference){
      .card,.gcard{animation:tgRise .4s cubic-bezier(.16,1,.3,1) both}
    }
    @media (prefers-reduced-motion:reduce){
      *,*::before,*::after{animation-duration:.001ms !important;transition-duration:.001ms !important}
    }
    @keyframes tgRise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}

    @media print{
      .tabs,.top-actions,.toast{display:none}
      .panel{display:block !important}
      body{background:#fff;color:#000}
    }
  `
}


// ==========================================
// themeBoot
// Theme and text size, applied before first paint.
//
// Both come from localStorage rather than from the server,
// because both are per-device choices and a flash of the wrong
// one on every page load reads as a broken page.
// ==========================================
function themeBoot() {
  return `<script>(function(){try{
    var t=localStorage.getItem('ac_theme');
    if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);
    var s=parseFloat(localStorage.getItem('ac_ui_scale'));
    if(s>=0.85&&s<=1.35)document.documentElement.style.setProperty('--ui-scale',String(s));
  }catch(e){}})();</script>`
}


// ==========================================
// Login page
// ==========================================
function renderLogin(lang, theme, error) {
  const t = localizedDict(lang)
  const themeAttr = theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : ''

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}" dir="${t.dir}"${themeAttr}>
<head>
  ${getPageHead({ title: `${t.brand} — ${t.loginTitle}`, amirLogo: CONFIG.AMIR_LOGO })}
  ${panelFont()}
  ${themeBoot()}
  <style>${panelCss()}
    body{display:flex;align-items:center;justify-content:center;padding:24px}
    .login{width:100%;max-width:420px}
  </style>
</head>
<body>
  <main class="login">
    <div class="card" style="text-align:center">
      <div class="logo-mark" style="margin:0 auto 16px;width:60px;height:60px;font-size:1.8em" aria-hidden="true">⚡</div>
      <h1 style="font-size:1.3em;font-weight:800;margin-block-end:6px">${escapeHtml(t.loginTitle)}</h1>
      <p class="muted" style="font-size:.92em;margin-block-end:22px">${escapeHtml(t.loginSub)}</p>

      ${error === '2' ? `<div class="note err" style="text-align:start" role="alert">${escapeHtml(t.loginBlocked)}</div>` : ''}
      ${error === '1' ? `<div class="note err" style="text-align:start" role="alert">${escapeHtml(t.loginError)}</div>` : ''}

      <form method="POST" action="/thegod/login">
        <label class="f" style="text-align:start">
          <span>${escapeHtml(t.loginPassword)}</span>
          <input type="password" name="password" id="pw" required autofocus
                 placeholder="${escapeHtml(t.loginPlaceholder)}" autocomplete="current-password">
        </label>
        <label class="row" style="font-size:.9em;color:var(--dim);margin-block-end:16px;cursor:pointer">
          <input type="checkbox" onchange="document.getElementById('pw').type=this.checked?'text':'password'"
                 style="width:auto;min-height:0">
          <span>${escapeHtml(t.showPassword)}</span>
        </label>
        <button type="submit" class="btn" style="width:100%">${escapeHtml(t.loginButton)}</button>
      </form>
    </div>
  </main>
</body>
</html>`
}


// ==========================================
// panelFont
// The web font, and the reason it is not depended on.
//
// Vazirmatn is the Persian face the rest of the site uses, and
// it comes from Google Fonts - which is not reachable from every
// network this panel is opened on. preconnect makes it arrive
// sooner where it arrives at all; the stack in panelCss() is
// what the panel actually looks like where it does not.
//
// media="print" + onload is the standard non-blocking pattern:
// a stylesheet that never loads then costs nothing rather than
// holding first paint for the length of a DNS timeout.
// ==========================================
function panelFont() {
  const href = 'https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap'
  return `
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="${href}" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="${href}"></noscript>`
}


// ==========================================
// Panel page
// ==========================================
function renderPanel(games, lang, theme, health, origin) {
  const t = localizedDict(lang)
  const themeAttr = theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : ''

  const list = Object.values(games).map(game => ({
    id: game.id,
    name: game.name,
    icon: game.icon,
    color: game.color,
    logo: game.logo,
    status: game.status,
    description: (game.i18n && game.i18n.description) || {},
    tags: game.tags || [],
    capabilities: game.capabilities,
    download: game.download,
    downloadable: isDownloadable(game),
    minVersion: game.minVersion || '',
    note: game.note || '',
    deepLinkScheme: (game.deepLink && game.deepLink.scheme) || '',
    deepLinkHost: (game.deepLink && game.deepLink.host) || 'oauth',
    overrides: game.overrides || [],
    settingsAt: game.settingsAt || 0,
    products: (game.store.products || []).map(product => ({
      id: product.id,
      sku: product.sku || '',
      kind: product.kind,
      priceUsd: product.priceUsd,
      icon: product.icon || '',
      badge: product.badge || '',
      enabled: product.enabled !== false,
      sortOrder: product.sortOrder,
      durationDays: product.durationDays || 0,
      grant: product.grant || null,
      name: (product.i18n && product.i18n.name) || {},
      overrides: product.overrides || []
    }))
  }))

  const healthPills = [
    { key: 'database', on: health.database, label: t.hDatabase },
    { key: 'provider', on: health.provider, label: t.hProvider },
    { key: 'store', on: health.store, label: t.hStore }
  ].map(pill =>
    `<span class="hpill${pill.on ? ' is-on' : ''}"><span class="hdot"></span>${escapeHtml(pill.label)}: ${escapeHtml(pill.on ? t.hOn : t.hOff)}</span>`
  ).join('')

  const sandboxPill = health.sandbox
    ? `<span class="hpill is-warn"><span class="hdot"></span>${escapeHtml(t.hSandbox)}</span>` : ''

  const langSeg = LANGS.map(code =>
    `<button type="button" onclick="tgLang('${code}')" lang="${code}"
             aria-pressed="${code === lang ? 'true' : 'false'}">${escapeHtml(META[code].label)}</button>`
  ).join('')

  // Text size, persisted per device. The panel's job is dense
  // Latin identifiers inside a Persian interface, and there is no
  // single size that is right for a 13" laptop and a phone held
  // at arm's length. Three steps, one localStorage key, applied
  // before first paint by themeBoot().
  const sizeSeg = [['0.9', t.textSmall, 'A'], ['1', t.textNormal, 'A'], ['1.15', t.textLarge, 'A']]
    .map(([value, label, glyph], index) =>
      `<button type="button" onclick="tgScale('${value}')" data-scale="${value}"
               title="${escapeHtml(label)}" aria-label="${escapeHtml(t.textSize)}: ${escapeHtml(label)}"
               style="font-size:${0.78 + index * 0.16}em">${glyph}</button>`
    ).join('')

  const tabs = TAB_KEYS.map(([key, labelKey, icon], index) =>
    `<button type="button" role="tab" id="tab-${key}" data-tab="${key}"
             aria-selected="${index === 0 ? 'true' : 'false'}" aria-controls="panel-${key}"
             tabindex="${index === 0 ? '0' : '-1'}"
             onclick="tgTab('${key}')"><span aria-hidden="true">${icon}</span> ${escapeHtml(t[labelKey])}</button>`
  ).join('')

  const panels = TAB_KEYS.map(([key], index) =>
    `<section class="panel${index === 0 ? ' is-active' : ''}" id="panel-${key}"
              role="tabpanel" aria-labelledby="tab-${key}" tabindex="0"></section>`
  ).join('\n    ')

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}" dir="${t.dir}"${themeAttr}>
<head>
  ${getPageHead({ title: `${t.brand} — ${t.tagline}`, amirLogo: CONFIG.AMIR_LOGO })}
  <meta name="robots" content="noindex, nofollow">
  ${panelFont()}
  ${themeBoot()}
  <style>${panelCss()}</style>
</head>
<body>
  <a class="skip" href="#panel-games">${escapeHtml(t.skip)}</a>
  <div class="wrap">
    <header class="top">
      <div class="logo">
        <span class="logo-mark" aria-hidden="true">⚡</span>
        <span>
          <b>${escapeHtml(t.brand)}</b>
          <span>${escapeHtml(t.tagline)}</span>
        </span>
      </div>
      <div class="top-actions">
        <span class="seg" role="group" aria-label="${escapeHtml(t.langLabel)}">${langSeg}</span>
        <span class="seg" role="group" aria-label="${escapeHtml(t.textSize)}" id="tg-scale">${sizeSeg}</span>
        <button type="button" class="ibtn" onclick="tgTheme()"
                aria-label="${escapeHtml(t.themeToggle)}" title="${escapeHtml(t.themeToggle)}">◐</button>
        <form method="POST" action="/thegod/logout" style="display:inline">
          <button type="submit" class="btn ghost small">${escapeHtml(t.logout)}</button>
        </form>
      </div>
    </header>

    <div class="health">${healthPills}${sandboxPill}</div>

    ${health.sandbox ? `<div class="note warn">${escapeHtml(t.hSandboxWarn)}</div>` : ''}
    ${!health.database ? `<div class="note err">${escapeHtml(t.hDbWarn)} ${escapeHtml(t.hNoMigration)}</div>` : ''}

    <nav class="tabs" role="tablist" aria-label="${escapeHtml(t.tabsLabel)}"
         onkeydown="tgTabKeys(event)">${tabs}</nav>

    ${panels}
  </div>

  <div class="toast" id="tg-toast" role="status" aria-live="polite"></div>

  <script>
    var TG = {
      lang: ${jsonBlob(lang)},
      locale: ${jsonBlob(META[lang] ? META[lang].locale : 'fa-IR')},
      origin: ${jsonBlob(origin)},
      t: ${jsonBlob(t)},
      games: ${jsonBlob(list)},
      health: ${jsonBlob(health)},
      tabs: ${jsonBlob(TAB_KEYS.map(([key]) => key))},
      selected: ${jsonBlob(list.length ? list[0].id : '')}
    };
  </script>
  ${panelScript()}
</body>
</html>`
}


// ==========================================
// TAB_KEYS
// The panel's sections, in one list.
//
// The tab strip, the panel elements, the keyboard handler and
// the "which tab was I on" restore all read this. They used to
// be four hand-written lists, which is four chances for a ninth
// tab to appear in three of them.
// ==========================================
const TAB_KEYS = [
  ['games', 'tabGames', '🎮'],
  ['page', 'tabPage', '🖼️'],
  ['store', 'tabStore', '🛒'],
  ['orders', 'tabOrders', '💳'],
  ['players', 'tabPlayers', '👥'],
  ['sql', 'tabSql', '🗄️'],
  ['env', 'tabEnv', '🔑'],
  ['new', 'tabNew', '✨'],
  ['unity', 'tabUnity', '🧩']
]


// ==========================================
// Client runtime
// ==========================================
function panelScript() {
  return `<script>
${PANEL_JS}
</script>`
}

const PANEL_JS = String.raw`
function tgEsc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function tgById(id) { return document.getElementById(id); }

function tgToast(message, bad) {
  var box = tgById('tg-toast');
  box.textContent = message;
  box.className = 'toast show' + (bad ? ' bad' : '');
  setTimeout(function () { box.className = 'toast' + (bad ? ' bad' : ''); }, 2200);
}

function tgTheme() {
  var dark = getComputedStyle(document.documentElement).colorScheme.indexOf('dark') !== -1;
  var next = dark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('ac_theme', next); } catch (e) {}
  document.cookie = 'theme=' + next + ';path=/;max-age=31536000;samesite=lax';
}

function tgLang(code) {
  document.cookie = 'lang=' + code + ';path=/;max-age=31536000;samesite=lax';
  window.location.href = '/thegod?lang=' + encodeURIComponent(code) + tgHash();
}

// ==========================================
// tgScale
// The text size control.
//
// Sets --ui-scale on <html>, which every size in the stylesheet
// is relative to, and remembers it. themeBoot() applies it again
// before first paint on the next load, so the choice does not
// flash back to normal on every navigation.
// ==========================================
function tgScale(value) {
  var scale = parseFloat(value) || 1;
  document.documentElement.style.setProperty('--ui-scale', String(scale));
  try { localStorage.setItem('ac_ui_scale', String(scale)); } catch (e) {}
  tgMarkScale();
}

function tgMarkScale() {
  var current = getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim() || '1';
  var buttons = document.querySelectorAll('#tg-scale button');
  for (var i = 0; i < buttons.length; i++) {
    var mine = parseFloat(buttons[i].getAttribute('data-scale'));
    buttons[i].setAttribute('aria-pressed', Math.abs(mine - parseFloat(current)) < 0.01 ? 'true' : 'false');
  }
}


// ==========================================
// tgCall
// Every write goes through one function, so there is one place
// that knows the endpoint, one place that reports a failure and
// one place to change if the shape of an error ever moves.
// ==========================================
function tgCall(action, payload) {
  var body = payload || {};
  body.action = action;

  return fetch('/thegod/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(function (res) {
    return res.json().catch(function () { return { ok: false, error: 'bad_response' }; });
  }).then(function (data) {
    if (!data || !data.ok) {
      tgToast((data && data.message) || TG.t.failed, true);
      return null;
    }
    return data;
  }).catch(function () {
    tgToast(TG.t.failed, true);
    return null;
  });
}

function tgGame(id) {
  for (var i = 0; i < TG.games.length; i++) if (TG.games[i].id === id) return TG.games[i];
  return null;
}

function tgSelected() { return tgGame(TG.selected); }

function tgLocalized(map, fallback) {
  if (!map) return fallback || '';
  return map[TG.lang] || map.en || map.fa || fallback || '';
}

function tgDate(ms) {
  if (!ms) return TG.t.never;
  try { return new Date(ms).toLocaleString(TG.locale); } catch (e) { return String(ms); }
}

function tgStatusLabel(status) {
  if (status === 'maintenance') return TG.t.stMaintenance;
  if (status === 'soon') return TG.t.stSoon;
  return TG.t.stLive;
}

// ==========================================
// Tabs
//
// The active tab lives in the URL hash as well as in the DOM, so
// a save that reloads, a language switch and a bookmark all come
// back to the section somebody was working in. Nine tabs deep
// into a panel, being dropped back on the first one every time
// is most of what "unusable" means.
// ==========================================
function tgTab(key, options) {
  var opts = options || {};
  var buttons = document.querySelectorAll('.tabs button');
  for (var i = 0; i < buttons.length; i++) {
    var mine = buttons[i].getAttribute('data-tab') === key;
    buttons[i].setAttribute('aria-selected', mine ? 'true' : 'false');
    buttons[i].setAttribute('tabindex', mine ? '0' : '-1');
    if (mine && opts.focus) buttons[i].focus();
  }

  var panels = document.querySelectorAll('.panel');
  for (var j = 0; j < panels.length; j++) {
    panels[j].className = 'panel' + (panels[j].id === 'panel-' + key ? ' is-active' : '');
  }

  if (!opts.silent) {
    try { history.replaceState(null, '', '#' + key); } catch (e) {}
  }
  tgRender(key);
}

function tgHash() {
  var active = document.querySelector('.tabs button[aria-selected="true"]');
  return active ? '#' + active.getAttribute('data-tab') : '';
}

// Left/right move between tabs, Home/End jump to the ends. This
// is the standard tab-list keyboard contract, and without it the
// only way through nine tabs is nine presses of Tab.
function tgTabKeys(event) {
  var keys = TG.tabs || [];
  var active = document.querySelector('.tabs button[aria-selected="true"]');
  var at = active ? keys.indexOf(active.getAttribute('data-tab')) : 0;
  if (at < 0) at = 0;

  var rtl = document.documentElement.getAttribute('dir') === 'rtl';
  var next = null;

  if (event.key === 'ArrowRight') next = at + (rtl ? -1 : 1);
  else if (event.key === 'ArrowLeft') next = at + (rtl ? 1 : -1);
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = keys.length - 1;
  else return;

  event.preventDefault();
  if (next < 0) next = keys.length - 1;
  if (next >= keys.length) next = 0;
  tgTab(keys[next], { focus: true });
}

function tgRender(key) {
  if (key === 'games') return tgRenderGames();
  if (key === 'page') return tgRenderPage();
  if (key === 'store') return tgRenderStore();
  if (key === 'orders') return tgRenderOrders();
  if (key === 'players') return tgRenderPlayers();
  if (key === 'sql') return tgRenderSql();
  if (key === 'env') return tgRenderEnv();
  if (key === 'new') return tgRenderNew();
  if (key === 'unity') return tgRenderUnity();
}

function tgPickGame(id) {
  TG.selected = id;
  var active = document.querySelector('.tabs button[aria-selected="true"]');
  tgRender(active ? active.getAttribute('data-tab') : 'games');
}

// A <select> of every game, for the tabs that work on one at a
// time. Rendered from the same array the cards are, so a game
// can never be missing from one and present in the other.
function tgGamePicker(onchange, label) {
  var options = TG.games.map(function (game) {
    return '<option value="' + tgEsc(game.id) + '"' + (game.id === TG.selected ? ' selected' : '') + '>'
         + tgEsc(game.name) + '</option>';
  }).join('');

  return '<label class="f" style="max-width:320px"><span>' + tgEsc(label) + '</span>'
       + '<select onchange="' + onchange + '(this.value)">' + options + '</select></label>';
}


// ==========================================
// Tab: games
// ==========================================
function tgRenderGames() {
  var cards = TG.games.map(function (game) {
    var chips = '';
    chips += '<span class="chip ' + (game.status === 'live' ? 'ok' : game.status === 'soon' ? 'info' : 'warn') + '">'
           + tgEsc(tgStatusLabel(game.status)) + '</span>';
    chips += '<span class="chip ' + (game.downloadable ? 'ok' : 'err') + '">'
           + (game.downloadable ? '⬇' : '⛔') + '</span>';
    if (game.overrides.length) chips += '<span class="chip info">' + tgEsc(TG.t.edited) + '</span>';
    else chips += '<span class="chip">' + tgEsc(TG.t.fromCode) + '</span>';

    return '<div class="gcard" role="button" tabindex="0" aria-selected="' + (game.id === TG.selected) + '"'
         + ' onkeydown="tgCardKey(event,\'' + tgEsc(game.id) + '\')"'
         + ' onclick="tgPickGame(\'' + tgEsc(game.id) + '\')">'
         + '<div class="gcard-top">'
         +   '<span class="gcard-logo" style="border-color:' + tgEsc(game.color) + '">' + tgEsc(game.icon || '🎮')
         +     (game.logo ? '<img src="' + tgEsc(game.logo) + '" alt="" onerror="this.style.display=\'none\'">' : '')
         +   '</span>'
         +   '<span><span class="gcard-name">' + tgEsc(game.name) + '</span>'
         +   '<span class="gcard-id">' + tgEsc(game.id) + '</span></span>'
         + '</div>'
         + '<div class="gcard-chips">' + chips + '</div>'
         + '</div>';
  }).join('');

  var html = '<p class="lede">' + tgEsc(TG.t.gamesLede) + '</p>'
           + '<div class="gcards">' + cards + '</div>'
           + '<div id="tg-editor"></div>';

  tgById('panel-games').innerHTML = html;
  tgRenderEditor();
}

// A card is role="button", so a keyboard has to be able to press
// it. Enter and Space are what a real button answers to, and
// tabindex="0" without this is a control that focuses and then
// does nothing.
function tgCardKey(event, id) {
  if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
  event.preventDefault();
  tgPickGame(id);
}

function tgRenderEditor() {
  var game = tgSelected();
  var box = tgById('tg-editor');
  if (!game || !box) return;

  var links = Object.keys(game.download.links || {}).map(function (store) {
    return store + '=' + game.download.links[store];
  }).join('\n');

  var caps = [
    ['onlinePlay', TG.t.capOnline], ['login', TG.t.capLogin], ['cloudSave', TG.t.capCloud],
    ['leaderboard', TG.t.capBoard], ['store', TG.t.capStore]
  ].map(function (pair) {
    var on = game.capabilities[pair[0]];
    return '<span class="chip ' + (on ? 'ok' : '') + '">' + (on ? '✓' : '·') + ' ' + tgEsc(pair[1]) + '</span>';
  }).join(' ');

  var statuses = [['live', TG.t.stLive], ['maintenance', TG.t.stMaintenance], ['soon', TG.t.stSoon]]
    .map(function (pair) {
      return '<option value="' + pair[0] + '"' + (game.status === pair[0] ? ' selected' : '') + '>'
           + tgEsc(pair[1]) + '</option>';
    }).join('');

  box.innerHTML =
    '<div class="card" style="margin-block-start:18px">'
  +   '<h2 class="sec">' + tgEsc(game.icon || '🎮') + ' ' + tgEsc(game.name)
  +     ' <span class="chip">' + tgEsc(game.id) + '</span></h2>'

  +   '<div class="note ' + (game.downloadable ? 'ok' : 'warn') + '">'
  +     '<label class="switch"><input type="checkbox" id="f-download"' + (game.downloadable ? ' checked' : '')
  +       ' onchange="tgToggleDownload(this.checked)"><span class="track"></span>'
  +       '<span>' + tgEsc(game.downloadable ? TG.t.downloadOn : TG.t.downloadOff) + '</span></label>'
  +     '<div class="hint">' + tgEsc(TG.t.downloadHint) + '</div>'
  +   '</div>'

  +   '<div class="grid two">'
  +     '<label class="f"><span>' + tgEsc(TG.t.fName) + '</span>'
  +       '<input type="text" id="f-name" value="' + tgEsc(game.name) + '"></label>'
  +     '<label class="f"><span>' + tgEsc(TG.t.fLogo) + '</span>'
  +       '<input type="text" id="f-logo" dir="ltr" value="' + tgEsc(game.logo || '') + '"></label>'
  +   '</div>'

  +   '<div class="grid two">'
  +     '<label class="f"><span>' + tgEsc(TG.t.fColor) + '</span>'
  +       '<span class="row"><input type="color" id="f-color" value="' + tgEsc(game.color) + '">'
  +       '<input type="text" id="f-color-text" dir="ltr" value="' + tgEsc(game.color) + '"'
  +       ' oninput="tgById(\'f-color\').value=this.value"></span></label>'
  +     '<label class="f"><span>' + tgEsc(TG.t.fStatus) + '</span>'
  +       '<select id="f-status">' + statuses + '</select></label>'
  +   '</div>'

  +   '<label class="f"><span>' + tgEsc(TG.t.fDescFa) + '</span>'
  +     '<textarea id="f-desc-fa" dir="rtl">' + tgEsc(game.description.fa || '') + '</textarea></label>'
  +   '<div class="grid two">'
  +     '<label class="f"><span>' + tgEsc(TG.t.fDescEn) + '</span>'
  +       '<textarea id="f-desc-en" dir="ltr">' + tgEsc(game.description.en || '') + '</textarea></label>'
  +     '<label class="f"><span>' + tgEsc(TG.t.fDescJa) + '</span>'
  +       '<textarea id="f-desc-ja" dir="ltr">' + tgEsc(game.description.ja || '') + '</textarea></label>'
  +   '</div>'

  +   '<label class="f"><span>' + tgEsc(TG.t.fTags) + '</span>'
  +     '<textarea id="f-tags" rows="3">' + tgEsc(tgTagLines(game)) + '</textarea>'
  +     '<span class="hint">' + tgEsc(TG.t.fTagsHint) + '</span></label>'

  +   '<label class="f"><span>' + tgEsc(TG.t.fDownload) + '</span>'
  +     '<textarea id="f-links" dir="ltr">' + tgEsc(links) + '</textarea>'
  +     '<span class="hint">' + tgEsc(TG.t.fDownloadHint) + '</span>'
  +     '<span class="hint">' + tgEsc(TG.t.fDownloadKnown) + '</span>'
  +     tgStoreLegend()
  +     '<span class="hint">' + tgEsc(TG.t.fDownloadOther) + '</span></label>'

  +   '<label class="f"><span>' + tgEsc(TG.t.fDeepLink) + '</span>'
  +     '<input type="text" id="f-deeplink" dir="ltr" spellcheck="false"'
  +       ' value="' + tgEsc(game.deepLinkScheme) + '" oninput="tgDeepLinkPreview()">'
  +     '<span class="hint">' + tgEsc(TG.t.fDeepLinkHint) + '</span>'
  +     '<span class="hint" dir="ltr" id="f-deeplink-preview">' + tgEsc(tgDeepLinkOf(game)) + '</span></label>'

  +   '<div class="grid two">'
  +     '<label class="f"><span>' + tgEsc(TG.t.fMinVersion) + '</span>'
  +       '<input type="text" id="f-minver" dir="ltr" value="' + tgEsc(game.minVersion) + '" placeholder="1.0.0"></label>'
  +     '<label class="f"><span>' + tgEsc(TG.t.fNote) + '</span>'
  +       '<input type="text" id="f-note" value="' + tgEsc(game.note) + '"></label>'
  +   '</div>'

  +   '<h3 class="sub">' + tgEsc(TG.t.capabilities) + '</h3>'
  +   '<div class="row">' + caps + '</div>'
  +   '<div class="hint" style="margin-block-start:8px">' + tgEsc(TG.t.capNote) + '</div>'

  +   '<div class="row" style="margin-block-start:20px">'
  +     '<button type="button" class="btn" id="tg-save" onclick="tgSaveGame()">' + tgEsc(TG.t.save) + '</button>'
  +     '<button type="button" class="btn ghost" onclick="tgResetGame()">' + tgEsc(TG.t.reset) + '</button>'
  +     '<span class="muted" style="font-size:.78em">' + tgEsc(TG.t.saved) + ': ' + tgEsc(tgDate(game.settingsAt)) + '</span>'
  +   '</div>'

  +   '<h3 class="sub">' + tgEsc(TG.t.open) + '</h3>'
  +   '<div class="hint" style="margin-block-end:10px">' + tgEsc(TG.t.openHint) + '</div>'
  +   '<div class="row">' + tgPreviewLinks(game) + '</div>'

  // The health check for a game that already exists. Same
  // answer the "new game" tab shows after a deploy, asked
  // here for the case that brings somebody to this panel
  // more often: something is not behaving and it is not
  // obvious which of the six moving parts is at fault.
  +   '<h3 class="sub">' + tgEsc(TG.t.nVerify) + '</h3>'
  +   '<div class="hint" style="margin-block-end:10px">' + tgEsc(TG.t.vfLede) + '</div>'
  +   '<div class="row">'
  +     '<button type="button" class="btn ghost" onclick="tgVerifyGame(\'' + tgEsc(game.id) + '\')">'
  +       tgEsc(TG.t.vfRun) + '</button>'
  +   '</div>'
  +   '<div id="tg-verify-out"></div>'

  +   '<h3 class="sub">' + tgEsc(TG.t.purge) + '</h3>'
  +   '<div class="note warn">' + tgEsc(TG.t.purgeHint)
  +     '<div class="row" style="margin-block-start:10px">'
  +       '<button type="button" class="btn danger small" onclick="tgPurgeGame()">'
  +         tgEsc(TG.t.purge) + '</button>'
  +     '</div>'
  +   '</div>'
  + '</div>';
}

// ==========================================
// Tags
//
// Three languages per tag, edited as one line each rather than
// as a JSON blob or as 3xN inputs. The column has existed since
// 0003 and the card has always rendered it; nothing could write
// it, so re-tagging a game meant a deploy.
// ==========================================
function tgTagLines(game) {
  return (game.tags || []).map(function (tag) {
    return [tag.fa || '', tag.en || '', tag.ja || ''].join(' | ');
  }).join('\n');
}

function tgTagsFromLines(text) {
  var lines = String(text || '').split('\n');
  var tags = [];

  for (var i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    var parts = lines[i].split('|');
    var tag = {
      fa: (parts[0] || '').trim(),
      en: (parts[1] || '').trim(),
      ja: (parts[2] || '').trim()
    };
    // One language is enough. A tag written only in Persian
    // renders in Persian everywhere, which is better than
    // refusing the line and better than an empty chip.
    if (tag.fa || tag.en || tag.ja) tags.push(tag);
  }
  return tags;
}


// The link the OAuth callback builds for an Android player, shown
// as it is typed. The scheme on its own is an abstraction; the
// URL is the thing that either opens the game or does not, and
// seeing it is what catches "https://" pasted into the box.
function tgDeepLinkOf(game) {
  return (game.deepLinkScheme || '') + '://' + (game.deepLinkHost || 'oauth') + '?code=…';
}

function tgDeepLinkPreview() {
  var game = tgSelected();
  var box = tgById('f-deeplink-preview');
  if (!game || !box) return;

  var typed = (tgById('f-deeplink').value || '').trim();
  var scheme = typed || game.deepLinkScheme;
  var ok = !typed || /^[a-zA-Z][a-zA-Z0-9+.-]{0,80}$/.test(typed);

  box.textContent = ok
    ? scheme + '://' + (game.deepLinkHost || 'oauth') + '?code=…'
    : TG.t.fDeepLinkBad;
  box.style.color = ok ? '' : 'var(--err)';
}


// ==========================================
// tgStoreLegend
// Which names in the download box mean something.
// ==========================================
function tgStoreLegend() {
  var known = [
    ['myket', 'https://myket.ir/app/com.YourCompany.YourGame'],
    ['googleplay', 'https://play.google.com/store/apps/details?id=com.YourCompany.YourGame'],
    ['apk', 'https://amircollider.com/assets/YourGame.apk'],
    ['web', 'https://amircollider.com/your-game/play']
  ];

  return '<span class="storekeys">' + known.map(function (pair) {
    return '<code onclick="tgAddStoreLine(\'' + pair[0] + '\',\'' + pair[1] + '\')" title="'
         + tgEsc(pair[1]) + '">' + pair[0] + '=…</code>';
  }).join('') + '</span>';
}

// Clicking a key appends a starter line rather than making the
// operator retype the shape. Never overwrites: an existing line
// for that store is left exactly as it is.
function tgAddStoreLine(store, example) {
  var box = tgById('f-links');
  if (!box) return;

  var lines = (box.value || '').split('\n').filter(function (line) { return line.trim(); });
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].split('=')[0].trim() === store) { tgToast(store + ' ✓'); return; }
  }
  lines.push(store + '=' + example);
  box.value = lines.join('\n');
  box.focus();
}


// ==========================================
// tgPreviewLinks
// The pages this editor actually changes.
// ==========================================
function tgPreviewLinks(game) {
  var links = [['openLanding', '/' + game.id], ['openVersions', '/' + game.id + '/versions']];

  if (game.capabilities.store) links.push(['openStore', '/' + game.id + '/store']);
  if (game.capabilities.leaderboard) links.push(['openBoard', '/' + game.id + '/leaderboard']);

  return links.map(function (pair) {
    return '<a class="btn ghost small" href="' + tgEsc(pair[1]) + '" target="_blank" rel="noopener">'
         + tgEsc(TG.t[pair[0]]) + ' ↗</a>';
  }).join('');
}

function tgToggleDownload(enabled) {
  var game = tgSelected();
  if (!game) return;

  tgCall('game.save', { gameId: game.id, patch: { download_enabled: enabled ? 1 : 0 } })
    .then(function (data) {
      if (!data) return;
      tgApplyGame(data.game);
      tgToast(TG.t.saved);
    });
}

function tgSaveGame() {
  var game = tgSelected();
  if (!game) return;

  var button = tgById('tg-save');
  button.disabled = true;
  button.textContent = TG.t.saving;

  // A field left empty is a field cleared back to the coded
  // default, not an empty string written over it. That is what
  // the "clear" list carries: without it, emptying a box
  // would override the registry with nothing at all.
  var patch = {};
  var clear = [];
  var fields = [
    ['display_name', 'f-name'], ['logo_url', 'f-logo'], ['accent_color', 'f-color-text'],
    ['status', 'f-status'], ['desc_fa', 'f-desc-fa'], ['desc_en', 'f-desc-en'],
    ['desc_ja', 'f-desc-ja'], ['min_version', 'f-minver'], ['note', 'f-note'],
    ['deeplink_scheme', 'f-deeplink']
  ];

  // Refused here as well as on the server, because the server
  // drops a bad scheme silently - which is right for it and
  // wrong for the person typing, who would press save, see
  // "saved", and find the field back to its old value.
  var scheme = (tgById('f-deeplink').value || '').trim();
  if (scheme && !/^[a-zA-Z][a-zA-Z0-9+.-]{0,80}$/.test(scheme)) {
    button.disabled = false;
    button.textContent = TG.t.save;
    tgToast(TG.t.fDeepLinkBad, true);
    return;
  }

  for (var i = 0; i < fields.length; i++) {
    var value = (tgById(fields[i][1]).value || '').trim();
    if (value) patch[fields[i][0]] = value; else clear.push(fields[i][0]);
  }

  var links = {};
  var lines = (tgById('f-links').value || '').split('\n');
  for (var j = 0; j < lines.length; j++) {
    var cut = lines[j].indexOf('=');
    if (cut <= 0) continue;
    var store = lines[j].slice(0, cut).trim();
    var url = lines[j].slice(cut + 1).trim();
    if (store && url) links[store] = url;
  }
  if (Object.keys(links).length) patch.download_json = JSON.stringify(links);
  else clear.push('download_json');

  var tags = tgTagsFromLines(tgById('f-tags').value);
  if (tags.length) patch.tags_json = JSON.stringify(tags);
  else clear.push('tags_json');

  patch.download_enabled = tgById('f-download').checked ? 1 : 0;

  tgCall('game.save', { gameId: game.id, patch: patch, clear: clear }).then(function (data) {
    button.disabled = false;
    button.textContent = TG.t.save;
    if (!data) return;
    tgApplyGame(data.game);
    // A save can succeed and still not have taken one field -
    // the deep-link scheme, on a database that has not run
    // 0004. Saying "saved" over that would be a lie about the
    // one field somebody came here to change.
    if (data.warning) tgToast(data.warning, true);
    else tgToast(TG.t.saved);
  });
}

function tgResetGame() {
  var game = tgSelected();
  if (!game || !window.confirm(TG.t.resetAsk)) return;

  tgCall('game.reset', { gameId: game.id }).then(function (data) {
    if (!data) return;
    tgApplyGame(data.game);
    tgToast(TG.t.saved);
  });
}

// Both override tables, for this game, gone. The confirm text
// spells out what survives - the game, the orders, the
// entitlements - because a red button next to the word "delete"
// in an admin panel is otherwise read as "delete the game".
function tgPurgeGame() {
  var game = tgSelected();
  if (!game || !window.confirm(TG.t.purgeAsk)) return;

  tgCall('game.purge', { gameId: game.id }).then(function (data) {
    if (!data) return;
    tgApplyGame(data.game);
    tgToast(TG.t.purgeDone);
  });
}

// The server returns the merged game after every write, and the
// panel adopts THAT rather than the values it just sent. A save
// the database rejected, clamped or normalised shows up
// immediately instead of after a reload.
function tgApplyGame(updated) {
  if (!updated) return;
  for (var i = 0; i < TG.games.length; i++) {
    if (TG.games[i].id === updated.id) { TG.games[i] = updated; break; }
  }
  tgRenderGames();
}


// ==========================================
// Tab: the game's own page
//
// Everything /{game} renders, and the release history under it.
//
// This tab is why the landing page looked like an empty
// template: the columns for a hero image, a pitch, screenshots,
// features, videos, devices and an FAQ have existed since
// migration 0005, the page has always read them, and there was
// no screen anywhere that could write one of them. A page with
// nothing in it renders as a page with nothing in it.
// ==========================================
var TG_LANG_NAMES = ['فارسی', 'English', '日本語'];
var TG_LANG_CODES = ['fa', 'en', 'ja'];

function tgRenderPage() {
  var game = tgSelected();
  var box = tgById('panel-page');
  if (!game) { box.innerHTML = '<div class="empty">—</div>'; return; }

  box.innerHTML =
    '<p class="lede">' + tgEsc(TG.t.pgLede) + '</p>'
  + '<div class="card">'
  +   '<div class="row" style="justify-content:space-between;align-items:flex-end">'
  +     tgGamePicker('tgPickGame', TG.t.sqlGame)
  +     '<a class="btn ghost small" href="/' + tgEsc(game.id) + '" target="_blank" rel="noopener">'
  +       tgEsc(TG.t.pgOpen) + ' ↗</a>'
  +   '</div>'
  + '</div>'
  + '<div id="tg-page-out"><div class="card"><div class="empty">' + tgEsc(TG.t.loading) + '</div></div></div>';

  tgCall('landing.get', { gameId: game.id }).then(function (data) {
    var target = tgById('tg-page-out');
    if (!target) return;
    if (!data) {
      target.innerHTML = '<div class="card"><div class="empty">' + tgEsc(TG.t.failed) + '</div></div>';
      return;
    }
    TG.page = data;
    tgDrawPage(data);
  });
}


// ==========================================
// Where a field's value is coming from
//
// Three states, and telling them apart is most of what this tab
// was missing. Games/Registry.js merges the stored row over the
// Config.js baseline FIELD BY FIELD, so an empty box in this
// editor does not mean an empty section on the site - it means
// "whatever the code says". Every box on this screen was empty
// for neon-katana while its public page was full, which is what
// made the tab read as broken.
//
//   db       a row is stored and it is what the page shows
//   code     the box is empty and Config.js is supplying it
//   blocked  the column does not exist here, so nothing typed
//            into this box can be saved at all
// ==========================================
function tgOriginBadge(state, baselineText) {
  if (state === 'blocked') {
    return '<span class="origin blocked" title="' + tgEsc(TG.t.pgBlockedHint) + '">'
         + tgEsc(TG.t.pgBlocked) + '</span>';
  }
  if (state === 'db') return '<span class="origin db">' + tgEsc(TG.t.pgFromDb) + '</span>';

  var hint = baselineText
    ? TG.t.pgFromCodeShows + ' ' + baselineText
    : TG.t.pgFromCodeEmpty;
  return '<span class="origin" title="' + tgEsc(hint) + '">' + tgEsc(TG.t.pgFromCode) + '</span>';
}

// Which of the three a field is in. 'stored' is what the row
// holds, 'baseline' is what Config.js holds.
function tgOriginOf(stored, blocked) {
  if (blocked) return 'blocked';
  return stored ? 'db' : 'code';
}

// A short, single-line preview of what the code baseline would
// show, for the tooltip on a "from code" badge.
function tgPeek(value) {
  if (!value) return '';
  var text = typeof value === 'string' ? value : JSON.stringify(value);
  text = String(text).replace(/\s+/g, ' ').trim();
  return text.length > 120 ? text.slice(0, 119) + '…' : text;
}


// Three inputs, one per language, as one field group. Used for
// the tagline and the long description, which are the two things
// on this page that exist once per language.
//
// 'baseline' is the Config.js text for the same field, shown as
// a placeholder rather than as a value: a placeholder disappears
// the moment somebody types, and it is not submitted - so the
// editor can show what the page currently says without that text
// silently becoming a stored override on the next save.
function tgLangFields(prefix, label, values, multiline, baseline, blocked) {
  var stored = Boolean(values && (values.fa || values.en || values.ja));
  var base = baseline || {};
  var baseText = tgPeek(base[TG.lang] || base.en || base.fa);

  var out = '<h3 class="sub">' + tgEsc(label)
          + tgOriginBadge(tgOriginOf(stored, blocked), baseText) + '</h3>';

  for (var i = 0; i < TG_LANG_CODES.length; i++) {
    var code = TG_LANG_CODES[i];
    var value = (values && values[code]) || '';
    var hint = (base && base[code]) || '';
    var dir = code === 'fa' ? 'rtl' : 'ltr';
    var place = hint ? ' placeholder="' + tgEsc(tgPeek(hint)) + '"' : '';

    out += '<label class="f"><span>' + tgEsc(TG_LANG_NAMES[i]) + '</span>'
        + (multiline
            ? '<textarea id="' + prefix + '-' + code + '" dir="' + dir + '" rows="5"' + place + '>'
              + tgEsc(value) + '</textarea>'
            : '<input type="text" id="' + prefix + '-' + code + '" dir="' + dir + '"' + place
              + ' value="' + tgEsc(value) + '">')
        + '</label>';
  }
  return out;
}

function tgLangRead(prefix) {
  var out = {};
  for (var i = 0; i < TG_LANG_CODES.length; i++) {
    var field = tgById(prefix + '-' + TG_LANG_CODES[i]);
    out[TG_LANG_CODES[i]] = field ? field.value : '';
  }
  return out;
}


// ==========================================
// Repeating rows
//
// Five of the sections on this tab are lists of the same shape:
// an ordered set of small records, added and removed one at a
// time. One shell, one reader, five body renderers - rather than
// five copies of the same add/remove/renumber code, which is
// five places for the remove button to renumber wrongly.
// ==========================================
function tgRepShell(kind, index, body) {
  return '<div class="rep-row">'
  +   '<div class="rep-head">'
  +     '<span class="rep-num">' + (index + 1) + '</span>'
  +     '<button type="button" class="btn ghost small" onclick="tgRepRemove(this)" '
  +       'aria-label="' + tgEsc(TG.t.pgRemove) + '">✕</button>'
  +   '</div>'
  +   body
  + '</div>';
}

function tgRepRemove(button) {
  var row = button.closest('.rep-row');
  var list = row.parentNode;
  row.parentNode.removeChild(row);
  tgRepRenumber(list);
}

function tgRepRenumber(list) {
  var rows = list.querySelectorAll('.rep-row .rep-num');
  for (var i = 0; i < rows.length; i++) rows[i].textContent = String(i + 1);
}

function tgRepAdd(kind) {
  var list = tgById('rep-' + kind);
  if (!list) return;

  var placeholder = list.querySelector('.empty');
  if (placeholder) list.removeChild(placeholder);

  var wrap = document.createElement('div');
  wrap.innerHTML = tgRepBody(kind, list.querySelectorAll('.rep-row').length, {});
  list.appendChild(wrap.firstChild);
  tgRepRenumber(list);

  var added = list.querySelectorAll('.rep-row');
  var first = added[added.length - 1].querySelector('[data-key]');
  if (first) first.focus();
}

// Every input in a row carries data-key, so reading a list is
// the same three lines whatever the row contains.
function tgRepRead(kind) {
  var list = tgById('rep-' + kind);
  if (!list) return [];

  var rows = list.querySelectorAll('.rep-row');
  var out = [];

  for (var i = 0; i < rows.length; i++) {
    var fields = rows[i].querySelectorAll('[data-key]');
    var record = {};
    for (var j = 0; j < fields.length; j++) {
      record[fields[j].getAttribute('data-key')] = fields[j].value;
    }
    out.push(record);
  }
  return out;
}

function tgRepList(kind, rows) {
  var body = (rows || []).map(function (row, index) {
    return tgRepBody(kind, index, row);
  }).join('');

  return '<div class="rep" id="rep-' + kind + '">'
  +   (body || '<div class="empty">' + tgEsc(TG.t.pgEmpty) + '</div>')
  + '</div>'
  + '<button type="button" class="btn ghost small" onclick="tgRepAdd(\'' + kind + '\')">+ '
  +   tgEsc(TG.t.pgAdd) + '</button>';
}

function tgRepBody(kind, index, row) {
  var value = function (key) { return tgEsc((row && row[key]) || ''); };

  if (kind === 'features') {
    return tgRepShell(kind, index,
      '<div class="grid two">'
    +   '<label class="f"><span>' + tgEsc(TG.t.pgIcon) + '</span>'
    +     '<input type="text" data-key="icon" maxlength="4" value="' + value('icon') + '" placeholder="⚔️"></label>'
    +   '<label class="f"><span>' + tgEsc(TG_LANG_NAMES[0]) + '</span>'
    +     '<input type="text" data-key="fa" dir="rtl" value="' + value('fa') + '"></label>'
    + '</div>'
    + '<div class="grid two">'
    +   '<label class="f"><span>' + tgEsc(TG_LANG_NAMES[1]) + '</span>'
    +     '<input type="text" data-key="en" dir="ltr" value="' + value('en') + '"></label>'
    +   '<label class="f"><span>' + tgEsc(TG_LANG_NAMES[2]) + '</span>'
    +     '<input type="text" data-key="ja" dir="ltr" value="' + value('ja') + '"></label>'
    + '</div>');
  }

  if (kind === 'screenshots') {
    var shot = (row && row.url) || '';
    return tgRepShell(kind, index,
      '<label class="f"><span>' + tgEsc(TG.t.pgUrl) + '</span>'
    +   '<input type="text" data-key="url" dir="ltr" value="' + value('url') + '"'
    +     ' oninput="tgRepPreview(this)" placeholder="https://…/shot-1.jpg"></label>'
    + '<label class="f"><span>' + tgEsc(TG.t.pgCaption) + '</span>'
    +   '<input type="text" data-key="caption" value="' + value('caption') + '"></label>'
    + (shot
        ? '<img class="thumb" src="' + tgEsc(shot) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">'
        : '<img class="thumb" alt="" hidden>'));
  }

  if (kind === 'videos') {
    return tgRepShell(kind, index,
      '<label class="f"><span>' + tgEsc(TG.t.pgUrl) + '</span>'
    +   '<input type="text" data-key="url" dir="ltr" value="' + value('url') + '"'
    +     ' placeholder="https://www.youtube.com/watch?v=…"></label>'
    + '<label class="f"><span>' + tgEsc(TG.t.pgTitle) + '</span>'
    +   '<input type="text" data-key="title" value="' + value('title') + '"></label>');
  }

  if (kind === 'devices') {
    var kinds = ['android', 'ios', 'windows', 'web', 'vr', 'generic'];
    var options = kinds.map(function (name) {
      return '<option value="' + name + '"' + ((row && row.kind) === name ? ' selected' : '') + '>' + name + '</option>';
    }).join('');

    return tgRepShell(kind, index,
      '<div class="grid two">'
    +   '<label class="f"><span>' + tgEsc(TG.t.pgKind) + '</span>'
    +     '<select data-key="kind">' + options + '</select></label>'
    +   '<label class="f"><span>' + tgEsc(TG.t.pgLabel) + '</span>'
    +     '<input type="text" data-key="label" value="' + value('label') + '" placeholder="Android 8+"></label>'
    + '</div>');
  }

  if (kind === 'faq') {
    var question = (row && row.q) || {};
    var answer = (row && row.a) || {};
    var pair = function (key, map, label, multiline) {
      var out = '';
      for (var i = 0; i < TG_LANG_CODES.length; i++) {
        var code = TG_LANG_CODES[i];
        var dir = code === 'fa' ? 'rtl' : 'ltr';
        out += '<label class="f"><span>' + tgEsc(label) + ' — ' + tgEsc(TG_LANG_NAMES[i]) + '</span>'
            + (multiline
                ? '<textarea data-key="' + key + '_' + code + '" dir="' + dir + '" rows="3">'
                  + tgEsc(map[code] || '') + '</textarea>'
                : '<input type="text" data-key="' + key + '_' + code + '" dir="' + dir + '" value="'
                  + tgEsc(map[code] || '') + '">')
            + '</label>';
      }
      return out;
    };

    return tgRepShell(kind, index,
      pair('q', question, TG.t.pgQuestion, false) + pair('a', answer, TG.t.pgAnswer, true));
  }

  return tgRepShell(kind, index, '');
}

// The screenshot thumbnail follows the box it belongs to, so a
// pasted URL that is wrong is visibly wrong before the save
// rather than after somebody opens the public page.
function tgRepPreview(input) {
  var row = input.closest('.rep-row');
  var image = row ? row.querySelector('.thumb') : null;
  if (!image) return;

  var url = (input.value || '').trim();
  if (!url) { image.hidden = true; return; }

  image.hidden = false;
  image.style.display = '';
  image.src = url;
}


// ==========================================
// tgDrawPage
// ==========================================
function tgDrawPage(data) {
  var landing = data.landing || {};
  var base = data.baseline || {};
  var blocked = {};
  (data.blockedSections || []).forEach(function (name) { blocked[name] = true; });

  TG.pageBlocked = blocked;

  // One list section: heading, origin badge, hint, and the rows.
  // Wrapped so a section whose column is missing can be dimmed
  // and made read-only as a unit rather than field by field.
  var section = function (icon, title, hint, kind, rows, baseRows) {
    var isBlocked = Boolean(blocked[kind]);
    var stored = (rows || []).length > 0;
    var baseCount = (baseRows || []).length;

    return '<div class="card' + (isBlocked ? ' blocked-sec' : '') + '">'
      + '<h2 class="sec">' + icon + ' ' + tgEsc(title)
      +   tgOriginBadge(tgOriginOf(stored, isBlocked),
            baseCount ? baseCount + ' ' + TG.t.pgFromCodeRows : '')
      + '</h2>'
      + '<div class="hint" style="margin-block-end:12px">' + tgEsc(hint) + '</div>'
      + (isBlocked ? '<div class="note err">' + tgEsc(TG.t.pgBlockedHint) + '</div>' : '')
      + (!stored && baseCount
          ? '<div class="note info">' + baseCount + ' ' + tgEsc(TG.t.pgCodeRowsNote) + '</div>'
          : '')
      + tgRepList(kind, rows)
      + '</div>';
  };

  var heroBlocked = Boolean(blocked.hero);

  tgById('tg-page-out').innerHTML =
    // What this screen is actually editing, said once at the top.
    // The merge is the single thing about this tab that has to be
    // understood before anything on it makes sense.
    '<div class="note info">' + tgEsc(TG.t.pgMerge) + '</div>'
  + ((data.missingColumns || []).length
      ? '<div class="note err">' + (data.missingColumns || []).length + ' '
        + tgEsc(TG.t.sqlSchemaMissing) + ' — ' + tgEsc((data.missingColumns || []).join(', '))
        + ' · ' + tgEsc(TG.t.pgRepairHere) + '</div>'
      : '')

  + '<div class="card' + (heroBlocked ? ' blocked-sec' : '') + '">'
  +   '<h2 class="sec">🖼️ ' + tgEsc(TG.t.pgHero)
  +     tgOriginBadge(tgOriginOf(landing.hero, heroBlocked), tgPeek(base.hero)) + '</h2>'
  +   '<label class="f"><span>' + tgEsc(TG.t.pgUrl) + '</span>'
  +     '<input type="text" id="pg-hero" dir="ltr" value="' + tgEsc(landing.hero || '') + '"'
  +       ' oninput="tgHeroPreview()" placeholder="' + tgEsc(base.hero || 'https://…/banner.jpg') + '">'
  +     '<span class="hint">' + tgEsc(TG.t.pgHeroHint) + '</span></label>'
  +   '<img class="thumb" id="pg-hero-preview" alt=""' + (landing.hero ? ' src="' + tgEsc(landing.hero) + '"' : ' hidden')
  +     ' onerror="this.hidden=true">'

  +   '<div' + (blocked.tagline ? ' class="blocked-sec"' : '') + '>'
  +     tgLangFields('pg-tagline', TG.t.pgTagline, landing.tagline, false, base.tagline, blocked.tagline)
  +     '<div class="hint" style="margin-block-start:-6px">' + tgEsc(TG.t.pgTaglineHint) + '</div>'
  +   '</div>'

  +   '<div' + (blocked.about ? ' class="blocked-sec"' : '') + '>'
  +     tgLangFields('pg-about', TG.t.pgAbout, landing.about, true, base.about, blocked.about)
  +     '<div class="hint" style="margin-block-start:-6px">' + tgEsc(TG.t.pgAboutHint) + '</div>'
  +   '</div>'
  + '</div>'

  + section('✨', TG.t.pgFeatures, TG.t.pgFeaturesHint, 'features', landing.features, base.features)
  + section('📷', TG.t.pgScreens, TG.t.pgScreensHint, 'screenshots', landing.screenshots, base.screenshots)
  + section('🎬', TG.t.pgVideos, TG.t.pgVideosHint, 'videos', landing.videos, base.videos)
  + section('📱', TG.t.pgDevices, TG.t.pgDevicesHint, 'devices', landing.devices, base.devices)
  + section('❓', TG.t.pgFaq, TG.t.pgFaqHint, 'faq', landing.faq, base.faq)

  + '<div class="card">'
  +   '<div class="row">'
  +     '<button type="button" class="btn" id="pg-save" onclick="tgSavePage()">' + tgEsc(TG.t.save) + '</button>'
  +     '<a class="btn ghost" href="/' + tgEsc(TG.selected) + '" target="_blank" rel="noopener">'
  +       tgEsc(TG.t.pgOpen) + ' ↗</a>'
  +     '<button type="button" class="btn ghost" onclick="tgRenderPage()">' + tgEsc(TG.t.pgReload) + '</button>'
  +   '</div>'
  +   '<div class="hint" style="margin-block-start:10px">' + tgEsc(TG.t.pgSaveHint) + '</div>'
  + '</div>'

  + '<div id="tg-versions"></div>';

  tgDrawVersions(data.versions || []);
}

function tgHeroPreview() {
  var image = tgById('pg-hero-preview');
  var url = (tgById('pg-hero').value || '').trim();
  if (!image) return;

  if (!url) { image.hidden = true; return; }
  image.hidden = false;
  image.src = url;
}


function tgSavePage() {
  var game = tgSelected();
  if (!game) return;

  var button = tgById('pg-save');
  button.disabled = true;
  button.textContent = TG.t.saving;

  var faq = tgRepRead('faq').map(function (row) {
    return {
      q: { fa: row.q_fa, en: row.q_en, ja: row.q_ja },
      a: { fa: row.a_fa, en: row.a_en, ja: row.a_ja }
    };
  });

  tgCall('landing.save', {
    gameId: game.id,
    landing: {
      hero: tgById('pg-hero').value,
      tagline: tgLangRead('pg-tagline'),
      about: tgLangRead('pg-about'),
      features: tgRepRead('features'),
      screenshots: tgRepRead('screenshots'),
      videos: tgRepRead('videos'),
      devices: tgRepRead('devices'),
      faq: faq
    }
  }).then(function (data) {
    button.disabled = false;
    button.textContent = TG.t.save;
    if (!data) return;

    // A save that could only write half its fields says so. The
    // alternative is "saved" over a FAQ that is not there, and an
    // evening spent typing it again.
    if (data.warning) tgToast(data.warning, true);
    else tgToast(TG.t.saved);

    // Redrawn from what came BACK, not from what was sent.
    //
    // The origin badges are the whole point of this screen and
    // they are claims about the database, so they have to be
    // rebuilt from the row as it now reads. It also answers the
    // question the tab could never answer before - "did that
    // actually save?" - without anybody having to open the
    // public page and squint at it.
    //
    // Merged over what landing.get returned rather than used on
    // its own: the save answer carries the landing fields and the
    // schema, and nothing else. Replacing the whole object would
    // redraw the release history from an empty list.
    var merged = {};
    var key;
    for (key in TG.page) if (Object.prototype.hasOwnProperty.call(TG.page, key)) merged[key] = TG.page[key];
    for (key in data) if (Object.prototype.hasOwnProperty.call(data, key)) merged[key] = data[key];

    TG.page = merged;
    tgDrawPage(merged);
  });
}


// ==========================================
// Versions
// ==========================================
function tgDrawVersions(versions) {
  var rows = (versions || []).map(function (release, index) {
    return '<tr>'
    + '<td><b class="mono">' + tgEsc(release.version) + '</b>'
    +   (index === 0 ? ' <span class="chip ok">' + tgEsc(TG.t.vsCurrent) + '</span>' : '') + '</td>'
    + '<td class="muted" style="font-size:.9em">' + tgEsc(tgDate(release.releasedAt)) + '</td>'
    + '<td class="muted" style="font-size:.9em">'
    +   tgEsc(tgFirstLine(release.notes)) + '</td>'
    + '<td class="row">'
    +   '<button type="button" class="btn ghost small" onclick="tgEditVersion(\'' + tgEsc(release.version) + '\')">'
    +     tgEsc(TG.t.vsEdit) + '</button>'
    +   '<button type="button" class="btn danger small" onclick="tgDeleteVersion(\'' + tgEsc(release.version) + '\')">'
    +     tgEsc(TG.t.vsDelete) + '</button>'
    + '</td></tr>';
  }).join('');

  tgById('tg-versions').innerHTML =
    '<div class="card">'
  +   '<h2 class="sec">🏷️ ' + tgEsc(TG.t.vsTitle) + '</h2>'
  +   '<p class="lede">' + tgEsc(TG.t.vsLede) + '</p>'
  +   '<div class="grid two">'
  +     '<label class="f"><span>' + tgEsc(TG.t.vsVersion) + '</span>'
  +       '<input type="text" id="vs-version" dir="ltr" placeholder="1.4.2"></label>'
  +     '<label class="f"><span>' + tgEsc(TG.t.vsDate) + '</span>'
  +       '<input type="date" id="vs-date" dir="ltr"></label>'
  +   '</div>'
  +   '<label class="f"><span>' + tgEsc(TG.t.vsDownload) + '</span>'
  +     '<input type="text" id="vs-download" dir="ltr" placeholder="https://…">'
  +     '<span class="hint">' + tgEsc(TG.t.vsDownloadHint) + '</span></label>'
  +   tgLangFields('vs-notes', TG.t.vsNotes, {}, true)
  +   '<div class="hint" style="margin-block:-6px 12px">' + tgEsc(TG.t.vsNotesHint) + '</div>'
  +   '<div class="row">'
  +     '<button type="button" class="btn" onclick="tgSaveVersion()">' + tgEsc(TG.t.vsAdd) + '</button>'
  +     '<button type="button" class="btn ghost" onclick="tgClearVersion()">' + tgEsc(TG.t.vsClear) + '</button>'
  +   '</div>'

  +   (rows
      ? '<div class="scroll" style="margin-block-start:18px"><table class="tbl"><thead><tr>'
        + '<th>' + tgEsc(TG.t.vsVersion) + '</th><th>' + tgEsc(TG.t.vsDate) + '</th>'
        + '<th>' + tgEsc(TG.t.vsNotes) + '</th><th></th>'
        + '</tr></thead><tbody>' + rows + '</tbody></table></div>'
      : '<div class="empty">' + tgEsc(TG.t.vsNone) + '</div>')
  + '</div>';
}

function tgFirstLine(notes) {
  var text = (notes && (notes[TG.lang] || notes.en || notes.fa || notes.ja)) || '';
  var first = String(text).split('\n')[0];
  return first.length > 70 ? first.slice(0, 70) + '…' : first;
}

function tgClearVersion() {
  tgById('vs-version').value = '';
  tgById('vs-date').value = '';
  tgById('vs-download').value = '';
  for (var i = 0; i < TG_LANG_CODES.length; i++) tgById('vs-notes-' + TG_LANG_CODES[i]).value = '';
}

// Editing a release fills the same form that creates one, and
// saving upserts on (game, version). One form, and no second
// screen that can drift from it.
function tgEditVersion(version) {
  var list = (TG.page && TG.page.versions) || [];
  var release = null;
  for (var i = 0; i < list.length; i++) if (list[i].version === version) release = list[i];
  if (!release) return;

  tgById('vs-version').value = release.version;
  tgById('vs-date').value = tgDateInput(release.releasedAt);
  tgById('vs-download').value = release.downloadUrl || '';
  for (var j = 0; j < TG_LANG_CODES.length; j++) {
    tgById('vs-notes-' + TG_LANG_CODES[j]).value = (release.notes && release.notes[TG_LANG_CODES[j]]) || '';
  }
  tgById('vs-version').focus();
}

// A <input type="date"> wants YYYY-MM-DD in LOCAL time. Going
// through toISOString() shifts the date by a day for anybody
// east of UTC, which is everybody this panel was built for.
function tgDateInput(ms) {
  if (!ms) return '';
  var date = new Date(ms);
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

function tgSaveVersion() {
  var game = tgSelected();
  if (!game) return;

  var version = (tgById('vs-version').value || '').trim();
  if (!/^[0-9A-Za-z][0-9A-Za-z.\-+_]*$/.test(version)) {
    tgToast(TG.t.vsBadVersion, true);
    return;
  }

  var typed = tgById('vs-date').value;
  // Midday rather than midnight: a date parsed at 00:00 UTC and
  // read back in a timezone behind UTC is the previous day.
  var releasedAt = typed ? Date.parse(typed + 'T12:00:00Z') : Date.now();

  tgCall('version.save', {
    gameId: game.id,
    version: version,
    releasedAt: releasedAt,
    downloadUrl: tgById('vs-download').value,
    notes: tgLangRead('vs-notes')
  }).then(function (data) {
    if (!data) return;
    if (TG.page) TG.page.versions = data.versions;
    tgDrawVersions(data.versions);
    tgToast(TG.t.saved);
  });
}

function tgDeleteVersion(version) {
  var game = tgSelected();
  if (!game || !window.confirm(TG.t.vsDeleteAsk)) return;

  tgCall('version.delete', { gameId: game.id, version: version }).then(function (data) {
    if (!data) return;
    if (TG.page) TG.page.versions = data.versions;
    tgDrawVersions(data.versions);
    tgToast(TG.t.saved);
  });
}


// ==========================================
// Tab: storefront
// ==========================================
function tgRenderStore() {
  var game = tgSelected();
  var box = tgById('panel-store');
  if (!game) { box.innerHTML = '<div class="empty">—</div>'; return; }

  var rows = (game.products || []).map(function (product) {
    var badges = [['', TG.t.badgeNone], ['best', TG.t.badgeBest], ['new', TG.t.badgeNew], ['sale', TG.t.badgeSale]]
      .map(function (pair) {
        return '<option value="' + pair[0] + '"' + (product.badge === pair[0] ? ' selected' : '') + '>'
             + tgEsc(pair[1]) + '</option>';
      }).join('');

    var grant = product.grant
      ? (product.grant.type || '') + ' · ' + (product.grant.code || '')
        + (product.grant.amount ? ' ×' + product.grant.amount : '')
      : '—';

    return '<tr>'
    + '<td><b>' + tgEsc(product.icon || '📦') + ' ' + tgEsc(tgLocalized(product.name, product.id)) + '</b><br>'
    +   '<code class="muted">' + tgEsc(product.id) + '</code>'
    +   (product.overrides.length ? ' <span class="chip info">' + tgEsc(TG.t.edited) + '</span>' : '') + '</td>'
    + '<td><span class="chip">' + tgEsc(product.kind) + '</span>'
    +   (product.durationDays ? '<br><span class="muted" style="font-size:.9em">' + product.durationDays + 'd</span>' : '') + '</td>'
    + '<td class="muted" style="font-size:.9em">' + tgEsc(grant) + '</td>'
    + '<td><input type="text" dir="ltr" style="width:88px" id="p-price-' + tgEsc(product.id) + '"'
    +   ' value="' + tgEsc(product.priceUsd) + '"></td>'
    + '<td><select id="p-badge-' + tgEsc(product.id) + '" style="width:120px">' + badges + '</select></td>'
    + '<td><input type="number" style="width:70px" id="p-order-' + tgEsc(product.id) + '"'
    +   ' value="' + Number(product.sortOrder || 0) + '"></td>'
    + '<td><label class="switch"><input type="checkbox" id="p-on-' + tgEsc(product.id) + '"'
    +   (product.enabled ? ' checked' : '') + '><span class="track"></span></label></td>'
    + '<td class="row">'
    +   '<button type="button" class="btn small" onclick="tgSaveProduct(\'' + tgEsc(product.id) + '\')">'
    +     tgEsc(TG.t.save) + '</button>'
    +   '<button type="button" class="btn ghost small" onclick="tgResetProduct(\'' + tgEsc(product.id) + '\')">↺</button>'
    + '</td></tr>';
  }).join('');

  box.innerHTML =
    '<p class="lede">' + tgEsc(TG.t.storeLede) + '</p>'
  + tgGamePicker('tgPickGame', TG.t.sqlGame)
  + '<div class="card">'
  +   (rows
      ? '<div class="scroll"><table class="tbl"><thead><tr>'
        + '<th>' + tgEsc(TG.t.tabStore) + '</th><th>' + tgEsc(TG.t.pKind) + '</th>'
        + '<th>' + tgEsc(TG.t.pGrant) + '</th><th>' + tgEsc(TG.t.pPrice) + '</th>'
        + '<th>' + tgEsc(TG.t.pBadge) + '</th><th>' + tgEsc(TG.t.pOrder) + '</th>'
        + '<th>' + tgEsc(TG.t.pEnabled) + '</th><th></th>'
        + '</tr></thead><tbody>' + rows + '</tbody></table></div>'
      : '<div class="empty">' + tgEsc(TG.t.pNone) + '</div>')
  + '</div>';
}

function tgSaveProduct(productId) {
  var game = tgSelected();
  if (!game) return;

  var price = (tgById('p-price-' + productId).value || '').trim();
  var badge = tgById('p-badge-' + productId).value;
  var order = tgById('p-order-' + productId).value;
  var enabled = tgById('p-on-' + productId).checked;

  var patch = { enabled: enabled ? 1 : 0, sort_order: Number(order) || 0 };
  var clear = [];

  if (price) patch.price_usd = price; else clear.push('price_usd');

  // "No ribbon" is a choice, not an empty field, so it is SAVED
  // as an empty string rather than cleared to NULL. Clearing it
  // would mean "no override", which puts back whatever ribbon
  // Config.js gives the product - the opposite of what the person
  // who just picked "No ribbon" asked for. The per-product reset
  // button is how you get back to the coded value.
  patch.badge = badge || '';

  tgCall('product.save', { gameId: game.id, productId: productId, patch: patch, clear: clear })
    .then(function (data) {
      if (!data) return;
      tgApplyGameQuiet(data.game);
      tgRenderStore();
      tgToast(TG.t.saved);
    });
}

function tgResetProduct(productId) {
  var game = tgSelected();
  if (!game) return;

  tgCall('product.reset', { gameId: game.id, productId: productId }).then(function (data) {
    if (!data) return;
    tgApplyGameQuiet(data.game);
    tgRenderStore();
    tgToast(TG.t.saved);
  });
}

function tgApplyGameQuiet(updated) {
  if (!updated) return;
  for (var i = 0; i < TG.games.length; i++) {
    if (TG.games[i].id === updated.id) { TG.games[i] = updated; return; }
  }
}


// ==========================================
// Tab: payments
// ==========================================
function tgRenderOrders() {
  var box = tgById('panel-orders');
  var statuses = ['', 'created', 'awaiting_payment', 'paid', 'granted', 'partially_paid', 'expired', 'refunded', 'failed'];

  var options = statuses.map(function (status) {
    return '<option value="' + status + '">' + tgEsc(status || TG.t.oAny) + '</option>';
  }).join('');

  box.innerHTML =
    '<p class="lede">' + tgEsc(TG.t.ordersLede) + '</p>'
  + (TG.health.provider ? '' : '<div class="note err">' + tgEsc(TG.t.oNotConfigured) + '</div>')
  + '<div class="card">'
  +   '<div class="row" style="justify-content:space-between">'
  +     '<h2 class="sec" style="margin:0">💳 ' + tgEsc(TG.t.tabOrders) + '</h2>'
  +     '<a class="btn ghost small" href="https://account.nowpayments.io/payments" target="_blank" rel="noopener">'
  +       tgEsc(TG.t.oProviderPanel) + ' ↗</a>'
  +   '</div>'
  +   '<div class="hint" style="margin-block:8px 16px">' + tgEsc(TG.t.oProviderHint) + '</div>'
  +   '<div id="tg-order-stats" class="grid three"></div>'
  + '</div>'
  + '<div class="card">'
  +   '<div class="grid two">'
  +     '<label class="f"><span>' + tgEsc(TG.t.oSearch) + '</span>'
  +       '<input type="text" id="o-q" dir="ltr"></label>'
  +     '<label class="f"><span>' + tgEsc(TG.t.oStatus) + '</span>'
  +       '<select id="o-status">' + options + '</select></label>'
  +   '</div>'
  +   tgGamePicker('tgPickGame', TG.t.sqlGame)
  +   '<button type="button" class="btn" onclick="tgLoadOrders()">' + tgEsc(TG.t.oLoad) + '</button>'
  +   '<div id="tg-orders" style="margin-block-start:16px"></div>'
  + '</div>';

  tgLoadOrders();
}

function tgLoadOrders() {
  var game = tgSelected();
  var target = tgById('tg-orders');
  target.innerHTML = '<div class="empty">' + tgEsc(TG.t.loading) + '</div>';

  tgCall('orders.list', {
    gameId: game ? game.id : '',
    q: tgById('o-q') ? tgById('o-q').value : '',
    status: tgById('o-status') ? tgById('o-status').value : ''
  }).then(function (data) {
    if (!data) { target.innerHTML = ''; return; }

    var stats = data.stats || {};
    tgById('tg-order-stats').innerHTML = [
      [TG.t.oTotal, stats.total || 0],
      [TG.t.oGranted, stats.granted || 0],
      [TG.t.oOpen, stats.open || 0],
      [TG.t.oPartial, stats.partial || 0],
      [TG.t.oRevenue, '$' + (stats.revenueUsd || 0)]
    ].map(function (pair) {
      return '<div class="note" style="margin:0"><b style="font-size:1.3em;display:block">' + tgEsc(pair[1]) + '</b>'
           + '<span class="muted" style="font-size:.85em">' + tgEsc(pair[0]) + '</span></div>';
    }).join('');

    if (!data.orders.length) {
      target.innerHTML = '<div class="empty">' + tgEsc(TG.t.oNone) + '</div>';
      return;
    }

    var rows = data.orders.map(function (order) {
      var tone = order.status === 'granted' ? 'ok'
               : order.status === 'partially_paid' || order.status === 'paid' ? 'warn'
               : order.status === 'refunded' || order.status === 'failed' ? 'err' : '';

      return '<tr>'
      + '<td><code>' + tgEsc(order.id) + '</code><br>'
      +   '<span class="muted" style="font-size:.85em">' + tgEsc(tgDate(order.createdAt)) + '</span></td>'
      + '<td>' + tgEsc(order.productId) + '<br>'
      +   '<span class="muted" style="font-size:.85em">' + tgEsc(order.gameId) + '</span></td>'
      + '<td dir="ltr">' + tgEsc(order.email) + '<br>'
      +   '<code class="muted">' + tgEsc(order.playerUid) + '</code></td>'
      + '<td dir="ltr"><b>$' + tgEsc(order.priceUsd) + '</b>'
      +   (order.quantity > 1 ? ' ×' + order.quantity : '')
      +   (order.payCurrency ? '<br><span class="muted" style="font-size:.85em">' + tgEsc(order.payCurrency) + '</span>' : '')
      + '</td>'
      + '<td><span class="chip ' + tone + '">' + tgEsc(order.status) + '</span></td>'
      + '<td>' + (order.status === 'paid'
          ? '<button type="button" class="btn small" onclick="tgGrantOrder(\'' + tgEsc(order.id) + '\')">'
            + tgEsc(TG.t.oGrant) + '</button>'
          : '') + '</td>'
      + '</tr>';
    }).join('');

    target.innerHTML = '<div class="scroll"><table class="tbl"><tbody>' + rows + '</tbody></table></div>';
  });
}

function tgGrantOrder(orderId) {
  if (!window.confirm(TG.t.oGrantAsk)) return;
  tgCall('order.grant', { orderId: orderId }).then(function (data) {
    if (!data) return;
    tgToast(TG.t.saved);
    tgLoadOrders();
  });
}


// ==========================================
// Tab: players


// ==========================================
// ==========================================
// Tab: players
//
// It now reads the GAME's own players table, which is where all
// of that lives and where moderation has to be written for
// Worker.js to enforce it.
// ==========================================
function tgRenderPlayers() {
  tgById('panel-players').innerHTML =
    '<p class="lede">' + tgEsc(TG.t.playersLede) + '</p>'
  + '<div class="card">'
  +   '<div class="grid two">'
  +     tgGamePicker('tgPickGame', TG.t.sqlGame)
  +     '<label class="f"><span>' + tgEsc(TG.t.plState) + '</span>'
  +       '<select id="pl-state" onchange="tgFindPlayers()">'
  +         '<option value="">' + tgEsc(TG.t.plAny) + '</option>'
  +         '<option value="active">' + tgEsc(TG.t.plActive) + '</option>'
  +         '<option value="restricted">' + tgEsc(TG.t.plRestricted) + '</option>'
  +         '<option value="banned">' + tgEsc(TG.t.plBanned) + '</option>'
  +       '</select></label>'
  +   '</div>'
  +   '<div class="row">'
  +     '<label class="f" style="flex:1 1 260px"><span>' + tgEsc(TG.t.plSearch) + '</span>'
  +       '<input type="text" id="pl-q" dir="ltr" onkeydown="if(event.key===\'Enter\')tgFindPlayers()"></label>'
  +     '<button type="button" class="btn" onclick="tgFindPlayers()">' + tgEsc(TG.t.plFind) + '</button>'
  +   '</div>'
  +   '<div id="tg-players" style="margin-block-start:14px"></div>'
  + '</div>'
  + '<div id="tg-player-detail"></div>';

  tgFindPlayers();
}

function tgPlayTime(seconds) {
  var total = Number(seconds) || 0;
  if (!total) return '—';
  var h = Math.floor(total / 3600);
  var m = Math.floor((total % 3600) / 60);
  return h ? (h + TG.t.plHours + ' ' + m + TG.t.plMinutes) : (m + TG.t.plMinutes);
}

function tgStateChip(player) {
  if (player.state === 'banned') return '<span class="chip err">' + tgEsc(TG.t.plBanned) + '</span>';
  if (player.state === 'restricted') return '<span class="chip warn">' + tgEsc(TG.t.plRestricted) + '</span>';
  return '<span class="chip ok">' + tgEsc(TG.t.plActive) + '</span>';
}

function tgFindPlayers() {
  var game = tgSelected();
  var target = tgById('tg-players');
  if (!game) { target.innerHTML = ''; return; }

  target.innerHTML = '<div class="empty">' + tgEsc(TG.t.loading) + '</div>';

  tgCall('players.list', {
    gameId: game.id,
    q: tgById('pl-q') ? tgById('pl-q').value : '',
    status: tgById('pl-state') ? tgById('pl-state').value : '',
    limit: 60
  }).then(function (data) {
    if (!data) { target.innerHTML = '<div class="empty">' + tgEsc(TG.t.failed) + '</div>'; return; }

    // Remembered so the row buttons can be disabled with an
    // explanation rather than failing one at a time.
    TG.playerModeration = data.moderation;

    var warn = data.moderation ? ''
      : '<div class="note warn">' + tgEsc(TG.t.plNoModeration) + '</div>';

    if (!data.players.length) {
      target.innerHTML = warn + '<div class="empty">' + tgEsc(TG.t.plNone) + '</div>';
      return;
    }

    var rows = data.players.map(function (p) {
      return '<tr>'
      + '<td>'
      +   '<div class="plrow">'
      +     '<span class="plavatar">' + (p.picture
              ? '<img src="' + tgEsc(p.picture) + '" alt="" onerror="this.style.display=\'none\'">' : '👤') + '</span>'
      +     '<span><b>' + tgEsc(p.username || '—') + '</b><br>'
      +       '<span class="muted" dir="ltr" style="font-size:.85em">' + tgEsc(p.email) + '</span></span>'
      +   '</div>'
      + '</td>'
      + '<td dir="ltr"><b>' + Number(p.highScore).toLocaleString(TG.locale) + '</b>'
      +   '<br><span class="muted" style="font-size:.8em">' + tgEsc(TG.t.plScore) + '</span></td>'
      + '<td><b>' + Number(p.gamesPlayed).toLocaleString(TG.locale) + '</b>'
      +   '<br><span class="muted" style="font-size:.8em">' + tgEsc(TG.t.plRuns) + '</span></td>'
      + '<td>' + tgEsc(tgPlayTime(p.playTime))
      +   '<br><span class="muted" style="font-size:.8em">' + tgEsc(TG.t.plPlayTime) + '</span></td>'
      + '<td class="muted" style="font-size:.82em">' + tgEsc(tgDate(p.createdAt)) + '</td>'
      + '<td>' + tgStateChip(p) + '</td>'
      + '<td><button type="button" class="btn small" onclick="tgOpenPlayer(\'' + tgEsc(p.playerId) + '\')">'
      +   tgEsc(TG.t.plManage) + '</button></td>'
      + '</tr>';
    }).join('');

    target.innerHTML = warn
      + '<div class="muted" style="font-size:.82em;margin-block-end:8px">'
      +   tgEsc(TG.t.plTotal) + ': ' + Number(data.total).toLocaleString(TG.locale) + '</div>'
      + '<div class="scroll"><table class="tbl"><thead><tr>'
      +   '<th>' + tgEsc(TG.t.plPlayer) + '</th><th>' + tgEsc(TG.t.plScore) + '</th>'
      +   '<th>' + tgEsc(TG.t.plRuns) + '</th><th>' + tgEsc(TG.t.plPlayTime) + '</th>'
      +   '<th>' + tgEsc(TG.t.plJoined) + '</th><th>' + tgEsc(TG.t.plState) + '</th><th></th>'
      + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  });
}


// ==========================================
// tgOpenPlayer
// One player, everything about them, and every action.
// ==========================================
function tgOpenPlayer(playerId) {
  var game = tgSelected();
  var target = tgById('tg-player-detail');
  if (!game) return;

  target.innerHTML = '<div class="card"><div class="empty">' + tgEsc(TG.t.loading) + '</div></div>';

  tgCall('player.profile', { gameId: game.id, playerId: playerId }).then(function (data) {
    if (!data) { target.innerHTML = ''; return; }

    var p = data.player;
    var products = (game && game.products) || [];
    var canModerate = TG.playerModeration !== false;

    var owned = data.entitlements.length
      ? '<div class="scroll"><table class="tbl"><tbody>' + data.entitlements.map(function (row) {
          var expired = row.expiresAt && row.expiresAt < Date.now();
          return '<tr>'
          + '<td><b>' + tgEsc(row.productId) + '</b> <span class="chip">' + tgEsc(row.kind) + '</span></td>'
          + '<td><b>' + Number(row.quantity).toLocaleString(TG.locale) + '</b></td>'
          + '<td class="muted" style="font-size:.82em">' + tgEsc(row.source) + '</td>'
          + '<td>' + (row.expiresAt
              ? '<span class="chip ' + (expired ? 'err' : 'ok') + '">' + tgEsc(tgDate(row.expiresAt)) + '</span>'
              : '<span class="muted">—</span>') + '</td>'
          + '<td><button type="button" class="btn ghost small" onclick="tgRevoke(\'' + tgEsc(game.id)
          +   '\',\'' + tgEsc(p.playerId) + '\',\'' + tgEsc(row.productId) + '\')">'
          +   tgEsc(TG.t.plRevoke) + '</button></td>'
          + '</tr>';
        }).join('') + '</tbody></table></div>'
      : '<div class="empty">' + tgEsc(TG.t.plOwnsNone) + '</div>';

    var history = data.events.length
      ? '<div class="scroll"><table class="tbl"><tbody>' + data.events.map(function (e) {
          return '<tr><td class="muted" style="font-size:.82em">' + tgEsc(tgDate(e.at)) + '</td>'
          + '<td><b>' + tgEsc(e.productId) + '</b></td>'
          + '<td><span class="chip">' + tgEsc(e.kind) + '</span></td>'
          + '<td dir="ltr">' + tgEsc(e.amount) + '</td>'
          + '<td class="muted" style="font-size:.82em">' + tgEsc(e.detail) + '</td></tr>';
        }).join('') + '</tbody></table></div>'
      : '<div class="empty">—</div>';

    var options = products.map(function (product) {
      return '<option value="' + tgEsc(product.id) + '">' + tgEsc(tgLocalized(product.name, product.id)) + '</option>';
    }).join('');

    target.innerHTML =
      '<div class="card" style="margin-block-start:18px">'
    +   '<h2 class="sec">'
    +     '<span class="plavatar">' + (p.picture
            ? '<img src="' + tgEsc(p.picture) + '" alt="" onerror="this.style.display=\'none\'">' : '👤') + '</span>'
    +     tgEsc(p.username || p.playerId) + ' ' + tgStateChip(p)
    +   '</h2>'

    +   '<div class="plstats">'
    +     tgStat(TG.t.plScore, Number(p.highScore).toLocaleString(TG.locale))
    +     tgStat(TG.t.plRuns, Number(p.gamesPlayed).toLocaleString(TG.locale))
    +     tgStat(TG.t.plPlayTime, tgPlayTime(p.playTime))
    +     tgStat(TG.t.plJoined, tgDate(p.createdAt))
    +     tgStat(TG.t.plLastSeen, tgDate(p.lastLogin))
    +   '</div>'

    +   '<div class="scroll"><table class="tbl"><tbody>'
    +     '<tr><td>' + tgEsc(TG.t.plEmail) + '</td><td dir="ltr"><code>' + tgEsc(p.email) + '</code></td></tr>'
    +     '<tr><td>' + tgEsc(TG.t.plId) + '</td><td dir="ltr"><code>' + tgEsc(p.playerId) + '</code></td></tr>'

    // The player's own leaderboard decision. Here so that "why is
    // this player not on the board?" has an answer, and read-only
    // because it is theirs: an operator quietly putting somebody
    // back onto a public list they chose to leave is not something
    // this panel should make easy.
    +     (p.boardOptOutSupported
        ? '<tr><td>' + tgEsc(TG.t.plBoard) + '</td><td>'
          + (p.boardHidden
              ? '<span class="chip warn">' + tgEsc(TG.t.plBoardHidden) + '</span>'
                + ' <span class="muted">' + tgEsc(TG.t.plBoardHiddenWhy) + '</span>'
              : '<span class="chip ok">' + tgEsc(TG.t.plBoardShown) + '</span>')
          + '</td></tr>'
        : '')
    +     (p.state === 'banned'
        ? '<tr><td>' + tgEsc(TG.t.plBannedAt) + '</td><td>' + tgEsc(tgDate(p.bannedAt))
          + ' <span class="muted">' + tgEsc(p.banReason) + '</span></td></tr>' : '')
    +     (p.state === 'restricted'
        ? '<tr><td>' + tgEsc(TG.t.plUntil) + '</td><td>' + tgEsc(tgDate(p.restrictedUntil))
          + ' <span class="muted">' + tgEsc(p.restrictReason) + '</span></td></tr>' : '')
    +   '</tbody></table></div>'

    +   '<h3 class="sub">' + tgEsc(TG.t.plRename) + '</h3>'
    +   '<div class="row">'
    +     '<input type="text" id="pl-name" dir="ltr" style="max-width:220px" value="' + tgEsc(p.username) + '">'
    +     '<button type="button" class="btn small" onclick="tgRenamePlayer(\'' + tgEsc(p.playerId) + '\')">'
    +       tgEsc(TG.t.save) + '</button>'
    +     '<span class="hint">' + tgEsc(TG.t.plRenameHint) + '</span>'
    +   '</div>'

    +   '<h3 class="sub">' + tgEsc(TG.t.plModeration) + '</h3>'
    +   (canModerate ? '' : '<div class="note warn">' + tgEsc(TG.t.plNoModeration) + '</div>')
    +   '<label class="f"><span>' + tgEsc(TG.t.plReason) + '</span>'
    +     '<input type="text" id="pl-reason" placeholder="' + tgEsc(TG.t.plReasonHint) + '"></label>'
    +   '<div class="row">'
    +     (p.state === 'banned'
        ? '<button type="button" class="btn small" ' + (canModerate ? '' : 'disabled ')
          + 'onclick="tgModerate(\'' + tgEsc(p.playerId) + '\',{banned:false})">' + tgEsc(TG.t.plUnban) + '</button>'
        : '<button type="button" class="btn danger small" ' + (canModerate ? '' : 'disabled ')
          + 'onclick="tgModerate(\'' + tgEsc(p.playerId) + '\',{banned:true})">' + tgEsc(TG.t.plBan) + '</button>')
    +     '<button type="button" class="btn ghost small" ' + (canModerate ? '' : 'disabled ')
    +       'onclick="tgModerate(\'' + tgEsc(p.playerId) + '\',{restrictDays:7})">' + tgEsc(TG.t.plRestrict7) + '</button>'
    +     '<button type="button" class="btn ghost small" ' + (canModerate ? '' : 'disabled ')
    +       'onclick="tgModerate(\'' + tgEsc(p.playerId) + '\',{restrictDays:30})">' + tgEsc(TG.t.plRestrict30) + '</button>'
    +     (p.state === 'restricted'
        ? '<button type="button" class="btn ghost small" onclick="tgModerate(\'' + tgEsc(p.playerId)
          + '\',{restrictDays:0})">' + tgEsc(TG.t.plLift) + '</button>' : '')
    +   '</div>'
    +   '<div class="hint" style="margin-block-start:8px">' + tgEsc(TG.t.plBanEffect) + '</div>'

    +   '<label class="f" style="margin-block-start:14px"><span>' + tgEsc(TG.t.plNote) + '</span>'
    +     '<input type="text" id="pl-note" value="' + tgEsc(p.note) + '" '
    +       'onchange="tgModerate(\'' + tgEsc(p.playerId) + '\',{note:this.value})">'
    +     '<span class="hint">' + tgEsc(TG.t.plNoteHint) + '</span></label>'

    +   '<h3 class="sub">' + tgEsc(TG.t.plOwns) + '</h3>'
    +   owned

    +   '<h3 class="sub">' + tgEsc(TG.t.plGrant) + '</h3>'
    +   '<div class="grid three">'
    +     '<label class="f"><span>' + tgEsc(TG.t.pKind) + '</span><select id="pl-product">' + options + '</select></label>'
    +     '<label class="f"><span>' + tgEsc(TG.t.plQuantity) + '</span>'
    +       '<input type="number" id="pl-qty" value="1" min="1"></label>'
    +     '<label class="f"><span>' + tgEsc(TG.t.plReason) + '</span>'
    +       '<input type="text" id="pl-grant-reason"></label>'
    +   '</div>'
    +   '<button type="button" class="btn" onclick="tgGrant(\'' + tgEsc(game.id) + '\',\'' + tgEsc(p.playerId) + '\')">'
    +     tgEsc(TG.t.plGrant) + '</button>'

    +   '<h3 class="sub">' + tgEsc(TG.t.plHistory) + '</h3>'
    +   history

    +   '<h3 class="sub">' + tgEsc(TG.t.plDanger) + '</h3>'
    +   '<div class="note err">' + tgEsc(TG.t.plDeleteHint)
    +     '<div class="row" style="margin-block-start:10px">'
    +       '<button type="button" class="btn danger small" onclick="tgDeletePlayer(\'' + tgEsc(p.playerId) + '\')">'
    +         tgEsc(TG.t.plDelete) + '</button>'
    +     '</div>'
    +   '</div>'
    + '</div>';

    target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

function tgStat(label, value) {
  return '<div class="plstat"><b>' + tgEsc(value) + '</b><span>' + tgEsc(label) + '</span></div>';
}

function tgModerate(playerId, patch) {
  var game = tgSelected();
  if (!game) return;

  var reason = tgById('pl-reason');
  var payload = { gameId: game.id, playerId: playerId };
  for (var key in patch) payload[key] = patch[key];
  if (reason && reason.value) payload.reason = reason.value;

  if (patch.banned === true && !window.confirm(TG.t.plBanAsk)) return;

  tgCall('player.moderate', payload).then(function (data) {
    if (!data) return;
    tgToast(TG.t.saved);
    tgOpenPlayer(playerId);
    tgFindPlayers();
  });
}

function tgRenamePlayer(playerId) {
  var game = tgSelected();
  if (!game) return;

  tgCall('player.rename', {
    gameId: game.id, playerId: playerId, username: tgById('pl-name').value
  }).then(function (data) {
    if (!data) return;
    tgToast(TG.t.saved);
    tgOpenPlayer(playerId);
    tgFindPlayers();
  });
}

function tgDeletePlayer(playerId) {
  var game = tgSelected();
  if (!game || !window.confirm(TG.t.plDeleteAsk)) return;

  tgCall('player.delete', { gameId: game.id, playerId: playerId }).then(function (data) {
    if (!data) return;
    tgToast(TG.t.saved);
    tgById('tg-player-detail').innerHTML = '';
    tgFindPlayers();
  });
}

function tgGrant(gameId, playerUid) {
  tgCall('player.grant', {
    gameId: gameId,
    playerUid: playerUid,
    productId: tgById('pl-product').value,
    quantity: Number(tgById('pl-qty').value) || 1,
    reason: tgById('pl-grant-reason').value
  }).then(function (data) {
    if (!data) return;
    tgToast(TG.t.saved);
    tgOpenPlayer(playerUid);
  });
}

function tgRevoke(gameId, playerUid, productId) {
  if (!window.confirm(TG.t.plRevokeAsk)) return;

  tgCall('player.revoke', { gameId: gameId, playerUid: playerUid, productId: productId })
    .then(function (data) {
      if (!data) return;
      tgToast(TG.t.saved);
      tgOpenPlayer(playerUid);
    });
}


// ==========================================
// Tab: SQL builder
// ==========================================
function tgRenderSql() {
  tgById('panel-sql').innerHTML =
    '<p class="lede">' + tgEsc(TG.t.sqlLede) + '</p>'
  + '<div class="note info">' + tgEsc(TG.t.sqlNoRun) + '</div>'

  // What each button does, before the buttons.
  //
  // This tab used to be four unlabelled buttons over an empty
  // box, and the only way to learn what one produced was to press
  // it and read four hundred lines of generated SQL. The four
  // outputs answer genuinely different questions and three of
  // them are rarely what somebody actually came here for.
  + '<div class="card">'
  +   '<h2 class="sec">🧭 ' + tgEsc(TG.t.sqlWhat) + '</h2>'
  +   '<ul class="sqlwhat">'
  +     '<li><b>' + tgEsc(TG.t.sqlSchema) + '</b> — ' + tgEsc(TG.t.sqlWhatSchema) + '</li>'
  +     '<li><b>' + tgEsc(TG.t.sqlSettings) + '</b> — ' + tgEsc(TG.t.sqlWhatSettings) + '</li>'
  +     '<li><b>' + tgEsc(TG.t.sqlPurge) + '</b> — ' + tgEsc(TG.t.sqlWhatPurge) + '</li>'
  +     '<li><b>' + tgEsc(TG.t.sqlBuild) + '</b> — ' + tgEsc(TG.t.sqlWhatBuild) + '</li>'
  +   '</ul>'
  + '</div>'

  + '<div class="card">'
  +   '<div class="grid two">'
  +     tgGamePicker('tgPickGame', TG.t.sqlGame)
  +     '<label class="f"><span>' + tgEsc(TG.t.sqlNewId) + '</span>'
  +       '<input type="text" id="sql-id" dir="ltr" placeholder="my-new-game"></label>'
  +   '</div>'
  +   '<div class="row" style="margin-block-end:16px">'
  +     '<label class="switch"><input type="checkbox" id="sql-purchases" checked><span class="track"></span>'
  +       '<span>' + tgEsc(TG.t.sqlPurchases) + '</span></label>'
  +     '<label class="switch"><input type="checkbox" id="sql-sessions"><span class="track"></span>'
  +       '<span>' + tgEsc(TG.t.sqlSessions) + '</span></label>'
  +     '<label class="switch"><input type="checkbox" id="sql-seed"><span class="track"></span>'
  +       '<span>' + tgEsc(TG.t.sqlSeed) + '</span></label>'
  +   '</div>'
  +   '<div class="row">'
  +     '<button type="button" class="btn" onclick="tgLoadSchema()">' + tgEsc(TG.t.sqlSchema) + '</button>'
  +     '<button type="button" class="btn ghost" onclick="tgBuildSettingsSql()">' + tgEsc(TG.t.sqlSettings) + '</button>'
  +     '<button type="button" class="btn ghost" onclick="tgBuildPurgeSql()">' + tgEsc(TG.t.sqlPurge) + '</button>'
  +     '<button type="button" class="btn ghost" onclick="tgBuildSql()">' + tgEsc(TG.t.sqlBuild) + '</button>'
  +   '</div>'
  + '</div>'
  + '<div id="tg-sql-out"></div>';

  // The schema is the answer to "why did my edit not save?", so
  // it is what the tab opens on rather than something to go
  // looking for.
  tgLoadSchema();
}


// ==========================================
// The schema view
//
// One table per database, listing what is really there. Built
// from PRAGMA table_info on the live D1 rather than from the
// files in migrations/, because those two disagreed on this
// deployment for months and only one of them decides whether a
// save works.
// ==========================================
function tgLoadSchema() {
  var game = tgSelected();
  var out = tgById('tg-sql-out');
  if (!out) return;

  out.innerHTML = '<div class="card"><div class="empty">' + tgEsc(TG.t.loading) + '</div></div>';

  tgCall('schema.get', { gameId: game ? game.id : '' }).then(function (data) {
    if (!data) { out.innerHTML = '<div class="card"><div class="empty">' + tgEsc(TG.t.failed) + '</div></div>'; return; }
    TG.schema = data;
    out.innerHTML = tgSchemaCard(data);
  });
}

function tgSchemaChip(present) {
  return present
    ? '<span class="chip ok">✓ ' + tgEsc(TG.t.sqlSchemaPresent) + '</span>'
    : '<span class="chip err">✕ ' + tgEsc(TG.t.sqlSchemaAbsent) + '</span>';
}

function tgSchemaCard(data) {
  var settings = data.licence.settings;
  var missing = settings.missing || [];

  // Every column the panel knows about, present ones first being
  // useless - so they are listed in schema order with their state
  // beside them. A missing column has to be findable at a glance,
  // which is what the count and the banner above the table are
  // for.
  var rows = (settings.present || []).map(function (name) {
    return { name: name, present: true, since: '' };
  }).concat(missing.map(function (column) {
    return { name: column.name, present: false, since: column.since };
  }));

  rows.sort(function (a, b) { return a.present === b.present ? 0 : (a.present ? -1 : 1); });

  var table = '<div class="scroll"><table class="tbl"><thead><tr>'
    + '<th>' + tgEsc(TG.t.sqlSchemaColumn) + '</th>'
    + '<th>' + tgEsc(TG.t.sqlSchemaTable) + '</th>'
    + '<th>' + tgEsc(TG.t.sqlSchemaFrom) + '</th>'
    + '</tr></thead><tbody>'
    + rows.map(function (row) {
        return '<tr><td><code>' + tgEsc(row.name) + '</code></td>'
             + '<td>' + tgSchemaChip(row.present) + '</td>'
             + '<td class="muted" style="font-size:.85em">' + tgEsc(row.since || '—') + '</td></tr>';
      }).join('')
    + '</tbody></table></div>';

  var banner = missing.length
    ? '<div class="note err">' + missing.length + ' ' + tgEsc(TG.t.sqlSchemaMissing) + ' — '
      + tgEsc(TG.t.sqlSchemaMissingWhy) + '</div>'
    : '<div class="note ok">' + tgEsc(TG.t.sqlSchemaOk) + '</div>';

  var repair = missing.length
    ? '<div class="row" style="margin-block-start:12px">'
      + '<button type="button" class="btn" onclick="tgRepairSchema()">'
      +   tgEsc(TG.t.sqlSchemaRepair) + '</button>'
      + '</div>'
    : '';

  // The game's own database. A different D1 entirely, and the
  // distinction is the one thing about this system that is
  // genuinely easy to get wrong: settings live in one, players
  // live in the other, and a migration run against the wrong one
  // succeeds and does nothing useful.
  var player = data.player;
  var playerCard = '';
  if (player) {
    var features = [
      ['banned_at', TG.t.plModeration, player.moderation],
      ['data_json', TG.t.pgAbout, player.document],
      ['leaderboard_opt_out', TG.t.plBoard, player.leaderboardOptOut]
    ];

    playerCard = '<div class="card">'
      + '<h2 class="sec">🎮 ' + tgEsc(TG.t.sqlSchemaPlayer) + '</h2>'
      + '<div class="hint" style="margin-block-end:12px"><code>' + tgEsc(player.binding || '—') + '</code></div>'
      + (player.bound
          ? '<div class="scroll"><table class="tbl"><thead><tr>'
            + '<th>' + tgEsc(TG.t.sqlSchemaFeature) + '</th>'
            + '<th>' + tgEsc(TG.t.sqlSchemaColumn) + '</th>'
            + '<th>' + tgEsc(TG.t.sqlSchemaTable) + '</th></tr></thead><tbody>'
            + features.map(function (feature) {
                return '<tr><td>' + tgEsc(feature[1]) + '</td>'
                     + '<td><code>' + tgEsc(feature[0]) + '</code></td>'
                     + '<td>' + tgSchemaChip(feature[2]) + '</td></tr>';
              }).join('')
            + '</tbody></table></div>'
            + '<div class="hint" style="margin-block-start:10px">' + player.present.length + ' — <code>'
            + tgEsc(player.present.join(', ')) + '</code></div>'
          : '<div class="note err">' + tgEsc(TG.t.sqlSchemaUnbound) + '</div>')
      + '</div>';
  }

  return '<div class="card">'
    +   '<h2 class="sec">🗄️ ' + tgEsc(TG.t.sqlSchemaTitle) + '</h2>'
    +   '<p class="lede">' + tgEsc(TG.t.sqlSchemaLede) + '</p>'
    +   '<h3 class="sub">' + tgEsc(TG.t.sqlSchemaLicence) + '</h3>'
    +   banner
    +   table
    +   repair
    + '</div>'
    + playerCard
    + (missing.length ? tgCodeBlock('ALTER TABLE game_settings', '', data.repair) : '');
}

function tgRepairSchema() {
  if (!window.confirm(TG.t.sqlSchemaRepairAsk)) return;

  tgCall('schema.repair', {}).then(function (data) {
    if (!data) return;

    if (!data.added.length) tgToast(TG.t.sqlSchemaNothing);
    else tgToast(data.added.length + ' ' + TG.t.sqlSchemaRepaired);

    if (data.failed && data.failed.length) {
      tgToast(data.failed.map(function (entry) { return entry.name; }).join(', '), true);
    }
    tgLoadSchema();
  });
}

function tgBuildSql() {
  var typed = (tgById('sql-id').value || '').trim();
  var game = tgSelected();

  tgCall('sql.game', {
    gameId: typed || (game ? game.id : ''),
    withPurchases: tgById('sql-purchases').checked,
    withSessions: tgById('sql-sessions').checked,
    withSeed: tgById('sql-seed').checked
  }).then(function (data) {
    if (!data) return;
    tgById('tg-sql-out').innerHTML =
      tgCodeBlock(data.file, '', data.sql) + tgSteps(data.commands);
  });
}

// ==========================================
// tgBuildSettingsSql
// What is actually stored, twice: once as the raw row and once
// as the statement that reproduces it.
//
// The raw row is above the SQL on purpose. This block is read to
// answer "what is really in the database?", and a generator
// standing between the reader and the answer is exactly what
// made the old version untrustworthy - it printed a timestamp it
// had invented and gave no way to tell a NULL column from one
// that does not exist.
// ==========================================
function tgBuildSettingsSql() {
  var game = tgSelected();
  if (!game) return;

  tgCall('sql.settings', { gameId: game.id }).then(function (data) {
    if (!data) return;

    var schema = data.schema || { missing: [] };
    var missing = schema.missing || [];

    var rowTable = data.row
      ? '<div class="scroll"><table class="tbl"><thead><tr>'
        + '<th>' + tgEsc(TG.t.sqlSchemaColumn) + '</th><th>' + tgEsc(TG.t.plId) + '</th>'
        + '</tr></thead><tbody>'
        + Object.keys(data.row).map(function (key) {
            var value = data.row[key];
            var shown = (value === null || value === undefined)
              ? '<span class="muted">NULL</span>'
              : '<code style="word-break:break-all">' + tgEsc(String(value)) + '</code>';
            return '<tr><td><code>' + tgEsc(key) + '</code></td><td>' + shown + '</td></tr>';
          }).join('')
        + '</tbody></table></div>'
      : '<div class="note info">' + tgEsc(TG.t.sqlNoRow) + '</div>';

    tgById('tg-sql-out').innerHTML =
      '<div class="card">'
    +   '<h2 class="sec">📄 ' + tgEsc(TG.t.sqlSchemaRow) + ' — ' + tgEsc(game.id) + '</h2>'
    +   '<p class="lede">' + tgEsc(TG.t.sqlSchemaRowLede) + '</p>'
    +   (missing.length
          ? '<div class="note err">' + missing.length + ' ' + tgEsc(TG.t.sqlSchemaMissing) + ' — '
            + tgEsc(missing.map(function (column) { return column.name; }).join(', ')) + '</div>'
          : '')
    +   rowTable
    + '</div>'
    + tgCodeBlock('game_settings — ' + game.id, '', data.settings)
    + tgCodeBlock('game_product_overrides — ' + game.id, '', data.products);
  });
}

function tgBuildPurgeSql() {
  var game = tgSelected();
  if (!game) return;

  tgCall('sql.settings', { gameId: game.id }).then(function (data) {
    if (!data) return;
    tgById('tg-sql-out').innerHTML =
      tgCodeBlock('delete — ' + game.id, TG.t.purgeHint, data.purge);
  });
}


// ==========================================
// Tab: environment
// ==========================================
function tgRenderEnv() {
  tgById('panel-env').innerHTML =
    '<p class="lede">' + tgEsc(TG.t.envLede) + '</p>'
  + '<div class="card"><div class="empty">' + tgEsc(TG.t.loading) + '</div></div>';

  tgLoadEnv();
}

function tgLoadEnv() {
  tgCall('env', {}).then(function (data) {
    if (!data) {
      tgById('panel-env').innerHTML = '<div class="card"><div class="empty">' + tgEsc(TG.t.failed) + '</div></div>';
      return;
    }
    tgById('panel-env').innerHTML =
      '<p class="lede">' + tgEsc(TG.t.envLede) + '</p>'
    + tgEnvRedirect(data)
    + data.games.map(tgEnvGame).join('')
    + tgEnvShared(data.shared)
    + '<div class="row"><button type="button" class="btn ghost" onclick="tgLoadEnv()">'
    +   tgEsc(TG.t.envReload) + '</button></div>';
  });
}

// One row: the key, whether it is set, and either its value or
// the reason there is no value to show.
function tgEnvRow(entry, options) {
  var opts = options || {};
  var chip = entry.set
    ? '<span class="chip ok">✓ ' + tgEsc(TG.t.envSet) + '</span>'
    : '<span class="chip ' + (opts.optional ? 'warn' : 'err') + '">' + tgEsc(TG.t.envMissing) + '</span>';

  var need = '<span class="chip">' + tgEsc(opts.optional ? TG.t.envOptional : TG.t.envRequired) + '</span>';

  // Three shapes arrive here and each says something different:
  // a public value prints itself, a secret prints its length and
  // never its value, and a binding has no value at all - it is
  // either wired up or it is not, which the chip already said.
  var shown;
  var tag = '';
  if (!entry.set) shown = '<span class="muted">—</span>';
  else if (entry.value) {
    shown = '<code>' + tgEsc(entry.value) + '</code>';
    tag = '<span class="chip info" title="' + tgEsc(TG.t.envPublicWhy) + '">' + tgEsc(TG.t.envPublicTag) + '</span>';
  } else if (entry.length) {
    shown = '<span class="muted">' + tgEsc(TG.t.envHidden) + ' · ' + entry.length + ' ' + tgEsc(TG.t.envChars) + '</span>';
    tag = '<span class="chip warn">' + tgEsc(TG.t.envSecretTag) + '</span>';
  } else shown = '<span class="muted">—</span>';

  return '<tr><td><code>' + tgEsc(entry.key) + '</code></td>'
       + '<td>' + chip + ' ' + need + ' ' + tag + '</td>'
       + '<td style="word-break:break-all">' + shown + '</td></tr>';
}

function tgEnvTable(rows) {
  return '<div class="scroll"><table class="tbl"><tbody>' + rows.join('') + '</tbody></table></div>';
}

function tgEnvRedirect(data) {
  return '<div class="card">'
    +   '<h2 class="sec">🔗 ' + tgEsc(TG.t.envRedirectTitle) + '</h2>'
    +   '<div class="note err">' + tgEsc(TG.t.envRedirectLede) + '</div>'
    +   '<p class="lede">' + tgEsc(TG.t.envRedirectFix) + '</p>'
    +   '<label class="f"><span>' + tgEsc(TG.t.envRedirectNow) + '</span>'
    +     '<input type="text" id="env-redirect" dir="ltr" readonly value="' + tgEsc(data.redirectUri) + '"></label>'
    +   '<div class="row">'
    +     '<button type="button" class="btn small" onclick="tgCopyValue(\'env-redirect\')">'
    +       tgEsc(TG.t.copy) + '</button>'
    +   '</div>'
    +   '<div class="hint" style="margin-block-start:10px">' + tgEsc(TG.t.envRedirectOrigins) + '</div>'
    +   '<div class="hint">' + tgEsc(TG.t.envRedirectWait) + '</div>'
    + '</div>';
}

function tgEnvGame(game) {
  var source = game.deepLink.source === 'panel' ? TG.t.envDeepFromPanel
             : game.deepLink.source === 'env' ? TG.t.envDeepFromEnv
             : TG.t.envDeepFromCode;

  var rows = [
    tgEnvRow(game.web, { optional: !game.login }),
    tgEnvRow(game.secret, { optional: !game.login }),
    tgEnvRow(game.android, { optional: true }),
    tgEnvRow(game.deepLink.key ? { key: game.deepLink.key, set: Boolean(game.deepLink.envValue), value: game.deepLink.envValue } : { key: '—', set: false }, { optional: true })
  ];

  return '<div class="card">'
    +   '<h2 class="sec">🎮 ' + tgEsc(game.name) + ' <span class="chip">' + tgEsc(game.id) + '</span></h2>'
    +   '<h3 class="sub">' + tgEsc(TG.t.envGameTitle) + '</h3>'
    +   tgEnvTable(rows)
    +   '<div class="note ok" style="margin-block-start:10px">' + tgEsc(TG.t.envSecretSafe) + '</div>'

    +   '<h3 class="sub">' + tgEsc(TG.t.envBindingTitle) + '</h3>'
    +   tgEnvTable([tgEnvRow(game.binding, { optional: false })])
    +   '<div class="hint" style="margin-block-start:8px">' + tgEsc(TG.t.envBindingHint) + '</div>'

    +   '<h3 class="sub">' + tgEsc(TG.t.envDeepTitle) + '</h3>'
    +   '<div class="note info">' + tgEsc(TG.t.envDeepNotSecret) + '</div>'
    +   '<div class="scroll"><table class="tbl"><tbody>'
    +     '<tr><td>' + tgEsc(TG.t.envDeepEffective) + '</td>'
    +       '<td colspan="2"><code>' + tgEsc(game.deepLink.effective) + '://' + tgEsc(game.deepLink.host) + '</code></td></tr>'
    +     '<tr><td>' + tgEsc(TG.t.envDeepFrom) + '</td>'
    +       '<td colspan="2"><span class="chip info">' + tgEsc(source) + '</span></td></tr>'
    +     '<tr><td>' + tgEsc(TG.t.envDeepFromCode) + '</td>'
    +       '<td colspan="2"><code>' + tgEsc(game.deepLink.codeValue) + '</code></td></tr>'
    +   '</tbody></table></div>'
    +   '<div class="hint" style="margin-block-start:8px">' + tgEsc(TG.t.envDeepMigration) + '</div>'
    + '</div>';
}

function tgEnvShared(shared) {
  var rows = [
    tgEnvRow(shared.panel, { optional: false }),
    tgEnvRow(shared.adminToken, { optional: true }),
    tgEnvRow(shared.stateSecret, { optional: true })
  ]
    .concat(shared.payments.map(function (entry) { return tgEnvRow(entry, { optional: true }); }))
    .concat(shared.mail.map(function (entry) { return tgEnvRow(entry, { optional: true }); }))
    .concat(shared.licensing.map(function (entry) { return tgEnvRow(entry, { optional: true }); }));

  return '<div class="card">'
    +   '<h2 class="sec">🔑 ' + tgEsc(TG.t.envSharedTitle) + '</h2>'
    +   tgEnvTable(rows)
    +   '<h3 class="sub">' + tgEsc(TG.t.envBindingTitle) + '</h3>'
    +   tgEnvTable([
          tgEnvRow(shared.licenseDb, { optional: false }),
          tgEnvRow(shared.assets, { optional: true })
        ])
    +   '<div class="hint" style="margin-block-start:8px">' + tgEsc(TG.t.envBindingHint) + '</div>'
    + '</div>';
}

// Copies an <input>'s value. Separate from tgCopy, which reads a
// <pre> by id and is used by the code blocks.
function tgCopyValue(id) {
  var field = tgById(id);
  if (!field) return;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(field.value).then(function () { tgToast(TG.t.copied); });
    return;
  }
  field.select();
  try { document.execCommand('copy'); tgToast(TG.t.copied); } catch (e) { tgToast(TG.t.failed, true); }
}


// ==========================================
// Tab: new game
// ==========================================
function tgRenderNew() {
  if (!TG.newPlatform) TG.newPlatform = 'android';

  var platformSeg = [
    ['android', TG.t.nPlatformAndroid, '🤖'],
    ['web', TG.t.nPlatformWeb, '🌐'],
    ['both', TG.t.nPlatformBoth, '🔗']
  ].map(function (pair) {
    return '<button type="button" onclick="tgSetPlatform(\'' + pair[0] + '\')" data-platform="' + pair[0] + '"'
         + ' aria-pressed="' + (TG.newPlatform === pair[0] ? 'true' : 'false') + '">'
         + pair[2] + ' ' + tgEsc(pair[1]) + '</button>';
  }).join('');

  tgById('panel-new').innerHTML =
    '<p class="lede">' + tgEsc(TG.t.newLede) + '</p>'
  + '<div class="note info">' + tgEsc(TG.t.newWhy) + '</div>'

  // ==========================================
  // Two blocks, not one long form.
  //
  // This screen used to ask sixteen questions in a row, all of
  // them looking equally required, and only three of them are:
  // an id, a name and what kind of game it is. Everything else
  // has a working default and is editable from the panel later
  // without a deploy - which is exactly the property that makes
  // it wrong to demand up front.
  //
  // So: what the generator genuinely cannot invent is on screen,
  // and the rest is behind one disclosure that says what it
  // contains and what happens if it is skipped.
  // ==========================================
  + '<div class="card">'
  +   '<h2 class="sec">1️⃣ ' + tgEsc(TG.t.nEssentials) + '</h2>'
  +   '<div class="hint" style="margin-block-end:14px">' + tgEsc(TG.t.nEssentialsHint) + '</div>'
  +   '<div class="grid two">'
  +     '<label class="f"><span>' + tgEsc(TG.t.nId) + '</span>'
  +       '<input type="text" id="n-id" dir="ltr" placeholder="pixel-runner" oninput="tgNewPreview()">'
  +       '<span class="hint">' + tgEsc(TG.t.nIdHint) + '</span></label>'
  +     '<label class="f"><span>' + tgEsc(TG.t.nName) + '</span>'
  +       '<input type="text" id="n-name" placeholder="Pixel Runner" oninput="tgNewPreview()"></label>'
  +   '</div>'

  // The question that decides every other question on this form.
  // Asked first, and asked once: a browser game has no package,
  // no deep link, no manifest and no Android OAuth client, and
  // being asked for all four is what made this screen feel like
  // a form for somebody else's game.
  +   '<h3 class="sub">' + tgEsc(TG.t.nPlatform) + '</h3>'
  +   '<div class="seg" role="group" aria-label="' + tgEsc(TG.t.nPlatform) + '"'
  +     ' style="margin-block-end:10px">' + platformSeg + '</div>'
  +   '<div class="hint">' + tgEsc(TG.t.nPlatformHint) + '</div>'
  +   '<div class="note info" id="n-platform-note" style="margin-block-start:12px"></div>'

  // What the generator will produce from what has been typed so
  // far. It updates as you type, so "is this going to be right?"
  // is answered before the button is pressed rather than by
  // reading four hundred lines of generated source afterwards.
  +   '<h3 class="sub">' + tgEsc(TG.t.nPreview) + '</h3>'
  +   '<div class="scroll"><table class="tbl"><tbody id="n-preview"></tbody></table></div>'

  +   '<div class="row" style="margin-block-start:16px">'
  +     '<button type="button" class="btn" onclick="tgBuildScaffold()">' + tgEsc(TG.t.nBuild) + '</button>'
  +   '</div>'
  +   '<div class="hint" style="margin-block-start:10px">' + tgEsc(TG.t.nBuildHint) + '</div>'
  + '</div>'

  + '<details class="card">'
  +   '<summary class="sec" style="cursor:pointer;list-style:none">⚙️ ' + tgEsc(TG.t.nMore) + '</summary>'
  +   '<div class="hint" style="margin-block:10px 16px">' + tgEsc(TG.t.nMoreHint) + '</div>'

  +   '<h3 class="sub">' + tgEsc(TG.t.nLook) + '</h3>'
  +   '<div class="grid two">'
  +     '<label class="f"><span>' + tgEsc(TG.t.nIcon) + '</span>'
  +       '<input type="text" id="n-icon" value="🎮" oninput="tgNewPreview()"></label>'
  +     '<label class="f"><span>' + tgEsc(TG.t.nColor) + '</span>'
  +       '<input type="color" id="n-color" value="#6c63ff"></label>'
  +   '</div>'

  // The card's motifs. Asked for here because it is a fact about
  // the game that nothing else can infer, and because "the card
  // has no way to look like the game" was the specific gap this
  // tab had: the generator wrote a registry entry with an icon
  // and a colour and nothing that belongs to the game itself.
  +   '<label class="f"><span>' + tgEsc(TG.t.nMotifs) + '</span>'
  +     '<input type="text" id="n-motifs" dir="ltr" placeholder="🍎 🍑 🍉 ⚔️" oninput="tgNewPreview()">'
  +     '<span class="hint">' + tgEsc(TG.t.nMotifsHint) + '</span></label>'

  +   '<h3 class="sub">' + tgEsc(TG.t.nDownloads) + '</h3>'
  +   '<div class="hint" style="margin-block-end:12px">' + tgEsc(TG.t.nDownloadsHint) + '</div>'

  +   '<div id="n-android-fields">'
  +     '<div class="grid two">'
  +       '<label class="f"><span>' + tgEsc(TG.t.nMyket) + '</span>'
  +         '<input type="text" id="n-myket" dir="ltr" placeholder="https://myket.ir/app/…"></label>'
  +       '<label class="f"><span>' + tgEsc(TG.t.nGooglePlay) + '</span>'
  +         '<input type="text" id="n-googleplay" dir="ltr" placeholder="https://play.google.com/store/apps/details?id=…"></label>'
  +     '</div>'
  +     '<label class="f"><span>' + tgEsc(TG.t.nApk) + '</span>'
  +       '<input type="text" id="n-apk" dir="ltr" placeholder="https://…/game.apk"></label>'
  +     '<label class="f"><span>' + tgEsc(TG.t.nPackage) + '</span>'
  +       '<input type="text" id="n-package" dir="ltr" placeholder="com.AmirColliderGames.PixelRunner"'
  +         ' oninput="tgNewPreview()"></label>'
  +   '</div>'

  +   '<div id="n-web-fields">'
  +     '<label class="f"><span>' + tgEsc(TG.t.nWeb) + '</span>'
  +       '<input type="text" id="n-web" dir="ltr" placeholder="https://…"></label>'
  +   '</div>'

  +   '<label class="f" style="max-width:340px"><span>' + tgEsc(TG.t.nPrimary) + '</span>'
  +     '<select id="n-primary"></select>'
  +     '<span class="hint">' + tgEsc(TG.t.nPrimaryHint) + '</span></label>'

  +   '<h3 class="sub">' + tgEsc(TG.t.nDescs) + '</h3>'
  +   '<div class="hint" style="margin-block-end:12px">' + tgEsc(TG.t.nDescsHint) + '</div>'
  +   '<label class="f"><span>' + tgEsc(TG.t.nDescFa) + '</span>'
  +     '<textarea id="n-desc-fa" dir="rtl"></textarea></label>'
  +   '<div class="grid two">'
  +     '<label class="f"><span>' + tgEsc(TG.t.nDescEn) + '</span>'
  +       '<textarea id="n-desc-en" dir="ltr"></textarea></label>'
  +     '<label class="f"><span>' + tgEsc(TG.t.nDescJa) + '</span>'
  +       '<textarea id="n-desc-ja" dir="ltr"></textarea></label>'
  +   '</div>'

  +   '<h3 class="sub">' + tgEsc(TG.t.capabilities) + '</h3>'
  +   '<div class="hint" style="margin-block-end:12px">' + tgEsc(TG.t.nCapsHint) + '</div>'
  +   '<div class="row" style="margin-block-end:16px">'
  +     tgCapSwitch('n-online', TG.t.capOnline, false)
  +     tgCapSwitch('n-login', TG.t.capLogin, true)
  +     tgCapSwitch('n-cloud', TG.t.capCloud, true)
  +     tgCapSwitch('n-board', TG.t.capBoard, true)
  +     tgCapSwitch('n-store', TG.t.capStore, true)
  +   '</div>'
  + '</details>'

  + '<div id="tg-new-out"></div>';

  tgSetPlatform(TG.newPlatform);
  tgNewPreview();
}


// ==========================================
// tgNewPreview
// What the generator is going to write, as you type.
//
// Every one of these is derived rather than asked for - the
// binding name, the database name, the environment variables,
// the Android package, the URL the game will live at - and
// getting one of them wrong is a confusing hour rather than an
// error message. Showing them before the button is pressed turns
// that into something you can read and correct.
// ==========================================
function tgNewPreview() {
  var box = tgById('n-preview');
  if (!box) return;

  var raw = (tgById('n-id').value || '').trim().toLowerCase();
  var id = raw.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

  if (!id) {
    box.innerHTML = '<tr><td class="muted">' + tgEsc(TG.t.nPreviewEmpty) + '</td></tr>';
    return;
  }

  var upper = id.replace(/-/g, '_').toUpperCase();
  var pascal = id.split('-').filter(Boolean).map(function (part) {
    return part.charAt(0).toUpperCase() + part.slice(1);
  }).join('');

  var android = TG.newPlatform !== 'web';
  var pkg = (tgById('n-package') && tgById('n-package').value || '').trim()
    || ('com.AmirColliderGames.' + pascal);

  var motifs = tgNewMotifs();

  var rows = [
    [TG.t.nPreviewUrl, TG.origin + '/' + id],
    [TG.t.nPreviewBinding, upper + '_DB'],
    [TG.t.nPreviewDatabase, id + '-db'],
    [TG.t.nPreviewConstants, pascal + 'Constants.cs']
  ];

  if (android) rows.push([TG.t.nPackage, pkg]);
  if (tgById('n-login') && tgById('n-login').checked) {
    rows.push([TG.t.nPreviewSecrets, upper + '_GOOGLE_CLIENT_ID_WEB, ' + upper + '_GOOGLE_CLIENT_SECRET']);
  }
  if (motifs.length) rows.push([TG.t.nMotifs, motifs.join(' ')]);

  // The id was corrected on its way in. Saying so is cheaper than
  // letting somebody discover it in the generated source.
  var note = (raw && raw !== id)
    ? '<tr><td colspan="2"><span class="chip warn">' + tgEsc(TG.t.nIdFixed) + '</span> <code>'
      + tgEsc(id) + '</code></td></tr>'
    : '';

  box.innerHTML = note + rows.map(function (row) {
    return '<tr><td>' + tgEsc(row[0]) + '</td>'
         + '<td dir="ltr"><code style="word-break:break-all">' + tgEsc(row[1]) + '</code></td></tr>';
  }).join('');
}


// The motif box, split into single glyphs. Spaces and commas are
// both accepted because both are what somebody types.
function tgNewMotifs() {
  var field = tgById('n-motifs');
  if (!field) return [];
  return (field.value || '').split(/[\s,]+/).filter(Boolean).slice(0, 6);
}


// ==========================================
// tgSetPlatform
// Shows the fields this kind of game actually has.
//
// The inputs are hidden rather than destroyed, so switching
// Android → Web → Android does not lose what was typed. The
// scaffold only ever reads the ones that are visible, which is
// what keeps a stray Myket URL out of a browser game's entry.
// ==========================================
function tgSetPlatform(kind) {
  TG.newPlatform = kind;

  var buttons = document.querySelectorAll('[data-platform]');
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].setAttribute('aria-pressed',
      buttons[i].getAttribute('data-platform') === kind ? 'true' : 'false');
  }

  var android = kind !== 'web';
  var web = kind !== 'android';

  tgById('n-android-fields').hidden = !android;
  tgById('n-web-fields').hidden = !web;

  tgById('n-platform-note').textContent =
    kind === 'web' ? TG.t.nWebNote : kind === 'android' ? TG.t.nAndroidNote : TG.t.nBothNote;

  // The primary-method list can only offer methods this game has.
  var options = [['', TG.t.nPrimaryAuto]];
  if (android) {
    options.push(['myket', TG.t.nMyket]);
    options.push(['googleplay', TG.t.nGooglePlay]);
    options.push(['apk', TG.t.nApk]);
  }
  if (web) options.push(['web', TG.t.nWeb]);

  var select = tgById('n-primary');
  var chosen = select.value;
  select.innerHTML = options.map(function (pair) {
    return '<option value="' + pair[0] + '"' + (pair[0] === chosen ? ' selected' : '') + '>'
         + tgEsc(pair[1]) + '</option>';
  }).join('');
}

function tgCapSwitch(id, label, on) {
  return '<label class="switch"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '')
       + '><span class="track"></span><span>' + tgEsc(label) + '</span></label>';
}

function tgBuildScaffold() {
  var id = (tgById('n-id').value || '').trim().toLowerCase();
  var platform = TG.newPlatform || 'android';

  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) { tgToast(TG.t.nIdBad, true); return; }
  if (tgGame(id)) { tgToast(TG.t.nIdTaken, true); return; }

  var android = platform !== 'web';
  var web = platform !== 'android';
  var read = function (elementId) { return (tgById(elementId).value || '').trim(); };

  // Only the links this platform has. Reading the hidden boxes
  // as well is how a browser game ends up with a Myket button
  // pointing at a page that does not exist.
  var links = {
    myket: android ? read('n-myket') : '',
    googleplay: android ? read('n-googleplay') : '',
    apk: android ? read('n-apk') : '',
    web: web ? read('n-web') : ''
  };

  if (web && !links.web && !links.myket && !links.googleplay && !links.apk) {
    tgToast(TG.t.nWebNeeded, true);
    return;
  }

  tgCall('scaffold', {
    spec: {
      id: id,
      name: tgById('n-name').value || id,
      icon: tgById('n-icon').value || '🎮',
      color: tgById('n-color').value,
      cardMotifs: tgNewMotifs(),
      platform: platform,
      package: android ? read('n-package') : '',
      descriptionFa: tgById('n-desc-fa').value,
      descriptionEn: tgById('n-desc-en').value,
      descriptionJa: tgById('n-desc-ja').value,
      downloadLinks: links,
      downloadPrimary: tgById('n-primary').value,
      onlinePlay: tgById('n-online').checked,
      login: tgById('n-login').checked,
      cloudSave: tgById('n-cloud').checked,
      leaderboard: tgById('n-board').checked,
      store: tgById('n-store').checked
    }
  }).then(function (data) {
    if (!data) return;

    var blocks = data.files.map(function (file) {
      return tgCodeBlock(file.name, file.hint, file.body);
    }).join('');

    // The step this tab never had: after the deploy, is it
    // actually working?
    //
    // Every file above is generated text, and a generator cannot
    // know whether the binding was pasted into wrangler.jsonc,
    // whether the migration ran, or whether the secrets were set.
    // Those are the three things that go wrong, they all fail
    // silently, and the only way to find out used to be opening
    // five pages and reading them.
    //
    // The button is deliberately AFTER the steps and says why it
    // will report nothing useful before the deploy: the game does
    // not exist until Config.js says it does.
    var verify = '<div class="card">'
      + '<h2 class="sec">✅ ' + tgEsc(TG.t.nVerify) + '</h2>'
      + '<p class="lede">' + tgEsc(TG.t.nVerifyLede) + '</p>'
      + '<div class="row">'
      +   '<button type="button" class="btn" onclick="tgVerifyGame(\'' + tgEsc(data.names.id) + '\')">'
      +     tgEsc(TG.t.vfRun) + '</button>'
      + '</div>'
      + '<div id="tg-verify-out"></div>'
      + '</div>';

    tgById('tg-new-out').innerHTML = blocks
      + '<div class="card"><h2 class="sec">📋 ' + tgEsc(TG.t.nSteps) + '</h2>' + tgSteps(data.commands) + '</div>'
      + verify;

    tgById('tg-new-out').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}


// ==========================================
// tgVerifyGame
// Everything that is either true or false about this game right
// now, on this deployment.
//
// Shared by the "new game" tab (where it answers "did the deploy
// work?") and the games tab (where it answers "why is this not
// behaving?"). Each row says what is wrong AND what to do about
// it, because "playersTable: false" is not an instruction.
// ==========================================
function tgVerifyGame(gameId) {
  var out = tgById('tg-verify-out');
  if (!out) return;

  out.innerHTML = '<div class="empty" style="margin-block-start:12px">' + tgEsc(TG.t.loading) + '</div>';

  tgCall('game.verify', { gameId: gameId }).then(function (data) {
    if (!data) { out.innerHTML = ''; return; }

    var mark = { ok: '✅', error: '❌', warn: '⚠️', info: 'ℹ️' };

    var rows = data.checks.map(function (check) {
      var cls = check.level === 'error' ? ' is-error' : check.level === 'warn' ? ' is-warn' : '';
      return '<div class="vf-row' + cls + '">'
        + '<span class="vf-mark" aria-hidden="true">' + (mark[check.level] || '•') + '</span>'
        + '<span class="vf-body"><b>' + tgEsc(check.label) + '</b>'
        +   '<span>' + tgEsc(check.detail) + '</span></span>'
        + '</div>';
    }).join('');

    var pages = data.pages.map(function (page) {
      return '<a class="btn ghost small" href="' + tgEsc(page.url) + '" target="_blank" rel="noopener">'
        + tgEsc(page.label) + ' ↗</a>';
    }).join('');

    var summary = data.summary.failed
      ? '<div class="note err">' + data.summary.failed + ' ' + tgEsc(TG.t.vfFailed) + '</div>'
      : data.summary.warned
        ? '<div class="note warn">' + data.summary.warned + ' ' + tgEsc(TG.t.vfWarned) + '</div>'
        : '<div class="note ok">' + tgEsc(TG.t.vfAllGood) + '</div>';

    out.innerHTML = '<div style="margin-block-start:14px">'
      + summary
      + '<div class="vf">' + rows + '</div>'
      + '<h3 class="sub">' + tgEsc(TG.t.vfPages) + '</h3>'
      + '<div class="row">' + pages + '</div>'
      + '</div>';
  });
}


// ==========================================
// Tab: Unity
// ==========================================
function tgRenderUnity() {
  tgById('panel-unity').innerHTML =
    '<p class="lede">' + tgEsc(TG.t.unityLede) + '</p>'
  + '<div class="card">' + tgGamePicker('tgPickGame', TG.t.unityGame) + '</div>'
  + '<div id="tg-unity-out"><div class="card"><div class="empty">' + tgEsc(TG.t.loading) + '</div></div></div>';

  var game = tgSelected();
  if (!game) return;

  tgCall('unity', { gameId: game.id, lang: TG.lang }).then(function (data) {
    var target = tgById('tg-unity-out');
    if (!target) return;
    if (!data) {
      target.innerHTML = '<div class="card"><div class="empty">' + tgEsc(TG.t.failed) + '</div></div>';
      return;
    }

    TG.unity = data;

    var platformNote = data.platform === 'web' ? TG.t.unityPlatformWeb
                     : data.platform === 'both' ? TG.t.unityPlatformBoth
                     : TG.t.unityPlatformAndroid;

    // The kit is a list of files with an order, so it opens with
    // what it contains and what to do first. It used to open with
    // the network layer, which is the fourth thing anybody needs.
    var index = data.modules.map(function (module, position) {
      return '<li><b class="mono">' + tgEsc(module.file) + '</b> — ' + tgEsc(module.title)
           + (position === 1 ? ' <span class="chip info">1</span>' : '') + '</li>';
    }).join('');

    var blocks = data.modules.map(function (module) {
      var notes = (module.notes || []).map(function (note) {
        return '<li>' + tgEsc(note) + '</li>';
      }).join('');

      return '<div class="card">'
      + '<h2 class="sec"><span aria-hidden="true">' + tgEsc(module.icon) + '</span> ' + tgEsc(module.title) + '</h2>'
      + '<p class="lede">' + tgEsc(module.summary) + '</p>'
      + (notes ? '<ul style="margin:0 0 16px;padding-inline-start:20px;color:var(--dim);font-size:.92em;line-height:1.9">'
        + notes + '</ul>' : '')
      + tgCodeBlock(module.file, '', module.code)
      + '</div>';
    }).join('');

    target.innerHTML =
      '<div class="card">'
    +   '<div class="row" style="justify-content:space-between">'
    +     '<h2 class="sec" style="margin:0">🧩 ' + data.modules.length + ' ' + tgEsc(TG.t.unityCount) + '</h2>'
    +     '<button type="button" class="btn ghost small" onclick="tgDownloadKit()">'
    +       tgEsc(TG.t.unityAll) + '</button>'
    +   '</div>'
    +   '<div class="note info" style="margin-block-start:12px">' + tgEsc(platformNote) + '</div>'
    +   '<div class="note ok">' + tgEsc(TG.t.unityOrder) + '</div>'
    +   '<ol style="margin:0;padding-inline-start:22px;line-height:2;font-size:.92em">' + index + '</ol>'
    + '</div>'
    + blocks;
  });
}

// Every file in one download. Twelve "download file" clicks with
// a "keep"/"discard" prompt on each is the kind of friction that
// ends with somebody copying four of them and improvising the
// rest.
function tgDownloadKit() {
  if (!TG.unity || !TG.unity.modules) return;

  var parts = TG.unity.modules.map(function (module) {
    var rule = '================================================================';
    return rule + '\n' + module.file + '\n' + rule + '\n\n' + module.code;
  });

  var header = 'AmirCollider Unity kit — ' + TG.unity.gameId + '\n'
             + 'Generated ' + new Date().toISOString() + '\n'
             + 'Each file below is separated by a rule with its filename above it.\n\n';

  var blob = new Blob([header + parts.join('\n\n\n')], { type: 'text/plain;charset=utf-8' });
  var link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = TG.unity.gameId + '-unity-kit.txt';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
}


// ==========================================
// Shared output widgets
// ==========================================
function tgCodeBlock(name, hint, body) {
  var id = 'code-' + Math.random().toString(36).slice(2, 9);
  window.__tgCode = window.__tgCode || {};
  window.__tgCode[id] = body;

  return '<div class="card"><div class="code">'
  + '<div class="code-bar">'
  +   '<span class="code-name">' + tgEsc(name) + '</span>'
  +   '<span class="row">'
  +     '<button type="button" class="btn ghost small" onclick="tgCopy(\'' + id + '\')">' + tgEsc(TG.t.copy) + '</button>'
  +     '<button type="button" class="btn ghost small" onclick="tgDownload(\'' + id + '\',\'' + tgEsc(name) + '\')">'
  +       tgEsc(TG.t.download) + '</button>'
  +   '</span>'
  + '</div>'
  + (hint ? '<div class="code-hint">' + tgEsc(hint) + '</div>' : '')
  + '<pre>' + tgEsc(body) + '</pre>'
  + '</div></div>';
}

function tgCopy(id) {
  var text = (window.__tgCode || {})[id] || '';
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { tgToast(TG.t.copied); });
    return;
  }
  // Older browsers, and any context where the clipboard API is
  // not available (it needs a secure context). A hidden textarea
  // plus execCommand still works everywhere this panel opens.
  var area = document.createElement('textarea');
  area.value = text;
  document.body.appendChild(area);
  area.select();
  try { document.execCommand('copy'); tgToast(TG.t.copied); } catch (e) { tgToast(TG.t.failed, true); }
  document.body.removeChild(area);
}

function tgDownload(id, name) {
  var text = (window.__tgCode || {})[id] || '';
  var file = name.split('—')[0].trim().replace(/[^a-zA-Z0-9._-]/g, '_') || 'file.txt';

  var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  var link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = file;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
}

function tgSteps(commands) {
  if (!commands || !commands.length) return '';

  return '<ol class="steps">' + commands.map(function (step) {
    return '<li><b>' + tgEsc(step.title) + '</b>'
    + '<pre style="padding:11px 13px;border-radius:10px;background:#0d1220;color:#dbe4f5;'
    +   'font-family:ui-monospace,monospace;font-size:.76em;line-height:1.6;overflow-x:auto;direction:ltr;text-align:left">'
    +   tgEsc(step.command) + '</pre>'
    + '<div class="hint">' + tgEsc(step.note) + '</div></li>';
  }).join('') + '</ol>';
}


// ==========================================
// Boot
//
// The tab in the URL hash, or the first one. A save that reloads
// the page, a language switch and a shared link all land on the
// section somebody was actually working in.
// ==========================================
(function tgBoot() {
  tgMarkScale();

  var wanted = String(window.location.hash || '').replace('#', '');
  var known = (TG.tabs || []).indexOf(wanted) !== -1;

  tgTab(known ? wanted : 'games', { silent: !known });
})();
`
