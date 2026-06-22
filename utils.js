// ==========================================
// Utils - Shared Utility Functions
// AmirCollider Games - Worker Proxy
// ==========================================

import { SECURITY, CONFIG, CORS_HEADERS } from './config.js'
import { getSharedCSS, getPageHead } from './shared-styles.js'

// ==========================================
// Logging
// ==========================================
export function logInfo(message, context = {}) {
  console.log(JSON.stringify({ level: 'INFO', message, ...context }))
}

export function logError(message, context = {}) {
  console.error(JSON.stringify({ level: 'ERROR', message, ...context }))
}

export function logWarning(message, context = {}) {
  console.warn(JSON.stringify({ level: 'WARNING', message, ...context }))
}

// ==========================================
// Request ID Generator
// ==========================================
export function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// ==========================================
// Environment Validation
// ==========================================
export function validateEnvironmentVariables(envVars) {
  const required = [
    'NEON_KATANA_GOOGLE_CLIENT_ID_WEB',
    'NEON_KATANA_GOOGLE_CLIENT_SECRET',
    'NEON_KATANA_DEEPLINK_SCHEME'
  ]

  const missing = required.filter(key => !envVars[key])
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }

  return true
}

export function sanitizeInput(input) {
  if (typeof input !== 'string') return input
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .trim()
}

// ==========================================
// Game ID Validator
// ==========================================
export function validateGameId(gameId, GAMES) {
  if (!GAMES || Object.keys(GAMES).length === 0) {
    console.warn('⚠️ validateGameId: GAMES is empty or undefined')
    return null
  }

  if (!gameId || gameId === 'undefined') {
    const firstGameId = Object.keys(GAMES)[0]
    if (firstGameId) {
      console.log(`ℹ️ No gameId provided, using first game: ${firstGameId}`)
      return GAMES[firstGameId]
    }
    return null
  }

  const game = GAMES[gameId]

  if (!game) {
    console.warn(`⚠️ Invalid game ID: ${gameId}`, {
      providedGameId: gameId,
      availableGames: Object.keys(GAMES)
    })
    return GAMES['neon-katana'] || GAMES[Object.keys(GAMES)[0]] || null
  }

  return game
}

// ==========================================
// Response Builders
// ==========================================
export function createJsonResponse(data, status = 200, additionalHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      ...CORS_HEADERS,
      ...SECURITY.SECURE_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      ...additionalHeaders
    }
  })
}

export function createHtmlResponse(html, status = 200, additionalHeaders = {}) {
  return new Response(html, {
    status,
    headers: {
      ...CORS_HEADERS,
      ...SECURITY.SECURE_HEADERS,
      'Content-Type': 'text/html; charset=utf-8',
      ...additionalHeaders
    }
  })
}

export function create404Response(requestId) {
  return createJsonResponse({
    error: 'not_found',
    message: 'Endpoint not found',
    version: CONFIG.VERSION,
    requestId
  }, 404)
}

export function createErrorResponse(error, requestId, game) {
  const safeGame = game || {
    name: 'AmirCollider Games',
    icon: '',
    color: '#f44336',
    logo: CONFIG.AMIR_LOGO
  }

  if (error.needsHtml) {
    return createHtmlResponse(createErrorPage(error.message, safeGame), 500)
  }

  return createJsonResponse({
    error: 'internal_error',
    message: error.message,
    version: CONFIG.VERSION,
    timestamp: new Date().toISOString(),
    requestId
  }, 500)
}

// ==========================================
// Error Page HTML
// ==========================================
export function createErrorPage(message, game) {
  const safeGame = game || {
    logo: CONFIG.AMIR_LOGO,
    color: '#f44336',
    icon: '',
    name: 'AmirCollider Games'
  }

  const amirLogo = CONFIG.AMIR_LOGO

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  ${getPageHead({ title: 'خطا - AmirCollider Proxy', amirLogo: safeGame.logo })}
  <style>
    ${getSharedCSS(safeGame.color)}

    body {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .container {
      max-width: 500px;
      text-align: center;
    }

    .error-icon {
      font-size: 6em;
      margin-bottom: 20px;
      animation: shake 0.5s ease;
    }

    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-10px); }
      75% { transform: translateX(10px); }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="error-icon">❌</div>
    <h1>خطا</h1>
    <p style="margin: 20px 0; font-size: 1.1em;">${sanitizeInput(message)}</p>
    <div class="btn-container">
      <button onclick="window.history.back()" class="btn">بازگشت</button>
    </div>
  </div>
</body>
</html>`
}
