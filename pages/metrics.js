// ==========================================
// pages/metrics.js
// Metrics Dashboard Page Handler
// AmirCollider Games - Worker Proxy
// ==========================================

import { CONFIG } from '../config.js'
import { getSharedCSS, getLogosHTML, getPageHead } from '../shared-styles.js'
import { createJsonResponse, createHtmlResponse } from '../utils.js'

// ==========================================
// Handler: Metrics
// availableEndpoints is passed in from worker.js
// to remove the direct dependency on ROUTES
// ==========================================
export async function handleMetrics(url, request, gameId, requestId, GAMES, _env, availableEndpoints = []) {
  const metricsData = {
    version: CONFIG.VERSION,
    worker_type: 'stateless',
    games: Object.keys(GAMES).length,
    endpoints: availableEndpoints.length,
    security: {
      sessionMaxAge: CONFIG.SESSION_MAX_AGE_MS,
      csrfEnabled: true
    },
    config: {
      stateExpiry: CONFIG.STATE_EXPIRY_MS,
      tokenMaxAge: CONFIG.TOKEN_MAX_AGE_MS,
      sessionMaxAge: CONFIG.SESSION_MAX_AGE_MS,
      autoCopyCode: CONFIG.AUTO_COPY_CODE
    },
    availableEndpoints,
    timestamp: new Date().toISOString(),
    requestId
  }

  const acceptHeader = request.headers.get('Accept') || ''
  if (acceptHeader.includes('application/json')) {
    return createJsonResponse(metricsData, 200)
  }

  return createHtmlResponse(createMetricsPage(metricsData, url.origin, GAMES), 200)
}

// ==========================================
// Page: Metrics Dashboard
// ==========================================
function createMetricsPage(metricsData, baseUrl, GAMES) {
  const amirLogo = CONFIG.AMIR_LOGO
  const game = GAMES['neon-katana'] || GAMES[Object.keys(GAMES)[0]] || {
    color: '#667eea',
    logo: CONFIG.DEFAULT_GAME_LOGO,
    name: 'AmirCollider Games'
  }

  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  ${getPageHead({
    title: `📊 Metrics Dashboard - AmirCollider Proxy v${metricsData.version}`,
    amirLogo,
    description: 'Real-time metrics and statistics for AmirCollider Proxy OAuth Management System'
  })}
  <style>
    ${getSharedCSS(game.color)}

    .container {
      max-width: 1200px;
      background: transparent;
      backdrop-filter: none;
      padding: 0;
      box-shadow: none;
    }

    .header {
      background: rgba(255,255,255,0.1);
      backdrop-filter: blur(25px);
      padding: 40px;
      border-radius: 25px;
      margin-bottom: 40px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      text-align: center;
    }

    .header-logos { margin-bottom: 30px; }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-bottom: 40px;
    }

    .stat-card {
      background: rgba(255,255,255,0.1);
      backdrop-filter: blur(25px);
      padding: 30px;
      border-radius: 20px;
      text-align: center;
      box-shadow: 0 15px 40px rgba(0,0,0,0.2);
      transition: all 0.3s;
      border: 2px solid transparent;
    }

    .stat-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 20px 50px rgba(0,0,0,0.3);
      border-color: rgba(255,255,255,0.3);
    }

    .stat-icon {
      font-size: 3em;
      margin-bottom: 15px;
      filter: drop-shadow(0 5px 10px rgba(0,0,0,0.3));
    }

    .stat-value {
      font-size: 2.5em;
      font-weight: bold;
      color: #ffeb3b;
      margin-bottom: 10px;
    }

    .stat-label { font-size: 1.1em; opacity: 0.9; }

    .info-section {
      background: rgba(255,255,255,0.1);
      backdrop-filter: blur(25px);
      padding: 30px;
      border-radius: 20px;
      margin-bottom: 30px;
      box-shadow: 0 15px 40px rgba(0,0,0,0.2);
    }

    .info-section h2 { margin-bottom: 20px; }

    .info-card { border-right: 4px solid #2196f3; }

    .endpoints-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 15px;
      margin-top: 20px;
    }

    .endpoint-item {
      background: rgba(0,0,0,0.3);
      padding: 15px;
      border-radius: 10px;
      border-right: 4px solid #4caf50;
      transition: all 0.3s;
      font-family: 'Courier New', monospace;
      font-size: 0.9em;
    }

    .endpoint-item:hover {
      transform: translateX(-5px);
      background: rgba(76,175,80,0.2);
    }

    .json-box {
      max-height: 400px;
      overflow-y: auto;
    }

    .json-box pre { white-space: pre-wrap; word-wrap: break-word; }

    @media (max-width: 768px) {
      .stats-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      ${getLogosHTML(amirLogo, game.logo || CONFIG.DEFAULT_GAME_LOGO, game.name)}
      <h1>📊 Metrics Dashboard</h1>
      <p style="font-size: 1.2em; margin: 10px 0;">Real-time System Metrics & Statistics</p>
      <span class="version-badge">v${metricsData.version}</span>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon">🎮</div>
        <div class="stat-value">${metricsData.games}</div>
        <div class="stat-label">بازی‌های فعال</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🔗</div>
        <div class="stat-value">${metricsData.endpoints}</div>
        <div class="stat-label">API Endpoints</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">⚡</div>
        <div class="stat-value">Stateless</div>
        <div class="stat-label">Worker Mode</div>
      </div>
    </div>

    <div class="info-section">
      <h2><span>🛡️</span> Security Configuration</h2>
      <div class="info-grid">
        <div class="info-card">
          <div class="info-row">
            <span style="font-weight: bold; opacity: 0.8;">Session Max Age:</span>
            <span style="font-weight: bold;">${metricsData.security.sessionMaxAge / 1000 / 60 / 60 / 24} روز</span>
          </div>
          <div class="info-row">
            <span style="font-weight: bold; opacity: 0.8;">Token Max Age:</span>
            <span style="font-weight: bold;">${metricsData.config.tokenMaxAge / 1000 / 60} دقیقه</span>
          </div>
          <div class="info-row">
            <span style="font-weight: bold; opacity: 0.8;">Auto Copy Code:</span>
            <span style="font-weight: bold; color: #4caf50;">${metricsData.config.autoCopyCode ? '✓ فعال' : '✗ غیرفعال'}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="info-section">
      <h2><span>🔗</span> Available API Endpoints</h2>
      <div class="endpoints-list">
        ${metricsData.availableEndpoints.map(endpoint => `
          <div class="endpoint-item">
            <strong>${endpoint.split(' ')[0]}</strong> ${endpoint.split(' ')[1]}
          </div>
        `).join('')}
      </div>
    </div>

    <div class="info-section">
      <h2><span>📄</span> Raw JSON Response</h2>
      <p style="opacity: 0.9; margin-bottom: 15px;">
        برای دسترسی برنامه‌نویسی به این داده‌ها، از header زیر استفاده کنید:<br>
        <code style="background: rgba(0,0,0,0.3); padding: 5px 10px; border-radius: 5px; display: inline-block; margin-top: 10px;">Accept: application/json</code>
      </p>
      <div class="json-box">
        <pre>${JSON.stringify(metricsData, null, 2)}</pre>
      </div>
    </div>

    <div class="btn-container">
      <a href="${baseUrl}" class="btn">🏠 صفحه اصلی</a>
      <a href="${baseUrl}/metrics" class="btn btn-secondary">🔄 بروزرسانی</a>
    </div>
  </div>
</body>
</html>`
}
