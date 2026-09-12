// ==========================================
// Pages/DocSnapPanel.js
// The Unity DocSnap brand panel.
//
//   GET  /unity-docsnap/panel        the page
//   POST /unity-docsnap/panel/api    everything it does
//
// WHAT THIS IS, AND WHAT IT IS NOT
//
// Unity DocSnap can put a studio's logo and footer on the
// sites it exports, and lock sections of them. All of that
// is configured INSIDE UNITY and works with no network at
// all. That is the product's promise - "there is never a
// network call in front of an export" - and this page does
// not weaken it by a single request.
//
// This page is for the person with five Unity projects who
// does not want to type the same footer five times. They set
// a profile up here, download a small file, and import it in
// each project. The Editor never talks to this endpoint. A
// human carries the file across, which is the same gesture
// they already performed to get their licence key in.
//
// TWO ABSENCES THAT ARE FEATURES
//
//   No password. The lock password is typed in Unity and
//   never leaves that machine. Nothing on this server can
//   open a customer's locked export, and the panel says so
//   out loud - it is worth more as a sentence than the
//   convenience would have been worth as a feature.
//
//   No project names. Nothing about a Unity project ever
//   reaches this server. So the panel shows "profiles" the
//   customer named themselves, not "your projects". Reading
//   real project names off the Editor would mean the Editor
//   sending them, to make a label slightly nicer.
//
// Auth is the licence key itself, rate-limited through the
// same license_attempts table the activation endpoint uses.
// There is no session and no cookie: the key is held in the
// page for as long as the tab is open and is sent with each
// request.
// ==========================================

import { CONFIG } from '../Config.js'
import { getPageHead, pageFoundationCss } from '../Core/DesignSystem.js'
import { seoHead, breadcrumbLd } from '../Core/Seo.js'
import {
  siteNavCss, siteHeader, siteBreadcrumb, siteFooter, siteBackToTop, siteChromeScript, NAV_I18N
} from '../Core/SiteNav.js'
import { themeBootScript } from '../Core/PageChrome.js'
import {
  dirFor, parseCookies, resolveLang, resolveRequestLang
} from '../Core/RequestContext.js'
import { createJsonResponse, createHtmlResponse, clientIp, readJsonObject } from '../Core/Http.js'
import { escapeHtml } from '../Core/Html.js'
import { logInfo, logWarning } from '../Core/Logging.js'
import { findLicense, isRateLimited, recordFailedAttempt } from '../Licensing/Store.js'
import { looksLikeImage, base64ToBytes, putImage } from '../Mail/Images.js'
import {
  brandsDb, brandsReady, listBrands, getBrand, saveBrand, deleteBrand,
  brandFileJson, LOCKABLE_SECTIONS, MAX_LOGO_BYTES, BRAND_LIMITS
} from '../Licensing/Brands.js'


// ==========================================
// i18n
// One pack per language. Every string this page can show is
// here, the ones the server sends included: the API answers
// with an error CODE and the browser looks the sentence up,
// so a Persian reader never meets an English refusal and the
// endpoint stays language-neutral.
//
// Adding a language is one object.
// ==========================================
const I18N = {
  fa: {
    locale: 'fa-IR',
    metaTitle: 'پنل برند — Unity DocSnap',
    metaDesc: 'لوگو، فوتر و بخش‌های قفل‌شده‌ات را یک بار این‌جا بچین و با یک فایل به هر پروژه‌ی یونیتی ببر.',
    crumb: 'پنل برند',
    h1: 'پنل برند',
    lede: 'لوگوی استودیو، خط فوتر، و اینکه کارفرما چه بخش‌هایی را ببیند — یک بار این‌جا تنظیم کن، با یک فایل به هر پروژه ببر.',

    howTitle: 'چطور کار می‌کند',
    how1: 'این‌جا یک پروفایل بساز و بچینش.',
    how2: 'دکمه‌ی «دانلود فایل برند» را بزن.',
    how3: 'در یونیتی: Unity DocSnap ← Management ← Import brand file',
    howWhy: 'یونیتی هیچ‌وقت با این صفحه حرف نمی‌زند، و این تمام نکته است: خروجی روی ماشینی که اصلاً اینترنت ندارد کار می‌کند، و هیچ چیزی درباره‌ی پروژه‌ات به این سرور نمی‌رسد. فایل را خودت می‌بری — همان‌طور که کد لایسنست را بردی.',
    howPw: 'رمز قفل این‌جا نیست و هیچ‌وقت نخواهد بود.',
    howPwRest: 'رمز را در یونیتی می‌زنی و روی همان ماشین می‌ماند. هیچ چیزی روی این سرور نمی‌تواند یک خروجیِ قفل‌شده را باز کند — از جمله خودِ ما.',

    keyLabel: 'کد لایسنس',
    keyPh: 'DSNAP-XXXXX-XXXXX-XXXXX',
    open: 'باز کن',
    keyHint: 'فاصله و بزرگی حروف مهم نیست. کد فقط در همین تب نگه داشته می‌شود و ذخیره نمی‌شود.',

    profiles: 'پروفایل‌ها',
    newProfile: 'پروفایل تازه',
    profilesNote: 'اسمشان با خودت است. هیچ چیزی درباره‌ی پروژه‌های یونیتی‌ات به این سرور نمی‌رسد، پس این فهرست چیزی است که خودت اسم گذاشته‌ای — نه چیزی که از روی ماشینت خوانده شده باشد.',
    noProfiles: 'هنوز پروفایلی نساخته‌ای. دکمه‌ی «پروفایل تازه» را بزن.',
    nothingLocked: 'چیزی قفل نیست',
    lockedCount: 'قفل‌شده',

    editNew: 'پروفایل تازه',
    editExisting: 'ویرایش پروفایل',
    nameLabel: 'اسم',
    namePh: 'استودیوی من',

    logoLabel: 'لوگو',
    logoNote: 'PNG، JPEG، WebP یا GIF، تا {kb} کیلوبایت. در سایدبار خروجی ۴۴×۴۴ کشیده می‌شود. SVG پذیرفته نمی‌شود — می‌تواند اسکریپت داشته باشد و این فایلی است که به کارفرما تحویل می‌دهی.',
    logoPick: 'انتخاب تصویر',
    logoNone: 'لوگو ندارد',

    footerLabel: 'خط فوتر',
    footerNote: 'یک خط پایین همه‌ی صفحه‌های خروجی. زبانی را که با آن فکر می‌کنی پر کن — بقیه به همان برمی‌گردند.',
    footerUrlPh: 'https://your-studio.com (لینک اختیاری)',

    lockLabel: 'قفل کردن',
    modeNone: 'چیزی قفل نیست',
    modeOmit: 'حذف از خروجی',
    modeEncrypt: 'رمزنگاری',
    noteOmit: 'حذف: بخش‌های انتخاب‌شده اصلاً در خروجی نوشته نمی‌شوند — نه صفحه، نه فایل داده، نه خلاصه، نه چیزی در ایندکس جست‌وجو. رمزی نیست که گم شود. این گزینه‌ی امن است.',
    noteEncrypt: 'رمزنگاری: بخش‌ها رمزنگاری‌شده داخل خروجی می‌روند. هر کسی رمز را داشته باشد بازشان می‌کند، هر کسی نداشته باشد نمی‌تواند. رمز را در یونیتی می‌گذاری — هیچ‌وقت این‌جا نمی‌آید.',
    sectionsNote: 'کدام بخش‌ها. داشبورد قابل قفل نیست — صفحه‌ای است که خروجی با آن باز می‌شود.',

    save: 'ذخیره',
    download: 'دانلود فایل برند',
    remove: 'حذف پروفایل',
    confirmDelete: '«{name}» حذف شود؟ خروجی‌هایی که قبلاً ساخته‌ای دست‌نخورده می‌مانند.',

    checking: 'در حال بررسی…',
    signedIn: 'وارد شدی — نسخه‌ی {tier}.',
    saving: 'در حال ذخیره…',
    saved: 'ذخیره شد.',
    logoSaved: 'لوگو ذخیره شد.',
    building: 'در حال ساختن فایل…',
    downloaded: 'دانلود شد. در یونیتی: Unity DocSnap ← Management ← Import brand file',
    needKey: 'اول کد لایسنست را بزن.',

    sec_issues: 'سلامت',
    sec_packages: 'پکیج‌ها',
    sec_changes: 'تغییرات',
    sec_plan: 'پلن',
    sec_scenes: 'سین‌ها',
    sec_assets: 'فایل‌ها',

    err_unknown_key: 'این کد شناخته نشد.',
    err_rate_limited: 'تلاش‌های زیادی شد. چند دقیقه صبر کن و دوباره امتحان کن.',
    err_not_migrated: 'جدول برند روی سرور ساخته نشده.',
    err_needs_pro: 'این بخش مال نسخه‌ی Pro است.',
    err_needs_plus: 'فوتر اختصاصی مال نسخه‌ی Plus است.',
    err_too_many: 'هر کد حداکثر {max} پروفایل می‌تواند داشته باشد.',
    err_too_large: 'حجم تصویر بیشتر از {kb} کیلوبایت است.',
    err_bad_image: 'این فایل تصویر معتبری نیست. از PNG، JPEG، WebP یا GIF استفاده کن.',
    err_no_brand: 'اول پروفایل را ذخیره کن.',
    err_generic: 'یک جای کار درست پیش نرفت.',
    err_network: 'ارتباط با سرور برقرار نشد.'
  },

  en: {
    locale: 'en-GB',
    metaTitle: 'Brand panel — Unity DocSnap',
    metaDesc: 'Set your studio logo, footer and locked sections once, and carry them into every Unity project as a file.',
    crumb: 'Brand panel',
    h1: 'Brand panel',
    lede: 'Your logo, your footer line and which sections a client may see — set here once, carried into every project as a file.',

    howTitle: 'How this works',
    how1: 'Set up a profile below.',
    how2: 'Press Download brand file.',
    how3: 'In Unity: Unity DocSnap › Management › Import brand file',
    howWhy: 'Unity never talks to this page, and that is the point: an export works on a machine with no internet at all, and nothing about your project ever reaches this server. You carry the file across — the same way you carried your licence key.',
    howPw: 'The lock password is not here and never will be.',
    howPwRest: 'You type it in Unity and it stays on that machine. Nothing on this server can open a locked export, including us.',

    keyLabel: 'Licence key',
    keyPh: 'DSNAP-XXXXX-XXXXX-XXXXX',
    open: 'Open',
    keyHint: "Spacing and capitalisation don't matter. The key is held in this tab only, never stored.",

    profiles: 'Profiles',
    newProfile: 'New profile',
    profilesNote: 'These are yours to name. Nothing about a Unity project reaches this server, so this list is whatever you called things — not a list read off your machine.',
    noProfiles: 'No profiles yet. Press New profile to make one.',
    nothingLocked: 'nothing locked',
    lockedCount: 'locked',

    editNew: 'New profile',
    editExisting: 'Edit profile',
    nameLabel: 'Name',
    namePh: 'My studio',

    logoLabel: 'Logo',
    logoNote: 'PNG, JPEG, WebP or GIF, up to {kb} KB. Drawn at 44×44 in the exported sidebar. SVG is not accepted — it can carry script, and this ends up in a file you hand to a client.',
    logoPick: 'Choose an image',
    logoNone: 'no logo',

    footerLabel: 'Footer line',
    footerNote: 'One line at the bottom of every exported page. Fill in the language you think in — the others fall back to it.',
    footerUrlPh: 'https://your-studio.com (optional link)',

    lockLabel: 'Locking',
    modeNone: 'Nothing locked',
    modeOmit: 'Leave out',
    modeEncrypt: 'Encrypt',
    noteOmit: 'LEAVE OUT: the chosen sections are not written into the export at all — no page, no data file, no summary, nothing in the search index. There is no password to lose. This is the safe choice.',
    noteEncrypt: 'ENCRYPT: the sections travel inside the export, encrypted. Anyone with the password opens them; anyone without cannot. You set that password in Unity — it never comes here.',
    sectionsNote: 'Which sections. The Dashboard cannot be locked — it is the page the export opens on.',

    save: 'Save',
    download: 'Download brand file',
    remove: 'Delete profile',
    confirmDelete: 'Delete "{name}"? The exports you already made are not affected.',

    checking: 'Checking…',
    signedIn: 'Signed in on your {tier} key.',
    saving: 'Saving…',
    saved: 'Saved.',
    logoSaved: 'Logo saved.',
    building: 'Building the file…',
    downloaded: 'Downloaded. In Unity: Unity DocSnap › Management › Import brand file',
    needKey: 'Paste your licence key first.',

    sec_issues: 'Health',
    sec_packages: 'Packages',
    sec_changes: 'Changes',
    sec_plan: 'Plan',
    sec_scenes: 'Scenes',
    sec_assets: 'Assets',

    err_unknown_key: 'That key was not recognised.',
    err_rate_limited: 'Too many attempts. Wait a few minutes and try again.',
    err_not_migrated: 'The brand table has not been created on the server yet.',
    err_needs_pro: 'That is part of Pro.',
    err_needs_plus: 'A custom footer is part of Plus.',
    err_too_many: 'A key can hold {max} profiles.',
    err_too_large: 'That image is larger than {kb} KB.',
    err_bad_image: 'That is not a usable image. Use a PNG, JPEG, WebP or GIF.',
    err_no_brand: 'Save the profile first.',
    err_generic: 'Something went wrong.',
    err_network: 'Could not reach the server.'
  },

  ja: {
    locale: 'ja-JP',
    metaTitle: 'ブランドパネル — Unity DocSnap',
    metaDesc: 'ロゴ・フッター・ロックするセクションを一度だけ設定し、ファイルとして各 Unity プロジェクトへ持ち込めます。',
    crumb: 'ブランドパネル',
    h1: 'ブランドパネル',
    lede: '自社ロゴ、フッターの一行、そしてクライアントに見せるセクション — ここで一度設定し、ファイルで各プロジェクトへ。',

    howTitle: '使いかた',
    how1: '下でプロファイルを作ります。',
    how2: '「ブランドファイルをダウンロード」を押します。',
    how3: 'Unity で: Unity DocSnap ▸ Management ▸ Import brand file',
    howWhy: 'Unity はこのページと通信しません。そこが肝心です — エクスポートはインターネットのない環境でも動き、プロジェクトの情報がこのサーバーに届くことはありません。ライセンスキーと同じように、ファイルはあなたが運びます。',
    howPw: 'ロックのパスワードはここにはなく、今後も置きません。',
    howPwRest: 'パスワードは Unity で入力し、その端末に留まります。このサーバー上のどこにも、ロックされたエクスポートを開けるものはありません。私たちを含めて。',

    keyLabel: 'ライセンスキー',
    keyPh: 'DSNAP-XXXXX-XXXXX-XXXXX',
    open: '開く',
    keyHint: '空白や大文字小文字は問いません。キーはこのタブにのみ保持され、保存されません。',

    profiles: 'プロファイル',
    newProfile: '新しいプロファイル',
    profilesNote: '名前はあなたが付けます。Unity プロジェクトの情報はこのサーバーに届かないため、この一覧はあなたが付けた名前であって、端末から読み取ったものではありません。',
    noProfiles: 'まだプロファイルがありません。「新しいプロファイル」を押してください。',
    nothingLocked: 'ロックなし',
    lockedCount: '件ロック',

    editNew: '新しいプロファイル',
    editExisting: 'プロファイルを編集',
    nameLabel: '名前',
    namePh: '自社スタジオ',

    logoLabel: 'ロゴ',
    logoNote: 'PNG・JPEG・WebP・GIF、{kb} KB まで。エクスポートのサイドバーで 44×44 に描画されます。SVG は不可 — スクリプトを含められるうえ、クライアントに渡すファイルに入るためです。',
    logoPick: '画像を選ぶ',
    logoNone: 'ロゴなし',

    footerLabel: 'フッターの一行',
    footerNote: 'エクスポートの全ページ下部に入る一行。考えている言語だけ埋めれば、ほかはそれにフォールバックします。',
    footerUrlPh: 'https://your-studio.com(リンクは任意)',

    lockLabel: 'ロック',
    modeNone: 'ロックなし',
    modeOmit: '除外する',
    modeEncrypt: '暗号化する',
    noteOmit: '除外: 選んだセクションはエクスポートに一切書き出されません — ページも、データファイルも、サマリーも、検索インデックスにも残りません。失くすパスワードもありません。安全な選択肢です。',
    noteEncrypt: '暗号化: セクションは暗号化されたままエクスポートに同梱されます。パスワードを持つ人は開け、持たない人は開けません。そのパスワードは Unity で設定し、ここには来ません。',
    sectionsNote: '対象のセクション。ダッシュボードはロックできません — エクスポートが最初に開くページだからです。',

    save: '保存',
    download: 'ブランドファイルをダウンロード',
    remove: 'プロファイルを削除',
    confirmDelete: '「{name}」を削除しますか?すでに作成済みのエクスポートには影響しません。',

    checking: '確認中…',
    signedIn: '{tier} キーでサインインしました。',
    saving: '保存中…',
    saved: '保存しました。',
    logoSaved: 'ロゴを保存しました。',
    building: 'ファイルを作成中…',
    downloaded: 'ダウンロードしました。Unity で: Unity DocSnap ▸ Management ▸ Import brand file',
    needKey: '先にライセンスキーを入力してください。',

    sec_issues: '健康状態',
    sec_packages: 'パッケージ',
    sec_changes: '変更点',
    sec_plan: 'プラン',
    sec_scenes: 'シーン',
    sec_assets: 'アセット',

    err_unknown_key: 'そのキーは認識されませんでした。',
    err_rate_limited: '試行回数が多すぎます。数分待ってからもう一度お試しください。',
    err_not_migrated: 'ブランド用のテーブルがサーバー上にまだ作成されていません。',
    err_needs_pro: 'これは Pro の機能です。',
    err_needs_plus: '独自フッターは Plus の機能です。',
    err_too_many: '1 つのキーで保持できるプロファイルは {max} 件までです。',
    err_too_large: '画像が {kb} KB を超えています。',
    err_bad_image: '使用できる画像ではありません。PNG・JPEG・WebP・GIF をお使いください。',
    err_no_brand: '先にプロファイルを保存してください。',
    err_generic: '処理に失敗しました。',
    err_network: 'サーバーに接続できませんでした。'
  }
}

const PAGE_PATH = '/unity-docsnap/panel'

const ACTIONS = ['brands.list', 'brand.save', 'brand.delete', 'brand.logo', 'brand.file']

// The DocSnap accent, the same violet the exported site's own
// sidebar uses. This screen belongs to the product, so it wears
// the product's colour rather than the site default.
const DOCSNAP_VIOLET = '#7a52b8'

// Which of the pack's strings the browser half needs. Named
// rather than shipping the whole pack, so the page does not
// carry its own meta description to every reader.
const CLIENT_KEYS = [
  'needKey', 'checking', 'signedIn', 'saving', 'saved', 'logoSaved',
  'building', 'downloaded', 'noProfiles', 'nothingLocked', 'lockedCount',
  'editNew', 'editExisting', 'confirmDelete', 'noteOmit', 'noteEncrypt',
  'err_unknown_key', 'err_rate_limited', 'err_not_migrated', 'err_needs_pro',
  'err_needs_plus', 'err_too_many', 'err_too_large', 'err_bad_image',
  'err_no_brand', 'err_generic', 'err_network'
]

// Which tier may use which half. These mirror
// DocSnapEditionMatrix in the package, and the panel says
// what a tier does not have rather than hiding it: somebody
// who can see the control knows what upgrading buys.
const TIER_RANK = { plus: 1, pro: 2 }


// ==========================================
// handleDocSnapPanel — GET /unity-docsnap/panel
// ==========================================
export async function handleDocSnapPanel(url, request) {
  const lang = resolveLang(resolveRequestLang(url, request, parseCookies(request)))
  return createHtmlResponse(renderPanelPage(lang))
}


// ==========================================
// handleDocSnapPanelApi — POST /unity-docsnap/panel/api
//
// One endpoint, an `action` field, the same shape as every
// other panel on this site. Every action re-proves the
// licence key: there is no session to steal and no state to
// get out of step.
// ==========================================
export async function handleDocSnapPanelApi(url, request, gameId, requestId, GAMES, env) {
  const database = brandsDb(env)
  if (!database) {
    return createJsonResponse({ error: 'db_not_bound', message: 'LICENSE_DB is not bound', requestId }, 500)
  }

  const body = await readJsonObject(request)
  if (!body) {
    return createJsonResponse({ error: 'bad_json', message: 'Body must be JSON', requestId }, 400)
  }

  const action = typeof body.action === 'string' ? body.action : ''
  if (!ACTIONS.includes(action)) {
    return createJsonResponse({ error: 'bad_action', message: 'Unknown action', actions: ACTIONS, requestId }, 400)
  }

  // Before touching the key, and on every action rather than
  // only on the first: the key IS the credential here, so
  // every request is a guess somebody could be making.
  const ip = clientIp(request)
  if (await isRateLimited(database, ip)) {
    return createJsonResponse({
      error: 'rate_limited',
      message: 'Too many attempts. Wait a few minutes and try again.',
      requestId
    }, 429)
  }

  const license = await findLicense(database, body.key || '')
  if (!license || license.status !== 'active' || license.product !== 'unity-docsnap') {
    await recordFailedAttempt(database, ip)
    // One message for every way a key can fail to work here.
    // Distinguishing "no such key" from "that key is for
    // something else" is precisely what an enumeration
    // attack is looking for.
    return createJsonResponse({
      error: 'unknown_key',
      message: 'That key was not recognised.',
      requestId
    }, 403)
  }

  if (!(await brandsReady(database))) {
    return createJsonResponse({
      error: 'not_migrated',
      message: 'The brand table is missing. Run migrations/0015_docsnap_brands.sql against LICENSE_DB.',
      requestId
    }, 503)
  }

  const tier = TIER_RANK[license.tier] || 0
  const keyHash = license.key_hash

  try {
    switch (action) {
      case 'brands.list':
        return createJsonResponse({
          ok: true,
          tier: license.tier,
          limits: BRAND_LIMITS,
          brands: (await listBrands(database, keyHash)).map(publicBrand),
          requestId
        })

      case 'brand.save': {
        const input = body.brand || {}

        // The tier gates are enforced here, not only drawn in
        // the page. A control greyed out in a browser is a
        // control somebody can re-enable in a browser.
        if (input.lockMode && tier < TIER_RANK.pro) {
          return createJsonResponse({ error: 'needs_pro', message: 'Locking sections is part of Pro.', requestId }, 403)
        }
        const footerText = `${input.footerFa || ''}${input.footerEn || ''}${input.footerJa || ''}`
        if (footerText && tier < TIER_RANK.plus) {
          return createJsonResponse({ error: 'needs_plus', message: 'A custom footer is part of Plus.', requestId }, 403)
        }

        const result = await saveBrand(database, keyHash, input)
        if (!result.ok) {
          return createJsonResponse({
            error: result.error,
            message: result.error === 'too_many'
              ? `A key can hold ${BRAND_LIMITS.maxBrands} profiles.`
              : 'Could not save that profile.',
            requestId
          }, 400)
        }
        logInfo('docsnap_brand_saved', { requestId, id: result.id })
        return createJsonResponse({ ok: true, id: result.id, requestId })
      }

      case 'brand.delete': {
        const gone = await deleteBrand(database, keyHash, String(body.id || ''))
        return createJsonResponse({ ok: gone, requestId }, gone ? 200 : 404)
      }

      case 'brand.logo': {
        if (tier < TIER_RANK.pro) {
          return createJsonResponse({ error: 'needs_pro', message: 'A custom logo is part of Pro.', requestId }, 403)
        }
        return await handleLogoUpload(database, env, keyHash, body, requestId)
      }

      case 'brand.file':
        return await handleBrandFile(database, env, keyHash, String(body.id || ''), requestId)
    }
  } catch (error) {
    logWarning('docsnap_panel_failed', { requestId, action, error: error.message })
    return createJsonResponse({ error: 'panel_failed', message: 'Something went wrong.', requestId }, 500)
  }

  return createJsonResponse({ error: 'bad_action', message: 'Unknown action', requestId }, 400)
}


// ==========================================
// handleLogoUpload
// The browser sends a data URI; the bytes land in R2 under
// docsnap/brand/ and the row keeps the key.
//
// What counts as an image is Mail/Images.js's answer, not a
// second copy of the rule here: the declared type AND the
// first bytes have to agree, and an uploaded filename never
// becomes a path in the bucket.
// ==========================================
async function handleLogoUpload(database, env, keyHash, body, requestId) {
  const id = String(body.id || '')
  const brand = await getBrand(database, keyHash, id)
  if (!brand) {
    return createJsonResponse({ error: 'no_brand', message: 'Save the profile first.', requestId }, 404)
  }

  const dataUri = String(body.dataUri || '')
  const match = /^data:([a-z0-9.+/-]+);base64,/i.exec(dataUri)
  if (!match) {
    return createJsonResponse({ error: 'bad_image', message: 'That is not an image file.', requestId }, 400)
  }

  const type = match[1].toLowerCase()
  const bytes = base64ToBytes(dataUri.slice(match[0].length))
  if (!bytes.length) {
    return createJsonResponse({ error: 'bad_image', message: 'That image could not be read.', requestId }, 400)
  }
  if (bytes.length > MAX_LOGO_BYTES) {
    return createJsonResponse({
      error: 'too_large',
      message: `The limit is ${Math.round(MAX_LOGO_BYTES / 1024)} KB — it is drawn at 44×44 pixels and embedded in every page of the export.`,
      requestId
    }, 400)
  }

  // SVG is refused on purpose. An SVG is a document that can
  // carry script, and this one would be inlined into every
  // page of an export somebody hands to a client.
  if (type === 'image/svg+xml' || !looksLikeImage(type, bytes.subarray(0, 8))) {
    return createJsonResponse({
      error: 'bad_image',
      message: 'Use a PNG, JPEG, WebP or GIF. SVG is not accepted, because an SVG can carry script and this one ends up in a file you hand to a client.',
      requestId
    }, 400)
  }

  const stored = await putImage(env, {
    bytes,
    type,
    prefix: 'docsnap/brand/',
    maxBytes: MAX_LOGO_BYTES,
    retentionMs: 1000 * 60 * 60 * 24 * 365 * 10,
    requestId
  })
  if (!stored) {
    return createJsonResponse({ error: 'not_stored', message: 'That image could not be stored.', requestId }, 400)
  }

  await saveBrand(database, keyHash, { ...brand, logoKey: stored.key, logoType: stored.type })
  return createJsonResponse({ ok: true, url: stored.url, requestId })
}


// ==========================================
// handleBrandFile
// The download. Self-contained by design: the logo is
// inlined as a data URI rather than linked, because the
// machine that imports this may be a build agent with no
// route to the internet - which is the machine this whole
// arrangement exists for.
// ==========================================
async function handleBrandFile(database, env, keyHash, id, requestId) {
  const brand = await getBrand(database, keyHash, id)
  if (!brand) {
    return createJsonResponse({ error: 'no_brand', message: 'No such profile.', requestId }, 404)
  }

  let logoDataUri = ''
  if (brand.logoKey && env.ASSETS) {
    try {
      const object = await env.ASSETS.get(brand.logoKey)
      if (object) {
        const bytes = new Uint8Array(await object.arrayBuffer())
        if (bytes.length <= MAX_LOGO_BYTES) {
          const type = object.httpMetadata?.contentType || brand.logoType || 'image/png'
          logoDataUri = `data:${type};base64,${bytesToBase64(bytes)}`
        }
      }
    } catch (error) {
      // A missing logo is a brand file without one, not a
      // failed download. The footer and the locking are
      // still worth carrying across.
      logWarning('docsnap_brand_logo_unreadable', { requestId, id })
    }
  }

  const file = brandFileJson(brand, logoDataUri)
  return new Response(JSON.stringify(file, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safeFileName(brand.name)}.docsnapbrand"`,
      'Cache-Control': 'no-store'
    }
  })
}


// ==========================================
// Helpers
// ==========================================

/**
 * What the browser is allowed to see. The R2 key becomes a
 * URL; nothing else about storage leaves this file.
 */
function publicBrand(brand) {
  return {
    id: brand.id,
    name: brand.name,
    logoUrl: brand.logoKey ? `${CONFIG.SITE_URL}/assets/${brand.logoKey}` : '',
    footerFa: brand.footerFa,
    footerEn: brand.footerEn,
    footerJa: brand.footerJa,
    footerUrl: brand.footerUrl,
    lockMode: brand.lockMode,
    locked: brand.locked,
    updatedAt: brand.updatedAt
  }
}


function bytesToBase64(bytes) {
  let binary = ''
  // In chunks, because String.fromCharCode with a quarter of
  // a million arguments overflows the call stack.
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}


/**
 * The customer typed this name; it must not decide what a
 * Content-Disposition header says.
 */
function safeFileName(name) {
  const cleaned = String(name || 'studio').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned.slice(0, 40) || 'studio'
}


// ==========================================
// The page
//
// A real page of this site, not a bare utility screen: the
// site header, the breadcrumb, the language switch, the theme
// toggle and the footer are all the shared ones, so a reader
// who arrives from /unity-docsnap is still on the same site.
//
// It is accented with the DocSnap violet rather than the site
// default, because this is the product's own screen and it
// should read as part of it — the same violet the export's
// own sidebar uses.
//
// Trilingual and right-to-left aware, like every other page a
// visitor can reach. Nothing here is hard-coded in the markup;
// every string comes out of the pack above, and the browser
// half gets its own copy so a refusal from the server arrives
// in the reader's language rather than in English.
// ==========================================
function renderPanelPage(lang) {
  const t = I18N[lang] || I18N.fa
  const dir = dirFor(lang)
  const nav = NAV_I18N[lang] || NAV_I18N.fa
  const kb = Math.round(MAX_LOGO_BYTES / 1024)

  const trail = [
    { href: '/', label: nav.home },
    { href: '/unity-docsnap', label: 'Unity DocSnap' },
    { href: PAGE_PATH, label: t.crumb }
  ]

  const sections = LOCKABLE_SECTIONS.map(id => `
            <label class="dp-chk">
              <input type="checkbox" data-section="${escapeHtml(id)}">
              <span>${escapeHtml(t['sec_' + id] || id)}</span>
            </label>`).join('')

  // Everything the inline script needs to speak three languages,
  // handed over as data rather than baked into the script — the
  // script is one string for all three, and the pack decides.
  const clientStrings = {}
  for (const key of CLIENT_KEYS) { clientStrings[key] = t[key] }

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  ${getPageHead({ title: t.metaTitle, amirLogo: CONFIG.AMIR_LOGO, description: t.metaDesc })}
  ${seoHead({
    path: PAGE_PATH,
    title: t.metaTitle,
    description: t.metaDesc,
    lang,
    noindex: true,
    graph: [breadcrumbLd(trail, lang)]
  })}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap"></noscript>
  ${themeBootScript()}
  <style>${pageFoundationCss({ brand: DOCSNAP_VIOLET, maxWidth: '840px' })}${siteNavCss()}${panelCss()}</style>
</head>
<body>
  ${siteHeader({ lang, path: PAGE_PATH, accent: DOCSNAP_VIOLET })}
  <div class="wrap">
    ${siteBreadcrumb({ lang, trail })}
    <main id="main" class="dp">
      <header class="dp-head">
        <h1>${escapeHtml(t.h1)}</h1>
        <p>${escapeHtml(t.lede)}</p>
      </header>

      <section class="dp-card dp-how">
        <h2>${escapeHtml(t.howTitle)}</h2>
        <ol class="dp-steps">
          <li>${escapeHtml(t.how1)}</li>
          <li>${escapeHtml(t.how2)}</li>
          <li><span class="dp-path" dir="ltr">${escapeHtml(t.how3)}</span></li>
        </ol>
        <p class="dp-fine">${escapeHtml(t.howWhy)}</p>
        <p class="dp-fine dp-vow"><b>${escapeHtml(t.howPw)}</b> ${escapeHtml(t.howPwRest)}</p>
      </section>

      <section class="dp-card">
        <label class="dp-lbl" for="dpKey">${escapeHtml(t.keyLabel)}</label>
        <div class="dp-row">
          <input id="dpKey" type="text" spellcheck="false" autocomplete="off" dir="ltr"
                 placeholder="${escapeHtml(t.keyPh)}" aria-describedby="dpKeyHint">
          <button id="dpOpen" type="button" class="dp-btn">${escapeHtml(t.open)}</button>
        </div>
        <p id="dpKeyHint" class="dp-fine">${escapeHtml(t.keyHint)}</p>
        <p id="dpStatus" class="dp-status" role="status" aria-live="polite"></p>
      </section>

      <section class="dp-card" id="dpListCard" hidden>
        <div class="dp-cardhead">
          <h2>${escapeHtml(t.profiles)}</h2>
          <button id="dpNew" type="button" class="dp-btn ghost">${escapeHtml(t.newProfile)}</button>
        </div>
        <p class="dp-fine">${escapeHtml(t.profilesNote)}</p>
        <div id="dpList" class="dp-list"></div>
      </section>

      <section class="dp-card" id="dpEditCard" hidden>
        <h2 id="dpEditTitle">${escapeHtml(t.editNew)}</h2>

        <label class="dp-lbl" for="dpName">${escapeHtml(t.nameLabel)}</label>
        <input id="dpName" type="text" maxlength="60" dir="auto" placeholder="${escapeHtml(t.namePh)}">

        <div class="dp-split">
          <div class="dp-splitmain">
            <label class="dp-lbl" for="dpLogo">${escapeHtml(t.logoLabel)} <span class="dp-tag pro">Pro</span></label>
            <!--
              The native file input is hidden and a label stands in
              for it. Not decoration: the browser draws that control
              itself, in the BROWSER's language and always
              left-to-right, so a Persian reader met an English
              "Choose File / No file chosen" sitting backwards in the
              middle of their page. A label pointing at the input is
              the one way to put our own words on it.

              Clipped rather than display:none, because a hidden
              input is skipped by the keyboard and by screen readers,
              and clipped rather than pushed off-screen, because a
              negative offset scrolls a right-to-left page sideways -
              see the note in Pages/Contact.js.
            -->
            <label class="dp-file">
              <input id="dpLogo" class="dp-vh" type="file"
                     accept="image/png,image/jpeg,image/webp,image/gif">
              <span class="dp-btn ghost">${escapeHtml(t.logoPick)}</span>
              <span id="dpLogoName" class="dp-filename"></span>
            </label>
            <p class="dp-fine">${escapeHtml(t.logoNote.replace('{kb}', kb))}</p>
          </div>
          <div class="dp-logobox" title="${escapeHtml(t.logoNone)}">
            <img id="dpLogoPreview" alt="" hidden>
            <span id="dpLogoEmpty" class="dp-fine">${escapeHtml(t.logoNone)}</span>
          </div>
        </div>

        <label class="dp-lbl">${escapeHtml(t.footerLabel)} <span class="dp-tag plus">Plus</span></label>
        <p class="dp-fine">${escapeHtml(t.footerNote)}</p>
        <input id="dpFooterEn" type="text" maxlength="120" dir="ltr" placeholder="English">
        <input id="dpFooterFa" type="text" maxlength="120" dir="rtl" placeholder="فارسی">
        <input id="dpFooterJa" type="text" maxlength="120" dir="ltr" placeholder="日本語">
        <input id="dpFooterUrl" type="text" maxlength="300" dir="ltr" placeholder="${escapeHtml(t.footerUrlPh)}">

        <label class="dp-lbl">${escapeHtml(t.lockLabel)} <span class="dp-tag pro">Pro</span></label>
        <div class="dp-modes" role="radiogroup" aria-label="${escapeHtml(t.lockLabel)}">
          <label class="dp-chk"><input type="radio" name="dpMode" value=""><span>${escapeHtml(t.modeNone)}</span></label>
          <label class="dp-chk"><input type="radio" name="dpMode" value="omit"><span>${escapeHtml(t.modeOmit)}</span></label>
          <label class="dp-chk"><input type="radio" name="dpMode" value="encrypt"><span>${escapeHtml(t.modeEncrypt)}</span></label>
        </div>
        <p id="dpModeNote" class="dp-note" hidden></p>

        <div id="dpSections" class="dp-sections" hidden>
          <p class="dp-fine">${escapeHtml(t.sectionsNote)}</p>
          <div class="dp-seclist">${sections}</div>
        </div>

        <div class="dp-actions">
          <button id="dpSave" type="button" class="dp-btn">${escapeHtml(t.save)}</button>
          <button id="dpDownload" type="button" class="dp-btn ghost">${escapeHtml(t.download)}</button>
          <button id="dpRemove" type="button" class="dp-btn danger">${escapeHtml(t.remove)}</button>
        </div>
        <p id="dpEditStatus" class="dp-status" role="status" aria-live="polite"></p>
      </section>
    </main>
  </div>
  ${siteFooter({ lang })}
  ${siteBackToTop({ lang })}
  ${siteChromeScript()}
  <script id="dpStrings" type="application/json">${
    JSON.stringify({ t: clientStrings, kb, max: BRAND_LIMITS.maxBrands, sections: LOCKABLE_SECTIONS })
      .replace(/</g, '\\u003c')
  }</script>
  <script>${panelScript()}</script>
</body>
</html>`
}


// ==========================================
// panelCss
// Built on pageFoundationCss, so light, dark and the reader's
// system preference are already handled and this only adds
// what the panel itself needs.
//
// The violet is the DocSnap accent, passed in as the
// foundation's brand — the same one the exported site's own
// sidebar uses — so the panel reads as the product's screen
// rather than a generic form.
// ==========================================
function panelCss() {
  return `
    .dp { padding: 8px 0 56px; }
    .dp-head { margin-bottom: 22px; }
    .dp-head h1 { font-size: clamp(26px, 5vw, 34px); line-height: 1.3; margin-bottom: 8px; }
    .dp-head p { color: var(--text-dim); font-size: 15px; max-width: 62ch; }

    .dp-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
      margin-bottom: 16px;
      backdrop-filter: blur(8px);
    }
    .dp-card h2 { font-size: 17px; margin-bottom: 10px; }
    .dp-cardhead { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .dp-cardhead h2 { margin-bottom: 0; }

    .dp-how { border-inline-start: 3px solid var(--brand); }
    .dp-steps { margin: 0 0 12px; padding-inline-start: 22px; color: var(--text-dim); font-size: 14px; line-height: 2; }
    .dp-path {
      display: inline-block;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12.5px;
      padding: 2px 8px;
      border-radius: 7px;
      background: var(--surface-2);
      unicode-bidi: isolate;
    }
    .dp-vow { border-top: 1px solid var(--border); padding-top: 10px; margin-top: 10px; }

    .dp-lbl { display: block; margin: 16px 0 6px; font-size: 13px; font-weight: 700; }
    .dp-lbl:first-child { margin-top: 0; }
    .dp-fine { margin: 6px 0 0; color: var(--muted); font-size: 12.5px; line-height: 1.8; }
    .dp-note {
      margin: 8px 0 0; padding: 10px 12px;
      border: 1px solid var(--border); border-radius: 12px;
      background: var(--surface-2);
      color: var(--text-dim); font-size: 12.5px; line-height: 1.8;
    }

    .dp-row { display: flex; gap: 8px; flex-wrap: wrap; }
    .dp input[type=text], .dp input[type=file] {
      width: 100%;
      font: inherit; font-size: 14px;
      padding: 11px 13px; margin-bottom: 8px;
      color: var(--text);
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 12px;
    }
    .dp-row input[type=text] { flex: 1 1 260px; width: auto; margin-bottom: 0; }
    .dp input:focus-visible {
      outline: none;
      border-color: var(--brand);
      box-shadow: 0 0 0 3px rgba(var(--brand-rgb), 0.18);
    }

    .dp-btn {
      font: inherit; font-size: 14px; font-weight: 700;
      padding: 11px 20px;
      color: #fff; background: var(--brand);
      border: 1px solid transparent; border-radius: 12px;
      cursor: pointer;
      transition: transform .12s ease, filter .12s ease;
    }
    .dp-btn:hover { filter: brightness(1.08); }
    .dp-btn:active { transform: translateY(1px); }
    .dp-btn.ghost { color: var(--brand); background: transparent; border-color: var(--border); }
    .dp-btn.ghost:hover { border-color: var(--brand); }
    .dp-btn.danger { color: var(--err); background: transparent; border-color: var(--border); }
    .dp-btn.danger:hover { border-color: var(--err); }
    .dp-btn:disabled { opacity: .45; cursor: default; transform: none; filter: none; }

    .dp-status { margin: 12px 0 0; min-height: 1.3em; font-size: 13px; color: var(--text-dim); }
    .dp-status.is-bad { color: var(--err); }
    .dp-status.is-good { color: var(--ok); }

    .dp-list { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
    .dp-rowbtn {
      display: flex; align-items: center; gap: 10px;
      width: 100%; padding: 11px 13px;
      font: inherit; font-weight: 600; text-align: start;
      color: var(--text); background: var(--surface-2);
      border: 1px solid var(--border); border-radius: 12px;
      cursor: pointer;
    }
    .dp-rowbtn:hover { border-color: var(--brand); }
    .dp-rowbtn.is-active { border-color: var(--brand); box-shadow: 0 0 0 3px rgba(var(--brand-rgb), 0.14); }
    .dp-rowbtn img { width: 30px; height: 30px; object-fit: contain; border-radius: 8px; flex: none; }
    .dp-rowbtn .dp-meta { margin-inline-start: auto; font-weight: 400; font-size: 12px; color: var(--muted); }

    .dp-split { display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap; }
    .dp-splitmain { flex: 1 1 280px; min-width: 0; }
    .dp-logobox {
      flex: none;
      width: 76px; height: 76px;
      display: flex; align-items: center; justify-content: center;
      border: 1px dashed var(--border); border-radius: 14px;
      background: var(--surface-2);
      text-align: center;
    }
    .dp-logobox img { width: 44px; height: 44px; object-fit: contain; }
    .dp-logobox .dp-fine { margin: 0; font-size: 10.5px; line-height: 1.4; padding: 0 4px; }

    /* The stand-in for the native file control. See the comment on
       .dp-file in the markup for why the real input is clipped and
       not hidden. */
    .dp-file { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; cursor: pointer; }
    .dp-file .dp-btn { pointer-events: none; }
    .dp-vh {
      position: absolute;
      width: 1px; height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    .dp-vh:focus-visible + .dp-btn {
      border-color: var(--brand);
      box-shadow: 0 0 0 3px rgba(var(--brand-rgb), 0.18);
    }
    .dp-filename {
      font-size: 12.5px; color: var(--muted);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      min-width: 0; max-width: 26ch;
      unicode-bidi: plaintext;
    }

    .dp-modes { display: flex; flex-wrap: wrap; gap: 8px 18px; margin: 4px 0 0; }
    .dp-sections { margin-top: 10px; }
    .dp-seclist { display: flex; flex-wrap: wrap; gap: 8px 20px; margin-top: 8px; }
    .dp-chk { display: inline-flex; align-items: center; gap: 7px; font-size: 14px; cursor: pointer; }
    .dp-chk input { accent-color: var(--brand); width: 16px; height: 16px; }

    .dp-tag {
      font-size: 10px; font-weight: 800; letter-spacing: .02em;
      padding: 2px 8px; border-radius: 999px; vertical-align: middle;
      margin-inline-start: 4px;
    }
    .dp-tag.pro { background: rgba(var(--brand-rgb), 0.16); color: var(--brand); }
    .dp-tag.plus { background: rgba(43, 160, 140, 0.16); color: #2ba08c; }

    .dp-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 22px; }

    @media (max-width: 560px) {
      .dp-card { padding: 16px; }
      .dp-actions .dp-btn { flex: 1 1 100%; }
      .dp-logobox { width: 64px; height: 64px; }
    }

    @media (prefers-reduced-motion: reduce) {
      .dp-btn { transition: none; }
      .dp-btn:active { transform: none; }
    }
  `
}


// ==========================================
// panelScript
// One script for all three languages. Every sentence it can
// show comes out of the JSON block above it, which the page
// filled from the pack for whichever language is being read —
// including the refusals, which arrive from the endpoint as
// codes so a Persian reader never meets an English error.
// ==========================================
function panelScript() {
  return `
(function () {
  var API = ${JSON.stringify(PAGE_PATH + '/api')};
  var CFG = {};
  try { CFG = JSON.parse(document.getElementById('dpStrings').textContent); } catch (e) { return; }
  var T = CFG.t || {};

  var key = '';
  var brands = [];
  var current = null;

  function el(id) { return document.getElementById(id); }
  function say(node, text, kind) {
    if (!node) { return; }
    node.textContent = text || '';
    node.className = 'dp-status' + (kind ? ' is-' + kind : '');
  }
  function fill(s, vars) {
    return String(s || '').replace(/\\{(\\w+)\\}/g, function (m, k) {
      return vars && vars[k] !== undefined ? vars[k] : m;
    });
  }

  // A refusal arrives as a code. The sentence is looked up here,
  // so the endpoint stays language-neutral and every reader gets
  // their own words.
  function reason(data) {
    var code = data && data.error;
    var text = code ? T['err_' + code] : null;
    return fill(text || T.err_generic, { kb: CFG.kb, max: CFG.max });
  }

  function call(action, extra) {
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ action: action, key: key }, extra || {}))
    }).then(function (r) {
      return r.json().then(function (data) { return { ok: r.ok, data: data }; },
                           function () { return { ok: false, data: {} }; });
    }, function () {
      return { ok: false, data: { error: 'network' } };
    });
  }

  function load() {
    key = el('dpKey').value.trim();
    if (!key) { say(el('dpStatus'), T.needKey, 'bad'); return; }
    say(el('dpStatus'), T.checking);
    call('brands.list').then(function (res) {
      if (!res.ok) { say(el('dpStatus'), reason(res.data), 'bad'); return; }
      brands = res.data.brands || [];
      say(el('dpStatus'), fill(T.signedIn, { tier: res.data.tier || '' }), 'good');
      el('dpListCard').hidden = false;
      if (brands.length) { select(brands[0].id); } else { current = blank(); renderList(); el('dpEditCard').hidden = true; }
    });
  }

  function renderList() {
    var box = el('dpList');
    box.textContent = '';
    if (!brands.length) {
      var p = document.createElement('p');
      p.className = 'dp-fine';
      p.textContent = T.noProfiles;
      box.appendChild(p);
      return;
    }
    brands.forEach(function (b) {
      var row = document.createElement('button');
      row.type = 'button';
      row.className = 'dp-rowbtn' + (current && current.id === b.id ? ' is-active' : '');
      if (b.logoUrl) {
        var img = document.createElement('img');
        img.src = b.logoUrl;
        img.alt = '';
        row.appendChild(img);
      }
      var name = document.createElement('span');
      name.textContent = b.name;
      row.appendChild(name);
      var meta = document.createElement('span');
      meta.className = 'dp-meta';
      meta.textContent = b.lockMode ? (b.locked.length + ' ' + T.lockedCount) : T.nothingLocked;
      row.appendChild(meta);
      row.addEventListener('click', function () { select(b.id); });
      box.appendChild(row);
    });
  }

  function blank() {
    return { id: '', name: '', logoUrl: '', footerEn: '', footerFa: '', footerJa: '',
             footerUrl: '', lockMode: '', locked: [] };
  }

  function select(id) {
    current = null;
    for (var i = 0; i < brands.length; i++) { if (brands[i].id === id) { current = brands[i]; } }
    if (!current) { current = blank(); }
    paint();
    renderList();
  }

  function paint() {
    el('dpEditCard').hidden = false;
    el('dpEditTitle').textContent = current.id ? T.editExisting : T.editNew;
    el('dpName').value = current.name || '';
    el('dpFooterEn').value = current.footerEn || '';
    el('dpFooterFa').value = current.footerFa || '';
    el('dpFooterJa').value = current.footerJa || '';
    el('dpFooterUrl').value = current.footerUrl || '';

    var img = el('dpLogoPreview');
    var empty = el('dpLogoEmpty');
    if (current.logoUrl) { img.src = current.logoUrl; img.hidden = false; empty.hidden = true; }
    else { img.removeAttribute('src'); img.hidden = true; empty.hidden = false; }
    // Cleared when switching profiles: the name of a file picked for
    // one profile has nothing to say about the next.
    el('dpLogo').value = '';
    el('dpLogoName').textContent = '';

    var radios = document.querySelectorAll('input[name=dpMode]');
    for (var i = 0; i < radios.length; i++) { radios[i].checked = radios[i].value === (current.lockMode || ''); }

    var boxes = document.querySelectorAll('[data-section]');
    for (var j = 0; j < boxes.length; j++) {
      boxes[j].checked = (current.locked || []).indexOf(boxes[j].getAttribute('data-section')) >= 0;
    }

    el('dpRemove').hidden = !current.id;
    el('dpDownload').disabled = !current.id;
    syncMode();
    say(el('dpEditStatus'), '');
  }

  function chosenMode() {
    var radios = document.querySelectorAll('input[name=dpMode]');
    for (var i = 0; i < radios.length; i++) { if (radios[i].checked) { return radios[i].value; } }
    return '';
  }

  // The two modes are different promises, and the panel says which
  // is which every time rather than once in a manual nobody opens.
  function syncMode() {
    var mode = chosenMode();
    el('dpSections').hidden = !mode;
    var note = el('dpModeNote');
    note.hidden = !mode;
    note.textContent = mode === 'omit' ? T.noteOmit : mode === 'encrypt' ? T.noteEncrypt : '';
  }

  function collect() {
    var locked = [];
    var boxes = document.querySelectorAll('[data-section]');
    for (var i = 0; i < boxes.length; i++) {
      if (boxes[i].checked) { locked.push(boxes[i].getAttribute('data-section')); }
    }
    return {
      id: current.id || undefined,
      name: el('dpName').value,
      footerEn: el('dpFooterEn').value,
      footerFa: el('dpFooterFa').value,
      footerJa: el('dpFooterJa').value,
      footerUrl: el('dpFooterUrl').value,
      lockMode: chosenMode(),
      locked: locked
    };
  }

  function refresh(id) {
    return call('brands.list').then(function (res) {
      brands = (res.data && res.data.brands) || [];
      if (id) { select(id); } else { renderList(); }
      return id;
    });
  }

  function save() {
    say(el('dpEditStatus'), T.saving);
    return call('brand.save', { brand: collect() }).then(function (res) {
      if (!res.ok) { say(el('dpEditStatus'), reason(res.data), 'bad'); return null; }
      return refresh(res.data.id).then(function (id) {
        say(el('dpEditStatus'), T.saved, 'good');
        return id;
      });
    });
  }

  el('dpOpen').addEventListener('click', load);
  el('dpKey').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); load(); } });
  el('dpNew').addEventListener('click', function () { current = blank(); paint(); renderList(); });
  el('dpSave').addEventListener('click', save);

  var modes = document.querySelectorAll('input[name=dpMode]');
  for (var m = 0; m < modes.length; m++) { modes[m].addEventListener('change', syncMode); }

  el('dpRemove').addEventListener('click', function () {
    if (!current.id) { return; }
    if (!window.confirm(fill(T.confirmDelete, { name: current.name }))) { return; }
    call('brand.delete', { id: current.id }).then(function () {
      return refresh(null);
    }).then(function () {
      current = blank();
      renderList();
      el('dpEditCard').hidden = true;
    });
  });

  // A logo needs a profile to belong to, so an unsaved one is saved
  // first rather than refused — the alternative is an error message
  // about an order of operations nobody should have to know.
  el('dpLogo').addEventListener('change', function () {
    var file = el('dpLogo').files && el('dpLogo').files[0];
    if (!file) { return; }
    el('dpLogoName').textContent = file.name;
    var reader = new FileReader();
    reader.onload = function () {
      var send = function (id) {
        return call('brand.logo', { id: id, dataUri: reader.result }).then(function (res) {
          if (!res.ok) { say(el('dpEditStatus'), reason(res.data), 'bad'); return; }
          current.logoUrl = res.data.url;
          el('dpLogoPreview').src = res.data.url;
          el('dpLogoPreview').hidden = false;
          el('dpLogoEmpty').hidden = true;
          say(el('dpEditStatus'), T.logoSaved, 'good');
          refresh(null);
        });
      };
      if (current.id) { send(current.id); }
      else { save().then(function (id) { if (id) { send(id); } }); }
    };
    reader.readAsDataURL(file);
  });

  el('dpDownload').addEventListener('click', function () {
    if (!current.id) { return; }
    say(el('dpEditStatus'), T.building);
    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'brand.file', key: key, id: current.id })
    }).then(function (r) {
      if (!r.ok) { throw new Error('failed'); }
      return r.blob();
    }).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = (current.name || 'studio').replace(/[^A-Za-z0-9._-]+/g, '-') + '.docsnapbrand';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      say(el('dpEditStatus'), T.downloaded, 'good');
    }).catch(function () {
      say(el('dpEditStatus'), T.err_generic, 'bad');
    });
  });
})();
  `
}
