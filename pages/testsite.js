// ==========================================
// pages/testsite.js
// Full Site Test Dashboard with Auth
// AmirCollider Games - Worker Proxy
// ==========================================

import { CONFIG } from '../config.js'
import { createHtmlResponse, createJsonResponse } from '../utils.js'

const AUTH_COOKIE = 'amir_testsite_auth'
const COOKIE_MAX_AGE = 60 * 60 * 2 // 2 ساعت

function isAuthenticated(request, env) {
  const cookies = request.headers.get('Cookie') || ''
  const match = cookies.match(new RegExp(`${AUTH_COOKIE}=([^;]+)`))
  if (!match) return false
  const parts = match[1].split('__')
  if (parts.length < 2) return false
  const embeddedPassword = parts.slice(1).join('__')
  return embeddedPassword === env.TestSitePassword
}

export async function handleTestSite(url, request, gameId, requestId, GAMES, env) {
  if (!isAuthenticated(request, env)) {
    return Response.redirect(`${url.origin}/testsite/login`, 302)
  }
  return createHtmlResponse(createTestDashboardPage(GAMES, url.origin, CONFIG.VERSION))
}

export async function handleTestSiteLogin(url, request, gameId, requestId, GAMES, env) {
  if (isAuthenticated(request, env)) {
    return Response.redirect(`${url.origin}/testsite`, 302)
  }
  const failed = url.searchParams.get('error') === '1'
  return createHtmlResponse(createLoginPage(url.origin, failed))
}

export async function handleTestSiteLoginPost(url, request, gameId, requestId, GAMES, env) {
  let body
  try {
    const text = await request.text()
    const params = new URLSearchParams(text)
    body = { password: params.get('password') || '' }
  } catch {
    return Response.redirect(`${url.origin}/testsite/login?error=1`, 302)
  }

  if (!env.TestSitePassword || body.password !== env.TestSitePassword) {
    return Response.redirect(`${url.origin}/testsite/login?error=1`, 302)
  }

  const sessionToken = Array.from(
    crypto.getRandomValues(new Uint8Array(32)),
    b => b.toString(16).padStart(2, '0')
  ).join('')

  return new Response(null, {
    status: 302,
    headers: {
      'Location': `${url.origin}/testsite`,
      'Set-Cookie': `${AUTH_COOKIE}=${sessionToken}__${env.TestSitePassword}; Path=/testsite; HttpOnly; Secure; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE}`
    }
  })
}

export async function handleTestSiteLogout(url, request, gameId, requestId, GAMES, env) {
  return new Response(null, {
    status: 302,
    headers: {
      'Location': `${url.origin}/testsite/login`,
      'Set-Cookie': `${AUTH_COOKIE}=; Path=/testsite; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
    }
  })
}

// ==========================================
// Page: Login
// ==========================================
function createLoginPage(baseUrl, failed = false) {
  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ورود به پنل تست - AmirCollider</title>
  <link rel="icon" href="${CONFIG.AMIR_LOGO}" type="image/png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Vazirmatn', 'Segoe UI', Tahoma, Arial, sans-serif;
      background: #080c14;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      overflow: hidden;
    }
    .bg-grid {
      position: fixed; inset: 0;
      background-image:
        linear-gradient(rgba(100,181,246,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(100,181,246,0.03) 1px, transparent 1px);
      background-size: 40px 40px;
      pointer-events: none;
    }
    .bg-glow {
      position: fixed; width: 600px; height: 600px;
      background: radial-gradient(circle, rgba(21,101,192,0.12) 0%, transparent 70%);
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      pointer-events: none;
    }
    .login-card {
      position: relative;
      background: rgba(255,255,255,0.03);
      backdrop-filter: blur(24px);
      border: 1px solid rgba(100,181,246,0.12);
      border-radius: 28px;
      padding: 52px 44px;
      width: 100%; max-width: 430px;
      box-shadow: 0 40px 100px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.07);
      animation: cardIn 0.6s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes cardIn {
      from { opacity: 0; transform: translateY(30px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    .logo-wrap { text-align: center; margin-bottom: 36px; }
    .logo-wrap img {
      width: 76px; height: 76px; border-radius: 50%;
      border: 2px solid rgba(100,181,246,0.25);
      background: #fff; object-fit: cover;
      box-shadow: 0 0 30px rgba(100,181,246,0.15);
    }
    .logo-wrap h1 { margin-top: 16px; font-size: 1.45em; font-weight: 700; color: #90caf9; }
    .logo-wrap p { font-size: 0.85em; color: rgba(255,255,255,0.35); margin-top: 6px; }
    .error-box {
      background: rgba(244,67,54,0.1); border: 1px solid rgba(244,67,54,0.25);
      border-radius: 12px; padding: 13px 16px; margin-bottom: 22px;
      font-size: 0.87em; color: #ef9a9a;
      display: ${failed ? 'flex' : 'none'}; align-items: center; gap: 8px;
      animation: shake 0.4s ease;
    }
    @keyframes shake {
      0%,100% { transform: translateX(0); }
      20%,60%  { transform: translateX(-6px); }
      40%,80%  { transform: translateX(6px); }
    }
    .field-label { display: block; font-size: 0.83em; color: rgba(255,255,255,0.5); margin-bottom: 9px; font-weight: 500; }
    .input-wrap { position: relative; margin-bottom: 28px; }
    .pw-input {
      width: 100%; padding: 14px 52px 14px 18px;
      background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
      border-radius: 14px; color: white; font-size: 1em; font-family: inherit; outline: none;
      transition: all 0.25s; letter-spacing: 0.05em;
    }
    .pw-input:focus { border-color: rgba(100,181,246,0.4); background: rgba(100,181,246,0.06); box-shadow: 0 0 0 4px rgba(100,181,246,0.08); }
    .toggle-pw {
      position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
      cursor: pointer; color: rgba(255,255,255,0.35); font-size: 1.15em;
      background: none; border: none; line-height: 1;
    }
    .btn-login {
      width: 100%; padding: 15px;
      background: linear-gradient(135deg, #1976D2, #0D47A1);
      color: white; border: none; border-radius: 14px;
      font-size: 1em; font-family: inherit; font-weight: 700;
      cursor: pointer; transition: all 0.25s;
      box-shadow: 0 6px 24px rgba(13,71,161,0.4);
    }
    .btn-login:hover { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(13,71,161,0.5); }
    .btn-login:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
    .footer-note { text-align: center; margin-top: 28px; font-size: 0.76em; color: rgba(255,255,255,0.2); }
  </style>
</head>
<body>
  <div class="bg-grid"></div>
  <div class="bg-glow"></div>
  <div class="login-card">
    <div class="logo-wrap">
      <img src="${CONFIG.AMIR_LOGO}" alt="AmirCollider">
      <h1>🔐 پنل تست سایت</h1>
      <p>AmirCollider Proxy v${CONFIG.VERSION}</p>
    </div>
    <div class="error-box"><span>⚠️</span><span>رمز عبور اشتباه است.</span></div>
    <form method="POST" action="${baseUrl}/testsite/login">
      <label class="field-label" for="password">🔑 رمز عبور</label>
      <div class="input-wrap">
        <input class="pw-input" type="password" id="password" name="password"
          placeholder="رمز عبور را وارد کنید" autocomplete="current-password" required autofocus>
        <button type="button" class="toggle-pw" onclick="togglePw()">👁</button>
      </div>
      <button type="submit" class="btn-login" id="login-btn">ورود به پنل تست</button>
    </form>
    <div class="footer-note">این صفحه فقط برای استفاده توسعه‌دهنده است</div>
  </div>
  <script>
    function togglePw() {
      const inp = document.getElementById('password');
      const btn = document.querySelector('.toggle-pw');
      inp.type = inp.type === 'password' ? 'text' : 'password';
      btn.textContent = inp.type === 'text' ? '🙈' : '👁';
    }
    document.querySelector('form').addEventListener('submit', function() {
      const btn = document.getElementById('login-btn');
      btn.textContent = '⏳ در حال ورود...';
      btn.disabled = true;
    });
  </script>
</body>
</html>`
}

// ==========================================
// Page: Test Dashboard
// ==========================================
function createTestDashboardPage(GAMES, baseUrl, version) {
  const gameIds = Object.keys(GAMES)
  const gamesList = JSON.stringify(gameIds)

  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🧪 پنل تست کامل - AmirCollider Proxy</title>
  <link rel="icon" href="${CONFIG.AMIR_LOGO}" type="image/png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --bg: #07090f; --bg2: #0c1018;
      --surface: rgba(255,255,255,0.03); --surface2: rgba(255,255,255,0.055);
      --border: rgba(255,255,255,0.07); --border2: rgba(255,255,255,0.12);
      --green: #4caf50; --green-dim: rgba(76,175,80,0.15);
      --red: #f44336; --red-dim: rgba(244,67,54,0.15);
      --yellow: #ff9800; --yellow-dim: rgba(255,152,0,0.15);
      --blue: #2196f3; --blue-dim: rgba(33,150,243,0.15);
      --text: rgba(255,255,255,0.88); --text-dim: rgba(255,255,255,0.45); --text-muted: rgba(255,255,255,0.25);
      --radius: 16px;
    }
    body { font-family: 'Vazirmatn','Segoe UI',Tahoma,Arial,sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; padding: 20px; }
    body::before {
      content: ''; position: fixed; inset: 0;
      background-image: linear-gradient(rgba(33,150,243,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(33,150,243,0.025) 1px, transparent 1px);
      background-size: 50px 50px; pointer-events: none; z-index: 0;
    }
    body > * { position: relative; z-index: 1; }

    .top-bar {
      display: flex; align-items: center; justify-content: space-between;
      background: var(--surface); border: 1px solid var(--border2);
      border-radius: var(--radius); padding: 16px 24px; margin-bottom: 24px;
      flex-wrap: wrap; gap: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.3);
    }
    .top-bar-left { display: flex; align-items: center; gap: 14px; }
    .top-bar-left img { width: 42px; height: 42px; border-radius: 50%; background: #fff; object-fit: cover; border: 2px solid rgba(100,181,246,0.2); }
    .top-bar-left h1 { font-size: 1.2em; font-weight: 700; color: #90caf9; }
    .top-bar-left span { font-size: 0.82em; color: var(--text-dim); }
    .top-bar-right { display: flex; gap: 10px; align-items: center; }
    .logout-btn {
      background: rgba(244,67,54,0.1); border: 1px solid rgba(244,67,54,0.2);
      color: #ef9a9a; padding: 8px 18px; border-radius: 10px;
      cursor: pointer; font-size: 0.87em; font-family: inherit; font-weight: 600; transition: all 0.2s;
    }
    .logout-btn:hover { background: rgba(244,67,54,0.2); }

    .summary-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 24px; }
    .summary-card {
      background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
      padding: 18px 14px; text-align: center; transition: border-color 0.3s;
    }
    .summary-card .s-num { font-size: 2em; font-weight: 700; margin-bottom: 5px; }
    .summary-card .s-label { font-size: 0.78em; color: var(--text-dim); }

    .progress-wrap { background: rgba(255,255,255,0.04); border-radius: 99px; height: 5px; margin-bottom: 20px; overflow: hidden; display: none; }
    .progress-fill { height: 100%; background: linear-gradient(90deg, #1976d2, #42a5f5); border-radius: 99px; width: 0%; transition: width 0.3s ease; }

    .controls {
      display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
      background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
      padding: 14px 20px; margin-bottom: 20px;
    }
    .controls-title { font-size: 0.87em; color: var(--text-dim); margin-left: auto; }
    .btn {
      padding: 9px 20px; border: none; border-radius: 10px;
      cursor: pointer; font-size: 0.87em; font-family: inherit; font-weight: 600; transition: all 0.2s;
    }
    .btn-run  { background: rgba(25,118,210,0.2); border: 1px solid rgba(25,118,210,0.35); color: #64b5f6; }
    .btn-run:hover  { background: rgba(25,118,210,0.35); }
    .btn-reset { background: rgba(255,152,0,0.12); border: 1px solid rgba(255,152,0,0.25); color: #ffcc80; }
    .btn-reset:hover { background: rgba(255,152,0,0.25); }
    .btn-ai { background: rgba(156,39,176,0.12); border: 1px solid rgba(156,39,176,0.25); color: #ce93d8; }
    .btn-ai:hover:not(:disabled) { background: rgba(156,39,176,0.25); }
    .btn:disabled { opacity: 0.45; cursor: not-allowed; }

    .section {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); margin-bottom: 14px; overflow: hidden;
    }
    .section-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 15px 22px; cursor: pointer; user-select: none; transition: background 0.2s;
    }
    .section-header:hover { background: rgba(255,255,255,0.02); }
    .section-header-left { display: flex; align-items: center; gap: 10px; }
    .section-header-left h3 { font-size: 0.95em; font-weight: 600; }
    .section-header-right { display: flex; align-items: center; gap: 10px; }
    .toggle-arrow { color: var(--text-muted); font-size: 0.75em; transition: transform 0.25s; }
    .toggle-arrow.open { transform: rotate(90deg); }

    .badge { font-size: 0.72em; padding: 3px 10px; border-radius: 99px; font-weight: 600; }
    .badge-pending { background: rgba(255,255,255,0.06); color: var(--text-muted); }
    .badge-running { background: rgba(33,150,243,0.18); color: #64b5f6; }
    .badge-pass    { background: rgba(76,175,80,0.18); color: #81c784; }
    .badge-fail    { background: rgba(244,67,54,0.18); color: #ef9a9a; }
    .badge-partial { background: rgba(255,152,0,0.18); color: #ffcc80; }

    .section-body { padding: 8px 22px 16px; border-top: 1px solid var(--border); }

    .test-item {
      display: flex; align-items: flex-start; gap: 13px;
      padding: 11px 0; border-bottom: 1px solid rgba(255,255,255,0.03);
    }
    .test-item:last-child { border-bottom: none; }
    .test-icon { font-size: 1.2em; min-width: 26px; text-align: center; margin-top: 1px; }
    .test-info { flex: 1; min-width: 0; }
    .test-name { font-size: 0.9em; font-weight: 600; margin-bottom: 3px; }
    .test-desc { font-size: 0.77em; color: var(--text-dim); }
    .detail-log {
      background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.06);
      border-radius: 8px; padding: 10px 13px; margin-top: 7px;
      font-family: 'Courier New', monospace; font-size: 0.76em; color: #a5d6a7;
      max-height: 100px; overflow-y: auto; line-height: 1.65; display: none; white-space: pre-wrap;
    }
    .detail-log.visible { display: block; }
    .test-result {
      font-size: 0.8em; padding: 5px 12px; border-radius: 8px;
      min-width: 88px; text-align: center; font-weight: 600;
      border: 1px solid var(--border); background: rgba(255,255,255,0.03);
      color: var(--text-dim); white-space: nowrap; flex-shrink: 0;
    }
    .test-result.running { color: #64b5f6; animation: pulse 1.2s ease-in-out infinite; }
    .test-result.pass    { background: var(--green-dim); border-color: rgba(76,175,80,0.25); color: #81c784; }
    .test-result.fail    { background: var(--red-dim); border-color: rgba(244,67,54,0.25); color: #ef9a9a; }
    .test-result.warn    { background: var(--yellow-dim); border-color: rgba(255,152,0,0.25); color: #ffcc80; }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }

    .ai-panel {
      background: linear-gradient(135deg, rgba(106,27,154,0.08), rgba(156,39,176,0.05));
      border: 1px solid rgba(156,39,176,0.2); border-radius: var(--radius); padding: 20px 24px; margin-bottom: 14px;
    }
    .ai-panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; font-weight: 700; color: #ce93d8; }
    .ai-close-btn { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.1em; }
    .ai-output {
      background: rgba(0,0,0,0.35); border: 1px solid rgba(156,39,176,0.15);
      border-radius: 10px; padding: 16px 18px; font-size: 0.87em; color: #e1bee7;
      line-height: 1.85; white-space: pre-wrap; max-height: 380px; overflow-y: auto;
    }
    .ai-thinking { display: flex; align-items: center; gap: 10px; color: #ce93d8; }
    .ai-dots span {
      display: inline-block; width: 6px; height: 6px; border-radius: 50%;
      background: #9c27b0; margin: 0 2px; animation: dotBounce 1.2s ease-in-out infinite;
    }
    .ai-dots span:nth-child(2) { animation-delay: 0.2s; }
    .ai-dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes dotBounce { 0%,80%,100% { transform: scale(0.7); opacity: 0.5; } 40% { transform: scale(1.1); opacity: 1; } }

    .manual-panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px 24px; margin-bottom: 14px; }
    .manual-panel h2 { font-size: 1em; font-weight: 700; margin-bottom: 18px; }
    .manual-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; align-items: center; }
    .manual-row.top-align { align-items: flex-start; }
    .manual-row label { font-size: 0.82em; color: var(--text-dim); min-width: 100px; padding-top: 9px; }
    select, input[type="text"] {
      background: rgba(255,255,255,0.05); border: 1px solid var(--border2);
      border-radius: 9px; padding: 9px 13px; color: white; font-size: 0.88em; font-family: inherit; outline: none;
    }
    textarea {
      flex: 1; min-width: 200px; background: rgba(255,255,255,0.05);
      border: 1px solid var(--border2); border-radius: 9px; padding: 9px 13px;
      color: white; font-size: 0.86em; font-family: 'Courier New', monospace; outline: none; resize: vertical;
    }
    .manual-output {
      background: rgba(0,0,0,0.35); border: 1px solid var(--border);
      border-radius: 10px; padding: 14px 16px; font-family: 'Courier New', monospace;
      font-size: 0.8em; color: #b0bec5; max-height: 240px; overflow-y: auto;
      margin-top: 14px; white-space: pre-wrap; display: none; line-height: 1.65;
    }
    .toast {
      position: fixed; bottom: 28px; left: 50%; transform: translate(-50%, 8px);
      padding: 11px 22px; border-radius: 10px; font-weight: 600; font-size: 0.88em;
      z-index: 9999; box-shadow: 0 12px 35px rgba(0,0,0,0.45);
      opacity: 0; pointer-events: none; transition: opacity 0.3s, transform 0.3s; font-family: inherit;
    }
    .toast.show { opacity: 1; transform: translate(-50%, 0); pointer-events: auto; }
    .toast.hide { opacity: 0; transform: translate(-50%, 8px); }

    @media (max-width: 700px) {
      body { padding: 12px; }
      .summary-grid { grid-template-columns: repeat(3, 1fr); }
    }
    @media (max-width: 450px) {
      .summary-grid { grid-template-columns: repeat(2, 1fr); }
    }
  </style>
</head>
<body>

  <div class="top-bar">
    <div class="top-bar-left">
      <img src="${CONFIG.AMIR_LOGO}" alt="Logo">
      <div>
        <h1>🧪 پنل تست کامل</h1>
        <span>AmirCollider Proxy v${version}</span>
      </div>
    </div>
    <div class="top-bar-right">
      <form method="POST" action="${baseUrl}/testsite/logout">
        <button type="submit" class="logout-btn">🚪 خروج</button>
      </form>
    </div>
  </div>

  <div class="summary-grid">
    <div class="summary-card"><div class="s-num" id="s-total" style="color:#64b5f6;">0</div><div class="s-label">کل تست‌ها</div></div>
    <div class="summary-card"><div class="s-num" id="s-pass" style="color:var(--green);">0</div><div class="s-label">✅ موفق</div></div>
    <div class="summary-card"><div class="s-num" id="s-fail" style="color:var(--red);">0</div><div class="s-label">❌ ناموفق</div></div>
    <div class="summary-card"><div class="s-num" id="s-warn" style="color:var(--yellow);">0</div><div class="s-label">⚠️ هشدار</div></div>
    <div class="summary-card"><div class="s-num" id="s-time" style="color:#ce93d8;">—</div><div class="s-label">⏱ مدت اجرا</div></div>
  </div>

  <div class="progress-wrap" id="progress-wrap">
    <div class="progress-fill" id="progress-fill"></div>
  </div>

  <div class="controls">
    <button class="btn btn-run" id="btn-auto" onclick="runAllTests()">▶ اجرای همه تست‌ها</button>
    <button class="btn btn-reset" onclick="resetAll()">↺ بازنشانی</button>
    <button class="btn btn-ai" id="btn-ai" onclick="runAiAnalysis()" disabled>🤖 تحلیل AI</button>
    <span class="controls-title">🎛️ کنترل‌های تست</span>
  </div>

  <div class="ai-panel" id="ai-panel" style="display:none;">
    <div class="ai-panel-header">
      <span>🤖 تحلیل هوش مصنوعی (Claude)</span>
      <button class="ai-close-btn" onclick="document.getElementById('ai-panel').style.display='none'">✕</button>
    </div>
    <div class="ai-output" id="ai-output"></div>
  </div>

  <!-- 1. System -->
  <div class="section" id="sec-system">
    <div class="section-header" onclick="toggleSection('system')">
      <div class="section-header-left"><h3>⚙️ تست‌های سیستم پایه</h3></div>
      <div class="section-header-right">
        <span class="badge badge-pending" id="badge-system">در انتظار</span>
        <span class="toggle-arrow open" id="arrow-system">▶</span>
      </div>
    </div>
    <div class="section-body" id="body-system">
      ${buildTestItem('sys-metrics',       '📊', 'Metrics Endpoint',           'بررسی /metrics — version، games، endpoints')}
      ${buildTestItem('sys-404',           '🔍', '404 Handler',                'مسیر نامعتبر باید 404 برگرداند')}
      ${buildTestItem('sys-405',           '🚫', 'Method Not Allowed (405)',   'DELETE به /metrics باید 405 برگرداند')}
      ${buildTestItem('sys-cors',          '🌐', 'CORS Headers',               'وجود Access-Control-Allow-Origin در پاسخ')}
      ${buildTestItem('sys-cors-preflight','🔀', 'CORS Preflight (OPTIONS)',   'پاسخ صحیح به OPTIONS request')}
      ${buildTestItem('sys-content-type',  '📋', 'Content-Type Validation',    '/metrics باید application/json باشد')}
      ${buildTestItem('sys-security',      '🛡️', 'Security Headers',           'X-Content-Type, X-Frame-Options, X-XSS, HSTS')}
      ${buildTestItem('sys-request-id',    '🔖', 'Request ID Header',          'پاسخ باید X-Request-ID داشته باشد')}
      ${buildTestItem('sys-proxy-version', '🏷️', 'Proxy Version Header',       'پاسخ باید X-Proxy-Version داشته باشد')}
      ${buildTestItem('sys-response-time', '⏱️', 'Response Time',              'سرعت پاسخ /metrics زیر 500ms عالی، زیر 2s قابل قبول')}
    </div>
  </div>

  <!-- 2. Per-Game Tests -->
  ${gameIds.map(id => `
  <div class="section" id="sec-${id}">
    <div class="section-header" onclick="toggleSection('${id}')">
      <div class="section-header-left"><h3>🎮 بازی: ${id}</h3></div>
      <div class="section-header-right">
        <span class="badge badge-pending" id="badge-${id}">در انتظار</span>
        <span class="toggle-arrow open" id="arrow-${id}">▶</span>
      </div>
    </div>
    <div class="section-body" id="body-${id}">
      ${buildTestItem(`${id}-health`,      '🩺', 'Health Check',           `GET /${id}/health — بررسی status و ساختار JSON`)}
      ${buildTestItem(`${id}-ping`,        '📡', 'Ping Test',              `GET /${id}/ping — latency و کیفیت اتصال`)}
      ${buildTestItem(`${id}-leaderboard`, '🏆', 'Leaderboard',           `GET /${id}/leaderboard — لیست بازیکنان و ساختار`)}
      ${buildTestItem(`${id}-lb-limit`,    '🔢', 'Leaderboard با Limit',  `GET /${id}/leaderboard/5 — محدودیت تعداد نتایج`)}
      ${buildTestItem(`${id}-privacy`,     '🔒', 'Privacy Page',          `GET /${id}/privacy — HTML 200 با Content-Type صحیح`)}
      ${buildTestItem(`${id}-terms`,       '📜', 'Terms Page',            `GET /${id}/terms — HTML 200 با Content-Type صحیح`)}
    </div>
  </div>
  `).join('')}

  <!-- 3. Auth Tests -->
  <div class="section" id="sec-auth">
    <div class="section-header" onclick="toggleSection('auth')">
      <div class="section-header-left"><h3>🔐 تست‌های Auth Endpoints</h3></div>
      <div class="section-header-right">
        <span class="badge badge-pending" id="badge-auth">در انتظار</span>
        <span class="toggle-arrow open" id="arrow-auth">▶</span>
      </div>
    </div>
    <div class="section-body" id="body-auth">
      ${buildTestItem('auth-validate-no-token', '✅', 'Validate — بدون توکن',      'POST /auth/validate بدون Authorization باید 401 برگرداند')}
      ${buildTestItem('auth-validate-no-uid',   '🔍', 'Validate — بدون uid',       'POST /auth/validate با توکن ولی بدون uid باید 400 برگرداند')}
      ${buildTestItem('auth-refresh-empty',     '🔄', 'Refresh — بدون توکن',       'POST /auth/refresh بدون refreshToken باید 400 برگرداند')}
      ${buildTestItem('auth-check-no-body',     '👤', 'Check User — body خالی',    'POST /auth/check بدون uid باید 400 برگرداند')}
      ${buildTestItem('auth-check-no-token',    '🚫', 'Check User — بدون token',   'POST /auth/check با uid ولی بدون Authorization باید 401 برگرداند')}
      ${buildTestItem('auth-google-no-token',   '🔑', 'Google Auth — بدون idToken','POST /auth/google بدون idToken باید 400 برگرداند')}
    </div>
  </div>

  <!-- 4. OAuth Tests -->
  <div class="section" id="sec-oauth">
    <div class="section-header" onclick="toggleSection('oauth')">
      <div class="section-header-left"><h3>🌐 تست‌های OAuth Flow</h3></div>
      <div class="section-header-right">
        <span class="badge badge-pending" id="badge-oauth">در انتظار</span>
        <span class="toggle-arrow open" id="arrow-oauth">▶</span>
      </div>
    </div>
    <div class="section-body" id="body-oauth">
      ${buildTestItem('oauth-auth-no-redirect',   '🔗', 'OAuth Auth — بدون redirect_uri', 'GET /oauth/auth بدون redirect_uri باید 400 برگرداند')}
      ${buildTestItem('oauth-auth-with-redirect',  '🚀', 'OAuth Auth — با redirect_uri',  'GET /oauth/auth با redirect_uri باید صفحه HTML برگرداند')}
      ${buildTestItem('oauth-token-no-code',       '🎫', 'Token Exchange — بدون code',    'POST /oauth/token بدون code باید 400 برگرداند')}
      ${buildTestItem('oauth-callback-no-params',  '📬', 'OAuth Callback — بدون params',  'GET /oauth/callback بدون code/state باید 400 برگرداند')}
    </div>
  </div>

  <!-- 5. Database Tests -->
  <div class="section" id="sec-db">
    <div class="section-header" onclick="toggleSection('db')">
      <div class="section-header-left"><h3>🗄️ تست‌های Database (Auth Check)</h3></div>
      <div class="section-header-right">
        <span class="badge badge-pending" id="badge-db">در انتظار</span>
        <span class="toggle-arrow open" id="arrow-db">▶</span>
      </div>
    </div>
    <div class="section-body" id="body-db">
      ${buildTestItem('db-get-unauth',   '📥', 'GET بدون توکن',    'GET /database/get/private/data — باید 401 برگرداند')}
      ${buildTestItem('db-set-unauth',   '📤', 'SET بدون توکن',    'POST /database/set/test — باید 401 برگرداند')}
      ${buildTestItem('db-patch-unauth', '✏️', 'PATCH بدون توکن',  'POST /database/patch/test — باید 401 برگرداند')}
    </div>
  </div>

  <!-- 6. D1 Tests -->
  <div class="section" id="sec-d1">
    <div class="section-header" onclick="toggleSection('d1')">
      <div class="section-header-left"><h3>🗃️ تست‌های D1 Database (neon-katana)</h3></div>
      <div class="section-header-right">
        <span class="badge badge-pending" id="badge-d1">در انتظار</span>
        <span class="toggle-arrow open" id="arrow-d1">▶</span>
      </div>
    </div>
    <div class="section-body" id="body-d1">
      ${buildTestItem('d1-connection',    '🔌', 'D1 اتصال',                  'GET /neon-katana/leaderboard — بررسی اتصال به D1')}
      ${buildTestItem('d1-schema',        '📋', 'D1 Schema Validation',       'بررسی فیلدهای rank, username, displayName, highScore')}
      ${buildTestItem('d1-limit',         '🔢', 'D1 Leaderboard Limit',       'GET /neon-katana/leaderboard/3 — باید حداکثر 3 نتیجه برگرداند')}
      ${buildTestItem('d1-empty-user',    '👤', 'D1 کاربر ناموجود',           'GET /database/get/games/neon-katana/users/nonexistent999 — باید 404 برگرداند')}
      ${buildTestItem('d1-get-unauth',    '🔒', 'D1 GET بدون توکن',          'GET /database/get/games/neon-katana/users/test — باید 401 برگرداند')}
      ${buildTestItem('d1-set-unauth',    '🔒', 'D1 SET بدون توکن',          'POST /database/set/games/neon-katana/users/test — باید 401 برگرداند')}
      ${buildTestItem('d1-patch-unauth',  '🔒', 'D1 PATCH بدون توکن',        'POST /database/patch/games/neon-katana/users/test — باید 401 برگرداند')}
      ${buildTestItem('d1-score-invalid', '❌', 'D1 امتیاز نامعتبر',         'POST /database/set highScore با عدد منفی — باید 400 برگرداند')}
      ${buildTestItem('d1-unknown-path',  '🛤️', 'D1 مسیر ناشناخته',          'GET /database/get/games/neon-katana/unknown — باید 400 برگرداند')}
    </div>
  </div>

  <!-- Manual Test Panel -->
  <div class="manual-panel">
    <h2>🖐 تست دستی</h2>
    <div class="manual-row">
      <label>Method:</label>
      <select id="m-method">
        <option>GET</option><option>POST</option><option>PUT</option>
        <option>PATCH</option><option>DELETE</option><option>OPTIONS</option>
      </select>
    </div>
    <div class="manual-row">
      <label>Endpoint:</label>
      <input type="text" id="m-endpoint" placeholder="/neon-katana/health" style="flex:1; min-width:200px;">
    </div>
    <div class="manual-row">
      <label>Headers:</label>
      <input type="text" id="m-headers" placeholder='{"Authorization":"Bearer ..."}' style="flex:1; min-width:200px;">
    </div>
    <div class="manual-row top-align">
      <label>Body (JSON):</label>
      <textarea id="m-body" placeholder='{"key":"value"}' rows="4"></textarea>
    </div>
    <button class="btn btn-run" onclick="runManualTest()">▶ اجرای تست دستی</button>
    <div class="manual-output" id="manual-output"></div>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    const BASE_URL = '${baseUrl}';
    const GAME_IDS = ${gamesList};
    let stats = { total: 0, pass: 0, fail: 0, warn: 0 };
    let startTime = null;
    let _toastTimer = null;

    function toggleSection(id) {
      const body  = document.getElementById('body-' + id);
      const arrow = document.getElementById('arrow-' + id);
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : 'block';
      if (arrow) arrow.classList.toggle('open', !isOpen);
    }

    function showToast(msg, type = 'info') {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.style.background =
        type === 'pass' ? 'rgba(46,125,50,0.95)' :
        type === 'fail' ? 'rgba(183,28,28,0.95)' :
        type === 'warn' ? 'rgba(230,81,0,0.95)'  : 'rgba(13,71,161,0.95)';
      t.classList.remove('hide'); t.classList.add('show');
      if (_toastTimer) clearTimeout(_toastTimer);
      _toastTimer = setTimeout(() => { t.classList.remove('show'); t.classList.add('hide'); }, 3200);
    }

    function updateSummary() {
      document.getElementById('s-total').textContent = stats.total;
      document.getElementById('s-pass').textContent  = stats.pass;
      document.getElementById('s-fail').textContent  = stats.fail;
      document.getElementById('s-warn').textContent  = stats.warn;
      if (startTime) document.getElementById('s-time').textContent = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
    }

    function recordResult(status) {
      stats.total++;
      if (status === 'pass') stats.pass++;
      else if (status === 'fail') stats.fail++;
      else if (status === 'warn') stats.warn++;
      updateSummary();
    }

    function setResult(testId, status, message) {
      const el  = document.getElementById('res-' + testId);
      const log = document.getElementById('log-' + testId);
      if (!el) return;
      el.className = 'test-result ' + status;
      el.textContent =
        status === 'pass'    ? '✅ موفق'        :
        status === 'fail'    ? '❌ ناموفق'      :
        status === 'warn'    ? '⚠️ هشدار'       :
        status === 'running' ? '⏳ در حال اجرا' : '—';
      if (message && log) { log.textContent = message; log.classList.add('visible'); }
    }

    function setSectionBadge(secId, status) {
      const badge = document.getElementById('badge-' + secId);
      if (!badge) return;
      badge.className = 'badge badge-' + status;
      badge.textContent =
        status === 'pass'    ? 'همه موفق'    :
        status === 'fail'    ? 'خطا'         :
        status === 'partial' ? 'ناقص'        :
        status === 'running' ? 'در حال اجرا' : 'در انتظار';
    }

    function updateSectionBadge(secId) {
      const body = document.getElementById('body-' + secId);
      if (!body) return;
      const results = body.querySelectorAll('.test-result');
      let pass = 0, fail = 0, warn = 0, pending = 0;
      results.forEach(r => {
        if (r.classList.contains('pass'))      pass++;
        else if (r.classList.contains('fail')) fail++;
        else if (r.classList.contains('warn')) warn++;
        else pending++;
      });
      if (pending > 0 && pass === 0 && fail === 0 && warn === 0) return;
      if (fail > 0)       setSectionBadge(secId, 'fail');
      else if (warn > 0)  setSectionBadge(secId, 'partial');
      else                setSectionBadge(secId, 'pass');
    }

    async function fetchTest(url, options = {}) {
      const t0 = Date.now();
      try {
        const res = await fetch(url, { ...options, redirect: 'manual' });
        return { ok: true, status: res.status, ping: Date.now() - t0, headers: res.headers, res };
      } catch (e) {
        return { ok: false, error: e.message, ping: Date.now() - t0 };
      }
    }

    // ============================================================
    // RUN ALL
    // ============================================================
    async function runAllTests() {
      resetAll();
      startTime = Date.now();
      document.getElementById('btn-auto').disabled = true;
      document.getElementById('btn-ai').disabled   = true;
      document.getElementById('progress-wrap').style.display = 'block';

      const allTests = [
        // System
        testMetrics, test404, test405, testCors, testCorsPreflight,
        testContentType, testSecurityHeaders, testRequestId, testProxyVersion, testResponseTime,
        // Per-game
        ...GAME_IDS.flatMap(id => [
          () => testGameHealth(id),
          () => testGamePing(id),
          () => testGameLeaderboard(id),
          () => testGameLeaderboardLimit(id),
          () => testGamePrivacy(id),
          () => testGameTerms(id)
        ]),
        // Auth
        testAuthValidateNoToken, testAuthValidateNoUid,
        testAuthRefreshEmpty, testAuthCheckNoBody,
        testAuthCheckNoToken, testAuthGoogleNoToken,
        // OAuth
        testOAuthAuthNoRedirect, testOAuthAuthWithRedirect,
        testOAuthTokenNoCode, testOAuthCallbackNoParams,
        // DB
        testDbGetUnauth, testDbSetUnauth, testDbPatchUnauth,
        // D1
        testD1Connection, testD1Schema, testD1Limit,
        testD1EmptyUser, testD1GetUnauth, testD1SetUnauth,
        testD1PatchUnauth, testD1ScoreInvalid, testD1UnknownPath
      ];

      const total = allTests.length;
      for (let i = 0; i < total; i++) {
        await allTests[i]();
        const pct = Math.round(((i + 1) / total) * 100);
        document.getElementById('progress-fill').style.width = pct + '%';
        document.getElementById('s-time').textContent = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
      }

      document.getElementById('btn-auto').disabled = false;
      document.getElementById('btn-ai').disabled   = false;
      document.getElementById('btn-ai').title      = 'تحلیل نتایج با هوش مصنوعی';
      showToast('✅ همه تست‌ها اجرا شدند', 'pass');
    }

    function resetAll() {
      stats = { total: 0, pass: 0, fail: 0, warn: 0 };
      startTime = null;
      ['s-total','s-pass','s-fail','s-warn'].forEach(id => document.getElementById(id).textContent = '0');
      document.getElementById('s-time').textContent = '—';
      document.getElementById('progress-fill').style.width = '0%';
      document.getElementById('progress-wrap').style.display = 'none';
      document.getElementById('ai-panel').style.display = 'none';
      document.getElementById('btn-ai').disabled = true;
      document.querySelectorAll('.test-result').forEach(el => { el.className = 'test-result'; el.textContent = '—'; });
      document.querySelectorAll('.detail-log').forEach(el => { el.textContent = ''; el.classList.remove('visible'); });
      document.querySelectorAll('.badge').forEach(el => { el.className = 'badge badge-pending'; el.textContent = 'در انتظار'; });
    }

    // ============================================================
    // SYSTEM TESTS
    // ============================================================
    async function testMetrics() {
      setResult('sys-metrics', 'running'); setSectionBadge('system', 'running');
      const r = await fetchTest(BASE_URL + '/metrics', { headers: { 'Accept': 'application/json' } });
      if (!r.ok) { setResult('sys-metrics', 'fail', '❌ fetch error: ' + r.error); recordResult('fail'); updateSectionBadge('system'); return; }
      if (r.status !== 200) { setResult('sys-metrics', 'fail', '❌ HTTP ' + r.status); recordResult('fail'); updateSectionBadge('system'); return; }
      try {
        const d = await r.res.json();
        if (!d.version) throw new Error('فیلد version موجود نیست');
        if (d.games === undefined) throw new Error('فیلد games موجود نیست');
        if (!d.endpoints) throw new Error('فیلد endpoints موجود نیست');
        if (!d.security) throw new Error('فیلد security موجود نیست');
        setResult('sys-metrics', 'pass', \`✅ v\${d.version} | \${d.games} بازی | \${d.endpoints} endpoint | \${r.ping}ms\`);
        recordResult('pass');
      } catch (e) {
        setResult('sys-metrics', 'fail', '❌ ' + e.message); recordResult('fail');
      }
      updateSectionBadge('system');
    }

    async function test404() {
      setResult('sys-404', 'running');
      const r = await fetchTest(BASE_URL + '/this-route-xyz-does-not-exist-12345');
      if (!r.ok) { setResult('sys-404', 'fail', '❌ ' + r.error); recordResult('fail'); updateSectionBadge('system'); return; }
      if (r.status === 404) { setResult('sys-404', 'pass', '✅ 404 صحیح | ' + r.ping + 'ms'); recordResult('pass'); }
      else { setResult('sys-404', 'warn', '⚠️ انتظار 404 ولی HTTP ' + r.status); recordResult('warn'); }
      updateSectionBadge('system');
    }

    async function test405() {
      setResult('sys-405', 'running');
      const r = await fetchTest(BASE_URL + '/metrics', { method: 'DELETE' });
      if (!r.ok) { setResult('sys-405', 'fail', '❌ ' + r.error); recordResult('fail'); updateSectionBadge('system'); return; }
      if (r.status === 405) { setResult('sys-405', 'pass', '✅ 405 Method Not Allowed | ' + r.ping + 'ms'); recordResult('pass'); }
      else if (r.status === 404) { setResult('sys-405', 'warn', '⚠️ HTTP 404 (قابل قبول ولی 405 بهتر)'); recordResult('warn'); }
      else { setResult('sys-405', 'fail', '❌ انتظار 405، HTTP ' + r.status + ' آمد'); recordResult('fail'); }
      updateSectionBadge('system');
    }

    async function testCors() {
      setResult('sys-cors', 'running');
      const r = await fetchTest(BASE_URL + '/metrics');
      if (!r.ok) { setResult('sys-cors', 'fail', '❌ ' + r.error); recordResult('fail'); updateSectionBadge('system'); return; }
      const acao = r.headers.get('Access-Control-Allow-Origin');
      if (acao) { setResult('sys-cors', 'pass', '✅ ACAO: ' + acao + ' | ' + r.ping + 'ms'); recordResult('pass'); }
      else { setResult('sys-cors', 'fail', '❌ Access-Control-Allow-Origin وجود ندارد'); recordResult('fail'); }
      updateSectionBadge('system');
    }

    async function testCorsPreflight() {
      setResult('sys-cors-preflight', 'running');
      const r = await fetchTest(BASE_URL + '/metrics', {
        method: 'OPTIONS',
        headers: { 'Origin': 'https://example.com', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Content-Type, Authorization' }
      });
      if (!r.ok) { setResult('sys-cors-preflight', 'fail', '❌ ' + r.error); recordResult('fail'); updateSectionBadge('system'); return; }
      const allowOrigin  = r.headers.get('Access-Control-Allow-Origin');
      const allowMethods = r.headers.get('Access-Control-Allow-Methods');
      if (allowOrigin) {
        setResult('sys-cors-preflight', 'pass', \`✅ ACAO: \${allowOrigin} | Methods: \${allowMethods || 'نامشخص'} | \${r.ping}ms\`);
        recordResult('pass');
      } else {
        setResult('sys-cors-preflight', 'warn', '⚠️ CORS preflight header ندارد');
        recordResult('warn');
      }
      updateSectionBadge('system');
    }

    async function testContentType() {
      setResult('sys-content-type', 'running');
      const r = await fetchTest(BASE_URL + '/metrics', { headers: { 'Accept': 'application/json' } });
      if (!r.ok) { setResult('sys-content-type', 'fail', '❌ ' + r.error); recordResult('fail'); updateSectionBadge('system'); return; }
      const ct = r.headers.get('Content-Type') || '';
      if (ct.includes('application/json')) { setResult('sys-content-type', 'pass', '✅ ' + ct); recordResult('pass'); }
      else { setResult('sys-content-type', 'fail', '❌ Content-Type نادرست: ' + (ct || 'موجود نیست')); recordResult('fail'); }
      updateSectionBadge('system');
    }

    async function testSecurityHeaders() {
      setResult('sys-security', 'running');
      const r = await fetchTest(BASE_URL + '/metrics');
      if (!r.ok) { setResult('sys-security', 'fail', '❌ ' + r.error); recordResult('fail'); updateSectionBadge('system'); return; }
      const needed = ['X-Content-Type-Options', 'X-Frame-Options', 'X-XSS-Protection', 'Strict-Transport-Security'];
      const missing = needed.filter(h => !r.headers.get(h));
      if (missing.length === 0) { setResult('sys-security', 'pass', '✅ همه Security Headers موجودند | ' + r.ping + 'ms'); recordResult('pass'); }
      else { setResult('sys-security', 'warn', '⚠️ غایب: ' + missing.join(', ')); recordResult('warn'); }
      updateSectionBadge('system');
    }

    async function testRequestId() {
      setResult('sys-request-id', 'running');
      const r = await fetchTest(BASE_URL + '/metrics');
      if (!r.ok) { setResult('sys-request-id', 'fail', '❌ ' + r.error); recordResult('fail'); updateSectionBadge('system'); return; }
      const rid = r.headers.get('X-Request-ID');
      if (rid) { setResult('sys-request-id', 'pass', '✅ X-Request-ID: ' + rid.substring(0, 20) + '...'); recordResult('pass'); }
      else { setResult('sys-request-id', 'fail', '❌ X-Request-ID header موجود نیست'); recordResult('fail'); }
      updateSectionBadge('system');
    }

    async function testProxyVersion() {
      setResult('sys-proxy-version', 'running');
      const r = await fetchTest(BASE_URL + '/metrics');
      if (!r.ok) { setResult('sys-proxy-version', 'fail', '❌ ' + r.error); recordResult('fail'); updateSectionBadge('system'); return; }
      const ver = r.headers.get('X-Proxy-Version');
      if (ver) { setResult('sys-proxy-version', 'pass', '✅ X-Proxy-Version: ' + ver); recordResult('pass'); }
      else { setResult('sys-proxy-version', 'fail', '❌ X-Proxy-Version header موجود نیست'); recordResult('fail'); }
      updateSectionBadge('system');
    }

    async function testResponseTime() {
      setResult('sys-response-time', 'running');
      const r = await fetchTest(BASE_URL + '/metrics', { headers: { 'Accept': 'application/json' } });
      if (!r.ok) { setResult('sys-response-time', 'fail', '❌ ' + r.error); recordResult('fail'); updateSectionBadge('system'); return; }
      if (r.ping < 500) { setResult('sys-response-time', 'pass', \`✅ \${r.ping}ms — عالی\`); recordResult('pass'); }
      else if (r.ping < 2000) { setResult('sys-response-time', 'warn', \`⚠️ \${r.ping}ms — کند\`); recordResult('warn'); }
      else { setResult('sys-response-time', 'fail', \`❌ \${r.ping}ms — بیش از حد کند (> 2s)\`); recordResult('fail'); }
      updateSectionBadge('system');
    }

    // ============================================================
    // PER-GAME TESTS
    // ============================================================
    async function testGameHealth(id) {
      const key = id + '-health';
      setResult(key, 'running'); setSectionBadge(id, 'running');
      const r = await fetchTest(BASE_URL + '/' + id + '/health', { headers: { 'Accept': 'application/json' } });
      if (!r.ok) { setResult(key, 'fail', '❌ ' + r.error); recordResult('fail'); updateSectionBadge(id); return; }
      if (r.status === 200) {
        try {
          const d = await r.res.json();
          if (!d.status) throw new Error('فیلد status موجود نیست');
          if (!d.version) throw new Error('فیلد version موجود نیست');
          const s = r.ping > 500 ? 'warn' : 'pass';
          setResult(key, s, (s==='pass'?'✅':'⚠️') + ' ' + d.status + ' | v' + d.version + ' | ' + r.ping + 'ms');
          recordResult(s);
        } catch (e) { setResult(key, 'fail', '❌ ساختار JSON نادرست: ' + e.message); recordResult('fail'); }
      } else { setResult(key, 'fail', '❌ HTTP ' + r.status); recordResult('fail'); }
      updateSectionBadge(id);
    }

    async function testGamePing(id) {
      const key = id + '-ping';
      setResult(key, 'running');
      const r = await fetchTest(BASE_URL + '/' + id + '/ping', { headers: { 'Accept': 'application/json' } });
      if (!r.ok) { setResult(key, 'fail', '❌ ' + r.error); recordResult('fail'); updateSectionBadge(id); return; }
      if (r.status === 200) {
        try {
          const d = await r.res.json();
          if (!d.ping && d.ping !== 0) throw new Error('فیلد ping موجود نیست');
          if (!d.quality) throw new Error('فیلد quality موجود نیست');
          const s = d.quality === 'acceptable' ? 'warn' : 'pass';
          setResult(key, s, (s==='pass'?'✅':'⚠️') + ' ping: ' + d.ping + 'ms | کیفیت: ' + d.quality);
          recordResult(s);
        } catch (e) { setResult(key, 'fail', '❌ ' + e.message); recordResult('fail'); }
      } else { setResult(key, 'fail', '❌ HTTP ' + r.status); recordResult('fail'); }
      updateSectionBadge(id);
    }

    async function testGameLeaderboard(id) {
      const key = id + '-leaderboard';
      setResult(key, 'running');
      const r = await fetchTest(BASE_URL + '/' + id + '/leaderboard', { headers: { 'Accept': 'application/json' } });
      if (!r.ok) { setResult(key, 'fail', '❌ ' + r.error); recordResult('fail'); updateSectionBadge(id); return; }
      if (r.status === 200) {
        try {
          const d = await r.res.json();
          if (!Array.isArray(d.leaderboard)) throw new Error('فیلد leaderboard آرایه نیست');
          if (d.total === undefined) throw new Error('فیلد total موجود نیست');
          setResult(key, 'pass', '✅ ' + (d.total || 0) + ' بازیکن | ' + r.ping + 'ms');
          recordResult('pass');
        } catch (e) { setResult(key, 'fail', '❌ ' + e.message); recordResult('fail'); }
      } else { setResult(key, 'fail', '❌ HTTP ' + r.status); recordResult('fail'); }
      updateSectionBadge(id);
    }

    async function testGameLeaderboardLimit(id) {
      const key = id + '-lb-limit';
      setResult(key, 'running');
      const r = await fetchTest(BASE_URL + '/' + id + '/leaderboard/5', { headers: { 'Accept': 'application/json' } });
      if (!r.ok) { setResult(key, 'fail', '❌ ' + r.error); recordResult('fail'); updateSectionBadge(id); return; }
      if (r.status === 200) {
        try {
          const d = await r.res.json();
          if (!Array.isArray(d.leaderboard)) throw new Error('فیلد leaderboard آرایه نیست');
          if (d.leaderboard.length > 5) throw new Error('تعداد نتایج (' + d.leaderboard.length + ') بیشتر از limit=5 است');
          if (d.limit !== 5) throw new Error('فیلد limit باید 5 باشد، ولی ' + d.limit + ' آمد');
          setResult(key, 'pass', '✅ ' + d.leaderboard.length + ' نتیجه (limit=5) | ' + r.ping + 'ms');
          recordResult('pass');
        } catch (e) { setResult(key, 'fail', '❌ ' + e.message); recordResult('fail'); }
      } else { setResult(key, 'fail', '❌ HTTP ' + r.status); recordResult('fail'); }
      updateSectionBadge(id);
    }

    async function testGamePrivacy(id) {
      const key = id + '-privacy';
      setResult(key, 'running');
      const r = await fetchTest(BASE_URL + '/' + id + '/privacy');
      if (!r.ok) { setResult(key, 'fail', '❌ ' + r.error); recordResult('fail'); updateSectionBadge(id); return; }
      const ct = r.headers.get('Content-Type') || '';
      if (r.status === 200 && ct.includes('text/html')) { setResult(key, 'pass', '✅ HTML 200 | ' + r.ping + 'ms'); recordResult('pass'); }
      else if (r.status === 200) { setResult(key, 'warn', '⚠️ 200 ولی Content-Type: ' + ct); recordResult('warn'); }
      else { setResult(key, 'fail', '❌ HTTP ' + r.status); recordResult('fail'); }
      updateSectionBadge(id);
    }

    async function testGameTerms(id) {
      const key = id + '-terms';
      setResult(key, 'running');
      const r = await fetchTest(BASE_URL + '/' + id + '/terms');
      if (!r.ok) { setResult(key, 'fail', '❌ ' + r.error); recordResult('fail'); updateSectionBadge(id); return; }
      const ct = r.headers.get('Content-Type') || '';
      if (r.status === 200 && ct.includes('text/html')) { setResult(key, 'pass', '✅ HTML 200 | ' + r.ping + 'ms'); recordResult('pass'); }
      else if (r.status === 200) { setResult(key, 'warn', '⚠️ 200 ولی Content-Type: ' + ct); recordResult('warn'); }
      else { setResult(key, 'fail', '❌ HTTP ' + r.status); recordResult('fail'); }
      updateSectionBadge(id);
    }

    // ============================================================
    // AUTH TESTS
    // ============================================================
    async function testAuthValidateNoToken() {
      setResult('auth-validate-no-token', 'running'); setSectionBadge('auth', 'running');
      const r = await fetchTest(BASE_URL + '/auth/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"uid":"test123"}' });
      const ok = r.ok && r.status === 401;
      setResult('auth-validate-no-token', ok ? 'pass' : 'fail', ok ? '✅ 401 صحیح' : '❌ انتظار 401، HTTP ' + (r.status||r.error));
      recordResult(ok ? 'pass' : 'fail'); updateSectionBadge('auth');
    }

    async function testAuthValidateNoUid() {
      setResult('auth-validate-no-uid', 'running');
      const r = await fetchTest(BASE_URL + '/auth/validate', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer fake_token' }, body: '{}'
      });
      const ok = r.ok && (r.status === 400 || r.status === 401);
      setResult('auth-validate-no-uid', ok ? 'pass' : 'fail', ok ? '✅ HTTP ' + r.status + ' صحیح' : '❌ انتظار 400/401، HTTP ' + (r.status||r.error));
      recordResult(ok ? 'pass' : 'fail'); updateSectionBadge('auth');
    }

    async function testAuthRefreshEmpty() {
      setResult('auth-refresh-empty', 'running');
      const r = await fetchTest(BASE_URL + '/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const ok = r.ok && (r.status === 400 || r.status === 401);
      setResult('auth-refresh-empty', ok ? 'pass' : 'fail', ok ? '✅ HTTP ' + r.status + ' صحیح' : '❌ انتظار 400/401، HTTP ' + (r.status||r.error));
      recordResult(ok ? 'pass' : 'fail'); updateSectionBadge('auth');
    }

    async function testAuthCheckNoBody() {
      setResult('auth-check-no-body', 'running');
      const r = await fetchTest(BASE_URL + '/auth/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const ok = r.ok && (r.status === 400 || r.status === 401);
      setResult('auth-check-no-body', ok ? 'pass' : 'fail', ok ? '✅ HTTP ' + r.status + ' صحیح' : '❌ انتظار 400، HTTP ' + (r.status||r.error));
      recordResult(ok ? 'pass' : 'fail'); updateSectionBadge('auth');
    }

    async function testAuthCheckNoToken() {
      setResult('auth-check-no-token', 'running');
      const r = await fetchTest(BASE_URL + '/auth/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"uid":"test123"}' });
      const ok = r.ok && r.status === 401;
      setResult('auth-check-no-token', ok ? 'pass' : 'fail', ok ? '✅ 401 صحیح' : '❌ انتظار 401، HTTP ' + (r.status||r.error));
      recordResult(ok ? 'pass' : 'fail'); updateSectionBadge('auth');
    }

    async function testAuthGoogleNoToken() {
      setResult('auth-google-no-token', 'running');
      const r = await fetchTest(BASE_URL + '/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const ok = r.ok && (r.status === 400 || r.status === 401);
      setResult('auth-google-no-token', ok ? 'pass' : 'fail', ok ? '✅ HTTP ' + r.status + ' صحیح' : '❌ انتظار 400، HTTP ' + (r.status||r.error));
      recordResult(ok ? 'pass' : 'fail'); updateSectionBadge('auth');
    }

    // ============================================================
    // OAUTH TESTS
    // ============================================================
    async function testOAuthAuthNoRedirect() {
      setResult('oauth-auth-no-redirect', 'running'); setSectionBadge('oauth', 'running');
      const r = await fetchTest(BASE_URL + '/oauth/auth?game=neon-katana');
      const ok = r.ok && r.status === 400;
      setResult('oauth-auth-no-redirect', ok ? 'pass' : 'fail', ok ? '✅ 400 صحیح — redirect_uri الزامی' : '❌ HTTP ' + (r.status||r.error));
      recordResult(ok ? 'pass' : 'fail'); updateSectionBadge('oauth');
    }

    async function testOAuthAuthWithRedirect() {
      setResult('oauth-auth-with-redirect', 'running');
      const redirectUri = encodeURIComponent('com.amircollidergames.neonkatana://oauth');
      const r = await fetchTest(BASE_URL + '/oauth/auth?game=neon-katana&redirect_uri=' + redirectUri);
      const ct = r.headers ? r.headers.get('Content-Type') || '' : '';
      const ok = r.ok && r.status === 200 && ct.includes('text/html');
      setResult('oauth-auth-with-redirect', ok ? 'pass' : 'fail', ok ? '✅ HTML redirect page برگشت | ' + r.ping + 'ms' : '❌ HTTP ' + (r.status||r.error));
      recordResult(ok ? 'pass' : 'fail'); updateSectionBadge('oauth');
    }

    async function testOAuthTokenNoCode() {
      setResult('oauth-token-no-code', 'running');
      const r = await fetchTest(BASE_URL + '/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=authorization_code' });
      const ok = r.ok && r.status === 400;
      setResult('oauth-token-no-code', ok ? 'pass' : 'fail', ok ? '✅ 400 صحیح — code الزامی' : '❌ HTTP ' + (r.status||r.error));
      recordResult(ok ? 'pass' : 'fail'); updateSectionBadge('oauth');
    }

    async function testOAuthCallbackNoParams() {
      setResult('oauth-callback-no-params', 'running');
      const r = await fetchTest(BASE_URL + '/oauth/callback');
      const ok = r.ok && (r.status === 400 || r.status === 200);
      setResult('oauth-callback-no-params', ok ? 'pass' : (r.status >= 500 ? 'fail' : 'warn'),
        r.status >= 500 ? '❌ HTTP 500 — خطای داخلی' : '✅ HTTP ' + r.status + ' (پاسخ صحیح)');
      recordResult(r.status >= 500 ? 'fail' : 'pass'); updateSectionBadge('oauth');
    }

    // ============================================================
    // DB TESTS
    // ============================================================
    async function testDbGetUnauth() {
      setResult('db-get-unauth', 'running'); setSectionBadge('db', 'running');
      const r = await fetchTest(BASE_URL + '/database/get/private/data');
      const ok = r.ok && (r.status === 401 || r.status === 400);
      setResult('db-get-unauth', ok ? 'pass' : 'fail', ok ? '✅ HTTP ' + r.status + ' (unauth صحیح)' : '❌ HTTP ' + (r.status||r.error));
      recordResult(ok ? 'pass' : 'fail'); updateSectionBadge('db');
    }

    async function testDbSetUnauth() {
      setResult('db-set-unauth', 'running');
      const r = await fetchTest(BASE_URL + '/database/set/test', { method: 'POST', body: 'test' });
      const ok = r.ok && (r.status === 401 || r.status === 400);
      setResult('db-set-unauth', ok ? 'pass' : 'fail', ok ? '✅ HTTP ' + r.status + ' (unauth صحیح)' : '❌ HTTP ' + (r.status||r.error));
      recordResult(ok ? 'pass' : 'fail'); updateSectionBadge('db');
    }

    async function testDbPatchUnauth() {
      setResult('db-patch-unauth', 'running');
      const r = await fetchTest(BASE_URL + '/database/patch/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const ok = r.ok && (r.status === 401 || r.status === 400);
      setResult('db-patch-unauth', ok ? 'pass' : 'fail', ok ? '✅ HTTP ' + r.status + ' (unauth صحیح)' : '❌ HTTP ' + (r.status||r.error));
      recordResult(ok ? 'pass' : 'fail'); updateSectionBadge('db');
    }

    // ============================================================
    // D1 TESTS
    // ============================================================
    async function testD1Connection() {
      setResult('d1-connection', 'running'); setSectionBadge('d1', 'running');
      const r = await fetchTest(BASE_URL + '/neon-katana/leaderboard', { headers: { 'Accept': 'application/json' } });
      if (!r.ok) { setResult('d1-connection', 'fail', '❌ fetch error: ' + r.error); recordResult('fail'); updateSectionBadge('d1'); return; }
      if (r.status === 200) {
        try {
          const d = await r.res.json();
          if (!Array.isArray(d.leaderboard)) throw new Error('ساختار JSON نادرست');
          setResult('d1-connection', 'pass', \`✅ D1 متصل | \${d.total || 0} رکورد | \${r.ping}ms\`);
          recordResult('pass');
        } catch (e) { setResult('d1-connection', 'fail', '❌ ' + e.message); recordResult('fail'); }
      } else {
        setResult('d1-connection', 'fail', '❌ HTTP ' + r.status + ' — D1 متصل نیست'); recordResult('fail');
      }
      updateSectionBadge('d1');
    }

    async function testD1Schema() {
      setResult('d1-schema', 'running');
      const r = await fetchTest(BASE_URL + '/neon-katana/leaderboard', { headers: { 'Accept': 'application/json' } });
      if (!r.ok || r.status !== 200) { setResult('d1-schema', 'fail', '❌ HTTP ' + (r.status||r.error)); recordResult('fail'); updateSectionBadge('d1'); return; }
      try {
        const d = await r.res.json();
        const rootFields = ['leaderboard', 'total', 'limit', 'returned'];
        const missingRoot = rootFields.filter(f => !(f in d));
        if (missingRoot.length > 0) throw new Error('فیلدهای غایب در root: ' + missingRoot.join(', '));
        if (d.leaderboard.length > 0) {
          const p = d.leaderboard[0];
          const playerFields = ['rank', 'username', 'displayName', 'highScore'];
          const missingPlayer = playerFields.filter(f => !(f in p));
          if (missingPlayer.length > 0) throw new Error('فیلدهای غایب در player: ' + missingPlayer.join(', '));
          if (typeof p.rank !== 'number') throw new Error('rank باید عدد باشد');
          if (typeof p.highScore !== 'number') throw new Error('highScore باید عدد باشد');
        }
        setResult('d1-schema', 'pass', '✅ ساختار D1 صحیح | ' + r.ping + 'ms');
        recordResult('pass');
      } catch (e) { setResult('d1-schema', 'fail', '❌ ' + e.message); recordResult('fail'); }
      updateSectionBadge('d1');
    }

    async function testD1Limit() {
      setResult('d1-limit', 'running');
      const r = await fetchTest(BASE_URL + '/neon-katana/leaderboard/3', { headers: { 'Accept': 'application/json' } });
      if (!r.ok || r.status !== 200) { setResult('d1-limit', 'fail', '❌ HTTP ' + (r.status||r.error)); recordResult('fail'); updateSectionBadge('d1'); return; }
      try {
        const d = await r.res.json();
        if (d.leaderboard.length > 3) throw new Error('تعداد نتایج ' + d.leaderboard.length + ' بیشتر از 3 است');
        if (d.limit !== 3) throw new Error('limit=' + d.limit + ' (انتظار 3)');
        setResult('d1-limit', 'pass', '✅ ' + d.leaderboard.length + ' نتیجه با limit=3 | ' + r.ping + 'ms');
        recordResult('pass');
      } catch (e) { setResult('d1-limit', 'fail', '❌ ' + e.message); recordResult('fail'); }
      updateSectionBadge('d1');
    }

    async function testD1EmptyUser() {
      setResult('d1-empty-user', 'running');
      const r = await fetchTest(BASE_URL + '/database/get/games/neon-katana/users/nonexistentuser99999xyz', {
        headers: { 'Accept': 'application/json', 'Authorization': 'Bearer fake_token_for_404_test' }
      });
      if (!r.ok) { setResult('d1-empty-user', 'fail', '❌ fetch error: ' + r.error); recordResult('fail'); updateSectionBadge('d1'); return; }
      if (r.status === 404) { setResult('d1-empty-user', 'pass', '✅ 404 صحیح — کاربر ناموجود | ' + r.ping + 'ms'); recordResult('pass'); }
      else if (r.status === 401) { setResult('d1-empty-user', 'warn', '⚠️ 401 — توکن رد شد (D1 کار میکند)'); recordResult('warn'); }
      else { setResult('d1-empty-user', 'warn', '⚠️ HTTP ' + r.status + ' (انتظار 404)'); recordResult('warn'); }
      updateSectionBadge('d1');
    }

    async function testD1GetUnauth() {
      setResult('d1-get-unauth', 'running');
      const r = await fetchTest(BASE_URL + '/database/get/games/neon-katana/users/testuser');
      const ok = r.ok && (r.status === 401 || r.status === 400);
      setResult('d1-get-unauth', ok ? 'pass' : 'fail', ok ? '✅ HTTP ' + r.status + ' (unauth صحیح)' : '❌ HTTP ' + (r.status||r.error));
      recordResult(ok ? 'pass' : 'fail'); updateSectionBadge('d1');
    }

    async function testD1SetUnauth() {
      setResult('d1-set-unauth', 'running');
      const r = await fetchTest(BASE_URL + '/database/set/games/neon-katana/users/testuser', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"username":"test"}'
      });
      const ok = r.ok && (r.status === 401 || r.status === 400);
      setResult('d1-set-unauth', ok ? 'pass' : 'fail', ok ? '✅ HTTP ' + r.status + ' (unauth صحیح)' : '❌ HTTP ' + (r.status||r.error));
      recordResult(ok ? 'pass' : 'fail'); updateSectionBadge('d1');
    }

    async function testD1PatchUnauth() {
      setResult('d1-patch-unauth', 'running');
      const r = await fetchTest(BASE_URL + '/database/patch/games/neon-katana/users/testuser', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"selectedColor":"FF0000"}'
      });
      const ok = r.ok && (r.status === 401 || r.status === 400);
      setResult('d1-patch-unauth', ok ? 'pass' : 'fail', ok ? '✅ HTTP ' + r.status + ' (unauth صحیح)' : '❌ HTTP ' + (r.status||r.error));
      recordResult(ok ? 'pass' : 'fail'); updateSectionBadge('d1');
    }

    async function testD1ScoreInvalid() {
      setResult('d1-score-invalid', 'running');
      const r = await fetchTest(BASE_URL + '/database/set/games/neon-katana/users/testuser/highScore', {
        method: 'POST', headers: { 'Authorization': 'Bearer fake_token', 'Content-Type': 'text/plain' }, body: '-999'
      });
      const ok = r.ok && (r.status === 400 || r.status === 401 || r.status === 404);
      setResult('d1-score-invalid', ok ? 'pass' : 'fail', ok ? '✅ HTTP ' + r.status + ' صحیح (امتیاز منفی رد شد)' : '❌ HTTP ' + (r.status||r.error));
      recordResult(ok ? 'pass' : 'fail'); updateSectionBadge('d1');
    }

    async function testD1UnknownPath() {
      setResult('d1-unknown-path', 'running');
      const r = await fetchTest(BASE_URL + '/database/get/games/neon-katana/unknown_path_xyz', {
        headers: { 'Authorization': 'Bearer fake_token' }
      });
      const ok = r.ok && (r.status === 400 || r.status === 401 || r.status === 404);
      setResult('d1-unknown-path', ok ? 'pass' : (r.status >= 500 ? 'fail' : 'warn'),
        r.status >= 500 ? '❌ HTTP 500 — مسیر ناشناخته crash کرد' : '✅ HTTP ' + r.status + ' صحیح');
      recordResult(r.status >= 500 ? 'fail' : 'pass'); updateSectionBadge('d1');
    }

    // ============================================================
    // MANUAL TEST
    // ============================================================
    async function runManualTest() {
      const method     = document.getElementById('m-method').value;
      const endpoint   = document.getElementById('m-endpoint').value.trim();
      const headersRaw = document.getElementById('m-headers').value.trim();
      const bodyRaw    = document.getElementById('m-body').value.trim();
      const output     = document.getElementById('manual-output');
      if (!endpoint) { showToast('⚠️ endpoint را وارد کنید', 'warn'); return; }
      let headers = { 'Accept': 'application/json' };
      if (headersRaw) {
        try { headers = { ...headers, ...JSON.parse(headersRaw) }; }
        catch { showToast('❌ Headers JSON نامعتبر', 'fail'); return; }
      }
      const opts = { method, headers };
      if (bodyRaw && method !== 'GET' && method !== 'OPTIONS') {
        opts.body = bodyRaw;
        headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      }
      output.style.display = 'block';
      output.textContent = '⏳ در حال ارسال...';
      const t0 = Date.now();
      try {
        const res = await fetch(BASE_URL + endpoint, opts);
        const ping = Date.now() - t0;
        let text = await res.text();
        try { text = JSON.stringify(JSON.parse(text), null, 2); } catch {}
        const lines = ['▶ ' + method + ' ' + endpoint, '◀ HTTP ' + res.status + ' | ' + ping + 'ms', '──────────────────────────'];
        res.headers.forEach((v, k) => lines.push('  ' + k + ': ' + v));
        lines.push('──────────────────────────', text);
        output.textContent = lines.join('\\n');
      } catch (e) {
        output.textContent = '❌ خطا:\\n' + e.message;
      }
    }

    // ============================================================
    // AI ANALYSIS
    // ============================================================
    function collectTestResults() {
      const results = [];
      document.querySelectorAll('.test-item').forEach(item => {
        const nameEl   = item.querySelector('.test-name');
        const resultEl = item.querySelector('.test-result');
        const logEl    = item.querySelector('.detail-log');
        if (!nameEl || !resultEl) return;
        const status = resultEl.classList.contains('pass') ? 'pass' : resultEl.classList.contains('fail') ? 'fail' : resultEl.classList.contains('warn') ? 'warn' : 'pending';
        results.push({ test: nameEl.textContent.trim(), status, detail: logEl ? logEl.textContent.trim() : '' });
      });
      return results;
    }

    async function runAiAnalysis() {
      const btn    = document.getElementById('btn-ai');
      const panel  = document.getElementById('ai-panel');
      const output = document.getElementById('ai-output');
      btn.disabled = true; btn.textContent = '⏳ در حال تحلیل...';
      panel.style.display = 'block';
      output.innerHTML = \`<div class="ai-thinking">در حال ارسال نتایج به Claude <div class="ai-dots"><span></span><span></span><span></span></div></div>\`;
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const results = collectTestResults();
      const failed  = results.filter(r => r.status === 'fail');
      const warned  = results.filter(r => r.status === 'warn');
      const passed  = results.filter(r => r.status === 'pass');
      const prompt = \`نتایج تست Cloudflare Worker Proxy (AmirCollider Games - D1 Database):

📊 خلاصه:
- کل: \${results.length} تست | ✅ موفق: \${passed.length} | ❌ ناموفق: \${failed.length} | ⚠️ هشدار: \${warned.length}

❌ ناموفق‌ها:
\${failed.length > 0 ? failed.map(t => \`- \${t.test}\\n  جزئیات: \${t.detail||'ندارد'}\`).join('\\n') : 'هیچ‌کدام'}

⚠️ هشدارها:
\${warned.length > 0 ? warned.map(t => \`- \${t.test}\\n  جزئیات: \${t.detail||'ندارد'}\`).join('\\n') : 'هیچ‌کدام'}

✅ موفق: \${passed.map(t => t.test).join(', ')||'هیچ‌کدام'}\`;
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514', max_tokens: 1000,
            system: \`تو متخصص Cloudflare Workers و D1 Database هستی. نتایج تست یک Proxy Worker رو آنالیز کن و به فارسی روان پاسخ بده:
1. 🩺 تشخیص: مشکل اصلی چیست؟
2. 🔍 ریشه: کجاست؟ (D1 binding / routing / auth / network)
3. 🛠️ راه‌حل: دقیق و کد-محور
4. ⚡ اولویت‌بندی: از مهم به کم‌اهمیت
اگر همه پاس شدند، نکات بهبود امنیت و performance بگو.\`,
            messages: [{ role: 'user', content: prompt }]
          })
        });
        const data = await response.json();
        if (data.content && data.content[0]) { output.textContent = data.content[0].text; }
        else if (data.error) { output.textContent = '❌ خطای API: ' + (data.error.message || JSON.stringify(data.error)); }
        else { output.textContent = '❌ پاسخ نامعتبر:\\n' + JSON.stringify(data, null, 2); }
      } catch (e) {
        output.textContent = '❌ خطا در اتصال به Claude API:\\n' + e.message;
      } finally {
        btn.disabled = false; btn.textContent = '🤖 تحلیل AI';
      }
    }
  </script>
</body>
</html>`
}

// ==========================================
// Helper: ساخت آیتم تست
// ==========================================
function buildTestItem(id, icon, name, desc) {
  return `
    <div class="test-item">
      <div class="test-icon">${icon}</div>
      <div class="test-info">
        <div class="test-name">${name}</div>
        <div class="test-desc">${desc}</div>
        <div class="detail-log" id="log-${id}"></div>
      </div>
      <div class="test-result" id="res-${id}">—</div>
    </div>
  `
}