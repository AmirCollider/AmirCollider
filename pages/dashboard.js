// ==========================================
// pages/dashboard.js
// Main Dashboard Page Handler
// AmirCollider Games - Worker Proxy
// ==========================================

import { CONFIG } from '../config.js'
import { getPageHead } from '../shared-styles.js'
import { createHtmlResponse } from '../utils.js'
import { createGamesCardsHTML } from './GamesCards.js'

// ==========================================
// Handler: Dashboard
// routesCount از worker.js پاس می‌شود تا
// وابستگی مستقیم به ROUTES حذف شود
// ==========================================
export async function handleDashboard(url, request, gameId, requestId, GAMES, _env, availableEndpoints = []) {
  return createHtmlResponse(
    createDashboardPage(GAMES, url.origin, availableEndpoints.length)
  )
}

// ==========================================
// Page: Dashboard
// ==========================================
function createDashboardPage(GAMES, baseUrl, routesCount) {
  const amirLogo = CONFIG.AMIR_LOGO
  const versionParts = CONFIG.VERSION.split('.')

  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  ${getPageHead({
    title: `AmirCollider Proxy - OAuth & Firebase Management v${CONFIG.VERSION}`,
    amirLogo
  })}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --primary: #667eea;
      --secondary: #764ba2;
      --success: #4caf50;
      --warning: #ff9800;
      --error: #f44336;
      --info: #2196f3;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
      background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
      color: white;
      min-height: 100vh;
      padding: 20px;
    }

    .header {
      text-align: center;
      margin-bottom: 40px;
      animation: fadeInDown 0.8s ease;
    }

    @keyframes fadeInDown {
      from { opacity: 0; transform: translateY(-30px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .logo-container {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 20px;
      margin-bottom: 20px;
    }

    .logo-circle {
      width: 100px;
      height: 100px;
      border-radius: 50%;
      border: 4px solid white;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      animation: pulse 2s infinite;
      background: white;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    .logo-circle img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
    }

    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }

    .emoji-logo {
      font-size: 4em;
      animation: pulse 2s infinite;
    }

    h1 {
      font-size: 2.5em;
      margin-bottom: 10px;
      color: #ffeb3b;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
    }

    .version {
      background: rgba(76,175,80,0.3);
      color: #4caf50;
      padding: 8px 20px;
      border-radius: 20px;
      display: inline-block;
      font-weight: bold;
      border: 2px solid #4caf50;
    }

    .container { max-width: 1400px; margin: 0 auto; }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
      margin: 20px 0;
    }

    .stat-box {
      background: rgba(255,255,255,0.1);
      padding: 20px;
      border-radius: 12px;
      text-align: center;
      transition: all 0.3s;
      cursor: pointer;
    }

    .stat-box:hover {
      background: rgba(255,255,255,0.15);
      transform: scale(1.05);
    }

    .stat-number {
      font-size: 2.5em;
      font-weight: bold;
      color: #4caf50;
      margin-bottom: 8px;
    }

    .stat-label { font-size: 0.9em; opacity: 0.9; }

    .games-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
      gap: 25px;
      margin: 40px 0;
    }

    .game-card {
      background: rgba(255,255,255,0.1);
      backdrop-filter: blur(20px);
      border-radius: 20px;
      padding: 30px;
      box-shadow: 0 25px 50px rgba(0,0,0,0.2);
      transition: all 0.3s ease;
      animation: fadeInUp 0.6s ease;
      border: 2px solid transparent;
    }

    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(30px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .game-card:hover {
      transform: translateY(-10px);
      border-color: rgba(255,255,255,0.3);
      box-shadow: 0 30px 60px rgba(0,0,0,0.3);
    }

    .game-header {
      display: flex;
      align-items: center;
      gap: 15px;
      margin-bottom: 20px;
    }

    .test-section {
      background: rgba(0,0,0,0.2);
      padding: 20px;
      border-radius: 15px;
      margin: 20px 0;
    }

    .test-buttons {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 15px;
    }

    .btn {
      background: rgba(255,255,255,0.2);
      color: white;
      padding: 12px 25px;
      border-radius: 10px;
      border: none;
      cursor: pointer;
      font-weight: bold;
      transition: all 0.3s;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.95em;
      text-decoration: none;
    }

    .btn:hover {
      background: rgba(255,255,255,0.3);
      transform: translateY(-2px);
      box-shadow: 0 5px 15px rgba(0,0,0,0.2);
    }

    .btn-primary  { background: linear-gradient(135deg, #4caf50, #8bc34a); }
    .btn-info     { background: linear-gradient(135deg, #2196f3, #03a9f4); }
    .btn-warning  { background: linear-gradient(135deg, #ff9800, #ffc107); }
    .btn-secondary{ background: linear-gradient(135deg, #9c27b0, #e91e63); }
    .btn-myket {
      background: linear-gradient(135deg, #00bfa5, #00796b);
      font-size: 1em;
      padding: 14px 28px;
    }

    .result-box {
      margin-top: 15px;
      padding: 15px;
      border-radius: 10px;
      background: rgba(0,0,0,0.3);
      display: none;
      animation: slideIn 0.3s ease;
    }

    @keyframes slideIn {
      from { opacity: 0; transform: translateX(20px); }
      to { opacity: 1; transform: translateX(0); }
    }

    .result-success { border-right: 4px solid #4caf50; }
    .result-warning { border-right: 4px solid #ff9800; }
    .result-error   { border-right: 4px solid #f44336; }

    .spinner {
      width: 20px;
      height: 20px;
      border: 3px solid rgba(255,255,255,0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      display: inline-block;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    .feature-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 15px;
      margin: 20px 0;
    }

    .feature-item {
      background: rgba(76,175,80,0.2);
      padding: 15px;
      border-radius: 10px;
      border-right: 4px solid #4caf50;
      transition: all 0.3s;
    }

    .feature-item:hover {
      transform: translateX(-5px);
      background: rgba(76,175,80,0.3);
    }

    footer {
      text-align: center;
      margin-top: 60px;
      padding: 30px;
      background: rgba(0,0,0,0.2);
      border-radius: 15px;
      backdrop-filter: blur(10px);
    }

    .toast {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(76,175,80,0.9);
      color: white;
      padding: 15px 30px;
      border-radius: 10px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      display: none;
      animation: toastIn 0.3s ease;
      z-index: 1000;
    }

    @keyframes toastIn {
      from { opacity: 0; transform: translate(-50%, 20px); }
      to { opacity: 1; transform: translate(-50%, 0); }
    }
  </style>
</head>
<body>
  <div class="container">

    <div class="header">
      <div class="logo-container">
        <div class="emoji-logo">🎮</div>
        <div class="logo-circle">
          <img src="${amirLogo}" alt="AmirCollider Logo">
        </div>
      </div>
      <h1>AmirCollider Proxy</h1>
      <p style="margin: 10px 0;">OAuth Proxy & Firebase Management System</p>
      <span class="version">v${CONFIG.VERSION} Enhanced</span>
    </div>

    <div class="stats-grid">
      <div class="stat-box">
        <div class="stat-number">${versionParts[0]}.${versionParts[1]}</div>
        <div class="stat-label">نسخه</div>
      </div>
      <div class="stat-box">
        <div class="stat-number">${Object.keys(GAMES).length}</div>
        <div class="stat-label">بازی فعال</div>
      </div>
      <div class="stat-box">
        <div class="stat-number">${routesCount}</div>
        <div class="stat-label">API Endpoints</div>
      </div>
      <div class="stat-box">
        <div class="stat-number">100%</div>
        <div class="stat-label">امنیت</div>
      </div>
    </div>

    <h2 style="text-align: center; margin: 40px 0 20px; font-size: 2em;">🎯 بازی‌های فعال</h2>

    ${createGamesCardsHTML(GAMES, baseUrl)}

    <h2 style="text-align: center; margin: 40px 0 20px; font-size: 2em;">🆕 ویژگی‌های نسخه ${CONFIG.VERSION}</h2>

    <div class="feature-list">
     <div class="feature-item">✔ 🧩 ساختاردهی و ماژولار کردن کد برای دسترسی‌پذیری و مدیریت آسان‌تر</div>
     <div class="feature-item">✔ ⏱️ اضافه شدن فایل testsite.js جهت تست خودکار ساعت و بررسی عملکرد زمان‌بندی</div>
     <div class="feature-item">✔ 🛠️ رفع باگ‌های موجود و انجام بهینه‌سازی‌های کلی در عملکرد</div>
    </div>

    <footer>
      <strong>AmirCollider Games</strong><br>
      OAuth Proxy v${CONFIG.VERSION} - Production Ready<br>
      <small style="opacity: 0.7;">Powered by Cloudflare Workers | با ❤️ ساخته شده برای دور زدن تحریم</small>
    </footer>
  </div>

  <div id="toast" class="toast"></div>

  <script>
    const baseUrl = '${baseUrl}';

    function showToast(message, type = 'success') {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.style.display = 'block';
      toast.style.background = type === 'success' ? 'rgba(76,175,80,0.9)'
                             : type === 'error'   ? 'rgba(244,67,54,0.9)'
                             :                      'rgba(33,150,243,0.9)';
      setTimeout(() => { toast.style.display = 'none'; }, 3000);
    }

    async function testHealth(gameId) {
      const result = document.getElementById('result-' + gameId);
      result.style.display = 'block';
      result.className = 'result-box';
      result.innerHTML = '<div class="spinner"></div> در حال بررسی وضعیت...';
      try {
        const start = Date.now();
        const response = await fetch(baseUrl + '/' + gameId + '/health', {
          headers: { 'Accept': 'application/json' }
        });
        const ping = Date.now() - start;
        if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + response.statusText);
        const data = await response.json();
        if (!data || !data.game) throw new Error('Invalid response structure');
        let cls = ping > 500 ? 'result-error' : ping > 200 ? 'result-warning' : 'result-success';
        result.className = 'result-box ' + cls;
        result.innerHTML =
          '<strong>✔ سرویس فعال است</strong><br>' +
          '📡 پینگ: ' + ping + 'ms<br>' +
          '🎮 بازی: ' + (data.game.name || 'نامشخص') + '<br>' +
          '🕐 زمان: ' + new Date(data.timestamp).toLocaleTimeString('fa-IR') + '<br>' +
          '📦 نسخه: ' + data.version + '<br>' +
          '<a href="' + baseUrl + '/' + gameId + '/health" target="_blank" style="color:#4caf50;text-decoration:none;margin-top:10px;display:inline-block;">🔗 مشاهده صفحه کامل</a>';
        } catch (error) {
        result.className = 'result-box result-error';
        result.innerHTML = '<strong>✗ خطا در اتصال</strong><br>' + error.message;
      }
    }

    async function testPing(gameId) {
      const result = document.getElementById('result-' + gameId);
      result.style.display = 'block';
      result.className = 'result-box';
      result.innerHTML = '<div class="spinner"></div> در حال تست پینگ...';
      try {
        const start = Date.now();
        const response = await fetch(baseUrl + '/' + gameId + '/ping', {
          headers: { 'Accept': 'application/json' }
        });
        const ping = Date.now() - start;
        if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + response.statusText);
        const data = await response.json();
        if (!data || typeof data.ping === 'undefined') throw new Error('Invalid response structure');
        let cls = 'result-success', status = 'عالی';
        if (data.ping > 200) { cls = 'result-warning'; status = 'متوسط'; }
        if (data.ping > 500) { cls = 'result-error';   status = 'ضعیف'; }
        result.className = 'result-box ' + cls;
        result.innerHTML =
          '<strong>📊 نتیجه تست پینگ</strong><br>' +
          '📡 پینگ: ' + data.ping + 'ms<br>' +
          '⚡ وضعیت: ' + status + '<br>' +
          '🎯 بازی: ' + (data.game || 'نامشخص') + '<br>' +
          '🏆 کیفیت: ' + (data.quality || 'نامشخص') + '<br>' +
          '<a href="' + baseUrl + '/' + gameId + '/ping" target="_blank" style="color:#4caf50;text-decoration:none;margin-top:10px;display:inline-block;">🔗 مشاهده صفحه کامل</a>';
        } catch (error) {
        result.className = 'result-box result-error';
        result.innerHTML = '<strong>✗ خطا در تست</strong><br>' + error.message;
      }
    }

    async function testMetrics(gameId) {
      const result = document.getElementById('result-' + gameId);
      result.style.display = 'block';
      result.className = 'result-box';
      result.innerHTML = '<div class="spinner"></div> در حال دریافت متریک‌ها...';
      try {
        const response = await fetch(baseUrl + '/metrics', {
          headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        result.className = 'result-box result-success';
        result.innerHTML =
          '<strong>📊 متریک‌های سیستم</strong><br>' +
          '📦 نسخه: ' + data.version + '<br>' +
          '🎮 تعداد بازی‌ها: ' + data.games + '<br>' +
          '🔗 تعداد Endpoints: ' + data.endpoints + '<br>' +
          '⏱️ Token Max Age: ' + (data.config.tokenMaxAge / 1000) + 's<br>' +
          '🪙 Session Max Age: ' + (data.config.sessionMaxAge / 1000 / 60 / 60 / 24) + ' days<br>' +
          '<a href="' + baseUrl + '/metrics" target="_blank" style="color:#4caf50;text-decoration:none;margin-top:10px;display:inline-block;">🔗 مشاهده صفحه کامل</a>';
        } catch (error) {
        result.className = 'result-box result-error';
        result.innerHTML = '<strong>✗ خطا در دریافت متریک‌ها</strong><br>' + error.message;
      }
    }

    console.log('%c🎮 AmirCollider Proxy v${CONFIG.VERSION}', 'color:#4caf50;font-size:20px;font-weight:bold;');
    console.log('%c🔥 Production Ready - All Issues Fixed', 'color:#2196f3;font-size:14px;');
    console.log('%c🛡️ Enhanced Security & Optimized Performance', 'color:#ff9800;font-size:12px;');
  </script>
</body>
</html>`
}