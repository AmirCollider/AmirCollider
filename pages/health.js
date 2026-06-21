// ==========================================
// pages/health.js
// Health Check Page Handler
// ==========================================

import { CONFIG, SECURITY } from '../config.js'
import { getSharedCSS, getLogosHTML, getPageHead } from '../shared-styles.js'
import { validateGameId, createJsonResponse, createHtmlResponse } from '../utils.js'

export async function handleHealthWithUI(url, request, gameId, requestId, GAMES) {
  let game = validateGameId(gameId, GAMES)

  if (!game) {
    game = {
      name: 'AmirCollider Games',
      icon: '🎮',
      color: '#f44336',
      logo: CONFIG.AMIR_LOGO
    }
  }

  const healthData = {
    status: 'healthy',
    message: 'OAuth Proxy is running',
    timestamp: new Date().toISOString(),
    version: CONFIG.VERSION,
    game: {
      id: gameId,
      name: game.name,
      icon: game.icon,
      description: game.description
    },
    worker_url: url.origin,
    security: {
      rateLimit: `${SECURITY.RATE_LIMIT_PER_IP} requests per ${SECURITY.RATE_LIMIT_WINDOW / 1000}s`,
      sessionMaxAge: `${CONFIG.SESSION_MAX_AGE_MS / 1000 / 60 / 60 / 24} days`,
      secureHeaders: 'enabled'
    },
    endpoints: {
      oauth: ['GET /oauth/auth', 'GET /oauth/callback', 'POST /oauth/token'],
      auth: ['POST /auth/refresh', 'POST /auth/validate', 'POST /auth/check'],
      database: ['GET /database/get/{path}', 'POST /database/set/{path}', 'PUT /database/set/{path}'],
      profile: ['GET /profile/{uid}'],
      leaderboard: ['GET /{gameId}/leaderboard', 'GET /{gameId}/leaderboard/{limit}'],
      system: ['GET /health', 'GET /ping', 'GET /metrics']
    },
    requestId
  }

  const acceptHeader = request.headers.get('Accept') || ''
  if (acceptHeader.includes('application/json')) {
    return createJsonResponse(healthData, 200)
  }

  return createHtmlResponse(createHealthPage(healthData, game, url.origin, gameId), 200)
}

function createHealthPage(healthData, game, baseUrl, gameId) {
  const amirLogo = CONFIG.AMIR_LOGO
  const gameLogo = game.logo || CONFIG.DEFAULT_GAME_LOGO

  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  ${getPageHead({ title: `Health Check - ${game.name} | AmirCollider Proxy`, amirLogo })}
  <style>
    ${getSharedCSS(game.color)}

    .status-badge {
      background: rgba(76,175,80,0.3);
      color: #4caf50;
      padding: 15px 30px;
      border-radius: 20px;
      display: inline-block;
      font-weight: bold;
      border: 2px solid #4caf50;
      font-size: 1.2em;
      margin: 20px 0;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }
  </style>
</head>
<body>
  <div class="container">
    ${getLogosHTML(amirLogo, gameLogo, game.name)}

    <h1>🩺 Health Check</h1>

    <div style="text-align: center;">
      <span class="status-badge">✅ ${healthData.status.toUpperCase()}</span>
      <p style="margin: 10px 0; font-size: 1.1em;">${healthData.message}</p>
    </div>

    <div class="info-grid">
      <div class="info-card">
        <h3>🎮 Game Info</h3>
        <div class="info-row">
          <span>Name:</span>
          <strong>${healthData.game.name}</strong>
        </div>
        <div class="info-row">
          <span>ID:</span>
          <strong>${healthData.game.id}</strong>
        </div>
        <div class="info-row">
          <span>Icon:</span>
          <strong>${healthData.game.icon}</strong>
        </div>
      </div>

      <div class="info-card">
        <h3>📦 System Info</h3>
        <div class="info-row">
          <span>Version:</span>
          <strong>${healthData.version}</strong>
        </div>
        <div class="info-row">
          <span>Timestamp:</span>
          <strong>${new Date(healthData.timestamp).toLocaleTimeString('fa-IR')}</strong>
        </div>
        <div class="info-row">
          <span>Request ID:</span>
          <strong>${healthData.requestId}</strong>
        </div>
      </div>

      <div class="info-card">
        <h3>🔒 Security</h3>
        <div class="info-row">
          <span>Rate Limit:</span>
          <strong>${healthData.security.rateLimit}</strong>
        </div>
        <div class="info-row">
          <span>Session Age:</span>
          <strong>${healthData.security.sessionMaxAge}</strong>
        </div>
        <div class="info-row">
          <span>CSRF:</span>
          <strong>${healthData.security.csrfProtection}</strong>
        </div>
      </div>
    </div>

    <div class="json-box">
      <strong>📄 JSON Response:</strong>
      <pre>${JSON.stringify(healthData, null, 2)}</pre>
    </div>

    <div class="btn-container">
      <a href="${baseUrl}" class="btn">🏠 صفحه اصلی</a>
      <a href="${baseUrl}/${gameId}/ping" class="btn btn-secondary">📡 Ping Test</a>
    </div>
  </div>
</body>
</html>`
}