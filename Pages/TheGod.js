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
import { createHtmlResponse, timingSafeEqual } from '../Core/Http.js'
import { resolveGames, isDownloadable } from '../Games/Registry.js'
import { db } from '../Games/Store.js'
import { storeReady } from '../Games/Purchase.js'
import { isConfigured as providerConfigured, isSandbox } from '../Commerce/Provider.js'

import { langCookieHeader, matchRequestLang } from '../Core/RequestContext.js'
import { escapeHtml } from '../Core/Html.js'
const AUTH_COOKIE = 'amir_thegod_auth'
const COOKIE_MAX_AGE = 60 * 60 * 4

const LANGS = ['fa', 'en', 'ja']
const DEFAULT_LANG = 'fa'
const META = {
  fa: { dir: 'rtl', locale: 'fa-IR', label: 'فا' },
  en: { dir: 'ltr', locale: 'en-US', label: 'EN' },
  ja: { dir: 'ltr', locale: 'ja-JP', label: '日本' }
}


// ==========================================
// Cookie signing - HMAC-SHA256
// Signs a random session token so a tampered cookie cannot pass
// auth. Identical in shape to the test panel's, deliberately:
// it is the same operator, the same password and the same job,
// and two different rules for that would be two chances to get
// one of them wrong.
// ==========================================
async function signToken(token, secret) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(token))
  return Array.from(new Uint8Array(signature), b => b.toString(16).padStart(2, '0')).join('')
}


export { isAuthenticated as isTheGodSession }

async function isAuthenticated(request, env) {
  if (!env || !env.TestSitePassword) return false

  const cookies = request.headers.get('Cookie') || ''
  const match = cookies.match(new RegExp(`${AUTH_COOKIE}=([^;]+)`))
  if (!match) return false

  const parts = match[1].split('__')
  if (parts.length !== 2) return false

  const expected = await signToken(parts[0], env.TestSitePassword)
  return timingSafeEqual(parts[1], expected)
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
  const failed = url.searchParams.get('error') === '1'

  return createHtmlResponse(renderLogin(lang, theme, failed), 200, langCookieHeader(url, lang))
}


export async function handleTheGodLoginPost(url, request, gameId, requestId, GAMES, env) {
  let password = ''
  try {
    const params = new URLSearchParams(await request.text())
    password = params.get('password') || ''
  } catch {
    return Response.redirect(`${url.origin}/thegod/login?error=1`, 302)
  }

  if (!env.TestSitePassword || password !== env.TestSitePassword) {
    return Response.redirect(`${url.origin}/thegod/login?error=1`, 302)
  }

  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('')
  const signature = await signToken(token, env.TestSitePassword)

  return new Response(null, {
    status: 302,
    headers: {
      'Location': `${url.origin}/thegod`,
      'Set-Cookie': `${AUTH_COOKIE}=${token}__${signature}; Path=/thegod; HttpOnly; Secure; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE}`
    }
  })
}


export async function handleTheGodLogout(url, request, gameId, requestId, GAMES, env) {
  return new Response(null, {
    status: 302,
    headers: {
      'Location': `${url.origin}/thegod/login`,
      'Set-Cookie': `${AUTH_COOKIE}=; Path=/thegod; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
    }
  })
}



function themeFromCookie(request) {
  const cookie = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)theme=([^;]+)/)
  return cookie && (cookie[1] === 'light' || cookie[1] === 'dark') ? cookie[1] : null
}



// Data going into an inline <script>. JSON.stringify is not
// enough on its own: the HTML parser ends the script at the
// first "</script>" wherever it appears, including inside a
// string literal.
function jsonBlob(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
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
    sqlNoRun: 'این‌جا هیچ SQL ای اجرا نمی‌شود — فقط ساخته می‌شود. خودت با wrangler اجرایش کن.',
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
    nSteps: 'مراحل، به ترتیب',
    nIdTaken: 'این شناسه از قبل وجود دارد.',
    nIdBad: 'شناسه فقط حروف کوچک انگلیسی، عدد و خط تیره.',

    // unity tab
    unityLede: 'کد ++C# برای وصل شدن بازی به این Worker. مقدارها همین حالا برای همین بازی پر شده‌اند — شناسه، آدرس‌ها و شناسه‌ی محصول‌ها.',
    unityGame: 'برای کدام بازی؟',

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
    sqlNoRun: 'Nothing is executed here — only written. You run it with wrangler yourself.',
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
    nSteps: 'The steps, in order',
    nIdTaken: 'That id already exists.',
    nIdBad: 'Lowercase letters, digits and hyphens only.',

    unityLede: 'The C# that connects a game to this Worker. Every value is already filled in for the game you pick — its id, its endpoints and its product ids.',
    unityGame: 'Which game?',

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
    sqlNoRun: 'ここでは実行しません。生成のみです。wrangler でご自身で実行してください。',
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
    nSteps: '手順（順番どおりに）',
    nIdTaken: 'その ID は既に存在します。',
    nIdBad: '小文字英字・数字・ハイフンのみ。',

    unityLede: 'ゲームをこの Worker に接続する C# コードです。選択したゲームの ID・エンドポイント・商品 ID が既に埋め込まれています。',
    unityGame: '対象のゲーム',

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
// ==========================================
function panelCss() {
  return `
    *{margin:0;padding:0;box-sizing:border-box}
    html{scrollbar-width:none;-ms-overflow-style:none}
    html::-webkit-scrollbar{width:0;height:0;display:none}

    :root{
      --brand:#8b5cf6;--brand-2:#c4b5fd;
      --ok:#18a558;--warn:#e08600;--err:#e23b3b;--info:#2f6df6;
      --radius:16px;--maxw:1180px;
      --bg:#f5f6fb;--bg-2:#eceefa;--surface:#fff;--surface-2:#f7f8fd;
      --text:#1d2433;--dim:#6b7488;--border:rgba(20,28,45,.11);
      --shadow:0 10px 30px rgba(20,28,45,.09);
      color-scheme:light;
    }
    :root[data-theme="dark"]{
      --bg:#0d1119;--bg-2:#121826;--surface:#161d2a;--surface-2:#1c2434;
      --text:#e7ecf5;--dim:#95a1b8;--border:rgba(255,255,255,.09);
      --shadow:0 14px 36px rgba(0,0,0,.45);
      color-scheme:dark;
    }
    @media (prefers-color-scheme:dark){
      :root:not([data-theme="light"]){
        --bg:#0d1119;--bg-2:#121826;--surface:#161d2a;--surface-2:#1c2434;
        --text:#e7ecf5;--dim:#95a1b8;--border:rgba(255,255,255,.09);
        --shadow:0 14px 36px rgba(0,0,0,.45);
        color-scheme:dark;
      }
    }

    body{font-family:'Vazirmatn','Segoe UI',Tahoma,Arial,sans-serif;min-height:100vh;
      padding:20px 16px 60px;color:var(--text);
      background:radial-gradient(900px 480px at 82% -10%,rgba(139,92,246,.16),transparent 62%),
                 linear-gradient(170deg,var(--bg),var(--bg-2));background-attachment:fixed}
    .wrap{max-width:var(--maxw);margin:0 auto}

    /* ---- top ---- */
    .top{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-block-end:20px}
    .logo{display:flex;align-items:center;gap:12px}
    .logo-mark{width:48px;height:48px;border-radius:14px;display:flex;align-items:center;justify-content:center;
      font-size:1.5em;color:#fff;background:linear-gradient(135deg,var(--brand),var(--brand-2));
      box-shadow:0 8px 22px rgba(139,92,246,.36)}
    .logo b{display:block;font-size:1.15em;font-weight:800;letter-spacing:.4px}
    .logo span{font-size:.8em;color:var(--dim)}
    .top-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap}

    .seg{display:inline-flex;padding:3px;gap:2px;border-radius:11px;background:var(--surface);border:1px solid var(--border)}
    .seg button{border:0;cursor:pointer;padding:6px 11px;border-radius:8px;font:inherit;font-size:.79em;
      font-weight:700;color:var(--dim);background:transparent}
    .seg button[aria-pressed="true"]{color:#fff;background:linear-gradient(135deg,var(--brand),var(--brand-2))}
    .ibtn{width:36px;height:36px;border-radius:10px;cursor:pointer;display:inline-flex;align-items:center;
      justify-content:center;color:var(--text);background:var(--surface);border:1px solid var(--border);font-size:1em}

    /* ---- health strip ---- */
    .health{display:flex;gap:8px;flex-wrap:wrap;margin-block-end:16px}
    .hpill{display:inline-flex;align-items:center;gap:7px;padding:6px 13px;border-radius:999px;font-size:.79em;
      font-weight:700;background:var(--surface);border:1px solid var(--border);color:var(--dim)}
    .hdot{width:8px;height:8px;border-radius:50%;background:var(--err)}
    .hpill.is-on .hdot{background:var(--ok)}
    .hpill.is-warn{color:var(--warn);border-color:rgba(224,134,0,.4)}
    .hpill.is-warn .hdot{background:var(--warn)}

    /* ---- tabs ---- */
    .tabs{display:flex;gap:6px;flex-wrap:wrap;margin-block-end:18px;padding:5px;border-radius:14px;
      background:var(--surface);border:1px solid var(--border);box-shadow:var(--shadow)}
    .tabs button{border:0;cursor:pointer;padding:10px 16px;border-radius:10px;font:inherit;font-size:.86em;
      font-weight:700;color:var(--dim);background:transparent;transition:color .16s ease,background .16s ease}
    .tabs button:hover{color:var(--text)}
    .tabs button[aria-selected="true"]{color:#fff;background:linear-gradient(135deg,var(--brand),var(--brand-2))}

    .panel{display:none}
    .panel.is-active{display:block}

    /* ---- generic ---- */
    .card{padding:22px;border-radius:var(--radius);background:var(--surface);border:1px solid var(--border);
      box-shadow:var(--shadow);margin-block-end:16px}
    .lede{color:var(--dim);font-size:.89em;line-height:1.75;margin-block-end:16px}
    h2.sec{font-size:1.05em;font-weight:800;margin-block-end:12px;display:flex;align-items:center;gap:9px}
    h3.sub{font-size:.92em;font-weight:800;margin-block:16px 10px;color:var(--dim)}

    .grid{display:grid;gap:14px}
    .grid.two{grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
    .grid.three{grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}
    .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}

    label.f{display:block;margin-block-end:12px}
    label.f>span{display:block;font-size:.78em;font-weight:700;color:var(--dim);margin-block-end:5px}
    input[type=text],input[type=password],input[type=number],select,textarea{
      width:100%;padding:10px 13px;border-radius:11px;font:inherit;font-size:.88em;
      color:var(--text);background:var(--surface-2);border:1px solid var(--border);outline:none}
    input:focus,select:focus,textarea:focus{border-color:var(--brand);box-shadow:0 0 0 3px rgba(139,92,246,.16)}
    textarea{min-height:78px;resize:vertical;line-height:1.6}
    input[type=color]{width:52px;height:38px;padding:2px;border-radius:10px;border:1px solid var(--border);background:var(--surface-2)}
    .hint{font-size:.76em;color:var(--dim);margin-block-start:4px;line-height:1.55}

    .btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:10px 17px;border-radius:11px;
      border:1px solid transparent;font:inherit;font-size:.85em;font-weight:700;cursor:pointer;text-decoration:none;
      color:#fff;background:linear-gradient(135deg,var(--brand),var(--brand-2));
      transition:transform .15s ease,filter .15s ease}
    .btn:hover{transform:translateY(-1px);filter:brightness(1.07)}
    .btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
    .btn.ghost{color:var(--text);background:var(--surface-2);border-color:var(--border)}
    .btn.danger{background:linear-gradient(135deg,#e23b3b,#f87171)}
    .btn.small{padding:7px 12px;font-size:.79em}

    .chip{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:999px;font-size:.72em;
      font-weight:700;color:var(--dim);background:var(--surface-2);border:1px solid var(--border)}
    .chip.ok{color:var(--ok);background:rgba(24,165,88,.12);border-color:rgba(24,165,88,.34)}
    .chip.warn{color:var(--warn);background:rgba(224,134,0,.12);border-color:rgba(224,134,0,.34)}
    .chip.err{color:var(--err);background:rgba(226,59,59,.12);border-color:rgba(226,59,59,.34)}
    .chip.info{color:var(--info);background:rgba(47,109,246,.12);border-color:rgba(47,109,246,.34)}

    .note{padding:12px 15px;border-radius:12px;font-size:.84em;line-height:1.7;background:var(--surface-2);
      border:1px solid var(--border);border-inline-start:3px solid var(--dim);margin-block-end:14px}
    .note.ok{border-inline-start-color:var(--ok)}
    .note.warn{border-inline-start-color:var(--warn)}
    .note.err{border-inline-start-color:var(--err)}
    .note.info{border-inline-start-color:var(--info)}

    /* ---- game cards ---- */
    .gcards{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
    .gcard{padding:18px;border-radius:var(--radius);background:var(--surface);border:1px solid var(--border);
      box-shadow:var(--shadow);cursor:pointer;transition:transform .18s ease,border-color .18s ease}
    .gcard:hover{transform:translateY(-3px);border-color:var(--brand)}
    .gcard[aria-selected="true"]{border-color:var(--brand);box-shadow:0 0 0 3px rgba(139,92,246,.18)}
    .gcard-top{display:flex;align-items:center;gap:12px;margin-block-end:12px}
    /* The emoji is the fallback UNDER the logo, not a sibling
       beside it. As flex items the two shared the 52px box, so a
       game with both showed its emoji next to a squeezed sliver
       of its logo - which is what "the panel does not show the
       logos properly" looked like. Taking the image out of flow
       lets it cover the box, and the emoji is what remains
       visible when the file 404s and onerror hides it. */
    .gcard-logo{position:relative;width:52px;height:52px;border-radius:15px;flex-shrink:0;display:flex;
      align-items:center;justify-content:center;font-size:1.5em;background:#fff;overflow:hidden;
      border:2px solid var(--border)}
    .gcard-logo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
    .gcard-name{font-weight:800;font-size:1.02em}
    .gcard-id{font-size:.76em;color:var(--dim);direction:ltr}
    .gcard-chips{display:flex;gap:6px;flex-wrap:wrap}

    /* ---- tables ---- */
    .tbl{width:100%;border-collapse:collapse;font-size:.84em}
    .tbl th{text-align:start;font-size:.78em;color:var(--dim);font-weight:700;padding:8px 10px;
      border-block-end:1px solid var(--border);white-space:nowrap}
    .tbl td{padding:10px;border-block-end:1px solid var(--border);vertical-align:middle}
    .tbl tr:last-child td{border-block-end:0}
    .tbl code{font-size:.92em;direction:ltr;display:inline-block}
    .scroll{overflow-x:auto}

    /* ---- code output ---- */
    .code{position:relative;margin-block-end:14px}
    .code pre{padding:16px;border-radius:12px;background:#0d1220;color:#dbe4f5;font-family:ui-monospace,'Courier New',monospace;
      font-size:.78em;line-height:1.65;overflow-x:auto;direction:ltr;text-align:left;max-height:460px}
    .code-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;
      margin-block-end:7px}
    .code-name{font-size:.82em;font-weight:800}
    .code-hint{font-size:.76em;color:var(--dim);line-height:1.6;margin-block-end:7px}

    .steps{counter-reset:s;list-style:none;margin:0;padding:0}
    .steps li{position:relative;padding:0 0 16px 0;margin-inline-start:30px}
    .steps li::before{counter-increment:s;content:counter(s);position:absolute;inset-inline-start:-30px;
      width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;
      font-size:.72em;font-weight:800;color:#fff;background:var(--brand)}
    .steps b{display:block;font-size:.88em;margin-block-end:4px}
    .steps .hint{margin-block-start:5px}

    .switch{display:inline-flex;align-items:center;gap:10px;cursor:pointer;font-size:.86em;font-weight:700}
    .switch input{width:0;height:0;opacity:0;position:absolute}
    .track{width:46px;height:26px;border-radius:999px;background:var(--surface-2);border:1px solid var(--border);
      position:relative;transition:background .18s ease}
    .track::after{content:'';position:absolute;inset-block-start:3px;inset-inline-start:3px;width:18px;height:18px;
      border-radius:50%;background:var(--dim);transition:transform .18s ease,background .18s ease}
    .switch input:checked+.track{background:rgba(24,165,88,.22);border-color:rgba(24,165,88,.5)}
    .switch input:checked+.track::after{background:var(--ok);transform:translateX(20px)}
    [dir="rtl"] .switch input:checked+.track::after{transform:translateX(-20px)}

    .toast{position:fixed;inset-block-end:22px;inset-inline-start:50%;transform:translateX(-50%);
      padding:11px 20px;border-radius:12px;font-size:.85em;font-weight:700;color:#fff;background:#18a558;
      box-shadow:0 10px 30px rgba(0,0,0,.24);opacity:0;pointer-events:none;transition:opacity .2s ease;z-index:50}
    .toast.show{opacity:1}
    .toast.bad{background:#e23b3b}

    .plrow{display:flex;align-items:center;gap:10px}
    .plavatar{position:relative;width:34px;height:34px;border-radius:50%;flex-shrink:0;overflow:hidden;
      display:flex;align-items:center;justify-content:center;font-size:1em;
      background:var(--surface-2);border:1px solid var(--border)}
    .plavatar img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
    .plstats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-block:14px}
    .plstat{padding:12px 14px;border-radius:12px;background:var(--surface-2);border:1px solid var(--border)}
    .plstat b{display:block;font-size:1.15em;font-weight:800;margin-block-end:2px}
    .plstat span{font-size:.76em;color:var(--dim)}

    .storekeys{display:flex;flex-wrap:wrap;gap:6px;margin-block:6px}
    .storekeys code{cursor:pointer;padding:3px 9px;border-radius:8px;font-size:.75em;direction:ltr;
      color:var(--info);background:rgba(47,109,246,.1);border:1px solid rgba(47,109,246,.3);
      transition:background .15s ease,transform .15s ease}
    .storekeys code:hover{background:rgba(47,109,246,.2);transform:translateY(-1px)}

    .empty{padding:28px;text-align:center;color:var(--dim);font-size:.88em}
    .muted{color:var(--dim)}

    /* ---- mobile ----
       The panel is the densest surface on the site and had two
       lines of mobile handling. The problems were concrete: the
       tab strip overflowed rather than wrapping, action rows put
       four half-width buttons on a 360px screen, and the tables
       set their own width so the page scrolled sideways instead
       of the table doing it. */
    @media (max-width:720px){
      body{padding:14px 12px 44px}
      .top{gap:10px}
      .logo-mark{width:40px;height:40px;font-size:1.25em}

      .tabs{gap:4px;padding:4px;overflow-x:auto;flex-wrap:nowrap;
        scrollbar-width:none;-webkit-overflow-scrolling:touch}
      .tabs::-webkit-scrollbar{display:none}
      .tabs button{padding:9px 12px;font-size:.8em;white-space:nowrap;flex:0 0 auto}

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
      .scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
      .tbl{min-width:520px}
      .tbl td,.tbl th{padding:8px}

      .plstats{grid-template-columns:repeat(2,1fr)}
      .code pre{font-size:.72em;max-height:340px}
    }

    @media (max-width:400px){
      .plstats{grid-template-columns:1fr}
      .seg button{padding:6px 8px;font-size:.74em}
    }
    @media (prefers-reduced-motion:no-preference){
      .card,.gcard{animation:tgRise .4s cubic-bezier(.16,1,.3,1) both}
    }
    @keyframes tgRise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
  `
}


function themeBoot() {
  return `<script>(function(){try{var t=localStorage.getItem('ac_theme');
    if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>`
}


// ==========================================
// Login page
// ==========================================
function renderLogin(lang, theme, failed) {
  const t = I18N[lang] || I18N.fa
  const themeAttr = theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : ''

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}" dir="${t.dir}"${themeAttr}>
<head>
  ${getPageHead({ title: `${t.brand} — ${t.loginTitle}`, amirLogo: CONFIG.AMIR_LOGO })}
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  ${themeBoot()}
  <style>${panelCss()}
    body{display:flex;align-items:center;justify-content:center;padding:24px}
    .login{width:100%;max-width:400px}
  </style>
</head>
<body>
  <div class="login">
    <div class="card" style="text-align:center">
      <div class="logo-mark" style="margin:0 auto 16px;width:60px;height:60px;font-size:1.8em">⚡</div>
      <h1 style="font-size:1.25em;font-weight:800;margin-block-end:6px">${escapeHtml(t.loginTitle)}</h1>
      <p class="muted" style="font-size:.85em;margin-block-end:22px">${escapeHtml(t.loginSub)}</p>

      ${failed ? `<div class="note err" style="text-align:start">${escapeHtml(t.loginError)}</div>` : ''}

      <form method="POST" action="/thegod/login">
        <label class="f" style="text-align:start">
          <span>${escapeHtml(t.loginPassword)}</span>
          <input type="password" name="password" id="pw" required autofocus
                 placeholder="${escapeHtml(t.loginPlaceholder)}" autocomplete="current-password">
        </label>
        <label class="row" style="font-size:.8em;color:var(--dim);margin-block-end:16px;cursor:pointer">
          <input type="checkbox" onchange="document.getElementById('pw').type=this.checked?'text':'password'"
                 style="width:auto">
          <span>${escapeHtml(t.showPassword)}</span>
        </label>
        <button type="submit" class="btn" style="width:100%">${escapeHtml(t.loginButton)}</button>
      </form>
    </div>
  </div>
</body>
</html>`
}


// ==========================================
// Panel page
// ==========================================
function renderPanel(games, lang, theme, health, origin) {
  const t = I18N[lang] || I18N.fa
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
    `<button type="button" onclick="tgLang('${code}')" aria-pressed="${code === lang ? 'true' : 'false'}">${escapeHtml(META[code].label)}</button>`
  ).join('')

  const tabs = [
    ['games', t.tabGames, '🎮'],
    ['store', t.tabStore, '🛒'],
    ['orders', t.tabOrders, '💳'],
    ['players', t.tabPlayers, '👥'],
    ['sql', t.tabSql, '🗄️'],
    ['env', t.tabEnv, '🔑'],
    ['new', t.tabNew, '✨'],
    ['unity', t.tabUnity, '🧩']
  ].map(([key, label, icon], index) =>
    `<button type="button" role="tab" data-tab="${key}" aria-selected="${index === 0 ? 'true' : 'false'}"
             onclick="tgTab('${key}')">${icon} ${escapeHtml(label)}</button>`
  ).join('')

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}" dir="${t.dir}"${themeAttr}>
<head>
  ${getPageHead({ title: `${t.brand} — ${t.tagline}`, amirLogo: CONFIG.AMIR_LOGO })}
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  ${themeBoot()}
  <style>${panelCss()}</style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div class="logo">
        <span class="logo-mark">⚡</span>
        <span>
          <b>${escapeHtml(t.brand)}</b>
          <span>${escapeHtml(t.tagline)}</span>
        </span>
      </div>
      <div class="top-actions">
        <span class="seg" role="group">${langSeg}</span>
        <button type="button" class="ibtn" onclick="tgTheme()" aria-label="theme">◐</button>
        <form method="POST" action="/thegod/logout" style="display:inline">
          <button type="submit" class="btn ghost small">${escapeHtml(t.logout)}</button>
        </form>
      </div>
    </div>

    <div class="health">${healthPills}${sandboxPill}</div>

    ${health.sandbox ? `<div class="note warn">${escapeHtml(t.hSandboxWarn)}</div>` : ''}
    ${!health.database ? `<div class="note err">${escapeHtml(t.hDbWarn)} ${escapeHtml(t.hNoMigration)}</div>` : ''}

    <div class="tabs" role="tablist">${tabs}</div>

    <section class="panel is-active" id="panel-games"></section>
    <section class="panel" id="panel-store"></section>
    <section class="panel" id="panel-orders"></section>
    <section class="panel" id="panel-players"></section>
    <section class="panel" id="panel-sql"></section>
    <section class="panel" id="panel-env"></section>
    <section class="panel" id="panel-new"></section>
    <section class="panel" id="panel-unity"></section>
  </div>

  <div class="toast" id="tg-toast"></div>

  <script>
    var TG = {
      lang: ${jsonBlob(lang)},
      locale: ${jsonBlob(META[lang] ? META[lang].locale : 'fa-IR')},
      origin: ${jsonBlob(origin)},
      t: ${jsonBlob(t)},
      games: ${jsonBlob(list)},
      health: ${jsonBlob(health)},
      selected: ${jsonBlob(list.length ? list[0].id : '')}
    };
  </script>
  ${panelScript()}
</body>
</html>`
}


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
  window.location.href = '/thegod?lang=' + encodeURIComponent(code);
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

function tgTab(key) {
  var buttons = document.querySelectorAll('.tabs button');
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].setAttribute('aria-selected', buttons[i].getAttribute('data-tab') === key ? 'true' : 'false');
  }
  var panels = document.querySelectorAll('.panel');
  for (var j = 0; j < panels.length; j++) {
    panels[j].className = 'panel' + (panels[j].id === 'panel-' + key ? ' is-active' : '');
  }
  tgRender(key);
}

function tgRender(key) {
  if (key === 'games') return tgRenderGames();
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

  +   '<h3 class="sub">' + tgEsc(TG.t.purge) + '</h3>'
  +   '<div class="note warn">' + tgEsc(TG.t.purgeHint)
  +     '<div class="row" style="margin-block-start:10px">'
  +       '<button type="button" class="btn danger small" onclick="tgPurgeGame()">'
  +         tgEsc(TG.t.purge) + '</button>'
  +     '</div>'
  +   '</div>'
  + '</div>';
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
  +     '<button type="button" class="btn" onclick="tgBuildSql()">' + tgEsc(TG.t.sqlBuild) + '</button>'
  +     '<button type="button" class="btn ghost" onclick="tgBuildSettingsSql()">' + tgEsc(TG.t.sqlSettings) + '</button>'
  +     '<button type="button" class="btn ghost" onclick="tgBuildPurgeSql()">' + tgEsc(TG.t.sqlPurge) + '</button>'
  +   '</div>'
  + '</div>'
  + '<div id="tg-sql-out"></div>';
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

function tgBuildSettingsSql() {
  var game = tgSelected();
  if (!game) return;

  tgCall('sql.settings', { gameId: game.id }).then(function (data) {
    if (!data) return;
    tgById('tg-sql-out').innerHTML =
      tgCodeBlock('game_settings — ' + game.id, '', data.settings)
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
  tgById('panel-new').innerHTML =
    '<p class="lede">' + tgEsc(TG.t.newLede) + '</p>'
  + '<div class="note info">' + tgEsc(TG.t.newWhy) + '</div>'
  + '<div class="card">'
  +   '<div class="grid two">'
  +     '<label class="f"><span>' + tgEsc(TG.t.nId) + '</span>'
  +       '<input type="text" id="n-id" dir="ltr" placeholder="pixel-runner"></label>'
  +     '<label class="f"><span>' + tgEsc(TG.t.nName) + '</span>'
  +       '<input type="text" id="n-name" placeholder="Pixel Runner"></label>'
  +   '</div>'
  +   '<div class="grid two">'
  +     '<label class="f"><span>' + tgEsc(TG.t.nIcon) + '</span>'
  +       '<input type="text" id="n-icon" value="🎮"></label>'
  +     '<label class="f"><span>' + tgEsc(TG.t.nColor) + '</span>'
  +       '<input type="color" id="n-color" value="#6c63ff"></label>'
  +   '</div>'

  // Four ways to publish a game, not one. Leave a box empty and
  // that button simply is not rendered on the card, so a game
  // sold only on Myket looks exactly as it did - and a game on
  // Play and Myket with a direct APK gets three buttons without
  // anybody editing Config.js by hand afterwards.
  +   '<h3 class="sub">' + tgEsc(TG.t.nDownloads) + '</h3>'
  +   '<div class="hint" style="margin-block-end:12px">' + tgEsc(TG.t.nDownloadsHint) + '</div>'
  +   '<div class="grid two">'
  +     '<label class="f"><span>' + tgEsc(TG.t.nMyket) + '</span>'
  +       '<input type="text" id="n-myket" dir="ltr" placeholder="https://myket.ir/app/…"></label>'
  +     '<label class="f"><span>' + tgEsc(TG.t.nGooglePlay) + '</span>'
  +       '<input type="text" id="n-googleplay" dir="ltr" placeholder="https://play.google.com/store/apps/details?id=…"></label>'
  +   '</div>'
  +   '<div class="grid two">'
  +     '<label class="f"><span>' + tgEsc(TG.t.nApk) + '</span>'
  +       '<input type="text" id="n-apk" dir="ltr" placeholder="https://…/game.apk"></label>'
  +     '<label class="f"><span>' + tgEsc(TG.t.nWeb) + '</span>'
  +       '<input type="text" id="n-web" dir="ltr" placeholder="https://…"></label>'
  +   '</div>'
  +   '<label class="f" style="max-width:320px"><span>' + tgEsc(TG.t.nPrimary) + '</span>'
  +     '<select id="n-primary">'
  +       '<option value="">' + tgEsc(TG.t.nPrimaryAuto) + '</option>'
  +       '<option value="myket">' + tgEsc(TG.t.nMyket) + '</option>'
  +       '<option value="googleplay">' + tgEsc(TG.t.nGooglePlay) + '</option>'
  +       '<option value="apk">' + tgEsc(TG.t.nApk) + '</option>'
  +       '<option value="web">' + tgEsc(TG.t.nWeb) + '</option>'
  +     '</select>'
  +     '<span class="hint">' + tgEsc(TG.t.nPrimaryHint) + '</span></label>'
  +   '<label class="f"><span>' + tgEsc(TG.t.nPackage) + '</span>'
  +     '<input type="text" id="n-package" dir="ltr" placeholder="com.AmirColliderGames.PixelRunner"></label>'
  +   '<label class="f"><span>' + tgEsc(TG.t.nDescFa) + '</span>'
  +     '<textarea id="n-desc-fa" dir="rtl"></textarea></label>'
  +   '<div class="grid two">'
  +     '<label class="f"><span>' + tgEsc(TG.t.nDescEn) + '</span>'
  +       '<textarea id="n-desc-en" dir="ltr"></textarea></label>'
  +     '<label class="f"><span>' + tgEsc(TG.t.nDescJa) + '</span>'
  +       '<textarea id="n-desc-ja" dir="ltr"></textarea></label>'
  +   '</div>'
  +   '<h3 class="sub">' + tgEsc(TG.t.capabilities) + '</h3>'
  +   '<div class="row" style="margin-block-end:16px">'
  +     tgCapSwitch('n-online', TG.t.capOnline, false)
  +     tgCapSwitch('n-login', TG.t.capLogin, true)
  +     tgCapSwitch('n-cloud', TG.t.capCloud, true)
  +     tgCapSwitch('n-board', TG.t.capBoard, true)
  +     tgCapSwitch('n-store', TG.t.capStore, true)
  +   '</div>'
  +   '<button type="button" class="btn" onclick="tgBuildScaffold()">' + tgEsc(TG.t.nBuild) + '</button>'
  + '</div>'
  + '<div id="tg-new-out"></div>';
}

function tgCapSwitch(id, label, on) {
  return '<label class="switch"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '')
       + '><span class="track"></span><span>' + tgEsc(label) + '</span></label>';
}

function tgBuildScaffold() {
  var id = (tgById('n-id').value || '').trim().toLowerCase();

  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) { tgToast(TG.t.nIdBad, true); return; }
  if (tgGame(id)) { tgToast(TG.t.nIdTaken, true); return; }

  tgCall('scaffold', {
    spec: {
      id: id,
      name: tgById('n-name').value || id,
      icon: tgById('n-icon').value || '🎮',
      color: tgById('n-color').value,
      package: tgById('n-package').value,
      descriptionFa: tgById('n-desc-fa').value,
      descriptionEn: tgById('n-desc-en').value,
      descriptionJa: tgById('n-desc-ja').value,
      downloadLinks: {
        myket: (tgById('n-myket').value || '').trim(),
        googleplay: (tgById('n-googleplay').value || '').trim(),
        apk: (tgById('n-apk').value || '').trim(),
        web: (tgById('n-web').value || '').trim()
      },
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

    tgById('tg-new-out').innerHTML = blocks
      + '<div class="card"><h2 class="sec">📋 ' + tgEsc(TG.t.nSteps) + '</h2>' + tgSteps(data.commands) + '</div>';
  });
}


// ==========================================
// Tab: Unity
// ==========================================
function tgRenderUnity() {
  tgById('panel-unity').innerHTML =
    '<p class="lede">' + tgEsc(TG.t.unityLede) + '</p>'
  + '<div class="card">' + tgGamePicker('tgPickGame', TG.t.unityGame) + '</div>'
  + '<div id="tg-unity-out"><div class="empty">' + tgEsc(TG.t.loading) + '</div></div>';

  var game = tgSelected();
  if (!game) return;

  tgCall('unity', { gameId: game.id, lang: TG.lang }).then(function (data) {
    if (!data) return;

    var blocks = data.modules.map(function (module) {
      var notes = (module.notes || []).map(function (note) {
        return '<li>' + tgEsc(note) + '</li>';
      }).join('');

      return '<div class="card">'
      + '<h2 class="sec">' + tgEsc(module.icon) + ' ' + tgEsc(module.title) + '</h2>'
      + '<p class="lede">' + tgEsc(module.summary) + '</p>'
      + (notes ? '<ul style="margin:0 0 16px;padding-inline-start:20px;color:var(--dim);font-size:.85em;line-height:1.85">'
        + notes + '</ul>' : '')
      + tgCodeBlock(module.file, '', module.code)
      + '</div>';
    }).join('');

    tgById('tg-unity-out').innerHTML = blocks;
  });
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

tgRenderGames();
`
