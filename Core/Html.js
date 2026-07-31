// ==========================================
// Core/Html.js
// Output-safety helpers for server-rendered markup.
//
// Every value interpolated into HTML goes through one of these.
// The distinction that matters:
//   escapeHtml   -> text nodes and attribute values
//   jsString     -> values embedded inside an inline <script>
//   safeColor    -> values interpolated into a style attribute,
//                   where escaping is not enough and only a real
//                   hex colour may pass
// ==========================================

const HTML_ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

/** Escapes HTML metacharacters. Nullish becomes an empty string. */
export function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, char => HTML_ENTITIES[char])
}

/** Escapes and trims a string; non-strings are returned untouched. */
export function sanitizeInput(input) {
  return typeof input === 'string' ? escapeHtml(input).trim() : input
}

/**
 * Encodes a value as a JavaScript string literal for an inline <script>.
 * `<` is escaped so the payload can never close the surrounding tag.
 */
export function jsString(value) {
  return JSON.stringify(String(value == null ? '' : value)).replace(/</g, '\\u003c')
}

/** A six-digit hex colour, or the fallback. */
export function safeColor(value, fallback) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || '')) ? value : fallback
}

/** "r, g, b" triplet for a hex colour, for use inside rgba(). */
export function hexToRgb(hex) {
  const clean = String(hex || '').replace('#', '')
  const full = clean.length === 3 ? clean.split('').map(char => char + char).join('') : clean
  const int = parseInt(full || '667eea', 16)
  return `${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}`
}
