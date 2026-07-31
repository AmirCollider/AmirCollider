// ==========================================
// Core/Logging.js
// The Worker's only logging surface.
//
// Route every log through these so output stays structured and
// greppable, and so redaction has one place to live. Never call
// console.* directly elsewhere.
// ==========================================

function line(level, message, context) {
  return JSON.stringify({ level, message, ...context })
}

export function logInfo(message, context = {}) {
  console.log(line('INFO', message, context))
}

export function logWarning(message, context = {}) {
  console.warn(line('WARNING', message, context))
}

export function logError(message, context = {}) {
  console.error(line('ERROR', message, context))
}

/** Short, collision-resistant trace id correlated across logs and responses. */
export function generateRequestId() {
  return `req_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 9)}`
}
