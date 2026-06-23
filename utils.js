// ==========================================
// Utils - Shared Utility Functions
// AmirCollider Games - Worker Proxy
// ==========================================
//
// Cross-cutting helpers shared by worker.js and every pages/* handler.
//
// Public exports (do not break without updating callers):
//   logInfo / logWarning / logError(message, context)  -> structured JSON logs
//   generateRequestId()                                -> per-request trace id
//   validateEnvironmentVariables(env)                  -> throws on missing keys
//   sanitizeInput(value)                               -> HTML-escape + trim
//   validateGameId(gameId, GAMES)                      -> game object | null
//   createJsonResponse(data, status, headers)
//   createHtmlResponse(html, status, headers)
//   create404Response(requestId)
//   createErrorResponse(error, requestId, game)        -> generic, non-leaking
//   createErrorPage(message, game, lang)               -> fa | en | ja, RTL/LTR
//
// Logging policy: route every log through logInfo/logWarning/logError so output
// stays structured and greppable. Do not call console.* directly elsewhere.
// ==========================================

import { SECURITY, CONFIG, CORS_HEADERS, LANGUAGES } from './config.js'
import { getSharedCSS, getPageHead } from './shared-styles.js'


// ==========================================
// Logging
// Single structured-JSON logging surface for the whole Worker.
// ==========================================
export function logInfo(message, context = {}) {
  console.log(JSON.stringify({ level: 'INFO', message, ...context }))
}

export function logWarning(message, context = {}) {
  console.warn(JSON.stringify({ level: 'WARNING', message, ...context }))
}

export function logError(message, context = {}) {
  console.error(JSON.stringify({ level: 'ERROR', message, ...context }))
}


// ==========================================
// Request ID Generator
// Short, collision-resistant trace id correlated across logs and responses.
// ==========================================
export function generateRequestId() {
  return `req_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 9)}`
}


// ==========================================
// Environment Validation
// Fails fast at startup when a required secret is missing.
// ==========================================
export function validateEnvironmentVariables(env) {
  const required = [
    'NEON_KATANA_GOOGLE_CLIENT_ID_WEB',
    'NEON_KATANA_GOOGLE_CLIENT_SECRET',
    'NEON_KATANA_DEEPLINK_SCHEME'
  ]

  const missing = required.filter(key => !env[key])
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }

  return true
}


// ==========================================
// Input Escaping
// Neutralizes HTML metacharacters before interpolating into markup.
// ==========================================
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
// Resolves a request's game id against the registry. Returns the matching game,
// the first registered game as a fallback, or null when the registry is empty.
// Pure: callers decide how to react to a null result.
// ==========================================
export function validateGameId(gameId, GAMES) {
  if (!GAMES || Object.keys(GAMES).length === 0) return null

  const firstGame = GAMES[Object.keys(GAMES)[0]] || null

  if (!gameId || gameId === 'undefined') return firstGame

  return GAMES[gameId] || firstGame
}


// ==========================================
// Response Builders
// Every response carries the shared CORS + security header set.
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


// ==========================================
// Error Response
// Returns a generic, non-leaking error to the client. The underlying error is
// expected to be logged by the caller with the same requestId for correlation.
// ==========================================
export function createErrorResponse(error, requestId, game) {
  if (error && error.needsHtml) {
    const safeGame = game || {
      name: 'AmirCollider Games',
      color: '#f44336',
      logo: CONFIG.AMIR_LOGO
    }
    return createHtmlResponse(createErrorPage(GENERIC_ERROR[LANGUAGES.default], safeGame), 500)
  }

  return createJsonResponse({
    error: 'internal_error',
    message: 'An unexpected error occurred. Please try again later.',
    version: CONFIG.VERSION,
    timestamp: new Date().toISOString(),
    requestId
  }, 500)
}


// ==========================================
// Error Page Localization
// Chrome strings and a neutral generic message per supported language.
// ==========================================
const ERROR_CHROME = {
  fa: { heading: 'خطا', back: 'بازگشت' },
  en: { heading: 'Error', back: 'Back' },
  ja: { heading: 'エラー', back: '戻る' }
}

const GENERIC_ERROR = {
  fa: 'خطای داخلی سرور رخ داد.',
  en: 'An internal server error occurred.',
  ja: 'サーバー内部エラーが発生しました。'
}

const ALERT_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'


// ==========================================
// Error Page HTML
// Theme-aware, direction-correct (RTL/LTR) error page. `message` is treated as
// caller-localized display text; `lang` controls only the page chrome.
// ==========================================
export function createErrorPage(message, game, lang = LANGUAGES.default) {
  const safeGame = game || {
    logo: CONFIG.AMIR_LOGO,
    color: '#f44336',
    name: 'AmirCollider Games'
  }

  const code = LANGUAGES.supported.includes(lang) ? lang : LANGUAGES.default
  const meta = LANGUAGES.meta[code]
  const chrome = ERROR_CHROME[code]

  return `<!DOCTYPE html>
<html lang="${code}" dir="${meta.dir}">
<head>
  ${getPageHead({ title: `${chrome.heading} - AmirCollider Proxy`, amirLogo: safeGame.logo })}
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
      width: 84px;
      height: 84px;
      margin: 0 auto 20px;
      color: var(--brand);
      animation: shake 0.5s ease;
    }

    .error-icon svg {
      width: 100%;
      height: 100%;
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
    <div class="error-icon">${ALERT_ICON}</div>
    <h1>${chrome.heading}</h1>
    <p style="margin: 20px 0; font-size: 1.1em;">${sanitizeInput(message)}</p>
    <div class="btn-container">
      <button onclick="window.history.back()" class="btn">${chrome.back}</button>
    </div>
  </div>
</body>
</html>`
}
