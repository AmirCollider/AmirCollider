// ==========================================
// pages/ping.js
// Ping Test Page Handler
// ==========================================

import { CONFIG } from '../config.js'
import { getSharedCSS, getLogosHTML, getPageHead } from '../shared-styles.js'
import { validateGameId, createJsonResponse, createHtmlResponse } from '../utils.js'

const PING_QUALITY_STYLES = {
  excellent: { color: '#4caf50', rgba: '76,175,80',  emoji: '🟢' },
  good:      { color: '#ff9800', rgba: '255,152,0',  emoji: '🟡' },
  acceptable:{ color: '#f44336', rgba: '244,67,54',  emoji: '🔴' }
}

export async function handlePingWithUI(url, request, gameId, requestId, GAMES) {
  const game = validateGameId(gameId, GAMES)
  if (!game) {
    return createJsonResponse({
      error: 'invalid_game',
      message: 'Game not found or not configured',
      available_games: GAMES ? Object.keys(GAMES) : [],
      provided_game_id: gameId,
      requestId
    }, 404)
  }

  const start = Date.now()
  try {
    const pingTarget = game.firebase?.db
      ? `${game.firebase.db}/.json?shallow=true`
      : `${url.origin}/`
    await fetch(pingTarget, {
      method: 'HEAD',
      signal: AbortSignal.timeout(CONFIG.PING_TIMEOUT_MS)
    })
  } catch (e) {}
  const ping = Date.now() - start

  const quality = ping < 100 ? 'excellent' : ping < 300 ? 'good' : 'acceptable'
  const pingData = {
    status: 'ok',
    game: game.name,
    gameId,
    ping,
    timestamp: new Date().toISOString(),
    quality,
    requestId
  }

  const acceptHeader = request.headers.get('Accept') || ''
  if (acceptHeader.includes('application/json')) {
    return createJsonResponse(pingData, 200)
  }

  return createHtmlResponse(createPingPage(pingData, game, url.origin, gameId), 200)
}

function createPingPage(pingData, game, baseUrl, gameId) {
  const amirLogo = CONFIG.AMIR_LOGO
  const gameLogo = game.logo || CONFIG.DEFAULT_GAME_LOGO
  const style = PING_QUALITY_STYLES[pingData.quality] || PING_QUALITY_STYLES.acceptable

  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  ${getPageHead({ title: `Ping Test - ${game.name} | AmirCollider Proxy`, amirLogo })}
  <style>
    ${getSharedCSS(game.color)}

    .ping-display {
      text-align: center;
      margin: 40px 0;
    }

    .ping-value {
      font-size: 5em;
      font-weight: bold;
      color: ${style.color};
      text-shadow: 0 0 20px ${style.color};
      animation: pingPulse 2s infinite;
    }

    @keyframes pingPulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }

    .quality-badge {
      background: rgba(${style.rgba}, 0.3);
      color: ${style.color};
      padding: 15px 30px;
      border-radius: 20px;
      display: inline-block;
      font-weight: bold;
      border: 2px solid ${style.color};
      font-size: 1.2em;
      margin: 20px 0;
    }

    .json-box {
      border-color: rgba(${style.rgba}, 0.3);
    }

    @media (max-width: 768px) {
      .ping-value { font-size: 3.5em; }
    }
  </style>
</head>
<body>
  <div class="container">
    ${getLogosHTML(amirLogo, gameLogo, game.name)}

    <h1>📡 Ping Test</h1>

    <div class="ping-display">
      <div class="ping-value">${pingData.ping}ms</div>
      <span class="quality-badge">${style.emoji} ${pingData.quality.toUpperCase()}</span>
    </div>

    <div class="info-grid">
      <div class="info-card">
        <h3>🎮 Game Info</h3>
        <div class="info-row">
          <span>Name:</span>
          <strong>${pingData.game}</strong>
        </div>
        <div class="info-row">
          <span>Status:</span>
          <strong>${pingData.status.toUpperCase()}</strong>
        </div>
      </div>

      <div class="info-card">
        <h3>⚡ Performance</h3>
        <div class="info-row">
          <span>Ping:</span>
          <strong>${pingData.ping}ms</strong>
        </div>
        <div class="info-row">
          <span>Quality:</span>
          <strong style="color: ${style.color};">${pingData.quality}</strong>
        </div>
      </div>

      <div class="info-card">
        <h3>📊 Details</h3>
        <div class="info-row">
          <span>Timestamp:</span>
          <strong>${new Date(pingData.timestamp).toLocaleTimeString('fa-IR')}</strong>
        </div>
        <div class="info-row">
          <span>Request ID:</span>
          <strong>${pingData.requestId}</strong>
        </div>
      </div>
    </div>

    <div class="json-box">
      <strong>📄 JSON Response:</strong>
      <pre>${JSON.stringify(pingData, null, 2)}</pre>
    </div>

    <div class="btn-container">
      <a href="${baseUrl}" class="btn">🏠 صفحه اصلی</a>
      <a href="${baseUrl}/${gameId}/health" class="btn btn-secondary">🩺 Health Check</a>
    </div>
  </div>
</body>
</html>`
}