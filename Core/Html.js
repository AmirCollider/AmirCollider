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

// ==========================================
// Reorders the items inside every <ul> so the shortest line comes
// first and the longest last.
//
// A policy page is a stack of bullet lists, and a list whose lines
// arrive in whatever order they were typed reads as ragged: a
// four-word bullet wedged between two full sentences looks like a
// mistake even when every line is correct. Sorted by length the
// block becomes a wedge, which is the shape an eye scans fastest
// and the shape the owner asked for by name.
//
// It runs at RENDER time rather than being baked into the content
// dictionaries on purpose. The same sentence is a different length
// in Persian, English and Japanese, so an order hand-sorted for one
// language is wrong in the other two - and the next person to edit
// a bullet would have to re-sort three lists by hand or silently
// break the rule. Sorting here keeps all three right, for good.
//
// Length is measured over the visible text with tags stripped, so a
// <strong> label or a link does not inflate a line, and it counts
// code points rather than UTF-16 units so an emoji or a Japanese
// character weighs one. The sort is stable: lines that measure the
// same keep the order they were authored in.
//
// Deliberately naive about nesting - it assumes a <ul> holds only
// <li> elements and no inner <ul>, which is what every list on the
// policy pages is. A nested list would be flattened into its
// parent's ordering, so if one ever appears, this needs a real
// parser rather than a regex.
// ==========================================
export function sortListItems(html) {
  return String(html == null ? '' : html).replace(
    /<ul([^>]*)>([\s\S]*?)<\/ul>/g,
    (whole, attrs, inner) => {
      const items = inner.match(/<li\b[\s\S]*?<\/li>/g)
      if (!items || items.length < 2) return whole
      const ranked = items.map((item, index) => ({ item, index, len: visibleLength(item) }))
      ranked.sort((a, b) => (a.len - b.len) || (a.index - b.index))
      return '<ul' + attrs + '>' + ranked.map(entry => entry.item).join('') + '</ul>'
    }
  )
}

/** Visible length of a fragment: tags dropped, entities counted as one. */
export function visibleLength(html) {
  const text = String(html == null ? '' : html)
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:[a-z]+|#\d+);/gi, ' ')
    .trim()
  return [...text].length
}

/** "r, g, b" triplet for a hex colour, for use inside rgba(). */
export function hexToRgb(hex) {
  const clean = String(hex || '').replace('#', '')
  const full = clean.length === 3 ? clean.split('').map(char => char + char).join('') : clean
  const int = parseInt(full || '667eea', 16)
  return `${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}`
}
