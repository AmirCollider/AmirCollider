// ==========================================
// Pages/License.js
// The licence API the Unity Editor talks to, plus the
// browser page a customer manages their key from.
//
// Public entry points (wired in Worker.js ROUTES):
//   POST /license/activate         bind a key to a machine
//   POST /license/validate         renew an existing binding
//   POST /license/deactivate       release one machine's seat
//   POST /license/devices          list the machines on a key
//   POST /license/admin            generate / lookup / revoke / restore
//                                  (action in the body, bearer-guarded)
//   GET  /license                  the management page
//
// Two rules run through the whole file:
//
//   • Never say more than the caller already knows. A
//     wrong key gets "that key was not recognised" and
//     not "no such key" versus "wrong product" - the
//     difference between those two is exactly what an
//     enumeration attack is looking for.
//
//   • Always say enough to act on. A refusal a customer
//     CAN act on - the key is on another machine, the
//     key was refunded, all seats are in use - names the
//     situation, because a person holding a valid
//     receipt and reading "invalid licence" writes an
//     email that takes an hour to answer.
// ==========================================

import { CONFIG } from '../Config.js'
import { getPageHead, pageFoundationCss } from '../Core/DesignSystem.js'
import { seoHead, breadcrumbLd } from '../Core/Seo.js'
import {
  siteNavCss, siteHeader, siteBreadcrumb, siteFooter, siteBackToTop, siteChromeScript, NAV_I18N
} from '../Core/SiteNav.js'
import { themeBootScript } from '../Core/PageChrome.js'
import { dirFor, parseCookies, resolveLang, resolveRequestLang } from '../Core/RequestContext.js'
import { escapeHtml } from '../Core/Html.js'
import { createJsonResponse, createHtmlResponse, clientIp, timingSafeEqual, readJsonObject } from '../Core/Http.js'
import { logInfo, logWarning } from '../Core/Logging.js'
import { normalizeKey, isWellFormed, generateBatch } from '../Licensing/Keys.js'
import { signToken, TOKEN_LIFETIME } from '../Licensing/Tokens.js'
import {
  db, findLicense, listActivations, findActivation, touchActivation,
  createActivation, removeActivation, insertLicenses, setStatus,
  isRateLimited, recordFailedAttempt, RATE_LIMIT
} from '../Licensing/Store.js'

const PRODUCT = 'unity-docsnap'

// The batch generator's ceiling per call. Sell.app pools
// are refilled in the low hundreds, and a bound keeps one
// mistyped number from trying to write a million rows
// inside a Worker's CPU budget.
const MAX_BATCH = 500


// ==========================================
// fail / ok
// One shape for every answer, because the Unity client
// reads `ok`, `error` and `message` and nothing else.
// A handler that returned a bare 400 with no body would
// surface in the Editor as "the licence server sent a
// reply this version could not read", which is true and
// useless.
// ==========================================
function fail(error, message, status = 400, extra = {}) {
  return createJsonResponse({ ok: false, error, message, ...extra }, status)
}

function ok(payload = {}) {
  return createJsonResponse({ ok: true, ...payload })
}


// ==========================================
// readBody
// The request as JSON, or null.
// ==========================================
async function readBody(request) {
  return readJsonObject(request)
}


// ==========================================
// sanitizeLabel
// The device name the Editor sends, bounded and stripped
// of anything that is not printable text.
// ==========================================
function sanitizeLabel(value) {
  if (typeof value !== 'string') return null
  // Control characters and angle brackets are dropped; everything
  // else is kept. Device names legitimately contain spaces, dots,
  // parentheses and non-Latin scripts, and a stricter filter would
  // rename half the world's machines to nothing.
  let cleaned = ''
  for (const ch of value) {
    const code = ch.codePointAt(0)
    if (code < 32 || code === 127) continue
    if (ch === '<' || ch === '>') continue
    cleaned += ch
  }

  cleaned = cleaned.trim()
  return cleaned ? cleaned.slice(0, 60) : null
}


function sanitizeVersion(value) {
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/[^0-9a-zA-Z.\-+]/g, '').trim()
  return cleaned ? cleaned.slice(0, 24) : null
}


// ==========================================
// resolveKeyRequest
// Everything the three machine-facing endpoints do
// before they diverge: check the database exists, check
// the caller is not hammering us, validate the key
// shape, look the row up, and confirm it is still live.
//
// Returns either { error: Response } or { license, ... }.
// ==========================================
async function resolveKeyRequest(request, env, { requireMachine = true } = {}) {
  const database = db(env)
  if (!database) {
    return {
      error: fail('not_configured',
        'Licensing is not configured on this deployment yet.', 503)
    }
  }

  const body = await readBody(request)
  if (!body) {
    return { error: fail('bad_request', 'Expected a JSON body.') }
  }

  const ip = clientIp(request)
  if (await isRateLimited(database, ip)) {
    logWarning('License rate limit hit', { path: new URL(request.url).pathname })
    return {
      error: fail('rate_limited',
        `Too many failed attempts. Try again in ${Math.round(RATE_LIMIT.windowMs / 60000)} minutes.`, 429)
    }
  }

  // The browser's device list is the one caller with no machine
  // of its own to name - it is asking about somebody else's
  // machines. Demanding one there would have meant inventing a
  // placeholder, and a placeholder that has to pass a real
  // validator is a rule with an official way around it.
  const machineId = typeof body.machine === 'string' ? body.machine.trim() : ''
  if (requireMachine && !/^[a-f0-9]{16,128}$/.test(machineId)) {
    return { error: fail('bad_machine', 'The machine identifier was missing or malformed.') }
  }

  const normalized = normalizeKey(body.key)
  if (!isWellFormed(normalized)) {
    await recordFailedAttempt(database, ip)
    return {
      error: fail('bad_key',
        'That key was not recognised. Check it against your purchase email — it looks like DSNAP-XXXXX-XXXXX-XXXXX.')
    }
  }

  const license = await findLicense(database, normalized)
  if (!license) {
    await recordFailedAttempt(database, ip)
    // Same wording as a malformed key, on purpose: telling
    // the caller that a well-formed key does not exist is
    // telling them their guess had the right shape.
    return {
      error: fail('bad_key',
        'That key was not recognised. Check it against your purchase email — it looks like DSNAP-XXXXX-XXXXX-XXXXX.')
    }
  }

  if (license.status !== 'active') {
    return {
      error: fail('revoked',
        'This key is no longer active. If you believe that is wrong, reply to your purchase email and we will sort it out.')
    }
  }

  if (license.product !== PRODUCT) {
    return { error: fail('wrong_product', 'That key belongs to a different product.') }
  }

  return {
    database,
    license,
    machineId,
    label: sanitizeLabel(body.label),
    appVersion: sanitizeVersion(body.version)
  }
}


// ==========================================
// issueToken
// The signed proof plus the seat numbers, which is what
// both activate and validate return on success.
// ==========================================
async function issueToken(env, license, machineId, seatsUsed) {
  const token = await signToken(env, {
    product: license.product,
    tier: license.tier,
    keyLabel: license.key_public,
    machineId
  })

  return ok({
    token,
    tier: license.tier,
    seatsUsed,
    seatsTotal: license.max_activations,
    offlineDays: TOKEN_LIFETIME
  })
}


// ==========================================
// handleLicenseActivate
// Binds this machine to this key, if there is room.
// ==========================================
export async function handleLicenseActivate(url, request, gameId, requestId, GAMES, env) {
  const resolved = await resolveKeyRequest(request, env)
  if (resolved.error) return resolved.error

  const { database, license, machineId, label, appVersion } = resolved

  const existing = await findActivation(database, license.key_hash, machineId)
  if (existing) {
    // Already ours. Refresh it and hand back a token rather
    // than reporting "already activated" as a failure: the
    // Editor arrives here after a reinstall or a cleared
    // EditorPrefs, and the honest answer to "may I use what
    // I bought on the machine I already registered" is yes.
    await touchActivation(database, license.key_hash, machineId, appVersion)
    const seats = await listActivations(database, license.key_hash)
    return issueToken(env, license, machineId, seats.length)
  }

  const seats = await listActivations(database, license.key_hash)
  if (seats.length >= license.max_activations) {
    // Names the machines that hold the seats, because the
    // customer is almost always looking at an old laptop
    // they forgot about, and the fix is one click on the
    // management page rather than an email to us.
    const names = seats.map(s => s.machine_label || 'an unnamed machine').join(', ')
    return fail('seats_full',
      license.max_activations === 1
        ? `This key is already active on ${names}. Release it there (or at ${CONFIG.SITE_URL}/license) and activate here again.`
        : `All ${license.max_activations} devices for this key are in use: ${names}. Release one to activate here.`,
      409,
      { seatsUsed: seats.length, seatsTotal: license.max_activations })
  }

  await createActivation(database, license.key_hash, machineId, label, appVersion)
  logInfo('License activated', { requestId, key: license.key_public, seats: seats.length + 1 })

  return issueToken(env, license, machineId, seats.length + 1)
}


// ==========================================
// handleLicenseValidate
// The renewal call: this machine already has a seat and
// wants a fresh token.
// ==========================================
export async function handleLicenseValidate(url, request, gameId, requestId, GAMES, env) {
  const resolved = await resolveKeyRequest(request, env)
  if (resolved.error) return resolved.error

  const { database, license, machineId, appVersion } = resolved

  const activation = await findActivation(database, license.key_hash, machineId)
  if (!activation) {
    return fail('not_activated',
      'This machine is not activated with that key yet. Press Activate to claim a seat.', 409)
  }

  await touchActivation(database, license.key_hash, machineId, appVersion)
  const seats = await listActivations(database, license.key_hash)
  return issueToken(env, license, machineId, seats.length)
}


// ==========================================
// handleLicenseDeactivate
// Releases one machine's seat.
// ==========================================
export async function handleLicenseDeactivate(url, request, gameId, requestId, GAMES, env) {
  const resolved = await resolveKeyRequest(request, env)
  if (resolved.error) return resolved.error

  const { database, license, machineId } = resolved

  const removed = await removeActivation(database, license.key_hash, machineId)
  const seats = await listActivations(database, license.key_hash)

  logInfo('License deactivated', { requestId, key: license.key_public, removed })

  return ok({
    released: removed,
    message: removed
      ? 'That device has been released. The key can be activated somewhere else straight away.'
      : 'That device was not activated with this key, so nothing changed.',
    seatsUsed: seats.length,
    seatsTotal: license.max_activations
  })
}


// ==========================================
// handleLicenseDevices
// The device list behind the management page.
//
// It is NOT enough to release one, so the page sends the
// full id it was given; the truncation is for display.
// ==========================================
export async function handleLicenseDevices(url, request, gameId, requestId, GAMES, env) {
  const resolved = await resolveKeyRequest(request, env, { requireMachine: false })
  if (resolved.error) return resolved.error

  const { database, license } = resolved
  const seats = await listActivations(database, license.key_hash)

  return ok({
    key: license.key_public,
    tier: license.tier,
    seatsUsed: seats.length,
    seatsTotal: license.max_activations,
    devices: seats.map(s => ({
      machine: s.machine_id,
      short: String(s.machine_id).slice(0, 12),
      label: s.machine_label || '',
      version: s.app_version || '',
      activatedAt: s.activated_at,
      lastSeenAt: s.last_seen_at
    }))
  })
}


// ==========================================
// handleLicenseAdmin
// Key generation, lookup and revocation.
// ==========================================
export async function handleLicenseAdmin(url, request, gameId, requestId, GAMES, env) {
  const database = db(env)
  if (!database) return fail('not_configured', 'Licensing is not configured on this deployment yet.', 503)

  const expected = env && env.DOCSNAP_ADMIN_TOKEN
  if (!expected) return fail('not_configured', 'DOCSNAP_ADMIN_TOKEN is not set on this Worker.', 503)

  const presented = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (!timingSafeEqual(presented, expected)) {
    logWarning('License admin rejected', { requestId })
    return fail('unauthorized', 'Not authorised.', 401)
  }

  const body = await readBody(request)
  if (!body) return fail('bad_request', 'Expected a JSON body.')

  const action = String(body.action || '').toLowerCase()

  if (action === 'generate') {
    const count = Math.min(Math.max(parseInt(body.count, 10) || 0, 1), MAX_BATCH)
    const maxActivations = Math.min(Math.max(parseInt(body.seats, 10) || 1, 1), 20)

    // The tier is required rather than defaulted, and an unknown
    // one is refused rather than coerced.
    const tier = String(body.tier || '').toLowerCase()
    if (tier !== 'plus' && tier !== 'pro') {
      return fail('bad_tier', 'tier must be "plus" or "pro" — pass it explicitly so a batch cannot be mispriced.')
    }

    // The batch label carries the tier by default, because the one
    // thing you need to know about a pool of keys six months later
    // is which product it was sold as.
    const batch = sanitizeLabel(body.batch) || `${new Date().toISOString().slice(0, 10)}-${tier}`

    const keys = generateBatch(count)
    const written = await insertLicenses(database, keys, {
      batch,
      maxActivations,
      product: PRODUCT,
      tier
    })

    logInfo('License batch generated', { requestId, batch, tier, count: written })

    return ok({
      batch,
      tier,
      count: keys.length,
      written,
      seats: maxActivations,
      // Newline-joined as well as listed, because the actual
      // next step is a paste into Sell.app's Serials box and
      // reformatting a JSON array by hand is a good way to
      // lose one.
      serials: keys.join('\n'),
      keys,
      note: `These plaintext ${tier} keys are shown once and are not stored. `
          + `Save them before closing this response, and paste them into the ${tier} product's Serials pool.`
    })
  }

  if (action === 'lookup') {
    const license = await findLicense(database, body.key)
    if (!license) return fail('not_found', 'No licence matches that key.', 404)

    const seats = await listActivations(database, license.key_hash)
    return ok({
      key: license.key_public,
      product: license.product,
      tier: license.tier,
      status: license.status,
      batch: license.batch,
      email: license.email,
      note: license.note,
      seatsUsed: seats.length,
      seatsTotal: license.max_activations,
      createdAt: license.created_at,
      firstActivatedAt: license.first_activated_at,
      lastSeenAt: license.last_seen_at,
      devices: seats
    })
  }

  if (action === 'revoke' || action === 'restore') {
    const license = await findLicense(database, body.key)
    if (!license) return fail('not_found', 'No licence matches that key.', 404)

    await setStatus(database, license.key_hash, action === 'revoke' ? 'revoked' : 'active')
    logInfo('License status changed', { requestId, key: license.key_public, action })

    return ok({
      key: license.key_public,
      status: action === 'revoke' ? 'revoked' : 'active',
      // Said plainly rather than left as a surprise. Offline
      // verification is the whole design, and its cost is
      // exactly this: a machine that already has a token
      // keeps it until it expires.
      note: action === 'revoke'
        ? `Activations cleared. Any machine already holding a token keeps Pro for up to ${TOKEN_LIFETIME} more days.`
        : 'The key works again. Machines will need to activate it afresh.'
    })
  }

  return fail('bad_action', 'action must be one of: generate, lookup, revoke, restore.')
}


// ==========================================
// handleLicensePage
// The browser side: paste a key, see the machines on it,
// release one.
// ==========================================

// ==========================================
// i18n
// One pack per language, and the refusals are in it too: the
// endpoints answer with an error CODE, so the browser looks the
// sentence up and a Persian customer never meets an English
// "That key was not recognised."
//
// The page used to be English only. It is the screen somebody
// opens holding a receipt, in whatever language they bought in,
// and rule 6 of CLAUDE.md is not suspended for utility pages.
// ==========================================
const PAGE_I18N = {
  fa: {
    locale: 'fa-IR',
    metaTitle: 'لایسنس — Unity DocSnap',
    metaDesc: 'لایسنس Unity DocSnap خود را ببین، دستگاه‌های فعال را مدیریت کن، و لوگو و فوتر خروجی‌هایت را تنظیم کن.',
    crumb: 'لایسنس',
    h1: 'لایسنس تو',
    lede: 'کدت را بزن تا ببینی روی کدام دستگاه‌ها فعال است، و اگر داری به کامپیوتر تازه‌ای می‌روی یکی را آزاد کن.',

    keyLabel: 'کد لایسنس',
    check: 'بررسی',
    keyHint: 'فاصله و بزرگی حروف مهم نیست. هیچ چیزی در مرورگرت ذخیره نمی‌شود.',

    panelTitle: 'لوگو، فوتر و قفل کردن بخش‌ها',
    panelBody: 'لوگوی استودیو و خط فوترت را یک بار بچین، فایل برند را دانلود کن، و در هر پروژه‌ی یونیتی Import کن — همان کاری که با کد لایسنس کردی. یونیتی هیچ‌وقت با سایت حرف نمی‌زند، پس خروجی روی ماشین بدون اینترنت هم کار می‌کند.',
    panelCta: 'باز کردن پنل برند',

    noKeyTitle: 'هنوز کد نداری؟',
    noKeyBody: '<b>رایگان</b> اصلاً کد نمی‌خواهد — نصبش کن و همه‌ی خروجی‌های اصلی کار می‌کنند. <b>Plus</b> خلاصه‌های هوش مصنوعی و صفحه‌ی تغییرات را اضافه می‌کند. <b>Pro</b> تاریخچه‌ی نامحدود نسخه‌ها، بروزرسانی افزایشی، کپی فایل‌ها، بکاپ پروژه، اتوماسیون CI، لوگوی اختصاصی و قفل کردن بخش‌ها را. هر دو یک‌بار پرداخت.',
    noKeyCta: 'مقایسه‌ی هر سه',

    tierPro: 'لایسنس Pro',
    tierPlus: 'لایسنس Plus',
    seats: '{used} از {total} دستگاه در حال استفاده',
    noDevices: 'هنوز هیچ ماشینی این کد را فعال نکرده. در یونیتی به Unity DocSnap ← Licence & Pro Features برو و آن‌جا واردش کن.',
    unnamedMachine: 'دستگاه بی‌نام',
    activated: 'فعال‌شده در',
    release: 'آزاد کردن',
    confirmRelease: 'این دستگاه آزاد شود؟ تا وقتی دوباره فعال نشود، قابلیت‌های Pro روی آن کار نمی‌کند.',

    needKey: 'اول کدت را بزن.',
    checking: 'در حال بررسی…',
    releasing: 'در حال آزاد کردن…',

    err_bad_key: 'این کد شناخته نشد.',
    err_revoked: 'این کد باطل شده. اگر فکر می‌کنی اشتباه است، با من تماس بگیر.',
    err_wrong_product: 'این کد مال محصول دیگری است.',
    err_rate_limited: 'تلاش‌های زیادی شد. چند دقیقه صبر کن و دوباره امتحان کن.',
    err_bad_request: 'درخواست درست ساخته نشد.',
    err_bad_machine: 'شناسه‌ی دستگاه درست نبود.',
    err_not_configured: 'سرور لایسنس الآن در دسترس نیست.',
    err_generic: 'یک جای کار درست پیش نرفت.',
    err_network: 'ارتباط با سرور لایسنس برقرار نشد. دوباره امتحان کن.'
  },

  en: {
    locale: 'en-GB',
    metaTitle: 'Licence — Unity DocSnap',
    metaDesc: 'Check your Unity DocSnap licence, manage the machines it is activated on, and set the logo and footer your exports carry.',
    crumb: 'Licence',
    h1: 'Your licence',
    lede: 'Paste your key to see which machines it is activated on, and release one if you are moving to a new computer.',

    keyLabel: 'Licence key',
    check: 'Check',
    keyHint: "Spacing and capitalisation don't matter. Nothing is stored in your browser.",

    panelTitle: 'Your logo, footer and locked sections',
    panelBody: 'Set your studio logo and footer line once, download the brand file, and import it in each Unity project — the same way you carried your licence key. Unity never talks to this site, so an export still works on a machine with no internet at all.',
    panelCta: 'Open the brand panel',

    noKeyTitle: "Don't have a key yet?",
    noKeyBody: '<b>Free</b> needs no key at all — install it and every core export works. <b>Plus</b> adds the AI summary outputs and the Changes page. <b>Pro</b> adds unlimited version history, incremental updates, file copies, project backups, CI automation, a custom logo and section locking. Both are one-off.',
    noKeyCta: 'Compare all three',

    tierPro: 'Pro licence',
    tierPlus: 'Plus licence',
    seats: '{used} of {total} devices in use',
    noDevices: 'No machine has activated this key yet. Paste it into Unity DocSnap › Licence & Pro Features to get started.',
    unnamedMachine: 'Unnamed machine',
    activated: 'activated',
    release: 'Release',
    confirmRelease: 'Release this device? Pro features stop there until it is activated again.',

    needKey: 'Paste your licence key first.',
    checking: 'Checking…',
    releasing: 'Releasing…',

    err_bad_key: 'That key was not recognised.',
    err_revoked: 'That key has been revoked. If you think that is wrong, get in touch.',
    err_wrong_product: 'That key belongs to a different product.',
    err_rate_limited: 'Too many attempts. Wait a few minutes and try again.',
    err_bad_request: 'The request was not well formed.',
    err_bad_machine: 'The machine identifier was missing or malformed.',
    err_not_configured: 'The licence server is unavailable right now.',
    err_generic: 'Something went wrong.',
    err_network: 'Could not reach the licence server. Please try again.'
  },

  ja: {
    locale: 'ja-JP',
    metaTitle: 'ライセンス — Unity DocSnap',
    metaDesc: 'Unity DocSnap のライセンス確認、アクティベート済み端末の管理、エクスポートのロゴとフッターの設定。',
    crumb: 'ライセンス',
    h1: 'ライセンス',
    lede: 'キーを貼り付けると、どの端末で有効になっているかを確認できます。新しいPCへ移る場合はここで解放してください。',

    keyLabel: 'ライセンスキー',
    check: '確認',
    keyHint: '空白や大文字小文字は問いません。ブラウザには何も保存されません。',

    panelTitle: 'ロゴ・フッター・セクションのロック',
    panelBody: '自社ロゴとフッターの一行を一度設定してブランドファイルをダウンロードし、各 Unity プロジェクトで読み込みます。ライセンスキーと同じ流れです。Unity はこのサイトと通信しないため、インターネットのない環境でもエクスポートは動きます。',
    panelCta: 'ブランドパネルを開く',

    noKeyTitle: 'キーをお持ちでない場合',
    noKeyBody: '<b>無料版</b>にキーは不要です — インストールすれば主要なエクスポートはすべて動きます。<b>Plus</b> は AI サマリー出力と変更点ページを追加します。<b>Pro</b> は無制限のバージョン履歴、増分更新、ファイル本体のコピー、プロジェクトバックアップ、CI 自動化、独自ロゴ、セクションのロックを追加します。いずれも買い切りです。',
    noKeyCta: '3つを比較する',

    tierPro: 'Pro ライセンス',
    tierPlus: 'Plus ライセンス',
    seats: '{total} 台中 {used} 台が使用中',
    noDevices: 'このキーはまだどの端末でも有効化されていません。Unity DocSnap ▸ Licence & Pro Features で入力してください。',
    unnamedMachine: '名称未設定の端末',
    activated: '有効化日',
    release: '解放',
    confirmRelease: 'この端末を解放しますか?再度有効化するまで Pro 機能は使えなくなります。',

    needKey: '先にライセンスキーを入力してください。',
    checking: '確認中…',
    releasing: '解放中…',

    err_bad_key: 'そのキーは認識されませんでした。',
    err_revoked: 'このキーは失効しています。お心当たりがなければご連絡ください。',
    err_wrong_product: 'そのキーは別の製品のものです。',
    err_rate_limited: '試行回数が多すぎます。数分待ってからもう一度お試しください。',
    err_bad_request: 'リクエストの形式が正しくありません。',
    err_bad_machine: '端末識別子が不正です。',
    err_not_configured: 'ライセンスサーバーに現在アクセスできません。',
    err_generic: '処理に失敗しました。',
    err_network: 'ライセンスサーバーに接続できませんでした。もう一度お試しください。'
  }
}

const LICENSE_PATH = '/license'

// The DocSnap accent — the violet the product page and the
// exported site's own sidebar use.
const DOCSNAP_VIOLET = '#7a52b8'

// What the browser half needs, named rather than shipping the
// whole pack including this page's meta description.
const LICENSE_CLIENT_KEYS = [
  'tierPro', 'tierPlus', 'seats', 'noDevices', 'unnamedMachine', 'activated', 'release',
  'confirmRelease', 'needKey', 'checking', 'releasing',
  'err_bad_key', 'err_revoked', 'err_wrong_product', 'err_rate_limited',
  'err_bad_request', 'err_bad_machine', 'err_not_configured',
  'err_generic', 'err_network'
]

export async function handleLicensePage(url, request) {
  const lang = resolveLang(resolveRequestLang(url, request, parseCookies(request)))
  return createHtmlResponse(renderLicensePage(lang))
}


function renderLicensePage(lang) {
  const t = PAGE_I18N[lang] || PAGE_I18N.fa
  const dir = dirFor(lang)
  const nav = NAV_I18N[lang] || NAV_I18N.fa

  const trail = [
    { href: '/', label: nav.home },
    { href: '/unity-docsnap', label: 'Unity DocSnap' },
    { href: LICENSE_PATH, label: t.crumb }
  ]

  const clientStrings = {}
  for (const key of LICENSE_CLIENT_KEYS) { clientStrings[key] = t[key] }

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  ${getPageHead({ title: t.metaTitle, amirLogo: CONFIG.AMIR_LOGO, description: t.metaDesc })}
  ${seoHead({
    path: LICENSE_PATH,
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
  <style>${pageFoundationCss({ brand: DOCSNAP_VIOLET, maxWidth: '820px' })}${siteNavCss()}${licenseCss()}</style>
</head>
<body>
  ${siteHeader({ lang, path: LICENSE_PATH, accent: DOCSNAP_VIOLET })}
  <div class="wrap">
    ${siteBreadcrumb({ lang, trail })}
    <main id="main" class="lc">
      <header class="lc-head">
        <h1>${escapeHtml(t.h1)}</h1>
        <p>${escapeHtml(t.lede)}</p>
      </header>

      <section class="lc-card">
        <label class="lc-lbl" for="key">${escapeHtml(t.keyLabel)}</label>
        <div class="lc-row">
          <input id="key" type="text" spellcheck="false" autocomplete="off" dir="ltr"
                 placeholder="DSNAP-XXXXX-XXXXX-XXXXX" aria-describedby="hint">
          <button id="check" type="button" class="lc-btn">${escapeHtml(t.check)}</button>
        </div>
        <p id="hint" class="lc-fine">${escapeHtml(t.keyHint)}</p>
        <div id="out" class="lc-out" role="status" aria-live="polite"></div>
      </section>

      <!--
        The brand panel, as a card with its own call to action
        rather than a sentence in a paragraph. It was a line of
        text at the bottom of this page and nobody could find the
        place to set a logo and a footer - which is the whole
        reason somebody with a Pro key opens this page at all.
      -->
      <section class="lc-card lc-feature">
        <div class="lc-feature-mark" aria-hidden="true">\u{1F3A8}</div>
        <div class="lc-feature-body">
          <h2>${escapeHtml(t.panelTitle)}</h2>
          <p>${escapeHtml(t.panelBody)}</p>
          <a class="lc-btn" href="/unity-docsnap/panel">${escapeHtml(t.panelCta)}</a>
        </div>
      </section>

      <section class="lc-card lc-muted">
        <h2>${escapeHtml(t.noKeyTitle)}</h2>
        <p>${t.noKeyBody}</p>
        <a class="lc-btn ghost" href="/unity-docsnap">${escapeHtml(t.noKeyCta)}</a>
      </section>
    </main>
  </div>
  ${siteFooter({ lang })}
  ${siteBackToTop({ lang })}
  ${siteChromeScript()}
  <script id="lcStrings" type="application/json">${
    JSON.stringify({ t: clientStrings, locale: t.locale || 'en' }).replace(/</g, '\\u003c')
  }</script>
  <script>${licenseScript()}</script>
</body>
</html>`
}


// ==========================================
// licenseCss
// On pageFoundationCss, so light, dark and the reader's system
// preference are already handled, accented with the DocSnap
// violet so this reads as the product's own screen.
// ==========================================
function licenseCss() {
  return `
    .lc { padding: 8px 0 56px; }
    .lc-head { margin-bottom: 22px; }
    .lc-head h1 { font-size: clamp(26px, 5vw, 34px); line-height: 1.3; margin-bottom: 8px; }
    .lc-head p { color: var(--text-dim); font-size: 15px; max-width: 62ch; }

    .lc-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
      margin-bottom: 16px;
      backdrop-filter: blur(8px);
    }
    .lc-card h2 { font-size: 17px; margin-bottom: 10px; }
    .lc-card p { color: var(--text-dim); font-size: 14px; line-height: 1.85; margin-bottom: 14px; }
    .lc-muted p { font-size: 13.5px; }

    .lc-feature { display: flex; gap: 16px; align-items: flex-start; border-inline-start: 3px solid var(--brand); }
    .lc-feature-mark { font-size: 28px; line-height: 1.2; flex: none; }
    .lc-feature-body { min-width: 0; }

    .lc-lbl { display: block; margin-bottom: 6px; font-size: 13px; font-weight: 700; }
    .lc-fine { margin: 8px 0 0; color: var(--muted); font-size: 12.5px; line-height: 1.8; }
    .lc-row { display: flex; gap: 8px; flex-wrap: wrap; }
    .lc input[type=text] {
      flex: 1 1 260px;
      font: inherit; font-size: 14px;
      padding: 11px 13px;
      color: var(--text);
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 12px;
    }
    .lc input:focus-visible {
      outline: none;
      border-color: var(--brand);
      box-shadow: 0 0 0 3px rgba(var(--brand-rgb), 0.18);
    }

    .lc-btn {
      display: inline-block;
      font: inherit; font-size: 14px; font-weight: 700;
      padding: 11px 20px;
      color: #fff; background: var(--brand);
      border: 1px solid transparent; border-radius: 12px;
      cursor: pointer; text-decoration: none;
      transition: filter .12s ease;
    }
    .lc-btn:hover { filter: brightness(1.08); }
    .lc-btn.ghost { color: var(--brand); background: transparent; border-color: var(--border); }
    .lc-btn.ghost:hover { border-color: var(--brand); }
    .lc-btn:disabled { opacity: .45; cursor: default; filter: none; }

    .lc-out { margin-top: 14px; }
    .lc-note {
      padding: 11px 13px; border-radius: 12px;
      border: 1px solid var(--border); background: var(--surface-2);
      font-size: 13.5px; color: var(--text-dim);
    }
    .lc-note.ok { border-color: rgba(var(--brand-rgb), 0.45); color: var(--text); }
    .lc-note.bad { border-color: var(--err); color: var(--err); }
    .lc-seats { margin: 12px 0 8px; font-size: 13px; color: var(--muted); }

    .lc-dev {
      display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
      padding: 11px 13px; margin-bottom: 8px;
      border: 1px solid var(--border); border-radius: 12px;
    }
    .lc-dev-text { min-width: 0; }
    .lc-dev b { display: block; font-size: 14px; }
    .lc-dev small { display: block; margin-top: 2px; color: var(--muted); font-size: 12px; unicode-bidi: plaintext; }
    .lc-dev button {
      margin-inline-start: auto;
      font: inherit; font-size: 12.5px; font-weight: 700;
      padding: 7px 14px;
      color: var(--err); background: transparent;
      border: 1px solid var(--border); border-radius: 10px; cursor: pointer;
    }
    .lc-dev button:hover { border-color: var(--err); }

    @media (max-width: 560px) {
      .lc-card { padding: 16px; }
      .lc-row .lc-btn { flex: 1 1 100%; }
      .lc-feature { flex-direction: column; gap: 10px; }
    }
    @media (prefers-reduced-motion: reduce) { .lc-btn { transition: none; } }
  `
}


// ==========================================
// licenseScript
// One script for all three languages; the sentences come out of
// the JSON block the page wrote from the reader's pack, and the
// refusals are looked up by the CODE the endpoint returns rather
// than printed from its English message.
// ==========================================
function licenseScript() {
  return `
(function () {
  var CFG = {};
  try { CFG = JSON.parse(document.getElementById('lcStrings').textContent); } catch (e) { return; }
  var T = CFG.t || {};

  var keyEl = document.getElementById('key');
  var outEl = document.getElementById('out');
  var checkEl = document.getElementById('check');

  function fill(s, vars) {
    return String(s || '').replace(/\\{(\\w+)\\}/g, function (m, k) {
      return vars && vars[k] !== undefined ? vars[k] : m;
    });
  }

  // Built as nodes rather than a string of HTML. The old version
  // escaped by hand into innerHTML, which works right up until
  // somebody forgets one call - and a device label is a name
  // somebody typed on their own machine.
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text !== undefined) { node.textContent = text; }
    return node;
  }

  function note(kind, text) {
    outEl.textContent = '';
    outEl.appendChild(el('div', 'lc-note' + (kind ? ' ' + kind : ''), text));
  }

  function reason(data) {
    var code = data && data.error;
    return (code && T['err_' + code]) || T.err_generic;
  }

  function when(ms) {
    if (!ms) { return ''; }
    try { return new Date(ms).toLocaleDateString(CFG.locale || undefined); } catch (e) { return ''; }
  }

  function post(path, payload) {
    return fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().then(function (d) { return d; }, function () { return { error: 'generic' }; });
    }, function () {
      return { error: 'network' };
    });
  }

  function render(data) {
    outEl.textContent = '';

    var tierName = data.tier === 'pro' ? T.tierPro : data.tier === 'plus' ? T.tierPlus : data.tier;
    var head = el('div', 'lc-note ok');
    var strong = el('b', null, data.key);
    head.appendChild(strong);
    head.appendChild(document.createTextNode(' — ' + tierName));
    outEl.appendChild(head);

    outEl.appendChild(el('p', 'lc-seats', fill(T.seats, { used: data.seatsUsed, total: data.seatsTotal })));

    if (!data.devices || !data.devices.length) {
      outEl.appendChild(el('div', 'lc-note', T.noDevices));
      return;
    }

    data.devices.forEach(function (d) {
      var row = el('div', 'lc-dev');
      var text = el('div', 'lc-dev-text');
      text.appendChild(el('b', null, d.label || T.unnamedMachine));
      var bits = d.short + '… · ' + T.activated + ' ' + when(d.activatedAt) + (d.version ? ' · v' + d.version : '');
      text.appendChild(el('small', null, bits));
      row.appendChild(text);

      var btn = el('button', null, T.release);
      btn.type = 'button';
      btn.addEventListener('click', function () { release(d.machine); });
      row.appendChild(btn);

      outEl.appendChild(row);
    });
  }

  function load() {
    var key = keyEl.value.trim();
    if (!key) { note('bad', T.needKey); return; }

    checkEl.disabled = true;
    note('', T.checking);

    post('/license/devices', { product: 'unity-docsnap', key: key }).then(function (data) {
      checkEl.disabled = false;
      if (data && data.ok) { render(data); } else { note('bad', reason(data)); }
    });
  }

  function release(machine) {
    if (!window.confirm(T.confirmRelease)) { return; }
    note('', T.releasing);
    post('/license/deactivate', { product: 'unity-docsnap', key: keyEl.value.trim(), machine: machine })
      .then(function (data) {
        if (data && data.ok) { load(); } else { note('bad', reason(data)); }
      });
  }

  checkEl.addEventListener('click', load);
  keyEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); load(); } });
})();
  `
}
