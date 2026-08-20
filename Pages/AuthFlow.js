// ==========================================
// Pages/AuthFlow.js
// The six pages a sign-in can end on.
//
//   redirect        on the way to Google
//   desktop success the code, with a copy button
//   loopback        hands the code to a local redirect URI
//   android         opens the game over its deep link
//   provider error  Google refused
//   expired         the signed state is too old, or forged
//
// All six share one shell, one stylesheet and one set of strings,
// so a change to the chrome lands on every outcome at once.
// ==========================================

import { CONFIG, LANGUAGES } from '../Config.js'
import { getSharedCSS, getLogosHTML, getPageHead } from '../Core/DesignSystem.js'
import { escapeHtml, jsString, sanitizeInput } from '../Core/Html.js'
import { resolveLang, dirFor, themeAttribute } from '../Core/RequestContext.js'
import { themeBootScript } from '../Core/PageChrome.js'

const AUTH_I18N = {
  fa: {
    locale: 'fa-IR',
    langName: 'فارسی',
    themeToLight: 'حالت روشن',
    themeToDark: 'حالت تاریک',
    redirectTitle: 'در حال انتقال به Google',
    redirectBody: 'در حال انتقال به صفحه ورود امن Google…',
    pleaseWait: 'لطفاً منتظر بمانید',
    continueManually: 'اگر به‌صورت خودکار منتقل نشدید، اینجا کلیک کنید',
    authSuccess: 'ورود موفقیت‌آمیز بود',
    secureBadge: 'اتصال امن',
    copyCode: 'کپی کردن کد',
    copied: 'کد کپی شد',
    codeReady: 'کد ورود شما آماده است',
    backToGame: 'بازگشت به بازی',
    backToSite: 'بازگشت به سایت',
    canClose: 'می‌توانید این پنجره را ببندید',
    transferring: 'در حال انتقال اطلاعات به بازی…',
    gameReady: 'بازی آماده است؛ این پنجره را ببندید',
    returningToGame: 'در حال بازگشت به بازی…',
    manualReturn: 'بازگشت دستی به بازی',
    signInError: 'خطا در ورود',
    errorCode: 'کد خطا',
    errorBody: 'در فرآیند احراز هویت خطایی رخ داد.',
    tryAgain: 'لطفاً دوباره تلاش کنید یا با پشتیبانی تماس بگیرید.',
    close: 'بستن',
    sessionExpired: 'جلسه منقضی شده است',
    expiredBody: 'زمان درخواست شما به پایان رسیده است.',
    tryAgainShort: 'لطفاً دوباره تلاش کنید.',
    profile: 'پروفایل',
    highScore: 'بالاترین امتیاز',
    gamesPlayed: 'بازی‌های انجام‌شده',
    accountInfo: 'اطلاعات حساب',
    userId: 'شناسه کاربری',
    lastLogin: 'آخرین ورود',
    joined: 'تاریخ ثبت‌نام',
    backHome: 'بازگشت به خانه',
    enterGame: 'ورود به بازی',
    gameNotFound: 'بازی پیدا نشد.',
    userIdRequired: 'شناسه کاربر الزامی است.',
    userNotFound: 'کاربر یافت نشد.',
    serverError: 'خطای داخلی سرور رخ داد.',
    gameNotSupported: 'این بازی پشتیبانی نمی‌شود.'
  },
  en: {
    locale: 'en-US',
    langName: 'English',
    themeToLight: 'Light mode',
    themeToDark: 'Dark mode',
    redirectTitle: 'Redirecting to Google',
    redirectBody: 'Redirecting to Google’s secure sign-in…',
    pleaseWait: 'Please wait',
    continueManually: 'If you are not redirected automatically, click here',
    authSuccess: 'Signed in successfully',
    secureBadge: 'Secure connection',
    copyCode: 'Copy code',
    copied: 'Code copied',
    codeReady: 'Your sign-in code is ready',
    backToGame: 'Back to game',
    backToSite: 'Back to site',
    canClose: 'You can close this window',
    transferring: 'Transferring data to the game…',
    gameReady: 'The game is ready. You can close this window.',
    returningToGame: 'Returning to the game…',
    manualReturn: 'Return to the game manually',
    signInError: 'Sign-in error',
    errorCode: 'Error code',
    errorBody: 'Something went wrong during authentication.',
    tryAgain: 'Please try again or contact support.',
    close: 'Close',
    sessionExpired: 'Session expired',
    expiredBody: 'Your request has timed out.',
    tryAgainShort: 'Please try again.',
    profile: 'Profile',
    highScore: 'High score',
    gamesPlayed: 'Games played',
    accountInfo: 'Account information',
    userId: 'User ID',
    lastLogin: 'Last login',
    joined: 'Joined',
    backHome: 'Back home',
    enterGame: 'Enter game',
    gameNotFound: 'Game not found.',
    userIdRequired: 'User ID is required.',
    userNotFound: 'User not found.',
    serverError: 'An internal server error occurred.',
    gameNotSupported: 'This game is not supported.'
  },
  ja: {
    locale: 'ja-JP',
    langName: '日本語',
    themeToLight: 'ライトモード',
    themeToDark: 'ダークモード',
    redirectTitle: 'Google にリダイレクトしています',
    redirectBody: 'Google の安全なサインインに移動しています…',
    pleaseWait: 'お待ちください',
    continueManually: '自動的に移動しない場合はこちらをクリック',
    authSuccess: 'サインインに成功しました',
    secureBadge: '安全な接続',
    copyCode: 'コードをコピー',
    copied: 'コードをコピーしました',
    codeReady: 'サインインコードの準備ができました',
    backToGame: 'ゲームに戻る',
    backToSite: 'サイトに戻る',
    canClose: 'このウィンドウを閉じてかまいません',
    transferring: 'ゲームにデータを転送しています…',
    gameReady: 'ゲームの準備ができました。このウィンドウを閉じてください。',
    returningToGame: 'ゲームに戻っています…',
    manualReturn: '手動でゲームに戻る',
    signInError: 'サインインエラー',
    errorCode: 'エラーコード',
    errorBody: '認証中に問題が発生しました。',
    tryAgain: 'もう一度お試しいただくか、サポートにお問い合わせください。',
    close: '閉じる',
    sessionExpired: 'セッションが期限切れです',
    expiredBody: 'リクエストがタイムアウトしました。',
    tryAgainShort: 'もう一度お試しください。',
    profile: 'プロフィール',
    highScore: 'ハイスコア',
    gamesPlayed: 'プレイ回数',
    accountInfo: 'アカウント情報',
    userId: 'ユーザーID',
    lastLogin: '最終ログイン',
    joined: '登録日',
    backHome: 'ホームに戻る',
    enterGame: 'ゲームに入る',
    gameNotFound: 'ゲームが見つかりません。',
    userIdRequired: 'ユーザーIDが必要です。',
    userNotFound: 'ユーザーが見つかりません。',
    serverError: 'サーバー内部エラーが発生しました。',
    gameNotSupported: 'このゲームはサポートされていません。'
  }
}

/** One localized string, falling back to the default language. */
export function authText(lang, key) {
  const pack = AUTH_I18N[resolveLang(lang)]
  return pack[key] != null ? pack[key] : AUTH_I18N[LANGUAGES.default][key]
}

export function authLocale(lang) {
  return AUTH_I18N[resolveLang(lang)].locale
}


// ==========================================
// Shared chrome
// ==========================================
const ICONS = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16.5" x2="12" y2="16.5"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  contrast: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor" stroke="none"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'
}

function renderTopbar(lang) {
  const current = resolveLang(lang)
  const segment = LANGUAGES.supported.map(code =>
    `<button type="button" lang="${code}" aria-pressed="${code === current ? 'true' : 'false'}" onclick="acSetLang('${code}')">${escapeHtml(AUTH_I18N[code].langName)}</button>`
  ).join('')

  return `
    <div class="ac-topbar">
      <div class="ac-seg" role="group">${segment}</div>
      <button type="button" id="themeBtn" class="ac-icon-btn" onclick="acToggleTheme()"
              data-to-dark="${escapeHtml(authText(lang, 'themeToDark'))}"
              data-to-light="${escapeHtml(authText(lang, 'themeToLight'))}">${ICONS.contrast}</button>
    </div>`
}

/** The client runtime for these pages: theme toggle and language switch. */
function chromeScript() {
  return `<script>
    (function(){
      function applyLabel(){
        var b=document.getElementById('themeBtn'); if(!b) return;
        var dark=document.documentElement.getAttribute('data-theme')==='dark'||
                 (!document.documentElement.getAttribute('data-theme')&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);
        b.setAttribute('aria-label', b.getAttribute(dark?'data-to-light':'data-to-dark')||'');
      }
      window.acToggleTheme=function(){
        var cur=document.documentElement.getAttribute('data-theme');
        var dark=cur==='dark'||(!cur&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);
        var next=dark?'light':'dark';
        document.documentElement.setAttribute('data-theme',next);
        try{localStorage.setItem('ac_theme',next);}catch(e){}
        document.cookie='theme='+next+';path=/;max-age=31536000;samesite=lax';
        applyLabel();
      };
      window.acSetLang=function(code){
        try{localStorage.setItem('ac_lang',code);}catch(e){}
        document.cookie='lang='+code+';path=/;max-age=31536000;samesite=lax';
        var u=new URL(window.location.href); u.searchParams.set('lang',code); window.location.href=u.toString();
      };
      applyLabel();
    })();
  </script>`
}

/** Auth-page styles layered on top of the shared design system. */
function authPageCSS() {
  return `
    body { display: flex; flex-direction: column; align-items: center; }
    .ac-topbar {
      width: 100%; max-width: var(--maxw); margin-inline: auto;
      display: flex; justify-content: flex-end; align-items: center; gap: 12px; margin-block-end: 18px;
    }
    .ac-seg { display: inline-flex; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
    .ac-seg button {
      border: none; background: transparent; color: var(--text-dim); font: inherit; font-weight: 600;
      padding: 7px 12px; cursor: pointer; transition: color 0.2s ease, background 0.2s ease;
    }
    /* This duplicates the same selector in Core/SiteNav.js, so it
       reads the same two variables that file publishes - otherwise
       the language strip on this page and the one in the header
       would disagree about their own ink the moment a game accent
       is anything but dark. */
    .ac-seg button[aria-pressed="true"] {
      color: var(--acn-on-accent, var(--on-accent, #fff));
      background: var(--acn-accent, var(--accent));
    }
    .ac-icon-btn {
      width: 40px; height: 40px; display: inline-flex; align-items: center; justify-content: center;
      border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--text);
      cursor: pointer; transition: transform 0.2s ease, background 0.2s ease;
    }
    .ac-icon-btn:hover { transform: translateY(-2px); }
    .ac-icon-btn svg { width: 20px; height: 20px; }
    .ac-card { max-width: 540px; width: 100%; text-align: center; }
    .ac-status-icon {
      width: 92px; height: 92px; margin: 6px auto 18px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center; border: 3px solid currentColor;
    }
    .ac-status-icon svg { width: 46px; height: 46px; }
    .ac-status-icon.ok { color: var(--ok); }
    .ac-status-icon.err { color: var(--err); }
    .ac-status-icon.warn { color: var(--warn); }
    .ac-game-name { font-size: 1.15em; font-weight: 700; margin-block: 4px 14px; color: var(--text); }
    .ac-badge {
      display: inline-flex; align-items: center; gap: 7px; padding: 6px 14px; border-radius: 20px;
      font-size: 0.85em; font-weight: 700; color: var(--ok);
      background: rgba(var(--ok-rgb), 0.16); border: 1px solid rgba(var(--ok-rgb), 0.5);
    }
    .ac-badge svg { width: 15px; height: 15px; }
    .ac-spinner {
      width: 54px; height: 54px; margin: 22px auto; border-radius: 50%;
      border: 5px solid var(--border); border-top-color: var(--accent); animation: acSpin 0.8s linear infinite;
    }
    .ac-muted { color: var(--text-dim); font-size: 0.95em; margin-block-start: 10px; }
    .ac-status-text { font-size: 1.05em; margin-block-start: 8px; }
    @keyframes acSpin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .ac-spinner { animation-duration: 0.001ms; } }
  `
}

/** The shell every auth-flow page shares. */
export function renderAuthShell({ title, lang, theme, brandColor, body, script = '', includeChrome = true }) {
  const code = resolveLang(lang)

  return `<!DOCTYPE html>
<html lang="${code}" dir="${dirFor(code)}"${themeAttribute(theme)}>
<head>
  ${getPageHead({ title, amirLogo: CONFIG.AMIR_LOGO })}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap"></noscript>
  ${themeBootScript()}
  <style>${getSharedCSS(brandColor)}${authPageCSS()}</style>
</head>
<body>
  ${includeChrome ? renderTopbar(lang) : ''}
  <div class="container ac-card">
    ${body}
  </div>
  ${includeChrome ? chromeScript() : ''}
  ${script}
</body>
</html>`
}


// ==========================================
// The pages
// ==========================================

/** Localized interstitial that forwards the browser to Google. */
export function renderRedirectPage(googleAuthUrl, game, lang, theme) {
  const body = `
    ${getLogosHTML(CONFIG.AMIR_LOGO, game.logo, game.name)}
    <h1>${escapeHtml(authText(lang, 'redirectTitle'))}</h1>
    <div class="ac-game-name">${escapeHtml(game.name)}</div>
    <div class="ac-spinner"></div>
    <p class="ac-status-text">${escapeHtml(authText(lang, 'redirectBody'))}</p>
    <p class="ac-muted">${escapeHtml(authText(lang, 'pleaseWait'))}</p>
    <div class="btn-container">
      <a class="btn" href="${escapeHtml(googleAuthUrl)}" rel="nofollow">${escapeHtml(authText(lang, 'continueManually'))}</a>
    </div>`

  const script = `<script>
    setTimeout(function(){ window.location.href = ${jsString(googleAuthUrl)}; }, ${CONFIG.REDIRECT_TIMEOUT_MS});
  </script>`

  return renderAuthShell({
    title: `${authText(lang, 'redirectTitle')} - AmirCollider Proxy`,
    lang, theme, brandColor: game.color, body, script
  })
}


/** Web and desktop callers: auto-copies the code and offers a button. */
export function renderDesktopSuccessPage(code, game, baseUrl, lang, theme) {
  const body = `
    <div class="ac-status-icon ok">${ICONS.check}</div>
    <h1>${escapeHtml(authText(lang, 'authSuccess'))}</h1>
    <div class="ac-game-name">${escapeHtml(game?.name || 'AmirCollider Games')}</div>
    <span class="ac-badge">${ICONS.lock}${escapeHtml(authText(lang, 'secureBadge'))}</span>
    <p class="ac-muted" style="margin-block-start:18px;">${escapeHtml(authText(lang, 'codeReady'))}</p>
    <div class="btn-container">
      <button type="button" class="btn" onclick="acCopyCode()">${escapeHtml(authText(lang, 'copyCode'))}</button>
      <a class="btn btn-secondary" href="${escapeHtml(baseUrl)}">${escapeHtml(authText(lang, 'backToSite'))}</a>
    </div>
    <p class="ac-muted" id="copyStatus" style="display:none;"></p>
    <p class="ac-muted" style="margin-block-start:22px;">${escapeHtml(authText(lang, 'canClose'))}</p>`

  const script = `<script>
    var authCode = ${jsString(code)};
    var copiedLabel = ${jsString(authText(lang, 'copied'))};
    function acShowCopied(){ var s=document.getElementById('copyStatus'); if(s){ s.textContent=copiedLabel; s.style.display='block'; } }
    function acFallbackCopy(text){
      var ta=document.createElement('textarea'); ta.value=text; ta.style.position='fixed'; ta.style.opacity='0';
      document.body.appendChild(ta); ta.select();
      try{ document.execCommand('copy'); acShowCopied(); }catch(e){} document.body.removeChild(ta);
    }
    window.acCopyCode=function(){
      if(navigator.clipboard&&navigator.clipboard.writeText){
        navigator.clipboard.writeText(authCode).then(acShowCopied).catch(function(){ acFallbackCopy(authCode); });
      } else { acFallbackCopy(authCode); }
    };
    acCopyCode();
  </script>`

  return renderAuthShell({
    title: `${authText(lang, 'authSuccess')} - AmirCollider Proxy`,
    lang, theme, brandColor: game?.color || '#4caf50', body, script
  })
}


/** Delivers the code to the local redirect URI a desktop build opened. */
export function renderLoopbackSuccessPage(code, localRedirectUri, game, lang, theme) {
  const callbackUrl = `${localRedirectUri}?code=${encodeURIComponent(code)}`

  const body = `
    <div class="ac-status-icon ok">${ICONS.check}</div>
    <h1>${escapeHtml(authText(lang, 'authSuccess'))}</h1>
    <div class="ac-game-name">${escapeHtml(game.name)}</div>
    <div class="ac-spinner"></div>
    <p class="ac-status-text" id="status">${escapeHtml(authText(lang, 'transferring'))}</p>
    <p class="ac-muted" style="margin-block-start:22px;">${escapeHtml(authText(lang, 'canClose'))}</p>`

  const script = `<script>
    var ready = ${jsString(authText(lang, 'gameReady'))};
    function done(){ var s=document.getElementById('status'); if(s) s.textContent=ready; }
    fetch(${jsString(callbackUrl)}).then(done).catch(done);
  </script>`

  return renderAuthShell({
    title: `${authText(lang, 'authSuccess')} - AmirCollider Proxy`,
    lang, theme, brandColor: game.color, body, script
  })
}


/** Opens the game over its deep link, with a manual fallback. */
export function renderAndroidSuccessPage(deepLink, game, lang, theme) {
  const body = `
    <div class="ac-status-icon ok">${ICONS.check}</div>
    <h1>${escapeHtml(authText(lang, 'authSuccess'))}</h1>
    <div class="ac-game-name">${escapeHtml(game?.name || 'AmirCollider Games')}</div>
    <div class="ac-spinner"></div>
    <p class="ac-status-text">${escapeHtml(authText(lang, 'returningToGame'))}</p>
    <div class="btn-container">
      <button type="button" id="manualOpen" class="btn" style="display:none;" onclick="acOpenGame()">${escapeHtml(authText(lang, 'manualReturn'))}</button>
    </div>
    <p class="ac-muted" style="margin-block-start:22px;">${escapeHtml(authText(lang, 'canClose'))}</p>`

  const script = `<script>
    var deepLink = ${jsString(deepLink)};
    function acShowManual(){ var b=document.getElementById('manualOpen'); if(b) b.style.display='inline-flex'; }
    window.acOpenGame=function(){
      try {
        window.location.href = deepLink;
        setTimeout(function(){ try{ window.open(deepLink,'_self'); }catch(e){} }, 400);
      } catch (e) { acShowManual(); }
    };
    setTimeout(function(){ acOpenGame(); setTimeout(acShowManual, 4000); }, 800);
  </script>`

  return renderAuthShell({
    title: `${authText(lang, 'authSuccess')} - ${game?.name || 'AmirCollider'}`,
    lang, theme, brandColor: game?.color || '#4caf50', body, script
  })
}


/** Google refused. The upstream code is shown, escaped. */
export function renderOAuthErrorPage(error, game, lang, theme) {
  const body = `
    <div class="ac-status-icon err">${ICONS.alert}</div>
    <h1>${escapeHtml(authText(lang, 'signInError'))}</h1>
    <p class="version-badge" style="color:var(--err);background:rgba(var(--err-rgb),0.16);border-color:rgba(var(--err-rgb),0.5);">
      ${escapeHtml(authText(lang, 'errorCode'))}: ${escapeHtml(sanitizeInput(error))}
    </p>
    <p class="ac-status-text">${escapeHtml(authText(lang, 'errorBody'))}</p>
    <p class="ac-muted">${escapeHtml(authText(lang, 'tryAgain'))}</p>
    <div class="btn-container">
      <button type="button" class="btn" onclick="window.close()">${escapeHtml(authText(lang, 'close'))}</button>
    </div>`

  return renderAuthShell({
    title: `${authText(lang, 'signInError')} - AmirCollider Proxy`,
    lang, theme, brandColor: game?.color || '#f44336', body
  })
}


/** The signed state is invalid or past its expiry window. */
export function renderExpiredPage(lang, theme) {
  const body = `
    <div class="ac-status-icon warn">${ICONS.clock}</div>
    <h1>${escapeHtml(authText(lang, 'sessionExpired'))}</h1>
    <p class="ac-status-text">${escapeHtml(authText(lang, 'expiredBody'))}</p>
    <p class="ac-muted">${escapeHtml(authText(lang, 'tryAgainShort'))}</p>
    <div class="btn-container">
      <button type="button" class="btn" onclick="window.close()">${escapeHtml(authText(lang, 'close'))}</button>
    </div>`

  return renderAuthShell({
    title: `${authText(lang, 'sessionExpired')} - AmirCollider Proxy`,
    lang, theme, brandColor: '#ff9800', body
  })
}
