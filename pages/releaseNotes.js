// ==========================================
// pages/releaseNotes.js
// Release Notes Page Handler
// AmirCollider Games - Worker Proxy
// ==========================================
//
// Responsibilities
//   - Render the public Release Notes page: topbar, hero and a grouped
//     version changelog. Theme-aware (light/dark/auto) and tri-lingual
//     (fa/en/ja) with correct RTL/LTR, matching the dashboard chrome.
//
// Integration contract (do not break without updating callers)
//   - Public entry: handleReleaseNotes(url, request, gameId, requestId,
//                                      GAMES, env, availableEndpoints)
//   - Route: GET /release-notes  (registered in worker.js ROUTES)
//
// Extending
//   - Add a release:  prepend one entry to RELEASES below.
//   - Add a group:    push one object into release.groups.
//   - Add a language:  add one entry to RN_I18N and fill every group.
// ==========================================

import { CONFIG } from '../config.js'
import { getPageHead } from '../shared-styles.js'
import { createHtmlResponse } from '../utils.js'

const DEFAULT_LANG = 'fa'
const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

// ==========================================
// i18n - release notes chrome strings (fa / en / ja)
// ==========================================
const RN_I18N = {
  fa: {
    locale: 'fa-IR',
    title: 'یادداشت‌های انتشار',
    subtitle: 'تاریخچه‌ی تغییرات و نسخه‌های AmirCollider',
    langName: 'فارسی',
    themeToLight: 'حالت روشن',
    themeToDark: 'حالت تاریک',
    latest: 'جدیدترین',
    back: 'بازگشت به خانه',
    footerTagline: 'سامانه پروکسی OAuth برای بازی‌های AmirCollider.',
    footerPowered: 'اجرا شده روی Cloudflare Workers'
  },
  en: {
    locale: 'en-US',
    title: 'Release notes',
    subtitle: 'Change history and versions of AmirCollider',
    langName: 'English',
    themeToLight: 'Light mode',
    themeToDark: 'Dark mode',
    latest: 'Latest',
    back: 'Back to home',
    footerTagline: 'OAuth proxy for AmirCollider games.',
    footerPowered: 'Powered by Cloudflare Workers'
  },
  ja: {
    locale: 'ja-JP',
    title: 'リリースノート',
    subtitle: 'AmirCollider の変更履歴とバージョン',
    langName: '日本語',
    themeToLight: 'ライトモード',
    themeToDark: 'ダークモード',
    latest: '最新',
    back: 'ホームに戻る',
    footerTagline: 'AmirCollider ゲーム向けの OAuth プロキシ。',
    footerPowered: 'Cloudflare Workers で稼働'
  }
}

// ==========================================
// Release timeline (newest first)
// Each release has a localized summary and grouped change items.
// tag: 'latest' highlights the current version.
// ==========================================
const RELEASES = [
  {
    version: '6.7',
    date: '2026-06-24',
    tag: 'latest',
    summary: {
      fa: 'بازسازی کامل سایت: سیستم طراحی جدید، پشتیبانی سه‌زبانه، تم روشن/تاریک/خودکار، میزبانی فایل‌ها روی R2 و انتقال دامنه.',
      en: 'A full site rebuild: a new design system, trilingual support, light/dark/auto theming, R2-hosted assets and a domain migration.',
      ja: 'サイトの全面刷新：新しいデザインシステム、3言語対応、ライト/ダーク/自動テーマ、R2 によるアセット配信、ドメイン移行。'
    },
    groups: [
      {
        title: { fa: 'طراحی و رابط کاربری', en: 'Design & UI', ja: 'デザイン & UI' },
        items: {
          fa: [
            'بازطراحی کامل تمام صفحات (داشبورد، سلامت، پینگ، متریک‌ها، جدول امتیازات، حریم خصوصی، شرایط استفاده و پنل تست) با یک سیستم طراحی یکپارچه.',
            'جایگزینی ظاهر قدیمی شیشه‌ای/گرادیانی با سیستم مبتنی بر توکن‌های رنگ و فاصله.',
            'افزودن فونت Vazirmatn و مجموعه آیکون‌های SVG به‌جای ایموجی‌ها.',
            'ساختار CSS ماژولار (توکن‌ها، پایه، چیدمان، تایپوگرافی، کامپوننت‌ها، انیمیشن‌ها، واکنش‌گرایی).',
            'حذف بخش «ویژگی‌های کلیدی» از داشبورد برای ظاهری تمیزتر و حرفه‌ای‌تر.'
          ],
          en: [
            'Complete redesign of every page (dashboard, health, ping, metrics, leaderboard, privacy, terms and the test panel) under one unified design system.',
            'Replaced the old glass/gradient look with a color- and spacing-token based system.',
            'Added the Vazirmatn font and an SVG icon set in place of emojis.',
            'Modular CSS structure (tokens, base, layout, typography, components, animations, responsive).',
            'Removed the “Key features” section from the dashboard for a cleaner, more professional look.'
          ],
          ja: [
            '全ページ（ダッシュボード、ヘルス、Ping、メトリクス、リーダーボード、プライバシー、利用規約、テストパネル）を統一デザインシステムで再設計。',
            '旧来のガラス/グラデーション表現を、カラー・スペーシングのトークン方式に置き換え。',
            'Vazirmatn フォントと SVG アイコンセットを採用し、絵文字を廃止。',
            'モジュール化された CSS 構成（トークン、ベース、レイアウト、タイポグラフィ、コンポーネント、アニメーション、レスポンシブ）。',
            'ダッシュボードから「主な特徴」セクションを削除し、より洗練された見た目に。'
          ]
        }
      },
      {
        title: { fa: 'پشتیبانی چندزبانه', en: 'Multilingual support', ja: '多言語対応' },
        items: {
          fa: [
            'افزودن زبان‌های انگلیسی و ژاپنی در کنار فارسی در همه‌ی صفحات.',
            'چیدمان درست راست‌چین/چپ‌چین (RTL/LTR) بر اساس زبان انتخابی.',
            'سوییچ زبان با ماندگاری انتخاب از طریق کوکی و localStorage.',
            'تشخیص خودکار زبان: پارامتر آدرس ← کوکی ← هدر مرورگر ← پیش‌فرض.',
            'محلی‌سازی اعداد و تاریخ‌ها با Intl.'
          ],
          en: [
            'Added English and Japanese alongside Persian across every page.',
            'Correct RTL/LTR layout driven by the selected language.',
            'Language switcher whose choice persists via cookie and localStorage.',
            'Automatic language resolution: URL query → cookie → browser header → default.',
            'Localized numbers and dates via Intl.'
          ],
          ja: [
            '全ページでペルシャ語に加え英語・日本語を追加。',
            '選択言語に応じた正しい RTL/LTR レイアウト。',
            'Cookie と localStorage に選択を保存する言語スイッチャー。',
            '言語の自動判定：URL クエリ → Cookie → ブラウザヘッダー → 既定値。',
            'Intl による数値・日付のローカライズ。'
          ]
        }
      },
      {
        title: { fa: 'تم و حالت نمایش', en: 'Theming', ja: 'テーマ' },
        items: {
          fa: [
            'افزودن حالت‌های روشن، تاریک و خودکار (پیروی از سیستم‌عامل).',
            'دکمه‌ی تغییر دستی تم با ماندگاری انتخاب (localStorage + کوکی).',
            'اعمال تم پیش از اولین رنگ‌آمیزی صفحه برای جلوگیری از پرش لحظه‌ای.',
            'انیمیشن نرم هنگام جابه‌جایی بین روشن و تاریک با View Transitions API و احترام به prefers-reduced-motion.'
          ],
          en: [
            'Added light, dark and auto modes (auto follows the OS).',
            'A manual theme toggle that remembers your choice (localStorage + cookie).',
            'Theme applied before first paint to avoid a flash on load.',
            'Smooth animated light↔dark switch via the View Transitions API, honoring prefers-reduced-motion.'
          ],
          ja: [
            'ライト・ダーク・自動モードを追加（自動は OS に追従）。',
            '選択を記憶する手動テーマ切り替え（localStorage + Cookie）。',
            '初回描画前にテーマを適用し、読み込み時のちらつきを防止。',
            'View Transitions API によるスムーズなライト↔ダーク切り替え。prefers-reduced-motion を尊重。'
          ]
        }
      },
      {
        title: { fa: 'زیرساخت', en: 'Infrastructure', ja: 'インフラ' },
        items: {
          fa: [
            'میزبانی فایل‌های استاتیک (لوگوها و دارایی‌ها) روی فضای ذخیره‌سازی داخلی Cloudflare R2 از مسیر /assets به‌جای لینک‌های خارجی Google Drive؛ سریع‌تر، پایدارتر و بدون وابستگی به سرویس ثالث.',
            'انتقال دامنه از https://firebase-proxy.n95pluss.workers.dev/ به https://amircollider.n95pluss.workers.dev/.'
          ],
          en: [
            'Static files (logos and assets) are now served from internal Cloudflare R2 storage under /assets instead of external Google Drive links — faster, more reliable and free of third-party dependencies.',
            'Domain migrated from https://firebase-proxy.n95pluss.workers.dev/ to https://amircollider.n95pluss.workers.dev/.'
          ],
          ja: [
            '静的ファイル（ロゴ・アセット）を、外部の Google Drive リンクではなく Cloudflare R2 の内部ストレージから /assets 経由で配信。高速・安定し、サードパーティ依存を排除。',
            'ドメインを https://firebase-proxy.n95pluss.workers.dev/ から https://amircollider.n95pluss.workers.dev/ へ移行。'
          ]
        }
      },
      {
        title: { fa: 'امنیت و پایداری', en: 'Security & reliability', ja: 'セキュリティ & 信頼性' },
        items: {
          fa: [
            'پاسخ‌های خطا دیگر پیام داخلی یا stack trace را لو نمی‌دهند؛ تنها یک کد خطای پایدار و عمومی بازگردانده می‌شود.',
            'صفحه‌ی خطای محلی‌شده و تم‌آگاه (fa/en/ja) جایگزین صفحه‌ی تنها-فارسی شد.',
            'فریز عمیق (deep-freeze) درخت پیکربندی برای جلوگیری از تغییر در زمان اجرا.',
            'حذف هدر منسوخ X-XSS-Protection.'
          ],
          en: [
            'Error responses no longer leak internal messages or stack traces; only a stable, generic error code is returned.',
            'A localized, theme-aware error page (fa/en/ja) replaces the Persian-only one.',
            'The configuration tree is deep-frozen to prevent runtime mutation.',
            'Removed the deprecated X-XSS-Protection header.'
          ],
          ja: [
            'エラー応答が内部メッセージやスタックトレースを漏らさないよう変更。安定した汎用エラーコードのみを返却。',
            'ペルシャ語のみのエラーページを、ローカライズ済みでテーマ対応（fa/en/ja）のページに置換。',
            '設定ツリーをディープフリーズし、実行時の変更を防止。',
            '非推奨の X-XSS-Protection ヘッダーを削除。'
          ]
        }
      },
      {
        title: { fa: 'پاک‌سازی و ساده‌سازی', en: 'Cleanup & simplification', ja: 'クリーンアップ & 簡素化' },
        items: {
          fa: [
            'حذف محدودیت نرخ درخواست درون‌حافظه‌ای per-IP (ثابت‌های rate limit و تابع isRateLimited).',
            'حذف ثابت‌های بلااستفاده‌ی retry و حجم درخواست (MAX_RETRIES، RETRY_DELAY_MS، MAX_REQUEST_SIZE).',
            'تبدیل validateGameId به تابع خالص بدون خروجی لاگ.',
            'حذف وابستگی آواتارهای جدول امتیازات به via.placeholder.com.'
          ],
          en: [
            'Removed in-memory per-IP rate limiting (the rate-limit constants and the isRateLimited function).',
            'Removed unused retry and request-size constants (MAX_RETRIES, RETRY_DELAY_MS, MAX_REQUEST_SIZE).',
            'validateGameId is now a pure function with no console output.',
            'Leaderboard avatars no longer depend on via.placeholder.com.'
          ],
          ja: [
            'メモリ内の IP 単位レート制限（rate-limit 定数と isRateLimited 関数）を削除。',
            '未使用のリトライ・リクエストサイズ定数（MAX_RETRIES、RETRY_DELAY_MS、MAX_REQUEST_SIZE）を削除。',
            'validateGameId をログ出力のない純粋関数に変更。',
            'リーダーボードのアバターが via.placeholder.com に依存しないよう変更。'
          ]
        }
      },
      {
        title: { fa: 'دسترس‌پذیری', en: 'Accessibility', ja: 'アクセシビリティ' },
        items: {
          fa: [
            'رعایت prefers-reduced-motion در همه‌ی صفحات.',
            'افزودن خطوط فوکوس (focus-visible) و برچسب‌ها و نقش‌های ARIA به کنترل‌ها.'
          ],
          en: [
            'prefers-reduced-motion is honored across all pages.',
            'Added focus-visible outlines and ARIA labels/roles to controls.'
          ],
          ja: [
            '全ページで prefers-reduced-motion を尊重。',
            'コントロールに focus-visible のアウトラインと ARIA ラベル/ロールを追加。'
          ]
        }
      },
      {
        title: { fa: 'صفحه‌ها و نسخه‌گذاری', en: 'Pages & versioning', ja: 'ページ & バージョン' },
        items: {
          fa: [
            'افزودن همین صفحه‌ی «یادداشت‌های انتشار» به همراه لینک در داشبورد.',
            'تغییر شماره‌ی نسخه از 6.7.3 به 6.7 برای نشان‌دادن بازسازی کامل.'
          ],
          en: [
            'Added this Release notes page, plus a link to it on the dashboard.',
            'Version number changed from 6.7.3 to 6.7 to mark the full rebuild.'
          ],
          ja: [
            'このリリースノートページを追加し、ダッシュボードにリンクを設置。',
            '全面刷新を示すため、バージョン番号を 6.7.3 から 6.7 に変更。'
          ]
        }
      }
    ]
  }
]

// ==========================================
// i18n helpers
// ==========================================
function resolveLang(lang) {
  return RN_I18N[lang] ? lang : DEFAULT_LANG
}

function pack(lang) {
  return RN_I18N[resolveLang(lang)]
}

function dirFor(lang) {
  return resolveLang(lang) === 'fa' ? 'rtl' : 'ltr'
}

function pick(map, lang) {
  if (!map) return ''
  return map[resolveLang(lang)] != null ? map[resolveLang(lang)] : (map[DEFAULT_LANG] || '')
}

// ==========================================
// Request helpers (language & theme resolution)
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
    if (RN_I18N[code]) return code
  }
  return null
}

function resolveRequestLang(url, request, cookies) {
  const fromQuery = url && url.searchParams ? url.searchParams.get('lang') : null
  if (fromQuery && RN_I18N[fromQuery]) return fromQuery
  if (cookies.lang && RN_I18N[cookies.lang]) return cookies.lang
  return langFromAcceptHeader(request) || DEFAULT_LANG
}

function resolveRequestTheme(cookies) {
  return cookies.theme === 'light' || cookies.theme === 'dark' ? cookies.theme : null
}

// ==========================================
// Output-safety helper
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
// SVG icon set (stroke uses currentColor)
// ==========================================
const ICONS = {
  contrast: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor" stroke="none"/>',
  home: '<path d="M3 9.5 12 3l9 6.5"/><path d="M5 10v10h14V10"/>'
}

function icon(name, cls) {
  return '<svg class="' + (cls || 'd-ic') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
    + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + (ICONS[name] || '') + '</svg>'
}

// ==========================================
// Stylesheet
// Theme via tokens; RTL/LTR via logical properties;
// theme switch animated via the View Transitions API.
// ==========================================
function getReleaseNotesCSS() {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --brand: #6c63ff;
      --brand-2: #a78bfa;
      --ok: #4caf50;
      --radius: 18px;
      --maxw: 920px;

      --bg-1: #0b0e16;
      --bg-2: #141a2e;
      --surface: rgba(255,255,255,0.045);
      --surface-2: rgba(255,255,255,0.08);
      --border: rgba(255,255,255,0.10);
      --text: rgba(255,255,255,0.92);
      --text-dim: rgba(255,255,255,0.58);
      color-scheme: dark;
    }

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
      background:
        radial-gradient(1100px 520px at 78% -8%, color-mix(in srgb, var(--brand) 22%, transparent), transparent 60%),
        radial-gradient(900px 480px at 8% 6%, color-mix(in srgb, var(--brand-2) 16%, transparent), transparent 60%),
        linear-gradient(160deg, var(--bg-1), var(--bg-2));
      background-attachment: fixed;
    }

    .wrap { max-width: var(--maxw); margin: 0 auto; }

    /* ---------- top bar ---------- */
    .topbar {
      display: flex; align-items: center; justify-content: space-between;
      gap: 16px; flex-wrap: wrap; margin-block-end: 28px;
    }
    .brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
    .brand-logo {
      width: 52px; height: 52px; border-radius: 15px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      background: var(--surface-2); border: 1px solid var(--border);
      overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,0.18);
    }
    .brand-logo img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .brand-name { font-weight: 800; font-size: 1.05em; letter-spacing: 0.2px; line-height: 1.2; }
    .brand-sub  { font-size: 0.8em; color: var(--text-dim); }

    .controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .seg {
      display: inline-flex; padding: 3px; gap: 2px; border-radius: 12px;
      background: var(--surface); border: 1px solid var(--border);
    }
    .seg button {
      border: 0; cursor: pointer; padding: 7px 12px; border-radius: 9px;
      font: inherit; font-size: 0.82em; font-weight: 600;
      color: var(--text-dim); background: transparent;
      transition: color 0.18s ease, background 0.18s ease;
    }
    .seg button:hover { color: var(--text); }
    .seg button[aria-pressed="true"] {
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
    .d-ic { width: 18px; height: 18px; }
    .seg button:focus-visible,
    .icon-btn:focus-visible,
    .back-link:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }

    /* ---------- hero ---------- */
    .hero { text-align: center; margin: 18px 0 34px; }
    .hero h1 {
      font-size: clamp(2em, 5vw, 3em); font-weight: 800; letter-spacing: 0.3px;
      background: linear-gradient(135deg, var(--text), color-mix(in srgb, var(--brand) 55%, var(--text)));
      -webkit-background-clip: text; background-clip: text; color: transparent;
    }
    .hero p { margin-block-start: 8px; color: var(--text-dim); font-size: 1.02em; }

    /* ---------- releases ---------- */
    .releases { display: flex; flex-direction: column; gap: 20px; margin-block-end: 40px; }
    .release {
      padding: 24px 26px; border-radius: var(--radius);
      background: var(--surface); border: 1px solid var(--border);
    }
    .release-head {
      display: flex; align-items: center; flex-wrap: wrap; gap: 10px;
      margin-block-end: 12px;
    }
    .release-ver {
      font-weight: 800; font-size: 1.3em;
      color: color-mix(in srgb, var(--brand) 45%, var(--text));
    }
    .release-date { color: var(--text-dim); font-size: 0.86em; }
    .release-tag {
      margin-inline-start: auto; padding: 4px 12px; border-radius: 20px;
      font-size: 0.74em; font-weight: 700; color: #fff;
      background: linear-gradient(135deg, var(--brand), var(--brand-2));
    }
    .release-summary {
      color: var(--text-dim); font-size: 0.96em; line-height: 1.7;
      margin-block-end: 18px;
      padding-block-end: 16px; border-block-end: 1px solid var(--border);
    }

    .group { margin-block-start: 18px; }
    .group:first-of-type { margin-block-start: 0; }
    .group-title {
      display: flex; align-items: center; gap: 10px;
      font-weight: 700; font-size: 1.02em; margin-block-end: 10px;
      color: var(--text);
    }
    .group-title::before {
      content: ''; width: 8px; height: 8px; border-radius: 3px; flex-shrink: 0;
      background: linear-gradient(135deg, var(--brand), var(--brand-2));
    }
    .group ul { list-style: none; display: flex; flex-direction: column; gap: 8px; }
    .group li {
      position: relative; padding-inline-start: 20px;
      color: var(--text); font-size: 0.93em; line-height: 1.65;
    }
    .group li::before {
      content: ''; position: absolute; inset-inline-start: 3px; top: 0.62em;
      width: 6px; height: 6px; border-radius: 50%;
      background: color-mix(in srgb, var(--brand) 60%, var(--text-dim));
    }

    /* ---------- back link ---------- */
    .nav { display: flex; justify-content: center; margin-block-end: 38px; }
    .back-link {
      display: inline-flex; align-items: center; gap: 9px;
      padding: 11px 20px; border-radius: 13px; text-decoration: none;
      font-weight: 600; font-size: 0.9em; color: #fff;
      background: linear-gradient(135deg, var(--brand), var(--brand-2));
      box-shadow: 0 8px 22px color-mix(in srgb, var(--brand) 34%, transparent);
      transition: transform 0.18s ease;
    }
    .back-link:hover { transform: translateY(-2px); }
    .back-link svg { width: 18px; height: 18px; }

    /* ---------- footer ---------- */
    footer {
      text-align: center; padding: 28px; border-radius: var(--radius);
      background: var(--surface); border: 1px solid var(--border); color: var(--text-dim);
    }
    footer .f-name { color: var(--text); font-weight: 800; font-size: 1.05em; }
    footer .f-meta { margin-block-start: 6px; font-size: 0.85em; }
    footer .f-meta b { color: color-mix(in srgb, var(--brand) 45%, var(--text)); }

    /* ---------- smooth theme transition (light <-> dark) ---------- */
    @media (prefers-reduced-motion: no-preference) {
      body, .seg, .icon-btn, .release, .back-link, footer {
        transition:
          background-color 0.35s ease,
          color 0.35s ease,
          border-color 0.35s ease,
          box-shadow 0.35s ease;
      }
      ::view-transition-old(root),
      ::view-transition-new(root) {
        animation-duration: 0.4s;
        animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
      }
      .topbar, .hero, .release, footer { animation: rnRise 0.5s cubic-bezier(0.16,1,0.3,1) both; }
      .hero { animation-delay: 0.05s; }
    }
    @keyframes rnRise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }

    @media (max-width: 480px) {
      .seg button { padding: 6px 9px; }
      .release-tag { margin-inline-start: 0; }
      .release { padding: 20px 18px; }
    }
  `
}

// ==========================================
// Pre-paint theme bootstrap
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
// Partial: Topbar (brand + language pills + theme toggle)
// ==========================================
function renderTopbar(lang, amirLogo) {
  const p = pack(lang)
  const cur = resolveLang(lang)
  const langs = [['fa', RN_I18N.fa.langName], ['en', RN_I18N.en.langName], ['ja', RN_I18N.ja.langName]]

  const segButtons = langs.map(([code, label]) =>
    '<button type="button" data-lang="' + code + '" aria-pressed="' + (code === cur ? 'true' : 'false') + '"'
    + ' onclick="acSetLang(\'' + code + '\')" lang="' + code + '">' + escapeHtml(label) + '</button>'
  ).join('')

  return `
    <div class="topbar">
      <div class="brand">
        <span class="brand-logo">
          <img src="${escapeHtml(amirLogo)}" alt="AmirCollider" onerror="this.style.display='none'">
        </span>
        <span>
          <span class="brand-name">AmirCollider</span><br>
          <span class="brand-sub">${escapeHtml(p.subtitle)}</span>
        </span>
      </div>
      <div class="controls">
        <div class="seg" role="group" aria-label="${escapeHtml(p.langName)}">${segButtons}</div>
        <button type="button" id="themeBtn" class="icon-btn" onclick="acToggleTheme()"
                aria-label="${escapeHtml(p.themeToDark)}">${icon('contrast')}</button>
      </div>
    </div>`
}

// ==========================================
// Partial: Hero
// ==========================================
function renderHero(lang) {
  const p = pack(lang)
  return `
    <div class="hero">
      <h1>${escapeHtml(p.title)}</h1>
      <p>${escapeHtml(p.subtitle)}</p>
    </div>`
}

// ==========================================
// Partial: Release timeline (grouped changelog)
// ==========================================
function renderReleases(lang) {
  const p = pack(lang)
  const cards = RELEASES.map(rel => {
    const tag = rel.tag === 'latest'
      ? '<span class="release-tag">' + escapeHtml(p.latest) + '</span>'
      : ''

    const summary = rel.summary
      ? '<p class="release-summary">' + escapeHtml(pick(rel.summary, lang)) + '</p>'
      : ''

    const groups = (rel.groups || []).map(group => {
      const items = (pick(group.items, lang) || [])
        .map(n => '<li>' + escapeHtml(n) + '</li>').join('')
      return `
        <div class="group">
          <div class="group-title">${escapeHtml(pick(group.title, lang))}</div>
          <ul>${items}</ul>
        </div>`
    }).join('')

    return `
      <article class="release">
        <div class="release-head">
          <span class="release-ver">v${escapeHtml(rel.version)}</span>
          <span class="release-date">${escapeHtml(rel.date)}</span>
          ${tag}
        </div>
        ${summary}
        ${groups}
      </article>`
  }).join('')

  return `<div class="releases">${cards}</div>`
}

// ==========================================
// Partial: Back-to-home navigation
// ==========================================
function renderNav(lang) {
  const p = pack(lang)
  return `
    <div class="nav">
      <a class="back-link" href="/">${icon('home')}<span>${escapeHtml(p.back)}</span></a>
    </div>`
}

// ==========================================
// Partial: Footer
// ==========================================
function renderFooter(lang, version) {
  const p = pack(lang)
  return `
    <footer>
      <div class="f-name">AmirCollider Games</div>
      <div class="f-meta">${escapeHtml(p.footerTagline)}</div>
      <div class="f-meta">${escapeHtml(p.footerPowered)} &middot; <b>v${escapeHtml(version)}</b></div>
    </footer>`
}

// ==========================================
// Client runtime (theme toggle + language switch)
// Theme switch is animated via the View Transitions API.
// ==========================================
function getClientScript() {
  return `<script>
    (function () {
      function acById(id) { return document.getElementById(id); }

      function acApplyThemeLabel() {
        var btn = acById('themeBtn');
        if (!btn) return;
        var dark = getComputedStyle(document.documentElement).colorScheme.indexOf('dark') !== -1;
        btn.setAttribute('aria-label', dark ? 'Light mode' : 'Dark mode');
      }

      function acToggleTheme() {
        var dark = getComputedStyle(document.documentElement).colorScheme.indexOf('dark') !== -1;
        var next = dark ? 'light' : 'dark';
        var commit = function () {
          document.documentElement.setAttribute('data-theme', next);
          acApplyThemeLabel();
        };
        var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (document.startViewTransition && !reduce) {
          document.startViewTransition(commit);
        } else {
          commit();
        }
        try { localStorage.setItem('ac_theme', next); } catch (e) {}
        document.cookie = 'theme=' + next + ';path=/;max-age=31536000;samesite=lax';
      }
      window.acToggleTheme = acToggleTheme;

      function acSetLang(code) {
        try { localStorage.setItem('ac_lang', code); } catch (e) {}
        document.cookie = 'lang=' + code + ';path=/;max-age=31536000;samesite=lax';
        var u = new URL(window.location.href);
        u.searchParams.set('lang', code);
        window.location.href = u.toString();
      }
      window.acSetLang = acSetLang;

      acApplyThemeLabel();
    })();
  </script>`
}

// ==========================================
// Page: Release Notes
// ==========================================
function createReleaseNotesPage(lang, theme) {
  const amirLogo = CONFIG.AMIR_LOGO
  const resolved = resolveLang(lang)
  const dir = dirFor(resolved)
  const themeAttr = theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : ''

  return `<!DOCTYPE html>
<html dir="${dir}" lang="${resolved}"${themeAttr}>
<head>
  ${getPageHead({ title: `${pack(resolved).title} - v${CONFIG.VERSION}`, amirLogo })}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  ${getThemeBootScript()}
  <style>${getReleaseNotesCSS()}</style>
</head>
<body>
  <div class="wrap">
    ${renderTopbar(resolved, amirLogo)}
    ${renderHero(resolved)}
    ${renderReleases(resolved)}
    ${renderNav(resolved)}
    ${renderFooter(resolved, CONFIG.VERSION)}
  </div>
  ${getClientScript()}
</body>
</html>`
}

// ==========================================
// Handler: Release Notes
// ==========================================
export async function handleReleaseNotes(url, request, gameId, requestId, GAMES, _env, availableEndpoints = []) {
  const cookies = parseCookies(request)
  const lang = resolveRequestLang(url, request, cookies)
  const theme = resolveRequestTheme(cookies)

  const headers = {}
  const requestedLang = url && url.searchParams ? url.searchParams.get('lang') : null
  if (requestedLang && RN_I18N[requestedLang]) {
    headers['Set-Cookie'] = `lang=${requestedLang}; Path=/; Max-Age=${LANG_COOKIE_MAX_AGE}; SameSite=Lax`
  }

  return createHtmlResponse(createReleaseNotesPage(lang, theme), 200, headers)
}
