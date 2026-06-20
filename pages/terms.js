// ==========================================
// pages/terms.js
// Terms of Service Page Handler
// AmirCollider Games - Worker Proxy
// ==========================================

import { CONFIG } from '../config.js'
import { getSharedCSS, getLogosHTML, getPageHead } from '../shared-styles.js'
import { validateGameId, createHtmlResponse, createErrorPage } from '../utils.js'

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

  return createHtmlResponse(createTermsPage(game, gameId, url.origin))
}

// ─── Gregorian → Jalali converter (no Intl locale needed) ───────────────────
// Works reliably in Cloudflare Workers V8 runtime.
function getJalaliDate() {
  const d  = new Date()
  const gy = d.getFullYear()
  const gm = d.getMonth() + 1
  const gd = d.getDate()

  const gy2  = gy - 1600
  const gm2  = gm - 1
  const gd2  = gd - 1
  const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

  let gDayNo = 365 * gy2
    + Math.floor((gy2 + 3) / 4)
    - Math.floor((gy2 + 99) / 100)
    + Math.floor((gy2 + 399) / 400)

  const gDays = [31, isLeap(gy) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  for (let i = 0; i < gm2; i++) gDayNo += gDays[i]
  gDayNo += gd2

  let jDayNo = gDayNo - 79
  const jNp  = Math.floor(jDayNo / 12053)
  jDayNo    %= 12053

  let jy = 979 + 33 * jNp + 4 * Math.floor(jDayNo / 1461)
  jDayNo %= 1461

  if (jDayNo >= 366) {
    jy    += Math.floor((jDayNo - 1) / 365)
    jDayNo = (jDayNo - 1) % 365
  }

  const jDays = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29]
  let jm = 0
  for (; jm < 11 && jDayNo >= jDays[jm]; jm++) jDayNo -= jDays[jm]
  const jd = jDayNo + 1

  const months  = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور',
                   'مهر','آبان','آذر','دی','بهمن','اسفند']
  const toFa    = (n) => String(n).replace(/\d/g, (x) => '۰۱۲۳۴۵۶۷۸۹'[x])

  return `${toFa(jd)} ${months[jm]} ${toFa(jy)}`
}

// ─── Page-specific CSS only ──────────────────────────────────────────────────
// shared-styles.js already covers: body, .container, h1, h2, p, li, ul,
// .highlight-box, .warning-box (orange), .info-box, .contact-info,
// .btn*, .version-badge, .last-update, @keyframes fadeIn
// ─────────────────────────────────────────────────────────────────────────────
function getTermsCSS() {
  return `
    /* ══════════════════════════════════════════════════════
       READABILITY FIX
       The shared h2 uses accentColor (green) which is
       unreadable on warm/orange themes. Override globally
       to white — works on ANY game color.
       ══════════════════════════════════════════════════════ */
    h2 {
      color: rgba(255, 255, 255, 0.97) !important;
      border-color: rgba(255, 255, 255, 0.55) !important;
      text-shadow: 0 1px 6px rgba(0, 0, 0, 0.45);
    }
    h1 { text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5); }

    /* Force readable text inside every themed box */
    .warning-box, .info-box, .highlight-box,
    .contact-info, .game-info, p, li {
      color: rgba(255, 255, 255, 0.95);
    }

    /* Red warning-box (override shared orange) */
    .warning-box {
      background: rgba(210, 30, 20, 0.26) !important;
      border-color: rgba(255, 90, 80, 0.85) !important;
    }

    /* Links: warm gold — visible on any gradient */
    a       { color: #ffe082; }
    a:hover { color: #ffffff; text-decoration: underline; }

    /* Bullets: white, adapts RTL ↔ LTR */
    li::before {
      content: "•";
      position: absolute;
      right: -25px;
      left: unset;
      color: rgba(255, 255, 255, 0.75);
      font-weight: bold;
      font-size: 1.5em;
    }

    /* ══════════════════════════════════════════════════════
       BILINGUAL — show/hide by html[lang]
       ══════════════════════════════════════════════════════ */
    [data-lang-fa], [data-lang-en] { display: none !important; }
    html[lang="fa"] [data-lang-fa]  { display: revert !important; }
    html[lang="en"] [data-lang-en]  { display: revert !important; }

    /* ══════════════════════════════════════════════════════
       LTR OVERRIDES (English mode)
       All directional properties flipped here — zero JS needed
       ══════════════════════════════════════════════════════ */
    html[lang="en"] h2 {
      border-right: none !important;
      border-left: 5px solid rgba(255, 255, 255, 0.55) !important;
      padding-right: 0   !important;
      padding-left: 15px !important;
    }
    html[lang="en"] ul         { padding-right: 0;    padding-left: 30px; }
    html[lang="en"] li::before { right: unset; left: -25px; }
    html[lang="en"] .info-card { border-right: none; border-left: 4px solid; }
    /* Logo row: reverse order in LTR so game logo stays on left */
    html[lang="en"] .header-logos { flex-direction: row; }

    /* ══════════════════════════════════════════════════════
       GAME INFO BANNER
       ══════════════════════════════════════════════════════ */
    .game-info {
      text-align: center;
      font-size: 1.2em;
      margin-bottom: 30px;
      padding: 15px;
      background: rgba(0, 0, 0, 0.28);
      border-radius: 15px;
      border: 2px solid rgba(255, 255, 255, 0.22);
    }
    .game-icon {
      font-size: 2em;
      margin: 0 10px;
      display: inline-block;
      animation: gameBounce 2s ease-in-out infinite;
    }
    @keyframes gameBounce {
      0%, 100% { transform: translateY(0); }
      50%       { transform: translateY(-7px); }
    }
    .section-icon { font-size: 1.2em; }

    /* ══════════════════════════════════════════════════════
       LANGUAGE TOGGLE BUTTON
       Fixed bottom-left, floating animation, flag emoji
       ══════════════════════════════════════════════════════ */
    .lang-toggle-btn {
      position: fixed;
      bottom: 28px;
      left: 28px;
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 9px;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border: 2px solid rgba(255, 255, 255, 0.28);
      color: #fff;
      border-radius: 50px;
      padding: 11px 22px;
      font-size: 1em;
      font-weight: bold;
      cursor: pointer;
      user-select: none;
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
      animation: langFloat 3.5s ease-in-out infinite;
      transition: background 0.2s, box-shadow 0.2s;
    }
    .lang-toggle-btn:hover {
      background: rgba(0, 0, 0, 0.7);
      animation: none;
      transform: translateY(-4px) scale(1.04);
      box-shadow: 0 12px 34px rgba(0, 0, 0, 0.55);
    }
    .lang-toggle-btn:active { transform: scale(0.96); animation: none; }

    @keyframes langFloat {
      0%, 100% { transform: translateY(0);   box-shadow: 0 6px 24px rgba(0,0,0,0.45); }
      50%       { transform: translateY(-6px); box-shadow: 0 14px 36px rgba(0,0,0,0.55); }
    }

    .lang-flag {
      font-size: 1.45em;
      line-height: 1;
      transition: transform 0.3s ease;
    }
    .lang-toggle-btn:hover .lang-flag {
      transform: rotate(-10deg) scale(1.2);
    }
    .lang-label { letter-spacing: 0.3px; }
  `
}

// ─── Page template ────────────────────────────────────────────────────────────
function createTermsPage(game, gameId, baseUrl) {
  const amirLogo = CONFIG.AMIR_LOGO
  const gameLogo = game.logo || CONFIG.DEFAULT_GAME_LOGO
  const todayFA  = getJalaliDate()
  const todayEN  = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  })

  return `<!DOCTYPE html>
<html dir="rtl" lang="fa" id="root-html">
<head>
  ${getPageHead({ title: `شرایط و قوانین استفاده - ${game.name}`, amirLogo })}
  <style>
    ${getSharedCSS(game.color)}
    ${getTermsCSS()}
  </style>
</head>
<body>

  <!-- ── Language toggle: bottom-left, floating, flag emoji ── -->
  <button class="lang-toggle-btn" onclick="toggleLang()" id="lang-btn" aria-label="Toggle Language">
    <span class="lang-flag" id="lang-flag">🇬🇧</span>
    <span class="lang-label" id="lang-label">English</span>
  </button>

  <div class="container">
    ${getLogosHTML(amirLogo, gameLogo, game.name)}

    <!-- PAGE TITLE -->
    <h1>
      <span data-lang-fa>شرایط و قوانین استفاده</span>
      <span data-lang-en>Terms of Service</span>
    </h1>

    <div class="game-info">
      <span class="game-icon">${game.icon}</span>
      <strong>${game.name}</strong>
      <span class="game-icon">${game.icon}</span>
    </div>

    <!-- ═══════════════ 1. ACCEPTANCE ═══════════════ -->
    <h2><span class="section-icon">📜</span>
      <span data-lang-fa>پذیرش شرایط</span>
      <span data-lang-en>Acceptance of Terms</span>
    </h2>
    <div class="highlight-box">
      <p style="margin:0;">
        <span data-lang-fa>
          با استفاده از بازی و سرویس‌های ما، شما موافقت می‌کنید که تمام شرایط و قوانین زیر را بپذیرید.
          اگر با این شرایط موافق نیستید، لطفاً از سرویس استفاده نکنید.
        </span>
        <span data-lang-en>
          By using our game and services, you agree to all terms listed below.
          If you do not agree, please refrain from using the service.
        </span>
      </p>
    </div>

    <!-- ═══════════════ 2. LICENSE ═══════════════ -->
    <h2><span class="section-icon">✅</span>
      <span data-lang-fa>مجوز استفاده</span>
      <span data-lang-en>License of Use</span>
    </h2>
    <p>
      <span data-lang-fa>ما به شما مجوز محدود، غیرانحصاری و قابل لغو برای استفاده شخصی و غیرتجاری از بازی می‌دهیم. این مجوز شامل موارد زیر می‌شود:</span>
      <span data-lang-en>We grant you a limited, non-exclusive, revocable license for personal non-commercial use. This includes:</span>
    </p>
    <ul>
      <!-- Ordered by length (FA) -->
      <li>
        <span data-lang-fa>مشارکت در جداول امتیازات</span>
        <span data-lang-en>Participating in leaderboards</span>
      </li>
      <li>
        <span data-lang-fa>ذخیره پیشرفت و امتیازات خود</span>
        <span data-lang-en>Saving your progress and scores</span>
      </li>
      <li>
        <span data-lang-fa>بازی کردن و استفاده از تمامی امکانات قانونی</span>
        <span data-lang-en>Playing the game and using all legitimate features</span>
      </li>
      <li>
        <span data-lang-fa>دانلود و نصب بازی بر روی دستگاه‌های شخصی</span>
        <span data-lang-en>Downloading and installing the game on personal devices</span>
      </li>
    </ul>

    <!-- ═══════════════ 3. PROHIBITED BEHAVIORS ═══════════════ -->
    <h2><span class="section-icon">🚫</span>
      <span data-lang-fa>رفتارهای ممنوع</span>
      <span data-lang-en>Prohibited Behaviors</span>
    </h2>
    <div class="warning-box">
      <p><strong>
        <span data-lang-fa>⚠️ هشدار: هنگام استفاده از سرویس، نباید:</span>
        <span data-lang-en>⚠️ Warning: When using the service, you must not:</span>
      </strong></p>
      <ul>
        <li>
          <strong><span data-lang-fa>ایجاد حساب جعلی: </span><span data-lang-en>Fake accounts: </span></strong>
          <span data-lang-fa>ایجاد چندین حساب برای سوء‌استفاده</span>
          <span data-lang-en>Creating multiple accounts to abuse the system</span>
        </li>
        <li>
          <strong><span data-lang-fa>حمله سایبری: </span><span data-lang-en>Cyber attack: </span></strong>
          <span data-lang-fa>تلاش برای نفوذ یا آسیب رساندن به سرورها</span>
          <span data-lang-en>Attempting to breach or damage our servers</span>
        </li>
        <li>
          <strong><span data-lang-fa>هک یا چیت: </span><span data-lang-en>Hacking or cheating: </span></strong>
          <span data-lang-fa>از هک، چیت یا ابزارهای غیرمجاز استفاده کنید</span>
          <span data-lang-en>Using hacks, cheats, or any unauthorized tools</span>
        </li>
        <li>
          <strong><span data-lang-fa>سرقت حساب: </span><span data-lang-en>Account theft: </span></strong>
          <span data-lang-fa>حساب کاربری دیگران را سرقت یا سوء‌استفاده کنید</span>
          <span data-lang-en>Stealing or misusing another user's account</span>
        </li>
        <li>
          <strong><span data-lang-fa>سوء‌استفاده از اشکالات: </span><span data-lang-en>Bug exploitation: </span></strong>
          <span data-lang-fa>از باگ‌ها و اشکالات بازی سوء‌استفاده کنید</span>
          <span data-lang-en>Intentionally exploiting bugs or glitches in the game</span>
        </li>
        <li>
          <strong><span data-lang-fa>معکوس‌مهندسی: </span><span data-lang-en>Reverse engineering: </span></strong>
          <span data-lang-fa>بازی را معکوس‌مهندسی (Reverse Engineer) کنید</span>
          <span data-lang-en>Reverse engineering or decompiling the game in any form</span>
        </li>
        <li>
          <strong><span data-lang-fa>محتوای نامناسب: </span><span data-lang-en>Inappropriate content: </span></strong>
          <span data-lang-fa>محتوای توهین‌آمیز، مستهجن یا نامناسب منتشر کنید</span>
          <span data-lang-en>Publishing offensive, obscene, or otherwise inappropriate content</span>
        </li>
      </ul>
    </div>

    <!-- ═══════════════ 4. CONTENT OWNERSHIP ═══════════════ -->
    <h2><span class="section-icon">🎮</span>
      <span data-lang-fa>مالکیت محتوا</span>
      <span data-lang-en>Content Ownership</span>
    </h2>
    <p>
      <span data-lang-fa>
        بخش اصلی محتوای بازی شامل کد، طراحی، گرافیک و نام تجاری متعلق به <strong>AmirCollider Games</strong>
        است و تحت حمایت قوانین مالکیت فکری قرار دارد. با این حال، برخی عناصر مانند موسیقی، جلوه‌های صوتی،
        برخی منوها و اشیاء ممکن است از منابع Asset استفاده شده باشند یا دارای کپی‌رایت اشخاص ثالث باشند؛
        در این موارد نام و اعتبار مالک اصلی ذکر می‌شود.
      </span>
      <span data-lang-en>
        Core content — code, design, graphics, and brand name — belongs to <strong>AmirCollider Games</strong>
        and is protected under intellectual property law. However, some elements such as music, sound effects,
        menus, or objects may come from third-party asset packs or carry third-party copyrights;
        in such cases the original owner's credit is duly acknowledged.
      </span>
    </p>
    <div class="info-box">
      <p style="margin:0;"><strong>ℹ️</strong>
        <span data-lang-fa>
          شما مجاز به کپی، تکثیر، توزیع یا ایجاد اثر مشتق از محتوای اصلی بازی بدون اجازه کتبی ما نیستید.
          محتوای دارای کپی‌رایت ثالث تابع شرایط مالک مربوطه است.
        </span>
        <span data-lang-en>
          You may not copy, reproduce, distribute, or create derivative works from original game content
          without our written consent. Third-party content is subject to its respective owner's terms.
        </span>
      </p>
    </div>

    <!-- ═══════════════ 5. IN-APP PURCHASES ═══════════════ -->
    <h2><span class="section-icon">💰</span>
      <span data-lang-fa>خریدهای درون‌برنامه‌ای</span>
      <span data-lang-en>In-App Purchases</span>
    </h2>
    <p>
      <span data-lang-fa>بازی ممکن است شامل خریدهای درون‌برنامه‌ای باشد:</span>
      <span data-lang-en>The game may include in-app purchases subject to the following:</span>
    </p>
    <ul>
      <li>
        <span data-lang-fa>قیمت‌ها ممکن است بدون اطلاع قبلی تغییر کنند</span>
        <span data-lang-en>Prices may change at any time without prior notice</span>
      </li>
      <li>
        <span data-lang-fa>استرداد وجه فقط در موارد خاص و طبق قوانین مایکت انجام می‌شود</span>
        <span data-lang-en>Refunds are only processed in special cases per Myket's refund policy</span>
      </li>
      <li>
        <span data-lang-fa>تمام خریدها نهایی و غیرقابل استرداد هستند (مگر در موارد استثنایی)</span>
        <span data-lang-en>All purchases are considered final and non-refundable (except in exceptional cases)</span>
      </li>
      <li>
        <span data-lang-fa>مسئولیت حفظ امنیت روش پرداخت با شما یا فروشگاه طرف قرارداد است (مثل مایکت، بازار یا پلی‌استور)</span>
        <span data-lang-en>Payment security is the responsibility of you or the contracted store (e.g. Myket, Bazaar, or Google Play)</span>
      </li>
    </ul>

    <!-- ═══════════════ 6. LIMITATION OF LIABILITY ═══════════════ -->
    <h2><span class="section-icon">⚠️</span>
      <span data-lang-fa>محدودیت مسئولیت</span>
      <span data-lang-en>Limitation of Liability</span>
    </h2>
    <div class="warning-box">
      <p><strong>
        <span data-lang-fa>⚠️ مهم: بازی "همانگونه که هست" ارائه می‌شود. ما مسئولیتی در قبال خسارات ناشی از استفاده یا عدم استفاده از سرویس نداریم، از جمله:</span>
        <span data-lang-en>⚠️ Important: The game is provided "as is". We are not liable for damages arising from use or inability to use the service, including:</span>
      </strong></p>
      <ul style="margin-top:15px;">
        <!-- Ordered by length (FA) — خرابی نرم‌افزار shortest, مشکلات فنی longest/last -->
        <li>
          <span data-lang-fa>خرابی نرم‌افزار <em>(در سریع‌ترین حالت ممکن از طریق آپدیت برطرف می‌شود)</em></span>
          <span data-lang-en>Software malfunction <em>(addressed as quickly as possible via update)</em></span>
        </li>
        <li>
          <span data-lang-fa>از دست رفتن داده‌ها یا پیشرفت بازی <em>(در صورتی که مشکل از طرف ما نباشد)</em></span>
          <span data-lang-en>Loss of game data or progress <em>(only where the issue does not originate from our side)</em></span>
        </li>
        <li>
          <span data-lang-fa>خسارات مالی یا غیرمالی <em>(در صورتی که کاربر برخلاف قرارداد عمل کرده باشد)</em></span>
          <span data-lang-en>Financial or non-financial damages <em>(where the user has acted in breach of this agreement)</em></span>
        </li>
        <li>
          <span data-lang-fa>مشکلات فنی یا قطعی سرویس <em>(در سریع‌ترین حالت ممکن از طریق آپدیت برطرف می‌شود)</em></span>
          <span data-lang-en>Technical issues or full service outages <em>(resolved in the shortest time possible through an update)</em></span>
        </li>
      </ul>
    </div>

    <!-- ═══════════════ 7. USER ACCOUNT ═══════════════ -->
    <h2><span class="section-icon">🔒</span>
      <span data-lang-fa>حساب کاربری</span>
      <span data-lang-en>User Account</span>
    </h2>
    <ul>
      <!-- Ordered by length (FA) -->
      <li>
        <strong><span data-lang-fa>اطلاعات صحیح: </span><span data-lang-en>Accurate info: </span></strong>
        <span data-lang-fa>باید اطلاعات دقیق و به‌روز ارائه دهید</span>
        <span data-lang-en>You must provide accurate and up-to-date information</span>
      </li>
      <li>
        <strong><span data-lang-fa>حذف حساب: </span><span data-lang-en>Account deletion: </span></strong>
        <span data-lang-fa>شما می‌توانید هر زمان حساب خود را حذف کنید</span>
        <span data-lang-en>You may request deletion of your account at any time</span>
      </li>
      <li>
        <strong><span data-lang-fa>تعلیق حساب: </span><span data-lang-en>Account suspension: </span></strong>
        <span data-lang-fa>ما می‌توانیم حساب‌های مشکوک را تعلیق یا حذف کنیم</span>
        <span data-lang-en>We reserve the right to suspend or delete accounts that appear suspicious</span>
      </li>
      <li>
        <strong><span data-lang-fa>مسئولیت امنیت: </span><span data-lang-en>Security responsibility: </span></strong>
        <span data-lang-fa>شما مسئول حفظ امنیت حساب خود هستید و ما نیز متعهد به حفاظت از داده‌های شما هستیم</span>
        <span data-lang-en>You are responsible for your account security, and we are equally committed to safeguarding your data</span>
      </li>
    </ul>

    <!-- ═══════════════ 8. REQUIRED PERMISSIONS ═══════════════ -->
    <h2><span class="section-icon">📱</span>
      <span data-lang-fa>دسترسی‌های مورد نیاز</span>
      <span data-lang-en>Required Permissions</span>
    </h2>
    <p>
      <span data-lang-fa>بازی ممکن است به دسترسی‌های زیر نیاز داشته باشد:</span>
      <span data-lang-en>The game may require the following device permissions:</span>
    </p>
    <ul>
      <!-- Ordered by length (FA): حافظه < اطلاعات دستگاه < اینترنت -->
      <li>
        <strong><span data-lang-fa>حافظه: </span><span data-lang-en>Storage: </span></strong>
        <span data-lang-fa>برای ذخیره داده‌های بازی</span>
        <span data-lang-en>For storing game data locally on device</span>
      </li>
      <li>
        <strong><span data-lang-fa>اطلاعات دستگاه: </span><span data-lang-en>Device info: </span></strong>
        <span data-lang-fa>برای بهینه‌سازی عملکرد</span>
        <span data-lang-en>For optimizing performance on your device</span>
      </li>
      <li>
        <strong><span data-lang-fa>اینترنت: </span><span data-lang-en>Internet: </span></strong>
        <span data-lang-fa>برای احراز هویت و همگام‌سازی داده‌ها</span>
        <span data-lang-en>For user authentication and cloud data synchronization</span>
      </li>
    </ul>

    <!-- ═══════════════ 9. CHANGES TO SERVICE ═══════════════ -->
    <h2><span class="section-icon">📄</span>
      <span data-lang-fa>تغییرات در سرویس</span>
      <span data-lang-en>Changes to Service</span>
    </h2>
    <p>
      <span data-lang-fa>ما حق داریم هر زمان سرویس را تغییر دهیم، به‌روزرسانی کنیم یا متوقف کنیم بدون اطلاع قبلی. این شامل:</span>
      <span data-lang-en>We reserve the right to modify, update, or discontinue the service at any time. This includes:</span>
    </p>
    <ul>
      <!-- 1st: مکانیزم | 2nd: اضافه/حذف | 3rd: اصلاح اشکالات | 4th: تغییر قیمت -->
      <li>
        <span data-lang-fa>تغییر در مکانیزم‌های بازی</span>
        <span data-lang-en>Changes to core game mechanics</span>
      </li>
      <li>
        <span data-lang-fa>اضافه کردن یا حذف ویژگی‌ها</span>
        <span data-lang-en>Adding or removing existing features</span>
      </li>
      <li>
        <span data-lang-fa>اصلاح اشکالات و بهبود عملکرد</span>
        <span data-lang-en>Bug fixes and overall performance improvements</span>
      </li>
      <li>
        <span data-lang-fa>تغییر قیمت‌های خریدهای درون‌برنامه‌ای</span>
        <span data-lang-en>Adjusting the prices of any in-app purchases</span>
      </li>
    </ul>

    <!-- ═══════════════ 10. GOVERNING LAW ═══════════════ -->
    <h2><span class="section-icon">⚖️</span>
      <span data-lang-fa>قانون حاکم</span>
      <span data-lang-en>Governing Law</span>
    </h2>
    <p>
      <span data-lang-fa>
        این شرایط و قوانین تحت قوانین جمهوری اسلامی ایران اجرا می‌شود.
        هرگونه اختلاف از طریق مذاکره حل خواهد شد و در صورت عدم توافق، به مراجع قضایی صالح ارجاع می‌شود.
      </span>
      <span data-lang-en>
        These terms are governed by the laws of the Islamic Republic of Iran.
        Any disputes shall first be resolved through mutual negotiation;
        failing that, the matter will be referred to the appropriate judicial authorities.
      </span>
    </p>

    <!-- ═══════════════ 11. CHANGES TO TERMS ═══════════════ -->
    <h2><span class="section-icon">🔄</span>
      <span data-lang-fa>تغییرات در شرایط</span>
      <span data-lang-en>Changes to Terms</span>
    </h2>
    <div class="info-box">
      <p style="margin:0;">
        <span data-lang-fa>
          ما ممکن است این شرایط را به‌روزرسانی کنیم. تغییرات از زمان انتشار لازم‌الاجرا خواهند بود.
          ادامه استفاده از سرویس پس از تغییرات به معنای پذیرش شرایط جدید است.
        </span>
        <span data-lang-en>
          We may update these terms at any time. All changes take effect immediately upon publication.
          Continued use of the service following any update constitutes acceptance of the revised terms.
        </span>
      </p>
    </div>

    <!-- ═══════════════ 12. SUPPORT & CONTACT ═══════════════ -->
    <h2><span class="section-icon">📧</span>
      <span data-lang-fa>پشتیبانی و تماس</span>
      <span data-lang-en>Support &amp; Contact</span>
    </h2>
    <div class="contact-info">
      <p>
        <span data-lang-fa>برای مشکلات یا سوالات با ما تماس بگیرید:</span>
        <span data-lang-en>For any issues or questions, please reach out to us:</span>
      </p>
      <ul style="list-style:none; padding:0; margin-top:15px;">
        <!-- Ordered: 1.بازی  2.مایکت  3.ایمیل  4.وب‌سایت -->
        <li style="margin:12px 0;">
          <strong>🎮 <span data-lang-fa>بازی: </span><span data-lang-en>Game: </span></strong>
          ${game.name}
        </li>
        <li style="margin:12px 0;">
          <strong>🛒 <span data-lang-fa>صفحه مایکت: </span><span data-lang-en>Myket page: </span></strong>
          <a href="${game.myketUrl}" target="_blank">
            <span data-lang-fa>مشاهده در مایکت</span>
            <span data-lang-en>View on Myket</span>
          </a>
        </li>
        <li style="margin:12px 0;">
          <strong>📧 <span data-lang-fa>ایمیل پشتیبانی: </span><span data-lang-en>Support email: </span></strong>
          <a href="mailto:${CONFIG.SUPPORT_EMAIL}">${CONFIG.SUPPORT_EMAIL}</a>
        </li>
        <li style="margin:12px 0;">
          <strong>🌐 <span data-lang-fa>وب‌سایت: </span><span data-lang-en>Website: </span></strong>
          <a href="${baseUrl}">${baseUrl}</a>
        </li>
      </ul>
    </div>

    <!-- ═══════════════ 13. CONFIRMATION ═══════════════ -->
    <h2><span class="section-icon">✓</span>
      <span data-lang-fa>تأیید و پذیرش</span>
      <span data-lang-en>Confirmation &amp; Acceptance</span>
    </h2>
    <div class="highlight-box">
      <p style="margin:0;"><strong>
        <span data-lang-fa>✓ با استفاده از بازی، شما تأیید می‌کنید که:</span>
        <span data-lang-en>✓ By using the game, you confirm that:</span>
      </strong></p>
      <ul style="margin-top:15px;">
        <!-- 1: بالای ۵ سال | 2: این شرایط خوانده | 3: به تمام شرایط | 4: مسئولیت -->
        <li>
          <span data-lang-fa>بالای ۵ سال سن دارید</span>
          <span data-lang-en>You are over 5 years of age</span>
        </li>
        <li>
          <span data-lang-fa>این شرایط و قوانین را خوانده و فهمیده‌اید</span>
          <span data-lang-en>You have read and fully understood these terms and conditions</span>
        </li>
        <li>
          <span data-lang-fa>به تمام شرایط ذکر شده موافقت می‌کنید</span>
          <span data-lang-en>You agree to comply with all of the conditions stated above</span>
        </li>
        <li>
          <span data-lang-fa>مسئولیت استفاده صحیح از سرویس را می‌پذیرید</span>
          <span data-lang-en>You accept full responsibility for using the service in accordance with these terms</span>
        </li>
      </ul>
    </div>

    <!-- ─── FOOTER ─── -->
    <div class="last-update">
      <p>
        <span data-lang-fa>آخرین به‌روزرسانی: <strong>${todayFA}</strong></span>
        <span data-lang-en>Last updated: <strong>${todayEN}</strong></span>
      </p>
      <span class="version-badge">
        <span data-lang-fa>نسخه </span><span data-lang-en>Version </span>${CONFIG.VERSION}
      </span>
      <p style="margin-top:15px; font-size:0.9em;">
        <span data-lang-fa>این سند از لحظه انتشار معتبر است و بر تمام کاربران لازم‌الاجرا می‌باشد.</span>
        <span data-lang-en>This document is valid from the moment of publication and is binding on all users.</span>
      </p>
    </div>

    <div class="btn-container">
      <a href="${baseUrl}" class="btn">
        🏠 <span data-lang-fa>بازگشت به صفحه اصلی</span><span data-lang-en>Back to Home</span>
      </a>
      <a href="${baseUrl}/${gameId}/privacy" class="btn btn-secondary">
        🔒 <span data-lang-fa>حریم خصوصی</span><span data-lang-en>Privacy Policy</span>
      </a>
    </div>
  </div><!-- /.container -->

  <!-- ════════════════════════════════════════════════════
       LANGUAGE TOGGLE SCRIPT
       Pure attribute swap — all visual direction is CSS-driven.
       No inline style injection → zero RTL/LTR glitches.
       ════════════════════════════════════════════════════ -->
  <script>
    const html      = document.getElementById('root-html');
    const langFlag  = document.getElementById('lang-flag');
    const langLabel = document.getElementById('lang-label');

    // Restore saved preference, default FA
    let currentLang = localStorage.getItem('acg_lang') || 'fa';
    setLang(currentLang); // instant, no animation on first load

    function toggleLang() {
      currentLang = (currentLang === 'fa') ? 'en' : 'fa';
      localStorage.setItem('acg_lang', currentLang);

      // Fade out → swap → fade in
      document.body.style.transition = 'opacity 0.2s ease';
      document.body.style.opacity    = '0';
      setTimeout(() => {
        setLang(currentLang);
        document.body.style.opacity = '1';
      }, 200);
    }

    function setLang(lang) {
      if (lang === 'en') {
        html.setAttribute('lang', 'en');
        html.setAttribute('dir', 'ltr');
        langFlag.textContent  = '🇮🇷';
        langLabel.textContent = 'فارسی';
      } else {
        html.setAttribute('lang', 'fa');
        html.setAttribute('dir', 'rtl');
        langFlag.textContent  = '🇬🇧';
        langLabel.textContent = 'English';
      }
    }
  </script>

</body>
</html>`
}