// ==========================================
// pages/privacy.js
// Privacy Policy Page Handler
// AmirCollider Games - Worker Proxy
// ==========================================

import { CONFIG } from '../config.js'
import { getSharedCSS, getLogosHTML, getPageHead } from '../shared-styles.js'
import { validateGameId, createHtmlResponse, createErrorPage } from '../utils.js'

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

  return createHtmlResponse(createPrivacyPage(game, gameId, url.origin))
}

// ─── Gregorian → Jalali (no Intl locale needed, works in CF Workers) ─────────
function getJalaliDate() {
  const d  = new Date()
  const gy = d.getFullYear()
  const gm = d.getMonth() + 1
  const gd = d.getDate()

  const gy2   = gy - 1600
  const gm2   = gm - 1
  const gd2   = gd - 1
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

  const months = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور',
                  'مهر','آبان','آذر','دی','بهمن','اسفند']
  const toFa   = (n) => String(n).replace(/\d/g, (x) => '۰۱۲۳۴۵۶۷۸۹'[x])

  return `${toFa(jd)} ${months[jm]} ${toFa(jy)}`
}

// ─── Page-specific CSS only ──────────────────────────────────────────────────
function getPrivacyCSS() {
  return `
    /* ══════════════════════════════════════════════
       READABILITY — override shared green h2 accent
       Works on ANY game color / theme
       ══════════════════════════════════════════════ */
    h2 {
      color: rgba(255, 255, 255, 0.97) !important;
      border-color: rgba(255, 255, 255, 0.55) !important;
      text-shadow: 0 1px 6px rgba(0, 0, 0, 0.45);
    }
    h1 { text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5); }

    /* Force readable text everywhere */
    .warning-box, .info-box, .highlight-box,
    .contact-info, .game-info, p, li {
      color: rgba(255, 255, 255, 0.95);
    }

    /* Red warning-box (override shared orange) */
    .warning-box {
      background: rgba(210, 30, 20, 0.26) !important;
      border-color: rgba(255, 90, 80, 0.85) !important;
    }

    /* Links: warm gold — readable on any gradient */
    a       { color: #ffe082; }
    a:hover { color: #ffffff; text-decoration: underline; }

    /* ══════════════════════════════════════════════
       BILINGUAL VISIBILITY
       ══════════════════════════════════════════════ */
    [data-lang-fa], [data-lang-en] { display: none !important; }
    html[lang="fa"] [data-lang-fa]  { display: revert !important; }
    html[lang="en"] [data-lang-en]  { display: revert !important; }

    /* ══════════════════════════════════════════════
       LTR OVERRIDES — pure CSS, zero JS inline style
       ══════════════════════════════════════════════ */
    html[lang="en"] h2 {
      border-right: none !important;
      border-left: 5px solid rgba(255, 255, 255, 0.55) !important;
      padding-right: 0   !important;
      padding-left: 15px !important;
    }
    html[lang="en"] ul              { padding-right: 0; padding-left: 30px; }
    html[lang="en"] li::before      { right: unset; left: -25px; }
    html[lang="en"] .info-card      { border-right: none; border-left: 4px solid; }
    html[lang="en"] .header-logos   { flex-direction: row; }

    /* ══════════════════════════════════════════════
       GAME INFO BANNER
       ══════════════════════════════════════════════ */
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

    /* Remove browser default disc bullet from ALL lists */
    ul { list-style: none; }

    /* Checkmark bullet — RTL default, LTR flip */
    li::before {
      content: "✓";
      position: absolute;
      right: -25px;
      left: unset;
      color: rgba(255, 255, 255, 0.8);
      font-weight: bold;
      font-size: 1.2em;
    }

    /* Contact list and plain lists: no bullet at all */
    .list-plain li::before {
      content: none;
      display: none;
    }

    /* ══════════════════════════════════════════════
       LANGUAGE TOGGLE — bottom-left, floating
       ══════════════════════════════════════════════ */
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
      0%, 100% { transform: translateY(0);    box-shadow: 0 6px 24px rgba(0,0,0,0.45); }
      50%       { transform: translateY(-6px); box-shadow: 0 14px 36px rgba(0,0,0,0.55); }
    }

    .lang-flag {
      font-size: 1.45em;
      line-height: 1;
      transition: transform 0.3s ease;
    }
    .lang-toggle-btn:hover .lang-flag { transform: rotate(-10deg) scale(1.2); }
    .lang-label { letter-spacing: 0.3px; }
  `
}

// ─── Page template ────────────────────────────────────────────────────────────
function createPrivacyPage(game, gameId, baseUrl) {
  const amirLogo = CONFIG.AMIR_LOGO
  const gameLogo = game.logo || CONFIG.DEFAULT_GAME_LOGO
  const todayFA  = getJalaliDate()
  const todayEN  = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  })

  return `<!DOCTYPE html>
<html dir="rtl" lang="fa" id="root-html">
<head>
  ${getPageHead({
    title: `سیاست حفظ حریم خصوصی - ${game.name}`,
    amirLogo,
    description: `سیاست حفظ حریم خصوصی ${game.name} - AmirCollider Games`
  })}
  <style>
    ${getSharedCSS(game.color)}
    ${getPrivacyCSS()}
  </style>
</head>
<body>

  <!-- Language toggle: bottom-left, floating, flag emoji -->
  <button class="lang-toggle-btn" onclick="toggleLang()" id="lang-btn" aria-label="Toggle Language">
    <span class="lang-flag" id="lang-flag">🇬🇧</span>
    <span class="lang-label" id="lang-label">English</span>
  </button>

  <div class="container">
    ${getLogosHTML(amirLogo, gameLogo, game.name)}

    <!-- PAGE TITLE -->
    <h1>
      <span data-lang-fa>سیاست حفظ حریم خصوصی</span>
      <span data-lang-en>Privacy Policy</span>
    </h1>

    <div class="game-info">
      <span class="game-icon">${game.icon}</span>
      <strong>${game.name}</strong>
      <span class="game-icon">${game.icon}</span>
    </div>

    <!-- ═══════════════ 1. INTRO ═══════════════ -->
    <h2><span class="section-icon">📋</span>
      <span data-lang-fa>مقدمه</span>
      <span data-lang-en>Introduction</span>
    </h2>
    <p>
      <span data-lang-fa>
        ما در <strong>AmirCollider Games</strong> به حریم خصوصی شما اهمیت می‌دهیم.
        این سند توضیح می‌دهد چه اطلاعاتی از شما جمع‌آوری می‌شود و چگونه از آن استفاده می‌کنیم.
      </span>
      <span data-lang-en>
        At <strong>AmirCollider Games</strong>, we take your privacy seriously.
        This document explains what information we collect from you and how we use it.
      </span>
    </p>
    <div class="highlight-box">
      <p style="margin:0;">
        <strong>🔒</strong>
        <span data-lang-fa>تعهد ما: ما هرگز اطلاعات شخصی شما را بدون رضایت شما به اشخاص ثالث نمی‌فروشیم.</span>
        <span data-lang-en>Our commitment: We will never sell your personal information to third parties without your consent.</span>
      </p>
    </div>

    <!-- ═══════════════ 2. DATA COLLECTED ═══════════════ -->
    <h2><span class="section-icon">📝</span>
      <span data-lang-fa>اطلاعات جمع‌آوری شده</span>
      <span data-lang-en>Information We Collect</span>
    </h2>
    <p>
      <span data-lang-fa>هنگام استفاده از سرویس احراز هویت ما، اطلاعات زیر را دریافت می‌کنیم:</span>
      <span data-lang-en>When you use our authentication service, we receive the following information:</span>
    </p>
    <ul>
      <li>
        <strong><span data-lang-fa>آدرس ایمیل: </span><span data-lang-en>Email address: </span></strong>
        <span data-lang-fa>آدرس ایمیل Google شما</span>
        <span data-lang-en>Your Google account email address</span>
      </li>
      <li>
        <strong><span data-lang-fa>عکس پروفایل: </span><span data-lang-en>Profile photo: </span></strong>
        <span data-lang-fa>عکس پروفایل گوگل شما</span>
        <span data-lang-en>Your Google account profile photo</span>
      </li>
      <li>
        <strong><span data-lang-fa>نام: </span><span data-lang-en>Name: </span></strong>
        <span data-lang-fa>نامی که در ایمیل گوگل شما استفاده شده است</span>
        <span data-lang-en>The name associated with your Google account</span>
      </li>
      <li>
        <strong><span data-lang-fa>آمار بازی: </span><span data-lang-en>Game stats: </span></strong>
        <span data-lang-fa>آمار بازی شامل امتیازات، سطح و دستاوردها</span>
        <span data-lang-en>Game statistics including scores, level, and achievements</span>
      </li>
    </ul>

    <!-- ═══════════════ 3. HOW WE USE DATA ═══════════════ -->
    <h2><span class="section-icon">📊</span>
      <span data-lang-fa>نحوه استفاده از اطلاعات</span>
      <span data-lang-en>How We Use Your Information</span>
    </h2>
    <p>
      <span data-lang-fa>ما از اطلاعات شما برای موارد زیر استفاده می‌کنیم:</span>
      <span data-lang-en>We use your information for the following purposes:</span>
    </p>
    <ul>
      <!-- Sorted by length (FA) -->
      <li>
        <span data-lang-fa>تحلیل و بهبود خدمات</span>
        <span data-lang-en>Analyzing and improving our services</span>
      </li>
      <li>
        <span data-lang-fa>نمایش در جدول امتیازات</span>
        <span data-lang-en>Displaying your score on leaderboards</span>
      </li>
      <li>
        <span data-lang-fa>ذخیره پیشرفت و امتیازات بازی</span>
        <span data-lang-en>Saving your game progress and scores</span>
      </li>
      <li>
        <span data-lang-fa>بهبود تجربه کاربری و عملکرد بازی</span>
        <span data-lang-en>Improving user experience and game performance</span>
      </li>
      <li>
        <span data-lang-fa>احراز هویت و مدیریت حساب کاربری</span>
        <span data-lang-en>User authentication and account management</span>
      </li>
      <li>
        <span data-lang-fa>ارسال اطلاعیه‌های مهم (در صورت نیاز)</span>
        <span data-lang-en>Sending important notifications when necessary</span>
      </li>
    </ul>

    <!-- ═══════════════ 4. SECURITY ═══════════════ -->
    <h2><span class="section-icon">🛡️</span>
      <span data-lang-fa>امنیت اطلاعات</span>
      <span data-lang-en>Data Security</span>
    </h2>
    <p>
      <span data-lang-fa>ما از پروتکل‌های امنیتی استاندارد برای محافظت از اطلاعات شما استفاده می‌کنیم:</span>
      <span data-lang-en>We use industry-standard security protocols to protect your information:</span>
    </p>
    <ul>
      <li>
        <strong><span data-lang-fa>پایش مستمر: </span><span data-lang-en>Continuous monitoring: </span></strong>
        <span data-lang-fa>نظارت ۲۴/۷ بر امنیت سیستم</span>
        <span data-lang-en>24/7 monitoring of system security</span>
      </li>
      <li>
        <strong><span data-lang-fa>محدودیت دسترسی: </span><span data-lang-en>Access control: </span></strong>
        <span data-lang-fa>فقط کارمندان مجاز به داده‌ها دسترسی دارند</span>
        <span data-lang-en>Only authorized personnel have access to data</span>
      </li>
      <li>
        <strong><span data-lang-fa>رمزگذاری اتصالات: </span><span data-lang-en>Connection encryption: </span></strong>
        <span data-lang-fa>تمام داده‌ها با پروتکل HTTPS/TLS رمزگذاری می‌شوند</span>
        <span data-lang-en>All data is encrypted in transit using HTTPS/TLS protocol</span>
      </li>
      <li>
        <strong><span data-lang-fa>D1 Cloudflare Database: </span><span data-lang-en>D1 Cloudflare Database: </span></strong>
        <span data-lang-fa>ذخیره‌سازی امن داده‌ها با پایگاه داده Cloudflare D1</span>
        <span data-lang-en>Secure data storage powered by Cloudflare D1 database</span>
      </li>
    </ul>

    <!-- ═══════════════ 5. NO DATA SHARING ═══════════════ -->
    <h2><span class="section-icon">🚫</span>
      <span data-lang-fa>عدم اشتراک‌گذاری اطلاعات</span>
      <span data-lang-en>No Data Sharing</span>
    </h2>
    <div class="warning-box">
      <p><strong>
        <span data-lang-fa>⚠️ مهم: ما هرگز اطلاعات شخصی شما را به اشخاص ثالث نمی‌فروشیم یا به اشتراک نمی‌گذاریم. تنها در موارد زیر ممکن است اطلاعات منتقل شود:</span>
        <span data-lang-en>⚠️ Important: We never sell or share your personal data with third parties. Information may only be transferred in the following cases:</span>
      </strong></p>
      <ul>
      <li>
        <strong><span data-lang-fa>پایش مستمر: </span><span data-lang-en>Continuous monitoring: </span></strong>
        <span data-lang-fa>نظارت ۲۴/۷ بر امنیت سیستم</span>
        <span data-lang-en>24/7 monitoring of system security</span>
      </li>
      <li>
        <strong><span data-lang-fa>محدودیت دسترسی: </span><span data-lang-en>Access control: </span></strong>
        <span data-lang-fa>فقط کارمندان مجاز به داده‌ها دسترسی دارند</span>
        <span data-lang-en>Only authorized personnel have access to data</span>
      </li>
      <li>
        <strong><span data-lang-fa>رمزگذاری اتصالات: </span><span data-lang-en>Connection encryption: </span></strong>
        <span data-lang-fa>تمام داده‌ها با پروتکل HTTPS/TLS رمزگذاری می‌شوند</span>
        <span data-lang-en>All data is encrypted in transit using HTTPS/TLS protocol</span>
      </li>
      <li>
        <strong><span data-lang-fa>D1 Cloudflare Database: </span><span data-lang-en>D1 Cloudflare Database: </span></strong>
        <span data-lang-fa>ذخیره‌سازی امن داده‌ها با پایگاه داده Cloudflare D1</span>
        <span data-lang-en>Secure data storage powered by Cloudflare D1 database</span>
      </li>
    </ul>
    </div>

    <!-- ═══════════════ 6. COOKIES ═══════════════ -->
    <h2><span class="section-icon">🍪</span>
      <span data-lang-fa>کوکی‌ها و ذخیره‌سازی محلی</span>
      <span data-lang-en>Cookies &amp; Local Storage</span>
    </h2>
    <p>
      <span data-lang-fa>ما از کوکی‌ها برای حفظ نشست شما استفاده می‌کنیم. این کوکی‌ها:</span>
      <span data-lang-en>We use cookies to maintain your session. These cookies:</span>
    </p>
    <ul>
      <li>
        <span data-lang-fa>به مدت ۷ روز معتبر هستند</span>
        <span data-lang-en>Remain valid for a period of 7 days</span>
      </li>
      <li>
        <span data-lang-fa>قابل حذف توسط شما هستند</span>
        <span data-lang-en>Can be deleted by you at any time</span>
      </li>
      <li>
        <span data-lang-fa>اطلاعات حساس ذخیره نمی‌کنند</span>
        <span data-lang-en>Do not store any sensitive personal information</span>
      </li>
      <li>
        <span data-lang-fa>فقط برای احراز هویت استفاده می‌شوند</span>
        <span data-lang-en>Are used exclusively for authentication purposes</span>
      </li>
    </ul>

    <!-- ═══════════════ 7. YOUR RIGHTS ═══════════════ -->
    <h2><span class="section-icon">👤</span>
      <span data-lang-fa>حقوق شما</span>
      <span data-lang-en>Your Rights</span>
    </h2>
    <p>
      <span data-lang-fa>شما حق دارید:</span>
      <span data-lang-en>You have the right to:</span>
    </p>
    <ul>
      <li>
        <strong><span data-lang-fa>حذف: </span><span data-lang-en>Deletion: </span></strong>
        <span data-lang-fa>حساب خود را حذف کنید</span>
        <span data-lang-en>Delete your account entirely</span>
      </li>
      <li>
        <strong><span data-lang-fa>انصراف: </span><span data-lang-en>Opt-out: </span></strong>
        <span data-lang-fa>از خدمات ما انصراف دهید</span>
        <span data-lang-en>Opt out of our services at any time</span>
      </li>
      <li>
        <strong><span data-lang-fa>انتقال: </span><span data-lang-en>Portability: </span></strong>
        <span data-lang-fa>داده‌های خود را دریافت کنید</span>
        <span data-lang-en>Receive a copy of your personal data</span>
      </li>
      <li>
        <strong><span data-lang-fa>اصلاح: </span><span data-lang-en>Correction: </span></strong>
        <span data-lang-fa>اطلاعات نادرست را اصلاح کنید</span>
        <span data-lang-en>Correct any inaccurate information</span>
      </li>
      <li>
        <strong><span data-lang-fa>محدودیت: </span><span data-lang-en>Restriction: </span></strong>
        <span data-lang-fa>پردازش اطلاعات خود را محدود کنید</span>
        <span data-lang-en>Restrict the processing of your personal data</span>
      </li>
      <li>
        <strong><span data-lang-fa>دسترسی: </span><span data-lang-en>Access: </span></strong>
        <span data-lang-fa>به اطلاعات خود دسترسی داشته باشید</span>
        <span data-lang-en>Access all information we hold about you</span>
      </li>
    </ul>

    <!-- ═══════════════ 8. CHILDREN ═══════════════ -->
    <h2><span class="section-icon">👶</span>
      <span data-lang-fa>کودکان</span>
      <span data-lang-en>Children</span>
    </h2>
    <p>
      <span data-lang-fa>
        بازی ما برای کاربران بالای <strong>۵ سال</strong> طراحی شده است.
        ما عمداً اطلاعات کودکان زیر ۵ سال را جمع‌آوری نمی‌کنیم.
        اگر متوجه شویم که کودکی زیر ۵ سال ثبت‌نام کرده، حساب او را فوراً حذف خواهیم کرد.
      </span>
      <span data-lang-en>
        Our game is designed for users over the age of <strong>5</strong>.
        We do not knowingly collect data from children under 5 years of age.
        If we discover that a child under 5 has registered, we will immediately delete their account.
      </span>
    </p>

    <!-- ═══════════════ 9. INTERNATIONAL TRANSFER ═══════════════ -->
    <h2><span class="section-icon">🌍</span>
      <span data-lang-fa>انتقال بین‌المللی داده</span>
      <span data-lang-en>International Data Transfer</span>
    </h2>
    <p>
      <span data-lang-fa>
        اطلاعات شما ممکن است در سرورهای واقع در کشورهای مختلف ذخیره شود.
        ما اطمینان می‌دهیم که تمام انتقالات داده با استانداردهای بین‌المللی حفاظت از داده انجام می‌شود.
      </span>
      <span data-lang-en>
        Your data may be stored on servers located in different countries.
        We ensure all data transfers comply with international data protection standards.
      </span>
    </p>

    <!-- ═══════════════ 10. POLICY CHANGES ═══════════════ -->
    <h2><span class="section-icon">📄</span>
      <span data-lang-fa>تغییرات در سیاست</span>
      <span data-lang-en>Policy Changes</span>
    </h2>
    <div class="info-box">
      <p style="margin:0;">
        <span data-lang-fa>
          ممکن است این سیاست را به‌روزرسانی کنیم. تغییرات مهم از طریق ایمیل یا اعلان در بازی به اطلاع شما خواهد رسید.
          ادامه استفاده از سرویس پس از تغییرات به معنای پذیرش سیاست جدید است.
        </span>
        <span data-lang-en>
          We may update this policy at any time. Important changes will be communicated via email or in-game notification.
          Continued use of the service after any update constitutes acceptance of the revised policy.
        </span>
      </p>
    </div>

    <!-- ═══════════════ 11. CONTACT ═══════════════ -->
    <h2><span class="section-icon">📧</span>
      <span data-lang-fa>تماس با ما</span>
      <span data-lang-en>Contact Us</span>
    </h2>
    <div class="contact-info">
      <p>
        <span data-lang-fa>در صورت هرگونه سوال درباره این سیاست، با ما تماس بگیرید:</span>
        <span data-lang-en>For any questions about this policy, please reach out to us:</span>
      </p>
      <ul class="list-plain" style="padding:0; margin-top:15px;">
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
      <a href="${baseUrl}/${gameId}/terms" class="btn btn-secondary">
        📋 <span data-lang-fa>شرایط و قوانین</span><span data-lang-en>Terms of Service</span>
      </a>
    </div>
  </div><!-- /.container -->

  <!-- ══════════════════════════════════════════════════
       LANGUAGE TOGGLE SCRIPT
       Pure attribute swap — all direction handled by CSS.
       No inline styles → zero RTL/LTR glitches.
       ══════════════════════════════════════════════════ -->
  <script>
    const html      = document.getElementById('root-html');
    const langFlag  = document.getElementById('lang-flag');
    const langLabel = document.getElementById('lang-label');

    // Shared key with terms.js — user's choice persists across both pages
    let currentLang = localStorage.getItem('acg_lang') || 'fa';
    setLang(currentLang); // instant on load, no animation

    function toggleLang() {
      currentLang = (currentLang === 'fa') ? 'en' : 'fa';
      localStorage.setItem('acg_lang', currentLang);

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